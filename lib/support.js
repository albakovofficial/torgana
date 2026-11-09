'use strict';

// Чат поддержки: у каждого пользователя один диалог, ему отвечают модераторы.
// Сообщения в том же виде, что и в обычных чатах ({ id, mine, body, createdAt, read }), — один компонент чата на сайте.
module.exports = function support({ route, db, mailer, h }) {
  const { HttpError, readJson, rateLimit, requireUser, requireAdmin, str, now, audit } = h;

  const threadOf = (userId) => db.prepare('SELECT * FROM support_threads WHERE user_id = ?').get(userId);
  // Диалог пользователя с поддержкой; создаётся при первом сообщении (его или модератора).
  function ensureThread(userId) {
    const t = threadOf(userId);
    if (t) return t;
    db.prepare('INSERT INTO support_threads (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(userId, now(), now());
    return threadOf(userId);
  }
  const view = (m, mineIsStaff) => ({ id: m.id, mine: mineIsStaff ? m.staff_id !== null : m.staff_id === null, body: m.body, photo: m.photo ? `/uploads/${m.photo}` : null, createdAt: m.created_at, read: !!m.read_at, staff: m.staff_id !== null });
  const list = (threadId, after) => db.prepare('SELECT * FROM support_messages WHERE thread_id = ? AND id > ? ORDER BY id LIMIT 500').all(threadId, after);
  // Пользователь прочитал ответы поддержки / модератор прочитал сообщения пользователя.
  const markRead = (threadId, fromStaff) => db.prepare(`UPDATE support_messages SET read_at = ? WHERE thread_id = ? AND read_at IS NULL AND staff_id IS ${fromStaff ? 'NOT ' : ''}NULL`).run(now(), threadId);

  // Текст и/или фото (фото проверяет h.chatPhoto — то же правило, что в обычных чатах).
  async function input(ctx, u, max) {
    const b = await readJson(ctx.req);
    const body = str(b.body, max);
    const photo = h.chatPhoto(u, b.photo);
    if (!body && !photo) throw new HttpError(400, 'Пустое сообщение');
    return { body, photo };
  }
  function post(threadId, staffId, { body, photo }) {
    const t = now();
    const info = db.prepare('INSERT INTO support_messages (thread_id, staff_id, body, photo, created_at) VALUES (?, ?, ?, ?, ?)').run(threadId, staffId, body, photo, t);
    db.prepare('UPDATE support_threads SET updated_at = ? WHERE id = ?').run(t, threadId);
    return db.prepare('SELECT * FROM support_messages WHERE id = ?').get(info.lastInsertRowid);
  }

  const unreadFor = (userId) => {
    const t = threadOf(userId);
    return t ? db.prepare('SELECT COUNT(*) AS n FROM support_messages WHERE thread_id = ? AND staff_id IS NOT NULL AND read_at IS NULL').get(t.id).n : 0;
  };

  // ---------- пользователь ----------
  route('GET', '/api/support', (ctx) => {
    const u = requireUser(ctx);
    const t = threadOf(u.id);
    if (!t) return { messages: [] };
    markRead(t.id, true);
    return { messages: list(t.id, parseInt(ctx.query.get('after') || '0', 10) || 0).map((m) => view(m, false)) };
  });

  route('POST', '/api/support/messages', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`support:${u.id}`, 30, 60 * 60 * 1000);
    const m = post(ensureThread(u.id).id, null, await input(ctx, u, 2000));
    h.alerts.notifyAdmins('support', { title: `Поддержка: ${u.name}`, body: (m.body || '📷 Фото').slice(0, 160), url: `/admin?status=support&t=${m.thread_id}` }, u.id);
    return { message: view(m, false) };
  });

  // ---------- модераторы ----------
  route('GET', '/api/admin/support', (ctx) => {
    requireAdmin(ctx);
    const rows = db.prepare(`
      SELECT t.id, t.updated_at, u.id AS uid, u.name, u.email,
        (u.plan = 'pro' AND u.plan_until > ?) AS pro,
        (SELECT CASE WHEN body = '' AND photo != '' THEN '📷 Фото' ELSE body END FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT staff_id IS NULL FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS waiting,
        (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id AND m.staff_id IS NULL AND m.read_at IS NULL) AS unread
      FROM support_threads t JOIN users u ON u.id = t.user_id
      ORDER BY waiting DESC, pro DESC, t.updated_at DESC LIMIT 200`).all(Date.now()); // 1.32: «Магазин Про» — первыми среди ждущих ответа
    return { items: rows.map((r) => ({ id: r.id, updatedAt: r.updated_at, user: { id: r.uid, name: r.name, email: r.email }, lastBody: r.last_body || '', waiting: !!r.waiting, unread: r.unread, pro: !!r.pro })) };
  });

  route('GET', '/api/admin/support/:id', (ctx) => {
    requireAdmin(ctx);
    const t = db.prepare('SELECT * FROM support_threads WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!t) throw new HttpError(404, 'Диалог не найден');
    markRead(t.id, false);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(t.user_id);
    const n = (sql) => db.prepare(sql).get(u.id).n;
    return {
      user: {
        id: u.id, name: u.name, email: u.email, phone: u.phone, city: u.city, createdAt: u.created_at, emailVerified: !!u.email_verified, blocked: !!u.is_blocked,
        listings: n('SELECT COUNT(*) AS n FROM listings WHERE user_id = ?'), rejected: n('SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = \'rejected\'')
      },
      messages: list(t.id, parseInt(ctx.query.get('after') || '0', 10) || 0).map((m) => view(m, true))
    };
  });

  route('POST', '/api/admin/support/:id/messages', async (ctx) => {
    const admin = requireAdmin(ctx);
    const t = db.prepare('SELECT * FROM support_threads WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!t) throw new HttpError(404, 'Диалог не найден');
    const msg = await input(ctx, admin, 4000);
    const m = post(t.id, admin.id, msg);
    const text = msg.body || '📷 Фото';
    audit(admin, 'support-reply', { userId: t.user_id }, { text: text.slice(0, 200) });
    mailer.notifySupport(t.user_id, text);
    h.alerts.notify(t.user_id, 'messages', { title: 'Поддержка Торганы', body: text.slice(0, 180), url: '/messages/support', tag: 'support', urgent: true });
    return { message: view(m, true) };
  });

  // Модератор открывает диалог с пользователем из его карточки (даже если тот ещё не писал).
  route('POST', '/api/admin/users/:id/support', (ctx) => {
    requireAdmin(ctx);
    const uid = parseInt(ctx.params.id, 10);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) throw new HttpError(404, 'Пользователь не найден');
    return { thread: ensureThread(uid).id };
  });

  return { unreadFor };
};

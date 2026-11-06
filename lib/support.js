'use strict';

// Чат поддержки: у каждого пользователя один диалог, ему отвечают модераторы.
// Сообщения в том же виде, что и в обычных чатах ({ id, mine, body, createdAt, read }), — один компонент чата на сайте.
module.exports = function support({ route, db, mailer, h }) {
  const { HttpError, readJson, rateLimit, requireUser, requireAdmin, str, now } = h;

  const threadOf = (userId) => db.prepare('SELECT * FROM support_threads WHERE user_id = ?').get(userId);
  const view = (m, mineIsStaff) => ({ id: m.id, mine: mineIsStaff ? m.staff_id !== null : m.staff_id === null, body: m.body, createdAt: m.created_at, read: !!m.read_at, staff: m.staff_id !== null });
  const list = (threadId, after) => db.prepare('SELECT * FROM support_messages WHERE thread_id = ? AND id > ? ORDER BY id LIMIT 500').all(threadId, after);
  // Пользователь прочитал ответы поддержки / модератор прочитал сообщения пользователя.
  const markRead = (threadId, fromStaff) => db.prepare(`UPDATE support_messages SET read_at = ? WHERE thread_id = ? AND read_at IS NULL AND staff_id IS ${fromStaff ? 'NOT ' : ''}NULL`).run(now(), threadId);

  function post(threadId, staffId, body) {
    const t = now();
    const info = db.prepare('INSERT INTO support_messages (thread_id, staff_id, body, created_at) VALUES (?, ?, ?, ?)').run(threadId, staffId, body, t);
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
    const body = str((await readJson(ctx.req)).body, 2000);
    if (!body) throw new HttpError(400, 'Пустое сообщение');
    let t = threadOf(u.id);
    if (!t) {
      db.prepare('INSERT INTO support_threads (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(u.id, now(), now());
      t = threadOf(u.id);
    }
    return { message: view(post(t.id, null, body), false) };
  });

  // ---------- модераторы ----------
  route('GET', '/api/admin/support', (ctx) => {
    requireAdmin(ctx);
    const rows = db.prepare(`
      SELECT t.id, t.updated_at, u.id AS uid, u.name, u.email,
        (SELECT body FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT staff_id IS NULL FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS waiting,
        (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id AND m.staff_id IS NULL AND m.read_at IS NULL) AS unread
      FROM support_threads t JOIN users u ON u.id = t.user_id
      ORDER BY waiting DESC, t.updated_at DESC LIMIT 200`).all();
    return { items: rows.map((r) => ({ id: r.id, updatedAt: r.updated_at, user: { id: r.uid, name: r.name, email: r.email }, lastBody: r.last_body || '', waiting: !!r.waiting, unread: r.unread })) };
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
    const body = str((await readJson(ctx.req)).body, 4000);
    if (!body) throw new HttpError(400, 'Пустое сообщение');
    const m = post(t.id, admin.id, body);
    mailer.notifySupport(t.user_id, body);
    return { message: view(m, true) };
  });

  return { unreadFor };
};

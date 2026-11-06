'use strict';

// Модерация: очередь проверки, страница объявления «от и до», решения, жалобы, история объявления.
const { checkProhibited } = require('./prohibited');

const REPORT_REASONS = ['Запрещённый товар или услуга', 'Мошенничество', 'Неверная цена или описание', 'Товар уже продан',
  'Чужие фото или подделка', 'Оскорбления или спам', 'Нарушены мои права (правообладатель)'];

module.exports = function moderation({ route, db, mailer, h }) {
  const { HttpError, readJson, rateLimit, requireUser, requireAdmin, loadListing, cardFromRow, photoUrl, setAvatar, str, now } = h;

  // Запись в историю объявления. actorId — кто сделал (null — система).
  function logEvent(listingId, actorId, kind, data = {}) {
    db.prepare('INSERT INTO listing_events (listing_id, actor_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(listingId, actorId || null, kind, JSON.stringify(data), now());
  }
  const resolveReports = (listingId, adminId, resolution) => db.prepare(
    'UPDATE reports SET resolved_at = ?, resolved_by = ?, resolution = ? WHERE listing_id = ? AND resolved_at IS NULL'
  ).run(now(), adminId, resolution, listingId);

  // ---------- жалобы пользователей ----------
  route('POST', '/api/listings/:id/report', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`report:${u.id}`, 20, 60 * 60 * 1000);
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id);
    if (!l || l.status !== 'active') throw new HttpError(404, 'Объявление недоступно');
    if (l.user_id === u.id) throw new HttpError(400, 'Это ваше объявление');
    const body = await readJson(ctx.req);
    const reason = REPORT_REASONS.includes(body.reason) ? body.reason : '';
    if (!reason) throw new HttpError(400, 'Выберите причину');
    const text = str(body.text, 1000);
    if (db.prepare('SELECT 1 FROM reports WHERE listing_id = ? AND user_id = ? AND resolved_at IS NULL').get(id, u.id)) {
      throw new HttpError(409, 'Вы уже пожаловались на это объявление — модератор его проверит');
    }
    db.prepare('INSERT INTO reports (listing_id, user_id, reason, text, created_at) VALUES (?, ?, ?, ?, ?)').run(id, u.id, reason, text, now());
    logEvent(id, u.id, 'report', { reason, text });
    return { ok: true };
  });

  // ---------- очередь и статистика ----------
  route('GET', '/api/admin/stats', (ctx) => {
    requireAdmin(ctx);
    const day = now() - 24 * 3600 * 1000;
    const n = (sql, ...p) => db.prepare(sql).get(...p).n;
    return {
      users: n('SELECT COUNT(*) AS n FROM users'),
      usersToday: n('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', day),
      active: n('SELECT COUNT(*) AS n FROM listings WHERE status = \'active\''),
      listingsToday: n('SELECT COUNT(*) AS n FROM listings WHERE created_at > ?', day),
      rejected: n('SELECT COUNT(*) AS n FROM listings WHERE status = \'rejected\''),
      pending: n('SELECT COUNT(*) AS n FROM listings WHERE status = \'pending\''),
      appeals: n('SELECT COUNT(*) AS n FROM listings WHERE status = \'rejected\' AND appeal_at IS NOT NULL'),
      reports: n('SELECT COUNT(DISTINCT listing_id) AS n FROM reports WHERE resolved_at IS NULL'),
      support: n(`SELECT COUNT(*) AS n FROM support_threads t WHERE (SELECT staff_id IS NULL FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1)`),
      messagesToday: n('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?', day)
    };
  });

  route('GET', '/api/admin/listings', (ctx) => {
    requireAdmin(ctx);
    const status = ctx.query.get('status') || 'pending';
    const q = h.norm(ctx.query.get('q') || '');
    const where = [];
    const params = [];
    if (status === 'appeals') where.push('l.status = \'rejected\' AND l.appeal_at IS NOT NULL');
    else if (status === 'reports') where.push('open_reports > 0');
    else if (['pending', 'active', 'sold', 'archived', 'rejected'].includes(status)) { where.push('l.status = ?'); params.push(status); }
    if (q) { where.push('(l.search_text LIKE ? OR lower(u.email) LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    // Очередь проверки: сначала подозрительные, затем старые.
    const order = { appeals: 'l.appeal_at ASC', pending: '(l.flags != \'\') DESC, l.updated_at ASC', reports: 'open_reports DESC, l.id DESC' }[status] || 'l.created_at DESC';
    const rows = db.prepare(`
      SELECT * FROM (SELECT l.*, u.name AS user_name, u.email AS user_email, u.is_blocked,
        (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
        (SELECT COUNT(*) FROM reports r WHERE r.listing_id = l.id AND r.resolved_at IS NULL) AS open_reports
      FROM listings l JOIN users u ON u.id = l.user_id) l
      ${where.length ? `WHERE ${where.join(' AND ').replace(/u\.email/g, 'l.user_email')}` : ''}
      ORDER BY ${order} LIMIT 100`).all(...params);
    return {
      items: rows.map((r) => ({
        ...cardFromRow(r), description: r.description, rejectReason: r.reject_reason, appealText: r.appeal_text, appealAt: r.appeal_at,
        appealReply: r.appeal_reply, flags: r.flags, reports: r.open_reports, updatedAt: r.updated_at,
        user: { id: r.user_id, name: r.user_name, email: r.user_email, blocked: !!r.is_blocked }
      }))
    };
  });

  // ---------- объявление «от и до» ----------
  route('GET', '/api/admin/listings/:id', (ctx) => {
    requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id);
    if (!l) throw new HttpError(404, 'Объявление не найдено');
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(l.user_id);
    const count = (where) => db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND ${where}`).get(u.id).n;
    const userName = db.prepare('SELECT id, name, is_admin FROM users WHERE id = ?');
    const person = (uid) => { const p = uid && userName.get(uid); return p ? { id: p.id, name: p.name, isAdmin: !!p.is_admin } : null; };
    const next = db.prepare(`SELECT id FROM listings WHERE status = 'pending' AND id != ?
      ORDER BY (flags != '') DESC, updated_at ASC LIMIT 1`).get(id);
    return {
      listing: {
        id: l.id, title: l.title, description: l.description, category: l.category, price: l.price, priceUnit: l.price_unit, city: l.city,
        condition: l.condition, delivery: !!l.delivery, status: l.status, views: l.views, createdAt: l.created_at, updatedAt: l.updated_at,
        rejectReason: l.reject_reason, appealText: l.appeal_text, appealAt: l.appeal_at, appealReply: l.appeal_reply,
        photos: db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(id).map((r) => photoUrl(r.file)),
        favCount: db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE listing_id = ?').get(id).n,
        chats: db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE listing_id = ?').get(id).n,
        matches: checkProhibited(l.title, l.description)
      },
      seller: {
        id: u.id, name: u.name, email: u.email, phone: u.phone, city: u.city, avatar: photoUrl(u.avatar), createdAt: u.created_at,
        emailVerified: !!u.email_verified, blocked: !!u.is_blocked, isAdmin: !!u.is_admin,
        counts: { total: count('1'), active: count('status = \'active\''), pending: count('status = \'pending\''), rejected: count('status = \'rejected\''), sold: count('status = \'sold\'') },
        reportsAgainst: db.prepare('SELECT COUNT(*) AS n FROM reports r JOIN listings x ON x.id = r.listing_id WHERE x.user_id = ?').get(u.id).n
      },
      events: db.prepare('SELECT * FROM listing_events WHERE listing_id = ? ORDER BY id').all(id)
        .map((e) => ({ id: e.id, kind: e.kind, at: e.created_at, actor: person(e.actor_id), data: JSON.parse(e.data) })),
      reports: db.prepare('SELECT * FROM reports WHERE listing_id = ? ORDER BY id DESC').all(id).map((r) => ({
        id: r.id, reason: r.reason, text: r.text, at: r.created_at, user: person(r.user_id), resolvedAt: r.resolved_at, resolution: r.resolution
      })),
      next: next ? next.id : null
    };
  });

  // ---------- решения ----------
  route('POST', '/api/admin/listings/:id/reject', async (ctx) => {
    const admin = requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    const reason = str((await readJson(ctx.req)).reason, 500);
    if (reason.length < 5) throw new HttpError(400, 'Укажите понятную причину — её увидит автор');
    if (!loadListing(id)) throw new HttpError(404, 'Не найдено');
    db.prepare('UPDATE listings SET status = \'rejected\', reject_reason = ?, appeal_text = \'\', appeal_at = NULL, appeal_reply = \'\', updated_at = ? WHERE id = ?').run(reason, now(), id);
    resolveReports(id, admin.id, 'Объявление отклонено');
    logEvent(id, admin.id, 'rejected', { reason });
    mailer.notifyModeration(id, 'rejected', reason);
    return { ok: true };
  });

  route('POST', '/api/admin/listings/:id/appeal-deny', async (ctx) => {
    const admin = requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    const reason = str((await readJson(ctx.req)).reason, 500);
    if (reason.length < 5) throw new HttpError(400, 'Объясните решение — ответ увидит автор');
    const l = loadListing(id);
    if (!l || l.status !== 'rejected' || !l.appeal_at) throw new HttpError(404, 'Апелляция не найдена');
    db.prepare('UPDATE listings SET appeal_at = NULL, appeal_reply = ?, updated_at = ? WHERE id = ?').run(reason, now(), id);
    logEvent(id, admin.id, 'appeal-denied', { reason });
    mailer.notifyModeration(id, 'appeal-denied', reason);
    return { ok: true };
  });

  // Опубликовать после проверки, одобрить апелляцию или восстановить.
  route('POST', '/api/admin/listings/:id/restore', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id);
    if (!l) throw new HttpError(404, 'Не найдено');
    db.prepare('UPDATE listings SET status = \'active\', appeal_at = NULL, appeal_reply = \'\', flags = \'\', updated_at = ? WHERE id = ?').run(now(), id);
    const event = l.status === 'pending' ? 'approved' : l.status === 'rejected' ? (l.appeal_at ? 'appeal-approved' : 'restored') : 'restored';
    logEvent(id, admin.id, event);
    if (l.status === 'pending' || l.status === 'rejected') mailer.notifyModeration(id, event);
    return { ok: true };
  });

  route('POST', '/api/admin/listings/:id/reports/dismiss', async (ctx) => {
    const admin = requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    if (!loadListing(id)) throw new HttpError(404, 'Не найдено');
    const comment = str((await readJson(ctx.req)).reason, 300) || 'Нарушений не найдено';
    const r = resolveReports(id, admin.id, comment);
    logEvent(id, admin.id, 'reports-dismissed', { count: Number(r.changes), comment });
    return { ok: true };
  });

  // Убрать неподходящее фото профиля (фото профиля публикуется без проверки, как имя).
  route('POST', '/api/admin/users/:id/avatar/remove', (ctx) => {
    requireAdmin(ctx);
    setAvatar(parseInt(ctx.params.id, 10), '');
    return { ok: true };
  });

  route('POST', '/api/admin/users/:id/block', async (ctx) => {
    const admin = requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    if (id === admin.id) throw new HttpError(400, 'Нельзя заблокировать себя');
    const blocked = (await readJson(ctx.req)).blocked ? 1 : 0;
    db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(blocked, id);
    if (blocked) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    for (const { id: lid } of db.prepare('SELECT id FROM listings WHERE user_id = ?').all(id)) logEvent(lid, admin.id, blocked ? 'author-blocked' : 'author-unblocked');
    return { ok: true };
  });

  return { logEvent, REPORT_REASONS };
};

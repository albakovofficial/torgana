'use strict';

// Модерация: очередь проверки, страница объявления «от и до», решения, жалобы, история объявления.
const { checkProhibited } = require('./prohibited');

const REPORT_REASONS = ['Запрещённый товар или услуга', 'Мошенничество', 'Неверная цена или описание', 'Товар уже продан',
  'Чужие фото или подделка', 'Оскорбления или спам', 'Нарушены мои права (правообладатель)'];

module.exports = function moderation({ route, db, mailer, h }) {
  const { HttpError, readJson, rateLimit, requireUser, requireAdmin, loadListing, cardFromRow, photoUrl, setAvatar, str, now, autoChecks } = h;

  // Запись в историю объявления. actorId — кто сделал (null — система).
  function logEvent(listingId, actorId, kind, data = {}) {
    db.prepare('INSERT INTO listing_events (listing_id, actor_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(listingId, actorId || null, kind, JSON.stringify(data), now());
  }
  // Действие модератора: в журнал модерации и (если про объявление) в историю объявления.
  // on — над чем: { listingId, userId, reviewId }; для объявления userId — его автор.
  function audit(admin, action, on, data = {}) {
    let { listingId = null, userId = null, reviewId = null } = on;
    if (listingId && !userId) { const l = loadListing(listingId); userId = l ? l.user_id : null; }
    db.prepare('INSERT INTO admin_log (admin_id, action, listing_id, user_id, review_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(admin.id, action, listingId, userId, reviewId, JSON.stringify(data), now());
    if (listingId) logEvent(listingId, admin.id, action, data);
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
      messagesToday: n('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?', day),
      biz: n('SELECT COUNT(*) AS n FROM users WHERE biz_status = \'pending\' OR tm_status = \'pending\''),
      reviews: n('SELECT COUNT(*) AS n FROM reviews WHERE status = \'pending\' OR (status = \'published\' AND reply_status = \'pending\')') + n('SELECT COUNT(*) AS n FROM review_complaints WHERE resolved_at IS NULL')
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
    const order = { appeals: 'l.appeal_at ASC', pending: '(l.flags != \'\' OR l.checks != \'\') DESC, l.updated_at ASC', reports: 'open_reports DESC, l.id DESC' }[status] || 'l.created_at DESC';
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
        appealReply: r.appeal_reply, flags: r.flags, checks: autoChecks.parse(r.checks), reports: r.open_reports, updatedAt: r.updated_at,
        user: { id: r.user_id, name: r.user_name, email: r.user_email, blocked: !!r.is_blocked }
      }))
    };
  });

  // ---------- объявление «от и до» ----------
  route('GET', '/api/admin/listings/:id', (ctx) => {
    requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id, { deleted: true }); // удалённое автором модератор тоже видит — с историей
    if (!l) throw new HttpError(404, 'Объявление не найдено');
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(l.user_id);
    const count = (where) => db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND ${where}`).get(u.id).n;
    const userName = db.prepare('SELECT id, name, is_admin FROM users WHERE id = ?');
    const person = (uid) => { const p = uid && userName.get(uid); return p ? { id: p.id, name: p.name, isAdmin: !!p.is_admin } : null; };
    const next = db.prepare(`SELECT id FROM listings WHERE status = 'pending' AND id != ?
      ORDER BY (flags != '' OR checks != '') DESC, updated_at ASC LIMIT 1`).get(id);
    return {
      listing: {
        id: l.id, title: l.title, description: l.description, category: l.category, price: l.price, priceUnit: l.price_unit, city: l.city,
        condition: l.condition, delivery: !!l.delivery, status: l.status, views: l.views, createdAt: l.created_at, updatedAt: l.updated_at,
        rejectReason: l.reject_reason, appealText: l.appeal_text, appealAt: l.appeal_at, appealReply: l.appeal_reply,
        photos: db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(id).map((r) => photoUrl(r.file)),
        favCount: db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE listing_id = ?').get(id).n,
        chats: db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE listing_id = ?').get(id).n,
        matches: checkProhibited(l.title, l.description),
        checks: autoChecks.parse(l.checks),
        subcategory: l.subcategory, specs: h.taxonomy.describe(l.subcategory, h.attrsOf(l)), metro: l.metro, district: l.district, video: h.video.url(l.video)
      },
      seller: {
        id: u.id, name: u.name, email: u.email, phone: u.phone, city: u.city, avatar: photoUrl(u.avatar), createdAt: u.created_at,
        emailVerified: !!u.email_verified, blocked: !!u.is_blocked, blockReason: u.block_reason, isAdmin: !!u.is_admin,
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
  // В журнал пишем, откуда пришло объявление: pending — отклонено при проверке, иначе — снято с публикации.
  // Причина необязательна: без неё автор видит «Причина не указана».
  route('POST', '/api/admin/listings/:id/reject', async (ctx) => {
    const admin = requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    const reason = str((await readJson(ctx.req)).reason, 500);
    const l = loadListing(id);
    if (!l) throw new HttpError(404, 'Не найдено');
    db.prepare('UPDATE listings SET status = \'rejected\', reject_reason = ?, appeal_text = \'\', appeal_at = NULL, appeal_reply = \'\', updated_at = ? WHERE id = ?').run(reason, now(), id);
    resolveReports(id, admin.id, 'Объявление отклонено');
    audit(admin, 'rejected', { listingId: id }, { reason, from: l.status, title: l.title });
    h.alerts.moderation(id, 'rejected', reason);
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
    audit(admin, 'appeal-denied', { listingId: id }, { reason, title: l.title });
    h.alerts.moderation(id, 'appeal-denied', reason);
    return { ok: true };
  });

  // Опубликовать после проверки, одобрить апелляцию или восстановить.
  route('POST', '/api/admin/listings/:id/restore', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id);
    if (!l) throw new HttpError(404, 'Не найдено');
    db.prepare('UPDATE listings SET appeal_at = NULL, appeal_reply = \'\', flags = \'\', updated_at = ? WHERE id = ?').run(now(), id);
    const event = l.status === 'pending' ? 'approved' : l.status === 'rejected' ? (l.appeal_at ? 'appeal-approved' : 'restored') : 'restored';
    audit(admin, event, { listingId: id }, { title: l.title });
    // Автор выбрал время публикации — до него объявление ждёт в статусе «Запланировано» (публикует таймер в server.js).
    if (l.publish_at && l.publish_at > now() && !l.alerted) {
      db.prepare('UPDATE listings SET status = \'scheduled\' WHERE id = ?').run(id);
      h.alerts.moderation(id, 'scheduled', new Date(l.publish_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }));
      return { ok: true, status: 'scheduled' };
    }
    h.publishListing(id);
    if (l.status === 'pending' || l.status === 'rejected') h.alerts.moderation(id, event);
    return { ok: true };
  });

  route('POST', '/api/admin/listings/:id/reports/dismiss', async (ctx) => {
    const admin = requireAdmin(ctx);
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id);
    if (!l) throw new HttpError(404, 'Не найдено');
    const comment = str((await readJson(ctx.req)).reason, 300) || 'Нарушений не найдено';
    const r = resolveReports(id, admin.id, comment);
    audit(admin, 'reports-dismissed', { listingId: id }, { count: Number(r.changes), comment, title: l.title });
    return { ok: true };
  });

  // ---------- пользователи ----------
  const target = (ctx) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!u) throw new HttpError(404, 'Пользователь не найден');
    return u;
  };

  // Убрать неподходящее фото профиля (фото профиля публикуется без проверки, как имя).
  route('POST', '/api/admin/users/:id/avatar/remove', (ctx) => {
    const admin = requireAdmin(ctx);
    const u = target(ctx);
    setAvatar(u.id, '');
    audit(admin, 'avatar-removed', { userId: u.id }, { name: u.name });
    return { ok: true };
  });

  // Блокировка: причина обязательна, человек получает письмо, сессии закрываются, объявления скрываются из поиска.
  route('POST', '/api/admin/users/:id/block', async (ctx) => {
    const admin = requireAdmin(ctx);
    const u = target(ctx);
    if (u.id === admin.id) throw new HttpError(400, 'Нельзя заблокировать себя');
    if (u.is_admin) throw new HttpError(400, 'Модератора нельзя заблокировать — сначала уберите его из ADMIN_EMAIL');
    const body = await readJson(ctx.req);
    const blocked = body.blocked ? 1 : 0;
    const reason = str(body.reason, 500);
    if (blocked && reason.length < 5) throw new HttpError(400, 'Укажите причину блокировки — её увидит пользователь');
    db.prepare('UPDATE users SET is_blocked = ?, block_reason = ?, blocked_at = ? WHERE id = ?').run(blocked, blocked ? reason : '', blocked ? now() : null, u.id);
    if (blocked) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    const event = blocked ? 'author-blocked' : 'author-unblocked';
    for (const { id: lid } of db.prepare('SELECT id FROM listings WHERE user_id = ?').all(u.id)) logEvent(lid, admin.id, event, { reason });
    audit(admin, blocked ? 'user-blocked' : 'user-unblocked', { userId: u.id }, { reason, name: u.name });
    mailer.notifyAccount(u.id, blocked ? 'blocked' : 'unblocked', reason);
    return { ok: true };
  });

  return { logEvent, audit, REPORT_REASONS };
};

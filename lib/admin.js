'use strict';

// Модерация, часть «для администрации»: сводка, пользователи, журнал действий, письма модератору о новом.
const DAY = 24 * 3600 * 1000;
const MSK = 3 * 3600 * 1000; // дни считаем по Москве
const dayKey = (ts) => new Date(ts + MSK).toISOString().slice(0, 10);
const MOD_KINDS = ['pending', 'reports', 'support'];
const MOD_MODES = ['instant', 'hourly', 'off'];

module.exports = function admin({ route, db, h, trust }) {
  const { HttpError, readJson, requireAdmin, photoUrl, cardFromRow, str, now, autoChecks, OWNER_EMAIL } = h;
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  const brief = (u) => (u ? { id: u.id, name: u.name, avatar: photoUrl(u.avatar) } : null);
  const userById = db.prepare('SELECT id, name, avatar FROM users WHERE id = ?');

  // ---------- сводка ----------
  // Время проверки: от отправки (создано или изменено) до решения модератора. Снятия опубликованных не считаем.
  function reviewTimes(since) {
    return db.prepare(`
      SELECT e.created_at - (SELECT MAX(p.created_at) FROM listing_events p WHERE p.listing_id = e.listing_id AND p.kind IN ('created', 'edited') AND p.id < e.id) AS wait
      FROM listing_events e
      WHERE e.kind IN ('approved', 'rejected') AND e.created_at > ?
        AND COALESCE((SELECT MAX(p.id) FROM listing_events p WHERE p.listing_id = e.listing_id AND p.kind IN ('created', 'edited') AND p.id < e.id), 0)
          > COALESCE((SELECT MAX(d.id) FROM listing_events d WHERE d.listing_id = e.listing_id AND d.kind IN ('approved', 'rejected', 'restored', 'appeal-approved') AND d.id < e.id), 0)
    `).all(since).map((r) => r.wait).filter((w) => w >= 0);
  }

  // 1.54.0: сколько продавцу ждать проверки — медиана за 14 дней (нужно хотя бы 3 решения; иначе null — «обычно несколько часов»),
  // его место в очереди и ночь ли сейчас по Москве (23:00–8:00 модераторы почти не работают). Медиана — раз в 5 минут.
  let etaCache = { at: 0, v: null };
  function reviewEta(l) {
    const t = now();
    if (t - etaCache.at > 5 * 60 * 1000 || etaCache.v === null) { // пока решений мало — считаем каждый раз (это дёшево)
      const w = reviewTimes(t - 14 * DAY).sort((a, b) => a - b);
      etaCache = { at: t, v: w.length >= 3 ? w[Math.floor(w.length / 2)] : null };
    }
    const hour = new Date(t + MSK).getUTCHours();
    return {
      median: etaCache.v,
      place: l ? n('SELECT COUNT(*) AS n FROM listings WHERE status = \'pending\' AND (updated_at < ? OR (updated_at = ? AND id <= ?))', l.updated_at, l.updated_at, l.id) : 0,
      night: hour >= 23 || hour < 8
    };
  }

  route('GET', '/api/admin/dashboard', (ctx) => {
    const self = requireAdmin(ctx);
    const t = now();
    const waits = reviewTimes(t - 7 * DAY).sort((a, b) => a - b);
    const oldest = db.prepare('SELECT MIN(updated_at) AS t FROM listings WHERE status = \'pending\'').get().t;
    // 30 дней по Москве: новые объявления, новые пользователи, решения.
    const start = new Date(dayKey(t - 29 * DAY)).getTime() - MSK;
    const days = new Map();
    for (let i = 0; i < 30; i++) days.set(dayKey(start + i * DAY), { day: dayKey(start + i * DAY), listings: 0, users: 0, approved: 0, rejected: 0 });
    const bump = (rows, key) => rows.forEach((r) => { const d = days.get(dayKey(r.t)); if (d) d[key] += 1; });
    bump(db.prepare('SELECT created_at AS t FROM listings WHERE created_at >= ?').all(start), 'listings');
    bump(db.prepare('SELECT created_at AS t FROM users WHERE created_at >= ?').all(start), 'users');
    // Одобрено — все решения «опубликовать»: после проверки, по апелляции и восстановление.
    const APPROVED = 'kind IN (\'approved\', \'appeal-approved\', \'restored\')';
    bump(db.prepare(`SELECT created_at AS t FROM listing_events WHERE ${APPROVED} AND created_at >= ?`).all(start), 'approved');
    bump(db.prepare('SELECT created_at AS t FROM listing_events WHERE kind = \'rejected\' AND created_at >= ?').all(start), 'rejected');
    const mods = db.prepare(`SELECT u.id, u.name, u.avatar, COUNT(l.id) AS n FROM users u LEFT JOIN admin_log l ON l.admin_id = u.id AND l.created_at > ?
      WHERE u.is_admin = 1 GROUP BY u.id ORDER BY n DESC`).all(t - 7 * DAY);
    return {
      queue: {
        pending: n('SELECT COUNT(*) AS n FROM listings WHERE status = \'pending\''),
        flagged: n('SELECT COUNT(*) AS n FROM listings WHERE status = \'pending\' AND (flags != \'\' OR checks != \'\')'),
        oldestAt: oldest || null
      },
      speed: { avg: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null, median: waits.length ? waits[Math.floor(waits.length / 2)] : null, count: waits.length },
      today: {
        listings: n('SELECT COUNT(*) AS n FROM listings WHERE created_at > ?', t - DAY),
        approved: n(`SELECT COUNT(*) AS n FROM listing_events WHERE ${APPROVED} AND created_at > ?`, t - DAY),
        users: n('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', t - DAY),
        reports: n('SELECT COUNT(*) AS n FROM reports WHERE created_at > ?', t - DAY),
        messages: n('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?', t - DAY)
      },
      totals: {
        active: n('SELECT COUNT(*) AS n FROM listings WHERE status = \'active\''),
        users: n('SELECT COUNT(*) AS n FROM users'),
        blocked: n('SELECT COUNT(*) AS n FROM users WHERE is_blocked = 1')
      },
      days: [...days.values()],
      moderators: mods.map((m) => ({ ...brief(m), actions: m.n, me: m.id === self.id }))
    };
  });

  // 1.54.0: воронка продавцов — где теряются люди. Новые посетители (браузеры, впервые открывшие сайт, lib/sources.js)
  // и те, кто зарегистрировался за период (без модераторов): сколько из них отправили объявление, прошли проверку,
  // получили сообщение от покупателя и отметили «Продано». Плюс медиана от регистрации до первого объявления.
  route('GET', '/api/admin/funnel', (ctx) => {
    requireAdmin(ctx);
    const days = { 7: 7, 30: 30, 90: 90, 0: 0 }[ctx.query.get('days') || '30'] ?? 30;
    const since = days ? now() - days * DAY : 0;
    const visits = db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM visits WHERE day >= ?').get(days ? dayKey(since) : '0000').n;
    const C = 'FROM users u WHERE u.created_at >= ? AND u.is_admin = 0';
    const has = (cond) => n(`SELECT COUNT(*) AS n ${C} AND EXISTS (${cond})`, since);
    const steps = [
      ['visits', 'Новые посетители', visits],
      ['signups', 'Зарегистрировались', n(`SELECT COUNT(*) AS n ${C}`, since)],
      ['sellers', 'Отправили объявление', has('SELECT 1 FROM listings l WHERE l.user_id = u.id')],
      ['approved', 'Прошли проверку', has('SELECT 1 FROM listing_events e JOIN listings l ON l.id = e.listing_id WHERE l.user_id = u.id AND e.kind IN (\'approved\', \'restored\', \'appeal-approved\')')],
      ['contacted', 'Получили сообщение от покупателя', has('SELECT 1 FROM conversations c JOIN messages m ON m.conversation_id = c.id AND m.sender_id = c.buyer_id WHERE c.seller_id = u.id')],
      ['sold', 'Отметили «Продано»', has('SELECT 1 FROM listings l WHERE l.user_id = u.id AND l.status = \'sold\'')]
    ].map(([key, label, count]) => ({ key, label, n: count }));
    const firsts = db.prepare(`SELECT (SELECT MIN(l.created_at) FROM listings l WHERE l.user_id = u.id) - u.created_at AS w ${C} AND EXISTS (SELECT 1 FROM listings l WHERE l.user_id = u.id)`)
      .all(since).map((r) => r.w).filter((w) => w >= 0).sort((a, b) => a - b);
    return { days, steps, toFirst: firsts.length ? firsts[Math.floor(firsts.length / 2)] : null };
  });

  // ---------- пользователи ----------
  const USER_FILTERS = {
    all: '1',
    new: 'u.created_at > :week',
    reported: 'reports_open > 0',
    blocked: 'u.is_blocked = 1',
    biz: '(u.biz_status = \'pending\' OR u.tm_status = \'pending\')',
    admins: 'u.is_admin = 1'
  };
  const USERS_FROM = `FROM (SELECT u.*,
      (SELECT COUNT(*) FROM listings l WHERE l.user_id = u.id) AS listings_total,
      (SELECT COUNT(*) FROM listings l WHERE l.user_id = u.id AND l.status = 'active') AS listings_active,
      (SELECT COUNT(*) FROM reports r JOIN listings l ON l.id = r.listing_id WHERE l.user_id = u.id AND r.resolved_at IS NULL) AS reports_open
    FROM users u) u`;
  // Именованные параметры — только те, что есть в запросе (лишние node:sqlite не принимает).
  const pick = (sql, all) => Object.fromEntries(Object.entries(all).filter(([k]) => sql.includes(`:${k}`)));
  route('GET', '/api/admin/users', (ctx) => {
    requireAdmin(ctx);
    const f = USER_FILTERS[ctx.query.get('f')] ? ctx.query.get('f') : 'all';
    const q = str(ctx.query.get('q'), 100).toLowerCase().replace(/ё/g, 'е');
    const all = { week: now() - 7 * DAY, q: `%${q}%`, id: q, offset: Math.max(0, parseInt(ctx.query.get('offset') || '0', 10) || 0) };
    const search = q ? ' AND (lower_ru(u.name) LIKE :q OR lower_ru(u.email) LIKE :q OR u.phone LIKE :q OR CAST(u.id AS TEXT) = :id)' : '';
    const where = `WHERE ${USER_FILTERS[f]}${search}`;
    const list = `SELECT * ${USERS_FROM} ${where} ORDER BY ${f === 'reported' ? 'reports_open DESC, ' : ''}u.id DESC LIMIT 30 OFFSET :offset`;
    const count = (w) => { const sql = `SELECT COUNT(*) AS n ${USERS_FROM} ${w}`; return db.prepare(sql).get(pick(sql, all)).n; };
    return {
      total: count(where),
      counts: Object.fromEntries(Object.entries(USER_FILTERS).map(([k, w]) => [k, count(`WHERE ${w}`)])),
      items: db.prepare(list).all(pick(list, all)).map((u) => ({
        ...brief(u), email: u.email, blocked: !!u.is_blocked, isAdmin: !!u.is_admin, emailVerified: !!u.email_verified,
        listings: u.listings_total, active: u.listings_active, reports: u.reports_open, bizPending: u.biz_status === 'pending', tmPending: u.tm_status === 'pending'
      }))
    };
  });

  // Идущие платные услуги: одного пользователя (карточка) или всех (раздел «Реклама», 1.45.0).
  // Модератор может отключить любую (деньги — отдельно, в «Платежах»).
  const BOOST_NAMES = { xl: 'XL', frame: 'рамка', tags: 'метки' };
  function paidServices(uid = 0) {
    const has = (t) => !!db.prepare('SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?').get(t);
    const who = uid ? 'AND x.user_id = :uid' : '';
    const arg = uid ? { uid } : {};
    const owner = (r) => (uid ? undefined : { id: r.user_id, name: r.user_name, email: r.user_email });
    const promos = has('promotions') ? db.prepare(`SELECT x.id, x.listing_id, x.user_id, x.title, x.status, x.ends_at, x.price, x.shows, x.clicks, u.name AS user_name, u.email AS user_email
        FROM promotions x JOIN users u ON u.id = x.user_id WHERE x.status = 'active' AND x.ends_at > :t ${who} ORDER BY x.ends_at ASC LIMIT 300`).all({ t: now(), ...arg })
      .map((r) => ({ id: r.id, listingId: r.listing_id, title: r.title, status: r.status, endsAt: r.ends_at, gift: !r.price, shows: r.shows, clicks: r.clicks, user: owner(r) })) : [];
    const boosts = has('boosts') ? db.prepare(`SELECT x.id, x.listing_id, x.user_id, x.title, x.status, x.ends_at, x.xl, x.frame, x.tags, x.price, u.name AS user_name, u.email AS user_email
        FROM boosts x JOIN users u ON u.id = x.user_id WHERE x.status IN ('waiting', 'active') ${who} ORDER BY x.status = 'active' DESC, x.ends_at ASC LIMIT 300`).all(arg)
      .map((r) => ({ id: r.id, listingId: r.listing_id, title: r.title, status: r.status, endsAt: r.ends_at, gift: !r.price, user: owner(r), kinds: ['xl', 'frame', 'tags'].filter((k) => r[k] && r[k] !== '[]' && r[k] !== '').map((k) => BOOST_NAMES[k]) })) : [];
    return { promos, boosts };
  }
  // Раздел «Реклама»: всё платное и подаренное, что идёт сейчас, — тарифы, реклама над поиском, продвижение в ленте.
  route('GET', '/api/admin/ads', (ctx) => {
    requireAdmin(ctx);
    const plans = db.prepare('SELECT * FROM users WHERE plan != \'\' AND plan_until > ? ORDER BY plan_until ASC LIMIT 300').all(now())
      .map((u) => ({ user: { id: u.id, name: u.name, email: u.email }, plan: h.business.planOf(u) }));
    return { plans, ...paidServices() };
  });
  route('GET', '/api/admin/users/:id', (ctx) => {
    requireAdmin(ctx);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!u) throw new HttpError(404, 'Пользователь не найден');
    const listings = db.prepare(`SELECT l.*, (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
        (SELECT COUNT(*) FROM reports r WHERE r.listing_id = l.id AND r.resolved_at IS NULL) AS open_reports
      FROM listings l WHERE l.user_id = ? ORDER BY l.id DESC LIMIT 100`).all(u.id);
    const byStatus = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM listings WHERE user_id = ? GROUP BY status').all(u.id).map((r) => [r.status, r.n]));
    const reportRow = (r) => ({ id: r.id, reason: r.reason, text: r.text, at: r.created_at, resolvedAt: r.resolved_at, resolution: r.resolution, listing: { id: r.listing_id, title: r.title }, from: brief(userById.get(r.user_id)) });
    const thread = db.prepare(`SELECT t.id, (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id) AS messages,
      (SELECT staff_id IS NULL FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS waiting FROM support_threads t WHERE t.user_id = ?`).get(u.id);
    return {
      user: {
        ...brief(u), email: u.email, phone: u.phone, emailVerified: !!u.email_verified,
        blocked: !!u.is_blocked, blockReason: u.block_reason, blockedAt: u.blocked_at, deactivatedAt: u.deactivated_at || null, deletedAt: u.deleted_at || null, isAdmin: !!u.is_admin, isOwner: !!u.is_admin && u.email === OWNER_EMAIL,
        rep: h.reputation ? h.reputation.levelOf(u.id) : null, phoneVerified: !!u.phone_verified, phoneVia: u.phone_verified_via, business: trust.bizOf(u), trademark: trust.tmOf(u), tmReview: trust.tmAdmin(u),
        oauth: db.prepare('SELECT provider FROM oauth_accounts WHERE user_id = ?').all(u.id).map((r) => r.provider),
        plan: h.business ? h.business.planOf(u) : null, shop: h.business ? h.business.shopOf(u) : null
      },
      counts: { total: listings.length, ...byStatus },
      listings: listings.map((l) => ({ ...cardFromRow(l), flags: l.flags, checks: autoChecks.parse(l.checks), reports: l.open_reports, rejectReason: l.reject_reason, updatedAt: l.updated_at })),
      reports: {
        against: db.prepare('SELECT r.*, l.title FROM reports r JOIN listings l ON l.id = r.listing_id WHERE l.user_id = ? ORDER BY r.id DESC LIMIT 30').all(u.id).map(reportRow),
        by: db.prepare('SELECT r.*, l.title FROM reports r JOIN listings l ON l.id = r.listing_id WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 30').all(u.id).map(reportRow)
      },
      support: thread ? { thread: thread.id, messages: thread.messages, waiting: !!thread.waiting } : null,
      services: paidServices(u.id),
      log: journal({ user: u.id, limit: 30 }).items
    };
  });

  // ---------- журнал ----------
  function journal({ admin = 0, user = 0, action = '', listings = false, limit = 50, offset = 0 }) {
    const where = [listings ? 'a.listing_id IS NOT NULL' : '1']; const p = [];
    if (admin) { where.push('a.admin_id = ?'); p.push(admin); }
    if (user) { where.push('a.user_id = ?'); p.push(user); }
    if (action) { where.push('a.action LIKE ?'); p.push(`${action}%`); }
    const rows = db.prepare(`SELECT a.*, l.title AS listing_title FROM admin_log a LEFT JOIN listings l ON l.id = a.listing_id
      WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...p, limit + 1, offset);
    const items = rows.slice(0, limit).map((r) => {
      const data = JSON.parse(r.data);
      return {
        id: r.id, at: r.created_at, action: r.action, data,
        admin: brief(userById.get(r.admin_id)),
        listing: r.listing_id ? { id: r.listing_id, title: r.listing_title || data.title || '', deleted: !r.listing_title } : null,
        user: r.user_id ? brief(userById.get(r.user_id)) : null
      };
    });
    return { items, more: rows.length > limit };
  }

  route('GET', '/api/admin/log', (ctx) => {
    requireAdmin(ctx);
    const q = (k) => parseInt(ctx.query.get(k) || '0', 10) || 0;
    const type = ctx.query.get('type');
    const action = { users: 'user', support: 'support' }[type] || '';
    const r = journal({ admin: q('admin'), action, listings: type === 'listings', offset: q('offset') });
    return { ...r, admins: db.prepare('SELECT id, name, avatar FROM users WHERE is_admin = 1 OR id IN (SELECT DISTINCT admin_id FROM admin_log) ORDER BY name').all().map(brief) };
  });

  // ---------- мои письма о новом ----------
  // Виды push — один список на сайт (lib/alerts.js); кто ещё не выбирал — получает все.
  const notifyOf = (u) => ({ mode: MOD_MODES.includes(u.mod_notify) ? u.mod_notify : 'hourly', kinds: u.mod_notify_kinds.split(',').filter((k) => MOD_KINDS.includes(k)),
    push: h.alerts.pushKindsOf(u) });
  const me = (ctx) => db.prepare('SELECT * FROM users WHERE id = ?').get(requireAdmin(ctx).id);
  route('GET', '/api/admin/me/notify', (ctx) => notifyOf(me(ctx)));
  route('PUT', '/api/admin/me/notify', async (ctx) => {
    const { id } = requireAdmin(ctx);
    const b = await readJson(ctx.req);
    // 1.47.2: push модератору — отдельно от писем; можно прислать только push.
    if (Array.isArray(b.push)) db.prepare('UPDATE users SET push_mod_kinds = ?, push_mod_set = 1 WHERE id = ?').run(h.alerts.ADMIN_PUSH_KINDS.filter((k) => b.push.includes(k)).join(','), id);
    if (b.mode === undefined && b.kinds === undefined) return notifyOf(me(ctx));
    const mode = MOD_MODES.includes(b.mode) ? b.mode : 'hourly';
    const kinds = Array.isArray(b.kinds) ? MOD_KINDS.filter((k) => b.kinds.includes(k)) : MOD_KINDS;
    // Отсчёт «нового» — с момента настройки, чтобы не прислать старое разом.
    db.prepare('UPDATE users SET mod_notify = ?, mod_notify_kinds = ?, mod_notify_at = CASE WHEN mod_notify_at = 0 THEN ? ELSE mod_notify_at END WHERE id = ?').run(mode, kinds.join(','), now(), id);
    return notifyOf(me(ctx));
  });

  // ---------- тексты push и пробная отправка (1.66.0) ----------
  // Каталог — lib/push-texts.js. Пробное приходит только самому модератору, с примером подстановок,
  // и открывает страницу уведомлений в модерации — не чужое объявление и не пустой экран.
  route('GET', '/api/admin/push/texts', (ctx) => {
    const { id } = requireAdmin(ctx);
    const t = h.alerts.texts;
    // apple — подключён ли ключ Apple; devices — на скольких iPhone модератора включены уведомления.
    return { items: t.list(), groups: t.USER_GROUPS.map(([k, name, sub]) => ({ k, name, sub })), kinds: t.ADMIN_KINDS.map(([k, name, sub]) => ({ k, name, sub })),
      samples: t.SAMPLES, apple: h.apns.ready(), devices: h.apns.count(id) };
  });
  route('PUT', '/api/admin/push/texts/:key', async (ctx) => {
    const a = requireAdmin(ctx);
    const r = h.alerts.texts.save(ctx.params.key, await readJson(ctx.req));
    if (r.error) throw new HttpError(400, r.error);
    h.audit(a, 'push-text', {}, { key: ctx.params.key });
    return { item: h.alerts.texts.list().find((x) => x.key === ctx.params.key) };
  });
  route('POST', '/api/admin/push/test', async (ctx) => {
    const { id } = requireAdmin(ctx);
    const b = await readJson(ctx.req);
    const t = h.alerts.texts;
    // all — все уведомления модератору подряд (по одному на вид), иначе одно — по ключу.
    const keys = b.all ? t.CATALOG.filter((c) => c.admin).map((c) => c.key) : [String(b.key || '')];
    if (!keys.every((k) => t.get(k))) throw new HttpError(400, 'Нет такого уведомления');
    h.rateLimit(`pushtest-adm:${id}`, b.all ? 3 : 40, 10 * 60 * 1000);
    if (!h.apns.count(id)) throw new HttpError(400, 'Уведомления не включены ни на одном iPhone. Откройте приложение Торгана: Профиль → Настройки → Уведомления → «Включить уведомления»');
    let sent = 0;
    for (const k of keys) {
      sent += (await h.apns.send(id, { ...t.sample(k), url: '/admin?status=notify', tag: `test-${k}` })) > 0 ? 1 : 0;
      if (keys.length > 1) await new Promise((r) => setTimeout(r, 300)); // по одному — чтобы iPhone показал каждое
    }
    if (sent) return { ok: true, sent };
    const why = h.apns.lastError();
    throw new HttpError(400, why ? why.text : 'Apple не принял уведомление — проверьте ключ в «Приложение iPhone»');
  });

  return { notifyOf, MOD_KINDS, reviewEta };
};

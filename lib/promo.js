'use strict';

// Продвижение объявлений для бизнеса и блок «Реклама».
//
// - Купить продвижение может ИП или компания с проверенными данными (нужны для маркировки рекламы).
// - Продвигаемое объявление показывается в отдельном блоке «Реклама» над выдачей поиска и над лентой на главной —
//   только если подходит под запрос и фильтры человека (те же правила, что у выдачи: lib/search.js) и под выбранный город.
//   Обычная выдача не меняется: частные объявления не опускаются, порядок в ленте — по дате.
// - Объявления в блоке чередуются случайно — все оплаченные показываются примерно поровну, без аукциона ставок.
// - Маркировка (38-ФЗ «О рекламе», ст. 18.1): пометка «Реклама», рекламодатель (название и ИНН) и токен erid.
//   Токен выдаёт оператор рекламных данных (ОРД) после регистрации креатива — это делает владелец площадки.
//   Пока включено «показывать только с erid» (по умолчанию), оплаченное продвижение ждёт токена в «Модерация → Реклама»,
//   а срок начинается с момента запуска.
// - Если объявление снято, продано или на проверке, оно в блок не попадает; срок продвижения при этом идёт.
const DAY = 24 * 3600 * 1000;

module.exports = function promo({ route, db, h, billing, business, stats, mailer, searchSpec, specSql, categoryIds }) {
  const { HttpError, readJson, requireUser, requireAdmin, str, now, cardFromRow, loadListing } = h;

  db.exec(`
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
      payment_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,                     -- название объявления на момент покупки (для отчёта в ОРД)
      days INTEGER NOT NULL,
      price INTEGER NOT NULL,                  -- ₽ оплачено
      status TEXT NOT NULL,                    -- marking (ждёт erid) → active → ended | stopped
      erid TEXT NOT NULL DEFAULT '',
      advertiser TEXT NOT NULL DEFAULT '',     -- название рекламодателя на момент покупки
      advertiser_inn TEXT NOT NULL DEFAULT '',
      starts_at INTEGER,
      ends_at INTEGER,
      shows INTEGER NOT NULL DEFAULT 0,        -- показы в блоке «Реклама» (раз в сутки на человека)
      clicks INTEGER NOT NULL DEFAULT 0,       -- переходы из блока (раз в сутки на человека)
      note TEXT NOT NULL DEFAULT '',           -- причина остановки
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status, ends_at);
    CREATE INDEX IF NOT EXISTS idx_promotions_listing ON promotions(listing_id, status);
  `);

  const getSetting = () => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get('ads'); try { return r ? JSON.parse(r.value) : {}; } catch { return {}; } };
  const requireErid = () => getSetting().requireErid !== false;

  // Закончившиеся — в архив (вызывается перед выборкой и по таймеру).
  const expire = () => db.prepare('UPDATE promotions SET status = \'ended\' WHERE status = \'active\' AND ends_at <= ?').run(now()).changes;

  const view = (p) => ({ id: p.id, listingId: p.listing_id, title: p.title, days: p.days, price: p.price, status: p.status, erid: p.erid, startsAt: p.starts_at, endsAt: p.ends_at, shows: p.shows, clicks: p.clicks, note: p.note, createdAt: p.created_at });
  // Текущее продвижение объявления (идёт или ждёт маркировки).
  const currentOf = (listingId) => {
    expire();
    const p = db.prepare('SELECT * FROM promotions WHERE listing_id = ? AND status IN (\'active\', \'marking\') ORDER BY id DESC LIMIT 1').get(listingId);
    return p ? view(p) : null;
  };

  function priceFor(user, days) {
    const pr = billing.prices();
    const base = pr.promo[days];
    const plan = business.planOf(user);
    return plan && plan.id === 'pro' && pr.proDiscount ? Math.max(1, Math.round(base * (100 - pr.proDiscount) / 100)) : base;
  }

  // ---------- покупка ----------
  route('GET', '/api/listings/:id/promote', (ctx) => {
    const u = requireUser(ctx);
    const l = loadListing(parseInt(ctx.params.id, 10));
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    return {
      options: billing.PROMO_DAYS.map((d) => ({ days: d, price: priceFor(u, d), base: billing.prices().promo[d] })),
      discount: priceFor(u, 7) !== billing.prices().promo[7] ? billing.prices().proDiscount : 0,
      current: currentOf(l.id), ready: billing.ready(), biz: u.biz_status === 'verified', requireErid: requireErid(), city: l.city,
      history: db.prepare('SELECT * FROM promotions WHERE listing_id = ? ORDER BY id DESC LIMIT 10').all(l.id).map(view)
    };
  });

  route('POST', '/api/listings/:id/promote', async (ctx) => {
    const u = requireUser(ctx);
    const l = loadListing(parseInt(ctx.params.id, 10));
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    if (l.status !== 'active') throw new HttpError(400, 'Продвигать можно опубликованное объявление');
    if (u.biz_status !== 'verified') throw new HttpError(403, 'Продвижение — для ИП и компаний. Сначала подтвердите данные бизнеса в «Настройки → Для бизнеса».');
    const days = Number((await readJson(ctx.req)).days);
    if (!billing.PROMO_DAYS.includes(days)) throw new HttpError(400, 'Выберите срок продвижения');
    return billing.create(u, { kind: 'promo', item: { listingId: l.id, days }, title: `Продвижение объявления на ${days} дн. на Торгане`, amount: priceFor(u, days) });
  });

  // Оплата прошла: если продвижение уже идёт — продлеваем; иначе запускаем или ставим в очередь на маркировку.
  billing.onPaid('promo', (p, item) => {
    const l = loadListing(item.listingId);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(p.user_id);
    const cur = l ? db.prepare('SELECT * FROM promotions WHERE listing_id = ? AND status IN (\'active\', \'marking\') ORDER BY id DESC LIMIT 1').get(l.id) : null;
    if (cur && cur.status === 'active') {
      db.prepare('UPDATE promotions SET days = days + ?, price = price + ?, ends_at = ends_at + ? WHERE id = ?').run(item.days, p.amount, item.days * DAY, cur.id);
      return `продвижение продлено до ${new Date(cur.ends_at + item.days * DAY).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })}`;
    }
    if (cur) { // ещё ждёт маркировки — добавляем дни к нему
      db.prepare('UPDATE promotions SET days = days + ?, price = price + ? WHERE id = ?').run(item.days, p.amount, cur.id);
      return `к продвижению добавлено ${item.days} дн. — оно начнётся после маркировки`;
    }
    const mark = requireErid();
    const t = now();
    db.prepare(`INSERT INTO promotions (user_id, listing_id, payment_id, title, days, price, status, advertiser, advertiser_inn, starts_at, ends_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(p.user_id, l ? l.id : null, p.id, l ? l.title : 'Объявление удалено', item.days, p.amount, mark ? 'marking' : 'active',
      u.biz_name || u.name, u.biz_inn || '', mark ? null : t, mark ? null : t + item.days * DAY, t);
    return mark ? 'продвижение начнётся после маркировки рекламы — обычно в течение рабочего дня' : `продвижение идёт до ${new Date(t + item.days * DAY).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })}`;
  });

  billing.onRefund('promo', (p, item, admin) => {
    const r = db.prepare('SELECT * FROM promotions WHERE payment_id = ? AND status IN (\'active\', \'marking\')').get(p.id)
      || db.prepare('SELECT * FROM promotions WHERE listing_id = ? AND status IN (\'active\', \'marking\') ORDER BY id DESC LIMIT 1').get(item.listingId);
    if (r) stop(admin, r, 'Деньги возвращены');
  });

  function stop(admin, r, reason) {
    db.prepare('UPDATE promotions SET status = \'stopped\', note = ?, ends_at = MIN(COALESCE(ends_at, ?), ?) WHERE id = ?').run(reason, now(), now(), r.id);
    h.audit(admin, 'promo-stopped', { listingId: r.listing_id, userId: r.user_id }, { reason, title: r.title });
  }

  // ---------- блок «Реклама» ----------
  // Параметры — как у /api/listings (q, category, city, min, max, delivery); limit — сколько карточек в ряд.
  route('GET', '/api/ads', (ctx) => {
    expire();
    const spec = searchSpec(Object.fromEntries(ctx.query.entries()), categoryIds);
    spec.user = null; // в профиле продавца рекламы нет
    const f = specSql(spec);
    const limit = Math.min(Math.max(parseInt(ctx.query.get('limit') || '3', 10) || 3, 1), 6);
    const uid = ctx.user ? ctx.user.id : 0;
    const rows = db.prepare(`SELECT l.id, l.title, l.price, l.price_unit, l.city, l.category, l.delivery, l.status, l.created_at, l.price_was, l.price_drop_at, l.subcategory, l.attrs, l.metro, l.video,
        (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
        EXISTS(SELECT 1 FROM favorites fv WHERE fv.listing_id = l.id AND fv.user_id = ?) AS is_fav,
        pr.id AS promo_id, pr.erid, pr.advertiser, pr.advertiser_inn
      FROM promotions pr JOIN listings l ON l.id = pr.listing_id JOIN users u ON u.id = l.user_id
      WHERE pr.status = 'active' AND pr.ends_at > ? AND l.status = 'active' AND u.is_blocked = 0 ${requireErid() ? 'AND pr.erid != \'\'' : ''}
        ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
      ORDER BY random() LIMIT ?`).all(uid, now(), ...f.args, limit);
    return { items: rows.map((r) => ({ ...cardFromRow(r), ad: { id: r.promo_id, erid: r.erid, advertiser: r.advertiser, inn: r.advertiser_inn } })) };
  });

  // Показы карточек в блоке — раз в сутки на человека (как обычные показы; продавца и роботов не считаем).
  route('POST', '/api/stats/ads', async (ctx) => {
    h.rateLimit(`sta:${ctx.ip}`, 120, 60 * 1000);
    const b = await readJson(ctx.req);
    if (!stats.fromPage(ctx)) return { counted: 0 };
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map((x) => parseInt(x, 10)).filter((x) => x > 0))].slice(0, 12);
    let n = 0;
    for (const id of ids) {
      const r = db.prepare('SELECT * FROM promotions WHERE id = ? AND status = \'active\'').get(id);
      const l = r && loadListing(r.listing_id);
      if (l && stats.countOnce(ctx, 'a', l)) { db.prepare('UPDATE promotions SET shows = shows + 1 WHERE id = ?').run(r.id); n++; }
    }
    return { counted: n };
  });
  // Переход из блока засчитан статистикой (src = ad) — добавляем в отчёт продвижения.
  h.onAdClick = (listing) => { db.prepare('UPDATE promotions SET clicks = clicks + 1 WHERE id = (SELECT id FROM promotions WHERE listing_id = ? AND status = \'active\' ORDER BY id DESC LIMIT 1)').run(listing.id); };

  // ---------- модерация: маркировка, остановка, отчёт для ОРД ----------
  const TABS = { marking: 'pr.status = \'marking\'', active: 'pr.status = \'active\'', ended: 'pr.status IN (\'ended\', \'stopped\')' };
  route('GET', '/api/admin/ads', (ctx) => {
    requireAdmin(ctx);
    expire();
    const tab = TABS[ctx.query.get('tab')] ? ctx.query.get('tab') : 'marking';
    const rows = db.prepare(`SELECT pr.*, u.name, u.email, u.avatar, (SELECT file FROM uploads p WHERE p.listing_id = pr.listing_id ORDER BY p.position LIMIT 1) AS photo, l.status AS listing_status
      FROM promotions pr JOIN users u ON u.id = pr.user_id LEFT JOIN listings l ON l.id = pr.listing_id WHERE ${TABS[tab]} ORDER BY pr.id DESC LIMIT 100`).all();
    return {
      requireErid: requireErid(),
      counts: Object.fromEntries(Object.entries(TABS).map(([k, w]) => [k, db.prepare(`SELECT COUNT(*) AS n FROM promotions pr WHERE ${w}`).get().n])),
      items: rows.map((r) => ({ ...view(r), advertiser: r.advertiser, inn: r.advertiser_inn, photo: h.photoUrl(r.photo), listingStatus: r.listing_status || 'deleted', user: { id: r.user_id, name: r.name, email: r.email, avatar: h.photoUrl(r.avatar) } }))
    };
  });

  route('PUT', '/api/admin/ads/settings', async (ctx) => {
    const admin = requireAdmin(ctx);
    const b = await readJson(ctx.req);
    db.prepare('INSERT INTO settings (key, value) VALUES (\'ads\', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(JSON.stringify({ requireErid: b.requireErid !== false }));
    h.audit(admin, 'ads-settings', {}, { requireErid: b.requireErid !== false });
    return { requireErid: requireErid() };
  });

  // Токен erid: у ждущего маркировки — запуск (срок начинается сейчас); у идущего — замена токена.
  route('POST', '/api/admin/ads/:id/erid', async (ctx) => {
    const admin = requireAdmin(ctx);
    const r = db.prepare('SELECT * FROM promotions WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!r || !['marking', 'active'].includes(r.status)) throw new HttpError(404, 'Продвижение не найдено');
    const erid = str((await readJson(ctx.req)).erid, 100).replace(/\s/g, '');
    if (!/^[A-Za-z0-9]{6,64}$/.test(erid)) throw new HttpError(400, 'Токен erid — латинские буквы и цифры, как его выдал ОРД');
    if (r.status === 'marking') {
      const t = now();
      db.prepare('UPDATE promotions SET erid = ?, status = \'active\', starts_at = ?, ends_at = ? WHERE id = ?').run(erid, t, t + r.days * DAY, r.id);
      mailer.notifyBilling(r.user_id, 'promo-started', { title: r.title, until: t + r.days * DAY, url: `/l/${r.listing_id}` });
      h.alerts.notify(r.user_id, 'moderation', { title: 'Продвижение запущено', body: `«${r.title}» — в блоке «Реклама» ${r.days} дн.`, url: `/l/${r.listing_id}`, tag: `promo-${r.id}` });
    } else db.prepare('UPDATE promotions SET erid = ? WHERE id = ?').run(erid, r.id);
    h.audit(admin, 'promo-erid', { listingId: r.listing_id, userId: r.user_id }, { erid, title: r.title });
    return { ok: true };
  });

  route('POST', '/api/admin/ads/:id/stop', async (ctx) => {
    const admin = requireAdmin(ctx);
    const r = db.prepare('SELECT * FROM promotions WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!r || !['marking', 'active'].includes(r.status)) throw new HttpError(404, 'Продвижение не найдено');
    const reason = str((await readJson(ctx.req)).reason, 500);
    if (reason.length < 5) throw new HttpError(400, 'Напишите причину — её увидит продавец');
    stop(admin, r, reason);
    mailer.notifyBilling(r.user_id, 'promo-stopped', { title: r.title, reason });
    h.alerts.notify(r.user_id, 'moderation', { title: 'Продвижение остановлено', body: reason, url: `/l/${r.listing_id}`, tag: `promo-${r.id}` });
    return { ok: true };
  });

  // Отчёт для ОРД: креативы, рекламодатели, периоды, суммы и показы. Разделитель «;», BOM — для Excel.
  route('GET', '/api/admin/ads.csv', (ctx) => {
    requireAdmin(ctx);
    const since = Date.parse(ctx.query.get('from') || '') || now() - 31 * DAY;
    const rows = db.prepare('SELECT * FROM promotions WHERE created_at >= ? OR ends_at >= ? ORDER BY id').all(since, since);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const d = (ts) => (ts ? new Date(ts + 3 * 3600 * 1000).toISOString().slice(0, 10) : '');
    const ST = { marking: 'Ждёт маркировки', active: 'Идёт', ended: 'Завершено', stopped: 'Остановлено' };
    const lines = [['№', 'erid', 'Рекламодатель', 'ИНН рекламодателя', 'Объект рекламирования', 'Ссылка', 'Начало', 'Окончание', 'Сумма, ₽', 'Показы', 'Переходы', 'Статус'].map(q).join(';')];
    for (const r of rows) lines.push([r.id, r.erid, r.advertiser, r.advertiser_inn, r.title, r.listing_id ? `${h.PUBLIC_URL}/l/${r.listing_id}` : '', d(r.starts_at), d(r.ends_at), r.price, r.shows, r.clicks, ST[r.status]].map(q).join(';'));
    return h.file('text/csv; charset=utf-8', `﻿${lines.join('\r\n')}\r\n`, `torgana-ads-${d(since)}.csv`);
  });

  // Продвижения продавца (раздел «Для бизнеса»).
  const listFor = (userId) => { expire(); return db.prepare('SELECT * FROM promotions WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId).map(view); };
  const awaiting = () => db.prepare('SELECT COUNT(*) AS n FROM promotions WHERE status = \'marking\'').get().n;

  setInterval(() => { try { expire(); } catch { /* база занята — в следующий раз */ } }, 10 * 60 * 1000).unref();
  return { currentOf, listFor, awaiting, priceFor, requireErid };
};

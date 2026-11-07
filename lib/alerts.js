'use strict';

// Уведомления пользователям: push на устройства и подборка за день письмом.
// - Сохранённые поиски: когда объявление впервые опубликовано, проверяем все поиски (те же правила, что в выдаче).
// - Снижение цены: при публикации после правки цена ниже прошлой опубликованной — всем, у кого объявление в избранном.
// - Push о сообщениях, ответах поддержки, решениях модерации и отзывах — сразу, если человек не выключил этот вид.
const { searchSpec, specMatches } = require('./search');
const { SUB, fmt: fmtAttr, num: fmtNum } = require('./taxonomy');

const HOUR = 3600 * 1000;
const MAX_SEARCHES = 30;
const PUSH_KINDS = { messages: 'push_messages', searches: 'push_searches', prices: 'push_prices', moderation: 'push_moderation', reviews: 'push_reviews' };
const SEARCH_KEYS = ['q', 'category', 'sub', 'city', 'metro', 'min', 'max', 'delivery', 'bargain', 'exchange'];
const ATTR_KEY = /^a_[A-Za-z]{1,20}(_min|_max)?$/;

module.exports = function alerts({ route, db, mailer, push, h, categories }) {
  const { HttpError, readJson, requireUser, str, now } = h;
  const CATEGORY_IDS = new Set(categories.map((c) => c.id));
  const catName = (id) => (categories.find((c) => c.id === id) || {}).name || '';
  const fmt = (n) => `${new Intl.NumberFormat('ru-RU').format(n)} ₽`;

  // ---------- уведомления внутри Торганы (1.22) ----------
  // Колокольчик в шапке: решения модерации, отзывы, оплата, продвижение, снижение цен. Сохраняются всегда —
  // даже если push выключен. Сообщения чата и новое по поискам сюда не попадают: у них свои счётчики.
  // tone — ok | bad | wait (цвет значка), icon — имя значка в клиенте. Храним 90 дней.
  db.exec(`CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '', tone TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, read_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_notices_user ON notices(user_id, id DESC);`);
  const NOTICE_KINDS = new Set(['moderation', 'reviews', 'prices']);
  const KIND_ICON = { moderation: 'bell', reviews: 'star', prices: 'down' };
  const addNotice = db.prepare('INSERT INTO notices (user_id, kind, title, body, url, icon, tone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const unreadNotices = (userId) => db.prepare('SELECT COUNT(*) AS n FROM notices WHERE user_id = ? AND read_at IS NULL').get(userId).n;

  // Push одного вида: учитывает переключатель человека; ошибки сети не мешают основному действию.
  function notify(userId, kind, msg) {
    if (NOTICE_KINDS.has(kind)) {
      try { addNotice.run(userId, kind, String(msg.title).slice(0, 200), String(msg.body || '').slice(0, 400), String(msg.url || ''), msg.icon || KIND_ICON[kind], msg.tone || '', now()); } catch (e) { console.error('notice:', e.message); }
    }
    const col = PUSH_KINDS[kind];
    const u = db.prepare(`SELECT is_blocked, ${col} AS on_ FROM users WHERE id = ?`).get(userId);
    if (!u || u.is_blocked || !u.on_) return;
    const { icon, tone, ...payload } = msg; // значок и цвет — только для колокольчика
    push.send(userId, payload).catch(() => {});
  }

  route('GET', '/api/notices', (ctx) => {
    const u = requireUser(ctx);
    const items = db.prepare('SELECT id, kind, title, body, url, icon, tone, created_at AS at, read_at IS NOT NULL AS read FROM notices WHERE user_id = ? ORDER BY id DESC LIMIT 60').all(u.id)
      .map((r) => {
        // Уведомление про объявление (/l/123, /edit/123) — с его главным фото (1.25).
        const m = /^\/(?:l|edit)\/(\d+)/.exec(r.url);
        const ph = m ? db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position LIMIT 1').get(Number(m[1])) : null;
        return { ...r, read: !!r.read, photo: ph ? h.photoUrl(ph.file) : '' };
      });
    return { items, unread: unreadNotices(u.id) };
  });
  // Прочитать: { id } — одно, без id — все.
  route('POST', '/api/notices/read', async (ctx) => {
    const u = requireUser(ctx);
    const id = parseInt((await readJson(ctx.req)).id, 10);
    if (id) db.prepare('UPDATE notices SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL').run(now(), id, u.id);
    else db.prepare('UPDATE notices SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), u.id);
    return { unread: unreadNotices(u.id) };
  });
  setInterval(() => { try { db.prepare('DELETE FROM notices WHERE created_at < ?').run(now() - 90 * 24 * HOUR); } catch { /* база занята */ } }, 6 * HOUR).unref();

  // ---------- сохранённые поиски ----------
  // Характеристики (a_…) — только при подкатегории, в порядке ключей: одинаковые поиски сравниваются как строки.
  const cleanParams = (p) => Object.fromEntries([
    ...SEARCH_KEYS.map((k) => [k, str(p[k], 120)]),
    ...(SUB[p.sub] ? Object.keys(p).filter((k) => ATTR_KEY.test(k) && SUB[p.sub].fields.some((f) => k.replace(/^a_|_min$|_max$/g, '') === f.key)).sort().map((k) => [k, str(p[k], 60)]) : [])
  ].filter(([, v]) => v && v !== '0'));
  // «Автомат», «год выпуска от 2015», «пробег до 100 000 км».
  function attrsTitle(p) {
    const sub = SUB[p.sub];
    if (!sub) return [];
    const out = [];
    for (const f of sub.fields) {
      if (f.type === 'select' && p[`a_${f.key}`]) out.push(f.key === 'rooms' ? fmtAttr(f, p[`a_${f.key}`]) : p[`a_${f.key}`]);
      const lo = p[`a_${f.key}_min`]; const hi = p[`a_${f.key}_max`];
      const u = f.unit ? ` ${f.unit}` : '';
      const n = (v) => fmtNum(Number(v));
      if (lo && hi) out.push(`${f.label.toLowerCase()} ${n(lo)}–${n(hi)}${u}`); else if (lo) out.push(`${f.label.toLowerCase()} от ${n(lo)}${u}`); else if (hi) out.push(`${f.label.toLowerCase()} до ${n(hi)}${u}`);
    }
    return out;
  }
  function titleOf(p) {
    const sub = SUB[p.sub];
    const where = sub ? sub.name : catName(p.category);
    const parts = [p.q ? `«${p.q}»` : where || 'Все объявления'];
    if (p.q && where) parts.push(where.toLowerCase());
    parts.push(...attrsTitle(p));
    if (p.city) parts.push(p.city);
    if (p.metro) parts.push(`м. ${p.metro}`);
    if (p.min && p.max) parts.push(`${fmt(p.min)} – ${fmt(p.max)}`); else if (p.min) parts.push(`от ${fmt(p.min)}`); else if (p.max) parts.push(`до ${fmt(p.max)}`);
    if (p.delivery) parts.push('с доставкой');
    if (p.bargain) parts.push('торг');
    if (p.exchange) parts.push('обмен');
    return parts.join(' · ').slice(0, 140);
  }
  const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const searchJson = (s) => ({
    id: s.id, title: s.title, params: JSON.parse(s.params), notify: !!s.notify, createdAt: s.created_at,
    fresh: db.prepare('SELECT COUNT(*) AS n FROM user_alerts WHERE search_id = ? AND seen_at IS NULL').get(s.id).n
  });
  const mine = (u, id) => {
    const s = db.prepare('SELECT * FROM saved_searches WHERE id = ? AND user_id = ?').get(id, u.id);
    if (!s) throw new HttpError(404, 'Поиск не найден');
    return s;
  };

  route('GET', '/api/saved-searches', (ctx) => {
    const u = requireUser(ctx);
    return { items: db.prepare('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY id DESC').all(u.id).map(searchJson) };
  });

  route('POST', '/api/saved-searches', async (ctx) => {
    const u = requireUser(ctx);
    const params = cleanParams(await readJson(ctx.req));
    const existing = db.prepare('SELECT * FROM saved_searches WHERE user_id = ?').all(u.id);
    const dup = existing.find((s) => sameParams(JSON.parse(s.params), params));
    if (dup) return { search: searchJson(dup) };
    if (existing.length >= MAX_SEARCHES) throw new HttpError(400, `Можно сохранить до ${MAX_SEARCHES} поисков — удалите ненужные`);
    const info = db.prepare('INSERT INTO saved_searches (user_id, params, title, created_at, seen_at) VALUES (?, ?, ?, ?, ?)')
      .run(u.id, JSON.stringify(params), titleOf(params), now(), now());
    return { search: searchJson(db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(info.lastInsertRowid)) };
  });

  route('PATCH', '/api/saved-searches/:id', async (ctx) => {
    const u = requireUser(ctx);
    const s = mine(u, parseInt(ctx.params.id, 10));
    const b = await readJson(ctx.req);
    if (b.notify !== undefined) db.prepare('UPDATE saved_searches SET notify = ? WHERE id = ?').run(b.notify ? 1 : 0, s.id);
    return { search: searchJson(db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(s.id)) };
  });

  route('DELETE', '/api/saved-searches/:id', (ctx) => {
    const u = requireUser(ctx);
    db.prepare('DELETE FROM saved_searches WHERE id = ?').run(mine(u, parseInt(ctx.params.id, 10)).id);
    return { ok: true };
  });

  // Человек открыл выдачу по сохранённому поиску — новое по нему просмотрено.
  route('POST', '/api/saved-searches/:id/seen', (ctx) => {
    const u = requireUser(ctx);
    const s = mine(u, parseInt(ctx.params.id, 10));
    db.prepare('UPDATE saved_searches SET seen_at = ? WHERE id = ?').run(now(), s.id);
    db.prepare('UPDATE user_alerts SET seen_at = ? WHERE search_id = ? AND seen_at IS NULL').run(now(), s.id);
    return { ok: true };
  });

  // Открыл избранное — снижения цен просмотрены.
  const seenPrices = (userId) => db.prepare('UPDATE user_alerts SET seen_at = ? WHERE user_id = ? AND kind = \'price\' AND seen_at IS NULL').run(now(), userId);
  const freshCounts = (userId) => Object.fromEntries(['search', 'price', 'follow'].map((k) => [k, db.prepare('SELECT COUNT(*) AS n FROM user_alerts WHERE user_id = ? AND kind = ? AND seen_at IS NULL').get(userId, k).n]));

  // ---------- объявление опубликовано ----------
  const addAlert = db.prepare('INSERT INTO user_alerts (user_id, kind, listing_id, search_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  function onPublished(listingId) {
    const l = db.prepare('SELECT * FROM listings WHERE id = ? AND status = \'active\'').get(listingId);
    if (!l) return;
    const t = now();
    const priceText = l.price === null ? 'цена договорная' : fmt(l.price);
    // Снижение цены: только при повторной публикации (была опубликованная цена).
    if (l.published_price !== null && l.price !== null && l.price < l.published_price) {
      db.prepare('UPDATE listings SET price_was = ?, price_drop_at = ? WHERE id = ?').run(l.published_price, t, l.id);
      const fans = db.prepare('SELECT f.user_id FROM favorites f JOIN users u ON u.id = f.user_id WHERE f.listing_id = ? AND f.user_id != ? AND u.is_blocked = 0').all(l.id, l.user_id);
      for (const { user_id: uid } of fans) {
        db.prepare('DELETE FROM user_alerts WHERE user_id = ? AND kind = \'price\' AND listing_id = ? AND seen_at IS NULL').run(uid, l.id);
        addAlert.run(uid, 'price', l.id, null, JSON.stringify({ old: l.published_price, price: l.price }), t);
        notify(uid, 'prices', { title: 'Цена снижена', body: `${l.title}: ${fmt(l.price)} вместо ${fmt(l.published_price)}`, url: `/l/${l.id}`, tag: `price-${l.id}` });
      }
    } else if (l.price === null || l.published_price === null || l.price > l.published_price) {
      db.prepare('UPDATE listings SET price_was = NULL, price_drop_at = NULL WHERE id = ?').run(l.id);
    }
    db.prepare('UPDATE listings SET published_price = ? WHERE id = ?').run(l.price, l.id);
    // Сохранённые поиски — один раз на объявление (повторная публикация после правки не рассылается заново).
    if (l.alerted) return;
    db.prepare('UPDATE listings SET alerted = 1 WHERE id = ?').run(l.id);
    const searches = db.prepare(`SELECT s.* FROM saved_searches s JOIN users u ON u.id = s.user_id
      WHERE s.notify = 1 AND s.user_id != ? AND u.is_blocked = 0`).all(l.user_id);
    for (const s of searches) {
      if (!specMatches(searchSpec(JSON.parse(s.params), CATEGORY_IDS), l)) continue;
      addAlert.run(s.user_id, 'search', l.id, s.id, '{}', t);
      notify(s.user_id, 'searches', { title: `Новое: ${s.title}`, body: `${l.title} — ${priceText}`, url: `/l/${l.id}`, tag: `search-${s.id}` });
    }
    // Подписчики продавца. Push — не чаще раза в 3 часа от одного продавца (магазин может выложить сразу много).
    const seller = db.prepare('SELECT name FROM users WHERE id = ?').get(l.user_id);
    const fans = db.prepare(`SELECT f.user_id FROM follows f JOIN users u ON u.id = f.user_id WHERE f.seller_id = ? AND u.is_blocked = 0`).all(l.user_id);
    for (const { user_id: uid } of fans) {
      const recent = db.prepare(`SELECT 1 FROM user_alerts a JOIN listings x ON x.id = a.listing_id WHERE a.user_id = ? AND a.kind = 'follow' AND x.user_id = ? AND a.created_at > ?`).get(uid, l.user_id, t - 3 * HOUR);
      addAlert.run(uid, 'follow', l.id, null, JSON.stringify({ seller: l.user_id }), t);
      if (!recent) notify(uid, 'searches', { title: `Новое у продавца ${seller.name}`, body: `${l.title} — ${priceText}`, url: `/l/${l.id}`, tag: `follow-${l.user_id}` });
    }
  }

  // ---------- подборка за день ----------
  // Раз в сутки, с 9 до 21 по Москве: непросмотренное новое, о котором ещё не писали; свежее — не раньше чем через час
  // (вдруг человек сам зайдёт по push).
  let opts = { minAge: HOUR, anyHour: false };
  function digestTick() {
    if (!mailer.ready()) return 0;
    const t = now();
    const mskHour = new Date(t + 3 * HOUR).getUTCHours();
    if (!opts.anyHour && (mskHour < 9 || mskHour >= 21)) return 0;
    const users = db.prepare(`SELECT DISTINCT u.id FROM user_alerts a JOIN users u ON u.id = a.user_id
      WHERE a.seen_at IS NULL AND a.emailed_at IS NULL AND a.created_at < ? AND u.notify_digest = 1 AND u.is_blocked = 0 AND u.digest_at < ?`).all(t - opts.minAge, t - 22 * HOUR);
    let sent = 0;
    for (const { id: uid } of users) {
      const rows = db.prepare(`SELECT a.*, s.title AS search_title, l.title, l.price, l.price_unit, l.city, l.status,
          (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo
        FROM user_alerts a JOIN listings l ON l.id = a.listing_id LEFT JOIN saved_searches s ON s.id = a.search_id
        WHERE a.user_id = ? AND a.seen_at IS NULL AND a.emailed_at IS NULL AND l.status = 'active' ORDER BY a.id DESC LIMIT 40`).all(uid);
      db.prepare('UPDATE user_alerts SET emailed_at = ? WHERE user_id = ? AND emailed_at IS NULL').run(t, uid);
      db.prepare('UPDATE users SET digest_at = ? WHERE id = ?').run(t, uid);
      if (!rows.length) continue;
      const searches = new Map();
      for (const r of rows.filter((x) => x.kind === 'search')) {
        if (!searches.has(r.search_id)) searches.set(r.search_id, { id: r.search_id, title: r.search_title, items: [] });
        searches.get(r.search_id).items.push(r);
      }
      const follows = new Map();
      for (const r of rows.filter((x) => x.kind === 'follow')) {
        const sid = JSON.parse(r.data).seller;
        if (!follows.has(sid)) follows.set(sid, { id: sid, name: (db.prepare('SELECT name FROM users WHERE id = ?').get(sid) || {}).name || 'Продавец', items: [] });
        follows.get(sid).items.push(r);
      }
      mailer.notifyDigest(uid, { searches: [...searches.values()], prices: rows.filter((x) => x.kind === 'price').map((r) => ({ ...r, old: JSON.parse(r.data).old })), follows: [...follows.values()] });
      sent += 1;
    }
    return sent;
  }

  // ---------- устройства ----------
  route('GET', '/api/push', (ctx) => ({ key: push.publicKey, devices: ctx.user ? push.devices(ctx.user.id) : 0 }));
  route('POST', '/api/push/subscribe', async (ctx) => {
    const u = requireUser(ctx);
    const b = await readJson(ctx.req);
    try { push.subscribe(u.id, b.subscription, b.device); } catch (e) { throw new HttpError(400, e.message); }
    return { ok: true, devices: push.devices(u.id) };
  });
  route('POST', '/api/push/unsubscribe', async (ctx) => {
    const u = requireUser(ctx);
    push.unsubscribe(u.id, (await readJson(ctx.req)).endpoint);
    return { ok: true, devices: push.devices(u.id) };
  });
  route('POST', '/api/push/test', async (ctx) => {
    const u = requireUser(ctx);
    h.rateLimit(`pushtest:${u.id}`, 5, 10 * 60 * 1000);
    const ok = await push.send(u.id, { title: 'Уведомления включены', body: 'Так будут выглядеть уведомления Торганы.', url: '/profile/settings#sn' });
    return { ok: ok > 0 };
  });

  // tickMs, minAge (через сколько после события можно писать) и anyHour (без окна 9–21) меняются только в тестах.
  function start({ tickMs = 60 * 1000, minAge, anyHour } = {}) {
    opts = { minAge: minAge ?? HOUR, anyHour: !!anyHour };
    setInterval(() => { try { digestTick(); } catch (e) { console.error('digest:', e.message); } }, tickMs).unref();
  }

  // Решение модерации — письмом (как раньше) и push.
  // scheduled — проверено, опубликуем в выбранное время (reason — когда); expired — прошло 30 дней, объявление снято.
  const MOD_PUSH = { approved: 'Объявление опубликовано', restored: 'Объявление снова опубликовано', 'appeal-approved': 'Апелляция одобрена', rejected: 'Объявление нужно исправить', 'appeal-denied': 'Апелляция отклонена',
    scheduled: 'Объявление проверено', expired: 'Прошло 30 дней — объявление снято' };
  const MOD_URL = { rejected: (id) => `/edit/${id}`, 'appeal-denied': (id) => `/edit/${id}`, scheduled: () => '/profile?status=scheduled', expired: () => '/profile?status=archived' };
  const MOD_LOOK = { approved: ['check', 'ok'], restored: ['check', 'ok'], 'appeal-approved': ['check', 'ok'], rejected: ['warn', 'bad'], 'appeal-denied': ['warn', 'bad'], scheduled: ['clock', 'wait'], expired: ['clock', ''] };
  function moderation(listingId, event, reason = '') {
    mailer.notifyModeration(listingId, event, reason);
    const l = db.prepare('SELECT id, title, user_id FROM listings WHERE id = ?').get(listingId);
    const body = event === 'scheduled' ? `«${l && l.title}» опубликуем ${reason}` : event === 'expired' ? `«${l && l.title}» — опубликуйте снова, это бесплатно` : reason ? `«${l && l.title}»: ${reason}` : `«${l && l.title}»`;
    if (l && MOD_PUSH[event]) notify(l.user_id, 'moderation', { title: MOD_PUSH[event], body, url: (MOD_URL[event] || ((id) => `/l/${id}`))(l.id), tag: `mod-${l.id}`, icon: MOD_LOOK[event][0], tone: MOD_LOOK[event][1] });
  }

  return { notify, moderation, onPublished, digestTick, seenPrices, freshCounts, unreadNotices, start };
};

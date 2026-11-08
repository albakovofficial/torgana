'use strict';

// Уведомления пользователям: push на устройства и подборка за день письмом.
// - Подписки на продавцов: когда объявление впервые опубликовано, — подписчикам продавца.
// - Снижение цены: при публикации после правки цена ниже прошлой опубликованной — всем, у кого объявление в избранном.
// - Push о сообщениях, ответах поддержки, решениях модерации и отзывах — сразу, если человек не выключил этот вид.

const HOUR = 3600 * 1000;
const PUSH_KINDS = { messages: 'push_messages', searches: 'push_searches', prices: 'push_prices', moderation: 'push_moderation', reviews: 'push_reviews' };

module.exports = function alerts({ route, db, mailer, push, h, categories }) {
  const { HttpError, readJson, requireUser, now } = h;
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

  // 1.39.0: сохранённые поиски убраны (по решению владельца). Таблица saved_searches остаётся в базе, но не используется;
  // накопленное «новое по поиску» больше не показываем и не рассылаем.
  db.prepare('DELETE FROM user_alerts WHERE kind = \'search\'').run();

  // Открыл избранное — снижения цен просмотрены.
  const seenPrices = (userId) => db.prepare('UPDATE user_alerts SET seen_at = ? WHERE user_id = ? AND kind = \'price\' AND seen_at IS NULL').run(now(), userId);
  const freshCounts = (userId) => Object.fromEntries(['price', 'follow'].map((k) => [k, db.prepare('SELECT COUNT(*) AS n FROM user_alerts WHERE user_id = ? AND kind = ? AND seen_at IS NULL').get(userId, k).n]));

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
    // Подписчикам — один раз на объявление (повторная публикация после правки не рассылается заново).
    if (l.alerted) return;
    db.prepare('UPDATE listings SET alerted = 1 WHERE id = ?').run(l.id);
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
      WHERE a.seen_at IS NULL AND a.emailed_at IS NULL AND a.created_at < ? AND u.notify_digest = 1 AND u.is_blocked = 0 AND u.deactivated_at IS NULL AND u.digest_at < ?`).all(t - opts.minAge, t - 22 * HOUR);
    let sent = 0;
    for (const { id: uid } of users) {
      const rows = db.prepare(`SELECT a.*, l.title, l.price, l.price_unit, l.city, l.status,
          (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo
        FROM user_alerts a JOIN listings l ON l.id = a.listing_id
        WHERE a.user_id = ? AND a.seen_at IS NULL AND a.emailed_at IS NULL AND l.status = 'active' ORDER BY a.id DESC LIMIT 40`).all(uid);
      db.prepare('UPDATE user_alerts SET emailed_at = ? WHERE user_id = ? AND emailed_at IS NULL').run(t, uid);
      db.prepare('UPDATE users SET digest_at = ? WHERE id = ?').run(t, uid);
      if (!rows.length) continue;
      const follows = new Map();
      for (const r of rows.filter((x) => x.kind === 'follow')) {
        const sid = JSON.parse(r.data).seller;
        if (!follows.has(sid)) follows.set(sid, { id: sid, name: (db.prepare('SELECT name FROM users WHERE id = ?').get(sid) || {}).name || 'Продавец', items: [] });
        follows.get(sid).items.push(r);
      }
      mailer.notifyDigest(uid, { prices: rows.filter((x) => x.kind === 'price').map((r) => ({ ...r, old: JSON.parse(r.data).old })), follows: [...follows.values()] });
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

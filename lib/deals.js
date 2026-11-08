'use strict';

// Торг и связь с продавцом:
// - «Предложить цену» в чате: покупатель предлагает сумму, продавец принимает или отклоняет одной кнопкой.
//   Предложение — сообщение в чате (kind = offer); ответ продавца — тоже сообщение (offer-reply), поэтому
//   приходит push и письмом, как любое сообщение. Новое предложение заменяет ожидающее.
// - Быстрые ответы: свои шаблоны продавца над полем ввода (до 12, с тарифом «Магазин»/«Магазин Про» — до 30, по 300 символов);
//   пока своих нет — готовые.
// - Подписка на продавца или магазин: новые объявления — push сразу и в подборке за день (lib/alerts.js),
//   отписка в один клик из письма (lib/mailer.js, k=follow-<id>).
const MIN_SHARE = 0.3; // предложение не ниже 30% цены — защита от «предложу 1 рубль»
const DEFAULT_REPLIES = [
  'Здравствуйте! Да, ещё продаётся.',
  'Можно посмотреть сегодня или завтра — когда вам удобно?',
  'Торг возможен при осмотре.',
  'Могу отправить по России — доставку оплачивает покупатель.',
  'Спасибо за интерес! К сожалению, уже продано.'
];
const MAX_REPLIES = 12;
const MAX_REPLIES_SHOP = 30; // 1.32: больше шаблонов магазинам с тарифом
const repliesMax = (u) => (u.plan && u.plan_until > Date.now() ? MAX_REPLIES_SHOP : MAX_REPLIES);

module.exports = function deals({ route, db, h, alerts }) {
  const { HttpError, readJson, requireUser, rateLimit, str, now, photoUrl, cardFromRow } = h;
  const money = (n) => `${new Intl.NumberFormat('ru-RU').format(n)} ₽`;

  // ---------- предложение цены ----------
  const offerJson = (o) => (o ? { id: o.id, price: o.price, listingPrice: o.listing_price, status: o.status, createdAt: o.created_at, decidedAt: o.decided_at } : null);
  const offersOf = (convId) => db.prepare('SELECT * FROM offers WHERE conversation_id = ? ORDER BY id').all(convId).map(offerJson);

  function conv(u, id) {
    const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!c || (c.buyer_id !== u.id && c.seller_id !== u.id)) throw new HttpError(404, 'Диалог не найден');
    return c;
  }
  function post(c, senderId, body, kind, offerId) {
    const t = now();
    const info = db.prepare('INSERT INTO messages (conversation_id, sender_id, body, photo, kind, offer_id, created_at) VALUES (?, ?, ?, \'\', ?, ?, ?)')
      .run(c.id, senderId, body, kind, offerId, t);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(t, c.id);
    const l = db.prepare('SELECT title FROM listings WHERE id = ?').get(c.listing_id);
    const from = db.prepare('SELECT name FROM users WHERE id = ?').get(senderId);
    alerts.notify(senderId === c.buyer_id ? c.seller_id : c.buyer_id, 'messages', { title: `${from.name} · ${l.title}`, body, url: `/messages/${c.id}`, tag: `chat-${c.id}`, urgent: true });
    return { id: Number(info.lastInsertRowid), mine: true, body, photo: null, kind, offerId, createdAt: t, read: false };
  }

  route('POST', '/api/conversations/:id/offer', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`offer:${u.id}`, 20, 60 * 60 * 1000);
    const c = conv(u, parseInt(ctx.params.id, 10));
    if (c.buyer_id !== u.id) throw new HttpError(400, 'Цену предлагает покупатель');
    const l = db.prepare('SELECT * FROM listings WHERE id = ?').get(c.listing_id);
    if (!l || l.status !== 'active') throw new HttpError(400, 'Объявление уже не продаётся');
    if (!l.bargain && l.price !== null) throw new HttpError(400, 'Продавец указал, что торг не уместен');
    const price = parseInt(String((await readJson(ctx.req)).price || '').replace(/\D/g, ''), 10);
    if (!Number.isFinite(price) || price < 1) throw new HttpError(400, 'Укажите сумму');
    if (l.price !== null) {
      if (price >= l.price) throw new HttpError(400, `Предложите меньше текущей цены — ${money(l.price)}`);
      const min = Math.ceil(l.price * MIN_SHARE);
      if (price < min) throw new HttpError(400, `Слишком низкая сумма — продавец такое не рассматривает. Не меньше ${money(min)}`);
    } else if (price > 10_000_000_000) throw new HttpError(400, 'Проверьте сумму');
    const today = db.prepare('SELECT COUNT(*) AS n FROM offers WHERE conversation_id = ? AND created_at > ?').get(c.id, now() - 24 * 3600 * 1000).n;
    if (today >= 5) throw new HttpError(429, 'Не больше пяти предложений в день по одному объявлению — дождитесь ответа продавца');
    // Ожидающее предложение заменяется новым.
    db.prepare('UPDATE offers SET status = \'withdrawn\', decided_at = ? WHERE conversation_id = ? AND status = \'pending\'').run(now(), c.id);
    const info = db.prepare('INSERT INTO offers (conversation_id, listing_id, buyer_id, price, listing_price, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.id, l.id, u.id, price, l.price, now());
    const offerId = Number(info.lastInsertRowid);
    const message = post(c, u.id, l.price !== null ? `Предлагаю ${money(price)} вместо ${money(l.price)}` : `Предлагаю ${money(price)}`, 'offer', offerId);
    return { message: { ...message, offer: offerJson(db.prepare('SELECT * FROM offers WHERE id = ?').get(offerId)) }, offers: offersOf(c.id) };
  });

  // accept / decline — продавец; withdraw — покупатель.
  route('POST', '/api/offers/:id/:action', async (ctx) => {
    const u = requireUser(ctx);
    const action = ctx.params.action;
    if (!['accept', 'decline', 'withdraw'].includes(action)) throw new HttpError(404, 'Не найдено');
    const o = db.prepare('SELECT * FROM offers WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!o) throw new HttpError(404, 'Предложение не найдено');
    const c = conv(u, o.conversation_id);
    if (action === 'withdraw' ? u.id !== c.buyer_id : u.id !== c.seller_id) throw new HttpError(403, action === 'withdraw' ? 'Отозвать может только покупатель' : 'Ответить может только продавец');
    if (o.status !== 'pending') throw new HttpError(400, { accepted: 'Предложение уже принято', declined: 'Предложение уже отклонено', withdrawn: 'Покупатель отозвал или заменил это предложение' }[o.status]);
    const status = { accept: 'accepted', decline: 'declined', withdraw: 'withdrawn' }[action];
    db.prepare('UPDATE offers SET status = ?, decided_at = ? WHERE id = ?').run(status, now(), o.id);
    let message = null;
    if (action === 'accept') message = post(c, u.id, `Согласен на ${money(o.price)}. Давайте договоримся о встрече или доставке.`, 'offer-reply', o.id);
    if (action === 'decline') message = post(c, u.id, `Не готов уступить до ${money(o.price)}.`, 'offer-reply', o.id);
    return { offer: offerJson(db.prepare('SELECT * FROM offers WHERE id = ?').get(o.id)), message, offers: offersOf(c.id) };
  });

  // ---------- быстрые ответы ----------
  const repliesOf = (u) => {
    try { const a = JSON.parse(u.quick_replies || ''); if (Array.isArray(a)) return { items: a, custom: true, max: repliesMax(u) }; } catch { /* по умолчанию */ }
    return { items: DEFAULT_REPLIES, custom: false, max: repliesMax(u) };
  };
  route('GET', '/api/my/replies', (ctx) => repliesOf(requireUser(ctx)));
  route('PUT', '/api/my/replies', async (ctx) => {
    const u = requireUser(ctx);
    const body = await readJson(ctx.req);
    if (body.reset) { db.prepare('UPDATE users SET quick_replies = \'\' WHERE id = ?').run(u.id); return { items: DEFAULT_REPLIES, custom: false, max: repliesMax(u) }; }
    if (!Array.isArray(body.items)) throw new HttpError(400, 'Нет списка ответов');
    const items = [...new Set(body.items.map((x) => str(x, 300)).filter(Boolean))];
    const max = repliesMax(u);
    if (items.length > max) throw new HttpError(400, `Не больше ${max} шаблонов`);
    db.prepare('UPDATE users SET quick_replies = ? WHERE id = ?').run(JSON.stringify(items), u.id);
    return { items, custom: true, max };
  });

  // ---------- подписка на продавца ----------
  const followers = (sellerId) => db.prepare('SELECT COUNT(*) AS n FROM follows f JOIN users u ON u.id = f.user_id WHERE f.seller_id = ? AND u.is_blocked = 0').get(sellerId).n;
  const isFollowing = (userId, sellerId) => !!(userId && db.prepare('SELECT 1 FROM follows WHERE user_id = ? AND seller_id = ?').get(userId, sellerId));

  route('POST', '/api/users/:id/follow', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`follow:${u.id}`, 60, 60 * 60 * 1000);
    const id = parseInt(ctx.params.id, 10);
    const s = db.prepare('SELECT id, is_blocked FROM users WHERE id = ?').get(id);
    if (!s || s.is_blocked) throw new HttpError(404, 'Продавец не найден');
    if (id === u.id) throw new HttpError(400, 'Это вы');
    const body = await readJson(ctx.req).catch(() => ({}));
    const want = body.follow === undefined ? !isFollowing(u.id, id) : !!body.follow;
    if (want) db.prepare('INSERT OR IGNORE INTO follows (user_id, seller_id, created_at, seen_at) VALUES (?, ?, ?, ?)').run(u.id, id, now(), now());
    else {
      db.prepare('DELETE FROM follows WHERE user_id = ? AND seller_id = ?').run(u.id, id);
      db.prepare('DELETE FROM user_alerts WHERE user_id = ? AND kind = \'follow\' AND seen_at IS NULL AND listing_id IN (SELECT id FROM listings WHERE user_id = ?)').run(u.id, id);
    }
    return { following: want, followers: followers(id) };
  });

  // Мои подписки: продавцы (сколько нового у каждого) и лента их свежих объявлений. Открыл — новое просмотрено.
  route('GET', '/api/my/following', (ctx) => {
    const u = requireUser(ctx);
    const sellers = db.prepare(`SELECT s.*, f.created_at AS since,
        (SELECT COUNT(*) FROM listings l WHERE l.user_id = s.id AND l.status = 'active') AS active,
        (SELECT COUNT(*) FROM user_alerts a JOIN listings l ON l.id = a.listing_id WHERE a.user_id = f.user_id AND a.kind = 'follow' AND a.seen_at IS NULL AND l.user_id = s.id) AS fresh
      FROM follows f JOIN users s ON s.id = f.seller_id WHERE f.user_id = ? AND s.is_blocked = 0 ORDER BY fresh DESC, f.created_at DESC`).all(u.id);
    const fresh = new Set(db.prepare('SELECT listing_id FROM user_alerts WHERE user_id = ? AND kind = \'follow\' AND seen_at IS NULL').all(u.id).map((r) => r.listing_id));
    const items = db.prepare(`SELECT l.id, l.title, l.price, l.price_unit, l.city, l.category, l.delivery, l.status, l.created_at, l.price_was, l.price_drop_at,
        l.subcategory, l.attrs, l.metro, l.video,
        (SELECT COALESCE(NULLIF(p.thumb, ''), p.file) FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
        EXISTS(SELECT 1 FROM favorites fv WHERE fv.listing_id = l.id AND fv.user_id = ?) AS is_fav
      FROM listings l JOIN follows f ON f.seller_id = l.user_id AND f.user_id = ? JOIN users s ON s.id = l.user_id
      WHERE l.status = 'active' AND s.is_blocked = 0 ORDER BY l.created_at DESC LIMIT 60`).all(u.id, u.id).map((r) => ({ ...cardFromRow(r), fresh: fresh.has(r.id) }));
    db.prepare('UPDATE user_alerts SET seen_at = ? WHERE user_id = ? AND kind = \'follow\' AND seen_at IS NULL').run(now(), u.id);
    return {
      sellers: sellers.map((s) => ({ id: s.id, name: s.name, avatar: photoUrl(s.avatar), city: s.city, active: s.active, fresh: s.fresh, since: s.since, shop: !!(s.plan && s.plan_until > now()) })),
      items
    };
  });

  return { offersOf, offerJson, followers, isFollowing, DEFAULT_REPLIES };
};

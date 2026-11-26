'use strict';
// Мой профиль (имя, город, телефон, фото, уведомления), значки продавца, публичная страница продавца с витриной.
const auth = require('./auth');
const { CATEGORIES } = require('./constants');

module.exports = function profile({ route, db, h, cards, secureCookies: SECURE_COOKIES }) {
  const { HttpError, requireUser, readJson, str, taxonomy, photoUrl, setAvatar, OWNER_EMAIL } = h;
  const { CARD_SELECT, cardFromRow } = cards;

  // Значки продавца: доверие (lib/h.trust.js) и «Магазин» при оплаченном тарифе.
  // 1.50.0: official — галочка «Официальный аккаунт Торганы» у имени (аккаунт владельца); значка «Магазин» у него нет.
  const badgesOf = (u) => ({ ...h.trust.badgesOf(u), shop: !!h.business.planOf(u) && !h.business.isOfficial(u), official: h.business.isOfficial(u), first: h.first.of(u) });

  // Переключатели уведомлений: поле API → колонка users (письма и push по видам).
  const NOTIFY_FIELDS = {
    notifyMessages: 'notify_messages', notifyModeration: 'notify_moderation', notifyDigest: 'notify_digest',
    pushMessages: 'push_messages', pushSearches: 'push_searches', pushPrices: 'push_prices', pushModeration: 'push_moderation'
  };

  function publicUser(u) {
    return u ? {
      id: u.id, name: u.name, email: u.email, city: u.city, phone: u.phone, avatar: photoUrl(u.avatar), isAdmin: !!u.is_admin, isOwner: !!u.is_admin && u.email === OWNER_EMAIL, createdAt: u.created_at,
      emailVerified: !!u.email_verified, ...Object.fromEntries(Object.entries(NOTIFY_FIELDS).map(([k, col]) => [k, !!u[col]])),
      rep: h.reputation ? h.reputation.levelOf(u.id) : null, badges: badgesOf(u), business: h.trust.bizOf(u), trademark: h.trust.tmOf(u), phoneVia: u.phone_verified ? u.phone_verified_via : '', oauth: h.oauth.linkedOf(u.id),
      plan: h.business.planOf(u), shop: h.business.shopOf(u), deactivatedAt: u.deactivated_at || null
    } : null;
  }

  route('GET', '/api/me', (ctx) => {
    if (ctx.user) { const e = auth.renewSession(db, ctx.token, ctx.user.expires_at); if (e) ctx.setCookie(auth.sessionCookie(ctx.token, e, SECURE_COOKIES)); }
    const unread = ctx.user ? h.unreadCount(ctx.user.id) + h.support.unreadFor(ctx.user.id) : 0;
    return { user: publicUser(ctx.user), unread, fresh: ctx.user ? h.alerts.freshCounts(ctx.user.id) : null, notices: ctx.user ? h.alerts.unreadNotices(ctx.user.id) : 0,
      first: { left: h.first.left(), form: ctx.user ? h.first.formOf(ctx.user) : 'm' } }; // медаль «Один из первых»: сколько осталось и подпись
  });

  route('PATCH', '/api/me', async (ctx) => {
    const u = requireUser(ctx);
    const body = await readJson(ctx.req);
    const name = body.name !== undefined ? str(body.name, 60) : u.name;
    const city = body.city !== undefined ? str(body.city, 60) : u.city;
    const phone = body.phone !== undefined ? str(body.phone, 30) : u.phone;
    const flag = (v, cur) => (v === undefined ? cur : v ? 1 : 0);
    if (name.length < 2) throw new HttpError(400, 'Укажите имя');
    // avatar: имя файла из /api/uploads — новое фото; '' — убрать фото.
    let avatar = null;
    if (body.avatar !== undefined) {
      avatar = String(body.avatar || '');
      if (avatar && avatar !== u.avatar) {
        const row = db.prepare('SELECT listing_id FROM uploads WHERE file = ? AND user_id = ?').get(avatar, u.id);
        if (!row || row.listing_id !== null) throw new HttpError(400, 'Сначала загрузите фото');
      }
    }
    const cols = Object.entries(NOTIFY_FIELDS);
    // Другой номер — уже не подтверждённый (подтверждается входом через Яндекс ID или VK ID).
    const phoneVerified = phone.replace(/\D/g, '') === String(u.phone || '').replace(/\D/g, '') ? u.phone_verified : 0;
    // Подпись медали «Один из первых»: 'm' / 'f' (1.52.0); '' — угадываем по имени.
    const medalForm = body.medalForm !== undefined ? (['m', 'f'].includes(body.medalForm) ? body.medalForm : '') : u.medal_form;
    db.prepare(`UPDATE users SET name = ?, city = ?, phone = ?, phone_verified = ?, medal_form = ?, ${cols.map(([, c]) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(name, city, phone, phoneVerified, medalForm, ...cols.map(([k, c]) => flag(body[k], u[c])), u.id);
    if (avatar !== null) setAvatar(u.id, avatar);
    return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) };
  });

  route('GET', '/api/users/:id', (ctx) => {
    const id = parseInt(ctx.params.id, 10);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!u || u.is_blocked || u.deactivated_at || u.deleted_at) throw new HttpError(404, 'Пользователь не найден');
    const uid = ctx.user ? ctx.user.id : 0;
    // 1.49.0: объявления продавца страница грузит через /api/listings?user=… (поиск, разделы и сортировка витрины);
    // здесь — счётчики, разделы с числом объявлений и закреплённые магазином (тариф «Магазин Про»).
    const activeCount = db.prepare('SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = \'active\'').get(id).n;
    const shop = h.business.shopOf(u);
    const pinned = shop && shop.pins.length ? db.prepare(`${CARD_SELECT} WHERE l.id IN (${shop.pins.map(Number).join(',')}) AND l.user_id = ? AND l.status = 'active'`).all(uid, id)
      .map((r) => ({ ...cardFromRow(r), seller: null })).sort((a, b) => shop.pins.indexOf(a.id) - shop.pins.indexOf(b.id)) : [];
    return { user: { id: u.id, name: u.name, city: u.city, avatar: photoUrl(u.avatar), createdAt: u.created_at, activeCount, emailVerified: !!u.email_verified, rep: h.reputation.repOf(u.id), badges: badgesOf(u), shop,
      followers: h.deals.followers(u.id), following: h.deals.isFollowing(uid, u.id), block: uid && uid !== u.id ? h.blocks.between(uid, u.id) : null },
    sections: shop ? sectionsOf(id) : [], pinned };
  });

  // 1.49.0: разделы витрины — из опубликованных объявлений магазина: подкатегория (или категория, если её нет) и число.
  function sectionsOf(userId) {
    return db.prepare(`SELECT category, subcategory, COUNT(*) AS n FROM listings WHERE user_id = ? AND status = 'active' GROUP BY category, subcategory ORDER BY n DESC LIMIT 30`).all(userId)
      .map((r) => (taxonomy.SUB[r.subcategory] ? { sub: r.subcategory, name: taxonomy.SUB[r.subcategory].name, n: r.n }
        : { category: r.category, name: (CATEGORIES.find((c) => c.id === r.category) || { name: r.category }).name, n: r.n }));
  }

  return { publicUser, badgesOf };
};

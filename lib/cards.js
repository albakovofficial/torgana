'use strict';
// Карточки объявлений в ленте, поиске, на карте и в избранном: один запрос CARD_SELECT, один вид cardFromRow,
// поиск с исправлением опечаток, счётчики выдачи из памяти.
const { searchSpec, specSql, correctQuery } = require('./search');
const { cityCenter } = require('./geo');
const { CATEGORY_IDS } = require('./constants');

module.exports = function cards({ route, db, h }) {
  const { HttpError, requireUser, now, taxonomy, metro, photoUrl } = h;

  // Старая цена, если цену снизили за последние 30 дней (зачёркнутая цена в карточке и на странице объявления).
  const priceWasOf = (r) => (r.price_was && r.price_drop_at > Date.now() - 30 * 24 * 3600 * 1000 ? r.price_was : null);

  function attrsOf(r) {
    try { const a = JSON.parse(r.attrs || '{}'); return a && typeof a === 'object' ? a : {}; } catch { return {}; }
  }

  function cardFromRow(r) {
    return {
      subcategory: r.subcategory || '',
      summary: taxonomy.summaryOf(r.subcategory, attrsOf(r)),
      metro: r.metro || '',
      hasVideo: !!r.video,
      id: r.id,
      title: r.title,
      price: r.price,
      priceUnit: r.price_unit,
      city: r.city,
      category: r.category,
      delivery: !!r.delivery,
      exchange: !!r.exchange,
      status: r.status,
      photo: photoUrl(r.photo),
      createdAt: r.created_at,
      isFav: !!r.is_fav,
      priceWas: priceWasOf(r),
      goodPrice: r.status === 'active' && r.good_price > 0, // 1.48.0
      boost: h.boost ? h.boost.cardExtra(r) : null, // XL, рамка, метки (lib/boost.js)
      seller: sellerOfCard(r) // 1.26: продавец в карточке — имя, фото, оценка
    };
  }

  // Продавец в карточке: имя (у проверенного бизнеса — название), фото и уровень репутации (1.46.0, вместо оценки).
  function sellerOfCard(r) {
    if (!r.seller_id) return null;
    const name = r.seller_biz_status === 'verified' && r.seller_biz_name ? r.seller_biz_name : r.seller_name;
    const shop = !!(r.seller_plan && r.seller_plan_until > now()); // 1.32: тариф «Магазин»/«Про» — значок магазина в карточке
    return { id: r.seller_id, name: name || 'Продавец', avatar: photoUrl(r.seller_avatar), level: r.seller_level || 0, shop };
  }

  // Сколько объявлений подходит под условие выдачи — из памяти, пока объявления не менялись (db.memo в lib/db.js).
  const countListings = (whereSql, params) => db.memo(`count|${whereSql}|${JSON.stringify(params)}`,
    () => db.prepare(`SELECT COUNT(*) AS n FROM listings l JOIN users u ON u.id = l.user_id WHERE ${whereSql}`).get(...params).n);

  const CARD_SELECT = `
    SELECT l.id, l.title, l.price, l.price_unit, l.city, l.category, l.delivery, l.exchange, l.status, l.created_at, l.price_was, l.price_drop_at,
      l.subcategory, l.attrs, l.metro, l.video, l.good_price,
      (SELECT COALESCE(NULLIF(p.thumb, ''), p.file) FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
      EXISTS(SELECT 1 FROM favorites f WHERE f.listing_id = l.id AND f.user_id = ?) AS is_fav,
      (SELECT json_object('xl', MAX(b.xl), 'frame', MAX(b.frame)) FROM boosts b WHERE b.listing_id = l.id AND b.status = 'active') AS boost,
      (SELECT b.tags FROM boosts b WHERE b.listing_id = l.id AND b.status = 'active' AND b.tags != '[]' ORDER BY b.id DESC LIMIT 1) AS boost_tags,
      u.id AS seller_id, u.name AS seller_name, u.avatar AS seller_avatar, u.biz_status AS seller_biz_status, u.biz_name AS seller_biz_name, u.plan AS seller_plan, u.plan_until AS seller_plan_until,
      u.rep_level AS seller_level
    FROM listings l JOIN users u ON u.id = l.user_id`;

  // Словарь для исправления опечаток (lib/search.js correctQuery): слова опубликованных объявлений, раз в 10 минут.
  let vocab = { at: 0, map: new Map() };
  function searchVocab() {
    if (vocab.at > now() - 10 * 60 * 1000) return vocab.map;
    const map = new Map();
    for (const { t } of db.prepare('SELECT search_text AS t FROM listings WHERE status = \'active\'').iterate()) {
      for (const w of new Set(t.split(/[^a-zа-я0-9]+/))) if (w.length >= 3 && w.length <= 30 && !/\d/.test(w)) map.set(w, (map.get(w) || 0) + 1);
    }
    vocab = { at: now(), map };
    return map;
  }

  route('GET', '/api/listings', (ctx) => {
    const r = findListings(ctx.query, ctx.user ? ctx.user.id : 0);
    // 1.43.0: ничего не нашлось — пробуем исправить опечатки («айфн» → «айфон»); exact=1 — искать как написано.
    const qText = ctx.query.get('q') || '';
    if (!r.total && qText && ctx.query.get('exact') !== '1') { // и для следующих страниц — исправление то же
      const fixed = correctQuery(qText, searchVocab());
      if (fixed) {
        const q2 = new URLSearchParams(ctx.query); q2.set('q', fixed);
        const r2 = findListings(q2, ctx.user ? ctx.user.id : 0);
        if (r2.total) return { ...r2, corrected: fixed };
      }
    }
    return r;
  });
  function findListings(q, uid) {
    const spec = searchSpec(Object.fromEntries(q.entries()), CATEGORY_IDS);
    const { parsed } = spec;
    const base = ['l.status = \'active\'', 'u.is_blocked = 0'];
    // 1.48.0: объявления тех, кого человек заблокировал, ему не показываем.
    const hidden = h.blocks.hiddenFor(uid);
    if (hidden.length) base.push(`l.user_id NOT IN (${hidden.map(Number).join(',')})`);
    const f = specSql(spec);
    const sort = q.get('sort');
    // С фильтром цены «договорных» (NULL) в выдаче нет — сортируем прямо по индексу цены.
    const nulls = Number.isFinite(spec.min) || Number.isFinite(spec.max) ? '' : 'l.price IS NULL, ';
    const order = sort === 'cheap' ? `${nulls}l.price ASC, l.id DESC`
      : sort === 'expensive' ? `${nulls}l.price DESC, l.id DESC`
        : 'l.created_at DESC, l.id DESC';
    const limit = Math.min(Math.max(parseInt(q.get('limit') || '24', 10) || 24, 1), 60);
    const offset = Math.max(parseInt(q.get('offset') || '0', 10) || 0, 0);
    const total = countListings([...base, ...f.where].join(' AND '), f.args);
    // Подходящих тысячи — страницу быстрее найти просмотром по дате, чем через индекс слов (lib/search.js specSql).
    const g = total > 2000 && spec.words.length ? specSql(spec, { fts: false }) : f;
    const rows = db.prepare(`${CARD_SELECT} WHERE ${[...base, ...g.where].join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).all(uid, ...g.args, limit, offset);
    return {
      items: rows.map(cardFromRow),
      total,
      understood: { city: parsed.city, min: parsed.min, max: parsed.max, delivery: parsed.delivery }
    };
  }

  // Объявления на карте: те же фильтры, что в поиске. Точка — станция метро или центр города,
  // точный адрес не показываем никогда (его продавец сообщает в чате).
  route('GET', '/api/listings/map', (ctx) => {
    const spec = searchSpec(Object.fromEntries(ctx.query.entries()), CATEGORY_IDS);
    const f = specSql(spec);
    const whereSql = ['l.status = \'active\'', 'u.is_blocked = 0', ...f.where].join(' AND ');
    const total = countListings(whereSql, f.args);
    const rows = db.prepare(`SELECT l.id, l.title, l.price, l.price_unit, l.city, l.metro,
        (SELECT COALESCE(NULLIF(p.thumb, ''), p.file) FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo
      FROM listings l JOIN users u ON u.id = l.user_id WHERE ${whereSql} ORDER BY l.created_at DESC, l.id DESC LIMIT 1000`).all(...f.args);
    const items = [];
    for (const r of rows) {
      const st = r.metro ? metro.geo(r.city, r.metro) : null;
      const at = st || cityCenter(r.city);
      if (!at) continue;
      items.push({ id: r.id, lat: at.lat, lng: at.lng, title: r.title, price: r.price, priceUnit: r.price_unit, photo: photoUrl(r.photo), place: st ? `м. ${r.metro}` : r.city });
    }
    return { items, total, shown: rows.length };
  });

  route('GET', '/api/favorites', (ctx) => {
    const u = requireUser(ctx);
    h.alerts.seenPrices(u.id);
    const rows = db.prepare(`${CARD_SELECT} JOIN favorites fv ON fv.listing_id = l.id AND fv.user_id = ?
      WHERE l.status IN ('active', 'sold') AND u.is_blocked = 0 ORDER BY fv.created_at DESC`).all(u.id, u.id);
    return { items: rows.map(cardFromRow) };
  });

  route('POST', '/api/favorites/:id', (ctx) => {
    const u = requireUser(ctx);
    const id = parseInt(ctx.params.id, 10);
    if (!h.loadListing(id)) throw new HttpError(404, 'Объявление не найдено');
    const exists = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?').get(u.id, id);
    if (exists) db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run(u.id, id);
    else {
      db.prepare('INSERT INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, ?)').run(u.id, id, now());
      h.stats.countFav(ctx, h.loadListing(id));
    }
    return { fav: !exists, favCount: db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE listing_id = ?').get(id).n };
  });

  return { CARD_SELECT, cardFromRow, attrsOf, priceWasOf, countListings, findListings };
};

'use strict';
// Объявление: проверка полей, создание и правка (всегда — на проверку модератору), публикация на 30 дней,
// страница объявления с похожими и оценкой цены, VIN, апелляция, «Мои объявления».
const { norm, parseQuery, brandAliases } = require('./search');
const { CATEGORY_IDS, PRICE_UNITS, CONDITIONS } = require('./constants');
const { checkProhibited, blockedOf } = require('./prohibited');

module.exports = function listings({ route, db, h, cards, uploads, ttl: LISTING_TTL }) {
  const { HttpError, requireUser, readJson, rateLimit, now, str, taxonomy, metro, video, photoUrl } = h;
  const { CARD_SELECT, cardFromRow, attrsOf, priceWasOf } = cards;
  const { removeUploadFiles } = uploads;
  const DAY = 24 * 3600 * 1000;
  const GP_LOW = 0.85; // ниже 85% от рынка — «ниже рынка»

  // Текст для поиска: название, описание, подкатегория и характеристики из списков («Toyota», «Автомат»).
  function searchText(title, description, v = {}) {
    const sub = taxonomy.SUB[v.subcategory];
    const extra = sub ? [sub.name, ...sub.fields.filter((f) => (f.type === 'select' || f.type === 'text') && v.attrs && v.attrs[f.key]).map((f) => v.attrs[f.key])] : [];
    const text = `${title} ${description} ${extra.join(' ')}`;
    return norm(`${text} ${brandAliases(text)}`);
  }

  function median(nums) {
    const a = [...nums].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  }

  // Оценка цены по похожим активным объявлениям той же категории.
  function marketEstimate({ id = 0, category, title, priceUnit }) {
    const words = parseQuery(title).words.filter((w) => w.length >= 3).slice(0, 2);
    if (!words.length) return null;
    const where = ['status = \'active\'', 'category = ?', 'price IS NOT NULL', 'price > 0', 'id != ?', 'price_unit = ?'];
    const params = [category, id, priceUnit || ''];
    for (const w of words) { where.push('search_text LIKE ?'); params.push(`%${w}%`); }
    const rows = db.prepare(`SELECT price FROM listings WHERE ${where.join(' AND ')} LIMIT 200`).all(...params);
    if (rows.length < 3) return null;
    return { median: median(rows.map((r) => r.price)), count: rows.length };
  }

  // Главные характеристики раздела обязательны (1.22).
  function validateListing(body) {
    let title = str(body.title, 80);
    const description = str(body.description, 4000);
    const category = str(body.category, 40);
    const city = str(body.city, 60);
    const priceUnit = PRICE_UNITS.includes(body.priceUnit) ? body.priceUnit : '';
    const condition = CONDITIONS.includes(body.condition) ? body.condition : '';
    const delivery = body.delivery ? 1 : 0;
    let price = null;
    if (body.price !== null && body.price !== undefined && String(body.price).trim() !== '') {
      price = parseInt(String(body.price).replace(/\s/g, ''), 10);
      if (!Number.isFinite(price) || price < 0 || price > 10_000_000_000) throw new HttpError(400, 'Проверьте цену');
    }
    if (!CATEGORY_IDS.has(category)) throw new HttpError(400, 'Выберите категорию');
    if (city.length < 2) throw new HttpError(400, 'Укажите город');
    const photos = Array.isArray(body.photos) ? body.photos.slice(0, 10).map(String) : [];
    // Подкатегория — из списка своей категории; характеристики — только её поля.
    const subcategory = taxonomy.SUB[body.subcategory] && taxonomy.SUB[body.subcategory].category === category ? body.subcategory : '';
    let attrs = {};
    try { attrs = taxonomy.cleanAttrs(subcategory, body.attrs, { strict: true }); } catch (e) { throw new HttpError(400, e.message); }
    // 1.48.0: у машин, квартир, телефонов… название собираем из характеристик.
    if (taxonomy.TITLE_SUBS.has(subcategory)) { const r = taxonomy.retitle(subcategory, attrs, title); if (r) { title = r.title; attrs = r.attrs; } }
    if (title.length < 3) throw new HttpError(400, 'Название слишком короткое');
    // 1.48.0: VIN или номер кузова — только у машин; на странице объявления виден частично, целиком — по нажатию.
    let vin;
    if (body.vin !== undefined) {
      vin = taxonomy.vinNorm(body.vin);
      if (subcategory !== 'cars') vin = '';
      if (vin && !taxonomy.vinOk(vin)) throw new HttpError(400, 'Проверьте VIN: 17 латинских букв и цифр (без I, O, Q) или номер кузова');
    }
    // Метро — только станция этого города из справочника; если справочника пока нет — сохраняем как есть.
    let station = str(body.metro, 60);
    if (station && metro.has(city) && !metro.isStation(city, station)) throw new HttpError(400, 'Выберите станцию метро из списка');
    if (station && !metro.has(city) && metro.cities().length) station = '';
    const district = str(body.district, 60);
    // video: undefined — не менять, '' — убрать, имя файла — новое видео.
    const video = body.video === undefined ? undefined : str(body.video, 60);
    // Торг и обмен: undefined — не менять.
    const bargain = body.bargain === undefined ? undefined : body.bargain ? 1 : 0;
    const exchange = body.exchange === undefined ? undefined : body.exchange ? 1 : 0;
    // Публикация в выбранное время — не дальше чем через 30 дней; время в прошлом или «сразу» — null.
    let publishAt = null;
    if (body.publishAt) {
      publishAt = Number(body.publishAt);
      if (!Number.isFinite(publishAt)) throw new HttpError(400, 'Проверьте время публикации');
      if (publishAt <= now()) publishAt = null;
      else if (publishAt > now() + 31 * DAY) throw new HttpError(400, 'Отложить публикацию можно не больше чем на 30 дней');
    }
    // 1.48.2: алкоголь, табак и никотин, эротические товары — сразу нельзя.
    const banned = blockedOf(title, description);
    if (banned) throw new HttpError(400, `На Торгане нельзя продавать: ${banned.title.toLowerCase()} (в объявлении — «${banned.words[0]}»). Если мы ошиблись — напишите в поддержку, модератор проверит`);
    // Похоже на запрещённое — публикуем после проверки модератором.
    const flags = checkProhibited(title, description).map((f) => f.title).join(', ');
    return { title, description, category, city, priceUnit, condition, delivery, bargain, exchange, publishAt, price, photos, flags, subcategory, attrs, metro: station, district, video, vin };
  }
  // XTA2190••••••4567 — марка и модель видны, середина скрыта.
  const vinMask = (v) => { if (!v) return ''; const a = v.length >= 17 ? 4 : 2; const b = v.length >= 17 ? 4 : 3; return `${v.slice(0, a)}${'•'.repeat(Math.max(3, v.length - a - b))}${v.slice(-b)}`; };

  function attachPhotos(userId, listingId, files) {
    const owned = db.prepare('SELECT file, listing_id FROM uploads WHERE file = ? AND user_id = ?');
    const isAvatar = db.prepare('SELECT 1 FROM users WHERE avatar = ?');
    const valid = files.filter((f) => {
      const row = owned.get(f, userId);
      return row && (row.listing_id === null || row.listing_id === listingId) && !isAvatar.get(f);
    });
    const gone = db.prepare('SELECT file, thumb FROM uploads WHERE listing_id = ?').all(listingId).filter((r) => !valid.includes(r.file));
    for (const r of gone) db.prepare('DELETE FROM uploads WHERE file = ?').run(r.file);
    removeUploadFiles(gone);
    const upd = db.prepare('UPDATE uploads SET listing_id = ?, position = ? WHERE file = ?');
    valid.forEach((f, i) => upd.run(listingId, i, f));
  }

  // 1.42.0: удалённое объявление остаётся в базе со статусом deleted — переписки покупателей по нему сохраняются,
  // в чате пометка «Объявление удалено». Для всего остального его нет: loadListing его не отдаёт, чаты и модерация
  // берут его с { deleted: true }.
  function loadListing(id, { deleted = false } = {}) {
    const l = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
    return l && (deleted || l.status !== 'deleted') ? l : null;
  }
  // Удалить объявление: пропадает с сайта, запись остаётся для переписок. wipe — при удалении профиля навсегда:
  // фото, видео, описание и характеристики стираются, остаются название и цена — их видят собеседники в чатах.
  function removeListing(id, { wipe = false } = {}) {
    if (wipe) {
      removeUploadFiles(db.prepare('SELECT file, thumb FROM uploads WHERE listing_id = ?').all(id));
      const v = db.prepare('SELECT video FROM listings WHERE id = ?').get(id);
      if (v && v.video) video.remove(v.video);
      db.prepare('DELETE FROM uploads WHERE listing_id = ?').run(id);
      db.prepare('UPDATE listings SET description = \'\', attrs = \'{}\', video = \'\', search_text = \'\' WHERE id = ?').run(id);
    }
    db.prepare('UPDATE listings SET status = \'deleted\', updated_at = ? WHERE id = ?').run(now(), id);
  }

  route('GET', '/api/listings/:id', (ctx) => {
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id, { deleted: true });
    const isAdmin = ctx.user && ctx.user.is_admin;
    if (!l || (l.status === 'deleted' && !isAdmin)) throw new HttpError(404, l ? 'Объявление удалено' : 'Объявление не найдено');
    const seller = db.prepare('SELECT * FROM users WHERE id = ?').get(l.user_id);
    const isOwner = ctx.user && ctx.user.id === l.user_id;
    if ((l.status !== 'active' && l.status !== 'sold') || seller.is_blocked || seller.deactivated_at || seller.deleted_at) {
      if (!isOwner && !isAdmin) throw new HttpError(404, 'Объявление снято с публикации');
    }
    const photos = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(id).map((r) => photoUrl(r.file));
    const sellerActive = db.prepare('SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = \'active\'').get(l.user_id).n;
    const isFav = ctx.user ? !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?').get(ctx.user.id, id) : false;
    const favCount = db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE listing_id = ?').get(id).n;
    const uid = ctx.user ? ctx.user.id : 0;
    // Похожие: сначала свежие из той же подкатегории, недостающие — из категории (оба запроса идут по индексу с датой).
    const hiddenU = h.blocks.hiddenFor(uid).map(Number); // 1.48.0: заблокированных — не в «Похожих»
    const similarIn = (col, val, not) => db.prepare(`${CARD_SELECT} WHERE l.${col} = ? AND l.status = 'active' AND u.is_blocked = 0 AND l.id != ?${hiddenU.length ? ` AND l.user_id NOT IN (${hiddenU.join(',')})` : ''}
      ${not.length ? `AND l.id NOT IN (${not.map(() => '?').join(',')})` : ''} ORDER BY l.created_at DESC LIMIT ?`).all(uid, val, id, ...not, 4 - not.length);
    const sameSub = l.subcategory ? similarIn('subcategory', l.subcategory, []) : [];
    const similar = [...sameSub, ...(sameSub.length < 4 ? similarIn('category', l.category, sameSub.map((r) => r.id)) : [])].map(cardFromRow);
    const attrs = attrsOf(l);
    const station = l.metro ? (({ name, line, color }) => ({ name, line, color }))(metro.stations(l.city).find((s) => s.name === l.metro) || { name: l.metro, line: '', color: '' }) : null;
    let market = null;
    // 1.48.0: где можно сравнить по характеристикам (машины, телефоны, квартиры…) — по ним; иначе — по словам названия.
    const gp = l.status === 'active' || isOwner || isAdmin ? h.goodPrice.estimate(l) : null;
    if (gp) market = { median: gp.median, count: gp.count, pct: gp.pct, perM2: gp.perM2, basis: gp.basis, level: gp.good ? 'good' : gp.ratio < GP_LOW ? 'below' : gp.ratio > 1.15 ? 'above' : 'market' };
    else if (l.price) {
      const est = marketEstimate({ id, category: l.category, title: l.title, priceUnit: l.price_unit });
      if (est) {
        const ratio = l.price / est.median;
        market = { median: est.median, count: est.count, level: ratio < 0.85 ? 'below' : ratio > 1.15 ? 'above' : 'market' };
      }
    }
    return {
      listing: {
        id: l.id, title: l.title, description: l.description, category: l.category, price: l.price, priceUnit: l.price_unit, priceWas: priceWasOf(l),
        city: l.city, condition: l.condition, delivery: !!l.delivery, bargain: !!l.bargain, exchange: !!l.exchange, status: l.status, views: l.views, favCount,
        publishAt: (isOwner || isAdmin) ? l.publish_at : null, expiresAt: (isOwner || isAdmin) ? l.expires_at : null,
        subcategory: l.subcategory, attrs, specs: taxonomy.describe(l.subcategory, attrs), metro: station, district: l.district, video: video.url(l.video),
        createdAt: l.created_at, updatedAt: l.updated_at, photos, isFav, isOwner: !!isOwner,
        rejectReason: (isOwner || isAdmin) ? l.reject_reason : '', appealText: (isOwner || isAdmin) ? l.appeal_text : '',
        appealReply: (isOwner || isAdmin) ? l.appeal_reply : '', flags: (isOwner || isAdmin) ? l.flags : '',
        vin: (isOwner || isAdmin) ? l.vin || '' : '', vinMasked: l.subcategory === 'cars' ? vinMask(l.vin || '') : ''
      },
      seller: { id: seller.id, name: seller.name, city: seller.city, avatar: photoUrl(seller.avatar), createdAt: seller.created_at, activeCount: sellerActive, rep: h.reputation.repOf(seller.id), badges: h.badgesOf(seller),
        followers: h.deals.followers(seller.id), following: h.deals.isFollowing(ctx.user ? ctx.user.id : 0, seller.id), reply: h.replyStats(seller.id) },
      similar,
      market,
      promo: isOwner ? h.promo.currentOf(id) : null,
      boost: isOwner ? h.boost.ownerView(id) : null,
      review: isOwner && l.status === 'pending' ? h.adminApi.reviewEta(l) : null // 1.54.0: сколько ждать проверки
    };
  });

  // 1.48.0: VIN целиком — по нажатию «Показать», только вошедшим (так его не соберут роботы).
  route('GET', '/api/listings/:id/vin', (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`vin:${u.id}`, 60, 60 * 60 * 1000);
    const l = loadListing(parseInt(ctx.params.id, 10));
    if (!l || !l.vin || l.subcategory !== 'cars' || (l.status !== 'active' && l.status !== 'sold' && l.user_id !== u.id && !u.is_admin)) throw new HttpError(404, 'VIN не указан');
    return { vin: l.vin };
  });

  // Новое объявление и правка. Все объявления публикуются после проверки модератором; любая правка — снова на проверку.
  function createListing(u, v) {
    const t = now();
    const info = db.prepare(`INSERT INTO listings (user_id, title, description, category, price, price_unit, city, condition, delivery, bargain, exchange, publish_at, search_text, city_lc, status, flags,
      subcategory, attrs, metro, district, vin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(u.id, v.title, v.description, v.category, v.price, v.priceUnit, v.city, v.condition, v.delivery, v.bargain ?? 1, v.exchange ?? 0, v.publishAt || null, searchText(v.title, v.description, v), norm(v.city), v.flags,
        v.subcategory || '', JSON.stringify(v.attrs || {}), v.metro || '', v.district || '', v.vin || '', t, t);
    const id = Number(info.lastInsertRowid);
    attachPhotos(u.id, id, v.photos);
    if (v.video) video.attach(u.id, id, v.video);
    if (!u.city) db.prepare('UPDATE users SET city = ? WHERE id = ?').run(v.city, u.id);
    h.logEvent(id, u.id, 'created', { flags: v.flags });
    h.autoChecks.run(id);
    // 1.53.0: первое объявление человека — push «Новый продавец» (у кого он включён — вместо обычного «на проверку»).
    const firstTime = db.prepare('SELECT COUNT(*) AS n FROM listings WHERE user_id = ?').get(u.id).n === 1;
    h.alerts.notifyAdmins('pending', { title: 'Новое объявление на проверку', body: `«${v.title}» — ${u.name}. В очереди: ${h.alerts.pendingCount()}`, url: `/admin/l/${id}` }, u.id, { unless: firstTime ? 'sellers' : '' });
    if (firstTime) {
      const she = h.first.formOf(u) === 'f';
      h.alerts.notifyAdmins('sellers', { title: 'Новый продавец', url: `/admin/l/${id}`,
        body: `${u.name} ${she ? 'отправила' : 'отправил'} первое объявление «${v.title}».${h.first.canGet(u) ? ` После одобрения — медаль «${h.first.name(u)}».` : ''} В очереди: ${h.alerts.pendingCount()}` }, u.id);
    }
    return id;
  }

  // В историю пишем, что именно изменилось.
  function updateListing(u, l, v) {
    const before = { title: l.title, description: l.description, category: l.category, price: l.price, priceUnit: l.price_unit, city: l.city, condition: l.condition, delivery: !!l.delivery,
      bargain: !!l.bargain, exchange: !!l.exchange, subcategory: l.subcategory, attrs: JSON.stringify(attrsOf(l)), metro: l.metro, district: l.district, vin: l.vin || '' };
    const after = { title: v.title, description: v.description, category: v.category, price: v.price, priceUnit: v.priceUnit, city: v.city, condition: v.condition, delivery: !!v.delivery,
      bargain: v.bargain === undefined ? before.bargain : !!v.bargain, exchange: v.exchange === undefined ? before.exchange : !!v.exchange,
      subcategory: v.subcategory === undefined ? l.subcategory : v.subcategory, attrs: v.attrs === undefined ? before.attrs : JSON.stringify(v.attrs),
      metro: v.metro === undefined ? l.metro : v.metro, district: v.district === undefined ? l.district : v.district,
      vin: v.vin === undefined ? (v.subcategory === 'cars' || v.subcategory === undefined ? l.vin || '' : '') : v.vin };
    const changes = Object.fromEntries(Object.keys(before).filter((k) => before[k] !== after[k]).map((k) => [k, [before[k], after[k]]]));
    const oldPhotos = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(l.id).map((r) => r.file);
    const extra = { subcategory: after.subcategory, attrs: JSON.parse(after.attrs) };
    // Время публикации выбирают только до первой публикации (alerted = 0); потом правка просто уходит на проверку.
    db.prepare(`UPDATE listings SET title = ?, description = ?, category = ?, price = ?, price_unit = ?, city = ?, condition = ?, delivery = ?, bargain = ?, exchange = ?, publish_at = ?,
      search_text = ?, city_lc = ?, status = 'pending', flags = ?, subcategory = ?, attrs = ?, metro = ?, district = ?, vin = ?, updated_at = ? WHERE id = ?`)
      .run(v.title, v.description, v.category, v.price, v.priceUnit, v.city, v.condition, v.delivery, after.bargain ? 1 : 0, after.exchange ? 1 : 0, l.alerted ? null : v.publishAt || null,
        searchText(v.title, v.description, extra), norm(v.city), v.flags || (l.status === 'pending' ? l.flags : ''), after.subcategory, after.attrs, after.metro, after.district, after.vin, now(), l.id);
    attachPhotos(u.id, l.id, v.photos);
    if (v.video !== undefined && v.video !== l.video) { video.attach(u.id, l.id, v.video); changes.video = [l.video ? 'было' : 'не было', v.video ? 'новое' : 'убрано']; }
    const newPhotos = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(l.id).map((r) => r.file);
    if (oldPhotos.join() !== newPhotos.join()) changes.photos = [oldPhotos.length, newPhotos.length];
    h.logEvent(l.id, u.id, 'edited', { changes, flags: v.flags, from: l.status });
    h.autoChecks.run(l.id);
    h.alerts.notifyAdmins('pending', { title: 'Объявление изменено — на проверку', body: `«${v.title}» — ${u.name}. В очереди: ${h.alerts.pendingCount()}`, url: `/admin/l/${l.id}` }, u.id);
  }

  // Публикация. Объявление висит LISTING_TTL (30 дней) бесплатно, потом снимается — опубликовать снова можно в один клик, тоже бесплатно.
  // Если срок уже кончился (или fresh — отложенная публикация), объявление публикуется как новое: дата «сейчас», наверху выдачи по дате.
  // Правка опубликованного объявления срок не продлевает.
  function publishListing(id, fresh = false) {
    const t = now();
    db.prepare(`UPDATE listings SET status = 'active', publish_at = NULL,
      created_at = CASE WHEN ? OR (expires_at IS NOT NULL AND expires_at <= ?) THEN ? ELSE created_at END,
      expires_at = CASE WHEN ? OR expires_at IS NULL OR expires_at <= ? THEN ? ELSE expires_at END, updated_at = ? WHERE id = ?`)
      .run(fresh ? 1 : 0, t, t, fresh ? 1 : 0, t, t + LISTING_TTL, t, id);
    h.alerts.onPublished(id); // подписчики продавца, снижение цены
    if (h.boost) h.boost.onPublished(id); // оплаченное продвижение начинается с публикации
    h.first.onPublished(id); // первым 1000 продавцам — медаль с номером (lib/h.first.js)
  }

  // Раз в минуту: публикуем запланированные и снимаем те, у кого прошло 30 дней.
  // Не снимаем объявления с идущей рекламой — она оплачена на свой срок.
  function listingTick() {
    const t = now();
    for (const { id } of db.prepare('SELECT id FROM listings WHERE status = \'scheduled\' AND publish_at <= ?').all(t)) {
      publishListing(id, true);
      h.logEvent(id, null, 'published', { scheduled: true });
      h.alerts.moderation(id, 'approved');
    }
    // 1.47.2: за 3 дня до снятия — push и колокольчик «объявление скоро снимется» (один раз на срок).
    const soon = db.prepare(`SELECT id, user_id, title, expires_at FROM listings WHERE status = 'active' AND expires_at > ? AND expires_at <= ?
      AND (expire_warned_for IS NULL OR expire_warned_for != expires_at)
      AND id NOT IN (SELECT listing_id FROM promotions WHERE status = 'active' AND listing_id IS NOT NULL)
      AND id NOT IN (SELECT listing_id FROM boosts WHERE status = 'active' AND listing_id IS NOT NULL) LIMIT 500`).all(t, t + 3 * 24 * 3600 * 1000);
    for (const l of soon) {
      db.prepare('UPDATE listings SET expire_warned_for = ? WHERE id = ?').run(l.expires_at, l.id);
      const day = new Date(l.expires_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
      h.alerts.notify(l.user_id, 'moderation', { title: 'Объявление скоро снимется', body: `«${l.title}» — ${day}. Потом его можно опубликовать снова, бесплатно`, url: `/l/${l.id}`, icon: 'clock', tone: 'wait', tag: `soon-${l.id}` });
    }
    const expired = db.prepare(`SELECT id FROM listings WHERE status = 'active' AND expires_at <= ?
      AND id NOT IN (SELECT listing_id FROM promotions WHERE status = 'active' AND listing_id IS NOT NULL)
      AND id NOT IN (SELECT listing_id FROM boosts WHERE status = 'active' AND listing_id IS NOT NULL)`).all(t);
    for (const { id } of expired) {
      db.prepare('UPDATE listings SET status = \'archived\', updated_at = ? WHERE id = ?').run(t, id);
      h.logEvent(id, null, 'expired', {});
      h.alerts.moderation(id, 'expired');
    }
  }

  route('POST', '/api/listings', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`create:${u.id}`, 30, 60 * 60 * 1000);
    const v = validateListing(await readJson(ctx.req));
    video.check(u.id, v.video);
    const id = createListing(u, v);
    return { id, status: 'pending' };
  });

  route('PATCH', '/api/listings/:id', async (ctx) => {
    const u = requireUser(ctx);
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id);
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    const body = await readJson(ctx.req);
    if (body.status !== undefined && Object.keys(body).length === 1) {
      if (!['active', 'sold', 'archived'].includes(body.status)) throw new HttpError(400, 'Неверный статус');
      if (l.status === 'rejected') throw new HttpError(400, 'Объявление отклонено модерацией — исправьте его или подайте апелляцию');
      if (l.status === 'pending') throw new HttpError(400, 'Объявление на проверке у модератора');
      // «Опубликовать снова» (и «Опубликовать сейчас» для запланированного) — бесплатно; после 30 дней — как новое.
      if (body.status === 'active' && l.status !== 'active') publishListing(id, l.status === 'scheduled');
      else db.prepare('UPDATE listings SET status = ?, publish_at = NULL, updated_at = ? WHERE id = ?').run(body.status, now(), id);
      h.logEvent(id, u.id, 'status', { status: body.status });
      const r = db.prepare('SELECT status, expires_at FROM listings WHERE id = ?').get(id);
      return { ok: true, status: r.status, expiresAt: r.expires_at };
    }
    const v = validateListing(body);
    if (v.video && v.video !== l.video) video.check(u.id, v.video);
    updateListing(u, l, v);
    return { ok: true, status: 'pending' };
  });

  route('DELETE', '/api/listings/:id', (ctx) => {
    const u = requireUser(ctx);
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id);
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    removeListing(id);
    h.logEvent(id, u.id, 'status', { status: 'deleted' });
    return { ok: true };
  });

  route('POST', '/api/listings/:id/appeal', async (ctx) => {
    const u = requireUser(ctx);
    const id = parseInt(ctx.params.id, 10);
    const l = loadListing(id);
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    if (l.status !== 'rejected') throw new HttpError(400, 'Апелляция нужна только для отклонённых объявлений');
    const text = str((await readJson(ctx.req)).text, 1000);
    if (text.length < 10) throw new HttpError(400, 'Опишите, почему решение стоит пересмотреть');
    if (l.appeal_reply) throw new HttpError(400, 'Апелляция уже рассмотрена. Исправьте объявление — после сохранения оно снова появится в поиске.');
    db.prepare('UPDATE listings SET appeal_text = ?, appeal_at = ? WHERE id = ?').run(text, now(), id);
    h.logEvent(id, u.id, 'appeal', { text });
    h.alerts.notifyAdmins('appeals', { title: 'Апелляция', body: `«${l.title}» — ${u.name}: ${text.slice(0, 140)}`, url: `/admin/l/${id}` }, u.id); // 1.53.0
    return { ok: true };
  });

  route('GET', '/api/my/listings', (ctx) => {
    const u = requireUser(ctx);
    const rows = db.prepare(`
      SELECT l.*, (SELECT COALESCE(NULLIF(p.thumb, ''), p.file) FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
        (SELECT COUNT(*) FROM favorites f WHERE f.listing_id = l.id) AS fav_count
      FROM listings l WHERE l.user_id = ? AND l.status != 'deleted' ORDER BY l.created_at DESC`).all(u.id);
    return {
      items: rows.map((r) => ({
        ...cardFromRow(r), views: r.views, favCount: r.fav_count, rejectReason: r.reject_reason, publishAt: r.publish_at, expiresAt: r.expires_at,
        appealText: r.appeal_text, appealAt: r.appeal_at, appealReply: r.appeal_reply, flags: r.flags, promo: h.promo.currentOf(r.id), boost: h.boost.ownerView(r.id),
        review: r.status === 'pending' ? h.adminApi.reviewEta(r) : null
      }))
    };
  });

  // 1.60.1: название из характеристик для превью в приложении (у машин, квартир, телефонов…) — тот же autoTitle, что при сохранении.
  route('POST', '/api/listings/title', async (ctx) => {
    const b = await readJson(ctx.req);
    const sub = String(b.subcategory || '');
    if (!taxonomy.TITLE_SUBS.has(sub)) return { title: '' };
    let attrs = {};
    try { attrs = taxonomy.cleanAttrs(sub, b.attrs); } catch { return { title: '' }; }
    return { title: taxonomy.autoTitle(sub, attrs).slice(0, 80) };
  });

  route('GET', '/api/price-hint', (ctx) => {
    const category = ctx.query.get('category') || '';
    const title = ctx.query.get('title') || '';
    if (!CATEGORY_IDS.has(category) || title.length < 3) return { hint: null };
    const est = marketEstimate({ category, title, priceUnit: ctx.query.get('unit') || '' });
    return { hint: est ? est.median : null, count: est ? est.count : 0 };
  });

  return { loadListing, removeListing, marketEstimate, searchText, validateListing, createListing, updateListing, publishListing, listingTick };
};

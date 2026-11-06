'use strict';

// Торгана — площадка объявлений. Сервер без внешних зависимостей: Node.js 22+ и встроенная SQLite.
try { process.loadEnvFile(); } catch { /* .env не обязателен */ }

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { openDb } = require('./lib/db');
const { HttpError, sendJson, readJson, parseCookies, rateLimit } = require('./lib/http');
const auth = require('./lib/auth');
const { CATEGORIES, CATEGORY_IDS, CITIES, PRICE_UNITS, CONDITIONS } = require('./lib/constants');
const { norm, parseQuery } = require('./lib/search');
const { suggestFromPhoto } = require('./lib/ai');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const UPLOAD_DIR = path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const SECURE_COOKIES = PUBLIC_URL.startsWith('https://');
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const PAYMENTS_ENABLED = false; // Безопасная сделка включится после подключения платёжной системы.

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'torgana.db'));

// ---------- помощники ----------

const now = () => Date.now();
const str = (v, max) => String(v ?? '').trim().slice(0, max);

function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Нужно войти в аккаунт');
  if (ctx.user.is_blocked) throw new HttpError(403, 'Аккаунт заблокирован. Напишите в поддержку.');
  return ctx.user;
}

function requireAdmin(ctx) {
  const u = requireUser(ctx);
  if (!u.is_admin) throw new HttpError(403, 'Нет доступа');
  return u;
}

function publicUser(u) {
  return u ? { id: u.id, name: u.name, email: u.email, city: u.city, phone: u.phone, isAdmin: !!u.is_admin, createdAt: u.created_at } : null;
}

const photoUrl = (file) => (file ? `/uploads/${file}` : null);

function cardFromRow(r) {
  return {
    id: r.id,
    title: r.title,
    price: r.price,
    priceUnit: r.price_unit,
    city: r.city,
    category: r.category,
    delivery: !!r.delivery,
    status: r.status,
    photo: photoUrl(r.photo),
    createdAt: r.created_at,
    isFav: !!r.is_fav
  };
}

const CARD_SELECT = `
  SELECT l.id, l.title, l.price, l.price_unit, l.city, l.category, l.delivery, l.status, l.created_at,
    (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
    EXISTS(SELECT 1 FROM favorites f WHERE f.listing_id = l.id AND f.user_id = ?) AS is_fav
  FROM listings l JOIN users u ON u.id = l.user_id`;

function searchText(title, description) {
  return norm(`${title} ${description}`);
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

function validateListing(body) {
  const title = str(body.title, 80);
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
  if (title.length < 3) throw new HttpError(400, 'Название слишком короткое');
  if (!CATEGORY_IDS.has(category)) throw new HttpError(400, 'Выберите категорию');
  if (city.length < 2) throw new HttpError(400, 'Укажите город');
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 10).map(String) : [];
  return { title, description, category, city, priceUnit, condition, delivery, price, photos };
}

function attachPhotos(userId, listingId, files) {
  const owned = db.prepare('SELECT file, listing_id FROM uploads WHERE file = ? AND user_id = ?');
  const valid = files.filter((f) => {
    const row = owned.get(f, userId);
    return row && (row.listing_id === null || row.listing_id === listingId);
  });
  const current = db.prepare('SELECT file FROM uploads WHERE listing_id = ?').all(listingId).map((r) => r.file);
  for (const f of current) {
    if (!valid.includes(f)) {
      db.prepare('DELETE FROM uploads WHERE file = ?').run(f);
      fs.rm(path.join(UPLOAD_DIR, f), { force: true }, () => {});
    }
  }
  const upd = db.prepare('UPDATE uploads SET listing_id = ?, position = ? WHERE file = ?');
  valid.forEach((f, i) => upd.run(listingId, i, f));
}

function deleteListingFiles(listingId) {
  const files = db.prepare('SELECT file FROM uploads WHERE listing_id = ?').all(listingId);
  for (const { file } of files) fs.rm(path.join(UPLOAD_DIR, file), { force: true }, () => {});
}

function loadListing(id) {
  return db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
}

// ---------- обработчики API ----------

const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
}

route('GET', '/api/config', () => ({
  categories: CATEGORIES,
  cities: CITIES,
  priceUnits: PRICE_UNITS,
  ai: !!AI_KEY,
  payments: PAYMENTS_ENABLED,
  supportEmail: SUPPORT_EMAIL
}));

route('GET', '/api/me', (ctx) => {
  const unread = ctx.user ? unreadCount(ctx.user.id) : 0;
  return { user: publicUser(ctx.user), unread };
});

route('POST', '/api/auth/register', async (ctx) => {
  rateLimit(`reg:${ctx.ip}`, 10, 10 * 60 * 1000);
  const body = await readJson(ctx.req);
  const name = str(body.name, 60);
  const email = str(body.email, 120).toLowerCase();
  const password = String(body.password || '');
  if (name.length < 2) throw new HttpError(400, 'Укажите имя');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Проверьте email');
  if (password.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
  if (password.length > 200) throw new HttpError(400, 'Слишком длинный пароль');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Этот email уже зарегистрирован');
  const isAdmin = ADMIN_EMAILS.includes(email) ? 1 : 0;
  const info = db.prepare('INSERT INTO users (email, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(email, name, auth.hashPassword(password), isAdmin, now());
  const s = auth.createSession(db, Number(info.lastInsertRowid));
  ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
  return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)) };
});

route('POST', '/api/auth/login', async (ctx) => {
  rateLimit(`login:${ctx.ip}`, 15, 10 * 60 * 1000);
  const body = await readJson(ctx.req);
  const email = str(body.email, 120).toLowerCase();
  const password = String(body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !auth.verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Неверный email или пароль');
  if (ADMIN_EMAILS.includes(email) && !user.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    user.is_admin = 1;
  }
  const s = auth.createSession(db, user.id);
  ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
  return { user: publicUser(user) };
});

route('POST', '/api/auth/logout', (ctx) => {
  if (ctx.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(ctx.token);
  ctx.setCookie(auth.clearCookie(SECURE_COOKIES));
  return { ok: true };
});

route('PATCH', '/api/me', async (ctx) => {
  const u = requireUser(ctx);
  const body = await readJson(ctx.req);
  const name = body.name !== undefined ? str(body.name, 60) : u.name;
  const city = body.city !== undefined ? str(body.city, 60) : u.city;
  const phone = body.phone !== undefined ? str(body.phone, 30) : u.phone;
  if (name.length < 2) throw new HttpError(400, 'Укажите имя');
  db.prepare('UPDATE users SET name = ?, city = ?, phone = ? WHERE id = ?').run(name, city, phone, u.id);
  return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) };
});

route('GET', '/api/listings', (ctx) => {
  const q = ctx.query;
  const uid = ctx.user ? ctx.user.id : 0;
  const where = ['l.status = \'active\'', 'u.is_blocked = 0'];
  const params = [];
  const parsed = parseQuery(q.get('q') || '');
  for (const w of parsed.words) { where.push('l.search_text LIKE ?'); params.push(`%${w}%`); }
  const category = q.get('category');
  if (category && CATEGORY_IDS.has(category)) { where.push('l.category = ?'); params.push(category); }
  const city = q.get('city') || parsed.city;
  if (city) { where.push('l.city_lc = ?'); params.push(norm(city)); }
  const min = q.get('min') ? parseInt(q.get('min'), 10) : parsed.min;
  const max = q.get('max') ? parseInt(q.get('max'), 10) : parsed.max;
  if (Number.isFinite(min)) { where.push('l.price >= ?'); params.push(min); }
  if (Number.isFinite(max)) { where.push('l.price <= ?'); params.push(max); }
  if (q.get('delivery') === '1' || parsed.delivery) where.push('l.delivery = 1');
  const userId = parseInt(q.get('user') || '', 10);
  if (Number.isFinite(userId)) { where.push('l.user_id = ?'); params.push(userId); }
  const sort = q.get('sort');
  const order = sort === 'cheap' ? 'l.price IS NULL, l.price ASC, l.id DESC'
    : sort === 'expensive' ? 'l.price IS NULL, l.price DESC, l.id DESC'
      : 'l.created_at DESC, l.id DESC';
  const limit = Math.min(Math.max(parseInt(q.get('limit') || '24', 10) || 24, 1), 60);
  const offset = Math.max(parseInt(q.get('offset') || '0', 10) || 0, 0);
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM listings l JOIN users u ON u.id = l.user_id WHERE ${whereSql}`).get(...params).n;
  const rows = db.prepare(`${CARD_SELECT} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(uid, ...params, limit, offset);
  return {
    items: rows.map(cardFromRow),
    total,
    understood: { city: parsed.city, min: parsed.min, max: parsed.max, delivery: parsed.delivery }
  };
});

route('GET', '/api/listings/:id', (ctx) => {
  const id = parseInt(ctx.params.id, 10);
  const l = loadListing(id);
  if (!l) throw new HttpError(404, 'Объявление не найдено');
  const seller = db.prepare('SELECT id, name, city, created_at, is_blocked FROM users WHERE id = ?').get(l.user_id);
  const isOwner = ctx.user && ctx.user.id === l.user_id;
  const isAdmin = ctx.user && ctx.user.is_admin;
  if ((l.status !== 'active' && l.status !== 'sold') || seller.is_blocked) {
    if (!isOwner && !isAdmin) throw new HttpError(404, 'Объявление снято с публикации');
  }
  if (!isOwner) db.prepare('UPDATE listings SET views = views + 1 WHERE id = ?').run(id);
  const photos = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(id).map((r) => photoUrl(r.file));
  const sellerActive = db.prepare('SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = \'active\'').get(l.user_id).n;
  const isFav = ctx.user ? !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?').get(ctx.user.id, id) : false;
  const uid = ctx.user ? ctx.user.id : 0;
  const similar = db.prepare(`${CARD_SELECT} WHERE l.status = 'active' AND u.is_blocked = 0 AND l.category = ? AND l.id != ? ORDER BY l.created_at DESC LIMIT 4`)
    .all(uid, l.category, id).map(cardFromRow);
  let market = null;
  if (l.price) {
    const est = marketEstimate({ id, category: l.category, title: l.title, priceUnit: l.price_unit });
    if (est) {
      const ratio = l.price / est.median;
      market = { median: est.median, count: est.count, level: ratio < 0.85 ? 'below' : ratio > 1.15 ? 'above' : 'market' };
    }
  }
  return {
    listing: {
      id: l.id, title: l.title, description: l.description, category: l.category, price: l.price, priceUnit: l.price_unit,
      city: l.city, condition: l.condition, delivery: !!l.delivery, status: l.status, views: l.views,
      createdAt: l.created_at, updatedAt: l.updated_at, photos, isFav, isOwner: !!isOwner,
      rejectReason: (isOwner || isAdmin) ? l.reject_reason : '', appealText: (isOwner || isAdmin) ? l.appeal_text : ''
    },
    seller: { id: seller.id, name: seller.name, city: seller.city, createdAt: seller.created_at, activeCount: sellerActive },
    similar,
    market
  };
});

route('POST', '/api/listings', async (ctx) => {
  const u = requireUser(ctx);
  rateLimit(`create:${u.id}`, 30, 60 * 60 * 1000);
  const v = validateListing(await readJson(ctx.req));
  const t = now();
  const info = db.prepare(`INSERT INTO listings (user_id, title, description, category, price, price_unit, city, condition, delivery, search_text, city_lc, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(u.id, v.title, v.description, v.category, v.price, v.priceUnit, v.city, v.condition, v.delivery, searchText(v.title, v.description), norm(v.city), t, t);
  const id = Number(info.lastInsertRowid);
  attachPhotos(u.id, id, v.photos);
  if (!u.city) db.prepare('UPDATE users SET city = ? WHERE id = ?').run(v.city, u.id);
  return { id };
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
    db.prepare('UPDATE listings SET status = ?, updated_at = ? WHERE id = ?').run(body.status, now(), id);
    return { ok: true };
  }
  const v = validateListing(body);
  // Отредактированное отклонённое объявление снова публикуется, причина отклонения сохраняется для истории.
  const status = l.status === 'rejected' ? 'active' : l.status;
  db.prepare(`UPDATE listings SET title = ?, description = ?, category = ?, price = ?, price_unit = ?, city = ?, condition = ?, delivery = ?,
    search_text = ?, city_lc = ?, status = ?, updated_at = ? WHERE id = ?`)
    .run(v.title, v.description, v.category, v.price, v.priceUnit, v.city, v.condition, v.delivery, searchText(v.title, v.description), norm(v.city), status, now(), id);
  attachPhotos(u.id, id, v.photos);
  return { ok: true };
});

route('DELETE', '/api/listings/:id', (ctx) => {
  const u = requireUser(ctx);
  const id = parseInt(ctx.params.id, 10);
  const l = loadListing(id);
  if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
  deleteListingFiles(id);
  db.prepare('DELETE FROM listings WHERE id = ?').run(id);
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
  db.prepare('UPDATE listings SET appeal_text = ?, appeal_at = ? WHERE id = ?').run(text, now(), id);
  return { ok: true };
});

route('GET', '/api/my/listings', (ctx) => {
  const u = requireUser(ctx);
  const rows = db.prepare(`
    SELECT l.*, (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
      (SELECT COUNT(*) FROM favorites f WHERE f.listing_id = l.id) AS fav_count
    FROM listings l WHERE l.user_id = ? ORDER BY l.created_at DESC`).all(u.id);
  return {
    items: rows.map((r) => ({
      ...cardFromRow(r), views: r.views, favCount: r.fav_count, rejectReason: r.reject_reason,
      appealText: r.appeal_text, appealAt: r.appeal_at
    }))
  };
});

const IMAGE_TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
];

route('POST', '/api/uploads', async (ctx) => {
  const u = requireUser(ctx);
  rateLimit(`upload:${u.id}`, 120, 60 * 60 * 1000);
  const body = await readJson(ctx.req, 9 * 1024 * 1024);
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
  if (!m) throw new HttpError(400, 'Загрузите фото в формате JPG, PNG или WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) throw new HttpError(413, 'Фото больше 6 МБ');
  const type = IMAGE_TYPES.find((t) => t.test(buf));
  if (!type) throw new HttpError(400, 'Файл не похож на изображение');
  const file = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  db.prepare('INSERT INTO uploads (file, user_id, created_at) VALUES (?, ?, ?)').run(file, u.id, now());
  return { file, url: photoUrl(file) };
});

route('POST', '/api/ai/suggest', async (ctx) => {
  const u = requireUser(ctx);
  if (!AI_KEY) throw new HttpError(501, 'ИИ-подсказки не подключены');
  rateLimit(`ai:${u.id}`, 30, 60 * 60 * 1000);
  const { file } = await readJson(ctx.req);
  const row = db.prepare('SELECT file FROM uploads WHERE file = ? AND user_id = ?').get(String(file || ''), u.id);
  if (!row) throw new HttpError(400, 'Сначала загрузите фото');
  const type = IMAGE_TYPES.find((t) => row.file.endsWith(`.${t.ext}`));
  try {
    const s = await suggestFromPhoto({ apiKey: AI_KEY, model: AI_MODEL, filePath: path.join(UPLOAD_DIR, row.file), mime: type.mime });
    const est = s.category ? marketEstimate({ category: s.category, title: s.title, priceUnit: '' }) : null;
    return { ...s, priceHint: est ? est.median : null, priceHintCount: est ? est.count : 0 };
  } catch (e) {
    console.error('AI suggest failed:', e.message);
    throw new HttpError(502, 'Не получилось распознать фото. Заполните поля вручную.');
  }
});

route('GET', '/api/price-hint', (ctx) => {
  const category = ctx.query.get('category') || '';
  const title = ctx.query.get('title') || '';
  if (!CATEGORY_IDS.has(category) || title.length < 3) return { hint: null };
  const est = marketEstimate({ category, title, priceUnit: ctx.query.get('unit') || '' });
  return { hint: est ? est.median : null, count: est ? est.count : 0 };
});

route('GET', '/api/favorites', (ctx) => {
  const u = requireUser(ctx);
  const rows = db.prepare(`${CARD_SELECT} JOIN favorites fv ON fv.listing_id = l.id AND fv.user_id = ?
    WHERE l.status IN ('active', 'sold') AND u.is_blocked = 0 ORDER BY fv.created_at DESC`).all(u.id, u.id);
  return { items: rows.map(cardFromRow) };
});

route('POST', '/api/favorites/:id', (ctx) => {
  const u = requireUser(ctx);
  const id = parseInt(ctx.params.id, 10);
  if (!loadListing(id)) throw new HttpError(404, 'Объявление не найдено');
  const exists = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?').get(u.id, id);
  if (exists) db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run(u.id, id);
  else db.prepare('INSERT INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, ?)').run(u.id, id, now());
  return { fav: !exists };
});

function unreadCount(userId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE (c.buyer_id = ? OR c.seller_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`).get(userId, userId, userId).n;
}

route('GET', '/api/conversations', (ctx) => {
  const u = requireUser(ctx);
  const rows = db.prepare(`
    SELECT c.id, c.listing_id, c.buyer_id, c.seller_id, c.updated_at, l.title, l.price, l.price_unit, l.status,
      (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
      ou.id AS other_id, ou.name AS other_name,
      (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
    FROM conversations c
    JOIN listings l ON l.id = c.listing_id
    JOIN users ou ON ou.id = CASE WHEN c.buyer_id = ? THEN c.seller_id ELSE c.buyer_id END
    WHERE c.buyer_id = ? OR c.seller_id = ?
    ORDER BY c.updated_at DESC`).all(u.id, u.id, u.id, u.id);
  return {
    items: rows.map((r) => ({
      id: r.id, listingId: r.listing_id, title: r.title, price: r.price, priceUnit: r.price_unit, status: r.status,
      photo: photoUrl(r.photo), other: { id: r.other_id, name: r.other_name }, lastBody: r.last_body || '',
      unread: r.unread, updatedAt: r.updated_at, role: r.buyer_id === u.id ? 'buyer' : 'seller'
    }))
  };
});

route('POST', '/api/conversations', async (ctx) => {
  const u = requireUser(ctx);
  const listingId = parseInt((await readJson(ctx.req)).listingId, 10);
  const l = loadListing(listingId);
  if (!l || l.status !== 'active') throw new HttpError(404, 'Объявление недоступно');
  if (l.user_id === u.id) throw new HttpError(400, 'Это ваше объявление');
  const existing = db.prepare('SELECT id FROM conversations WHERE listing_id = ? AND buyer_id = ?').get(listingId, u.id);
  if (existing) return { id: existing.id };
  const t = now();
  const info = db.prepare('INSERT INTO conversations (listing_id, buyer_id, seller_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(listingId, u.id, l.user_id, t, t);
  return { id: Number(info.lastInsertRowid) };
});

function loadConversation(u, id) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!c || (c.buyer_id !== u.id && c.seller_id !== u.id)) throw new HttpError(404, 'Диалог не найден');
  return c;
}

route('GET', '/api/conversations/:id', (ctx) => {
  const u = requireUser(ctx);
  const c = loadConversation(u, parseInt(ctx.params.id, 10));
  const after = parseInt(ctx.query.get('after') || '0', 10) || 0;
  db.prepare('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL').run(now(), c.id, u.id);
  const messages = db.prepare('SELECT id, sender_id, body, created_at, read_at FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 500')
    .all(c.id, after).map((m) => ({ id: m.id, mine: m.sender_id === u.id, body: m.body, createdAt: m.created_at, read: !!m.read_at }));
  const l = loadListing(c.listing_id);
  const otherId = c.buyer_id === u.id ? c.seller_id : c.buyer_id;
  const other = db.prepare('SELECT id, name, created_at FROM users WHERE id = ?').get(otherId);
  const photo = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position LIMIT 1').get(c.listing_id);
  return {
    conversation: { id: c.id, role: c.buyer_id === u.id ? 'buyer' : 'seller' },
    listing: { id: l.id, title: l.title, price: l.price, priceUnit: l.price_unit, status: l.status, photo: photoUrl(photo && photo.file) },
    other: { id: other.id, name: other.name, createdAt: other.created_at },
    messages
  };
});

route('POST', '/api/conversations/:id/messages', async (ctx) => {
  const u = requireUser(ctx);
  rateLimit(`msg:${u.id}`, 40, 60 * 1000);
  const c = loadConversation(u, parseInt(ctx.params.id, 10));
  const body = str((await readJson(ctx.req)).body, 2000);
  if (!body) throw new HttpError(400, 'Пустое сообщение');
  const t = now();
  const info = db.prepare('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)').run(c.id, u.id, body, t);
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(t, c.id);
  return { message: { id: Number(info.lastInsertRowid), mine: true, body, createdAt: t, read: false } };
});

route('GET', '/api/users/:id', (ctx) => {
  const id = parseInt(ctx.params.id, 10);
  const u = db.prepare('SELECT id, name, city, created_at, is_blocked FROM users WHERE id = ?').get(id);
  if (!u || u.is_blocked) throw new HttpError(404, 'Пользователь не найден');
  const uid = ctx.user ? ctx.user.id : 0;
  const items = db.prepare(`${CARD_SELECT} WHERE l.user_id = ? AND l.status = 'active' ORDER BY l.created_at DESC LIMIT 60`).all(uid, id).map(cardFromRow);
  const sold = db.prepare('SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = \'sold\'').get(id).n;
  return { user: { id: u.id, name: u.name, city: u.city, createdAt: u.created_at, soldCount: sold }, items };
});

// ---------- модерация ----------

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
    appeals: n('SELECT COUNT(*) AS n FROM listings WHERE status = \'rejected\' AND appeal_at IS NOT NULL'),
    messagesToday: n('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?', day)
  };
});

route('GET', '/api/admin/listings', (ctx) => {
  requireAdmin(ctx);
  const status = ctx.query.get('status') || 'active';
  const q = norm(ctx.query.get('q') || '');
  const where = [];
  const params = [];
  if (status === 'appeals') where.push('l.status = \'rejected\' AND l.appeal_at IS NOT NULL');
  else if (['active', 'sold', 'archived', 'rejected'].includes(status)) { where.push('l.status = ?'); params.push(status); }
  if (q) { where.push('(l.search_text LIKE ? OR lower(u.email) LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const rows = db.prepare(`
    SELECT l.*, u.name AS user_name, u.email AS user_email, u.is_blocked,
      (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo
    FROM listings l JOIN users u ON u.id = l.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${status === 'appeals' ? 'l.appeal_at DESC' : 'l.created_at DESC'} LIMIT 100`).all(...params);
  return {
    items: rows.map((r) => ({
      ...cardFromRow(r), description: r.description, rejectReason: r.reject_reason, appealText: r.appeal_text, appealAt: r.appeal_at,
      user: { id: r.user_id, name: r.user_name, email: r.user_email, blocked: !!r.is_blocked }
    }))
  };
});

route('POST', '/api/admin/listings/:id/reject', async (ctx) => {
  requireAdmin(ctx);
  const id = parseInt(ctx.params.id, 10);
  const reason = str((await readJson(ctx.req)).reason, 500);
  if (reason.length < 5) throw new HttpError(400, 'Укажите понятную причину — её увидит автор');
  if (!loadListing(id)) throw new HttpError(404, 'Не найдено');
  db.prepare('UPDATE listings SET status = \'rejected\', reject_reason = ?, appeal_text = \'\', appeal_at = NULL, updated_at = ? WHERE id = ?').run(reason, now(), id);
  return { ok: true };
});

route('POST', '/api/admin/listings/:id/restore', (ctx) => {
  requireAdmin(ctx);
  const id = parseInt(ctx.params.id, 10);
  if (!loadListing(id)) throw new HttpError(404, 'Не найдено');
  db.prepare('UPDATE listings SET status = \'active\', appeal_at = NULL, updated_at = ? WHERE id = ?').run(now(), id);
  return { ok: true };
});

route('POST', '/api/admin/users/:id/block', async (ctx) => {
  const admin = requireAdmin(ctx);
  const id = parseInt(ctx.params.id, 10);
  if (id === admin.id) throw new HttpError(400, 'Нельзя заблокировать себя');
  const blocked = (await readJson(ctx.req)).blocked ? 1 : 0;
  db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(blocked, id);
  if (blocked) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  return { ok: true };
});

// ---------- статика ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

function serveFile(res, filePath, cache) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Не найдено');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache,
      ...SECURITY_HEADERS
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/uploads/')) {
    const name = pathname.slice('/uploads/'.length);
    if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) { res.writeHead(404); res.end(); return; }
    serveFile(res, path.join(UPLOAD_DIR, name), 'public, max-age=31536000, immutable');
    return;
  }
  if (pathname !== '/' && !pathname.includes('..')) {
    const filePath = path.join(PUBLIC_DIR, pathname);
    if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      serveFile(res, filePath, pathname.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache');
      return;
    }
  }
  // Все остальные пути — страницы приложения.
  serveFile(res, path.join(PUBLIC_DIR, 'index.html'), 'no-cache');
}

// ---------- сервер ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    serveStatic(req, res, pathname);
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[auth.SESSION_COOKIE];
  const headers = { ...SECURITY_HEADERS };
  const ctx = {
    req, res, query: url.searchParams, params: {}, ip: clientIp(req), token,
    user: auth.userFromSession(db, token),
    setCookie: (c) => { headers['Set-Cookie'] = c; }
  };

  try {
    // Защита от запросов с чужих сайтов: изменяющие запросы принимаются только со своего домена.
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin) {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        if (new URL(origin).host !== host) throw new HttpError(403, 'Запрос с другого сайта отклонён');
      }
    }
    const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
    if (!r) throw new HttpError(404, 'Не найдено');
    const m = r.re.exec(pathname);
    r.keys.forEach((k, i) => { ctx.params[k] = m[i + 1]; });
    const result = await r.handler(ctx);
    sendJson(res, 200, result, headers);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    sendJson(res, status, { error: status === 500 ? 'Что-то пошло не так. Попробуйте ещё раз.' : e.message }, headers);
  }
});

// Чистим просроченные сессии и брошенные загрузки раз в час.
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  const old = db.prepare('SELECT file FROM uploads WHERE listing_id IS NULL AND created_at < ?').all(now() - 24 * 3600 * 1000);
  for (const { file } of old) {
    fs.rm(path.join(UPLOAD_DIR, file), { force: true }, () => {});
    db.prepare('DELETE FROM uploads WHERE file = ?').run(file);
  }
}, 60 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Торгана запущена: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!ADMIN_EMAILS.length) console.log('Подсказка: задайте ADMIN_EMAIL в .env, чтобы получить доступ к модерации.');
  if (!AI_KEY) console.log('ИИ-подсказки по фото выключены (нет ANTHROPIC_API_KEY).');
});

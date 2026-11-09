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
const { CATEGORIES, CATEGORY_IDS, CITIES, PRICE_UNITS, CONDITIONS, SUPPORT_FAQ } = require('./lib/constants');
const { norm, parseQuery, searchSpec, specSql, brandAliases, correctQuery } = require('./lib/search');
const { suggestFromPhoto, pingYandex } = require('./lib/ai');
const { createMailer } = require('./lib/mailer');
const { createPush } = require('./lib/push');
const { checkProhibited } = require('./lib/prohibited');
const legal = require('./lib/legal');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const UPLOAD_DIR = path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const SECURE_COOKIES = PUBLIC_URL.startsWith('https://');
// Модераторы — адреса из ADMIN_EMAIL через запятую; первый адрес — владелец площадки.
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const OWNER_EMAIL = ADMIN_EMAILS[0] || '';
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const SUPPORT_EMAIL = legal.operator().email;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const PAYMENTS_ENABLED = false; // Безопасная сделка включится после подключения платёжной системы.
const DAY = 24 * 3600 * 1000;
const LISTING_TTL = Number(process.env.LISTING_TTL_MS) || 30 * DAY; // срок показа объявления (в тестах — короче)

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'torgana.db'));
// Модерация только у адресов из ADMIN_EMAIL: убранный из списка адрес теряет доступ при перезапуске сайта.
if (ADMIN_EMAILS.length) {
  const removed = db.prepare(`UPDATE users SET is_admin = 0 WHERE is_admin = 1 AND email NOT IN (${ADMIN_EMAILS.map(() => '?').join(',')})`).run(...ADMIN_EMAILS);
  db.prepare(`UPDATE users SET is_admin = 1 WHERE is_admin = 0 AND email IN (${ADMIN_EMAILS.map(() => '?').join(',')})`).run(...ADMIN_EMAILS);
  if (removed.changes) console.log(`Модерация снята у аккаунтов, которых нет в ADMIN_EMAIL: ${removed.changes}`);
}
const mailer = createMailer({
  db,
  baseUrl: PUBLIC_URL || `http://localhost:${PORT}`,
  supportEmail: SUPPORT_EMAIL,
  tickMs: Number(process.env.MAIL_TICK_MS) || undefined,
  chatDelayMs: process.env.CHAT_NOTIFY_DELAY_MS ? Number(process.env.CHAT_NOTIFY_DELAY_MS) : undefined,
  chatGapMs: process.env.CHAT_NOTIFY_GAP_MS ? Number(process.env.CHAT_NOTIFY_GAP_MS) : undefined,
  modGapMs: process.env.MOD_NOTIFY_GAP_MS ? Number(process.env.MOD_NOTIFY_GAP_MS) : undefined
});

// ---------- помощники ----------

const now = () => Date.now();
const str = (v, max) => String(v ?? '').trim().slice(0, max);

// За nginx: он дописывает настоящий адрес посетителя в конец X-Forwarded-For ($proxy_add_x_forwarded_for).
// Берём последний адрес — первые посетитель может подставить сам, чтобы обойти лимиты.
function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',').pop().trim();
  }
  return req.socket.remoteAddress || '';
}

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Нужно войти в аккаунт');
  if (ctx.user.is_blocked) throw new HttpError(403, 'Аккаунт заблокирован. Напишите в поддержку.');
  if (ctx.user.deactivated_at) { const e = new HttpError(403, 'Профиль удалён — восстановите его, чтобы продолжить'); e.extra = { deactivated: true }; throw e; }
  return ctx.user;
}

// Модерация: с 1.18 — ещё и подтверждённое устройство (lib/ops.js: код из письма, помним 30 дней).
let opsApi = null;
let boostApi = null; // lib/boost.js — подключается ниже, нужен cardFromRow и publishListing
function requireAdmin(ctx) {
  if (opsApi) return opsApi.requireAdmin(ctx);
  const u = requireUser(ctx);
  if (!u.is_admin) throw new HttpError(403, 'Нет доступа');
  return u;
}

const photoUrl = (file) => (file ? `/uploads/${file}` : null);
// Значки продавца: доверие (lib/trust.js) и «Магазин» при оплаченном тарифе.
const badgesOf = (u) => ({ ...trust.badgesOf(u), shop: !!business.planOf(u) });

// Переключатели уведомлений: поле API → колонка users (письма и push по видам).
const NOTIFY_FIELDS = {
  notifyMessages: 'notify_messages', notifyModeration: 'notify_moderation', notifyDigest: 'notify_digest',
  pushMessages: 'push_messages', pushSearches: 'push_searches', pushPrices: 'push_prices', pushModeration: 'push_moderation'
};

function publicUser(u) {
  return u ? {
    id: u.id, name: u.name, email: u.email, city: u.city, phone: u.phone, avatar: photoUrl(u.avatar), isAdmin: !!u.is_admin, isOwner: !!u.is_admin && u.email === OWNER_EMAIL, createdAt: u.created_at,
    emailVerified: !!u.email_verified, ...Object.fromEntries(Object.entries(NOTIFY_FIELDS).map(([k, col]) => [k, !!u[col]])),
    rep: helpers.reputation ? helpers.reputation.levelOf(u.id) : null, badges: badgesOf(u), business: trust.bizOf(u), trademark: trust.tmOf(u), phoneVia: u.phone_verified ? u.phone_verified_via : '', oauth: oauth.linkedOf(u.id),
    plan: business.planOf(u), shop: business.shopOf(u), bizAccount: !!u.biz_account, deactivatedAt: u.deactivated_at || null
  } : null;
}

// Фото профиля: файл из uploads, не привязанный к объявлению. Прежнее фото удаляется с диска.
function setAvatar(userId, file) {
  const cur = db.prepare('SELECT avatar FROM users WHERE id = ?').get(userId);
  if (!cur || cur.avatar === file) return;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(file, userId);
  if (cur.avatar) {
    db.prepare('DELETE FROM uploads WHERE file = ?').run(cur.avatar);
    fs.rm(path.join(UPLOAD_DIR, cur.avatar), { force: true }, () => {});
  }
}

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
    boost: boostApi ? boostApi.cardExtra(r) : null, // XL, рамка, метки (lib/boost.js)
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
    l.subcategory, l.attrs, l.metro, l.video,
    (SELECT COALESCE(NULLIF(p.thumb, ''), p.file) FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
    EXISTS(SELECT 1 FROM favorites f WHERE f.listing_id = l.id AND f.user_id = ?) AS is_fav,
    (SELECT json_object('xl', MAX(b.xl), 'frame', MAX(b.frame)) FROM boosts b WHERE b.listing_id = l.id AND b.status = 'active') AS boost,
    (SELECT b.tags FROM boosts b WHERE b.listing_id = l.id AND b.status = 'active' AND b.tags != '[]' ORDER BY b.id DESC LIMIT 1) AS boost_tags,
    u.id AS seller_id, u.name AS seller_name, u.avatar AS seller_avatar, u.biz_status AS seller_biz_status, u.biz_name AS seller_biz_name, u.plan AS seller_plan, u.plan_until AS seller_plan_until,
    u.rep_level AS seller_level
  FROM listings l JOIN users u ON u.id = l.user_id`;

// Текст для поиска: название, описание, подкатегория и характеристики из списков («Toyota», «Автомат»).
function searchText(title, description, v = {}) {
  const sub = taxonomy.SUB[v.subcategory];
  const extra = sub ? [sub.name, ...sub.fields.filter((f) => f.type === 'select' && v.attrs && v.attrs[f.key]).map((f) => v.attrs[f.key])] : [];
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

// strict — форма объявления (1.22): главные характеристики раздела обязательны; автозагрузка из фида — без strict.
function validateListing(body, { strict = false } = {}) {
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
  // Подкатегория — из списка своей категории; характеристики — только её поля.
  const subcategory = taxonomy.SUB[body.subcategory] && taxonomy.SUB[body.subcategory].category === category ? body.subcategory : '';
  let attrs = {};
  try { attrs = taxonomy.cleanAttrs(subcategory, body.attrs, { strict }); } catch (e) { throw new HttpError(400, e.message); }
  // Метро — только станция этого города из справочника; если справочника пока нет — сохраняем как есть.
  let station = str(body.metro, 60);
  if (station && metro.has(city) && !metro.isStation(city, station)) throw new HttpError(400, 'Выберите станцию метро из списка');
  if (station && !metro.has(city) && metro.cities().length) station = '';
  const district = str(body.district, 60);
  // video: undefined — не менять (автозагрузка), '' — убрать, имя файла — новое видео.
  const video = body.video === undefined ? undefined : str(body.video, 60);
  // Торг и обмен: undefined — не менять (автозагрузка из фида).
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
  // Похоже на запрещённое — публикуем после проверки модератором.
  const flags = checkProhibited(title, description).map((f) => f.title).join(', ');
  return { title, description, category, city, priceUnit, condition, delivery, bargain, exchange, publishAt, price, photos, flags, subcategory, attrs, metro: station, district, video };
}

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

// ---------- обработчики API ----------

const routes = [];
// Обработчик может вернуть h.redirect(url) вместо JSON — тогда ответ 302 (нужно для возврата из Яндекс ID и VK ID).
const REDIRECT = Symbol('redirect');
const redirect = (url) => ({ [REDIRECT]: url });
// h.file(...) — ответ файлом (выгрузка CSV), а не JSON.
const FILE = Symbol('file');
const fileResponse = (type, body, name) => ({ [FILE]: { type, body, name } });
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
}

// Подкатегории и характеристики, станции метро (справочник hh.ru), видео в объявлении.
const taxonomy = require('./lib/taxonomy');
const metro = require('./lib/metro')({ dataDir: DATA_DIR });
const video = require('./lib/video')({ route, db, h: { HttpError, requireUser, readJson, rateLimit, now }, dir: UPLOAD_DIR });

// Модерация (очередь, проверка «от и до», жалобы, история) и чат поддержки — в отдельных модулях.
const autoChecks = require('./lib/checks')({ db, marketEstimate });
const helpers = { HttpError, readJson, rateLimit, requireUser, requireAdmin, loadListing, cardFromRow, photoUrl, taxonomy, metro, video, attrsOf, setAvatar, str, now, norm, autoChecks, OWNER_EMAIL, redirect, file: fileResponse, PUBLIC_URL: PUBLIC_URL || `http://localhost:${PORT}` };
const push = createPush({ db, subject: `mailto:${SUPPORT_EMAIL || 'support@torgana.ru'}`, allowHttp: process.env.PUSH_ALLOW_HTTP === '1' });
const alerts = require('./lib/alerts')({ route, db, mailer, push, h: helpers, categories: CATEGORIES });
helpers.alerts = alerts; // push и подборки нужны модерации, поддержке и отзывам
const { logEvent, audit } = require('./lib/moderation')({ route, db, mailer, h: helpers });
helpers.audit = audit; // журнал модерации нужен и отзывам, и поддержке
const supportChat = require('./lib/support')({ route, db, mailer, h: helpers });
const stats = require('./lib/stats')({ route, db, h: helpers });
require('./lib/reviews')({ db }); // 1.47.2: только хранение старых отзывов, на сайте их нет
const trust = require('./lib/trust')({ route, db, h: helpers, mailer, dataDir: DATA_DIR }); // «Телефон подтверждён», проверенный бизнес
require('./lib/admin')({ route, db, h: helpers, trust }); // сводка, пользователи, журнал, письма модератору
helpers.sources = require('./lib/sources')({ route, db, h: helpers }); // откуда пришли люди (1.38)
const oauth = require('./lib/oauth')({ route, db, h: helpers, auth, baseUrl: PUBLIC_URL || `http://localhost:${PORT}`, secureCookies: SECURE_COOKIES, adminEmails: ADMIN_EMAILS, testBase: process.env.OAUTH_TEST_BASE || '' });
// Платные услуги для бизнеса: оплата через ЮKassa, тарифы «Магазин» и «Магазин Про», продвижение, автозагрузка из фида.
helpers.logEvent = logEvent;
helpers.categoryIds = CATEGORY_IDS;
const billing = require('./lib/billing')({ route, db, h: helpers, mailer, baseUrl: PUBLIC_URL || `http://localhost:${PORT}`, testBase: process.env.YOOKASSA_TEST_BASE || '' });
const business = require('./lib/business')({ route, db, h: helpers, billing, mailer, stats });
const promo = require('./lib/promo')({ route, db, h: helpers, billing, business, stats, mailer, searchSpec, specSql, categoryIds: CATEGORY_IDS });
// Продвижение в ленте и поиске для всех продавцов: XL-карточка, рамка, метки на фото (1.21.0).
const boost = require('./lib/boost')({ route, db, h: helpers, billing });
boostApi = boost;
const feed = require('./lib/feed')({ route, db, h: helpers, business });
const deals = require('./lib/deals')({ route, db, h: helpers, alerts }); // предложение цены, быстрые ответы, подписки
const reputation = require('./lib/reputation')({ route, db, h: helpers, replyStats }); // 1.46.0: репутация вместо отзывов
helpers.reputation = reputation;
// Коды по почте (6 цифр при регистрации и входе, код для модерации) можно временно выключить в «Модерация → Почта»,
// например пока письма не доходят. Выключены — вход без кода, как до 1.14.
const codesOn = () => {
  if (!mailer.ready()) return false;
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get('mail_codes');
  try { return r ? JSON.parse(r.value).on !== false : true; } catch { return true; }
};
// Копия в облако (Selectel S3), письма владельцу о сбоях, вход в модерацию по коду с нового устройства.
const ops = require('./lib/ops')({ route, db, h: helpers, mailer, codesOn, root: ROOT, dataDir: DATA_DIR, uploadDir: UPLOAD_DIR, ownerEmail: OWNER_EMAIL, publicUrl: PUBLIC_URL, secureCookies: SECURE_COOKIES,
  deviceCheck: process.env.ADMIN_DEVICE_CHECK !== '0' });
opsApi = ops;
helpers.business = business;
helpers.account = require('./lib/account')({ route, db, h: { ...helpers, secureCookies: SECURE_COOKIES, trust }, removeListing, auth }); // удаление профиля (1.39)

// Поисковики и Метрика: коды подтверждения Вебмастера и Search Console, номер счётчика — «Модерация → Поиск и статистика».
// ИИ по фото: Яндекс AI Studio (ключ и каталог — в модерации, «Настройки → ИИ по фото» или YANDEX_AI_KEY/YANDEX_FOLDER_ID),
// иначе Claude (ANTHROPIC_API_KEY). Нет ни того, ни другого — подсказки выключены.
const YA_VISION = 'qwen3.6-35b-a3b';
const YA_TEXT = 'aliceai-llm';
function aiCfg() {
  const s = seoSetting('ai') || {};
  if (s.off) return null;
  const key = s.key || process.env.YANDEX_AI_KEY || '';
  const folder = s.folder || process.env.YANDEX_FOLDER_ID || '';
  if (key && folder) return { provider: 'yandex', key, folder, vision: s.vision || process.env.YANDEX_VISION_MODEL || YA_VISION, text: s.text === '' ? '' : (s.text || process.env.YANDEX_TEXT_MODEL || YA_TEXT) };
  if (AI_KEY) return { provider: 'anthropic', key: AI_KEY, model: AI_MODEL };
  return null;
}
const seoSetting = (key) => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); try { return r ? JSON.parse(r.value) : null; } catch { return null; } };
const seo = require('./lib/seo')({ db, base: PUBLIC_URL || `http://localhost:${PORT}`, getSetting: seoSetting });
route('GET', '/api/admin/seo', (ctx) => {
  requireAdmin(ctx);
  const base = PUBLIC_URL || `http://localhost:${PORT}`;
  return { seo: { yandex: '', google: '', metrika: '', mapsKey: '', ...(seoSetting('seo') || {}) }, sitemap: `${base}/sitemap.xml`, robots: `${base}/robots.txt` };
});
route('PUT', '/api/admin/seo', async (ctx) => {
  const admin = requireAdmin(ctx);
  const b = await readJson(ctx.req);
  const code = (v) => str(v, 120).replace(/^.*content=["']?([\w-]+)["']?.*$/s, '$1').replace(/[^\w-]/g, ''); // можно вставить весь <meta …>
  const metrika = str(b.metrika, 20).replace(/\D/g, '');
  const mapsKey = str(b.mapsKey, 80).trim().replace(/[^\w-]/g, ''); // ключ JavaScript API Яндекс Карт
  const next = { yandex: code(b.yandex), google: code(b.google), metrika, mapsKey };
  db.prepare('INSERT INTO settings (key, value) VALUES (\'seo\', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(JSON.stringify(next));
  audit(admin, 'seo-settings', {}, next);
  return { seo: next };
}); // тариф и витрина — в карточке пользователя в модерации

// Раздел «Для бизнеса» в профиле: тариф, цены, витрина, автозагрузка, продвижения, платежи.
route('GET', '/api/my/business', (ctx) => {
  const u = requireUser(ctx);
  return {
    plan: business.planOf(u), prices: billing.prices(), ready: billing.ready(), biz: trust.bizOf(u), bizAccount: !!u.biz_account, trial: business.trialBlock(u) === '', trialWhy: business.trialBlock(u),
    shop: { cover: photoUrl(u.shop_cover), about: u.shop_about, hours: u.shop_hours, address: u.shop_address, site: u.shop_site },
    feed: feed.publicFeed(u), promotions: promo.listFor(u.id), payments: billing.listFor(u.id)
  };
});

// Блок «О разделе» на страницах /c/…: числа, города и соседние разделы — из базы (lib/seo.js).
route('GET', '/api/sections/info', (ctx) => {
  const q = ctx.query;
  const info = seo.sectionInfo({ category: q.get('category') || '', sub: q.get('sub') || '', city: q.get('city') || '' });
  if (!info) throw new HttpError(404, 'Раздел не найден');
  return info;
});

route('GET', '/api/config', () => ({
  categories: CATEGORIES,
  cities: CITIES,
  priceUnits: PRICE_UNITS,
  subcategories: taxonomy.publicTaxonomy(),
  metroCities: metro.cities(),
  ai: !!aiCfg(),
  aiBy: (aiCfg() || {}).provider || '',
  payments: PAYMENTS_ENABLED,
  mail: mailer.ready(),
  supportEmail: SUPPORT_EMAIL,
  supportFaq: SUPPORT_FAQ,
  oauth: oauth.enabled(),
  billing: { ready: billing.ready(), prices: billing.prices(), boostTags: boost.TAGS, boostDays: boost.BOOST_DAYS, starter: business.starterPublic() },
  metrika: (seoSetting('seo') || {}).metrika || '',
  maps: !!(seoSetting('seo') || {}).mapsKey,
  operator: (({ name, inn, ogrnip }) => ({ name, inn, ogrnip }))(legal.operator())
}));

// Станции метро города (для выбора в объявлении и фильтра в поиске).
route('GET', '/api/metro', (ctx) => ({ stations: metro.stations(ctx.query.get('city') || '') }));

route('GET', '/api/me', (ctx) => {
  const unread = ctx.user ? unreadCount(ctx.user.id) + supportChat.unreadFor(ctx.user.id) : 0;
  return { user: publicUser(ctx.user), unread, fresh: ctx.user ? alerts.freshCounts(ctx.user.id) : null, notices: ctx.user ? alerts.unreadNotices(ctx.user.id) : 0 };
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
  if (body.consent !== true) throw new HttpError(400, 'Нужно согласие на обработку персональных данных');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Этот email уже зарегистрирован');
  const isAdmin = ADMIN_EMAILS.includes(email) ? 1 : 0;
  const info = db.prepare('INSERT INTO users (email, name, password_hash, is_admin, created_at, consent_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(email, name, auth.hashPassword(password), isAdmin, now(), now());
  helpers.sources.tag(info.lastInsertRowid, body.src);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  // Почта подключена — войти можно только после кода из письма (6 цифр). Без почты код не отправить — входим сразу.
  if (codesOn()) { mailer.sendCode(user); return { needCode: true, email: user.email }; }
  const s = auth.createSession(db, user.id);
  ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
  return { user: publicUser(user) };
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
  // Почта не подтверждена — сначала код (новый, если прошлому больше минуты).
  if (!user.email_verified && codesOn()) { mailer.sendCode(user); return { needCode: true, email: user.email }; }
  const s = auth.createSession(db, user.id);
  ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
  return { user: publicUser(user) };
});

route('POST', '/api/auth/logout', (ctx) => {
  if (ctx.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(ctx.token);
  ctx.setCookie(auth.clearCookie(SECURE_COOKIES));
  return { ok: true };
});

// ---------- письма: подтверждение email, восстановление пароля, отписка ----------

function requireMail() {
  if (!mailer.ready()) throw new HttpError(503, 'Отправка писем пока не подключена. Напишите в поддержку.');
}

route('POST', '/api/auth/forgot', async (ctx) => {
  requireMail();
  rateLimit(`forgot:${ctx.ip}`, 5, 60 * 60 * 1000);
  const email = str((await readJson(ctx.req)).email, 120).toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_blocked = 0').get(email);
  // Ответ одинаковый, есть такой аккаунт или нет: по форме нельзя узнать, кто зарегистрирован.
  if (user) {
    try { rateLimit(`forgot-mail:${email}`, 3, 60 * 60 * 1000); mailer.sendResetLetter(user); } catch { /* лимит: молча */ }
  }
  return { ok: true };
});

route('GET', '/api/auth/reset', (ctx) => ({ valid: !!mailer.checkToken(ctx.query.get('token'), 'reset', false) }));

route('POST', '/api/auth/reset', async (ctx) => {
  rateLimit(`reset:${ctx.ip}`, 20, 60 * 60 * 1000);
  const body = await readJson(ctx.req);
  const password = String(body.password || '');
  if (password.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
  if (password.length > 200) throw new HttpError(400, 'Слишком длинный пароль');
  const t = mailer.checkToken(body.token, 'reset');
  if (!t) throw new HttpError(400, 'Ссылка устарела или уже использована. Запросите новую.');
  // Ссылка пришла на этот ящик — значит, он подтверждён. Все старые сессии завершаем.
  db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').run(auth.hashPassword(password), t.user_id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(t.user_id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(t.user_id);
  if (user.is_blocked) throw new HttpError(403, 'Аккаунт заблокирован. Напишите в поддержку.');
  const s = auth.createSession(db, user.id);
  ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
  return { user: publicUser(user) };
});

route('POST', '/api/auth/verify', async (ctx) => {
  rateLimit(`verify:${ctx.ip}`, 30, 60 * 60 * 1000);
  const t = mailer.checkToken((await readJson(ctx.req)).token, 'verify');
  if (!t) throw new HttpError(400, 'Ссылка устарела или уже использована. Отправьте письмо ещё раз из профиля.');
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(t.user_id);
  return { ok: true };
});

route('POST', '/api/me/verify', (ctx) => {
  const u = requireUser(ctx);
  requireMail();
  if (u.email_verified) return { ok: true, already: true };
  rateLimit(`verify-send:${u.id}`, 10, 60 * 60 * 1000);
  return { ok: true, email: u.email, ...mailer.sendCode(u) };
});

// Код из письма: подтверждает почту и открывает вход (при регистрации, при входе и из профиля).
const CODE_ERR = { bad: 'Неверный код — проверьте цифры', expired: 'Код устарел — отправьте новый', tries: 'Слишком много попыток — отправьте новый код', none: 'Отправьте код ещё раз' };
route('POST', '/api/auth/code', async (ctx) => {
  rateLimit(`code:${ctx.ip}`, 30, 10 * 60 * 1000);
  const b = await readJson(ctx.req);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(str(b.email, 120).toLowerCase());
  if (!user) throw new HttpError(400, CODE_ERR.none);
  if (user.is_blocked) throw new HttpError(403, 'Аккаунт заблокирован. Напишите в поддержку.');
  if (!user.email_verified) {
    const r = mailer.checkCode(user, String(b.code || '').replace(/\D/g, ''));
    if (r !== 'ok') throw new HttpError(400, CODE_ERR[r]);
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id);
  } else if (!(ctx.user && ctx.user.id === user.id)) throw new HttpError(400, 'Почта уже подтверждена — войдите с паролем');
  const s = auth.createSession(db, user.id);
  ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
  return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) };
});

// Отправить код ещё раз. Ответ одинаковый, есть такой аккаунт или нет.
route('POST', '/api/auth/code/resend', async (ctx) => {
  rateLimit(`code-resend:${ctx.ip}`, 10, 60 * 60 * 1000);
  requireMail();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND email_verified = 0 AND is_blocked = 0').get(str((await readJson(ctx.req)).email, 120).toLowerCase());
  const r = user ? mailer.sendCode(user) : { sent: true, wait: 60 };
  return { ok: true, wait: r.wait };
});

// Отписка: со страницы /unsubscribe и «в один клик» из почтового клиента (List-Unsubscribe-Post).
route('POST', '/api/unsubscribe', async (ctx) => {
  const body = ctx.req.headers['content-type'] === 'application/json' ? await readJson(ctx.req) : {};
  const ok = mailer.unsubscribe(body.t || ctx.query.get('t'), body.k || ctx.query.get('k') || 'all');
  if (!ok) throw new HttpError(400, 'Ссылка для отписки неверная');
  return { ok: true };
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
  db.prepare(`UPDATE users SET name = ?, city = ?, phone = ?, phone_verified = ?, ${cols.map(([, c]) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .run(name, city, phone, phoneVerified, ...cols.map(([k, c]) => flag(body[k], u[c])), u.id);
  if (avatar !== null) setAvatar(u.id, avatar);
  return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) };
});

// Смена пароля из настроек: нужен текущий пароль; остальные устройства выходят из аккаунта.
route('POST', '/api/me/password', async (ctx) => {
  const u = requireUser(ctx);
  rateLimit(`password:${u.id}`, 10, 60 * 60 * 1000);
  const body = await readJson(ctx.req);
  const password = String(body.password || '');
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id);
  if (!auth.verifyPassword(String(body.current || ''), row.password_hash)) throw new HttpError(400, 'Текущий пароль указан неверно');
  if (password.length < 8) throw new HttpError(400, 'Новый пароль — минимум 8 символов');
  if (password.length > 200) throw new HttpError(400, 'Слишком длинный пароль');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), u.id);
  const others = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, ctx.token || '');
  return { ok: true, signedOut: Number(others.changes) };
});

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
const cityCenter = require('./lib/geo').cityCenter;
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
  const similarIn = (col, val, not) => db.prepare(`${CARD_SELECT} WHERE l.${col} = ? AND l.status = 'active' AND u.is_blocked = 0 AND l.id != ?
    ${not.length ? `AND l.id NOT IN (${not.map(() => '?').join(',')})` : ''} ORDER BY l.created_at DESC LIMIT ?`).all(uid, val, id, ...not, 4 - not.length);
  const sameSub = l.subcategory ? similarIn('subcategory', l.subcategory, []) : [];
  const similar = [...sameSub, ...(sameSub.length < 4 ? similarIn('category', l.category, sameSub.map((r) => r.id)) : [])].map(cardFromRow);
  const attrs = attrsOf(l);
  const station = l.metro ? (({ name, line, color }) => ({ name, line, color }))(metro.stations(l.city).find((s) => s.name === l.metro) || { name: l.metro, line: '', color: '' }) : null;
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
      id: l.id, title: l.title, description: l.description, category: l.category, price: l.price, priceUnit: l.price_unit, priceWas: priceWasOf(l),
      city: l.city, condition: l.condition, delivery: !!l.delivery, bargain: !!l.bargain, exchange: !!l.exchange, status: l.status, views: l.views, favCount,
      publishAt: (isOwner || isAdmin) ? l.publish_at : null, expiresAt: (isOwner || isAdmin) ? l.expires_at : null,
      subcategory: l.subcategory, attrs, specs: taxonomy.describe(l.subcategory, attrs), metro: station, district: l.district, video: video.url(l.video),
      createdAt: l.created_at, updatedAt: l.updated_at, photos, isFav, isOwner: !!isOwner,
      rejectReason: (isOwner || isAdmin) ? l.reject_reason : '', appealText: (isOwner || isAdmin) ? l.appeal_text : '',
      appealReply: (isOwner || isAdmin) ? l.appeal_reply : '', flags: (isOwner || isAdmin) ? l.flags : ''
    },
    seller: { id: seller.id, name: seller.name, city: seller.city, avatar: photoUrl(seller.avatar), createdAt: seller.created_at, activeCount: sellerActive, rep: reputation.repOf(seller.id), badges: badgesOf(seller),
      followers: deals.followers(seller.id), following: deals.isFollowing(ctx.user ? ctx.user.id : 0, seller.id), reply: replyStats(seller.id) },
    similar,
    market,
    promo: isOwner ? promo.currentOf(id) : null,
    boost: isOwner ? boost.ownerView(id) : null
  };
});

// Новое объявление и правка — одни функции для формы и для автозагрузки из фида (lib/feed.js).
// Все объявления публикуются после проверки модератором; любая правка — снова на проверку.
function createListing(u, v) {
  const t = now();
  const info = db.prepare(`INSERT INTO listings (user_id, title, description, category, price, price_unit, city, condition, delivery, bargain, exchange, publish_at, search_text, city_lc, status, flags,
    subcategory, attrs, metro, district, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`)
    .run(u.id, v.title, v.description, v.category, v.price, v.priceUnit, v.city, v.condition, v.delivery, v.bargain ?? 1, v.exchange ?? 0, v.publishAt || null, searchText(v.title, v.description, v), norm(v.city), v.flags,
      v.subcategory || '', JSON.stringify(v.attrs || {}), v.metro || '', v.district || '', t, t);
  const id = Number(info.lastInsertRowid);
  attachPhotos(u.id, id, v.photos);
  if (v.video) video.attach(u.id, id, v.video);
  if (!u.city) db.prepare('UPDATE users SET city = ? WHERE id = ?').run(v.city, u.id);
  logEvent(id, u.id, 'created', { flags: v.flags, ...(v.via ? { via: v.via } : {}) });
  autoChecks.run(id);
  return id;
}

// В историю пишем, что именно изменилось.
function updateListing(u, l, v) {
  const before = { title: l.title, description: l.description, category: l.category, price: l.price, priceUnit: l.price_unit, city: l.city, condition: l.condition, delivery: !!l.delivery,
    bargain: !!l.bargain, exchange: !!l.exchange, subcategory: l.subcategory, attrs: JSON.stringify(attrsOf(l)), metro: l.metro, district: l.district };
  const after = { title: v.title, description: v.description, category: v.category, price: v.price, priceUnit: v.priceUnit, city: v.city, condition: v.condition, delivery: !!v.delivery,
    bargain: v.bargain === undefined ? before.bargain : !!v.bargain, exchange: v.exchange === undefined ? before.exchange : !!v.exchange,
    subcategory: v.subcategory === undefined ? l.subcategory : v.subcategory, attrs: v.attrs === undefined ? before.attrs : JSON.stringify(v.attrs),
    metro: v.metro === undefined ? l.metro : v.metro, district: v.district === undefined ? l.district : v.district };
  const changes = Object.fromEntries(Object.keys(before).filter((k) => before[k] !== after[k]).map((k) => [k, [before[k], after[k]]]));
  const oldPhotos = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(l.id).map((r) => r.file);
  const extra = { subcategory: after.subcategory, attrs: JSON.parse(after.attrs) };
  // Время публикации выбирают только до первой публикации (alerted = 0); потом правка просто уходит на проверку.
  db.prepare(`UPDATE listings SET title = ?, description = ?, category = ?, price = ?, price_unit = ?, city = ?, condition = ?, delivery = ?, bargain = ?, exchange = ?, publish_at = ?,
    search_text = ?, city_lc = ?, status = 'pending', flags = ?, subcategory = ?, attrs = ?, metro = ?, district = ?, updated_at = ? WHERE id = ?`)
    .run(v.title, v.description, v.category, v.price, v.priceUnit, v.city, v.condition, v.delivery, after.bargain ? 1 : 0, after.exchange ? 1 : 0, l.alerted ? null : v.publishAt || null,
      searchText(v.title, v.description, extra), norm(v.city), v.flags || (l.status === 'pending' ? l.flags : ''), after.subcategory, after.attrs, after.metro, after.district, now(), l.id);
  attachPhotos(u.id, l.id, v.photos);
  if (v.video !== undefined && v.video !== l.video) { video.attach(u.id, l.id, v.video); changes.video = [l.video ? 'было' : 'не было', v.video ? 'новое' : 'убрано']; }
  const newPhotos = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(l.id).map((r) => r.file);
  if (oldPhotos.join() !== newPhotos.join()) changes.photos = [oldPhotos.length, newPhotos.length];
  logEvent(l.id, u.id, 'edited', { changes, flags: v.flags, from: l.status, ...(v.via ? { via: v.via } : {}) });
  autoChecks.run(l.id);
}
helpers.createListing = createListing;
helpers.updateListing = updateListing;

// Публикация. Объявление висит LISTING_TTL (30 дней) бесплатно, потом снимается — опубликовать снова можно в один клик, тоже бесплатно.
// Если срок уже кончился (или fresh — отложенная публикация), объявление публикуется как новое: дата «сейчас», наверху выдачи по дате.
// Правка опубликованного объявления срок не продлевает.
function publishListing(id, fresh = false) {
  const t = now();
  db.prepare(`UPDATE listings SET status = 'active', publish_at = NULL,
    created_at = CASE WHEN ? OR (expires_at IS NOT NULL AND expires_at <= ?) THEN ? ELSE created_at END,
    expires_at = CASE WHEN ? OR expires_at IS NULL OR expires_at <= ? THEN ? ELSE expires_at END, updated_at = ? WHERE id = ?`)
    .run(fresh ? 1 : 0, t, t, fresh ? 1 : 0, t, t + LISTING_TTL, t, id);
  alerts.onPublished(id); // подписчики продавца, снижение цены
  if (boostApi) boostApi.onPublished(id); // оплаченное продвижение начинается с публикации
}
helpers.publishListing = publishListing;

// Раз в минуту: публикуем запланированные и снимаем те, у кого прошло 30 дней.
// Не снимаем объявления из фида (их ведёт автозагрузка) и с идущей рекламой — она оплачена на свой срок.
function listingTick() {
  const t = now();
  for (const { id } of db.prepare('SELECT id FROM listings WHERE status = \'scheduled\' AND publish_at <= ?').all(t)) {
    publishListing(id, true);
    logEvent(id, null, 'published', { scheduled: true });
    alerts.moderation(id, 'approved');
  }
  const expired = db.prepare(`SELECT id FROM listings WHERE status = 'active' AND expires_at <= ?
    AND id NOT IN (SELECT listing_id FROM feed_items WHERE gone = 0 AND listing_id IS NOT NULL)
    AND id NOT IN (SELECT listing_id FROM promotions WHERE status = 'active' AND listing_id IS NOT NULL)
    AND id NOT IN (SELECT listing_id FROM boosts WHERE status = 'active' AND listing_id IS NOT NULL)`).all(t);
  for (const { id } of expired) {
    db.prepare('UPDATE listings SET status = \'archived\', updated_at = ? WHERE id = ?').run(t, id);
    logEvent(id, null, 'expired', {});
    alerts.moderation(id, 'expired');
  }
}
helpers.validateListing = validateListing;

route('POST', '/api/listings', async (ctx) => {
  const u = requireUser(ctx);
  rateLimit(`create:${u.id}`, 30, 60 * 60 * 1000);
  const v = validateListing(await readJson(ctx.req), { strict: true });
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
    logEvent(id, u.id, 'status', { status: body.status });
    const r = db.prepare('SELECT status, expires_at FROM listings WHERE id = ?').get(id);
    return { ok: true, status: r.status, expiresAt: r.expires_at };
  }
  const v = validateListing(body, { strict: true });
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
  logEvent(id, u.id, 'status', { status: 'deleted' });
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
  logEvent(id, u.id, 'appeal', { text });
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
      appealText: r.appeal_text, appealAt: r.appeal_at, appealReply: r.appeal_reply, flags: r.flags, promo: promo.currentOf(r.id), boost: boost.ownerView(r.id)
    }))
  };
});

const IMAGE_TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
];

// Сохранить фото на диск и в uploads (своё, ещё не привязанное). Возвращает имя файла или бросает 400.
// hash — отпечаток dHash от браузера (только подсказка модератору о повторах).
// thumb — лёгкая копия для ленты (1.43.0): тот же формат имени, лежит рядом, удаляется вместе с фото (removeUploadFiles).
function saveImage(userId, buf, hash = '', thumb = null) {
  if (buf.length > 6 * 1024 * 1024) throw new HttpError(413, 'Фото больше 6 МБ');
  const write = (b) => {
    const type = IMAGE_TYPES.find((t) => t.test(b));
    if (!type) throw new HttpError(400, 'Файл не похож на изображение');
    const name = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), b);
    return name;
  };
  const file = write(buf);
  const small = thumb && thumb.length <= 400 * 1024 ? write(thumb) : '';
  db.prepare('INSERT INTO uploads (file, user_id, hash, thumb, created_at) VALUES (?, ?, ?, ?, ?)').run(file, userId, /^[0-9a-f]{16}$/.test(String(hash)) ? hash : '', small, now());
  return file;
}
// Файлы фото (и их лёгкие копии) с диска; строки uploads удаляет вызывающий.
function removeUploadFiles(rows) {
  for (const r of rows) for (const f of [r.file, r.thumb]) if (f) fs.rm(path.join(UPLOAD_DIR, f), { force: true }, () => {});
}
helpers.saveImage = saveImage;

route('POST', '/api/uploads', async (ctx) => {
  const u = requireUser(ctx);
  rateLimit(`upload:${u.id}`, 120, 60 * 60 * 1000);
  const body = await readJson(ctx.req, 9 * 1024 * 1024);
  const dataUrl = (v) => /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(v || ''));
  const m = dataUrl(body.data);
  if (!m) throw new HttpError(400, 'Загрузите фото в формате JPG, PNG или WebP');
  const t = dataUrl(body.thumb);
  const file = saveImage(u.id, Buffer.from(m[2], 'base64'), body.hash, t ? Buffer.from(t[2], 'base64') : null);
  return { file, url: photoUrl(file) };
});

// Разделы и их главные поля — для подсказки по фото (раздел и, например, размер или площадь).
const AI_SUBS = Object.entries(taxonomy.SUBCATS).map(([cat, list]) => list.map((x) => {
  const req = (x.fields || []).filter((f) => f.req).map((f) => (f.type === 'select' && (f.options || []).length <= 15 ? `${f.key}: ${f.options.join(' | ')}` : `${f.key} — ${f.label}${f.unit ? `, ${f.unit}` : ''}${f.type === 'select' ? ' (значение из списка)' : ', число'}`));
  return `${cat}/${x.id} — ${x.name}${req.length ? ` (${req.join('; ')})` : ''}`;
}).join('\n')).join('\n');

route('POST', '/api/ai/suggest', async (ctx) => {
  const u = requireUser(ctx);
  const cfg = aiCfg();
  if (!cfg) throw new HttpError(501, 'ИИ-подсказки не подключены');
  rateLimit(`ai:${u.id}`, 30, 60 * 60 * 1000);
  const { file } = await readJson(ctx.req);
  const row = db.prepare('SELECT file FROM uploads WHERE file = ? AND user_id = ?').get(String(file || ''), u.id);
  if (!row) throw new HttpError(400, 'Сначала загрузите фото');
  const type = IMAGE_TYPES.find((t) => row.file.endsWith(`.${t.ext}`));
  try {
    const s = await suggestFromPhoto({ cfg, filePath: path.join(UPLOAD_DIR, row.file), mime: type.mime, subs: AI_SUBS });
    // Раздел — только из разделов угаданной категории; характеристики — по одной, неверные отбрасываем.
    s.subcategory = s.category && (taxonomy.SUBCATS[s.category] || []).some((x) => x.id === s.subcategory) ? s.subcategory : '';
    const attrs = {};
    if (s.subcategory) for (const [k, v] of Object.entries(s.attrs)) { try { Object.assign(attrs, taxonomy.cleanAttrs(s.subcategory, { [k]: v })); } catch { /* не из списка или вне пределов */ } }
    s.attrs = attrs;
    const est = s.category ? marketEstimate({ category: s.category, title: s.title, priceUnit: '' }) : null;
    return { ...s, priceHint: est ? est.median : null, priceHintCount: est ? est.count : 0 };
  } catch (e) {
    console.error('AI suggest failed:', e.message);
    throw new HttpError(502, 'Не получилось распознать фото. Заполните поля вручную.');
  }
});

// ---------- модерация: ИИ по фото (Яндекс AI Studio) ----------
const aiAdminView = () => {
  const s = seoSetting('ai') || {};
  const c = aiCfg();
  return { provider: c ? c.provider : '', on: !!c, off: !!s.off, folder: s.folder || '', hasKey: !!s.key, fromEnv: !s.key && !!process.env.YANDEX_AI_KEY,
    vision: s.vision || YA_VISION, text: s.text === '' ? '' : (s.text || YA_TEXT), defaults: { vision: YA_VISION, text: YA_TEXT } };
};
route('GET', '/api/admin/ai', (ctx) => { requireAdmin(ctx); return aiAdminView(); });
route('PUT', '/api/admin/ai', async (ctx) => {
  const admin = requireAdmin(ctx);
  const b = await readJson(ctx.req);
  const cur = seoSetting('ai') || {};
  const model = (v, d) => { const t = String(v === undefined ? d : v).trim(); if (t && !/^[\w.\-/@]{2,80}$/.test(t)) throw new HttpError(400, 'Имя модели — латиница, цифры, точки и дефисы, например aliceai-llm'); return t; };
  const next = {
    key: b.clear ? '' : (b.key ? String(b.key).trim().slice(0, 300) : cur.key || ''),
    folder: b.clear ? '' : String(b.folder === undefined ? cur.folder || '' : b.folder).trim().slice(0, 60),
    vision: model(b.vision, cur.vision || YA_VISION) || YA_VISION,
    text: model(b.text, cur.text === undefined ? YA_TEXT : cur.text),
    off: !!b.off
  };
  if (next.folder && !/^[a-z0-9]{10,40}$/.test(next.folder)) throw new HttpError(400, 'Идентификатор каталога — строка вида b1g… из консоли Yandex Cloud');
  if (next.key && !next.folder) throw new HttpError(400, 'Укажите идентификатор каталога Yandex Cloud');
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('ai', JSON.stringify(next));
  audit(admin, 'ai-settings', {}, { folder: next.folder, vision: next.vision, text: next.text, off: next.off });
  return aiAdminView();
});
route('POST', '/api/admin/ai/test', async (ctx) => {
  requireAdmin(ctx);
  const c = aiCfg();
  if (!c || c.provider !== 'yandex') throw new HttpError(400, 'Сначала сохраните ключ и каталог Яндекс AI Studio');
  try { return { ok: true, answer: await pingYandex(c) }; } catch (e) { throw new HttpError(502, e.status === 401 || e.status === 403 ? 'Ключ не подошёл: проверьте API-ключ и что у сервисного аккаунта есть роль ai.languageModels.user' : e.message); }
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
  alerts.seenPrices(u.id);
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
  else {
    db.prepare('INSERT INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, ?)').run(u.id, id, now());
    stats.countFav(ctx, loadListing(id));
  }
  return { fav: !exists, favCount: db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE listing_id = ?').get(id).n };
});

// 1.43.0: как быстро отвечает продавец — по его чатам за 30 дней (первое сообщение покупателя → первый ответ продавца).
// Только при 5+ таких чатах; чат без ответа считается, когда покупатель ждёт больше суток. Пересчёт — не чаще раза в 10 минут.
const replyCache = new Map();
const REPLY_TTL = process.env.REPLY_CACHE_MS ? Number(process.env.REPLY_CACHE_MS) : 10 * 60 * 1000; // в тестах — 1
function replyStats(sellerId) {
  const t = now();
  const hit = replyCache.get(sellerId);
  if (hit && hit.at > t - REPLY_TTL) return hit.v;
  const rows = db.prepare(`SELECT c.id, (SELECT MIN(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = c.buyer_id) AS asked
    FROM conversations c WHERE c.seller_id = ? AND c.created_at > ? ORDER BY c.id DESC LIMIT 200`).all(sellerId, t - 30 * DAY);
  const firstReply = db.prepare('SELECT MIN(created_at) AS at FROM messages WHERE conversation_id = ? AND sender_id = ? AND created_at >= ?');
  const delays = [];
  let total = 0;
  for (const r of rows) {
    if (!r.asked) continue;
    const at = firstReply.get(r.id, sellerId, r.asked).at;
    if (at) { delays.push(at - r.asked); total++; } else if (t - r.asked > DAY) total++;
  }
  let v = null;
  if (total >= 5) {
    delays.sort((a, b) => a - b);
    const med = delays.length ? delays[Math.floor(delays.length / 2)] : null;
    const H = 3600 * 1000;
    v = { rate: Math.round((delays.length / total) * 10), time: med === null ? '' : med <= H ? 'hour' : med <= 3 * H ? 'hours' : med <= DAY ? 'day' : 'days' };
  }
  if (replyCache.size > 5000) replyCache.clear();
  replyCache.set(sellerId, { at: t, v });
  return v;
}

function unreadCount(userId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE (c.buyer_id = ? OR c.seller_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`).get(userId, userId, userId).n;
}

route('GET', '/api/conversations', (ctx) => {
  const u = requireUser(ctx);
  const rows = db.prepare(`
    SELECT c.id, c.listing_id, c.buyer_id, c.seller_id, c.updated_at, l.title, l.price, l.price_unit, l.status,
      (SELECT COALESCE(NULLIF(p.thumb, ''), p.file) FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
      ou.id AS other_id, ou.name AS other_name, ou.avatar AS other_avatar,
      (SELECT CASE WHEN body = '' AND photo != '' THEN '📷 Фото' ELSE body END FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
    FROM conversations c
    JOIN listings l ON l.id = c.listing_id
    JOIN users ou ON ou.id = CASE WHEN c.buyer_id = ? THEN c.seller_id ELSE c.buyer_id END
    WHERE c.buyer_id = ? OR c.seller_id = ?
    ORDER BY c.updated_at DESC`).all(u.id, u.id, u.id, u.id);
  return {
    items: rows.map((r) => ({
      id: r.id, listingId: r.listing_id, title: r.title, price: r.price, priceUnit: r.price_unit, status: r.status,
      photo: photoUrl(r.photo), other: { id: r.other_id, name: r.other_name, avatar: photoUrl(r.other_avatar) }, lastBody: r.last_body || '',
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
  rateLimit(`conv:${u.id}`, 30, 60 * 60 * 1000); // 1.41.0: защита от рассылки — не больше 30 новых диалогов в час
  const t = now();
  const info = db.prepare('INSERT INTO conversations (listing_id, buyer_id, seller_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(listingId, u.id, l.user_id, t, t);
  return { id: Number(info.lastInsertRowid) };
});

// Фото в сообщении: своё загруженное фото, ещё не привязанное к объявлению и не фото профиля.
function chatPhoto(u, file) {
  if (!file) return '';
  const f = String(file);
  const row = db.prepare('SELECT listing_id FROM uploads WHERE file = ? AND user_id = ?').get(f, u.id);
  if (!row || row.listing_id !== null || db.prepare('SELECT 1 FROM users WHERE avatar = ?').get(f)) throw new HttpError(400, 'Сначала загрузите фото');
  return f;
}
helpers.chatPhoto = chatPhoto;
const msgPreview = (body, photo) => body || (photo ? '📷 Фото' : '');

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
  const messages = db.prepare('SELECT id, sender_id, body, photo, kind, offer_id, created_at, read_at FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 500')
    .all(c.id, after).map((m) => ({ id: m.id, mine: m.sender_id === u.id, body: m.body, photo: photoUrl(m.photo), kind: m.kind, offerId: m.offer_id, createdAt: m.created_at, read: !!m.read_at }));
  const l = loadListing(c.listing_id, { deleted: true });
  const otherId = c.buyer_id === u.id ? c.seller_id : c.buyer_id;
  const other = db.prepare('SELECT id, name, avatar, created_at FROM users WHERE id = ?').get(otherId);
  const photo = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position LIMIT 1').get(c.listing_id);
  return {
    conversation: { id: c.id, role: c.buyer_id === u.id ? 'buyer' : 'seller' },
    deal: reputation.chatState(u.id, c), // 1.46.0: «Сделка состоялась?», комплименты, «Что-то пошло не так»
    listing: { id: l.id, title: l.title, price: l.price, priceUnit: l.price_unit, status: l.status, bargain: !!l.bargain, delivery: !!l.delivery, city: l.city, metro: l.metro || '', photo: photoUrl(photo && photo.file) },
    // 1.27: оценка собеседника — для колонки «Объявление и продавец» справа от чата
    other: { id: other.id, name: other.name, avatar: photoUrl(other.avatar), createdAt: other.created_at, rep: reputation.levelOf(other.id) },
    offers: deals.offersOf(c.id), // состояния всех предложений — обновляются при каждом опросе
    messages
  };
});

route('POST', '/api/conversations/:id/messages', async (ctx) => {
  const u = requireUser(ctx);
  rateLimit(`msg:${u.id}`, 40, 60 * 1000);
  const c = loadConversation(u, parseInt(ctx.params.id, 10));
  const input = await readJson(ctx.req);
  const body = str(input.body, 2000);
  const photo = chatPhoto(u, input.photo);
  if (!body && !photo) throw new HttpError(400, 'Пустое сообщение');
  const other = db.prepare('SELECT deactivated_at, deleted_at FROM users WHERE id = ?').get(c.buyer_id === u.id ? c.seller_id : c.buyer_id);
  if (other && (other.deactivated_at || other.deleted_at)) throw new HttpError(400, 'Собеседник удалил профиль — сообщения не доставляются');
  const t = now();
  const info = db.prepare('INSERT INTO messages (conversation_id, sender_id, body, photo, created_at) VALUES (?, ?, ?, ?, ?)').run(c.id, u.id, body, photo, t);
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(t, c.id);
  const l = loadListing(c.listing_id, { deleted: true });
  alerts.notify(c.buyer_id === u.id ? c.seller_id : c.buyer_id, 'messages', { title: `${u.name} · ${l.title}`, body: msgPreview(body, photo).slice(0, 180), url: `/messages/${c.id}`, tag: `chat-${c.id}`, urgent: true });
  return { message: { id: Number(info.lastInsertRowid), mine: true, body, photo: photoUrl(photo), createdAt: t, read: false } };
});

route('GET', '/api/users/:id', (ctx) => {
  const id = parseInt(ctx.params.id, 10);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u || u.is_blocked || u.deactivated_at || u.deleted_at) throw new HttpError(404, 'Пользователь не найден');
  const uid = ctx.user ? ctx.user.id : 0;
  const items = db.prepare(`${CARD_SELECT} WHERE l.user_id = ? AND l.status = 'active' ORDER BY l.created_at DESC LIMIT 60`).all(uid, id)
    .map((r) => ({ ...cardFromRow(r), seller: null })); // в профиле продавца все объявления его — строка продавца не нужна
  const sold = db.prepare('SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = \'sold\'').get(id).n;
  return { user: { id: u.id, name: u.name, city: u.city, avatar: photoUrl(u.avatar), createdAt: u.created_at, soldCount: sold, activeCount: items.length, emailVerified: !!u.email_verified, rep: reputation.repOf(u.id), badges: badgesOf(u), shop: business.shopOf(u),
    followers: deals.followers(u.id), following: deals.isFollowing(uid, u.id) }, items };
});

// Юридические документы (реквизиты и раздел «Запрещено» подставляются на сервере).
route('GET', '/api/pages/:slug', (ctx) => {
  const d = legal.docs({ ai: (aiCfg() || {}).provider || false, metrika: !!(seoSetting('seo') || {}).metrika })[ctx.params.slug];
  if (!d) throw new HttpError(404, 'Страница не найдена');
  return { title: d[0], html: d[1] };
});

// Раздел «Почта» в модерации: подключение, проверка, журнал отправки.
route('GET', '/api/admin/mail', (ctx) => {
  requireAdmin(ctx);
  return { config: mailer.publicConfig(), stats: mailer.stats(), codes: codesOn() };
});

route('PUT', '/api/admin/mail/codes', async (ctx) => {
  const a = requireAdmin(ctx);
  const on = (await readJson(ctx.req)).on === true;
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('mail_codes', JSON.stringify({ on, at: Date.now(), by: a.id }));
  return { codes: on };
});

route('PUT', '/api/admin/mail', async (ctx) => {
  requireAdmin(ctx);
  try { return { config: mailer.saveConfig(await readJson(ctx.req)) }; } catch (e) { throw new HttpError(400, e.message); }
});

route('POST', '/api/admin/mail/test', async (ctx) => {
  const admin = requireAdmin(ctx);
  rateLimit(`mailtest:${admin.id}`, 10, 10 * 60 * 1000);
  const to = str((await readJson(ctx.req)).to, 120) || admin.email;
  try { await mailer.sendTest(to); } catch (e) { throw new HttpError(502, e.message); }
  return { ok: true, to };
});

// Раздел «Версия сайта»: состояние автообновления из ветки release (файл пишет deploy/update.sh).
route('GET', '/api/admin/update', (ctx) => {
  requireAdmin(ctx);
  try { return { update: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'update-status.json'), 'utf8')) }; } catch { return { update: null }; }
});

// ---------- статика ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  // HTTPS запоминается браузером на год (без поддоменов: stats.torgana.ru — отслеживание переходов SMTP.BZ по http).
  ...(PUBLIC_URL.startsWith('https://') ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  // mc.yandex.ru — Яндекс.Метрика (загружается только после согласия на статистические cookie).
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https://mc.yandex.ru https://mc.yandex.com; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self' blob:; connect-src 'self' https://mc.yandex.ru https://mc.yandex.com; script-src 'self' https://mc.yandex.ru; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

// Карта Яндекса живёт в отдельной странице-рамке со своей политикой безопасности:
// основной сайт не пускает чужие скрипты, а скрипты карт работают только внутри рамки.
// Рамка открывается в песочнице (без доступа к сайту, cookie и входу); точки получает сообщением от страницы поиска.
const MAP_FRAME = fs.readFileSync(path.join(__dirname, 'lib/map-frame.html'), 'utf8');
function serveMapFrame(res) {
  const key = (seoSetting('seo') || {}).mapsKey || '';
  const nonce = crypto.randomBytes(16).toString('base64');
  const Y = 'https://*.yandex.ru https://*.yandex.net https://yandex.ru https://yastatic.net https://*.yastatic.net';
  res.writeHead(key ? 200 : 404, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' ${Y}; style-src 'unsafe-inline' blob: ${Y}; img-src 'self' data: blob: ${Y}; connect-src ${Y}; frame-src ${Y}; font-src ${Y}; worker-src blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`
  });
  if (!key) { res.end('Карта не подключена'); return; }
  res.end(MAP_FRAME.replace(/__NONCE__/g, nonce).replace('__KEY__', encodeURIComponent(key)));
}

// 1.41.0: ETag — браузер переспрашивает файл (иконки, манифест, sw.js) и получает 304 без повторной загрузки.
function serveFile(res, filePath, cache, req = null) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Не найдено');
      return;
    }
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    if (req && req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache,
      ETag: etag,
      ...SECURITY_HEADERS
    });
    if (req && req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).pipe(res);
  });
}

// Видео отдаём частями (Range): браузер сразу начинает показ и может перематывать.
function serveVideo(req, res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Не найдено'); return; }
    const base = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', ...SECURITY_HEADERS };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (!m || (m[1] === '' && m[2] === '')) {
      res.writeHead(200, { ...base, 'Content-Length': st.size });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    let start = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1]);
    let end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
}

// Версия интерфейса: хеш app.js и app.css. Попадает в адреса файлов в index.html (?v=…),
// поэтому после обновления браузер сразу берёт свежие файлы, а не держит старые из кеша.
const ASSET_VERSION = crypto.createHash('sha1')
  .update(fs.readFileSync(path.join(PUBLIC_DIR, 'assets/app.js')))
  .update(fs.readFileSync(path.join(PUBLIC_DIR, 'assets/app.css')))
  .digest('hex').slice(0, 10);
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
  .replace(/(\/assets\/app\.(?:css|js))"/g, `$1?v=${ASSET_VERSION}"`);

// Страница приложения: заголовок, описание, карточка для мессенджеров и снимок содержимого для поисковиков (lib/seo.js).
function serveIndex(res, pathname) {
  let page;
  try { page = seo.inject(INDEX_HTML, pathname); } catch (e) { console.error('seo:', e.message); page = { status: 200, html: INDEX_HTML }; }
  const body = Buffer.from(page.html);
  res.writeHead(page.status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    ...SECURITY_HEADERS
  });
  res.end(body);
}
function serveText(res, type, text) {
  const body = Buffer.from(text);
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'public, max-age=1800', ...SECURITY_HEADERS });
  res.end(body);
}

function serveStatic(req, res, pathname, search) {
  if (pathname.startsWith('/uploads/')) {
    const name = pathname.slice('/uploads/'.length);
    if (video.NAME_RE.test(name)) { serveVideo(req, res, path.join(UPLOAD_DIR, name)); return; }
    if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) { res.writeHead(404); res.end(); return; }
    serveFile(res, path.join(UPLOAD_DIR, name), 'public, max-age=31536000, immutable', req);
    return;
  }
  if (pathname !== '/' && pathname !== '/index.html' && !pathname.includes('..')) {
    const filePath = path.join(PUBLIC_DIR, pathname);
    if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const versioned = search === `?v=${ASSET_VERSION}`;
      const cache = versioned ? 'public, max-age=31536000, immutable'
        : pathname.startsWith('/assets/fonts/') ? 'public, max-age=2592000' : 'no-cache';
      serveFile(res, filePath, cache, req);
      return;
    }
  }
  if (pathname === '/map-frame') { serveMapFrame(res); return; }
  if (pathname === '/sitemap.xml') { serveText(res, 'application/xml; charset=utf-8', seo.sitemap()); return; }
  if (pathname === '/robots.txt') { serveText(res, 'text/plain; charset=utf-8', seo.robots()); return; }
  // Все остальные пути — страницы приложения.
  serveIndex(res, pathname);
}

// ---------- сервер ----------

// 1.41.0: www.torgana.ru → torgana.ru одним адресом (301), чтобы не было дублей страниц.
const CANON_HOST = PUBLIC_URL ? new URL(PUBLIC_URL).host : '';

const server = http.createServer(async (req, res) => {
  let url; let pathname;
  // Битая кодировка в адресе (%E0%A4%A) раньше роняла весь процесс — теперь просто 400.
  try { url = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(url.pathname); } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Неверный адрес'); return;
  }
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (CANON_HOST && reqHost === `www.${CANON_HOST}` && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(301, { Location: `${PUBLIC_URL.replace(/\/$/, '')}${req.url}`, 'Cache-Control': 'public, max-age=86400' }); res.end(); return;
  }

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    serveStatic(req, res, pathname, url.search);
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
    if (result && result[REDIRECT]) { res.writeHead(302, { ...headers, Location: result[REDIRECT], 'Cache-Control': 'no-store' }); res.end(); return; }
    if (result && result[FILE]) {
      const f = result[FILE]; const body = Buffer.from(f.body);
      res.writeHead(200, { ...headers, 'Content-Type': f.type, 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${f.name}"` });
      res.end(body); return;
    }
    sendJson(res, 200, result, headers);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) { console.error(e); ops.onError(e); }
    sendJson(res, status, { error: status === 500 ? 'Что-то пошло не так. Попробуйте ещё раз.' : e.message, ...(e.extra || {}) }, headers);
  }
});

// Чистим просроченные сессии и брошенные загрузки раз в час.
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  const old = db.prepare(`SELECT file, thumb FROM uploads WHERE listing_id IS NULL AND created_at < ? AND file NOT IN (SELECT avatar FROM users WHERE avatar != '')
    AND file NOT IN (SELECT photo FROM messages WHERE photo != '') AND file NOT IN (SELECT photo FROM support_messages WHERE photo != '')
    AND file NOT IN (SELECT shop_cover FROM users WHERE shop_cover != '')`).all(now() - 24 * 3600 * 1000);
  removeUploadFiles(old);
  for (const { file } of old) db.prepare('DELETE FROM uploads WHERE file = ?').run(file);
  video.cleanup();
}, 60 * 60 * 1000).unref();
metro.start();
ops.start(Number(process.env.OPS_TICK_MS) || undefined);

mailer.start();
// 1.14: вход только с подтверждённой почтой. Один раз завершаем старые сессии с неподтверждённой почтой —
// при следующем входе придёт код.
if (mailer.ready() && !db.prepare('SELECT 1 FROM settings WHERE key = ?').get('codes_v1')) {
  const n = db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email_verified = 0)').run().changes;
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('codes_v1', JSON.stringify({ at: Date.now(), signedOut: n }));
  if (n) console.log(`Сессии с неподтверждённой почтой завершены: ${n}`);
}
// 1.35.1: один раз пересобираем текст для поиска — добавились русские написания марок («лада» → Lada).
if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('search_v2')) {
  const rows = db.prepare('SELECT id, title, description, subcategory, attrs FROM listings').all();
  const upd = db.prepare('UPDATE listings SET search_text = ? WHERE id = ?');
  db.exec('BEGIN');
  for (const r of rows) { let attrs = {}; try { attrs = JSON.parse(r.attrs || '{}'); } catch { /* пусто */ } upd.run(searchText(r.title, r.description, { subcategory: r.subcategory, attrs }), r.id); }
  db.exec('COMMIT');
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('search_v2', JSON.stringify({ at: Date.now(), n: rows.length }));
}
// 7 ноября 2026: письма с кодами не доходили — по просьбе владельца коды выключены, пока почту не починят
// (включаются в «Модерация → Почта»). Только на работающем сайте с подключённой почтой и только один раз.
if (mailer.ready() && !db.prepare('SELECT 1 FROM settings WHERE key = ?').get('mail_codes')) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('mail_codes', JSON.stringify({ on: false, at: Date.now(), by: 'owner-request' }));
}
alerts.start({ tickMs: Number(process.env.DIGEST_TICK_MS) || undefined, minAge: process.env.DIGEST_MIN_AGE_MS ? Number(process.env.DIGEST_MIN_AGE_MS) : undefined, anyHour: process.env.DIGEST_ANY_HOUR === '1' });
setInterval(() => { try { listingTick(); } catch (e) { console.error('listings:', e.message); } }, Number(process.env.LISTING_TICK_MS) || 60 * 1000).unref();
// Автопроверка объявлений, которые ждали проверки до появления автопроверок (один раз при запуске).
for (const { id } of db.prepare('SELECT id FROM listings WHERE status = \'pending\' AND checks = \'\'').all()) autoChecks.run(id);

// Страховка: необработанная ошибка в фоне пишется в журнал и владельцу, но не роняет сайт.
process.on('unhandledRejection', (e) => { console.error('unhandledRejection:', e); try { ops.onError(e instanceof Error ? e : new Error(String(e))); } catch { /* нет */ } });

server.listen(PORT, HOST, () => {
  console.log(`Торгана запущена: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!ADMIN_EMAILS.length) console.log('Подсказка: задайте ADMIN_EMAIL в .env, чтобы получить доступ к модерации.');
  if (!aiCfg()) console.log('ИИ-подсказки по фото выключены: подключите Яндекс AI Studio в модерации («Настройки → ИИ по фото»).');
});

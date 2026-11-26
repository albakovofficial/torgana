'use strict';

// Торгана — площадка объявлений. Сервер без внешних зависимостей: Node.js 22+ и встроенная SQLite.
// Здесь — настройки, подключение разделов и сам сервер; разделы живут в lib/ (по файлу на раздел).
try { process.loadEnvFile(); } catch { /* .env не обязателен */ }

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { openDb } = require('./lib/db');
const { HttpError, readJson, rateLimit } = require('./lib/http');
const auth = require('./lib/auth');
const { CATEGORIES, CATEGORY_IDS } = require('./lib/constants');
const { norm, searchSpec, specSql } = require('./lib/search');
const { createMailer } = require('./lib/mailer');
const legal = require('./lib/legal');
const taxonomy = require('./lib/taxonomy');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const UPLOAD_DIR = path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const BASE_URL = PUBLIC_URL || `http://localhost:${PORT}`;
const SECURE_COOKIES = PUBLIC_URL.startsWith('https://');
// Модераторы — адреса из ADMIN_EMAIL через запятую; первый адрес — владелец площадки.
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const OWNER_EMAIL = ADMIN_EMAILS[0] || '';
const LISTING_TTL = Number(process.env.LISTING_TTL_MS) || 30 * 24 * 3600 * 1000; // срок показа объявления (в тестах — короче)

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
  baseUrl: BASE_URL,
  supportEmail: legal.operator().email,
  tickMs: Number(process.env.MAIL_TICK_MS) || undefined,
  chatDelayMs: process.env.CHAT_NOTIFY_DELAY_MS ? Number(process.env.CHAT_NOTIFY_DELAY_MS) : undefined,
  chatGapMs: process.env.CHAT_NOTIFY_GAP_MS ? Number(process.env.CHAT_NOTIFY_GAP_MS) : undefined,
  modGapMs: process.env.MOD_NOTIFY_GAP_MS ? Number(process.env.MOD_NOTIFY_GAP_MS) : undefined
});
// Коды по почте (6 цифр при регистрации и входе, код для модерации) можно временно выключить в «Модерация → Почта»,
// например пока письма не доходят. Выключены — вход без кода, как до 1.14.
const codesOn = () => mailer.ready() && (db.setting('mail_codes') || {}).on !== false;

// ---------- разделы ----------
// h — общий набор помощников и разделов. Раздел берёт из h то, что нужно ему при запросе (h.alerts, h.business…),
// поэтому порядок подключения важен только для того, что раздел использует сразу при создании.

const SECURITY_HEADERS = require('./lib/headers')({ publicUrl: PUBLIC_URL });
let ops = null; // lib/ops.js — подключается ниже; до него ошибки только в журнал
const api = require('./lib/router')({ db, trustProxy: process.env.TRUST_PROXY === '1', headers: SECURITY_HEADERS, onError: (e) => ops && ops.onError(e) });
const { route } = api;

const now = () => Date.now();
const str = (v, max) => String(v ?? '').trim().slice(0, max);
function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Нужно войти в аккаунт');
  if (ctx.user.is_blocked) throw new HttpError(403, 'Аккаунт заблокирован. Напишите в поддержку.');
  if (ctx.user.deactivated_at) { const e = new HttpError(403, 'Профиль удалён — восстановите его, чтобы продолжить'); e.extra = { deactivated: true }; throw e; }
  return ctx.user;
}
// Модерация: с 1.18 — ещё и подтверждённое устройство (lib/ops.js: код из письма, помним 30 дней).
function requireAdmin(ctx) {
  if (ops) return ops.requireAdmin(ctx);
  const u = requireUser(ctx);
  if (!u.is_admin) throw new HttpError(403, 'Нет доступа');
  return u;
}

const h = { HttpError, readJson, rateLimit, requireUser, requireAdmin, str, now, norm, taxonomy, OWNER_EMAIL, redirect: api.redirect, file: api.file, PUBLIC_URL: BASE_URL };
const mod = (name, deps = {}) => require(`./lib/${name}`)({ route, db, h, ...deps });

h.metro = require('./lib/metro')({ dataDir: DATA_DIR }); // станции метро (справочник hh.ru)
h.video = mod('video', { dir: UPLOAD_DIR });
h.attach = mod('attach', { dir: UPLOAD_DIR, video: h.video });
const uploads = mod('uploads', { dir: UPLOAD_DIR });
Object.assign(h, { photoUrl: uploads.photoUrl, setAvatar: uploads.setAvatar });
const cards = mod('cards');
Object.assign(h, { cardFromRow: cards.cardFromRow, attrsOf: cards.attrsOf });
const listings = mod('listings', { cards, uploads, ttl: LISTING_TTL });
Object.assign(h, { loadListing: listings.loadListing, publishListing: listings.publishListing, marketEstimate: listings.marketEstimate });
const chat = mod('chat');
Object.assign(h, { replyStats: chat.replyStats, unreadCount: chat.unreadCount, chatPhoto: chat.chatPhoto });

h.autoChecks = require('./lib/checks')({ db, marketEstimate: listings.marketEstimate });
h.goodPrice = require('./lib/goodprice')({ db }); // 1.48.0: «Хорошая цена»
// Push — только в приложение Торгана для iPhone (Apple APNs). 1.60.0: push в браузер (web-push) убраны.
h.apns = mod('apns', { testUrl: process.env.APNS_TEST_URL || '' });
db.exec("DROP TABLE IF EXISTS push_subs; DELETE FROM settings WHERE key = 'vapid';"); // подписки браузеров и их ключ больше не нужны
h.alerts = mod('alerts', { mailer, apns: h.apns, categories: CATEGORIES });
h.apns.setBadge((uid) => chat.unreadCount(uid) + h.alerts.unreadNotices(uid)); // число на значке приложения
const { logEvent, audit } = mod('moderation', { mailer }); // очередь, проверка, жалобы, история
Object.assign(h, { logEvent, audit }); // журнал модерации нужен и отзывам, и поддержке
h.support = mod('support', { mailer });
h.stats = mod('stats');
h.trust = mod('trust', { mailer, dataDir: DATA_DIR }); // «Телефон подтверждён», проверенный бизнес
h.adminApi = mod('admin', { trust: h.trust }); // сводка, пользователи, журнал, письма модератору
h.sources = mod('sources'); // откуда пришли люди (1.38)
h.oauth = mod('oauth', { auth, baseUrl: BASE_URL, secureCookies: SECURE_COOKIES, adminEmails: ADMIN_EMAILS, testBase: process.env.OAUTH_TEST_BASE || '' });
h.categoryIds = CATEGORY_IDS;
// Платные услуги: оплата через ЮKassa, тарифы «Магазин» и «Магазин Про», реклама в ленте, продвижение.
h.billing = mod('billing', { mailer, baseUrl: BASE_URL, testBase: process.env.YOOKASSA_TEST_BASE || '' });
h.business = mod('business', { billing: h.billing, mailer, stats: h.stats });
h.promo = mod('promo', { billing: h.billing, business: h.business, stats: h.stats, mailer, searchSpec, specSql, categoryIds: CATEGORY_IDS });
h.boost = mod('boost', { billing: h.billing }); // XL-карточка, рамка, метки на фото (1.21.0)
h.blocks = mod('blocks'); // 1.48.0: чёрный список
h.first = require('./lib/first')({ db, h, alerts: h.alerts, business: h.business }); // 1.52.0: медаль «Один из первых»
h.deals = mod('deals', { alerts: h.alerts }); // предложение цены, быстрые ответы, подписки
h.reputation = mod('reputation', { replyStats: chat.replyStats }); // 1.46.0: репутация вместо отзывов
// Копия в облако (Selectel S3), письма владельцу о сбоях, вход в модерацию по коду с нового устройства.
ops = mod('ops', { mailer, codesOn, root: ROOT, dataDir: DATA_DIR, uploadDir: UPLOAD_DIR, ownerEmail: OWNER_EMAIL, publicUrl: PUBLIC_URL, secureCookies: SECURE_COOKIES,
  deviceCheck: process.env.ADMIN_DEVICE_CHECK !== '0' });
const profile = mod('profile', { cards, secureCookies: SECURE_COOKIES });
h.badgesOf = profile.badgesOf;
mod('session', { mailer, codesOn, publicUser: profile.publicUser, adminEmails: ADMIN_EMAILS, secureCookies: SECURE_COOKIES });
h.account = require('./lib/account')({ route, db, h: { ...h, secureCookies: SECURE_COOKIES }, removeListing: listings.removeListing, auth }); // удаление профиля (1.39)
h.aiCfg = mod('ai-assist', { uploads, dir: UPLOAD_DIR, anthropicKey: process.env.ANTHROPIC_API_KEY || '', anthropicModel: process.env.AI_MODEL || 'claude-sonnet-5-5' }).aiCfg;
h.seo = require('./lib/seo')({ db, base: BASE_URL, getSetting: db.setting });
// 1.58.0: IndexNow — Яндекс узнаёт о новых, изменённых и снятых объявлениях за минуты (lib/indexnow.js).
h.indexnow = require('./lib/indexnow')({ db, base: PUBLIC_URL, listingPath: h.seo.listingPath, endpoint: process.env.INDEXNOW_URL ?? 'https://yandex.com/indexnow', every: Number(process.env.INDEXNOW_EVERY) || 5 * 60 * 1000 });
mod('site', { mailer, codesOn, dataDir: DATA_DIR });
const { serveStatic } = require('./lib/static')({ db, headers: SECURITY_HEADERS, publicDir: PUBLIC_DIR, uploadDir: UPLOAD_DIR, seo: h.seo, indexnow: h.indexnow, apns: h.apns, video: h.video, attach: h.attach });

// ---------- сервер ----------

// 1.41.0: www.torgana.ru → torgana.ru одним адресом (301), чтобы не было дублей страниц.
const CANON_HOST = PUBLIC_URL ? new URL(PUBLIC_URL).host : '';

const server = http.createServer((req, res) => {
  let url; let pathname;
  // Битая кодировка в адресе (%E0%A4%A) раньше роняла весь процесс — теперь просто 400.
  try { url = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(url.pathname); } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Неверный адрес'); return;
  }
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (CANON_HOST && reqHost === `www.${CANON_HOST}` && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(301, { Location: `${PUBLIC_URL.replace(/\/$/, '')}${req.url}`, 'Cache-Control': 'public, max-age=86400' }); res.end(); return;
  }
  if (pathname.startsWith('/api/')) { api.handle(req, res, url, pathname); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res, pathname, url.search);
});

// Раз в час: просроченные сессии и брошенные загрузки.
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  uploads.cleanup();
  h.video.cleanup();
  h.attach.cleanup();
}, 60 * 60 * 1000).unref();
h.metro.start();
ops.start(Number(process.env.OPS_TICK_MS) || undefined);
mailer.start();
require('./lib/migrations')({ db, mailer, searchText: listings.searchText, autoChecks: h.autoChecks });
h.alerts.start({ tickMs: Number(process.env.DIGEST_TICK_MS) || undefined, minAge: process.env.DIGEST_MIN_AGE_MS ? Number(process.env.DIGEST_MIN_AGE_MS) : undefined, anyHour: process.env.DIGEST_ANY_HOUR === '1' });
// Раз в минуту: запланированные публикуются, у кого прошло 30 дней — снимаются (lib/listings.js listingTick).
setInterval(() => { try { listings.listingTick(); } catch (e) { console.error('listings:', e.message); } }, Number(process.env.LISTING_TICK_MS) || 60 * 1000).unref();

// Страховка: необработанная ошибка в фоне пишется в журнал и владельцу, но не роняет сайт.
process.on('unhandledRejection', (e) => { console.error('unhandledRejection:', e); try { ops.onError(e instanceof Error ? e : new Error(String(e))); } catch { /* нет */ } });

server.listen(PORT, HOST, () => {
  console.log(`Торгана запущена: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!ADMIN_EMAILS.length) console.log('Подсказка: задайте ADMIN_EMAIL в .env, чтобы получить доступ к модерации.');
  if (!h.aiCfg()) console.log('ИИ-подсказки по фото выключены: подключите Яндекс AI Studio в модерации («Настройки → ИИ по фото»).');
});

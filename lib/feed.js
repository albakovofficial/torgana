'use strict';

// Автозагрузка объявлений из фида — тариф «Магазин Про».
// Формат — XML автозагрузки Авито (<Ads><Ad><Id>, <Title>, <Description>, <Price>, <Category>, <Address>,
// <Condition>, <Images><Image url="…"/></Images>): магазину не нужно готовить отдельный файл.
//
// - Фид по ссылке забирается сразу после сохранения и затем раз в 6 часов (или кнопкой «Загрузить сейчас»).
// - Новое объявление и изменённое (по содержимому) отправляются на проверку модератору — как из формы.
// - Объявление, которого больше нет в фиде, снимается с публикации; появится снова — вернётся на проверку.
// - Фото скачиваются по ссылкам из фида и проверяются так же, как загруженные вручную.
// - Сервер ходит только на внешние адреса: ссылки на внутреннюю сеть (localhost, 10.x, 192.168.x и т. п.) отклоняются.
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const crypto = require('node:crypto');
const { CITIES } = require('./constants');

const MAX_XML = 15 * 1024 * 1024;
const MAX_IMAGE = 6 * 1024 * 1024;
const MAX_ADS = 1000;
const EVERY = 6 * 3600 * 1000;

// Категории Авито → категории Торганы. Проверяются по порядку по полям Category, GoodsType и т. п.
const CAT_MAP = [
  [/ваканси|резюме/, 'jobs'],
  [/предложени[ея] услуг|^услуги/, 'services'],
  [/готовый бизнес|оборудование для бизнеса/, 'business'],
  [/собак|кошк|птиц|аквариум|животн|грызун|товары для животных/, 'animals'],
  [/квартир|комнат|дома, дачи|коттедж|земельн|гараж|машиномест|коммерческая недвижимость|недвижимость за рубежом/, 'realty'],
  [/автомобил|мотоцикл|мототехник|грузовик|спецтехник|водный транспорт|запчаст|шины|диски|транспорт/, 'transport'],
  [/телефон|ноутбук|планшет|компьютер|аудио и видео|фототехник|игры, приставки|оргтехник|электроник|товары для компьютера/, 'electronics'],
  [/одежда|обувь|аксессуар|часы и украшения|красота и здоровье|товары для детей|игрушк/, 'personal'],
  [/мебель|интерьер|ремонт и строительство|посуда|товары для кухни|бытовая техника|растения|продукты питания|для дома/, 'home'],
  [/спорт|отдых|велосипед|книг|журнал|коллекционир|музыкальн|охот|рыбалк|билет|путешеств|хобби/, 'hobby']
];

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  if (x.startsWith('::ffff:')) return isPrivateIp(x.slice(7));
  return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb');
}

// GET с ограничением размера, времени и адресов. Переадресации (до 3) проверяются так же.
function safeGet(url, { max, allowLocal = false, timeout = 30000, redirects = 3 }) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { reject(new Error('неверная ссылка')); return; }
    if (!/^https?:$/.test(u.protocol)) { reject(new Error('ссылка должна начинаться с http:// или https://')); return; }
    if (!allowLocal && u.port && !['80', '443'].includes(u.port)) { reject(new Error('нестандартный порт в ссылке')); return; }
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (!allowLocal && net.isIP(host) && isPrivateIp(host)) { reject(new Error('ссылка ведёт во внутреннюю сеть')); return; }
    const lookup = (hostname, opts, cb) => dns.lookup(hostname, opts, (err, addr, fam) => {
      if (err) return cb(err);
      const list = Array.isArray(addr) ? addr : [{ address: addr, family: fam }];
      if (!allowLocal && list.some((a) => isPrivateIp(a.address))) return cb(new Error('ссылка ведёт во внутреннюю сеть'));
      return Array.isArray(addr) ? cb(null, addr) : cb(null, addr, fam);
    });
    const req = (u.protocol === 'https:' ? https : http).get(u, { lookup, headers: { 'User-Agent': 'TorganaFeed/1.0 (+https://torgana.ru/business)', Accept: '*/*' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects <= 0) { reject(new Error('слишком много переадресаций')); return; }
        safeGet(new URL(res.headers.location, u).href, { max, allowLocal, timeout, redirects: redirects - 1 }).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`сервер ответил ${res.statusCode}`)); return; }
      if (Number(res.headers['content-length']) > max) { res.destroy(); reject(new Error(`файл больше ${Math.round(max / 1048576)} МБ`)); return; }
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > max) { res.destroy(); reject(new Error(`файл больше ${Math.round(max / 1048576)} МБ`)); } else chunks.push(c); });
      res.on('end', () => { if (size <= max) resolve(Buffer.concat(chunks)); });
      res.on('error', reject);
    });
    req.setTimeout(timeout, () => req.destroy(new Error('сервер не ответил вовремя')));
    req.on('error', (e) => reject(new Error(e.message)));
  });
}

// ---------- разбор XML Авито ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));
// Содержимое тега: CDATA как есть, остальное — с раскодированием сущностей.
function inner(s) {
  const parts = []; let rest = s;
  for (;;) {
    const i = rest.indexOf('<![CDATA[');
    if (i < 0) { parts.push(decode(rest)); break; }
    parts.push(decode(rest.slice(0, i)));
    const j = rest.indexOf(']]>', i);
    parts.push(rest.slice(i + 9, j < 0 ? undefined : j));
    if (j < 0) break;
    rest = rest.slice(j + 3);
  }
  return parts.join('');
}
const tag = (block, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(block); return m ? inner(m[1]).trim() : ''; };
// Описание в фиде бывает в HTML (<p>, <br>, <ul><li>) — переводим в обычный текст.
const htmlToText = (s) => decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ''))
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function parseFeed(xml) {
  const ads = [];
  const re = /<Ad(?:\s[^>]*)?>([\s\S]*?)<\/Ad>/g;
  let m;
  while ((m = re.exec(xml)) && ads.length < MAX_ADS + 1) {
    const b = m[1];
    const imagesBlock = tag(b, 'Images') ? (/<Images(?:\s[^>]*)?>([\s\S]*?)<\/Images>/.exec(b) || [])[1] || '' : '';
    const images = [...imagesBlock.matchAll(/<Image\s[^>]*url\s*=\s*"([^"]+)"/g)].map((x) => decode(x[1]))
      .concat([...imagesBlock.matchAll(/<Image>([\s\S]*?)<\/Image>/g)].map((x) => inner(x[1]).trim()))
      .filter((x) => /^https?:\/\//i.test(x)).slice(0, 10);
    ads.push({
      id: tag(b, 'Id'),
      title: tag(b, 'Title'),
      description: htmlToText(tag(b, 'Description')),
      price: tag(b, 'Price'),
      kinds: ['Category', 'GoodsType', 'GoodsSubType', 'VehicleType', 'ServiceType', 'OperationType'].map((t) => tag(b, t)).filter(Boolean).join(' / '),
      address: tag(b, 'Address') || [tag(b, 'Region'), tag(b, 'City')].filter(Boolean).join(', '),
      condition: tag(b, 'Condition'),
      images
    });
  }
  return ads;
}

function categoryOf(kinds) {
  const k = kinds.toLowerCase().replace(/ё/g, 'е');
  const hit = CAT_MAP.find(([re]) => re.test(k));
  return hit ? hit[1] : '';
}

const lc = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
function cityOf(address) {
  const a = lc(address);
  if (!a) return '';
  const known = CITIES.find((c) => new RegExp(`(^|[\\s,.])(г\\.?\\s*)?${lc(c).replace(/[-]/g, '\\-')}($|[\\s,.])`).test(a));
  if (known) return known;
  const m = /(?:^|,\s*)(?:г\.?\s*|город\s+)([А-ЯЁ][а-яё]+(?:[\s-][А-ЯЁа-яё][а-яё]+)*)/.exec(address);
  return m ? m[1] : '';
}

module.exports = function feed({ route, db, h, business }) {
  const { HttpError, readJson, str, now, rateLimit } = h;
  const allowLocal = process.env.FEED_ALLOW_LOCAL === '1'; // только для тестов

  db.exec(`
    -- Объявления из фида: внешний Id магазина → объявление Торганы, отпечаток содержимого и скачанные фото.
    CREATE TABLE IF NOT EXISTS feed_items (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ext_id TEXT NOT NULL,
      listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
      hash TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '{}',
      gone INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, ext_id)
    );
  `);

  const running = new Set();
  const stateOf = (u) => { try { return JSON.parse(u.feed_state || '{}'); } catch { return {}; } };
  const setState = (id, s) => db.prepare('UPDATE users SET feed_state = ? WHERE id = ?').run(JSON.stringify(s), id);
  const publicFeed = (u) => ({ url: u.feed_url, category: u.feed_category, city: u.feed_city, state: { ...stateOf(u), running: running.has(u.id) }, next: u.feed_url && u.feed_at ? u.feed_at + EVERY : null });

  // Фото из фида: уже скачанное для этого объявления берём повторно, новое — скачиваем.
  async function photosFor(u, item, listingId, prevMap) {
    const out = []; const map = {};
    for (const url of item.images) {
      const prev = prevMap[url];
      const row = prev && db.prepare('SELECT listing_id FROM uploads WHERE file = ? AND user_id = ?').get(prev, u.id);
      if (row && (row.listing_id === null || row.listing_id === listingId)) { out.push(prev); map[url] = prev; continue; }
      try {
        const file = h.saveImage(u.id, await safeGet(url, { max: MAX_IMAGE, allowLocal, timeout: 20000 }));
        out.push(file); map[url] = file;
      } catch { /* фото не скачалось или не картинка — без него */ }
    }
    return { files: out, map };
  }

  async function run(userId) {
    if (running.has(userId)) return;
    running.add(userId);
    const started = now();
    const res = { status: 'ok', at: started, total: 0, created: 0, updated: 0, unchanged: 0, archived: 0, skipped: 0, errors: [], message: '' };
    try {
      let u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!u || !u.feed_url) return;
      const plan = business.planOf(u);
      if (!plan || plan.id !== 'pro' || u.is_blocked) { res.status = 'error'; res.message = 'Автозагрузка работает при оплаченном тарифе «Магазин Про»'; return; }
      db.prepare('UPDATE users SET feed_at = ? WHERE id = ?').run(started, userId);
      let xml;
      try { xml = (await safeGet(u.feed_url, { max: MAX_XML, allowLocal })).toString('utf8'); } catch (e) { res.status = 'error'; res.message = `Не получилось скачать фид: ${e.message}`; return; }
      if (!/<Ads[\s>]/.test(xml)) { res.status = 'error'; res.message = 'Это не похоже на фид автозагрузки Авито: нет тега <Ads>'; return; }
      const ads = parseFeed(xml);
      if (ads.length > MAX_ADS) { res.message = `В фиде больше ${MAX_ADS} объявлений — загружены первые ${MAX_ADS}`; ads.length = MAX_ADS; }
      res.total = ads.length;
      const seen = new Set();
      for (const a of ads) {
        const fail = (error) => { res.skipped++; if (res.errors.length < 30) res.errors.push({ id: a.id, title: a.title, error }); };
        if (!a.id) { fail('нет <Id>'); continue; }
        if (seen.has(a.id)) { fail('повторяется <Id>'); continue; }
        seen.add(a.id);
        u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        const category = categoryOf(a.kinds) || u.feed_category;
        const city = cityOf(a.address) || u.feed_city || u.city;
        const price = a.price ? Math.round(Number(String(a.price).replace(/[^\d.,]/g, '').replace(',', '.'))) : null;
        const hash = crypto.createHash('sha1').update(JSON.stringify([a.title, a.description, a.price, category, city, a.condition, a.images])).digest('hex');
        const row = db.prepare('SELECT * FROM feed_items WHERE user_id = ? AND ext_id = ?').get(userId, a.id);
        const l = row && row.listing_id ? h.loadListing(row.listing_id) : null;
        if (l && row.hash === hash && !row.gone) { res.unchanged++; continue; }
        if (!category) { fail(`категория «${a.kinds || 'не указана'}» не распознана — выберите категорию по умолчанию`); continue; }
        if (!city) { fail('не найден город в <Address> — укажите город по умолчанию'); continue; }
        let prev = {};
        try { prev = JSON.parse(row ? row.images : '{}'); } catch { /* пусто */ }
        const ph = await photosFor(u, a, l ? l.id : null, prev);
        let v;
        try {
          v = h.validateListing({ title: a.title, description: a.description, category, subcategory: h.taxonomy.subFromKinds(category, a.kinds), city, price: Number.isFinite(price) ? price : null, condition: /^нов/i.test(a.condition) ? 'new' : /б\/у|^бу|^used/i.test(a.condition) ? 'used' : '', delivery: false, photos: ph.files });
        } catch (e) { fail(e.message); continue; }
        v.via = 'feed';
        let listingId;
        if (l) { h.updateListing(u, l, v); listingId = l.id; res.updated++; } else { listingId = h.createListing(u, v); res.created++; }
        db.prepare(`INSERT INTO feed_items (user_id, ext_id, listing_id, hash, images, gone, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?)
          ON CONFLICT(user_id, ext_id) DO UPDATE SET listing_id = excluded.listing_id, hash = excluded.hash, images = excluded.images, gone = 0, updated_at = excluded.updated_at`)
          .run(userId, a.id, listingId, hash, JSON.stringify(ph.map), now());
      }
      // Пропавшие из фида — снять с публикации.
      for (const r of db.prepare('SELECT * FROM feed_items WHERE user_id = ? AND gone = 0').all(userId)) {
        if (seen.has(r.ext_id)) continue;
        db.prepare('UPDATE feed_items SET gone = 1, updated_at = ? WHERE user_id = ? AND ext_id = ?').run(now(), userId, r.ext_id);
        const l = r.listing_id ? h.loadListing(r.listing_id) : null;
        if (l && ['active', 'pending'].includes(l.status)) {
          db.prepare('UPDATE listings SET status = \'archived\', updated_at = ? WHERE id = ?').run(now(), l.id);
          h.logEvent(l.id, userId, 'status', { status: 'archived', via: 'feed' });
          res.archived++;
        }
      }
    } catch (e) {
      console.error('feed:', e);
      res.status = 'error'; res.message = 'Сбой при загрузке фида — попробуйте ещё раз позже';
    } finally {
      res.ms = now() - started;
      running.delete(userId);
      setState(userId, res);
    }
  }

  // ---------- настройки ----------
  route('PUT', '/api/my/feed', async (ctx) => {
    const u = business.requirePlan(ctx, 'pro');
    const b = await readJson(ctx.req);
    const url = str(b.url, 1000);
    if (url) {
      let p;
      try { p = new URL(url); } catch { throw new HttpError(400, 'Проверьте ссылку на фид'); }
      if (!/^https?:$/.test(p.protocol)) throw new HttpError(400, 'Ссылка на фид должна начинаться с http:// или https://');
    }
    const category = h.categoryIds.has(b.category) ? b.category : '';
    const city = str(b.city, 60);
    db.prepare('UPDATE users SET feed_url = ?, feed_category = ?, feed_city = ?, feed_at = 0 WHERE id = ?').run(url, category, city, u.id);
    if (url) setImmediate(() => run(u.id));
    return { feed: publicFeed(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) };
  });

  route('POST', '/api/my/feed/run', (ctx) => {
    const u = business.requirePlan(ctx, 'pro');
    if (!u.feed_url) throw new HttpError(400, 'Сначала укажите ссылку на фид');
    if (running.has(u.id)) throw new HttpError(409, 'Фид уже загружается');
    rateLimit(`feed:${u.id}`, 6, 60 * 60 * 1000);
    setImmediate(() => run(u.id));
    return { ok: true };
  });

  // Каждые 10 минут: чьи фиды пора обновить (раз в 6 часов), по одному.
  async function tick() {
    const due = db.prepare('SELECT id FROM users WHERE feed_url != \'\' AND plan = \'pro\' AND plan_until > ? AND is_blocked = 0 AND feed_at < ? ORDER BY feed_at LIMIT 5').all(now(), now() - EVERY);
    for (const { id } of due) await run(id);
  }
  setInterval(() => { tick().catch((e) => console.error('feed tick:', e.message)); }, 10 * 60 * 1000).unref();

  return { run, publicFeed, parseFeed, categoryOf, cityOf, isPrivateIp, running };
};

// Разбор фида и проверка адресов — без базы (для тестов).
Object.assign(module.exports, { parseFeed, categoryOf, cityOf, isPrivateIp, safeGet });

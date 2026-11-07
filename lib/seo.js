'use strict';

// Страницы для поисковиков и мессенджеров. Сайт — одностраничное приложение, поэтому сервер сам кладёт в index.html:
// - <title>, description, canonical, robots (закрытые разделы — noindex), Open Graph (карточка при пересылке ссылки),
//   разметку schema.org (объявление — Product/Offer, хлебные крошки);
// - снимок содержимого в <main id="app">: заголовок, цена, фото, описание, ссылки — его читают Яндекс и Google,
//   а браузер сразу заменяет его настоящей страницей;
// - код подтверждения Вебмастера и Search Console (их вводит модератор).
// Отсюда же — /sitemap.xml и /robots.txt.
const { CATEGORIES, CITIES } = require('./constants');

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
// «Велосипед Stels 26"» → velosiped-stels-26 (то же правило — в app.js).
const slugify = (s) => String(s || '').toLowerCase().split('').map((c) => (TR[c] !== undefined ? TR[c] : c)).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
const CITY_BY_SLUG = Object.fromEntries(CITIES.map((c) => [slugify(c), c]));
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
// Предложный падеж для заголовков «в Казани»: самые частые; для остальных — «город Х».
const IN_CITY = { Москва: 'в Москве', 'Санкт-Петербург': 'в Санкт-Петербурге', Новосибирск: 'в Новосибирске', Екатеринбург: 'в Екатеринбурге', Казань: 'в Казани', 'Нижний Новгород': 'в Нижнем Новгороде', Челябинск: 'в Челябинске', Красноярск: 'в Красноярске', Самара: 'в Самаре', Уфа: 'в Уфе', 'Ростов-на-Дону': 'в Ростове-на-Дону', Омск: 'в Омске', Краснодар: 'в Краснодаре', Воронеж: 'в Воронеже', Пермь: 'в Перми', Волгоград: 'в Волгограде', Саратов: 'в Саратове', Тюмень: 'в Тюмени', Тольятти: 'в Тольятти', Ижевск: 'в Ижевске', Барнаул: 'в Барнауле' };
const inCity = (c) => IN_CITY[c] || `в городе ${c}`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };
const NF = new Intl.NumberFormat('ru-RU');
const priceText = (p, unit) => (p === null || p === undefined ? 'цена договорная' : `${NF.format(p)} ₽${unit ? ` за ${unit}` : ''}`);
const listingPath = (l) => `/l/${l.id}${slugify(l.title) ? `-${slugify(l.title)}` : ''}`;

// Закрытые от поиска разделы: личное, служебное, формы.
const PRIVATE = /^\/(profile|messages|admin|new|edit|login|register|confirm|forgot|reset|verify|unsubscribe|pay|favorites|search)(\/|$)/;

module.exports = function seo({ db, base, getSetting }) {
  const abs = (p) => (p && /^https?:/.test(p) ? p : `${base}${p || ''}`);
  const photo = (file) => (file ? abs(`/uploads/${file}`) : abs('/assets/og.jpg'));
  const cards = (rows) => `<ul class="seo-list">${rows.map((r) => `<li><a href="${listingPath(r)}">${esc(r.title)}</a> — ${esc(priceText(r.price, r.price_unit))}, ${esc(r.city)}</li>`).join('')}</ul>`;
  const latest = (where, args, n = 40) => db.prepare(`SELECT l.id, l.title, l.price, l.price_unit, l.city FROM listings l JOIN users u ON u.id = l.user_id
    WHERE l.status = 'active' AND u.is_blocked = 0 ${where} ORDER BY l.created_at DESC LIMIT ${n}`).all(...args);
  const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(p) })) });

  // Что положить в страницу: { title, description, canonical, image, robots, status, body, jsonld[] }.
  function page(pathname) {
    const def = { title: 'Торгана — объявления по всей России', description: 'Торгана — честная площадка объявлений: бесплатно и без лимитов, каждое объявление проверяет модератор, поиск обычными словами.', image: abs('/assets/og.jpg'), type: 'website' };
    if (pathname === '/') {
      return { ...def, canonical: abs('/'), body: `<h1>Объявления по всей России</h1><nav><ul class="seo-list">${CATEGORIES.map((c) => `<li><a href="/c/${c.id}">${esc(c.name)}</a></li>`).join('')}</ul></nav><h2>Свежие объявления</h2>${cards(latest('', []))}` };
    }
    let m = /^\/l\/(\d+)(?:-[a-z0-9-]*)?$/.exec(pathname);
    if (m) {
      const l = db.prepare(`SELECT l.*, u.name AS seller, u.is_blocked FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ?`).get(Number(m[1]));
      if (!l || l.is_blocked) return { ...def, title: 'Объявление не найдено — Торгана', robots: 'noindex', status: 404, body: '<h1>Объявление не найдено</h1>' };
      const photos = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position LIMIT 5').all(l.id).map((r) => r.file);
      const cat = CAT[l.category];
      const title = `${l.title} — ${priceText(l.price, l.price_unit)} ${inCity(l.city)}`;
      const desc = cut(`${l.title}: ${priceText(l.price, l.price_unit)}, ${l.city}. ${l.description}`, 180);
      const live = l.status === 'active' || l.status === 'sold';
      return {
        title: `${cut(title, 70)} | Торгана`, description: desc, canonical: abs(listingPath(l)), image: photo(photos[0]), type: 'product',
        robots: live ? '' : 'noindex', status: live ? 200 : 200,
        body: `<nav class="seo-crumbs"><a href="/">Главная</a> › <a href="/c/${l.category}">${esc(cat ? cat.name : '')}</a> › <a href="/c/${l.category}/${slugify(l.city)}">${esc(cat ? cat.name : '')} ${esc(inCity(l.city))}</a></nav>
          <h1>${esc(l.title)}</h1><p class="seo-price">${esc(priceText(l.price, l.price_unit))}${l.status === 'sold' ? ' · продано' : ''}</p>
          ${photos[0] ? `<img src="/uploads/${photos[0]}" alt="${esc(l.title)}" width="600">` : ''}
          <p>${esc(l.city)}${l.delivery ? ' · есть доставка' : ''} · продавец: ${esc(l.seller)}</p><p class="seo-desc">${esc(l.description)}</p>`,
        jsonld: live ? [{
          '@context': 'https://schema.org', '@type': 'Product', name: l.title, description: cut(l.description, 500) || l.title, image: photos.map(photo), category: cat ? cat.name : undefined,
          offers: { '@type': 'Offer', url: abs(listingPath(l)), priceCurrency: 'RUB', ...(l.price !== null ? { price: l.price } : {}), availability: l.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', itemCondition: l.condition === 'new' ? 'https://schema.org/NewCondition' : l.condition === 'used' ? 'https://schema.org/UsedCondition' : undefined, seller: { '@type': 'Person', name: l.seller } }
        }, crumbs([['Главная', '/'], [cat ? cat.name : 'Объявления', `/c/${l.category}`], [l.title, listingPath(l)]])] : []
      };
    }
    m = /^\/c\/([a-z]+)(?:\/([a-z0-9-]+))?$/.exec(pathname);
    if (m) {
      const cat = CAT[m[1]];
      const city = m[2] ? CITY_BY_SLUG[m[2]] : null;
      if (!cat || (m[2] && !city)) return { ...def, title: 'Раздел не найден — Торгана', robots: 'noindex', status: 404, body: '<h1>Раздел не найден</h1>' };
      const rows = latest(`AND l.category = ? ${city ? 'AND l.city_lc = ?' : ''}`, city ? [cat.id, city.toLowerCase().replace(/ё/g, 'е')] : [cat.id]);
      const h1 = `${cat.name} ${city ? inCity(city) : 'по всей России'}`;
      const n = db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE status = 'active' AND category = ? ${city ? 'AND city_lc = ?' : ''}`).get(...(city ? [cat.id, city.toLowerCase().replace(/ё/g, 'е')] : [cat.id])).n;
      return {
        ...def, title: `${h1} — объявления на Торгане`, description: cut(`${h1}: ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'объявление' : 'объявлений'} от частных лиц и магазинов. Бесплатно и без лимитов, каждое объявление проверяет модератор.`, 180),
        canonical: abs(pathname), robots: n ? '' : 'noindex',
        body: `<nav class="seo-crumbs"><a href="/">Главная</a> › <a href="/c/${cat.id}">${esc(cat.name)}</a></nav><h1>${esc(h1)}</h1>${cards(rows)}
          <nav><ul class="seo-list">${CITIES.slice(0, 20).map((c) => `<li><a href="/c/${cat.id}/${slugify(c)}">${esc(cat.name)} ${esc(inCity(c))}</a></li>`).join('')}</ul></nav>`,
        jsonld: [crumbs([['Главная', '/'], [cat.name, `/c/${cat.id}`], ...(city ? [[h1, pathname]] : [])])]
      };
    }
    m = /^\/u\/(\d+)$/.exec(pathname);
    if (m) {
      const u = db.prepare('SELECT id, name, city, is_blocked FROM users WHERE id = ?').get(Number(m[1]));
      if (!u || u.is_blocked) return { ...def, title: 'Продавец не найден — Торгана', robots: 'noindex', status: 404, body: '<h1>Продавец не найден</h1>' };
      const rows = latest('AND l.user_id = ?', [u.id], 60);
      return { ...def, title: `${u.name} — объявления продавца на Торгане`, description: cut(`Объявления продавца ${u.name}${u.city ? `, ${u.city}` : ''}: ${rows.length} на Торгане.`, 180), canonical: abs(pathname), robots: rows.length ? '' : 'noindex', body: `<h1>${esc(u.name)}</h1>${cards(rows)}` };
    }
    if (pathname === '/business') return { ...def, title: 'Торгана для бизнеса — тарифы и продвижение', description: 'Витрина магазина, статистика, автозагрузка из фида Авито и продвижение по фиксированной цене. Размещение объявлений — бесплатно.', canonical: abs('/business'), body: '<h1>Торгана для бизнеса</h1>' };
    m = /^\/page\/([a-z]+)$/.exec(pathname);
    if (m) return { ...def, canonical: abs(pathname), body: '' };
    return { ...def, robots: PRIVATE.test(pathname) ? 'noindex, nofollow' : '', body: '' };
  }

  // Голова и тело index.html для пути.
  function inject(indexHtml, pathname) {
    const p = page(pathname);
    const s = getSetting('seo') || {};
    const meta = [
      `<title>${esc(p.title)}</title>`,
      `<meta name="description" content="${esc(p.description)}">`,
      p.canonical ? `<link rel="canonical" href="${esc(p.canonical)}">` : '',
      p.robots ? `<meta name="robots" content="${p.robots}">` : '',
      `<meta property="og:site_name" content="Торгана">`, `<meta property="og:locale" content="ru_RU">`,
      `<meta property="og:type" content="${p.type === 'product' ? 'product' : 'website'}">`,
      `<meta property="og:title" content="${esc(p.title.replace(/ \| Торгана$/, ''))}">`, `<meta property="og:description" content="${esc(p.description)}">`,
      `<meta property="og:image" content="${esc(p.image)}">`, p.canonical ? `<meta property="og:url" content="${esc(p.canonical)}">` : '',
      `<meta name="twitter:card" content="summary_large_image">`,
      s.yandex ? `<meta name="yandex-verification" content="${esc(s.yandex)}">` : '',
      s.google ? `<meta name="google-site-verification" content="${esc(s.google)}">` : '',
      ...(p.jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`)
    ].filter(Boolean).join('\n');
    return {
      status: p.status || 200,
      html: indexHtml
        .replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, meta)
        .replace('<main id="app" tabindex="-1"><div class="loader"></div></main>', `<main id="app" tabindex="-1">${p.body ? `<div class="wrap seo">${p.body}</div>` : '<div class="loader"></div>'}</main>`)
    };
  }

  // Карта сайта: главная, разделы, разделы по городам (где есть объявления), объявления, продавцы, документы.
  let cache = { at: 0, xml: '' };
  function sitemap() {
    if (Date.now() - cache.at < 30 * 60 * 1000) return cache.xml;
    const u = (loc, lastmod, pr) => `<url><loc>${esc(abs(loc))}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}${pr ? `<priority>${pr}</priority>` : ''}</url>`;
    const urls = [u('/', Date.now(), '1.0'), u('/business', null, '0.5')];
    for (const c of CATEGORIES) urls.push(u(`/c/${c.id}`, null, '0.8'));
    const pairs = db.prepare('SELECT category, city, MAX(updated_at) AS at FROM listings WHERE status = \'active\' GROUP BY category, city_lc').all();
    for (const r of pairs) if (CITY_BY_SLUG[slugify(r.city)]) urls.push(u(`/c/${r.category}/${slugify(r.city)}`, r.at, '0.7'));
    const rows = db.prepare(`SELECT l.id, l.title, l.updated_at FROM listings l JOIN users us ON us.id = l.user_id WHERE l.status = 'active' AND us.is_blocked = 0 ORDER BY l.updated_at DESC LIMIT 45000`).all();
    for (const r of rows) urls.push(u(listingPath(r), r.updated_at, '0.6'));
    for (const r of db.prepare(`SELECT DISTINCT l.user_id AS id FROM listings l JOIN users us ON us.id = l.user_id WHERE l.status = 'active' AND us.is_blocked = 0 LIMIT 3000`).all()) urls.push(u(`/u/${r.id}`, null, '0.4'));
    for (const p of ['help', 'safety', 'rules', 'terms', 'privacy', 'contacts']) urls.push(u(`/page/${p}`, null, '0.3'));
    cache = { at: Date.now(), xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n` };
    return cache.xml;
  }

  const robots = () => `User-agent: *
Disallow: /api/
Disallow: /admin
Disallow: /profile
Disallow: /messages
Disallow: /new
Disallow: /edit/
Disallow: /login
Disallow: /register
Disallow: /confirm
Disallow: /forgot
Disallow: /reset
Disallow: /verify
Disallow: /unsubscribe
Disallow: /pay/
Disallow: /favorites
Disallow: /search
Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&from&ref

Sitemap: ${abs('/sitemap.xml')}
`;

  return { inject, sitemap, robots, page, slugify, listingPath };
};
Object.assign(module.exports, { slugify });

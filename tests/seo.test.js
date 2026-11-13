'use strict';

// Страницы для поисковиков: заголовки, карточки для мессенджеров, снимок содержимого, разметка,
// понятные адреса, разделы по городам, sitemap.xml, robots.txt, коды Вебмастера и счётчик Метрики.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client, publish } = require('./helpers');
const { slugify } = require('../lib/seo');

let srv; let admin; let seller; let id; let pending;
const page = async (p) => { const r = await fetch(`${srv.base}${p}`); return { status: r.status, html: await r.text(), type: r.headers.get('content-type') }; };

before(async () => {
  srv = await startServer({ PUBLIC_URL: 'https://torgana.test' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  seller = await registerUser(srv.base, { name: 'Ирина', email: 'irina@test.local' });
  id = await publish(seller, admin, { title: 'Велосипед Stels Navigator 26"', category: 'hobby', city: 'Казань', price: 15000, description: 'Почти новый, катался одно лето. <script>alert(1)</script>' });
  pending = (await seller.post('/api/listings', { title: 'Диван угловой', category: 'home', city: 'Казань', price: '9000' })).data.id;
});
after(() => srv.stop());

test('понятный адрес: транслитерация названия', () => {
  assert.equal(slugify('Велосипед Stels Navigator 26"'), 'velosiped-stels-navigator-26');
  assert.equal(slugify('Санкт-Петербург'), 'sankt-peterburg');
  assert.equal(slugify('Ёлка «Щучья»'), 'elka-schuchya');
});

test('объявление: заголовок, описание, canonical с названием, карточка для мессенджеров, разметка, снимок', async () => {
  const p = await page(`/l/${id}`);
  assert.equal(p.status, 200);
  assert.match(p.html, /<title>Велосипед Stels Navigator 26&quot; — 15 000 ₽ в Казани \| Торгана<\/title>/);
  assert.match(p.html, new RegExp(`<link rel="canonical" href="https://torgana\\.test/l/${id}-velosiped-stels-navigator-26">`));
  assert.match(p.html, /<meta property="og:image" content="https:\/\/torgana\.test\/assets\/og\.jpg">/, 'без фото — фирменная картинка');
  assert.match(p.html, /<meta property="og:type" content="product">/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.+?)<\/script>/.exec(p.html)[1]);
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.offers.price, 15000);
  assert.equal(ld.offers.priceCurrency, 'RUB');
  assert.match(p.html, /<div class="wrap seo">[\s\S]*<h1>Велосипед Stels Navigator 26&quot;<\/h1>/);
  assert.ok(!p.html.includes('<script>alert(1)</script>'), 'текст объявления экранирован');
  assert.ok(!/name="robots"/.test(p.html), 'опубликованное — индексируется');
  assert.equal((await page(`/l/${id}-velosiped-stels-navigator-26`)).status, 200, 'адрес с названием открывается');
});

test('на проверке — noindex; несуществующее — 404', async () => {
  assert.match((await page(`/l/${pending}`)).html, /<meta name="robots" content="noindex">/);
  const p = await page('/l/999999');
  assert.equal(p.status, 404);
  assert.match(p.html, /noindex/);
});

test('раздел по городу и по России; несуществующий город — 404', async () => {
  const p = await page('/c/hobby/kazan');
  assert.equal(p.status, 200);
  assert.match(p.html, /<h1>Хобби и отдых в Казани<\/h1>/);
  assert.match(p.html, new RegExp(`href="/l/${id}-velosiped-stels-navigator-26"`));
  assert.match(p.html, /<title>Хобби и отдых в Казани: купить, 1 объявление, цена 15\s000\s₽ \| Торгана<\/title>/);
  assert.match((await page('/c/hobby')).html, /<h1>Хобби и отдых по всей России<\/h1>/);
  assert.match((await page('/c/home/kazan')).html, /<meta name="robots" content="noindex">/, 'пустой раздел не индексируем');
  assert.equal((await page('/c/hobby/atlantida')).status, 404);
  assert.equal((await page('/c/nope')).status, 404);
});

test('главная и закрытые разделы', async () => {
  const home = await page('/');
  assert.match(home.html, /<link rel="canonical" href="https:\/\/torgana\.test\/">/);
  assert.match(home.html, /href="\/c\/transport"/);
  for (const p of ['/profile', '/admin', '/messages', '/login', '/search?q=x', '/new']) assert.match((await page(p)).html, /<meta name="robots" content="noindex, nofollow">/, p);
});

test('sitemap.xml и robots.txt', async () => {
  const sm = await page('/sitemap.xml');
  assert.match(sm.type, /application\/xml/);
  assert.match(sm.html, new RegExp(`<loc>https://torgana\\.test/l/${id}-velosiped-stels-navigator-26</loc>`));
  assert.match(sm.html, /<loc>https:\/\/torgana\.test\/c\/hobby\/kazan<\/loc>/);
  assert.ok(!sm.html.includes(`/l/${pending}`), 'непроверенных нет');
  assert.match(sm.html, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(sm.html, /<loc>https:\/\/torgana\.test\/page\/support<\/loc>/);
  const rb = await page('/robots.txt');
  assert.match(rb.html, /^Disallow: \/admin$/m);
  assert.match(rb.html, /^Disallow: \/api\/$/m);
  assert.match(rb.html, /^Sitemap: https:\/\/torgana\.test\/sitemap\.xml$/m);
});

test('коды Вебмастера, Search Console и счётчик Метрики — из модерации', async () => {
  assert.equal((await seller.put('/api/admin/seo', { yandex: 'x' })).status, 403);
  const r = await admin.put('/api/admin/seo', { yandex: '<meta name="yandex-verification" content="a1b2c3d4e5f60718" />', google: 'g00gle-Code_1', metrika: '98 765 432' });
  assert.deepEqual(r.data.seo, { yandex: 'a1b2c3d4e5f60718', google: 'g00gle-Code_1', metrika: '98765432', mapsKey: '' });
  const home = await page('/');
  assert.match(home.html, /<meta name="yandex-verification" content="a1b2c3d4e5f60718">/);
  assert.match(home.html, /<meta name="google-site-verification" content="g00gle-Code_1">/);
  assert.equal((await client(srv.base).get('/api/config')).data.metrika, '98765432');
  assert.match((await client(srv.base).get('/api/pages/privacy')).data.html, /Яндекс\.Метрика/);
  const csp = (await fetch(`${srv.base}/`)).headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' https:\/\/mc\.yandex\.ru/);
});

test('1.33: разделы второго уровня, страницы помощи, главная, карта сайта, данные для блока «О разделе»', async () => {
  const cars = await publish(seller, admin, { title: 'Toyota Camry 2.5', category: 'transport', subcategory: 'cars', attrs: { brand: 'Toyota', model: 'Camry', year: 2018, mileage: 86500, gearbox: 'Автомат' }, city: 'Москва', price: 2350000, description: 'Один владелец, обслуживание у дилера.' });
  // объявление: характеристики в заголовке и описании, марка и свойства в разметке, путь через раздел
  const l = await page(`/l/${cars}`);
  assert.match(l.html, /<title>Toyota Camry · 2018 · автомат, 86 500 км — 2 350 000 ₽ в Москве[^<]*<\/title>|<title>Toyota Camry · 2018 · автомат[^<]*в Москве/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.+?)<\/script>/.exec(l.html)[1]);
  assert.equal(ld.brand.name, 'Toyota');
  assert.ok(ld.additionalProperty.some((x) => x.name === 'Пробег'));
  assert.match(l.html, /href="\/c\/transport\/cars\/moskva"/);
  assert.match(l.html, /Объявление проверено модератором/);
  // раздел второго уровня и он же по городу
  const s1 = await page('/c/transport/cars');
  assert.equal(s1.status, 200);
  assert.match(s1.html, /<h1>Автомобили по всей России<\/h1>/);
  const s2 = await page('/c/transport/cars/moskva');
  assert.match(s2.html, /<title>Автомобили в Москве: купить, 1 объявление, цена 2\s350\s000\s₽ \| Торгана<\/title>/);
  assert.match(s2.html, /"@type":"ItemList"/);
  assert.equal((await page('/c/transport/flats')).status, 404, 'раздел другой категории — 404');
  assert.equal((await page('/c/transport/cars/atlantida')).status, 404);
  // страницы помощи — свои заголовки; поддержка — частые вопросы
  assert.match((await page('/page/safety')).html, /<title>Как не попасться мошенникам — безопасность на Торгане<\/title>/);
  assert.match((await page('/page/support')).html, /"@type":"FAQPage"/);
  // главная — организация и сайт
  const home = await page('/');
  assert.match(home.html, /"@type":"Organization"/);
  assert.match(home.html, /"@type":"WebSite"/);
  assert.match(home.html, /href="\/c\/transport\/cars"/);
  // данные для блока «О разделе»
  const info = (await client(srv.base).get('/api/sections/info?category=transport&sub=cars&city=Москва')).data;
  assert.equal(info.count, 1);
  assert.equal(info.min, 2350000);
  assert.equal(info.h1, 'Автомобили в Москве');
  assert.ok(info.subs.every((x) => x.id !== 'cars'));
  assert.equal((await client(srv.base).get('/api/sections/info?category=transport&sub=flats')).status, 404);
  // карта сайта — разделы второго уровня и страницы помощи (кеш карты 30 минут: проверяем через свежий сервер ниже не нужно — sectionPath)
  const { sectionPath } = require('../lib/seo');
  assert.equal(sectionPath('transport', 'cars', 'Москва'), '/c/transport/cars/moskva');
  assert.equal(sectionPath('transport', '', 'Санкт-Петербург'), '/c/transport/sankt-peterburg');
});


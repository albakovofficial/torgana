'use strict';

// Страницы для поисковиков: заголовки, карточки для мессенджеров, снимок содержимого, разметка,
// понятные адреса, разделы по городам, sitemap.xml, robots.txt, коды Вебмастера и счётчик Метрики.
const { test, before, after, describe } = require('node:test');
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
  const r = await admin.put('/api/admin/seo', { yandex: '<meta name="yandex-verification" content="a1b2c3d4e5f60718" />', google: 'g00gle-Code_1', metrika: '98 765 432',
    mailru: '<meta name="wmail-verification" content="0f1e2d3c4b5a6978" />' });
  assert.deepEqual(r.data.seo, { yandex: 'a1b2c3d4e5f60718', google: 'g00gle-Code_1', mailru: '0f1e2d3c4b5a6978', mailruName: 'wmail-verification', metrika: '98765432', mapsKey: '' });
  const home = await page('/');
  assert.match(home.html, /<meta name="wmail-verification" content="0f1e2d3c4b5a6978">/, 'тег Вебмастера Mail.ru — на главной');
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
  assert.match((await page('/page/help')).html, /"@type":"FAQPage"/);
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


test('«$\'» и «$`» в имени продавца не ломают страницу: скрипты не дублируются', async () => {
  const odd = await registerUser(srv.base, { name: "Иван $' и $` продавец", email: 'odd@test.local' });
  const me = (await odd.get('/api/me')).data.user.id;
  const scripts = (h) => (h.match(/<script/g) || []).length;
  const home = await page('/');
  const profile = await page(`/u/${me}`);
  assert.equal(scripts(profile.html) - (profile.html.match(/ld\+json/g) || []).length, scripts(home.html) - (home.html.match(/ld\+json/g) || []).length);
  assert.match(profile.html, /Иван \$&#39; и \$` продавец|Иван \$' и \$` продавец/);
});

// 1.58.0: SEO — заголовки разделов под запросы, «Частые вопросы» из настоящих чисел, 301 на адрес с названием,
// 410 для удалённых, разметка товара только с ценой, фид для Яндекс Товаров, IndexNow.
describe('разделы, 301/410, фид, IndexNow', () => {
  const assert = require('node:assert/strict');
  const http = require('node:http');
  const { startServer, registerUser, publish, client, PNG_1PX } = require('./helpers');

  let srv; let admin; let seller; let fake; const got = [];
  const ids = {};
  const page = (p, redirect = 'follow') => fetch(`${srv.base}${p}`, { redirect }).then(async (r) => ({ status: r.status, location: r.headers.get('location'), html: await r.text() }));
  const photo = async () => (await seller.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` })).data.file;
  const phone = async (title, price, extra = {}) => publish(seller, admin, { title, category: 'electronics', subcategory: 'phones', attrs: { brand: 'Apple', model: 'iPhone 13', memory: '128 ГБ' }, city: 'Казань', price, description: 'Работает отлично, в комплекте коробка.', photos: [await photo()], ...extra });

  test.before(async () => {
    // Поддельный IndexNow: принимает отправки и запоминает их.
    fake = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { got.push(JSON.parse(b)); res.writeHead(200); res.end(); }); });
    await new Promise((r) => fake.listen(0, '127.0.0.1', r));
    srv = await startServer({ PUBLIC_URL: 'https://torgana.test', INDEXNOW_URL: `http://127.0.0.1:${fake.address().port}/indexnow`, INDEXNOW_EVERY: '300' });
    admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
    seller = await registerUser(srv.base, { name: 'Ирина', email: 'irina@test.local' });
    ids.a = await phone('iPhone 13 синий', 30000, { delivery: true });
    ids.b = await phone('iPhone 13 мини', 20000);
    ids.c = await phone('iPhone 13 про', 10000, { bargain: false });
    ids.free = await publish(seller, admin, { title: 'Чехол для телефона', category: 'electronics', city: 'Казань', price: null, description: 'Отдам.' });
  });
  test.after(() => { srv.stop(); fake.close(); });

  test('раздел: заголовок под запрос и «Частые вопросы» о покупках на Торгане — на сайте и в разметке', async () => {
    const info = (await client(srv.base).get('/api/sections/info?category=electronics&sub=phones&city=Казань')).data;
    const q = Object.fromEntries(info.faq.map((x) => [x.q, x.a]));
    assert.deepEqual(Object.keys(q), ['Можно ли купить с доставкой?', 'Можно ли торговаться?', 'Как связаться с продавцом?', 'Как понять, что продавцу можно доверять?', 'Объявления проверяются?', 'Как не пропустить снижение цены?', 'Сколько стоит разместить объявление?', 'Как купить безопасно?']);
    assert.match(q['Можно ли торговаться?'], /^Да\. Предложите свою цену/);
    assert.ok(!Object.values(q).some((x) => /\d/.test(x)), 'общими словами, без чисел раздела');
    // у вакансий — свои вопросы
    const jobs = await publish(seller, admin, { title: 'Курьер', category: 'jobs', subcategory: 'vacancies', attrs: { schedule: 'Сменный' }, city: 'Казань', price: 60000, description: 'Работа курьером.' });
    assert.ok(jobs); assert.ok((await client(srv.base).get('/api/sections/info?category=jobs')).data.faq.some((x) => x.q === 'Вакансии проверяются?'));
    const p = await page('/c/electronics/phones/kazan');
    assert.match(p.html, /<title>Телефоны в Казани: купить, 3 объявления, цены от 10\s000 ₽ \| Торгана<\/title>/);
    assert.match(p.html, /<h2>Частые вопросы<\/h2><h3>Можно ли купить с доставкой\?<\/h3>/);
    const ld = [...p.html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const faq = ld.find((x) => x['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, info.faq.length, 'разметка совпадает с тем, что видно на сайте');
    // без объявлений — вопросов нет
    assert.deepEqual((await client(srv.base).get('/api/sections/info?category=animals')).data.faq, []);
  });

  test('объявление: 301 на адрес с названием (с параметрами), 410 для удалённого, Product — только с ценой', async () => {
    const r = await page(`/l/${ids.a}?utm_source=vk`, 'manual');
    assert.equal(r.status, 301);
    assert.equal(r.location, `/l/${ids.a}-iphone-13-128-gb?utm_source=vk`);
    assert.equal((await page(`/l/${ids.a}-staroe-nazvanie`, 'manual')).status, 301);
    const ok = await page(`/l/${ids.a}-iphone-13-128-gb`, 'manual');
    assert.equal(ok.status, 200);
    const ld = JSON.parse(/<script type="application\/ld\+json">(.+?)<\/script>/.exec(ok.html)[1]);
    assert.equal(ld['@type'], 'Product');
    assert.equal(ld.sku, String(ids.a));
    assert.match(ld.offers.priceValidUntil, /^\d{4}-\d\d-\d\d$/);
    const free = await page(`/l/${ids.free}`);
    assert.ok(!free.html.includes('"@type":"Product"'), 'без цены — без Product');
    assert.ok(free.html.includes('"@type":"BreadcrumbList"'));
    const gone = await publish(seller, admin, { title: 'Старый телефон', category: 'electronics', subcategory: 'phones', attrs: { brand: 'Apple', model: 'iPhone 13', memory: '128 ГБ' }, city: 'Казань', price: 500 });
    assert.equal((await seller.del(`/api/listings/${gone}`)).status, 200);
    const g = await page(`/l/${gone}`, 'manual');
    assert.equal(g.status, 410);
    assert.match(g.html, /noindex/);
  });

  test('фид для Яндекс Товаров: вещи с ценой и фото', async () => {
    const r = await fetch(`${srv.base}/feeds/yandex.yml`);
    assert.match(r.headers.get('content-type'), /application\/xml/);
    const xml = await r.text();
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<yml_catalog date="\d{4}-\d\d-\d\dT\d\d:\d\d\+03:00"><shop><name>Торгана<\/name>/);
    assert.match(xml, /<category id="\d+" parentId="\d+">Телефоны<\/category>/);
    assert.match(xml, new RegExp(`<offer id="${ids.a}" available="true"><url>https://torgana\\.test/l/${ids.a}-iphone-13-128-gb</url><price>30000</price><currencyId>RUR</currencyId>`));
    assert.match(xml, /<picture>https:\/\/torgana\.test\/uploads\/[^<]+<\/picture>/);
    assert.match(xml, /<vendor>Apple<\/vendor>/);
    assert.match(xml, /<delivery>true<\/delivery>/);
    assert.ok(!xml.includes(`<offer id="${ids.free}"`), 'без цены — не в фиде');
    // ключ IndexNow — файлом, значок — для тех, кто спрашивает /favicon.ico
    const st = (await admin.get('/api/admin/seo')).data;
    assert.equal(st.feed, 'https://torgana.test/feeds/yandex.yml');
    const key = /\/([a-f0-9]{32})\.txt$/.exec(st.indexnow.keyUrl)[1];
    assert.equal(await (await fetch(`${srv.base}/${key}.txt`)).text(), key);
    assert.equal((await page('/favicon.ico', 'manual')).status, 301);
  });

  test('IndexNow: изменённые объявления уходят в Яндекс сами, одним запросом', async () => {
    const until = Date.now() + 5000;
    const sent = () => new Set(got.flatMap((b) => b.urlList.map((u) => Number(/\/l\/(\d+)/.exec(u)[1]))));
    while (Date.now() < until && ![ids.a, ids.b, ids.c, ids.free].every((x) => sent().has(x))) await new Promise((r) => setTimeout(r, 100));
    const all = got.flatMap((b) => b.urlList);
    assert.ok(all.includes(`https://torgana.test/l/${ids.a}-iphone-13-128-gb`), JSON.stringify(got));
    assert.equal(got[0].host, 'torgana.test');
    assert.match(got[0].keyLocation, /^https:\/\/torgana\.test\/[a-f0-9]{32}\.txt$/);
    // второй раз то же не отправляется; новое — отправляется
    await new Promise((r) => setTimeout(r, 700)); // всё, что менялось в прошлых проверках, уже ушло
    const before = got.flatMap((b) => b.urlList).length;
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(got.flatMap((b) => b.urlList).length, before, 'без изменений — тишина');
    const n = await phone('iPhone 13 зелёный', 25000);
    const until2 = Date.now() + 5000;
    while (Date.now() < until2 && !got.flatMap((b) => b.urlList).some((u) => u.includes(`/l/${n}-`))) await new Promise((r) => setTimeout(r, 100));
    assert.ok(got.flatMap((b) => b.urlList).some((u) => u.includes(`/l/${n}-`)));
    const st = (await admin.get('/api/admin/seo')).data.indexnow;
    assert.equal(st.on, true);
    assert.ok(st.sent >= 4);
    assert.equal(st.error, '');
  });
});

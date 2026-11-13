'use strict';
// 1.58.0: SEO — заголовки разделов под запросы, «Частые вопросы» из настоящих чисел, 301 на адрес с названием,
// 410 для удалённых, разметка товара только с ценой, фид для Яндекс Товаров, IndexNow.
const test = require('node:test');
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
  assert.match(q['Можно ли купить с доставкой?'], /доставку указали в 1 объявлении этого раздела/);
  assert.match(q['Можно ли торговаться?'], /в 2 объявлениях торг уместен/);
  // без доставки в разделе — вопроса о доставке нет; у вакансий — свои вопросы
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

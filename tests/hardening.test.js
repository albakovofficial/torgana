'use strict';

// 1.41.0: защита сервера по итогам аудита — битый адрес не роняет сайт, www склеен с основным адресом,
// HSTS и Permissions-Policy, ETag у файлов, ограничение новых диалогов.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, registerUser, publish, client } = require('./helpers');

let srv;
before(async () => { srv = await startServer({ PUBLIC_URL: 'https://torgana.test' }); });
after(() => srv.stop());

// Сырой запрос: fetch не даёт подменить Host и сам чинит битые адреса.
const raw = (pathname, headers = {}) => new Promise((resolve, reject) => {
  const u = new URL(srv.base);
  const req = http.request({ host: u.hostname, port: u.port, path: pathname, method: 'GET', headers }, (res) => {
    let body = ''; res.on('data', (d) => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject); req.end();
});

test('битая кодировка в адресе — 400, сайт продолжает работать', async () => {
  assert.equal((await raw('/%E0%A4%A')).status, 400);
  assert.equal((await raw('/api/%ZZ')).status, 400);
  assert.equal((await raw('/')).status, 200, 'процесс жив');
});

test('www — постоянная переадресация на основной адрес с тем же путём', async () => {
  const r = await raw('/l/5-velosiped?utm_source=vk', { host: 'www.torgana.test' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, 'https://torgana.test/l/5-velosiped?utm_source=vk');
  assert.equal((await raw('/', { host: 'torgana.test' })).status, 200, 'основной адрес — без переадресации');
});

test('HSTS и Permissions-Policy; ETag и 304 у файлов', async () => {
  const page = await raw('/assets/site.webmanifest');
  assert.equal(page.status, 200);
  assert.equal(page.headers['strict-transport-security'], 'max-age=31536000');
  assert.match(page.headers['permissions-policy'], /camera=\(\)/);
  assert.ok(page.headers.etag);
  const again = await raw('/assets/site.webmanifest', { 'if-none-match': page.headers.etag });
  assert.equal(again.status, 304);
});

test('не больше 30 новых диалогов в час, в уже начатый — можно писать', async () => {
  const s2 = await startServer();
  try {
    const admin = await registerUser(s2.base, { name: 'Модератор', email: 'admin@test.local' });
    const sellers = [await registerUser(s2.base, { name: 'Продавец', email: 'seller@test.local' }), await registerUser(s2.base, { name: 'Магазин', email: 'shop@test.local' })];
    const buyer = await registerUser(s2.base, { name: 'Покупатель', email: 'buyer@test.local' });
    const ids = [];
    for (let i = 0; i < 31; i++) ids.push(await publish(sellers[i % 2], admin, { title: `Книга ${i}`, category: 'hobby', city: 'Казань', price: 100 + i }));
    for (let i = 0; i < 30; i++) assert.equal((await buyer.post('/api/conversations', { listingId: ids[i] })).status, 200);
    assert.equal((await buyer.post('/api/conversations', { listingId: ids[30] })).status, 429);
    assert.equal((await buyer.post('/api/conversations', { listingId: ids[0] })).status, 200, 'существующий диалог открывается');
  } finally { s2.stop(); }
});

// 1.42.0: удалённое объявление пропадает с сайта, но переписка по нему остаётся — с пометкой «Объявление удалено».
test('удалил объявление — переписка покупателя осталась, объявления на сайте нет', async () => {
  const s3 = await startServer();
  try {
    const admin = await registerUser(s3.base, { name: 'Модератор', email: 'admin@test.local' });
    const seller = await registerUser(s3.base, { name: 'Продавец', email: 'seller@test.local' });
    const buyer = await registerUser(s3.base, { name: 'Покупатель', email: 'buyer@test.local' });
    const id = await publish(seller, admin, { title: 'Велосипед', category: 'hobby', city: 'Казань', price: 9000 });
    const conv = (await buyer.post('/api/conversations', { listingId: id })).data.id;
    await buyer.post(`/api/conversations/${conv}/messages`, { body: 'Ещё продаёте?' });
    assert.equal((await seller.del(`/api/listings/${id}`)).status, 200);

    const page = await buyer.get(`/api/listings/${id}`);
    assert.equal(page.status, 404);
    assert.equal(page.data.error, 'Объявление удалено');
    assert.equal((await seller.get(`/api/listings/${id}`)).status, 404, 'и автору его больше нет');
    assert.ok(!(await seller.get('/api/my/listings')).data.items.some((i) => i.id === id), 'в «Моих объявлениях» нет');
    assert.equal((await buyer.get('/api/listings?q=велосипед')).data.total, 0, 'в поиске нет');

    const chat = (await buyer.get(`/api/conversations/${conv}`)).data;
    assert.equal(chat.listing.status, 'deleted');
    assert.equal(chat.listing.title, 'Велосипед');
    assert.equal(chat.messages[0].body, 'Ещё продаёте?');
    assert.equal((await buyer.get('/api/conversations')).data.items[0].status, 'deleted');
    assert.equal((await seller.post(`/api/conversations/${conv}/messages`, { body: 'Уже продал' })).status, 200, 'переписка продолжается');
    assert.equal((await buyer.post('/api/conversations', { listingId: id })).status, 404, 'новую переписку не начать');
    assert.equal((await seller.patch(`/api/listings/${id}`, { status: 'active' })).status, 404, 'вернуть нельзя');
    assert.equal((await admin.get(`/api/admin/listings/${id}`)).data.listing.status, 'deleted', 'модератор видит с историей');
  } finally { s3.stop(); }
});

// 1.44.0: модератор дарит тариф любому пользователю, рекламу над поиском и продвижение в ленте — бесплатно.
test('подарки модератора: тариф без ИП, реклама и продвижение бесплатно', async () => {
  const s4 = await startServer();
  try {
    const admin = await registerUser(s4.base, { name: 'Модератор', email: 'admin@test.local' });
    const seller = await registerUser(s4.base, { name: 'Ольга', email: 'olga@test.local' });
    const sellerId = (await seller.get('/api/me')).data.user.id;
    const id = await publish(seller, admin, { title: 'Коляска Cybex', category: 'personal', city: 'Казань', price: 15000 });

    assert.equal((await seller.post(`/api/admin/listings/${id}/promo`, { days: 7 })).status, 403, 'продавец себе не дарит');
    assert.equal((await admin.post(`/api/admin/users/${sellerId}/plan`, { plan: 'shop', days: 30 })).status, 200, 'тариф — и без подтверждённого ИП');
    assert.equal((await admin.post(`/api/admin/listings/${id}/promo`, { days: 0 })).status, 400);
    assert.equal((await admin.post(`/api/admin/listings/${id}/promo`, { days: 5 })).status, 200);
    const ad = (await client(s4.base).get(`/api/ads?${new URLSearchParams({ q: 'коляска' })}`)).data.items;
    assert.equal(ad.length, 1, 'реклама сразу в блоке над выдачей');
    assert.equal((await admin.post(`/api/admin/listings/${id}/boost`, { xl: true, tags: ['Как новый'] })).status, 200);
    assert.equal((await admin.post(`/api/admin/listings/${id}/boost`, { xl: true })).status, 400, 'XL уже идёт');

    const card = (await admin.get(`/api/admin/users/${sellerId}`)).data;
    assert.equal(card.user.plan.id, 'shop');
    assert.equal(card.services.promos[0].listingId, id);
    assert.deepEqual(card.services.boosts[0].kinds, ['XL', 'метки']);
    const found = (await client(s4.base).get('/api/listings?q=коляска')).data.items.find((i) => i.id === id);
    assert.ok(found.boost && found.boost.xl, 'XL в выдаче');
    const notes = (await seller.get('/api/notices')).data.items.map((n) => n.title);
    assert.ok(notes.some((t) => t.startsWith('Подарок: реклама над поиском')), 'продавцу пришло уведомление о рекламе');
    assert.ok(notes.some((t) => t.startsWith('Подарок: XL-карточка, Метки на фото')), 'и о продвижении');
    assert.ok(notes.some((t) => t.startsWith('Подарок: «Магазин»')), 'и о тарифе');
    const log = card.log.map((e) => e.action);
    assert.ok(['plan-gift', 'promo-gift', 'boost-gift'].every((a) => log.includes(a)), 'всё в журнале');
  } finally { s4.stop(); }
});

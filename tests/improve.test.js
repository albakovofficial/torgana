'use strict';

// 1.43.0: поиск с опечатками и по триграммному индексу, лёгкие копии фото для ленты, как быстро отвечает продавец.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, publish, client, PNG_1PX, JPEG_HEAD } = require('./helpers');

let srv; let admin; let seller; let guest;
before(async () => {
  srv = await startServer({ REPLY_CACHE_MS: '1' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  seller = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  guest = client(srv.base);
});
after(() => srv.stop());

const find = async (qs) => (await guest.get(`/api/listings?${new URLSearchParams(qs)}`)).data;

test('поиск по слову — через триграммный индекс; опечатка исправляется, «как написано» — без исправления', async () => {
  const phone = await publish(seller, admin, { title: 'iPhone 13, 128 ГБ', category: 'electronics', city: 'Казань', price: 42000 });
  const sofa = await publish(seller, admin, { title: 'Диван угловой раскладной', category: 'home', city: 'Казань', price: 18000 });
  assert.deepEqual((await find({ q: 'угловой' })).items.map((i) => i.id), [sofa]);
  assert.deepEqual((await find({ q: 'iph' })).items.map((i) => i.id), [phone], 'кусок слова из трёх букв');

  const typo = await find({ q: 'айфн' });
  assert.equal(typo.corrected, 'айфон');
  assert.deepEqual(typo.items.map((i) => i.id), [phone]);
  assert.equal((await find({ q: 'дивн угловой' })).corrected, 'диван угловой');
  const page2 = await find({ q: 'айфн', offset: 24 });
  assert.equal(page2.corrected, 'айфон', 'следующие страницы — с тем же исправлением');

  const exact = await find({ q: 'айфн', exact: '1' });
  assert.equal(exact.total, 0);
  assert.equal(exact.corrected, undefined);
  const none = await find({ q: 'вертолёт' });
  assert.equal(none.total, 0, `непохожее слово не подменяем: ${none.corrected}`);
  assert.equal(none.corrected, undefined);

  // правка названия — индекс обновился
  const cur = (await seller.get(`/api/listings/${sofa}`)).data.listing;
  await seller.patch(`/api/listings/${sofa}`, { title: 'Кресло мягкое', description: cur.description, category: cur.category, subcategory: cur.subcategory, city: cur.city, price: cur.price, photos: [] });
  await admin.post(`/api/admin/listings/${sofa}/restore`);
  assert.equal((await find({ q: 'угловой', exact: '1' })).total, 0);
  assert.equal((await find({ q: 'кресло' })).total, 1);
});

test('лёгкая копия фото: в карточке ленты — она, на странице объявления — оригинал; удаляется вместе с фото', async () => {
  const up = (await seller.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}`, thumb: `data:image/jpeg;base64,${JPEG_HEAD}` })).data;
  const id = await publish(seller, admin, { title: 'Велосипед горный', category: 'hobby', city: 'Казань', price: 9000, photos: [up.file] });
  const card = (await find({ q: 'велосипед' })).items[0];
  assert.notEqual(card.photo, up.url, 'в ленте — лёгкая копия');
  assert.match(card.photo, /^\/uploads\/[a-f0-9]{32}\.jpg$/);
  assert.equal((await guest.get(card.photo)).status, 200);
  assert.deepEqual((await guest.get(`/api/listings/${id}`)).data.listing.photos, [up.url], 'на странице — оригинал');

  const old = (await seller.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` })).data; // без копии — как раньше
  const id2 = await publish(seller, admin, { title: 'Самокат детский', category: 'hobby', city: 'Казань', price: 3000, photos: [old.file] });
  assert.equal((await find({ q: 'самокат' })).items[0].photo, old.url);

  const cur = (await seller.get(`/api/listings/${id}`)).data.listing;
  await seller.patch(`/api/listings/${id}`, { title: cur.title, description: cur.description, category: cur.category, subcategory: cur.subcategory, city: cur.city, price: cur.price, photos: [] });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await guest.get(card.photo)).status, 404, 'фото убрали — копия удалена');
  assert.ok(id2);
});

test('как быстро отвечает продавец: от 5 чатов за 30 дней, доля отвеченных', async () => {
  const id = await publish(seller, admin, { title: 'Стол письменный', category: 'home', city: 'Казань', price: 5000 });
  const look = async () => (await guest.get(`/api/listings/${id}`)).data.seller.reply;
  for (let i = 0; i < 5; i++) {
    const b = await registerUser(srv.base, { name: `Покупатель ${i}`, email: `b${i}@test.local` });
    const c = (await b.post('/api/conversations', { listingId: id })).data.id;
    await b.post(`/api/conversations/${c}/messages`, { body: 'Здравствуйте!' });
    if (i < 4) await seller.post(`/api/conversations/${c}/messages`, { body: 'Добрый день' });
  }
  // свежий чат без ответа (покупатель ждёт меньше суток) не считается: отвеченных 4 — меньше пяти, плиток нет
  assert.equal(await look(), null);
  const b = await registerUser(srv.base, { name: 'Покупатель 6', email: 'b6@test.local' });
  const c = (await b.post('/api/conversations', { listingId: id })).data.id;
  await b.post(`/api/conversations/${c}/messages`, { body: 'Ещё продаёте?' });
  await seller.post(`/api/conversations/${c}/messages`, { body: 'Да' });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(await look(), { rate: 10, time: 'hour' });
});

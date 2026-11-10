'use strict';
// 1.48.0: VIN, чёрный список, «Хорошая цена».
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, publish } = require('./helpers');

let srv; let admin; let seller; let buyer;
const CAR = { category: 'transport', subcategory: 'cars', city: 'Москва', title: 'что угодно', attrs: { brand: 'Kia', model: 'Rio', year: 2017, mileage: 90000, gearbox: 'Автомат', engine: 1.6 } };
test.before(async () => {
  srv = await startServer({ GOOD_PRICE_TICK_MS: '500' });
  admin = await registerUser(srv.base, { email: 'admin@test.local', name: 'Админ' });
  seller = await registerUser(srv.base, { email: 'seller@test.ru', name: 'Олег' });
  buyer = await registerUser(srv.base, { email: 'buyer@test.ru', name: 'Мария' });
});
test.after(() => srv.stop());

test('VIN: проверка, русские буквы, частичный показ и целиком — только вошедшим', async () => {
  assert.equal((await seller.post('/api/listings', { ...CAR, price: 900000, vin: 'XTA21900012345' })).status, 200, 'короче 17 — номер кузова, если похож');
  assert.match((await seller.post('/api/listings', { ...CAR, price: 900000, vin: 'XTA2190001234567!' })).data.error, /VIN/);
  const id = await publish(seller, admin, { ...CAR, price: 900000, vin: 'хта21900012345678' });
  const anon = await (await fetch(`${srv.base}/api/listings/${id}`)).json();
  assert.equal(anon.listing.title, 'Kia Rio 1.6 AT, 2017, 90 000 км'.replace(' ', anon.listing.title.includes(' ') ? ' ' : ' '));
  assert.equal(anon.listing.vin, '');
  assert.equal(anon.listing.vinMasked, 'XTA2•••••••••5678');
  assert.equal((await fetch(`${srv.base}/api/listings/${id}/vin`)).status, 401);
  assert.equal((await buyer.get(`/api/listings/${id}/vin`)).data.vin, 'XTA21900012345678');
  assert.equal((await seller.get(`/api/listings/${id}`)).data.listing.vin, 'XTA21900012345678', 'владелец видит целиком');
  const phone = await publish(seller, admin, { category: 'electronics', subcategory: 'phones', city: 'Москва', title: 'x', price: 1000, attrs: { brand: 'Apple', model: 'iPhone 13', memory: '128 ГБ' }, vin: 'XTA21900012345678' });
  assert.equal((await buyer.get(`/api/listings/${phone}`)).data.listing.vinMasked, '', 'VIN — только у машин');
});

test('чёрный список: писать нельзя в обе стороны, объявления скрыты из поиска, разблокировка', async () => {
  const id = await publish(seller, admin, { ...CAR, price: 950000 });
  const conv = (await buyer.post('/api/conversations', { listingId: id })).data.id;
  assert.equal((await buyer.post(`/api/conversations/${conv}/messages`, { body: 'Здравствуйте' })).status, 200);
  const sellerId = (await buyer.get(`/api/listings/${id}`)).data.seller.id;
  assert.equal((await buyer.post('/api/blocks', { userId: sellerId })).status, 200);
  assert.equal((await buyer.get(`/api/conversations/${conv}`)).data.block, 'me');
  assert.equal((await seller.get(`/api/conversations/${conv}`)).data.block, 'them');
  const r = await seller.post(`/api/conversations/${conv}/messages`, { body: 'Ответ' });
  assert.equal(r.status, 403);
  assert.match(r.data.error, /ограничил/);
  assert.match((await buyer.post(`/api/conversations/${conv}/messages`, { body: 'Ещё' })).data.error, /Разблокируйте/);
  assert.equal((await seller.post(`/api/conversations/${conv}/offer`, { price: 100 })).status, 400, 'продавец цену не предлагает — проверка своя');
  assert.equal((await buyer.post(`/api/conversations/${conv}/offer`, { price: 900000 })).status, 403, 'предложение цены — тоже нельзя');
  const items = (await buyer.get('/api/listings?sub=cars')).data.items;
  assert.ok(!items.some((x) => x.id === id), 'в поиске объявлений заблокированного нет');
  assert.equal((await buyer.get(`/api/users/${sellerId}`)).data.user.block, 'me');
  assert.deepEqual((await buyer.get('/api/blocks')).data.items.map((x) => x.name), ['Олег']);
  assert.equal((await buyer.post('/api/blocks', { userId: (await buyer.get('/api/me')).data.user.id })).status, 400, 'себя — нельзя');
  assert.equal((await buyer.del(`/api/blocks/${sellerId}`)).status, 200);
  assert.equal((await seller.post(`/api/conversations/${conv}/messages`, { body: 'Ответ' })).status, 200);
  assert.ok((await buyer.get('/api/listings?sub=cars')).data.items.some((x) => x.id === id));
});

test('«Хорошая цена»: та же модель и год, от 15% дешевле медианы, но не вдвое', async () => {
  const p = (price, extra = {}) => publish(seller, admin, { ...CAR, attrs: { ...CAR.attrs, model: 'Ceed', year: 2019, ...extra }, price });
  const cheap = await p(800000);
  const crazy = await p(300000);
  for (const x of [1000000, 1050000, 980000]) await p(x);
  const other = await p(700000, { year: 2012 }); // другой год — не сравниваем
  await new Promise((r) => setTimeout(r, 1500));
  const cards = (await buyer.get('/api/listings?sub=cars&limit=60')).data.items;
  const gp = (id) => cards.find((x) => x.id === id).goodPrice;
  assert.equal(gp(cheap), true);
  assert.equal(gp(crazy), false, 'слишком дёшево — не хвалим');
  assert.equal(gp(other), false);
  const m = (await buyer.get(`/api/listings/${cheap}`)).data.market;
  assert.equal(m.level, 'good');
  assert.equal(m.count, 4);
  assert.match(m.basis, /марка, модель и год/);
});

test('предупреждения в чате: ссылка на чужой сайт, номер карты, предоплата, мессенджер', () => {
  const app = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/assets/app.js'), 'utf8');
  const a = app.indexOf('  // 1.48.0: предупреждения под сообщением'); const b = app.indexOf('  };', app.indexOf('const riskOf', a)) + 4;
  const { riskOf } = new Function(`${app.slice(a, b)}\nreturn { riskOf };`)();
  const k = (t) => (riskOf(t) || {}).k || null;
  assert.equal(k('Оплатите тут: pay-secure.ru/a'), 'link');
  assert.equal(k('Смотрите https://torgana.ru/l/5'), null, 'ссылка на Торгану — не чужая');
  assert.equal(k('Карта 4111 1111 1111 1111'), 'card');
  assert.equal(k('Номер заказа 1234 5678 1234 5678'), null, 'не номер карты (не проходит проверку)');
  assert.equal(k('Нужна предоплата 30%'), 'prepay');
  assert.equal(k('Пишите в WhatsApp'), 'messenger');
  assert.equal(k('Продиктуйте код из смс'), 'code');
  assert.equal(k('Добрый день, когда можно посмотреть?'), null);
  assert.equal(k('Цена 1 200 000 ₽, торг т.д.'), null);
});

'use strict';

// 1.20: торг и обмен, публикация в выбранное время, срок показа (в тестах — 6 секунд вместо 30 дней) и повторная публикация.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, publish } = require('./helpers');

const TTL = 6000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let srv; let admin; let seller; let buyer;
before(async () => {
  srv = await startServer({ LISTING_TTL_MS: String(TTL), LISTING_TICK_MS: '200' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  seller = await registerUser(srv.base, { name: 'Олег', email: 'oleg@test.local' });
  buyer = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
});
after(() => srv.stop());

const base = { category: 'hobby', city: 'Казань', price: 10000 };

test('торг и обмен: сохраняются, видны в объявлении и карточке, фильтруются; без торга нельзя предложить цену', async () => {
  const a = await publish(seller, admin, { ...base, title: 'Палатка двухместная', bargain: false, exchange: true });
  const b = await publish(seller, admin, { ...base, title: 'Палатка трёхместная' });
  const la = (await buyer.get(`/api/listings/${a}`)).data.listing;
  assert.equal(la.bargain, false);
  assert.equal(la.exchange, true);
  assert.equal((await buyer.get(`/api/listings/${b}`)).data.listing.bargain, true, 'по умолчанию торг уместен');
  const found = async (q) => (await buyer.get(`/api/listings?q=${encodeURIComponent('палатка')}&${q}`)).data.items.map((i) => i.id);
  assert.deepEqual(await found('exchange=1'), [a]);
  assert.deepEqual(await found('bargain=1'), [b]);
  const card = (await buyer.get(`/api/listings?q=${encodeURIComponent('палатка')}`)).data.items.find((i) => i.id === a);
  assert.equal(card.exchange, true);
  const cid = (await buyer.post('/api/conversations', { listingId: a })).data.id;
  const r = await buyer.post(`/api/conversations/${cid}/offer`, { price: 9000 });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /торг не уместен/);
  // Правка без полей торга (как автозагрузка) их не меняет.
  const l = (await seller.get(`/api/listings/${a}`)).data.listing;
  await seller.patch(`/api/listings/${a}`, { title: l.title, category: l.category, city: l.city, price: l.price, description: 'Новое описание' });
  assert.equal((await seller.get(`/api/listings/${a}`)).data.listing.exchange, true);
});

test('публикация в выбранное время: после проверки — «Запланировано», потом таймер публикует', async () => {
  let r = await seller.post('/api/listings', { ...base, title: 'Лодка надувная', publishAt: Date.now() + 40 * 24 * 3600 * 1000 });
  assert.equal(r.status, 400, 'не дальше 30 дней');
  r = await seller.post('/api/listings', { ...base, title: 'Лодка надувная', publishAt: Date.now() + 3000 });
  assert.equal(r.status, 200);
  const id = r.data.id;
  const ok = await admin.post(`/api/admin/listings/${id}/restore`);
  assert.equal(ok.data.status, 'scheduled');
  assert.equal((await buyer.get(`/api/listings/${id}`)).status, 404, 'до публикации видно только автору');
  const mine = (await seller.get('/api/my/listings')).data.items.find((i) => i.id === id);
  assert.equal(mine.status, 'scheduled');
  assert.ok(mine.publishAt > Date.now());
  await wait(4200);
  const l = (await buyer.get(`/api/listings/${id}`)).data.listing;
  assert.equal(l.status, 'active');
  assert.ok(l.createdAt > Date.now() - 2000, 'опубликовано как новое — с датой публикации');
});

test('«Опубликовать сейчас» для запланированного', async () => {
  const r = await seller.post('/api/listings', { ...base, title: 'Спиннинг карбоновый', publishAt: Date.now() + 3600 * 1000 });
  await admin.post(`/api/admin/listings/${r.data.id}/restore`);
  const p = await seller.patch(`/api/listings/${r.data.id}`, { status: 'active' });
  assert.equal(p.data.status, 'active');
  assert.ok(p.data.expiresAt > Date.now());
});

test('срок показа: снимается сам, «Опубликовать снова» — бесплатно и как новое; правка срок не продлевает', async () => {
  const id = await publish(seller, admin, { ...base, title: 'Рюкзак туристический' });
  const first = (await seller.get(`/api/listings/${id}`)).data.listing;
  assert.ok(first.expiresAt - Date.now() <= TTL && first.expiresAt > Date.now());
  // Правка и повторная проверка — срок тот же.
  await seller.patch(`/api/listings/${id}`, { ...base, title: 'Рюкзак туристический 60 л' });
  await admin.post(`/api/admin/listings/${id}/restore`);
  assert.equal((await seller.get(`/api/listings/${id}`)).data.listing.expiresAt, first.expiresAt);
  await wait(TTL + 800);
  // 1.47.2: за 3 дня до снятия — напоминание; один раз на срок (тики идут каждые 200 мс).
  const soon = (await seller.get('/api/notices')).data.items.filter((n) => n.title === 'Объявление скоро снимется' && n.body.includes('Рюкзак'));
  assert.equal(soon.length, 1);
  const gone = (await seller.get(`/api/listings/${id}`)).data.listing;
  assert.equal(gone.status, 'archived');
  assert.equal((await buyer.get(`/api/listings/${id}`)).status, 404);
  const again = await seller.patch(`/api/listings/${id}`, { status: 'active' });
  assert.equal(again.data.status, 'active');
  const fresh = (await seller.get(`/api/listings/${id}`)).data.listing;
  assert.ok(fresh.expiresAt > Date.now() + TTL - 1000, 'новый срок');
  assert.ok(fresh.createdAt > first.createdAt, 'снова среди свежих');
});

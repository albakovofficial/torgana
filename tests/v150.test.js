'use strict';
// 1.50.0: официальный аккаунт Торганы — аккаунт владельца (первый адрес в ADMIN_EMAIL): галочка у имени,
// витрина, статистика и закреплённые без тарифа; у других — ничего не меняется.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client, publish } = require('./helpers');

let srv; let owner; let mod; let seller;
test.before(async () => {
  srv = await startServer({ ADMIN_EMAIL: 'owner@test.local,mod@test.local' });
  owner = await registerUser(srv.base, { email: 'owner@test.local', name: 'Торгана' });
  mod = await registerUser(srv.base, { email: 'mod@test.local', name: 'Модератор' });
  seller = await registerUser(srv.base, { email: 'seller@test.ru', name: 'Анна' });
});
test.after(() => srv.stop());

test('галочка «Официальный аккаунт» — только у владельца, не у модератора и не у продавца', async () => {
  const b = async (c) => (await client(srv.base).get(`/api/users/${c.user.id}`)).data.user.badges;
  assert.equal((await b(owner)).official, true);
  assert.equal((await b(owner)).shop, false, 'значка «Магазин» у официального аккаунта нет');
  assert.equal((await b(mod)).official, false);
  assert.equal((await b(seller)).official, false);
  assert.equal((await owner.get('/api/me')).data.user.badges.official, true);
});

test('витрина без тарифа: обложка, описание, доставка, закреплённые; на публичной странице — «official»', async () => {
  assert.equal((await owner.get('/api/me')).data.user.plan, null, 'тарифа нет');
  const r = await owner.put('/api/my/shop', { about: 'Официальный аккаунт Торганы', delivery: '' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.shop.official, true);
  assert.equal(r.data.shop.plan, 'official');
  const id = await publish(owner, mod, { category: 'services', city: 'Москва', title: 'Как разместить объявление', price: '' });
  assert.equal((await owner.put('/api/my/shop/pins', { id, pin: true })).status, 200, 'закрепить можно без «Магазин Про»');
  const pub = (await client(srv.base).get(`/api/users/${owner.user.id}`)).data;
  assert.equal(pub.user.shop.official, true);
  assert.equal(pub.user.shop.about, 'Официальный аккаунт Торганы');
  assert.deepEqual(pub.pinned.map((i) => i.id), [id]);
  assert.equal((await owner.get('/api/my/shop/stats?days=7')).status, 200, 'статистика магазина — тоже');
  // у обычного продавца без тарифа — как раньше
  assert.equal((await seller.put('/api/my/shop', { about: 'x' })).status, 403);
  assert.equal((await client(srv.base).get(`/api/users/${seller.user.id}`)).data.user.shop, null);
});

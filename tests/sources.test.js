'use strict';

// Откуда приходят люди (1.38.0): заходы по источникам, источник у зарегистрированных, отчёт в модерации.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client } = require('./helpers');

let srv; let admin;
before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
});
after(() => srv.stop());

test('заходы, регистрации, продавцы и объявления по источникам', async () => {
  const guest = client(srv.base);
  await guest.post('/api/visit', { src: 'vk', campaign: 'post-1' });
  await guest.post('/api/visit', { src: 'vk', campaign: 'post-1' });
  await guest.post('/api/visit', { src: 'yandex' });
  await guest.post('/api/visit', { src: '<script>' });

  const c = client(srv.base);
  const r = await c.post('/api/auth/register', { name: 'Ольга', email: 'olga@test.local', password: 'password123', consent: true, src: 'vk|post-1' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await registerUser(srv.base, { name: 'Пётр', email: 'petr@test.local' }); // без источника
  assert.equal((await c.post('/api/listings', { title: 'Велосипед городской', category: 'hobby', city: 'Москва', price: 18500 })).status, 200);

  assert.equal((await c.get('/api/admin/sources')).status, 403, 'отчёт — только модерации');
  const d = (await admin.get('/api/admin/sources?days=30')).data;
  const vk = d.items.find((x) => x.src === 'vk' && x.campaign === 'post-1');
  assert.deepEqual({ visits: vk.visits, signups: vk.signups, sellers: vk.sellers, listings: vk.listings }, { visits: 2, signups: 1, sellers: 1, listings: 1 });
  assert.equal(d.items.find((x) => x.src === 'yandex').visits, 1);
  assert.ok(d.items.some((x) => x.src === 'script'), 'метка очищается от лишних символов');
  const unknown = d.items.find((x) => x.src === 'unknown');
  assert.equal(unknown.signups, 1, 'без метки — «до начала учёта»');
  assert.equal(d.total.signups, 2, 'модераторов не считаем');
});

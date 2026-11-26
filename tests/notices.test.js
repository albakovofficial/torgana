'use strict';

// Уведомления внутри Торганы (1.22): решение модерации попадает в колокольчик со значком и цветом,
// счётчик — в /api/me, «прочитать» — одно или все; сообщения чата сюда не попадают.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser } = require('./helpers');

let srv; let admin; let anna; let boris;
before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
});
after(() => srv.stop());

test('опубликовано и отклонено — в колокольчике; чат — нет; прочитать одно и все', async () => {
  const a = (await anna.post('/api/listings', { title: 'Футболка', category: 'personal', subcategory: 'men', attrs: { size: 'S' }, city: 'Казань', price: 1200 })).data.id;
  const b = (await anna.post('/api/listings', { title: 'Кроссовки', category: 'personal', city: 'Казань', price: 3000 })).data.id;
  assert.equal((await anna.get('/api/me')).data.notices, 0);
  await admin.post(`/api/admin/listings/${a}/restore`);
  await admin.post(`/api/admin/listings/${b}/reject`, { reason: 'Добавьте фото товара' });
  const c = (await boris.post('/api/conversations', { listingId: a })).data.id;
  await boris.post(`/api/conversations/${c}/messages`, { body: 'Здравствуйте!' });
  // 1.52.0: третье — медаль «Одна из первых» за первое опубликованное объявление (tests/first.test.js)
  assert.equal((await anna.get('/api/me')).data.notices, 3);
  const all = (await anna.get('/api/notices')).data;
  assert.equal(all.unread, 3);
  assert.equal(all.items.filter((n) => n.icon === 'medal').length, 1);
  const items = all.items.filter((n) => n.icon !== 'medal');
  assert.deepEqual(items.map((n) => [n.title, n.tone, n.icon]), [['Объявление нужно исправить', 'bad', 'warn'], ['Объявление опубликовано', 'ok', 'check']]);
  assert.equal(items[1].url, `/l/${a}`);
  assert.match(items[0].body, /Добавьте фото товара/);
  assert.equal((await anna.post('/api/notices/read', { id: items[1].id })).data.unread, 2);
  assert.equal((await boris.post('/api/notices/read', { id: items[0].id })).data.unread, 0, 'чужое не трогается');
  assert.equal((await anna.get('/api/me')).data.notices, 2);
  assert.equal((await anna.post('/api/notices/read', {})).data.unread, 0);
  assert.equal((await boris.get('/api/notices')).data.items.length, 0);
  assert.equal((await client0().get('/api/notices')).status, 401);
});
const client0 = () => require('./helpers').client(srv.base);

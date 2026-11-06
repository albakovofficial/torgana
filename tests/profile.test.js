'use strict';

// Профиль: фото профиля (загрузка, замена, удаление, где видно), смена пароля, публичный профиль.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG_1PX, startServer, client, registerUser, publish } = require('./helpers');

let srv; let admin; let anna; let boris;
const upload = async (c) => (await c.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` })).data.file;
const onDisk = (file) => fs.existsSync(path.join(srv.tmp, 'uploads', file));

before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
});
after(() => srv.stop());

test('фото профиля: загрузка, замена (старое удаляется), чужой файл нельзя, удаление', async () => {
  assert.equal(anna.user.avatar, null);
  const f1 = await upload(anna);
  let r = await anna.patch('/api/me', { avatar: f1 });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.avatar, `/uploads/${f1}`);
  assert.equal((await anna.get('/api/me')).data.user.avatar, `/uploads/${f1}`);

  const foreign = await upload(boris);
  assert.equal((await anna.patch('/api/me', { avatar: foreign })).status, 400, 'чужое фото не поставить');
  assert.equal((await anna.patch('/api/me', { avatar: 'нет-такого.png' })).status, 400);

  const f2 = await upload(anna);
  r = await anna.patch('/api/me', { avatar: f2 });
  assert.equal(r.data.user.avatar, `/uploads/${f2}`);
  await new Promise((x) => setTimeout(x, 100));
  assert.equal(onDisk(f1), false, 'прежнее фото удалено с диска');
  assert.equal(onDisk(f2), true);

  // Имя без avatar в запросе фото не трогает
  r = await anna.patch('/api/me', { name: 'Анна С.' });
  assert.equal(r.data.user.avatar, `/uploads/${f2}`);

  // Фото профиля нельзя прикрепить к объявлению
  const res = await anna.post('/api/listings', { title: 'Велосипед детский', category: 'hobby', city: 'Казань', price: '5000', photos: [f2] });
  assert.equal(res.status, 200);
  const l = await anna.get(`/api/listings/${res.data.id}`);
  assert.deepEqual(l.data.listing.photos, []);

  r = await anna.patch('/api/me', { avatar: '' });
  assert.equal(r.data.user.avatar, null);
  await new Promise((x) => setTimeout(x, 100));
  assert.equal(onDisk(f2), false);
});

test('фото продавца видно на объявлении, в публичном профиле и в чате; модератор может убрать', async () => {
  const f = await upload(anna);
  await anna.patch('/api/me', { avatar: f });
  const id = await publish(anna, admin, { title: 'Стол письменный', category: 'home', city: 'Казань', price: '3000' });
  const url = `/uploads/${f}`;
  assert.equal((await boris.get(`/api/listings/${id}`)).data.seller.avatar, url);

  const pub = (await client(srv.base).get(`/api/users/${anna.user.id}`)).data.user;
  assert.equal(pub.avatar, url);
  assert.equal(pub.activeCount, 1);
  assert.equal(pub.email, undefined, 'почта в публичном профиле не показывается');

  const conv = (await boris.post('/api/conversations', { listingId: id })).data.id;
  assert.equal((await boris.get(`/api/conversations/${conv}`)).data.other.avatar, url);
  assert.equal((await boris.get('/api/conversations')).data.items[0].other.avatar, url);
  assert.equal((await admin.get(`/api/admin/listings/${id}`)).data.seller.avatar, url);

  assert.equal((await boris.post(`/api/admin/users/${anna.user.id}/avatar/remove`)).status, 403);
  assert.equal((await admin.post(`/api/admin/users/${anna.user.id}/avatar/remove`)).status, 200);
  assert.equal((await anna.get('/api/me')).data.user.avatar, null);
});

test('смена пароля: нужен текущий, минимум 8 символов, другие устройства выходят', async () => {
  const other = client(srv.base);
  assert.equal((await other.post('/api/auth/login', { email: 'boris@test.local', password: 'password123' })).status, 200);

  assert.equal((await boris.post('/api/me/password', { current: 'не тот', password: 'newpassword1' })).status, 400);
  const short = await boris.post('/api/me/password', { current: 'password123', password: '123' });
  assert.equal(short.status, 400);
  assert.match(short.data.error, /минимум 8/);

  const r = await boris.post('/api/me/password', { current: 'password123', password: 'newpassword1' });
  assert.equal(r.status, 200);
  assert.equal(r.data.signedOut, 1);
  assert.equal((await boris.get('/api/me')).data.user.name, 'Борис', 'это устройство остаётся в аккаунте');
  assert.equal((await other.get('/api/me')).data.user, null, 'другое устройство вышло');

  assert.equal((await client(srv.base).post('/api/auth/login', { email: 'boris@test.local', password: 'password123' })).status, 401);
  assert.equal((await client(srv.base).post('/api/auth/login', { email: 'boris@test.local', password: 'newpassword1' })).status, 200);
});

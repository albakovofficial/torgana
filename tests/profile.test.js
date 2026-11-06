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

test('модераторы — только из ADMIN_EMAIL: убранный адрес теряет доступ при перезапуске, первый — владелец', async () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torgana-owner-'));
  const env = (admins) => ({ ADMIN_EMAIL: admins, DATA_DIR: path.join(dir, 'data'), UPLOAD_DIR: path.join(dir, 'uploads') });
  let s = await startServer(env('old@test.local,owner@test.local'));
  const old = await registerUser(s.base, { name: 'Старый', email: 'old@test.local' });
  const owner = await registerUser(s.base, { name: 'Торгана', email: 'owner@test.local' });
  assert.equal(old.user.isOwner, true);
  assert.equal(owner.user.isAdmin, true);
  await s.stop();

  s = await startServer(env('owner@test.local'));
  const a = client(s.base); await a.post('/api/auth/login', { email: 'owner@test.local', password: 'password123' });
  const b = client(s.base); await b.post('/api/auth/login', { email: 'old@test.local', password: 'password123' });
  const me = (await a.get('/api/me')).data.user;
  assert.equal(me.isAdmin, true);
  assert.equal(me.isOwner, true);
  assert.equal((await b.get('/api/me')).data.user.isAdmin, false);
  assert.equal((await b.get('/api/admin/stats')).status, 403);
  assert.match(s.log(), /Модерация снята у аккаунтов, которых нет в ADMIN_EMAIL: 1/);
  await s.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('объявление показывает просмотры и сколько раз добавлено в избранное', async () => {
  const id = await publish(anna, admin, { title: 'Лампа настольная', category: 'home', city: 'Казань', price: '900' });
  let l = (await boris.get(`/api/listings/${id}`)).data.listing;
  assert.equal(l.favCount, 0);
  const r = await boris.post(`/api/favorites/${id}`);
  assert.deepEqual(r.data, { fav: true, favCount: 1 });
  l = (await client(srv.base).get(`/api/listings/${id}`)).data.listing;
  assert.equal(l.favCount, 1);
  assert.equal(typeof l.views, 'number');
  assert.deepEqual((await boris.post(`/api/favorites/${id}`)).data, { fav: false, favCount: 0 });
});

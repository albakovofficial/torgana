'use strict';

// Удаление профиля (1.39.0): временно (скрыт, можно восстановить) и навсегда (личные данные стёрты) —
// самим пользователем и модератором.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client, publish } = require('./helpers');

let srv; let admin; let anna; let boris;
before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
});
after(() => srv.stop());

const login = async (email) => { const c = client(srv.base); const r = await c.post('/api/auth/login', { email, password: 'password123' }); assert.equal(r.status, 200, JSON.stringify(r.data)); return c; };

test('временно: профиль и объявления скрыты, вход — только чтобы восстановить', async () => {
  const id = await publish(anna, admin, { title: 'Велосипед', category: 'hobby', city: 'Москва', price: 5000 });
  const conv = (await boris.post('/api/conversations', { listingId: id })).data.id;
  assert.equal((await anna.post('/api/me/deactivate')).status, 200);
  assert.equal((await anna.get('/api/me')).data.user, null, 'вышли везде');
  const guest = client(srv.base);
  assert.equal((await guest.get(`/api/users/${anna.user.id}`)).status, 404);
  assert.equal((await guest.get(`/api/listings/${id}`)).status, 404, 'объявление скрыто');
  assert.equal((await boris.post(`/api/conversations/${conv}/messages`, { body: 'Ещё продаёте?' })).status, 400, 'писать некому');

  const a2 = await login('anna@test.local');
  assert.ok((await a2.get('/api/me')).data.user.deactivatedAt, 'после входа — экран восстановления');
  const blocked = await a2.post('/api/listings', { title: 'Стол', category: 'home', city: 'Москва', price: 1 });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.deactivated, true);
  assert.equal((await a2.post('/api/me/restore')).status, 200);
  assert.equal((await a2.get('/api/me')).data.user.deactivatedAt, null);
  assert.equal((await guest.get(`/api/users/${anna.user.id}`)).status, 200, 'профиль снова виден');
  const mine = (await a2.get('/api/my/listings')).data.items.find((x) => x.id === id);
  assert.equal(mine.status, 'archived', 'объявления — в архиве, можно опубликовать снова');
  a2.user = anna.user;
  anna = a2;
});

test('навсегда: только со словом УДАЛИТЬ; личные данные стёрты, вход невозможен, чат с продавцом у него остался', async () => {
  const id = await publish(anna, admin, { title: 'Комод', category: 'home', city: 'Москва', price: 3000 });
  const bl = await publish(boris, admin, { title: 'Лампа', category: 'home', city: 'Москва', price: 900 });
  const conv = (await anna.post('/api/conversations', { listingId: bl })).data.id;
  await anna.post(`/api/conversations/${conv}/messages`, { body: 'Здравствуйте' });
  assert.equal((await anna.post('/api/me/erase', { confirm: 'да' })).status, 400);
  assert.equal((await anna.post('/api/me/erase', { confirm: 'удалить' })).status, 200);
  const r = await client(srv.base).post('/api/auth/login', { email: 'anna@test.local', password: 'password123' });
  assert.equal(r.status, 401, 'войти нельзя');
  assert.equal((await client(srv.base).get(`/api/listings/${id}`)).status, 404, 'объявления удалены');
  const card = (await admin.get(`/api/admin/users/${anna.user.id}`)).data.user;
  assert.equal(card.name, 'Удалённый пользователь');
  assert.ok(card.deletedAt);
  assert.match(card.email, /@deleted\.torgana$/);
  assert.equal(card.phone, '');
  const chat = await boris.get(`/api/conversations/${conv}`);
  assert.equal(chat.status, 200, 'у продавца переписка осталась');
  assert.equal(chat.data.messages[0].body, 'Здравствуйте');
  // Почта освободилась — можно зарегистрироваться заново.
  const again = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  assert.ok(again.user.id !== anna.user.id);
});

test('модератор: временно, восстановить и навсегда — с подтверждением; модераторов и себя — нельзя', async () => {
  assert.equal((await boris.post(`/api/admin/users/${boris.user.id}/deactivate`, {})).status, 403, 'не модератору — нельзя');
  assert.equal((await admin.post(`/api/admin/users/${admin.user.id}/deactivate`, {})).status, 400);
  assert.equal((await admin.post(`/api/admin/users/${boris.user.id}/deactivate`, { reason: 'Просьба пользователя' })).status, 200);
  assert.equal((await client(srv.base).get(`/api/users/${boris.user.id}`)).status, 404);
  assert.ok((await admin.get(`/api/admin/users/${boris.user.id}`)).data.user.deactivatedAt);
  assert.equal((await admin.post(`/api/admin/users/${boris.user.id}/restore`)).status, 200);
  assert.equal((await client(srv.base).get(`/api/users/${boris.user.id}`)).status, 200);
  assert.equal((await admin.post(`/api/admin/users/${boris.user.id}/erase`, {})).status, 400, 'без слова УДАЛИТЬ — нельзя');
  assert.equal((await admin.post(`/api/admin/users/${boris.user.id}/erase`, { confirm: 'УДАЛИТЬ' })).status, 200);
  assert.equal((await admin.get(`/api/admin/users/${boris.user.id}`)).data.user.name, 'Удалённый пользователь');
  const log = (await admin.get(`/api/admin/users/${boris.user.id}`)).data.log.map((e) => e.action);
  assert.ok(log.includes('user-erased') && log.includes('user-deactivated'));
});

describe('сессия продлевается', () => {
  // 1.59.3: активный пользователь не выходит из аккаунта — сессия продлевается, когда прошла половина срока.
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const { DatabaseSync } = require('node:sqlite');
  const { startServer, registerUser } = require('./helpers');

  let srv; let anna;
  before(async () => {
    srv = await startServer();
    anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  });
  after(() => srv.stop());

  test('сессия: свежая не трогается, на исходе — продлевается на 30 дней с новой cookie', async () => {
    const fresh = await anna.get('/api/me');
    assert.equal(fresh.data.user.id, anna.user.id);
    assert.equal(fresh.headers.get('set-cookie'), null, 'свежую сессию не продлеваем на каждом запросе');

    const db = new DatabaseSync(path.join(srv.tmp, 'data', 'torgana.db'));
    const token = anna.cookie.split('=')[1];
    const day = 24 * 3600 * 1000;
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(Date.now() + 3 * day, token);

    const r = await anna.get('/api/me');
    assert.equal(r.data.user.id, anna.user.id);
    const set = r.headers.get('set-cookie');
    assert.ok(set && set.startsWith(`tg_sid=${token};`), 'та же сессия, новый срок в cookie');
    const exp = db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(token).expires_at;
    assert.ok(exp > Date.now() + 29 * day, 'срок — снова 30 дней');

    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(Date.now() - 1000, token);
    assert.equal((await anna.get('/api/me')).data.user, null, 'истёкшая сессия не оживает');
    db.close();
  });
});

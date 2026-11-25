'use strict';

// 1.59.3: активный пользователь не выходит из аккаунта — сессия продлевается, когда прошла половина срока.
const { test, before, after } = require('node:test');
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

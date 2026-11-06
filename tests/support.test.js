'use strict';

// Чат поддержки: пользователь пишет, модератор видит обращение и отвечает, непрочитанное считается.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, registerUser } = require('./helpers');

let srv; let admin; let anna;
before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
});
after(() => srv.stop());

test('без входа поддержка недоступна, до первого сообщения — пусто', async () => {
  assert.equal((await client(srv.base).get('/api/support')).status, 401);
  assert.deepEqual((await anna.get('/api/support')).data.messages, []);
});

test('пользователь пишет — модератор видит обращение «ждёт ответа»', async () => {
  assert.equal((await anna.post('/api/support/messages', { body: '  ' })).status, 400);
  const r = await anna.post('/api/support/messages', { body: 'Почему отклонили объявление?' });
  assert.equal(r.data.message.mine, true);
  assert.equal((await admin.get('/api/admin/stats')).data.support, 1);
  const list = (await admin.get('/api/admin/support')).data.items;
  assert.equal(list[0].user.name, 'Анна');
  assert.equal(list[0].waiting, true);
  assert.equal(list[0].unread, 1);
  assert.equal((await anna.get('/api/admin/support')).status, 403);
});

test('модератор отвечает — у пользователя непрочитанное, после открытия — прочитано', async () => {
  const id = (await admin.get('/api/admin/support')).data.items[0].id;
  const t = (await admin.get(`/api/admin/support/${id}`)).data;
  assert.equal(t.user.email, 'anna@test.local');
  assert.equal(t.messages[0].mine, false);
  const r = await admin.post(`/api/admin/support/${id}/messages`, { body: 'В тексте был номер телефона. Уберите его и сохраните.' });
  assert.equal(r.data.message.mine, true);
  assert.equal((await admin.get('/api/admin/stats')).data.support, 0, 'ответили — больше не ждёт');
  assert.equal((await anna.get('/api/me')).data.unread, 1);
  const msgs = (await anna.get('/api/support')).data.messages;
  assert.equal(msgs.length, 2);
  assert.equal(msgs[1].mine, false);
  assert.equal(msgs[1].staff, true);
  assert.equal((await anna.get('/api/me')).data.unread, 0);
  assert.equal((await anna.get(`/api/support?after=${msgs[0].id}`)).data.messages.length, 1);
});

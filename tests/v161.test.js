'use strict';

// 1.61.0: «Для бизнеса» без переключателя «Бизнес-аккаунт»; текст письма для галочки — с сервера (сайт и приложение).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser } = require('./helpers');

let srv; let shop;
before(async () => {
  srv = await startServer();
  shop = await registerUser(srv.base, { name: 'Магазин', email: 'shop@test.local' });
});
after(() => srv.stop());

test('текст письма-подтверждения — с сервера, с данными ИП и кодом заявки', async () => {
  assert.equal((await shop.post('/api/me/business', { name: 'ИП Смирнова А. А.', inn: '500100732259', ogrn: '304500116000157' })).status, 200);
  const r = await shop.get('/api/me/trademark');
  assert.equal(r.status, 200);
  assert.match(r.data.code, /^TG-[0-9A-F]{6}$/);
  assert.ok(r.data.letter.includes('shop@test.local') && r.data.letter.includes('ИП Смирнова А. А.') && r.data.letter.includes('ОГРНИП 304500116000157'));
  assert.ok(r.data.letter.includes(`Код заявки: ${r.data.code}`));
  assert.ok(!r.data.letter.includes('печать'), 'у ИП — без печати');
});

test('переключателя «Бизнес-аккаунт» больше нет: тариф и витрина — без него', async () => {
  assert.equal((await shop.put('/api/me/business-account', { on: true })).status, 404);
  const b = await shop.get('/api/my/business');
  assert.equal(b.status, 200);
  assert.equal(b.data.bizAccount, undefined);
  assert.equal(b.data.biz.status, 'pending');
});

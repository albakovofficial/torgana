'use strict';

// Пробный тариф первым магазинам и подарок от модерации (1.38.0).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client } = require('./helpers');

let srv; let admin;
const DAY = 24 * 3600 * 1000;
before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
});
after(() => srv.stop());

async function shop(email, biz) {
  const c = await registerUser(srv.base, { name: biz.name, email });
  assert.equal((await c.post('/api/me/business', biz)).status, 200);
  return c;
}
const verify = (c) => admin.post(`/api/admin/users/${c.user.id}/business`, { decision: 'approve' });
const planOf = async (c) => (await c.get('/api/my/business')).data.plan;

const IP = { name: 'ИП Смирнова А. А.', inn: '500100732259', ogrn: '304500116000157' };
const OOO1 = { name: 'ООО «Ромашка»', inn: '7707083893', ogrn: '1027700132195' };
const OOO2 = { name: 'ООО «Лютик»', inn: '7736050003', ogrn: '1027739001113' };
const OOO3 = { name: 'ООО «Василёк»', inn: '7812345675', ogrn: '1027800111228' };

test('акция выключена — подтверждение бизнеса тариф не даёт', async () => {
  const a = await shop('ip@test.local', IP);
  await verify(a);
  assert.equal(await planOf(a), null);
  assert.equal((await client(srv.base).get('/api/config')).data.billing.starter, null);
});

test('включили — уже подтверждённым сразу, новым — при подтверждении; места кончаются', async () => {
  const r = await admin.put('/api/admin/starter', { on: true, plan: 'pro', days: 90, limit: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.granted, 1, 'ИП, подтверждённый раньше');
  let cfg = (await client(srv.base).get('/api/config')).data.billing.starter;
  assert.deepEqual({ left: cfg.left, days: cfg.days, plan: cfg.plan }, { left: 1, days: 90, plan: 'pro' });

  const b = await shop('b@test.local', OOO1);
  await verify(b);
  const p = await planOf(b);
  assert.equal(p.id, 'pro'); assert.equal(p.trial, true);
  assert.ok(Math.abs(p.until - (Date.now() + 90 * DAY)) < 60 * 1000);
  const n = (await b.get('/api/notices')).data.items.find((x) => /Подарок/.test(x.title));
  assert.ok(n, 'уведомление о подарке');

  cfg = (await client(srv.base).get('/api/config')).data.billing.starter;
  assert.equal(cfg, null, 'мест нет — предложение не показываем');
  const c = await shop('c@test.local', OOO2);
  await verify(c);
  assert.equal(await planOf(c), null, 'третьему — уже нет');
});

test('один раз на компанию: тот же ИНН с другого аккаунта не получает', async () => {
  await admin.put('/api/admin/starter', { on: true, plan: 'pro', days: 90, limit: 10 });
  const twin = await shop('twin@test.local', OOO1);
  await verify(twin);
  assert.equal(await planOf(twin), null);
  const d = await shop('d@test.local', OOO3);
  await verify(d);
  assert.equal((await planOf(d)).trial, true);
});

test('подарок от модерации: только подтверждённому бизнесу, тот же тариф — продлевает', async () => {
  const plain = await registerUser(srv.base, { name: 'Частник', email: 'plain@test.local' });
  assert.equal((await admin.post(`/api/admin/users/${plain.user.id}/plan`, { plan: 'pro', days: 30 })).status, 400);
  const e = await shop('e@test.local', { name: 'ООО «Ромашка»', inn: '7707083893', ogrn: '1027700132195' });
  await admin.put('/api/admin/starter', { on: false });
  await verify(e);
  assert.equal(await planOf(e), null);
  assert.equal((await e.post(`/api/admin/users/${e.user.id}/plan`, { plan: 'pro', days: 30 })).status, 403, 'не модератору — нельзя');
  const r = await admin.post(`/api/admin/users/${e.user.id}/plan`, { plan: 'shop', days: 30 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const u1 = (await planOf(e)).until;
  await admin.post(`/api/admin/users/${e.user.id}/plan`, { plan: 'shop', days: 10 });
  const p = await planOf(e);
  assert.equal(p.id, 'shop'); assert.equal(p.trial, true);
  assert.ok(Math.abs(p.until - (u1 + 10 * DAY)) < 1000, 'продлили на 10 дней');

  // 1.39.0: модератор отключает тариф (даже оплаченный) — с причиной; в карточке он виден среди платных услуг.
  assert.equal((await e.post(`/api/admin/users/${e.user.id}/plan/stop`, { reason: 'Нарушение правил площадки' })).status, 403);
  assert.equal((await admin.post(`/api/admin/users/${e.user.id}/plan/stop`, { reason: 'x' })).status, 400, 'без причины — нельзя');
  assert.ok((await admin.get(`/api/admin/users/${e.user.id}`)).data.services, 'в карточке — платные услуги');
  assert.equal((await admin.post(`/api/admin/users/${e.user.id}/plan/stop`, { reason: 'Нарушение правил площадки' })).status, 200);
  assert.equal(await planOf(e), null, 'тариф отключён');
  assert.equal((await admin.post(`/api/admin/users/${e.user.id}/plan/stop`, { reason: 'Нарушение правил площадки' })).status, 404, 'второй раз — тарифа уже нет');
});

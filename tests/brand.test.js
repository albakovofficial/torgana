'use strict';

// 1.45.0: галочка «Проверенный бренд» — только правообладателю товарного знака из реестра Роспатента.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client } = require('./helpers');

let srv; let admin; let shop; let other;
const DAY = 24 * 3600 * 1000;
const inYears = (n) => new Date(Date.now() + n * 365 * DAY).toISOString().slice(0, 10);
before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  shop = await registerUser(srv.base, { name: 'Ольга', email: 'shop@test.local' });
  other = await registerUser(srv.base, { name: 'Пётр', email: 'other@test.local' });
});
after(() => srv.stop());
const badges = async (c) => (await client(srv.base).get(`/api/users/${c.user.id}`)).data.user.badges;
const tm = (c, b) => c.post('/api/me/trademark', b);
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n% тестовый документ\n%%EOF').toString('base64')}`;
const doc = (c, kind, data = PDF) => c.post('/api/me/verify-docs', { kind, name: `${kind}.pdf`, data });
const ALL = { registry: true, owner: true, cert: true, letter: true };

test('без данных компании заявку на товарный знак не принять', async () => {
  assert.equal((await tm(other, { number: '912345', name: 'Ромашка', until: inYears(5) })).status, 400);
  assert.equal((await badges(other)).tm, null);
});

test('проверка: данные компании → товарный знак → модератор сверяет → галочка; без бренда — только плашка ИНН', async () => {
  await shop.post('/api/me/business', { name: 'ООО «Ромашка»', inn: '7707083893', ogrn: '1027700132195' });
  assert.equal((await tm(shop, { number: 'abc', name: 'Ромашка', until: inYears(5) })).status, 400, 'номер — цифры');
  assert.equal((await tm(shop, { number: '912345', name: 'Ромашка', until: '2020-01-01' })).status, 400, 'срок в прошлом');
  assert.equal((await tm(shop, { number: '912345', name: 'Ромашка', until: inYears(5) })).status, 400, 'без документов — нельзя');
  // Документы: только PDF/JPG/PNG/WebP по содержимому; видят владелец и модератор, не чужие и не по публичной ссылке.
  assert.equal((await doc(shop, 'cert', `data:application/pdf;base64,${Buffer.from('<html>не pdf</html>').toString('base64')}`)).status, 400, 'подделка расширения');
  assert.equal((await doc(shop, 'cert')).status, 200);
  assert.equal((await tm(shop, { number: '912345', name: 'Ромашка', until: inYears(5) })).status, 400, 'без письма с кодом — нельзя');
  const me = (await shop.get('/api/me/trademark')).data;
  assert.match(me.code, /^TG-[0-9A-F]{6}$/);
  const lt = await doc(shop, 'letter');
  const docId = lt.data.docs[0].id;
  assert.equal((await shop.get(`/api/me/verify-docs/${docId}`)).status, 200);
  assert.equal((await other.get(`/api/me/verify-docs/${docId}`)).status, 404, 'чужой документ не открыть');
  assert.equal((await other.get(`/api/admin/verify-docs/${docId}`)).status, 403);
  assert.equal((await client(srv.base).get('/uploads/' + docId)).status, 404);
  const r = await tm(shop, { number: '912 345', name: 'Ромашка', until: inYears(5) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.trademark.status, 'pending');
  assert.equal(r.data.trademark.number, '912345');
  // На проверке — менять нельзя (ни данные, ни документы), только отозвать.
  assert.equal((await tm(shop, { number: '111111', name: 'Другое', until: inYears(5) })).status, 409);
  assert.equal((await doc(shop, 'power')).status, 409);
  assert.equal((await shop.del(`/api/me/verify-docs/${docId}`)).status, 409);

  // В очереди «Бизнес» у модератора; не модератору — нельзя.
  assert.ok((await admin.get('/api/admin/users?f=biz')).data.items.some((x) => x.id === shop.user.id && x.tmPending));
  assert.equal((await shop.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'approve' })).status, 403);
  const card = (await admin.get(`/api/admin/users/${shop.user.id}`)).data.user;
  assert.match(card.tmReview.fips, /fips\.ru.*DocNumber=912345/);
  assert.equal(card.tmReview.code, me.code);
  assert.equal(card.tmReview.docs.length, 2);
  assert.equal((await admin.get(`/api/admin/verify-docs/${docId}`)).status, 200, 'модератор открывает документ');

  assert.equal((await admin.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'approve', checks: ALL })).status, 400, 'пока ИНН не подтверждён — нельзя');
  const ba = await admin.post(`/api/admin/users/${shop.user.id}/business`, { decision: 'approve' });
  assert.equal(ba.status, 200, JSON.stringify(ba.data));
  let b = await badges(shop);
  assert.ok(b.biz, 'плашка «Компания проверена»');
  assert.equal(b.tm, null, 'галочки ещё нет');

  assert.equal((await admin.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'approve', until: inYears(3) })).status, 400, 'без отметок проверки — нельзя');
  assert.equal((await admin.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'approve', until: inYears(3), checks: { ...ALL, letter: false } })).status, 400, 'все пункты обязательны');
  assert.equal((await admin.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'approve', until: inYears(3), checks: ALL })).status, 200);
  b = await badges(shop);
  assert.equal(b.tm.number, '912345'); assert.equal(b.tm.name, 'Ромашка');
  assert.ok((await shop.get('/api/notices')).data.items.some((x) => /Бренд подтверждён/.test(x.title)));
  assert.ok((await admin.get('/api/admin/log')).data.items.some((x) => x.action === 'tm-verified'));
});

test('снять галочку с причиной; убрали данные компании — галочка пропадает', async () => {
  assert.equal((await admin.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'reject' })).status, 400, 'без причины — нельзя');
  assert.equal((await admin.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'reject', reason: 'Регистрация прекращена или срок истёк' })).status, 200);
  assert.equal((await badges(shop)).tm, null);
  assert.equal((await shop.get('/api/me')).data.user.trademark.status, 'rejected');
  // Заново — и одобрение; потом владелец убирает данные бизнеса — уходит и бренд.
  assert.equal((await tm(shop, { number: '912345', name: 'Ромашка', until: inYears(5) })).status, 200, 'документы остались — можно отправить снова');
  assert.equal((await admin.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'approve', checks: ALL })).status, 200);
  assert.ok((await badges(shop)).tm);
  // Тот же знак с другого аккаунта: заявку не примем, пока у первого галочка.
  await other.post('/api/me/business', { name: 'ООО «Ромашка»', inn: '7707083893', ogrn: '1027700132195' });
  await doc(other, 'cert'); await doc(other, 'letter');
  assert.equal((await tm(other, { number: '912345', name: 'Ромашка', until: inYears(5) })).status, 409);
  // Изменили данные компании — галочка снимается до новой проверки.
  await shop.post('/api/me/business', { name: 'ООО «Ромашка»', inn: '7707083893', ogrn: '1027700132195' });
  assert.equal((await badges(shop)).tm, null);
  assert.equal((await shop.get('/api/me')).data.user.trademark.status, 'pending');
  await admin.post(`/api/admin/users/${shop.user.id}/business`, { decision: 'approve' });
  await admin.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'approve', checks: ALL });
  assert.ok((await badges(shop)).tm);
  await shop.del('/api/me/business');
  assert.equal((await badges(shop)).tm, null);
  assert.equal((await shop.get('/api/me')).data.user.trademark, null);
  assert.equal((await shop.get('/api/me/trademark')).data.docs.length, 0, 'документы удалены');
});

'use strict';

// Для администрации: автопроверки, сводка, пользователи (карточка, блокировка с причиной), журнал, письма модератору.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, startSmtp, registerUser, publish } = require('./helpers');

let srv; let smtp; let admin; let anna; let boris;
const base = { description: 'Хорошее состояние, без торга', category: 'electronics', city: 'Москва' };
const upload = (c, hash) => c.post('/api/uploads', { data: `data:image/png;base64,${require('./helpers').PNG_1PX}`, hash }).then((r) => r.data.file);

before(async () => {
  smtp = await startSmtp();
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', MAIL_TICK_MS: '150', MOD_NOTIFY_GAP_MS: '200' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
});
after(async () => { await srv.stop(); await smtp.close(); });

const checksOf = async (id) => (await admin.get(`/api/admin/listings/${id}`)).data.listing.checks.map((c) => c.kind);

test('автопроверки: контакты, цена ниже рынка, повтор, чужое фото', async () => {
  for (const p of [60000, 62000, 58000]) await publish(boris, admin, { ...base, title: 'iPhone 15 Pro 256', price: p });
  const cheap = (await anna.post('/api/listings', { ...base, title: 'iPhone 15 Pro 256 срочно', price: 9000, description: 'Пишите в телеграм @anna_sale или +7 (900) 123-45-67' })).data.id;
  const kinds = await checksOf(cheap);
  assert.ok(kinds.includes('price'), 'цена ниже рынка');
  assert.ok(kinds.includes('contacts'), 'контакты в тексте');
  const c = (await admin.get(`/api/admin/listings/${cheap}`)).data.listing.checks.find((x) => x.kind === 'contacts');
  assert.match(c.text, /телефон/); assert.match(c.text, /мессенджер/);

  const again = (await anna.post('/api/listings', { ...base, title: 'iPhone 15 Pro 256 срочно', price: 55000 })).data.id;
  assert.ok((await checksOf(again)).includes('duplicate'), 'повтор у того же автора');

  const borisPhoto = await upload(boris, 'f0e1d2c3b4a59687');
  await publish(boris, admin, { ...base, title: 'Наушники AirPods', price: 9000, photos: [borisPhoto] });
  const annaPhoto = await upload(anna, 'f0e1d2c3b4a59686'); // отличается на 1 бит — тот же снимок
  const stolen = (await anna.post('/api/listings', { ...base, title: 'Наушники беспроводные', price: 8000, photos: [annaPhoto] })).data.id;
  assert.ok((await checksOf(stolen)).includes('photo'), 'то же фото у другого продавца');

  // Очередь: с замечаниями — первыми.
  const queue = (await admin.get('/api/admin/listings?status=pending')).data.items;
  assert.ok(queue[0].checks.length > 0);
  const clean = (await anna.post('/api/listings', { ...base, title: 'Плеер Sony Walkman', price: 3000 })).data.id;
  assert.deepEqual(await checksOf(clean), []);
});

test('сводка: очередь, время проверки, 30 дней', async () => {
  const d = (await admin.get('/api/admin/dashboard')).data;
  assert.ok(d.queue.pending >= 4);
  assert.ok(d.queue.flagged >= 3);
  assert.equal(d.days.length, 30);
  assert.ok(d.days[29].listings >= 8);
  assert.ok(d.speed.count >= 4, 'одобренные учтены во времени проверки');
  assert.equal((await anna.get('/api/admin/dashboard')).status, 403);
});

test('пользователи: поиск, карточка, блокировка с причиной и письмом', async () => {
  await admin.put('/api/admin/mail', { host: '127.0.0.1', port: smtp.port, security: 'none', user: smtp.user, pass: smtp.pass, from: 'no-reply@torgana.test' });
  const list = (await admin.get('/api/admin/users?q=анна')).data;
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].email, 'anna@test.local');
  assert.equal(list.counts.all, 3);

  const card = (await admin.get(`/api/admin/users/${anna.user.id}`)).data;
  assert.ok(card.listings.length >= 4);
  assert.ok(card.counts.pending >= 4);

  assert.equal((await admin.post(`/api/admin/users/${admin.user.id}/block`, { blocked: true, reason: 'проверка' })).status, 400);
  assert.equal((await admin.post(`/api/admin/users/${anna.user.id}/block`, { blocked: true, reason: 'Продажа чужих фото' })).status, 200);
  const m = await smtp.waitFor((x) => x.to === 'anna@test.local' && /заблокирован/.test(x.subject));
  assert.match(m.html, /Продажа чужих фото/);
  const blocked = (await admin.get('/api/admin/users?f=blocked')).data;
  assert.equal(blocked.items[0].id, anna.user.id);
  assert.equal((await admin.get(`/api/admin/users/${anna.user.id}`)).data.user.blockReason, 'Продажа чужих фото');
  await admin.post(`/api/admin/users/${anna.user.id}/block`, { blocked: false });
  await smtp.waitFor((x) => x.to === 'anna@test.local' && /снова работает/.test(x.subject));

  // Диалог поддержки из карточки — даже если человек ещё не писал.
  const t = (await admin.post(`/api/admin/users/${boris.user.id}/support`)).data.thread;
  assert.ok(t);
  assert.equal((await admin.post(`/api/admin/users/${boris.user.id}/support`)).data.thread, t);
});

test('журнал: кто и что сделал, фильтры', async () => {
  const log = (await admin.get('/api/admin/log')).data;
  const actions = log.items.map((i) => i.action);
  assert.ok(actions.includes('approved'));
  assert.ok(actions.includes('user-blocked'));
  assert.ok(actions.includes('user-unblocked'));
  const b = log.items.find((i) => i.action === 'user-blocked');
  assert.equal(b.admin.name, 'Модератор');
  assert.equal(b.user.id, anna.user.id);
  assert.equal(b.data.reason, 'Продажа чужих фото');
  assert.ok(log.admins.some((a) => a.id === admin.user.id));
  const users = (await admin.get('/api/admin/log?type=users')).data.items;
  assert.ok(users.every((i) => i.action.startsWith('user')));
  const listings = (await admin.get('/api/admin/log?type=listings')).data.items;
  assert.ok(listings.length && listings.every((i) => i.listing));
});

test('письма модератору: сразу — одним письмом о новом, «не присылать» — тишина', async () => {
  const s = await admin.put('/api/admin/me/notify', { mode: 'instant', kinds: ['pending', 'support'] });
  assert.deepEqual(s.data, { mode: 'instant', kinds: ['pending', 'support'] });
  await new Promise((r) => setTimeout(r, 300));
  await boris.post('/api/listings', { ...base, title: 'Велосипед Stels', price: 12000 });
  await boris.post('/api/support/messages', { body: 'Когда проверят объявление?' });
  // Обычно это одно письмо; если события разошлись по минутам — два, но каждое о своём новом.
  const m = await smtp.waitFor((x) => x.to === 'admin@test.local' && /Велосипед Stels/.test(x.html), 8000);
  assert.match(m.subject, /^Модерация: \d+ нов\./);
  await smtp.waitFor((x) => x.to === 'admin@test.local' && /Когда проверят объявление/.test(x.html), 8000);

  await admin.put('/api/admin/me/notify', { mode: 'off', kinds: [] });
  const before = smtp.inbox.filter((x) => x.to === 'admin@test.local').length;
  await boris.post('/api/listings', { ...base, title: 'Самокат', price: 5000 });
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(smtp.inbox.filter((x) => x.to === 'admin@test.local').length, before);
});

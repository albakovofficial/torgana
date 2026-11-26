'use strict';

// Права доступа на каждом адресе API (этап 1 плана проверки кода).
// 1. Гость: все адреса, кроме перечисленных в PUBLIC, отвечают 401. Новый адрес без проверки входа уронит тест —
//    его нужно либо закрыть, либо осознанно добавить в PUBLIC.
// 2. Обычный пользователь: все адреса модерации отвечают 403.
// 3. Чужой пользователь: чужие объявления, диалоги, сообщения и документы по номеру не открываются и не меняются.
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client, publish } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const ROUTES = [];
for (const f of ['server.js', ...fs.readdirSync(path.join(ROOT, 'lib')).filter((x) => x.endsWith('.js')).map((x) => `lib/${x}`)]) {
  const re = /route\('(GET|POST|PUT|PATCH|DELETE)',\s*'([^']+)'/g;
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (let m = re.exec(src); m; m = re.exec(src)) ROUTES.push(`${m[1]} ${m[2]}`);
}

// Открыты всем намеренно: настройки сайта, вход и регистрация, публичные объявления и профили, статистика показов,
// уведомление ЮKassa (сверяется с API), страница оплаты по случайному номеру.
const PUBLIC = new Set([
  'GET /api/config', 'GET /api/metro', 'GET /api/me', 'GET /api/sections/info', 'GET /api/pages/:slug',
  'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/logout', 'POST /api/auth/forgot', 'GET /api/auth/reset',
  'POST /api/auth/reset', 'POST /api/auth/verify', 'POST /api/auth/code', 'POST /api/auth/code/resend', 'POST /api/unsubscribe',
  'POST /api/auth/oauth/:provider/start', 'GET /api/auth/oauth/:provider/callback', 'POST /api/auth/apple/nonce', 'POST /api/auth/apple',
  'GET /api/listings', 'GET /api/listings/map', 'GET /api/listings/:id', 'POST /api/listings/title', 'GET /api/price-hint',
  'GET /api/users/:id', 'GET /api/ads', 'POST /api/stats/ads', 'POST /api/visit', 'POST /api/stats/view', 'POST /api/stats/impressions',
  'POST /api/pay/yookassa', 'GET /api/payments/:id'
]);

const fill = (p) => p.replace(':provider', 'yandex').replace(':slug', 'terms').replace(/:\w+/g, '1');
const call = (c, route) => { const [m, p] = route.split(' '); return c.req(m, fill(p), m === 'GET' ? undefined : {}); };

let srv; let admin; let owner; let buyer; let stranger;
before(async () => {
  srv = await startServer({});
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  owner = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  buyer = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
  stranger = await registerUser(srv.base, { name: 'Виктор', email: 'victor@test.local' });
});
after(() => srv.stop());

test('адреса API найдены, каждый открытый — в списке PUBLIC', () => {
  assert.ok(ROUTES.length > 150, `найдено ${ROUTES.length}`);
  for (const r of PUBLIC) assert.ok(ROUTES.includes(r), `${r} больше нет — уберите из PUBLIC`);
});

test('гость: всё, кроме открытых адресов, — 401', async () => {
  const open = [];
  for (const r of ROUTES.filter((x) => !PUBLIC.has(x))) if ((await call(client(srv.base), r)).status !== 401) open.push(r);
  assert.deepEqual(open, [], 'открыты без входа');
});

test('обычный пользователь: вся модерация — 403', async () => {
  const open = [];
  for (const r of ROUTES.filter((x) => x.split(' ')[1].startsWith('/api/admin'))) if ((await call(stranger, r)).status !== 403) open.push(r);
  assert.deepEqual(open, [], 'модерация доступна без прав');
});

test('чужой пользователь: объявления, диалоги, сообщения и документы по номеру закрыты', async () => {
  const active = await publish(owner, admin, { title: 'Велосипед Stels Navigator', category: 'hobby', city: 'Казань', price: 15000, description: 'Почти новый, катался одно лето.' });
  const draft = (await owner.post('/api/listings', { title: 'Диван угловой', category: 'home', city: 'Казань', price: '9000' })).data.id;
  const conv = (await buyer.post('/api/conversations', { listingId: active })).data.id;
  const msg = (await buyer.post(`/api/conversations/${conv}/messages`, { body: 'Здравствуйте, ещё продаёте?' })).data.message.id;

  const denied = [
    ['GET', `/api/listings/${draft}`], ['PATCH', `/api/listings/${active}`], ['DELETE', `/api/listings/${active}`],
    ['GET', `/api/listings/${active}/boost`], ['POST', `/api/listings/${active}/boost`], ['GET', `/api/listings/${active}/promote`],
    ['POST', `/api/listings/${active}/promote`], ['POST', `/api/listings/${draft}/appeal`], ['GET', `/api/my/listings/${active}/stats`],
    ['GET', `/api/conversations/${conv}`], ['POST', `/api/conversations/${conv}/messages`], ['PATCH', `/api/conversations/${conv}/messages/${msg}`],
    ['POST', `/api/conversations/${conv}/typing`], ['POST', `/api/conversations/${conv}/deal`], ['POST', `/api/conversations/${conv}/offer`],
    ['POST', `/api/conversations/${conv}/issue`], ['POST', `/api/conversations/${conv}/praise`],
    ['GET', '/api/me/verify-docs/1'], ['DELETE', '/api/me/verify-docs/1'], ['POST', '/api/issues/1/reply']
  ];
  const open = [];
  for (const [m, p] of denied) {
    const r = await stranger.req(m, p, m === 'GET' ? undefined : { body: 'чужое', price: 1000, text: 'чужое', days: 7 });
    if (![403, 404].includes(r.status)) open.push(`${m} ${p} → ${r.status}`);
  }
  assert.deepEqual(open, [], 'чужое доступно');
  // Владелец и собеседник при этом видят своё.
  assert.equal((await owner.get(`/api/listings/${draft}`)).status, 200);
  assert.equal((await owner.get(`/api/conversations/${conv}`)).status, 200);
  assert.equal((await buyer.get(`/api/conversations/${conv}`)).status, 200);
});

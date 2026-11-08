'use strict';

// Возврат с ЮKassa (1.38.1): страница оплаты открывается и без входа (iPhone, приложение с экрана «Домой»),
// а если человек не вернулся и уведомление не пришло — сайт сам сверяет платёж в фоне и включает услугу.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, registerUser, client, publish } = require('./helpers');

let srv; let yk; let admin; let anna; let boris;
const ykPay = new Map();
let n = 0;

before(async () => {
  yk = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; }).on('end', () => {
      const j = body ? JSON.parse(body) : null;
      const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method === 'POST' && req.url === '/payments') {
        const id = `yk-${++n}`;
        const p = { id, status: 'pending', amount: j.amount, metadata: j.metadata, test: true, confirmation: { type: 'redirect', confirmation_url: `https://yoomoney.test/checkout/${id}` } };
        ykPay.set(id, p);
        return send(200, p);
      }
      const m = /^\/payments\/(.+)$/.exec(req.url);
      if (req.method === 'GET' && m) return ykPay.has(m[1]) ? send(200, ykPay.get(m[1])) : send(404, {});
      send(404, {});
    });
  });
  await new Promise((r) => yk.listen(0, '127.0.0.1', r));
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', YOOKASSA_TEST_BASE: `http://127.0.0.1:${yk.address().port}`, BILLING_TICK_MS: '200', BILLING_GAP_MS: '100' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
  const b = await admin.put('/api/admin/billing', { config: { shopId: '123456', secret: 'test_secret_key_123', receipts: false } });
  assert.equal(b.status, 200, JSON.stringify(b.data));
});
after(async () => { await srv.stop(); yk.close(); });

const paid = (url) => { const p = ykPay.get(url.split('/').pop()); p.status = 'succeeded'; p.payment_method = { type: 'bank_card' }; };

test('вернулся с ЮKassa без входа — платёж проверен, продвижение включено, видно «до какого числа»', async () => {
  const id = await publish(anna, admin, { title: 'Велосипед городской', category: 'hobby', city: 'Москва', price: 18500 });
  const r = await anna.post(`/api/listings/${id}/boost`, { xl: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  paid(r.data.url);
  await new Promise((ok) => setTimeout(ok, 150)); // человек платит на странице ЮKassa

  const guest = client(srv.base);
  assert.equal((await guest.get('/api/payments/not-a-uuid')).status, 404);
  const g = (await guest.get(`/api/payments/${r.data.id}`)).data;
  assert.equal(g.payment.status, 'succeeded');
  assert.equal(g.payment.applied, true);
  assert.equal(g.guest, true);
  assert.equal(g.payment.method, '', 'без входа — без лишних подробностей');
  assert.equal(g.result.status, 'active');
  assert.deepEqual(g.result.kinds, ['xl']);
  assert.ok(g.result.endsAt > Date.now() + 6 * 24 * 3600 * 1000);
  assert.equal(g.result.listingId, id);

  assert.equal((await boris.get(`/api/payments/${r.data.id}`)).status, 404, 'чужому вошедшему — не виден');
  const own = (await anna.get(`/api/listings/${id}`)).data.boost;
  assert.equal(own.length, 1);
  assert.equal(own[0].status, 'active');
});

test('не вернулся и уведомления нет — услуга включается сверкой в фоне', async () => {
  const id = await publish(anna, admin, { title: 'Стол письменный', category: 'home', city: 'Москва', price: 3000 });
  const r = await anna.post(`/api/listings/${id}/boost`, { frame: true });
  paid(r.data.url);
  let own = [];
  for (let i = 0; i < 40 && !own.length; i++) { await new Promise((ok) => setTimeout(ok, 100)); own = (await anna.get(`/api/listings/${id}`)).data.boost; }
  assert.equal(own.length, 1, 'продвижение включилось без возврата на сайт');
  assert.deepEqual(own[0].kinds, ['frame']);
});

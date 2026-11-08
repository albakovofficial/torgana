'use strict';

// Продвижение в ленте и поиске (1.21.0): XL-карточка, рамка, метки на фото, пакет «Всё в одном».
// Оплата — через поддельную ЮKassa; порядок выдачи не меняется; метки — после модератора; возвраты — сами.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, registerUser, client, publish, PNG_1PX } = require('./helpers');

let srv; let yk; let admin; let anna; let boris;
const ykPay = new Map();
const refunds = [];
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
      if (req.method === 'GET' && m) return send(200, ykPay.get(m[1]));
      if (req.method === 'POST' && req.url === '/refunds') { refunds.push(j); return send(200, { id: `rf-${refunds.length}`, status: 'succeeded', amount: j.amount }); }
      send(404, {});
    });
  });
  await new Promise((r) => yk.listen(0, '127.0.0.1', r));
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', YOOKASSA_TEST_BASE: `http://127.0.0.1:${yk.address().port}`, BOOST_TICK_MS: '200', BOOST_WAIT_MS: '1500' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
});
after(async () => { await srv.stop(); yk.close(); });

const pay = async (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.url.split('/').pop();
  ykPay.get(id).status = 'succeeded';
  assert.equal((await client(srv.base).post('/api/pay/yookassa', { object: { id } })).status, 200);
  return r.data.id;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const photo = async () => (await anna.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` })).data.file;
const feedCard = async (id) => (await client(srv.base).get('/api/listings?limit=60')).data.items.find((i) => i.id === id);

test('без ЮKassa кнопки оплаты нет; цены и метки — в настройках сайта', async () => {
  const cfg = (await client(srv.base).get('/api/config')).data.billing;
  assert.equal(cfg.ready, false);
  assert.deepEqual(cfg.prices.boost, { xl: 99, frame: 39, tags: 29, all: 129 });
  assert.equal(cfg.boostTags.length, 8);
  assert.equal(cfg.boostDays, 7);
  const id = await publish(anna, admin, { title: 'Кресло офисное', category: 'home', city: 'Казань', price: 6900 });
  assert.equal((await anna.post(`/api/listings/${id}/boost`, { frame: true })).status, 503);
  await admin.put('/api/admin/billing', { config: { shopId: '123456', secret: 'test_AbCdEfGhIjKlMnOp' } });
});

test('цена: сумма услуг, пакет — по цене «Всё в одном»; цены меняет модератор', async () => {
  const id = await publish(anna, admin, { title: 'Велосипед горный', category: 'hobby', city: 'Казань', price: 18500 });
  const amount = async (b) => { const r = await anna.post(`/api/listings/${id}/boost`, b); assert.equal(r.status, 200, JSON.stringify(r.data)); return ykPay.get(r.data.url.split('/').pop()).amount.value; };
  assert.equal(await amount({ frame: true }), '39.00');
  assert.equal(await amount({ xl: true, frame: true }), '138.00');
  assert.equal(await amount({ xl: true, frame: true, tags: ['С чеком'] }), '129.00');
  assert.equal((await anna.post(`/api/listings/${id}/boost`, { tags: ['Самый лучший'] })).status, 400, 'метки — только из списка');
  assert.equal((await anna.post(`/api/listings/${id}/boost`, { tags: ['С чеком', 'Как новый', 'Срочно'] })).status, 400, 'не больше двух');
  assert.equal((await anna.post(`/api/listings/${id}/boost`, {})).status, 400);
  assert.equal((await boris.post(`/api/listings/${id}/boost`, { frame: true })).status, 404, 'чужое объявление');
  const pr = (await admin.get('/api/admin/billing')).data.prices;
  await admin.put('/api/admin/billing', { prices: { ...pr, boost: { xl: 100, frame: 40, tags: 30, all: 150 } } });
  assert.equal(await amount({ xl: true, frame: true, tags: ['Срочно'] }), '150.00');
  await admin.put('/api/admin/billing', { prices: { ...pr, boost: { xl: 99, frame: 39, tags: 29, all: 129 } } });
});

test('опубликованное: рамка и XL сразу в ленте, порядок по дате не меняется; повторно ту же услугу не купить', async () => {
  const p1 = await photo(); const p2 = await photo(); const p3 = await photo(); const p4 = await photo();
  const id = await publish(anna, admin, { title: 'Toyota Camry 2.5', category: 'transport', city: 'Москва', price: 2350000, description: 'Один владелец, обслуживание у дилера, два комплекта резины.', photos: [p1, p2, p3, p4] });
  const later = await publish(anna, admin, { title: 'Стол письменный', category: 'home', city: 'Москва', price: 3000 });
  const before = (await client(srv.base).get('/api/listings?limit=60')).data.items.map((i) => i.id);
  await pay(await anna.post(`/api/listings/${id}/boost`, { xl: true, frame: true }));
  const after = (await client(srv.base).get('/api/listings?limit=60')).data.items.map((i) => i.id);
  assert.deepEqual(after, before, 'порядок выдачи прежний');
  assert.ok(after.indexOf(later) < after.indexOf(id), 'более новое объявление выше продвинутого');
  const c = await feedCard(id);
  assert.equal(c.boost.xl, true);
  assert.equal(c.boost.frame, true);
  assert.deepEqual(c.boost.tags, []);
  assert.equal(c.boost.photos.length, 2);
  assert.equal(c.boost.more, 1);
  assert.match(c.boost.desc, /Один владелец/);
  assert.equal((await feedCard(later)).boost, null);
  const own = (await anna.get(`/api/listings/${id}`)).data.boost;
  assert.equal(own[0].status, 'active');
  assert.ok(own[0].endsAt - Date.now() > 6.9 * 24 * 3600 * 1000);
  assert.equal((await client(srv.base).get(`/api/listings/${id}`)).data.boost, null, 'чужим — без подробностей');
  const again = await anna.post(`/api/listings/${id}/boost`, { frame: true });
  assert.equal(again.status, 400);
  assert.match(again.data.error, /Яркая рамка уже идёт/);
  assert.equal((await anna.post(`/api/listings/${id}/boost`, { tags: ['Как новый'] })).status, 200, 'другую услугу — можно');
  const my = (await anna.get('/api/my/listings')).data.items.find((i) => i.id === id);
  assert.equal(my.boost.length, 1);
});

test('метки видны сразу после оплаты, без модератора; проверки меток больше нет', async () => {
  const id = await publish(anna, admin, { title: 'iPhone 13, 128 ГБ', category: 'electronics', city: 'Казань', price: 42000 });
  await pay(await anna.post(`/api/listings/${id}/boost`, { tags: ['Есть гарантия', 'С чеком'] }));
  assert.deepEqual((await feedCard(id)).boost.tags, ['Есть гарантия', 'С чеком']);
  const own = (await anna.get(`/api/listings/${id}`)).data.boost[0];
  assert.deepEqual(own.kinds, ['tags']);
  assert.equal(own.status, 'active');
  assert.equal(own.tagsState, undefined);
  assert.equal((await admin.get('/api/admin/boost-tags')).status, 404, 'раздела проверки меток нет');
  assert.equal((await admin.get('/api/admin/stats')).data.tags, undefined);
});

test('оплачено при подаче — начинается с публикацией; не опубликовали или удалили — деньги вернулись сами', async () => {
  const r = await anna.post('/api/listings', { title: 'Диван угловой', category: 'home', city: 'Казань', price: 18000 });
  const id = r.data.id;
  await pay(await anna.post(`/api/listings/${id}/boost`, { frame: true }));
  assert.equal((await anna.get(`/api/listings/${id}`)).data.boost[0].status, 'waiting');
  await admin.post(`/api/admin/listings/${id}/restore`);
  const b = (await anna.get(`/api/listings/${id}`)).data.boost[0];
  assert.equal(b.status, 'active');
  assert.ok(b.startsAt > Date.now() - 5000);
  assert.equal((await feedCard(id)).boost.frame, true);

  const before = refunds.length;
  const gone = (await anna.post('/api/listings', { title: 'Шкаф', category: 'home', city: 'Казань', price: 5000 })).data.id;
  await pay(await anna.post(`/api/listings/${gone}/boost`, { xl: true }));
  await anna.del(`/api/listings/${gone}`);
  const stuck = (await anna.post('/api/listings', { title: 'Тумба', category: 'home', city: 'Казань', price: 2000 })).data.id;
  await pay(await anna.post(`/api/listings/${stuck}/boost`, { frame: true }));
  await admin.post(`/api/admin/listings/${stuck}/reject`, { reason: 'Нет фото товара' });
  for (let i = 0; i < 40 && refunds.length < before + 2; i++) await wait(200);
  assert.equal(refunds.length, before + 2, 'оба возврата');
  assert.deepEqual(refunds.slice(-2).map((x) => x.amount.value).sort(), ['39.00', '99.00']);
  assert.equal((await anna.get(`/api/listings/${stuck}`)).data.boost.length, 0);
  const pays = (await admin.get('/api/admin/payments?f=refunded')).data.items;
  assert.ok(pays.some((p) => p.kind === 'boost' && p.refunded === 99));
});

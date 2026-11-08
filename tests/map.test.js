'use strict';

// Объявления на карте (1.38.0): точка у станции метро или в центре города, рамка карты — со своей политикой и только при ключе.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client, publish } = require('./helpers');

let srv; let admin; let seller;
before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  seller = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
});
after(() => srv.stop());

test('точки: метро → станция, без метро → центр города, без ключа карты нет', async () => {
  const guest = client(srv.base);
  assert.equal((await guest.get('/api/config')).data.maps, false);
  const frame0 = await fetch(`${srv.base}/map-frame`);
  assert.equal(frame0.status, 404, 'без ключа рамка не отдаётся');

  const a = await publish(seller, admin, { title: 'Велосипед городской', category: 'hobby', city: 'Москва', price: 18500, metro: 'Сокольники' });
  const b = await publish(seller, admin, { title: 'Диван угловой', category: 'home', city: 'Казань', price: 25000 });
  await seller.post('/api/listings', { title: 'Стол на проверке', category: 'home', city: 'Москва', price: 1000 }); // не одобрено — на карте нет

  const d = (await guest.get('/api/listings/map')).data;
  assert.equal(d.total, 2);
  const pa = d.items.find((x) => x.id === a);
  const pb = d.items.find((x) => x.id === b);
  assert.deepEqual([pa.lat, pa.lng, pa.place], [55.78, 37.68, 'м. Сокольники']);
  assert.deepEqual([pb.lat, pb.lng, pb.place], [55.7963, 49.1088, 'Казань']);
  assert.ok(!('address' in pa) && !('district' in pa), 'никаких адресов в точках');

  const f = (await guest.get('/api/listings/map?city=Казань')).data;
  assert.deepEqual(f.items.map((x) => x.id), [b], 'фильтры поиска работают и на карте');

  assert.equal((await seller.put('/api/admin/seo', { mapsKey: 'x' })).status, 403);
  assert.equal((await admin.put('/api/admin/seo', { mapsKey: '0a1b2c3d-1111-2222-3333-<b>44445555' })).status, 200);
  assert.equal((await admin.get('/api/admin/seo')).data.seo.mapsKey, '0a1b2c3d-1111-2222-3333-b44445555', 'лишние символы из ключа убираем');
  assert.equal((await guest.get('/api/config')).data.maps, true);

  const fr = await fetch(`${srv.base}/map-frame`);
  assert.equal(fr.status, 200);
  const csp = fr.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /script-src 'nonce-[^']+' 'unsafe-eval' https:\/\/\*\.yandex\.ru/);
  assert.equal(fr.headers.get('x-frame-options'), null, 'рамку можно встроить на свой сайт');
  const body = await fr.text();
  assert.ok(body.includes('apikey=0a1b2c3d-1111-2222-3333-b44445555'));
  assert.ok(!body.includes('__NONCE__') && !body.includes('__KEY__'));

  const page = await fetch(`${srv.base}/search`);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/, 'основной сайт по-прежнему не встраивается и не грузит чужие скрипты');
  assert.doesNotMatch(page.headers.get('content-security-policy'), /yandex\.net/);
});

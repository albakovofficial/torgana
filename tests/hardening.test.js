'use strict';

// 1.41.0: защита сервера по итогам аудита — битый адрес не роняет сайт, www склеен с основным адресом,
// HSTS и Permissions-Policy, ETag у файлов, ограничение новых диалогов.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, registerUser, publish } = require('./helpers');

let srv;
before(async () => { srv = await startServer({ PUBLIC_URL: 'https://torgana.test' }); });
after(() => srv.stop());

// Сырой запрос: fetch не даёт подменить Host и сам чинит битые адреса.
const raw = (pathname, headers = {}) => new Promise((resolve, reject) => {
  const u = new URL(srv.base);
  const req = http.request({ host: u.hostname, port: u.port, path: pathname, method: 'GET', headers }, (res) => {
    let body = ''; res.on('data', (d) => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject); req.end();
});

test('битая кодировка в адресе — 400, сайт продолжает работать', async () => {
  assert.equal((await raw('/%E0%A4%A')).status, 400);
  assert.equal((await raw('/api/%ZZ')).status, 400);
  assert.equal((await raw('/')).status, 200, 'процесс жив');
});

test('www — постоянная переадресация на основной адрес с тем же путём', async () => {
  const r = await raw('/l/5-velosiped?utm_source=vk', { host: 'www.torgana.test' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, 'https://torgana.test/l/5-velosiped?utm_source=vk');
  assert.equal((await raw('/', { host: 'torgana.test' })).status, 200, 'основной адрес — без переадресации');
});

test('HSTS и Permissions-Policy; ETag и 304 у файлов', async () => {
  const page = await raw('/assets/site.webmanifest');
  assert.equal(page.status, 200);
  assert.equal(page.headers['strict-transport-security'], 'max-age=31536000');
  assert.match(page.headers['permissions-policy'], /camera=\(\)/);
  assert.ok(page.headers.etag);
  const again = await raw('/assets/site.webmanifest', { 'if-none-match': page.headers.etag });
  assert.equal(again.status, 304);
});

test('не больше 30 новых диалогов в час, в уже начатый — можно писать', async () => {
  const s2 = await startServer();
  try {
    const admin = await registerUser(s2.base, { name: 'Модератор', email: 'admin@test.local' });
    const sellers = [await registerUser(s2.base, { name: 'Продавец', email: 'seller@test.local' }), await registerUser(s2.base, { name: 'Магазин', email: 'shop@test.local' })];
    const buyer = await registerUser(s2.base, { name: 'Покупатель', email: 'buyer@test.local' });
    const ids = [];
    for (let i = 0; i < 31; i++) ids.push(await publish(sellers[i % 2], admin, { title: `Книга ${i}`, category: 'hobby', city: 'Казань', price: 100 + i }));
    for (let i = 0; i < 30; i++) assert.equal((await buyer.post('/api/conversations', { listingId: ids[i] })).status, 200);
    assert.equal((await buyer.post('/api/conversations', { listingId: ids[30] })).status, 429);
    assert.equal((await buyer.post('/api/conversations', { listingId: ids[0] })).status, 200, 'существующий диалог открывается');
  } finally { s2.stop(); }
});

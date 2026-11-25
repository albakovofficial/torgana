'use strict';
// 1.56.0: приложение для iPhone — push через Apple (APNs), «Войти с Apple», Universal Links.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const http2 = require('node:http2');
const crypto = require('node:crypto');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, registerUser, client } = require('./helpers');

const apnsKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const appleKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
const TOKEN_OK = 'a'.repeat(64); const TOKEN_GONE = 'b'.repeat(64); const TOKEN_BADKEY = 'c'.repeat(64);
const got = [];
let apnsSrv; let keysSrv; let srv; let admin; let anna; let boris;

const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function appleToken(claims) {
  const data = `${b64u({ alg: 'RS256', kid: KID })}.${b64u({ iss: 'https://appleid.apple.com', aud: 'ru.torgana.app', exp: Math.floor(Date.now() / 1000) + 600, ...claims })}`;
  return `${data}.${crypto.sign('RSA-SHA256', Buffer.from(data), appleKey.privateKey).toString('base64url')}`;
}
const devices = (id) => { const db = new DatabaseSync(path.join(srv.tmp, 'data', 'torgana.db')); const n = db.prepare('SELECT COUNT(*) AS n FROM apns_tokens WHERE user_id = ?').get(id).n; db.close(); return n; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

test.before(async () => {
  apnsSrv = http2.createServer();
  apnsSrv.on('stream', (stream, headers) => {
    let body = '';
    stream.on('data', (d) => { body += d; });
    stream.on('end', () => {
      got.push({ path: headers[':path'], headers, body: JSON.parse(body) });
      const gone = headers[':path'].endsWith(TOKEN_GONE); const badKey = headers[':path'].endsWith(TOKEN_BADKEY);
      stream.respond({ ':status': gone ? 410 : badKey ? 403 : 200 });
      stream.end(gone ? JSON.stringify({ reason: 'Unregistered' }) : badKey ? JSON.stringify({ reason: 'InvalidProviderToken' }) : '');
    });
  });
  await new Promise((r) => apnsSrv.listen(0, '127.0.0.1', r));
  const jwk = { ...appleKey.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
  keysSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise((r) => keysSrv.listen(0, '127.0.0.1', r));
  srv = await startServer({ ADMIN_EMAIL: 'admin@test.local', APNS_TEST_URL: `http://127.0.0.1:${apnsSrv.address().port}`, OAUTH_TEST_BASE: `http://127.0.0.1:${keysSrv.address().port}` });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
});
test.after(async () => { await srv.stop(); apnsSrv.close(); keysSrv.close(); });

test('ключ Apple: проверка полей, ключ наружу не отдаётся; файл ссылок — после ключа', async () => {
  assert.equal((await client(srv.base).get('/.well-known/apple-app-site-association')).status, 404, 'до ключа — нет');
  assert.equal((await anna.put('/api/admin/apns', {})).status, 403);
  let r = await admin.put('/api/admin/apns', { teamId: 'ABCDE12345', keyId: 'KEY1234567', key: 'не ключ' });
  assert.equal(r.status, 400); assert.match(r.data.error, /\.p8/);
  r = await admin.put('/api/admin/apns', { teamId: 'abc', keyId: 'KEY1234567', key: apnsKey.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  assert.match(r.data.error, /Team ID/);
  r = await admin.put('/api/admin/apns', { teamId: 'abcde12345', keyId: 'KEY1234567', key: apnsKey.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const g = (await admin.get('/api/admin/apns')).data;
  assert.deepEqual([g.ready, g.teamId, g.keyId, g.hasKey, g.topic, 'key' in g], [true, 'ABCDE12345', 'KEY1234567', true, 'ru.torgana.app', false]);
  const a = await client(srv.base).get('/.well-known/apple-app-site-association');
  assert.equal(a.status, 200);
  assert.deepEqual(a.data.applinks.details[0].appIDs, ['ABCDE12345.ru.torgana.app']);
  assert.deepEqual(a.data.webcredentials.apps, ['ABCDE12345.ru.torgana.app']);
});

test('push в приложение: адрес устройства, подписанный запрос Apple, число на значке, мёртвый адрес удаляется', async () => {
  assert.equal((await anna.post('/api/push/apns', { token: 'xyz' })).status, 400);
  assert.equal((await anna.post('/api/push/apns', { token: TOKEN_OK.toUpperCase(), env: 'production' })).status, 200);
  assert.equal((await anna.post('/api/push/apns', { token: TOKEN_GONE })).status, 200);
  assert.equal(devices(anna.user.id), 2, 'два iPhone');
  const lid = (await anna.post('/api/listings', { title: 'Велосипед', category: 'hobby', city: 'Казань', price: '1000' })).data.id;
  await admin.post(`/api/admin/listings/${lid}/restore`);
  const cid = (await boris.post('/api/conversations', { listingId: lid })).data.id;
  await boris.post(`/api/conversations/${cid}/messages`, { body: 'Ещё продаётся?' });
  let m;
  for (let i = 0; i < 60 && !(m = got.find((x) => x.path === `/3/device/${TOKEN_OK}` && /Борис|сообщен/i.test(JSON.stringify(x.body)))); i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(m, `push не дошёл: ${JSON.stringify(got.map((x) => x.body.aps.alert))}`);
  assert.equal(m.headers['apns-topic'], 'ru.torgana.app');
  assert.equal(m.headers['apns-push-type'], 'alert');
  const [h, p, s] = m.headers.authorization.replace('bearer ', '').split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY1234567' });
  assert.equal(JSON.parse(Buffer.from(p, 'base64url')).iss, 'ABCDE12345');
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: apnsKey.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'подпись ключом .p8');
  assert.ok(m.body.aps.badge >= 1, 'число на значке');
  assert.equal(m.body.aps.sound, 'default');
  assert.match(m.body.url, /^\/messages\//);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(devices(anna.user.id), 1, 'Unregistered — адрес удалён');
  // выключить на устройстве
  await anna.post('/api/push/apns/off', { token: TOKEN_OK });
  assert.equal(devices(anna.user.id), 0);
});

test('«Войти с Apple»: подпись, aud, одноразовый nonce, новый аккаунт и повторный вход', async () => {
  const guest = client(srv.base);
  let { nonce } = (await guest.post('/api/auth/apple/nonce', { next: '/profile' })).data;
  const tok = appleToken({ sub: 'apple-001', email: 'Kate@privaterelay.appleid.com', email_verified: 'true', nonce: sha(nonce) });
  assert.equal((await guest.post('/api/auth/apple', { identityToken: tok, nonce })).status, 400, 'без согласия — нет');
  ({ nonce } = (await guest.post('/api/auth/apple/nonce', {})).data);
  const tok2 = appleToken({ sub: 'apple-001', email: 'Kate@privaterelay.appleid.com', email_verified: 'true', nonce: sha(nonce) });
  const r = await guest.post('/api/auth/apple', { identityToken: tok2, nonce, name: 'Катя Иванова', consent: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const me = (await guest.get('/api/me')).data.user;
  assert.deepEqual([me.name, me.email], ['Катя Иванова', 'kate@privaterelay.appleid.com']);
  assert.equal((await guest.post('/api/auth/apple', { identityToken: tok2, nonce, consent: true })).status, 400, 'nonce одноразовый');
  // повторный вход: имени и почты Apple уже не даёт — находим по sub
  const g2 = client(srv.base);
  const n2 = (await g2.post('/api/auth/apple/nonce', {})).data.nonce;
  assert.equal((await g2.post('/api/auth/apple', { identityToken: appleToken({ sub: 'apple-001', nonce: sha(n2) }), nonce: n2, consent: true })).status, 200);
  assert.equal((await g2.get('/api/me')).data.user.id, me.id);
  // чужое приложение или подделка
  const n3 = (await g2.post('/api/auth/apple/nonce', {})).data.nonce;
  assert.equal((await g2.post('/api/auth/apple', { identityToken: appleToken({ sub: 'x', aud: 'com.other.app', nonce: sha(n3) }), nonce: n3, consent: true })).status, 400);
  const n4 = (await g2.post('/api/auth/apple/nonce', {})).data.nonce;
  const fake = appleToken({ sub: 'apple-001', nonce: sha(n4) }).replace(/\.[^.]+$/, '.AAAA');
  assert.equal((await g2.post('/api/auth/apple', { identityToken: fake, nonce: n4, consent: true })).status, 400, 'подпись не сходится');
  // привязка к открытому аккаунту из настроек
  const n5 = (await boris.post('/api/auth/apple/nonce', { link: true })).data.nonce;
  const lk = await boris.post('/api/auth/apple', { identityToken: appleToken({ sub: 'apple-boris', nonce: sha(n5) }), nonce: n5 });
  assert.equal(lk.status, 200, JSON.stringify(lk.data));
  const n6 = (await boris.post('/api/auth/apple/nonce', { link: true })).data.nonce;
  assert.equal((await boris.post('/api/auth/apple', { identityToken: appleToken({ sub: 'apple-001', nonce: sha(n6) }), nonce: n6 })).status, 409, 'чужой Apple ID');
});

test('«Проверить»: понятная причина, если уведомление не дошло', async () => {
  const carl = await registerUser(srv.base, { name: 'Карл', email: 'carl@test.local' });
  let r = await carl.post('/api/push/test');
  assert.deepEqual([r.data.ok, /не подключено/.test(r.data.error)], [false, true], JSON.stringify(r.data));
  await carl.post('/api/push/apns', { token: TOKEN_BADKEY });
  r = await carl.post('/api/push/test');
  assert.equal(r.data.ok, false);
  assert.match(r.data.error, /ключ APNs/, 'Apple не принял ключ — так и говорим');
  const g = (await admin.get('/api/admin/apns')).data;
  assert.equal(g.lastError.reason, 'InvalidProviderToken');
  assert.equal(devices(carl.user.id), 1, 'из-за ключа адрес устройства не удаляем');
  await carl.post('/api/push/test');
  assert.equal(new Set(got.map((x) => x.headers.authorization)).size, 1, 'вход Apple не обновляем на каждый ответ 403 — иначе TooManyProviderTokenUpdates');
});

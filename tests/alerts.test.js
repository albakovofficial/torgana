'use strict';

// Для пользователей: push (шифрование и доставка), сохранённые поиски, снижение цены, фото в чате, подборка за день.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { startServer, startSmtp, registerUser, publish, PNG_1PX } = require('./helpers');
const { encrypt, b64u, unb64u } = require('../lib/push');

// Браузер «понарошку»: свои ключи подписки и расшифровка по RFC 8291 — так проверяем, что сервер шифрует правильно.
function fakeBrowser() {
  const ecdh = crypto.createECDH('prime256v1');
  const pub = ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  return {
    keys: { p256dh: b64u(pub), auth: b64u(auth) },
    decrypt(buf) {
      const salt = buf.subarray(0, 16); const idlen = buf[20]; const asPub = buf.subarray(21, 21 + idlen); const data = buf.subarray(21 + idlen);
      const ikm = hmac(hmac(auth, ecdh.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), pub, asPub, Buffer.from([1])])).subarray(0, 32);
      const prk = hmac(salt, ikm);
      const d = crypto.createDecipheriv('aes-128-gcm', hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
      d.setAuthTag(data.subarray(data.length - 16));
      const out = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
      assert.equal(out[out.length - 1], 2, 'разделитель последней записи');
      return JSON.parse(out.subarray(0, out.length - 1).toString());
    }
  };
}

test('шифрование push: браузер расшифровывает то, что зашифровал сервер', () => {
  const b = fakeBrowser();
  const msg = { title: 'Проверка', body: 'Привет, Торгана! ✓' };
  assert.deepEqual(b.decrypt(encrypt(JSON.stringify(msg), b.keys.p256dh, b.keys.auth)), msg);
  assert.equal(unb64u(b.keys.p256dh).length, 65);
});

let srv; let smtp; let pushSrv; let admin; let anna; let boris;
const inbox = []; // что дошло до «push-службы»
let pushPort;
before(async () => {
  pushSrv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c)).on('end', () => { inbox.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(req.url.includes('gone') ? 410 : 201); res.end(); });
  });
  await new Promise((r) => pushSrv.listen(0, '127.0.0.1', r));
  pushPort = pushSrv.address().port;
  smtp = await startSmtp();
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', PUSH_ALLOW_HTTP: '1', MAIL_TICK_MS: '150', DIGEST_TICK_MS: '200', DIGEST_MIN_AGE_MS: '0', DIGEST_ANY_HOUR: '1' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
});
after(async () => { await srv.stop(); await smtp.close(); pushSrv.close(); });

const borisPhone = fakeBrowser();
const waitPush = async (fn, ms = 4000) => {
  for (let t = 0; t < ms; t += 50) {
    const hit = inbox.map((m) => ({ ...m, msg: borisPhone.decrypt(m.body) })).find((m) => fn(m.msg));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`push не пришёл; есть: ${inbox.map((m) => borisPhone.decrypt(m.body).title).join('; ')}`);
};

test('подписка: только адреса push-служб, VAPID-подпись', async () => {
  const key = (await boris.get('/api/push')).data.key;
  assert.equal(unb64u(key).length, 65);
  assert.equal((await boris.post('/api/push/subscribe', { subscription: { endpoint: 'http://evil.example/x', keys: borisPhone.keys } })).status, 400);
  const ok = await boris.post('/api/push/subscribe', { subscription: { endpoint: `http://127.0.0.1:${pushPort}/sub/boris`, keys: borisPhone.keys }, device: 'Тест' });
  assert.equal(ok.data.devices, 1);
  assert.equal((await boris.post('/api/push/test')).data.ok, true);
  const m = await waitPush((x) => x.title === 'Уведомления включены');
  assert.equal(m.headers['content-encoding'], 'aes128gcm');
  const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(m.headers.authorization);
  assert.equal(k, key);
  const [h, p, sig] = t.split('.');
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(unb64u(key).subarray(1, 33)), y: b64u(unb64u(key).subarray(33)) }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: 'ieee-p1363' }, unb64u(sig)), 'подпись VAPID верна');
  assert.equal(JSON.parse(unb64u(p)).aud, `http://127.0.0.1:${pushPort}`);
});

let bike;
test('сохранённый поиск: новое объявление → push и счётчик нового', async () => {
  const s = await boris.post('/api/saved-searches', { q: 'велосипед', city: 'Казань', max: '20000', sort: 'cheap' });
  assert.equal(s.status, 200);
  assert.deepEqual(s.data.search.params, { q: 'велосипед', city: 'Казань', max: '20000' });
  assert.match(s.data.search.title, /велосипед.*Казань.*до 20/);
  assert.equal((await boris.post('/api/saved-searches', { q: 'велосипед', city: 'Казань', max: '20000' })).data.search.id, s.data.search.id, 'тот же поиск не дублируется');

  await publish(anna, admin, { title: 'Велосипед горный', description: 'Почти новый', category: 'hobby', city: 'Москва', price: 15000 }); // другой город
  await publish(anna, admin, { title: 'Велосипед дорожный', description: 'Отличный', category: 'hobby', city: 'Казань', price: 50000 }); // дороже
  bike = await publish(anna, admin, { title: 'Велосипед детский', description: 'Для 5–8 лет', category: 'hobby', city: 'Казань', price: 9000 });
  const m = await waitPush((x) => x.title.startsWith('Новое:'));
  assert.match(m.msg.body, /Велосипед детский — 9/);
  assert.equal(m.msg.url, `/l/${bike}`);
  assert.equal(inbox.filter((x) => borisPhone.decrypt(x.body).title.startsWith('Новое:')).length, 1, 'только подходящее');
  const me = (await boris.get('/api/me')).data;
  assert.equal(me.fresh.search, 1);
  await boris.post(`/api/saved-searches/${s.data.search.id}/seen`);
  assert.equal((await boris.get('/api/me')).data.fresh.search, 0);

  // Своё объявление по своему поиску не присылаем.
  await boris.post('/api/saved-searches', { q: 'самокат' });
  await publish(boris, admin, { title: 'Самокат', category: 'hobby', city: 'Казань', price: 3000 });
  await waitPush((x) => x.title === 'Объявление опубликовано' && x.body.includes('Самокат')); // решение модерации — да
  assert.ok(!inbox.some((x) => /^Новое:.*самокат/.test(borisPhone.decrypt(x.body).title)), 'по своему объявлению — нет');
});

test('снижение цены в избранном: push, зачёркнутая цена; повышение — без уведомлений', async () => {
  await boris.post(`/api/favorites/${bike}`, {}, { origin: srv.base });
  const cur = (await anna.get(`/api/listings/${bike}`)).data.listing;
  await anna.patch(`/api/listings/${bike}`, { title: cur.title, description: cur.description, category: cur.category, city: cur.city, price: 7000 });
  await admin.post(`/api/admin/listings/${bike}/restore`);
  const m = await waitPush((x) => x.title === 'Цена снижена');
  assert.match(m.msg.body, /7\s000 ₽ вместо 9\s000 ₽/);
  const fav = (await boris.get('/api/favorites')).data.items.find((i) => i.id === bike);
  assert.equal(fav.priceWas, 9000);
  assert.equal((await boris.get(`/api/listings/${bike}`)).data.listing.priceWas, 9000);
  // Повторная публикация не рассылает объявление по поискам заново.
  assert.equal(inbox.filter((x) => borisPhone.decrypt(x.body).body.includes('Велосипед детский —')).length, 1);
});

test('чат: фото в сообщении, push собеседнику; выключенный вид push не приходит', async () => {
  const conv = (await boris.post('/api/conversations', { listingId: bike })).data.id;
  await boris.post(`/api/conversations/${conv}/messages`, { body: 'Здравствуйте!' });
  const up = (await anna.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` })).data;
  assert.equal((await anna.post(`/api/conversations/${conv}/messages`, { photo: 'чужое.png' })).status, 400);
  const sent = await anna.post(`/api/conversations/${conv}/messages`, { photo: up.file });
  assert.equal(sent.data.message.photo, up.url);
  const m = await waitPush((x) => x.tag === `chat-${conv}`);
  assert.equal(m.msg.body, '📷 Фото');
  assert.equal((await boris.get(`/api/conversations/${conv}`)).data.messages[1].photo, up.url);

  await boris.patch('/api/me', { pushMessages: false });
  assert.equal((await boris.get('/api/me')).data.user.pushMessages, false);
  const n = inbox.length;
  await anna.post(`/api/conversations/${conv}/messages`, { body: 'Можно посмотреть завтра' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(inbox.length, n);
});

test('подборка за день: новое по поиску и снижение цены одним письмом', async () => {
  // Новое объявление по поиску Бориса, которое он ещё не видел.
  await publish(anna, admin, { title: 'Велосипед BMX', category: 'hobby', city: 'Казань', price: 12000 });
  await admin.put('/api/admin/mail', { host: '127.0.0.1', port: smtp.port, security: 'none', user: smtp.user, pass: smtp.pass, from: 'no-reply@torgana.test' });
  const m = await smtp.waitFor((x) => x.to === 'boris@test.local' && /Новое по/.test(x.subject), 6000);
  assert.match(m.html, /Велосипед BMX/);
  assert.match(m.html, /Подборка за день/);
  assert.match(m.headers, /List-Unsubscribe/);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(smtp.inbox.filter((x) => x.to === 'boris@test.local' && /Новое по/.test(x.subject)).length, 1, 'не чаще раза в сутки');
});

test('устройство отписалось в браузере (410) — подписка удаляется', async () => {
  const gone = fakeBrowser();
  await boris.post('/api/push/subscribe', { subscription: { endpoint: `http://127.0.0.1:${pushPort}/gone/1`, keys: gone.keys } });
  assert.equal((await boris.get('/api/push')).data.devices, 2);
  await boris.post('/api/push/test');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await boris.get('/api/push')).data.devices, 1);
});

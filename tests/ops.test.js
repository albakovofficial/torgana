'use strict';

// 1.18: копия в облако (S3 Selectel), проверка копии, письма владельцу о сбоях, код для входа в модерацию.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { startServer, startSmtp, registerUser, publish, client, PNG_1PX, fakeS3 } = require('./helpers');
const createS3 = require('../lib/s3');

let s3; let smtp; let srv; let admin; let seller;
before(async () => {
  s3 = await fakeS3();
  smtp = await startSmtp();
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', MAIL_TICK_MS: '150' });
  admin = await registerUser(srv.base, { name: 'Владелец', email: 'admin@test.local' });
  seller = await registerUser(srv.base, { name: 'Олег', email: 'oleg@test.local' });
  const up = await seller.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX.toString('base64')}` });
  await publish(seller, admin, { title: 'Велосипед', category: 'hobby', city: 'Казань', price: 9000, photos: [up.data.file] });
});
after(async () => { await srv.stop(); await smtp.close(); s3.srv.close(); });

const cfg = (extra = {}) => ({ endpoint: s3.endpoint, region: 'ru-1', bucket: s3.bucket, accessKey: s3.access, secretKey: s3.secret, prefix: 'torgana', ...extra });

test('клиент S3: подпись принимается, файл туда и обратно, список, удаление; неверный ключ — понятная ошибка', async () => {
  const c = createS3({ ...cfg() });
  await c.put('t/привет файл.txt', Buffer.from('ok'));
  assert.equal(String(await c.get('t/привет файл.txt')), 'ok');
  assert.deepEqual((await c.list('t/')).map((x) => x.key), ['t/привет файл.txt']);
  assert.equal((await c.head('t/привет файл.txt')).size, 2);
  await c.del('t/привет файл.txt');
  assert.equal(await c.head('t/привет файл.txt'), null);
  await assert.rejects(createS3({ ...cfg(), secretKey: 'wrong' }).put('x', Buffer.from('1')), /неверный секретный ключ/);
  await assert.rejects(createS3({ ...cfg(), bucket: 'nope' }).put('x', Buffer.from('1')), /контейнер не найден/);
});

test('настройка хранилища: проверка доступа при сохранении, секрет не показывается', async () => {
  let r = await admin.put('/api/admin/backup', cfg({ secretKey: 'wrong' }));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /неверный секретный ключ/);
  assert.equal((await seller.put('/api/admin/backup', cfg())).status, 403);
  r = await admin.put('/api/admin/backup', cfg());
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ready, true);
  assert.equal(r.data.config.hasSecret, true);
  assert.ok(!JSON.stringify(r.data).includes(s3.secret), 'секрет не уходит в браузер');
  // пустой секрет при правке — остаётся прежний
  r = await admin.put('/api/admin/backup', cfg({ secretKey: '' }));
  assert.equal(r.status, 200);
  assert.equal([...s3.store.keys()].filter((k) => k.includes('check-')).length, 0, 'проверочный файл удалён');
});

const waitBackup = async (pred) => {
  for (let i = 0; i < 100; i++) { const r = (await admin.get('/api/admin/backup')).data; if (!r.running && r.last && pred(r)) return r; await new Promise((x) => setTimeout(x, 100)); }
  throw new Error('копия не закончилась');
};

test('копия: база сжатая и все фото; повтор догружает только новое; last.json', async () => {
  const r0 = await admin.post('/api/admin/backup/run');
  assert.equal(r0.status, 200);
  const r = await waitBackup((x) => x.last.reason === 'manual');
  assert.equal(r.last.ok, true, JSON.stringify(r.last));
  assert.equal(r.last.files, 1);
  assert.equal(r.last.counts.users, 2);
  const dbKey = [...s3.store.keys()].find((k) => /^torgana\/db\/torgana-\d{4}-\d\d-\d\d-\d{4}\.db\.gz$/.test(k));
  assert.ok(dbKey, 'копия базы в хранилище');
  const raw = zlib.gunzipSync(s3.store.get(dbKey).body);
  assert.equal(raw.subarray(0, 15).toString(), 'SQLite format 3');
  assert.ok([...s3.store.keys()].some((k) => /^torgana\/uploads\/[a-f0-9]{32}\.png$/.test(k)));
  assert.equal(JSON.parse(s3.store.get('torgana/last.json').body).dbKey, dbKey);
  await new Promise((x) => setTimeout(x, 1100)); // новое имя копии — по минутам; ждём, чтобы не совпало время запуска
  await admin.post('/api/admin/backup/run');
  const r2 = await waitBackup((x) => x.last.at > r.last.at);
  assert.equal(r2.last.files, 0, 'фото уже в хранилище');
  assert.equal(r2.uploaded.n, 1);
});

test('проверка копии: целостность, сравнение с сайтом, фото на месте', async () => {
  const r = await admin.post('/api/admin/backup/verify');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const v = r.data.verify;
  assert.equal(v.ok, true);
  assert.deepEqual(v.copy, v.live);
  assert.equal(v.photos.checked, 1);
  assert.equal(v.photos.ok, 1);
});

test('сбой копии — письмо владельцу (не чаще раза в сутки)', async () => {
  await admin.put('/api/admin/mail', { host: '127.0.0.1', port: smtp.port, security: 'none', user: smtp.user, pass: smtp.pass, from: 'no-reply@torgana.test' });
  s3.st.fail = true;
  await admin.post('/api/admin/backup/run');
  const r = await waitBackup((x) => x.last.ok === false);
  assert.match(r.last.error, /ServiceUnavailable/);
  const m = await smtp.waitFor((x) => x.to === 'admin@test.local' && /копия в облако не сделана/.test(x.subject), 5000);
  assert.match(m.html, /Сделать копию сейчас/);
  await admin.post('/api/admin/backup/run');
  await waitBackup((x) => x.last.ok === false && x.last.at > r.last.at);
  await new Promise((x) => setTimeout(x, 400));
  assert.equal(smtp.inbox.filter((x) => /копия в облако не сделана/.test(x.subject)).length, 1, 'второе письмо — не раньше чем через сутки');
  s3.st.fail = false;
});

test('состояние сервера: диск и ошибки видны в модерации', async () => {
  const r = (await admin.get('/api/admin/backup')).data;
  assert.ok(r.server.disk.total > 0);
  assert.equal(typeof r.server.errorsHour, 'number');
  assert.equal(r.server.owner, 'admin@test.local');
});

test('вход в модерацию с нового устройства — по коду из письма, устройство помнится', async () => {
  const smtp2 = await startSmtp();
  const s2 = await startServer({ ADMIN_DEVICE_CHECK: '1', MAIL_TICK_MS: '150' });
  try {
    const a = await registerUser(s2.base, { name: 'Модератор', email: 'admin@test.local' });
    // почта ещё не подключена — код не отправить, модерация открыта (иначе владелец не попадёт в «Почту»)
    assert.equal((await a.get('/api/admin/backup')).status, 200);
    await a.put('/api/admin/mail', { host: '127.0.0.1', port: smtp2.port, security: 'none', user: smtp2.user, pass: smtp2.pass, from: 'no-reply@torgana.test' });
    let r = await a.get('/api/admin/backup');
    assert.equal(r.status, 403);
    assert.equal(r.data.device, true);
    assert.equal((await a.get('/api/admin/device')).data.trusted, false);
    r = await a.post('/api/admin/device/send');
    assert.equal(r.data.sent, true);
    assert.equal((await a.post('/api/admin/device/send')).data.sent, false, 'повтор — через минуту');
    const m = await smtp2.waitFor((x) => /код для входа в модерацию/.test(x.subject), 5000);
    const code = /^(\d{6})/.exec(m.subject)[1];
    assert.match(m.html, /нового устройства/);
    assert.equal((await a.post('/api/admin/device/verify', { code: code === '000000' ? '111111' : '000000' })).status, 400);
    const sess = a.cookie;
    r = await a.post('/api/admin/device/verify', { code });
    assert.equal(r.status, 200);
    const dev = /tg_dev=([a-f0-9]+)/.exec(r.headers.get('set-cookie'))[1];
    // сессия + устройство: обе cookie
    a.cookie = `${sess}; tg_dev=${dev}`;
    assert.equal((await a.get('/api/admin/backup')).status, 200);
    const list = (await a.get('/api/admin/devices')).data.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].current, true);
    // тот же аккаунт на другом устройстве — снова код
    const other = client(s2.base);
    await other.post('/api/auth/login', { email: 'admin@test.local', password: 'password123' });
    // вход требует код почты? почта у модератора не подтверждена — подтверждаем через код входа
    if (!other.cookie) {
      const lm = await smtp2.waitFor((x) => /код подтверждения/.test(x.subject), 5000);
      await other.post('/api/auth/code', { email: 'admin@test.local', code: /^(\d{6})/.exec(lm.subject)[1] });
    }
    assert.equal((await other.get('/api/admin/backup')).status, 403);
    // «забыть» устройство — снова нужен код
    await a.del(`/api/admin/devices/${list[0].id}`);
    assert.equal((await a.get('/api/admin/backup')).status, 403);
    // обычные разделы сайта работают без кода
    assert.equal((await a.get('/api/me')).status, 200);
  } finally { await s2.stop(); await smtp2.close(); }
});

test('почта сломана — владелец входит в модерацию без кода, чтобы её починить; письмо видно с ошибкой', async () => {
  const s2 = await startServer({ ADMIN_DEVICE_CHECK: '1', MAIL_TICK_MS: '150' });
  try {
    const a = await registerUser(s2.base, { name: 'Владелец', email: 'admin@test.local' });
    const helper = await registerUser(s2.base, { name: 'Модератор 2', email: 'mod2@test.local' });
    // почтовый сервер «не отвечает»: порт, на котором никого нет
    await a.put('/api/admin/mail', { host: '127.0.0.1', port: 1, security: 'none', user: 'u', pass: 'p', from: 'no-reply@torgana.test' });
    assert.equal((await a.get('/api/admin/backup')).status, 403);
    await a.post('/api/admin/device/send');
    let d;
    for (let i = 0; i < 40; i++) { d = (await a.get('/api/admin/device')).data; if (d.letter && d.letter.error) break; await new Promise((r) => setTimeout(r, 100)); }
    assert.ok(d.letter.error, 'ошибка отправки видна на странице кода');
    assert.equal(d.mail.broken, false, 'одной ошибки мало');
    // ещё два письма тоже не ушли (например, коды подтверждения почты)
    await client(s2.base).post('/api/auth/forgot', { email: 'admin@test.local' });
    await client(s2.base).post('/api/auth/forgot', { email: 'mod2@test.local' });
    for (let i = 0; i < 40; i++) { d = (await a.get('/api/admin/device')).data; if (d.mail.broken) break; await new Promise((r) => setTimeout(r, 100)); }
    assert.equal(d.mail.broken, true);
    assert.equal((await a.get('/api/admin/backup')).status, 200, 'владелец вошёл, чтобы починить почту');
  } finally { await s2.stop(); }
});

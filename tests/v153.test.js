'use strict';
// 1.53.0: push модераторам — новые продавцы, апелляции, долгое ожидание проверки, медали, итоги дня, сбои сайта.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, registerUser, fakeApns } = require('./helpers');

let srv; let apple; let admin; let mod; let anna;
const phone = 'admin'; const modPhone = 'mod';
const got = (who) => apple.to(who);
const wait = async (who, _b, fn, ms = 5000) => {
  for (let t = 0; t < ms; t += 50) { const hit = got(who).find(fn); if (hit) return hit; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error(`push не пришёл; есть: ${got(who).map((x) => x.title).join('; ')}`);
};
test.before(async () => {
  apple = await fakeApns();
  srv = await startServer({ ADMIN_EMAIL: 'admin@test.local,mod@test.local', PUBLIC_URL: 'http://torgana.test', APNS_TEST_URL: apple.url,
    ADMIN_TICK_MS: '200', ADMIN_WAIT_MS: '1', ADMIN_ANY_HOUR: '1', OPS_TICK_MS: '300' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  mod = await registerUser(srv.base, { name: 'Второй модератор', email: 'mod@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна Смирнова', email: 'anna@test.local' });
  await apple.connect(admin);
  await apple.phone(admin, 'admin');
  await apple.phone(mod, 'mod');
});
test.after(async () => { if (process.env.SHOW_PUSH) console.log(JSON.stringify(got('admin', phone).map((x) => [x.title, x.body]), null, 1)); await srv.stop(); apple.close(); });

test('по умолчанию включены все 12 видов; выключенный «Новые продавцы» — приходит обычное «на проверку»', async () => {
  assert.equal((await admin.get('/api/admin/me/notify')).data.push.length, 12);
  const r = await mod.put('/api/admin/me/notify', { push: ['pending', 'appeals'] });
  assert.deepEqual(r.data.push, ['pending', 'appeals']);
});

let first; let second;
test('первое объявление — «Новый продавец» с медалью; у кого он выключен — «Новое объявление на проверку»', async () => {
  first = (await anna.post('/api/listings', { title: 'Велосипед горный', category: 'hobby', city: 'Казань', price: '18500' })).data.id;
  const m = await wait('admin', phone, (x) => x.title === 'Новый продавец');
  assert.match(m.body, /^Анна Смирнова отправила первое объявление «Велосипед горный»\. После одобрения — медаль «Одна из первых»\. В очереди: 1$/);
  assert.equal(m.url, `/admin/l/${first}`);
  await wait('mod', modPhone, (x) => x.title === 'Новое объявление на проверку');
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!got('admin', phone).some((x) => x.title === 'Новое объявление на проверку'), 'не дублируется');
  assert.ok(!got('mod', modPhone).some((x) => x.title === 'Новый продавец'), 'выключено');
});

test('объявление ждёт проверки — напоминание со временем ожидания (один раз, не чаще раза в час)', async () => {
  const m = await wait('admin', phone, (x) => /ждёт проверки дольше/.test(x.title));
  assert.match(m.title, /^1 объявление ждёт проверки дольше 1 мин$/);
  assert.match(m.body, /^Самое старое — \d+ мин\. Всего на проверке: 1$/);
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(got('admin', phone).filter((x) => /ждёт проверки/.test(x.title)).length, 1);
});

test('медаль № 1 — push модератору; апелляция — push', async () => {
  await admin.post(`/api/admin/listings/${first}/restore`); // «Одобрить»
  const m = await wait('admin', phone, (x) => x.title === 'Выдана медаль № 1');
  assert.equal(m.body, 'Анна Смирнова — «Одна из первых». Осталось 999');
  second = (await anna.post('/api/listings', { title: 'Самокат детский', category: 'hobby', city: 'Казань', price: '2500' })).data.id;
  await admin.post(`/api/admin/listings/${second}/reject`, { reason: 'Добавьте фото товара' });
  assert.equal((await anna.post(`/api/listings/${second}/appeal`, { text: 'Фото есть, посмотрите ещё раз, пожалуйста' })).status, 200);
  for (const [who, b] of [['admin', phone], ['mod', modPhone]]) {
    const a = await wait(who, b, (x) => x.title === 'Апелляция');
    assert.equal(a.body, '«Самокат детский» — Анна Смирнова: Фото есть, посмотрите ещё раз, пожалуйста');
    assert.equal(a.url, `/admin/l/${second}`);
  }
});

test('итоги дня — один раз в день', async () => {
  // первый проход таймера был до подписки на push — «сегодня» забываем, и сводка уходит снова
  const db = new DatabaseSync(path.join(srv.tmp, 'data', 'torgana.db'));
  db.prepare('DELETE FROM settings WHERE key = ?').run('adm_digest_day'); db.close();
  const d = await wait('admin', phone, (x) => x.title === 'Итоги дня на Торгане');
  assert.match(d.body, /^Сегодня: \d+ регистраци/);
  assert.match(d.body, /На проверке сейчас: \d+$/);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(got('admin', phone).filter((x) => x.title === 'Итоги дня на Торгане').length, 1);
  assert.ok(!got('mod', modPhone).some((x) => x.title === 'Итоги дня на Торгане'), 'у второго выключено');
});

test('сбой: письма не уходят — push «Сбой» (почтой его не отправить)', async () => {
  const db = new DatabaseSync(path.join(srv.tmp, 'data', 'torgana.db'));
  const t = Date.now();
  for (let i = 0; i < 3; i++) db.prepare('INSERT INTO mail_queue (kind, to_email, subject, html, text, status, attempts, next_at, last_error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('test', 'x@test.ru', 'Тема', '', '', 'failed', 3, t, 'SMTP 535 Authentication failed', t);
  db.close();
  const m = await wait('admin', phone, (x) => x.title === 'Сбой: письма с сайта не уходят', 8000);
  assert.match(m.body, /Три последних письма подряд не отправились/);
  assert.equal(m.url, '/admin?status=mail');
});

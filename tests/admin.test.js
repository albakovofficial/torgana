'use strict';

// Для администрации: автопроверки, сводка, пользователи (карточка, блокировка с причиной), журнал, письма модератору.
const { test, before, after, describe } = require('node:test');
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
  assert.deepEqual(s.data, { mode: 'instant', kinds: ['pending', 'support'], push: ['pending', 'sellers', 'waiting', 'appeals', 'reports', 'support', 'biz', 'rep', 'pay', 'medals', 'digest', 'ops'] }); // 1.53.0: все 12 видов push
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

// 1.54.0: встречная цена в торге, срок проверки для продавца, воронка продавцов в «Сводке».
describe('срок проверки и воронка продавцов', () => {
  const assert = require('node:assert/strict');
  const { startServer, registerUser, publish } = require('./helpers');
  let srv; let admin; let oleg; let anna;
  test.before(async () => {
    srv = await startServer({ ADMIN_EMAIL: 'admin@test.local' });
    admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
    oleg = await registerUser(srv.base, { name: 'Олег', email: 'oleg@test.local' });
    anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
    // два решения модератора и переписка Анны с Олегом — для медианы проверки и воронки
    const lid = await publish(oleg, admin, { title: 'Велосипед Merida', category: 'hobby', city: 'Казань', price: 40000 });
    await publish(oleg, admin, { title: 'Самокат Xiaomi', category: 'hobby', city: 'Казань', price: 15000 });
    const cid = (await anna.post('/api/conversations', { listingId: lid })).data.id;
    await anna.post(`/api/conversations/${cid}/messages`, { body: 'Здравствуйте, ещё продаёте?' });
  });
  test.after(() => srv.stop());

  test('срок проверки: место в очереди и медиана после трёх решений', async () => {
    const sub = async (who, title) => (await who.post('/api/listings', { title, category: 'hobby', city: 'Казань', price: '1000' })).data.id;
    const p1 = await sub(oleg, 'Гантели 10 кг');
    const p2 = await sub(anna, 'Коврик для йоги');
    let r = (await anna.get(`/api/listings/${p2}`)).data.review;
    assert.equal(r.place, 2);
    assert.equal(typeof r.night, 'boolean');
    assert.equal((await oleg.get(`/api/listings/${p1}`)).data.review.place, 1);
    assert.ok(!(await anna.get(`/api/listings/${p1}`)).data.review, 'чужому — нет');
    const my = (await anna.get('/api/my/listings')).data.items.find((i) => i.id === p2);
    assert.equal(my.review.place, 2);
    // одобрено уже 2 (из publish) + ещё одно — медиана появляется
    await admin.post(`/api/admin/listings/${p1}/restore`);
    r = (await anna.get(`/api/listings/${p2}`)).data.review;
    assert.equal(r.place, 1, 'очередь сдвинулась');
    assert.equal(typeof r.median, 'number');
  });

  test('воронка продавцов: шаги по тем, кто зарегистрировался за период', async () => {
    assert.equal((await anna.get('/api/admin/funnel')).status, 403);
    await registerUser(srv.base, { name: 'Пётр', email: 'petr@test.local' });
    const f = (await admin.get('/api/admin/funnel?days=30')).data;
    assert.equal(f.days, 30);
    const n = Object.fromEntries(f.steps.map((s) => [s.key, s.n]));
    assert.deepEqual(Object.keys(n), ['visits', 'signups', 'sellers', 'approved', 'contacted', 'sold']);
    assert.equal(n.signups, 3, 'модератор не считается');
    assert.equal(n.sellers, 2);
    assert.equal(n.approved, 1, 'у Анны объявление ещё на проверке');
    assert.equal(n.contacted, 1, 'Олегу писала Анна');
    assert.equal(typeof f.toFirst, 'number');
    assert.equal((await admin.get('/api/admin/funnel?days=0')).data.days, 0, 'за всё время');
  });
});

// 1.53.0: push модераторам — новые продавцы, апелляции, долгое ожидание проверки, медали, итоги дня, сбои сайта.
describe('push модераторам', () => {
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
});

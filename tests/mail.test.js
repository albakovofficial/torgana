'use strict';

// Письма: подключение почты в модерации, подтверждение email, восстановление пароля,
// уведомления о сообщениях и решениях модерации, отписка, ошибки почтового сервиса.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, startSmtp, client, registerUser, publish } = require('./helpers');

let srv; let smtp; let admin; let anna; let boris;
const link = (mail, path) => {
  const m = new RegExp(`https?://[^"\\s]+${path}\\?[^"\\s<]+`).exec(mail.html);
  assert.ok(m, `в письме нет ссылки ${path}`);
  return new URL(m[0].replace(/&amp;/g, '&'));
};

before(async () => {
  smtp = await startSmtp();
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', MAIL_TICK_MS: '150', CHAT_NOTIFY_DELAY_MS: '300', CHAT_NOTIFY_GAP_MS: '60000' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
});
after(async () => { await srv.stop(); await smtp.close(); });

const mailCfg = (over = {}) => ({ host: '127.0.0.1', port: smtp.port, security: 'none', user: smtp.user, pass: smtp.pass, from: 'no-reply@torgana.test', fromName: 'Торгана', ...over });

test('пока почта не подключена — восстановление пароля недоступно и скрыто', async () => {
  const g = client(srv.base);
  assert.equal((await g.get('/api/config')).data.mail, false);
  assert.equal((await g.post('/api/auth/forgot', { email: 'admin@test.local' })).status, 503);
});

test('раздел «Почта»: только модератор, пароль не возвращается, проверка письмом', async () => {
  assert.equal((await client(srv.base).put('/api/admin/mail', mailCfg())).status, 401);
  assert.equal((await admin.put('/api/admin/mail', mailCfg({ from: 'не-почта' }))).status, 400);
  const saved = await admin.put('/api/admin/mail', mailCfg());
  assert.equal(saved.status, 200);
  assert.equal(saved.data.config.pass, undefined);
  assert.equal(saved.data.config.hasPass, true);
  assert.equal((await client(srv.base).get('/api/config')).data.mail, true);

  // Пустой пароль при повторном сохранении не стирает сохранённый.
  await admin.put('/api/admin/mail', mailCfg({ pass: '' }));
  const t = await admin.post('/api/admin/mail/test', { to: 'owner@test.local' });
  assert.equal(t.status, 200);
  const m = await smtp.waitFor((x) => x.to === 'owner@test.local');
  assert.equal(m.subject, 'Проверка почты Торганы');
  assert.match(m.from, /Торгана <no-reply@torgana\.test>/);
  assert.match(m.html, /Почта работает/);
  assert.match(m.text, /Почта работает/);
  const st = await admin.get('/api/admin/mail');
  assert.ok(st.data.stats.recent.some((r) => r.kind === 'test' && r.status === 'sent'));
});

test('уведомления с no-reply: ответы уходят в поддержку, в шапке логотип, в подвале адрес поддержки', async () => {
  assert.equal((await admin.get('/api/admin/mail')).data.config.replyTo, 'support@test.local', 'по умолчанию — SUPPORT_EMAIL');
  await admin.post('/api/admin/mail/test', { to: 'reply@test.local' });
  let m = await smtp.waitFor((x) => x.to === 'reply@test.local');
  assert.match(m.headers, /^Reply-To: <support@test\.local>$/m);
  assert.match(m.html, /<img src="http:\/\/torgana\.test\/assets\/icons\/mail-logo\.png" width="34" height="34" alt="Т"/);
  assert.match(m.html, /mailto:support@test\.local/);
  assert.match(m.text, /ответьте на это письмо или напишите на support@test\.local/);
  const logo = await fetch(`${srv.base}/assets/icons/mail-logo.png`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');

  // Свой адрес для ответов; неверный — понятная ошибка; адрес поддержки снова — значит «по умолчанию».
  assert.equal((await admin.put('/api/admin/mail', mailCfg({ replyTo: 'не-почта' }))).status, 400);
  assert.equal((await admin.put('/api/admin/mail', mailCfg({ replyTo: 'Help@Test.local' }))).data.config.replyTo, 'help@test.local');
  await admin.post('/api/admin/mail/test', { to: 'reply2@test.local' });
  m = await smtp.waitFor((x) => x.to === 'reply2@test.local');
  assert.match(m.headers, /^Reply-To: <help@test\.local>$/m);
  await admin.put('/api/admin/mail', mailCfg({ replyTo: 'support@test.local' }));
  assert.equal((await admin.get('/api/admin/mail')).data.config.replyTo, 'support@test.local');
});

test('если адрес для ответов совпадает с отправителем — Reply-To не добавляется', () => {
  const { buildMessage } = require('../lib/smtp');
  const raw = buildMessage({ from: 'support@torgana.ru', replyTo: 'support@torgana.ru', to: 'a@b.ru', subject: 'x', text: 'x', html: 'x' });
  assert.doesNotMatch(raw, /Reply-To/);
  assert.match(buildMessage({ from: 'no-reply@torgana.ru', replyTo: 'support@torgana.ru', to: 'a@b.ru', subject: 'x', text: 'x', html: 'x' }), /\r\nReply-To: <support@torgana\.ru>\r\n/);
});

test('неверный пароль почты — понятная ошибка', async () => {
  await admin.put('/api/admin/mail', mailCfg({ pass: 'wrong' }));
  const r = await admin.post('/api/admin/mail/test', { to: 'owner@test.local' });
  assert.equal(r.status, 502);
  assert.match(r.data.error, /не принял логин или пароль/);
  await admin.put('/api/admin/mail', mailCfg());
});

test('регистрация → письмо с подтверждением → email подтверждён', async () => {
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  assert.equal(anna.user.emailVerified, false);
  const m = await smtp.waitFor((x) => x.to === 'anna@test.local' && /Подтвердите/.test(x.subject));
  const url = link(m, '/verify');
  assert.equal(url.origin, 'http://torgana.test');
  assert.equal((await client(srv.base).post('/api/auth/verify', { token: url.searchParams.get('token') })).status, 200);
  assert.equal((await anna.get('/api/me')).data.user.emailVerified, true);
  assert.equal((await client(srv.base).post('/api/auth/verify', { token: url.searchParams.get('token') })).status, 400, 'ссылка одноразовая');
});

test('повторное письмо с подтверждением из профиля', async () => {
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
  await smtp.waitFor((x) => x.to === 'boris@test.local');
  const before = smtp.inbox.length;
  assert.equal((await boris.post('/api/me/verify')).status, 200);
  const m = await smtp.waitFor((x) => smtp.inbox.indexOf(x) >= before && x.to === 'boris@test.local');
  const url = link(m, '/verify');
  await client(srv.base).post('/api/auth/verify', { token: url.searchParams.get('token') });
  assert.equal((await boris.get('/api/me')).data.user.emailVerified, true);
});

test('восстановление пароля', async () => {
  const g = client(srv.base);
  const other = client(srv.base);
  await other.post('/api/auth/login', { email: 'anna@test.local', password: 'password123' });

  const n = smtp.inbox.length;
  const yes = await g.post('/api/auth/forgot', { email: 'ANNA@test.local' });
  const no = await g.post('/api/auth/forgot', { email: 'nobody@test.local' });
  assert.deepEqual(yes.data, no.data, 'ответ не выдаёт, есть ли аккаунт');
  const m = await smtp.waitFor((x) => smtp.inbox.indexOf(x) >= n && x.to === 'anna@test.local' && /пароля/.test(x.subject));
  assert.ok(!smtp.inbox.slice(n).some((x) => x.to === 'nobody@test.local'));
  const token = link(m, '/reset').searchParams.get('token');

  assert.equal((await g.get(`/api/auth/reset?token=${token}`)).data.valid, true);
  assert.equal((await g.get(`/api/auth/reset?token=${'0'.repeat(64)}`)).data.valid, false);
  assert.equal((await g.post('/api/auth/reset', { token, password: '123' })).status, 400);
  const ok = await g.post('/api/auth/reset', { token, password: 'new-password-1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.email, 'anna@test.local');
  assert.equal((await g.post('/api/auth/reset', { token, password: 'another-pass' })).status, 400, 'ссылка одноразовая');
  assert.equal((await other.get('/api/me')).data.user, null, 'другие сессии завершены');
  assert.equal((await client(srv.base).post('/api/auth/login', { email: 'anna@test.local', password: 'password123' })).status, 401);
  assert.equal((await anna.post('/api/auth/login', { email: 'anna@test.local', password: 'new-password-1' })).status, 200);
});

test('новое сообщение → одно письмо получателю, не чаще раза в 15 минут', async () => {
  const lid = await publish(anna, admin, { title: 'Детская коляска Cybex', category: 'personal', city: 'Казань', price: '12000' });
  const c = await boris.post('/api/conversations', { listingId: lid });
  const n = smtp.inbox.length;
  await boris.post(`/api/conversations/${c.data.id}/messages`, { body: 'Здравствуйте! Ещё продаётся?' });
  const m = await smtp.waitFor((x) => smtp.inbox.indexOf(x) >= n && x.to === 'anna@test.local' && /Новое сообщение/.test(x.subject));
  assert.match(m.html, /Ещё продаётся/);
  assert.match(m.html, /Борис/);
  assert.match(m.html, new RegExp(`http://torgana\\.test/messages/${c.data.id}"`));
  assert.match(m.headers, /List-Unsubscribe: <http:\/\/torgana\.test\/api\/unsubscribe\?t=[a-f0-9]{32}&k=messages>/);
  assert.match(m.headers, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);

  await boris.post(`/api/conversations/${c.data.id}/messages`, { body: 'И доставка возможна?' });
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(smtp.inbox.slice(n).filter((x) => x.to === 'anna@test.local' && /Новое сообщение/.test(x.subject)).length, 1);

  // Прочитанное до отправки письма — не дублируем на почту.
  const c2 = await anna.post('/api/conversations', { listingId: await publish(boris, admin, { title: 'Велосипед', category: 'hobby', city: 'Казань' }) });
  await anna.post(`/api/conversations/${c2.data.id}/messages`, { body: 'Добрый день' });
  await boris.get(`/api/conversations/${c2.data.id}`);
  await new Promise((r) => setTimeout(r, 900));
  assert.ok(!smtp.inbox.slice(n).some((x) => x.to === 'boris@test.local' && /Новое сообщение/.test(x.subject)));
});

test('решения модерации приходят письмом; отписка в один клик', async () => {
  let n = smtp.inbox.length;
  const id = (await anna.post('/api/listings', { title: 'Ремонт квартир', category: 'services', city: 'Казань' })).data.id;
  await admin.post(`/api/admin/listings/${id}/restore`);
  await smtp.waitFor((x) => smtp.inbox.indexOf(x) >= n && /Объявление опубликовано: Ремонт квартир/.test(x.subject));
  n = smtp.inbox.length;
  await admin.post(`/api/admin/listings/${id}/reject`, { reason: 'Контакты в тексте объявления' });
  const rej = await smtp.waitFor((x) => smtp.inbox.indexOf(x) >= n && /Объявление отклонено: Ремонт квартир/.test(x.subject));
  assert.match(rej.html, /Контакты в тексте объявления/);
  assert.match(rej.html, /\/edit\//);

  await anna.post(`/api/listings/${id}/appeal`, { text: 'В тексте нет контактов, это название компании.' });
  n = smtp.inbox.length;
  assert.equal((await admin.post(`/api/admin/listings/${id}/appeal-deny`, { reason: 'Номер телефона в третьей строке' })).status, 200);
  const den = await smtp.waitFor((x) => smtp.inbox.indexOf(x) >= n && /Апелляция отклонена/.test(x.subject));
  assert.match(den.html, /Номер телефона в третьей строке/);
  const own = (await anna.get(`/api/listings/${id}`)).data.listing;
  assert.equal(own.appealReply, 'Номер телефона в третьей строке');
  assert.equal((await anna.post(`/api/listings/${id}/appeal`, { text: 'Ещё раз прошу пересмотреть решение.' })).status, 400, 'повторная апелляция после ответа — нет');

  // Отписка «в один клик» из почтового клиента
  const u = new URL(/List-Unsubscribe: <([^>]+)>/.exec(den.headers)[1]);
  const r = await fetch(`${srv.base}${u.pathname}${u.search}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  assert.equal(r.status, 200);
  assert.equal((await anna.get('/api/me')).data.user.notifyModeration, false);
  n = smtp.inbox.length;
  await admin.post(`/api/admin/listings/${id}/restore`);
  await new Promise((r2) => setTimeout(r2, 600));
  assert.ok(!smtp.inbox.slice(n).some((x) => x.to === 'anna@test.local'), 'после отписки писем о модерации нет');

  // Включить обратно в настройках
  await anna.patch('/api/me', { notifyModeration: true });
  n = smtp.inbox.length;
  await admin.post(`/api/admin/listings/${id}/reject`, { reason: 'Неверная категория' });
  await admin.post(`/api/admin/listings/${id}/restore`);
  await smtp.waitFor((x) => smtp.inbox.indexOf(x) >= n && /Объявление снова опубликовано/.test(x.subject));
  assert.equal((await client(srv.base).post('/api/unsubscribe', { t: 'x', k: 'all' })).status, 400);
});

test('письмо не ушло — повтор, затем «не доставлено» в журнале', async () => {
  await admin.put('/api/admin/mail', mailCfg({ port: 1 }));
  await boris.post('/api/me/verify').catch(() => {});
  await client(srv.base).post('/api/auth/forgot', { email: 'boris@test.local' });
  await new Promise((r) => setTimeout(r, 500));
  const st = (await admin.get('/api/admin/mail')).data.stats;
  const r = st.recent.find((x) => x.kind === 'reset' && x.to_email === 'boris@test.local');
  assert.ok(r && r.status === 'pending' && r.attempts >= 1 && /Нет связи/.test(r.last_error), JSON.stringify(r));
  await admin.put('/api/admin/mail', mailCfg());
});

test('отзывы: продавцу — «Новый отзыв», автору — решение; отдельная отписка от писем об отзывах', async () => {
  const id = await publish(boris, admin, { title: 'Гитара акустическая', category: 'hobby', city: 'Казань', price: '7000' });
  const conv = (await anna.post('/api/conversations', { listingId: id })).data.id;
  await anna.post(`/api/conversations/${conv}/messages`, { body: 'Добрый день! Можно посмотреть?' });
  await boris.post(`/api/conversations/${conv}/messages`, { body: 'Да, приезжайте.' });
  const rid = (await anna.post('/api/reviews', { conversationId: conv, rating: 5, received: true, text: 'Гитара отличная, всё честно.' })).data.review.id;
  let n = smtp.inbox.length;
  await admin.post(`/api/admin/reviews/${rid}/publish`);
  const toSeller = await smtp.waitFor((x) => smtp.inbox.indexOf(x) >= n && x.to === 'boris@test.local' && /Новый отзыв о вас/.test(x.subject));
  assert.match(toSeller.html, /Гитара отличная/);
  assert.match(toSeller.html, /\/profile\/reviews/);
  assert.match(toSeller.headers, /k=reviews/);
  await smtp.waitFor((x) => smtp.inbox.indexOf(x) >= n && x.to === 'anna@test.local' && /Отзыв опубликован/.test(x.subject));
  // отписка только от отзывов: сообщения и модерация остаются
  const was = (await boris.get('/api/me')).data.user;
  const u = new URL(/List-Unsubscribe: <([^>]+)>/.exec(toSeller.headers)[1]);
  await fetch(`${srv.base}${u.pathname}${u.search}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  const me = (await boris.get('/api/me')).data.user;
  assert.equal(me.notifyReviews, false);
  assert.equal(me.notifyMessages, was.notifyMessages, 'письма о сообщениях не тронуты');
  assert.equal(me.notifyModeration, was.notifyModeration, 'письма о модерации не тронуты');
  n = smtp.inbox.length;
  await boris.post(`/api/reviews/${rid}/complaint`, { reason: 'Другое', text: 'Проверяю, что писем об отзывах больше нет.' });
  await admin.post(`/api/admin/reviews/${rid}/complaint/keep`, { reason: 'Нарушений нет' });
  await new Promise((r) => setTimeout(r, 600));
  assert.ok(!smtp.inbox.slice(n).some((x) => x.to === 'boris@test.local' && /отзыв/i.test(x.subject)), 'после отписки писем об отзывах нет');
});

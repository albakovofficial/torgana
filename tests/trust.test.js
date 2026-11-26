'use strict';

// Вход через Яндекс ID и VK ID (с поддельными сервисами), «Телефон подтверждён», проверка бизнеса.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, startSmtp, registerUser, client, publish } = require('./helpers');

let srv; let smtp; let fake; let admin; let anna;
const seen = []; // запросы к «сервисам»
const PROFILES = {
  yandex: { id: 'ya-1', default_email: 'Ivan@Yandex.ru', real_name: 'Иван Петров', default_phone: { id: 1, number: '+79001234567' } },
  vk: { user_id: 777, first_name: 'Анна', last_name: 'Смирнова', email: 'anna@test.local', phone: '79005554433' }
};

before(async () => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; }).on('end', () => {
      seen.push({ url: req.url, body: Object.fromEntries(new URLSearchParams(body)), auth: req.headers.authorization || '' });
      const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/yandex/token') return send({ access_token: 'ya-token' });
      if (req.url === '/yandex/info') return send(PROFILES.yandex);
      if (req.url === '/vk/token') return send({ access_token: 'vk-token', user_id: 777 });
      if (req.url === '/vk/info') return send({ user: PROFILES.vk });
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  smtp = await startSmtp();
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', OAUTH_TEST_BASE: `http://127.0.0.1:${fake.address().port}`, MAIL_TICK_MS: '150' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
});
after(async () => { await srv.stop(); await smtp.close(); fake.close(); });

// Полный круг входа: start → «страница сервиса» → callback с кодом. Возвращает клиента с сессией и адрес, куда вернули.
async function oauthLogin(provider, { next = '/profile', viaPayload = false, as } = {}) {
  const c = as || client(srv.base);
  const start = await c.post(`/api/auth/oauth/${provider}/start`, { next, consent: true, link: !!as });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const u = new URL(start.data.url);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), `http://torgana.test/api/auth/oauth/${provider}/callback`);
  const state = u.searchParams.get('state');
  const qs = viaPayload ? new URLSearchParams({ payload: JSON.stringify({ code: 'c1', state, device_id: 'dev-1', type: 'code_v2' }) }) : new URLSearchParams({ code: 'c1', state });
  const res = await c.get(`/api/auth/oauth/${provider}/callback?${qs}`);
  assert.equal(res.status, 302);
  return { c, location: res.headers.get('location') };
}

test('без ключей кнопок нет; ключи вводит модератор, секрет не возвращается', async () => {
  assert.deepEqual((await client(srv.base).get('/api/config')).data.oauth, { yandex: false, vk: false });
  assert.equal((await client(srv.base).post('/api/auth/oauth/yandex/start', { consent: true })).status, 404);
  assert.equal((await anna.put('/api/admin/oauth', {})).status, 403);
  await admin.put('/api/admin/oauth', { yandex: { id: 'ya-app', secret: 'ya-secret' }, vk: { id: '5551' } });
  const cfg = (await admin.get('/api/admin/oauth')).data.providers;
  assert.equal(cfg.yandex.hasSecret, true);
  assert.equal(cfg.yandex.secret, undefined);
  assert.deepEqual((await client(srv.base).get('/api/config')).data.oauth, { yandex: true, vk: true });
  assert.equal((await client(srv.base).post('/api/auth/oauth/yandex/start', {})).status, 400, 'без согласия нельзя');
});

test('Яндекс ID: новый аккаунт с подтверждёнными почтой и телефоном; повторный вход — тот же', async () => {
  const { c, location } = await oauthLogin('yandex', { next: '/new' });
  assert.equal(location, '/new');
  const me = (await c.get('/api/me')).data.user;
  assert.equal(me.email, 'ivan@yandex.ru');
  assert.equal(me.name, 'Иван Петров');
  assert.equal(me.emailVerified, true);
  assert.equal(me.phone, '+79001234567');
  assert.equal(me.badges.phone, true);
  assert.equal(me.phoneVia, 'yandex');
  assert.deepEqual(me.oauth, ['yandex']);
  const tok = seen.find((x) => x.url === '/yandex/token');
  assert.equal(tok.body.client_secret, 'ya-secret');
  assert.ok(tok.body.code_verifier.length >= 43, 'PKCE');
  assert.equal(seen.find((x) => x.url === '/yandex/info').auth, 'OAuth ya-token');
  const again = await oauthLogin('yandex');
  assert.equal((await again.c.get('/api/me')).data.user.id, me.id);
  // Сменил номер вручную — уже не подтверждён.
  await c.patch('/api/me', { phone: '+7 999 000-00-00' });
  assert.equal((await c.get('/api/me')).data.user.badges.phone, false);
});

test('VK ID: ответ в payload, почта совпала с аккаунтом — привязка к нему', async () => {
  const { c } = await oauthLogin('vk', { viaPayload: true });
  const me = (await c.get('/api/me')).data.user;
  assert.equal(me.id, anna.user.id);
  assert.equal(me.phone, '+79005554433');
  assert.deepEqual(me.oauth, ['vk']);
  const tok = seen.find((x) => x.url === '/vk/token');
  assert.equal(tok.body.device_id, 'dev-1');
  assert.equal(tok.body.client_id, '5551');
  assert.equal((await anna.post('/api/auth/oauth/vk/unlink')).data.linked.length, 0);
});

test('плохой или старый state — на вход с ошибкой; сессия не выдаётся', async () => {
  const res = await fetch(`${srv.base}/api/auth/oauth/yandex/callback?code=x&state=bad`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(decodeURIComponent(res.headers.get('location')), /^\/login\?oauth_error=Ссылка входа устарела/);
  assert.equal(res.headers.get('set-cookie'), null);
});

// Ссылку возврата от сервиса нельзя подсунуть другому человеку: вход и привязка — только в том браузере, где начали.
async function startedBy(c, provider, body) {
  const s = await c.post(`/api/auth/oauth/${provider}/start`, body);
  return new URL(s.data.url).searchParams.get('state');
}

test('чужая ссылка возврата: вход в чужой аккаунт не происходит', async () => {
  const evil = client(srv.base);
  const state = await startedBy(evil, 'yandex', { consent: true });
  const victim = client(srv.base);
  const res = await victim.get(`/api/auth/oauth/yandex/callback?code=c1&state=${state}`);
  assert.match(decodeURIComponent(res.headers.get('location')), /^\/login\?oauth_error=Вход начат на другом устройстве/);
  assert.equal((await victim.get('/api/me')).data.user, null);
});

test('чужая ссылка привязки: VK другого человека к аккаунту не привязывается', async () => {
  const evil = await registerUser(srv.base, { name: 'Злой', email: 'evil@test.local' });
  const state = await startedBy(evil, 'vk', { link: true });
  const victim = client(srv.base);
  victim.cookie = evil.cookie.split('; ').filter((x) => x.startsWith('tg_oauth=')).join(''); // даже с кукой входа
  const res = await victim.get(`/api/auth/oauth/vk/callback?code=c1&state=${state}`);
  assert.match(decodeURIComponent(res.headers.get('location')), /^\/login\?oauth_error=Войдите в аккаунт/);
  const me = (await evil.get('/api/me')).data.user;
  assert.deepEqual(me.oauth, []);
  assert.equal(me.phone, '');
});

test('проверка бизнеса: контрольные суммы, заявка, решение модератора, значок у объявлений', async () => {
  assert.equal((await anna.post('/api/me/business', { name: 'ИП Смирнова А. А.', inn: '500100732258', ogrn: '304500116000157' })).status, 400, 'ИНН с ошибкой');
  assert.equal((await anna.post('/api/me/business', { name: 'ИП Смирнова А. А.', inn: '7707083893', ogrn: '304500116000157' })).status, 400, 'у ИП ИНН из 12 цифр');
  const r = await anna.post('/api/me/business', { name: 'ИП Смирнова А. А.', inn: '500100732259', ogrn: '304500116000157' });
  assert.equal(r.data.business.status, 'pending');
  assert.equal(r.data.business.kind, 'ip');
  assert.equal((await admin.get('/api/admin/stats')).data.biz, 1);
  assert.equal((await admin.get('/api/admin/users?f=biz')).data.items[0].id, anna.user.id);
  assert.equal((await admin.post(`/api/admin/users/${anna.user.id}/business`, { decision: 'reject' })).status, 400, 'отказ — с причиной');
  await admin.put('/api/admin/mail', { host: '127.0.0.1', port: smtp.port, security: 'none', user: smtp.user, pass: smtp.pass, from: 'no-reply@torgana.test' });
  assert.equal((await admin.post(`/api/admin/users/${anna.user.id}/business`, { decision: 'approve' })).status, 200);
  await smtp.waitFor((m) => m.to === 'anna@test.local' && /Бизнес подтверждён/.test(m.subject));
  const id = await publish(anna, admin, { title: 'Шкаф купе', category: 'home', city: 'Казань', price: 15000 });
  const seller = (await client(srv.base).get(`/api/listings/${id}`)).data.seller;
  assert.deepEqual(seller.badges.biz, { kind: 'ИП', name: 'ИП Смирнова А. А.' });
  assert.equal((await client(srv.base).get(`/api/users/${anna.user.id}`)).data.user.badges.biz.kind, 'ИП');
  assert.ok((await admin.get('/api/admin/log')).data.items.some((i) => i.action === 'biz-verified'));
});

describe('письмо-подтверждение для галочки', () => {
  // 1.61.0: текст письма для галочки «Проверенный бизнес» — с сервера (сайт и приложение).
  const assert = require('node:assert/strict');
  const { startServer, registerUser } = require('./helpers');

  let srv; let shop;
  before(async () => {
    srv = await startServer();
    shop = await registerUser(srv.base, { name: 'Магазин', email: 'shop@test.local' });
  });
  after(() => srv.stop());

  test('текст письма-подтверждения — с сервера, с данными ИП и кодом заявки', async () => {
    assert.equal((await shop.post('/api/me/business', { name: 'ИП Смирнова А. А.', inn: '500100732259', ogrn: '304500116000157' })).status, 200);
    const r = await shop.get('/api/me/trademark');
    assert.equal(r.status, 200);
    assert.match(r.data.code, /^TG-[0-9A-F]{6}$/);
    assert.ok(r.data.letter.includes('shop@test.local') && r.data.letter.includes('ИП Смирнова А. А.') && r.data.letter.includes('ОГРНИП 304500116000157'));
    assert.ok(r.data.letter.includes(`Код заявки: ${r.data.code}`));
    assert.ok(!r.data.letter.includes('печать'), 'у ИП — без печати');
  });
});

'use strict';

// Статистика объявления: показы, переходы, избранное — раз в сутки на человека, без продавца,
// модераторов, роботов и сверх дневных лимитов; источники переходов; доступ только продавцу.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, registerUser, publish } = require('./helpers');

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
let srv; let admin; let anna; let boris; let vera; let id; let id2;
const page = (ua = CHROME, ip = '10.0.0.1') => ({ origin: srv.base, 'user-agent': ua, 'x-forwarded-for': ip, 'sec-fetch-site': 'same-origin' });
const view = (c, h, src = 'search', lid = id) => c.post('/api/stats/view', { id: lid, src }, h);
const stats = async (days = '30', lid = id) => (await anna.get(`/api/my/listings/${lid}/stats?days=${days}`)).data;

before(async () => {
  srv = await startServer({ TRUST_PROXY: '1', STATS_GUEST_VIEWS_PER_IP: '3', STATS_VIEWS_PER_VIEWER: '2' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
  vera = await registerUser(srv.base, { name: 'Вера', email: 'vera@test.local' });
  id = await publish(anna, admin, { title: 'Кресло-качалка', category: 'home', city: 'Казань', price: '4000' });
  id2 = await publish(anna, admin, { title: 'Торшер', category: 'home', city: 'Казань', price: '1500' });
});
after(() => srv.stop());

test('переход: раз в сутки на человека; продавец, модератор, робот и запрос не со страницы — не считаются', async () => {
  assert.equal((await view(anna, page(CHROME, '10.0.0.9'))).data.counted, false, 'продавец');
  assert.equal((await view(admin, page())).data.counted, false, 'модератор');
  assert.equal((await view(boris, page())).data.counted, true, 'покупатель');
  assert.equal((await view(boris, page())).data.counted, false, 'повторно в тот же день');
  assert.equal((await view(boris, page(SAFARI, '10.9.9.9'))).data.counted, false, 'тот же аккаунт с другого устройства');
  assert.equal((await view(client(srv.base), page('Googlebot/2.1 (+http://www.google.com/bot.html)', '10.0.0.2'))).data.counted, false, 'робот');
  assert.equal((await view(client(srv.base), { 'user-agent': CHROME, 'x-forwarded-for': '10.0.0.3' })).data.counted, false, 'без Origin');
  assert.equal((await view(client(srv.base), { ...page(CHROME, '10.0.0.4'), 'sec-fetch-site': 'cross-site' })).data.counted, false, 'с чужого сайта');
  const g = client(srv.base);
  assert.equal((await view(g, page(SAFARI, '10.0.0.5'), 'external')).data.counted, true, 'гость');
  assert.equal((await view(client(srv.base), page(SAFARI, '10.0.0.5'), 'external')).data.counted, false, 'тот же гость без cookie');
  // просмотр через API объявления больше не увеличивает счётчик
  for (let i = 0; i < 3; i++) await client(srv.base).get(`/api/listings/${id}`);
  const s = await stats();
  assert.equal(s.totals.views, 2);
  assert.equal(s.listing.viewsAll, 2);
  assert.equal((await client(srv.base).get(`/api/listings/${id}`)).data.listing.views, 2);
  assert.equal(s.sources.search, 1);
  assert.equal(s.sources.external, 1);
});

test('продавец, вышедший из аккаунта в том же браузере, не накручивает свои объявления', async () => {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  await anna.post('/api/stats/impressions', { ids: [id2] }, page(ua, '10.1.1.1')); // Анна в аккаунте — ключ браузера запомнился
  const guest = client(srv.base);
  assert.equal((await view(guest, page(ua, '10.1.1.1'), 'search', id2)).data.counted, false);
  assert.equal((await view(guest, page(ua, '10.1.1.2'), 'search', id2)).data.counted, true, 'другая сеть — другой человек');
});

test('дневные лимиты: на человека и на гостей с одного IP', async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await publish(anna, admin, { title: `Стул ${i}`, category: 'home', city: 'Казань', price: '500' }));
  // человек: не больше 2 засчитанных переходов в сутки (в тесте)
  const r = [];
  for (const lid of ids) r.push((await view(vera, page(SAFARI, '10.2.2.2'), 'home', lid)).data.counted);
  assert.deepEqual(r, [true, true, false]);
  // гости с одного IP: не больше 3 переходов в сутки (в тесте), даже с разными браузерами
  const g = [];
  for (let i = 0; i < 5; i++) g.push((await view(client(srv.base), page(`${CHROME} v${i}`, '10.3.3.3'), 'home', ids[0])).data.counted);
  assert.deepEqual(g, [true, true, true, false, false]);
});

test('показы: пачкой, раз в сутки, без своих и неопубликованных объявлений', async () => {
  const draft = (await anna.post('/api/listings', { title: 'Шкаф', category: 'home', city: 'Казань', price: '9000' })).data.id;
  let r = await boris.post('/api/stats/impressions', { ids: [id, id2, draft, id, 999999] }, page());
  assert.equal(r.data.counted, 2);
  r = await boris.post('/api/stats/impressions', { ids: [id, id2] }, page());
  assert.equal(r.data.counted, 0, 'повторно не считаются');
  r = await anna.post('/api/stats/impressions', { ids: [id] }, page(CHROME, '10.0.0.9'));
  assert.equal(r.data.counted, 0, 'свои не считаются');
  assert.equal((await client(srv.base).post('/api/stats/impressions', { ids: [id] }, page(SAFARI, '10.4.4.4'))).data.counted, 1);
  assert.equal((await stats()).totals.impressions, 2);
});

test('избранное: добавление считается раз в сутки, «сейчас в избранном» — по факту', async () => {
  await boris.post(`/api/favorites/${id}`, {}, page());
  await boris.post(`/api/favorites/${id}`, {}, page());
  await boris.post(`/api/favorites/${id}`, {}, page()); // добавил, убрал, добавил
  await vera.post(`/api/favorites/${id}`, {}, page(SAFARI, '10.2.2.2'));
  const s = await stats();
  assert.equal(s.totals.favs, 2);
  assert.equal(s.favNow, 2);
});

test('статистика — только продавцу; периоды и дни', async () => {
  assert.equal((await boris.get(`/api/my/listings/${id}/stats`)).status, 404);
  assert.equal((await client(srv.base).get(`/api/my/listings/${id}/stats`)).status, 401);
  const w = await stats('7');
  assert.equal(w.period, 7);
  assert.equal(w.daily.length, 7);
  assert.equal(w.daily[6].views, w.today.views);
  assert.ok(w.prev, 'есть прошлый период для сравнения');
  const all = await stats('0');
  assert.equal(all.period, 0);
  assert.equal(all.prev, null);
  assert.equal(all.totals.views, 2);
});

test('подставленный X-Forwarded-For не помогает обойти лимит: учитывается адрес, который дописал nginx', async () => {
  const lid = await publish(anna, admin, { title: 'Пуф', category: 'home', city: 'Казань', price: '700' });
  const r = [];
  for (let i = 0; i < 5; i++) {
    // посетитель подставляет «свой» адрес в начало, nginx дописывает настоящий (10.5.5.5) в конец
    r.push((await view(client(srv.base), page(`${SAFARI} v${i}`, `192.168.0.${i}, 10.5.5.5`), 'home', lid)).data.counted);
  }
  assert.deepEqual(r, [true, true, true, false, false]);
});

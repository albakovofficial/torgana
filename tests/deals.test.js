'use strict';

// 1.17: предложение цены в чате, быстрые ответы продавца, подписка на продавца (push, подборка, отписка в один клик).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, startSmtp, registerUser, publish, client } = require('./helpers');
const nb = (v) => String(v).replace(/\u00a0/g, ' '); // суммы с неразрывным пробелом

let srv; let smtp; let admin; let seller; let buyer; let other; let lid; let cid;
before(async () => {
  smtp = await startSmtp();
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', DIGEST_TICK_MS: '200', DIGEST_MIN_AGE_MS: '0', DIGEST_ANY_HOUR: '1' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  seller = await registerUser(srv.base, { name: 'Олег', email: 'oleg@test.local' });
  buyer = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  other = await registerUser(srv.base, { name: 'Пётр', email: 'petr@test.local' });
  lid = await publish(seller, admin, { title: 'Велосипед Merida', category: 'hobby', subcategory: 'bikes', city: 'Казань', price: 40000 });
  cid = (await buyer.post('/api/conversations', { listingId: lid })).data.id;
});
after(async () => { await srv.stop(); await smtp.close(); });

test('предложение цены: проверки суммы, только покупатель', async () => {
  let r = await buyer.post(`/api/conversations/${cid}/offer`, { price: 45000 });
  assert.equal(r.status, 400);
  assert.match(nb(r.data.error), /меньше текущей цены/);
  r = await buyer.post(`/api/conversations/${cid}/offer`, { price: 5000 });
  assert.equal(r.status, 400);
  assert.match(nb(r.data.error), /12 000/);
  r = await seller.post(`/api/conversations/${cid}/offer`, { price: 30000 });
  assert.equal(r.status, 400);
  assert.match(nb(r.data.error), /покупатель/);
  r = await other.post(`/api/conversations/${cid}/offer`, { price: 30000 });
  assert.equal(r.status, 404, 'чужой диалог');
});

test('предложение: сообщение в чате, новое заменяет ожидающее, продавец принимает', async () => {
  const a = await buyer.post(`/api/conversations/${cid}/offer`, { price: '33 000' });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(a.data.message.kind, 'offer');
  assert.match(nb(a.data.message.body), /33 000 ₽ вместо 40 000 ₽/);
  const b = await buyer.post(`/api/conversations/${cid}/offer`, { price: 35000 });
  const first = b.data.offers.find((o) => o.id === a.data.message.offerId);
  assert.equal(first.status, 'withdrawn', 'прежнее заменено');
  // продавец видит в чате оба сообщения и состояния предложений
  const chat = (await seller.get(`/api/conversations/${cid}`)).data;
  const offerMsgs = chat.messages.filter((m) => m.kind === 'offer');
  assert.equal(offerMsgs.length, 2);
  assert.equal(chat.offers.find((o) => o.id === b.data.message.offerId).status, 'pending');
  // покупатель не может принять своё; продавец не может отозвать
  assert.equal((await buyer.post(`/api/offers/${b.data.message.offerId}/accept`)).status, 403);
  assert.equal((await seller.post(`/api/offers/${b.data.message.offerId}/withdraw`)).status, 403);
  assert.equal((await seller.post(`/api/offers/${a.data.message.offerId}/accept`)).status, 400, 'заменённое не принять');
  const ok = await seller.post(`/api/offers/${b.data.message.offerId}/accept`);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.offer.status, 'accepted');
  assert.equal(ok.data.message.kind, 'offer-reply');
  assert.match(nb(ok.data.message.body), /Согласен на 35 000 ₽/);
  assert.equal((await seller.post(`/api/offers/${b.data.message.offerId}/decline`)).status, 400, 'решение одно');
  const list = (await buyer.get('/api/conversations')).data.items.find((x) => x.id === cid);
  assert.match(nb(list.lastBody), /Согласен/);
});

test('предложение: отклонить и отозвать; не больше пяти в день', async () => {
  const c = await buyer.post(`/api/conversations/${cid}/offer`, { price: 30000 });
  const no = await seller.post(`/api/offers/${c.data.message.offerId}/decline`);
  assert.match(nb(no.data.message.body), /Не готов уступить до 30 000 ₽/);
  const d = await buyer.post(`/api/conversations/${cid}/offer`, { price: 31000 });
  const w = await buyer.post(`/api/offers/${d.data.message.offerId}/withdraw`);
  assert.equal(w.data.offer.status, 'withdrawn');
  assert.equal(w.data.message, null, 'отзыв без сообщения');
  assert.equal((await buyer.post(`/api/conversations/${cid}/offer`, { price: 32000 })).status, 200, 'пятое за день');
  const e = await buyer.post(`/api/conversations/${cid}/offer`, { price: 32500 });
  assert.equal(e.status, 429, 'шестое — нет');
});

test('быстрые ответы: готовые по умолчанию, свои, сброс', async () => {
  let r = await seller.get('/api/my/replies');
  assert.equal(r.data.custom, false);
  assert.ok(r.data.items.length >= 4);
  r = await seller.put('/api/my/replies', { items: ['Да, в наличии', '  ', 'Да, в наличии', 'Самовывоз — м. Кремлёвская'] });
  assert.deepEqual(r.data.items, ['Да, в наличии', 'Самовывоз — м. Кремлёвская']);
  assert.deepEqual((await seller.get('/api/my/replies')).data, { items: ['Да, в наличии', 'Самовывоз — м. Кремлёвская'], custom: true });
  assert.equal((await seller.put('/api/my/replies', { items: Array.from({ length: 13 }, (_, i) => `ответ ${i}`) })).status, 400);
  r = await seller.put('/api/my/replies', { items: [] });
  assert.deepEqual(r.data, { items: [], custom: true }, 'можно убрать все');
  r = await seller.put('/api/my/replies', { reset: true });
  assert.equal(r.data.custom, false);
});

test('подписка: счётчик, лента новых объявлений, отписка', async () => {
  assert.equal((await buyer.post(`/api/users/${buyer.user.id}/follow`)).status, 400, 'на себя нельзя');
  let r = await buyer.post(`/api/users/${seller.user.id}/follow`, { follow: true });
  assert.deepEqual(r.data, { following: true, followers: 1 });
  r = await buyer.post(`/api/users/${seller.user.id}/follow`, { follow: true });
  assert.equal(r.data.followers, 1, 'повтор не удваивает');
  const prof = (await buyer.get(`/api/users/${seller.user.id}`)).data.user;
  assert.equal(prof.following, true);
  assert.equal(prof.followers, 1);
  assert.equal((await client(srv.base).get(`/api/users/${seller.user.id}`)).data.user.following, false);
  const nid = await publish(seller, admin, { title: 'Самокат Xiaomi', category: 'hobby', city: 'Казань', price: 15000 });
  const me = (await buyer.get('/api/me')).data;
  assert.equal(me.fresh.follow, 1);
  const f = (await buyer.get('/api/my/following')).data;
  assert.equal(f.sellers[0].id, seller.user.id);
  assert.equal(f.sellers[0].fresh, 1);
  assert.equal(f.items.find((x) => x.id === nid).fresh, true);
  assert.equal((await buyer.get('/api/me')).data.fresh.follow, 0, 'открыл — просмотрено');
  r = await buyer.post(`/api/users/${seller.user.id}/follow`);
  assert.deepEqual(r.data, { following: false, followers: 0 });
});

test('подписка: подборка за день с блоком продавца и отпиской в один клик', async () => {
  await other.post(`/api/users/${seller.user.id}/follow`, { follow: true });
  await admin.put('/api/admin/mail', { host: '127.0.0.1', port: smtp.port, security: 'none', user: smtp.user, pass: smtp.pass, from: 'no-reply@torgana.test' });
  await publish(seller, admin, { title: 'Ролики детские', category: 'hobby', city: 'Казань', price: 2500 });
  const m = await smtp.waitFor((x) => x.to === 'petr@test.local' && /Новое у продавца Олег/.test(x.subject), 6000);
  assert.match(m.html, /Ролики детские/);
  assert.match(m.html, /Отписаться от продавца/);
  const link = /href="(http:\/\/torgana\.test\/unsubscribe\?t=[a-f0-9]{32}&amp;k=follow-\d+)"/.exec(m.html)[1].replace(/&amp;/g, '&');
  const u = new URL(link);
  const r = await client(srv.base).post(`/api/unsubscribe?${u.searchParams}`);
  assert.equal(r.status, 200);
  assert.equal((await other.get(`/api/users/${seller.user.id}`)).data.user.following, false);
});

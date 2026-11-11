'use strict';
// 1.54.0: встречная цена в торге, срок проверки для продавца, воронка продавцов в «Сводке».
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, publish } = require('./helpers');
const nb = (v) => String(v).replace(/ /g, ' ');

let srv; let admin; let oleg; let anna; let lid; let cid;
test.before(async () => {
  srv = await startServer({ ADMIN_EMAIL: 'admin@test.local' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  oleg = await registerUser(srv.base, { name: 'Олег', email: 'oleg@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  lid = await publish(oleg, admin, { title: 'Велосипед Merida', category: 'hobby', city: 'Казань', price: 40000 });
  cid = (await anna.post('/api/conversations', { listingId: lid })).data.id;
});
test.after(() => srv.stop());

test('встречная цена: продавец называет свою, покупатель торгуется дальше, соглашаются', async () => {
  const a = (await anna.post(`/api/conversations/${cid}/offer`, { price: 30000 })).data.message.offerId;
  assert.equal((await anna.post(`/api/offers/${a}/counter`, { price: 31000 })).status, 403, 'на своё — нельзя');
  let r = await oleg.post(`/api/offers/${a}/counter`, { price: 30000 });
  assert.equal(r.status, 400); assert.match(nb(r.data.error), /больше предложения покупателя — 30 000 ₽/);
  r = await oleg.post(`/api/offers/${a}/counter`, { price: 40000 });
  assert.equal(r.status, 400); assert.match(nb(r.data.error), /меньше цены в объявлении — 40 000 ₽/);
  r = await oleg.post(`/api/offers/${a}/counter`, { price: '36 000' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(nb(r.data.message.body), 'Могу уступить до 36 000 ₽');
  const b = r.data.message.offer;
  assert.deepEqual([b.bySeller, b.parentId, b.status, b.price], [true, a, 'pending', 36000]);
  assert.equal(r.data.offers.find((o) => o.id === a).status, 'countered');
  assert.equal((await oleg.post(`/api/offers/${a}/accept`)).status, 400, 'на старое уже ответили');
  assert.match((await oleg.post(`/api/offers/${a}/accept`)).data.error, /ответили своей ценой/);
  assert.equal((await oleg.post(`/api/offers/${b.id}/accept`)).status, 403, 'своё не принять');

  // покупатель: выше встречной — нельзя; ниже — новая встречная
  r = await anna.post(`/api/offers/${b.id}/counter`, { price: 36000 });
  assert.equal(r.status, 400); assert.match(nb(r.data.error), /меньше цены продавца — 36 000 ₽/);
  r = await anna.post(`/api/offers/${b.id}/counter`, { price: 33000 });
  assert.equal(nb(r.data.message.body), 'Предлагаю 33 000 ₽');
  const c = r.data.message.offer;
  assert.deepEqual([c.bySeller, c.parentId], [false, b.id]);
  r = await oleg.post(`/api/offers/${c.id}/counter`, { price: 34000 });
  const d = r.data.message.offer;
  // покупательница соглашается — сообщение в женском роде
  r = await anna.post(`/api/offers/${d.id}/accept`);
  assert.equal(r.data.offer.status, 'accepted');
  assert.equal(nb(r.data.message.body), 'Согласна на 34 000 ₽. Давайте договоримся о встрече или доставке.');
  const chat = (await oleg.get(`/api/conversations/${cid}`)).data;
  assert.deepEqual(chat.offers.map((o) => o.status), ['countered', 'countered', 'countered', 'accepted']);
});

test('встречная: покупатель отказывается или продавец отзывает; новое предложение покупателя — ответ на встречную', async () => {
  const lid2 = await publish(oleg, admin, { title: 'Самокат', category: 'hobby', city: 'Казань', price: 10000 });
  const cid2 = (await anna.post('/api/conversations', { listingId: lid2 })).data.id;
  const a = (await anna.post(`/api/conversations/${cid2}/offer`, { price: 7000 })).data.message.offerId;
  const b = (await oleg.post(`/api/offers/${a}/counter`, { price: 9000 })).data.message.offerId;
  const no = await anna.post(`/api/offers/${b}/decline`);
  assert.equal(nb(no.data.message.body), 'За 9 000 ₽ пока не готова взять.');
  const c = (await anna.post(`/api/conversations/${cid2}/offer`, { price: 8000 })).data.message.offerId;
  const e = (await oleg.post(`/api/offers/${c}/counter`, { price: 9500 })).data.message.offerId;
  assert.equal((await oleg.post(`/api/conversations/${cid2}/offer`, { price: 8000 })).status, 400, 'продавец не предлагает с нуля');
  // покупатель предлагает заново, пока ждёт встречная продавца, — встречная считается отвеченной
  const h = await anna.post(`/api/conversations/${cid2}/offer`, { price: 8500 });
  assert.equal(h.data.offers.find((o) => o.id === e).status, 'countered');
  assert.equal((await oleg.post(`/api/offers/${e}/withdraw`)).status, 400, 'уже не ждёт');
  const i = (await oleg.post(`/api/offers/${h.data.message.offerId}/counter`, { price: 9200 })).data.message.offerId;
  assert.equal((await anna.post(`/api/offers/${i}/withdraw`)).status, 403, 'отзывает тот, кто предложил');
  assert.equal((await oleg.post(`/api/offers/${i}/withdraw`)).data.offer.status, 'withdrawn');
  assert.equal((await anna.post(`/api/conversations/${cid2}/offer`, { price: 8800 })).status, 429, 'седьмое за сутки — нет');
});

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

test('ответ на сообщение: цитата у обоих, только из этого же диалога', async () => {
  const q = (await anna.post(`/api/conversations/${cid}/messages`, { body: 'А шлем в комплекте?' })).data.message;
  const r = await oleg.post(`/api/conversations/${cid}/messages`, { body: 'Да, отдам вместе', replyTo: q.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.message.reply, { id: q.id, mine: false, body: 'А шлем в комплекте?', photo: false, kind: '' });
  const seen = (await anna.get(`/api/conversations/${cid}`)).data.messages.find((m) => m.id === r.data.message.id);
  assert.equal(seen.reply.mine, true, 'для Анны это её сообщение');
  assert.equal(seen.reply.body, 'А шлем в комплекте?');
  assert.equal((await anna.get(`/api/conversations/${cid}`)).data.messages.find((m) => m.id === q.id).reply, null);
  // чужой диалог — нельзя
  const lid3 = await publish(oleg, admin, { title: 'Насос', category: 'hobby', city: 'Казань', price: 900 });
  const petr = await registerUser(srv.base, { name: 'Пётр', email: 'petr2@test.local' });
  const c3 = (await petr.post('/api/conversations', { listingId: lid3 })).data.id;
  const bad = await petr.post(`/api/conversations/${c3}/messages`, { body: 'тест', replyTo: q.id });
  assert.equal(bad.status, 400);
});

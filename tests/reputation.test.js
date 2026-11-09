'use strict';

// 1.46.0: репутация вместо отзывов — сделка подтверждается обеими сторонами, комплименты, жалобы через модератора,
// уровни, фильтр «Надёжные продавцы» и защита от накрутки.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startServer, registerUser, publish, client } = require('./helpers');

let srv; let admin; let seller; const buyers = [];
before(async () => {
  srv = await startServer({ REP_FRESH_DAYS: '0', REPLY_CACHE_MS: '1' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  seller = await registerUser(srv.base, { name: 'Ольга', email: 'olga@test.local' });
  for (let i = 0; i < 6; i++) buyers.push(await registerUser(srv.base, { name: `Покупатель ${i + 1}`, email: `b${i}@test.local` }));
});
after(() => srv.stop());

const say = (c, cid, n, body = 'Добрый день') => Promise.all(Array.from({ length: n }, () => c.post(`/api/conversations/${cid}/messages`, { body })));
async function chat(buyer, title) {
  const id = await publish(seller, admin, { title, category: 'hobby', city: 'Казань', price: '1000' });
  const cid = (await buyer.post('/api/conversations', { listingId: id })).data.id;
  return { id, cid };
}
const deal = (c, cid, answer = 'yes') => c.post(`/api/conversations/${cid}/deal`, { answer });
const rep = async (c) => (await client(srv.base).get(`/api/users/${c.user.id}`)).data.user.rep;

let first;
test('сделка: только после переписки (по 3 сообщения), засчитывается, когда подтвердили обе стороны', async () => {
  const b = buyers[0];
  first = await chat(b, 'Самокат детский');
  await say(b, first.cid, 1);
  await say(seller, first.cid, 1);
  let st = (await b.get(`/api/conversations/${first.cid}`)).data.deal;
  assert.equal(st.ready, false);
  assert.equal(st.canIssue, true, 'пожаловаться можно уже после переписки');
  assert.equal((await deal(b, first.cid)).status, 400, 'мало сообщений');
  await say(b, first.cid, 2); await say(seller, first.cid, 2);
  assert.equal((await b.get(`/api/conversations/${first.cid}`)).data.deal.ready, true);
  assert.equal((await deal(b, first.cid)).status, 200);
  st = (await seller.get(`/api/conversations/${first.cid}`)).data.deal;
  assert.equal(st.other, true, 'продавец видит, что покупатель подтвердил');
  assert.equal(st.confirmed, false);
  assert.equal((await buyers[1].post(`/api/conversations/${first.cid}/deal`, { answer: 'yes' })).status, 404, 'чужой чат');
  assert.equal((await deal(seller, first.cid)).status, 200);
  st = (await b.get(`/api/conversations/${first.cid}`)).data.deal;
  assert.equal(st.confirmed, true);
  assert.equal((await deal(seller, first.cid)).status, 409, 'второй раз — нет');
  const r = await rep(seller);
  assert.equal(r.deals, 1); assert.equal(r.newbie, true); assert.equal(r.level, 0); assert.deepEqual(r.marks, ['first']);
});

test('комплименты: после сделки, до трёх из списка, один раз', async () => {
  const b = buyers[0];
  assert.equal((await b.post(`/api/conversations/${first.cid}/praise`, { tags: ['Просто класс'] })).status, 400);
  assert.equal((await b.post(`/api/conversations/${first.cid}/praise`, { tags: ['Всё как на фото', 'Вежливый', 'Честный торг', 'Быстро отвечает'] })).status, 400);
  assert.equal((await b.post(`/api/conversations/${first.cid}/praise`, { tags: ['Всё как на фото', 'Вежливый'] })).status, 200);
  assert.ok((await seller.get('/api/notices')).data.items.some((n) => /отметил\(а\) сделку/.test(n.title) && n.body === 'Всё как на фото · Вежливый'), '1.47.2: продавцу — уведомление о комплиментах');
  assert.equal((await b.post(`/api/conversations/${first.cid}/praise`, { tags: ['Честный торг'] })).status, 409);
  assert.equal((await seller.post(`/api/conversations/${first.cid}/praise`, { tags: ['Всё как на фото'] })).status, 400, 'покупателю — свои метки');
  assert.equal((await seller.post(`/api/conversations/${first.cid}/praise`, { tags: ['Пришёл вовремя'] })).status, 200);
  const r = await rep(seller);
  assert.deepEqual(r.tags.map((t) => t.tag).sort(), ['Вежливый', 'Всё как на фото']);
  assert.equal((await rep(b)).buyerTags[0].tag, 'Пришёл вовремя');
});

test('защита: та же пара за 30 дней не засчитывается, встречная сделка — на проверку модератору', async () => {
  const b = buyers[0];
  const again = await chat(b, 'Самокат второй');
  await say(b, again.cid, 3); await say(seller, again.cid, 3);
  await deal(b, again.cid); await deal(seller, again.cid);
  assert.equal((await rep(seller)).deals, 1, 'повтор пары не считается');
  // Встречная: покупатель продаёт продавцу.
  const id = await publish(b, admin, { title: 'Гитара', category: 'hobby', city: 'Казань', price: '5000' });
  const cid = (await seller.post('/api/conversations', { listingId: id })).data.id;
  await say(seller, cid, 3); await say(b, cid, 3);
  await deal(seller, cid); await deal(b, cid);
  assert.equal((await rep(b)).deals, 0);
  const q = (await admin.get('/api/admin/reputation')).data;
  const sus = q.deals.find((d) => d.title === 'Гитара');
  assert.ok(sus); assert.equal(sus.flag, 'ring');
  assert.ok((await admin.get('/api/admin/stats')).data.rep >= 1);
  assert.equal((await b.post(`/api/admin/deals/${sus.id}`, { decision: 'count' })).status, 403);
  assert.equal((await admin.post(`/api/admin/deals/${sus.id}`, { decision: 'drop' })).status, 200);
  assert.equal((await rep(b)).deals, 0);
});

test('уровень «Надёжный» от 5 сделок, фильтр «Надёжные продавцы»; подтверждённая жалоба — уровень ниже', async () => {
  for (const b of buyers.slice(1, 5)) {
    const x = await chat(b, `Товар для ${b.user.name}`);
    await say(b, x.cid, 3); await say(seller, x.cid, 3);
    await deal(b, x.cid); await deal(seller, x.cid);
  }
  let r = await rep(seller);
  assert.equal(r.deals, 5); assert.equal(r.level, 1); assert.equal(r.levelName, 'Надёжный'); assert.equal(r.newbie, false);
  assert.ok((await seller.get('/api/notices')).data.items.some((n) => n.title === 'Новый уровень: Надёжный'), '1.47.2: уведомление о новом уровне');
  const all = (await client(srv.base).get('/api/listings?city=Казань')).data.total;
  const trusted = (await client(srv.base).get('/api/listings?city=Казань&trusted=1')).data;
  assert.ok(trusted.total > 0 && trusted.total < all, 'только продавцы с уровнем');
  assert.ok(trusted.items.every((i) => i.seller.id === seller.user.id && i.seller.level === 1));
  // Жалоба: видит модератор, вторая сторона объясняется один раз, подтверждение снижает уровень.
  const b = buyers[5];
  const x = await chat(b, 'Велосипед');
  await say(b, x.cid, 1); await say(seller, x.cid, 1);
  assert.equal((await b.post(`/api/conversations/${x.cid}/issue`, { reason: 'Непонятно' })).status, 400);
  assert.equal((await b.post(`/api/conversations/${x.cid}/issue`, { reason: 'Не пришёл на встречу', text: 'Ждал час' })).status, 200);
  assert.equal((await b.post(`/api/conversations/${x.cid}/issue`, { reason: 'Грубость' })).status, 409);
  const mine = (await seller.get('/api/my/reputation')).data;
  const iss = mine.against[0];
  assert.equal(iss.canReply, true); assert.equal(iss.text, '', 'текст жалобы второй стороне не показываем');
  assert.equal((await seller.post(`/api/issues/${iss.id}/reply`, { text: 'Я был на месте, писал в чат' })).status, 200);
  assert.equal((await seller.post(`/api/issues/${iss.id}/reply`, { text: 'Ещё раз' })).status, 409);
  const q = (await admin.get('/api/admin/reputation')).data.issues.find((i) => i.id === iss.id);
  assert.equal(q.reply, 'Я был на месте, писал в чат'); assert.equal(q.text, 'Ждал час');
  assert.equal((await admin.post(`/api/admin/issues/${iss.id}`, { decision: 'confirm' })).status, 400, 'нужно пояснение');
  assert.equal((await admin.post(`/api/admin/issues/${iss.id}`, { decision: 'confirm', reason: 'Подтверждено перепиской' })).status, 200);
  r = await rep(seller);
  assert.equal(r.complaints, 1); assert.equal(r.level, 0, 'на уровень ниже');
  assert.equal((await client(srv.base).get('/api/listings?city=Казань&trusted=1')).data.total, 0);
  assert.ok((await seller.get('/api/notices')).data.items.some((n) => /подтверждена/.test(n.title)));
});

// 1.47.2: отзывы удалены целиком — ни API, ни оценки в профиле, ни таблиц и настроек в базе.
test('отзывов нет: ни API, ни оценки в профиле, ни таблиц в базе', async () => {
  const sid = seller.user.id;
  assert.equal((await buyers[0].post('/api/reviews', { conversationId: first.cid, rating: 5, received: true, text: 'Всё отлично, спасибо!' })).status, 404);
  assert.equal((await client(srv.base).get(`/api/users/${sid}/reviews`)).status, 404);
  assert.equal((await seller.get('/api/my/reviews')).status, 404);
  assert.equal((await admin.get('/api/admin/reviews')).status, 404);
  const pub = (await client(srv.base).get(`/api/users/${sid}`)).data.user;
  assert.equal(pub.rating, undefined);
  assert.ok(pub.rep);
  assert.equal((await seller.get('/api/me')).data.user.rating, undefined);
  assert.equal((await admin.get('/api/admin/stats')).data.reviews, undefined);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(srv.tmp, 'data', 'torgana.db'), { readOnly: true });
  try {
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%review%' AND name NOT LIKE '%deals%'").all(), []);
    assert.deepEqual(db.prepare("SELECT name FROM pragma_table_info('users') WHERE name LIKE '%review%'").all(), []);
  } finally { db.close(); }
});

test('защита: новые аккаунты без подтверждённого телефона чужую репутацию не поднимают', async () => {
  const s2 = await startServer();
  try {
    const adm = await registerUser(s2.base, { name: 'Модератор', email: 'admin@test.local' });
    const sel = await registerUser(s2.base, { name: 'Продавец', email: 's@test.local' });
    const buy = await registerUser(s2.base, { name: 'Покупатель', email: 'p@test.local' });
    const id = await publish(sel, adm, { title: 'Лампа', category: 'hobby', city: 'Казань', price: '900' });
    const cid = (await buy.post('/api/conversations', { listingId: id })).data.id;
    for (let i = 0; i < 3; i++) { await buy.post(`/api/conversations/${cid}/messages`, { body: 'Вопрос' }); await sel.post(`/api/conversations/${cid}/messages`, { body: 'Ответ' }); }
    await buy.post(`/api/conversations/${cid}/deal`, { answer: 'yes' });
    await sel.post(`/api/conversations/${cid}/deal`, { answer: 'yes' });
    assert.equal((await buy.get(`/api/conversations/${cid}`)).data.deal.confirmed, true, 'подтверждена');
    assert.equal((await client(s2.base).get(`/api/users/${sel.user.id}`)).data.user.rep.deals, 0, 'но не засчитана');
  } finally { await s2.stop(); }
});

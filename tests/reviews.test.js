'use strict';

// Отзывы о продавцах: только покупатель из переписки, «получен / не получен», один на объявление,
// после модерации; изменить и удалить нельзя никому; ответ продавца один раз; жалоба с обоснованием.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, registerUser, publish } = require('./helpers');

let srv; let admin; let anna; let boris; let vera; let id; let conv; let rid;

before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
  vera = await registerUser(srv.base, { name: 'Вера', email: 'vera@test.local' });
  id = await publish(anna, admin, { title: 'Велосипед детский', category: 'hobby', city: 'Казань', price: '6500' });
  conv = (await boris.post('/api/conversations', { listingId: id })).data.id;
});
after(() => srv.stop());

const send = (c, cid, body) => c.post(`/api/conversations/${cid}/messages`, { body });
const leave = (c, body) => c.post('/api/reviews', { conversationId: conv, rating: 5, received: true, text: 'Всё как в описании, спасибо!', ...body });

test('отзыв — только после переписки, где писали оба, и только покупатель', async () => {
  assert.equal((await boris.get(`/api/conversations/${conv}`)).data.review.can, false);
  assert.equal((await leave(boris)).status, 403, 'без переписки нельзя');
  await send(boris, conv, 'Здравствуйте! Ещё продаётся?');
  assert.equal((await leave(boris)).status, 403, 'продавец ещё не ответил');
  await send(anna, conv, 'Да, приезжайте.');
  assert.equal((await boris.get(`/api/conversations/${conv}`)).data.review.can, true);
  assert.equal((await anna.get(`/api/conversations/${conv}`)).data.review, null, 'продавцу форма не показывается');
  assert.equal((await leave(anna)).status, 403, 'продавец о себе не пишет');
  assert.equal((await leave(vera)).status, 403, 'чужой диалог');
});

test('нужны итог сделки, оценка и текст; один отзыв на объявление', async () => {
  assert.equal((await leave(boris, { received: undefined })).status, 400);
  assert.equal((await leave(boris, { received: 'да' })).status, 400);
  assert.equal((await leave(boris, { rating: 6 })).status, 400);
  assert.equal((await leave(boris, { text: 'ок' })).status, 400);
  const r = await leave(boris, { rating: 4, received: false, text: 'Договорились, но товар не отдали — продавец не пришёл.' });
  assert.equal(r.status, 200);
  assert.equal(r.data.review.status, 'pending');
  assert.equal(r.data.review.received, false);
  rid = r.data.review.id;
  assert.equal((await leave(boris)).status, 409, 'второй раз нельзя');
  assert.equal((await boris.get(`/api/conversations/${conv}`)).data.review.status, 'pending');
});

test('изменить или удалить отзыв не может никто', async () => {
  for (const c of [boris, anna]) {
    for (const m of ['PATCH', 'PUT', 'DELETE']) {
      assert.equal((await c.req(m, `/api/reviews/${rid}`, m === 'DELETE' ? undefined : { text: 'другое', rating: 5 })).status, 404);
    }
  }
  // удаление объявления отзыв не убирает
  const id2 = await publish(anna, admin, { title: 'Самокат', category: 'hobby', city: 'Казань', price: '3000' });
  const c2 = (await vera.post('/api/conversations', { listingId: id2 })).data.id;
  await send(vera, c2, 'Добрый день!');
  await send(anna, c2, 'Здравствуйте!');
  const r2 = (await vera.post('/api/reviews', { conversationId: c2, rating: 2, received: true, text: 'Самокат с трещиной, о которой не сказали.' })).data.review.id;
  await admin.post(`/api/admin/reviews/${r2}/publish`);
  assert.equal((await anna.del(`/api/listings/${id2}`)).status, 200);
  const pub = (await client(srv.base).get(`/api/users/${anna.user.id}/reviews`)).data;
  assert.equal(pub.items.length, 1);
  assert.equal(pub.items[0].listing.title, 'Самокат', 'название сохранилось');
  assert.equal(pub.rating.count, 1);
});

test('до проверки отзыв не виден; модератор публикует или отклоняет с причиной', async () => {
  assert.equal((await client(srv.base).get(`/api/users/${anna.user.id}/reviews`)).data.items.some((x) => x.id === rid), false);
  assert.equal((await boris.post(`/api/admin/reviews/${rid}/publish`)).status, 403);
  const q = (await admin.get('/api/admin/reviews')).data;
  assert.ok(q.items.some((x) => x.id === rid));
  assert.ok((await admin.get('/api/admin/stats')).data.reviews >= 1);
  assert.equal((await admin.post(`/api/admin/reviews/${rid}/publish`)).status, 200);
  const pub = (await client(srv.base).get(`/api/users/${anna.user.id}/reviews`)).data;
  assert.equal(pub.rating.count, 2);
  assert.equal(pub.rating.avg, 3);
  assert.deepEqual(pub.rating.dist, { 5: 0, 4: 1, 3: 0, 2: 1, 1: 0 });
  const mineInPub = pub.items.find((x) => x.id === rid);
  assert.equal(mineInPub.author.name, 'Борис');
  assert.equal(mineInPub.received, false);
  assert.equal(mineInPub.status, undefined, 'служебные поля не видны всем');
  assert.equal((await client(srv.base).get(`/api/users/${anna.user.id}`)).data.user.rating.avg, 3);
  assert.equal((await client(srv.base).get(`/api/listings/${id}`)).data.seller.rating.count, 2);
  // 1.26: в карточке выдачи — продавец с фото и оценкой; в профиле продавца строки продавца нет
  const cardIt = (await client(srv.base).get('/api/listings?q=Велосипед')).data.items.find((x) => x.id === id);
  assert.deepEqual(cardIt.seller, { id: anna.user.id, name: 'Анна', avatar: null, rating: 3, reviews: 2, shop: false });
  assert.equal((await client(srv.base).get(`/api/users/${anna.user.id}`)).data.items.find((x) => x.id === id).seller, null);
  // 1.27: в чате — оценка собеседника и город объявления (колонка справа)
  const chat = (await boris.get(`/api/conversations/${conv}`)).data;
  assert.equal(chat.other.rating.count, 2);
  assert.equal(chat.other.rating.avg, 3);
  assert.equal(chat.listing.city, 'Казань');
  assert.equal((await anna.get('/api/me')).data.user.rating.count, 2);
  assert.equal((await client(srv.base).get(`/api/users/${anna.user.id}/reviews?stars=4`)).data.items.length, 1);
});

test('ответ продавца: один раз, после проверки; отклонённый можно написать заново', async () => {
  assert.equal((await boris.post(`/api/reviews/${rid}/reply`, { text: 'Ответ' })).status, 404, 'отвечает только продавец');
  assert.equal((await anna.post(`/api/reviews/${rid}/reply`, { text: 'Вы не пришли на встречу.' })).status, 200);
  assert.equal((await anna.post(`/api/reviews/${rid}/reply`, { text: 'Ещё раз' })).status, 409);
  await admin.post(`/api/admin/reviews/${rid}/reply/reject`, { reason: 'Без перехода на личности' });
  let mine = (await anna.get('/api/my/reviews')).data.about.find((x) => x.id === rid);
  assert.equal(mine.replyDraft.status, 'rejected');
  assert.equal(mine.canReply, true);
  await anna.post(`/api/reviews/${rid}/reply`, { text: 'Я ждала у метро до 19:00, писала в чат.' });
  await admin.post(`/api/admin/reviews/${rid}/reply/publish`);
  const pub = (await client(srv.base).get(`/api/users/${anna.user.id}/reviews`)).data.items.find((x) => x.id === rid);
  assert.equal(pub.reply.text, 'Я ждала у метро до 19:00, писала в чат.');
  assert.equal((await anna.post(`/api/reviews/${rid}/reply`, { text: 'Изменю' })).status, 409, 'ответ не меняется');
});

test('жалоба продавца: причина и обоснование, одна на отзыв; модератор оставляет или скрывает', async () => {
  assert.equal((await boris.post(`/api/reviews/${rid}/complaint`, { reason: 'Другое', text: 'Хочу пожаловаться на свой же отзыв' })).status, 404);
  assert.equal((await anna.post(`/api/reviews/${rid}/complaint`, { reason: 'Просто так', text: 'Мы не общались, это неправда совсем' })).status, 400);
  assert.equal((await anna.post(`/api/reviews/${rid}/complaint`, { reason: 'Ложные сведения', text: 'Коротко' })).status, 400);
  const r = await anna.post(`/api/reviews/${rid}/complaint`, { reason: 'Ложные сведения', text: 'Покупатель сам не пришёл на встречу, переписка это подтверждает.' });
  assert.equal(r.status, 200);
  assert.equal(r.data.review.complaint.resolved, false);
  assert.equal((await anna.post(`/api/reviews/${rid}/complaint`, { reason: 'Другое', text: 'Ещё одна жалоба на этот же отзыв' })).status, 409);
  // пока жалоба рассматривается, отзыв виден
  assert.ok((await client(srv.base).get(`/api/users/${anna.user.id}/reviews`)).data.items.some((x) => x.id === rid));
  assert.equal((await admin.get('/api/admin/reviews?tab=complaints')).data.items[0].complaint.reason, 'Ложные сведения');
  assert.equal((await admin.post(`/api/admin/reviews/${rid}/complaint/hide`, { reason: '' })).status, 400, 'причина скрытия обязательна');
  assert.equal((await admin.post(`/api/admin/reviews/${rid}/complaint/hide`, { reason: 'Переписка подтверждает слова продавца' })).status, 200);
  const pub = (await client(srv.base).get(`/api/users/${anna.user.id}/reviews`)).data;
  assert.equal(pub.items.some((x) => x.id === rid), false, 'скрытый не виден');
  assert.equal(pub.rating.count, 1, 'и не учитывается в оценке');
  const mine = (await boris.get('/api/my/reviews')).data.mine.find((x) => x.id === rid);
  assert.equal(mine.status, 'hidden');
  assert.equal(mine.reason, 'Переписка подтверждает слова продавца');
});

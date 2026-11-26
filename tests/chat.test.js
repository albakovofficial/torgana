'use strict';
// Переписка: чёрный список, предупреждения, ответы на сообщения, прочитано и «печатает», файлы, видео, правка.
const { test, describe } = require('node:test');

// 1.48.0: VIN, чёрный список, «Хорошая цена».
describe('чёрный список и предупреждения', () => {
  const assert = require('node:assert/strict');
  const { startServer, registerUser, publish } = require('./helpers');

  let srv; let admin; let seller; let buyer;
  const CAR = { category: 'transport', subcategory: 'cars', city: 'Москва', title: 'что угодно', attrs: { brand: 'Kia', model: 'Rio', year: 2017, mileage: 90000, gearbox: 'Автомат', engine: 1.6 } };
  test.before(async () => {
    srv = await startServer({ GOOD_PRICE_TICK_MS: '500' });
    admin = await registerUser(srv.base, { email: 'admin@test.local', name: 'Админ' });
    seller = await registerUser(srv.base, { email: 'seller@test.ru', name: 'Олег' });
    buyer = await registerUser(srv.base, { email: 'buyer@test.ru', name: 'Мария' });
  });
  test.after(() => srv.stop());

  test('чёрный список: писать нельзя в обе стороны, объявления скрыты из поиска, разблокировка', async () => {
    const id = await publish(seller, admin, { ...CAR, price: 950000 });
    const conv = (await buyer.post('/api/conversations', { listingId: id })).data.id;
    assert.equal((await buyer.post(`/api/conversations/${conv}/messages`, { body: 'Здравствуйте' })).status, 200);
    const sellerId = (await buyer.get(`/api/listings/${id}`)).data.seller.id;
    assert.equal((await buyer.post('/api/blocks', { userId: sellerId })).status, 200);
    assert.equal((await buyer.get(`/api/conversations/${conv}`)).data.block, 'me');
    assert.equal((await seller.get(`/api/conversations/${conv}`)).data.block, 'them');
    const r = await seller.post(`/api/conversations/${conv}/messages`, { body: 'Ответ' });
    assert.equal(r.status, 403);
    assert.match(r.data.error, /ограничил/);
    assert.match((await buyer.post(`/api/conversations/${conv}/messages`, { body: 'Ещё' })).data.error, /Разблокируйте/);
    assert.equal((await seller.post(`/api/conversations/${conv}/offer`, { price: 100 })).status, 400, 'продавец цену не предлагает — проверка своя');
    assert.equal((await buyer.post(`/api/conversations/${conv}/offer`, { price: 900000 })).status, 403, 'предложение цены — тоже нельзя');
    const items = (await buyer.get('/api/listings?sub=cars')).data.items;
    assert.ok(!items.some((x) => x.id === id), 'в поиске объявлений заблокированного нет');
    assert.equal((await buyer.get(`/api/users/${sellerId}`)).data.user.block, 'me');
    assert.deepEqual((await buyer.get('/api/blocks')).data.items.map((x) => x.name), ['Олег']);
    assert.equal((await buyer.post('/api/blocks', { userId: (await buyer.get('/api/me')).data.user.id })).status, 400, 'себя — нельзя');
    assert.equal((await buyer.del(`/api/blocks/${sellerId}`)).status, 200);
    assert.equal((await seller.post(`/api/conversations/${conv}/messages`, { body: 'Ответ' })).status, 200);
    assert.ok((await buyer.get('/api/listings?sub=cars')).data.items.some((x) => x.id === id));
  });

  test('предупреждения в чате: ссылка на чужой сайт, номер карты, предоплата, мессенджер', async () => {
    const { riskOf } = await import('../public/assets/js/rules.js'); // тот же модуль, что в браузере
    const k = (t) => (riskOf(t) || {}).k || null;
    assert.equal(k('Оплатите тут: pay-secure.ru/a'), 'link');
    assert.equal(k('Смотрите https://torgana.ru/l/5'), null, 'ссылка на Торгану — не чужая');
    assert.equal(k('Карта 4111 1111 1111 1111'), 'card');
    assert.equal(k('Номер заказа 1234 5678 1234 5678'), null, 'не номер карты (не проходит проверку)');
    assert.equal(k('Нужна предоплата 30%'), 'prepay');
    assert.equal(k('Пишите в WhatsApp'), 'messenger');
    assert.equal(k('Продиктуйте код из смс'), 'code');
    assert.equal(k('Добрый день, когда можно посмотреть?'), null);
    assert.equal(k('Цена 1 200 000 ₽, торг т.д.'), null);
  });
});

// 1.54.0: встречная цена в торге, срок проверки для продавца, воронка продавцов в «Сводке».
describe('ответы, прочитано, «печатает»', () => {
  const assert = require('node:assert/strict');
  const { startServer, registerUser, publish } = require('./helpers');

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

  test('1.55.0: прочитано и «печатает»: только когда переписка на экране, отметка гаснет после отправки', async () => {
    const lid4 = await publish(oleg, admin, { title: 'Фляга', category: 'hobby', city: 'Казань', price: 500 });
    const c4 = (await anna.post('/api/conversations', { listingId: lid4 })).data.id;
    const m = (await anna.post(`/api/conversations/${c4}/messages`, { body: 'Добрый вечер!' })).data.message;
    let a = (await anna.get(`/api/conversations/${c4}`)).data;
    assert.equal(a.readUpTo, 0, 'ещё не прочитано');
    let list = (await anna.get('/api/conversations')).data.items.find((i) => i.id === c4);
    assert.equal(list.lastMine, 1, 'в списке — ✓');
    await oleg.get(`/api/conversations/${c4}?seen=0`); // вкладка свёрнута — не прочитано
    assert.equal((await anna.get(`/api/conversations/${c4}`)).data.readUpTo, 0);
    await oleg.get(`/api/conversations/${c4}`);
    a = (await anna.get(`/api/conversations/${c4}`)).data;
    assert.equal(a.readUpTo, m.id, 'Олег открыл — ✓✓');
    assert.equal((await anna.get('/api/conversations')).data.items.find((i) => i.id === c4).lastMine, 2);
    // печатает
    assert.equal(a.typing, false);
    assert.equal((await oleg.post(`/api/conversations/${c4}/typing`)).status, 200);
    assert.equal((await anna.get(`/api/conversations/${c4}`)).data.typing, true);
    assert.equal((await oleg.get(`/api/conversations/${c4}`)).data.typing, false, 'себя не видит');
    await oleg.post(`/api/conversations/${c4}/messages`, { body: 'Добрый!' });
    assert.equal((await anna.get(`/api/conversations/${c4}`)).data.typing, false, 'отправил — уже не печатает');
    const petr3 = await registerUser(srv.base, { name: 'Пётр', email: 'petr3@test.local' });
    assert.equal((await petr3.post(`/api/conversations/${c4}/typing`)).status, 404, 'чужой диалог');
  });
});

// 1.57.0: в переписке — видео и файлы, правка своего сообщения.
describe('файлы, видео, правка', () => {
  const assert = require('node:assert/strict');
  const { startServer, registerUser, publish } = require('./helpers');

  let srv; let admin; let anna; let boris; let cid;

  function box(type, body) { const b = Buffer.alloc(8); b.writeUInt32BE(8 + body.length, 0); b.write(type, 4, 'latin1'); return Buffer.concat([b, body]); }
  function mp4(seconds) {
    const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
    return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2mp41', 'latin1')), box('mdat', Buffer.alloc(3000, 7)), box('moov', box('mvhd', mvhd))]);
  }
  async function uploadVideo(c) {
    const buf = mp4(5);
    const s = await c.post('/api/videos', { name: 'clip.mp4', type: 'video/mp4', size: buf.length, duration: 5 });
    const r = await fetch(`${srv.base}/api/videos/${s.data.file}?offset=0`, { method: 'PUT', headers: { cookie: c.cookie, 'content-type': 'application/octet-stream' }, body: buf });
    assert.equal(r.status, 200);
    return s.data.file;
  }
  async function uploadFile(c, name, buf) {
    const r = await fetch(`${srv.base}/api/files?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { cookie: c.cookie, 'content-type': 'application/octet-stream' }, body: buf });
    return { status: r.status, data: await r.json() };
  }

  test.before(async () => {
    srv = await startServer({ ADMIN_EMAIL: 'admin@test.local' });
    admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
    anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
    boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
    const lid = await publish(anna, admin, { title: 'Велосипед', category: 'hobby', city: 'Казань', price: '1000', description: 'Отличный' });
    cid = (await boris.post('/api/conversations', { listingId: lid })).data.id;
  });
  test.after(() => srv.stop());

  test('файл: проверка формата, отправка, скачивание с исходным названием; второй раз — нельзя', async () => {
    assert.equal((await uploadFile(boris, 'вирус.exe', Buffer.from('MZ'))).status, 400);
    assert.equal((await uploadFile(boris, 'договор.pdf', Buffer.from('<html>не pdf</html>'))).status, 400, 'содержимое не PDF');
    const f = await uploadFile(boris, 'Договор купли-продажи.pdf', Buffer.from('%PDF-1.7\n%тест\n'));
    assert.equal(f.status, 200, JSON.stringify(f.data));
    assert.equal(f.data.name, 'Договор купли-продажи.pdf');
    assert.equal((await anna.post(`/api/conversations/${cid}/messages`, { file: f.data.file })).status, 400, 'чужой файл не отправить');
    const r = await boris.post(`/api/conversations/${cid}/messages`, { file: f.data.file });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual(r.data.message.file, { url: `/uploads/${f.data.file}`, name: 'Договор купли-продажи.pdf', size: f.data.size });
    assert.equal((await boris.post(`/api/conversations/${cid}/messages`, { file: f.data.file })).status, 400, 'один файл — одно сообщение');
    const dl = await fetch(srv.base + f.data.url);
    assert.equal(dl.status, 200);
    assert.equal(dl.headers.get('content-type'), 'application/pdf');
    assert.match(dl.headers.get('content-disposition'), /filename\*=UTF-8''%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80/);
    assert.match(dl.headers.get('content-security-policy'), /sandbox/);
    const inbox = (await anna.get('/api/conversations')).data.items[0];
    assert.equal(inbox.lastBody, '📎 Файл');
    const chat = (await anna.get(`/api/conversations/${cid}`)).data;
    assert.equal(chat.messages.at(-1).file.name, 'Договор купли-продажи.pdf');
  });

  test('видео: та же загрузка частями, в переписке и в поддержке', async () => {
    const v = await uploadVideo(boris);
    const r = await boris.post(`/api/conversations/${cid}/messages`, { video: v, body: 'Вот как ездит' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.message.video, `/uploads/${v}`);
    assert.equal((await boris.post(`/api/conversations/${cid}/messages`, { video: v })).status, 400, 'одно видео — одно сообщение');
    const v2 = await uploadVideo(anna);
    const s = await anna.post('/api/support/messages', { video: v2 });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    assert.equal(s.data.message.video, `/uploads/${v2}`);
    const t = (await admin.get('/api/admin/support')).data.items.find((x) => x.user.name === 'Анна');
    assert.equal(t.lastBody, '🎬 Видео');
  });

  test('правка: только своё и только текст, собеседник получает правку при опросе', async () => {
    const m = (await boris.post(`/api/conversations/${cid}/messages`, { body: 'Продаёте за 900?' })).data.message;
    const first = (await anna.get(`/api/conversations/${cid}`)).data;
    const lastId = first.messages.at(-1).id;
    assert.equal((await anna.patch(`/api/conversations/${cid}/messages/${m.id}`, { body: 'взлом' })).status, 404, 'чужое — нельзя');
    assert.equal((await boris.patch(`/api/conversations/${cid}/messages/${m.id}`, { body: '' })).status, 400, 'пустое — нельзя');
    const e = await boris.patch(`/api/conversations/${cid}/messages/${m.id}`, { body: 'Продаёте за 950?' });
    assert.equal(e.status, 200, JSON.stringify(e.data));
    assert.equal(e.data.message.body, 'Продаёте за 950?');
    assert.ok(e.data.message.editedAt);
    const next = (await anna.get(`/api/conversations/${cid}?after=${lastId}&edits=${first.now - 1}`)).data;
    assert.deepEqual(next.edited.map((x) => [x.id, x.body]), [[m.id, 'Продаёте за 950?']]);
    assert.equal((await anna.get('/api/conversations')).data.items[0].lastBody, 'Продаёте за 950?');
    const quiet = (await anna.get(`/api/conversations/${cid}?after=${lastId}&edits=${next.now}`)).data;
    assert.equal(quiet.edited.length, 0, 'правка приходит один раз');
  });
});

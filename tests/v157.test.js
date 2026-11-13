'use strict';
// 1.57.0: в переписке — видео и файлы, правка своего сообщения.
const test = require('node:test');
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

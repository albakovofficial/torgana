'use strict';

// ИИ по фото через Яндекс AI Studio (1.37.0): ключ в модерации, фото → Qwen (распознавание) → Алиса AI (текст).
// Вместо Яндекса — локальный сервер с тем же API (YANDEX_AI_URL).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, registerUser, client, PNG_1PX } = require('./helpers');

let ya; let calls = []; let srv; let admin; let anna;
before(async () => {
  ya = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const b = JSON.parse(body);
      calls.push({ auth: req.headers.authorization, project: req.headers['openai-project'], model: b.model, image: JSON.stringify(b.messages).includes('data:image/') });
      if (req.headers.authorization !== 'Api-Key AQVN-test-key') { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Unauthorized' } })); return; }
      const vision = b.model.endsWith('/qwen3.6-35b-a3b');
      const content = vision
        ? '```json\n{"title":"кроссовки найк 42","category":"personal","subcategory":"shoes","attrs":{"shoeSize":42,"colour":"красный"},"condition":"used","description":"Кроссовки, видны следы носки."}\n```'
        : b.messages[0].content.includes('Ответь одним словом') ? 'Работает' : '{"title":"Кроссовки Nike, 42 размер","description":"Кроссовки Nike 42 размера, носили. Подошва целая."}';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
    });
  });
  await new Promise((r) => ya.listen(0, '127.0.0.1', r));
  srv = await startServer({ YANDEX_AI_URL: `http://127.0.0.1:${ya.address().port}/v1/chat/completions` });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
});
after(async () => { await srv.stop(); ya.close(); });

test('без ключа ИИ выключен; ключ и каталог — в модерации, проверка ключа', async () => {
  assert.equal((await client(srv.base).get('/api/config')).data.ai, false);
  assert.equal((await anna.get('/api/admin/ai')).status, 403, 'не модератору — нельзя');
  assert.equal((await admin.put('/api/admin/ai', { key: 'AQVN-test-key', folder: 'плохой' })).status, 400);
  const r = await admin.put('/api/admin/ai', { key: 'AQVN-test-key', folder: 'b1gtestfolder123' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.provider, 'yandex');
  assert.equal(r.data.hasKey, true);
  assert.ok(!JSON.stringify(r.data).includes('AQVN-test-key'), 'ключ наружу не отдаём');
  const cfg = (await client(srv.base).get('/api/config')).data;
  assert.equal(cfg.ai, true); assert.equal(cfg.aiBy, 'yandex');
  const t = await admin.post('/api/admin/ai/test');
  assert.equal(t.status, 200); assert.equal(t.data.answer, 'Работает');
  assert.ok((await client(srv.base).get('/page/privacy')).status === 200);
});

test('фото → раздел, характеристики (только верные), текст от Алисы', async () => {
  calls = [];
  const up = (await anna.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` })).data;
  const r = await anna.post('/api/ai/suggest', { file: up.file });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.title, 'Кроссовки Nike, 42 размер', 'название переписала Алиса');
  assert.equal(r.data.category, 'personal');
  assert.equal(r.data.subcategory, 'shoes');
  assert.equal(r.data.attrs.shoeSize, 42);
  assert.equal(r.data.attrs.colour, undefined, 'поля не из раздела отброшены');
  assert.equal(r.data.condition, 'used');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].image && calls[0].model === 'gpt://b1gtestfolder123/qwen3.6-35b-a3b', 'фото — модели распознавания');
  assert.ok(!calls[1].image && calls[1].model === 'gpt://b1gtestfolder123/aliceai-llm', 'текст — Алисе, без фото');
  assert.equal(calls[0].project, 'b1gtestfolder123');
});

test('неверный ключ — понятная ошибка; «выключить» убирает ИИ', async () => {
  await admin.put('/api/admin/ai', { key: 'AQVN-wrong', folder: 'b1gtestfolder123' });
  const t = await admin.post('/api/admin/ai/test');
  assert.equal(t.status, 502); assert.match(t.data.error, /Ключ не подошёл/);
  await admin.put('/api/admin/ai', { off: true });
  assert.equal((await client(srv.base).get('/api/config')).data.ai, false);
});

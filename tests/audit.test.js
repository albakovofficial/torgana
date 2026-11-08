'use strict';

// Исправления по аудиту сайта (1.35.1): поиск по русским названиям марок, честный 404 для несуществующих адресов.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client } = require('./helpers');

let srv; let admin; let anna;
before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
});
after(() => srv.stop());

test('«лада», «айфон», «самсунг» находят Lada, iPhone, Samsung', async () => {
  const mk = async (b) => { const r = await anna.post('/api/listings', b); assert.equal(r.status, 200, JSON.stringify(r.data)); await admin.post(`/api/admin/listings/${r.data.id}/restore`); return r.data.id; };
  const lada = await mk({ title: 'Lada Vesta 2021', category: 'transport', subcategory: 'cars', city: 'Казань', price: 1200000, attrs: { brand: 'Lada', year: 2021, mileage: 30000, gearbox: 'Механика' } });
  const phone = await mk({ title: 'iPhone 13, 128 ГБ', category: 'electronics', subcategory: 'phones', city: 'Казань', price: 42000, attrs: { brand: 'Apple', memory: '128 ГБ' } });
  const sams = await mk({ title: 'Телефон Samsung Galaxy S21', category: 'electronics', city: 'Казань', price: 25000 });
  const find = async (q) => (await client(srv.base).get(`/api/listings?q=${encodeURIComponent(q)}`)).data.items.map((i) => i.id);
  assert.deepEqual(await find('лада'), [lada]);
  assert.deepEqual(await find('айфон'), [phone]);
  assert.deepEqual(await find('самсунг'), [sams]);
  assert.deepEqual(await find('Lada'), [lada], 'латиницей — как раньше');
  const ladan = (await client(srv.base).get(`/api/listings?q=${encodeURIComponent('ладан')}&exact=1`)).data;
  assert.deepEqual(ladan.items, [], 'не по части другого слова (как написано; без exact 1.43.0 предложит «лада»)');
});

test('несуществующий адрес — код 404, известные адреса — 200', async () => {
  for (const p of ['/какая-то-страница', '/profile/nope', '/admin/zzz']) assert.equal((await fetch(srv.base + encodeURI(p))).status, 404, p);
  for (const p of ['/', '/search', '/new', '/profile/settings', '/messages/support', '/business', '/page/help']) assert.equal((await fetch(srv.base + p)).status, 200, p);
});

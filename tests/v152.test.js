'use strict';
// 1.52.0: медаль «Один из первых / Одна из первых» — первым 1000 продавцам с одобренным объявлением, с номером по порядку.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client, publish } = require('./helpers');
const { guessForm } = require('../lib/first');

test('подпись по имени: отчество, окончания, мужские имена на -а/-я', () => {
  const cases = { 'Анна Смирнова': 'f', 'Борис': 'm', 'Ибрагим Албаков': 'm', 'Никита': 'm', 'Илья Петров': 'm', 'Мария': 'f', 'Иванова Ольга Петровна': 'f',
    'Петров Иван Сергеевич': 'm', 'Любовь': 'f', 'Саша': '', 'Женя Ким': 'm', 'Ксения Ким': 'f', 'ivan': '' };
  for (const [name, want] of Object.entries(cases)) assert.equal(guessForm(name), want, name);
});

let srv; let owner; let anna; let boris; let ivan;
test.before(async () => {
  srv = await startServer({ ADMIN_EMAIL: 'owner@test.local', FIRST_ANYTIME: '1', FIRST_INVITE_AFTER_MS: '1', FIRST_TICK_MS: '300' });
  owner = await registerUser(srv.base, { email: 'owner@test.local', name: 'Торгана' });
  anna = await registerUser(srv.base, { email: 'anna@test.ru', name: 'Анна Смирнова' });
  boris = await registerUser(srv.base, { email: 'boris@test.ru', name: 'Борис' });
  ivan = await registerUser(srv.base, { email: 'ivan@test.ru', name: 'Иван' });
});
test.after(() => srv.stop());

const badge = async (c) => (await client(srv.base).get(`/api/users/${c.user.id}`)).data.user.badges.first;

test('номер — при первой публикации, по порядку; у официального аккаунта медали нет; второй раз номер не меняется', async () => {
  assert.equal(await badge(anna), null, 'до публикации медали нет');
  await publish(owner, owner, { category: 'services', city: 'Москва', title: 'Как разместить объявление', price: '' });
  const a1 = await publish(anna, owner, { category: 'electronics', city: 'Казань', title: 'Наушники беспроводные', price: '3500' });
  await publish(boris, owner, { category: 'electronics', city: 'Казань', title: 'Колонка портативная', price: '2500' });
  await publish(anna, owner, { category: 'electronics', city: 'Казань', title: 'Зарядка быстрая', price: '900' });
  assert.equal(await badge(owner), null);
  assert.deepEqual(await badge(anna), { no: 1, form: 'f', own: '' });
  assert.deepEqual(await badge(boris), { no: 2, form: 'm', own: '' });
  // карточка объявления и «я» — тоже с медалью
  assert.equal((await client(srv.base).get(`/api/listings/${a1}`)).data.seller.badges.first.no, 1);
  const me = (await anna.get('/api/me')).data;
  assert.equal(me.user.badges.first.no, 1);
  assert.deepEqual(me.first, { left: 998, form: 'f' });
  // уведомление в колокольчике
  const n = (await anna.get('/api/notices')).data.items.find((i) => i.icon === 'medal');
  assert.ok(n, 'уведомление о медали');
  assert.match(n.title, /Одна из первых/);
  assert.match(n.body, /номер — 1\b/);
});

test('подпись можно сменить в настройках', async () => {
  assert.equal((await boris.patch('/api/me', { medalForm: 'f' })).status, 200);
  assert.deepEqual(await badge(boris), { no: 2, form: 'f', own: 'f' });
  await boris.patch('/api/me', { medalForm: '' });
  assert.equal((await badge(boris)).form, 'm', 'пусто — снова по имени');
  await boris.patch('/api/me', { medalForm: 'x' });
  assert.equal((await badge(boris)).own, '');
});

test('тем, кто ничего не разместил, — одно приглашение «Медаль ждёт вас»', async () => {
  let n;
  for (let i = 0; i < 40 && !n; i += 1) {
    await new Promise((r) => setTimeout(r, 150));
    n = (await ivan.get('/api/notices')).data.items.find((x) => x.icon === 'medal');
  }
  assert.ok(n, 'приглашение пришло');
  assert.match(n.title, /Один из первых.*ждёт вас/);
  assert.equal(n.url, '/new');
  await new Promise((r) => setTimeout(r, 800));
  assert.equal((await ivan.get('/api/notices')).data.items.filter((x) => x.icon === 'medal').length, 1, 'только один раз');
  assert.equal((await anna.get('/api/notices')).data.items.filter((x) => /ваша/.test(x.title)).length, 1, 'поздравление — один раз');
  assert.equal((await owner.get('/api/notices')).data.items.filter((x) => x.icon === 'medal').length, 0, 'официальному аккаунту — нет');
});

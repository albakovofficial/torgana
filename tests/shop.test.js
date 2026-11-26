'use strict';
// Витрина магазина, официальный аккаунт Торганы, «Для бизнеса» без переключателя.
const { test, describe, before, after } = require('node:test');

// 1.49.0: витрина магазина — доставка, закреплённые («Магазин Про»), разделы и счётчики; автозагрузки из фида больше нет.
describe('витрина магазина', () => {
  const assert = require('node:assert/strict');
  const { startServer, registerUser, client, publish } = require('./helpers');

  let srv; let admin; let shop; let other;
  const SOFA = { category: 'home', subcategory: 'furniture', city: 'Казань', title: 'Диван', attrs: { furnType: 'Диван', material: 'Ткань', color: 'Серый' } };
  const BIKE = { category: 'hobby', subcategory: 'bikes', city: 'Казань', title: 'Велосипед горный', attrs: { bikeType: 'Горный' } };
  test.before(async () => {
    srv = await startServer();
    admin = await registerUser(srv.base, { email: 'admin@test.local', name: 'Админ' });
    shop = await registerUser(srv.base, { email: 'shop@test.ru', name: 'Ольга' });
    other = await registerUser(srv.base, { email: 'other@test.ru', name: 'Борис' });
  });
  test.after(() => srv.stop());

  test('автозагрузки нет: адреса фида не отвечают, в «Для бизнеса» её нет', async () => {
    await admin.post(`/api/admin/users/${shop.user.id}/plan`, { plan: 'pro', days: 30 });
    assert.equal((await shop.put('/api/my/feed', { url: 'https://example.ru/avito.xml' })).status, 404);
    assert.equal((await shop.post('/api/my/feed/run')).status, 404);
    const d = (await shop.get('/api/my/business')).data;
    assert.equal(d.feed, undefined);
    assert.deepEqual(d.pinned, []);
  });

  test('витрина: доставка сохраняется и видна всем; модератор очищает и её', async () => {
    const r = await shop.put('/api/my/shop', { about: 'Мебель и велосипеды', address: 'Казань, ул. Баумана, 15', delivery: 'Самовывоз и доставка по Казани' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.shop.delivery, 'Самовывоз и доставка по Казани');
    const pub = (await client(srv.base).get(`/api/users/${shop.user.id}`)).data.user.shop;
    assert.equal(pub.delivery, 'Самовывоз и доставка по Казани');
    assert.equal((await shop.get('/api/my/business')).data.shop.delivery, 'Самовывоз и доставка по Казани');
  });

  test('публичный профиль: настоящее число объявлений, разделы, сделки; объявления — через /api/listings?user=', async () => {
    const ids = [];
    for (const [b, price] of [[SOFA, 30000], [SOFA, 12000], [BIKE, 18000]]) ids.push(await publish(shop, admin, { ...b, price }));
    const d = (await client(srv.base).get(`/api/users/${shop.user.id}`)).data;
    assert.equal(d.items, undefined, 'объявления страница берёт из поиска');
    assert.equal(d.user.activeCount, 3);
    assert.equal(d.user.soldCount, undefined, '«продано» больше не показываем — вместо него сделки');
    assert.equal(d.user.rep.total, 0, 'всего сделок — продажи и покупки');
    assert.deepEqual(d.sections.map((x) => [x.sub, x.n]), [['furniture', 2], ['bikes', 1]]);
    assert.ok(d.sections.every((x) => x.name));
    const furn = (await client(srv.base).get(`/api/listings?user=${shop.user.id}&sub=furniture&sort=cheap`)).data;
    assert.equal(furn.total, 2);
    assert.deepEqual(furn.items.map((i) => i.price), [12000, 30000]);
    // у частного продавца разделов нет
    const p = (await client(srv.base).get(`/api/users/${other.user.id}`)).data;
    assert.deepEqual(p.sections, []);
    assert.deepEqual(p.pinned, []);
    test.ids = ids;
  });

  test('закреплённые на витрине: только «Магазин Про», только свои опубликованные, до 3, по порядку', async () => {
    const ids = test.ids;
    const extra = await publish(shop, admin, { ...BIKE, price: 9000 });
    const theirs = await publish(other, admin, { ...BIKE, price: 7000 });
    assert.equal((await other.put('/api/my/shop/pins', { id: theirs, pin: true })).status, 403, 'без тарифа нельзя');
    assert.equal((await shop.put('/api/my/shop/pins', { id: theirs, pin: true })).status, 404, 'чужое нельзя');
    for (const id of [ids[2], ids[0], extra]) assert.equal((await shop.put('/api/my/shop/pins', { id, pin: true })).status, 200);
    const four = await shop.put('/api/my/shop/pins', { id: ids[1], pin: true });
    assert.equal(four.status, 400);
    assert.match(four.data.error, /до 3/);
    let d = (await client(srv.base).get(`/api/users/${shop.user.id}`)).data;
    assert.deepEqual(d.pinned.map((i) => i.id), [ids[2], ids[0], extra], 'в порядке закрепления');
    assert.equal(d.pinned[0].seller, null);
    assert.deepEqual((await shop.get('/api/my/business')).data.pinned.map((x) => x.id), [ids[2], ids[0], extra]);
    // снятое с публикации пропадает из закреплённых само и освобождает место
    await shop.patch(`/api/listings/${extra}`, { status: 'archived' });
    d = (await client(srv.base).get(`/api/users/${shop.user.id}`)).data;
    assert.deepEqual(d.pinned.map((i) => i.id), [ids[2], ids[0]]);
    assert.equal((await shop.put('/api/my/shop/pins', { id: extra, pin: true })).status, 400, 'снятое закрепить нельзя');
    assert.equal((await shop.put('/api/my/shop/pins', { id: ids[1], pin: true })).status, 200);
    assert.equal((await shop.put('/api/my/shop/pins', { id: ids[2], pin: false })).status, 200);
    assert.deepEqual((await client(srv.base).get(`/api/users/${shop.user.id}`)).data.pinned.map((i) => i.id), [ids[0], ids[1]]);
    // на тарифе «Магазин» закреплённые не показываются
    await admin.post(`/api/admin/users/${shop.user.id}/plan/stop`, {});
    await admin.post(`/api/admin/users/${shop.user.id}/plan`, { plan: 'shop', days: 30 });
    d = (await client(srv.base).get(`/api/users/${shop.user.id}`)).data;
    assert.deepEqual(d.pinned, []);
    assert.equal((await shop.put('/api/my/shop/pins', { id: ids[0], pin: false })).status, 403);
    // модератор очищает витрину — и закреплённые, и доставку
    await admin.post(`/api/admin/users/${shop.user.id}/plan`, { plan: 'pro', days: 30 });
    assert.equal((await admin.post(`/api/admin/users/${shop.user.id}/shop/clear`, { reason: 'Телефон в описании' })).status, 200);
    const sh = (await client(srv.base).get(`/api/users/${shop.user.id}`)).data;
    assert.deepEqual(sh.pinned, []);
    assert.equal(sh.user.shop.delivery, '');
  });
});

// 1.50.0: официальный аккаунт Торганы — аккаунт владельца (первый адрес в ADMIN_EMAIL): галочка у имени,
// витрина, статистика и закреплённые без тарифа; у других — ничего не меняется.
describe('официальный аккаунт', () => {
  const assert = require('node:assert/strict');
  const { startServer, registerUser, client, publish } = require('./helpers');

  let srv; let owner; let mod; let seller;
  test.before(async () => {
    srv = await startServer({ ADMIN_EMAIL: 'owner@test.local,mod@test.local' });
    owner = await registerUser(srv.base, { email: 'owner@test.local', name: 'Торгана' });
    mod = await registerUser(srv.base, { email: 'mod@test.local', name: 'Модератор' });
    seller = await registerUser(srv.base, { email: 'seller@test.ru', name: 'Анна' });
  });
  test.after(() => srv.stop());

  test('галочка «Официальный аккаунт» — только у владельца, не у модератора и не у продавца', async () => {
    const b = async (c) => (await client(srv.base).get(`/api/users/${c.user.id}`)).data.user.badges;
    assert.equal((await b(owner)).official, true);
    assert.equal((await b(owner)).shop, false, 'значка «Магазин» у официального аккаунта нет');
    assert.equal((await b(mod)).official, false);
    assert.equal((await b(seller)).official, false);
    assert.equal((await owner.get('/api/me')).data.user.badges.official, true);
  });

  test('витрина без тарифа: обложка, описание, доставка, закреплённые; на публичной странице — «official»', async () => {
    assert.equal((await owner.get('/api/me')).data.user.plan, null, 'тарифа нет');
    const r = await owner.put('/api/my/shop', { about: 'Официальный аккаунт Торганы', delivery: '' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.shop.official, true);
    assert.equal(r.data.shop.plan, 'official');
    const id = await publish(owner, mod, { category: 'services', city: 'Москва', title: 'Как разместить объявление', price: '' });
    assert.equal((await owner.put('/api/my/shop/pins', { id, pin: true })).status, 200, 'закрепить можно без «Магазин Про»');
    const pub = (await client(srv.base).get(`/api/users/${owner.user.id}`)).data;
    assert.equal(pub.user.shop.official, true);
    assert.equal(pub.user.shop.about, 'Официальный аккаунт Торганы');
    assert.deepEqual(pub.pinned.map((i) => i.id), [id]);
    assert.equal((await owner.get('/api/my/shop/stats?days=7')).status, 200, 'статистика магазина — тоже');
    // у обычного продавца без тарифа — как раньше
    assert.equal((await seller.put('/api/my/shop', { about: 'x' })).status, 403);
    assert.equal((await client(srv.base).get(`/api/users/${seller.user.id}`)).data.user.shop, null);
  });
});

describe('«Для бизнеса» без переключателя', () => {
  // 1.61.0: «Для бизнеса» без переключателя «Бизнес-аккаунт».
  const assert = require('node:assert/strict');
  const { startServer, registerUser } = require('./helpers');

  let srv; let shop;
  before(async () => {
    srv = await startServer();
    shop = await registerUser(srv.base, { name: 'Магазин', email: 'shop@test.local' });
    await shop.post('/api/me/business', { name: 'ИП Смирнова А. А.', inn: '500100732259', ogrn: '304500116000157' }); // заявка на проверку
  });
  after(() => srv.stop());

  test('переключателя «Бизнес-аккаунт» больше нет: тариф и витрина — без него', async () => {
    assert.equal((await shop.put('/api/me/business-account', { on: true })).status, 404);
    const b = await shop.get('/api/my/business');
    assert.equal(b.status, 200);
    assert.equal(b.data.bizAccount, undefined);
    assert.equal(b.data.biz.status, 'pending');
  });
});

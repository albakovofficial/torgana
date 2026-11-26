'use strict';
// Объявления: VIN, «Хорошая цена».
const { test, describe } = require('node:test');

// 1.48.0: VIN, чёрный список, «Хорошая цена».
describe('VIN и «Хорошая цена»', () => {
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

  test('VIN: проверка, русские буквы, частичный показ и целиком — только вошедшим', async () => {
    assert.equal((await seller.post('/api/listings', { ...CAR, price: 900000, vin: 'XTA21900012345' })).status, 200, 'короче 17 — номер кузова, если похож');
    assert.match((await seller.post('/api/listings', { ...CAR, price: 900000, vin: 'XTA2190001234567!' })).data.error, /VIN/);
    const id = await publish(seller, admin, { ...CAR, price: 900000, vin: 'хта21900012345678' });
    const anon = await (await fetch(`${srv.base}/api/listings/${id}`)).json();
    assert.equal(anon.listing.title.replace(/\s/g, ' '), 'Kia Rio · 2017 · автомат', 'название — из характеристик');
    assert.equal(anon.listing.vin, '');
    assert.equal(anon.listing.vinMasked, 'XTA2•••••••••5678');
    assert.equal((await fetch(`${srv.base}/api/listings/${id}/vin`)).status, 401);
    assert.equal((await buyer.get(`/api/listings/${id}/vin`)).data.vin, 'XTA21900012345678');
    assert.equal((await seller.get(`/api/listings/${id}`)).data.listing.vin, 'XTA21900012345678', 'владелец видит целиком');
    const phone = await publish(seller, admin, { category: 'electronics', subcategory: 'phones', city: 'Москва', title: 'x', price: 1000, attrs: { brand: 'Apple', model: 'iPhone 13', memory: '128 ГБ' }, vin: 'XTA21900012345678' });
    assert.equal((await buyer.get(`/api/listings/${phone}`)).data.listing.vinMasked, '', 'VIN — только у машин');
  });

  test('«Хорошая цена»: та же модель и год, от 15% дешевле медианы, но не вдвое', async () => {
    const p = (price, extra = {}) => publish(seller, admin, { ...CAR, attrs: { ...CAR.attrs, model: 'Ceed', year: 2019, ...extra }, price });
    const cheap = await p(800000);
    const crazy = await p(300000);
    for (const x of [1000000, 1050000, 980000]) await p(x);
    const other = await p(700000, { year: 2012 }); // другой год — не сравниваем
    await new Promise((r) => setTimeout(r, 1500));
    const cards = (await buyer.get('/api/listings?sub=cars&limit=60')).data.items;
    const gp = (id) => cards.find((x) => x.id === id).goodPrice;
    assert.equal(gp(cheap), true);
    assert.equal(gp(crazy), false, 'слишком дёшево — не хвалим');
    assert.equal(gp(other), false);
    const m = (await buyer.get(`/api/listings/${cheap}`)).data.market;
    assert.equal(m.level, 'good');
    assert.equal(m.count, 4);
    assert.match(m.basis, /марка, модель и год/);
  });
});

'use strict';

// 1.60.1: название из характеристик для превью в приложении.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser } = require('./helpers');

let srv; let anna;
before(async () => {
  srv = await startServer();
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
});
after(() => srv.stop());

test('название из характеристик: как при сохранении, пусто там, где его не собирают', async () => {
  const car = await anna.post('/api/listings/title', { subcategory: 'cars', attrs: { brand: 'Toyota', model: 'Camry', year: 2018, gearbox: 'Автомат' } });
  assert.equal(car.status, 200);
  assert.equal(car.data.title.replace(/ /g, ' '), 'Toyota Camry · 2018 · автомат');
  const part = await anna.post('/api/listings/title', { subcategory: 'cars', attrs: { brand: 'Toyota' } });
  assert.equal(part.data.title, '', 'главного ещё нет — пусто');
  const pots = await anna.post('/api/listings/title', { subcategory: 'kitchen', attrs: {} });
  assert.equal(pots.data.title, '', 'в посуде название пишут сами');
});

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

test('модель машины — только из списка марки; у «Другой» марки — свой текст', () => {
  const { cleanAttrs, publicTaxonomy } = require('../lib/taxonomy');
  const base = { year: 2018, mileage: 90000, gearbox: 'Автомат' };
  assert.equal(cleanAttrs('cars', { brand: 'Skoda', model: 'octavia' }).model, 'Octavia', 'написание — из списка');
  assert.throws(() => cleanAttrs('cars', { ...base, brand: 'Skoda', model: 'Бугатти' }, { strict: true }), /выберите из списка моделей Skoda/);
  assert.equal(cleanAttrs('cars', { brand: 'Skoda', model: 'Бугатти' }).model, undefined, 'в фильтре неверную пропускаем');
  assert.equal(cleanAttrs('cars', { ...base, brand: 'Другая', model: 'Bugatti Chiron' }, { strict: true }).model, 'Bugatti Chiron');
  const f = publicTaxonomy().transport.find((x) => x.id === 'cars').fields.find((x) => x.key === 'model');
  assert.equal(f.fixed, true);
  assert.ok(f.suggest.Skoda.includes('Kodiaq') && f.suggest.Skoda.length > 8, 'приложению и сайту — полный список');
  const phone = publicTaxonomy().electronics.find((x) => x.id === 'phones').fields.find((x) => x.key === 'model');
  assert.equal(phone.fixed, false, 'у телефонов модель пока свободная');
});

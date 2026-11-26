'use strict';
// 1.48.0: название из характеристик — один код на сервере (lib/taxonomy.js) и в браузере (app.js).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { autoTitle, TITLE_SUBS, cleanAttrs, summaryOf } = require('../lib/taxonomy');

const app = fs.readFileSync(path.join(__dirname, '../public/assets/app.js'), 'utf8');
const lib = fs.readFileSync(path.join(__dirname, '../lib/taxonomy.js'), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i); assert.ok(i >= 0 && j > i, `нет ${a}`); return s.slice(i, j + b.length); };
// Код из app.js — отдельно от остального файла.
const client = new Function(`${between(app, '// <auto-title>', '// </auto-title>')}\nreturn { autoTitle, TITLE_SUBS };`)();
const words = (s) => new Function(`return ${s.match(/const CARD_WORDS = (\{[\s\S]*?\n {0,2}\});/)[1]}`)();

const sp = (s) => s.replace(/\s/g, ' ');
const CASES = [
  ['cars', { brand: 'Toyota', model: 'Camry', year: 2018, mileage: 86500, gearbox: 'Автомат', engine: 2.5, fuel: 'Бензин' }, 'Toyota Camry · 2018 · автомат'],
  ['cars', { brand: 'Lada', model: 'Lada Granta', year: 2020, mileage: 5000, gearbox: 'Механика', engine: 1.6 }, 'Lada Granta · 2020 · механика'],
  ['cars', { brand: 'Другая', model: 'Москвич 3', year: 2024 }, 'Москвич 3 · 2024'],
  ['cars', { brand: 'Kia', year: 2019 }, ''],
  ['moto', { motoType: 'Мотоцикл', model: 'Honda CB400', year: 2015, mileage: 12000 }, 'Honda CB400 · 2015'],
  ['moto', { motoType: 'Квадроцикл', model: 'CFMoto CForce 600', year: 2021 }, 'Квадроцикл CFMoto CForce 600 · 2021'],
  ['phones', { brand: 'Apple', model: 'iPhone 13', memory: '128 ГБ' }, 'iPhone 13 · 128 ГБ'],
  ['phones', { brand: 'Samsung', model: 'Galaxy S24', memory: '256 ГБ' }, 'Samsung Galaxy S24 · 256 ГБ'],
  ['flats', { rooms: '2', area: 54.5, floor: 5, floors: 9 }, 'Квартира · 2 комнаты · 54,5 м²'],
  ['flats', { rooms: '1', area: 38 }, 'Квартира · 1 комната · 38 м²'],
  ['flats', { rooms: 'Студия', area: 28, floor: 3 }, 'Квартира-студия · 28 м²'],
  ['flats_rent', { rooms: '5+', area: 140 }, 'Квартира · 5 и больше комнат · 140 м²'],
  ['daily', { rooms: '1', guests: 21 }, 'Квартира · 1 комната · до 21 гостя'],
  ['daily', { rooms: '3', guests: 6 }, 'Квартира · 3 комнаты · до 6 гостей'],
  ['rooms', { area: 18, floor: 2, floors: 5 }, 'Комната · 18 м²'],
  ['houses', { houseType: 'Дом', area: 120, land: 6 }, 'Дом · 120 м² · 6 соток'],
  ['houses', { houseType: 'Дача', area: 40, land: 6.5 }, 'Дача · 40 м² · 6,5 сотки'],
  ['houses', { houseType: 'Таунхаус', area: 95 }, 'Таунхаус · 95 м²'],
  ['land', { land: 21, landUse: 'ИЖС' }, 'Участок · 21 сотка · ИЖС'],
  ['land', { land: 10, landUse: 'Сельхозназначение' }, 'Участок · 10 соток · сельхозназначение'],
  ['garages', { garageType: 'Машиноместо', area: 14 }, 'Машиноместо · 14 м²'],
  ['commercial', { commType: 'Общепит', area: 80 }, 'Помещение под общепит · 80 м²'],
  ['laptops', { brand: 'Apple' }, '']
];

test('название из характеристик: свой стиль Торганы — части через «·», полными словами, без сокращений', () => {
  for (const [sub, a, want] of CASES) {
    const t = sp(autoTitle(sub, a));
    assert.equal(t, want, `${sub} ${JSON.stringify(a)}`);
    assert.doesNotMatch(t, /\d-к\.|\bэт\.|\bсот\.|\b(AT|MT|AMT|CVT)\b/, 'без сокращений как на Авито');
  }
});

test('в браузере — тот же код: те же названия и те же слова в карточке', () => {
  assert.deepEqual([...client.TITLE_SUBS], [...TITLE_SUBS]);
  for (const [sub, a] of CASES) assert.equal(client.autoTitle(sub, a), autoTitle(sub, a), sub);
  assert.deepEqual(words(app), words(lib));
});

test('модель: без ссылок, лишних пробелов и с заглавной буквы', () => {
  assert.equal(cleanAttrs('cars', { model: '  camry   v70 ' }).model, 'Camry v70');
  assert.equal(cleanAttrs('phones', { model: 'iPhone 15' }).model, 'iPhone 15');
  assert.throws(() => cleanAttrs('cars', { model: 'site.ru' }), /без ссылок/);
  assert.equal(cleanAttrs('cars', { model: '<b>X5</b>' }).model, 'X5');
  assert.equal(sp(summaryOf('cars', { engine: 2.5, mileage: 86500, body: 'Седан', fuel: 'Дизель' })), '2,5 л, 86 500 км, седан', 'в карточке — то, чего нет в названии');
  assert.equal(summaryOf('flats', { floor: 5, floors: 9, market: 'Вторичка' }), '5 этаж из 9, вторичка');
  assert.equal(summaryOf('houses', { floors: 2, built: 2005 }), '2 этажа, 2005 г.');
});

describe('название из характеристик через API', () => {
  // 1.60.1: название из характеристик для превью в приложении.
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
});

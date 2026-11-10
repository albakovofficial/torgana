'use strict';
// 1.48.0: название из характеристик — один код на сервере (lib/taxonomy.js) и в браузере (app.js).
const test = require('node:test');
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
  ['cars', { brand: 'Toyota', model: 'Camry', year: 2018, mileage: 86500, gearbox: 'Автомат', engine: 2.5, fuel: 'Бензин' }, 'Toyota Camry 2.5 AT, 2018, 86 500 км'],
  ['cars', { brand: 'Lada', model: 'Lada Granta', year: 2020, mileage: 5000, gearbox: 'Механика', engine: 1.6 }, 'Lada Granta 1.6 MT, 2020, 5000 км'],
  ['cars', { brand: 'Tesla', model: 'Model 3', year: 2021, mileage: 0, gearbox: 'Автомат', engine: 1, fuel: 'Электро' }, 'Tesla Model 3 AT, 2021'],
  ['cars', { brand: 'Другая', model: 'Москвич 3', year: 2024, mileage: 10, gearbox: 'Вариатор' }, 'Москвич 3 CVT, 2024, 10 км'],
  ['cars', { brand: 'Kia', year: 2019 }, ''],
  ['moto', { motoType: 'Мотоцикл', model: 'Honda CB400', year: 2015, mileage: 12000 }, 'Honda CB400, 2015, 12 000 км'],
  ['moto', { motoType: 'Квадроцикл', model: 'CFMoto CForce 600', year: 2021 }, 'Квадроцикл CFMoto CForce 600, 2021'],
  ['phones', { brand: 'Apple', model: 'iPhone 13', memory: '128 ГБ' }, 'iPhone 13, 128 ГБ'],
  ['phones', { brand: 'Samsung', model: 'Galaxy S24', memory: '256 ГБ' }, 'Samsung Galaxy S24, 256 ГБ'],
  ['flats', { rooms: '2', area: 54.5, floor: 5, floors: 9 }, '2-к. квартира, 54,5 м², 5/9 эт.'],
  ['flats', { rooms: 'Студия', area: 28, floor: 3 }, 'Квартира-студия, 28 м², 3 эт.'],
  ['flats_rent', { rooms: '5+', area: 140 }, 'Многокомнатная квартира, 140 м²'],
  ['daily', { rooms: '1', guests: 21 }, '1-к. квартира, до 21 гостя'],
  ['daily', { rooms: '3', guests: 6 }, '3-к. квартира, до 6 гостей'],
  ['rooms', { area: 18, floor: 2, floors: 5 }, 'Комната 18 м², 2/5 эт.'],
  ['houses', { houseType: 'Дом', area: 120, land: 6 }, 'Дом 120 м² на участке 6 сот.'],
  ['houses', { houseType: 'Таунхаус', area: 95 }, 'Таунхаус 95 м²'],
  ['land', { land: 10, landUse: 'Сельхозназначение' }, 'Участок 10 сот. (сельхозназначения)'],
  ['garages', { garageType: 'Машиноместо', area: 14 }, 'Машиноместо, 14 м²'],
  ['commercial', { commType: 'Общепит', area: 80 }, 'Помещение общепита, 80 м²'],
  ['laptops', { brand: 'Apple' }, '']
];

test('название из характеристик: только главное, как на Авито', () => {
  for (const [sub, a, want] of CASES) assert.equal(sp(autoTitle(sub, a)), want, `${sub} ${JSON.stringify(a)}`);
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
  assert.equal(summaryOf('cars', { body: 'Седан', fuel: 'Дизель', drive: 'Полный' }), 'Седан, дизель, полный привод');
  assert.equal(summaryOf('houses', { floors: 2, built: 2005 }), '2 этажа, 2005 г.');
});

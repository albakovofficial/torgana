'use strict';
// 1.48.0: названия уже размещённых объявлений — один раз меняются на собранные из характеристик (при запуске).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, registerUser, publish, client } = require('./helpers');
const { retitle } = require('../lib/taxonomy');

const sp = (s) => String(s).replace(/\s/g, ' ');

test('модель из старого названия и новое название', () => {
  const r = (sub, attrs, title) => { const x = retitle(sub, attrs, title); return x ? sp(x.title) : null; };
  assert.equal(r('cars', { brand: 'Kia', year: 2015, gearbox: 'Автомат' }, 'Kia Rio, 2015, отличное состояние'), 'Kia Rio · 2015 · автомат');
  assert.equal(r('cars', { brand: 'Land Rover', year: 2017 }, 'Land Rover Discovery Sport 2017'), 'Land Rover Discovery Sport · 2017');
  assert.equal(r('phones', { brand: 'Apple', memory: '256 ГБ' }, 'Iphone 12 Pro Max 256'), 'iPhone 12 Pro Max · 256 ГБ');
  assert.equal(r('phones', { brand: 'Samsung', memory: '256 ГБ' }, 'Samsung Galaxy S23 Ultra 256 ГБ'), 'Samsung Galaxy S23 Ultra · 256 ГБ');
  assert.equal(r('cars', { brand: 'Lada', year: 2020 }, 'Продам машину'), null, 'модель не угадать — название прежнее');
  assert.equal(r('flats', { rooms: '2', area: 54 }, '2-комнатная квартира'), 'Квартира · 2 комнаты · 54 м²');
  assert.equal(r('flats', { rooms: '2' }, 'Квартира'), null, 'нет площади — не из чего собрать');
  assert.equal(r('laptops', { brand: 'Apple' }, 'MacBook'), null);
});

test('при запуске: старые названия меняются один раз, модель сохраняется, проверка и дата правки — прежние', async () => {
  const srv = await startServer();
  const admin = await registerUser(srv.base, { email: 'admin@test.local', name: 'Админ' });
  const seller = await registerUser(srv.base, { email: 's@test.ru', name: 'Олег' });
  const car = await publish(seller, admin, { title: 'x', category: 'transport', subcategory: 'cars', city: 'Москва', price: 900000, attrs: { brand: 'Kia', model: 'Rio', year: 2015, mileage: 90000, gearbox: 'Автомат' } });
  const odd = await publish(seller, admin, { title: 'x', category: 'transport', subcategory: 'cars', city: 'Москва', price: 500000, attrs: { brand: 'Lada', model: 'Granta', year: 2019, mileage: 50000, gearbox: 'Механика' } });
  const flat = await publish(seller, admin, { title: 'x', category: 'realty', subcategory: 'flats', city: 'Москва', price: 9000000, attrs: { rooms: '1', area: 38, floor: 2 } });
  // Как было до 1.48.0: своё название, модели нет; метки о пересчёте нет.
  const db = new DatabaseSync(path.join(srv.tmp, 'data', 'torgana.db'));
  const was = db.prepare('SELECT updated_at, status FROM listings WHERE id = ?').get(car);
  db.prepare("UPDATE listings SET title = 'Kia Rio, 2015, отличное состояние', attrs = json_remove(attrs, '$.model') WHERE id = ?").run(car);
  db.prepare("UPDATE listings SET title = 'Продам машину', attrs = json_remove(attrs, '$.model') WHERE id = ?").run(odd);
  db.prepare("UPDATE listings SET title = '1-комнатная квартира у метро' WHERE id = ?").run(flat);
  db.prepare("DELETE FROM settings WHERE key = 'titles_v148'").run();
  db.close();
  const again = await srv.restart();
  const c = client(again.base);
  const l = (id) => c.get(`/api/listings/${id}`).then((r) => r.data.listing);
  const k = await l(car);
  assert.equal(sp(k.title), 'Kia Rio · 2015 · автомат');
  assert.equal(k.attrs.model, 'Rio', 'модель сохранилась — при правке спрашивать не будем');
  assert.equal(k.status, was.status);
  assert.equal(k.updatedAt, was.updated_at, 'дата правки та же — не «обновлено»');
  assert.equal((await l(odd)).title, 'Продам машину', 'модель не угадать — прежнее название');
  assert.equal(sp((await l(flat)).title), 'Квартира · 1 комната · 38 м²');
  assert.ok((await c.get('/api/listings?q=rio')).data.items.some((x) => x.id === car), 'поиск по новому названию');
  await again.stop();
});

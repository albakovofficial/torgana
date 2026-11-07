'use strict';

// 1.16: подкатегории и характеристики, фильтры поиска, метро и район, видео в объявлении.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, publish } = require('./helpers');
const sp = (v) => (typeof v === 'string' ? v.replace(/\u00a0/g, ' ') : v);
const { probe } = require('../lib/video');
const { parse } = require('../lib/metro');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let srv; let admin; let seller; let buyer; let car; let flat;

// Минимальный MP4: ftyp, данные, moov/mvhd с длительностью (moov в конце — как у большинства телефонов).
function box(type, body) { const b = Buffer.alloc(8); b.writeUInt32BE(8 + body.length, 0); b.write(type, 4, 'latin1'); return Buffer.concat([b, body]); }
function mp4(seconds, pad = 2000) {
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
  return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2mp41', 'latin1')), box('mdat', Buffer.alloc(pad, 7)), box('moov', box('mvhd', mvhd))]);
}
async function upload(c, buf, { name = 'clip.mp4', type = 'video/mp4', chunk } = {}) {
  const s = await c.post('/api/videos', { name, type, size: buf.length, duration: 10 });
  if (s.status !== 200) return s;
  const step = chunk || s.data.chunk;
  let r;
  for (let off = 0; off < buf.length; off += step) {
    const res = await fetch(`${srv.base}/api/videos/${s.data.file}?offset=${off}`, { method: 'PUT', headers: { cookie: c.cookie, 'content-type': 'application/octet-stream' }, body: buf.subarray(off, off + step) });
    r = { status: res.status, data: await res.json() };
    if (r.status !== 200) return r;
  }
  return { ...r, file: s.data.file };
}

before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  seller = await registerUser(srv.base, { name: 'Олег', email: 'oleg@test.local' });
  buyer = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  car = await publish(seller, admin, { title: 'Toyota Camry', category: 'transport', subcategory: 'cars', city: 'Москва', price: 2100000, metro: 'Павелецкая', district: 'Замоскворечье',
    attrs: { brand: 'Toyota', year: 2018, mileage: '85 000', gearbox: 'Автомат', fuel: 'Бензин' } });
  await publish(seller, admin, { title: 'Lada Vesta', category: 'transport', subcategory: 'cars', city: 'Москва', price: 900000, attrs: { brand: 'Lada', year: 2021, mileage: 30000, gearbox: 'Механика' } });
  flat = await publish(seller, admin, { title: '2-комнатная квартира', category: 'realty', subcategory: 'flats', city: 'Казань', price: 7500000, metro: 'Кремлёвская', attrs: { rooms: '2', area: '54,5', floor: 5, floors: 9 } });
});
after(() => srv.stop());

test('справочник: подкатегории с полями в настройках, около пятидесяти', async () => {
  const { data } = await buyer.get('/api/config');
  const all = Object.values(data.subcategories).flat();
  assert.ok(all.length >= 50, `подкатегорий: ${all.length}`);
  const cars = data.subcategories.transport.find((s) => s.id === 'cars');
  assert.ok(cars.fields.find((f) => f.key === 'brand' && f.options.includes('Toyota')));
  assert.ok(cars.fields.find((f) => f.key === 'mileage' && f.type === 'number' && f.unit === 'км'));
  assert.deepEqual(data.metroCities.sort(), ['казань', 'москва', 'санкт-петербург']);
});

test('характеристики: в карточке короткая строка, на странице — список; числа приведены', async () => {
  const { data } = await buyer.get(`/api/listings/${car}`);
  assert.equal(data.listing.subcategory, 'cars');
  assert.equal(data.listing.attrs.mileage, 85000);
  assert.equal(sp(data.listing.specs.find((x) => x.label === 'Пробег').value), '85 000 км');
  assert.deepEqual(data.listing.metro, { name: 'Павелецкая', line: 'Замоскворецкая', color: '#0078BE' });
  assert.equal(data.listing.district, 'Замоскворечье');
  const list = await buyer.get('/api/listings?category=transport');
  const card = list.data.items.find((x) => x.id === car);
  assert.equal(sp(card.summary), '2018 г., 85 000 км, Автомат');
  assert.equal(card.metro, 'Павелецкая');
  const f = (await buyer.get(`/api/listings/${flat}`)).data.listing;
  assert.equal(f.attrs.area, 54.5);
});

test('характеристики проверяются: чужие поля отбрасываются, значения вне списка и пределов — ошибка', async () => {
  let r = await seller.post('/api/listings', { title: 'Машина', category: 'transport', subcategory: 'cars', city: 'Москва', attrs: { year: 1800 } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Год выпуска/);
  r = await seller.post('/api/listings', { title: 'Машина', category: 'transport', subcategory: 'cars', city: 'Москва', attrs: { gearbox: 'Телепорт' } });
  assert.equal(r.status, 400);
  // 1.22: главные характеристики обязательны в форме (марка, год, пробег, коробка у автомобиля).
  r = await seller.post('/api/listings', { title: 'Машина', category: 'transport', subcategory: 'cars', city: 'Москва', attrs: { brand: 'Kia', year: 2019, gearbox: 'Автомат' } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Укажите «Пробег»/);
  r = await seller.post('/api/listings', { title: 'Машина', category: 'transport', subcategory: 'cars', city: 'Москва', attrs: { brand: 'Kia', year: 2019, mileage: 1000, gearbox: 'Автомат', engine: '1,6', power: 123.4, color: 'Белый', owners: '1' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const k = (await seller.get(`/api/listings/${r.data.id}`)).data.listing;
  assert.equal(k.attrs.engine, 1.6, 'дробное — с шагом');
  assert.equal(k.attrs.power, 123, 'целое — округляется');
  assert.ok(k.specs.some((x) => x.label === 'Владельцев по ПТС' && x.value === '1'));
  r = await seller.post('/api/listings', { title: 'Машина', category: 'transport', subcategory: 'cars', city: 'Москва', attrs: { brand: 'Kia', year: 2019, mileage: 1000, gearbox: 'Автомат', color: 'Хамелеон' } });
  assert.equal(r.status, 400, 'цвет — только из списка');
  r = await seller.post('/api/listings', { title: 'Машина', category: 'transport', subcategory: 'phones', city: 'Москва', attrs: { brand: 'Apple' } });
  assert.equal(r.status, 200, 'подкатегория чужой категории просто не сохраняется');
  const l = (await seller.get(`/api/listings/${r.data.id}`)).data.listing;
  assert.equal(l.subcategory, '');
  assert.deepEqual(l.attrs, {});
});

test('поиск: подкатегория, характеристика из списка, диапазон чисел, метро; марка ищется словом', async () => {
  const ids = async (q) => (await buyer.get(`/api/listings?${q}`)).data.items.map((x) => x.title).sort();
  assert.deepEqual(await ids('sub=cars'), ['Lada Vesta', 'Toyota Camry']);
  assert.deepEqual(await ids('sub=cars&a_gearbox=Автомат'), ['Toyota Camry']);
  assert.deepEqual(await ids('sub=cars&a_year_min=2020'), ['Lada Vesta']);
  assert.deepEqual(await ids('sub=cars&a_mileage_max=50000'), ['Lada Vesta']);
  assert.deepEqual(await ids('sub=flats&a_rooms=2&a_area_min=50'), ['2-комнатная квартира']);
  assert.deepEqual(await ids('metro=Павелецкая'), ['Toyota Camry']);
  assert.deepEqual(await ids('q=тойота%20автомат'.replace('тойота', 'toyota')), ['Toyota Camry']);
  assert.deepEqual(await ids('sub=cars&a_gearbox=Неизвестно'), ['Lada Vesta', 'Toyota Camry'], 'значение не из списка не фильтрует');
  // 1.35: числа с пробелами и запятой — как их пишут люди («1 000 000», «50 000», «2,5»).
  const enc = (q) => q.split('&').map((x) => x.split('=').map(encodeURIComponent).join('=')).join('&');
  assert.deepEqual(await ids(enc('sub=cars&min=1 000 000')), ['Toyota Camry']);
  assert.deepEqual(await ids(enc('sub=cars&max=1\u00a0000\u00a0000')), ['Lada Vesta'], 'неразрывные пробелы тоже');
  assert.deepEqual(await ids(enc('sub=cars&a_mileage_max=50 000')), ['Lada Vesta']);
});

test('сохранённый поиск с характеристиками: приходит только подходящее объявление', async () => {
  const s = await buyer.post('/api/saved-searches', { sub: 'cars', a_gearbox: 'Автомат', a_year_min: '2015', a_bogus: 'x' });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.search.title, 'Автомобили · год выпуска от 2015 · Автомат');
  assert.deepEqual(Object.keys(s.data.search.params), ['sub', 'a_gearbox', 'a_year_min']);
  await publish(seller, admin, { title: 'Kia Rio механика', category: 'transport', subcategory: 'cars', city: 'Москва', attrs: { brand: 'Kia', mileage: 40000, gearbox: 'Механика', year: 2019 } });
  await publish(seller, admin, { title: 'Kia Rio автомат', category: 'transport', subcategory: 'cars', city: 'Москва', attrs: { brand: 'Kia', mileage: 40000, gearbox: 'Автомат', year: 2019 } });
  const list = (await buyer.get('/api/saved-searches')).data.items;
  const mine = list.find((x) => x.id === s.data.search.id);
  assert.equal(mine.fresh, 1);
});

test('метро: станции города из справочника, станция не из списка — ошибка, в городе без метро — не сохраняется', async () => {
  const st = (await buyer.get('/api/metro?city=Санкт-Петербург')).data.stations;
  assert.deepEqual(st.map((x) => x.name), ['Владимирская', 'Невский проспект', 'Площадь Восстания']);
  assert.equal(st[0].color, '#D6083B');
  assert.deepEqual((await buyer.get('/api/metro?city=Тула')).data.stations, []);
  let r = await seller.post('/api/listings', { title: 'Стол', category: 'home', city: 'Москва', metro: 'Выдуманная' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /станцию метро/);
  r = await seller.post('/api/listings', { title: 'Стол', category: 'home', city: 'Тула', metro: 'Павелецкая' });
  assert.equal(r.status, 200);
  assert.equal((await seller.get(`/api/listings/${r.data.id}`)).data.listing.metro, null);
});

test('справочник hh.ru: одна запись на станцию, цвет линии', () => {
  const out = parse([{ name: 'Москва', lines: [{ name: 'А', hex_color: 'FF0000', stations: [{ name: 'Б' }, { name: 'А' }] }, { name: 'В', hex_color: 'zz', stations: [{ name: 'Б' }] }] }]);
  assert.deepEqual(out['москва'], [{ name: 'А', line: 'А', color: '#FF0000' }, { name: 'Б', line: 'А', color: '#FF0000' }]);
});

test('видео: загрузка частями, проверка формата и длительности, показ с перемоткой, привязка к объявлению', async () => {
  const clip = mp4(12, 30000);
  const up = await upload(seller, clip, { chunk: 10000 });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(up.data.ready, true);
  assert.equal(Math.round(up.data.duration), 12);
  // Нельзя опубликовать чужое видео: просто не прикрепится.
  const other = await buyer.post('/api/listings', { title: 'Чужое видео', category: 'home', city: 'Москва', video: up.file });
  assert.equal(other.status, 400, 'чужой файл не найден');
  const r = await seller.post('/api/listings', { title: 'Велосипед с видео', category: 'hobby', subcategory: 'bikes', city: 'Москва', attrs: { bikeType: 'Горный' }, video: up.file });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const l = (await seller.get(`/api/listings/${r.data.id}`)).data.listing;
  assert.equal(l.video, `/uploads/${up.file}`);
  const adm = (await admin.get(`/api/admin/listings/${r.data.id}`)).data.listing;
  assert.equal(adm.video, l.video, 'модератор видит видео');
  assert.deepEqual(adm.specs, [{ key: 'bikeType', label: 'Тип', value: 'Горный' }]);
  // Range: браузер просит кусок.
  const part = await fetch(`${srv.base}${l.video}`, { headers: { range: 'bytes=0-99' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-99/${clip.length}`);
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  const whole = await fetch(`${srv.base}${l.video}`);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  // Убрали видео при правке — файл удалён.
  const cur = (await seller.get(`/api/listings/${r.data.id}`)).data.listing;
  const e = await seller.patch(`/api/listings/${r.data.id}`, { title: cur.title, category: 'hobby', city: 'Москва', video: '' });
  assert.equal(e.status, 200);
  assert.equal((await seller.get(`/api/listings/${r.data.id}`)).data.listing.video, null);
  assert.equal((await fetch(`${srv.base}${l.video}`)).status, 404);
});

test('видео: длиннее минуты, не видео, больше 100 МБ, не тот формат — понятные ошибки', async () => {
  let r = await upload(seller, mp4(75));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /длиннее минуты/);
  r = await upload(seller, Buffer.alloc(5000, 1));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /не похож на видео/);
  r = await seller.post('/api/videos', { name: 'big.mp4', type: 'video/mp4', size: 101 * 1024 * 1024 });
  assert.equal(r.status, 413);
  r = await seller.post('/api/videos', { name: 'clip.avi', type: 'video/x-msvideo', size: 5000 });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /MP4 или MOV/);
  // Незаконченная загрузка не публикуется.
  const s = await seller.post('/api/videos', { name: 'a.mov', type: 'video/quicktime', size: 9000 });
  r = await seller.post('/api/listings', { title: 'Рано', category: 'home', city: 'Москва', video: s.data.file });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /загружается/);
  // Часть с неправильного места не портит файл — сервер говорит, сколько уже принято.
  const wrong = await fetch(`${srv.base}/api/videos/${s.data.file}?offset=500`, { method: 'PUT', headers: { cookie: seller.cookie }, body: Buffer.alloc(100) });
  assert.deepEqual(await wrong.json(), { received: 0, ready: false });
});

test('длительность MOV с 64-битным заголовком mvhd', () => {
  const mvhd = Buffer.alloc(120); mvhd[0] = 1; mvhd.writeUInt32BE(600, 20); mvhd.writeBigUInt64BE(600n * 45n, 24);
  const buf = Buffer.concat([box('ftyp', Buffer.from('qt  \0\0\0\0qt  ', 'latin1')), box('moov', box('mvhd', mvhd)), box('mdat', Buffer.alloc(100))]);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-')), 'a.mov');
  fs.writeFileSync(f, buf);
  assert.deepEqual(probe(f), { ok: true, brand: 'qt  ', duration: 45 });
});

test('старые объявления без подкатегории работают как раньше', async () => {
  const id = await publish(seller, admin, { title: 'Старый стул', category: 'home', city: 'Москва', price: 500 });
  const l = (await buyer.get(`/api/listings/${id}`)).data.listing;
  assert.equal(l.subcategory, '');
  assert.deepEqual(l.specs, []);
  assert.equal(l.video, null);
  const card = (await buyer.get('/api/listings?category=home')).data.items.find((x) => x.id === id);
  assert.equal(card.summary, '');
  assert.equal(card.hasVideo, false);
});

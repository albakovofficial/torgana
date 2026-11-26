'use strict';

// Размещение объявления в настоящем браузере (Chromium через Playwright): фото и видео, раздел и характеристики,
// название из характеристик, VIN, черновик, правка, ошибки без обязательных полей. Запуск: npm run test:ui.
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, registerUser } = require('./helpers');

const PHOTO = path.join(__dirname, 'fixtures/photo.jpg');
const PHOTO2 = path.join(__dirname, 'fixtures/photo2.jpg');
// Видео из нужных коробок MP4: длительность сервер берёт из mvhd.
function box(type, body) { const b = Buffer.alloc(8); b.writeUInt32BE(8 + body.length, 0); b.write(type, 4, 'latin1'); return Buffer.concat([b, body]); }
function mp4(seconds) {
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
  return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2mp41', 'latin1')), box('mdat', Buffer.alloc(3000, 7)), box('moov', box('mvhd', mvhd))]);
}

let srv; let browser; let seller;
before(async () => {
  assert.ok(fs.existsSync(PHOTO) && fs.existsSync(PHOTO2), 'нет tests/fixtures/photo*.jpg');
  srv = await startServer({});
  await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  seller = await registerUser(srv.base, { name: 'Олег', email: 'oleg@test.local' });
  browser = await chromium.launch();
});
after(async () => { await browser.close(); await srv.stop(); });

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const [k, v] = seller.cookie.split('=');
  await ctx.addCookies([{ name: k, value: v, url: srv.base }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('tg_cookie', 'all'); } catch { /* нет хранилища */ } });
  await ctx.route((u) => !u.href.startsWith(srv.base), (r) => r.fulfill({ status: 200, body: '' }));
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  return p;
}
// На телефоне шаги листают кнопки нижней панели: «Далее» и «На проверку»/«Сохранить».
const next = (p) => p.click('#dock-next');
const send = (p) => p.click('#dock-send');
const listing = async (id) => (await seller.get(`/api/listings/${id}`)).data.listing;
const idFromUrl = (p) => Number(/\/l\/(\d+)/.exec(p.url())[1]);

test('новое объявление: два фото и видео, раздел, цена, город, описание — уходит на проверку', async () => {
  const p = await page();
  await p.goto(`${srv.base}/new`);
  await p.setInputFiles('#file', [PHOTO, PHOTO2]);
  await p.waitForFunction(() => document.querySelectorAll('#photos img').length >= 2);
  await p.setInputFiles('#vfile', { name: 'clip.mp4', mimeType: 'video/mp4', buffer: mp4(5) });
  await p.waitForFunction(() => !document.querySelector('#video-slot .ed-video.uploading, #photos .ed-video.uploading'), null, { timeout: 15000 });
  await next(p);
  await p.fill('#title', 'Собрание сочинений Чехова');
  await p.click('[data-cat="hobby"]');
  await p.click('[data-sub="books"]');
  await p.fill('#price', '3500');
  await p.fill('#city', 'Казань');
  await p.press('#city', 'Escape');
  await p.fill('#desc', 'Двенадцать томов, издание 1985 года, все в хорошем состоянии.');
  await next(p);
  await send(p);
  await p.waitForURL(/\/l\/\d+/);
  const l = await listing(idFromUrl(p));
  assert.equal(l.title, 'Собрание сочинений Чехова');
  assert.equal(l.price, 3500);
  assert.equal(l.category, 'hobby');
  assert.equal(l.subcategory, 'books');
  assert.equal(l.city, 'Казань');
  assert.equal(l.status, 'pending');
  assert.equal(l.photos.length, 2);
  assert.ok(l.video, 'видео прикрепилось');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('машина: характеристики, название собирается само, VIN', async () => {
  const p = await page();
  await p.goto(`${srv.base}/new`);
  await p.setInputFiles('#file', PHOTO);
  await p.waitForFunction(() => document.querySelectorAll('#photos img').length >= 1);
  await next(p);
  await p.click('[data-cat="transport"]');
  await p.click('[data-sub="cars"]');
  await p.click('[data-field="brand"] [data-av="Kia"]');
  await p.fill('#at-model', 'Rio');
  await p.fill('#at-year', '2017');
  await p.fill('#at-mileage', '90000');
  await p.click('[data-field="gearbox"] [data-av="Автомат"]');
  await p.waitForFunction(() => /Kia Rio/.test(document.querySelector('#auto-title').textContent));
  await p.fill('#price', '950000');
  await p.fill('#city', 'Москва');
  await p.press('#city', 'Escape');
  await p.click('#ed-more > summary');
  await p.fill('#vin', 'хта 2190001234567 8'); // русская раскладка и пробелы — поле само приводит к виду VIN
  await next(p);
  await send(p);
  await p.waitForURL(/\/l\/\d+/);
  const l = await listing(idFromUrl(p));
  assert.equal(l.title, 'Kia Rio · 2017 · автомат');
  assert.equal(l.attrs.mileage, 90000);
  assert.equal(l.vin, 'XTA21900012345678');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('без раздела и названия дальше не пускает и показывает, что заполнить', async () => {
  const p = await page();
  await p.goto(`${srv.base}/new`);
  await p.setInputFiles('#file', PHOTO);
  await p.waitForFunction(() => document.querySelectorAll('#photos img').length >= 1);
  await next(p);
  await next(p); // на шаге «Что и сколько» ничего не выбрано
  await assert.doesNotReject(p.locator('#s-what .ed-err:not([hidden])').waitFor({ timeout: 3000 }));
  assert.match(await p.textContent('#s-what .ed-err'), /\S/);
  await p.context().close();
});

test('черновик: после перезагрузки страница возвращает введённое; «Сбросить» — чистая форма', async () => {
  const p = await page();
  await p.goto(`${srv.base}/new`);
  await p.setInputFiles('#file', PHOTO);
  await p.waitForFunction(() => document.querySelectorAll('#photos img').length >= 1);
  await next(p);
  await p.fill('#title', 'Гитара Yamaha F310');
  await p.waitForFunction(() => { try { return /Yamaha/.test(localStorage.getItem('tg_draft') || ''); } catch { return false; } }, null, { timeout: 5000 });
  await p.reload();
  await p.waitForSelector('#draft-drop');
  assert.equal(await p.inputValue('#title'), 'Гитара Yamaha F310');
  await p.click('#draft-drop');
  await p.waitForFunction(() => !document.querySelector('#draft-drop') && !document.querySelector('#title').value);
  await p.context().close();
});

test('правка: поля заполнены, новая цена сохраняется, объявление снова на проверке', async () => {
  const id = (await seller.post('/api/listings', { title: 'Велосипед Stels Navigator', category: 'hobby', subcategory: 'bikes', attrs: { bikeType: 'Горный' }, city: 'Казань', price: '15000', description: 'Почти новый' })).data.id;
  const p = await page();
  await p.goto(`${srv.base}/edit/${id}`);
  await p.locator('#dock-next').waitFor();
  await next(p);
  assert.equal(await p.inputValue('#title'), 'Велосипед Stels Navigator');
  await p.fill('#price', '13000');
  await send(p);
  await p.waitForURL(new RegExp(`/l/${id}`));
  const l = await listing(id);
  assert.equal(l.price, 13000);
  assert.equal(l.status, 'pending');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

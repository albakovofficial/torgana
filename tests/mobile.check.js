'use strict';

// Проверка вёрстки в браузере: телефон (375 px) и компьютер (1280 px).
// Для каждой страницы: нет ошибок JS, нет горизонтальной прокрутки, нижнее меню — только на телефоне.
// Скриншоты сохраняются в tests/screenshots.
// Запуск: npm run test:ui   (нужен Playwright с Chromium)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { startServer, registerUser, client, fakeS3 } = require('./helpers');

const SHOTS = path.join(__dirname, 'screenshots');
// UI_WIDTHS=320,390,768,1440 — проверить на других ширинах (до 430 — телефон, до 1024 — планшет, шире — компьютер).
const VIEWPORTS = process.env.UI_WIDTHS
  ? Object.fromEntries(process.env.UI_WIDTHS.split(',').map(Number).map((w) => [`w${w}`, w <= 430
    ? { kind: 'mobile', viewport: { width: w, height: 812 }, isMobile: true, hasTouch: true }
    : { kind: w <= 1024 ? 'tablet' : 'desktop', viewport: { width: w, height: w <= 1024 ? 1024 : 900 }, hasTouch: w <= 1024 }]))
  : {
    mobile: { kind: 'mobile', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    desktop: { kind: 'desktop', viewport: { width: 1280, height: 860 } }
  };

// Заглушка API Яндекс Карт для проверки: тот же интерфейс, что использует рамка (Map, ObjectManager), без сети.
const YMAPS_STUB = `window.ymaps = {
  ready: (cb) => cb(),
  Map: function (id) { this.geoObjects = { add() {} }; this.setBounds = () => Promise.resolve(); this.getZoom = () => 12; this.setZoom = () => {}; this.setCenter = () => {};
    document.getElementById(id).style.cssText += ';overflow:auto;padding:12px;box-sizing:border-box;background:#e9eee9'; },
  ObjectManager: function () {
    const box = () => document.getElementById('map'); const opt = { set() {} };
    this.objects = { options: opt }; this.clusters = { options: opt };
    this.removeAll = () => { box().innerHTML = ''; };
    this.add = (fc) => { for (const f of fc.features) { const d = document.createElement('div'); d.style.cssText = 'background:#fff;border-radius:14px;padding:10px;margin:0 0 10px;box-shadow:0 2px 10px rgba(0,0,0,.1)'; d.innerHTML = f.properties.balloonContentBody; box().appendChild(d); } };
    this.getBounds = () => [[55, 37], [56, 38]];
  }
};
setTimeout(() => window.__mapReady && window.__mapReady(), 0);`;

async function seed(base, browser, srv) {
  const seller = await registerUser(base, { name: 'Анна Смирнова', email: 'anna@test.local' });
  const buyer = await registerUser(base, { name: 'Борис', email: 'boris@test.local' });
  const admin = await registerUser(base, { name: 'Модератор', email: 'admin@test.local' });
  // Настоящие JPEG разных цветов — рисуем в браузере, чтобы не держать картинки в репозитории.
  const page = await browser.newPage();
  const colors = ['#C9D6CF', '#E3D5C6', '#CFD3DE', '#DCCFD9', '#D6DCC4', '#C8D9DD'];
  const photos = [];
  let photoData = '';
  for (const c of colors) {
    const data = await page.evaluate((color) => {
      const cv = document.createElement('canvas'); cv.width = 800; cv.height = 800;
      const x = cv.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 800, 800);
      x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.arc(400, 420, 220, 0, Math.PI * 2); x.fill();
      return cv.toDataURL('image/jpeg', 0.8);
    }, c);
    photos.push((await seller.post('/api/uploads', { data })).data.file);
    photoData = photoData || data;
  }
  await page.close();
  const items = [
    ['Детская коляска Cybex Priam 2 в 1', 'personal', '34500', 'Казань', true],
    ['iPhone 15 Pro, 256 ГБ, титановый', 'electronics', '89900', 'Москва', true],
    ['Аренда двухкомнатной квартиры у метро с очень длинным названием объявления', 'realty', '45000', 'Санкт-Петербург', false],
    ['Велосипед горный Merida', 'hobby', '', 'Екатеринбург', false],
    ['Диван угловой, почти новый', 'home', '18000', 'Новосибирск', true],
    ['Ремонт квартир под ключ', 'services', '', 'Казань', false]
  ];
  // 1.16: раздел, характеристики, метро и район.
  const extra = [
    { subcategory: 'kids', attrs: { kidsGoods: 'Коляска', kidsAge: '0–1 год' } },
    { subcategory: 'phones', attrs: { brand: 'Apple', model: 'iPhone 15 Pro', memory: '256 ГБ' }, metro: 'Тверская' },
    { subcategory: 'flats_rent', attrs: { rooms: '2', area: 54, floor: 5, floors: 9, renovation: 'Евро', furnished: 'Есть' }, metro: 'Площадь Восстания', district: 'Центральный' },
    { subcategory: 'bikes', attrs: { bikeType: 'Горный' } },
    { subcategory: 'furniture', attrs: { furnType: 'Диван', material: 'Ткань', color: 'Серый' } },
    { subcategory: 'repair', attrs: { where: 'Выезд к клиенту', proExp: '3–10 лет' } }
  ];
  const ids = [];
  for (let i = 0; i < items.length; i++) {
    const [title, category, price, city, delivery] = items[i];
    const r = await seller.post('/api/listings', {
      ...extra[i],
      title, category, price, city, delivery, condition: '', priceUnit: category === 'realty' ? 'мес' : '',
      description: 'Хорошее состояние. Подробности в чате.\nВторая строка описания.', photos: i === 0 ? photos : [photos[i]]
    });
    ids.push(r.data.id);
    await admin.post(`/api/admin/listings/${r.data.id}/restore`);
  }
  // Автомобиль с видео (минимальный MP4 — для вёрстки достаточно).
  const box = (type, body) => { const b = Buffer.alloc(8); b.writeUInt32BE(8 + body.length, 0); b.write(type, 4, 'latin1'); return Buffer.concat([b, body]); };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(42000, 16);
  const clip = Buffer.concat([box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2mp41', 'latin1')), box('mdat', Buffer.alloc(4000, 7)), box('moov', box('mvhd', mvhd))]);
  const vs = await seller.post('/api/videos', { name: 'camry.mp4', type: 'video/mp4', size: clip.length });
  await fetch(`${base}/api/videos/${vs.data.file}?offset=0`, { method: 'PUT', headers: { cookie: seller.cookie }, body: clip });
  const carPhotos = [(await seller.post('/api/uploads', { data: photoData })).data.file, (await seller.post('/api/uploads', { data: photoData })).data.file];
  const car = (await seller.post('/api/listings', { title: 'Toyota Camry 2.5, один владелец', category: 'transport', subcategory: 'cars', price: '2350000', city: 'Москва', metro: 'Павелецкая', district: 'Замоскворечье',
    attrs: { brand: 'Toyota', model: 'Camry', year: 2018, mileage: 86500, gearbox: 'Автомат', fuel: 'Бензин', engine: 2.5, power: 181, body: 'Седан', drive: 'Передний', owners: '1', color: 'Белый', damage: 'Не битый' }, photos: carPhotos, video: vs.data.file,
    description: 'Обслуживание у официального дилера, два комплекта резины.' })).data.id;
  await admin.post(`/api/admin/listings/${car}/restore`); // подписчик (Борис) получит «Новое у продавца»
  const conv = await buyer.post('/api/conversations', { listingId: ids[0] });
  await buyer.post(`/api/conversations/${conv.data.id}/messages`, { body: 'Здравствуйте! Коляска ещё продаётся?' });
  await seller.post(`/api/conversations/${conv.data.id}/messages`, { body: 'Да, можно посмотреть сегодня вечером.' });
  // 1.17: торг в чате — первое предложение отклонено, второе ждёт ответа; подписка на продавца.
  const of1 = await buyer.post(`/api/conversations/${conv.data.id}/offer`, { price: 29000 });
  await seller.post(`/api/offers/${of1.data.message.offerId}/decline`);
  await buyer.post(`/api/conversations/${conv.data.id}/offer`, { price: 31500 });
  await buyer.post(`/api/users/${seller.user.id}/follow`, { follow: true });
  // 1.18: копия в поддельное хранилище S3 и её проверка — для страницы «Копии и безопасность».
  const s3 = await fakeS3();
  await admin.put('/api/admin/backup', { endpoint: s3.endpoint, region: 'ru-1', bucket: s3.bucket, accessKey: s3.access, secretKey: s3.secret, prefix: 'torgana' });
  await admin.post('/api/admin/backup/run');
  for (let i = 0; i < 50 && !((await admin.get('/api/admin/backup')).data.last); i++) await new Promise((r) => setTimeout(r, 100));
  await admin.post('/api/admin/backup/verify');
  // статистика: несколько разных «гостей» видели и открыли объявление
  const ua = (i) => `Mozilla/5.0 (Linux; Android 14; Pixel ${i}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36`;
  for (let i = 0; i < 6; i++) {
    const g = client(base);
    const h = { origin: base, 'user-agent': ua(i) };
    await g.post('/api/stats/impressions', { ids: [ids[1], ids[0]] }, h);
    if (i < 4) await g.post('/api/stats/view', { id: ids[1], src: ['search', 'home', 'search', 'external'][i] }, h);
  }
  await buyer.post(`/api/favorites/${ids[1]}`, {}, { origin: base, 'user-agent': ua(9) });
  await admin.post(`/api/admin/listings/${ids[5]}/reject`, { reason: 'Контакты в тексте объявления' });
  const pending = (await seller.post('/api/listings', { title: 'Травматический пистолет', category: 'hobby', city: 'Казань', price: '9000' })).data.id;
  await buyer.post('/api/support/messages', { body: 'Здравствуйте! Почему моё объявление на проверке?' });
  const thread = (await admin.get('/api/admin/support')).data.items[0].id;
  await admin.post(`/api/admin/support/${thread}/messages`, { body: 'Все объявления проверяются перед публикацией — обычно несколько часов.' });
  await buyer.post(`/api/listings/${ids[1]}/report`, { reason: 'Мошенничество', text: 'Просит предоплату' });
  const critic = await registerUser(base, { name: 'Сергей', email: 'sergey@test.local' });
  const c2 = (await critic.post('/api/conversations', { listingId: ids[3] })).data.id;
  await critic.post(`/api/conversations/${c2}/messages`, { body: 'Велосипед ещё продаётся?' });
  await seller.post(`/api/conversations/${c2}/messages`, { body: 'Да.' });
  const c3 = (await buyer.post('/api/conversations', { listingId: ids[4] })).data.id;
  await buyer.post(`/api/conversations/${c3}/messages`, { body: 'Добрый день! Можно забрать завтра?' });
  await seller.post(`/api/conversations/${c3}/messages`, { body: 'Да, после обеда.' });
  // 1.46: «Сделка состоялась?» появляется после трёх сообщений с каждой стороны
  for (let i = 0; i < 2; i++) { await buyer.post(`/api/conversations/${c3}/messages`, { body: 'Хорошо, а во сколько?' }); await seller.post(`/api/conversations/${c3}/messages`, { body: 'В два часа подойдёт' }); }
  // 1.10: сохранённые поиски, снижение цены, фото в чате
  const phone = (await seller.get(`/api/listings/${ids[1]}`)).data.listing;
  await seller.patch(`/api/listings/${ids[1]}`, { title: phone.title, description: phone.description, category: phone.category, city: phone.city, price: 79900, delivery: true, photos: [photos[1]] });
  await admin.post(`/api/admin/listings/${ids[1]}/restore`);
  await buyer.post(`/api/conversations/${conv.data.id}/messages`, { photo: (await buyer.post('/api/uploads', { data: photoData })).data.file, body: 'Вот такую ищу' });
  // 1.11: вход через сервисы включён, заявка бизнеса на проверке
  await admin.put('/api/admin/oauth', { yandex: { id: 'ya-app', secret: 'ya-secret' }, vk: { id: '5551' } });
  await seller.post('/api/me/business', { name: 'ИП Смирнова А. А.', inn: '500100732259', ogrn: '304500116000157' });
  // модерация: объявление с контактами в тексте (автопроверка) и заблокированный пользователь
  await buyer.post('/api/listings', { title: 'Велосипед детский', description: 'Звоните +7 900 123-45-67 или пишите в WhatsApp', category: 'hobby', city: 'Москва', price: '4000' });
  const spam = await registerUser(base, { name: 'Иван Спамов', email: 'spam@test.local' });
  await admin.post(`/api/admin/users/${spam.user.id}/block`, { blocked: true, reason: 'Спам и повторные объявления' });

  // 1.12: магазин с тарифом «Магазин Про», витрина, продвижение (запускается сразу после оплаты), платежи (поддельная ЮKassa).
  await admin.put('/api/admin/seo', { yandex: 'a1b2c3d4e5f60718', metrika: '98765432' });
  await admin.put('/api/admin/billing', { config: { shopId: '123456', secret: 'test_AbCdEfGhIjKlMnOp', receipts: true, vat: 1, mode: 'full_payment' } });
  const shop = await registerUser(base, { name: 'Ольга Детство', email: 'shop@test.local' });
  await shop.post('/api/me/business', { name: 'ООО «Детство»', inn: '7707083893', ogrn: '1027700132195' });
  await admin.post(`/api/admin/users/${shop.user.id}/business`, { decision: 'approve' });
  // 1.45: галочка — у правообладателя товарного знака (магазин), заявка на проверке — у Анны.
  const tmUntil = new Date(Date.now() + 5 * 365 * 86400000).toISOString().slice(0, 10);
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64')}`;
  for (const c of [shop, seller]) for (const kind of ['cert', 'letter']) await c.post('/api/me/verify-docs', { kind, name: kind === 'cert' ? 'svidetelstvo.pdf' : 'pismo.pdf', data: pdf });
  await shop.post('/api/me/trademark', { number: '912345', name: 'Детство', until: tmUntil });
  await admin.post(`/api/admin/users/${shop.user.id}/trademark`, { decision: 'approve', checks: { registry: true, owner: true, cert: true, letter: true } });
  await seller.post('/api/me/trademark', { number: '845210', name: 'Смирнова Home', until: tmUntil });
  const pay = async (r) => { const id = r.data.url.split('/').pop(); ykPay.get(id).status = 'succeeded'; ykPay.get(id).payment_method = { type: 'bank_card' }; await client(base).post('/api/pay/yookassa', { object: { id } }); return r.data.id; };
  const planPay = await pay(await shop.post('/api/my/plan/pay', { plan: 'pro', months: 3 }));
  const pg = await browser.newPage();
  const coverData = await pg.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 530;
    const x = cv.getContext('2d'); const g = x.createLinearGradient(0, 0, 1600, 530); g.addColorStop(0, '#DCE9E2'); g.addColorStop(1, '#F1E6D8'); x.fillStyle = g; x.fillRect(0, 0, 1600, 530);
    x.fillStyle = 'rgba(61,103,208,.18)'; for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(160 + i * 220, 265 + (i % 2 ? 60 : -60), 120, 0, Math.PI * 2); x.fill(); }
    return cv.toDataURL('image/jpeg', 0.85);
  });
  await pg.close();
  const cover = (await shop.post('/api/uploads', { data: coverData })).data.file;
  await shop.put('/api/my/shop', { cover, about: 'Детские коляски, автокресла и игрушки. Проверяем каждый товар перед продажей, даём гарантию 14 дней.', hours: 'Пн–Сб 10:00–20:00', address: 'Казань, ул. Баумана, 15', site: 'detstvo-shop.ru', delivery: 'Самовывоз и доставка по Казани' });
  const s1 = (await shop.post('/api/listings', { title: 'Самокат детский трёхколёсный', category: 'personal', city: 'Казань', price: '3900', photos: [(await shop.post('/api/uploads', { data: photoData })).data.file] })).data.id;
  await admin.post(`/api/admin/listings/${s1}/restore`);
  const s2 = (await shop.post('/api/listings', { title: 'Автокресло Britax Römer', category: 'personal', city: 'Казань', price: '18900' })).data.id;
  await admin.post(`/api/admin/listings/${s2}/restore`);
  // 1.49.0: разделы витрины и закреплённые («Магазин Про»).
  const s4 = (await shop.post('/api/listings', { title: 'Коляска', category: 'personal', subcategory: 'kids', attrs: { kidsGoods: 'Коляска', kidsAge: '0–1 год' }, city: 'Казань', price: '34500', photos: [(await shop.post('/api/uploads', { data: photoData })).data.file] })).data.id;
  await admin.post(`/api/admin/listings/${s4}/restore`);
  const s5 = (await shop.post('/api/listings', { title: 'Велосипед горный', category: 'hobby', subcategory: 'bikes', attrs: { bikeType: 'Горный' }, city: 'Казань', price: '21000', photos: [(await shop.post('/api/uploads', { data: photoData })).data.file] })).data.id;
  await admin.post(`/api/admin/listings/${s5}/restore`);
  for (const id of [s4, s1]) await shop.put('/api/my/shop/pins', { id, pin: true });
  await pay(await shop.post(`/api/listings/${s1}/promote`, { days: 7 }));
  await pay(await shop.post(`/api/listings/${s2}/promote`, { days: 30 }));
  const pendingPay = (await shop.post('/api/my/plan/pay', { plan: 'pro', months: 12 })).data.id;
  // 1.45: бесплатный старт первым бизнес-аккаунтам — 0 ₽ и зачёркнутая цена на странице «Для бизнеса».
  await admin.put('/api/admin/starter', { on: true, days: 90, limit: 100 });
  for (let i = 0; i < 3; i++) await client(base).post('/api/stats/impressions', { ids: [s1, s2] }, { origin: base, 'user-agent': ua(20 + i) });
  await client(base).post('/api/stats/view', { id: s1, src: 'ad' }, { origin: base, 'user-agent': ua(20) });
  // 1.20: проверенное объявление ждёт выбранного времени; обмен — у дивана.
  const scheduled = (await seller.post('/api/listings', { title: 'Палатка двухместная', category: 'hobby', city: 'Казань', price: '6500', exchange: true, publishAt: Date.now() + 26 * 3600 * 1000 })).data.id;
  await admin.post(`/api/admin/listings/${scheduled}/restore`);
  const sofa = (await seller.get(`/api/listings/${ids[4]}`)).data.listing;
  await seller.patch(`/api/listings/${ids[4]}`, { ...sofa, photos: sofa.photos.map((u) => u.split('/').pop()), subcategory: sofa.subcategory, metro: '', video: '', exchange: true, bargain: false });
  await admin.post(`/api/admin/listings/${ids[4]}/restore`);
  // 1.21: продвижение в ленте — XL с рамкой и метками у автомобиля, рамка у коляски, метки у iPhone (видны сразу, 1.40).
  const boostPay = await pay(await seller.post(`/api/listings/${car}/boost`, { xl: true, frame: true, tags: ['Отдам сегодня', 'Как новый'] }));
  await pay(await seller.post(`/api/listings/${ids[0]}/boost`, { frame: true }));
  await pay(await seller.post(`/api/listings/${ids[1]}/boost`, { tags: ['Есть гарантия', 'С чеком'] }));
  await admin.put('/api/admin/seo', { mapsKey: 'test-maps-key' }); // 1.38: карта объявлений включается ключом
  // 1.43: продавец отвечает — 5 покупателей написали про автомобиль, на все ответы (плитки «Отвечает за час»).
  // Регистраций с одного адреса — не больше 10 за 10 минут: трое уже есть, двое новых.
  const askers = [buyer, critic, shop];
  for (let i = 0; i < 2; i++) askers.push(await registerUser(base, { name: `Покупатель ${i + 1}`, email: `buyer${i + 1}@test.local` }));
  let wowConv = 0;
  for (const b of askers) {
    const c = (await b.post('/api/conversations', { listingId: car })).data.id;
    await b.post(`/api/conversations/${c}/messages`, { body: 'Здравствуйте! Машина ещё продаётся?' });
    await seller.post(`/api/conversations/${c}/messages`, { body: 'Да, приезжайте посмотреть' });
    // 1.46: пять подтверждённых сделок — уровень «Надёжный», комплименты
    for (let i = 0; i < 2; i++) { await b.post(`/api/conversations/${c}/messages`, { body: 'Договорились' }); await seller.post(`/api/conversations/${c}/messages`, { body: 'Жду' }); }
    await b.post(`/api/conversations/${c}/deal`, { answer: 'yes' });
    await seller.post(`/api/conversations/${c}/deal`, { answer: 'yes' });
    // 1.47.2: у последнего — без комплиментов: на его экране «Сделка состоялась» кнопка «Отметить, что понравилось»
    if (b === shop) wowConv = c; else await b.post(`/api/conversations/${c}/praise`, { tags: ['Всё как на фото', 'Быстро отвечает'] });
  }
  // 1.46: жалоба по сделке — в модерации «Репутация»
  await critic.post(`/api/conversations/${c2}/issue`, { reason: 'Не пришёл на встречу', text: 'Ждал у метро полчаса' });
  // 1.42: продавец удалил объявление — переписка покупателя остаётся с пометкой «Объявление удалено».
  const scooter = (await seller.post('/api/listings', { title: 'Самокат Xiaomi Pro 2', category: 'hobby', city: 'Москва', price: '18000' })).data.id;
  await admin.post(`/api/admin/listings/${scooter}/restore`);
  const convGone = (await buyer.post('/api/conversations', { listingId: scooter })).data.id;
  await buyer.post(`/api/conversations/${convGone}/messages`, { body: 'Добрый день! Самокат ещё продаёте?' });
  await seller.post(`/api/conversations/${convGone}/messages`, { body: 'Уже продал, извините' });
  await seller.del(`/api/listings/${scooter}`);
  // 1.39: временно удалённый профиль — после входа экран «Восстановить»; второй — для карточки в модерации.
  const gone = await registerUser(base, { name: 'Глеб', email: 'gleb@test.local' });
  await gone.post('/api/me/deactivate');
  const gone2 = client(base);
  await gone2.post('/api/auth/login', { email: 'gleb@test.local', password: 'password123' });
  gone2.user = gone.user;
  return { s3, seller, buyer, admin, ids, car, pending, thread, conv: conv.data.id, convReview: c3, wowConv, shop, s1, planPay, pendingPay, scheduled, boostPay, gone: gone2, convGone };
}

function pages(d) {
  return [
    ['home', '/', null],
    ['search', `/search?q=${encodeURIComponent('коляска до 50 000 с доставкой')}`, null],
    ['category', '/search?category=electronics', null],
    ['listing', `/l/${d.ids[0]}`, null],
    ['listing-reply', `/l/${d.car}`, null], // 1.43: как быстро отвечает продавец
    ['search-typo', `/search?q=${encodeURIComponent('айфн')}`, null], // 1.43: исправленный запрос
    ['listing-guest-long', `/l/${d.ids[2]}`, null],
    ['user', `/u/${d.seller.user.id}`, null],
    ['login', '/login', null],
    ['register', '/register', null],
    ['help-page', '/page/help', null, 'hub'], // 1.63.0: «Помощь и безопасность» — плитки тем, частые вопросы
    ['search-help', '/page/search', null],
    ['sell-page', '/page/sell', null],
    ['deals-page', '/page/deals', null],
    ['safety-page', '/page/safety', null],
    ['support-page', '/page/support', null],
    ['rules', '/page/rules', null, 'doc'], // 1.62.0: документы — шапка, «коротко о главном», разделы с номерами, запрещённое плитками
    ['terms', '/page/terms', null],
    ['privacy', '/page/privacy', null],
    ['consent', '/page/consent', null],
    ['not-found', '/nope', null],
    ['new', '/new', d.seller],
    ['edit', `/edit/${d.ids[0]}`, d.seller],
    ['new-errors', '/new', d.buyer, 'submit'],
    ['confirm', '/confirm', null],
    ['category-city', '/c/personal/kazan', null],
    ['category', '/c/personal', null],
    ['section-sub', '/c/transport/cars', null],
    // 1.38: объявления на карте — рамка-песочница, точки сообщением, клик открывает объявление
    ['search-map', '/search?view=map', null, 'map'],
    ['search-city', '/search?category=transport', null, 'city'],
    ['search-filters', '/search?category=transport&sub=cars', null, 'filters'],
    ['section-sub-city', '/c/transport/cars/moskva', null],
    // 1.38.1: капсула категории на главной переключает ленту на месте
    ['home-cat', '/', null, 'cat'],
    ['cookie', '/', null],
    ['admin-seo', '/admin?status=seo', d.admin],
    ['confirm-code', '/confirm', null, 'code'],
    ['profile', '/profile', d.seller],
    ['profile-shop', '/profile', d.shop], // 1.46: карточка профиля с тарифом
    ['profile-listings', '/profile/listings', d.seller],
    ['profile-rejected', '/profile/listings?status=rejected', d.seller],
    ['settings', '/profile/settings', d.seller],
    ['reputation', '/profile/reputation', d.seller], // 1.46: репутация
    ['reputation-old-link', '/profile/reviews', d.seller], // 1.47.2: старая ссылка ведёт на репутацию
    ['user-rep', `/u/${d.seller.user.id}?tab=rep`, null],
    ['chat-deal', `/messages/${d.convReview}`, d.buyer],
    ['chat-deal-wow', `/messages/${d.wowConv}`, d.shop], // 1.47.2: экран «Сделка состоялась»
    ['admin-rep', '/admin?status=rep', d.admin],
    ['search-trusted', '/search?trusted=1', null],
    ['stats', `/profile/stats/${d.ids[1]}`, d.seller],
    ['stats-week', `/profile/stats/${d.ids[1]}?days=7`, d.seller],
    ['settings-old-link', '/profile?tab=settings', d.seller],
    ['profile-empty', '/profile', d.buyer, 'lockcov'], // 1.63.0: без тарифа обложки нет, строка «с тарифом «Магазин»»; ни города, ни «на Торгане с»
    ['favorites', '/favorites', d.buyer],
    ['messages', '/messages', d.buyer],
    ['chat', `/messages/${d.conv}`, d.buyer],
    ['chat-rep', `/messages/${d.conv}`, d.buyer, 'rep'],
    ['help-app', '/page/help', null, 'taps'],
    ['chat-deleted', `/messages/${d.convGone}`, d.buyer],
    // 1.38: быстрые вопросы покупателя — нажал, и вопрос ушёл продавцу
    ['chat-ask', `/messages/${d.conv}`, d.buyer, 'ask'],
    ['admin', '/admin', d.admin],
    ['admin-mail', '/admin?status=mail', d.admin],
    ['admin-site', '/admin?status=site', d.admin],
    ['admin-users', '/admin?status=users', d.admin],
    ['admin-biz', '/admin?status=biz', d.admin],
    ['admin-oauth', '/admin?status=oauth', d.admin],
    ['admin-ai', '/admin?status=ai', d.admin],
    ['admin-sources', '/admin?status=sources', d.admin],
    ['admin-user', `/admin/u/${d.seller.user.id}`, d.admin],
    // 1.45: «Реклама» в модерации — подарки, идущее, бесплатный старт и цены
    ['admin-ads', `/admin?status=ads&u=${d.seller.user.id}`, d.admin],
    ['admin-ads-plans', '/admin?status=ads&t=plans', d.admin],
    ['admin-gift-boost', `/admin?status=ads&u=${d.seller.user.id}`, d.admin, '[data-gift-boost]'], // 1.44: подарить продвижение
    ['admin-gift-promo', `/admin?status=ads&u=${d.seller.user.id}`, d.admin, '[data-gift-promo]'],
    // 1.39: удаление профиля — экран восстановления и карточка временно удалённого в модерации
    ['account-gone', '/profile', d.gone],
    ['admin-user-gone', `/admin/u/${d.gone.user.id}`, d.admin],
    ['admin-log', '/admin?status=log', d.admin],
    ['admin-notify', '/admin?status=notify', d.admin],
    ['admin-notify-texts', '/admin?status=notify#texts', d.admin, 'push-texts'], // 1.66.0: тексты push — открытый редактор
    ['admin-settings', '/admin?status=settings', d.admin], // 1.47.2: настройки — плитками
    ['admin-listings-sold', '/admin?status=sold', d.admin], // 1.47.2: статусы объявлений — вкладками
    ['admin-home', '/admin', d.admin, 'adm-home'], // 1.62.0: телефон — разделы списком; компьютер — очередь: список и объявление рядом
    ['admin-pending', '/admin?status=pending', d.admin],
    ['admin-check', `/admin/l/${d.pending}`, d.admin],
    ['admin-reports', '/admin?status=reports', d.admin],
    ['admin-support', `/admin?status=support&t=${d.thread}`, d.admin],
    ['support-chat', '/messages/support', d.buyer],
    ['support-new', '/messages/support', d.seller],
    ['contacts', '/page/contacts', null],
    ['listing-pending', `/l/${d.pending}`, d.seller],
    ['forgot', '/forgot', null],
    ['reset-expired', `/reset?token=${'0'.repeat(64)}`, null],
    ['unsubscribe', `/unsubscribe?t=${'0'.repeat(32)}&k=messages`, null],
    // Панель ≡ (четвёртый элемент — открыть меню перед снимком).
    ['menu', '/', d.seller, 'menu'],
    ['menu-admin', '/profile/settings', d.admin, 'menu'],
    ['menu-guest', '/', null, 'menu'],
    // 1.12: для бизнеса, оплата, продвижение, реклама
    ['business', '/business', null],
    ['business-pro', '/business?m=12', d.shop],
    ['business-nobiz', '/business', d.buyer],
    ['business-free', '/business', d.seller],
    ['settings-brand', '/profile/settings#s-biz', d.seller], // 1.45: заявка на товарный знак на проверке
    ['admin-user-brand', `/admin/u/${d.seller.user.id}`, d.admin],
    ['settings-brand-new', '/profile/settings#s-biz', d.shop], // галочка выдана // 1.45: бизнес-аккаунт включён, бесплатный старт доступен
    ['biz-hub', '/profile/business', d.shop],
    ['biz-hub-empty', '/profile/business', d.buyer],
    ['biz-shop', '/profile/business/shop', d.shop],
    ['biz-shop-locked', '/profile/business/shop', d.buyer],
    ['biz-stats', '/profile/business/stats', d.shop],
    ['pay-ok', `/pay/${d.planPay}`, d.shop],
    ['pay-wait', `/pay/${d.pendingPay}`, d.shop],
    ['storefront', `/u/${d.shop.user.id}`, null],
    ['official', `/u/${d.admin.user.id}`, null], // 1.50.0: официальный аккаунт Торганы (владелец)
    ['official-profile', '/profile', d.admin],
    ['search-ad', `/search?q=${encodeURIComponent('самокат')}`, null],
    ['listing-promo', `/l/${d.s1}`, d.shop],
    ['promote-modal', `/l/${d.s1}`, d.shop, '[data-promote]'],
    ['ad-info', `/search?q=${encodeURIComponent('самокат')}`, null, '[data-ad-info]'],
    ['my-listings-promo', '/profile', d.shop],
    ['admin-payments', '/admin?status=payments', d.admin],
    ['admin-billing', '/admin?status=billing', d.admin],
    ['admin-user-shop', `/admin/u/${d.shop.user.id}`, d.admin],
    // 1.16: разделы, характеристики, метро, видео
    ['listing-car', `/l/${d.car}`, null],
    ['listing-car-video', `/l/${d.car}`, null, '#gvbtn'],
    ['search-transport', '/search?category=transport', null],
    ['search-cars-filters', `/search?category=transport&sub=cars&a_gearbox=${encodeURIComponent('Автомат')}&a_year_min=2015&city=${encodeURIComponent('Москва')}&metro=${encodeURIComponent('Павелецкая')}`, null],
    ['edit-car', `/edit/${d.car}`, d.seller],
    ['edit-flat', `/edit/${d.ids[2]}`, d.seller],
    ['admin-check-car', `/admin/l/${d.car}`, d.admin],
    // 1.17: торг, быстрые ответы, подписки
    ['chat-offer-seller', `/messages/${d.conv}`, d.seller],
    ['chat-offer-modal', `/messages/${d.conv}`, d.buyer, '[data-make-offer]'],
    ['chat-replies-modal', `/messages/${d.conv}`, d.seller, '[data-qr-edit]'],
    ['listing-offer-modal', `/l/${d.car}`, d.buyer, '[data-offer]'],
    ['user-follow', `/u/${d.seller.user.id}`, d.buyer],
    ['profile-following', '/profile/following', d.buyer],
    ['profile-following-empty', '/profile/following', d.seller],
    ['unsubscribe-follow', `/unsubscribe?t=${'0'.repeat(32)}&k=follow-1`, null],
    // 1.18: копии и безопасность
    ['admin-backup', '/admin?status=backup', d.admin],
    // 1.19: настройки по разделам, публичный профиль с карточкой сверху
    ['settings-profile', '/profile/settings#sf', d.seller],
    ['settings-notify', '/profile/settings#sn', d.seller],
    ['settings-login', '/profile/settings#sp', d.seller],
    ['settings-biz', '/profile/settings#s-biz', d.buyer],
    ['settings-biz-ok', '/profile/settings#s-biz', d.shop],
    ['settings-account', '/profile/settings#s-acc', d.seller],
    ['settings-city', '/profile/settings#s-city', d.buyer],
    ['user-own', `/u/${d.seller.user.id}`, d.seller],
    // 1.20: подача по шагам, торг и обмен, публикация в выбранное время
    ['new-step-price', '/new', d.seller, 'step:1'],
    ['new-step-publish', '/new', d.seller, 'step:2'],
    ['edit-step-publish', `/edit/${d.ids[0]}`, d.seller, 'step:2'],
    ['my-scheduled', '/profile?status=scheduled', d.seller],
    ['listing-scheduled', `/l/${d.scheduled}`, d.seller],
    ['search-exchange', '/search?exchange=1', null],
    // 1.21: продвижение в ленте — XL, рамка, метки; выбор при подаче и «Продвинуть»; 1.40: всё уже куплено — одна карточка
    ['boost-modal', `/l/${d.ids[3]}`, d.seller, '[data-promote]'],
    ['boost-modal-busy', `/l/${d.ids[0]}`, d.seller, '[data-promote]'],
    ['boost-modal-all', `/l/${d.car}`, d.seller, '[data-promote]'],
    ['pay-boost', `/pay/${d.boostPay}`, d.seller],
    // 1.38.1: вернулся с ЮKassa во встроенном Safari без входа; у автора — «Продвигается» с остатком срока
    ['pay-boost-guest', `/pay/${d.boostPay}`, null],
    ['listing-boosted', `/l/${d.car}`, d.seller],
    ['new-step-publish-boost', '/new', d.seller, 'step:2:boost'],
    // 1.36: «Ещё по желанию» на шаге «Отправка» — метро, район, необязательные характеристики, видео
    ['edit-step-more', `/edit/${d.ids[2]}`, d.seller, 'step:2:more'],
    ['edit-step-review', `/edit/${d.ids[2]}`, d.seller, 'step:2'],
    // 1.22: характеристики чипсами, выбор из списка (метро, сортировка), карточка автора, уведомления
    ['edit-car-attrs', `/edit/${d.car}`, d.seller, 'step:1'],
    ['edit-sofa-attrs', `/edit/${d.ids[4]}`, d.seller, 'step:1'],
    ['pick-metro', `/edit/${d.ids[2]}`, d.seller, 'pick:1:#metro'],
    ['pick-brand', `/edit/${d.car}`, d.seller, 'pick:1:[data-field="brand"] [data-av-more]'],
    ['pick-sort', '/search?category=transport', null, 'pick::#sort'],
    ['listing-owner', `/l/${d.ids[0]}`, d.seller],
    ['listing-owner-car', `/l/${d.car}`, d.seller],
    ['notices', '/', d.seller, '[data-bell]'],
    ['notices-empty', '/', d.buyer, '[data-bell]'],
    // 1.23: фото на весь экран внутри Торганы
    ['photo-viewer', `/l/${d.ids[0]}`, null, '.g-img'],
    // 1.35.5: галерея листается свайпом — лента едет за пальцем
    ['gallery-swipe', `/l/${d.ids[0]}`, null, 'swipe'],
    // 1.36.1: в просмотре фото соседнее фото въезжает рядом, без затемнения
    ['photo-viewer-slide', `/l/${d.ids[0]}`, null, 'pv-slide']
  ];
}

// Поддельная ЮKassa: платёж создаётся «в ожидании», статус меняет seed.
const ykPay = new Map();
function startYookassa() {
  let n = 0;
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; }).on('end', () => {
      const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method === 'POST' && req.url === '/payments') {
        const j = JSON.parse(body); const id = `yk-${++n}`;
        ykPay.set(id, { id, status: 'pending', amount: j.amount, metadata: j.metadata, test: true, confirmation: { type: 'redirect', confirmation_url: `https://yoomoney.test/checkout/${id}` } });
        return send(ykPay.get(id));
      }
      const m = /^\/payments\/(.+)$/.exec(req.url);
      if (m && ykPay.has(m[1])) return send(ykPay.get(m[1]));
      res.writeHead(404); res.end('{}');
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

let seeded = null;
async function main() {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const yk = await startYookassa();
  const srv = await startServer({ YOOKASSA_TEST_BASE: `http://127.0.0.1:${yk.address().port}`, REP_FRESH_DAYS: '0' });
  const browser = await chromium.launch();
  const problems = [];
  let checked = 0;
  try {
    const d = await seed(srv.base, browser, srv);
    seeded = d;
    for (const [vpName, { kind, ...vp }] of Object.entries(VIEWPORTS)) {
      // UI_ONLY=home,boost-modal — проверить только эти страницы (быстрее при правке вёрстки).
      const only = process.env.UI_ONLY ? process.env.UI_ONLY.split(',') : null;
      for (const [name, url, who, open] of pages(d).filter(([n]) => !only || only.includes(n))) {
        const ctx = await browser.newContext({ ...vp, locale: 'ru-RU', ...(process.env.UI_SCHEME ? { colorScheme: process.env.UI_SCHEME } : {}) }); // UI_SCHEME=dark — тёмная тема (1.48.0)
        if (who) {
          const [k, v] = who.cookie.split('=');
          await ctx.addCookies([{ name: k, value: v, url: srv.base }]);
        }
        // Внешние ресурсы (шрифты и т. п.) в проверке не грузим — тест не должен зависеть от интернета.
        await ctx.route((u) => !u.href.startsWith(srv.base), (r) => r.fulfill({ status: 200, body: '' }));
        // Скрипт Яндекс Карт подменяем заглушкой: рисует точки простыми блоками с той же карточкой, что в балуне.
        await ctx.route(/api-maps\.yandex\.ru/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: YMAPS_STUB }));
        // Плашку cookie показываем только на своей странице проверки, на остальных — выбор уже сделан.
        if (name !== 'cookie') await ctx.addInitScript(() => { try { localStorage.setItem('tg_cookie', 'necessary'); } catch { /* нет */ } });
        // «…-app» — страница внутри приложения: мост TorganaApp и классы, которые ставит приложение (WebController.bootScript).
        if (name.endsWith('-app')) {
          await ctx.addInitScript(() => {
            window.TorganaApp = { post: () => {} };
            const mark = () => document.documentElement.classList.add('in-app', 'in-app-ios', 'in-app-native');
            if (document.documentElement) mark(); else document.addEventListener('DOMContentLoaded', mark);
          });
        }
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(`JS: ${e.message}`));
        // Несуществующая страница отдаёт 404 (1.35.1) — браузер пишет об этом в консоль, это не ошибка сайта.
        page.on('console', (m) => { if (m.type() === 'error' && !(name === 'not-found' && /status of 404/.test(m.text()))) errors.push(`console: ${m.text()}`); });
        page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
        const http4xx = [];
        page.on('response', (r) => { if (r.status() >= 400 && r.status() < 500 && r.url().startsWith(srv.base)) http4xx.push(`${r.status()} ${r.request().method()} ${r.url().replace(srv.base, '')}`); });
        await page.goto(srv.base + url, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !document.querySelector('#app > .loader'), null, { timeout: 5000 }).catch(() => errors.push('страница не загрузилась'));
        await page.waitForTimeout(150);
        if (open === 'menu') {
          await page.click('[data-menu]');
          await page.waitForTimeout(300);
          if (!(await page.$('.modal.drawer .pf-nav'))) errors.push('меню ≡ не открылось');
        } else if (open === 'code') {
          await page.evaluate(() => sessionStorage.setItem('tg_confirm', JSON.stringify({ email: 'new.user@test.local', next: '' })));
          await page.reload({ waitUntil: 'networkidle' });
          await page.keyboard.type('12');
          if ((await page.$$('.code-box')).length !== 6) errors.push('нет шести клеток для кода');
        } else if (open === 'submit') {
          // Пустая форма: «Далее» с фото на «Что продаёте», ещё раз «Далее» — шаг подсвечивается и не пускает дальше.
          for (let k = 0; k < 2; k++) { await page.click('[data-next] >> visible=true'); await page.waitForTimeout(300); }
          if (!(await page.$('.ed-step.cur.bad#s-what'))) errors.push('ошибки шага не подсветились');
        } else if (open && open.startsWith('pick:')) {
          // Красивый выбор вместо системного списка: pick:<шаг формы>:<select или кнопка>.
          const [, stepNo, sel] = open.match(/^pick:(\d*):(.*)$/);
          if (stepNo) { await page.click(`[data-step="${stepNo}"]`); await page.waitForTimeout(300); await page.evaluate(() => { const m = document.querySelector('#ed-more'); if (m) m.open = true; }); }
          await page.click(sel.startsWith('#') ? `${sel} + .pick-btn` : sel);
          await page.waitForTimeout(300);
          if (!(await page.$('.pick .pick-it'))) errors.push('список не открылся');
        } else if (open === 'city') {
          // Подсказки города — красивым списком (1.34), а не системным datalist; набор текста сужает список.
          // фильтры за кнопкой — до 900 px (телефон и планшет)
          { const t = await page.$('#filters-open'); if (t && await t.isVisible()) { await t.click(); await page.waitForTimeout(200); } }
          await page.click('#f-city');
          await page.waitForTimeout(200);
          if (!(await page.$('.city-sug .pick-it'))) errors.push('список городов не открылся');
          await page.screenshot({ path: path.join(SHOTS, `${vpName}-search-city-open.png`) });
          await page.fill('#f-city', 'Вор');
          await page.waitForTimeout(200);
          const first = await page.textContent('.city-sug .pick-it');
          if (!/Воронеж/.test(first || '')) errors.push(`первым должен быть Воронеж, а не «${first}»`);
        } else if (open === 'filters') {
          // 1.35: компьютер — выбор в фильтрах применяется сразу, без «Показать»; телефон — «Показать N» с числом и видна на экране.
          // 1.47.2: фильтры закрыты и на компьютере — открываются кнопкой «Фильтры» в строке под заголовком.
          const toggle = await page.$('#filters-open');
          if (vp.viewport.width > 900) { await toggle.click(); await page.waitForTimeout(200); }
          if (vp.viewport.width <= 900) {
            await toggle.click(); await page.waitForTimeout(200);
            await page.click('#f-extra [data-field="gearbox"] [data-av="Автомат"]');
            await page.waitForFunction(() => /\d/.test(document.querySelector('#f-show').textContent), null, { timeout: 5000 }).catch(() => {}); // число приходит с сервера
            const t = await page.textContent('#f-show');
            if (!/^Показать 1 объявление$/.test(t)) errors.push(`кнопка «Показать» без числа: «${t}»`);
            const r = await page.$eval('#f-show', (el) => el.getBoundingClientRect().bottom);
            if (r > vp.viewport.height) errors.push('кнопка «Показать» за краем экрана');
            await page.screenshot({ path: path.join(SHOTS, `${vpName}-search-filters-open.png`) });
            await page.click('#f-show'); await page.waitForTimeout(500);
          } else {
            await page.evaluate(() => window.scrollTo(0, 200));
            await page.click('#f-extra [data-field="gearbox"] [data-av="Автомат"]'); await page.waitForTimeout(700);
            if (await page.evaluate(() => window.scrollY) < 150) errors.push('после выбора фильтра страница прыгнула наверх');
            if (await page.$('#filters.collapsed')) errors.push('после выбора фильтра панель закрылась');
          }
          if (!/a_gearbox=/.test(page.url())) errors.push(`фильтр не применился: ${page.url()}`);
          const n = await page.textContent('#count');
          if (!/^1 объявление$/.test(n)) errors.push(`после фильтра «Автомат» должно быть 1 объявление, а не «${n}»`);
        } else if (open === 'lockcov') {
          if (await page.$('.pf-cover')) errors.push('у профиля без тарифа есть обложка');
          if (!(await page.$('.pf-lockcov'))) errors.push('нет строки «Обложка и витрина — с тарифом»');
          if (/на Торгане с/.test(await page.textContent('#app'))) errors.push('осталось «на Торгане с»');
        } else if (open === 'hub') {
          // 27.11: обложка с поиском, шесть тем 2×3, частые вопросы, поиск прячет лишнее.
          if ((await page.$$('.help-tiles .help-tile')).length !== 6) errors.push('в «Помощи» не 6 тем');
          if ((await page.$$('.help-faq details')).length < 5) errors.push('нет частых вопросов');
          if ((await page.$$('#app h1')).length !== 1) errors.push('в «Помощи» не один заголовок');
          await page.click('.help-faq summary'); await page.waitForTimeout(200);
          if (!(await page.isVisible('.help-faq details[open] p'))) errors.push('вопрос не раскрылся');
          await page.fill('[data-help-find]', 'мошенник');
          const vis = await page.$$eval('.help-tile', (a) => a.filter((x) => !x.hidden).map((x) => x.textContent));
          if (vis.length !== 1 || !/Безопасность/.test(vis[0])) errors.push(`поиск «мошенник» показал не одну «Безопасность»: ${vis.join(' | ')}`);
          await page.fill('[data-help-find]', 'ъъъ');
          if (!(await page.isVisible('.help-none'))) errors.push('поиск без результата не предложил поддержку');
          await page.fill('[data-help-find]', '');
          // Тупиков нет: каждая ссылка «Помощи» ведёт на настоящую страницу, а не на «не найдено».
          for (const href of await page.$$eval('.help a[href^="/"]', (a) => a.map((x) => x.getAttribute('href')))) {
            const p2 = await page.context().newPage(); await p2.goto(srv.base + href, { waitUntil: 'networkidle' });
            if (/Такой страницы нет|Страница не найдена/.test(await p2.textContent('#app'))) errors.push(`«Помощь» ведёт в тупик: ${href}`);
            if (href.startsWith('/page/') && (await p2.$$('#app h1')).length !== 1) errors.push(`${href}: заголовок не один`);
            if (await p2.$('.help-nav, .help-crumbs, .doc-crumbs')) errors.push(`${href}: остались меню-чипсы или «хлебные крошки»`);
            await p2.close();
          }
        } else if (open === 'doc') {
          if ((await page.$$('.doc-brief .doc-tile')).length !== 4) errors.push('в «Коротко о главном» не 4 плитки');
          if ((await page.$$('.doc-sec h2 .doc-n')).length < 5) errors.push('разделы правил без номеров');
          if ((await page.$$('.rules-list li .ban-t')).length < 10) errors.push('запрещённое не плитками с пояснением');
          if (!(await page.isVisible(vp.viewport.width <= 900 ? '.doc-toc-m' : '.doc-toc'))) errors.push('нет содержания');
        } else if (open === 'adm-home') {
          if (vp.viewport.width <= 900) {
            const n = (await page.$$('.adm-row')).length;
            if (n !== 13) errors.push(`на главном экране модерации не 13 разделов, а ${n}`);
          } else {
            if ((await page.$$('.adm-nav a')).length !== 13) errors.push(`в меню модерации не 13 пунктов, а ${(await page.$$('.adm-nav a')).length}`);
            if (!(await page.$('.adm-split .adm-q-row.on'))) errors.push('в очереди не выбрано объявление');
            if (!(await page.$('.adm-pane-bar [data-restore]'))) errors.push('справа нет кнопки «Опубликовать»');
          }
        } else if (open === 'step:2:more') {
          await page.click('[data-step="1"]');
          await page.waitForTimeout(300);
          await page.evaluate(() => { document.querySelector('#ed-more').open = true; });
          await page.waitForTimeout(200);
          if (!(await page.$('#ed-more #district'))) errors.push('нет «Дополнительно»');
          await page.$eval('#ed-more', (e) => e.scrollIntoView({ block: 'start' }));
          await page.waitForTimeout(300);
        } else if (open === 'step:2:boost') {
          // Продвижение при подаче: XL и метки, одна метка выбрана — цена на кнопке, превью с XL.
          await page.click('[data-step="2"]');
          await page.waitForTimeout(300);
          await page.click('#ed-boost summary'); // продвижение свёрнуто в одну строку
          await page.waitForTimeout(150);
          await page.click('.bp-opt:has([data-bk="xl"])');
          await page.click('.bp-opt:has([data-bk="tags"])');
          await page.click('[data-tag="Как новый"]');
          await page.waitForTimeout(200);
          if (!(await page.$('#preview .card.is-xl .b-tag'))) errors.push('превью без XL и метки');
          if (!/128 ₽/.test(await page.textContent('[data-submit] >> visible=true'))) errors.push('на кнопке нет цены продвижения');
        } else if (open === 'cat') {
          await page.click('.cat-pill[data-cat="transport"]');
          await page.waitForTimeout(700);
          if (!/\/\?cat=transport$/.test(page.url())) errors.push(`адрес не сменился: ${page.url()}`);
          if (!/Транспорт/.test(await page.textContent('.cat-pill.on'))) errors.push('капсула не переключилась');
          if (!/^Транспорт/.test(await page.textContent('#feed-h'))) errors.push('заголовок ленты не сменился');
          if ((await page.$$('#feed .card')).length !== 1) errors.push(`в ленте не только транспорт: ${(await page.$$('#feed .card')).length}`);
          await page.click('.cat-pill[data-cat=""]');
          await page.waitForTimeout(700);
          if ((await page.$$('#feed .card')).length < 3) errors.push('«Все» не вернули ленту');
          await page.click('.cat-pill[data-cat="transport"]');
          await page.waitForTimeout(600);
        } else if (open === 'map') {
          await page.waitForSelector('.map-state.hidden', { state: 'attached', timeout: 5000 }).catch(() => errors.push('карта не сообщила, что готова'));
          const fr = page.frames().find((f) => f.url().includes('/map-frame'));
          const n = fr ? await fr.$$eval('.mc[data-id]', (x) => x.length).catch(() => 0) : 0;
          if (n < 2) errors.push(`на карте ${n} точек`);
          if (!/на карте/.test(await page.textContent('#count'))) errors.push('нет счётчика «на карте»');
          if (!(await page.$('.view-sw a.on[href*="view=map"]'))) errors.push('переключатель «Карта» не выбран');
          if (await page.$('.results-head .pick-btn:not([hidden])')) errors.push('сортировка видна на карте');
          if (fr && await fr.evaluate(() => { try { return !!window.parent.document; } catch { return false; } })) errors.push('рамка видит страницу сайта');
          await page.screenshot({ path: path.join(SHOTS, `${vpName}-search-map-open.png`) });
          if (fr && n) { await fr.click('.mc[data-id] >> nth=0'); await page.waitForURL(/\/l\/\d+/, { timeout: 3000 }).catch(() => errors.push('клик по точке не открыл объявление')); }
        } else if (open === 'ask') {
          const n0 = await page.$$eval('.msg.out', (x) => x.length);
          await page.click('.chat-asks .chip >> nth=0');
          await page.waitForTimeout(300);
          if (!/актуально/.test(await page.inputValue('#chat-body'))) errors.push('быстрый вопрос не попал в поле');
          if (await page.$('.chat-asks')) errors.push('остальные вопросы не убрались');
          if ((await page.$$eval('.msg.out', (x) => x.length)) !== n0) errors.push('вопрос ушёл без отправки');
        } else if (open === 'pv-slide') {
          await page.click('.g-img');
          await page.waitForTimeout(300);
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(150);
          const mid = await page.evaluate(() => { const g = document.querySelector('.pv-gwrap'); const im = document.querySelector('.pv-stage > .pv-img'); return { ghost: g && getComputedStyle(g).visibility, op: im && getComputedStyle(im).opacity }; });
          if (mid.ghost !== 'visible' || mid.op !== '1') errors.push(`листание с затемнением: ${JSON.stringify(mid)}`);
          await page.waitForTimeout(500);
          if (!/^2 из/.test(await page.textContent('.pv-count'))) errors.push('просмотр не перелистнул фото');
        } else if (open === 'swipe') {
          const n = await page.$$eval('.g-slide', (x) => x.length);
          if (n > 1) {
            await page.evaluate(async () => {
              const g = document.querySelector('#gallery'); const r = g.getBoundingClientRect(); const y = r.top + r.height / 2;
              const tp = (x) => new Touch({ identifier: 1, target: g, clientX: x, clientY: y });
              g.dispatchEvent(new TouchEvent('touchstart', { touches: [tp(r.right - 40)], changedTouches: [tp(r.right - 40)], bubbles: true }));
              for (let k = 1; k <= 6; k++) { g.dispatchEvent(new TouchEvent('touchmove', { touches: [tp(r.right - 40 - k * 30)], changedTouches: [tp(r.right - 40 - k * 30)], bubbles: true })); await new Promise((res) => setTimeout(res, 16)); }
              g.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [tp(r.right - 220)], bubbles: true }));
            });
            await page.waitForTimeout(600);
            if (!/^2 из/.test(await page.textContent('#gcount'))) errors.push('свайп не перелистнул фото');
          }
        } else if (/^step:\d$/.test(open || '')) {
          await page.click(`[data-step="${open.slice(5)}"]`);
          await page.waitForTimeout(400);
          if (!(await page.$(`.ed-step.cur`))) errors.push('шаг не открылся');
        } else if (open === 'taps') {
          // 27.11 (видео владельца: в приложении нажатие на тему не открывало её): касаниями по плиткам — тема открывается,
          // заголовок обложки (его берёт приложение) меняется, «Другие темы» ведут дальше.
          for (const [sel, title] of [['.help-tile[href="/page/sell"]', 'Как продавать'], ['.help-tiles.sm .help-tile[href="/page/deals"]', 'Сделки и репутация'],
            ['.help-tiles.sm .help-tile[href="/page/safety"]', 'Безопасность'], ['.help-tiles.sm .help-tile[href="/page/support"]', 'Поддержка']]) {
            await (vp.hasTouch ? page.tap(sel) : page.click(sel)); await page.waitForTimeout(400);
            const t = await page.$eval('#app .pcover', (c) => c.dataset.title).catch(() => '');
            if (t !== title) errors.push(`касание ${sel}: открылось «${t}», а не «${title}»`);
          }
          if (await page.isVisible('.pc-row')) errors.push('в приложении видна строка обложки — её рисует приложение');
        } else if (open === 'rep') {
          // 27.11: нажали на имя в шапке переписки — карточка репутации с уровнем, фактами и ссылкой на профиль.
          await page.click('[data-rep]'); await page.waitForTimeout(400);
          if (!(await page.isVisible('.rep-pop .rep-head'))) errors.push('по имени не открылась карточка репутации');
          if (!(await page.$('.rep-pop a[href^="/u/"]'))) errors.push('в карточке нет ссылки на профиль');
          if (!(await page.$('.chat-head .ch-item'))) errors.push('в шапке переписки нет объявления');
        } else if (open === 'push-texts') {
          // 1.66.0: тексты push — раскрыли первый, вставили подстановку, пример обновился; лишних «‹» нет.
          await page.click('.pt-item summary'); await page.waitForTimeout(250);
          if (!(await page.isVisible('.pt-item[open] .pt-banner'))) errors.push('редактор текста не раскрылся');
          await page.fill('.pt-item[open] input[name=title]', 'Проверка {имя}'); await page.waitForTimeout(100);
          const pv = await page.textContent('.pt-item[open] [data-pv-t]');
          if (!/^Проверка \S/.test(pv) || pv.includes('{')) errors.push(`пример не подставился: «${pv}»`);
          await page.fill('.pt-item[open] input[name=title]', ''); await page.waitForTimeout(100);
        } else if (open === '#gvbtn') {
          await page.click(open);
          await page.waitForTimeout(300);
          if (!(await page.$('.gallery-main.is-video video'))) errors.push('видео в галерее не открылось');
        } else if (open) {
          await page.click(open);
          await page.waitForTimeout(400);
          if (!(await page.$('.modal, .pv'))) errors.push(`окно по ${open} не открылось`);
        }
        const m = await page.evaluate(() => {
          const nav = document.querySelector('#bottom-nav');
          const st = nav ? getComputedStyle(nav) : null;
          const wide = [...document.querySelectorAll('body *')].filter((el) => {
            const r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== 'fixed')) return false;
            // внутри ленты с прокруткой (меню-капсулы, вкладки) — не виновник: вылезает сама лента или её родитель
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible') return false;
            return true;
          }).slice(0, 3).map((el) => {
            const own = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
            const box = el.parentElement && el.parentElement.closest('[class]'); // где искать: ближайший блок с классом
            return box && typeof box.className === 'string' ? `${own} в .${box.className.split(' ')[0]}` : own;
          });
          return {
            scrollW: document.documentElement.scrollWidth,
            clientW: document.documentElement.clientWidth,
            navVisible: !!st && st.display !== 'none' && st.visibility !== 'hidden',
            editor: !!document.querySelector('.ed'),
            dockVisible: (() => { const e = document.querySelector('.ed-dock'); return !!e && getComputedStyle(e).display !== 'none'; })(),
            appText: (document.querySelector('#app')?.innerText || '').trim().length,
            onest: [...document.fonts].some((f) => f.family.replace(/['"]/g, '') === 'Onest' && f.status === 'loaded'),
            wide
          };
        });
        if (m.scrollW > m.clientW + 1) errors.push(`горизонтальная прокрутка: ${m.scrollW}px при ширине ${m.clientW}px (${m.wide.join(', ')})`);
        // На форме объявления на телефоне вместо нижнего меню — закреплённая кнопка отправки.
        if (kind === 'mobile' && m.editor && (m.navVisible || !m.dockVisible)) errors.push('на форме объявления должна быть закреплённая кнопка вместо нижнего меню');
        if (kind === 'mobile' && !m.editor && !m.navVisible) errors.push('нет нижнего меню на телефоне');
        if (kind === 'desktop' && m.dockVisible) errors.push('закреплённая кнопка формы видна на компьютере');
        if (kind === 'desktop' && m.navVisible) errors.push('нижнее меню видно на компьютере');
        if (m.appText < 20) errors.push('страница пустая');
        if (!m.onest) errors.push('шрифт Onest не загрузился');
        // UI_AUDIT=1 — подробный разбор страницы (не валит проверку, пишет tests/screenshots/audit.json):
        // обрезанный и наезжающий текст, контраст, битые картинки, мелкий шрифт и кнопки, кнопки без названия, ответы 4xx.
        if (process.env.UI_AUDIT) audit.push({ vp: vpName, name, url, http4xx: [...new Set(http4xx)], ...(await page.evaluate(auditPage)) });
        await page.screenshot({ path: path.join(SHOTS, `${vpName}-${name}.png`), fullPage: !open || /^step:\d$/.test(open) });
        checked++;
        if (errors.length) problems.push(`${vpName} ${url}\n   - ${errors.join('\n   - ')}`);
        console.log(`${errors.length ? '✗' : '✓'} ${vpName.padEnd(7)} ${name}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await srv.stop();
    yk.close();
    if (seeded && seeded.s3) { seeded.s3.srv.closeAllConnections(); seeded.s3.srv.close(); }
  }
  if (process.env.UI_AUDIT) fs.writeFileSync(path.join(SHOTS, 'audit.json'), JSON.stringify(audit, null, 1));
  console.log(`\nПроверено страниц: ${checked}. Скриншоты: ${SHOTS}`);
  if (problems.length) {
    console.error(`\nПроблемы (${problems.length}):\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('Вёрстка в порядке.');
  process.exit(0); // ничего не держит процесс (поддельные серверы, таймеры)
}

const audit = [];
// Выполняется в браузере: ищет на странице то, что видно глазом, но не ловится тестами.
function auditPage() {
  const vw = document.documentElement.clientWidth;
  const vis = (el) => { const st = getComputedStyle(el); const r = el.getBoundingClientRect(); return st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity > 0.05 && r.width > 0 && r.height > 0; };
  const name = (el) => { const c = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''; return el.tagName.toLowerCase() + c; };
  const txt = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const leaves = [...document.querySelectorAll('body *')].filter((el) => txt(el) && vis(el) && !el.closest('.pick-native, .sr, [aria-hidden="true"], script, style, noscript, svg, option'));
  const rgb = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const st = getComputedStyle(e); if (st.backgroundImage !== 'none' && !st.backgroundImage.startsWith('linear-gradient(90deg')) return null; const c = rgb(st.backgroundColor); if ((c[3] ?? 1) > 0.5) return c; } return [255, 255, 255, 1]; };
  const out = { clipped: [], overlap: [], contrast: [], tiny: [], smallTap: [], noName: [], brokenImg: [], offscreen: [], badText: [] };
  for (const el of leaves) {
    const st = getComputedStyle(el); const r = el.getBoundingClientRect(); const t = txt(el).slice(0, 40);
    // Обрезано без многоточия и без line-clamp
    const clipX = el.scrollWidth > el.clientWidth + 2 && st.overflowX !== 'visible' && st.textOverflow !== 'ellipsis';
    const clipY = el.scrollHeight > el.clientHeight + 3 && st.overflowY !== 'visible' && !(st.webkitLineClamp && st.webkitLineClamp !== 'none') && el.clientHeight > 0;
    if ((clipX || clipY) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) out.clipped.push(`${name(el)} «${t}»`);
    // Текст вылезает за предка с overflow:hidden
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflow !== 'visible' || ps.overflowX !== 'visible') { const pr = p.getBoundingClientRect(); if (r.right > pr.right + 2 || r.left < pr.left - 2) { if (st.textOverflow !== 'ellipsis' && ps.overflowX !== 'auto' && ps.overflowX !== 'scroll') out.clipped.push(`${name(el)} «${t}» за краем ${name(p)}`); } break; }
    }
    if (r.right > vw + 1 && st.position !== 'fixed') out.offscreen.push(`${name(el)} «${t}»`);
    const fs = parseFloat(st.fontSize); if (fs < 11) out.tiny.push(`${name(el)} ${fs}px «${t}»`);
    const bg = bgOf(el);
    if (bg) { const c = rgb(st.color); const a = c[3] ?? 1; const fg = [0, 1, 2].map((k) => c[k] * a + bg[k] * (1 - a)); const L1 = lum(fg); const L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = fs >= 18 || (fs >= 14 && +st.fontWeight >= 700); if (ratio < (large ? 3 : 4.5)) out.contrast.push(`${ratio.toFixed(2)} ${name(el)} ${st.color} на rgb(${bg.slice(0, 3).join(',')}) «${t}»`); }
  }
  // Наезд текста на текст
  const boxes = leaves.filter((el) => getComputedStyle(el).position !== 'fixed').map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.bottom > 0 && r.top < 6000);
  for (let i = 0; i < boxes.length && out.overlap.length < 15; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, ra] = boxes[i]; const [b, rb] = boxes[j];
    if (a.contains(b) || b.contains(a)) continue;
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left); const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 4 && h > 4) { out.overlap.push(`${name(a)} «${txt(a).slice(0, 25)}» × ${name(b)} «${txt(b).slice(0, 25)}»`); break; }
  }
  for (const el of document.querySelectorAll('a, button, [role="button"], input:not([type="hidden"]), select:not(.pick-native)')) {
    if (!vis(el) || el.closest('.pick-native')) continue;
    const r = el.getBoundingClientRect();
    if (vw < 500 && (r.width < 30 || r.height < 30) && !el.closest('p, .muted, .legal, footer, .crumbs, .kv, .desc, .nt-t, .msg-text') && el.tagName !== 'INPUT') out.smallTap.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)} «${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 25)}»`);
    const label = (el.innerText || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.getAttribute('placeholder') || el.querySelector('img[alt]:not([alt=""])')?.alt;
    if (!label && !(el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type) && el.closest('label'))) out.noName.push(`${name(el)} ${el.outerHTML.replace(/<svg.*?<\/svg>/g, '<svg/>').slice(0, 110)}`);
  }
  // Текст: служебные значения и опечатки разметки, которые видны человеку
  const body = document.body.innerText;
  out.badText = [...new Set((body.match(/[^\n]{0,30}(undefined|NaN|\[object|null ₽|\{\{|\$\{)[^\n]{0,30}/g) || []).concat(body.match(/[^\n]{0,20}[а-яё] ,[^\n]{0,20}|[^\n]{0,20}\.\.(?!\.)[^\n]{0,10}/gi) || []))];
  for (const im of document.querySelectorAll('img')) if (vis(im) && im.complete && im.naturalWidth === 0 && im.getAttribute('src')) out.brokenImg.push(im.getAttribute('src').slice(0, 60));
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 12);
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });

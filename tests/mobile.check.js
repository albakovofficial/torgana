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
const VIEWPORTS = {
  mobile: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 860 } }
};

async function seed(base, browser) {
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
    { subcategory: 'kids' },
    { subcategory: 'phones', attrs: { brand: 'Apple', memory: '256 ГБ' }, metro: 'Тверская' },
    { subcategory: 'flats_rent', attrs: { rooms: '2', area: 54, floor: 5, floors: 9 }, metro: 'Площадь Восстания', district: 'Центральный' },
    { subcategory: 'bikes', attrs: { bikeType: 'Горный' } },
    { subcategory: 'furniture' },
    { subcategory: 'repair' }
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
    attrs: { brand: 'Toyota', year: 2018, mileage: 86500, gearbox: 'Автомат', fuel: 'Бензин', body: 'Седан', drive: 'Передний' }, photos: carPhotos, video: vs.data.file,
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
  // отзывы: опубликованный с ответом продавца, второй — с жалобой; диалог, где можно оставить отзыв
  const rv1 = (await buyer.post('/api/reviews', { conversationId: conv.data.id, rating: 5, received: true, text: 'Коляска как в описании, всё проверили на месте. Продавец вежливый, рекомендую!' })).data.review.id;
  await admin.post(`/api/admin/reviews/${rv1}/publish`);
  await seller.post(`/api/reviews/${rv1}/reply`, { text: 'Спасибо! Пусть служит долго.' });
  await admin.post(`/api/admin/reviews/${rv1}/reply/publish`);
  const critic = await registerUser(base, { name: 'Сергей', email: 'sergey@test.local' });
  const c2 = (await critic.post('/api/conversations', { listingId: ids[3] })).data.id;
  await critic.post(`/api/conversations/${c2}/messages`, { body: 'Велосипед ещё продаётся?' });
  await seller.post(`/api/conversations/${c2}/messages`, { body: 'Да.' });
  const rv2 = (await critic.post('/api/reviews', { conversationId: c2, rating: 1, received: false, text: 'Договорились о встрече, но продавец не пришёл и перестал отвечать.' })).data.review.id;
  await admin.post(`/api/admin/reviews/${rv2}/publish`);
  await seller.post(`/api/reviews/${rv2}/complaint`, { reason: 'Ложные сведения', text: 'Я ждала у метро до семи вечера и писала в чат — покупатель не пришёл.' });
  const c3 = (await buyer.post('/api/conversations', { listingId: ids[4] })).data.id;
  await buyer.post(`/api/conversations/${c3}/messages`, { body: 'Добрый день! Можно забрать завтра?' });
  await seller.post(`/api/conversations/${c3}/messages`, { body: 'Да, после обеда.' });
  // 1.10: сохранённые поиски, снижение цены, фото в чате
  await buyer.post('/api/saved-searches', { q: 'велосипед', city: 'Казань' });
  await buyer.post('/api/saved-searches', { category: 'electronics', max: '100000', delivery: '1' });
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

  // 1.12: магазин с тарифом «Магазин Про», витрина, продвижение (идёт и ждёт erid), платежи (поддельная ЮKassa).
  await admin.put('/api/admin/seo', { yandex: 'a1b2c3d4e5f60718', metrika: '98765432' });
  await admin.put('/api/admin/billing', { config: { shopId: '123456', secret: 'test_AbCdEfGhIjKlMnOp', receipts: true, vat: 1, mode: 'full_payment' } });
  const shop = await registerUser(base, { name: 'Ольга Детство', email: 'shop@test.local' });
  await shop.post('/api/me/business', { name: 'ООО «Детство»', inn: '7707083893', ogrn: '1027700132195' });
  await admin.post(`/api/admin/users/${shop.user.id}/business`, { decision: 'approve' });
  const pay = async (r) => { const id = r.data.url.split('/').pop(); ykPay.get(id).status = 'succeeded'; ykPay.get(id).payment_method = { type: 'bank_card' }; await client(base).post('/api/pay/yookassa', { object: { id } }); return r.data.id; };
  const planPay = await pay(await shop.post('/api/my/plan/pay', { plan: 'pro', months: 3 }));
  const pg = await browser.newPage();
  const coverData = await pg.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 530;
    const x = cv.getContext('2d'); const g = x.createLinearGradient(0, 0, 1600, 530); g.addColorStop(0, '#DCE9E2'); g.addColorStop(1, '#F1E6D8'); x.fillStyle = g; x.fillRect(0, 0, 1600, 530);
    x.fillStyle = 'rgba(31,94,74,.18)'; for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(160 + i * 220, 265 + (i % 2 ? 60 : -60), 120, 0, Math.PI * 2); x.fill(); }
    return cv.toDataURL('image/jpeg', 0.85);
  });
  await pg.close();
  const cover = (await shop.post('/api/uploads', { data: coverData })).data.file;
  await shop.put('/api/my/shop', { cover, about: 'Детские коляски, автокресла и игрушки. Проверяем каждый товар перед продажей, даём гарантию 14 дней.\nСамовывоз и доставка по Казани.', hours: 'Пн–Сб 10:00–20:00', address: 'Казань, ул. Баумана, 15', site: 'detstvo-shop.ru' });
  const s1 = (await shop.post('/api/listings', { title: 'Самокат детский трёхколёсный', category: 'personal', city: 'Казань', price: '3900', photos: [(await shop.post('/api/uploads', { data: photoData })).data.file] })).data.id;
  await admin.post(`/api/admin/listings/${s1}/restore`);
  const s2 = (await shop.post('/api/listings', { title: 'Автокресло Britax Römer', category: 'personal', city: 'Казань', price: '18900' })).data.id;
  await admin.post(`/api/admin/listings/${s2}/restore`);
  await pay(await shop.post(`/api/listings/${s1}/promote`, { days: 7 }));
  const ad = (await admin.get('/api/admin/ads?tab=marking')).data.items[0].id;
  await admin.post(`/api/admin/ads/${ad}/erid`, { erid: '2SDnjc7Jh3Q' });
  await pay(await shop.post(`/api/listings/${s2}/promote`, { days: 30 }));
  const pendingPay = (await shop.post('/api/my/plan/pay', { plan: 'pro', months: 12 })).data.id;
  for (let i = 0; i < 3; i++) await client(base).post('/api/stats/impressions', { ids: [s1, s2] }, { origin: base, 'user-agent': ua(20 + i) });
  await client(base).post('/api/stats/view', { id: s1, src: 'ad' }, { origin: base, 'user-agent': ua(20) });
  return { s3, seller, buyer, admin, ids, car, pending, thread, conv: conv.data.id, convReview: c3, shop, s1, planPay, pendingPay };
}

function pages(d) {
  return [
    ['home', '/', null],
    ['search', `/search?q=${encodeURIComponent('коляска до 50 000 с доставкой')}`, null],
    ['category', '/search?category=electronics', null],
    ['listing', `/l/${d.ids[0]}`, null],
    ['listing-guest-long', `/l/${d.ids[2]}`, null],
    ['user', `/u/${d.seller.user.id}`, null],
    ['login', '/login', null],
    ['register', '/register', null],
    ['rules', '/page/rules', null],
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
    ['cookie', '/', null],
    ['admin-seo', '/admin?status=seo', d.admin],
    ['confirm-code', '/confirm', null, 'code'],
    ['profile', '/profile', d.seller],
    ['profile-listings', '/profile/listings', d.seller],
    ['profile-rejected', '/profile/listings?status=rejected', d.seller],
    ['settings', '/profile/settings', d.seller],
    ['reviews-about', '/profile/reviews', d.seller],
    ['reviews-mine', '/profile/reviews?tab=mine', d.buyer],
    ['user-reviews', `/u/${d.seller.user.id}?tab=reviews`, null],
    ['chat-review', `/messages/${d.convReview}`, d.buyer],
    ['admin-reviews', '/admin?status=reviews', d.admin],
    ['admin-review-complaints', '/admin?status=reviews&rt=complaints', d.admin],
    ['stats', `/profile/stats/${d.ids[1]}`, d.seller],
    ['stats-week', `/profile/stats/${d.ids[1]}?days=7`, d.seller],
    ['settings-old-link', '/profile?tab=settings', d.seller],
    ['profile-empty', '/profile', d.buyer],
    ['favorites', '/favorites', d.buyer],
    ['messages', '/messages', d.buyer],
    ['chat', `/messages/${d.conv}`, d.buyer],
    ['admin', '/admin', d.admin],
    ['admin-mail', '/admin?status=mail', d.admin],
    ['admin-site', '/admin?status=site', d.admin],
    ['profile-searches', '/profile/searches', d.buyer],
    ['admin-users', '/admin?status=users', d.admin],
    ['admin-biz', '/admin?status=biz', d.admin],
    ['admin-oauth', '/admin?status=oauth', d.admin],
    ['admin-user', `/admin/u/${d.seller.user.id}`, d.admin],
    ['admin-log', '/admin?status=log', d.admin],
    ['admin-notify', '/admin?status=notify', d.admin],
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
    ['biz-hub', '/profile/business', d.shop],
    ['biz-hub-empty', '/profile/business', d.buyer],
    ['biz-shop', '/profile/business/shop', d.shop],
    ['biz-shop-locked', '/profile/business/shop', d.buyer],
    ['biz-stats', '/profile/business/stats', d.shop],
    ['biz-feed', '/profile/business/feed', d.shop],
    ['pay-ok', `/pay/${d.planPay}`, d.shop],
    ['pay-wait', `/pay/${d.pendingPay}`, d.shop],
    ['storefront', `/u/${d.shop.user.id}`, null],
    ['search-ad', `/search?q=${encodeURIComponent('самокат')}`, null],
    ['listing-promo', `/l/${d.s1}`, d.shop],
    ['promote-modal', `/l/${d.s1}`, d.shop, '[data-promote]'],
    ['ad-info', `/search?q=${encodeURIComponent('самокат')}`, null, '[data-ad-info]'],
    ['my-listings-promo', '/profile', d.shop],
    ['admin-payments', '/admin?status=payments', d.admin],
    ['admin-ads', '/admin?status=ads', d.admin],
    ['admin-ads-active', '/admin?status=ads&tab=active', d.admin],
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
    ['user-own', `/u/${d.seller.user.id}`, d.seller]
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
  const srv = await startServer({ YOOKASSA_TEST_BASE: `http://127.0.0.1:${yk.address().port}` });
  const browser = await chromium.launch();
  const problems = [];
  let checked = 0;
  try {
    const d = await seed(srv.base, browser);
    seeded = d;
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      for (const [name, url, who, open] of pages(d)) {
        const ctx = await browser.newContext({ ...vp, locale: 'ru-RU' });
        if (who) {
          const [k, v] = who.cookie.split('=');
          await ctx.addCookies([{ name: k, value: v, url: srv.base }]);
        }
        // Внешние ресурсы (шрифты и т. п.) в проверке не грузим — тест не должен зависеть от интернета.
        await ctx.route((u) => !u.href.startsWith(srv.base), (r) => r.fulfill({ status: 200, body: '' }));
        // Плашку cookie показываем только на своей странице проверки, на остальных — выбор уже сделан.
        if (name !== 'cookie') await ctx.addInitScript(() => { try { localStorage.setItem('tg_cookie', 'necessary'); } catch { /* нет */ } });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(`JS: ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
        page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
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
          await page.click('.ed-dock [data-submit], .ed-panel [data-submit] >> visible=true');
          await page.waitForTimeout(500);
          if (!(await page.$('.ed-step.bad'))) errors.push('ошибки формы не подсветились');
        } else if (open === '#gvbtn') {
          await page.click(open);
          await page.waitForTimeout(300);
          if (!(await page.$('.gallery-main.is-video video'))) errors.push('видео в галерее не открылось');
        } else if (open) {
          await page.click(open);
          await page.waitForTimeout(400);
          if (!(await page.$('.modal'))) errors.push(`окно по ${open} не открылось`);
        }
        const m = await page.evaluate(() => {
          const nav = document.querySelector('#bottom-nav');
          const st = nav ? getComputedStyle(nav) : null;
          const wide = [...document.querySelectorAll('body *')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== 'fixed';
          }).slice(0, 3).map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
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
        if (vpName === 'mobile' && m.editor && (m.navVisible || !m.dockVisible)) errors.push('на форме объявления должна быть закреплённая кнопка вместо нижнего меню');
        if (vpName === 'mobile' && !m.editor && !m.navVisible) errors.push('нет нижнего меню на телефоне');
        if (vpName === 'desktop' && m.dockVisible) errors.push('закреплённая кнопка формы видна на компьютере');
        if (vpName === 'desktop' && m.navVisible) errors.push('нижнее меню видно на компьютере');
        if (m.appText < 20) errors.push('страница пустая');
        if (!m.onest) errors.push('шрифт Onest не загрузился');
        await page.screenshot({ path: path.join(SHOTS, `${vpName}-${name}.png`), fullPage: !open });
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
  console.log(`\nПроверено страниц: ${checked}. Скриншоты: ${SHOTS}`);
  if (problems.length) {
    console.error(`\nПроблемы (${problems.length}):\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('Вёрстка в порядке.');
  process.exit(0); // ничего не держит процесс (поддельные серверы, таймеры)
}

main().catch((e) => { console.error(e); process.exit(1); });

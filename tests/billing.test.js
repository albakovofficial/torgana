'use strict';

// Платные услуги: оплата через ЮKassa (с поддельной ЮKassa), тарифы, витрина, статистика магазина,
// продвижение и блок «Реклама» с маркировкой, возвраты, автозагрузка из фида.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, startSmtp, registerUser, client, publish, PNG_1PX } = require('./helpers');
const feedLib = require('../lib/feed');

let srv; let smtp; let yk; let files; let admin; let shop; let other;
const ykSeen = []; // запросы к «ЮKassa»
const ykPay = new Map(); // id → платёж; статус меняет тест
let ykN = 0;
let feedXml = '';

before(async () => {
  yk = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; }).on('end', () => {
      const j = body ? JSON.parse(body) : null;
      ykSeen.push({ method: req.method, url: req.url, body: j, auth: req.headers.authorization, idem: req.headers['idempotence-key'] });
      const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method === 'POST' && req.url === '/payments') {
        const id = `yk-${++ykN}`;
        const p = { id, status: 'pending', amount: j.amount, metadata: j.metadata, test: true, confirmation: { type: 'redirect', confirmation_url: `https://yoomoney.test/checkout/${id}` } };
        ykPay.set(id, p);
        return send(200, p);
      }
      const m = /^\/payments\/(.+)$/.exec(req.url);
      if (req.method === 'GET' && m) return ykPay.has(m[1]) ? send(200, ykPay.get(m[1])) : send(404, { description: 'not found' });
      if (req.method === 'POST' && req.url === '/refunds') return send(200, { id: `rf-${ykSeen.length}`, status: 'succeeded', amount: j.amount });
      send(404, {});
    });
  });
  await new Promise((r) => yk.listen(0, '127.0.0.1', r));
  // Файлы фида и картинки для автозагрузки.
  files = http.createServer((req, res) => {
    if (req.url === '/feed.xml') { res.writeHead(200, { 'Content-Type': 'application/xml' }); res.end(feedXml); return; }
    if (req.url.startsWith('/img/')) { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(Buffer.from(PNG_1PX, 'base64')); return; }
    if (req.url === '/not-image.png') { res.writeHead(200); res.end('<html>'); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => files.listen(0, '127.0.0.1', r));
  smtp = await startSmtp();
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', YOOKASSA_TEST_BASE: `http://127.0.0.1:${yk.address().port}`, FEED_ALLOW_LOCAL: '1', MAIL_TICK_MS: '150' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  shop = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  other = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
  await admin.put('/api/admin/mail', { host: '127.0.0.1', port: smtp.port, security: 'none', user: smtp.user, pass: smtp.pass, from: 'no-reply@torgana.test' });
});
after(async () => { await srv.stop(); await smtp.close(); yk.close(); files.close(); });

const ykId = (url) => url.split('/').pop();
// Человек оплатил на странице ЮKassa → ЮKassa присылает уведомление.
async function payAndNotify(r) {
  const id = ykId(r.data.url);
  ykPay.get(id).status = 'succeeded';
  ykPay.get(id).payment_method = { type: 'sbp' };
  const hook = await client(srv.base).post('/api/pay/yookassa', { type: 'notification', event: 'payment.succeeded', object: { id, status: 'succeeded' } });
  assert.equal(hook.status, 200);
  return id;
}

test('без ключей ЮKassa оплаты нет; тарифы — только для проверенного бизнеса', async () => {
  const cfg = (await client(srv.base).get('/api/config')).data.billing;
  assert.equal(cfg.ready, false);
  assert.equal(cfg.prices.shop[1], 490);
  assert.equal((await shop.post('/api/my/plan/pay', { plan: 'shop', months: 1 })).status, 403, 'без проверки бизнеса');
  await shop.post('/api/me/business', { name: 'ИП Смирнова А. А.', inn: '500100732259', ogrn: '304500116000157' });
  await admin.post(`/api/admin/users/${shop.user.id}/business`, { decision: 'approve' });
  assert.equal((await shop.post('/api/my/plan/pay', { plan: 'shop', months: 1 })).status, 503, 'оплата не подключена');
});

test('ключи и цены вводит модератор; секрет не возвращается', async () => {
  assert.equal((await shop.put('/api/admin/billing', { config: { shopId: '1', secret: 'test_x' } })).status, 403);
  assert.equal((await admin.put('/api/admin/billing', { config: { shopId: '123456', secret: 'not-a-key' } })).status, 400);
  assert.equal((await admin.put('/api/admin/billing', { config: { shopId: '123456', secret: 'test_AbCdEfGhIjKlMnOp', receipts: true, vat: 1, mode: 'full_payment' } })).status, 200);
  const b = (await admin.get('/api/admin/billing')).data;
  assert.equal(b.config.ready, true);
  assert.equal(b.config.hasSecret, true);
  assert.equal(b.config.secret, undefined);
  assert.equal(b.config.webhook, 'http://torgana.test/api/pay/yookassa');
  await admin.put('/api/admin/billing', { prices: { shop: { 1: 500, 3: 1290, 12: 4490 }, pro: { 1: 1500, 3: 3990, 12: 13990 }, promo: { 3: 99, 7: 200, 30: 590 }, proDiscount: 30 } });
  assert.equal((await client(srv.base).get('/api/config')).data.billing.prices.shop[1], 500);
});

test('тариф: платёж с чеком, проверка в ЮKassa, включение ровно один раз, письмо', async () => {
  const r = await shop.post('/api/my/plan/pay', { plan: 'shop', months: 1, amount: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.url, /^https:\/\/yoomoney\.test\/checkout\//);
  const req = ykSeen.find((x) => x.method === 'POST' && x.url === '/payments');
  assert.equal(req.auth, `Basic ${Buffer.from('123456:test_AbCdEfGhIjKlMnOp').toString('base64')}`);
  assert.equal(req.idem, r.data.id, 'ключ идемпотентности — наш номер платежа');
  assert.deepEqual(req.body.amount, { value: '500.00', currency: 'RUB' }, 'сумму считает сервер, а не браузер');
  assert.equal(req.body.capture, true);
  assert.equal(req.body.confirmation.return_url, `http://torgana.test/pay/${r.data.id}`);
  assert.deepEqual(req.body.receipt.customer, { email: 'anna@test.local' });
  assert.equal(req.body.receipt.items[0].vat_code, 1);
  assert.equal(req.body.receipt.items[0].payment_subject, 'service');
  assert.deepEqual(req.body.receipt.items[0].amount, { value: '500.00', currency: 'RUB' });

  // Поддельное уведомление «оплачено», а ЮKassa говорит «ещё нет» — услуга не включается.
  await client(srv.base).post('/api/pay/yookassa', { event: 'payment.succeeded', object: { id: ykId(r.data.url), status: 'succeeded' } });
  assert.equal((await shop.get('/api/me')).data.user.plan, null);
  assert.equal((await other.get(`/api/payments/${r.data.id}`)).status, 404, 'чужой платёж не виден');

  await payAndNotify(r);
  await client(srv.base).post('/api/pay/yookassa', { event: 'payment.succeeded', object: { id: ykId(r.data.url) } }); // повтор уведомления
  const me = (await shop.get('/api/me')).data.user;
  assert.equal(me.plan.id, 'shop');
  const days = (me.plan.until - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days <= 30, `30 дней, а не ${days}`);
  const pay = (await shop.get(`/api/payments/${r.data.id}`)).data.payment;
  assert.equal(pay.status, 'succeeded');
  assert.equal(pay.applied, true);
  assert.equal(pay.method, 'СБП');
  await smtp.waitFor((m) => m.to === 'anna@test.local' && /Оплата прошла/.test(m.subject));
  assert.equal((await client(srv.base).post('/api/pay/yookassa', { object: { id: 'yk-unknown' } })).status, 200, 'не наш платёж — 200, без повторов');
});

test('другая сумма в ЮKassa — услуга не включается', async () => {
  const r = await other.post('/api/me/business', { name: 'ООО «Ромашка»', inn: '7707083893', ogrn: '1027700132195' });
  assert.equal(r.status, 200);
  await admin.post(`/api/admin/users/${other.user.id}/business`, { decision: 'approve' });
  const p = await other.post('/api/my/plan/pay', { plan: 'pro', months: 1 });
  ykPay.get(ykId(p.data.url)).amount = { value: '1.00', currency: 'RUB' };
  await payAndNotify(p);
  assert.equal((await other.get('/api/me')).data.user.plan, null);
});

test('переход на «Магазин Про»: оставшиеся дни пересчитываются по цене месяца', async () => {
  const r = await shop.post('/api/my/plan/pay', { plan: 'pro', months: 1 });
  await payAndNotify(r);
  const plan = (await shop.get('/api/me')).data.user.plan;
  assert.equal(plan.id, 'pro');
  const days = (plan.until - Date.now()) / 86400000;
  // 30 дней «Магазина» по 500 ₽ → 10 дней «Про» по 1500 ₽; плюс 30 оплаченных.
  assert.ok(days > 39.8 && days < 40.1, `ожидали ≈40 дней, а не ${days}`);
});

test('плюшки тарифа: 30 быстрых ответов, значок магазина в карточке, «Про» — первым в поддержке', async () => {
  // быстрые ответы: с тарифом до 30, без тарифа — до 12
  const many = Array.from({ length: 30 }, (_, i) => `ответ ${i}`);
  const r = await shop.put('/api/my/replies', { items: many });
  assert.equal(r.status, 200);
  assert.equal(r.data.max, 30);
  assert.equal((await shop.put('/api/my/replies', { items: [...many, 'лишний'] })).status, 400);
  assert.equal((await other.put('/api/my/replies', { items: many.slice(0, 13) })).status, 400);
  await shop.put('/api/my/replies', { reset: true });
  // поддержка: оба ждут ответа, «Магазин Про» — выше, даже если написал раньше
  await shop.post('/api/support/messages', { body: 'Вопрос от магазина' });
  await other.post('/api/support/messages', { body: 'Вопрос без тарифа' });
  const items = (await admin.get('/api/admin/support')).data.items.filter((t) => t.waiting);
  const iShop = items.findIndex((t) => t.user.id === shop.user.id);
  const iOther = items.findIndex((t) => t.user.id === other.user.id);
  assert.ok(iShop >= 0 && iOther >= 0);
  assert.ok(iShop < iOther, 'обращение «Магазина Про» — первым');
  assert.equal(items[iShop].pro, true);
  assert.equal(items[iOther].pro, false);
});

test('витрина магазина и публичная страница; без тарифа — нельзя', async () => {
  assert.equal((await other.put('/api/my/shop', { about: 'Магазин' })).status, 403);
  const cover = (await shop.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` })).data.file;
  const r = await shop.put('/api/my/shop', { about: 'Детские товары с гарантией', hours: 'Пн–Пт 10–19', address: 'Казань, ул. Баумана, 1', site: 'anna-shop.ru', cover });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.shop.site, 'https://anna-shop.ru');
  assert.equal((await shop.put('/api/my/shop', { site: 'javascript:alert(1)' })).status, 400);
  const pub = (await client(srv.base).get(`/api/users/${shop.user.id}`)).data.user;
  assert.equal(pub.shop.name, 'ИП Смирнова А. А.');
  assert.equal(pub.shop.about, 'Детские товары с гарантией');
  assert.match(pub.shop.cover, /^\/uploads\//);
  assert.equal(pub.badges.shop, true);
  assert.equal((await client(srv.base).get(`/api/users/${other.user.id}`)).data.user.shop, null);
  assert.equal((await admin.post(`/api/admin/users/${shop.user.id}/shop/clear`, { reason: 'x' })).status, 400, 'причина обязательна');
});

test('продвижение: скидка «Про», запуск сразу после оплаты, блок «Реклама» по запросу, показы и переходы', async () => {
  const id = await publish(shop, admin, { title: 'Детская коляска Cybex', category: 'personal', city: 'Казань', price: 34500 });
  const opts = (await shop.get(`/api/listings/${id}/promote`)).data;
  assert.equal(opts.options.find((o) => o.days === 7).price, 140, '200 ₽ − 30%');
  assert.equal((await other.post(`/api/listings/${id}/promote`, { days: 7 })).status, 404, 'чужое объявление');
  const r = await shop.post(`/api/listings/${id}/promote`, { days: 7 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(ykSeen.filter((x) => x.url === '/payments').pop().body.amount.value, '140.00');
  await payAndNotify(r);
  const cur = (await shop.get(`/api/listings/${id}`)).data.promo;
  assert.equal(cur.status, 'active', 'запускается сразу после оплаты');
  // 1.40.0: очереди маркировки нет; 1.45.0: /api/admin/ads — раздел «Реклама», оплаченное видно сразу как идущее.
  assert.ok((await admin.get('/api/admin/ads')).data.promos.some((p) => p.listingId === id && !p.gift), 'в разделе «Реклама»');
  assert.ok(cur.endsAt - Date.now() > 6.9 * 86400000);

  const hit = (await client(srv.base).get(`/api/ads?${new URLSearchParams({ q: 'коляска', city: 'Казань' })}`)).data.items;
  assert.equal(hit.length, 1);
  const ad = hit[0].ad;
  assert.deepEqual(ad, { id: cur.id, advertiser: 'ИП Смирнова А. А.', inn: '500100732259' });
  assert.equal((await client(srv.base).get(`/api/ads?${new URLSearchParams({ q: 'велосипед' })}`)).data.items.length, 0, 'не по запросу — не показываем');
  assert.equal((await client(srv.base).get(`/api/ads?${new URLSearchParams({ city: 'Москва' })}`)).data.items.length, 0, 'другой город');
  assert.equal((await client(srv.base).get('/api/listings?q=коляска')).data.items.length, 1, 'обычная выдача не меняется');

  const guest = client(srv.base);
  const hd = { origin: srv.base, 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36' };
  assert.equal((await guest.post('/api/stats/ads', { ids: [ad.id] }, hd)).data.counted, 1);
  assert.equal((await guest.post('/api/stats/ads', { ids: [ad.id] }, hd)).data.counted, 0, 'раз в сутки');
  assert.equal((await shop.post('/api/stats/ads', { ids: [ad.id] }, { ...hd, 'user-agent': `${hd['user-agent']} owner` })).data.counted, 0, 'продавец сам себе не показ');
  assert.equal((await guest.post('/api/stats/view', { id, src: 'ad' }, hd)).data.counted, true);
  const st = (await shop.get(`/api/my/listings/${id}/stats`)).data;
  assert.equal(st.sources.ad, 1);
  const mine = (await shop.get('/api/my/business')).data.promotions[0];
  assert.equal(mine.shows, 1);
  assert.equal(mine.clicks, 1);
});

test('статистика магазина и выгрузка CSV', async () => {
  const s = (await shop.get('/api/my/shop/stats?days=7')).data;
  assert.equal(s.daily.length, 7);
  assert.ok(s.totals.views >= 1);
  assert.equal(s.sources.ad, 1);
  const csv = await shop.get('/api/my/shop/stats.csv?days=30');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /attachment; filename="torgana-stats-/);
  assert.ok(csv.data.startsWith('"Объявление";"Ссылка"'), 'заголовок');
  const raw = Buffer.from(await (await fetch(`${srv.base}/api/my/shop/stats.csv`, { headers: { cookie: shop.cookie } })).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM — чтобы Excel открыл кириллицу');
  assert.equal((await other.get('/api/my/shop/stats')).status, 403);
});

test('возврат: частичный, с остановкой продвижения и письмом; больше оплаченного — нельзя', async () => {
  const pays = (await admin.get('/api/admin/payments')).data;
  assert.ok(pays.totals.all.s === 0, 'платежи тестового магазина не считаются в выручке');
  const p = pays.items.find((x) => x.kind === 'promo');
  assert.equal((await admin.post(`/api/admin/payments/${p.id}/refund`, { amount: 141, reason: 'Ошибка' })).status, 400);
  assert.equal((await admin.post(`/api/admin/payments/${p.id}/refund`, { amount: 100, reason: 'x' })).status, 400, 'причина');
  const r = await admin.post(`/api/admin/payments/${p.id}/refund`, { amount: 100, reason: 'Неиспользованные дни', stop: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.payment.refunded, 100);
  const rf = ykSeen.filter((x) => x.url === '/refunds').pop();
  assert.deepEqual(rf.body.amount, { value: '100.00', currency: 'RUB' });
  assert.equal(rf.body.receipt.items[0].amount.value, '100.00', 'чек возврата');
  assert.equal((await client(srv.base).get('/api/ads?q=коляска')).data.items.length, 0, 'продвижение остановлено');
  await smtp.waitFor((m) => m.to === 'anna@test.local' && /Деньги возвращены/.test(m.subject));
  assert.ok((await admin.get('/api/admin/log')).data.items.some((i) => i.action === 'payment-refund'));
});

test('реклама над поиском — для любого продавца, без подтверждения бизнеса', async () => {
  const vera = await registerUser(srv.base, { name: 'Вера', email: 'vera@test.local', smtp });
  const id = await publish(vera, admin, { title: 'Самокат Xiaomi', category: 'hobby', city: 'Казань', price: 15000 });
  const r = await vera.post(`/api/listings/${id}/promote`, { days: 3 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await payAndNotify(r);
  assert.equal((await vera.get(`/api/listings/${id}`)).data.promo.status, 'active');
  const hit = (await client(srv.base).get('/api/ads?q=самокат')).data.items;
  assert.equal(hit.length, 1);
  assert.equal(hit[0].ad.advertiser, 'Вера');
  assert.equal(hit[0].ad.inn, '');
});

test('фид Авито: разбор, категории, города, защита от внутренних адресов', () => {
  const ads = feedLib.parseFeed(`<?xml version="1.0"?><Ads formatVersion="3" target="Avito.ru"><Ad><Id>a1</Id><Title>Диван &amp; кресло</Title>
    <Description><![CDATA[<p>Почти новый</p><ul><li>Ткань</li></ul>]]></Description><Category>Мебель и интерьер</Category><Price>12000</Price>
    <Address>Республика Татарстан, г. Казань, ул. Баумана</Address><Images><Image url="https://x.ru/1.jpg"/><Image url="https://x.ru/2.jpg"/></Images></Ad></Ads>`);
  assert.equal(ads.length, 1);
  assert.equal(ads[0].title, 'Диван & кресло');
  assert.equal(ads[0].description, 'Почти новый\n• Ткань');
  assert.deepEqual(ads[0].images, ['https://x.ru/1.jpg', 'https://x.ru/2.jpg']);
  assert.equal(feedLib.categoryOf('Мебель и интерьер'), 'home');
  assert.equal(feedLib.categoryOf('Телефоны / Мобильные телефоны'), 'electronics');
  assert.equal(feedLib.categoryOf('Квартиры'), 'realty');
  assert.equal(feedLib.categoryOf('Предложение услуг / Ремонт и отделка'), 'services');
  assert.equal(feedLib.cityOf('Республика Татарстан, г. Казань, ул. Баумана'), 'Казань');
  assert.equal(feedLib.cityOf('Московская область, г. Химки'), 'Химки');
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) assert.equal(feedLib.isPrivateIp(ip), true, ip);
  assert.equal(feedLib.isPrivateIp('77.88.55.88'), false);
});

test('ссылка во внутреннюю сеть не скачивается', async () => {
  await assert.rejects(feedLib.safeGet('http://127.0.0.1/feed.xml', { max: 1000 }), /внутреннюю сеть/);
  await assert.rejects(feedLib.safeGet('http://169.254.169.254/latest', { max: 1000 }), /внутреннюю сеть/);
  await assert.rejects(feedLib.safeGet('file:///etc/passwd', { max: 1000 }), /http/);
});

test('автозагрузка: создаёт на проверку, повтор без изменений не трогает, пропавшее снимает', async () => {
  const base = `http://127.0.0.1:${files.address().port}`;
  const ad = (id, title, cat, extra = '') => `<Ad><Id>${id}</Id><Title>${title}</Title><Description>Хорошее состояние</Description><Category>${cat}</Category><Price>5000</Price><Address>г. Казань</Address>${extra}</Ad>`;
  feedXml = `<Ads formatVersion="3">${ad('f1', 'Кресло офисное', 'Мебель и интерьер', `<Images><Image url="${base}/img/1.png"/><Image url="${base}/not-image.png"/></Images>`)}${ad('f2', 'Наушники Sony', 'Аудио и видео')}${ad('f3', 'Что-то', 'Непонятное')}</Ads>`;
  assert.equal((await other.put('/api/my/feed', { url: `${base}/feed.xml` })).status, 403, 'автозагрузка — в «Магазин Про»');
  const before = (await shop.get('/api/my/listings')).data.items.length;
  assert.equal((await shop.put('/api/my/feed', { url: `${base}/feed.xml`, category: '', city: '' })).status, 200);
  const wait = async () => { for (let i = 0; i < 100; i++) { const f = (await shop.get('/api/my/business')).data.feed; if (f.state.at && !f.state.running) return f.state; await new Promise((r) => setTimeout(r, 100)); } throw new Error('фид не загрузился'); };
  let st = await wait();
  assert.equal(st.status, 'ok', st.message);
  assert.equal(st.created, 2);
  assert.equal(st.skipped, 1);
  assert.match(st.errors[0].error, /категори/);
  const mine = (await shop.get('/api/my/listings')).data.items;
  assert.equal(mine.length, before + 2);
  const chair = mine.find((i) => i.title === 'Кресло офисное');
  assert.equal(chair.status, 'pending', 'из фида — тоже на проверку');
  assert.equal(chair.category, 'home');
  assert.ok(chair.photo, 'фото скачано; не-картинка пропущена');
  const ev = (await admin.get(`/api/admin/listings/${chair.id}`)).data;
  assert.ok(JSON.stringify(ev).includes('"via":"feed"'), 'в истории видно, что из фида');

  await admin.post(`/api/admin/listings/${chair.id}/restore`);
  await shop.post('/api/my/feed/run');
  st = await (async () => { await new Promise((r) => setTimeout(r, 200)); return wait(); })();
  assert.equal(st.unchanged, 2);
  assert.equal((await client(srv.base).get(`/api/listings/${chair.id}`)).data.listing.status, 'active', 'без изменений — не отправляем на проверку заново');

  feedXml = `<Ads>${ad('f2', 'Наушники Sony', 'Аудио и видео')}</Ads>`;
  await shop.post('/api/my/feed/run');
  await new Promise((r) => setTimeout(r, 200));
  st = await wait();
  assert.equal(st.archived, 1);
  assert.equal((await shop.get(`/api/listings/${chair.id}`)).data.listing.status, 'archived');
});

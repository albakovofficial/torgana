'use strict';

// Сквозная проверка API: каждый прогон — отдельный сервер с пустой базой.
// Запуск: npm test
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PNG_1PX, JPEG_HEAD, startServer, client, registerUser, publish } = require('./helpers');

let srv;
let seller; let buyer; let admin; let guest;
const ids = {};

before(async () => {
  srv = await startServer();
  guest = client(srv.base);
});
after(async () => { if (srv) await srv.stop(); });

const listing = (over = {}) => ({
  title: 'Детская коляска Cybex', category: 'personal', price: '12 500', priceUnit: '', city: 'Казань',
  condition: 'used', delivery: true, description: 'Отличное состояние, в комплекте дождевик.', photos: [], ...over
});

describe('конфигурация и главная', () => {
  test('/api/config отдаёт категории и города, оплата выключена', async () => {
    const r = await guest.get('/api/config');
    assert.equal(r.status, 200);
    assert.ok(r.data.categories.length >= 10);
    assert.ok(r.data.cities.includes('Казань'));
    assert.equal(r.data.payments, false);
    assert.equal(r.data.ai, false);
  });

  test('главная страница отдаёт HTML с заголовками безопасности', async () => {
    const r = await guest.get('/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(String(r.data), /<main id="app"/);
    assert.ok(r.headers.get('content-security-policy'));
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
  });

  test('любая страница приложения отдаёт оболочку сайта', async () => {
    const r = await guest.get('/l/999');
    assert.equal(r.status, 200);
    assert.match(String(r.data), /<main id="app"/);
  });

  test('шрифт Onest отдаётся с нашего сервера, внешних шрифтов нет', async () => {
    const page = await guest.get('/');
    assert.doesNotMatch(String(page.data), /fonts\.(googleapis|gstatic)\.com/);
    assert.doesNotMatch(page.headers.get('content-security-policy'), /fonts\.(googleapis|gstatic)/);
    for (const subset of ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext']) {
      const r = await fetch(`${srv.base}/assets/fonts/onest-${subset}.woff2`);
      assert.equal(r.status, 200, subset);
      assert.equal(r.headers.get('content-type'), 'font/woff2');
      const buf = Buffer.from(await r.arrayBuffer());
      assert.equal(buf.toString('ascii', 0, 4), 'wOF2', subset);
    }
  });

  test('стили и скрипт подключены с версией — после обновления браузер берёт свежие', async () => {
    const page = String((await guest.get('/')).data);
    const js = page.match(/\/assets\/app\.js\?v=([a-f0-9]{10})"/);
    const css = page.match(/\/assets\/app\.css\?v=([a-f0-9]{10})"/);
    assert.ok(js && css, 'в index.html нет версий файлов');
    assert.equal(js[1], css[1]);
    const v = await fetch(`${srv.base}/assets/app.js?v=${js[1]}`);
    assert.match(v.headers.get('cache-control'), /immutable/);
    const plain = await fetch(`${srv.base}/assets/app.css`);
    assert.equal(plain.headers.get('cache-control'), 'no-cache');
    assert.match(String((await guest.get('/index.html')).data), /\?v=/);
  });

  test('неизвестный API — 404', async () => {
    assert.equal((await guest.get('/api/nope')).status, 404);
  });

  test('статические файлы отдаются, выход за папку public невозможен', async () => {
    assert.equal((await guest.get('/assets/app.css')).status, 200);
    const r = await guest.get('/assets/../server.js');
    assert.doesNotMatch(String(r.data), /createServer/);
  });
});

describe('регистрация и вход', () => {
  test('регистрация продавца, покупателя и модератора', async () => {
    seller = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
    buyer = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
    admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
    assert.equal(seller.user.isAdmin, false);
    assert.equal(admin.user.isAdmin, true);
  });

  test('cookie входа — httpOnly', async () => {
    const c = client(srv.base);
    const r = await c.post('/api/auth/register', { name: 'Вера', email: 'vera@test.local', password: 'password123', consent: true });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('set-cookie'), /HttpOnly/);
    assert.match(r.headers.get('set-cookie'), /SameSite=Lax/);
  });

  test('повторная регистрация с тем же email — 409', async () => {
    const r = await client(srv.base).post('/api/auth/register', { name: 'Анна2', email: 'ANNA@test.local', password: 'password123', consent: true });
    assert.equal(r.status, 409);
  });

  test('короткий пароль и неверный email отклоняются', async () => {
    const c = client(srv.base);
    assert.equal((await c.post('/api/auth/register', { name: 'Тест', email: 'x@test.local', password: '123', consent: true })).status, 400);
    assert.equal((await c.post('/api/auth/register', { name: 'Тест', email: 'не-почта', password: 'password123', consent: true })).status, 400);
  });

  test('вход с верным и неверным паролем', async () => {
    const c = client(srv.base);
    assert.equal((await c.post('/api/auth/login', { email: 'anna@test.local', password: 'wrong-password' })).status, 401);
    const ok = await c.post('/api/auth/login', { email: 'anna@test.local', password: 'password123' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.name, 'Анна');
    assert.equal((await c.get('/api/me')).data.user.email, 'anna@test.local');
  });

  test('выход завершает сессию', async () => {
    const c = client(srv.base);
    await c.post('/api/auth/login', { email: 'boris@test.local', password: 'password123' });
    const old = c.cookie;
    await c.post('/api/auth/logout');
    c.cookie = old;
    assert.equal((await c.get('/api/me')).data.user, null);
  });

  test('без входа нельзя размещать объявления', async () => {
    assert.equal((await guest.post('/api/listings', listing())).status, 401);
  });

  test('изменение профиля', async () => {
    const r = await seller.patch('/api/me', { city: 'Казань', name: 'Анна' });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.city, 'Казань');
  });
});

describe('фото', () => {
  test('загрузка PNG и JPEG', async () => {
    const png = await seller.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` });
    assert.equal(png.status, 200);
    assert.match(png.data.file, /^[a-f0-9]{32}\.png$/);
    ids.photo = png.data.file;
    const jpg = await seller.post('/api/uploads', { data: `data:image/jpeg;base64,${JPEG_HEAD}` });
    assert.equal(jpg.status, 200);
    ids.photo2 = jpg.data.file;
    const file = await guest.get(png.data.url);
    assert.equal(file.status, 200);
  });

  test('файл, который не является картинкой, отклоняется', async () => {
    const fake = Buffer.from('<?php echo 1; ?>').toString('base64');
    assert.equal((await seller.post('/api/uploads', { data: `data:image/png;base64,${fake}` })).status, 400);
    assert.equal((await seller.post('/api/uploads', { data: 'data:text/html;base64,PGI+' })).status, 400);
  });
});

describe('объявления', () => {
  test('новое объявление ждёт проверки и не видно, пока модератор не одобрит', async () => {
    const r = await seller.post('/api/listings', listing({ photos: [ids.photo, ids.photo2] }));
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'pending');
    ids.l1 = r.data.id;
    assert.equal((await guest.get(`/api/listings/${ids.l1}`)).status, 404);
    assert.equal((await seller.get(`/api/listings/${ids.l1}`)).data.listing.status, 'pending');
    assert.equal((await seller.patch(`/api/listings/${ids.l1}`, { status: 'active' })).status, 400, 'сам опубликовать нельзя');
    await admin.post(`/api/admin/listings/${ids.l1}/restore`);
    const l = (await guest.get(`/api/listings/${ids.l1}`)).data.listing;
    assert.equal(l.status, 'active');
    assert.equal(l.price, 12500);
    assert.equal(l.photos.length, 2);
    assert.equal(l.isOwner, false);
  });

  test('чужое фото нельзя прикрепить к своему объявлению', async () => {
    ids.buyerListing = await publish(buyer, admin, listing({ title: 'Самокат', photos: [ids.photo] }));
    assert.equal((await guest.get(`/api/listings/${ids.buyerListing}`)).data.listing.photos.length, 0);
  });

  test('проверка обязательных полей', async () => {
    assert.equal((await seller.post('/api/listings', listing({ title: 'a' }))).status, 400);
    assert.equal((await seller.post('/api/listings', listing({ category: 'нет-такой' }))).status, 400);
    assert.equal((await seller.post('/api/listings', listing({ city: '' }))).status, 400);
    assert.equal((await seller.post('/api/listings', listing({ price: '-5' }))).status, 400);
  });

  test('цена договорная и цена за месяц', async () => {
    ids.l2 = await publish(seller, admin, listing({ title: 'Ремонт квартир под ключ', category: 'services', price: '', condition: '' }));
    assert.equal((await guest.get(`/api/listings/${ids.l2}`)).data.listing.price, null);
    ids.l3 = await publish(seller, admin, listing({ title: 'Аренда квартиры у метро', category: 'realty', price: '45000', priceUnit: 'мес', condition: '' }));
    assert.equal((await guest.get(`/api/listings/${ids.l3}`)).data.listing.priceUnit, 'мес');
  });

  test('редактировать может только автор', async () => {
    assert.equal((await buyer.patch(`/api/listings/${ids.l1}`, listing({ title: 'Взлом' }))).status, 404);
    const r = await seller.patch(`/api/listings/${ids.l1}`, listing({ title: 'Детская коляска Cybex Priam', photos: [ids.photo] }));
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'pending', 'правка — снова на проверку');
    assert.equal((await guest.get(`/api/listings/${ids.l1}`)).status, 404);
    const hist = (await admin.get(`/api/admin/listings/${ids.l1}`)).data.events.find((e) => e.kind === 'edited');
    assert.deepEqual(hist.data.changes.title, ['Детская коляска Cybex', 'Детская коляска Cybex Priam']);
    assert.deepEqual(hist.data.changes.photos, [2, 1]);
    await admin.post(`/api/admin/listings/${ids.l1}/restore`);
    const l = (await guest.get(`/api/listings/${ids.l1}`)).data.listing;
    assert.equal(l.title, 'Детская коляска Cybex Priam');
    assert.equal(l.photos.length, 1);
  });

  test('просмотры считаются только для чужих и только по сигналу открытой страницы', async () => {
    const browser = { origin: srv.base, 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
    const before = (await seller.get(`/api/listings/${ids.l1}`)).data.listing.views;
    await guest.get(`/api/listings/${ids.l1}`);
    assert.equal((await seller.get(`/api/listings/${ids.l1}`)).data.listing.views, before, 'запрос к API — не просмотр');
    await seller.post('/api/stats/view', { id: ids.l1, src: 'other' }, browser);
    // другой браузер: тот же браузер, что у продавца, засчитан бы не был (продавец мог выйти из аккаунта)
    await guest.post('/api/stats/view', { id: ids.l1, src: 'search' }, { ...browser, 'user-agent': `${browser['user-agent']} Edg/130.0` });
    assert.equal((await seller.get(`/api/listings/${ids.l1}`)).data.listing.views, before + 1);
  });

  test('статусы: продано, снято, снова активно', async () => {
    assert.equal((await seller.patch(`/api/listings/${ids.l3}`, { status: 'sold' })).status, 200);
    assert.equal((await guest.get(`/api/listings/${ids.l3}`)).data.listing.status, 'sold');
    await seller.patch(`/api/listings/${ids.l3}`, { status: 'archived' });
    assert.equal((await guest.get(`/api/listings/${ids.l3}`)).status, 404);
    assert.equal((await seller.get(`/api/listings/${ids.l3}`)).status, 200);
    await seller.patch(`/api/listings/${ids.l3}`, { status: 'active' });
    assert.equal((await seller.patch(`/api/listings/${ids.l3}`, { status: 'hacked' })).status, 400);
  });

  test('мои объявления', async () => {
    const r = await seller.get('/api/my/listings');
    assert.equal(r.status, 200);
    assert.ok(r.data.items.length >= 3);
  });

  test('удаление объявления', async () => {
    const r = await seller.post('/api/listings', listing({ title: 'Удалить меня' }));
    assert.equal((await buyer.del(`/api/listings/${r.data.id}`)).status, 404);
    assert.equal((await seller.del(`/api/listings/${r.data.id}`)).status, 200);
    assert.equal((await guest.get(`/api/listings/${r.data.id}`)).status, 404);
  });
});

describe('поиск', () => {
  test('поиск обычными словами понимает цену, доставку и город', async () => {
    const r = await guest.get(`/api/listings?q=${encodeURIComponent('коляска до 15 000 с доставкой в Казани')}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.understood.max, 15000);
    assert.equal(r.data.understood.delivery, true);
    assert.equal(r.data.understood.city, 'Казань');
    assert.ok(r.data.items.some((i) => i.id === ids.l1));
  });

  test('ограничение по цене отсекает дорогие', async () => {
    const r = await guest.get(`/api/listings?q=${encodeURIComponent('коляска до 10 000')}`);
    assert.ok(!r.data.items.some((i) => i.id === ids.l1));
  });

  test('фильтр по категории и сортировка', async () => {
    const r = await guest.get('/api/listings?category=realty');
    assert.ok(r.data.items.every((i) => i.category === 'realty'));
    const cheap = await guest.get('/api/listings?sort=cheap');
    const prices = cheap.data.items.map((i) => i.price).filter((p) => p !== null);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  });

  test('подсказка цены по рынку', async () => {
    for (const p of [10000, 11000, 12000]) await publish(buyer, admin, listing({ title: `Детская коляска Cybex ${p}`, price: String(p) }));
    const r = await guest.get(`/api/price-hint?${new URLSearchParams({ category: 'personal', title: 'Детская коляска' })}`);
    assert.equal(r.status, 200);
    assert.ok(r.data.hint > 0);
  });
});

describe('избранное', () => {
  test('добавить и убрать', async () => {
    assert.equal((await buyer.post(`/api/favorites/${ids.l1}`)).data.fav, true);
    assert.ok((await buyer.get('/api/favorites')).data.items.some((i) => i.id === ids.l1));
    assert.equal((await buyer.post(`/api/favorites/${ids.l1}`)).data.fav, false);
    assert.equal((await guest.post(`/api/favorites/${ids.l1}`)).status, 401);
  });
});

describe('чат', () => {
  test('покупатель пишет продавцу, продавец видит непрочитанное', async () => {
    const c = await buyer.post('/api/conversations', { listingId: ids.l1 });
    assert.equal(c.status, 200);
    ids.conv = c.data.id;
    assert.equal((await buyer.post('/api/conversations', { listingId: ids.l1 })).data.id, ids.conv);
    const m = await buyer.post(`/api/conversations/${ids.conv}/messages`, { body: 'Здравствуйте! Коляска ещё продаётся?' });
    assert.equal(m.status, 200);
    assert.equal((await seller.get('/api/me')).data.unread, 1);
    const conv = await seller.get(`/api/conversations/${ids.conv}`);
    assert.equal(conv.data.messages.length, 1);
    assert.equal((await seller.get('/api/me')).data.unread, 0);
  });

  test('посторонний не видит чужой диалог', async () => {
    assert.equal((await admin.get(`/api/conversations/${ids.conv}`)).status, 404);
    assert.equal((await admin.post(`/api/conversations/${ids.conv}/messages`, { body: 'привет' })).status, 404);
  });

  test('нельзя писать самому себе и отправлять пустое', async () => {
    assert.equal((await seller.post('/api/conversations', { listingId: ids.l1 })).status, 400);
    assert.equal((await buyer.post(`/api/conversations/${ids.conv}/messages`, { body: '   ' })).status, 400);
  });

  test('список диалогов', async () => {
    const r = await seller.get('/api/conversations');
    assert.equal(r.data.items[0].role, 'seller');
    assert.match(r.data.items[0].lastBody, /продаётся/);
  });
});

describe('модерация', () => {
  test('обычный пользователь не видит модерацию', async () => {
    assert.equal((await seller.get('/api/admin/stats')).status, 403);
    assert.equal((await guest.get('/api/admin/listings')).status, 401);
  });

  test('отклонение с причиной, исправление и апелляция', async () => {
    assert.equal((await admin.post(`/api/admin/listings/${ids.l2}/reject`, { reason: 'x' })).status, 400);
    assert.equal((await admin.post(`/api/admin/listings/${ids.l2}/reject`, { reason: 'Контакты в тексте объявления' })).status, 200);
    assert.equal((await guest.get(`/api/listings/${ids.l2}`)).status, 404);
    const own = await seller.get(`/api/listings/${ids.l2}`);
    assert.equal(own.data.listing.rejectReason, 'Контакты в тексте объявления');
    assert.equal((await seller.patch(`/api/listings/${ids.l2}`, { status: 'active' })).status, 400);
    assert.equal((await seller.post(`/api/listings/${ids.l2}/appeal`, { text: 'коротко' })).status, 400);
    assert.equal((await seller.post(`/api/listings/${ids.l2}/appeal`, { text: 'В тексте нет контактов, это название компании.' })).status, 200);
    const appeals = await admin.get('/api/admin/listings?status=appeals');
    assert.ok(appeals.data.items.some((i) => i.id === ids.l2));
    assert.equal((await admin.post(`/api/admin/listings/${ids.l2}/restore`)).status, 200);
    assert.equal((await guest.get(`/api/listings/${ids.l2}`)).status, 200);
  });

  test('исправленное отклонённое объявление снова идёт на проверку', async () => {
    await admin.post(`/api/admin/listings/${ids.l2}/reject`, { reason: 'Неверная категория' });
    const r = await seller.patch(`/api/listings/${ids.l2}`, listing({ title: 'Ремонт квартир под ключ', category: 'services', price: '', condition: '' }));
    assert.equal(r.data.status, 'pending');
    await admin.post(`/api/admin/listings/${ids.l2}/restore`);
    assert.equal((await guest.get(`/api/listings/${ids.l2}`)).data.listing.status, 'active');
  });

  test('страница проверки: всё об объявлении, продавце и история', async () => {
    const d = (await admin.get(`/api/admin/listings/${ids.l2}`)).data;
    assert.equal(d.listing.title, 'Ремонт квартир под ключ');
    assert.equal(d.seller.email, 'anna@test.local');
    assert.ok(d.seller.counts.total >= 3);
    const kinds = d.events.map((e) => e.kind);
    for (const k of ['created', 'approved', 'rejected', 'appeal', 'appeal-approved', 'edited']) assert.ok(kinds.includes(k), k);
    assert.equal(d.events.find((e) => e.kind === 'rejected').actor.name, 'Модератор');
    assert.equal((await seller.get(`/api/admin/listings/${ids.l2}`)).status, 403);
  });

  test('жалоба: пользователь жалуется, модератор видит и закрывает', async () => {
    assert.equal((await seller.post(`/api/listings/${ids.l2}/report`, { reason: 'Мошенничество' })).status, 400, 'на своё нельзя');
    assert.equal((await buyer.post(`/api/listings/${ids.l2}/report`, { reason: 'что-то своё' })).status, 400);
    assert.equal((await buyer.post(`/api/listings/${ids.l2}/report`, { reason: 'Мошенничество', text: 'Просит предоплату на карту' })).status, 200);
    assert.equal((await buyer.post(`/api/listings/${ids.l2}/report`, { reason: 'Мошенничество' })).status, 409, 'повторно — нет');
    assert.equal((await admin.get('/api/admin/stats')).data.reports, 1);
    const q = (await admin.get('/api/admin/listings?status=reports')).data.items;
    assert.equal(q[0].id, ids.l2);
    assert.equal(q[0].reports, 1);
    const d = (await admin.get(`/api/admin/listings/${ids.l2}`)).data;
    assert.equal(d.reports[0].text, 'Просит предоплату на карту');
    assert.equal(d.reports[0].user.name, 'Борис');
    assert.equal((await admin.post(`/api/admin/listings/${ids.l2}/reports/dismiss`, { reason: 'Проверили переписку — нарушений нет' })).status, 200);
    assert.equal((await admin.get('/api/admin/stats')).data.reports, 0);
  });

  test('статистика', async () => {
    const r = await admin.get('/api/admin/stats');
    assert.equal(r.status, 200);
    assert.ok(r.data.users >= 4);
  });

  test('блокировка автора скрывает объявления и завершает сессии', async () => {
    assert.equal((await admin.post(`/api/admin/users/${admin.user.id}/block`, { blocked: true })).status, 400);
    assert.equal((await admin.post(`/api/admin/users/${buyer.user.id}/block`, { blocked: true })).status, 400, 'без причины нельзя');
    assert.equal((await admin.post(`/api/admin/users/${buyer.user.id}/block`, { blocked: true, reason: 'Мошенничество с предоплатой' })).status, 200);
    assert.equal((await guest.get(`/api/listings/${ids.buyerListing}`)).status, 404);
    assert.equal((await buyer.get('/api/me')).data.user, null);
    assert.equal((await guest.get(`/api/users/${buyer.user.id}`)).status, 404);
    await admin.post(`/api/admin/users/${buyer.user.id}/block`, { blocked: false });
    await buyer.post('/api/auth/login', { email: 'boris@test.local', password: 'password123' });
    assert.equal((await guest.get(`/api/listings/${ids.buyerListing}`)).status, 200);
  });
});

describe('публичный профиль', () => {
  test('профиль продавца с объявлениями, без email', async () => {
    const r = await guest.get(`/api/users/${seller.user.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.user.name, 'Анна');
    assert.equal(r.data.user.email, undefined);
    assert.ok(r.data.items.length >= 1);
  });
});

describe('защита', () => {
  test('изменяющий запрос с чужого сайта отклоняется', async () => {
    const r = await seller.post('/api/listings', listing(), { origin: 'https://evil.example' });
    assert.equal(r.status, 403);
  });

  test('битый JSON — понятная ошибка, а не падение', async () => {
    const r = await fetch(`${srv.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(r.status, 400);
  });

  test('подделанная cookie не даёт доступа', async () => {
    const c = client(srv.base);
    c.cookie = `tg_sid=${'a'.repeat(64)}`;
    assert.equal((await c.get('/api/me')).data.user, null);
  });

  test('ограничение частоты попыток входа', async () => {
    const c = client(srv.base);
    let last;
    for (let i = 0; i < 17; i++) last = await c.post('/api/auth/login', { email: 'anna@test.local', password: 'wrong-password' });
    assert.equal(last.status, 429);
  });
});

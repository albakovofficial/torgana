// Для пользователей: push в приложение (APNs), подписки на продавцов, снижение цены, фото в чате, подборка за день.
// 1.60.0: push в браузер убраны — уведомления приходят только в приложение Торгана для iPhone.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, startSmtp, registerUser, publish, PNG_1PX, fakeApns } = require('./helpers');

let srv; let smtp; let apple; let admin; let anna; let boris;
before(async () => {
  apple = await fakeApns();
  smtp = await startSmtp();
  srv = await startServer({ PUBLIC_URL: 'http://torgana.test', APNS_TEST_URL: apple.url, MAIL_TICK_MS: '150', DIGEST_TICK_MS: '200', DIGEST_MIN_AGE_MS: '0', DIGEST_ANY_HOUR: '1' });
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  boris = await registerUser(srv.base, { name: 'Борис', email: 'boris@test.local' });
  assert.equal((await apple.connect(admin)).status, 200);
});
after(async () => { await srv.stop(); await smtp.close(); apple.close(); });

const waitPush = async (fn, who = 'boris', ms = 4000) => {
  for (let t = 0; t < ms; t += 50) {
    const hit = apple.to(who).find(fn);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`push не пришёл; есть: ${apple.to(who).map((m) => m.title).join('; ')}`);
};
const devices = (id) => { const db = new DatabaseSync(path.join(srv.tmp, 'data', 'torgana.db')); const n = db.prepare('SELECT COUNT(*) AS n FROM apns_tokens WHERE user_id = ?').get(id).n; db.close(); return n; };

test('push в браузер убраны: адресов подписки браузера нет, «Проверить» — на iPhone', async () => {
  assert.equal((await boris.get('/api/push')).status, 404);
  assert.equal((await boris.post('/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/x' } })).status, 404);
  assert.equal((await boris.post('/api/push/apns', { token: apple.token('boris'), env: 'production' })).status, 200);
  assert.equal((await boris.post('/api/push/test')).data.ok, true);
  const m = await waitPush((x) => x.title === 'Уведомления включены');
  assert.equal(m.headers['apns-topic'], 'ru.torgana.app');
  const db = new DatabaseSync(path.join(srv.tmp, 'data', 'torgana.db'));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'push_subs'").get().n, 0, 'таблицы подписок браузеров нет');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'vapid'").get().n, 0, 'ключа VAPID нет');
  db.close();
});

let bike;
test('подписка на продавца: новое объявление → push и счётчик нового; сохранённых поисков больше нет', async () => {
  assert.equal((await boris.post(`/api/users/${anna.user.id}/follow`, { follow: true })).status, 200);
  bike = await publish(anna, admin, { title: 'Велосипед детский', description: 'Для 5–8 лет', category: 'hobby', city: 'Казань', price: 9000 });
  const m = await waitPush((x) => x.title === 'Новое у продавца Анна');
  assert.match(m.body, /Велосипед детский — 9/);
  assert.equal(m.url, `/l/${bike}`);
  const me = (await boris.get('/api/me')).data;
  assert.equal(me.fresh.follow, 1);
  assert.equal(me.fresh.search, undefined);
  await boris.get('/api/my/following');
  assert.equal((await boris.get('/api/me')).data.fresh.follow, 0, 'открыл подписки — просмотрено');

  // Своё объявление себе не присылаем.
  await publish(boris, admin, { title: 'Самокат', category: 'hobby', city: 'Казань', price: 3000 });
  await waitPush((x) => x.title === 'Объявление опубликовано' && x.body.includes('Самокат')); // решение модерации — да
  assert.ok(!apple.to('boris').some((x) => /^Новое у продавца Борис/.test(x.title)), 'по своему объявлению — нет');
});

test('снижение цены в избранном: push, зачёркнутая цена; повышение — без уведомлений', async () => {
  await boris.post(`/api/favorites/${bike}`, {}, { origin: srv.base });
  const cur = (await anna.get(`/api/listings/${bike}`)).data.listing;
  await anna.patch(`/api/listings/${bike}`, { title: cur.title, description: cur.description, category: cur.category, city: cur.city, price: 7000 });
  await admin.post(`/api/admin/listings/${bike}/restore`);
  const m = await waitPush((x) => x.title === 'Цена снижена');
  assert.match(m.body, /7\s000 ₽ вместо 9\s000 ₽/);
  const fav = (await boris.get('/api/favorites')).data.items.find((i) => i.id === bike);
  assert.equal(fav.priceWas, 9000);
  assert.equal((await boris.get(`/api/listings/${bike}`)).data.listing.priceWas, 9000);
  // Повторная публикация не рассылает объявление подписчикам заново.
  assert.equal(apple.to('boris').filter((x) => x.body.includes('Велосипед детский —')).length, 1);
});

test('чат: фото в сообщении, push собеседнику; выключенный вид push не приходит', async () => {
  const conv = (await boris.post('/api/conversations', { listingId: bike })).data.id;
  await boris.post(`/api/conversations/${conv}/messages`, { body: 'Здравствуйте!' });
  const up = (await anna.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` })).data;
  assert.equal((await anna.post(`/api/conversations/${conv}/messages`, { photo: 'чужое.png' })).status, 400);
  const sent = await anna.post(`/api/conversations/${conv}/messages`, { photo: up.file });
  assert.equal(sent.data.message.photo, up.url);
  const m = await waitPush((x) => x.tag === `chat-${conv}`);
  assert.equal(m.body, '📷 Фото');
  assert.equal((await boris.get(`/api/conversations/${conv}`)).data.messages[1].photo, up.url);

  await boris.patch('/api/me', { pushMessages: false });
  assert.equal((await boris.get('/api/me')).data.user.pushMessages, false);
  const n = apple.got.length;
  await anna.post(`/api/conversations/${conv}/messages`, { body: 'Можно посмотреть завтра' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(apple.got.length, n);
});

test('подборка за день: новое у продавца и снижение цены одним письмом', async () => {
  // Новое объявление продавца, на которого подписан Борис, — он его ещё не видел.
  await publish(anna, admin, { title: 'Велосипед BMX', category: 'hobby', city: 'Казань', price: 12000 });
  await admin.put('/api/admin/mail', { host: '127.0.0.1', port: smtp.port, security: 'none', user: smtp.user, pass: smtp.pass, from: 'no-reply@torgana.test' });
  const m = await smtp.waitFor((x) => x.to === 'boris@test.local' && /Новое у продавца/.test(x.subject), 6000);
  assert.match(m.html, /Велосипед BMX/);
  assert.match(m.html, /Подборка за день/);
  assert.match(m.headers, /List-Unsubscribe/);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(smtp.inbox.filter((x) => x.to === 'boris@test.local' && /Новое у продавца/.test(x.subject)).length, 1, 'не чаще раза в сутки');
});

test('приложение удалили (Apple ответил 410) — адрес устройства удаляется', async () => {
  await boris.post('/api/push/apns', { token: apple.GONE, env: 'production' });
  assert.equal(devices(boris.user.id), 2);
  await boris.post('/api/push/test');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(devices(boris.user.id), 1);
});

// 1.47.2: отзывов нет — и переключателей уведомлений о них тоже.
test('переключателей об отзывах нет', async () => {
  const me = (await anna.get('/api/me')).data.user;
  assert.equal(me.pushReviews, undefined);
  assert.equal(me.notifyReviews, undefined);
  assert.equal(me.pushModeration, true);
});

// 1.47.2: push модераторам — сразу, о выбранном; свои действия себе не присылаем.
test('push модератору: новое на проверку и поддержка; выключенный вид и свои действия — нет', async () => {
  await apple.phone(admin, 'admin');
  const mine = () => apple.to('admin');
  const waitAdm = async (fn) => {
    for (let t = 0; t < 4000; t += 50) { const hit = mine().find(fn); if (hit) return hit; await new Promise((r) => setTimeout(r, 50)); }
    throw new Error(`push модератору не пришёл; есть: ${mine().map((x) => x.title).join('; ')}`);
  };
  assert.deepEqual((await admin.get('/api/admin/me/notify')).data.push, ['pending', 'sellers', 'waiting', 'appeals', 'reports', 'support', 'biz', 'rep', 'pay', 'medals', 'digest', 'ops']);
  const id = (await anna.post('/api/listings', { title: 'Комод из дуба', category: 'hobby', city: 'Казань', price: '5000' })).data.id;
  const m = await waitAdm((x) => x.title === 'Новое объявление на проверку');
  assert.match(m.body, /«Комод из дуба» — Анна\. В очереди: \d+/);
  assert.equal(m.url, `/admin/l/${id}`);
  await anna.post('/api/support/messages', { body: 'Здравствуйте! Как поднять объявление?' });
  const s = await waitAdm((x) => x.title === 'Поддержка: Анна');
  assert.match(s.body, /Как поднять объявление/);
  // Выключил жалобы — о жалобе не приходит; своё объявление — тоже нет.
  assert.deepEqual((await admin.put('/api/admin/me/notify', { push: ['pending', 'support'] })).data.push, ['pending', 'support']);
  await boris.post(`/api/listings/${bike}/report`, { reason: 'Мошенничество', text: 'Просит предоплату' });
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(!mine().some((x) => x.title.startsWith('Жалоба')), 'жалобы выключены');
  assert.equal((await admin.get('/api/admin/me/notify')).data.mode, 'hourly', 'письма не тронуты');
  const user = await anna.get('/api/me');
  assert.equal(user.status, 200);
});

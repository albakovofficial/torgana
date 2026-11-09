// Бесплатный старт первым бизнес-аккаунтам (1.38.0, 1.45.0 — бизнес-аккаунт вместо проверки ИНН, тариф выбирает сам человек)
// и подарок от модерации.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, registerUser, client } = require('./helpers');

// Регистраций с одного адреса — не больше 10 за 10 минут, поэтому аккаунты переиспользуются между тестами.
let srv; let admin; let acc; let ip; let early; let plain;
const DAY = 24 * 3600 * 1000;
before(async () => {
  srv = await startServer();
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
});
after(() => srv.stop());

async function shop(email, biz) {
  const c = await registerUser(srv.base, { name: biz.name, email });
  assert.equal((await c.post('/api/me/business', biz)).status, 200);
  return c;
}
const verify = (c) => admin.post(`/api/admin/users/${c.user.id}/business`, { decision: 'approve' });
const planOf = async (c) => (await c.get('/api/my/business')).data.plan;
const bizOn = (c) => c.put('/api/me/business-account', { on: true });
const trial = (c, plan) => c.post('/api/my/plan/trial', { plan });

const IP = { name: 'ИП Смирнова А. А.', inn: '500100732259', ogrn: '304500116000157' };
const OOO1 = { name: 'ООО «Ромашка»', inn: '7707083893', ogrn: '1027700132195' };
const OOO3 = { name: 'ООО «Василёк»', inn: '7812345675', ogrn: '1027800111228' };

test('бизнес-аккаунт: включает любой, открывает тарифы; при тарифе выключить нельзя', async () => {
  const a = acc = await registerUser(srv.base, { name: 'Частник', email: 'acc@test.local' });
  assert.equal((await a.get('/api/me')).data.user.bizAccount, false);
  assert.equal((await a.post('/api/my/plan/pay', { plan: 'shop', months: 1 })).status, 403, 'без бизнес-аккаунта тариф не купить');
  assert.equal((await bizOn(a)).status, 200);
  assert.equal((await a.get('/api/me')).data.user.bizAccount, true);
  assert.equal((await a.post('/api/my/plan/pay', { plan: 'shop', months: 1 })).status, 503, 'дальше — только «оплата не подключена»');
  await admin.post(`/api/admin/users/${a.user.id}/plan`, { plan: 'shop', days: 5 });
  assert.equal((await a.put('/api/me/business-account', { on: false })).status, 400, 'пока идёт тариф — нельзя');
  // Заявка на проверку ИНН сама включает бизнес-аккаунт.
  ip = await shop('ip@test.local', IP);
  assert.equal((await ip.get('/api/me')).data.user.bizAccount, true);
});

test('акция выключена — бесплатного старта нет', async () => {
  const c = early = await registerUser(srv.base, { name: 'Ранний', email: 'early@test.local' });
  await bizOn(c);
  assert.equal((await client(srv.base).get('/api/config')).data.billing.starter, null);
  assert.equal((await c.get('/api/my/business')).data.trial, false);
  assert.equal((await trial(c, 'pro')).status, 409);
  assert.equal(await planOf(c), null);
});

test('бесплатный старт: тариф на выбор, один раз на аккаунт, места кончаются', async () => {
  const r = await admin.put('/api/admin/starter', { on: true, days: 90, limit: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let cfg = (await client(srv.base).get('/api/config')).data.billing.starter;
  assert.deepEqual({ left: cfg.left, days: cfg.days }, { left: 2, days: 90 });

  plain = await registerUser(srv.base, { name: 'Частник', email: 'plain@test.local' });
  assert.equal((await trial(plain, 'pro')).status, 403, 'без бизнес-аккаунта — нельзя');

  const b = early;
  assert.equal((await b.get('/api/my/business')).data.trial, true);
  assert.equal((await trial(b, 'xxx')).status, 400);
  const g = await trial(b, 'shop');
  assert.equal(g.status, 200, JSON.stringify(g.data));
  const p = await planOf(b);
  assert.equal(p.id, 'shop'); assert.equal(p.trial, true);
  assert.ok(Math.abs(p.until - (Date.now() + 90 * DAY)) < 60 * 1000);
  assert.ok((await b.get('/api/notices')).data.items.find((x) => /бесплатно/.test(x.title)), 'уведомление');
  assert.equal((await trial(b, 'pro')).status, 403, 'второй раз — нет');

  const c = await registerUser(srv.base, { name: 'Магазин В', email: 'c@test.local' });
  await bizOn(c);
  assert.equal((await trial(c, 'pro')).status, 200);
  cfg = (await client(srv.base).get('/api/config')).data.billing.starter;
  assert.equal(cfg, null, 'мест нет — предложение не показываем');
  assert.equal((await trial(ip, 'pro')).status, 409, 'третьему — уже нет');
});

test('один раз на компанию: тот же ИНН с другого аккаунта не получает', async () => {
  await admin.put('/api/admin/starter', { on: true, days: 30, limit: 10 });
  const one = await shop('one@test.local', OOO1);
  await verify(one);
  assert.equal(await planOf(one), null, 'проверка сама тариф не включает');
  assert.equal((await trial(one, 'pro')).status, 200);
  const twin = await shop('twin@test.local', OOO1);
  await verify(twin);
  assert.equal((await trial(twin, 'pro')).status, 403);
  const other = await shop('other@test.local', OOO3);
  assert.equal((await trial(other, 'pro')).status, 200, 'другая компания — можно, и до проверки');
});

// 1.44.0: подарить тариф можно любому пользователю — и частнику без ИП (купить сам он по-прежнему не может).
test('подарок от модерации: любому пользователю, тот же тариф — продлевает', async () => {
  assert.equal((await admin.post(`/api/admin/users/${plain.user.id}/plan`, { plan: 'pro', days: 30 })).status, 200, 'и без подтверждённого ИП');
  assert.equal((await planOf(plain)).id, 'pro');
  const e = acc;
  assert.equal((await e.post(`/api/admin/users/${e.user.id}/plan`, { plan: 'pro', days: 30 })).status, 403, 'не модератору — нельзя');
  const r = await admin.post(`/api/admin/users/${e.user.id}/plan`, { plan: 'shop', days: 30 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const u1 = (await planOf(e)).until;
  await admin.post(`/api/admin/users/${e.user.id}/plan`, { plan: 'shop', days: 10 });
  const p = await planOf(e);
  assert.equal(p.id, 'shop'); assert.equal(p.trial, true);
  assert.ok(Math.abs(p.until - (u1 + 10 * DAY)) < 1000, 'продлили на 10 дней');

  // 1.39.0: модератор отключает тариф (даже оплаченный) — с причиной; в карточке он виден среди платных услуг.
  assert.equal((await e.post(`/api/admin/users/${e.user.id}/plan/stop`, { reason: 'Нарушение правил площадки' })).status, 403);
  assert.equal((await admin.post(`/api/admin/users/${e.user.id}/plan/stop`, { reason: 'x' })).status, 400, 'без причины — нельзя');
  assert.ok((await admin.get(`/api/admin/users/${e.user.id}`)).data.services, 'в карточке — платные услуги');
  // 1.45.0: раздел «Реклама» — все идущие тарифы, реклама и продвижение; не модератору — нельзя.
  const ads = await admin.get('/api/admin/ads');
  assert.equal(ads.status, 200);
  assert.ok(ads.data.plans.some((x) => x.user.id === e.user.id && x.plan.id === 'shop'), 'подаренный тариф в списке');
  assert.ok(Array.isArray(ads.data.promos) && Array.isArray(ads.data.boosts));
  assert.equal((await e.get('/api/admin/ads')).status, 403);
  assert.equal((await admin.post(`/api/admin/users/${e.user.id}/plan/stop`, { reason: 'Нарушение правил площадки' })).status, 200);
  assert.equal(await planOf(e), null, 'тариф отключён');
  assert.equal((await admin.post(`/api/admin/users/${e.user.id}/plan/stop`, { reason: 'Нарушение правил площадки' })).status, 404, 'второй раз — тарифа уже нет');
});

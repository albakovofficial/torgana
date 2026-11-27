'use strict';

// Оплата платных услуг через ЮKassa и цены на них.
//
// - Ключи магазина (shopId и секретный ключ) и настройки чеков вводит модератор в «Модерация → Оплата». Пока ключей нет,
//   кнопок оплаты на сайте нет — только цены.
// - Деньги не проходят через сайт: человек платит на странице ЮKassa (карта, СБП и другие способы из договора).
// - О результате ЮKassa сообщает уведомлением на /api/pay/yookassa. Уведомлению не верим на слово: сайт сам
//   запрашивает платёж в ЮKassa по своему ключу и только тогда включает услугу. Тот же запрос делает страница
//   «Оплата» после возврата человека с ЮKassa — услуга включится, даже если уведомления не настроены.
// - Сумму и что покупается считает сервер по своим ценам; браузер передаёт только выбор (тариф и срок, дни продвижения).
// - Услуга включается ровно один раз (payments.applied_at), сколько бы уведомлений ни пришло.
const crypto = require('node:crypto');

const API = 'https://api.yookassa.ru/v3';
// Цены по умолчанию, ₽. Владелец меняет их в «Модерация → Оплата». Месяц тарифа — 30 дней.
const DEFAULT_PRICES = {
  shop: { 1: 490, 3: 1290, 12: 4490 },
  pro: { 1: 1490, 3: 3990, 12: 13990 },
  promo: { 3: 99, 7: 199, 30: 590 },          // «Реклама над поиском» для бизнеса (lib/promo.js)
  boost: { xl: 99, frame: 39, tags: 29, all: 129 }, // продвижение в ленте на 7 дней (lib/boost.js); all — пакет «Всё в одном»
  proDiscount: 30 // скидка на продвижение с тарифом «Магазин Про», %
};
const MONTHS = [1, 3, 12];
const PROMO_DAYS = [3, 7, 30];
const BOOST_KEYS = ['xl', 'frame', 'tags', 'all'];
// Ставка НДС в чеке (коды ЮKassa): 1 — без НДС, 2 — 0%, 7 — 5%, 8 — 7%, 11 — 22%.
const VAT = { 1: 'Без НДС', 2: 'НДС 0%', 7: 'НДС 5%', 8: 'НДС 7%', 11: 'НДС 22%' };
// Признак способа расчёта: услуга оказывается сразу после оплаты — «полный расчёт»; иначе — «полная предоплата».
const MODES = { full_payment: 'Полный расчёт', full_prepayment: 'Полная предоплата' };
// Система налогообложения в чеке (нужна, только если у кассы их несколько): 1 — ОСН, 2 — УСН доходы, 3 — УСН доходы минус расходы, 5 — ЕСХН, 6 — патент.
const TAX = { '': 'Не передавать', 1: 'ОСН', 2: 'УСН «доходы»', 3: 'УСН «доходы минус расходы»', 5: 'ЕСХН', 6: 'Патент' };
const METHOD = { bank_card: 'Карта', sbp: 'СБП', yoo_money: 'ЮMoney', sberbank: 'SberPay', tinkoff_bank: 'T-Pay', b2b_sberbank: 'СберБизнес', mobile_balance: 'Баланс телефона' };

const money = (rub) => ({ value: `${Math.round(rub)}.00`, currency: 'RUB' });

module.exports = function billing({ route, db, h, mailer, baseUrl, testBase = '' }) {
  const { HttpError, readJson, requireAdmin, rateLimit, str, now } = h;
  const api = testBase || API; // в тестах — поддельная ЮKassa (YOOKASSA_TEST_BASE)

  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,                     -- наш номер платежа, он же ключ идемпотентности в ЮKassa
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,                      -- plan | promo | boost
      item TEXT NOT NULL DEFAULT '{}',         -- что покупают: { plan, months }, { listingId, days } или { listingId, xl, frame, tags }
      title TEXT NOT NULL,                     -- название услуги — как в чеке
      amount INTEGER NOT NULL,                 -- ₽
      status TEXT NOT NULL DEFAULT 'new',      -- new → pending → succeeded | canceled; error — ЮKassa не приняла
      yk_id TEXT NOT NULL DEFAULT '',
      confirm_url TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      test INTEGER NOT NULL DEFAULT 0,         -- платёж тестового магазина ЮKassa
      refunded INTEGER NOT NULL DEFAULT 0,     -- ₽ возвращено
      error TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      paid_at INTEGER,
      applied_at INTEGER,                      -- услуга включена (ровно один раз)
      checked_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      yk_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // ---------- настройки и цены ----------

  function config() {
    const c = db.setting('yookassa') || {};
    return { shopId: c.shopId || '', secret: c.secret || '', receipts: c.receipts !== false, vat: VAT[c.vat] ? Number(c.vat) : 1, mode: MODES[c.mode] ? c.mode : 'full_payment', tax: TAX[c.tax] && c.tax !== '' ? Number(c.tax) : '' };
  }
  const ready = () => { const c = config(); return !!(c.shopId && c.secret); };
  function prices() {
    const p = db.setting('prices') || {};
    const pick = (key, keys) => Object.fromEntries(keys.map((k) => [k, Number.isInteger(p[key] && p[key][k]) && p[key][k] > 0 ? p[key][k] : DEFAULT_PRICES[key][k]]));
    return { shop: pick('shop', MONTHS), pro: pick('pro', MONTHS), promo: pick('promo', PROMO_DAYS), boost: pick('boost', BOOST_KEYS), proDiscount: Number.isInteger(p.proDiscount) && p.proDiscount >= 0 && p.proDiscount <= 90 ? p.proDiscount : DEFAULT_PRICES.proDiscount };
  }

  // ---------- запросы к ЮKassa ----------
  async function yk(method, path, body, idem) {
    const c = config();
    const res = await fetch(`${api}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.shopId}:${c.secret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...(idem ? { 'Idempotence-Key': idem } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(j.description || `ЮKassa ответила ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return j;
  }

  // Позиция чека: одна услуга по цене платежа.
  function receipt(email, title, amount) {
    const c = config();
    if (!c.receipts) return undefined;
    return {
      customer: { email },
      items: [{ description: title.slice(0, 128), quantity: 1, amount: money(amount), vat_code: c.vat, payment_mode: c.mode, payment_subject: 'service' }],
      ...(c.tax ? { tax_system_code: c.tax } : {})
    };
  }

  // ---------- платёж ----------
  const handlers = {}; // kind → (payment, item) => описание включённого для письма
  const onPaid = (kind, fn) => { handlers[kind] = fn; };
  const resultHooks = {}; // kind → (payment, item) => что включено сейчас (для страницы «Оплата прошла»)
  const load = (id) => db.prepare('SELECT * FROM payments WHERE id = ?').get(id);

  // Создать платёж и получить адрес страницы оплаты ЮKassa.
  async function create(user, { kind, item, title, amount }) {
    if (!ready()) throw new HttpError(503, 'Оплата пока не подключена. Напишите в поддержку.');
    if (!Number.isInteger(amount) || amount < 1) throw new HttpError(400, 'Неверная сумма');
    rateLimit(`pay:${user.id}`, 20, 60 * 60 * 1000);
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO payments (id, user_id, kind, item, title, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, user.id, kind, JSON.stringify(item), title, amount, now());
    try {
      const p = await yk('POST', '/payments', {
        amount: money(amount),
        capture: true,
        confirmation: { type: 'redirect', return_url: `${baseUrl}/pay/${id}` },
        description: `${title} · Торгана`.slice(0, 128),
        metadata: { payment: id, user: String(user.id) },
        receipt: receipt(user.email, title, amount)
      }, id);
      db.prepare('UPDATE payments SET yk_id = ?, status = ?, confirm_url = ?, test = ?, checked_at = ? WHERE id = ?')
        .run(p.id, p.status === 'canceled' ? 'canceled' : 'pending', (p.confirmation && p.confirmation.confirmation_url) || '', p.test ? 1 : 0, now(), id);
      if (!p.confirmation || !p.confirmation.confirmation_url) throw new Error('ЮKassa не вернула страницу оплаты');
      return { id, url: p.confirmation.confirmation_url };
    } catch (e) {
      db.prepare('UPDATE payments SET status = \'error\', error = ? WHERE id = ?').run(String(e.message).slice(0, 300), id);
      console.error('yookassa create:', e.message);
      throw new HttpError(502, 'Не получилось открыть оплату. Попробуйте ещё раз через минуту.');
    }
  }

  // Узнать состояние платежа в ЮKassa и, если он прошёл, включить услугу.
  async function sync(p) {
    if (!p.yk_id || !ready()) return p;
    const r = await yk('GET', `/payments/${encodeURIComponent(p.yk_id)}`);
    if (r.metadata && r.metadata.payment && r.metadata.payment !== p.id) throw new Error('платёж ЮKassa от другого заказа');
    const status = r.status === 'succeeded' ? 'succeeded' : r.status === 'canceled' ? 'canceled' : 'pending';
    const method = (r.payment_method && r.payment_method.type) || p.method;
    const paidAt = status === 'succeeded' ? (p.paid_at || (r.captured_at ? Date.parse(r.captured_at) : now())) : p.paid_at;
    const err = status === 'canceled' && r.cancellation_details ? r.cancellation_details.reason : '';
    db.prepare('UPDATE payments SET status = ?, method = ?, paid_at = ?, test = ?, error = ?, checked_at = ? WHERE id = ?')
      .run(status, method, paidAt, r.test ? 1 : p.test, err, now(), p.id);
    const cur = load(p.id);
    if (status === 'succeeded' && Number(r.amount && r.amount.value) === cur.amount) apply(cur);
    return load(p.id);
  }

  function apply(p) {
    if (p.applied_at || !handlers[p.kind]) return;
    if (db.prepare('UPDATE payments SET applied_at = ? WHERE id = ? AND applied_at IS NULL').run(now(), p.id).changes !== 1) return;
    // Обработчик возвращает строку для письма или { info, url } — куда вести из письма и push.
    let info = ''; let url = '/profile/business';
    try { const r = handlers[p.kind](p, JSON.parse(p.item)) || ''; if (typeof r === 'string') info = r; else { info = r.info || ''; url = r.url || url; } } catch (e) { console.error('billing apply:', e); }
    mailer.notifyBilling(p.user_id, 'paid', { title: p.title, amount: p.amount, info, url });
    const payer = db.prepare('SELECT name FROM users WHERE id = ?').get(p.user_id);
    h.alerts.notifyAdmins('adm-pay', { сумма: `${p.amount} ₽`, услуга: p.title, плательщик: payer ? payer.name : 'пользователь' }, { url: `/admin/u/${p.user_id}` }, p.user_id);
    h.alerts.notify(p.user_id, 'paid', { услуга: p.title, итог: info || 'услуга включена' }, { url, tag: `pay-${p.id}`, icon: 'card', tone: 'ok' });
  }

  const view = (p) => ({
    id: p.id, kind: p.kind, item: JSON.parse(p.item), title: p.title, amount: p.amount, status: p.status, method: METHOD[p.method] || p.method || '',
    refunded: p.refunded, test: !!p.test, createdAt: p.created_at, paidAt: p.paid_at, applied: !!p.applied_at, error: p.status === 'error' || p.status === 'canceled' ? p.error : ''
  });

  // Уведомление от ЮKassa. Отвечаем 200, когда разобрались; при сбое — 500, чтобы ЮKassa повторила.
  route('POST', '/api/pay/yookassa', async (ctx) => {
    rateLimit(`ykhook:${ctx.ip}`, 600, 60 * 1000);
    const b = await readJson(ctx.req);
    const obj = (b && b.object) || {};
    const ykId = String(obj.payment_id || obj.id || '');
    const p = ykId ? db.prepare('SELECT * FROM payments WHERE yk_id = ?').get(ykId) : null;
    if (!p) return { ok: true }; // не наш платёж — повторять не нужно
    try { await sync(p); } catch (e) { console.error('yookassa hook:', e.message); throw new HttpError(502, 'Не получилось проверить платёж'); }
    return { ok: true };
  });

  // Страница «Оплата»: человек вернулся с ЮKassa. Пока платёж в обработке — проверяем не чаще раза в 3 секунды.
  // Вход не обязателен: «Вернуться в магазин» может открыть другой браузер (встроенный в почту или мессенджер),
  // где человек не вошёл. Номер платежа — случайный UUID, он и есть пропуск; чужому вошедшему — 404.
  route('GET', '/api/payments/:id', async (ctx) => {
    const id = String(ctx.params.id);
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, 'Платёж не найден');
    let p = load(id);
    if (!p || (ctx.user && p.user_id !== ctx.user.id)) throw new HttpError(404, 'Платёж не найден');
    if (!ctx.user) rateLimit(`payview:${ctx.ip}`, 120, 60 * 60 * 1000);
    if (p.status === 'pending' && now() - p.checked_at > Math.min(3000, GAP)) {
      try { p = await sync(p); } catch (e) { console.error('yookassa sync:', e.message); }
    }
    const v = view(p);
    if (!ctx.user) v.method = '';
    let result = null;
    if (p.applied_at && resultHooks[p.kind]) { try { result = resultHooks[p.kind](p, JSON.parse(p.item)); } catch (e) { console.error('billing result:', e.message); } }
    return { payment: v, result, url: p.status === 'pending' ? p.confirm_url : '', guest: !ctx.user };
  });

  // Сверка в фоне: если ЮKassa не прислала уведомление (не настроено или не дошло), а человек не вернулся на сайт,
  // услуга всё равно включится. Свежие платежи проверяем чаще, старше суток — не проверяем (ЮKassa их отменит сама).
  const GAP = Number(process.env.BILLING_GAP_MS) || 20 * 1000; // шаг сверки свежего платежа (в тестах — меньше)
  let reconciling = false;
  async function reconcile() {
    if (reconciling || !ready()) return 0;
    reconciling = true;
    let n = 0;
    try {
      const t = now();
      const rows = db.prepare(`SELECT * FROM payments WHERE status = 'pending' AND yk_id != '' AND created_at > ? ORDER BY created_at DESC LIMIT 50`).all(t - 24 * 3600 * 1000);
      for (const p of rows) {
        const age = t - p.created_at;
        const gap = age < 15 * 60 * 1000 ? GAP : age < 3 * 3600 * 1000 ? 6 * GAP : 45 * GAP;
        if (t - (p.checked_at || 0) < gap) continue;
        try { const r = await sync(p); if (r.status !== 'pending') n++; } catch (e) { db.prepare('UPDATE payments SET checked_at = ? WHERE id = ?').run(now(), p.id); console.error('yookassa reconcile:', e.message); }
      }
    } finally { reconciling = false; }
    return n;
  }
  setInterval(() => { reconcile().catch((e) => console.error('billing tick:', e.message)); }, Number(process.env.BILLING_TICK_MS) || 20 * 1000).unref();

  const listFor = (userId) => db.prepare('SELECT * FROM payments WHERE user_id = ? AND status IN (\'pending\', \'succeeded\', \'canceled\') ORDER BY created_at DESC LIMIT 50').all(userId).map(view);

  // Возврат: модератор указывает сумму (не больше оплаченного за вычетом прошлых возвратов) и причину.
  // admin = null — возврат делает сам сайт (продвижение не включилось, метки не прошли проверку).
  async function refund(admin, p, amount, reason, letter = {}) {
    if (p.status !== 'succeeded') throw new HttpError(400, 'Вернуть можно только оплаченный платёж');
    const left = p.amount - p.refunded;
    if (!Number.isInteger(amount) || amount < 1 || amount > left) throw new HttpError(400, `Сумма возврата — от 1 до ${left} ₽`);
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(p.user_id);
    let r;
    try {
      r = await yk('POST', '/refunds', { payment_id: p.yk_id, amount: money(amount), description: reason.slice(0, 250), receipt: receipt(user ? user.email : '', p.title, amount) }, crypto.randomUUID());
    } catch (e) { throw new HttpError(502, `ЮKassa не приняла возврат: ${e.message}`); }
    if (r.status === 'canceled') throw new HttpError(502, 'ЮKassa отменила возврат — проверьте баланс магазина');
    db.prepare('INSERT INTO refunds (payment_id, amount, yk_id, status, reason, admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(p.id, amount, r.id || '', r.status || '', reason, admin ? admin.id : null, now());
    db.prepare('UPDATE payments SET refunded = refunded + ? WHERE id = ?').run(amount, p.id);
    mailer.notifyBilling(p.user_id, 'refund', { title: p.title, amount, reason, ...letter });
    h.alerts.notify(p.user_id, 'refund', { сумма: `${amount} ₽`, услуга: p.title, причина: reason }, { url: letter.url || '/profile/business', tag: `refund-${p.id}`, icon: 'card' });
    return load(p.id);
  }

  // ---------- модерация: подключение, цены, платежи, возвраты ----------
  route('GET', '/api/admin/billing', (ctx) => {
    requireAdmin(ctx);
    const { secret, ...c } = config();
    const last = db.prepare('SELECT test FROM payments WHERE yk_id != \'\' ORDER BY created_at DESC LIMIT 1').get();
    return { config: { ...c, hasSecret: !!secret, ready: ready(), test: !!(last && last.test), webhook: `${baseUrl}/api/pay/yookassa` }, prices: prices(), defaults: DEFAULT_PRICES, vat: VAT, modes: MODES, tax: TAX };
  });

  route('PUT', '/api/admin/billing', async (ctx) => {
    const admin = requireAdmin(ctx);
    const b = await readJson(ctx.req);
    if (b.config) {
      const cur = config();
      const i = b.config;
      const next = {
        shopId: str(i.shopId, 40).replace(/\D/g, ''), secret: i.secret ? String(i.secret).trim().slice(0, 200) : cur.secret,
        receipts: i.receipts !== false, vat: VAT[i.vat] ? Number(i.vat) : 1, mode: MODES[i.mode] ? i.mode : 'full_payment', tax: TAX[i.tax] && i.tax !== '' ? Number(i.tax) : ''
      };
      if (i.clear) { next.shopId = ''; next.secret = ''; }
      if (next.secret && !/^(live|test)_[\w-]{10,}$/.test(next.secret)) throw new HttpError(400, 'Секретный ключ начинается с live_ или test_ — скопируйте его целиком из «Интеграция → Ключи API»');
      if (next.secret && !next.shopId) throw new HttpError(400, 'Укажите shopId — номер магазина из личного кабинета ЮKassa');
      db.saveSetting('yookassa', next);
      h.audit(admin, 'billing-settings', {}, { shopId: next.shopId, receipts: next.receipts, vat: next.vat, mode: next.mode, tax: next.tax });
    }
    if (b.prices) {
      const cur = prices();
      const int = (v, fallback, max) => { const n = parseInt(String(v).replace(/\s/g, ''), 10); return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback; };
      const next = {
        shop: Object.fromEntries(MONTHS.map((m) => [m, int(b.prices.shop && b.prices.shop[m], cur.shop[m], 1000000)])),
        pro: Object.fromEntries(MONTHS.map((m) => [m, int(b.prices.pro && b.prices.pro[m], cur.pro[m], 1000000)])),
        promo: Object.fromEntries(PROMO_DAYS.map((d) => [d, int(b.prices.promo && b.prices.promo[d], cur.promo[d], 1000000)])),
        boost: Object.fromEntries(BOOST_KEYS.map((k) => [k, int(b.prices.boost && b.prices.boost[k], cur.boost[k], 1000000)])),
        proDiscount: Math.min(90, Math.max(0, parseInt(b.prices.proDiscount, 10) || 0))
      };
      db.saveSetting('prices', next);
      h.audit(admin, 'billing-prices', {}, next);
    }
    return { ok: true };
  });

  route('GET', '/api/admin/payments', (ctx) => {
    requireAdmin(ctx);
    const t = now();
    const sum = (since) => db.prepare('SELECT COALESCE(SUM(amount - refunded), 0) AS s, COUNT(*) AS n FROM payments WHERE status = \'succeeded\' AND test = 0 AND paid_at > ?').get(since);
    const f = ['succeeded', 'pending', 'canceled', 'refunded'].includes(ctx.query.get('f')) ? ctx.query.get('f') : '';
    const where = f === 'refunded' ? 'p.refunded > 0' : f ? 'p.status = ?' : 'p.status IN (\'pending\', \'succeeded\', \'canceled\', \'error\')';
    const offset = Math.max(0, parseInt(ctx.query.get('offset') || '0', 10) || 0);
    const rows = db.prepare(`SELECT p.*, u.name, u.email, u.avatar FROM payments p JOIN users u ON u.id = p.user_id WHERE ${where} ORDER BY p.created_at DESC LIMIT 51 OFFSET ?`)
      .all(...(f && f !== 'refunded' ? [f] : []), offset);
    return {
      totals: { today: sum(t - 24 * 3600 * 1000), month: sum(t - 30 * 24 * 3600 * 1000), all: sum(0) },
      items: rows.slice(0, 50).map((r) => ({ ...view(r), user: { id: r.user_id, name: r.name, email: r.email, avatar: h.photoUrl(r.avatar) }, refunds: db.prepare('SELECT amount, reason, created_at AS at FROM refunds WHERE payment_id = ? ORDER BY id').all(r.id) })),
      more: rows.length > 50
    };
  });

  // Проверить платёж в ЮKassa вручную (если уведомление не дошло).
  route('POST', '/api/admin/payments/:id/sync', async (ctx) => {
    requireAdmin(ctx);
    const p = load(String(ctx.params.id));
    if (!p) throw new HttpError(404, 'Платёж не найден');
    try { return { payment: view(await sync(p)) }; } catch (e) { throw new HttpError(502, `ЮKassa: ${e.message}`); }
  });

  const refundHooks = {}; // kind → (payment, item, admin) — завершить услугу при возврате
  route('POST', '/api/admin/payments/:id/refund', async (ctx) => {
    const admin = requireAdmin(ctx);
    const p = load(String(ctx.params.id));
    if (!p) throw new HttpError(404, 'Платёж не найден');
    const b = await readJson(ctx.req);
    const reason = str(b.reason, 250);
    if (reason.length < 5) throw new HttpError(400, 'Напишите причину возврата — её увидит покупатель');
    const after = await refund(admin, p, parseInt(b.amount, 10), reason);
    if (b.stop && refundHooks[p.kind]) refundHooks[p.kind](p, JSON.parse(p.item), admin);
    h.audit(admin, 'payment-refund', { userId: p.user_id }, { title: p.title, amount: parseInt(b.amount, 10), reason, stop: !!b.stop });
    return { payment: view(after) };
  });

  return { create, ready, prices, config, onPaid, onResult: (kind, fn) => { resultHooks[kind] = fn; }, reconcile, onRefund: (kind, fn) => { refundHooks[kind] = fn; }, refund, load, listFor, view, MONTHS, PROMO_DAYS, METHOD };
};

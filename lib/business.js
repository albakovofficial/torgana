'use strict';

// Тарифы для бизнеса: «Магазин» и «Магазин Про». Частным лицам всё по-прежнему бесплатно и без лимитов —
// тариф ничего не открывает в размещении, он даёт инструменты магазину:
// - «Магазин»: витрина на странице продавца (обложка, описание, часы, адрес, доставка, сайт), значок «Магазин»,
//   статистика по всем объявлениям сразу с выгрузкой в CSV;
// - «Магазин Про»: всё из «Магазина» + до 3 закреплённых объявлений в начале витрины (1.49.0) + скидка на продвижение.
// Подключает любой пользователь (1.61.0 — без отдельного «бизнес-аккаунта»); проверка ИНН (lib/trust.js) —
// по желанию, ради значка проверенного бизнеса. Без автоплатежей: продлевают сами.
// Месяц тарифа — 30 дней. Новая оплата того же тарифа продлевает срок; переход на другой тариф пересчитывает
// оставшиеся дни по цене месяца: 10 дней «Магазина» = 10 × 490 / 1490 ≈ 3 дня «Магазина Про».
const DAY = 24 * 3600 * 1000;
const PLANS = { shop: 'Магазин', pro: 'Магазин Про' };

module.exports = function business({ route, db, h, billing, mailer, stats }) {
  const { HttpError, readJson, requireUser, requireAdmin, str, now, photoUrl } = h;

  const planOf = (u) => (u && PLANS[u.plan] && u.plan_until > now() ? { id: u.plan, name: PLANS[u.plan], until: u.plan_until, trial: !!u.plan_trial } : null);
  const userRow = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  // 1.50.0: официальный аккаунт Торганы — аккаунт владельца (первый адрес в ADMIN_EMAIL). Витрина, статистика
  // и закреплённые у него работают без тарифа; на витрине вместо тарифа — «Официальный аккаунт».
  const isOfficial = (u) => !!(u && u.is_admin && h.OWNER_EMAIL && u.email === h.OWNER_EMAIL);
  function requirePlan(ctx, need = 'shop') {
    const u = requireUser(ctx);
    if (isOfficial(u)) return u;
    const p = planOf(u);
    if (!p) throw new HttpError(403, 'Нужен тариф «Магазин» или «Магазин Про»');
    if (need === 'pro' && p.id !== 'pro') throw new HttpError(403, 'Это есть в тарифе «Магазин Про»');
    return u;
  }

  // Закреплённые на витрине (1.49.0): id объявлений в порядке закрепления, не больше PIN_MAX; только «Магазин Про».
  const PIN_MAX = 3;
  const pinsOf = (u) => { try { const a = JSON.parse(u.shop_pins || '[]'); return Array.isArray(a) ? a.map(Number).filter(Number.isInteger).slice(0, PIN_MAX) : []; } catch { return []; } };

  // Витрина для публичной страницы продавца (только при оплаченном тарифе).
  function shopOf(u) {
    const p = planOf(u);
    const official = isOfficial(u);
    if (!p && !official) return null;
    return { plan: official ? 'official' : p.id, official, name: u.biz_status === 'verified' ? u.biz_name : u.name, cover: photoUrl(u.shop_cover), about: u.shop_about, hours: u.shop_hours, address: u.shop_address, site: u.shop_site,
      delivery: u.shop_delivery, pins: official || p.id === 'pro' ? pinsOf(u) : [] };
  }

  // ---------- покупка ----------
  route('POST', '/api/my/plan/pay', async (ctx) => {
    const u = requireUser(ctx);
    const b = await readJson(ctx.req);
    const plan = PLANS[b.plan] ? b.plan : null;
    const months = billing.MONTHS.includes(Number(b.months)) ? Number(b.months) : null;
    if (!plan || !months) throw new HttpError(400, 'Выберите тариф и срок');
    const amount = billing.prices()[plan][months];
    const title = `Тариф «${PLANS[plan]}» на Торгане, ${months} мес. (${months * 30} дней)`;
    return billing.create(u, { kind: 'plan', item: { plan, months }, title, amount });
  });

  // Оплата прошла — продлеваем или переводим тариф.
  billing.onResult('plan', (p) => { const u = userRow(p.user_id); const cur = u && planOf(u); return cur ? { plan: cur.id, endsAt: cur.until } : null; });
  billing.onPaid('plan', (p, item) => {
    const u = userRow(p.user_id);
    if (!u || !PLANS[item.plan]) return '';
    const pr = billing.prices();
    const t = now();
    const cur = planOf(u);
    let base = t;
    if (cur && cur.id === item.plan) base = cur.until;
    else if (cur && !cur.trial) base = t + Math.round((cur.until - t) * (pr[cur.id][1] / pr[item.plan][1])); // остаток прежнего тарифа по цене месяца; пробные дни не пересчитываем
    const until = base + item.months * 30 * DAY;
    db.prepare('UPDATE users SET plan = ?, plan_until = ?, plan_reminded = 0, plan_trial = 0 WHERE id = ?').run(item.plan, until, u.id);
    return `тариф «${PLANS[item.plan]}» действует до ${new Date(until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })}`;
  });

  // Возврат с завершением услуги — тариф заканчивается сейчас.
  billing.onRefund('plan', (p) => {
    db.prepare('UPDATE users SET plan_until = ? WHERE id = ? AND plan_until > ?').run(now(), p.user_id, now());
  });

  // ---------- витрина ----------
  route('PUT', '/api/my/shop', async (ctx) => {
    const u = requirePlan(ctx);
    const b = await readJson(ctx.req);
    const about = str(b.about, 1500);
    const hours = str(b.hours, 120);
    const address = str(b.address, 200);
    const delivery = str(b.delivery, 200);
    let site = str(b.site, 200);
    if (site) {
      if (!/^https?:\/\//i.test(site)) site = `https://${site}`;
      let url;
      try { url = new URL(site); } catch { throw new HttpError(400, 'Проверьте адрес сайта'); }
      if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) throw new HttpError(400, 'Проверьте адрес сайта');
      site = url.href.replace(/\/$/, '');
    }
    // Обложка: своя загрузка (/api/uploads), не фото объявления; '' — убрать.
    let cover = u.shop_cover;
    if (b.cover !== undefined) {
      cover = String(b.cover || '');
      if (cover && cover !== u.shop_cover) {
        const row = db.prepare('SELECT listing_id FROM uploads WHERE file = ? AND user_id = ?').get(cover, u.id);
        if (!row || row.listing_id !== null) throw new HttpError(400, 'Сначала загрузите обложку');
      }
    }
    db.prepare('UPDATE users SET shop_about = ?, shop_hours = ?, shop_address = ?, shop_site = ?, shop_delivery = ?, shop_cover = ? WHERE id = ?').run(about, hours, address, site, delivery, cover, u.id);
    return { shop: shopOf(userRow(u.id)) };
  });

  // 1.49.0: закрепить объявление в начале витрины (до PIN_MAX) или открепить. Только своё опубликованное, тариф «Магазин Про».
  route('PUT', '/api/my/shop/pins', async (ctx) => {
    const u = requirePlan(ctx, 'pro');
    const b = await readJson(ctx.req);
    const id = parseInt(b.id, 10);
    const l = db.prepare('SELECT id, user_id, status FROM listings WHERE id = ?').get(id);
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    let pins = pinsOf(u).filter((x) => x !== id && db.prepare('SELECT 1 FROM listings WHERE id = ? AND user_id = ? AND status = \'active\'').get(x, u.id));
    if (b.pin) {
      if (l.status !== 'active') throw new HttpError(400, 'Закрепить можно только опубликованное объявление');
      if (pins.length >= PIN_MAX) throw new HttpError(400, `Закрепить можно до ${PIN_MAX} объявлений — сначала открепите одно`);
      pins = [...pins, id];
    }
    db.prepare('UPDATE users SET shop_pins = ? WHERE id = ?').run(JSON.stringify(pins), u.id);
    return { shop: shopOf(userRow(u.id)) };
  });

  // Модератор убирает витрину, если она нарушает правила (тариф остаётся).
  route('POST', '/api/admin/users/:id/shop/clear', async (ctx) => {
    const admin = requireAdmin(ctx);
    const u = userRow(parseInt(ctx.params.id, 10));
    if (!u) throw new HttpError(404, 'Пользователь не найден');
    const reason = str((await readJson(ctx.req)).reason, 500);
    if (reason.length < 5) throw new HttpError(400, 'Напишите причину — её увидит продавец');
    db.prepare('UPDATE users SET shop_about = \'\', shop_hours = \'\', shop_address = \'\', shop_site = \'\', shop_delivery = \'\', shop_cover = \'\', shop_pins = \'[]\' WHERE id = ?').run(u.id);
    h.audit(admin, 'shop-cleared', { userId: u.id }, { reason });
    h.alerts.notify(u.id, 'shop-cleared', { причина: reason }, { url: '/profile/business/shop', tag: 'shop', icon: 'store', tone: 'bad' });
    mailer.notifyBilling(u.id, 'shop-cleared', { reason });
    return { ok: true };
  });

  // ---------- статистика магазина ----------
  const MSK = 3 * 3600 * 1000;
  const dayOf = (ts) => new Date(ts + MSK).toISOString().slice(0, 10);
  const shift = (day, n) => new Date(Date.parse(day) + n * DAY).toISOString().slice(0, 10);
  function shopStats(userId, period) {
    const end = dayOf(now());
    const start = shift(end, -(period - 1));
    const sum = (from, to) => db.prepare(`SELECT COALESCE(SUM(s.impressions),0) AS impressions, COALESCE(SUM(s.views),0) AS views, COALESCE(SUM(s.favs),0) AS favs,
        COALESCE(SUM(s.src_search),0) AS search, COALESCE(SUM(s.src_home),0) AS home, COALESCE(SUM(s.src_category),0) AS category,
        COALESCE(SUM(s.src_external),0) AS external, COALESCE(SUM(s.src_other),0) AS other, COALESCE(SUM(s.src_ad),0) AS ad
      FROM listing_stats s JOIN listings l ON l.id = s.listing_id WHERE l.user_id = ? AND s.day >= ? AND s.day <= ?`).get(userId, from, to);
    const cur = sum(start, end);
    const prev = sum(shift(start, -period), shift(start, -1));
    const rows = db.prepare(`SELECT s.day, SUM(s.impressions) AS impressions, SUM(s.views) AS views, SUM(s.favs) AS favs
      FROM listing_stats s JOIN listings l ON l.id = s.listing_id WHERE l.user_id = ? AND s.day >= ? GROUP BY s.day`).all(userId, start);
    const byDay = Object.fromEntries(rows.map((r) => [r.day, r]));
    const daily = [];
    for (let i = period - 1; i >= 0; i--) { const d = shift(end, -i); daily.push({ day: d, impressions: byDay[d]?.impressions || 0, views: byDay[d]?.views || 0, favs: byDay[d]?.favs || 0 }); }
    const top = db.prepare(`SELECT l.id, l.title, l.price, l.price_unit, l.status, (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
        COALESCE(SUM(s.impressions),0) AS impressions, COALESCE(SUM(s.views),0) AS views, COALESCE(SUM(s.favs),0) AS favs,
        COALESCE(SUM(s.src_search + s.src_home + s.src_category + s.src_ad),0) AS list_views
      FROM listings l LEFT JOIN listing_stats s ON s.listing_id = l.id AND s.day >= ? AND s.day <= ?
      WHERE l.user_id = ? AND l.status IN ('active', 'sold', 'archived') GROUP BY l.id ORDER BY views DESC, impressions DESC, l.id DESC LIMIT 200`).all(start, end, userId);
    return {
      period, start, end,
      totals: { impressions: cur.impressions, views: cur.views, favs: cur.favs },
      prev: { impressions: prev.impressions, views: prev.views, favs: prev.favs },
      sources: { search: cur.search, home: cur.home, category: cur.category, external: cur.external, other: cur.other, ad: cur.ad },
      daily,
      listings: top.map((r) => ({ id: r.id, title: r.title, price: r.price, priceUnit: r.price_unit, status: r.status, photo: photoUrl(r.photo), impressions: r.impressions, views: r.views, favs: r.favs, listViews: r.list_views })),
      active: db.prepare('SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = \'active\'').get(userId).n,
      favNow: db.prepare('SELECT COUNT(*) AS n FROM favorites f JOIN listings l ON l.id = f.listing_id WHERE l.user_id = ?').get(userId).n
    };
  }
  const periodOf = (ctx) => ({ 7: 7, 30: 30, 90: 90 }[ctx.query.get('days') || '30'] || 30);

  route('GET', '/api/my/shop/stats', (ctx) => shopStats(requirePlan(ctx).id, periodOf(ctx)));

  // Выгрузка для Excel: разделитель «;», BOM — чтобы кириллица открылась без настройки.
  route('GET', '/api/my/shop/stats.csv', (ctx) => {
    const u = requirePlan(ctx);
    const s = shopStats(u.id, periodOf(ctx));
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Объявление', 'Ссылка', 'Цена, ₽', 'Статус', 'Показы', 'Переходы', 'Из показа в переход, %', 'В избранное'].map(q).join(';')];
    const ST = { active: 'Опубликовано', sold: 'Продано', archived: 'Снято' };
    for (const l of s.listings) {
      lines.push([l.title, `${h.PUBLIC_URL}/l/${l.id}`, l.price ?? '', ST[l.status] || l.status, l.impressions, l.views, l.impressions ? (Math.min(100, (l.listViews / l.impressions) * 100)).toFixed(1).replace('.', ',') : '', l.favs].map(q).join(';'));
    }
    lines.push('', [q('По дням'), q('Показы'), q('Переходы'), q('В избранное')].join(';'));
    for (const d of s.daily) lines.push([d.day, d.impressions, d.views, d.favs].map(q).join(';'));
    return h.file('text/csv; charset=utf-8', `﻿${lines.join('\r\n')}\r\n`, `torgana-stats-${s.start}-${s.end}.csv`);
  });

  // ---------- письмо «тариф заканчивается» за 3 дня ----------
  function remindTick() {
    const t = now();
    const rows = db.prepare('SELECT id, plan, plan_until, plan_trial FROM users WHERE plan != \'\' AND plan_until > ? AND plan_until < ? AND plan_reminded = 0 AND is_blocked = 0').all(t, t + 3 * DAY);
    for (const r of rows) {
      const what = r.plan_trial ? `Пробный «${PLANS[r.plan]}»` : `Тариф «${PLANS[r.plan]}»`;
      mailer.notifyBilling(r.id, 'plan-ending', { title: what, until: r.plan_until, url: '/business' });
      h.alerts.notify(r.id, 'plan-ending', { тариф: PLANS[r.plan], дата: dateRu(r.plan_until), действие: r.plan_trial ? 'подключите тариф' : 'продлите' }, { url: '/business', tag: 'plan', icon: 'store', tone: 'wait' });
      db.prepare('UPDATE users SET plan_reminded = 1 WHERE id = ?').run(r.id);
    }
    return rows.length;
  }
  setInterval(() => { try { remindTick(); } catch (e) { console.error('plan remind:', e.message); } }, 30 * 60 * 1000).unref();

  // ---------- бесплатный старт первым магазинам и подарок от модерации ----------
  // Настройка starter: { on, days, limit }. 1.45.0: тариф («Магазин» или «Магазин Про») выбирает сам человек на странице
  // «Для бизнеса» — 0 ₽ на starter.days дней, дальше по обычной цене (автоплатежей нет). Один раз на аккаунт
  // и, у проверенного бизнеса, один раз на ИНН; пока не кончились места. Оплата во время пробного: тот же тариф —
  // с конца пробного, другой — с сегодня.
  const STARTER0 = { on: false, days: 90, limit: 100 };
  const starter = () => { const { on, days, limit } = { ...STARTER0, ...(db.setting('starter') || {}) }; return { on, days, limit }; };
  const starterUsed = () => db.prepare('SELECT COUNT(*) AS n FROM users WHERE trial_at IS NOT NULL').get().n;
  const dateRu = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
  function setPlan(u, plan, days, trial) {
    const until = now() + days * DAY;
    db.prepare('UPDATE users SET plan = ?, plan_until = ?, plan_reminded = 0, plan_trial = ? WHERE id = ?').run(plan, until, trial ? 1 : 0, u.id);
    return until;
  }
  // Почему человеку нельзя взять бесплатный старт ('' — можно).
  function trialBlock(u) {
    const st = starter();
    if (!st.on || starterUsed() >= st.limit) return 'Бесплатные места закончились';
    if (u.is_blocked) return 'Аккаунт заблокирован';
    if (u.trial_at) return 'Бесплатный период уже был';
    if (planOf(u)) return 'Тариф уже действует';
    if (u.biz_inn && db.prepare('SELECT 1 FROM trial_inns WHERE inn = ?').get(u.biz_inn)) return 'Бесплатный период для этой компании уже был';
    return '';
  }
  route('POST', '/api/my/plan/trial', async (ctx) => {
    const u = requireUser(ctx);
    const b = await readJson(ctx.req);
    const plan = PLANS[b.plan] ? b.plan : null;
    if (!plan) throw new HttpError(400, 'Выберите тариф');
    const why = trialBlock(u);
    if (why) throw new HttpError(why === 'Бесплатные места закончились' ? 409 : 403, why);
    const t = now();
    db.prepare('UPDATE users SET trial_at = ? WHERE id = ?').run(t, u.id);
    if (u.biz_inn) db.prepare('INSERT OR IGNORE INTO trial_inns (inn, user_id, at) VALUES (?, ?, ?)').run(u.biz_inn, u.id, t);
    const days = starter().days;
    const until = setPlan(u, plan, days, true);
    h.alerts.notify(u.id, 'plan-trial', { тариф: PLANS[plan], дата: dateRu(until) }, { url: '/profile/business', tag: 'plan', icon: 'store', tone: 'ok' });
    return { plan: planOf(userRow(u.id)) };
  });
  const starterView = () => { const st = starter(); const used = starterUsed(); return { ...st, used, left: Math.max(0, st.limit - used) }; };
  // Для страницы «Для бизнеса»: только когда акция идёт и места есть.
  const starterPublic = () => { const v = starterView(); return v.on && v.left > 0 ? { days: v.days, limit: v.limit, left: v.left } : null; };

  route('GET', '/api/admin/starter', (ctx) => { requireAdmin(ctx); return starterView(); });
  route('PUT', '/api/admin/starter', async (ctx) => {
    const admin = requireAdmin(ctx);
    const b = await readJson(ctx.req);
    const int = (v, d, min, max) => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= min && n <= max ? n : d; };
    const cur = starter();
    const next = { on: !!b.on, days: int(b.days, cur.days, 1, 365), limit: int(b.limit, cur.limit, 1, 100000) };
    db.saveSetting('starter', next);
    h.audit(admin, 'starter-settings', {}, next);
    return starterView();
  });
  // Подарить тариф любому пользователю (1.44.0: и без подтверждённого ИП — решение владельца; витрина тогда под его именем).
  route('POST', '/api/admin/users/:id/plan', async (ctx) => {
    const admin = requireAdmin(ctx);
    const u = userRow(parseInt(ctx.params.id, 10));
    if (!u) throw new HttpError(404, 'Пользователь не найден');
    if (u.is_blocked) throw new HttpError(400, 'Пользователь заблокирован');
    const b = await readJson(ctx.req);
    const plan = PLANS[b.plan] ? b.plan : null;
    const days = parseInt(b.days, 10);
    if (!plan || !Number.isInteger(days) || days < 1 || days > 365) throw new HttpError(400, 'Выберите тариф и срок от 1 до 365 дней');
    const cur = planOf(u);
    let until;
    if (cur && cur.id === plan) { until = cur.until + days * DAY; db.prepare('UPDATE users SET plan_until = ?, plan_reminded = 0 WHERE id = ?').run(until, u.id); }
    else until = setPlan(u, plan, days, true);
    h.audit(admin, 'plan-gift', { userId: u.id }, { plan, days, until });
    h.alerts.notify(u.id, 'plan-gift', { тариф: PLANS[plan], дней: `${days} ${days % 10 === 1 && days % 100 !== 11 ? 'день' : [2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100) ? 'дня' : 'дней'}`, дата: dateRu(until) }, { url: '/profile/business', tag: 'plan', icon: 'store', tone: 'ok' });
    return { plan: planOf(userRow(u.id)) };
  });

  // Отключить тариф (даже оплаченный) — например, магазин нарушает правила. Деньги — отдельно, в «Платежах».
  route('POST', '/api/admin/users/:id/plan/stop', async (ctx) => {
    const admin = requireAdmin(ctx);
    const u = userRow(parseInt(ctx.params.id, 10));
    const cur = planOf(u);
    if (!cur) throw new HttpError(404, 'Тарифа нет');
    const reason = str((await readJson(ctx.req)).reason, 500);
    if (reason.length < 5) throw new HttpError(400, 'Напишите причину — её увидит продавец');
    db.prepare('UPDATE users SET plan_until = ?, plan_trial = 0 WHERE id = ?').run(now() - 1, u.id);
    h.audit(admin, 'plan-stopped', { userId: u.id }, { plan: cur.id, until: cur.until, reason });
    h.alerts.notify(u.id, 'plan-off', { тариф: cur.name, причина: reason }, { url: '/profile/business', tag: 'plan', icon: 'store', tone: 'bad' });
    return { ok: true };
  });

  // Раздел «Для бизнеса» в профиле: тариф, цены, витрина, продвижения, платежи.
  route('GET', '/api/my/business', (ctx) => {
    const u = requireUser(ctx);
    const shop = shopOf(u);
    return {
      plan: planOf(u), prices: billing.prices(), ready: billing.ready(), biz: h.trust.bizOf(u), trial: trialBlock(u) === '', trialWhy: trialBlock(u),
      shop: shop || { cover: photoUrl(u.shop_cover), about: u.shop_about, hours: u.shop_hours, address: u.shop_address, site: u.shop_site, delivery: u.shop_delivery, pins: [] },
      pinned: (shop || { pins: [] }).pins.map((id) => db.prepare('SELECT id, title FROM listings WHERE id = ? AND user_id = ? AND status = \'active\'').get(id, u.id)).filter(Boolean),
      promotions: h.promo.listFor(u.id), payments: billing.listFor(u.id)
    };
  });

  return { planOf, shopOf, isOfficial, PLANS, remindTick, requirePlan, stats, starterPublic, trialBlock };
};

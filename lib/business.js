'use strict';

// Тарифы для бизнеса: «Магазин» и «Магазин Про». Частным лицам всё по-прежнему бесплатно и без лимитов —
// тариф ничего не открывает в размещении, он даёт инструменты магазину:
// - «Магазин»: витрина на странице продавца (обложка, описание, часы, адрес, сайт), значок «Магазин»,
//   статистика по всем объявлениям сразу с выгрузкой в CSV;
// - «Магазин Про»: всё из «Магазина» + автозагрузка объявлений из фида (lib/feed.js) + скидка на продвижение.
// Подключают только ИП и компании с проверенными данными (lib/trust.js). Без автоплатежей: продлевают сами.
// Месяц тарифа — 30 дней. Новая оплата того же тарифа продлевает срок; переход на другой тариф пересчитывает
// оставшиеся дни по цене месяца: 10 дней «Магазина» = 10 × 490 / 1490 ≈ 3 дня «Магазина Про».
const DAY = 24 * 3600 * 1000;
const PLANS = { shop: 'Магазин', pro: 'Магазин Про' };

module.exports = function business({ route, db, h, billing, mailer, stats }) {
  const { HttpError, readJson, requireUser, requireAdmin, str, now, photoUrl } = h;

  const planOf = (u) => (u && PLANS[u.plan] && u.plan_until > now() ? { id: u.plan, name: PLANS[u.plan], until: u.plan_until } : null);
  const userRow = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  function requirePlan(ctx, need = 'shop') {
    const u = requireUser(ctx);
    const p = planOf(u);
    if (!p) throw new HttpError(403, 'Нужен тариф «Магазин» или «Магазин Про»');
    if (need === 'pro' && p.id !== 'pro') throw new HttpError(403, 'Автозагрузка есть в тарифе «Магазин Про»');
    return u;
  }

  // Витрина для публичной страницы продавца (только при оплаченном тарифе).
  function shopOf(u) {
    const p = planOf(u);
    if (!p) return null;
    return { plan: p.id, name: u.biz_status === 'verified' ? u.biz_name : u.name, cover: photoUrl(u.shop_cover), about: u.shop_about, hours: u.shop_hours, address: u.shop_address, site: u.shop_site };
  }

  // ---------- покупка ----------
  route('POST', '/api/my/plan/pay', async (ctx) => {
    const u = requireUser(ctx);
    const b = await readJson(ctx.req);
    const plan = PLANS[b.plan] ? b.plan : null;
    const months = billing.MONTHS.includes(Number(b.months)) ? Number(b.months) : null;
    if (!plan || !months) throw new HttpError(400, 'Выберите тариф и срок');
    if (u.biz_status !== 'verified') throw new HttpError(403, 'Тарифы — для ИП и компаний. Сначала подтвердите данные бизнеса в «Настройки → Для бизнеса».');
    const amount = billing.prices()[plan][months];
    const title = `Тариф «${PLANS[plan]}» на Торгане, ${months} мес. (${months * 30} дней)`;
    return billing.create(u, { kind: 'plan', item: { plan, months }, title, amount });
  });

  // Оплата прошла — продлеваем или переводим тариф.
  billing.onPaid('plan', (p, item) => {
    const u = userRow(p.user_id);
    if (!u || !PLANS[item.plan]) return '';
    const pr = billing.prices();
    const t = now();
    const cur = planOf(u);
    let base = t;
    if (cur && cur.id === item.plan) base = cur.until;
    else if (cur) base = t + Math.round((cur.until - t) * (pr[cur.id][1] / pr[item.plan][1])); // остаток прежнего тарифа по цене месяца
    const until = base + item.months * 30 * DAY;
    db.prepare('UPDATE users SET plan = ?, plan_until = ?, plan_reminded = 0 WHERE id = ?').run(item.plan, until, u.id);
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
    db.prepare('UPDATE users SET shop_about = ?, shop_hours = ?, shop_address = ?, shop_site = ?, shop_cover = ? WHERE id = ?').run(about, hours, address, site, cover, u.id);
    return { shop: shopOf(userRow(u.id)) };
  });

  // Модератор убирает витрину, если она нарушает правила (тариф остаётся).
  route('POST', '/api/admin/users/:id/shop/clear', async (ctx) => {
    const admin = requireAdmin(ctx);
    const u = userRow(parseInt(ctx.params.id, 10));
    if (!u) throw new HttpError(404, 'Пользователь не найден');
    const reason = str((await readJson(ctx.req)).reason, 500);
    if (reason.length < 5) throw new HttpError(400, 'Напишите причину — её увидит продавец');
    db.prepare('UPDATE users SET shop_about = \'\', shop_hours = \'\', shop_address = \'\', shop_site = \'\', shop_cover = \'\' WHERE id = ?').run(u.id);
    h.audit(admin, 'shop-cleared', { userId: u.id }, { reason });
    h.alerts.notify(u.id, 'moderation', { title: 'Витрина магазина очищена', body: reason, url: '/profile/business/shop', tag: 'shop' });
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
        COALESCE(SUM(s.impressions),0) AS impressions, COALESCE(SUM(s.views),0) AS views, COALESCE(SUM(s.favs),0) AS favs
      FROM listings l LEFT JOIN listing_stats s ON s.listing_id = l.id AND s.day >= ? AND s.day <= ?
      WHERE l.user_id = ? AND l.status IN ('active', 'sold', 'archived') GROUP BY l.id ORDER BY views DESC, impressions DESC, l.id DESC LIMIT 200`).all(start, end, userId);
    return {
      period, start, end,
      totals: { impressions: cur.impressions, views: cur.views, favs: cur.favs },
      prev: { impressions: prev.impressions, views: prev.views, favs: prev.favs },
      sources: { search: cur.search, home: cur.home, category: cur.category, external: cur.external, other: cur.other, ad: cur.ad },
      daily,
      listings: top.map((r) => ({ id: r.id, title: r.title, price: r.price, priceUnit: r.price_unit, status: r.status, photo: photoUrl(r.photo), impressions: r.impressions, views: r.views, favs: r.favs })),
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
      lines.push([l.title, `${h.PUBLIC_URL}/l/${l.id}`, l.price ?? '', ST[l.status] || l.status, l.impressions, l.views, l.impressions ? ((l.views / l.impressions) * 100).toFixed(1).replace('.', ',') : '', l.favs].map(q).join(';'));
    }
    lines.push('', [q('По дням'), q('Показы'), q('Переходы'), q('В избранное')].join(';'));
    for (const d of s.daily) lines.push([d.day, d.impressions, d.views, d.favs].map(q).join(';'));
    return h.file('text/csv; charset=utf-8', `﻿${lines.join('\r\n')}\r\n`, `torgana-stats-${s.start}-${s.end}.csv`);
  });

  // ---------- письмо «тариф заканчивается» за 3 дня ----------
  function remindTick() {
    const t = now();
    const rows = db.prepare('SELECT id, plan, plan_until FROM users WHERE plan != \'\' AND plan_until > ? AND plan_until < ? AND plan_reminded = 0 AND is_blocked = 0').all(t, t + 3 * DAY);
    for (const r of rows) {
      mailer.notifyBilling(r.id, 'plan-ending', { title: `Тариф «${PLANS[r.plan]}»`, until: r.plan_until, url: '/business' });
      h.alerts.notify(r.id, 'moderation', { title: `Тариф «${PLANS[r.plan]}» заканчивается`, body: `Действует до ${new Date(r.plan_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })} — продлите, чтобы витрина и статистика не пропали`, url: '/business', tag: 'plan' });
      db.prepare('UPDATE users SET plan_reminded = 1 WHERE id = ?').run(r.id);
    }
    return rows.length;
  }
  setInterval(() => { try { remindTick(); } catch (e) { console.error('plan remind:', e.message); } }, 30 * 60 * 1000).unref();

  return { planOf, shopOf, PLANS, remindTick, requirePlan, stats };
};

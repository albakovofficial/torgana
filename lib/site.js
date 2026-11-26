'use strict';
// Настройки площадки для страниц и модерации: справочники (/api/config, метро, «О разделе»), документы,
// поисковики и Метрика, почта и коды из писем, состояние автообновления.
const fs = require('node:fs');
const path = require('node:path');
const legal = require('./legal');
const { CATEGORIES, CITIES, PRICE_UNITS, SUPPORT_FAQ } = require('./constants');

module.exports = function site({ route, db, h, mailer, codesOn, dataDir: DATA_DIR }) {
  const { HttpError, requireAdmin, readJson, rateLimit, str, taxonomy, metro, PUBLIC_URL } = h;
  const SUPPORT_EMAIL = legal.operator().email;
  const PAYMENTS_ENABLED = false; // Безопасная сделка включится после подключения платёжной системы.

  route('GET', '/api/admin/seo', (ctx) => {
    requireAdmin(ctx);
    const base = PUBLIC_URL;
    return { seo: { yandex: '', google: '', metrika: '', mapsKey: '', ...(db.setting('seo') || {}) }, sitemap: `${base}/sitemap.xml`, robots: `${base}/robots.txt`, feed: `${base}/feeds/yandex.yml`, indexnow: h.indexnow.status() };
  });
  route('PUT', '/api/admin/seo', async (ctx) => {
    const admin = requireAdmin(ctx);
    const b = await readJson(ctx.req);
    const code = (v) => str(v, 120).replace(/^.*content=["']?([\w-]+)["']?.*$/s, '$1').replace(/[^\w-]/g, ''); // можно вставить весь <meta …>
    const metrika = str(b.metrika, 20).replace(/\D/g, '');
    const mapsKey = str(b.mapsKey, 80).trim().replace(/[^\w-]/g, ''); // ключ JavaScript API Яндекс Карт
    const next = { yandex: code(b.yandex), google: code(b.google), metrika, mapsKey };
    db.saveSetting('seo', next);
    h.audit(admin, 'seo-settings', {}, next);
    return { seo: next };
  }); // тариф и витрина — в карточке пользователя в модерации

  // Блок «О разделе» на страницах /c/…: числа, города и соседние разделы — из базы (lib/h.seo.js).
  route('GET', '/api/sections/info', (ctx) => {
    const q = ctx.query;
    const info = h.seo.sectionInfo({ category: q.get('category') || '', sub: q.get('sub') || '', city: q.get('city') || '' });
    if (!info) throw new HttpError(404, 'Раздел не найден');
    return info;
  });

  route('GET', '/api/config', () => ({
    categories: CATEGORIES,
    cities: CITIES,
    priceUnits: PRICE_UNITS,
    subcategories: taxonomy.publicTaxonomy(),
    metroCities: metro.cities(),
    ai: !!h.aiCfg(),
    aiBy: (h.aiCfg() || {}).provider || '',
    payments: PAYMENTS_ENABLED,
    mail: mailer.ready(),
    supportEmail: SUPPORT_EMAIL,
    supportFaq: SUPPORT_FAQ,
    oauth: h.oauth.enabled(),
    billing: { ready: h.billing.ready(), prices: h.billing.prices(), boostTags: h.boost.TAGS, boostDays: h.boost.BOOST_DAYS, starter: h.business.starterPublic() },
    metrika: (db.setting('seo') || {}).metrika || '',
    maps: !!(db.setting('seo') || {}).mapsKey,
    operator: (({ name, inn, ogrnip }) => ({ name, inn, ogrnip }))(legal.operator())
  }));

  // Станции метро города (для выбора в объявлении и фильтра в поиске).
  route('GET', '/api/metro', (ctx) => ({ stations: metro.stations(ctx.query.get('city') || '') }));

  // Юридические документы (реквизиты и раздел «Запрещено» подставляются на сервере).
  route('GET', '/api/pages/:slug', (ctx) => {
    const d = legal.docs({ ai: (h.aiCfg() || {}).provider || false, metrika: !!(db.setting('seo') || {}).metrika })[ctx.params.slug];
    if (!d) throw new HttpError(404, 'Страница не найдена');
    const [lead, brief] = legal.BRIEF[ctx.params.slug] || ['', []];
    return { title: d[0], html: d[1], lead, brief };
  });

  // Раздел «Почта» в модерации: подключение, проверка, журнал отправки.
  route('GET', '/api/admin/mail', (ctx) => {
    requireAdmin(ctx);
    return { config: mailer.publicConfig(), stats: mailer.stats(), codes: codesOn() };
  });

  route('PUT', '/api/admin/mail/codes', async (ctx) => {
    const a = requireAdmin(ctx);
    const on = (await readJson(ctx.req)).on === true;
    db.saveSetting('mail_codes', { on, at: Date.now(), by: a.id });
    return { codes: on };
  });

  route('PUT', '/api/admin/mail', async (ctx) => {
    requireAdmin(ctx);
    try { return { config: mailer.saveConfig(await readJson(ctx.req)) }; } catch (e) { throw new HttpError(400, e.message); }
  });

  route('POST', '/api/admin/mail/test', async (ctx) => {
    const admin = requireAdmin(ctx);
    rateLimit(`mailtest:${admin.id}`, 10, 10 * 60 * 1000);
    const to = str((await readJson(ctx.req)).to, 120) || admin.email;
    try { await mailer.sendTest(to); } catch (e) { throw new HttpError(502, e.message); }
    return { ok: true, to };
  });

  // Раздел «Версия сайта»: состояние автообновления из ветки release (файл пишет deploy/update.sh).
  route('GET', '/api/admin/update', (ctx) => {
    requireAdmin(ctx);
    try { return { update: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'update-status.json'), 'utf8')) }; } catch { return { update: null }; }
  });

  return {};
};

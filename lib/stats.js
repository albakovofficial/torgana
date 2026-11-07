'use strict';

// Статистика объявления для продавца: показы в поиске и ленте, переходы в объявление, добавления в избранное.
//
// Как защищаемся от накруток:
// - показ и переход считаются один раз в сутки (по Москве) на человека; повторные открытия и обновления не считаются;
// - «человек» — аккаунт, а для гостя — обезличенный ключ из IP и браузера с солью дня (соль меняется каждые сутки,
//   ключи прошлых дней удаляются), поэтому сами IP-адреса не хранятся;
// - не считаются: сам продавец (в том числе если он вышел из аккаунта в том же браузере в тот же день),
//   модераторы, заблокированные, роботы и запросы без браузера;
// - считаем только по сигналу от открытой страницы сайта (POST с проверкой Origin), а не по каждому запросу к API;
// - у каждого человека и у каждого IP есть дневной лимит засчитанных событий, сверх него не считается;
// - показ — карточка была на экране не меньше секунды хотя бы наполовину (решает страница).

const crypto = require('node:crypto');

const DAY_MS = 24 * 3600 * 1000;
const MSK = 3 * 3600 * 1000;
const SOURCES = ['search', 'home', 'category', 'external', 'other', 'ad']; // ad — из блока «Реклама» (продвижение)
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|python|curl|wget|httpclient|okhttp|java\/|go-http|axios|node-fetch|scrapy|phantom|lighthouse/i;
// Дневные лимиты засчитанных событий.
// Можно поменять в .env (STATS_VIEWS_PER_VIEWER и т. д.), обычно не нужно.
const envInt = (k, d) => parseInt(process.env[k], 10) || d;
const LIMITS = {
  viewsPerViewer: envInt('STATS_VIEWS_PER_VIEWER', 150), // переходы одного человека за сутки
  impPerViewer: envInt('STATS_IMPRESSIONS_PER_VIEWER', 2500), // показы одного человека за сутки
  viewsPerIpGuests: envInt('STATS_GUEST_VIEWS_PER_IP', 300), // переходы гостей с одного IP (за одним IP бывает много людей)
  impPerIpGuests: envInt('STATS_GUEST_IMPRESSIONS_PER_IP', 6000)
};

module.exports = function stats({ route, db, h }) {
  const { HttpError, readJson, rateLimit, requireUser, loadListing } = h;

  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_stats (
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      impressions INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      favs INTEGER NOT NULL DEFAULT 0,
      src_search INTEGER NOT NULL DEFAULT 0,
      src_home INTEGER NOT NULL DEFAULT 0,
      src_category INTEGER NOT NULL DEFAULT 0,
      src_external INTEGER NOT NULL DEFAULT 0,
      src_other INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (listing_id, day)
    );
    -- Кто уже засчитан сегодня: вид события (i — показ, v — переход, f — избранное), объявление, ключ человека.
    CREATE TABLE IF NOT EXISTS stat_seen (
      day TEXT NOT NULL,
      kind TEXT NOT NULL,
      listing_id INTEGER NOT NULL,
      viewer TEXT NOT NULL,
      PRIMARY KEY (day, kind, listing_id, viewer)
    ) WITHOUT ROWID;
    -- Сколько засчитано за сутки на ключ (человек или IP) — для дневных лимитов.
    CREATE TABLE IF NOT EXISTS stat_budget (
      day TEXT NOT NULL,
      key TEXT NOT NULL,
      n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, key)
    ) WITHOUT ROWID;
    -- Ключ гостя → аккаунт за сутки: чтобы не считать продавца, который вышел из аккаунта.
    CREATE TABLE IF NOT EXISTS stat_owner_keys (
      day TEXT NOT NULL,
      guest TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (day, guest, user_id)
    ) WITHOUT ROWID;
  `);
  if (!db.prepare('PRAGMA table_info(listing_stats)').all().some((c) => c.name === 'src_ad')) db.exec('ALTER TABLE listing_stats ADD COLUMN src_ad INTEGER NOT NULL DEFAULT 0');

  const dayOf = (ts) => new Date(ts + MSK).toISOString().slice(0, 10);
  const today = () => dayOf(Date.now());
  const shift = (day, n) => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);

  // Соль ключей гостей: из постоянного секрета и даты, меняется каждые сутки.
  function secret() {
    let row = db.prepare('SELECT value FROM settings WHERE key = ?').get('stats_secret');
    if (!row) {
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('stats_secret', crypto.randomBytes(32).toString('hex'));
      row = db.prepare('SELECT value FROM settings WHERE key = ?').get('stats_secret');
    }
    return row.value;
  }
  const hmac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('hex').slice(0, 24);
  const guestKey = (ctx, day) => `g:${hmac(`${day}|${ctx.ip}|${ctx.req.headers['user-agent'] || ''}`)}`;
  const ipKey = (ctx, day) => `ip:${hmac(`${day}|ip|${ctx.ip}`)}`;

  // Кого не считаем вообще. Возвращает ключ человека или null.
  function viewerOf(ctx, day) {
    const ua = String(ctx.req.headers['user-agent'] || '');
    if (!ua || ua.length < 20 || BOT_UA.test(ua)) return null;
    const u = ctx.user;
    if (u) {
      if (u.is_blocked || u.is_admin) return null;
      // запоминаем, какой гостевой ключ у этого аккаунта сегодня
      db.prepare('INSERT OR IGNORE INTO stat_owner_keys (day, guest, user_id) VALUES (?, ?, ?)').run(day, guestKey(ctx, day), u.id);
      return `u:${u.id}`;
    }
    return guestKey(ctx, day);
  }

  // Продавец этого объявления — тот же человек (в аккаунте или вышел в том же браузере сегодня).
  function isOwner(viewer, listing, day) {
    if (viewer === `u:${listing.user_id}`) return true;
    if (viewer.startsWith('g:')) return !!db.prepare('SELECT 1 FROM stat_owner_keys WHERE day = ? AND guest = ? AND user_id = ?').get(day, viewer, listing.user_id);
    return false;
  }

  // Списать из дневного лимита; false — лимит исчерпан.
  function spend(day, key, max) {
    const row = db.prepare('SELECT n FROM stat_budget WHERE day = ? AND key = ?').get(day, key);
    if (row && row.n >= max) return false;
    db.prepare('INSERT INTO stat_budget (day, key, n) VALUES (?, ?, 1) ON CONFLICT(day, key) DO UPDATE SET n = n + 1').run(day, key);
    return true;
  }

  const firstToday = (day, kind, listingId, viewer) =>
    db.prepare('INSERT OR IGNORE INTO stat_seen (day, kind, listing_id, viewer) VALUES (?, ?, ?, ?)').run(day, kind, listingId, viewer).changes === 1;

  function bump(listingId, day, col) {
    db.prepare(`INSERT INTO listing_stats (listing_id, day, ${col}) VALUES (?, ?, 1)
      ON CONFLICT(listing_id, day) DO UPDATE SET ${col} = ${col} + 1`).run(listingId, day);
  }

  const firstPhoto = (id) => {
    const r = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position LIMIT 1').get(id);
    return r ? h.photoUrl(r.file) : null;
  };

  const countable = (l) => l && l.status === 'active' && !db.prepare('SELECT is_blocked FROM users WHERE id = ?').get(l.user_id).is_blocked;

  // Переход в объявление.
  function countView(ctx, listing, src) {
    const day = today();
    const viewer = viewerOf(ctx, day);
    if (!viewer || !countable(listing) || isOwner(viewer, listing, day)) return false;
    if (!firstToday(day, 'v', listing.id, viewer)) return false;
    const guest = viewer.startsWith('g:');
    if (!spend(day, `v:${viewer}`, LIMITS.viewsPerViewer)) return false;
    if (guest && !spend(day, `v:${ipKey(ctx, day)}`, LIMITS.viewsPerIpGuests)) return false;
    const s = SOURCES.includes(src) ? src : 'other';
    if (s === 'ad' && h.onAdClick) h.onAdClick(listing, ctx); // переход из блока «Реклама» — в отчёт продвижения
    db.prepare(`INSERT INTO listing_stats (listing_id, day, views, src_${s}) VALUES (?, ?, 1, 1)
      ON CONFLICT(listing_id, day) DO UPDATE SET views = views + 1, src_${s} = src_${s} + 1`).run(listing.id, day);
    db.prepare('UPDATE listings SET views = views + 1 WHERE id = ?').run(listing.id);
    return true;
  }

  // Показы карточек в поиске и ленте — пачкой.
  function countImpressions(ctx, ids) {
    const day = today();
    const viewer = viewerOf(ctx, day);
    if (!viewer) return 0;
    const guest = viewer.startsWith('g:');
    let n = 0;
    for (const id of ids) {
      const l = loadListing(id);
      if (!countable(l) || isOwner(viewer, l, day)) continue;
      if (!firstToday(day, 'i', l.id, viewer)) continue;
      if (!spend(day, `i:${viewer}`, LIMITS.impPerViewer)) break;
      if (guest && !spend(day, `i:${ipKey(ctx, day)}`, LIMITS.impPerIpGuests)) break;
      bump(l.id, day, 'impressions');
      n++;
    }
    return n;
  }

  // Добавление в избранное (вызывается из POST /api/favorites/:id). Повторное добавление за сутки не считается.
  function countFav(ctx, listing) {
    const day = today();
    const viewer = viewerOf(ctx, day);
    if (!viewer || isOwner(viewer, listing, day)) return false;
    if (!firstToday(day, 'f', listing.id, viewer)) return false;
    bump(listing.id, day, 'favs');
    return true;
  }

  // Сигнал пришёл от открытой страницы сайта: браузер сам ставит Origin (свой домен проверен выше по цепочке)
  // и, если умеет, Sec-Fetch-Site: same-origin.
  const fromPage = (ctx) => {
    const hd = ctx.req.headers;
    return !!hd.origin && (!hd['sec-fetch-site'] || hd['sec-fetch-site'] === 'same-origin');
  };

  route('POST', '/api/stats/view', async (ctx) => {
    rateLimit(`stv:${ctx.ip}`, 120, 60 * 1000);
    const b = await readJson(ctx.req);
    if (!fromPage(ctx)) return { counted: false };
    const id = parseInt(b.id, 10);
    const l = id ? loadListing(id) : null;
    if (!l) throw new HttpError(404, 'Объявление не найдено');
    return { counted: countView(ctx, l, String(b.src || '')) };
  });

  route('POST', '/api/stats/impressions', async (ctx) => {
    rateLimit(`sti:${ctx.ip}`, 120, 60 * 1000);
    const b = await readJson(ctx.req);
    if (!fromPage(ctx)) return { counted: 0 };
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map((x) => parseInt(x, 10)).filter((x) => x > 0))].slice(0, 60);
    return { counted: countImpressions(ctx, ids) };
  });

  // Статистика одного объявления — только продавцу.
  route('GET', '/api/my/listings/:id/stats', (ctx) => {
    const u = requireUser(ctx);
    const l = loadListing(parseInt(ctx.params.id, 10));
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    const period = { 7: 7, 30: 30, 0: 0 }[ctx.query.get('days') || '30'] ?? 30;
    const end = today();
    const firstStat = db.prepare('SELECT MIN(day) AS d FROM listing_stats WHERE listing_id = ?').get(l.id).d;
    const startAll = dayOf(l.created_at) < (firstStat || end) ? dayOf(l.created_at) : (firstStat || end);
    const span = period || Math.min(180, Math.round((Date.parse(end) - Date.parse(startAll)) / DAY_MS) + 1);
    const days = [];
    for (let i = span - 1; i >= 0; i--) days.push(shift(end, -i));
    const sum = (from, to) => db.prepare(`SELECT COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(views),0) AS views, COALESCE(SUM(favs),0) AS favs,
      COALESCE(SUM(src_search),0) AS search, COALESCE(SUM(src_home),0) AS home, COALESCE(SUM(src_category),0) AS category,
      COALESCE(SUM(src_external),0) AS external, COALESCE(SUM(src_other),0) AS other, COALESCE(SUM(src_ad),0) AS ad
      FROM listing_stats WHERE listing_id = ? AND day >= ? AND day <= ?`).get(l.id, from, to);
    const cur = sum(period ? days[0] : '0000-00-00', end);
    const prev = period ? sum(shift(days[0], -period), shift(days[0], -1)) : null;
    const rows = db.prepare('SELECT day, impressions, views, favs FROM listing_stats WHERE listing_id = ? AND day >= ? ORDER BY day').all(l.id, days[0]);
    const byDay = Object.fromEntries(rows.map((r) => [r.day, r]));
    const daily = days.map((d) => ({ day: d, impressions: byDay[d]?.impressions || 0, views: byDay[d]?.views || 0, favs: byDay[d]?.favs || 0 }));
    const favNow = db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE listing_id = ?').get(l.id).n;
    const totals = { impressions: cur.impressions, views: cur.views, favs: cur.favs };
    const sources = { search: cur.search, home: cur.home, category: cur.category, external: cur.external, other: cur.other, ad: cur.ad };
    return {
      listing: { id: l.id, title: l.title, price: l.price, priceUnit: l.price_unit, status: l.status, createdAt: l.created_at, photo: firstPhoto(l.id), viewsAll: l.views },
      period, totals, prev: prev && { impressions: prev.impressions, views: prev.views, favs: prev.favs },
      today: daily.length ? daily[daily.length - 1] : { impressions: 0, views: 0, favs: 0 },
      daily, sources, favNow, since: firstStat, tip: tipFor(totals, sources, l)
    };
  });

  // Подсказка по простым правилам — только когда данных достаточно.
  // Переходы из выдачи — с тех же страниц, где считаются показы (без прямых ссылок и других страниц).
  const listViews = (s) => s.search + s.home + s.category + s.ad;
  function tipFor(t, s, l) {
    if (l.status !== 'active') return '';
    if (t.impressions >= 200 && listViews(s) / t.impressions < 0.02) return 'Объявление часто показывают, но редко открывают. Поставьте первым самое светлое и чёткое фото и проверьте цену.';
    if (t.views >= 60 && t.favs / t.views < 0.01) return 'Объявление открывают, но почти не добавляют в избранное. Добавьте фото с разных сторон и подробности в описание.';
    if (t.impressions >= 100 && t.views < 5) return 'Пока мало переходов. Проверьте, что в названии есть марка и модель — так объявление легче найти.';
    return '';
  }

  // Ключи прошлых дней не нужны: удаляем раз в час всё старше вчерашнего дня.
  function purge() {
    const keep = dayOf(Date.now() - DAY_MS);
    db.prepare('DELETE FROM stat_seen WHERE day < ?').run(keep);
    db.prepare('DELETE FROM stat_budget WHERE day < ?').run(keep);
    db.prepare('DELETE FROM stat_owner_keys WHERE day < ?').run(keep);
  }
  setInterval(purge, 60 * 60 * 1000).unref();

  // Для показов рекламы (lib/promo.js): те же правила «раз в сутки на человека», без продавца и роботов.
  function countOnce(ctx, kind, listing) {
    const day = today();
    const viewer = viewerOf(ctx, day);
    if (!viewer || !countable(listing) || isOwner(viewer, listing, day)) return false;
    if (!firstToday(day, kind, listing.id, viewer)) return false;
    return spend(day, `${kind}:${viewer}`, LIMITS.impPerViewer);
  }

  return { countFav, countOnce, fromPage, purge, dayOf, LIMITS };
};

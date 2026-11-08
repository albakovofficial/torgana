'use strict';

// Откуда приходят люди (1.38.0). Первый заход браузера: источник — метка utm_source в ссылке
// или сайт, с которого перешли (vk, instagram, telegram, max, yandex…), без них — «direct».
// Браузер запоминает источник у себя (localStorage, без cookie) и один раз сообщает о заходе (/api/visit) — без IP и меток человека.
// При регистрации (почтой или через Яндекс ID / VK ID) браузер передаёт источник, и он сохраняется у пользователя.
// Модерация видит заходы, регистрации, продавцов и объявления по источникам. Ничего личного: только метка.
const DAY = 24 * 3600 * 1000;
const MSK = 3 * 3600 * 1000;
const norm = (v, max = 40) => String(v || '').toLowerCase().trim().replace(/[^a-z0-9а-яё_.-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, max);
const dayOf = (ts) => new Date(ts + MSK).toISOString().slice(0, 10);

module.exports = function sources({ route, db, h }) {
  const { readJson, rateLimit, requireAdmin, now } = h;
  const addColumn = (t, c, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
  addColumn('users', 'src', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'src_campaign', "TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE TABLE IF NOT EXISTS visits (day TEXT NOT NULL, src TEXT NOT NULL, campaign TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, src, campaign))`);

  // Значение из браузера: «источник|кампания».
  const parse = (raw) => { const [src, campaign] = String(raw || '').slice(0, 120).split('|'); return { src: norm(src), campaign: norm(campaign, 60) }; };
  // Новый пользователь — записываем, откуда пришёл.
  function tag(userId, raw) {
    const s = parse(raw);
    if (s.src) db.prepare('UPDATE users SET src = ?, src_campaign = ? WHERE id = ? AND src = \'\'').run(s.src, s.campaign, userId);
  }

  route('POST', '/api/visit', async (ctx) => {
    // Один браузер шлёт заход один раз. Лимит — от накрутки; у мобильных операторов за одним адресом много людей,
    // поэтому он щедрый, а сверх него заход просто не считается (без ошибки в браузере).
    try { rateLimit(`visit:${ctx.ip}`, 300, 60 * 60 * 1000); } catch { return { ok: true, counted: false }; }
    const b = await readJson(ctx.req);
    const src = norm(b.src) || 'direct';
    const campaign = norm(b.campaign, 60);
    db.prepare('INSERT INTO visits (day, src, campaign, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, src, campaign) DO UPDATE SET n = n + 1').run(dayOf(now()), src, campaign);
    return { ok: true };
  });

  route('GET', '/api/admin/sources', (ctx) => {
    requireAdmin(ctx);
    const days = { 7: 7, 30: 30, 90: 90, 365: 365 }[ctx.query.get('days') || '30'] || 30;
    const since = now() - days * DAY;
    const fromDay = dayOf(since);
    const rows = new Map();
    const row = (src, campaign) => {
      const k = `${src}|${campaign}`;
      if (!rows.has(k)) rows.set(k, { src, campaign, visits: 0, signups: 0, sellers: 0, listings: 0 });
      return rows.get(k);
    };
    for (const v of db.prepare('SELECT src, campaign, SUM(n) AS n FROM visits WHERE day >= ? GROUP BY src, campaign').all(fromDay)) row(v.src, v.campaign).visits += v.n;
    const users = db.prepare(`SELECT CASE WHEN src = '' THEN 'unknown' ELSE src END AS src, src_campaign AS campaign, COUNT(*) AS signups,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM listings l WHERE l.user_id = u.id) THEN 1 ELSE 0 END) AS sellers,
        (SELECT COUNT(*) FROM listings l JOIN users u2 ON u2.id = l.user_id WHERE u2.created_at >= ? AND (CASE WHEN u2.src = '' THEN 'unknown' ELSE u2.src END) = (CASE WHEN u.src = '' THEN 'unknown' ELSE u.src END) AND u2.src_campaign = u.src_campaign) AS listings
      FROM users u WHERE u.created_at >= ? AND u.is_admin = 0 GROUP BY 1, 2`).all(since, since);
    for (const u of users) { const r = row(u.src, u.campaign); r.signups += u.signups; r.sellers += u.sellers; r.listings += u.listings; }
    const items = [...rows.values()].sort((a, b) => b.signups - a.signups || b.visits - a.visits);
    const total = items.reduce((t, r) => ({ visits: t.visits + r.visits, signups: t.signups + r.signups, sellers: t.sellers + r.sellers, listings: t.listings + r.listings }), { visits: 0, signups: 0, sellers: 0, listings: 0 });
    return { days, items, total };
  });

  return { tag, parse, norm };
};

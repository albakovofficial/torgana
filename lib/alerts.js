'use strict';

// Уведомления пользователям: push в приложение Торгана для iPhone (lib/apns.js) и подборка за день письмом.
// - Подписки на продавцов: когда объявление впервые опубликовано, — подписчикам продавца.
// - Снижение цены: при публикации после правки цена ниже прошлой опубликованной — всем, у кого объявление в избранном.
// - Push о сообщениях, ответах поддержки, решениях модерации — сразу, если человек не выключил этот вид.

const HOUR = 3600 * 1000;
const PUSH_KINDS = { messages: 'push_messages', searches: 'push_searches', prices: 'push_prices', moderation: 'push_moderation' };

module.exports = function alerts({ route, db, mailer, apns, h, categories }) {
  const { HttpError, readJson, requireUser, now } = h;
  const fmt = (n) => `${new Intl.NumberFormat('ru-RU').format(n)} ₽`;

  // ---------- уведомления внутри Торганы (1.22) ----------
  // Колокольчик в шапке: решения модерации, оплата, продвижение, снижение цен. Сохраняются всегда —
  // даже если push выключен. Сообщения чата и новое по поискам сюда не попадают: у них свои счётчики.
  // tone — ok | bad | wait (цвет значка), icon — имя значка в клиенте. Храним 90 дней.
  db.exec(`CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '', tone TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, read_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_notices_user ON notices(user_id, id DESC);`);
  const NOTICE_KINDS = new Set(['moderation', 'prices']);
  const KIND_ICON = { moderation: 'bell', prices: 'down' };
  db.exec('DELETE FROM notices WHERE kind = \'reviews\''); // 1.47.2: отзывов на сайте нет — старые уведомления о них убираем
  const addNotice = db.prepare('INSERT INTO notices (user_id, kind, title, body, url, icon, tone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const unreadNotices = (userId) => db.prepare('SELECT COUNT(*) AS n FROM notices WHERE user_id = ? AND read_at IS NULL').get(userId).n;

  // Push одного вида: учитывает переключатель человека; ошибки сети не мешают основному действию.
  function notify(userId, kind, msg) {
    if (NOTICE_KINDS.has(kind)) {
      try { addNotice.run(userId, kind, String(msg.title).slice(0, 200), String(msg.body || '').slice(0, 400), String(msg.url || ''), msg.icon || KIND_ICON[kind], msg.tone || '', now()); } catch (e) { console.error('notice:', e.message); }
    }
    const col = PUSH_KINDS[kind];
    const u = db.prepare(`SELECT is_blocked, ${col} AS on_ FROM users WHERE id = ?`).get(userId);
    if (!u || u.is_blocked || !u.on_) return;
    const { icon, tone, ...payload } = msg; // значок и цвет — только для колокольчика
    apns.send(userId, payload).catch(() => {});
  }

  route('GET', '/api/notices', (ctx) => {
    const u = requireUser(ctx);
    const items = db.prepare('SELECT id, kind, title, body, url, icon, tone, created_at AS at, read_at IS NOT NULL AS read FROM notices WHERE user_id = ? ORDER BY id DESC LIMIT 60').all(u.id)
      .map((r) => {
        // Уведомление про объявление (/l/123, /edit/123) — с его главным фото (1.25).
        const m = /^\/(?:l|edit)\/(\d+)/.exec(r.url);
        const ph = m ? db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position LIMIT 1').get(Number(m[1])) : null;
        return { ...r, read: !!r.read, photo: ph ? h.photoUrl(ph.file) : '' };
      });
    return { items, unread: unreadNotices(u.id) };
  });
  // Прочитать: { id } — одно, без id — все.
  route('POST', '/api/notices/read', async (ctx) => {
    const u = requireUser(ctx);
    const id = parseInt((await readJson(ctx.req)).id, 10);
    if (id) db.prepare('UPDATE notices SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL').run(now(), id, u.id);
    else db.prepare('UPDATE notices SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), u.id);
    return { unread: unreadNotices(u.id) };
  });
  setInterval(() => { try { db.prepare('DELETE FROM notices WHERE created_at < ?').run(now() - 90 * 24 * HOUR); } catch { /* база занята */ } }, 6 * HOUR).unref();

  // Открыл избранное — снижения цен просмотрены.
  const seenPrices = (userId) => db.prepare('UPDATE user_alerts SET seen_at = ? WHERE user_id = ? AND kind = \'price\' AND seen_at IS NULL').run(now(), userId);
  const freshCounts = (userId) => Object.fromEntries(['price', 'follow'].map((k) => [k, db.prepare('SELECT COUNT(*) AS n FROM user_alerts WHERE user_id = ? AND kind = ? AND seen_at IS NULL').get(userId, k).n]));

  // ---------- объявление опубликовано ----------
  const addAlert = db.prepare('INSERT INTO user_alerts (user_id, kind, listing_id, data, created_at) VALUES (?, ?, ?, ?, ?)');
  function onPublished(listingId) {
    const l = db.prepare('SELECT * FROM listings WHERE id = ? AND status = \'active\'').get(listingId);
    if (!l) return;
    const t = now();
    const priceText = l.price === null ? 'цена договорная' : fmt(l.price);
    // Снижение цены: только при повторной публикации (была опубликованная цена).
    if (l.published_price !== null && l.price !== null && l.price < l.published_price) {
      db.prepare('UPDATE listings SET price_was = ?, price_drop_at = ? WHERE id = ?').run(l.published_price, t, l.id);
      const fans = db.prepare('SELECT f.user_id FROM favorites f JOIN users u ON u.id = f.user_id WHERE f.listing_id = ? AND f.user_id != ? AND u.is_blocked = 0').all(l.id, l.user_id);
      for (const { user_id: uid } of fans) {
        db.prepare('DELETE FROM user_alerts WHERE user_id = ? AND kind = \'price\' AND listing_id = ? AND seen_at IS NULL').run(uid, l.id);
        addAlert.run(uid, 'price', l.id, JSON.stringify({ old: l.published_price, price: l.price }), t);
        notify(uid, 'prices', { title: 'Цена снижена', body: `${l.title}: ${fmt(l.price)} вместо ${fmt(l.published_price)}`, url: `/l/${l.id}`, tag: `price-${l.id}` });
      }
    } else if (l.price === null || l.published_price === null || l.price > l.published_price) {
      db.prepare('UPDATE listings SET price_was = NULL, price_drop_at = NULL WHERE id = ?').run(l.id);
    }
    db.prepare('UPDATE listings SET published_price = ? WHERE id = ?').run(l.price, l.id);
    // Подписчикам — один раз на объявление (повторная публикация после правки не рассылается заново).
    if (l.alerted) return;
    db.prepare('UPDATE listings SET alerted = 1 WHERE id = ?').run(l.id);
    // Подписчики продавца. Push — не чаще раза в 3 часа от одного продавца (магазин может выложить сразу много).
    const seller = db.prepare('SELECT name FROM users WHERE id = ?').get(l.user_id);
    const fans = db.prepare(`SELECT f.user_id FROM follows f JOIN users u ON u.id = f.user_id WHERE f.seller_id = ? AND u.is_blocked = 0`).all(l.user_id);
    for (const { user_id: uid } of fans) {
      const recent = db.prepare(`SELECT 1 FROM user_alerts a JOIN listings x ON x.id = a.listing_id WHERE a.user_id = ? AND a.kind = 'follow' AND x.user_id = ? AND a.created_at > ?`).get(uid, l.user_id, t - 3 * HOUR);
      addAlert.run(uid, 'follow', l.id, JSON.stringify({ seller: l.user_id }), t);
      if (!recent) notify(uid, 'searches', { title: `Новое у продавца ${seller.name}`, body: `${l.title} — ${priceText}`, url: `/l/${l.id}`, tag: `follow-${l.user_id}` });
    }
  }

  // ---------- подборка за день ----------
  // Раз в сутки, с 9 до 21 по Москве: непросмотренное новое, о котором ещё не писали; свежее — не раньше чем через час
  // (вдруг человек сам зайдёт по push).
  let opts = { minAge: HOUR, anyHour: false };
  function digestTick() {
    if (!mailer.ready()) return 0;
    const t = now();
    const mskHour = new Date(t + 3 * HOUR).getUTCHours();
    if (!opts.anyHour && (mskHour < 9 || mskHour >= 21)) return 0;
    const users = db.prepare(`SELECT DISTINCT u.id FROM user_alerts a JOIN users u ON u.id = a.user_id
      WHERE a.seen_at IS NULL AND a.emailed_at IS NULL AND a.created_at < ? AND u.notify_digest = 1 AND u.is_blocked = 0 AND u.deactivated_at IS NULL AND u.digest_at < ?`).all(t - opts.minAge, t - 22 * HOUR);
    let sent = 0;
    for (const { id: uid } of users) {
      const rows = db.prepare(`SELECT a.*, l.title, l.price, l.price_unit, l.city, l.status,
          (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo
        FROM user_alerts a JOIN listings l ON l.id = a.listing_id
        WHERE a.user_id = ? AND a.seen_at IS NULL AND a.emailed_at IS NULL AND l.status = 'active' ORDER BY a.id DESC LIMIT 40`).all(uid);
      db.prepare('UPDATE user_alerts SET emailed_at = ? WHERE user_id = ? AND emailed_at IS NULL').run(t, uid);
      db.prepare('UPDATE users SET digest_at = ? WHERE id = ?').run(t, uid);
      if (!rows.length) continue;
      const follows = new Map();
      for (const r of rows.filter((x) => x.kind === 'follow')) {
        const sid = JSON.parse(r.data).seller;
        if (!follows.has(sid)) follows.set(sid, { id: sid, name: (db.prepare('SELECT name FROM users WHERE id = ?').get(sid) || {}).name || 'Продавец', items: [] });
        follows.get(sid).items.push(r);
      }
      mailer.notifyDigest(uid, { prices: rows.filter((x) => x.kind === 'price').map((r) => ({ ...r, old: JSON.parse(r.data).old })), follows: [...follows.values()] });
      sent += 1;
    }
    return sent;
  }

  // ---------- проверка из приложения ----------
  route('POST', '/api/push/test', async (ctx) => {
    const u = requireUser(ctx);
    h.rateLimit(`pushtest:${u.id}`, 5, 10 * 60 * 1000);
    const ok = await apns.send(u.id, { title: 'Уведомления включены', body: 'Так будут выглядеть уведомления Торганы.', url: '/profile/settings#sn' });
    if (ok > 0) return { ok: true };
    const why = apns.lastError();
    return { ok: false, error: !apns.count(u.id) ? 'Это устройство не подключено к уведомлениям — выключите и снова включите их' : why ? why.text : 'Не получилось отправить — выключите и снова включите уведомления' };
  });

  // tickMs, minAge (через сколько после события можно писать) и anyHour (без окна 9–21) меняются только в тестах.
  function start({ tickMs = 60 * 1000, minAge, anyHour } = {}) {
    opts = { minAge: minAge ?? HOUR, anyHour: !!anyHour };
    setInterval(() => { try { digestTick(); } catch (e) { console.error('digest:', e.message); } }, tickMs).unref();
  }

  // Решение модерации — письмом (как раньше) и push.
  // scheduled — проверено, опубликуем в выбранное время (reason — когда); expired — прошло 30 дней, объявление снято.
  const MOD_PUSH = { approved: 'Объявление опубликовано', restored: 'Объявление снова опубликовано', 'appeal-approved': 'Апелляция одобрена', rejected: 'Объявление нужно исправить', 'appeal-denied': 'Апелляция отклонена',
    scheduled: 'Объявление проверено', expired: 'Прошло 30 дней — объявление снято' };
  const MOD_URL = { rejected: (id) => `/edit/${id}`, 'appeal-denied': (id) => `/edit/${id}`, scheduled: () => '/profile?status=scheduled', expired: () => '/profile?status=archived' };
  const MOD_LOOK = { approved: ['check', 'ok'], restored: ['check', 'ok'], 'appeal-approved': ['check', 'ok'], rejected: ['warn', 'bad'], 'appeal-denied': ['warn', 'bad'], scheduled: ['clock', 'wait'], expired: ['clock', ''] };
  function moderation(listingId, event, reason = '') {
    mailer.notifyModeration(listingId, event, reason);
    const l = db.prepare('SELECT id, title, user_id FROM listings WHERE id = ?').get(listingId);
    const body = event === 'scheduled' ? `«${l && l.title}» опубликуем ${reason}` : event === 'expired' ? `«${l && l.title}» — опубликуйте снова, это бесплатно` : reason ? `«${l && l.title}»: ${reason}` : `«${l && l.title}»`;
    if (l && MOD_PUSH[event]) notify(l.user_id, 'moderation', { title: MOD_PUSH[event], body, url: (MOD_URL[event] || ((id) => `/l/${id}`))(l.id), tag: `mod-${l.id}`, icon: MOD_LOOK[event][0], tone: MOD_LOOK[event][1] });
  }

  // 1.47.2: push модераторам — сразу, на включённые устройства. О чём — у каждого свои настройки (users.push_mod_kinds).
  // Себе не шлём (своё объявление, свой ответ). Одного вида — не чаще раза в 2 минуты на человека: при потоке
  // (много объявлений сразу) приходит одно уведомление со счётчиком очереди, а не сотня; tag заменяет прежнее на экране.
  // 1.53.0: ещё шесть видов — апелляции, новые продавцы, долгое ожидание проверки, итоги дня, сбои сайта, медали.
  // Кто ни разу не менял настройки push (push_mod_set = 0), получает все виды, в том числе добавленные позже.
  const ADMIN_PUSH_KINDS = ['pending', 'sellers', 'waiting', 'appeals', 'reports', 'support', 'biz', 'rep', 'pay', 'medals', 'digest', 'ops'];
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'push_mod_set')) {
    db.exec('ALTER TABLE users ADD COLUMN push_mod_set INTEGER NOT NULL DEFAULT 0');
    db.exec("UPDATE users SET push_mod_set = 1 WHERE push_mod_kinds != 'pending,reports,support,biz,rep,pay'"); // уже выбирали сами
  }
  const pushKindsOf = (u) => (u.push_mod_set ? String(u.push_mod_kinds || '').split(',').filter((k) => ADMIN_PUSH_KINDS.includes(k)) : ADMIN_PUSH_KINDS);
  const adminLast = new Map();
  // unless — вид, при включённом которым этот push не нужен: о первом объявлении человека приходит «Новый продавец»
  // вместо «Новое объявление на проверку», а не оба сразу.
  function notifyAdmins(kind, msg, exceptId = 0, { unless = '' } = {}) {
    if (!ADMIN_PUSH_KINDS.includes(kind)) return 0;
    let n = 0;
    for (const a of db.prepare('SELECT id, push_mod_kinds, push_mod_set FROM users WHERE is_admin = 1 AND is_blocked = 0 AND id != ?').all(exceptId || 0)) {
      const kinds = pushKindsOf(a);
      if (!kinds.includes(kind) || (unless && kinds.includes(unless))) continue;
      if (!apns.count(a.id)) continue; // push не включён ни на одном iPhone с приложением
      const k = `${a.id}:${kind}`; const t = Date.now();
      if (t - (adminLast.get(k) || 0) < 2 * 60 * 1000) continue;
      adminLast.set(k, t);
      apns.send(a.id, { tag: `adm-${kind}`, ...msg, urgent: true }).catch(() => {});
      n += 1;
    }
    return n;
  }

  // 1.53.0: по таймеру — «объявления долго ждут» (днём, не чаще раза в час) и «Итоги дня» в 21:00 по Москве.
  const plural = (n, a, b, c) => { const m = n % 100; const d = n % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
  const dur = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); const hh = Math.floor(m / 60); return m < 60 ? `${m} мин` : hh >= 48 ? `${Math.floor(hh / 24)} ${plural(Math.floor(hh / 24), 'день', 'дня', 'дней')}` : `${hh} ч${m % 60 ? ` ${m % 60} мин` : ''}`; };
  const mskNow = () => new Date(Date.now() + 3 * HOUR); // часы и дата по Москве — в UTC-полях
  const adm = { wait: Number(process.env.ADMIN_WAIT_MS) || HOUR, anyHour: process.env.ADMIN_ANY_HOUR === '1', lastWaiting: 0 };
  const setting = (k) => { try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } };
  const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
  function dayStats(since) {
    const n = (sql, ...a) => db.prepare(sql).get(...a).n;
    const pay = db.prepare('SELECT COALESCE(SUM(amount - refunded), 0) AS s, COUNT(*) AS n FROM payments WHERE status = \'succeeded\' AND test = 0 AND paid_at >= ?').get(since);
    return {
      users: n('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', since),
      listings: n('SELECT COUNT(*) AS n FROM listing_events WHERE kind = \'created\' AND created_at >= ?', since),
      approved: n('SELECT COUNT(*) AS n FROM admin_log WHERE action IN (\'approved\', \'restored\', \'appeal-approved\') AND created_at >= ?', since),
      rejected: n('SELECT COUNT(*) AS n FROM admin_log WHERE action = \'rejected\' AND created_at >= ?', since),
      paid: pay.s, payments: pay.n,
      medals: n('SELECT COUNT(*) AS n FROM users WHERE first_at >= ?', since)
    };
  }
  function adminTick() {
    const msk = mskNow(); const hour = msk.getUTCHours(); const t = Date.now();
    const pend = db.prepare('SELECT COUNT(*) AS n, MIN(updated_at) AS oldest FROM listings WHERE status = \'pending\' AND updated_at <= ?').get(t - adm.wait);
    if (pend.n && (adm.anyHour || (hour >= 9 && hour < 23)) && t - adm.lastWaiting >= Math.max(adm.wait, 5 * 60 * 1000)) {
      adm.lastWaiting = t;
      notifyAdmins('waiting', { title: `${pend.n} ${plural(pend.n, 'объявление ждёт', 'объявления ждут', 'объявлений ждут')} проверки дольше ${dur(adm.wait)}`,
        body: `Самое старое — ${dur(t - pend.oldest)}. Всего на проверке: ${pendingCount()}`, url: '/admin?status=pending' });
    }
    const day = msk.toISOString().slice(0, 10);
    if ((adm.anyHour || hour >= 21) && setting('adm_digest_day') !== day) {
      setSetting('adm_digest_day', day);
      const since = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()) - 3 * HOUR; // полночь по Москве
      const s = dayStats(since);
      const parts = [`${s.users} ${plural(s.users, 'регистрация', 'регистрации', 'регистраций')}`, `${s.listings} ${plural(s.listings, 'новое объявление', 'новых объявления', 'новых объявлений')}`,
        `одобрено ${s.approved}`, s.rejected ? `отклонено ${s.rejected}` : '', s.payments ? `оплат на ${fmt(s.paid)}` : '', s.medals ? `медалей «Один из первых» — ${s.medals}` : ''].filter(Boolean);
      notifyAdmins('digest', { title: 'Итоги дня на Торгане', body: `Сегодня: ${parts.join(' · ')}. На проверке сейчас: ${pendingCount()}`, url: '/admin' });
    }
  }
  setInterval(() => { try { adminTick(); } catch (e) { console.error('admin tick:', e.message); } }, Number(process.env.ADMIN_TICK_MS) || 5 * 60 * 1000).unref();
  const pendingCount = () => db.prepare('SELECT COUNT(*) AS n FROM listings WHERE status = \'pending\'').get().n;

  return { notify, notifyAdmins, pushKindsOf, pendingCount, ADMIN_PUSH_KINDS, moderation, onPublished, digestTick, seenPrices, freshCounts, unreadNotices, start };
};

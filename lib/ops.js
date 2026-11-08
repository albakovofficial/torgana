'use strict';

// Надёжность и безопасность сервера:
// 1. Копия в облако: каждую ночь (3:00–6:00 по Москве) база и новые фото/видео уходят в объектное хранилище
//    Selectel (S3). База — целиком, сжатой, хранится 30 дней; фото и видео — догружаются только новые.
//    Ключи — в «Модерация → Резервные копии»; там же «Сделать копию сейчас» и «Проверить копию»
//    (скачать последнюю, проверить целостность и сравнить с сайтом).
// 2. Письма владельцу: копия не сделана, мало места на диске, ночная копия на сервере устарела, всплеск ошибок.
// 3. Вход в модерацию с нового устройства — по коду из письма; устройство помнится 30 дней (cookie tg_dev).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const createS3 = require('./s3');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const KEEP_DAYS = 30;
const FILE_RE = /^[a-f0-9]{32}\.(jpg|png|webp|mp4|mov)$/;
const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/mp4' };
const DEVICE_COOKIE = 'tg_dev';
const DEVICE_DAYS = 30;
const msk = (t = Date.now()) => new Date(t + 3 * HOUR);
const mskDay = (t) => msk(t).toISOString().slice(0, 10);

module.exports = function ops({ route, db, h, mailer, codesOn = () => mailer.ready(), root, dataDir, uploadDir, ownerEmail, publicUrl, secureCookies, deviceCheck = true, sTest = null }) {
  const { HttpError, readJson, requireUser, rateLimit, str, now } = h;
  db.exec(`
    CREATE TABLE IF NOT EXISTS offsite_files (file TEXT PRIMARY KEY, size INTEGER NOT NULL, uploaded_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_devices (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    -- Защита включена для модератора: он хотя бы раз получил код и подтвердил устройство (значит, письма доходят).
    CREATE TABLE IF NOT EXISTS admin_device_armed (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_device_codes (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL
    );
  `);
  const getSetting = (k, def = {}) => { try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? JSON.parse(r.value) : def; } catch { return def; } };
  const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

  // ---------- письма владельцу (не чаще раза в сутки по одной причине; ошибки — раз в час) ----------
  const sentAt = new Map();
  function alert(reason, title, lines, every = DAY) {
    const to = ownerEmail || (db.prepare('SELECT email FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get() || {}).email;
    const last = getSetting('ops_alerts', {})[reason] || sentAt.get(reason) || 0;
    if (Date.now() - last < every) return false;
    sentAt.set(reason, Date.now());
    setSetting('ops_alerts', { ...getSetting('ops_alerts', {}), [reason]: Date.now() });
    console.error(`ВНИМАНИЕ (${reason}): ${title} — ${lines.join(' ')}`);
    return to ? mailer.notifyOps(to, title, lines) : false;
  }

  // ---------- облачная копия ----------
  const cfg = () => getSetting('offsite', {});
  const ready = () => { const c = cfg(); return !!(c.endpoint && c.bucket && c.accessKey && c.secretKey); };
  const client = () => { const c = cfg(); return (sTest || createS3)({ endpoint: c.endpoint, region: c.region || 'ru-1', bucket: c.bucket, accessKey: c.accessKey, secretKey: c.secretKey }); };
  const prefix = () => { const p = String(cfg().prefix || 'torgana').replace(/^\/+|\/+$/g, ''); return p ? `${p}/` : ''; };
  const state = () => getSetting('offsite_state', {});
  const setState = (patch) => setSetting('offsite_state', { ...state(), ...patch });
  let running = null;
  const tmpDir = path.join(dataDir, 'offsite-tmp');

  const run1 = (args) => new Promise((resolve, reject) => {
    execFile(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'scripts/db-copy.js'), ...args], { timeout: 30 * 60 * 1000 }, (err, out, errOut) => {
      if (err) reject(new Error(String(errOut || err.message).trim().split('\n').pop())); else resolve(String(out).trim());
    });
  });
  const counts = (line) => { const n = (w) => Number(((new RegExp(`${w} (\\d+)`)).exec(line) || [])[1] || 0); return { users: n('пользователей'), listings: n('объявлений'), messages: n('сообщений'), uploads: n('фото') }; };

  async function backup(reason = 'schedule') {
    if (running) return running;
    running = (async () => {
      const started = Date.now();
      setState({ running: { at: started, step: 'база' } });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });
      try {
        const s3 = client();
        // 1. база: согласованная копия → gzip → хранилище
        const raw = path.join(tmpDir, 'torgana.db');
        const summary = await run1(['backup', path.join(dataDir, 'torgana.db'), raw]);
        const gz = `${raw}.gz`;
        await pipeline(fs.createReadStream(raw), zlib.createGzip({ level: 6 }), fs.createWriteStream(gz));
        const stamp = msk(started).toISOString().slice(0, 16).replace('T', '-').replace(':', '');
        const dbKey = `${prefix()}db/torgana-${stamp}.db.gz`;
        const dbSize = fs.statSync(gz).size;
        await s3.put(dbKey, { file: gz, size: dbSize }, 'application/gzip');
        // 2. фото и видео: только новые или изменившиеся
        setState({ running: { at: started, step: 'фото и видео' } });
        const known = new Map(db.prepare('SELECT file, size FROM offsite_files').all().map((r) => [r.file, r.size]));
        const files = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).filter((f) => FILE_RE.test(f)) : [];
        const todo = [];
        for (const f of files) { const st = fs.statSync(path.join(uploadDir, f)); if (known.get(f) !== st.size) todo.push([f, st.size]); }
        let sent = 0; let bytes = 0;
        const mark = db.prepare('INSERT INTO offsite_files (file, size, uploaded_at) VALUES (?, ?, ?) ON CONFLICT(file) DO UPDATE SET size = excluded.size, uploaded_at = excluded.uploaded_at');
        const worker = async () => {
          for (let item = todo.shift(); item; item = todo.shift()) {
            const [f, size] = item;
            if (!fs.existsSync(path.join(uploadDir, f))) continue; // удалили, пока шла копия
            await s3.put(`${prefix()}uploads/${f}`, { file: path.join(uploadDir, f), size }, TYPES[f.split('.').pop()]);
            mark.run(f, size, Date.now()); sent += 1; bytes += size;
            if (sent % 50 === 0) setState({ running: { at: started, step: `фото и видео: ${sent}` } });
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        // 3. старые копии базы: храним 30 дней, но не меньше 7 последних
        const dbs = (await s3.list(`${prefix()}db/`)).sort((a, b) => b.key.localeCompare(a.key));
        let removed = 0;
        for (const [i, o] of dbs.entries()) if (i >= 7 && o.modified && o.modified < started - KEEP_DAYS * DAY) { await s3.del(o.key); removed += 1; }
        const c = counts(summary);
        const last = { at: Date.now(), ok: true, reason, dbKey, dbSize, files: sent, bytes, total: files.length, removed, counts: c, seconds: Math.round((Date.now() - started) / 1000) };
        await s3.put(`${prefix()}last.json`, Buffer.from(JSON.stringify(last, null, 2)), 'application/json');
        setState({ running: null, last, lastOk: last, day: mskDay(started) });
        return last;
      } catch (e) {
        const last = { at: Date.now(), ok: false, reason, error: e.message };
        setState({ running: null, last, failedAt: Date.now() });
        alert('offsite', 'копия в облако не сделана', [`Ночная копия базы и фото в хранилище Selectel не удалась: ${e.message}.`, 'Сайт работает. Проверьте ключи и контейнер в «Модерация → Резервные копии» и нажмите «Сделать копию сейчас».']);
        throw e;
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        running = null;
      }
    })();
    return running;
  }

  // Проверка: скачать последнюю копию базы, проверить целостность и сравнить с сайтом; 5 случайных фото — на месте ли.
  async function verify() {
    const s3 = client();
    const dbs = (await s3.list(`${prefix()}db/`)).sort((a, b) => b.key.localeCompare(a.key));
    if (!dbs.length) throw new Error('В хранилище ещё нет копий базы — нажмите «Сделать копию сейчас»');
    const dir = path.join(dataDir, 'offsite-verify');
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    try {
      const gz = path.join(dir, 'copy.db.gz');
      await s3.get(dbs[0].key, gz);
      await pipeline(fs.createReadStream(gz), zlib.createGunzip(), fs.createWriteStream(path.join(dir, 'copy.db')));
      const line = await run1(['check', path.join(dir, 'copy.db')]);
      const copy = counts(line);
      const live = Object.fromEntries(['users', 'listings', 'messages', 'uploads'].map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
      const sample = db.prepare('SELECT file, size FROM offsite_files ORDER BY random() LIMIT 5').all();
      let photosOk = 0;
      for (const f of sample) { const hd = await s3.head(`${prefix()}uploads/${f.file}`); if (hd && hd.size === f.size) photosOk += 1; }
      const files = db.prepare('SELECT COUNT(*) AS n FROM offsite_files').get().n;
      const r = { at: Date.now(), ok: photosOk === sample.length, key: dbs[0].key, size: dbs[0].size, made: dbs[0].modified, copies: dbs.length, copy, live, photos: { checked: sample.length, ok: photosOk, total: files } };
      setState({ verify: r });
      return r;
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  // ---------- состояние сервера ----------
  const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(dataDir), 'backups');
  function disk() {
    try { const s = fs.statfsSync(dataDir); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { return null; }
  }
  function localBackup() {
    try { const t = Date.parse(fs.readFileSync(path.join(backupDir, 'last-ok'), 'utf8').trim()); return Number.isFinite(t) ? t : null; } catch { return null; }
  }
  const errors = [];
  function onError(e) {
    const t = Date.now();
    errors.push({ at: t, msg: String((e && e.message) || e).slice(0, 200) });
    while (errors.length && errors[0].at < t - DAY) errors.shift();
    const recent = errors.filter((x) => x.at > t - 10 * 60 * 1000);
    if (recent.length >= 10) alert('errors', 'много ошибок на сайте', [`За последние 10 минут сервер ответил ошибкой ${recent.length} раз.`, 'Последние ошибки:', ...[...new Set(recent.slice(-5).map((x) => x.msg))].map((m) => `— ${m}`), 'Подробности — в журнале сервера: journalctl -u torgana -n 100.'], HOUR);
  }
  const GB = 1024 ** 3;
  function checkHealth() {
    const d = disk();
    if (d && d.total && (d.free < 2 * GB || d.free / d.total < 0.08)) {
      alert('disk', 'на сервере заканчивается место', [`Свободно ${(d.free / GB).toFixed(1)} ГБ из ${(d.total / GB).toFixed(0)} ГБ.`, 'Когда место закончится, сайт перестанет принимать фото и объявления. Увеличьте диск в панели Selectel или удалите старые копии в /var/lib/torgana/backups.']);
    }
    const lb = localBackup();
    if (lb && Date.now() - lb > 30 * HOUR) alert('local-backup', 'ночная копия на сервере не обновлялась', [`Последняя копия на сервере: ${msk(lb).toISOString().slice(0, 16).replace('T', ' ')} по Москве.`, 'Проверьте службу: systemctl status torgana-backup.timer и journalctl -u torgana-backup -n 50.']);
    if (ready()) {
      const st = state();
      const okAt = st.lastOk ? st.lastOk.at : 0;
      if (okAt && Date.now() - okAt > 36 * HOUR && !running) alert('offsite-old', 'копия в облако устарела', ['Последняя успешная копия в хранилище Selectel — больше полутора суток назад.', 'Откройте «Модерация → Резервные копии» и нажмите «Сделать копию сейчас».']);
    }
  }
  function tick() {
    try { checkHealth(); } catch (e) { console.error('ops:', e.message); }
    if (!ready() || running) return;
    const st = state();
    const hour = msk().getUTCHours();
    if (hour < 3 || hour >= 6 || st.day === mskDay()) return;
    if (st.failedAt && Date.now() - st.failedAt < HOUR) return; // после ошибки — повтор через час
    backup('schedule').catch(() => {});
  }
  function start(tickMs = 10 * 60 * 1000) { setInterval(tick, tickMs).unref(); setTimeout(tick, 60 * 1000).unref(); }

  // ---------- вход в модерацию с нового устройства ----------
  const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  const parseCookies = (raw) => Object.fromEntries(String(raw || '').split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const deviceOn = () => deviceCheck && codesOn();
  // Почта сломана: три последних письма подряд не ушли (ошибка почтового сервиса), а удачных после них не было.
  // Тогда владелец входит без кода — иначе не попасть в «Почту», чтобы её починить. Злоумышленник с паролем
  // так не войдёт: ему пришлось бы ещё и сломать отправку писем сайта.
  function mailBroken() {
    const rows = db.prepare('SELECT last_error FROM mail_queue WHERE attempts > 0 ORDER BY id DESC LIMIT 3').all();
    return rows.length === 3 && rows.every((r) => r.last_error);
  }
  const isOwner = (u) => !!ownerEmail && u.email === ownerEmail;
  const armed = (u) => !!db.prepare('SELECT 1 FROM admin_device_armed WHERE user_id = ?').get(u.id);
  // Устройства, подтверждённые кодом до появления admin_device_armed, защиту не включали — и плашка «Защита не включена»
  // висела, а «Включить» сразу возвращал назад (устройство-то подтверждено). Подтверждённое кодом устройство = защита включена.
  db.prepare('INSERT OR IGNORE INTO admin_device_armed (user_id, at) SELECT DISTINCT user_id, ? FROM admin_devices').run(now());
  function deviceRow(ctx, u) {
    const tok = parseCookies(ctx.req.headers.cookie)[DEVICE_COOKIE];
    if (!tok) return null;
    const row = db.prepare('SELECT * FROM admin_devices WHERE token_hash = ? AND user_id = ? AND expires_at > ?').get(hash(tok), u.id, now());
    if (row && now() - row.last_at > HOUR) db.prepare('UPDATE admin_devices SET last_at = ?, ip = ? WHERE token_hash = ?').run(now(), ctx.ip || '', row.token_hash);
    return row || null;
  }
  // Код спрашиваем, только когда защита включена: модератор хоть раз подтвердил устройство кодом.
  // Так никто не окажется заперт, если письма до него не доходят (неверный адрес, спам, отправитель не настроен).
  function trusted(ctx, u) {
    if (!deviceOn() || !armed(u)) return true;
    if (isOwner(u) && mailBroken()) return true;
    return !!deviceRow(ctx, u);
  }
  // Вместо обычного requireAdmin: модератор на неподтверждённом устройстве получает 403 с device: true.
  function requireAdmin(ctx) {
    const u = requireUser(ctx);
    if (!u.is_admin) throw new HttpError(403, 'Нет доступа');
    if (!trusted(ctx, u)) { const e = new HttpError(403, 'Подтвердите вход в модерацию кодом из письма'); e.extra = { device: true }; throw e; }
    return u;
  }
  const labelOf = (ua) => {
    ua = String(ua || '');
    const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'устройство';
    const br = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'браузер';
    return `${br}, ${os}`;
  };
  route('GET', '/api/admin/device', (ctx) => {
    const u = requireUser(ctx);
    if (!u.is_admin) throw new HttpError(403, 'Нет доступа');
    // Судьба последнего письма с кодом — чтобы было видно, ушло ли оно (и куда смотреть), или почта не работает.
    const last = db.prepare('SELECT status, attempts, last_error, created_at, sent_at FROM mail_queue WHERE kind = \'device\' AND to_email = ? ORDER BY id DESC LIMIT 1').get(u.email);
    const day = Date.now() - DAY;
    const confirmed = !!deviceRow(ctx, u);
    if (confirmed && !armed(u)) db.prepare('INSERT OR IGNORE INTO admin_device_armed (user_id, at) VALUES (?, ?)').run(u.id, now());
    return {
      trusted: trusted(ctx, u), required: deviceOn(), armed: armed(u), confirmed, email: u.email,
      letter: last ? { status: last.status, attempts: last.attempts, error: last.last_error, createdAt: last.created_at, sentAt: last.sent_at } : null,
      mail: { sentDay: db.prepare('SELECT COUNT(*) AS n FROM mail_queue WHERE status = \'sent\' AND sent_at > ?').get(day).n, failedDay: db.prepare('SELECT COUNT(*) AS n FROM mail_queue WHERE status = \'failed\' AND created_at > ?').get(day).n, broken: mailBroken() }
    };
  });
  route('POST', '/api/admin/device/send', (ctx) => {
    const u = requireUser(ctx);
    if (!u.is_admin) throw new HttpError(403, 'Нет доступа');
    if (!deviceOn()) return { sent: false, wait: 0 };
    rateLimit(`devcode:${u.id}`, 8, HOUR);
    const cur = db.prepare('SELECT sent_at FROM admin_device_codes WHERE user_id = ?').get(u.id);
    const wait = cur ? Math.ceil((cur.sent_at + 60 * 1000 - now()) / 1000) : 0;
    if (wait > 0) return { sent: false, wait, email: u.email };
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    db.prepare(`INSERT INTO admin_device_codes (user_id, code_hash, expires_at, tries, sent_at) VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, sent_at = excluded.sent_at`).run(u.id, hash(`${u.id}:${code}`), now() + 15 * 60 * 1000, now());
    mailer.sendDevice(u, code, `${labelOf(ctx.req.headers['user-agent'])}${ctx.ip ? `, IP ${ctx.ip}` : ''}`);
    return { sent: true, wait: 60, email: u.email };
  });
  route('POST', '/api/admin/device/verify', async (ctx) => {
    const u = requireUser(ctx);
    if (!u.is_admin) throw new HttpError(403, 'Нет доступа');
    const code = String((await readJson(ctx.req)).code || '').replace(/\D/g, '');
    const row = db.prepare('SELECT * FROM admin_device_codes WHERE user_id = ?').get(u.id);
    if (!row) throw new HttpError(400, 'Сначала отправьте код');
    if (row.expires_at < now()) throw new HttpError(400, 'Код устарел — отправьте новый');
    if (row.tries >= 5) throw new HttpError(400, 'Слишком много попыток — отправьте новый код');
    if (row.code_hash !== hash(`${u.id}:${code}`)) {
      db.prepare('UPDATE admin_device_codes SET tries = tries + 1 WHERE user_id = ?').run(u.id);
      throw new HttpError(400, 'Неверный код — проверьте цифры');
    }
    db.prepare('DELETE FROM admin_device_codes WHERE user_id = ?').run(u.id);
    db.prepare('INSERT OR IGNORE INTO admin_device_armed (user_id, at) VALUES (?, ?)').run(u.id, now());
    const tok = crypto.randomBytes(24).toString('hex');
    const exp = now() + DEVICE_DAYS * DAY;
    db.prepare('INSERT INTO admin_devices (token_hash, user_id, label, ip, created_at, last_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(hash(tok), u.id, labelOf(ctx.req.headers['user-agent']), ctx.ip || '', now(), now(), exp);
    ctx.setCookie(`${DEVICE_COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(exp).toUTCString()}${secureCookies ? '; Secure' : ''}`);
    return { ok: true, until: exp };
  });
  // Мои устройства (модерация): список и «забыть» (например, потерянный телефон).
  route('GET', '/api/admin/devices', (ctx) => {
    const u = requireAdmin(ctx);
    const mine = hash(parseCookies(ctx.req.headers.cookie)[DEVICE_COOKIE] || '');
    return { items: db.prepare('SELECT * FROM admin_devices WHERE user_id = ? AND expires_at > ? ORDER BY last_at DESC').all(u.id, now())
      .map((d) => ({ id: d.token_hash.slice(0, 16), label: d.label, ip: d.ip, createdAt: d.created_at, lastAt: d.last_at, until: d.expires_at, current: d.token_hash === mine })) };
  });
  route('DELETE', '/api/admin/devices/:id', (ctx) => {
    const u = requireAdmin(ctx);
    db.prepare('DELETE FROM admin_devices WHERE user_id = ? AND substr(token_hash, 1, 16) = ?').run(u.id, String(ctx.params.id));
    return { ok: true };
  });

  // ---------- модерация: резервные копии и состояние сервера ----------
  const publicCfg = () => { const c = cfg(); return { endpoint: c.endpoint || '', region: c.region || 'ru-1', bucket: c.bucket || '', accessKey: c.accessKey || '', hasSecret: !!c.secretKey, prefix: c.prefix === undefined ? 'torgana' : c.prefix }; };
  const status = () => {
    const d = disk();
    const st = state();
    return {
      config: publicCfg(), ready: ready(), running: running ? st.running || { at: Date.now(), step: '' } : null,
      last: st.last || null, lastOk: st.lastOk || null, verify: st.verify || null,
      uploaded: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS b FROM offsite_files').get(),
      server: { disk: d, localBackup: localBackup(), errorsHour: errors.filter((x) => x.at > Date.now() - HOUR).length, errorsDay: errors.length, lastErrors: errors.slice(-5).reverse(), mail: mailer.ready(), owner: ownerEmail || '' }
    };
  };
  route('GET', '/api/admin/backup', (ctx) => { requireAdmin(ctx); return status(); });
  // Сохранить ключи: сначала проверяем доступ (пишем и удаляем маленький файл).
  route('PUT', '/api/admin/backup', async (ctx) => {
    const a = requireAdmin(ctx);
    if (ownerEmail && a.email !== ownerEmail) throw new HttpError(403, 'Ключи хранилища меняет только владелец сайта');
    const b = await readJson(ctx.req);
    const cur = cfg();
    const next = {
      endpoint: str(b.endpoint, 200).replace(/\/+$/, ''), region: str(b.region, 40) || 'ru-1', bucket: str(b.bucket, 100),
      accessKey: str(b.accessKey, 200), secretKey: b.secretKey ? String(b.secretKey).trim().slice(0, 300) : cur.secretKey || '', prefix: str(b.prefix, 60).replace(/[^a-zA-Z0-9_\-/]/g, '')
    };
    if (b.clear) { setSetting('offsite', {}); return status(); }
    if (!next.endpoint || !next.bucket || !next.accessKey || !next.secretKey) throw new HttpError(400, 'Заполните адрес, контейнер и оба ключа');
    if (!/^(https?:\/\/)?[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(next.endpoint)) throw new HttpError(400, 'Адрес хранилища — например, s3.ru-1.storage.selcloud.ru');
    const test = (sTest || createS3)({ ...next, secretKey: next.secretKey });
    const key = `${next.prefix ? `${next.prefix}/` : ''}check-${Date.now()}.txt`;
    try { await test.put(key, Buffer.from('Торгана: проверка доступа'), 'text/plain'); await test.del(key); } catch (e) { throw new HttpError(400, `Хранилище не приняло файл: ${e.message}`); }
    setSetting('offsite', next);
    return status();
  });
  route('POST', '/api/admin/backup/run', (ctx) => {
    requireAdmin(ctx);
    if (!ready()) throw new HttpError(400, 'Сначала укажите хранилище');
    backup('manual').catch(() => {});
    return status();
  });
  route('POST', '/api/admin/backup/verify', async (ctx) => {
    requireAdmin(ctx);
    if (!ready()) throw new HttpError(400, 'Сначала укажите хранилище');
    rateLimit('offsite-verify', 20, HOUR);
    try { return { ...status(), verify: await verify() }; } catch (e) { throw new HttpError(400, e.message); }
  });

  return { requireAdmin, onError, tick, start, backup, verify, checkHealth, alert, DEVICE_COOKIE };
};

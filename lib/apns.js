'use strict';

// 1.56.0: push в приложение Торгана для iPhone — через Apple (APNs): HTTP/2, вход по токену (JWT ES256 из ключа .p8).
// Без зависимостей. Ключ (.p8, Key ID) и Team ID вставляет модератор в «Модерация → Настройки → Приложение iPhone»;
// ключ хранится в базе и наружу не отдаётся. Адреса устройств (token) присылает приложение (POST /api/push/apns).
// Это единственный канал push: с 1.60.0 push в браузер (web-push) убраны.
// TestFlight и App Store — «боевые» адреса Apple (production), сборка из Xcode — песочница (development).
const http2 = require('node:http2');
const crypto = require('node:crypto');

const HOSTS = { production: 'https://api.push.apple.com', development: 'https://api.sandbox.push.apple.com' };
const DEAD = ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'];
// Ответ Apple — человеческими словами: виден в «Проверить» у человека и в модерации.
const WHY = {
  InvalidProviderToken: 'Apple не принял ключ: проверьте Team ID и Key ID и что вставлен ключ APNs (Keys → Apple Push Notifications), а не ключ App Store Connect',
  ExpiredProviderToken: 'Apple счёл вход устаревшим — проверьте время на сервере и попробуйте ещё раз',
  TooManyProviderTokenUpdates: 'Apple просит не обновлять вход чаще раза в 20 минут — подождите 20 минут и проверьте снова',
  MissingProviderToken: 'Ключ Apple не сохранён',
  TopicDisallowed: 'Ключ не подходит к приложению — проверьте Bundle ID (ru.torgana.app) и что ключ из той же команды',
  BadTopic: 'Неверный Bundle ID — должен быть ru.torgana.app',
  DeviceTokenNotForTopic: 'Адрес устройства от другого приложения — выключите и снова включите уведомления',
  BadDeviceToken: 'Адрес устройства не подошёл (сборка из Xcode или TestFlight) — выключите и снова включите уведомления',
  Unregistered: 'На iPhone уведомления выключены или приложение удалено',
  network: 'Сервер не смог связаться с Apple — попробуйте через минуту'
};
const b64u = (v) => Buffer.from(v).toString('base64url');

module.exports = function apns({ db, route, h, testUrl = '' }) {
  const { HttpError, readJson, requireUser, requireAdmin, rateLimit, now } = h;
  db.exec(`CREATE TABLE IF NOT EXISTS apns_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    env TEXT NOT NULL DEFAULT 'production',
    device TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_ok_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_apns_user ON apns_tokens(user_id);`);

  const config = () => { try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get('apns'); return r ? JSON.parse(r.value) : {}; } catch { return {}; } };
  const topic = () => config().topic || process.env.APPLE_BUNDLE_ID || 'ru.torgana.app';
  const ready = () => { const c = config(); return !!(c.teamId && c.keyId && c.key); };

  // Токен входа живёт час, а обновлять его Apple разрешает не чаще раза в 20 минут (иначе TooManyProviderTokenUpdates).
  // Поэтому он хранится в базе — переживает перезапуск сервера при выпуске — и новый делаем только раз в 50 минут,
  // при смене ключа или если Apple ответил, что он устарел.
  const JWT_KEY = 'apns_jwt';
  let jwt = null;
  const dropJwt = () => { jwt = null; db.prepare('DELETE FROM settings WHERE key = ?').run(JWT_KEY); };
  function bearer() {
    const c = config();
    if (!jwt) { try { jwt = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get(JWT_KEY).value); } catch { jwt = null; } }
    if (jwt && jwt.v && jwt.kid === c.keyId && jwt.team === c.teamId && Date.now() - jwt.at < 50 * 60 * 1000) return jwt.v;
    const data = `${b64u(JSON.stringify({ alg: 'ES256', kid: c.keyId }))}.${b64u(JSON.stringify({ iss: c.teamId, iat: Math.floor(Date.now() / 1000) }))}`;
    const sig = crypto.sign('sha256', Buffer.from(data), { key: crypto.createPrivateKey(c.key), dsaEncoding: 'ieee-p1363' });
    jwt = { at: Date.now(), v: `${data}.${b64u(sig)}`, kid: c.keyId, team: c.teamId };
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(JWT_KEY, JSON.stringify(jwt));
    return jwt.v;
  }

  // Одно соединение HTTP/2 на адрес Apple — Apple просит не открывать новое на каждое уведомление.
  const sessions = new Map();
  function session(origin) {
    let s = sessions.get(origin);
    if (s && !s.closed && !s.destroyed) return s;
    s = http2.connect(origin);
    s.on('error', () => sessions.delete(origin));
    s.on('close', () => sessions.delete(origin));
    s.on('goaway', () => sessions.delete(origin));
    s.unref();
    sessions.set(origin, s);
    return s;
  }
  function post(origin, path, headers, body) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = session(origin).request({ ':method': 'POST', ':path': path, ...headers }); } catch (e) { reject(e); return; }
      let status = 0; let data = '';
      req.setEncoding('utf8');
      req.on('response', (hd) => { status = hd[':status']; });
      req.on('data', (d) => { data += d; });
      req.on('end', () => resolve({ status, body: data }));
      req.on('error', reject);
      req.setTimeout(10000, () => { req.close(); reject(new Error('Apple не ответил за 10 секунд')); });
      req.end(body);
    });
  }

  let lastError = null; // { at, reason, text } — последняя неудача, сбрасывается после доставки
  const fail = (reason) => { lastError = { at: now(), reason: String(reason), text: WHY[reason] || `Apple ответил: ${reason}` }; console.error('apns:', reason); };

  let badgeOf = () => 0; // число на значке: непрочитанные сообщения + уведомления (задаёт server.js)

  // Отправить на все iPhone человека. msg: { title, body, url, tag }. Ответ — сколько дошло до Apple.
  async function send(userId, msg) {
    if (!ready()) return 0;
    const rows = db.prepare('SELECT * FROM apns_tokens WHERE user_id = ?').all(userId);
    if (!rows.length) return 0;
    let badge = 0; try { badge = badgeOf(userId); } catch { /* без числа */ }
    const body = JSON.stringify({ aps: { alert: { title: String(msg.title || ''), body: String(msg.body || '') }, sound: 'default', badge, ...(msg.tag ? { 'thread-id': String(msg.tag).slice(0, 64) } : {}) }, url: msg.url || '/' });
    let ok = 0;
    await Promise.all(rows.map(async (t) => {
      try {
        const head = {
          authorization: `bearer ${bearer()}`, 'apns-topic': topic(), 'apns-push-type': 'alert', 'apns-priority': '10',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400), 'content-type': 'application/json',
          ...(msg.tag ? { 'apns-collapse-id': String(msg.tag).slice(0, 64) } : {})
        };
        const r = await post(testUrl || HOSTS[t.env] || HOSTS.production, `/3/device/${t.token}`, head, body);
        let reason = ''; try { reason = JSON.parse(r.body || '{}').reason || ''; } catch { /* пусто */ }
        if (r.status === 200) { ok += 1; lastError = null; db.prepare('UPDATE apns_tokens SET last_ok_at = ? WHERE id = ?').run(now(), t.id); return; }
        fail(reason || r.status);
        if (r.status === 410 || DEAD.includes(reason)) db.prepare('DELETE FROM apns_tokens WHERE id = ?').run(t.id);
        else if (reason === 'ExpiredProviderToken' && jwt && Date.now() - jwt.at > 20 * 60 * 1000) dropJwt(); // моложе 20 минут — дело во времени сервера, новый не поможет
      } catch (e) { fail('network'); console.error('apns:', e.message); /* попробуем со следующим уведомлением */ }
    }));
    return ok;
  }
  const count = (userId) => db.prepare('SELECT COUNT(*) AS n FROM apns_tokens WHERE user_id = ?').get(userId).n;

  // Приложение: адрес устройства для вошедшего человека. Тот же адрес у другого человека (сменили аккаунт) — переносим.
  route('POST', '/api/push/apns', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`apns:${u.id}`, 30, 60 * 60 * 1000);
    const b = await readJson(ctx.req);
    const token = String(b.token || '').toLowerCase();
    if (!/^[0-9a-f]{64,200}$/.test(token)) throw new HttpError(400, 'Неверный адрес устройства');
    const env = b.env === 'development' ? 'development' : 'production';
    db.prepare(`INSERT INTO apns_tokens (user_id, token, env, device, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, env = excluded.env`).run(u.id, token, env, 'iPhone · приложение Торгана', now());
    return { ok: true };
  });
  route('POST', '/api/push/apns/off', async (ctx) => {
    const u = requireUser(ctx);
    const b = await readJson(ctx.req);
    db.prepare('DELETE FROM apns_tokens WHERE user_id = ? AND token = ?').run(u.id, String(b.token || '').toLowerCase());
    return { ok: true };
  });

  // Модерация: ключ Apple для push. Ключ не отдаём обратно — только «сохранён».
  route('GET', '/api/admin/apns', (ctx) => {
    requireAdmin(ctx);
    const c = config();
    return { ready: ready(), teamId: c.teamId || '', keyId: c.keyId || '', topic: topic(), hasKey: !!c.key,
      devices: db.prepare('SELECT COUNT(*) AS n FROM apns_tokens').get().n, mine: count(ctx.user.id), lastError };
  });
  route('PUT', '/api/admin/apns', async (ctx) => {
    const admin = requireAdmin(ctx);
    const b = await readJson(ctx.req);
    const cur = config();
    if (b.clear) { db.prepare('DELETE FROM settings WHERE key = ?').run('apns'); dropJwt(); h.audit(admin, 'apns-settings', {}, { clear: true }); return { ok: true }; }
    const teamId = String(b.teamId || '').trim().toUpperCase();
    const keyId = String(b.keyId || '').trim().toUpperCase();
    const key = b.key ? String(b.key).trim() : cur.key;
    if (!/^[A-Z0-9]{10}$/.test(teamId)) throw new HttpError(400, 'Team ID — 10 латинских букв и цифр: developer.apple.com → Membership details');
    if (!/^[A-Z0-9]{10}$/.test(keyId)) throw new HttpError(400, 'Key ID — 10 латинских букв и цифр, он рядом с ключом в разделе Keys');
    if (!key) throw new HttpError(400, 'Вставьте текст файла .p8 целиком');
    try {
      const k = crypto.createPrivateKey(key);
      if (k.asymmetricKeyType !== 'ec' || k.asymmetricKeyDetails.namedCurve !== 'prime256v1') throw new Error('not p256');
    } catch { throw new HttpError(400, 'Это не ключ APNs: нужен файл AuthKey_….p8 целиком, от BEGIN PRIVATE KEY до END PRIVATE KEY'); }
    const topicIn = String(b.topic || '').trim();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('apns', JSON.stringify({ teamId, keyId, key, topic: /^[\w.-]{3,100}$/.test(topicIn) ? topicIn : 'ru.torgana.app' }));
    if (teamId !== cur.teamId || keyId !== cur.keyId || key !== cur.key) dropJwt();
    lastError = null;
    h.audit(admin, 'apns-settings', {}, { teamId, keyId });
    return { ok: true };
  });
  route('POST', '/api/admin/apns/test', async (ctx) => {
    const admin = requireAdmin(ctx);
    if (!ready()) throw new HttpError(400, 'Сначала сохраните ключ Apple');
    if (!count(admin.id)) throw new HttpError(400, 'Откройте приложение Торгана на своём iPhone, войдите и разрешите уведомления — тогда сюда придёт проверка');
    const n = await send(admin.id, { title: 'Проверка push', body: 'Уведомления из Торганы приходят на этот iPhone', url: '/admin?status=apns', tag: 'apns-test' });
    if (!n) throw new HttpError(502, lastError ? lastError.text : 'Apple не принял уведомление — проверьте Team ID, Key ID и ключ');
    return { ok: true, sent: n };
  });

  return { send, count, ready, teamId: () => config().teamId || '', topic, setBadge: (fn) => { badgeOf = fn; }, lastError: () => lastError };
};

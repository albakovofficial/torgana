'use strict';

// Push-уведомления в браузер и на телефон (Web Push: RFC 8030 + шифрование RFC 8291 + VAPID RFC 8292).
// Без внешних библиотек: ключи VAPID создаются при первом запуске и хранятся в таблице settings.
// На iPhone push работает, когда Торгана добавлена на экран «Домой» (iOS 16.4+).
const crypto = require('node:crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Push-службы браузеров. Подписка на другой адрес не принимается — сервер не станет слать запросы куда попало.
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.mozaws\.net$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /\.yandex\.(ru|net)$/];

// Шифрование содержимого для одной подписки (aes128gcm, одна запись).
function encrypt(payload, p256dh, authSecret) {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])])).subarray(0, 32);
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

function createPush({ db, subject, allowHttp = false, apns = null }) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_subs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    device TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_ok_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs(user_id);`);

  // Ключи VAPID: создаём один раз. Смена ключей отключит все подписки, поэтому их нельзя терять (есть в резервной копии базы).
  function keys() {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('vapid');
    if (row) return JSON.parse(row.value);
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const k = { public: b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)])), private: privateKey.export({ format: 'jwk' }) };
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('vapid', JSON.stringify(k));
    return k;
  }
  const vapid = keys();
  const privateKey = crypto.createPrivateKey({ key: vapid.private, format: 'jwk' });

  function jwt(endpoint) {
    const enc = (o) => b64u(JSON.stringify(o));
    const data = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`;
    return `${data}.${b64u(crypto.sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' }))}`;
  }

  function validEndpoint(endpoint) {
    try {
      const u = new URL(endpoint);
      if (u.protocol === 'https:') return PUSH_HOSTS.some((re) => re.test(u.hostname));
      return allowHttp && u.protocol === 'http:' && u.hostname === '127.0.0.1';
    } catch { return false; }
  }

  function subscribe(userId, sub, device = '') {
    const endpoint = String((sub && sub.endpoint) || '');
    const p256dh = String((sub && sub.keys && sub.keys.p256dh) || '');
    const auth = String((sub && sub.keys && sub.keys.auth) || '');
    if (!validEndpoint(endpoint) || unb64u(p256dh).length !== 65 || unb64u(auth).length !== 16) throw new Error('Браузер прислал неподходящую подписку');
    db.prepare(`INSERT INTO push_subs (user_id, endpoint, p256dh, auth, device, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device`)
      .run(userId, endpoint, p256dh, auth, String(device).slice(0, 120), Date.now());
  }
  const unsubscribe = (userId, endpoint) => db.prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?').run(userId, String(endpoint || '')).changes > 0;
  // 1.56.0: устройства — и браузеры, и iPhone с приложением (apns, lib/apns.js)
  const devices = (userId) => db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?').get(userId).n + (apns ? apns.count(userId) : 0);

  // Отправить всем устройствам пользователя. msg: { title, body, url, tag }. Ответ 404/410 — подписка больше не действует.
  async function send(userId, msg) {
    const subs = db.prepare('SELECT * FROM push_subs WHERE user_id = ?').all(userId);
    const payload = JSON.stringify({ title: msg.title, body: msg.body || '', url: msg.url || '/', tag: msg.tag || '' });
    let ok = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        const res = await fetch(s.endpoint, {
          method: 'POST',
          headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: msg.urgent ? 'high' : 'normal', ...(msg.tag ? { Topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}), Authorization: `vapid t=${jwt(s.endpoint)}, k=${vapid.public}` },
          body: encrypt(payload, s.p256dh, s.auth),
          signal: AbortSignal.timeout(10000)
        });
        if (res.status === 404 || res.status === 410) db.prepare('DELETE FROM push_subs WHERE id = ?').run(s.id);
        else if (res.ok) { ok += 1; db.prepare('UPDATE push_subs SET last_ok_at = ? WHERE id = ?').run(Date.now(), s.id); }
      } catch { /* сеть или служба недоступна — попробуем со следующим уведомлением */ }
    }));
    if (apns) ok += await apns.send(userId, msg).catch(() => 0);
    return ok;
  }

  return { publicKey: vapid.public, subscribe, unsubscribe, devices, send, why: () => (apns ? apns.lastError() : null) };
}

module.exports = { createPush, encrypt, b64u, unb64u };

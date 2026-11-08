'use strict';

// Вход через Яндекс ID и VK ID (OAuth 2.0 с PKCE). Ключи приложений вводит модератор в «Модерация → Вход через сервисы».
// - Есть привязка сервиса → входим в этот аккаунт.
// - Нет привязки, но почта из сервиса совпадает с аккаунтом → привязываем и входим (почта в сервисе подтверждена).
// - Иначе создаём аккаунт: имя и почта из сервиса, почта сразу подтверждена, согласие — на кнопке входа.
// Телефон, который отдал сервис, считается подтверждённым («Телефон подтверждён» у продавца).
const crypto = require('node:crypto');

const STATE_TTL = 10 * 60 * 1000;
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

module.exports = function oauth({ route, db, h, auth, baseUrl, secureCookies, adminEmails, testBase = '' }) {
  const { HttpError, readJson, requireAdmin, rateLimit, str, now } = h;
  // В тестах адреса сервисов подменяются на локальный «сервис» (OAUTH_TEST_BASE).
  const at = (real, path) => (testBase ? `${testBase}/${path}` : real);
  const PROVIDERS = {
    yandex: {
      name: 'Яндекс ID',
      authorize: at('https://oauth.yandex.ru/authorize', 'yandex/authorize'),
      token: at('https://oauth.yandex.ru/token', 'yandex/token'),
      info: at('https://login.yandex.ru/info?format=json', 'yandex/info'),
      async profile(cfg, code, verifier) {
        const tok = await form(this.token, { grant_type: 'authorization_code', code, client_id: cfg.id, client_secret: cfg.secret, code_verifier: verifier });
        const p = await getJson(this.info, { Authorization: `OAuth ${tok.access_token}` });
        return {
          id: String(p.id), email: String(p.default_email || (p.emails || [])[0] || '').toLowerCase(),
          name: p.real_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.display_name || p.login || '',
          phone: p.default_phone && p.default_phone.number ? String(p.default_phone.number) : ''
        };
      }
    },
    vk: {
      name: 'VK ID',
      authorize: at('https://id.vk.ru/authorize', 'vk/authorize'),
      token: at('https://id.vk.ru/oauth2/auth', 'vk/token'),
      info: at('https://id.vk.ru/oauth2/user_info', 'vk/info'),
      scope: 'email phone',
      async profile(cfg, code, verifier, extra) {
        const tok = await form(this.token, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: cfg.id, device_id: extra.device_id || '', redirect_uri: callbackUrl('vk'), state: extra.state });
        const { user: p = {} } = await form(this.info, { client_id: cfg.id, access_token: tok.access_token });
        const phone = String(p.phone || '').replace(/\D/g, '');
        return {
          id: String(p.user_id || tok.user_id || ''), email: String(p.email || '').toLowerCase(),
          name: [p.first_name, p.last_name].filter(Boolean).join(' '),
          phone: phone ? `+${phone}` : ''
        };
      }
    }
  };

  async function form(url, data) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data), signal: AbortSignal.timeout(10000) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error_description || j.error || `сервис ответил ${res.status}`);
    return j;
  }
  async function getJson(url, headers) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`сервис ответил ${res.status}`);
    return res.json();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (provider, provider_id)
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts(user_id);
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      verifier TEXT NOT NULL,
      next TEXT NOT NULL DEFAULT '/',
      link_user INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
  // 1.38: откуда пришёл человек — переносим через вход сервиса до создания аккаунта
  if (!db.prepare('PRAGMA table_info(oauth_states)').all().some((c) => c.name === 'src')) db.exec("ALTER TABLE oauth_states ADD COLUMN src TEXT NOT NULL DEFAULT ''");

  // ---------- настройки (вводит модератор) ----------
  function config() {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('oauth');
    try { return row ? JSON.parse(row.value) : {}; } catch { return {}; }
  }
  const ready = (p) => { const c = config()[p] || {}; return !!(c.id && (p === 'vk' || c.secret)); };
  const enabled = () => Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, ready(p)]));
  const callbackUrl = (p) => `${baseUrl}/api/auth/oauth/${p}/callback`;

  route('GET', '/api/admin/oauth', (ctx) => {
    requireAdmin(ctx);
    const c = config();
    return { providers: Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, { id: (c[p] || {}).id || '', hasSecret: !!(c[p] || {}).secret, ready: ready(p), callback: callbackUrl(p) }])) };
  });
  route('PUT', '/api/admin/oauth', async (ctx) => {
    requireAdmin(ctx);
    const b = await readJson(ctx.req);
    const cur = config();
    const next = {};
    for (const p of Object.keys(PROVIDERS)) {
      const inp = b[p] || {};
      next[p] = { id: str(inp.id, 100), secret: inp.secret ? String(inp.secret).slice(0, 200) : ((cur[p] || {}).secret || '') };
      if (inp.clear) next[p] = { id: '', secret: '' };
    }
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('oauth', JSON.stringify(next));
    return { ok: true, enabled: enabled() };
  });

  // ---------- вход ----------
  const provider = (ctx) => {
    const p = PROVIDERS[ctx.params.provider];
    if (!p || !ready(ctx.params.provider)) throw new HttpError(404, 'Вход через этот сервис не подключён');
    return p;
  };
  const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n.slice(0, 300) : '/profile');

  // Начало: адрес страницы сервиса. link=1 — привязать сервис к уже открытому аккаунту (из настроек).
  route('POST', '/api/auth/oauth/:provider/start', async (ctx) => {
    rateLimit(`oauth:${ctx.ip}`, 30, 10 * 60 * 1000);
    const p = provider(ctx);
    const b = await readJson(ctx.req);
    if (b.link && !ctx.user) throw new HttpError(401, 'Нужно войти в аккаунт');
    if (!b.link && b.consent !== true) throw new HttpError(400, 'Нужно согласие на обработку персональных данных');
    const state = b64u(crypto.randomBytes(24));
    const verifier = b64u(crypto.randomBytes(48));
    db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(now() - STATE_TTL);
    db.prepare('INSERT INTO oauth_states (state, provider, verifier, next, link_user, created_at, src) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(state, ctx.params.provider, verifier, safeNext(b.next), b.link ? ctx.user.id : null, now(), String(b.src || '').slice(0, 120));
    const q = new URLSearchParams({
      response_type: 'code', client_id: config()[ctx.params.provider].id, redirect_uri: callbackUrl(ctx.params.provider), state,
      code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
      ...(p.scope ? { scope: p.scope } : {})
    });
    return { url: `${p.authorize}?${q}` };
  });

  // Возврат от сервиса: ответ — переадресация (на страницу «откуда пришли» или на вход с ошибкой).
  route('GET', '/api/auth/oauth/:provider/callback', async (ctx) => {
    const key = ctx.params.provider;
    const fail = (msg) => h.redirect(`/login?oauth_error=${encodeURIComponent(msg)}`);
    let q = Object.fromEntries(ctx.query.entries());
    if (q.payload) { try { q = { ...q, ...JSON.parse(q.payload) }; } catch { /* как есть */ } } // VK ID может вернуть всё в payload
    const st = db.prepare('SELECT * FROM oauth_states WHERE state = ? AND provider = ?').get(String(q.state || ''), key);
    if (st) db.prepare('DELETE FROM oauth_states WHERE state = ?').run(st.state);
    if (!st || st.created_at < now() - STATE_TTL) return fail('Ссылка входа устарела — попробуйте ещё раз');
    if (q.error || !q.code) return fail('Вход отменён');
    let p;
    try { p = await PROVIDERS[key].profile(config()[key], String(q.code), st.verifier, q); } catch (e) {
      console.error(`oauth ${key}:`, e.message);
      return fail(`${PROVIDERS[key].name} не ответил — попробуйте ещё раз`);
    }
    if (!p.id) return fail(`${PROVIDERS[key].name} не передал данные аккаунта`);
    const linked = db.prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_id = ?').get(key, p.id);
    let user;
    if (st.link_user) {
      if (linked && linked.user_id !== st.link_user) return h.redirect('/profile/settings?oauth=taken#sp');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(st.link_user);
    } else if (linked) {
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(linked.user_id);
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return fail(`Разрешите ${PROVIDERS[key].name} передать адрес почты — без него аккаунт не создать`);
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(p.email);
      if (!user) {
        const name = str(p.name, 60);
        const info = db.prepare('INSERT INTO users (email, name, password_hash, is_admin, email_verified, created_at, consent_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
          .run(p.email, name.length >= 2 ? name : 'Пользователь', auth.hashPassword(crypto.randomBytes(24).toString('hex')), adminEmails.includes(p.email) ? 1 : 0, now(), now());
        if (h.sources) h.sources.tag(info.lastInsertRowid, st.src);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      } else if (!user.email_verified) {
        db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id); // сервис подтвердил эту почту
      }
    }
    if (!user || user.is_blocked) return fail('Аккаунт заблокирован. Напишите в поддержку.');
    db.prepare('INSERT OR IGNORE INTO oauth_accounts (provider, provider_id, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)').run(key, p.id, user.id, p.email, now());
    // Телефон из сервиса — подтверждённый: записываем, если своего нет или он тот же.
    if (p.phone) {
      const norm = (x) => String(x || '').replace(/\D/g, '').replace(/^8/, '7');
      if (!user.phone || norm(user.phone) === norm(p.phone)) db.prepare('UPDATE users SET phone = ?, phone_verified = 1, phone_verified_via = ? WHERE id = ?').run(p.phone, key, user.id);
    }
    if (!st.link_user) {
      const s = auth.createSession(db, user.id);
      ctx.setCookie(auth.sessionCookie(s.token, s.expires, secureCookies));
    }
    return h.redirect(st.link_user ? `/profile/settings?oauth=linked#sp` : st.next);
  });

  // Привязанные сервисы — для настроек; отвязать можно, если остаётся пароль или другой сервис (пароль есть всегда).
  const linkedOf = (userId) => db.prepare('SELECT provider FROM oauth_accounts WHERE user_id = ?').all(userId).map((r) => r.provider);
  route('POST', '/api/auth/oauth/:provider/unlink', (ctx) => {
    const u = h.requireUser(ctx);
    db.prepare('DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?').run(u.id, ctx.params.provider);
    return { linked: linkedOf(u.id) };
  });

  return { enabled, linkedOf, PROVIDERS };
};

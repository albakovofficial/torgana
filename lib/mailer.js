'use strict';

// Всё о письмах в одном месте: настройки SMTP (хранятся в базе, вводит модератор на сайте),
// очередь с повторами, одноразовые ссылки, уведомления о сообщениях и решениях модерации.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sendMail } = require('./smtp');
const { T } = require('./emails');

const HOUR = 3600 * 1000;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SECURITY = ['ssl', 'starttls', 'none'];
// Логотип вкладываем в само письмо (cid:tg-logo) — он виден сразу, без загрузки картинок с сайта.
const LOGO = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'icons', 'mail-logo.png')); } catch { return null; } })();
const withLogo = (html) => (LOGO && html.includes('cid:tg-logo') ? [{ cid: 'tg-logo', type: 'image/png', name: 'torgana.png', data: LOGO }] : []);

function createMailer({ db, baseUrl, supportEmail = '', tickMs = 15000, chatDelayMs = 5 * 60 * 1000, chatGapMs = 15 * 60 * 1000, modGapMs = 60 * 1000 }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const support = String(supportEmail).trim().toLowerCase();
  // Письмо по шаблону: адрес сайта и поддержки подставляются во все письма одинаково.
  const letter = (kind, data) => T[kind]({ base, support, ...data });

  // ---------- настройки ----------
  // Ответы на письма по умолчанию — в поддержку (SUPPORT_EMAIL), если в «Почте» не указан другой адрес.
  function config() {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('smtp');
    let c = {};
    try { c = row ? JSON.parse(row.value) : {}; } catch { /* испорченная запись — как будто не настроено */ }
    return { ...c, replyTo: c.replyTo || support };
  }
  const ready = () => { const c = config(); return !!(c.host && c.port && c.from); };
  function publicConfig() {
    const { pass, ...c } = config();
    return { ...c, hasPass: !!pass, ready: ready() };
  }
  function saveConfig(input) {
    const cur = config();
    const s = (v, max) => String(v ?? '').trim().slice(0, max);
    const next = {
      host: s(input.host, 200), port: parseInt(input.port, 10) || 0,
      security: SECURITY.includes(input.security) ? input.security : 'ssl',
      user: s(input.user, 200), pass: input.pass ? String(input.pass).slice(0, 500) : (cur.pass || ''),
      from: s(input.from, 200).toLowerCase(), fromName: s(input.fromName, 100) || 'Торгана',
      replyTo: s(input.replyTo, 200).toLowerCase()
    };
    const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    if (!next.host || !next.port) throw new Error('Укажите сервер и порт');
    if (!isEmail(next.from)) throw new Error('Проверьте адрес отправителя');
    if (next.replyTo && !isEmail(next.replyTo)) throw new Error('Проверьте адрес для ответов');
    if (next.replyTo === support) next.replyTo = '';
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('smtp', JSON.stringify(next));
    return publicConfig();
  }

  // ---------- очередь ----------
  function enqueue(kind, to, l, headers = {}) {
    if (!ready() || !to || /@deleted\.torgana$/.test(to)) return false; // удалённый профиль (lib/account.js) — писем нет
    const t = Date.now();
    db.prepare('INSERT INTO mail_queue (kind, to_email, subject, html, text, headers, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(kind, to, l.subject, l.html, l.text, JSON.stringify(headers), t, t);
    setImmediate(() => tick().catch(() => {}));
    return true;
  }

  let busy = false;
  let again = false; // письмо пришло, пока шла отправка, — пройдём очередь ещё раз сразу, а не через tickMs
  async function tick() {
    if (busy) { again = true; return; }
    if (!ready()) return;
    busy = true;
    again = false;
    try {
      const cfg = config();
      const rows = db.prepare('SELECT * FROM mail_queue WHERE status = \'pending\' AND next_at <= ? ORDER BY id LIMIT 20').all(Date.now());
      for (const r of rows) {
        try {
          await sendMail(cfg, { to: r.to_email, subject: r.subject, html: r.html, text: r.text, headers: JSON.parse(r.headers), inline: withLogo(r.html) });
          db.prepare('UPDATE mail_queue SET status = \'sent\', sent_at = ?, attempts = attempts + 1, last_error = \'\' WHERE id = ?').run(Date.now(), r.id);
        } catch (e) {
          const attempts = r.attempts + 1;
          db.prepare('UPDATE mail_queue SET status = ?, attempts = ?, next_at = ?, last_error = ? WHERE id = ?')
            .run(attempts >= 5 ? 'failed' : 'pending', attempts, Date.now() + 60000 * 2 ** attempts, String(e.message).slice(0, 300), r.id);
        }
      }
      // Храним журнал 30 дней.
      db.prepare('DELETE FROM mail_queue WHERE status != \'pending\' AND created_at < ?').run(Date.now() - 30 * 24 * HOUR);
    } finally {
      busy = false;
      if (again) { again = false; setImmediate(() => tick().catch(() => {})); }
    }
  }

  function stats() {
    const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM mail_queue GROUP BY status').all().map((r) => [r.status, r.n]));
    const recent = db.prepare('SELECT id, kind, to_email, subject, status, attempts, last_error, created_at, sent_at FROM mail_queue ORDER BY id DESC LIMIT 30').all();
    return { pending: counts.pending || 0, sent: counts.sent || 0, failed: counts.failed || 0, recent };
  }

  // ---------- одноразовые ссылки ----------
  function issueToken(user, kind, ttlMs) {
    const raw = crypto.randomBytes(32).toString('hex');
    const t = Date.now();
    db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND kind = ?').run(user.id, kind);
    db.prepare('INSERT INTO email_tokens (token_hash, user_id, kind, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sha(raw), user.id, kind, user.email, t, t + ttlMs);
    return raw;
  }
  // consume=false — только проверить (страница «новый пароль» до отправки формы).
  function checkToken(raw, kind, consume = true) {
    if (!/^[a-f0-9]{64}$/.test(String(raw || ''))) return null;
    const row = db.prepare(`SELECT t.*, u.email AS current_email FROM email_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.kind = ?`).get(sha(raw), kind);
    if (!row || row.used_at || row.expires_at < Date.now() || row.email !== row.current_email) return null;
    if (consume) db.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ?').run(Date.now(), row.token_hash);
    return row;
  }

  function unsubscribeUrl(userId, kind) {
    let { unsub_token: tok } = db.prepare('SELECT unsub_token FROM users WHERE id = ?').get(userId);
    if (!tok) {
      tok = crypto.randomBytes(16).toString('hex');
      db.prepare('UPDATE users SET unsub_token = ? WHERE id = ?').run(tok, userId);
    }
    return `${base}/unsubscribe?t=${tok}&k=${kind}`;
  }
  // Заголовки «отписаться в один клик» (RFC 8058) — почтовики показывают кнопку рядом с отправителем.
  const unsubHeaders = (url) => ({ 'List-Unsubscribe': `<${url.replace('/unsubscribe?', '/api/unsubscribe?')}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });

  function unsubscribe(tok, kind) {
    if (!/^[a-f0-9]{32}$/.test(String(tok || ''))) return false;
    // follow-<id> — отписаться от одного продавца (ссылка в подборке за день).
    const fm = /^follow-(\d+)$/.exec(String(kind));
    if (fm) {
      const u = db.prepare('SELECT id FROM users WHERE unsub_token = ?').get(tok);
      if (!u) return false;
      db.prepare('DELETE FROM follows WHERE user_id = ? AND seller_id = ?').run(u.id, Number(fm[1]));
      return true;
    }
    const cols = { messages: ['notify_messages'], moderation: ['notify_moderation'], reviews: ['notify_reviews'], digest: ['notify_digest'], all: ['notify_messages', 'notify_moderation', 'notify_reviews', 'notify_digest'] }[kind];
    if (!cols) return false;
    const r = db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = 0`).join(', ')} WHERE unsub_token = ?`).run(tok);
    return r.changes > 0;
  }

  // ---------- код подтверждения почты (6 цифр) ----------
  // Храним только хеш. Код действует 15 минут, 5 попыток; новый — не чаще раза в минуту.
  db.exec(`CREATE TABLE IF NOT EXISTS email_codes (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL, email TEXT NOT NULL, expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL
  )`);
  const CODE_TTL = 15 * 60 * 1000;
  const CODE_GAP = 60 * 1000;
  const codeHash = (userId, code) => sha(`${userId}:${code}`);
  // Отправить код. false — рано (прошло меньше минуты), тогда в ответе — сколько ждать.
  function sendCode(user) {
    const row = db.prepare('SELECT sent_at FROM email_codes WHERE user_id = ?').get(user.id);
    const wait = row ? Math.ceil((row.sent_at + CODE_GAP - Date.now()) / 1000) : 0;
    if (wait > 0) return { sent: false, wait };
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const t = Date.now();
    db.prepare(`INSERT INTO email_codes (user_id, code_hash, email, expires_at, tries, sent_at) VALUES (?, ?, ?, ?, 0, ?)
      ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, email = excluded.email, expires_at = excluded.expires_at, tries = 0, sent_at = excluded.sent_at`)
      .run(user.id, codeHash(user.id, code), user.email, t + CODE_TTL, t);
    enqueue('code', user.email, letter('code', { name: user.name, code }));
    return { sent: true, wait: CODE_GAP / 1000 };
  }
  // ok | bad | expired | tries (кончились попытки) | none (кода нет)
  function checkCode(user, code) {
    const row = db.prepare('SELECT * FROM email_codes WHERE user_id = ?').get(user.id);
    if (!row || row.email !== user.email) return 'none';
    if (row.expires_at < Date.now()) return 'expired';
    if (row.tries >= 5) return 'tries';
    if (!/^\d{6}$/.test(String(code)) || row.code_hash !== codeHash(user.id, String(code))) {
      db.prepare('UPDATE email_codes SET tries = tries + 1 WHERE user_id = ?').run(user.id);
      return row.tries + 1 >= 5 ? 'tries' : 'bad';
    }
    db.prepare('DELETE FROM email_codes WHERE user_id = ?').run(user.id);
    return 'ok';
  }

  // ---------- письма ----------
  // Ссылка для нового пароля (1 час, одноразовая). Почту при регистрации подтверждает код (sendCode).
  function sendResetLetter(user) {
    const raw = issueToken(user, 'reset', HOUR);
    return enqueue('reset', user.email, letter('reset', { name: user.name, url: `${base}/reset?token=${raw}` }));
  }


  function notifyModeration(listingId, event, reason = '') {
    const r = db.prepare(`SELECT l.id, l.title, u.id AS uid, u.email, u.name, u.notify_moderation, u.is_blocked
      FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ?`).get(listingId);
    if (!r || !r.notify_moderation || r.is_blocked) return false;
    const unsub = unsubscribeUrl(r.uid, 'moderation');
    const path = event === 'rejected' || event === 'appeal-denied' ? `/edit/${r.id}` : event === 'scheduled' ? '/profile?status=scheduled' : event === 'expired' ? '/profile?status=archived' : `/l/${r.id}`;
    return enqueue('moderation', r.email, letter('moderation', { name: r.name, title: r.title, reason, event, url: base + path, unsubscribe: unsub }), unsubHeaders(unsub));
  }

  // Отзывы: продавцу — новый отзыв, решение по жалобе, отклонённый ответ; автору — решение по отзыву и ответ продавца.
  function notifyReview(userId, event, { review, reason = '' }) {
    const u = db.prepare('SELECT id, email, name, notify_reviews, is_blocked FROM users WHERE id = ?').get(userId);
    if (!u || !u.notify_reviews || u.is_blocked) return false;
    const unsub = unsubscribeUrl(u.id, 'reviews');
    const toSeller = ['new', 'complaint-kept', 'complaint-hidden', 'reply-rejected'].includes(event);
    const url = `${base}/profile/reviews${toSeller ? '' : '?tab=mine'}`;
    return enqueue('review', u.email, letter('review', { name: u.name, event, title: review.listing_title, rating: review.rating, text: review.text, reason, url, unsubscribe: unsub }), unsubHeaders(unsub));
  }

  // Непрочитанные сообщения старше chatDelayMs → одно письмо на диалог, не чаще раза в chatGapMs.
  function chatTick() {
    if (!ready()) return 0;
    const t = Date.now();
    const rows = db.prepare(`
      SELECT m.id, m.conversation_id AS cid, CASE WHEN m.body = '' THEN '📷 Фото' ELSE m.body END AS body, su.name AS sender, l.title, ru.id AS rid, ru.email, ru.name
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN listings l ON l.id = c.listing_id
      JOIN users su ON su.id = m.sender_id
      JOIN users ru ON ru.id = CASE WHEN m.sender_id = c.buyer_id THEN c.seller_id ELSE c.buyer_id END
      LEFT JOIN chat_notify n ON n.conversation_id = c.id AND n.user_id = ru.id
      WHERE m.read_at IS NULL AND m.created_at <= ? AND m.created_at > ?
        AND m.id > COALESCE(n.last_message_id, 0) AND COALESCE(n.last_at, 0) <= ?
        AND ru.notify_messages = 1 AND ru.email_verified = 1 AND ru.is_blocked = 0
      ORDER BY m.id`).all(t - chatDelayMs, t - 2 * 24 * HOUR, t - chatGapMs);
    const latest = new Map();
    for (const r of rows) latest.set(`${r.cid}:${r.rid}`, r);
    for (const r of latest.values()) {
      const unsub = unsubscribeUrl(r.rid, 'messages');
      const preview = r.body.length > 300 ? `${r.body.slice(0, 300)}…` : r.body;
      enqueue('message', r.email, letter('message', { name: r.name, from: r.sender, title: r.title, preview, url: `${base}/messages/${r.cid}`, unsubscribe: unsub }), unsubHeaders(unsub));
      db.prepare(`INSERT INTO chat_notify (conversation_id, user_id, last_message_id, last_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_message_id = excluded.last_message_id, last_at = excluded.last_at`).run(r.cid, r.rid, r.id, t);
    }
    return latest.size;
  }

  // Ответ поддержки — сразу письмом (если пользователь не отключил письма о сообщениях).
  function notifySupport(userId, body) {
    const u = db.prepare('SELECT id, email, name, notify_messages, is_blocked FROM users WHERE id = ?').get(userId);
    if (!u || !u.notify_messages || u.is_blocked) return false;
    const unsub = unsubscribeUrl(u.id, 'messages');
    const preview = body.length > 300 ? `${body.slice(0, 300)}…` : body;
    return enqueue('support', u.email, letter('message', { name: u.name, from: 'Поддержка Торганы', title: 'ответ поддержки', about: 'ответила в чате поддержки', preview, url: `${base}/messages/support`, unsubscribe: unsub }), unsubHeaders(unsub));
  }

  // Подборка за день: новое у продавцов из подписок и снижение цен в избранном (собирает lib/alerts.js).
  function notifyDigest(userId, { prices, follows = [] }) {
    const u = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId);
    if (!u) return false;
    const unsub = unsubscribeUrl(u.id, 'digest');
    const fl = follows.map((f) => ({ ...f, unsubscribe: unsubscribeUrl(u.id, `follow-${f.id}`) }));
    return enqueue('digest', u.email, letter('digest', { name: u.name, prices, follows: fl, unsubscribe: unsub }), unsubHeaders(unsub));
  }

  // Блокировка и разблокировка аккаунта — служебное письмо, приходит независимо от настроек рассылок.
  // Код входа в модерацию с нового устройства и служебные письма владельцу — независимо от настроек рассылок.
  function sendDevice(u, code, where) { return enqueue('device', u.email, letter('device', { name: u.name, code, where })); }
  function notifyOps(to, title, lines, url) { return enqueue('ops', to, letter('ops', { title, lines, url })); }

  function notifyAccount(userId, event, reason = '') {
    const u = db.prepare('SELECT email, name FROM users WHERE id = ?').get(userId);
    return u ? enqueue('account', u.email, letter('account', { name: u.name, event, reason })) : false;
  }

  // Платные услуги: оплата, возврат, тариф заканчивается, продвижение запущено или остановлено, витрина очищена.
  // Служебные письма — приходят независимо от настроек рассылок (как чек и сведения о заказе).
  function notifyBilling(userId, event, data = {}) {
    const u = db.prepare('SELECT email, name FROM users WHERE id = ?').get(userId);
    return u ? enqueue('billing', u.email, letter('billing', { name: u.name, event, ...data, url: data.url ? base + data.url : `${base}/profile/business` })) : false;
  }

  // Письма модераторам о новом: instant — не чаще раза в минуту, hourly — не чаще раза в час, одним письмом.
  // «Новое» — всё, что появилось после прошлого письма этому модератору; уже обработанное не присылаем.
  const MOD_GAP = { instant: modGapMs, hourly: HOUR };
  function modTick() {
    if (!ready()) return 0;
    const t = Date.now();
    let sent = 0;
    for (const a of db.prepare('SELECT * FROM users WHERE is_admin = 1 AND is_blocked = 0 AND mod_notify != \'off\'').all()) {
      if (!a.mod_notify_at) { db.prepare('UPDATE users SET mod_notify_at = ? WHERE id = ?').run(t, a.id); continue; }
      if (t - a.mod_notify_at < (MOD_GAP[a.mod_notify] || HOUR)) continue;
      const kinds = a.mod_notify_kinds.split(',');
      const since = a.mod_notify_at;
      const pending = kinds.includes('pending') ? db.prepare(`SELECT DISTINCT l.id, l.title, l.flags, l.checks FROM listing_events e JOIN listings l ON l.id = e.listing_id
        WHERE e.kind IN ('created', 'edited') AND e.created_at > ? AND l.status = 'pending' AND l.user_id != ? ORDER BY l.id LIMIT 30`).all(since, a.id) : [];
      const reports = kinds.includes('reports') ? db.prepare(`SELECT r.reason, l.id, l.title FROM reports r JOIN listings l ON l.id = r.listing_id
        WHERE r.created_at > ? AND r.resolved_at IS NULL ORDER BY r.id LIMIT 30`).all(since) : [];
      const support = kinds.includes('support') ? db.prepare(`SELECT m.body, t.id AS tid, u.name FROM support_messages m JOIN support_threads t ON t.id = m.thread_id JOIN users u ON u.id = t.user_id
        WHERE m.staff_id IS NULL AND m.created_at > ? AND m.read_at IS NULL ORDER BY m.id LIMIT 30`).all(since) : [];
      if (!pending.length && !reports.length && !support.length) continue;
      const queue = db.prepare('SELECT COUNT(*) AS n FROM listings WHERE status = \'pending\'').get().n;
      enqueue('mod', a.email, letter('mod', { name: a.name, mode: a.mod_notify, pending, reports, chats: support, queue }));
      db.prepare('UPDATE users SET mod_notify_at = ? WHERE id = ?').run(t, a.id);
      sent += 1;
    }
    return sent;
  }

  // Проверка из раздела «Почта»: отправляет сразу и возвращает ошибку сервиса как есть.
  async function sendTest(to, cfgOverride) {
    const cfg = { ...config(), ...(cfgOverride || {}) };
    const l = letter('test', {});
    await sendMail(cfg, { to, ...l, inline: withLogo(l.html) });
    db.prepare('INSERT INTO mail_queue (kind, to_email, subject, html, text, status, attempts, next_at, created_at, sent_at) VALUES (?, ?, ?, ?, ?, \'sent\', 1, ?, ?, ?)')
      .run('test', to, l.subject, '', '', Date.now(), Date.now(), Date.now());
  }

  function start() {
    setInterval(() => {
      try { chatTick(); modTick(); } catch (e) { console.error('notify:', e.message); }
      tick().catch((e) => console.error('mail:', e.message));
    }, tickMs).unref();
  }

  return { sendDevice, notifyOps, ready, publicConfig, saveConfig, stats, checkToken, sendResetLetter, sendCode, checkCode, notifyModeration, notifyReview, notifySupport, notifyAccount, notifyDigest, notifyBilling, unsubscribe, chatTick, modTick, tick, sendTest, start };
}

module.exports = { createMailer };

'use strict';

const crypto = require('node:crypto');

const SESSION_COOKIE = 'tg_sid';
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expires = now + SESSION_DAYS * 24 * 3600 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, now, expires);
  return { token, expires };
}

function sessionCookie(token, expires, secure) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${new Date(expires).toUTCString()}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`;
}

function userFromSession(db, token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.city, u.phone, u.is_admin, u.is_blocked, u.created_at,
      u.email_verified, u.notify_messages, u.notify_moderation, u.notify_reviews, u.avatar, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?`).get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return row;
}

module.exports = { SESSION_COOKIE, hashPassword, verifyPassword, createSession, sessionCookie, clearCookie, userFromSession };

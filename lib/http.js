'use strict';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new HttpError(413, 'Слишком большой запрос'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limitBytes = 64 * 1024) {
  const buf = await readBody(req, limitBytes);
  if (!buf.length) return {};
  try {
    const data = JSON.parse(buf.toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad');
    return data;
  } catch {
    throw new HttpError(400, 'Некорректные данные запроса');
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  }
  return out;
}

// Простое ограничение частоты запросов в памяти процесса.
const buckets = new Map();
function hit(key, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count;
}
function rateLimit(key, max, windowMs) {
  if (hit(key, windowMs) > max) throw new HttpError(429, 'Слишком много попыток. Попробуйте чуть позже.');
}
// Неудачи по одной цели (неверный пароль к аккаунту): считаются только ошибки, после max — закрыто до конца окна,
// с любого адреса. failure(key, ms) — отметить ошибку, guard(key, max, msg) — проверить перед попыткой.
function failure(key, windowMs) { hit(key, windowMs); }
function guard(key, max, message) {
  const b = buckets.get(key);
  if (b && b.reset >= Date.now() && b.count >= max) throw new HttpError(429, message);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60 * 1000).unref();

module.exports = { HttpError, sendJson, readJson, parseCookies, rateLimit, failure, guard };

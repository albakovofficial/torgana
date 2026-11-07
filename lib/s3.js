'use strict';

// Минимальный клиент S3 (подпись AWS Signature V4) — для копий в объектное хранилище Selectel
// (подойдёт и любое S3-совместимое: Яндекс Облако, VK Cloud). Без сторонних библиотек.
// Адреса path-style: https://<endpoint>/<bucket>/<key>.
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const http = require('node:http');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encKey = (k) => k.split('/').map(enc).join('/');

function fileHash(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

module.exports = function s3({ endpoint, region = 'ru-1', bucket, accessKey, secretKey, timeoutMs = 120000 }) {
  const base = new URL(/^https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`);

  function sign(method, key, query, headers, payloadHash) {
    const t = new Date();
    const amzDate = t.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const path = `/${enc(bucket)}${key ? `/${encKey(key)}` : ''}`;
    const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');
    const all = { ...headers, host: base.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
    const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
    const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
    const canonical = [method, path, qs, names.map((n) => `${n}:${lower[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
    const scope = `${day}/${region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
    const kSign = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request');
    const signature = crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
    return {
      path: `${base.pathname.replace(/\/$/, '')}${path}${qs ? `?${qs}` : ''}`,
      headers: { ...lower, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` }
    };
  }

  // body: Buffer | { file, size } (потоком с диска). Ответ: { status, headers, body: Buffer }.
  async function request(method, key, { query = {}, headers = {}, body = null, toFile = null } = {}) {
    let payloadHash; let size = 0;
    if (body && body.file) { payloadHash = await fileHash(body.file); size = body.size; } else { const b = body || Buffer.alloc(0); payloadHash = sha256(b); size = b.length; }
    const sig = sign(method, key, query, { ...headers, ...(method === 'PUT' ? { 'content-length': size } : {}) }, payloadHash);
    const lib = base.protocol === 'http:' ? http : https;
    return new Promise((resolve, reject) => {
      const req = lib.request({ method, hostname: base.hostname, port: base.port || (base.protocol === 'http:' ? 80 : 443), path: sig.path, headers: sig.headers, timeout: timeoutMs }, (res) => {
        if (toFile && res.statusCode === 200) {
          const out = fs.createWriteStream(toFile);
          res.pipe(out);
          out.on('finish', () => resolve({ status: 200, headers: res.headers, body: Buffer.alloc(0) }));
          out.on('error', reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('timeout', () => req.destroy(new Error('хранилище не ответило вовремя')));
      req.on('error', reject);
      if (body && body.file) fs.createReadStream(body.file).pipe(req);
      else req.end(body || undefined);
    });
  }

  // Понятная ошибка из XML-ответа S3: <Code>…</Code><Message>…</Message>.
  const fail = (r, what) => {
    const x = r.body.toString();
    const code = (/<Code>([^<]+)<\/Code>/.exec(x) || [])[1] || `HTTP ${r.status}`;
    const hint = { AccessDenied: 'нет доступа — проверьте ключи и права на контейнер', NoSuchBucket: 'контейнер не найден — проверьте имя', SignatureDoesNotMatch: 'неверный секретный ключ', InvalidAccessKeyId: 'неверный ключ доступа' }[code];
    return new Error(`${what}: ${hint || code}`);
  };

  return {
    async put(key, body, contentType = 'application/octet-stream') {
      const r = await request('PUT', key, { headers: { 'content-type': contentType }, body });
      if (r.status !== 200) throw fail(r, `не удалось загрузить ${key}`);
      return r.headers.etag || '';
    },
    async get(key, toFile) {
      const r = await request('GET', key, { toFile });
      if (r.status !== 200) throw fail(r, `не удалось скачать ${key}`);
      return r.body;
    },
    async head(key) {
      const r = await request('HEAD', key);
      return r.status === 200 ? { size: Number(r.headers['content-length'] || 0) } : null;
    },
    async del(key) {
      const r = await request('DELETE', key);
      if (r.status !== 204 && r.status !== 200) throw fail(r, `не удалось удалить ${key}`);
    },
    // Все ключи с префиксом: [{ key, size, modified }].
    async list(prefix) {
      const out = []; let token = '';
      for (let i = 0; i < 200; i++) {
        const r = await request('GET', '', { query: { 'list-type': '2', prefix, 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) } });
        if (r.status !== 200) throw fail(r, 'не удалось получить список копий');
        const x = r.body.toString();
        for (const m of x.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const g = (t) => ((new RegExp(`<${t}>([^<]*)</${t}>`).exec(m[1]) || [])[1] || '');
          out.push({ key: g('Key').replace(/&amp;/g, '&'), size: Number(g('Size')), modified: Date.parse(g('LastModified')) || 0 });
        }
        token = (/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(x) || [])[1] || '';
        if (!/<IsTruncated>true<\/IsTruncated>/.test(x) || !token) break;
      }
      return out;
    }
  };
};

'use strict';

// Общие помощники для тестов: запуск сервера на временной базе и HTTP-клиент с cookie.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.join(__dirname, '..');

// Картинки 1×1 для проверки загрузки фото.
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString('base64');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// Запускает отдельный экземпляр сайта с пустой базой во временной папке.
async function startServer(extraEnv = {}) {
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'torgana-test-'));
  const env = {
    PATH: process.env.PATH,
    HOME: tmp,
    PORT: String(port),
    HOST: '127.0.0.1',
    PUBLIC_URL: '',
    ADMIN_EMAIL: 'admin@test.local',
    SUPPORT_EMAIL: 'support@test.local',
    DATA_DIR: path.join(tmp, 'data'),
    UPLOAD_DIR: path.join(tmp, 'uploads'),
    TRUST_PROXY: '0',
    ANTHROPIC_API_KEY: '',
    ...extraEnv
  };
  // cwd — временная папка, чтобы не подхватить .env боевого сайта.
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server.js')], { cwd: tmp, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Сервер не запустился:\n${log}`);
    try { const r = await fetch(`${base}/api/config`); if (r.ok) break; } catch { /* ещё стартует */ }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error(`Сервер не ответил за 10 секунд:\n${log}`);
  }
  return {
    base,
    tmp,
    log: () => log,
    async stop() {
      child.kill();
      await new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
}

// Клиент, который хранит cookie входа, как браузер.
function client(base) {
  let cookie = '';
  async function req(method, url, body, headers = {}) {
    const r = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual'
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data, headers: r.headers };
  }
  return {
    req,
    get: (u, h) => req('GET', u, undefined, h),
    post: (u, b = {}, h) => req('POST', u, b, h),
    patch: (u, b = {}, h) => req('PATCH', u, b, h),
    put: (u, b = {}, h) => req('PUT', u, b, h),
    del: (u, h) => req('DELETE', u, undefined, h),
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; }
  };
}

async function registerUser(base, { name, email, password = 'password123' }) {
  const c = client(base);
  const r = await c.post('/api/auth/register', { name, email, password, consent: true });
  if (r.status !== 200) throw new Error(`Регистрация ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  c.user = r.data.user;
  return c;
}

// Поддельный SMTP-сервер: принимает письма как настоящий и складывает их в inbox (тема и HTML уже раскодированы).
async function startSmtp({ user = 'smtp-user', pass = 'smtp-pass' } = {}) {
  const inbox = [];
  const decodeWord = (s) => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
  const part = (raw, type) => {
    const m = new RegExp(`Content-Type: ${type}; charset=utf-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)--tg-`).exec(raw);
    return m ? Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8') : '';
  };
  const server = net.createServer((sock) => {
    let buf = '';
    let data = null;
    let mail = {};
    sock.write('220 fake smtp\r\n');
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      if (data !== null) {
        const end = buf.indexOf('\r\n.\r\n');
        if (end < 0) return;
        const raw = buf.slice(0, end).replace(/^\.\./gm, '.');
        buf = buf.slice(end + 5);
        data = null;
        const headers = raw.slice(0, raw.indexOf('\r\n\r\n'));
        const h = (k) => (new RegExp(`^${k}: (.*)$`, 'm').exec(headers) || [])[1] || '';
        inbox.push({ ...mail, subject: decodeWord(h('Subject')), from: decodeWord(h('From')), headers, html: part(raw, 'text/html'), text: part(raw, 'text/plain') });
        mail = {};
        sock.write('250 queued\r\n');
      }
      let nl;
      while (data === null && (nl = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.split(' ')[0].toUpperCase();
        if (cmd === 'EHLO') sock.write('250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
        else if (cmd === 'AUTH') {
          const got = Buffer.from(line.split(' ')[2] || '', 'base64').toString('utf8');
          sock.write(got === `\0${user}\0${pass}` ? '235 ok\r\n' : '535 bad credentials\r\n');
        } else if (cmd === 'MAIL') { mail.mailFrom = line; sock.write('250 ok\r\n'); }
        else if (cmd === 'RCPT') { mail.to = /<([^>]+)>/.exec(line)[1]; sock.write('250 ok\r\n'); }
        else if (cmd === 'DATA') { data = ''; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { sock.end('221 bye\r\n'); }
        else sock.write('500 ?\r\n');
      }
    });
    sock.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port, user, pass, inbox,
    // Ждём письмо, подходящее под условие (очередь отправляет асинхронно).
    async waitFor(fn, ms = 5000) {
      for (let t = 0; t < ms; t += 50) {
        const m = inbox.find(fn);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`Письмо не пришло. Есть: ${inbox.map((x) => `${x.to}: ${x.subject}`).join('; ') || 'ничего'}`);
    },
    close: () => new Promise((r) => server.close(r))
  };
}

// Все объявления публикуются после проверки: продавец создаёт, модератор одобряет. Возвращает id.
async function publish(seller, admin, body) {
  const r = await seller.post('/api/listings', body);
  if (r.status !== 200) throw new Error(`Объявление: ${r.status} ${JSON.stringify(r.data)}`);
  const ok = await admin.post(`/api/admin/listings/${r.data.id}/restore`);
  if (ok.status !== 200) throw new Error(`Одобрение: ${ok.status} ${JSON.stringify(ok.data)}`);
  return r.data.id;
}

module.exports = { ROOT, PNG_1PX, JPEG_HEAD, startServer, startSmtp, client, registerUser, publish };

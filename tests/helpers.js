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

module.exports = { ROOT, PNG_1PX, JPEG_HEAD, startServer, client, registerUser };

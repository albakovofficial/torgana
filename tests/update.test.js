'use strict';

// Автообновление из ветки release (deploy/update.sh) на игрушечном репозитории:
// нет ветки → понятная ошибка; хорошая версия ставится с копией базы; сломанная не ставится и не повторяется;
// версия, после которой сайт не ответил, откатывается; ставятся только версии новее работающей.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync, execFile } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { ROOT } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'torgana-update-'));
const origin = path.join(root, 'origin.git');
const work = path.join(root, 'work');   // «компьютер разработчика»
const app = path.join(root, 'app');     // «сервер»
const data = path.join(root, 'data');
let healthy = true;
let health;

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@test.local', ...args], { cwd, encoding: 'utf8' }).trim();
const write = (file, body) => { fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true }); fs.writeFileSync(path.join(work, file), body); };
const commit = (msg, branch = 'release') => { git(work, 'add', '-A'); git(work, 'commit', '-qm', msg); git(work, 'push', '-q', 'origin', `HEAD:${branch}`); return git(work, 'rev-parse', 'HEAD'); };
const status = () => JSON.parse(fs.readFileSync(path.join(data, 'update-status.json'), 'utf8'));
// Асинхронно: пока скрипт работает, тестовый «сайт» должен отвечать на проверку.
const run = (...args) => new Promise((resolve) => {
  const env = { ...process.env, APP_DIR: app, NO_SYSTEMCTL: '1', RESTART_CMD: 'true', HEALTH_URL: `http://127.0.0.1:${health.address().port}/`, HEALTH_TRIES: '2', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' };
  delete env.NODE_TEST_CONTEXT; // иначе вложенный node --test сочтёт себя частью этого теста
  execFile('bash', [path.join(ROOT, 'deploy', 'update.sh'), ...args], { encoding: 'utf8', env }, (e, stdout, stderr) => resolve({ status: e ? e.code : 0, stdout, stderr }));
});
const version = (n, { syntax = true, tests = true } = {}) => {
  write('package.json', `{ "name": "torgana", "version": "1.0.${n}" }\n`);
  write('server.js', syntax ? `// версия ${n}\n` : 'function (\n');
  write('public/assets/app.js', '\n');
  write('tests/api.test.js', `require('node:test')('api', () => { if (!${tests}) throw new Error('сломано'); });\n`);
};

before(async () => {
  health = http.createServer((req, res) => { res.writeHead(healthy ? 200 : 500); res.end(); }).listen(0, '127.0.0.1');
  await new Promise((r) => health.once('listening', r));
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-qb', 'main');
  write('scripts/db-copy.js', fs.readFileSync(path.join(ROOT, 'scripts/db-copy.js'), 'utf8'));
  write('.gitignore', 'data/\n.env\n');
  version(1);
  commit('Версия 1', 'main');
  git(root, 'clone', '-q', origin, app);
  fs.writeFileSync(path.join(app, '.env'), `DATA_DIR=${data}\n`);
  fs.mkdirSync(data, { recursive: true });
  const db = new DatabaseSync(path.join(data, 'torgana.db'));
  db.exec('CREATE TABLE users (id INTEGER); INSERT INTO users VALUES (1)');
  db.close();
});
after(() => { health.close(); fs.rmSync(root, { recursive: true, force: true }); });

test('нет ветки release — сайт не трогается, в панели понятная ошибка', async () => {
  const r = await run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(status().checkError, /нет ветки release/);
});

test('хорошая версия из release ставится, перед этим — копия базы', async () => {
  version(2);
  const v2 = commit('Версия 2');
  const r = await run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(app, 'rev-parse', 'HEAD'), v2);
  const st = status();
  assert.equal(st.commit, v2.slice(0, 7));
  assert.equal(st.subject, 'Версия 2');
  assert.equal(st.version, '1.0.2');
  assert.match(fs.readFileSync(path.join(data, 'update/update.log'), 'utf8'), /Готово: работает версия V1\.0\.2 \([0-9a-f]{7}\)/);
  assert.equal(st.checkError, '');
  assert.ok(st.updatedAt);
  const copies = fs.readdirSync(path.join(data, 'update/db'));
  assert.equal(copies.length, 1);
  assert.match(copies[0], new RegExp(`before-${v2.slice(0, 7)}\\.db\\.gz$`));
  assert.equal((await run()).status, 0, 'повторная проверка без новой версии — ничего не делает');
});

test('изменения только в main сайт не меняют', async () => {
  write('README.md', 'черновик\n');
  commit('Черновик', 'main');
  const before = git(app, 'rev-parse', 'HEAD');
  await run();
  assert.equal(git(app, 'rev-parse', 'HEAD'), before);
});

test('ошибка в коде — версия не ставится и больше не пробуется', async () => {
  const good = git(app, 'rev-parse', 'HEAD');
  git(work, 'checkout', '-q', 'release'); git(work, 'reset', '-q', '--hard', good);
  version(3, { syntax: false });
  const bad = commit('Версия 3 с ошибкой');
  assert.equal((await run()).status, 1);
  assert.equal(git(app, 'rev-parse', 'HEAD'), good, 'на сервере осталась прежняя версия');
  assert.match(status().lastError, /Версия V1\.0\.3 \([0-9a-f]{7}\) не установлена: ошибка в коде/);
  assert.equal(status().failedCommit, bad.slice(0, 7));
  const log = fs.readFileSync(path.join(data, 'update/update.log'), 'utf8');
  assert.equal((await run()).status, 0, 'вторая проверка пропускает неудачную версию');
  assert.equal(fs.readFileSync(path.join(data, 'update/update.log'), 'utf8'), log, 'и не пишет в журнал каждые 30 секунд');
});

test('не прошли сценарии API — версия не ставится', async () => {
  version(4, { tests: false });
  commit('Версия 4 с упавшим тестом');
  assert.equal((await run()).status, 1);
  assert.match(status().lastError, /не прошли сценарии API/);
});

test('сайт не ответил после перезапуска — откат на прежнюю версию', async () => {
  const good = git(app, 'rev-parse', 'HEAD');
  version(5);
  commit('Версия 5');
  healthy = false;
  assert.equal((await run()).status, 1);
  healthy = true;
  assert.equal(git(app, 'rev-parse', 'HEAD'), good);
  assert.match(status().lastError, /сайт не запустился/);
});

test('следующая исправленная версия ставится, ошибка из панели пропадает', async () => {
  version(6);
  const v6 = commit('Версия 6');
  assert.equal((await run()).status, 0);
  assert.equal(git(app, 'rev-parse', 'HEAD'), v6);
  assert.equal(status().lastError, '');
  const out = (await run('--status')).stdout;
  assert.match(out, /Ветка выпуска: release/);
  assert.match(out, /Работает версия: V1\.0\.6 \([0-9a-f]{7}\) — Версия 6/);
  assert.match(out, /Готово: работает версия/);
});

test('ставятся только версии новее работающей: старая и «боковая» в release пропускаются', async () => {
  const cur = git(app, 'rev-parse', 'HEAD');
  const old = git(work, 'rev-list', '--max-parents=0', 'HEAD'); // самая первая версия

  // release откатили на старую версию (как сразу после перехода с main на release) — молча пропускаем
  git(work, 'push', '-qf', 'origin', `${old}:refs/heads/release`);
  assert.equal((await run()).status, 0);
  assert.equal(git(app, 'rev-parse', 'HEAD'), cur);
  assert.equal(status().checkError, '');

  // «боковая» версия — не продолжает работающую: не ставим, в панели объяснение, в журнал — один раз
  git(work, 'checkout', '-q', '--detach', old);
  write('side.txt', 'боковая\n');
  git(work, 'add', '-A'); git(work, 'commit', '-qm', 'Боковая версия');
  git(work, 'push', '-qf', 'origin', 'HEAD:refs/heads/release');
  assert.equal((await run()).status, 0);
  assert.equal(git(app, 'rev-parse', 'HEAD'), cur);
  assert.match(status().checkError, /не продолжает работающую/);
  const log = fs.readFileSync(path.join(data, 'update/update.log'), 'utf8');
  await run();
  assert.equal(fs.readFileSync(path.join(data, 'update/update.log'), 'utf8'), log);

  // нормальный выпуск поверх работающей — ставится
  git(work, 'checkout', '-q', '--detach', cur);
  version(7);
  git(work, 'add', '-A'); git(work, 'commit', '-qm', 'Версия 7');
  git(work, 'push', '-qf', 'origin', 'HEAD:refs/heads/release');
  assert.equal((await run()).status, 0);
  assert.equal(git(app, 'log', '-1', '--format=%s'), 'Версия 7');
  assert.equal(status().checkError, '');
});

test('номер версии: patch, minor, major', () => {
  const { bump } = require('../scripts/version');
  assert.equal(bump('1.0.0', 'patch'), '1.0.1');
  assert.equal(bump('1.0.9', 'patch'), '1.0.10');
  assert.equal(bump('1.0.5', 'minor'), '1.1.0');
  assert.equal(bump('1.4.2', 'major'), '2.0.0');
  assert.throws(() => bump('1.0', 'patch'), /вида 1\.0\.0/);
  assert.throws(() => bump('1.0.0', 'huge'), /patch, minor или major/);
});

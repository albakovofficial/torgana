'use strict';

// Полный цикл резервной копии: копия → данные испорчены → восстановление → всё на месте.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, PNG_1PX, startServer, client, registerUser } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'torgana-backup-'));
const data = path.join(root, 'lib');
const fakeFs = path.join(root, 'fs');
const env = {
  ...process.env,
  APP_DIR: ROOT,
  DATA_DIR: data,
  BACKUP_DIR: path.join(data, 'backups'),
  CONFIG_ROOT: fakeFs,
  CONFIG_PATHS: 'var/www/torgana/.env etc/nginx/sites-available/torgana etc/not-there',
  NO_SYSTEMCTL: '1',
  DAY: '2026-11-06'
};
const serverEnv = { DATA_DIR: path.join(data, 'data'), UPLOAD_DIR: path.join(data, 'uploads') };
const sh = (script, args = [], extra = {}) => execFileSync('bash', [path.join(ROOT, 'deploy', script), ...args], { env: { ...env, ...extra }, encoding: 'utf8' });

after(() => fs.rmSync(root, { recursive: true, force: true }));

test('копия и восстановление базы, фото и настроек', async () => {
  fs.mkdirSync(path.join(fakeFs, 'var/www/torgana'), { recursive: true });
  fs.mkdirSync(path.join(fakeFs, 'etc/nginx/sites-available'), { recursive: true });
  fs.writeFileSync(path.join(fakeFs, 'var/www/torgana/.env'), 'ADMIN_EMAIL=old@test.local\n');
  fs.writeFileSync(path.join(fakeFs, 'etc/nginx/sites-available/torgana'), 'server {}\n');

  // 1. Сайт с данными
  let srv = await startServer(serverEnv);
  const anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
  const photo = (await anna.post('/api/uploads', { data: `data:image/png;base64,${PNG_1PX}` })).data.file;
  const id = (await anna.post('/api/listings', { title: 'Велосипед Merida', category: 'hobby', city: 'Казань', price: '20000', photos: [photo] })).data.id;

  // 2. Копия — пока сайт работает
  const out = sh('backup.sh');
  assert.match(out, /объявлений 1/);
  assert.ok(fs.existsSync(path.join(data, 'backups/db/torgana-2026-11-06.db.gz')));
  assert.ok(fs.existsSync(path.join(data, 'backups/uploads/2026-11-06', photo)));
  const tarList = execFileSync('tar', ['-tzf', path.join(data, 'backups/config/config-2026-11-06.tar.gz')], { encoding: 'utf8' });
  assert.match(tarList, /var\/www\/torgana\/\.env/);
  assert.match(tarList, /nginx/);

  // 3. Беда: объявление и фото удалены, настройки испорчены
  await anna.del(`/api/listings/${id}`);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(fs.existsSync(path.join(data, 'uploads', photo)), false);
  fs.writeFileSync(path.join(fakeFs, 'var/www/torgana/.env'), 'BROKEN\n');
  await srv.stop();

  // 4. Список копий и восстановление
  assert.match(sh('restore.sh', ['list']), /2026-11-06 — 1 фото — настройки: есть/);
  const res = sh('restore.sh', ['2026-11-06', '--config']);
  assert.match(res, /Готово/);
  assert.equal(fs.readFileSync(path.join(fakeFs, 'var/www/torgana/.env'), 'utf8'), 'ADMIN_EMAIL=old@test.local\n');
  assert.ok(fs.readdirSync(path.join(data, 'backups')).some((n) => n.startsWith('before-restore-')));

  // 5. Сайт поднимается с восстановленными данными
  srv = await startServer(serverEnv);
  const g = client(srv.base);
  const l = await g.get(`/api/listings/${id}`);
  assert.equal(l.status, 200);
  assert.equal(l.data.listing.title, 'Велосипед Merida');
  assert.equal((await g.get(l.data.listing.photos[0])).status, 200);
  const login = await client(srv.base).post('/api/auth/login', { email: 'anna@test.local', password: 'password123' });
  assert.equal(login.status, 200);
  await srv.stop();
});

test('старые копии удаляются, свежие остаются', () => {
  for (const day of ['2026-11-07', '2026-11-30']) sh('backup.sh', [], { DAY: day });
  const left = fs.readdirSync(path.join(data, 'backups/db')).filter((n) => n.endsWith('.db.gz')).sort();
  assert.deepEqual(left, ['torgana-2026-11-30.db.gz']);
  const ups = fs.readdirSync(path.join(data, 'backups/uploads')).sort();
  assert.deepEqual(ups, ['2026-11-30']);
});

test('восстановление несуществующей даты — понятная ошибка, данные не тронуты', () => {
  assert.throws(() => sh('restore.sh', ['2020-01-01']), /Command failed/);
  assert.ok(fs.existsSync(path.join(data, 'data/torgana.db')));
});

'use strict';

// Согласованная копия базы SQLite без остановки сайта и проверка копии.
//   node scripts/db-copy.js backup <база> <куда>   — копия через VACUUM INTO (база при этом работает)
//   node scripts/db-copy.js check <файл>           — проверка целостности и краткая сводка
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const [cmd, a, b] = process.argv.slice(2);

function summary(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const ok = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (ok !== 'ok') throw new Error(`База повреждена: ${ok}`);
  const n = (t) => { try { return db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch { return 0; } };
  const s = { users: n('users'), listings: n('listings'), messages: n('messages'), uploads: n('uploads') };
  db.close();
  return s;
}

try {
  if (cmd === 'backup' && a && b) {
    if (!fs.existsSync(a)) throw new Error(`Нет базы ${a}`);
    fs.rmSync(b, { force: true });
    const db = new DatabaseSync(a);
    db.exec('PRAGMA busy_timeout = 10000');
    db.exec(`VACUUM INTO '${b.replace(/'/g, "''")}'`);
    db.close();
    const s = summary(b);
    console.log(`копия базы: пользователей ${s.users}, объявлений ${s.listings}, сообщений ${s.messages}, фото ${s.uploads}`);
  } else if (cmd === 'check' && a) {
    const s = summary(a);
    console.log(`база в порядке: пользователей ${s.users}, объявлений ${s.listings}, сообщений ${s.messages}, фото ${s.uploads}`);
  } else {
    console.error('Использование: db-copy.js backup <база> <куда> | check <файл>');
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

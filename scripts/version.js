'use strict';

// Номер версии сайта (package.json → version): V1.0.0 → V1.0.1 → … Повышает его «Выпуск» (.github/workflows/release.yml).
//   node scripts/version.js            — показать текущую версию
//   node scripts/version.js patch      — 1.0.0 → 1.0.1 (исправления и небольшие доработки — обычный выпуск)
//   node scripts/version.js minor      — 1.0.5 → 1.1.0 (заметная новая возможность)
//   node scripts/version.js major      — 1.4.2 → 2.0.0 (большое обновление)
// Печатает новую версию без «v», чтобы её можно было взять в скрипт.
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'package.json');

function bump(version, part) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!m) throw new Error(`Версия в package.json должна быть вида 1.0.0, сейчас: ${version}`);
  let [maj, min, pat] = m.slice(1).map(Number);
  if (part === 'major') { maj += 1; min = 0; pat = 0; } else if (part === 'minor') { min += 1; pat = 0; } else if (part === 'patch') pat += 1;
  else throw new Error('Укажите patch, minor или major');
  return `${maj}.${min}.${pat}`;
}

if (require.main === module) {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const pkg = JSON.parse(raw);
    const part = process.argv[2];
    if (part) {
      pkg.version = bump(pkg.version, part);
      // Меняем только строку версии — остальное в package.json остаётся как было.
      fs.writeFileSync(FILE, raw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${pkg.version}$2`));
    }
    console.log(pkg.version);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { bump };

'use strict';
// Одноразовые переносы данных при запуске: каждый помечается ключом в settings и больше не выполняется.
const taxonomy = require('./taxonomy');
const { blockedOf } = require('./prohibited');

module.exports = function migrate({ db, mailer, searchText, autoChecks }) {
  // 1.14: вход только с подтверждённой почтой. Один раз завершаем старые сессии с неподтверждённой почтой —
  // при следующем входе придёт код.
  if (mailer.ready() && !db.prepare('SELECT 1 FROM settings WHERE key = ?').get('codes_v1')) {
    const n = db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email_verified = 0)').run().changes;
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('codes_v1', JSON.stringify({ at: Date.now(), signedOut: n }));
    if (n) console.log(`Сессии с неподтверждённой почтой завершены: ${n}`);
  }
  // 1.35.1: один раз пересобираем текст для поиска — добавились русские написания марок («лада» → Lada).
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('search_v2')) {
    const rows = db.prepare('SELECT id, title, description, subcategory, attrs FROM listings').all();
    const upd = db.prepare('UPDATE listings SET search_text = ? WHERE id = ?');
    db.exec('BEGIN');
    for (const r of rows) { let attrs = {}; try { attrs = JSON.parse(r.attrs || '{}'); } catch { /* пусто */ } upd.run(searchText(r.title, r.description, { subcategory: r.subcategory, attrs }), r.id); }
    db.exec('COMMIT');
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('search_v2', JSON.stringify({ at: Date.now(), n: rows.length }));
  }
  // 1.48.0 (решение владельца 10 ноября): один раз меняем названия уже размещённых объявлений на собранные из характеристик.
  // Модель — из старого названия («Kia Rio, 2015» → Rio); не угадали — название прежнее до правки. Дата правки и проверка не меняются.
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('titles_v148')) {
    const rows = db.prepare(`SELECT id, title, description, subcategory, attrs FROM listings WHERE status != 'deleted' AND subcategory IN (${[...taxonomy.TITLE_SUBS].map(() => '?').join(',')})`).all(...taxonomy.TITLE_SUBS);
    const upd = db.prepare('UPDATE listings SET title = ?, attrs = ?, search_text = ? WHERE id = ?');
    let changed = 0; let kept = 0;
    db.exec('BEGIN');
    for (const r of rows) {
      let attrs = {}; try { attrs = JSON.parse(r.attrs || '{}') || {}; } catch { /* пусто */ }
      const x = taxonomy.retitle(r.subcategory, attrs, r.title);
      if (!x) { kept++; continue; }
      if (x.title === r.title && JSON.stringify(x.attrs) === JSON.stringify(attrs)) continue;
      upd.run(x.title, JSON.stringify(x.attrs), searchText(x.title, r.description, { subcategory: r.subcategory, attrs: x.attrs }), r.id);
      changed++;
    }
    db.exec('COMMIT');
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('titles_v148', JSON.stringify({ at: Date.now(), changed, kept }));
    console.log(`Названия из характеристик: изменено ${changed}, без изменений ${kept}`);
  }
  // 1.48.2 (решение владельца 10 ноября): алкоголь, табак и эротические товары запрещены. Уже опубликованные такие
  // объявления один раз уходят на проверку модератору с пометкой — снять их или вернуть решает человек.
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('ban_v1482')) {
    const rows = db.prepare("SELECT id, title, description, flags FROM listings WHERE status IN ('active', 'scheduled')").all();
    const upd = db.prepare("UPDATE listings SET status = 'pending', flags = ? WHERE id = ?");
    let n = 0;
    db.exec('BEGIN');
    for (const r of rows) {
      const b = blockedOf(r.title, r.description);
      if (!b) continue;
      upd.run([...new Set([...(r.flags ? r.flags.split(', ') : []), b.title])].join(', '), r.id);
      n++;
    }
    db.exec('COMMIT');
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('ban_v1482', JSON.stringify({ at: Date.now(), n }));
    if (n) console.log(`Алкоголь, табак, эротика: на проверку — ${n}`);
  }
  // 7 ноября 2026: письма с кодами не доходили — по просьбе владельца коды выключены, пока почту не починят
  // (включаются в «Модерация → Почта»). Только на работающем сайте с подключённой почтой и только один раз.
  if (mailer.ready() && !db.prepare('SELECT 1 FROM settings WHERE key = ?').get('mail_codes')) {
    db.saveSetting('mail_codes', { on: false, at: Date.now(), by: 'owner-request' });
  }
  // Автопроверка объявлений, которые ждали проверки до появления автопроверок (один раз при запуске).
  for (const { id } of db.prepare('SELECT id FROM listings WHERE status = \'pending\' AND checks = \'\'').all()) autoChecks.run(id);
};

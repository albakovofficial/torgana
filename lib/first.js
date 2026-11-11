'use strict';

// 1.52.0: медаль «Один из первых / Одна из первых» — первым 1000 продавцам Торганы, у кого одобрено объявление.
// Номер — по порядку первой публикации, медаль остаётся навсегда (даже если объявления потом сняты).
// Официальный аккаунт Торганы медаль не получает. Подпись (м./ж. род) угадываем по имени, человек может сменить её
// в настройках профиля (users.medal_form: '' — по имени, 'm' или 'f').
// Уведомления (колокольчик + push «решения модерации»):
// - «Медаль ваша» — сразу при первой публикации; тем, кто получил её при запуске (по старым объявлениям), — днём;
// - «Медаль ждёт вас» — один раз тем, кто зарегистрировался, но ещё ничего не разместил (пока медали остаются).

const LIMIT = 1000;
const HOUR = 3600 * 1000;
const INVITE_AFTER = Number(process.env.FIRST_INVITE_AFTER_MS) || 2 * HOUR; // новичку — через 2 часа после регистрации, если так и не начал объявление
const BATCH = 200; // за один проход таймера

// Имена на -а/-я, которые носят мужчины, и такие, что бывают у обоих.
const MALE_A = new Set(('никита илья кузьма фома лука савва данила миша паша дима ваня петя коля вова гоша лёша леша алёша алеша серёжа сережа гриша костя толя '
  + 'юра федя стёпа степа тёма тема сеня лёва лева боря витя вася жора рома лёня леня мустафа муса иса хамза яхья зия nikita ilya luka misha').split(' '));
const BOTH = new Set('саша женя валя шура слава sasha zhenya'.split(' '));
const FEMALE_SOFT = new Set('любовь нинель адель ассоль юдифь эсфирь'.split(' '));

// 'f' | 'm' | '' — по имени и фамилии: отчество решает сразу, дальше — голоса окончаний.
function guessForm(name) {
  const words = String(name || '').toLowerCase().split(/[^a-zа-яё]+/).filter((w) => w.length > 1);
  for (const w of words) {
    if (/(овна|евна|ична)$/.test(w)) return 'f';
    if (w.length > 5 && /(ович|евич)$/.test(w)) return 'm';
  }
  let f = 0; let m = 0;
  for (const w of words) {
    if (BOTH.has(w)) continue;
    if (MALE_A.has(w)) { m += 3; continue; }
    if (FEMALE_SOFT.has(w)) { f += 3; continue; }
    if (/(ова|ева|ёва|ина|ына|ская|цкая|ая)$/.test(w)) f += 2;
    else if (/(ов|ев|ёв|ин|ын|ский|цкий|ой)$/.test(w)) m += 2;
    else if (/[ая]$/.test(w)) f += 2;
    else if (/[бвгджзйклмнпрстфхцчшщ]$/.test(w)) m += 1;
  }
  return f > m ? 'f' : m > f ? 'm' : '';
}

module.exports = function first({ db, h, alerts, business }) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const fresh = !cols.includes('first_no');
  for (const [c, d] of [['first_no', 'INTEGER'], ['first_at', 'INTEGER'], ['first_told_at', 'INTEGER'], ['first_invited_at', 'INTEGER'], ['medal_form', "TEXT NOT NULL DEFAULT ''"]]) {
    if (!cols.includes(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${d}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_first_no ON users(first_no) WHERE first_no IS NOT NULL');

  const given = () => db.prepare('SELECT COALESCE(MAX(first_no), 0) AS n FROM users').get().n;
  const left = () => Math.max(0, LIMIT - given());
  const formOf = (u) => (u.medal_form === 'f' || u.medal_form === 'm' ? u.medal_form : guessForm(u.name) || 'm');
  // Для ответов API (badges.first): номер и подпись; null — медали нет.
  const of = (u) => (u && u.first_no ? { no: u.first_no, form: formOf(u), own: u.medal_form || '' } : null);
  const title = (u) => (formOf(u) === 'f' ? 'Одна из первых' : 'Один из первых');

  // Выдать номер, если продавцу он положен и ещё не выдан. Возвращает номер или 0.
  function award(userId) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!u || u.first_no || u.is_blocked || u.deleted_at || business.isOfficial(u)) return 0;
    const no = given() + 1;
    if (no > LIMIT) return 0;
    db.prepare('UPDATE users SET first_no = ?, first_at = ? WHERE id = ? AND first_no IS NULL').run(no, h.now(), u.id);
    return no;
  }

  function tell(u) {
    db.prepare('UPDATE users SET first_told_at = ? WHERE id = ?').run(h.now(), u.id);
    alerts.notify(u.id, 'moderation', {
      title: `Медаль «${title(u)}» — ваша!`,
      body: `Ваш номер — ${u.first_no}. Вы в первой тысяче продавцов Торганы, медаль останется в профиле навсегда`,
      url: `/u/${u.id}`, tag: 'first-medal', icon: 'medal', tone: 'ok'
    });
  }

  // Публикация объявления (модерация одобрила, запланированное вышло, «Опубликовать снова»).
  function onPublished(listingId) {
    const l = db.prepare('SELECT user_id FROM listings WHERE id = ?').get(listingId);
    if (!l || !award(l.user_id)) return;
    tell(db.prepare('SELECT * FROM users WHERE id = ?').get(l.user_id));
  }

  // Первый запуск: номера тем, у кого уже есть одобренные объявления, — по дате первой публикации.
  if (fresh) {
    const rows = db.prepare(`SELECT user_id, MIN(created_at) AS at FROM listings WHERE status IN ('active', 'sold', 'archived', 'scheduled')
      GROUP BY user_id ORDER BY at, user_id`).all();
    for (const r of rows) award(r.user_id);
  }

  // Днём по Москве (10:00–20:59): поздравления тем, кто получил медаль при запуске, и одно приглашение новичкам.
  function tick(force = !!process.env.FIRST_ANYTIME) { // FIRST_ANYTIME — для тестов
    const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Moscow' }));
    if (!force && (hour < 10 || hour > 20)) return;
    for (const u of db.prepare('SELECT * FROM users WHERE first_no IS NOT NULL AND first_told_at IS NULL AND is_blocked = 0 AND deleted_at IS NULL LIMIT ?').all(BATCH)) tell(u);
    const n = left();
    if (!n) return;
    const users = db.prepare(`SELECT * FROM users WHERE first_no IS NULL AND first_invited_at IS NULL AND is_blocked = 0 AND deleted_at IS NULL
      AND deactivated_at IS NULL AND created_at <= ? AND NOT EXISTS (SELECT 1 FROM listings WHERE listings.user_id = users.id) LIMIT ?`).all(h.now() - INVITE_AFTER, BATCH);
    for (const u of users) {
      db.prepare('UPDATE users SET first_invited_at = ? WHERE id = ?').run(h.now(), u.id);
      if (business.isOfficial(u)) continue;
      alerts.notify(u.id, 'moderation', {
        title: `Медаль «${title(u)}» ждёт вас`,
        body: `Первая тысяча продавцов получает медаль с личным номером, осталось ${n}. Разместите объявление — это бесплатно`,
        url: '/new', tag: 'first-invite', icon: 'medal', tone: 'ok'
      });
    }
  }
  setInterval(() => { try { tick(); } catch (e) { console.error('first:', e.message); } }, Number(process.env.FIRST_TICK_MS) || 15 * 60 * 1000).unref();

  return { LIMIT, guessForm, formOf, of, left, award, onPublished, tick };
};
module.exports.guessForm = guessForm;

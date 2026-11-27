'use strict';

// 1.46.0: репутация вместо отзывов — «не отзывы, а факты».
// - Сделка: в чате по объявлению обе стороны нажимают «Сделка состоялась». Кнопка появляется только после
//   настоящей переписки — от MIN_MSGS сообщений с каждой стороны.
// - Комплименты: после подтверждённой сделки — до трёх меток из списка (продавцу и покупателю — свои).
// - «Что-то пошло не так» — жалоба по сделке видна только модератору; вторая сторона может объясниться.
//   Подтверждённая жалоба видна в профиле и на 90 дней опускает уровень.
// - Уровни продавца (0–3) и «надёжный покупатель» считаются за последние 12 месяцев и хранятся в users.rep_*,
//   чтобы фильтр поиска «Надёжные продавцы» был быстрым.
// Защита от накрутки (сделка подтверждается, но не засчитывается):
//   pair  — та же пара уже засчитала сделку за 30 дней;
//   fresh — аккаунт одной из сторон младше 7 дней и без подтверждённого телефона;
//   ring  — эти двое продавали друг другу (встречная сделка за 90 дней) — на проверку модератору;
//   burst — покупатель подтвердил 5+ сделок за сутки — на проверку модератору.
const DAY = 24 * 3600 * 1000;
const MIN_MSGS = 3;
const FRESH_DAYS = process.env.REP_FRESH_DAYS !== undefined ? Number(process.env.REP_FRESH_DAYS) : 7; // в тестах — 0
const LEVELS = ['Новичок', 'Надёжный', 'Опытный', 'Мастер Торганы'];
const SELLER_TAGS = ['Всё как на фото', 'Быстро отвечает', 'Честный торг', 'Пришёл вовремя', 'Хорошо упаковал', 'Вежливый'];
const BUYER_TAGS = ['Пришёл вовремя', 'Вежливый', 'Без лишнего торга', 'Быстро отвечает'];
const ISSUE_REASONS = ['Товар не как на фото', 'Не пришёл на встречу', 'Просил предоплату или похоже на обман', 'Грубость', 'Другое'];
// 1.59.0: уровень — это задания. Уровень даётся, когда выполнены все его задания (и есть предыдущий).
// [ключ, текст, порог]: deals/praise — сколько за 12 месяцев, reply — какая скорость ответа нужна,
// age — дней на Торгане, clean — дней без подтверждённых жалоб (и столько же на Торгане).
const TASKS = [
  [],
  [['phone', 'Подтвердите телефон'], ['photo', 'Добавьте фото профиля'], ['deals', 'Проведите 5 сделок', 5], ['praise', 'Получите 3 комплимента', 3], ['reply', 'Отвечайте в течение дня', 'day']],
  [['deals', 'Проведите 30 сделок', 30], ['praise', 'Получите 15 комплиментов', 15], ['reply', 'Отвечайте за 1–3 часа', 'hours'], ['age', 'Будьте на Торгане 2 месяца', 60]],
  [['deals', 'Проведите 100 сделок', 100], ['praise', 'Получите 50 комплиментов', 50], ['reply', 'Отвечайте в течение часа', 'hour'], ['clean', '3 месяца без подтверждённых жалоб', 90]]
];
const REPLY_OK = { day: ['hour', 'hours', 'day'], hours: ['hour', 'hours'], hour: ['hour'] };
const FLAGS = { pair: 'Повторная сделка той же пары за 30 дней', fresh: 'Новый аккаунт без подтверждённого телефона', ring: 'Встречные сделки — продавали друг другу', burst: 'Покупатель подтвердил 5+ сделок за сутки' };

module.exports = function reputation({ route, db, h, replyStats }) {
  const { HttpError, readJson, rateLimit, requireUser, requireAdmin, str, now } = h;

  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
      listing_id INTEGER, listing_title TEXT NOT NULL DEFAULT '',
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_at INTEGER, buyer_at INTEGER, seller_no INTEGER, buyer_no INTEGER,
      confirmed_at INTEGER, counted INTEGER NOT NULL DEFAULT 0,
      flag TEXT NOT NULL DEFAULT '', review TEXT NOT NULL DEFAULT '', -- review: '' | pending | ok | dropped
      asked_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deals_seller ON deals(seller_id, counted, confirmed_at);
    CREATE INDEX IF NOT EXISTS idx_deals_buyer ON deals(buyer_id, counted, confirmed_at);
    CREATE INDEX IF NOT EXISTS idx_deals_review ON deals(review);
    CREATE TABLE IF NOT EXISTS deal_praise (
      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL, target_id INTEGER NOT NULL, role TEXT NOT NULL, tag TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY (deal_id, author_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_praise_target ON deal_praise(target_id, role, created_at);
    CREATE TABLE IF NOT EXISTS deal_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      listing_title TEXT NOT NULL DEFAULT '',
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_role TEXT NOT NULL, reason TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open', reply TEXT NOT NULL DEFAULT '', reply_at INTEGER, note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, decided_at INTEGER, decided_by INTEGER,
      UNIQUE (conversation_id, author_id)
    );
    CREATE INDEX IF NOT EXISTS idx_issues_target ON deal_issues(target_id, status, decided_at);
    CREATE INDEX IF NOT EXISTS idx_issues_status ON deal_issues(status);
  `);
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  for (const [c, d] of [['rep_level', 'INTEGER NOT NULL DEFAULT 0'], ['rep_deals', 'INTEGER NOT NULL DEFAULT 0'], ['rep_buyer', 'INTEGER NOT NULL DEFAULT 0']]) {
    if (!cols.includes(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${d}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_rep ON users(rep_level)');

  const userRow = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  // Обычные сообщения (не предложения цены) — их считаем для «настоящей переписки».
  const written = (cid, uid) => db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id = ? AND kind = \'\'').get(cid, uid).n;

  // ---------- счёт ----------
  const complaints = (uid, days, role) => db.prepare(`SELECT COUNT(*) AS n FROM deal_issues WHERE target_id = ? AND status = 'confirmed' AND decided_at > ?${role ? ' AND target_role = ?' : ''}`)
    .get(...[uid, now() - days * DAY, ...(role ? [role] : [])]).n;
  function compute(uid) {
    const u = userRow(uid);
    if (!u) return null;
    const year = now() - 365 * DAY;
    const deals = db.prepare('SELECT COUNT(*) AS n FROM deals WHERE seller_id = ? AND counted = 1 AND confirmed_at > ?').get(uid, year).n;
    const bought = db.prepare('SELECT COUNT(*) AS n FROM deals WHERE buyer_id = ? AND counted = 1 AND confirmed_at > ?').get(uid, year).n;
    const reply = replyStats(uid);
    const age = (now() - u.created_at) / DAY;
    const praise = db.prepare(`SELECT COUNT(*) AS n FROM deal_praise p JOIN deals d ON d.id = p.deal_id
      WHERE p.target_id = ? AND p.role = 'seller' AND d.counted = 1 AND p.created_at > ?`).get(uid, year).n;
    // Задания всех уровней с отметкой «выполнено» и прогрессом (для своей страницы репутации).
    const tasks = TASKS.map((list) => list.map(([key, text, n]) => {
      const t = { key, text, done: false };
      if (key === 'phone') t.done = !!u.phone_verified;
      else if (key === 'photo') t.done = !!u.avatar;
      else if (key === 'deals' || key === 'praise') { const have = key === 'deals' ? deals : praise; t.done = have >= n; t.have = Math.min(have, n); t.need = n; }
      else if (key === 'reply') t.done = reply ? REPLY_OK[n].includes(reply.time) : n === 'day'; // ещё не отвечал — «в течение дня» не мешает
      else if (key === 'age') t.done = age >= n;
      else if (key === 'clean') t.done = age >= n && !complaints(uid, n, 'seller');
      return t;
    }));
    let level = 0;
    while (level < 3 && tasks[level + 1].every((t) => t.done)) level += 1;
    if (level && complaints(uid, 90, 'seller')) level -= 1; // подтверждённая жалоба — на уровень ниже на 90 дней
    const buyer = bought >= 3 && !complaints(uid, 90, 'buyer') ? 1 : 0;
    // 1.47.2: новый уровень — push и колокольчик (понижение сообщает решение по жалобе).
    if (level > u.rep_level) h.alerts.notify(uid, 'level', { уровень: LEVELS[level] }, { url: '/profile/reputation', icon: 'star', tone: 'ok', tag: 'rep-level' });
    if (u.rep_level !== level || u.rep_deals !== deals || u.rep_buyer !== buyer) db.prepare('UPDATE users SET rep_level = ?, rep_deals = ?, rep_buyer = ? WHERE id = ?').run(level, deals, buyer, uid);
    // Уровень изменился — счётчики выдачи с фильтром «Надёжные продавцы» (db.memo) пересчитываются.
    if (u.rep_level !== level) db.exec('UPDATE listings_gen SET n = n + 1');
    return { u, deals, bought, reply, level, buyer, tasks };
  }
  const tagsOf = (uid, role) => db.prepare(`SELECT p.tag, COUNT(*) AS n FROM deal_praise p JOIN deals d ON d.id = p.deal_id
      WHERE p.target_id = ? AND p.role = ? AND d.counted = 1 AND p.created_at > ? GROUP BY p.tag ORDER BY n DESC, p.tag LIMIT 4`).all(uid, role, now() - 365 * DAY)
    .map((r) => ({ tag: r.tag, n: r.n }));
  // Для публичных страниц — компактно: уровень, сделки, ответ, подтверждённые жалобы, комплименты, вехи.
  function repOf(uid) {
    const c = compute(uid);
    if (!c) return null;
    const ever = db.prepare('SELECT COUNT(*) AS n FROM deals WHERE seller_id = ? AND counted = 1').get(uid).n;
    // 1.49.0: всего подтверждённых сделок за всё время — продажи и покупки (число «сделок» в профиле).
    const total = db.prepare('SELECT COUNT(*) AS n FROM deals WHERE (seller_id = ? OR buyer_id = ?) AND counted = 1').get(uid, uid).n;
    const bad = complaints(uid, 365);
    const marks = [];
    if (ever >= 1) marks.push('first');
    for (const n of [10, 50, 100]) if (ever >= n) marks.push(String(n));
    if ((now() - c.u.created_at) / DAY >= 365 && ever >= 1 && !bad) marks.push('year');
    return {
      level: c.level, levelName: LEVELS[c.level], deals: c.deals, bought: c.bought, total, buyer: !!c.buyer, complaints: bad,
      reply: c.reply, tags: tagsOf(uid, 'seller'), buyerTags: tagsOf(uid, 'buyer'), marks, newbie: c.deals < 3
    };
  }
  const levelOf = (uid) => { const u = userRow(uid); return u ? { level: u.rep_level, levelName: LEVELS[u.rep_level], deals: u.rep_deals, buyer: !!u.rep_buyer } : null; };

  // ---------- защита: засчитывать ли подтверждённую сделку ----------
  function judge(d) {
    const t = now();
    const s = userRow(d.seller_id); const b = userRow(d.buyer_id);
    const fresh = (u) => t - u.created_at < FRESH_DAYS * DAY && !u.phone_verified;
    if (db.prepare(`SELECT 1 FROM deals WHERE id != ? AND counted = 1 AND confirmed_at > ? AND ((seller_id = ? AND buyer_id = ?) OR (seller_id = ? AND buyer_id = ?))`)
      .get(d.id, t - 30 * DAY, d.seller_id, d.buyer_id, d.buyer_id, d.seller_id)) {
      // встречная сделка — кольцо; та же сторона — просто повтор
      const reverse = db.prepare('SELECT 1 FROM deals WHERE id != ? AND counted = 1 AND confirmed_at > ? AND seller_id = ? AND buyer_id = ?').get(d.id, t - 90 * DAY, d.buyer_id, d.seller_id);
      return reverse ? { counted: 0, flag: 'ring', review: 'pending' } : { counted: 0, flag: 'pair', review: '' };
    }
    if (db.prepare('SELECT 1 FROM deals WHERE id != ? AND counted = 1 AND confirmed_at > ? AND seller_id = ? AND buyer_id = ?').get(d.id, t - 90 * DAY, d.buyer_id, d.seller_id)) return { counted: 0, flag: 'ring', review: 'pending' };
    if (fresh(s) || fresh(b)) return { counted: 0, flag: 'fresh', review: '' };
    if (db.prepare('SELECT COUNT(*) AS n FROM deals WHERE buyer_id = ? AND confirmed_at > ? AND id != ?').get(d.buyer_id, t - DAY, d.id).n >= 4) return { counted: 0, flag: 'burst', review: 'pending' };
    return { counted: 1, flag: '', review: '' };
  }

  // ---------- сделка в чате ----------
  const convOf = (u, id) => {
    const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!c || (c.buyer_id !== u.id && c.seller_id !== u.id)) throw new HttpError(404, 'Диалог не найден');
    return c;
  };
  const dealRow = (cid) => db.prepare('SELECT * FROM deals WHERE conversation_id = ?').get(cid);
  function ensureDeal(c) {
    let d = dealRow(c.id);
    if (!d) {
      const l = db.prepare('SELECT title FROM listings WHERE id = ?').get(c.listing_id);
      db.prepare('INSERT OR IGNORE INTO deals (conversation_id, listing_id, listing_title, seller_id, buyer_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(c.id, c.listing_id, l ? l.title : '', c.seller_id, c.buyer_id, now());
      d = dealRow(c.id);
    }
    return d;
  }
  // Что показать в чате этому участнику.
  function chatState(uid, c) {
    const role = c.buyer_id === uid ? 'buyer' : 'seller';
    const other = role === 'buyer' ? 'seller' : 'buyer';
    const d = dealRow(c.id);
    const mine = d && (d[`${role}_at`] ? 'yes' : d[`${role}_no`] ? 'no' : '');
    const need = Math.max(0, MIN_MSGS - written(c.id, uid)) + Math.max(0, MIN_MSGS - written(c.id, role === 'buyer' ? c.seller_id : c.buyer_id));
    const issue = db.prepare('SELECT id, status FROM deal_issues WHERE conversation_id = ? AND author_id = ?').get(c.id, uid);
    const praised = d && !!db.prepare('SELECT 1 FROM deal_praise WHERE deal_id = ? AND author_id = ?').get(d.id, uid);
    return {
      role, mine: mine || '', other: !!(d && d[`${other}_at`]), confirmed: !!(d && d.confirmed_at), ready: need === 0,
      praised, tags: role === 'buyer' ? SELLER_TAGS : BUYER_TAGS, reasons: ISSUE_REASONS,
      issue: issue ? { status: issue.status } : null, canIssue: !issue && written(c.id, c.buyer_id) > 0 && written(c.id, c.seller_id) > 0
    };
  }

  route('POST', '/api/conversations/:id/deal', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`deal:${u.id}`, 60, 3600 * 1000);
    const c = convOf(u, parseInt(ctx.params.id, 10));
    const yes = (await readJson(ctx.req)).answer === 'yes';
    const role = c.buyer_id === u.id ? 'buyer' : 'seller';
    if (yes && (written(c.id, c.buyer_id) < MIN_MSGS || written(c.id, c.seller_id) < MIN_MSGS)) throw new HttpError(400, 'Подтвердить сделку можно после переписки — хотя бы по 3 сообщения с каждой стороны');
    let d = ensureDeal(c);
    if (d.confirmed_at) throw new HttpError(409, 'Сделка уже подтверждена');
    db.prepare(`UPDATE deals SET ${role}_at = ?, ${role}_no = ? WHERE id = ?`).run(yes ? now() : null, yes ? null : now(), d.id);
    d = dealRow(c.id);
    const otherId = role === 'buyer' ? c.seller_id : c.buyer_id;
    if (yes && d.seller_at && d.buyer_at) {
      const j = judge(d);
      db.prepare('UPDATE deals SET confirmed_at = ?, counted = ?, flag = ?, review = ? WHERE id = ?').run(now(), j.counted, j.flag, j.review, d.id);
      compute(c.seller_id); compute(c.buyer_id);
      if (j.review === 'pending') h.alerts.notifyAdmins('adm-deal', { объявление: d.listing_title }, { url: '/admin?status=rep' });
      h.alerts.notify(otherId, 'deal-done', { объявление: d.listing_title }, { url: `/messages/${c.id}`, tag: `deal-${d.id}`, icon: 'check', tone: 'ok' });
    } else if (yes) {
      h.alerts.notify(otherId, 'deal-confirm', { имя: u.name, объявление: d.listing_title }, { url: `/messages/${c.id}`, tag: `deal-${d.id}`, icon: 'check', tone: 'wait' });
    }
    return { deal: chatState(u.id, c) };
  });

  route('POST', '/api/conversations/:id/praise', async (ctx) => {
    const u = requireUser(ctx);
    const c = convOf(u, parseInt(ctx.params.id, 10));
    const d = dealRow(c.id);
    if (!d || !d.confirmed_at) throw new HttpError(400, 'Сначала подтвердите сделку');
    if (db.prepare('SELECT 1 FROM deal_praise WHERE deal_id = ? AND author_id = ?').get(d.id, u.id)) throw new HttpError(409, 'Вы уже отметили эту сделку');
    const role = c.buyer_id === u.id ? 'seller' : 'buyer'; // роль того, кого хвалят
    const allowed = role === 'seller' ? SELLER_TAGS : BUYER_TAGS;
    const b = await readJson(ctx.req);
    const tags = [...new Set(Array.isArray(b.tags) ? b.tags.map(String) : [])];
    if (!tags.length || tags.length > 3 || tags.some((t) => !allowed.includes(t))) throw new HttpError(400, 'Выберите от одной до трёх меток из списка');
    const target = role === 'seller' ? c.seller_id : c.buyer_id;
    const ins = db.prepare('INSERT INTO deal_praise (deal_id, author_id, target_id, role, tag, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const t of tags) ins.run(d.id, u.id, target, role, t, now());
    h.alerts.notify(target, 'praise', { имя: u.name, отметки: tags.join(' · ') }, { url: '/profile/reputation', icon: 'star', tone: 'ok', tag: `praise-${d.id}` });
    return { deal: chatState(u.id, c) };
  });

  // «Что-то пошло не так» — видит только модератор; вторую сторону просим объясниться.
  route('POST', '/api/conversations/:id/issue', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`issue:${u.id}`, 10, 24 * 3600 * 1000);
    const c = convOf(u, parseInt(ctx.params.id, 10));
    const st = chatState(u.id, c);
    if (st.issue) throw new HttpError(409, 'Вы уже сообщили о проблеме в этой переписке');
    if (!st.canIssue) throw new HttpError(400, 'Сообщить о проблеме можно после переписки');
    const b = await readJson(ctx.req);
    if (!ISSUE_REASONS.includes(b.reason)) throw new HttpError(400, 'Выберите, что случилось');
    const text = str(b.text, 500);
    const target = c.buyer_id === u.id ? c.seller_id : c.buyer_id;
    const l = db.prepare('SELECT title FROM listings WHERE id = ?').get(c.listing_id);
    db.prepare('INSERT INTO deal_issues (conversation_id, listing_title, author_id, target_id, target_role, reason, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, l ? l.title : '', u.id, target, c.buyer_id === u.id ? 'seller' : 'buyer', b.reason, text, now());
    h.alerts.notifyAdmins('adm-deal-issue', { жалоба: b.reason, объявление: l ? l.title : '', имя: u.name }, { url: '/admin?status=rep' }, u.id);
    h.alerts.notify(target, 'issue-you', {}, { url: '/profile/reputation', tag: `issue-${c.id}`, icon: 'warn', tone: 'wait' });
    return { deal: chatState(u.id, c) };
  });

  const issueJson = (r, who) => ({
    id: r.id, conversationId: who === 'admin' ? r.conversation_id : undefined, title: r.listing_title, reason: r.reason, text: who === 'target' ? '' : r.text,
    status: r.status, reply: r.reply, replyAt: r.reply_at, note: r.note, at: r.created_at, decidedAt: r.decided_at, canReply: who === 'target' && r.status === 'open' && !r.reply_at
  });
  // Объяснение второй стороны — один раз, пока жалоба открыта.
  route('POST', '/api/issues/:id/reply', async (ctx) => {
    const u = requireUser(ctx);
    const r = db.prepare('SELECT * FROM deal_issues WHERE id = ? AND target_id = ?').get(parseInt(ctx.params.id, 10), u.id);
    if (!r) throw new HttpError(404, 'Жалоба не найдена');
    if (r.status !== 'open' || r.reply_at) throw new HttpError(409, 'Ответить можно один раз, пока жалоба на рассмотрении');
    const text = str((await readJson(ctx.req)).text, 1000);
    if (text.length < 5) throw new HttpError(400, 'Напишите, что произошло');
    db.prepare('UPDATE deal_issues SET reply = ?, reply_at = ? WHERE id = ?').run(text, now(), r.id);
    return { ok: true };
  });

  // Своя репутация: то же, что видят другие, плюс жалобы на меня (с возможностью ответить) и мои.
  route('GET', '/api/my/reputation', (ctx) => {
    const u = requireUser(ctx);
    const c = compute(u.id);
    // Задания следующего уровня — что осталось сделать (на высшем уровне — null).
    const next = c.level < 3 ? { level: c.level + 1, name: LEVELS[c.level + 1], tasks: c.tasks[c.level + 1] } : null;
    return {
      rep: repOf(u.id), next,
      against: db.prepare('SELECT * FROM deal_issues WHERE target_id = ? ORDER BY id DESC LIMIT 30').all(u.id).map((r) => issueJson(r, 'target')),
      mine: db.prepare('SELECT * FROM deal_issues WHERE author_id = ? ORDER BY id DESC LIMIT 30').all(u.id).map((r) => issueJson(r, 'author'))
    };
  });

  // ---------- модерация ----------
  const brief = (id) => { const x = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id); return x ? { id: x.id, name: x.name, email: x.email } : null; };
  route('GET', '/api/admin/reputation', (ctx) => {
    requireAdmin(ctx);
    return {
      issues: db.prepare('SELECT * FROM deal_issues WHERE status = \'open\' ORDER BY id LIMIT 100').all()
        .map((r) => ({ ...issueJson(r, 'admin'), author: brief(r.author_id), target: brief(r.target_id), targetRole: r.target_role })),
      deals: db.prepare('SELECT * FROM deals WHERE review = \'pending\' ORDER BY id LIMIT 100').all()
        .map((d) => ({ id: d.id, conversationId: d.conversation_id, title: d.listing_title, flag: d.flag, flagText: FLAGS[d.flag] || d.flag, at: d.confirmed_at, seller: brief(d.seller_id), buyer: brief(d.buyer_id) })),
      flags: FLAGS
    };
  });
  route('POST', '/api/admin/issues/:id', async (ctx) => {
    const admin = requireAdmin(ctx);
    const r = db.prepare('SELECT * FROM deal_issues WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!r) throw new HttpError(404, 'Жалоба не найдена');
    if (r.status !== 'open') throw new HttpError(409, 'Жалоба уже рассмотрена');
    const b = await readJson(ctx.req);
    const ok = b.decision === 'confirm';
    const note = str(b.note || b.reason, 500);
    if (ok && note.length < 5) throw new HttpError(400, 'Напишите коротко, что подтвердилось, — увидят обе стороны');
    db.prepare('UPDATE deal_issues SET status = ?, note = ?, decided_at = ?, decided_by = ? WHERE id = ?').run(ok ? 'confirmed' : 'dismissed', note, now(), admin.id, r.id);
    compute(r.target_id);
    h.audit(admin, ok ? 'issue-confirmed' : 'issue-dismissed', { userId: r.target_id }, { reason: r.reason, note, title: r.listing_title });
    h.alerts.notify(r.author_id, ok ? 'issue-ok' : 'issue-no', { объявление: r.listing_title, причина: note || 'без комментария модератора' }, { url: '/profile/reputation', tag: `issue-${r.id}`, icon: 'warn', tone: ok ? 'ok' : 'wait' });
    h.alerts.notify(r.target_id, ok ? 'issue-you-ok' : 'issue-you-no', { объявление: r.listing_title, причина: note }, { url: '/profile/reputation', tag: `issue-${r.id}`, icon: 'warn', tone: ok ? 'bad' : 'ok' });
    return { ok: true };
  });
  route('POST', '/api/admin/deals/:id', async (ctx) => {
    const admin = requireAdmin(ctx);
    const d = db.prepare('SELECT * FROM deals WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!d || d.review !== 'pending') throw new HttpError(404, 'Сделка не ждёт проверки');
    const ok = (await readJson(ctx.req)).decision === 'count';
    db.prepare('UPDATE deals SET review = ?, counted = ? WHERE id = ?').run(ok ? 'ok' : 'dropped', ok ? 1 : 0, d.id);
    compute(d.seller_id); compute(d.buyer_id);
    h.audit(admin, ok ? 'deal-counted' : 'deal-dropped', { userId: d.seller_id }, { title: d.listing_title, flag: d.flag, buyer: d.buyer_id });
    return { ok: true };
  });
  const pendingCount = () => db.prepare('SELECT (SELECT COUNT(*) FROM deal_issues WHERE status = \'open\') + (SELECT COUNT(*) FROM deals WHERE review = \'pending\') AS n').get().n;

  // ---------- напоминание «Сделка состоялась?» и пересчёт ----------
  // Через сутки после переписки (по 3+ сообщения с каждой стороны, последнее — от суток до недели назад) — одно
  // уведомление обоим, если никто ещё не ответил.
  function remindTick() {
    const t = now();
    const rows = db.prepare(`SELECT c.id, c.buyer_id, c.seller_id, c.listing_id, MAX(m.created_at) AS last,
        SUM(m.sender_id = c.buyer_id AND m.kind = '') AS nb, SUM(m.sender_id = c.seller_id AND m.kind = '') AS ns
      FROM conversations c JOIN messages m ON m.conversation_id = c.id
      LEFT JOIN deals d ON d.conversation_id = c.id
      WHERE c.updated_at > ? AND (d.id IS NULL OR (d.asked_at IS NULL AND d.seller_at IS NULL AND d.buyer_at IS NULL AND d.seller_no IS NULL AND d.buyer_no IS NULL))
      GROUP BY c.id HAVING nb >= ? AND ns >= ? AND last < ? AND last > ? LIMIT 200`).all(t - 8 * DAY, MIN_MSGS, MIN_MSGS, t - DAY, t - 7 * DAY);
    for (const r of rows) {
      const d = ensureDeal({ id: r.id, listing_id: r.listing_id, seller_id: r.seller_id, buyer_id: r.buyer_id });
      db.prepare('UPDATE deals SET asked_at = ? WHERE id = ?').run(t, d.id);
      for (const uid of [r.buyer_id, r.seller_id]) h.alerts.notify(uid, 'deal-remind', { объявление: d.listing_title }, { url: `/messages/${r.id}`, tag: `deal-${d.id}`, icon: 'check', tone: 'wait' });
    }
    return rows.length;
  }
  // Окно в 12 месяцев и скорость ответа меняются со временем — раз в 6 часов пересчитываем тех, у кого есть сделки.
  function refreshTick() {
    const ids = db.prepare('SELECT DISTINCT seller_id AS id FROM deals WHERE confirmed_at > ? UNION SELECT DISTINCT buyer_id FROM deals WHERE confirmed_at > ? UNION SELECT id FROM users WHERE rep_level > 0 OR rep_buyer > 0')
      .all(now() - 400 * DAY, now() - 400 * DAY);
    for (const r of ids) compute(r.id);
    return ids.length;
  }
  setInterval(() => { try { remindTick(); } catch (e) { console.error('deal remind:', e.message); } }, 30 * 60 * 1000).unref();
  setInterval(() => { try { refreshTick(); } catch (e) { console.error('rep refresh:', e.message); } }, 6 * 3600 * 1000).unref();

  return { chatState, repOf, levelOf, compute, pendingCount, remindTick, refreshTick, LEVELS };
};

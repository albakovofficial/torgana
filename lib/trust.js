'use strict';

// Доверие к продавцу: «Телефон подтверждён» (номер пришёл из Яндекс ID или VK ID) и проверенный бизнес —
// ИП или компания отправляет ИНН и ОГРН(ИП), модератор сверяет по ЕГРЮЛ/ЕГРИП и подтверждает.
// 1.45.0: «Проверенный бренд» — объёмный значок с галочкой — только у правообладателя товарного знака из реестра
// Роспатента: сначала проверенный ИНН, затем номер свидетельства; модератор сверяет запись в открытом реестре ФИПС
// (правообладатель — та же компания или ИП, срок действия не истёк). Значок сам пропадает, когда срок кончается.
// Защита от обмана: реестры открытые, поэтому номеров мало — нужны документы (свидетельство или выписка из реестра и
// письмо-подтверждение с личным кодом заявки за подписью руководителя или ИП), документы видят только владелец и
// модератор (не лежат в публичных /uploads), галочку выдаёт только модератор, отметив все пункты проверки; один знак —
// один аккаунт; любая правка данных компании или знака снимает галочку до новой проверки.
const KINDS = { ip: 'ИП', org: 'Компания' };

// Контрольные суммы ИНН (10 цифр — организация, 12 — ИП и физлицо), ОГРН (13) и ОГРНИП (15).
function innValid(inn) {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;
  const d = [...inn].map(Number);
  const sum = (w, n) => (w.reduce((a, k, i) => a + k * d[i], 0) % 11) % 10 === d[n];
  return inn.length === 10 ? sum([2, 4, 10, 3, 5, 9, 4, 6, 8], 9)
    : sum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 10) && sum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 11);
}
function ogrnValid(ogrn) {
  if (!/^\d{13}$|^\d{15}$/.test(ogrn)) return false;
  const body = BigInt(ogrn.slice(0, -1));
  return Number((body % (ogrn.length === 13 ? 11n : 13n)) % 10n) === Number(ogrn.slice(-1));
}

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = function trust({ route, db, h, mailer, dataDir }) {
  const { HttpError, readJson, requireUser, requireAdmin, str, now } = h;

  // Значки продавца для публичных страниц.
  const tmLive = (u) => u.biz_status === 'verified' && u.tm_status === 'verified' && u.tm_until > now();
  const badgesOf = (u) => ({
    phone: !!u.phone_verified,
    biz: u.biz_status === 'verified' ? { kind: KINDS[u.biz_kind] || 'Компания', name: u.biz_name } : null,
    tm: tmLive(u) ? { number: u.tm_number, name: u.tm_name, until: u.tm_until } : null
  });
  // Заявка на товарный знак — для владельца и модератора.
  const tmOf = (u) => (u.tm_status ? { status: u.tm_status, number: u.tm_number, name: u.tm_name, until: u.tm_until, note: u.tm_note, at: u.tm_at, live: tmLive(u) } : null);
  const fipsUrl = (n) => `https://fips.ru/registers-doc-view/fips_servlet?DB=RUTM&DocNumber=${encodeURIComponent(n)}&TypeFile=html`;
  // Заявка на проверку бизнеса — для владельца и модератора. Отправил заявку — значит, бизнес: аккаунт становится бизнес-аккаунтом.
  const bizOf = (u) => (u.biz_status ? { status: u.biz_status, kind: u.biz_kind, name: u.biz_name, inn: u.biz_inn, ogrn: u.biz_ogrn, note: u.biz_note, at: u.biz_at } : null);

  route('POST', '/api/me/business', async (ctx) => {
    const u = requireUser(ctx);
    h.rateLimit(`biz:${u.id}`, 10, 60 * 60 * 1000);
    const b = await readJson(ctx.req);
    const name = str(b.name, 120);
    const inn = String(b.inn || '').replace(/\D/g, '');
    const ogrn = String(b.ogrn || '').replace(/\D/g, '');
    if (name.length < 3) throw new HttpError(400, 'Укажите название — как в выписке ЕГРЮЛ или ЕГРИП');
    if (!innValid(inn)) throw new HttpError(400, 'Проверьте ИНН — в нём ошибка');
    if (!ogrnValid(ogrn)) throw new HttpError(400, 'Проверьте ОГРН или ОГРНИП — в нём ошибка');
    const kind = ogrn.length === 15 ? 'ip' : 'org';
    if ((kind === 'ip') !== (inn.length === 12)) throw new HttpError(400, kind === 'ip' ? 'У ИП ИНН из 12 цифр' : 'У организации ИНН из 10 цифр');
    db.prepare('UPDATE users SET biz_kind = ?, biz_name = ?, biz_inn = ?, biz_ogrn = ?, biz_status = \'pending\', biz_note = \'\', biz_at = ?, biz_account = 1 WHERE id = ?').run(kind, name, inn, ogrn, now(), u.id);
    // Данные компании изменились — галочка бренда снимается до новой проверки модератором.
    if (u.tm_status === 'verified') db.prepare('UPDATE users SET tm_status = \'pending\', tm_at = ? WHERE id = ?').run(now(), u.id);
    return { business: bizOf(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) };
  });

  route('DELETE', '/api/me/business', (ctx) => {
    const u = requireUser(ctx);
    db.prepare('UPDATE users SET biz_status = \'\', biz_kind = \'\', biz_name = \'\', biz_inn = \'\', biz_ogrn = \'\', biz_note = \'\', biz_at = NULL WHERE id = ?').run(u.id);
    clearTm(u.id);
    return { business: null };
  });

  route('POST', '/api/admin/users/:id/business', async (ctx) => {
    const admin = requireAdmin(ctx);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!u || !u.biz_status) throw new HttpError(404, 'Заявки нет');
    const b = await readJson(ctx.req);
    const ok = b.decision === 'approve';
    const reason = str(b.reason, 500);
    if (!ok && reason.length < 5) throw new HttpError(400, 'Напишите, что не так — увидит пользователь');
    db.prepare('UPDATE users SET biz_status = ?, biz_note = ?, biz_at = ? WHERE id = ?').run(ok ? 'verified' : 'rejected', ok ? '' : reason, now(), u.id);
    h.audit(admin, ok ? 'biz-verified' : 'biz-rejected', { userId: u.id }, { reason, name: u.biz_name, inn: u.biz_inn });
    mailer.notifyAccount(u.id, ok ? 'biz-verified' : 'biz-rejected', ok ? u.biz_name : reason);
    h.alerts.notify(u.id, 'moderation', { title: ok ? 'Бизнес подтверждён' : 'Проверка бизнеса не пройдена', body: ok ? `${u.biz_name} — значок появится у ваших объявлений` : reason, url: '/profile/settings#s-biz', tag: 'biz', icon: 'shield', tone: ok ? 'ok' : 'bad' });
    return { ok: true };
  });

  // ---------- товарный знак (1.45.0) ----------
  // Статусы: '' — нет заявки, pending — «на проверке» (менять нельзя, только отозвать), verified — галочка,
  // rejected — «нужно исправить» (с причиной от модератора).
  const DOCS_DIR = path.join(dataDir, 'verify-docs'); // не публичная папка: отдаём только через API владельцу и модератору
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  db.exec(`CREATE TABLE IF NOT EXISTS verify_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, file TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_verify_docs_user ON verify_docs(user_id);`);
  const DOC_KINDS = { cert: 'Свидетельство или выписка из реестра', letter: 'Письмо-подтверждение с кодом', power: 'Доверенность' };
  const MIME = [['application/pdf', 'pdf', (b) => b.slice(0, 5).toString() === '%PDF-'], ['image/jpeg', 'jpg', (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF],
    ['image/png', 'png', (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))], ['image/webp', 'webp', (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP']];
  const docsOf = (uid) => db.prepare('SELECT id, kind, mime, size, name, created_at FROM verify_docs WHERE user_id = ? ORDER BY id').all(uid)
    .map((d) => ({ id: d.id, kind: d.kind, kindName: DOC_KINDS[d.kind], mime: d.mime, size: d.size, name: d.name, at: d.created_at }));
  const dropDocs = (uid) => {
    for (const d of db.prepare('SELECT file FROM verify_docs WHERE user_id = ?').all(uid)) fs.rm(path.join(DOCS_DIR, d.file), { force: true }, () => {});
    db.prepare('DELETE FROM verify_docs WHERE user_id = ?').run(uid);
  };
  // Личный код заявки — его пишут в письме-подтверждении, чтобы чужие или старые документы не подошли.
  const codeOf = (u) => {
    if (u.tm_code) return u.tm_code;
    const code = `TG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    db.prepare('UPDATE users SET tm_code = ? WHERE id = ?').run(code, u.id);
    return code;
  };
  const clearTm = (uid) => {
    dropDocs(uid);
    db.prepare('UPDATE users SET tm_status = \'\', tm_number = \'\', tm_name = \'\', tm_note = \'\', tm_until = 0, tm_at = NULL, tm_code = \'\' WHERE id = ?').run(uid);
  };
  const userById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const locked = (u) => { if (u.tm_status === 'pending') throw new HttpError(409, 'Заявка на проверке — дождитесь решения или отзовите её'); };

  route('GET', '/api/me/trademark', (ctx) => {
    const u = requireUser(ctx);
    return { trademark: tmOf(u), code: codeOf(u), docs: docsOf(u.id), kinds: DOC_KINDS };
  });
  // Документы: PDF, JPG, PNG или WebP до 8 МБ, не больше 6 файлов. Проверяем по содержимому, а не по названию.
  route('POST', '/api/me/verify-docs', async (ctx) => {
    const u = requireUser(ctx);
    h.rateLimit(`vdoc:${u.id}`, 30, 60 * 60 * 1000);
    locked(u);
    const b = await readJson(ctx.req, 12 * 1024 * 1024);
    if (!DOC_KINDS[b.kind]) throw new HttpError(400, 'Выберите, что это за документ');
    const m = /^data:[\w.+/-]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
    if (!m) throw new HttpError(400, 'Загрузите PDF, JPG, PNG или WebP');
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length > 8 * 1024 * 1024) throw new HttpError(400, 'Файл больше 8 МБ');
    const type = MIME.find(([, , test]) => buf.length > 12 && test(buf));
    if (!type) throw new HttpError(400, 'Загрузите PDF, JPG, PNG или WebP');
    if (db.prepare('SELECT COUNT(*) AS n FROM verify_docs WHERE user_id = ?').get(u.id).n >= 6) throw new HttpError(400, 'Не больше 6 документов — удалите лишние');
    const file = `${u.id}-${crypto.randomBytes(12).toString('hex')}.${type[1]}`;
    fs.writeFileSync(path.join(DOCS_DIR, file), buf, { mode: 0o600 });
    db.prepare('INSERT INTO verify_docs (user_id, kind, file, mime, size, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(u.id, b.kind, file, type[0], buf.length, str(b.name, 120), now());
    return { docs: docsOf(u.id) };
  });
  route('DELETE', '/api/me/verify-docs/:id', (ctx) => {
    const u = requireUser(ctx);
    locked(u);
    const d = db.prepare('SELECT * FROM verify_docs WHERE id = ? AND user_id = ?').get(parseInt(ctx.params.id, 10), u.id);
    if (!d) throw new HttpError(404, 'Документ не найден');
    fs.rm(path.join(DOCS_DIR, d.file), { force: true }, () => {});
    db.prepare('DELETE FROM verify_docs WHERE id = ?').run(d.id);
    return { docs: docsOf(u.id) };
  });
  const sendDoc = (d) => {
    if (!d) throw new HttpError(404, 'Документ не найден');
    let body;
    try { body = fs.readFileSync(path.join(DOCS_DIR, d.file)); } catch { throw new HttpError(404, 'Файл не найден'); }
    return h.file(d.mime, body, `torgana-doc-${d.id}.${d.file.split('.').pop()}`);
  };
  route('GET', '/api/me/verify-docs/:id', (ctx) => { const u = requireUser(ctx); return sendDoc(db.prepare('SELECT * FROM verify_docs WHERE id = ? AND user_id = ?').get(parseInt(ctx.params.id, 10), u.id)); });
  route('GET', '/api/admin/verify-docs/:id', (ctx) => {
    const admin = requireAdmin(ctx);
    const d = db.prepare('SELECT * FROM verify_docs WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (d) h.audit(admin, 'tm-doc-viewed', { userId: d.user_id }, { doc: d.id, kind: d.kind });
    return sendDoc(d);
  });

  // Отправить на проверку: данные компании (на проверке или подтверждены), знак, срок и документы.
  route('POST', '/api/me/trademark', async (ctx) => {
    const u = requireUser(ctx);
    h.rateLimit(`tm:${u.id}`, 10, 60 * 60 * 1000);
    locked(u);
    if (!['pending', 'verified'].includes(u.biz_status)) throw new HttpError(400, 'Сначала отправьте данные компании или ИП — правообладателем должен быть ваш бизнес');
    const b = await readJson(ctx.req);
    const number = String(b.number || '').replace(/\D/g, '');
    const name = str(b.name, 100);
    const until = Date.parse(String(b.until || ''));
    if (!/^\d{3,7}$/.test(number)) throw new HttpError(400, 'Укажите номер свидетельства на товарный знак — только цифры, как в реестре Роспатента');
    if (name.length < 2) throw new HttpError(400, 'Укажите обозначение — название бренда, как в свидетельстве');
    if (!Number.isFinite(until) || until <= now()) throw new HttpError(400, 'Укажите дату окончания срока действия регистрации — она должна быть в будущем');
    if (until > now() + 11 * 365 * 86400000) throw new HttpError(400, 'Регистрация действует не больше 10 лет — проверьте дату');
    const kinds = new Set(docsOf(u.id).map((d) => d.kind));
    if (!kinds.has('cert')) throw new HttpError(400, 'Загрузите свидетельство на товарный знак или выписку из реестра Роспатента');
    if (!kinds.has('letter')) throw new HttpError(400, 'Загрузите письмо-подтверждение с кодом заявки — с подписью руководителя или ИП');
    const taken = db.prepare('SELECT id FROM users WHERE tm_number = ? AND tm_status = \'verified\' AND tm_until > ? AND id != ?').get(number, now(), u.id);
    if (taken) throw new HttpError(409, 'Этот товарный знак уже подтверждён у другого аккаунта. Если это ошибка — напишите в поддержку');
    codeOf(u);
    db.prepare('UPDATE users SET tm_status = \'pending\', tm_number = ?, tm_name = ?, tm_until = ?, tm_note = \'\', tm_at = ? WHERE id = ?').run(number, name, until, now(), u.id);
    return { trademark: tmOf(userById(u.id)), docs: docsOf(u.id) };
  });
  // Отозвать заявку или убрать галочку самому: данные знака и документы удаляются.
  route('DELETE', '/api/me/trademark', (ctx) => {
    const u = requireUser(ctx);
    clearTm(u.id);
    return { trademark: null };
  });

  // Пункты, которые модератор обязан отметить перед выдачей галочки (проверяются и на сервере).
  const TM_CHECKS = {
    registry: 'Знак найден в реестре Роспатента, статус «действует», срок не истёк',
    owner: 'Правообладатель в реестре — та же организация или ИП (название и ОГРН/ИНН совпадают)',
    cert: 'Свидетельство или выписка совпадают с записью в реестре',
    letter: 'Письмо с кодом заявки подписано руководителем из ЕГРЮЛ (или самим ИП) либо по приложенной доверенности'
  };
  // Модератор: выдать галочку (все пункты отмечены, можно поправить срок по реестру) или вернуть на исправление.
  route('POST', '/api/admin/users/:id/trademark', async (ctx) => {
    const admin = requireAdmin(ctx);
    const u = userById(parseInt(ctx.params.id, 10));
    if (!u || !u.tm_status) throw new HttpError(404, 'Заявки нет');
    const b = await readJson(ctx.req);
    const ok = b.decision === 'approve';
    const reason = str(b.reason, 500);
    if (!ok && reason.length < 5) throw new HttpError(400, 'Напишите, что не так — увидит пользователь');
    let until = u.tm_until;
    if (ok) {
      if (u.tm_status !== 'pending') throw new HttpError(400, 'Галочку выдают только по заявке на проверке');
      if (u.biz_status !== 'verified') throw new HttpError(400, 'Сначала подтвердите ИНН и ОГРН — правообладатель должен совпасть с проверенным бизнесом');
      const checks = b.checks || {};
      if (Object.keys(TM_CHECKS).some((k) => checks[k] !== true)) throw new HttpError(400, 'Отметьте все пункты проверки');
      const kinds = new Set(docsOf(u.id).map((d) => d.kind));
      if (!kinds.has('cert') || !kinds.has('letter')) throw new HttpError(400, 'Нет обязательных документов');
      if (b.until) { until = Date.parse(String(b.until)); if (!Number.isFinite(until)) throw new HttpError(400, 'Проверьте срок действия'); }
      if (until <= now()) throw new HttpError(400, 'Срок действия регистрации истёк');
      if (db.prepare('SELECT 1 FROM users WHERE tm_number = ? AND tm_status = \'verified\' AND tm_until > ? AND id != ?').get(u.tm_number, now(), u.id)) throw new HttpError(409, 'Этот знак уже подтверждён у другого аккаунта');
    }
    db.prepare('UPDATE users SET tm_status = ?, tm_note = ?, tm_until = ?, tm_at = ? WHERE id = ?').run(ok ? 'verified' : 'rejected', ok ? '' : reason, until, now(), u.id);
    h.audit(admin, ok ? 'tm-verified' : 'tm-rejected', { userId: u.id }, { reason, number: u.tm_number, name: u.tm_name, until, code: u.tm_code, checks: ok ? Object.keys(TM_CHECKS) : [] });
    mailer.notifyAccount(u.id, ok ? 'tm-verified' : 'tm-rejected', ok ? `«${u.tm_name}», свидетельство № ${u.tm_number}` : reason);
    h.alerts.notify(u.id, 'moderation', { title: ok ? 'Бренд подтверждён' : 'Заявку на галочку нужно исправить', body: ok ? `«${u.tm_name}» — рядом с вашим именем появилась галочка` : reason, url: '/profile/settings#s-biz', tag: 'tm', icon: 'shield', tone: ok ? 'ok' : 'bad' });
    return { ok: true };
  });
  // Для карточки в модерации: документы, код, пункты проверки и совпадения с другими аккаунтами.
  const tmAdmin = (u) => (u.tm_status ? {
    code: u.tm_code, docs: docsOf(u.id), checks: TM_CHECKS, fips: fipsUrl(u.tm_number),
    sameNumber: db.prepare('SELECT id, name, email, tm_status FROM users WHERE tm_number = ? AND id != ?').all(u.tm_number, u.id),
    sameInn: u.biz_inn ? db.prepare('SELECT id, name, email, biz_status FROM users WHERE biz_inn = ? AND id != ?').all(u.biz_inn, u.id) : []
  } : null);

  return { badgesOf, bizOf, tmOf, tmAdmin, fipsUrl, clearTm, innValid, ogrnValid, KINDS };
};

'use strict';

// Доверие к продавцу: «Телефон подтверждён» (номер пришёл из Яндекс ID или VK ID) и проверенный бизнес —
// ИП или компания отправляет ИНН и ОГРН(ИП), модератор сверяет по ЕГРЮЛ/ЕГРИП и подтверждает.
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

module.exports = function trust({ route, db, h, mailer }) {
  const verifiedHooks = []; // кто ещё хочет знать, что бизнес подтверждён (пробный тариф)
  const { HttpError, readJson, requireUser, requireAdmin, str, now } = h;

  // Значки продавца для публичных страниц.
  const badgesOf = (u) => ({
    phone: !!u.phone_verified,
    biz: u.biz_status === 'verified' ? { kind: KINDS[u.biz_kind] || 'Компания', name: u.biz_name } : null
  });
  // Заявка на проверку бизнеса — для владельца и модератора.
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
    db.prepare('UPDATE users SET biz_kind = ?, biz_name = ?, biz_inn = ?, biz_ogrn = ?, biz_status = \'pending\', biz_note = \'\', biz_at = ? WHERE id = ?').run(kind, name, inn, ogrn, now(), u.id);
    return { business: bizOf(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) };
  });

  route('DELETE', '/api/me/business', (ctx) => {
    const u = requireUser(ctx);
    db.prepare('UPDATE users SET biz_status = \'\', biz_kind = \'\', biz_name = \'\', biz_inn = \'\', biz_ogrn = \'\', biz_note = \'\', biz_at = NULL WHERE id = ?').run(u.id);
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
    if (ok) for (const fn of verifiedHooks) { try { fn(u.id); } catch (e) { console.error('biz-verified hook:', e.message); } }
    return { ok: true };
  });

  return { badgesOf, bizOf, innValid, ogrnValid, KINDS, onVerified: (fn) => verifiedHooks.push(fn) };
};

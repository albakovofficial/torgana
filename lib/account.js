'use strict';

// Удаление профиля (1.39.0) — самим пользователем в «Настройки → Аккаунт» и модератором в карточке пользователя.
// - Временно: профиль и объявления скрыты (объявления уходят в архив), вход завершается везде. Войти можно —
//   откроется экран «Профиль удалён» с кнопкой «Восстановить»; объявления потом публикуются из архива снова.
// - Навсегда: личные данные стираются (имя, почта, телефон, фото, вход через сервисы, данные бизнеса и витрины),
//   объявления с фото, избранное, подписки, устройства и сессии удаляются. Обезличенная запись остаётся,
//   чтобы не пропали платежи (возвраты, учёт) и переписка собеседников — у них будет «Удалённый пользователь».
const crypto = require('node:crypto');

module.exports = function account({ route, db, h, removeListing, auth }) {
  const { HttpError, readJson, requireAdmin, str, now, OWNER_EMAIL } = h;
  const addColumn = (table, col, def) => { if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); };
  addColumn('users', 'deactivated_at', 'INTEGER');
  addColumn('users', 'deleted_at', 'INTEGER');
  const has = (t) => !!db.prepare('SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?').get(t);
  const userRow = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  function deactivate(u) {
    const t = now();
    db.prepare('UPDATE listings SET status = \'archived\', updated_at = ? WHERE user_id = ? AND status IN (\'active\', \'scheduled\', \'pending\', \'rejected\')').run(t, u.id);
    db.prepare('UPDATE users SET deactivated_at = ? WHERE id = ?').run(t, u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }
  function restore(u) { db.prepare('UPDATE users SET deactivated_at = NULL WHERE id = ?').run(u.id); }
  function erase(u) {
    const t = now();
    // Объявления пропадают с сайта, фото и описание стираются; название и цена остаются в переписках собеседников (1.42.0).
    for (const { id } of db.prepare('SELECT id FROM listings WHERE user_id = ?').all(u.id)) removeListing(id, { wipe: true });
    if (u.avatar) h.setAvatar(u.id, ''); // удаляет и файл фото
    if (h.trust) h.trust.clearTm(u.id); // 1.45.0: документы для галочки бренда — файлы и записи
    const wipe = [['sessions', 'user_id'], ['favorites', 'user_id'], ['follows', 'user_id'], ['follows', 'seller_id'], ['user_alerts', 'user_id'],
      ['apns_tokens', 'user_id'], ['oauth_accounts', 'user_id'], ['admin_devices', 'user_id'], ['notices', 'user_id']];
    for (const [table, col] of wipe) if (has(table)) db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(u.id);
    const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    const clear = ['phone', 'city', 'avatar', 'biz_kind', 'biz_name', 'biz_inn', 'biz_ogrn', 'biz_note', 'shop_about', 'shop_cover', 'shop_hours', 'shop_address', 'shop_site', 'src', 'src_campaign', 'block_reason', 'tm_status', 'tm_number', 'tm_name', 'tm_note', 'tm_code']
      .filter((c) => cols.includes(c));
    db.prepare(`UPDATE users SET name = 'Удалённый пользователь', email = ?, password_hash = ?, email_verified = 0, is_admin = 0, deactivated_at = NULL, deleted_at = ?
      ${clear.map((c) => `, ${c} = ''`).join('')}${cols.includes('biz_status') ? ', biz_status = \'\'' : ''}${cols.includes('plan_until') ? ', plan_until = 0' : ''}
      WHERE id = ?`).run(`deleted-${u.id}-${crypto.randomBytes(4).toString('hex')}@deleted.torgana`, crypto.randomBytes(32).toString('hex'), t, u.id);
  }

  // ---------- сам пользователь ----------
  // Временное удаление и навсегда — с подтверждением в интерфейсе; навсегда — ещё и словом «УДАЛИТЬ».
  route('POST', '/api/me/deactivate', (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'Нужно войти в аккаунт');
    const u = ctx.user;
    if (u.is_admin && u.email === OWNER_EMAIL) throw new HttpError(400, 'Аккаунт владельца площадки удалить нельзя');
    deactivate(u);
    ctx.setCookie(auth.clearCookie(h.secureCookies));
    return { ok: true };
  });
  route('POST', '/api/me/restore', (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'Нужно войти в аккаунт');
    restore(ctx.user);
    return { ok: true };
  });
  route('POST', '/api/me/erase', async (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'Нужно войти в аккаунт');
    const u = ctx.user;
    if (u.is_admin && u.email === OWNER_EMAIL) throw new HttpError(400, 'Аккаунт владельца площадки удалить нельзя');
    if (str((await readJson(ctx.req)).confirm, 20).toUpperCase() !== 'УДАЛИТЬ') throw new HttpError(400, 'Напишите слово УДАЛИТЬ, чтобы подтвердить');
    erase(u);
    ctx.setCookie(auth.clearCookie(h.secureCookies));
    return { ok: true };
  });

  // ---------- модератор ----------
  const target = (ctx, admin) => {
    const u = userRow(parseInt(ctx.params.id, 10));
    if (!u || u.deleted_at) throw new HttpError(404, 'Пользователь не найден');
    if (u.is_admin) throw new HttpError(400, 'Модератора удалить нельзя — сначала снимите права модератора');
    if (u.id === admin.id) throw new HttpError(400, 'Себя — в своих настройках');
    return u;
  };
  route('POST', '/api/admin/users/:id/deactivate', async (ctx) => {
    const admin = requireAdmin(ctx);
    const u = target(ctx, admin);
    const reason = str((await readJson(ctx.req)).reason, 500);
    deactivate(u);
    h.audit(admin, 'user-deactivated', { userId: u.id }, { reason });
    return { ok: true };
  });
  route('POST', '/api/admin/users/:id/restore', (ctx) => {
    const admin = requireAdmin(ctx);
    const u = target(ctx, admin);
    restore(u);
    h.audit(admin, 'user-restored', { userId: u.id }, {});
    return { ok: true };
  });
  route('POST', '/api/admin/users/:id/erase', async (ctx) => {
    const admin = requireAdmin(ctx);
    const u = target(ctx, admin);
    const b = await readJson(ctx.req);
    if (str(b.confirm, 20).toUpperCase() !== 'УДАЛИТЬ') throw new HttpError(400, 'Напишите слово УДАЛИТЬ, чтобы подтвердить');
    const name = u.name;
    erase(u);
    h.audit(admin, 'user-erased', { userId: u.id }, { reason: str(b.reason, 500), name });
    return { ok: true };
  });

  return { deactivate, restore, erase };
};

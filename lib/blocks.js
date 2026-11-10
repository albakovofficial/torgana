'use strict';
// 1.48.0: чёрный список. Заблокированный не может написать тому, кто его заблокировал, — ни в старом чате,
// ни новым сообщением по объявлению, ни предложением цены. Пока блокировка есть, тот, кто заблокировал, тоже
// не пишет (сначала — «Разблокировать»). Объявления заблокированного не показываются ему в ленте и поиске.
// Нужно и для App Store (правило 1.2: блокировка пользователей там, где люди общаются).

module.exports = function blocks({ route, db, h }) {
  const { HttpError, requireUser, readJson, rateLimit, now, photoUrl } = h;
  const MAX = 500;

  // Кто кого: 'me' — я заблокировал, 'them' — меня заблокировали, null — нет блокировки.
  function between(me, other) {
    if (!me || !other) return null;
    const rows = db.prepare('SELECT user_id FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)').all(me, other, other, me);
    if (rows.some((r) => r.user_id === me)) return 'me';
    if (rows.length) return 'them';
    return null;
  }
  // Для отправки сообщений: понятный текст, почему нельзя.
  function assertCanWrite(me, other) {
    const b = between(me, other);
    if (b === 'me') throw new HttpError(403, 'Вы заблокировали этого пользователя. Разблокируйте, чтобы написать');
    if (b === 'them') throw new HttpError(403, 'Пользователь ограничил сообщения от вас');
  }
  // Кого скрыть из выдачи этого человека.
  const hiddenFor = (me) => (me ? db.prepare('SELECT blocked_id FROM blocks WHERE user_id = ?').all(me).map((r) => r.blocked_id) : []);

  route('GET', '/api/blocks', (ctx) => {
    const u = requireUser(ctx);
    const items = db.prepare(`SELECT b.blocked_id AS id, b.created_at AS at, u.name, u.avatar, u.deleted_at FROM blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.user_id = ? ORDER BY b.created_at DESC`).all(u.id)
      .map((r) => ({ id: r.id, name: r.deleted_at ? 'Профиль удалён' : r.name, avatar: r.deleted_at ? null : photoUrl(r.avatar), at: r.at }));
    return { items };
  });

  route('POST', '/api/blocks', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`block:${u.id}`, 60, 60 * 60 * 1000);
    const id = parseInt((await readJson(ctx.req)).userId, 10);
    if (!Number.isFinite(id) || id === u.id) throw new HttpError(400, 'Нельзя заблокировать себя');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw new HttpError(404, 'Пользователь не найден');
    const n = db.prepare('SELECT COUNT(*) AS n FROM blocks WHERE user_id = ?').get(u.id).n;
    if (n >= MAX) throw new HttpError(400, `В чёрном списке уже ${MAX} человек — уберите кого-нибудь`);
    db.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)').run(u.id, id, now());
    // Подписка на заблокированного больше не нужна — и его подписка на вас тоже.
    try { db.prepare('DELETE FROM follows WHERE (user_id = ? AND seller_id = ?) OR (user_id = ? AND seller_id = ?)').run(u.id, id, id, u.id); } catch { /* нет таблицы */ }
    return { ok: true, blocked: true };
  });

  route('DELETE', '/api/blocks/:id', (ctx) => {
    const u = requireUser(ctx);
    db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').run(u.id, parseInt(ctx.params.id, 10));
    return { ok: true, blocked: false };
  });

  return { between, assertCanWrite, hiddenFor };
};

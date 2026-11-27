'use strict';
// Переписка покупателя и продавца: список диалогов, сообщения с фото, видео и файлами, ответы на сообщения,
// правка в течение 48 часов, «печатает…», прочитано, скорость ответа продавца.
module.exports = function chat({ route, db, h }) {
  const { HttpError, requireUser, readJson, rateLimit, now, str, attach, photoUrl } = h;
  const DAY = 24 * 3600 * 1000;

  // 1.43.0: как быстро отвечает продавец — по его чатам за 30 дней (первое сообщение покупателя → первый ответ продавца).
  // Только при 5+ таких чатах; чат без ответа считается, когда покупатель ждёт больше суток. Пересчёт — не чаще раза в 10 минут.
  const replyCache = new Map();
  const REPLY_TTL = process.env.REPLY_CACHE_MS ? Number(process.env.REPLY_CACHE_MS) : 10 * 60 * 1000; // в тестах — 1
  function replyStats(sellerId) {
    const t = now();
    const hit = replyCache.get(sellerId);
    if (hit && hit.at > t - REPLY_TTL) return hit.v;
    const rows = db.prepare(`SELECT c.id, (SELECT MIN(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = c.buyer_id) AS asked
      FROM conversations c WHERE c.seller_id = ? AND c.created_at > ? ORDER BY c.id DESC LIMIT 200`).all(sellerId, t - 30 * DAY);
    const firstReply = db.prepare('SELECT MIN(created_at) AS at FROM messages WHERE conversation_id = ? AND sender_id = ? AND created_at >= ?');
    const delays = [];
    let total = 0;
    for (const r of rows) {
      if (!r.asked) continue;
      const at = firstReply.get(r.id, sellerId, r.asked).at;
      if (at) { delays.push(at - r.asked); total++; } else if (t - r.asked > DAY) total++;
    }
    let v = null;
    if (total >= 5) {
      delays.sort((a, b) => a - b);
      const med = delays.length ? delays[Math.floor(delays.length / 2)] : null;
      const H = 3600 * 1000;
      v = { rate: Math.round((delays.length / total) * 10), time: med === null ? '' : med <= H ? 'hour' : med <= 3 * H ? 'hours' : med <= DAY ? 'day' : 'days' };
    }
    if (replyCache.size > 5000) replyCache.clear();
    replyCache.set(sellerId, { at: t, v });
    return v;
  }

  function unreadCount(userId) {
    return db.prepare(`SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE (c.buyer_id = ? OR c.seller_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`).get(userId, userId, userId).n;
  }

  route('GET', '/api/conversations', (ctx) => {
    const u = requireUser(ctx);
    const rows = db.prepare(`
      SELECT c.id, c.listing_id, c.buyer_id, c.seller_id, c.updated_at, l.title, l.price, l.price_unit, l.status,
        (SELECT COALESCE(NULLIF(p.thumb, ''), p.file) FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo,
        ou.id AS other_id, ou.name AS other_name, ou.avatar AS other_avatar,
        (SELECT CASE WHEN body != '' THEN body WHEN photo != '' THEN '📷 Фото' WHEN video != '' THEN '🎬 Видео' WHEN file != '' THEN '📎 Файл' ELSE '' END FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT CASE WHEN m.sender_id = ? THEN (CASE WHEN m.read_at IS NULL THEN 1 ELSE 2 END) ELSE 0 END FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_mine,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
      FROM conversations c
      JOIN listings l ON l.id = c.listing_id
      JOIN users ou ON ou.id = CASE WHEN c.buyer_id = ? THEN c.seller_id ELSE c.buyer_id END
      WHERE c.buyer_id = ? OR c.seller_id = ?
      ORDER BY c.updated_at DESC`).all(u.id, u.id, u.id, u.id, u.id);
    const mine = new Set(h.blocks.hiddenFor(u.id));
    return {
      items: rows.map((r) => ({
        id: r.id, listingId: r.listing_id, title: r.title, price: r.price, priceUnit: r.price_unit, status: r.status,
        photo: photoUrl(r.photo), other: { id: r.other_id, name: r.other_name, avatar: photoUrl(r.other_avatar) }, lastBody: r.last_body || '',
        unread: r.unread, updatedAt: r.updated_at, role: r.buyer_id === u.id ? 'buyer' : 'seller', blocked: mine.has(r.other_id),
        lastMine: r.last_mine || 0 // 1.55.0: последнее — моё: 1 — отправлено, 2 — прочитано
      }))
    };
  });

  route('POST', '/api/conversations', async (ctx) => {
    const u = requireUser(ctx);
    const listingId = parseInt((await readJson(ctx.req)).listingId, 10);
    const l = h.loadListing(listingId);
    if (!l || l.status !== 'active') throw new HttpError(404, 'Объявление недоступно');
    if (l.user_id === u.id) throw new HttpError(400, 'Это ваше объявление');
    const existing = db.prepare('SELECT id FROM conversations WHERE listing_id = ? AND buyer_id = ?').get(listingId, u.id);
    if (existing) return { id: existing.id };
    h.blocks.assertCanWrite(u.id, l.user_id);
    rateLimit(`conv:${u.id}`, 30, 60 * 60 * 1000); // 1.41.0: защита от рассылки — не больше 30 новых диалогов в час
    const t = now();
    const info = db.prepare('INSERT INTO conversations (listing_id, buyer_id, seller_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(listingId, u.id, l.user_id, t, t);
    return { id: Number(info.lastInsertRowid) };
  });

  // Фото в сообщении: своё загруженное фото, ещё не привязанное к объявлению и не фото профиля.
  function chatPhoto(u, file) {
    if (!file) return '';
    const f = String(file);
    const row = db.prepare('SELECT listing_id FROM uploads WHERE file = ? AND user_id = ?').get(f, u.id);
    if (!row || row.listing_id !== null || db.prepare('SELECT 1 FROM users WHERE avatar = ?').get(f)) throw new HttpError(400, 'Сначала загрузите фото');
    return f;
  }

  function loadConversation(u, id) {
    const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!c || (c.buyer_id !== u.id && c.seller_id !== u.id)) throw new HttpError(404, 'Диалог не найден');
    return c;
  }

  // 1.54.0: цитаты для ответов на сообщения — кто написал, начало текста, было ли фото (то же из одного диалога).
  function quotesOf(convId, ids, uid) {
    const want = [...new Set(ids.filter(Boolean).map(Number))];
    if (!want.length) return new Map();
    return new Map(db.prepare(`SELECT id, sender_id, body, photo, video, file, kind FROM messages WHERE conversation_id = ? AND id IN (${want.join(',')})`).all(convId)
      .map((q) => [q.id, { id: q.id, mine: q.sender_id === uid, body: String(q.body || '').slice(0, 160), photo: !!q.photo, ...(q.video ? { video: true } : {}), ...(q.file ? { file: true } : {}), kind: q.kind }]));
  }

  route('GET', '/api/conversations/:id', (ctx) => {
    const u = requireUser(ctx);
    const c = loadConversation(u, parseInt(ctx.params.id, 10));
    const after = parseInt(ctx.query.get('after') || '0', 10) || 0;
    // 1.55.0: прочитано — только когда переписка на экране (seen=0 — вкладка свёрнута, сообщения не отмечаем).
    if (ctx.query.get('seen') !== '0') db.prepare('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL').run(now(), c.id, u.id);
    const rows = db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 500').all(c.id, after);
    const quotes = quotesOf(c.id, rows.map((m) => m.reply_to), u.id);
    const messages = rows.map((m) => msgView(m, u.id, quotes));
    // 1.57.0: изменённые сообщения — те, что поправили после ?edits= (время сервера из прошлого ответа, поле now).
    const since = parseInt(ctx.query.get('edits') || '0', 10) || 0;
    const edited = since ? db.prepare('SELECT id, body, edited_at FROM messages WHERE conversation_id = ? AND edited_at > ? AND id <= ?').all(c.id, since, after)
      .map((m) => ({ id: m.id, body: m.body, editedAt: m.edited_at })) : [];
    const l = h.loadListing(c.listing_id, { deleted: true });
    const otherId = c.buyer_id === u.id ? c.seller_id : c.buyer_id;
    const other = db.prepare('SELECT * FROM users WHERE id = ?').get(otherId);
    const photo = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position LIMIT 1').get(c.listing_id);
    return {
      conversation: { id: c.id, role: c.buyer_id === u.id ? 'buyer' : 'seller' },
      deal: h.reputation.chatState(u.id, c), // 1.46.0: «Сделка состоялась?», комплименты, «Что-то пошло не так»
      listing: { id: l.id, title: l.title, price: l.price, priceUnit: l.price_unit, status: l.status, bargain: !!l.bargain, delivery: !!l.delivery, city: l.city, metro: l.metro || '', photo: photoUrl(photo && photo.file) },
      // 1.27: оценка собеседника — для колонки «Объявление и продавец» справа от чата
      other: { id: other.id, name: other.name, avatar: photoUrl(other.avatar), rep: h.reputation.levelOf(other.id), badges: h.badgesOf(other) }, // 27.11: значки — для печати у имени и «Телефон подтверждён»
      block: h.blocks.between(u.id, other.id), // 1.48.0: 'me' — я заблокировал, 'them' — меня

      offers: h.deals.offersOf(c.id), // состояния всех предложений — обновляются при каждом опросе
      // 1.55.0: как в мессенджерах — до какого моего сообщения собеседник дочитал (✓✓) и печатает ли он сейчас
      readUpTo: db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM messages WHERE conversation_id = ? AND sender_id = ? AND read_at IS NOT NULL').get(c.id, u.id).n,
      typing: typingNow(c.id, otherId),
      messages,
      edited,
      now: now()
    };
  });

  // Сообщение в ответе: текст, фото, видео, файл, ответ на сообщение, когда изменено.
  function msgView(m, uid, quotes) {
    return { id: m.id, mine: m.sender_id === uid, body: m.body, photo: photoUrl(m.photo), ...attach.view(m), kind: m.kind, offerId: m.offer_id,
      reply: m.reply_to ? quotes.get(m.reply_to) || null : null, createdAt: m.created_at, read: !!m.read_at, editedAt: m.edited_at || null };
  }

  // 1.57.0: изменить своё сообщение — текст, в течение 48 часов; предложение цены не меняется.
  const EDIT_MS = 48 * 3600 * 1000;
  route('PATCH', '/api/conversations/:id/messages/:mid', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`msg-edit:${u.id}`, 60, 60 * 1000);
    const c = loadConversation(u, parseInt(ctx.params.id, 10));
    const m = db.prepare('SELECT * FROM messages WHERE id = ? AND conversation_id = ?').get(parseInt(ctx.params.mid, 10), c.id);
    if (!m || m.sender_id !== u.id) throw new HttpError(404, 'Сообщение не найдено');
    if (m.kind) throw new HttpError(400, 'Предложение цены не меняется — отзовите его и предложите новое');
    if (now() - m.created_at > EDIT_MS) throw new HttpError(400, 'Изменить можно в течение 48 часов после отправки');
    const body = str((await readJson(ctx.req)).body, 2000);
    if (!body && !m.photo && !m.video && !m.file) throw new HttpError(400, 'Пустое сообщение');
    if (body === m.body) return { message: msgView(m, u.id, quotesOf(c.id, [m.reply_to], u.id)) };
    db.prepare('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?').run(body, now(), m.id);
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(m.id);
    return { message: msgView(row, u.id, quotesOf(c.id, [row.reply_to], u.id)) };
  });

  // 1.55.0: «печатает…» — отметка в памяти на 6 секунд; страница шлёт её не чаще раза в 3 секунды, пока человек набирает текст.
  // Отправил сообщение — отметка снимается сразу.
  const TYPING_MS = 6000;
  const typingMarks = new Map();
  const typingNow = (convId, userId) => Date.now() - (typingMarks.get(`${convId}:${userId}`) || 0) < TYPING_MS;
  route('POST', '/api/conversations/:id/typing', (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`typing:${u.id}`, 60, 60 * 1000);
    const c = loadConversation(u, parseInt(ctx.params.id, 10));
    typingMarks.set(`${c.id}:${u.id}`, Date.now());
    if (typingMarks.size > 5000) for (const [k, t] of typingMarks) if (Date.now() - t > TYPING_MS) typingMarks.delete(k);
    return { ok: true };
  });

  route('POST', '/api/conversations/:id/messages', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`msg:${u.id}`, 40, 60 * 1000);
    const c = loadConversation(u, parseInt(ctx.params.id, 10));
    const input = await readJson(ctx.req);
    const body = str(input.body, 2000);
    const photo = chatPhoto(u, input.photo);
    const extra = attach.take(u, input); // 1.57.0: видео и файл
    if (!body && !photo && !extra.video && !extra.file) throw new HttpError(400, 'Пустое сообщение');
    const other = db.prepare('SELECT deactivated_at, deleted_at FROM users WHERE id = ?').get(c.buyer_id === u.id ? c.seller_id : c.buyer_id);
    if (other && (other.deactivated_at || other.deleted_at)) throw new HttpError(400, 'Собеседник удалил профиль — сообщения не доставляются');
    h.blocks.assertCanWrite(u.id, c.buyer_id === u.id ? c.seller_id : c.buyer_id);
    const replyId = parseInt(input.replyTo, 10) || null; // 1.54.0: ответ — только на сообщение этого же диалога
    if (replyId && !db.prepare('SELECT 1 FROM messages WHERE id = ? AND conversation_id = ?').get(replyId, c.id)) throw new HttpError(400, 'Сообщение для ответа не найдено');
    const t = now();
    const info = db.prepare('INSERT INTO messages (conversation_id, sender_id, body, photo, video, file, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(c.id, u.id, body, photo, extra.video, extra.file, replyId, t);
    attach.markUsed(extra.file);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(t, c.id);
    typingMarks.delete(`${c.id}:${u.id}`); // отправил — уже не «печатает»
    const l = h.loadListing(c.listing_id, { deleted: true });
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
    h.alerts.notify(c.buyer_id === u.id ? c.seller_id : c.buyer_id, 'chat', { имя: u.name, объявление: l.title, текст: attach.preview(row).slice(0, 180) }, { url: `/messages/${c.id}`, tag: `chat-${c.id}`, urgent: true });
    return { message: msgView(row, u.id, quotesOf(c.id, [replyId], u.id)) };
  });

  return { replyStats, unreadCount, chatPhoto };
};

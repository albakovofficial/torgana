'use strict';

// Отзывы о продавцах.
// - Оставляет только покупатель, который переписывался с продавцом об объявлении (в диалоге писали оба),
//   и только с итогом сделки «Товар получен» или «Товар не получен». Один отзыв на объявление.
// - Отзыв публикуется после проверки модератором. Изменить или удалить его не может никто — ни автор, ни продавец.
//   Удаление объявления или правка его названия отзывы не трогают (название сохраняется в отзыве).
// - Продавец может один раз публично ответить (ответ тоже проверяет модератор) и один раз пожаловаться
//   с обоснованием. Пока жалоба рассматривается, отзыв виден. Модератор оставляет отзыв или скрывает его.

const RECEIVED = { 1: 'Товар получен', 0: 'Товар не получен' };
const COMPLAINT_REASONS = ['Мы не общались и не заключали сделку', 'Оскорбления или грубость', 'Ложные сведения', 'Отзыв о другом человеке или товаре', 'Личные данные в тексте', 'Другое'];

module.exports = function reviews({ route, db, mailer, h }) {
  const { HttpError, readJson, rateLimit, requireUser, requireAdmin, photoUrl, str, now } = h;

  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_title TEXT NOT NULL,
      rating INTEGER NOT NULL,
      received INTEGER NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      decided_at INTEGER,
      decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reply TEXT NOT NULL DEFAULT '',
      reply_status TEXT NOT NULL DEFAULT '',
      reply_reason TEXT NOT NULL DEFAULT '',
      reply_at INTEGER,
      UNIQUE (listing_id, author_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id, status, id DESC);
    CREATE INDEX IF NOT EXISTS idx_reviews_author ON reviews(author_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, id);
    CREATE TABLE IF NOT EXISTS review_complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id INTEGER NOT NULL UNIQUE REFERENCES reviews(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      decision TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT ''
    );
  `);

  // ---------- оценка ----------
  function ratingOf(userId) {
    const rows = db.prepare('SELECT rating, COUNT(*) AS n FROM reviews WHERE seller_id = ? AND status = \'published\' GROUP BY rating').all(userId);
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let count = 0; let sum = 0;
    for (const r of rows) { dist[r.rating] = r.n; count += r.n; sum += r.rating * r.n; }
    return { avg: count ? Math.round((sum / count) * 10) / 10 : 0, count, dist };
  }

  const userBrief = (id) => {
    const u = db.prepare('SELECT id, name, avatar FROM users WHERE id = ?').get(id);
    return u ? { id: u.id, name: u.name, avatar: photoUrl(u.avatar) } : { id: 0, name: 'Пользователь', avatar: null };
  };

  // Отзыв для показа. who: public | seller | author | admin.
  function toJson(r, who = 'public') {
    const c = who === 'public' ? null : db.prepare('SELECT * FROM review_complaints WHERE review_id = ?').get(r.id);
    const out = {
      id: r.id, rating: r.rating, received: !!r.received, text: r.text, createdAt: r.created_at,
      listing: { id: r.listing_id, title: r.listing_title },
      author: userBrief(r.author_id),
      reply: r.reply_status === 'published' ? { text: r.reply, at: r.reply_at } : null
    };
    if (who !== 'public') {
      out.status = r.status;
      out.reason = r.reason;
      out.seller = userBrief(r.seller_id);
    }
    if (who === 'seller' || who === 'admin') {
      out.replyDraft = r.reply_status && r.reply_status !== 'published' ? { text: r.reply, status: r.reply_status, reason: r.reply_reason } : null;
      out.canReply = r.status === 'published' && (r.reply_status === '' || r.reply_status === 'rejected');
      out.complaint = c ? { reason: c.reason, text: c.text, at: c.created_at, decision: c.decision, comment: who === 'admin' || c.decision ? c.comment : '', resolved: !!c.resolved_at } : null;
      out.canComplain = r.status === 'published' && !c;
    }
    return out;
  }

  // ---------- кто может оставить отзыв ----------
  // В диалоге по объявлению писали и покупатель, и продавец; покупатель — автор; отзыва ещё нет.
  function chatState(userId, c) {
    if (c.buyer_id !== userId) return null;
    const existing = db.prepare('SELECT id, status FROM reviews WHERE listing_id = ? AND author_id = ?').get(c.listing_id, userId);
    if (existing) return { can: false, status: existing.status };
    const both = db.prepare('SELECT COUNT(DISTINCT sender_id) AS n FROM messages WHERE conversation_id = ?').get(c.id).n >= 2;
    return { can: both, status: '', hint: both ? '' : 'Отзыв можно оставить после переписки с продавцом.' };
  }

  route('POST', '/api/reviews', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`review:${u.id}`, 10, 24 * 3600 * 1000);
    const b = await readJson(ctx.req);
    const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(parseInt(b.conversationId, 10));
    if (!c || c.buyer_id !== u.id) throw new HttpError(403, 'Отзыв о продавце может оставить только покупатель из переписки по объявлению');
    const st = chatState(u.id, c);
    if (st.status) throw new HttpError(409, 'Вы уже оставили отзыв по этому объявлению. Изменить его нельзя.');
    if (!st.can) throw new HttpError(403, st.hint);
    const seller = db.prepare('SELECT id, is_blocked FROM users WHERE id = ?').get(c.seller_id);
    if (!seller || seller.is_blocked) throw new HttpError(404, 'Продавец не найден');
    const rating = parseInt(b.rating, 10);
    if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Поставьте оценку от 1 до 5');
    if (b.received !== true && b.received !== false) throw new HttpError(400, 'Укажите, получили ли вы товар');
    const text = str(b.text, 1000);
    if (text.length < 10) throw new HttpError(400, 'Напишите отзыв — хотя бы пару предложений');
    const l = db.prepare('SELECT id, title FROM listings WHERE id = ?').get(c.listing_id);
    const info = db.prepare(`INSERT INTO reviews (listing_id, conversation_id, author_id, seller_id, listing_title, rating, received, text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(l.id, c.id, u.id, c.seller_id, l.title, rating, b.received ? 1 : 0, text, now());
    return { review: toJson(db.prepare('SELECT * FROM reviews WHERE id = ?').get(Number(info.lastInsertRowid)), 'author') };
  });

  // Опубликованные отзывы о продавце — всем.
  route('GET', '/api/users/:id/reviews', (ctx) => {
    const id = parseInt(ctx.params.id, 10);
    const u = db.prepare('SELECT id, is_blocked FROM users WHERE id = ?').get(id);
    if (!u || u.is_blocked) throw new HttpError(404, 'Пользователь не найден');
    const stars = parseInt(ctx.query.get('stars') || '0', 10);
    const offset = Math.max(0, parseInt(ctx.query.get('offset') || '0', 10) || 0);
    const where = stars >= 1 && stars <= 5 ? 'AND rating = ?' : '';
    const args = stars >= 1 && stars <= 5 ? [id, stars] : [id];
    const rows = db.prepare(`SELECT * FROM reviews WHERE seller_id = ? AND status = 'published' ${where} ORDER BY id DESC LIMIT 21 OFFSET ${offset}`).all(...args);
    return { rating: ratingOf(id), items: rows.slice(0, 20).map((r) => toJson(r)), more: rows.length > 20 };
  });

  // Мои отзывы: обо мне (опубликованные и скрытые после жалобы) и те, что оставил я.
  route('GET', '/api/my/reviews', (ctx) => {
    const u = requireUser(ctx);
    const about = db.prepare('SELECT * FROM reviews WHERE seller_id = ? AND status IN (\'published\', \'hidden\') ORDER BY id DESC LIMIT 200').all(u.id).map((r) => toJson(r, 'seller'));
    const mine = db.prepare('SELECT * FROM reviews WHERE author_id = ? ORDER BY id DESC LIMIT 200').all(u.id).map((r) => toJson(r, 'author'));
    return { rating: ratingOf(u.id), about, mine, complaintReasons: COMPLAINT_REASONS };
  });

  const ownReview = (u, id) => {
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    if (!r || r.seller_id !== u.id) throw new HttpError(404, 'Отзыв не найден');
    if (r.status !== 'published') throw new HttpError(409, 'Отзыв не опубликован');
    return r;
  };

  route('POST', '/api/reviews/:id/reply', async (ctx) => {
    const u = requireUser(ctx);
    const r = ownReview(u, parseInt(ctx.params.id, 10));
    if (r.reply_status === 'pending') throw new HttpError(409, 'Ответ уже на проверке');
    if (r.reply_status === 'published') throw new HttpError(409, 'Вы уже ответили на этот отзыв. Изменить ответ нельзя.');
    const text = str((await readJson(ctx.req)).text, 1000);
    if (text.length < 5) throw new HttpError(400, 'Напишите ответ');
    db.prepare('UPDATE reviews SET reply = ?, reply_status = \'pending\', reply_reason = \'\', reply_at = ? WHERE id = ?').run(text, now(), r.id);
    return { review: toJson(db.prepare('SELECT * FROM reviews WHERE id = ?').get(r.id), 'seller') };
  });

  route('POST', '/api/reviews/:id/complaint', async (ctx) => {
    const u = requireUser(ctx);
    const r = ownReview(u, parseInt(ctx.params.id, 10));
    if (db.prepare('SELECT 1 FROM review_complaints WHERE review_id = ?').get(r.id)) throw new HttpError(409, 'Жалоба на этот отзыв уже отправлена');
    const b = await readJson(ctx.req);
    const reason = str(b.reason, 100);
    if (!COMPLAINT_REASONS.includes(reason)) throw new HttpError(400, 'Выберите, что не так с отзывом');
    const text = str(b.text, 1000);
    if (text.length < 20) throw new HttpError(400, 'Обоснуйте жалобу — хотя бы 20 символов');
    db.prepare('INSERT INTO review_complaints (review_id, user_id, reason, text, created_at) VALUES (?, ?, ?, ?, ?)').run(r.id, u.id, reason, text, now());
    return { review: toJson(db.prepare('SELECT * FROM reviews WHERE id = ?').get(r.id), 'seller') };
  });

  // ---------- модерация ----------
  function counts() {
    const n = (sql) => db.prepare(sql).get().n;
    return {
      pending: n('SELECT COUNT(*) AS n FROM reviews WHERE status = \'pending\'') + n('SELECT COUNT(*) AS n FROM reviews WHERE status = \'published\' AND reply_status = \'pending\''),
      complaints: n('SELECT COUNT(*) AS n FROM review_complaints WHERE resolved_at IS NULL')
    };
  }

  route('GET', '/api/admin/reviews', (ctx) => {
    requireAdmin(ctx);
    const tab = ctx.query.get('tab') || 'pending';
    let rows;
    if (tab === 'complaints') rows = db.prepare('SELECT r.* FROM reviews r JOIN review_complaints c ON c.review_id = r.id WHERE c.resolved_at IS NULL ORDER BY c.id').all();
    else if (tab === 'all') rows = db.prepare('SELECT * FROM reviews ORDER BY id DESC LIMIT 100').all();
    else rows = db.prepare('SELECT * FROM reviews WHERE status = \'pending\' OR (status = \'published\' AND reply_status = \'pending\') ORDER BY id').all();
    return {
      counts: counts(),
      items: rows.map((r) => {
        const j = toJson(r, 'admin');
        const a = db.prepare('SELECT email, created_at FROM users WHERE id = ?').get(r.author_id);
        j.authorEmail = a ? a.email : '';
        j.sellerRating = ratingOf(r.seller_id);
        return j;
      })
    };
  });

  const adminReview = (ctx) => {
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!r) throw new HttpError(404, 'Отзыв не найден');
    return r;
  };
  const reasonOf = async (ctx, min = 5) => {
    const t = str((await readJson(ctx.req)).reason, 1000);
    if (t.length < min) throw new HttpError(400, 'Напишите причину — её увидят');
    return t;
  };
  const decide = (r, admin, status, reason = '') =>
    db.prepare('UPDATE reviews SET status = ?, reason = ?, decided_at = ?, decided_by = ? WHERE id = ?').run(status, reason, now(), admin.id, r.id);

  route('POST', '/api/admin/reviews/:id/publish', (ctx) => {
    const a = requireAdmin(ctx);
    const r = adminReview(ctx);
    if (r.status !== 'pending') throw new HttpError(409, 'Отзыв уже проверен');
    decide(r, a, 'published');
    mailer.notifyReview(r.author_id, 'published', { review: r });
    mailer.notifyReview(r.seller_id, 'new', { review: r });
    return { ok: true };
  });

  route('POST', '/api/admin/reviews/:id/reject', async (ctx) => {
    const a = requireAdmin(ctx);
    const r = adminReview(ctx);
    if (r.status !== 'pending') throw new HttpError(409, 'Отзыв уже проверен');
    const reason = await reasonOf(ctx);
    decide(r, a, 'rejected', reason);
    mailer.notifyReview(r.author_id, 'rejected', { review: r, reason });
    return { ok: true };
  });

  route('POST', '/api/admin/reviews/:id/reply/publish', (ctx) => {
    requireAdmin(ctx);
    const r = adminReview(ctx);
    if (r.reply_status !== 'pending') throw new HttpError(409, 'Ответа на проверке нет');
    db.prepare('UPDATE reviews SET reply_status = \'published\', reply_at = ? WHERE id = ?').run(now(), r.id);
    mailer.notifyReview(r.author_id, 'reply', { review: r });
    return { ok: true };
  });

  route('POST', '/api/admin/reviews/:id/reply/reject', async (ctx) => {
    requireAdmin(ctx);
    const r = adminReview(ctx);
    if (r.reply_status !== 'pending') throw new HttpError(409, 'Ответа на проверке нет');
    const reason = await reasonOf(ctx);
    db.prepare('UPDATE reviews SET reply_status = \'rejected\', reply_reason = ? WHERE id = ?').run(reason, r.id);
    mailer.notifyReview(r.seller_id, 'reply-rejected', { review: r, reason });
    return { ok: true };
  });

  // Жалоба: оставить отзыв (комментарий увидит продавец) или скрыть (причину увидят продавец и автор).
  route('POST', '/api/admin/reviews/:id/complaint/:decision', async (ctx) => {
    const a = requireAdmin(ctx);
    const r = adminReview(ctx);
    const decision = ctx.params.decision;
    if (decision !== 'keep' && decision !== 'hide') throw new HttpError(404, 'Не найдено');
    const c = db.prepare('SELECT * FROM review_complaints WHERE review_id = ? AND resolved_at IS NULL').get(r.id);
    if (!c) throw new HttpError(409, 'Открытой жалобы нет');
    const comment = await reasonOf(ctx, decision === 'hide' ? 5 : 0);
    db.prepare('UPDATE review_complaints SET resolved_at = ?, resolved_by = ?, decision = ?, comment = ? WHERE id = ?').run(now(), a.id, decision === 'hide' ? 'hidden' : 'kept', comment, c.id);
    if (decision === 'hide') {
      decide(r, a, 'hidden', comment);
      mailer.notifyReview(r.author_id, 'hidden', { review: r, reason: comment });
    }
    mailer.notifyReview(r.seller_id, decision === 'hide' ? 'complaint-hidden' : 'complaint-kept', { review: r, reason: comment });
    return { ok: true };
  });

  // Вернуть скрытый отзыв (если скрыли по ошибке).
  route('POST', '/api/admin/reviews/:id/restore', (ctx) => {
    const a = requireAdmin(ctx);
    const r = adminReview(ctx);
    if (r.status !== 'hidden' && r.status !== 'rejected') throw new HttpError(409, 'Отзыв не скрыт');
    decide(r, a, 'published');
    return { ok: true };
  });

  return { ratingOf, chatState, counts, RECEIVED, COMPLAINT_REASONS };
};

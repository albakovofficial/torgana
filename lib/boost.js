'use strict';

// Продвижение в ленте и поиске (1.21.0): XL-карточка, яркая рамка, метки на фото и пакет «Всё в одном».
//
// - Купить может любой продавец: при подаче объявления (шаг «Публикация») или позже — «Продвинуть» в «Моих объявлениях».
// - Порядок выдачи не меняется: карточка стоит на своём месте по дате, только заметнее и подписана «Продвигается».
// - Срок — BOOST_DAYS (7) дней с публикации. Оплачено до публикации — ждёт её (status = waiting) и начинается вместе с ней.
//   Если объявление удалили или его не опубликовали за 7 дней после оплаты (и публикация не запланирована на позже),
//   деньги возвращаются сами (refundTick).
// - Метки — до двух из списка TAGS; видны после одобрения модератором («Модерация → Метки на фото»): метка должна быть
//   правдой («С чеком» — чек на фото). Не одобрены — возвращаем деньги за метки (в пакете — их долю от цены пакета).
// - Цены задаёт владелец в «Модерация → Оплата и цены» (billing.prices().boost). Пакет дешевле суммы трёх услуг.
const DAY = 24 * 3600 * 1000;
const BOOST_DAYS = 7;
const TAGS = ['Есть гарантия', 'С чеком', 'Как новый', 'Отдам сегодня', 'Полный комплект', 'Возможна рассрочка', 'Доставка сегодня', 'Срочно'];
const NAMES = { xl: 'XL-карточка', frame: 'Яркая рамка', tags: 'Метки на фото' };
const RETRY = 60 * 60 * 1000; // ЮKassa не приняла автоматический возврат — повторяем через час
const WAIT = Number(process.env.BOOST_WAIT_MS) || BOOST_DAYS * DAY; // сколько ждём публикации после оплаты (в тестах — меньше)

module.exports = function boost({ route, db, h, billing }) {
  const { HttpError, readJson, requireUser, requireAdmin, str, now, loadListing, photoUrl } = h;

  db.exec(`
    CREATE TABLE IF NOT EXISTS boosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
      payment_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,                    -- название объявления на момент покупки
      xl INTEGER NOT NULL DEFAULT 0,
      frame INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',        -- выбранные метки (JSON)
      tags_state TEXT NOT NULL DEFAULT '',    -- '' (меток нет) | review | on | off
      tags_note TEXT NOT NULL DEFAULT '',     -- почему метки не одобрены
      price INTEGER NOT NULL,                 -- ₽ оплачено
      tags_price INTEGER NOT NULL DEFAULT 0,  -- ₽ из них за метки — столько вернём, если метки не одобрят
      status TEXT NOT NULL,                   -- waiting (ждёт публикации) → active → ended | refunded
      starts_at INTEGER,
      ends_at INTEGER,
      refund_error TEXT NOT NULL DEFAULT '',
      refund_tried_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_boosts_listing ON boosts(listing_id, status);
    CREATE INDEX IF NOT EXISTS idx_boosts_status ON boosts(status, ends_at);
  `);

  const tagsOf = (r) => { try { const t = JSON.parse(r.tags); return Array.isArray(t) ? t : []; } catch { return []; } };
  const kindsOf = (r) => ['xl', 'frame', 'tags'].filter((k) => (k === 'tags' ? tagsOf(r).length : r[k]));

  // Цена выбора: все три — по цене пакета (если он дешевле суммы), иначе сумма. tags — доля меток в цене.
  function quote({ xl, frame, tags }) {
    const pr = billing.prices().boost;
    const pick = { xl: !!xl, frame: !!frame, tags: !!tags };
    const full = (pick.xl ? pr.xl : 0) + (pick.frame ? pr.frame : 0) + (pick.tags ? pr.tags : 0);
    const bundle = pick.xl && pick.frame && pick.tags && pr.all < full;
    const amount = bundle ? pr.all : full;
    return { amount, full, bundle, tags: pick.tags ? (bundle ? Math.round((amount * pr.tags) / full) : pr.tags) : 0 };
  }

  // Что идёт или ждёт публикации у объявления — для автора (страница объявления, «Мои объявления», форма).
  function ownerView(listingId) {
    return db.prepare('SELECT * FROM boosts WHERE listing_id = ? AND status IN (\'waiting\', \'active\') ORDER BY id').all(listingId).map((r) => ({
      id: r.id, kinds: kindsOf(r), tags: tagsOf(r), tagsState: r.tags_state, tagsNote: r.tags_note, status: r.status, startsAt: r.starts_at, endsAt: r.ends_at
    }));
  }
  const busyKinds = (listingId) => new Set(ownerView(listingId).flatMap((b) => b.kinds.filter((k) => k !== 'tags' || b.tagsState !== 'off')));

  // Оформление карточки в ленте и поиске (cardFromRow). r.boost — JSON из CARD_SELECT, r.boost_tags — одобренные метки.
  function cardExtra(r) {
    let b = null;
    try { b = r.boost ? JSON.parse(r.boost) : null; } catch { b = null; }
    let tags = [];
    try { tags = r.boost_tags ? JSON.parse(r.boost_tags) : []; } catch { tags = []; }
    if (!b || (!b.xl && !b.frame && !tags.length)) return null;
    const out = { xl: !!b.xl, frame: !!b.frame, tags };
    if (out.xl) {
      const files = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(r.id).map((x) => x.file);
      const d = db.prepare('SELECT description FROM listings WHERE id = ?').get(r.id);
      out.photos = files.slice(1, 3).map(photoUrl);
      out.more = Math.max(0, files.length - 3);
      out.desc = d ? d.description.replace(/\s+/g, ' ').trim().slice(0, 180) : '';
    }
    return out;
  }

  // ---------- покупка ----------
  route('GET', '/api/listings/:id/boost', (ctx) => {
    const u = requireUser(ctx);
    const l = loadListing(parseInt(ctx.params.id, 10));
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    return { prices: billing.prices().boost, days: BOOST_DAYS, tags: TAGS, ready: billing.ready(), current: ownerView(l.id), status: l.status };
  });

  route('POST', '/api/listings/:id/boost', async (ctx) => {
    const u = requireUser(ctx);
    const l = loadListing(parseInt(ctx.params.id, 10));
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    if (!['active', 'pending', 'scheduled', 'rejected'].includes(l.status)) throw new HttpError(400, 'Продвигать можно объявление, которое опубликовано или ждёт публикации');
    const b = await readJson(ctx.req);
    const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map((t) => String(t)))];
    if (tags.some((t) => !TAGS.includes(t))) throw new HttpError(400, 'Метки — только из списка');
    if (tags.length > 2) throw new HttpError(400, 'Не больше двух меток');
    const want = { xl: !!b.xl, frame: !!b.frame, tags: tags.length > 0 };
    if (!want.xl && !want.frame && !want.tags) throw new HttpError(400, 'Выберите, как продвигать');
    const busy = busyKinds(l.id);
    const dup = Object.keys(want).find((k) => want[k] && busy.has(k));
    if (dup) throw new HttpError(400, `${NAMES[dup]} уже ${l.status === 'active' ? 'идёт' : 'оплачена'} для этого объявления`);
    const q = quote(want);
    const names = Object.keys(want).filter((k) => want[k]).map((k) => NAMES[k]);
    const title = q.bundle ? 'Продвижение «Всё в одном» на 7 дней' : `${names.join(', ')} на 7 дней`;
    return billing.create(u, { kind: 'boost', item: { listingId: l.id, xl: want.xl, frame: want.frame, tags, tagsPrice: q.tags }, title, amount: q.amount });
  });

  const until = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

  // Оплата прошла: опубликованное — продвигаем сразу, остальное — с публикацией.
  billing.onPaid('boost', (p, item) => {
    const l = item.listingId ? loadListing(item.listingId) : null;
    const t = now();
    const on = !!(l && l.status === 'active');
    const tags = Array.isArray(item.tags) ? item.tags : [];
    db.prepare(`INSERT INTO boosts (user_id, listing_id, payment_id, title, xl, frame, tags, tags_state, price, tags_price, status, starts_at, ends_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(p.user_id, l ? l.id : null, p.id, l ? l.title : 'Объявление удалено', item.xl ? 1 : 0, item.frame ? 1 : 0,
      JSON.stringify(tags), tags.length ? 'review' : '', p.amount, Math.min(p.amount, Number(item.tagsPrice) || 0), on ? 'active' : 'waiting', on ? t : null, on ? t + BOOST_DAYS * DAY : null, t);
    const note = tags.length ? ' Метки появятся после проверки модератором.' : '';
    return {
      info: on ? `продвижение идёт до ${until(t + BOOST_DAYS * DAY)}.${note}` : `продвижение начнётся вместе с публикацией и продлится 7 дней.${note}`,
      url: l ? `/l/${l.id}` : '/profile'
    };
  });

  // Модератор вернул деньги в «Платежах» с остановкой услуги.
  billing.onRefund('boost', (p) => {
    db.prepare('UPDATE boosts SET status = \'refunded\', ends_at = MIN(COALESCE(ends_at, ?), ?) WHERE payment_id = ? AND status IN (\'waiting\', \'active\')').run(now(), now(), p.id);
  });

  // Объявление опубликовано (модератором, по расписанию или «Опубликовать снова») — запускаем ждущее.
  function onPublished(listingId) {
    const t = now();
    db.prepare('UPDATE boosts SET status = \'active\', starts_at = ?, ends_at = ? WHERE listing_id = ? AND status = \'waiting\'').run(t, t + BOOST_DAYS * DAY, listingId);
  }

  // ---------- сроки и автоматические возвраты ----------
  const endTick = () => db.prepare('UPDATE boosts SET status = \'ended\' WHERE status = \'active\' AND ends_at <= ?').run(now()).changes;

  let refunding = false;
  async function refundTick() {
    if (refunding || !billing.ready()) return 0;
    refunding = true;
    let n = 0;
    try {
      const t = now();
      const rows = db.prepare(`SELECT b.* FROM boosts b LEFT JOIN listings l ON l.id = b.listing_id
        WHERE b.status = 'waiting' AND b.refund_tried_at < ? AND (l.id IS NULL OR (b.created_at <= ? AND l.status NOT IN ('scheduled', 'active')))`).all(t - RETRY, t - WAIT);
      for (const r of rows) {
        const reason = r.listing_id ? 'Объявление не опубликовано в течение 7 дней после оплаты' : 'Объявление удалено до публикации';
        if (await giveBack(r, r.price, reason)) {
          db.prepare('UPDATE boosts SET status = \'refunded\', refund_error = \'\' WHERE id = ?').run(r.id);
          n++;
        }
      }
    } finally { refunding = false; }
    return n;
  }

  // Вернуть amount ₽ (не больше остатка платежа). false — ЮKassa не приняла, попробуем позже.
  async function giveBack(r, amount, reason) {
    const p = billing.load(r.payment_id);
    const left = p ? p.amount - p.refunded : 0;
    const sum = Math.min(amount, left);
    if (!p || p.status !== 'succeeded' || sum < 1) return true; // возвращать нечего
    try {
      await billing.refund(null, p, sum, reason, r.listing_id ? { url: `/l/${r.listing_id}`, button: 'Открыть объявление' } : { url: '/profile', button: 'Мои объявления' });
      return true;
    } catch (e) {
      db.prepare('UPDATE boosts SET refund_error = ?, refund_tried_at = ? WHERE id = ?').run(String(e.message).slice(0, 300), now(), r.id);
      console.error('boost refund:', e.message);
      return false;
    }
  }

  // ---------- модерация меток ----------
  const reviewRows = () => db.prepare(`SELECT b.*, u.name, u.email, l.description, l.status AS listing_status FROM boosts b JOIN users u ON u.id = b.user_id
    LEFT JOIN listings l ON l.id = b.listing_id WHERE b.tags_state = 'review' AND b.status IN ('waiting', 'active') ORDER BY b.id`).all();
  const awaiting = () => db.prepare('SELECT COUNT(*) AS n FROM boosts WHERE tags_state = \'review\' AND status IN (\'waiting\', \'active\')').get().n;

  route('GET', '/api/admin/boost-tags', (ctx) => {
    requireAdmin(ctx);
    return {
      items: reviewRows().map((r) => ({
        id: r.id, tags: tagsOf(r), title: r.title, listingId: r.listing_id, listingStatus: r.listing_status || 'deleted', status: r.status, tagsPrice: r.tags_price, createdAt: r.created_at,
        description: r.description || '', photos: r.listing_id ? db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position').all(r.listing_id).map((x) => photoUrl(x.file)) : [],
        user: { id: r.user_id, name: r.name, email: r.email }
      }))
    };
  });

  route('POST', '/api/admin/boosts/:id/tags', async (ctx) => {
    const admin = requireAdmin(ctx);
    const r = db.prepare('SELECT * FROM boosts WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!r || r.tags_state !== 'review' || !['waiting', 'active'].includes(r.status)) throw new HttpError(404, 'Метки уже проверены');
    const b = await readJson(ctx.req);
    const url = r.listing_id ? `/l/${r.listing_id}` : '/profile';
    if (b.ok) {
      db.prepare('UPDATE boosts SET tags_state = \'on\' WHERE id = ?').run(r.id);
      h.audit(admin, 'boost-tags-on', { listingId: r.listing_id, userId: r.user_id }, { tags: tagsOf(r), title: r.title });
      h.alerts.notify(r.user_id, 'moderation', { title: 'Метки на фото одобрены', body: `«${r.title}»: ${tagsOf(r).join(', ')}`, url, tag: `boost-${r.id}` });
      return { ok: true };
    }
    const reason = str(b.reason, 300);
    if (reason.length < 5) throw new HttpError(400, 'Напишите причину — её увидит продавец');
    const p = billing.load(r.payment_id);
    if (p && p.status === 'succeeded' && r.tags_price > 0 && p.amount - p.refunded > 0) {
      try {
        await billing.refund(admin, p, Math.min(r.tags_price, p.amount - p.refunded), `Метки на фото не одобрены: ${reason}`, { url, button: 'Открыть объявление' });
      } catch (e) { throw new HttpError(e.status || 502, e.message); }
    }
    db.prepare('UPDATE boosts SET tags_state = \'off\', tags_note = ? WHERE id = ?').run(reason, r.id);
    h.audit(admin, 'boost-tags-off', { listingId: r.listing_id, userId: r.user_id }, { tags: tagsOf(r), title: r.title, reason });
    h.alerts.notify(r.user_id, 'moderation', { title: 'Метки на фото не одобрены', body: `${reason}. Деньги за метки вернём.`, url, tag: `boost-${r.id}` });
    return { ok: true };
  });

  const timer = setInterval(() => { try { endTick(); } catch { /* база занята */ } refundTick().catch((e) => console.error('boost tick:', e.message)); }, Number(process.env.BOOST_TICK_MS) || 60 * 1000);
  timer.unref();

  return { cardExtra, ownerView, onPublished, awaiting, endTick, refundTick, quote, TAGS, BOOST_DAYS };
};

'use strict';

// Продвижение в ленте и поиске (1.21.0): XL-карточка, яркая рамка, метки на фото и пакет «Всё в одном».
//
// - Купить может любой продавец: при подаче объявления (шаг «Публикация») или позже — «Продвинуть» в «Моих объявлениях».
// - Порядок выдачи не меняется: карточка стоит на своём месте по дате, только заметнее (подписи «Продвигается» нет с 1.43.1).
// - Срок — BOOST_DAYS (7) дней с публикации. Оплачено до публикации — ждёт её (status = waiting) и начинается вместе с ней.
//   Если объявление удалили или его не опубликовали за 7 дней после оплаты (и публикация не запланирована на позже),
//   деньги возвращаются сами (refundTick).
// - Метки — до двух из списка TAGS; видны сразу после оплаты, как XL и рамка (1.40.0: без проверки модератором).
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
      price INTEGER NOT NULL,                 -- ₽ оплачено
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
  // 1.40.0: проверки меток больше нет. Ждавшие проверки — включены; отклонённые (деньги за них уже вернули) — убраны,
  // продвижение из одних отклонённых меток — завершено. Служебные поля проверки удалены.
  if (db.prepare('SELECT 1 FROM pragma_table_info(\'boosts\') WHERE name = \'tags_state\'').get()) {
    db.exec(`
      UPDATE boosts SET status = 'refunded' WHERE tags_state = 'off' AND xl = 0 AND frame = 0 AND status IN ('waiting', 'active');
      UPDATE boosts SET tags = '[]' WHERE tags_state = 'off';
      ALTER TABLE boosts DROP COLUMN tags_state;
      ALTER TABLE boosts DROP COLUMN tags_note;
      ALTER TABLE boosts DROP COLUMN tags_price;
    `);
  }

  const tagsOf = (r) => { try { const t = JSON.parse(r.tags); return Array.isArray(t) ? t : []; } catch { return []; } };
  const kindsOf = (r) => ['xl', 'frame', 'tags'].filter((k) => (k === 'tags' ? tagsOf(r).length : r[k]));

  // Цена выбора: все три — по цене пакета (если он дешевле суммы), иначе сумма.
  function quote({ xl, frame, tags }) {
    const pr = billing.prices().boost;
    const full = (xl ? pr.xl : 0) + (frame ? pr.frame : 0) + (tags ? pr.tags : 0);
    const bundle = !!(xl && frame && tags) && pr.all < full;
    return { amount: bundle ? pr.all : full, bundle };
  }

  // Что идёт или ждёт публикации у объявления — для автора (страница объявления, «Мои объявления», форма).
  function ownerView(listingId) {
    return db.prepare('SELECT * FROM boosts WHERE listing_id = ? AND status IN (\'waiting\', \'active\') ORDER BY id').all(listingId).map((r) => ({
      id: r.id, kinds: kindsOf(r), tags: tagsOf(r), status: r.status, startsAt: r.starts_at, endsAt: r.ends_at
    }));
  }
  const busyKinds = (listingId) => new Set(ownerView(listingId).flatMap((b) => b.kinds));

  // Оформление карточки в ленте и поиске (cardFromRow). r.boost — JSON из CARD_SELECT, r.boost_tags — метки идущего продвижения.
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

  // Что выбрано (XL, рамка, метки) — одинаково проверяется у покупки и у подарка модератора.
  async function pickBoost(ctx, l) {
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
    return { want, tags };
  }

  route('POST', '/api/listings/:id/boost', async (ctx) => {
    const u = requireUser(ctx);
    const l = loadListing(parseInt(ctx.params.id, 10));
    if (!l || l.user_id !== u.id) throw new HttpError(404, 'Объявление не найдено');
    const { want, tags } = await pickBoost(ctx, l);
    const q = quote(want);
    const names = Object.keys(want).filter((k) => want[k]).map((k) => NAMES[k]);
    const title = q.bundle ? 'Продвижение «Всё в одном» на 7 дней' : `${names.join(', ')} на 7 дней`;
    return billing.create(u, { kind: 'boost', item: { listingId: l.id, xl: want.xl, frame: want.frame, tags }, title, amount: q.amount });
  });

  const until = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

  // Оплата прошла: опубликованное — продвигаем сразу, остальное — с публикацией.
  // Включить продвижение — после оплаты и подарком модератора (amount 0, без платежа).
  function startBoost(userId, l, item, amount, paymentId) {
    const t = now();
    const on = !!(l && l.status === 'active');
    const tags = Array.isArray(item.tags) ? item.tags : [];
    db.prepare(`INSERT INTO boosts (user_id, listing_id, payment_id, title, xl, frame, tags, price, status, starts_at, ends_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, l ? l.id : null, paymentId, l ? l.title : 'Объявление удалено', item.xl ? 1 : 0, item.frame ? 1 : 0,
      JSON.stringify(tags), amount, on ? 'active' : 'waiting', on ? t : null, on ? t + BOOST_DAYS * DAY : null, t);
    return on ? `продвижение идёт до ${until(t + BOOST_DAYS * DAY)}.` : 'продвижение начнётся вместе с публикацией и продлится 7 дней.';
  }
  billing.onPaid('boost', (p, item) => {
    const l = item.listingId ? loadListing(item.listingId) : null;
    return { info: startBoost(p.user_id, l, item, p.amount, p.id), url: l ? `/l/${l.id}` : '/profile' };
  });

  // 1.44.0: модератор дарит продвижение (XL, рамка, метки) на 7 дней — бесплатно, любому объявлению.
  route('POST', '/api/admin/listings/:id/boost', async (ctx) => {
    const admin = requireAdmin(ctx);
    const l = loadListing(parseInt(ctx.params.id, 10));
    if (!l) throw new HttpError(404, 'Объявление не найдено');
    const { want, tags } = await pickBoost(ctx, l);
    const info = startBoost(l.user_id, l, { xl: want.xl, frame: want.frame, tags }, 0, '');
    const names = Object.keys(want).filter((k) => want[k]).map((k) => NAMES[k]);
    h.audit(admin, 'boost-gift', { listingId: l.id, userId: l.user_id }, { kinds: names, tags, title: l.title });
    h.alerts.notify(l.user_id, 'moderation', { title: `Подарок: ${names.join(', ')} на 7 дней`, body: `«${l.title}» — ${info}`, url: `/l/${l.id}`, tag: 'boost', icon: 'bolt', tone: 'ok' });
    return { ok: true, info };
  });

  // Модератор отключает продвижение (даже оплаченное). Деньги — отдельно, в «Платежах».
  route('POST', '/api/admin/boosts/:id/stop', async (ctx) => {
    const admin = requireAdmin(ctx);
    const r = db.prepare('SELECT * FROM boosts WHERE id = ?').get(parseInt(ctx.params.id, 10));
    if (!r || !['waiting', 'active'].includes(r.status)) throw new HttpError(404, 'Продвижение не найдено');
    const reason = str((await readJson(ctx.req)).reason, 500);
    if (reason.length < 5) throw new HttpError(400, 'Напишите причину — её увидит продавец');
    db.prepare('UPDATE boosts SET status = \'stopped\', ends_at = MIN(COALESCE(ends_at, ?), ?) WHERE id = ?').run(now(), now(), r.id);
    h.audit(admin, 'boost-stopped', { listingId: r.listing_id, userId: r.user_id }, { reason, title: r.title });
    h.alerts.notify(r.user_id, 'moderation', { title: 'Продвижение отключено', body: `«${r.title}»: ${reason}`, url: `/l/${r.listing_id}`, tag: `boost-${r.id}`, icon: 'bolt', tone: 'bad' });
    return { ok: true };
  });

  // Для страницы «Оплата прошла»: идёт ли уже и до какого числа.
  billing.onResult('boost', (p) => {
    const r = db.prepare('SELECT * FROM boosts WHERE payment_id = ? ORDER BY id DESC LIMIT 1').get(p.id);
    return r ? { status: r.status, endsAt: r.ends_at, kinds: kindsOf(r), listingId: r.listing_id } : null;
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
        WHERE b.status = 'waiting' AND b.refund_tried_at < ? AND (l.id IS NULL OR l.status = 'deleted' OR (b.created_at <= ? AND l.status NOT IN ('scheduled', 'active')))`).all(t - RETRY, t - WAIT);
      for (const r of rows) {
        const gone = !r.listing_id || (db.prepare('SELECT status FROM listings WHERE id = ?').get(r.listing_id) || {}).status === 'deleted';
        const reason = gone ? 'Объявление удалено до публикации' : 'Объявление не опубликовано в течение 7 дней после оплаты';
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

  const timer = setInterval(() => { try { endTick(); } catch { /* база занята */ } refundTick().catch((e) => console.error('boost tick:', e.message)); }, Number(process.env.BOOST_TICK_MS) || 60 * 1000);
  timer.unref();

  return { cardExtra, ownerView, onPublished, TAGS, BOOST_DAYS };
};

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  // lower() в SQLite не знает кириллицу — для поиска по именам своя функция (ё = е).
  db.function('lower_ru', { deterministic: true }, (v) => (v == null ? null : String(v).toLowerCase().replace(/ё/g, 'е')));
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      price INTEGER,
      price_unit TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL,
      condition TEXT NOT NULL DEFAULT '',
      delivery INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      reject_reason TEXT NOT NULL DEFAULT '',
      appeal_text TEXT NOT NULL DEFAULT '',
      appeal_at INTEGER,
      views INTEGER NOT NULL DEFAULT 0,
      search_text TEXT NOT NULL DEFAULT '',
      city_lc TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at DESC);
    -- 1.41.3: с датой в конце — раздел, «похожие» и объявления продавца берутся по индексу уже в нужном порядке.
    DROP INDEX IF EXISTS idx_listings_category;
    DROP INDEX IF EXISTS idx_listings_user;
    CREATE INDEX IF NOT EXISTS idx_listings_cat_date ON listings(category, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_listings_user_date ON listings(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_listings_city_date ON listings(city_lc, category, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(status, price);

    CREATE TABLE IF NOT EXISTS uploads (
      file TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_uploads_listing ON uploads(listing_id, position);

    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, listing_id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (listing_id, buyer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_conv_buyer ON conversations(buyer_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conv_seller ON conversations(seller_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Одноразовые ссылки из писем (храним только хеш токена).
    CREATE TABLE IF NOT EXISTS email_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id, kind);

    CREATE TABLE IF NOT EXISTS mail_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      html TEXT NOT NULL,
      text TEXT NOT NULL,
      headers TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_at INTEGER NOT NULL,
      last_error TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      sent_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_mail_queue_status ON mail_queue(status, next_at);

    -- История объявления: создано, правки (что изменилось), решения модерации, жалобы.
    CREATE TABLE IF NOT EXISTS listing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_listing_events ON listing_events(listing_id, id);

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolution TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_reports_open ON reports(resolved_at, listing_id);

    -- Чат поддержки: один диалог на пользователя. staff_id NULL — сообщение пользователя.
    CREATE TABLE IF NOT EXISTS support_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
      staff_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_support_messages ON support_messages(thread_id, id);

    -- Когда последний раз писали пользователю о новых сообщениях в диалоге.
    CREATE TABLE IF NOT EXISTS chat_notify (
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_message_id INTEGER NOT NULL DEFAULT 0,
      last_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id)
    );
  `);

  // Новые поля в существующих таблицах (база уже может быть на боевом сервере).
  const addColumn = (table, column, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (cols.includes(column)) return false;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    return true;
  };
  addColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'notify_messages', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('users', 'notify_moderation', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('users', 'unsub_token', "TEXT NOT NULL DEFAULT ''");
  addColumn('listings', 'appeal_reply', "TEXT NOT NULL DEFAULT ''");
  addColumn('listings', 'flags', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'consent_at', 'INTEGER');
  addColumn('users', 'avatar', "TEXT NOT NULL DEFAULT ''"); // файл из uploads (фото профиля)
  // Блокировка: причина и когда (видит модератор, причина уходит человеку письмом).
  addColumn('users', 'block_reason', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'blocked_at', 'INTEGER');
  // Письма модератору: instant — сразу (раз в минуту одним письмом), hourly — сводкой раз в час, off — не присылать.
  addColumn('users', 'mod_notify', "TEXT NOT NULL DEFAULT 'hourly'");
  addColumn('users', 'mod_notify_kinds', "TEXT NOT NULL DEFAULT 'pending,reports,support'");
  addColumn('users', 'mod_notify_at', 'INTEGER NOT NULL DEFAULT 0');
  // 1.47.2: push модераторам — о чём (через запятую). Приходят сразу, на устройства, где модератор включил уведомления.
  addColumn('users', 'push_mod_kinds', "TEXT NOT NULL DEFAULT 'pending,reports,support,biz,rep,pay'");
  // 1.47.2: напоминание «срок объявления заканчивается» — для какого expires_at уже напомнили.
  addColumn('listings', 'expire_warned_for', 'INTEGER');
  // Автопроверки объявления (JSON-список замечаний для модератора) и отпечатки фото для поиска повторов.
  addColumn('listings', 'checks', "TEXT NOT NULL DEFAULT ''");
  addColumn('uploads', 'hash', "TEXT NOT NULL DEFAULT ''");
  addColumn('uploads', 'thumb', "TEXT NOT NULL DEFAULT ''"); // 1.43.0: лёгкая копия для ленты (640 px, WebP)
  // Уведомления: подборка за день письмом и push по видам (у каждого — свой переключатель).
  addColumn('users', 'notify_digest', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('users', 'digest_at', 'INTEGER NOT NULL DEFAULT 0');
  for (const k of ['messages', 'searches', 'prices', 'moderation']) addColumn('users', `push_${k}`, 'INTEGER NOT NULL DEFAULT 1');
  // Цена при последней публикации и снижение цены (показываем зачёркнутую старую цену).
  addColumn('listings', 'published_price', 'INTEGER');
  addColumn('listings', 'price_was', 'INTEGER');
  addColumn('listings', 'price_drop_at', 'INTEGER');
  addColumn('listings', 'alerted', 'INTEGER NOT NULL DEFAULT 0'); // новое уже разослано подписчикам продавца (первая публикация)
  // Доверие: телефон подтверждён сервисом входа; проверка бизнеса (ИП/компания) модератором.
  addColumn('users', 'phone_verified', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'phone_verified_via', "TEXT NOT NULL DEFAULT ''");
  for (const c of ['biz_kind', 'biz_name', 'biz_inn', 'biz_ogrn', 'biz_status', 'biz_note']) addColumn('users', c, "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'biz_at', 'INTEGER');
  // Фото в чатах.
  addColumn('messages', 'photo', "TEXT NOT NULL DEFAULT ''");
  addColumn('support_messages', 'photo', "TEXT NOT NULL DEFAULT ''");
  // Тариф для бизнеса (shop — «Магазин», pro — «Магазин Про») и до какого времени он оплачен.
  addColumn('users', 'plan', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'plan_until', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'plan_reminded', 'INTEGER NOT NULL DEFAULT 0'); // письмо «тариф заканчивается» уже ушло для этого срока
  addColumn('users', 'plan_trial', 'INTEGER NOT NULL DEFAULT 0'); // текущий тариф — пробный (подарок), не оплачен
  // Пробный тариф «первым магазинам» — один раз на компанию (по ИНН), а не на аккаунт.
  db.exec('CREATE TABLE IF NOT EXISTS trial_inns (inn TEXT PRIMARY KEY, user_id INTEGER NOT NULL, at INTEGER NOT NULL)');
  // 1.45.0: бизнес-аккаунт включает любой пользователь (тарифы — после него, проверка ИНН — по желанию, ради значка);
  // бесплатный старт — один раз на аккаунт (trial_at) и, у проверенных, один раз на ИНН (trial_inns).
  if (addColumn('users', 'biz_account', 'INTEGER NOT NULL DEFAULT 0')) {
    db.exec(`UPDATE users SET biz_account = 1 WHERE biz_status != '' OR plan_until > 0`);
  }
  // 1.45.0: товарный знак из реестра Роспатента — заявка, проверка модератором, объёмный значок «Проверенный бренд».
  for (const c of ['tm_status', 'tm_number', 'tm_name', 'tm_note', 'tm_code']) addColumn('users', c, "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'tm_until', 'INTEGER NOT NULL DEFAULT 0'); // срок действия регистрации (из реестра)
  addColumn('users', 'tm_at', 'INTEGER');
  if (addColumn('users', 'trial_at', 'INTEGER')) {
    db.exec('UPDATE users SET trial_at = (SELECT t.at FROM trial_inns t WHERE t.user_id = users.id) WHERE id IN (SELECT user_id FROM trial_inns)');
  }
  // Витрина магазина: обложка (файл из uploads), описание, часы работы, адрес, сайт.
  for (const c of ['shop_cover', 'shop_about', 'shop_hours', 'shop_address', 'shop_site']) addColumn('users', c, "TEXT NOT NULL DEFAULT ''");
  // Автозагрузка из фида: адрес, категория и город по умолчанию, состояние последней загрузки (JSON).
  for (const c of ['feed_url', 'feed_category', 'feed_city']) addColumn('users', c, "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'feed_state', "TEXT NOT NULL DEFAULT '{}'");
  addColumn('users', 'feed_at', 'INTEGER NOT NULL DEFAULT 0');
  // 1.16: подкатегория, характеристики (JSON), метро и район, видео (файл из videos).
  for (const c of ['subcategory', 'metro', 'district', 'video']) addColumn('listings', c, "TEXT NOT NULL DEFAULT ''");
  addColumn('listings', 'attrs', "TEXT NOT NULL DEFAULT '{}'");
  // 1.20: торг и обмен, публикация в выбранное время (status = scheduled), срок показа 30 дней.
  // Уже опубликованным срок считается с обновления — чтобы ничего не пропало сразу.
  addColumn('listings', 'bargain', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('listings', 'exchange', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('listings', 'publish_at', 'INTEGER');
  if (addColumn('listings', 'expires_at', 'INTEGER')) db.prepare('UPDATE listings SET expires_at = ? WHERE status = \'active\'').run(Date.now() + 30 * 24 * 3600 * 1000);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_listings_expires ON listings(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_listings_publish ON listings(status, publish_at);
  `);
  db.exec(`
    DROP INDEX IF EXISTS idx_listings_sub;
    CREATE INDEX IF NOT EXISTS idx_listings_sub_date ON listings(subcategory, status, created_at DESC);
    -- Видео к объявлениям: загружается частями (part — сколько байт уже принято), ready — файл собран и проверен.
    CREATE TABLE IF NOT EXISTS videos (
      file TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
      size INTEGER NOT NULL DEFAULT 0,
      received INTEGER NOT NULL DEFAULT 0,
      mime TEXT NOT NULL DEFAULT '',
      ready INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id);
  `);
  // 1.17: предложение цены в чате, быстрые ответы, подписка на продавца.
  addColumn('messages', 'kind', "TEXT NOT NULL DEFAULT ''"); // offer — предложение цены, offer-reply — ответ на него
  addColumn('messages', 'offer_id', 'INTEGER');
  addColumn('users', 'quick_replies', "TEXT NOT NULL DEFAULT ''"); // JSON-список; '' — шаблоны по умолчанию
  addColumn('users', 'deactivated_at', 'INTEGER'); // 1.39: профиль временно удалён (lib/account.js)
  addColumn('users', 'deleted_at', 'INTEGER'); // 1.39: удалён навсегда — личные данные стёрты
  db.exec(`
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      price INTEGER NOT NULL,
      listing_price INTEGER,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, declined, withdrawn
      created_at INTEGER NOT NULL,
      decided_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_offers_conv ON offers(conversation_id, id);
    CREATE TABLE IF NOT EXISTS follows (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      seen_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, seller_id)
    );
    CREATE INDEX IF NOT EXISTS idx_follows_seller ON follows(seller_id);
  `);
  db.exec(`
    -- Новое для человека: объявление продавца из подписок (follow) или снижение цены в избранном (price).
    CREATE TABLE IF NOT EXISTS user_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      seen_at INTEGER,
      emailed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_user ON user_alerts(user_id, seen_at, emailed_at);
    CREATE INDEX IF NOT EXISTS idx_uploads_hash ON uploads(hash);
    CREATE INDEX IF NOT EXISTS idx_favorites_listing ON favorites(listing_id); -- 1.41.0: «в избранном у N» без полного просмотра таблицы
    -- Журнал действий модераторов: кто, что, над чем, почему.
    CREATE TABLE IF NOT EXISTS admin_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      listing_id INTEGER,
      user_id INTEGER,
      data TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_log ON admin_log(admin_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_log_user ON admin_log(user_id, id DESC);
  `);
  // 1.42.0: сохранённые поиски удалены (решение владельца; с 1.39.0 не использовались) — таблица saved_searches и поле
  // user_alerts.search_id. SQLite не удаляет поле со ссылкой на другую таблицу, поэтому user_alerts пересобирается.
  // Перед установкой версии автообновление сохраняет копию базы (data/update/db) — откат через deploy/restore.sh.
  if (db.prepare('SELECT 1 FROM pragma_table_info(\'user_alerts\') WHERE name = \'search_id\'').get()) {
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.exec(`BEGIN;
        CREATE TABLE user_alerts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
          data TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          seen_at INTEGER,
          emailed_at INTEGER
        );
        INSERT INTO user_alerts_new (id, user_id, kind, listing_id, data, created_at, seen_at, emailed_at)
          SELECT id, user_id, kind, listing_id, data, created_at, seen_at, emailed_at FROM user_alerts WHERE kind != 'search';
        DROP TABLE user_alerts;
        ALTER TABLE user_alerts_new RENAME TO user_alerts;
        CREATE INDEX IF NOT EXISTS idx_alerts_user ON user_alerts(user_id, seen_at, emailed_at);
        DROP TABLE IF EXISTS saved_searches;
        COMMIT;`);
    } catch (e) { db.exec('ROLLBACK'); throw e; } finally { db.exec('PRAGMA foreign_keys = ON'); }
  }

  // 1.47.2: отзывы удалены целиком (решение владельца 9 ноября 2026 года) — их заменила репутация (lib/reputation.js):
  // таблицы отзывов и жалоб на них, переключатели писем и push о них, записи журнала модерации о них.
  // Перед установкой версии автообновление сохраняет копию базы (data/update/db).
  db.exec("DROP TABLE IF EXISTS review_complaints; DROP TABLE IF EXISTS reviews; DELETE FROM admin_log WHERE action LIKE 'review-%' OR action LIKE 'reply-%'; DELETE FROM mail_queue WHERE kind = 'review'");
  for (const [t, c] of [['users', 'notify_reviews'], ['users', 'push_reviews'], ['admin_log', 'review_id']]) {
    if (db.prepare(`SELECT 1 FROM pragma_table_info('${t}') WHERE name = ?`).get(c)) db.exec(`ALTER TABLE ${t} DROP COLUMN ${c}`);
  }

  // Цена при публикации для уже опубликованных объявлений (до 1.10 не хранилась); они же уже «разосланы».
  db.exec("UPDATE listings SET published_price = price, alerted = 1 WHERE published_price IS NULL AND status IN ('active', 'sold', 'archived')");

  // 1.43.0: полнотекстовый индекс по тексту поиска (триграммы) — слово из 3+ букв ищется по индексу, а не перебором.
  // Внешнее содержимое: сам текст в listings.search_text, индекс держат в порядке триггеры.
  if (!db.prepare('SELECT 1 FROM sqlite_master WHERE name = \'listings_fts\'').get()) {
    db.exec(`
      CREATE VIRTUAL TABLE listings_fts USING fts5(search_text, content='listings', content_rowid='id', tokenize='trigram');
      INSERT INTO listings_fts(listings_fts) VALUES ('rebuild');
    `);
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS listings_fts_ai AFTER INSERT ON listings BEGIN
      INSERT INTO listings_fts(rowid, search_text) VALUES (new.id, new.search_text); END;
    CREATE TRIGGER IF NOT EXISTS listings_fts_ad AFTER DELETE ON listings BEGIN
      INSERT INTO listings_fts(listings_fts, rowid, search_text) VALUES ('delete', old.id, old.search_text); END;
    CREATE TRIGGER IF NOT EXISTS listings_fts_au AFTER UPDATE OF search_text ON listings BEGIN
      INSERT INTO listings_fts(listings_fts, rowid, search_text) VALUES ('delete', old.id, old.search_text);
      INSERT INTO listings_fts(rowid, search_text) VALUES (new.id, new.search_text); END;
  `);

  // 1.41.3: счётчики выдачи («N объявлений», «О разделе») — из памяти, пока объявления не менялись.
  // Временные триггеры (живут в этом подключении) меняют номер поколения при любом изменении, влияющем на выдачу;
  // просмотры и прочие служебные поля его не трогают. db.memo(key, fn) — значение fn() до следующего изменения.
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS listings_gen (n INTEGER NOT NULL);
    INSERT INTO listings_gen SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM listings_gen);
    CREATE TEMP TRIGGER IF NOT EXISTS lg_ins AFTER INSERT ON main.listings BEGIN UPDATE listings_gen SET n = n + 1; END;
    CREATE TEMP TRIGGER IF NOT EXISTS lg_del AFTER DELETE ON main.listings BEGIN UPDATE listings_gen SET n = n + 1; END;
    CREATE TEMP TRIGGER IF NOT EXISTS lg_upd AFTER UPDATE OF status, category, subcategory, title, description, city, city_lc, price, price_unit,
      search_text, attrs, metro, district, delivery, bargain, exchange, user_id, created_at ON main.listings BEGIN UPDATE listings_gen SET n = n + 1; END;
    CREATE TEMP TRIGGER IF NOT EXISTS lg_usr AFTER UPDATE OF is_blocked, deactivated_at ON main.users BEGIN UPDATE listings_gen SET n = n + 1; END;
  `);
  const genOf = db.prepare('SELECT n FROM temp.listings_gen');
  const memo = new Map();
  let gen = -1;
  db.memo = (key, fn) => {
    const g = genOf.get().n;
    if (g !== gen) { memo.clear(); gen = g; }
    if (memo.has(key)) return memo.get(key);
    const v = fn();
    if (memo.size >= 2000) memo.clear();
    memo.set(key, v);
    return v;
  };
  // Статистика для выбора индексов: при запуске и раз в 6 часов (быстро, SQLite пересчитывает только устаревшее).
  db.exec('PRAGMA optimize = 0x10002');
  setInterval(() => { try { db.exec('PRAGMA optimize'); } catch { /* база занята */ } }, 6 * 3600 * 1000).unref();
  return db;
}

module.exports = { openDb };

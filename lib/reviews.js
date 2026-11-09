'use strict';

// 1.47.2: отзывы убраны с сайта целиком (решение владельца 9 ноября 2026 года) — их заменила репутация
// (lib/reputation.js). Ни страниц, ни API, ни писем, ни модерации отзывов больше нет.
// Таблицы остаются: в них отзывы, оставленные до 9 ноября 2026 года. Удаляются вместе с аккаунтом (lib/account.js).

module.exports = function reviews({ db }) {
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
};

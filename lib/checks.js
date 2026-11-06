'use strict';

// Автопроверки объявления перед модерацией. Ничего не запрещают — только подсказывают модератору,
// на что посмотреть: повтор, чужие фото, цена сильно ниже рынка, контакты в тексте.
// Результат — JSON-список в listings.checks: [{ kind, text, ref? }], подозрительные идут в очереди первыми.

const CONTACTS = [
  ['телефон', /(?:\+7|(?<![\d+])8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/],
  ['почта', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ['ссылка', /https?:\/\/\S+|www\.\S+|(?<![@\w.])[a-z0-9-]{2,}\.(?:ru|com|рф|net|org|su|me|io|shop|store)(?![a-z])/i],
  ['мессенджер', /t\.me\/\S+|(?<![\w.])@[a-z][a-z0-9_]{4,}|телеграм|telegram|whats\s?app|ват[сc]ап|вотсап|вайбер|viber/i]
];
const PRICE_FACTOR = 0.35; // дешевле 35% от медианы похожих — частый признак мошенничества
const PHOTO_DISTANCE = 5; // отпечатки фото, отличающиеся не больше чем на 5 бит из 64, считаем одним снимком

// Отпечаток фото (dHash, 16 hex-символов) считает браузер при уменьшении фото; расстояние — число разных бит.
function distance(a, b) {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

module.exports = function checks({ db, marketEstimate }) {
  const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n);

  function contactsIn(l) {
    const text = `${l.title}\n${l.description}`;
    const found = [];
    for (const [label, re] of CONTACTS) {
      const m = re.exec(text);
      if (m) found.push(`${label} «${m[0].trim().slice(0, 40)}»`);
    }
    return found.length ? [{ kind: 'contacts', text: `Контакты в тексте: ${found.join(', ')}` }] : [];
  }

  function priceCheck(l) {
    if (!l.price) return [];
    const est = marketEstimate({ id: l.id, category: l.category, title: l.title, priceUnit: l.price_unit });
    if (!est || l.price >= est.median * PRICE_FACTOR) return [];
    const times = Math.max(2, Math.round(est.median / l.price));
    const raza = times % 10 >= 2 && times % 10 <= 4 && (times % 100 < 10 || times % 100 > 20) ? 'раза' : 'раз';
    return [{ kind: 'price', text: `Цена в ${times} ${raza} ниже похожих: обычно ${fmt(est.median)} ₽ (сравнили с ${est.count})` }];
  }

  // Повтор у того же автора (то же название или то же фото) и то же фото у другого продавца.
  function repeats(l) {
    const out = [];
    const sameTitle = db.prepare(`SELECT id FROM listings WHERE user_id = ? AND id != ? AND status IN ('active', 'pending') AND lower(title) = lower(?) LIMIT 1`)
      .get(l.user_id, l.id, l.title);
    const hashes = db.prepare('SELECT hash FROM uploads WHERE listing_id = ? AND hash != \'\'').all(l.id).map((r) => r.hash);
    let ownPhoto = null; let otherPhoto = null;
    if (hashes.length) {
      const rows = db.prepare(`SELECT u.hash, x.id, x.user_id, x.status, owner.name FROM uploads u
        JOIN listings x ON x.id = u.listing_id JOIN users owner ON owner.id = x.user_id
        WHERE u.hash != '' AND x.id != ? AND x.status != 'rejected'`).all(l.id);
      for (const r of rows) {
        if (!hashes.some((h) => distance(h, r.hash) <= PHOTO_DISTANCE)) continue;
        if (r.user_id === l.user_id) { if (!ownPhoto && ['active', 'pending'].includes(r.status)) ownPhoto = r; } else if (!otherPhoto) otherPhoto = r;
        if (ownPhoto && otherPhoto) break;
      }
    }
    const dup = sameTitle ? sameTitle.id : ownPhoto ? ownPhoto.id : null;
    if (dup) out.push({ kind: 'duplicate', text: `Похоже на повтор объявления автора № ${dup}${sameTitle ? ' (то же название)' : ' (то же фото)'}`, ref: dup });
    if (otherPhoto) out.push({ kind: 'photo', text: `Такое же фото у другого продавца — ${otherPhoto.name}, объявление № ${otherPhoto.id}`, ref: otherPhoto.id });
    return out;
  }

  // Проверить объявление и сохранить замечания. Возвращает список.
  function run(listingId) {
    const l = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
    if (!l) return [];
    const found = [...repeats(l), ...priceCheck(l), ...contactsIn(l)];
    db.prepare('UPDATE listings SET checks = ? WHERE id = ?').run(found.length ? JSON.stringify(found) : '', listingId);
    return found;
  }

  const parse = (s) => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

  return { run, parse };
};

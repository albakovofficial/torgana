'use strict';
// 1.48.0: «Хорошая цена» — цена ниже, чем у похожих активных объявлений на Торгане.
// Похожие считаем только там, где их можно честно сравнить по характеристикам:
//   машины — та же марка, модель и год; мотоциклы — модель и год; телефоны — марка, модель, память и состояние;
//   квартиры и комнаты на продажу — тот же город и число комнат, сравниваем цену за м²;
//   аренда и посуточно — тот же город, число комнат и «за что цена».
// Нужно хотя бы 3 других объявления. «Хорошая» — от 15 до 50% ниже средней (медианы); ещё дешевле — не хвалим:
// слишком низкая цена бывает у мошенников. Пересчёт — при запуске и раз в 20 минут (поле listings.good_price, в %).

const GOOD_FROM = 0.85; // цена ниже 85% медианы
const GOOD_TO = 0.5; // но не ниже половины
const MIN_OTHERS = 3;

const low = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

// Ключ группы похожих и сравниваемая величина (цена или цена за м²). null — раздел не сравниваем.
function groupOf(r) {
  let a = {};
  try { a = JSON.parse(r.attrs || '{}') || {}; } catch { /* пусто */ }
  const unit = r.price_unit || '';
  const city = low(r.city);
  switch (r.subcategory) {
    case 'cars': return a.brand && a.model && a.year ? { key: `cars|${low(a.brand)}|${low(a.model)}|${a.year}`, value: r.price, basis: 'та же марка, модель и год' } : null;
    case 'moto': return a.model && a.year ? { key: `moto|${low(a.model)}|${a.year}`, value: r.price, basis: 'та же модель и год' } : null;
    case 'phones': return a.brand && a.model && a.memory ? { key: `phones|${low(a.brand)}|${low(a.model)}|${a.memory}|${r.condition || ''}`, value: r.price, basis: 'та же модель, память и состояние' } : null;
    case 'flats': return a.rooms && a.area > 0 && !unit ? { key: `flats|${city}|${a.rooms}`, value: r.price / a.area, perM2: true, basis: 'тот же город и число комнат, цена за м²' } : null;
    case 'rooms': return a.area > 0 && !unit ? { key: `rooms|${city}`, value: r.price / a.area, perM2: true, basis: 'комнаты в том же городе, цена за м²' } : null;
    case 'flats_rent': return a.rooms ? { key: `rent|${city}|${a.rooms}|${unit}`, value: r.price, basis: 'тот же город и число комнат' } : null;
    case 'daily': return a.rooms ? { key: `daily|${city}|${a.rooms}|${unit}`, value: r.price, basis: 'тот же город и число комнат' } : null;
    default: return null;
  }
}

function median(nums) {
  const s = [...nums].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Сравнение одного объявления с остальными в группе (без него самого).
function compare(value, others) {
  if (others.length < MIN_OTHERS) return null;
  const med = median(others);
  if (!(med > 0)) return null;
  const ratio = value / med;
  const pct = Math.round((1 - ratio) * 100);
  return { median: med, count: others.length, ratio, pct, good: ratio <= GOOD_FROM && ratio >= GOOD_TO };
}

module.exports = function goodPrice({ db }) {
  const SUBS = ['cars', 'moto', 'phones', 'flats', 'rooms', 'flats_rent', 'daily'];
  const rowsSql = `SELECT l.id, l.subcategory, l.attrs, l.city, l.price, l.price_unit, l.condition FROM listings l JOIN users u ON u.id = l.user_id
    WHERE l.status = 'active' AND u.is_blocked = 0 AND l.price > 0 AND l.subcategory IN (${SUBS.map(() => '?').join(',')})`;

  function recompute() {
    const groups = new Map();
    for (const r of db.prepare(rowsSql).all(...SUBS)) {
      const g = groupOf(r);
      if (!g) continue;
      if (!groups.has(g.key)) groups.set(g.key, []);
      groups.get(g.key).push({ id: r.id, value: g.value });
    }
    const good = new Map();
    for (const list of groups.values()) {
      if (list.length <= MIN_OTHERS) continue;
      for (const it of list) {
        const c = compare(it.value, list.filter((x) => x !== it).map((x) => x.value));
        if (c && c.good) good.set(it.id, Math.max(1, c.pct));
      }
    }
    const cur = db.prepare('SELECT id, good_price FROM listings WHERE good_price != 0').all();
    const was = new Map(cur.map((r) => [r.id, r.good_price]));
    const set = db.prepare('UPDATE listings SET good_price = ? WHERE id = ?');
    db.exec('BEGIN');
    try {
      for (const r of cur) if (!good.has(r.id)) set.run(0, r.id);
      for (const [id, pct] of good) if (was.get(id) !== pct) set.run(pct, id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return good.size;
  }

  // Для страницы объявления: средняя цена похожих, на сколько дешевле/дороже и по какому признаку сравнивали.
  function estimate(l) {
    if (!(l.price > 0)) return null;
    const g = groupOf(l);
    if (!g) return null;
    const others = [];
    // Только тот же раздел и главный признак (год, память, город) — чтобы не перебирать всё.
    let a = {};
    try { a = JSON.parse(l.attrs || '{}') || {}; } catch { /* пусто */ }
    const narrow = ['cars', 'moto'].includes(l.subcategory) ? ["AND json_extract(l.attrs, '$.year') = ?", a.year]
      : l.subcategory === 'phones' ? ["AND json_extract(l.attrs, '$.memory') = ?", a.memory] : ['AND l.city_lc = ?', l.city_lc || ''];
    for (const r of db.prepare(`${rowsSql} AND l.subcategory = ? ${narrow[0]} AND l.id != ?`).all(...SUBS, l.subcategory, narrow[1], l.id)) {
      const x = groupOf(r);
      if (x && x.key === g.key) others.push(x.value);
    }
    const c = compare(g.value, others);
    if (!c) return null;
    return { ...c, perM2: !!g.perM2, basis: g.basis, median: Math.round(c.median) };
  }

  setTimeout(() => { try { recompute(); } catch (e) { console.error('good price:', e.message); } }, 3000).unref();
  setInterval(() => { try { recompute(); } catch (e) { console.error('good price:', e.message); } }, Number(process.env.GOOD_PRICE_TICK_MS) || 20 * 60 * 1000).unref();
  return { recompute, estimate, groupOf };
};
module.exports.groupOf = groupOf;
module.exports.compare = compare;

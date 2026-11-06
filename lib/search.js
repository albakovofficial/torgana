'use strict';

const { CITIES } = require('./constants');

function norm(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

const STOP = new Set(['до', 'от', 'с', 'со', 'в', 'во', 'на', 'и', 'для', 'по', 'за', 'руб', 'рублей', 'рубля', 'р', '₽', 'тыс', 'тысяч', 'доставкой', 'доставка', 'недорого', 'дешево', 'купить', 'продам', 'продаю', 'бу', 'б/у']);

const CITY_STEMS = CITIES.map((c) => ({ city: c, stem: norm(c).slice(0, Math.max(4, Math.min(6, norm(c).length - 1))) }));

function toNumber(raw, suffix) {
  let n = parseInt(String(raw).replace(/\s/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  if (suffix && /^(тыс|к|k)/.test(suffix)) n *= 1000;
  if (suffix && /^(млн|m)/.test(suffix)) n *= 1000000;
  return n;
}

// Разбирает запрос «обычными словами»: «коляска до 10 000 с доставкой в Казани».
function parseQuery(q) {
  let text = norm(q);
  const out = { words: [], min: null, max: null, delivery: false, city: null };
  if (!text) return out;

  const priceRe = /(до|от)\s*(\d[\d ]*\d|\d)\s*(тыс\.?|тысяч|к|k|млн|m)?/g;
  text = text.replace(priceRe, (m, dir, num, suf) => {
    const n = toNumber(num, suf);
    if (n != null) { if (dir === 'до') out.max = n; else out.min = n; }
    return ' ';
  });

  if (/с доставк|доставк/.test(text)) {
    out.delivery = true;
    text = text.replace(/с доставк\S*|доставк\S*/g, ' ');
  }

  for (const { city, stem } of CITY_STEMS) {
    const re = new RegExp(`(^|\\s)(в |во )?${stem}\\S*`);
    if (re.test(text)) {
      out.city = city;
      text = text.replace(re, ' ');
      break;
    }
  }

  out.words = text.split(/[\s,.;:!?()"«»]+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .slice(0, 6)
    .map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w)); // грубое отсечение окончаний
  return out;
}

module.exports = { norm, parseQuery };

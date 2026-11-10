'use strict';

const { CITIES } = require('./constants');
const { SUB } = require('./taxonomy');

function norm(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

// Русские написания латинских марок (1.35.1): «лада», «айфон», «самсунг» находят Lada, iPhone, Samsung.
// Добавляются к тексту объявления при сохранении (searchText в server.js), запрос не меняется.
const BRAND_RU = {
  lada: 'лада', kia: 'киа', toyota: 'тойота', hyundai: 'хендай хундай хенде', volkswagen: 'фольксваген', skoda: 'шкода', renault: 'рено', nissan: 'ниссан',
  mercedes: 'мерседес', 'mercedes-benz': 'мерседес', bmw: 'бмв', audi: 'ауди', chery: 'чери', haval: 'хавал', geely: 'джили', changan: 'чанган', mitsubishi: 'митсубиси мицубиси',
  mazda: 'мазда', ford: 'форд', chevrolet: 'шевроле', honda: 'хонда', lexus: 'лексус', subaru: 'субару', volvo: 'вольво', porsche: 'порше', suzuki: 'сузуки', peugeot: 'пежо',
  citroen: 'ситроен', opel: 'опель', daewoo: 'дэу', exeed: 'эксид', omoda: 'омода', jetour: 'джетур', zeekr: 'зикр', tesla: 'тесла', 'land rover': 'ленд ровер',
  apple: 'эпл', iphone: 'айфон', ipad: 'айпад', macbook: 'макбук', airpods: 'эирподс аирподс', samsung: 'самсунг', galaxy: 'галакси', xiaomi: 'сяоми ксиаоми', redmi: 'редми',
  huawei: 'хуавей', honor: 'хонор', realme: 'реалми', poco: 'поко', tecno: 'текно', playstation: 'плейстейшн', ps5: 'пс5', xbox: 'иксбокс', nintendo: 'нинтендо',
  asus: 'асус', lenovo: 'леново', acer: 'асер', dyson: 'дайсон', bosch: 'бош', nike: 'найк', adidas: 'адидас', puma: 'пума', zara: 'зара', uniqlo: 'юникло', levi: 'левис'
};
function brandAliases(text) {
  const t = norm(text);
  return Object.keys(BRAND_RU).filter((b) => new RegExp(`(^|[^a-z])${b.replace('-', '\\-')}([^a-z]|$)`).test(t)).map((b) => BRAND_RU[b]).join(' ');
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

// 1.43.0: исправление опечаток, когда по запросу ничего не нашлось. vocab — Map «слово → в скольких объявлениях»
// (слова из текстов опубликованных объявлений). Слово не из словаря заменяется ближайшим: 1 правка для 4–5 букв,
// 2 — для 6+ (замена, вставка, удаление, перестановка соседних букв); при равенстве — более частое. Числа не трогаем.
function editDistance(a, b, max) {
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
function correctQuery(q, vocab) {
  let changed = false;
  const fixed = norm(q).split(' ').map((p) => {
    if (!/^[a-zа-я]{4,}$/.test(p) || vocab.has(p) || STOP.has(p)) return p;
    const max = p.length <= 5 ? 1 : 2;
    let best = null; let bestD = max + 1; let bestN = 0;
    for (const [w, n] of vocab) {
      if (Math.abs(w.length - p.length) > max) continue;
      const d = editDistance(p, w, max);
      if (d <= max && (d < bestD || (d === bestD && n > bestN))) { best = w; bestD = d; bestN = n; }
    }
    if (!best) return p;
    changed = true;
    return best;
  }).join(' ');
  return changed ? fixed : null;
}

// Поиск в одном виде — для выдачи, блока «Реклама» и карты (SQL).
// params: { q, category, city, min, max, delivery, bargain, exchange, user } — как в адресе /search.
function searchSpec(params, categoryIds) {
  const parsed = parseQuery(params.q || '');
  // Числа из адреса и фильтров: «1 000 000», «2,5» — пробелы (и неразрывные) убираем, запятую считаем точкой.
  const clean = (v) => (v === undefined || v === null ? '' : String(v).replace(/[\s\u00a0]/g, '').replace(',', '.'));
  const num = (v, fallback) => { const t = clean(v); const n = t === '' ? NaN : parseInt(t, 10); return Number.isFinite(n) ? n : fallback; };
  const dec = (v, fallback) => { const t = clean(v); const n = t === '' ? NaN : Number(t); return Number.isFinite(n) ? n : fallback; };
  const city = params.city || parsed.city || '';
  const category = categoryIds.has(params.category) ? params.category : '';
  const sub = SUB[params.sub] && (!category || SUB[params.sub].category === category) ? params.sub : '';
  // Характеристики: a_<ключ>=значение (список) или a_<ключ>_min / a_<ключ>_max (число).
  const attrs = [];
  if (sub) {
    for (const f of SUB[sub].fields) {
      if (f.type === 'select') {
        const v = params[`a_${f.key}`];
        if (v && (f.options.includes(String(v)) || (f.custom && f.custom.min === 0 && String(v) === '0'))) attrs.push({ key: f.key, eq: String(v) });
        // 1.47.3: у полей с точным числом («Владельцев по ПТС») в фильтре ещё «N+» — от N (и старое «4+»).
        else if (v && f.custom && String(v) === `${f.options.length + 1}+`) attrs.push({ key: f.key, gte: f.options.length + 1, legacy: String(v) });
      } else if (f.type === 'number') {
        const lo = dec(params[`a_${f.key}_min`], null); const hi = dec(params[`a_${f.key}_max`], null);
        if (lo !== null || hi !== null) attrs.push({ key: f.key, min: lo, max: hi });
      }
    }
  }
  return {
    words: parsed.words,
    category: sub ? SUB[sub].category : category,
    sub,
    attrs,
    metro: String(params.metro || '').trim().slice(0, 60),
    city: city ? norm(city) : '',
    min: num(params.min, parsed.min),
    max: num(params.max, parsed.max),
    delivery: String(params.delivery) === '1' || params.delivery === true || parsed.delivery,
    bargain: String(params.bargain) === '1' || params.bargain === true,
    exchange: String(params.exchange) === '1' || params.exchange === true,
    user: num(params.user, null),
    trusted: String(params.trusted) === '1', // 1.46.0: «Надёжные продавцы» — уровень репутации от «Надёжного»
    parsed
  };
}

// Условие для SQL по полям listings l.
// 1.43.0: слово из 3+ букв — по триграммному индексу listings_fts (lib/db.js). fts = false — прямым сравнением:
// так быстрее, когда совпадений тысячи (просмотр по дате останавливается на первой странице).
function specSql(spec, { fts = true } = {}) {
  const where = []; const args = [];
  for (const w of spec.words) { where.push(fts && w.length >= 3 ? 'l.id IN (SELECT rowid FROM listings_fts WHERE search_text LIKE ?)' : 'l.search_text LIKE ?'); args.push(`%${w}%`); }
  if (spec.category) { where.push('l.category = ?'); args.push(spec.category); }
  if (spec.sub) { where.push('l.subcategory = ?'); args.push(spec.sub); }
  for (const a of spec.attrs || []) {
    const path = `$.${a.key}`;
    if (a.eq !== undefined) { where.push('json_extract(l.attrs, ?) = ?'); args.push(path, a.eq); }
    if (a.gte !== undefined) { where.push('(CAST(json_extract(l.attrs, ?) AS INTEGER) >= ? OR json_extract(l.attrs, ?) = ?)'); args.push(path, a.gte, path, a.legacy); }
    if (Number.isFinite(a.min)) { where.push('json_extract(l.attrs, ?) >= ?'); args.push(path, a.min); }
    if (Number.isFinite(a.max)) { where.push('json_extract(l.attrs, ?) <= ?'); args.push(path, a.max); }
  }
  if (spec.metro) { where.push('l.metro = ?'); args.push(spec.metro); }
  if (spec.city) { where.push('l.city_lc = ?'); args.push(spec.city); }
  if (Number.isFinite(spec.min)) { where.push('l.price >= ?'); args.push(spec.min); }
  if (Number.isFinite(spec.max)) { where.push('l.price <= ?'); args.push(spec.max); }
  if (spec.delivery) where.push('l.delivery = 1');
  if (spec.bargain) where.push('l.bargain = 1 AND l.price IS NOT NULL');
  if (spec.exchange) where.push('l.exchange = 1');
  if (Number.isFinite(spec.user)) { where.push('l.user_id = ?'); args.push(spec.user); }
  if (spec.trusted) where.push('u.rep_level >= 1'); // во всех запросах выдачи users подключён как u
  return { where, args };
}

module.exports = { brandAliases, norm, parseQuery, searchSpec, specSql, correctQuery };

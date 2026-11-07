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

// Поиск в одном виде — и для выдачи (SQL), и для сохранённых поисков (проверка нового объявления).
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
        if (v && f.options.includes(String(v))) attrs.push({ key: f.key, eq: String(v) });
      } else {
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
    parsed
  };
}

// Условие для SQL по полям listings l.
function specSql(spec) {
  const where = []; const args = [];
  for (const w of spec.words) { where.push('l.search_text LIKE ?'); args.push(`%${w}%`); }
  if (spec.category) { where.push('l.category = ?'); args.push(spec.category); }
  if (spec.sub) { where.push('l.subcategory = ?'); args.push(spec.sub); }
  for (const a of spec.attrs || []) {
    const path = `$.${a.key}`;
    if (a.eq !== undefined) { where.push('json_extract(l.attrs, ?) = ?'); args.push(path, a.eq); }
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
  return { where, args };
}

// То же условие для одной строки listings (без запроса в базу) — те же правила, что в specSql.
function specMatches(spec, l) {
  let attrs = {};
  try { attrs = JSON.parse(l.attrs || '{}') || {}; } catch { attrs = {}; }
  const attrOk = (spec.attrs || []).every((a) => {
    const v = attrs[a.key];
    if (a.eq !== undefined) return v === a.eq;
    if (v === undefined || v === null) return false;
    return (!Number.isFinite(a.min) || v >= a.min) && (!Number.isFinite(a.max) || v <= a.max);
  });
  return attrOk
    && (!spec.sub || l.subcategory === spec.sub)
    && (!spec.metro || l.metro === spec.metro)
    && spec.words.every((w) => l.search_text.includes(w))
    && (!spec.category || l.category === spec.category)
    && (!spec.city || l.city_lc === spec.city)
    && (!Number.isFinite(spec.min) || (l.price !== null && l.price >= spec.min))
    && (!Number.isFinite(spec.max) || (l.price !== null && l.price <= spec.max))
    && (!spec.delivery || !!l.delivery)
    && (!spec.bargain || (!!l.bargain && l.price !== null))
    && (!spec.exchange || !!l.exchange)
    && (!Number.isFinite(spec.user) || l.user_id === spec.user);
}

module.exports = { brandAliases, norm, parseQuery, searchSpec, specSql, specMatches };

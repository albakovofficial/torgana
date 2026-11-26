// Правила, общие с сервером: название из характеристик, слова в карточке, предупреждения в чате, адреса с названием.
// Без обращений к странице — тесты Node подключают этот модуль напрямую.
// 1.48.0: название из характеристик — свой стиль Торганы: короткие части через «·», полными словами
// (вариант B владельца): «Toyota Camry · 2018 · автомат», «Квартира · 2 комнаты · 54,5 м²». Тот же код — в lib/taxonomy.js (тест сверяет).
export const TITLE_SUBS = new Set(['cars', 'moto', 'phones', 'flats', 'flats_rent', 'daily', 'rooms', 'houses', 'land', 'garages', 'commercial']);
export function autoTitle(sub, a) {
  if (!TITLE_SUBS.has(sub) || !a) return '';
  const n = (v) => (Math.abs(Number(v)) >= 10000 ? new Intl.NumberFormat('ru-RU').format(v) : String(v).replace('.', ','));
  const has = (k) => a[k] !== undefined && a[k] !== null && a[k] !== '';
  const dot = (...xs) => xs.filter(Boolean).join('\u00a0· '); // точка не переносится в начало строки
  const pl = (v, one, few, many) => { const x = Number(v); if (!Number.isInteger(x)) return few; const d = x % 10; const h = x % 100; return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many; };
  const rooms = () => (a.rooms === 'Студия' ? '' : a.rooms === '5+' ? '5\u00a0и больше комнат' : `${a.rooms}\u00a0${pl(a.rooms, 'комната', 'комнаты', 'комнат')}`);
  const flat = () => (a.rooms === 'Студия' ? 'Квартира-студия' : 'Квартира');
  const named = (brand, model, skip) => {
    if (!model) return '';
    const m = String(model);
    if (!brand || skip || m.toLowerCase().startsWith(String(brand).toLowerCase())) return m;
    return `${brand} ${m}`;
  };
  if (sub === 'cars') {
    if (!has('brand') || !has('model') || !has('year')) return '';
    return dot(named(a.brand, a.model, a.brand === 'Другая'), String(a.year), has('gearbox') ? String(a.gearbox).toLowerCase() : '');
  }
  if (sub === 'moto') {
    if (!has('motoType') || !has('model') || !has('year')) return '';
    return dot([a.motoType === 'Мотоцикл' ? '' : a.motoType, a.model].filter(Boolean).join(' '), String(a.year));
  }
  if (sub === 'phones') {
    if (!has('brand') || !has('model') || !has('memory')) return '';
    return dot(named(a.brand, a.model, a.brand === 'Другой' || (a.brand === 'Apple' && /^iphone/i.test(a.model))), a.memory);
  }
  if (sub === 'flats' || sub === 'flats_rent') return has('rooms') && has('area') ? dot(flat(), rooms(), `${n(a.area)}\u00a0м²`) : '';
  if (sub === 'daily') return has('rooms') && has('guests') ? dot(flat(), rooms(), `до ${a.guests}\u00a0${pl(a.guests, 'гостя', 'гостей', 'гостей')}`) : '';
  if (sub === 'rooms') return has('area') ? dot('Комната', `${n(a.area)}\u00a0м²`) : '';
  if (sub === 'houses') return has('houseType') && has('area') ? dot(a.houseType, `${n(a.area)}\u00a0м²`, Number(a.land) > 0 ? `${n(a.land)}\u00a0${pl(a.land, 'сотка', 'сотки', 'соток')}` : '') : '';
  if (sub === 'land') {
    if (!has('land')) return '';
    const use = { ИЖС: 'ИЖС', 'СНТ, ДНП': 'СНТ, ДНП', Сельхозназначение: 'сельхозназначение', Промназначение: 'промназначение' }[a.landUse];
    return dot('Участок', `${n(a.land)}\u00a0${pl(a.land, 'сотка', 'сотки', 'соток')}`, use || '');
  }
  if (sub === 'garages') return has('garageType') ? dot(a.garageType, has('area') ? `${n(a.area)}\u00a0м²` : '') : '';
  if (sub === 'commercial') {
    if (!has('commType') || !has('area')) return '';
    const t = { Торговое: 'Торговое помещение', Производство: 'Производственное помещение', Общепит: 'Помещение под общепит', 'Свободное назначение': 'Помещение свободного назначения' }[a.commType] || a.commType;
    return dot(t, `${n(a.area)}\u00a0м²`);
  }
  return '';
}
// Слова для строки в карточке: «Седан, бензин, передний привод» (то же — в lib/taxonomy.js).
export const CARD_WORDS = {
  fuel: { Бензин: 'бензин', Дизель: 'дизель', Гибрид: 'гибрид', Электро: 'электро', Газ: 'газ' },
  drive: { Передний: 'передний привод', Задний: 'задний привод', Полный: 'полный привод' },
  body: { Седан: 'седан', Хэтчбек: 'хэтчбек', Универсал: 'универсал', Внедорожник: 'внедорожник', Кроссовер: 'кроссовер', Лифтбек: 'лифтбек', Купе: 'купе', Минивэн: 'минивэн', Пикап: 'пикап', Фургон: 'фургон' },
  market: { Вторичка: 'вторичка', Новостройка: 'новостройка' },
  renovation: { 'Без ремонта': 'без ремонта', Косметический: 'косметический ремонт', Евро: 'евроремонт', Дизайнерский: 'дизайнерский ремонт' },
  house: { Панельный: 'панельный дом', Кирпичный: 'кирпичный дом', Монолитный: 'монолитный дом', Блочный: 'блочный дом', Деревянный: 'деревянный дом' },
  furnished: { Есть: 'с мебелью', Частично: 'частично с мебелью', Нет: 'без мебели' },
  pets: { Да: 'можно с животными', Нет: 'без животных' },
  wall: { Кирпич: 'кирпич', 'Брус, бревно': 'брус или бревно', Газоблок: 'газоблок', Каркас: 'каркас', Монолит: 'монолит', Другой: '' },
  battery: { 'Больше 90%': 'аккумулятор больше 90%', '80–90%': 'аккумулятор 80–90%', 'Меньше 80%': 'аккумулятор меньше 80%' },
  color: null
};
// Понятные адреса: /l/123-velosiped-stels, /c/hobby/kazan (то же правило — в lib/seo.js).
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const slugify = (s) => String(s || '').toLowerCase().split('').map((c) => (TR[c] !== undefined ? TR[c] : c)).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');

// ================= VIN =================
// 1.48.0: VIN — 17 знаков без I, O, Q; номер кузова (праворульные из Японии) — 6–17 латинских букв, цифр и дефисов, есть цифры.
// Набрали в русской раскладке — меняем похожие буквы на латинские; в 17-значном VIN нет O, Q и I — это 0 и 1.
// То же правило — в lib/taxonomy.js (тест сверяет).
const VIN_LAT = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };
export const vinNorm = (v) => { let t = String(v || '').toUpperCase().replace(/\s/g, '').replace(/[АВЕКМНОРСТХУ]/g, (c) => VIN_LAT[c]); if (t.length === 17) t = t.replace(/O|Q/g, '0').replace(/I/g, '1'); return t; };
export const vinOk = (v) => (v.length === 17 ? /^[A-HJ-NPR-Z0-9]{17}$/.test(v) : /^[A-Z0-9-]{6,17}$/.test(v) && /\d{4}/.test(v));

// ================= сообщения =================
// 1.48.0: предупреждения под сообщением собеседника — ссылка на другой сайт, номер карты, предоплата, мессенджер, коды.
const luhn = (d) => { let sum = 0; for (let i = 0; i < d.length; i++) { let n = Number(d[d.length - 1 - i]); if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; } return sum % 10 === 0; };
const hasCard = (t) => (String(t).match(/(?:\d[ \-]?){15,18}\d/g) || []).some((m) => { const d = m.replace(/\D/g, ''); return d.length >= 16 && d.length <= 19 && luhn(d); });
const LINK_RE = /(?:https?:\/\/|www\.)[^\s]+|(?:^|[\s(])([a-z0-9][a-z0-9-]*\.)+(?:ru|рф|com|net|org|su|info|site|online|store|shop|xyz|top|link|app|pro|me|io|cc|biz|club|live|website|space)(?:\/[^\s]*)?(?=$|[\s),.!?])/i;
const hasLink = (t) => { const m = String(t).match(new RegExp(LINK_RE.source, 'gi')) || []; return m.some((x) => !/(^|[\s(/.])torgana\.ru/i.test(x.trim())); };
const RISKS = [
  ['code', /(код[а-я]* из (смс|sms)|смс[- ]?код|cvv|cvc|срок действия карты|код с обратной стороны)/i, 'Никому не называйте коды из СМС и данные карты — даже тем, кто представляется поддержкой или банком.'],
  ['link', null, 'Ссылка ведёт на другой сайт. Не вводите там данные карты и коды из СМС — так крадут деньги. Оплата «по ссылке» от продавца — частая уловка.'],
  ['card', null, 'В сообщении номер карты. Не переводите деньги, пока не увидели и не проверили товар: вернуть перевод почти невозможно.'],
  ['prepay', /(предоплат|аванс|задат(ок|ка)|переве(ди|дите|сти)|скинь(те)?( мне)? (деньги|на карт)|перевод(ом)? на карт|оплат(ите|и) (заранее|доставку|сначала)|ссылк[ауи] на оплату|оплат[аиу] по ссылке)/i, 'Просят деньги заранее? Безопаснее платить при встрече, когда увидите и проверите товар.'],
  ['messenger', /(telegram|телеграм|\btg\b|whats\s?app|ватсап|вотсап|вацап|viber|вайбер|t\.me|wa\.me|max\.ru|напиши(те)? (мне )?в (тг|телегу|вотс|ватс|макс))/i, 'Предлагают перейти в мессенджер? Оставайтесь в чате Торганы — переписка сохранится, и мы сможем помочь при споре.']
];
export const riskOf = (t) => {
  if (!t) return null;
  for (const [k, re, text] of RISKS) if (k === 'link' ? hasLink(t) : k === 'card' ? hasCard(t) : re.test(t)) return { k, text };
  return null;
};

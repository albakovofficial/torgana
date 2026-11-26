// Основа: html-шаблоны с экранированием, запрос к API, цены и даты, разделы и характеристики, адреса страниц, состояние S.
import { CARD_WORDS, slugify } from './rules.js';

// 1.56.0: приложение Торгана для iPhone (репозиторий torgana-ios) открывает сайт внутри себя и даёт мост
// window.TorganaApp. В приложении нет оплаты — ни продвижения, ни тарифов, ни раздела «Для бизнеса»
// (правило App Store 3.1.1: цифровое — только через покупки Apple, а они в России не работают);
// купленное на сайте работает и в приложении. Push — свои, через Apple. Установки сайта на экран «Домой» больше нет.
export const NATIVE = !!window.TorganaApp || /TorganaApp\//.test(navigator.userAgent);
export const PAY = !NATIVE;
export const nativePost = (msg) => { try { window.TorganaApp.post(msg); return true; } catch { return false; } };

// ================= утилиты =================
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const fmtVal = (v) => {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmtVal).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
};
export const html = (strings, ...vals) => {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += fmtVal(vals[i]); });
  return new Raw(out);
};
export const raw = (s) => new Raw(s);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const app = $('#app');

export async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  let data = {};
  try { data = await r.json(); } catch { /* пусто */ }
  if (!r.ok) {
    const e = new Error(data.error || 'Нет связи с сервером. Проверьте интернет.');
    e.status = r.status;
    e.data = data;
    throw e;
  }
  return data;
}

export const NF = new Intl.NumberFormat('ru-RU');
export function price(p, unit) {
  if (p === null || p === undefined) return 'Цена договорная';
  return `${NF.format(p)} ₽${unit ? ` / ${unit}` : ''}`;
}
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function when(ts) {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `сегодня в ${hm}`;
  if (diff === 1) return `вчера в ${hm}`;
  if (diff < 7) return `${diff} ${plural(diff, 'день', 'дня', 'дней')} назад`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}
export const shortWhen = (ts) => when(ts).replace(/ в \d\d:\d\d$/, '');
export const since = (ts) => { const d = new Date(ts); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const hm = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();
// Аватарка: фото профиля или первая буква имени на изумрудном круге. cls — sm | lg | xl.
export const ava = (u, cls = '') => html`<span class="avatar ${cls}">${u && u.avatar ? html`<img src="${u.avatar}" alt="" loading="lazy">` : initial(u && u.name)}</span>`;

// ================= состояние =================
export const S = {
  config: { categories: [], cities: [], ai: false, payments: false, mail: false, supportEmail: '', priceUnits: [''] },
  user: null,
  unread: 0,
  city: localStorage.getItem('tg_city') || ''
};
export const catName = (id) => (S.config.categories.find((c) => c.id === id) || {}).name || '';
// Подкатегории и характеристики (справочник с сервера, lib/taxonomy.js) — те же правила показа, что на сервере.
export const subsOf = (cat) => (S.config.subcategories || {})[cat] || [];
export const subOf = (id) => { for (const list of Object.values(S.config.subcategories || {})) { const x = list.find((s) => s.id === id); if (x) return x; } return null; };
export const subName = (id) => (subOf(id) || {}).name || '';
export const attrNum = (v) => (Math.abs(Number(v)) >= 10000 ? NF.format(v) : String(v).replace('.', ','));
export function attrText(f, v) {
  if (v === undefined || v === null || v === '') return '';
  if (f.key === 'rooms') return v === 'Студия' ? 'студия' : `${v}-комн.`;
  if (f.key === 'floor') return `${v} этаж`;
  if (f.key === 'guests') return `до ${v} ${Number(v) % 10 === 1 && Number(v) % 100 !== 11 ? 'гостя' : 'гостей'}`;
  if (f.key === 'shoeSize') return `${v} размер`;
  if (f.key === 'size') return `размер ${v}`;
  if (f.key === 'year') return `${v} г.`;
  if (f.key === 'owners') { if (String(v) === '4+') return '4 и более владельцев'; if (String(v) === '0') return 'нет владельцев, новая'; const n = Number(v); const a = n % 10; const b = n % 100; return `${n} ${a === 1 && b !== 11 ? 'владелец' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'владельца' : 'владельцев'}`; }
  if (CARD_WORDS[f.key] && v in CARD_WORDS[f.key]) return CARD_WORDS[f.key][v];
  if (f.key === 'floors') { const n = Number(v); return `${v} ${n % 10 === 1 && n % 100 !== 11 ? 'этаж' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'этажа' : 'этажей'}`; }
  if (f.type === 'number') return `${attrNum(v)}${f.unit ? ` ${f.unit}` : ''}`;
  return String(v);
}
// В карточке: у разделов с названием из характеристик — то, чего нет в названии (card), как на сервере.
export const attrSummary = (subId, attrs) => {
  const x = subOf(subId);
  if (!x || !attrs) return '';
  const line = (x.card || x.summary).map((k) => { const f = x.fields.find((y) => y.key === k); if (!f) return ''; if (x.card && k === 'floor' && attrs.floor !== undefined && attrs.floors !== undefined) return `${attrs.floor} этаж из ${attrs.floors}`; return attrText(f, attrs[k]); }).filter(Boolean).join(', ');
  return line ? line[0].toUpperCase() + line.slice(1) : '';
};
const metroKey = (c) => String(c || '').toLowerCase().replace(/ё/g, 'е').trim();
export const hasMetro = (city) => (S.config.metroCities || []).includes(metroKey(city));
const metroCache = {};
export const metroOf = async (city) => { const k = metroKey(city); if (!metroCache[k]) metroCache[k] = api('GET', `/api/metro?city=${encodeURIComponent(city)}`).then((r) => r.stations).catch(() => []); return metroCache[k]; };
export const lpath = (it) => `/l/${it.id}${slugify(it.title) ? `-${slugify(it.title)}` : ''}`;
export const cpath = (cat, city) => `/c/${cat}${city && S.config.cities.includes(city) ? `/${slugify(city)}` : ''}`;
export const CONDITION_CATS = new Set(['transport', 'electronics', 'personal', 'home', 'hobby', 'business']);
export const CONDITION_LABEL = { new: 'Новое', used: 'Б/у', '': 'Не указано' };
export const rub = (n) => `${NF.format(n)} ₽`;
export const dateLong = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.$/, ''); // «9 ноября 2031» — без «г.», иначе «г..» в конце фразы
export const dateShort = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

'use strict';
/* Торгана — клиентское приложение (одностраничное, без зависимостей). */
(() => {
  // ================= утилиты =================
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const fmtVal = (v) => {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(fmtVal).join('');
    if (v === null || v === undefined || v === false) return '';
    return esc(v);
  };
  const html = (strings, ...vals) => {
    let out = '';
    strings.forEach((s, i) => { out += s; if (i < vals.length) out += fmtVal(vals[i]); });
    return new Raw(out);
  };
  const raw = (s) => new Raw(s);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const app = $('#app');

  async function api(method, url, body) {
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

  const NF = new Intl.NumberFormat('ru-RU');
  function price(p, unit) {
    if (p === null || p === undefined) return 'Цена договорная';
    return `${NF.format(p)} ₽${unit ? ` / ${unit}` : ''}`;
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function when(ts) {
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
  const shortWhen = (ts) => when(ts).replace(/ в \d\d:\d\d$/, '');
  const since = (ts) => { const d = new Date(ts); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const hm = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();
  // Аватарка: фото профиля или первая буква имени на изумрудном круге. cls — sm | lg | xl.
  const ava = (u, cls = '') => html`<span class="avatar ${cls}">${u && u.avatar ? html`<img src="${u.avatar}" alt="" loading="lazy">` : initial(u && u.name)}</span>`;

  // ================= иконки =================
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    camera: '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    truck: '<rect x="2" y="7" width="13" height="10" rx="1.5"/><path d="M15 10h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="18" cy="18" r="1.8"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v6h14v-6"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 15l-5-5-8 9"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    more: '<circle cx="5" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="19" cy="12" r=".9"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    chart: '<path d="M4 20V11M10 20V5M16 20v-6M22 20H2"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
    headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.6 3.6-5.5 6.5-5.5s5.5 1.9 6.5 5.5"/><path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6M17.5 14.8c2 .7 3.4 2.4 4 5.2"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.6"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
    store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v1.5a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 10.5z"/><path d="M5.5 13v7h13v-7"/><path d="M10 20v-4h4v4"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l7 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M17.5 9a4 4 0 0 1 0 6"/><path d="M7.5 15l1.2 4.5"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.4"/>',
    feed: '<path d="M5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    xl: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M14 5v14M14 12h7"/>',
    frame: '<rect x="4" y="4" width="16" height="16" rx="4"/><rect x="7.5" y="7.5" width="9" height="9" rx="2"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'
  };
  const CAT_P = {
    transport: '<path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4H3z"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/>',
    realty: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    jobs: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 13h18"/>',
    services: '<path d="M15 4a4 4 0 0 0-3.8 5.2L4 16.4V20h3.6l7.2-7.2A4 4 0 1 0 15 4z"/>',
    electronics: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    personal: '<path d="M8 4L3 7l2 4 2-1v10h10V10l2 1 2-4-5-3c0 2-1.6 3-4 3S8 6 8 4z"/>',
    home: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z"/><path d="M5 18v2M19 18v2"/>',
    hobby: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    animals: '<circle cx="6.5" cy="9.5" r="1.8"/><circle cx="12" cy="6.5" r="1.8"/><circle cx="17.5" cy="9.5" r="1.8"/><path d="M12 12c-3 0-5.5 3.6-5.5 5.6 0 1.8 2.5 1.9 5.5 1.2 3 .7 5.5.6 5.5-1.2 0-2-2.5-5.6-5.5-5.6z"/>',
    business: '<path d="M3 20V10l6 3v-3l6 3V5h6v15z"/><path d="M7 16h2M12 16h2M17 16h1"/>'
  };
  const svg = (paths, size = 20, sw = 1.8) => raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`);
  const ic = (name, size, sw) => svg(P[name], size, sw);
  const catIc = (id, size = 28) => svg(CAT_P[id] || P.image, size, 1.5);
  const MARK = '<path d="M13.5 11H34.5a4.5 4.5 0 0 1 0 9H13.5L9 15.5z" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><rect x="19.5" y="15" width="9" height="24" rx="4.5" fill="#fff"/><circle cx="14.6" cy="15.5" r="1.7" fill="#1F5E4A"/>';
  const logo = () => html`<a href="/" class="logo" aria-label="Торгана — на главную"><span class="logo-mark"><svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true">${raw(MARK)}</svg></span><span class="logo-text">торгана</span></a>`;

  // ================= состояние =================
  const S = {
    config: { categories: [], cities: [], ai: false, payments: false, mail: false, supportEmail: '', priceUnits: [''] },
    user: null,
    unread: 0,
    city: localStorage.getItem('tg_city') || ''
  };
  const catName = (id) => (S.config.categories.find((c) => c.id === id) || {}).name || '';
  // Подкатегории и характеристики (справочник с сервера, lib/taxonomy.js) — те же правила показа, что на сервере.
  const subsOf = (cat) => (S.config.subcategories || {})[cat] || [];
  const subOf = (id) => { for (const list of Object.values(S.config.subcategories || {})) { const x = list.find((s) => s.id === id); if (x) return x; } return null; };
  const subName = (id) => (subOf(id) || {}).name || '';
  const attrNum = (v) => (Math.abs(Number(v)) >= 10000 ? NF.format(v) : String(v).replace('.', ','));
  function attrText(f, v) {
    if (v === undefined || v === null || v === '') return '';
    if (f.key === 'rooms') return v === 'Студия' ? 'студия' : `${v}-комн.`;
    if (f.key === 'floor') return `${v} этаж`;
    if (f.key === 'guests') return `до ${v} гостей`;
    if (f.key === 'shoeSize') return `${v} размер`;
    if (f.key === 'size') return `размер ${v}`;
    if (f.key === 'year') return `${v} г.`;
    if (f.type === 'number') return `${attrNum(v)}${f.unit ? ` ${f.unit}` : ''}`;
    return String(v);
  }
  const attrSummary = (subId, attrs) => { const x = subOf(subId); return x && attrs ? x.summary.map((k) => { const f = x.fields.find((y) => y.key === k); return f ? attrText(f, attrs[k]) : ''; }).filter(Boolean).join(', ') : ''; };
  const metroKey = (c) => String(c || '').toLowerCase().replace(/ё/g, 'е').trim();
  const hasMetro = (city) => (S.config.metroCities || []).includes(metroKey(city));
  const metroCache = {};
  const metroOf = async (city) => { const k = metroKey(city); if (!metroCache[k]) metroCache[k] = api('GET', `/api/metro?city=${encodeURIComponent(city)}`).then((r) => r.stations).catch(() => []); return metroCache[k]; };
  // Понятные адреса: /l/123-velosiped-stels, /c/hobby/kazan (то же правило — в lib/seo.js).
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const slugify = (s) => String(s || '').toLowerCase().split('').map((c) => (TR[c] !== undefined ? TR[c] : c)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const lpath = (it) => `/l/${it.id}${slugify(it.title) ? `-${slugify(it.title)}` : ''}`;
  const cpath = (cat, city) => `/c/${cat}${city && S.config.cities.includes(city) ? `/${slugify(city)}` : ''}`;
  const CONDITION_CATS = new Set(['transport', 'electronics', 'personal', 'home', 'hobby', 'business']);
  const CONDITION_LABEL = { new: 'Новое', used: 'Б/у', '': 'Не указано' };

  // ================= уведомления и окна =================
  function toast(text, err = false) {
    const el = document.createElement('div');
    el.className = `toast${err ? ' err' : ''}`;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function openModal(content, onMount) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${content}</div>`;
    document.body.appendChild(back);
    const prevFocus = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (prevFocus) prevFocus.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    const modal = $('.modal', back);
    if (onMount) onMount(modal, close);
    const f = $('input, textarea, button', modal);
    if (f) f.focus();
    return close;
  }

  // ================= выбор из списка (1.22) =================
  // Вместо системного выпадающего списка: на телефоне — шторка снизу, на компьютере — меню под полем.
  // Поиск — когда вариантов больше 10. items: [{ value, label, sub, color }].
  function pickList({ anchor, title = '', items, value = '', onPick, search = items.length > 10, placeholder = 'Найти' }) {
    const mobile = window.matchMedia('(max-width: 600px)').matches;
    const wrap = document.createElement('div');
    wrap.className = mobile ? 'pick-back' : 'pick-layer';
    const dot = (c) => (c ? html`<i class="pick-dot" style="background:${c}"></i>` : '');
    const row = (it) => html`<button type="button" role="option" class="pick-it${it.value === value ? ' on' : ''}" data-v="${it.value}" aria-selected="${it.value === value ? 'true' : 'false'}">${dot(it.color)}<span class="pick-t"><b>${it.label}</b>${it.sub ? html`<small>${it.sub}</small>` : ''}</span>${it.value === value ? ic('check', 18, 2.4) : ''}</button>`;
    wrap.innerHTML = String(html`<div class="pick ${mobile ? 'sheet' : 'pop'}" role="dialog" aria-label="${title || 'Выбор'}">
      ${mobile ? html`<div class="pick-grip"></div>${title ? html`<div class="pick-h">${title}</div>` : ''}` : ''}
      ${search ? html`<label class="pick-search">${ic('search', 18)}<input type="search" placeholder="${placeholder}" autocomplete="off" enterkeyhint="done"></label>` : ''}
      <div class="pick-list" role="listbox">${items.map(row)}</div><div class="pick-empty" hidden>Ничего не нашлось</div></div>`);
    document.body.appendChild(wrap);
    const box = $('.pick', wrap);
    if (!mobile) {
      const r = anchor.getBoundingClientRect();
      const w = Math.max(r.width, 260);
      const below = window.innerHeight - r.bottom - 12;
      const h = Math.min(380, Math.max(below, r.top - 12));
      box.style.width = `${w}px`;
      box.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - w - 8)}px`;
      box.style.maxHeight = `${h}px`;
      if (below >= Math.min(260, box.scrollHeight) || below >= r.top) box.style.top = `${r.bottom + 6}px`; else box.style.bottom = `${window.innerHeight - r.top + 6}px`;
    }
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', close); if (!mobile) window.removeEventListener('scroll', onScroll, true); anchor.focus({ preventScroll: true }); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Enter' && e.target.closest('.pick-search')) { e.preventDefault(); const f = $('.pick-it:not([hidden])', box); if (f) f.click(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = $$('.pick-it:not([hidden])', box);
        const i = list.indexOf(document.activeElement);
        const n = list[Math.min(list.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) n.focus();
      }
    };
    const onScroll = (e) => { if (!box.contains(e.target)) close(); };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    if (!mobile) setTimeout(() => window.addEventListener('scroll', onScroll, true), 0);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { close(); onPick(b.dataset.v); } });
    const q = $('.pick-search input', box);
    if (q) {
      const norm = (t) => t.toLowerCase().replace(/ё/g, 'е');
      q.oninput = () => {
        const t = norm(q.value.trim()); let any = false;
        $$('.pick-it', box).forEach((b) => { const ok = !t || norm(b.textContent).includes(t); b.hidden = !ok; any = any || ok; });
        $('.pick-empty', box).hidden = any;
      };
      if (!mobile) q.focus();
    }
    const cur = $('.pick-it.on', box);
    if (cur) cur.scrollIntoView({ block: 'center' });
    if (!q) (cur || $('.pick-it', box)).focus({ preventScroll: true });
  }
  // Любой <select class="select"> на сайте показывается кнопкой с pickList; сам select остаётся в форме (значение, change).
  function enhanceSelect(sel) {
    if (sel.dataset.enh || sel.multiple) return;
    sel.dataset.enh = '1';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pick-btn${sel.classList.contains('adm-select') ? ' sm' : ''}`;
    if (sel.getAttribute('style')) b.setAttribute('style', sel.getAttribute('style'));
    const lab = sel.id ? document.querySelector(`label[for="${sel.id}"]`) : null;
    if (lab) { b.setAttribute('aria-label', lab.textContent.trim()); lab.addEventListener('click', (e) => { e.preventDefault(); b.click(); }); }
    sel.classList.add('pick-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.after(b);
    const paint = () => {
      const o = sel.selectedOptions[0];
      b.disabled = sel.disabled;
      b.classList.toggle('empty', !sel.value);
      b.innerHTML = String(html`${o && o.dataset.color ? html`<i class="pick-dot" style="background:${o.dataset.color}"></i>` : ''}<span>${o ? o.textContent : ''}</span>${ic('down', 18, 2)}`);
    };
    sel._paint = paint;
    paint();
    new MutationObserver(paint).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    sel.addEventListener('change', paint);
    b.onclick = () => pickList({
      anchor: b, title: lab ? lab.textContent.trim() : '', value: sel.value,
      items: [...sel.options].map((o) => ({ value: o.value, label: o.textContent, sub: o.dataset.line || '', color: o.dataset.color || '' })),
      onPick: (v) => { if (sel.value === v) return; sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); paint(); }
    });
  }
  new MutationObserver(() => $$('select.select:not([data-enh])').forEach(enhanceSelect)).observe(document.body, { childList: true, subtree: true });

  // ================= характеристики (1.22) =================
  // Короткие списки — чипсами, длинные — частые значения чипсами и «Все N» с поиском, цвета — кружками.
  // Одна разметка для формы объявления и фильтров поиска.
  const COLOR_HEX = { Чёрный: '#141414', Белый: '#FFFFFF', Серый: '#9A9A96', Серебристый: '#C9CDD2', Бежевый: '#E5D5BA', Коричневый: '#7A5235', Красный: '#C8312B', Оранжевый: '#EE7B30', Жёлтый: '#F2C94C', Зелёный: '#2E8B57', Голубой: '#86C8F0', Синий: '#2D4F9E', Фиолетовый: '#7B4FB8', Розовый: '#F2A7C3', Золотой: '#D4AF37',
    Разноцветный: 'conic-gradient(#C8312B, #F2C94C, #2E8B57, #2D4F9E, #7B4FB8, #C8312B)' };
  const optLabel = (f, o) => (f.key === 'rooms' && o !== 'Студия' ? `${o}${o === '5+' ? ' комн.' : '-комн.'}` : o);
  function attrChoice(f, v, { filter = false } = {}) {
    const has = v !== undefined && v !== null && v !== '';
    const head = html`<span class="label">${f.label}${f.req && !filter ? html`<i class="rq">*</i>` : ''}${f.color && has ? html`<em class="av-val">${v}</em>` : ''}</span>`;
    if (f.color) {
      return html`<div class="field wide av" data-field="${f.key}">${head}<div class="av-sw-row" role="radiogroup" aria-label="${f.label}">${f.options.map((o) => html`<button type="button" role="radio" class="av-sw${o === v ? ' on' : ''}" data-av="${o}" title="${o}" aria-label="${o}" aria-checked="${o === v ? 'true' : 'false'}" style="--sw:${COLOR_HEX[o] || '#ccc'}"></button>`)}</div></div>`;
    }
    const long = f.popular && f.options.length > f.popular.length;
    const shown = long ? [...f.popular, ...(has && !f.popular.includes(v) ? [v] : [])] : f.options;
    return html`<div class="field wide av" data-field="${f.key}">${head}<div class="av-chips" role="radiogroup" aria-label="${f.label}">
      ${shown.map((o) => html`<button type="button" role="radio" class="av-chip${o === v ? ' on' : ''}" data-av="${o}" aria-checked="${o === v ? 'true' : 'false'}">${optLabel(f, o)}</button>`)}
      ${long ? html`<button type="button" class="av-chip av-all" data-av-more>${filter ? 'Все' : `Все ${f.options.length}`}${ic('down', 15, 2.2)}</button>` : ''}</div></div>`;
  }
  // get(key) / set(key, value|undefined) — где хранится значение (состояние формы или скрытые поля фильтров).
  function bindAttrChoices(box, fields, get, set, opts = {}) {
    const paint = (key) => {
      const f = fields.find((x) => x.key === key);
      const el = $(`[data-field="${key}"]`, box);
      if (f && el) el.outerHTML = String(attrChoice(f, get(key), opts));
    };
    box.addEventListener('click', (e) => {
      const fieldEl = e.target.closest('[data-field]');
      if (!fieldEl) return;
      const key = fieldEl.dataset.field;
      const f = fields.find((x) => x.key === key);
      if (!f) return;
      const b = e.target.closest('[data-av]');
      if (b) { set(key, get(key) === b.dataset.av ? undefined : b.dataset.av); paint(key); return; }
      const m = e.target.closest('[data-av-more]');
      if (m) pickList({ anchor: m, title: f.label, value: get(key) || '', items: f.options.map((o) => ({ value: o, label: optLabel(f, o) })), onPick: (val) => { set(key, val); paint(key); } });
    });
  }

  // ================= просмотр фото (1.23) =================
  // Фото на весь экран внутри Торганы: листание стрелками, свайпом и клавишами, увеличение двойным нажатием,
  // колёсиком и двумя пальцами, перетаскивание увеличенного. Закрыть — крестик, Esc, нажатие на фон, свайп вниз.
  function photoViewer(srcs, start = 0, title = '') {
    if (!srcs.length) return;
    let i = Math.min(Math.max(start, 0), srcs.length - 1);
    let z = 1; let x = 0; let y = 0; // увеличение и сдвиг
    const many = srcs.length > 1;
    const v = document.createElement('div');
    v.className = 'pv';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    v.setAttribute('aria-label', title ? `Фото: ${title}` : 'Фото');
    v.innerHTML = String(html`<div class="pv-top"><span class="pv-count" aria-live="polite"></span>${title ? html`<span class="pv-title">${title}</span>` : html`<span></span>`}
        <button type="button" class="pv-btn" data-pv-close aria-label="Закрыть">${ic('close', 22, 2)}</button></div>
      <div class="pv-stage"><img class="pv-img" alt="" draggable="false"></div>
      ${many ? html`<button type="button" class="pv-btn pv-nav prev" data-pv="-1" aria-label="Предыдущее фото">${ic('left', 24, 2)}</button>
        <button type="button" class="pv-btn pv-nav next" data-pv="1" aria-label="Следующее фото">${ic('right', 24, 2)}</button>
        <div class="pv-thumbs">${srcs.map((src, k) => html`<button type="button" data-pv-to="${k}" aria-label="Фото ${k + 1}"><img src="${src}" alt="" loading="lazy"></button>`)}</div>` : ''}`);
    document.body.appendChild(v);
    document.body.classList.add('pv-open');
    const img = $('.pv-img', v);
    const stage = $('.pv-stage', v);
    const prevFocus = document.activeElement;
    const apply = (anim = true) => { img.style.transition = anim ? '' : 'none'; img.style.transform = `translate(${x}px, ${y}px) scale(${z})`; v.classList.toggle('zoomed', z > 1); };
    const clamp = () => {
      const r = stage.getBoundingClientRect(); const w = img.offsetWidth * z; const h = img.offsetHeight * z;
      const mx = Math.max(0, (w - r.width) / 2); const my = Math.max(0, (h - r.height) / 2);
      x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
    };
    const show = (k) => {
      i = (k + srcs.length) % srcs.length; z = 1; x = 0; y = 0; apply(false);
      img.src = srcs[i];
      $('.pv-count', v).textContent = many ? `${i + 1} из ${srcs.length}` : '';
      $$('[data-pv-to]', v).forEach((b, n) => { b.classList.toggle('on', n === i); if (n === i) b.scrollIntoView({ block: 'nearest', inline: 'center' }); });
      if (many) [srcs[(i + 1) % srcs.length], srcs[(i - 1 + srcs.length) % srcs.length]].forEach((u) => { const p = new Image(); p.src = u; });
    };
    const zoomAt = (nz, cx, cy) => {
      const r = img.getBoundingClientRect();
      const ox = cx - (r.left + r.width / 2); const oy = cy - (r.top + r.height / 2);
      const k = nz / z;
      x -= ox * (k - 1); y -= oy * (k - 1); z = nz;
      if (z <= 1.01) { z = 1; x = 0; y = 0; }
      clamp(); apply();
    };
    const close = () => { v.remove(); document.body.classList.remove('pv-open'); document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight' && many) show(i + 1);
      else if (e.key === 'ArrowLeft' && many) show(i - 1);
    };
    document.addEventListener('keydown', onKey, true);
    v.addEventListener('click', (e) => {
      if (e.target.closest('[data-pv-close]')) { close(); return; }
      const nb = e.target.closest('[data-pv]'); if (nb) { show(i + Number(nb.dataset.pv)); return; }
      const tb = e.target.closest('[data-pv-to]'); if (tb) { show(Number(tb.dataset.pvTo)); return; }
      if (e.target === stage && z === 1 && !moved) close(); // нажатие на фон вокруг фото
    });
    stage.addEventListener('dblclick', (e) => { e.preventDefault(); zoomAt(z > 1 ? 1 : 2.5, e.clientX, e.clientY); });
    stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.min(5, Math.max(1, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2))), e.clientX, e.clientY); }, { passive: false });
    // Пальцы и мышь: один — листать (свайп) или двигать увеличенное, два — увеличивать.
    const pts = new Map(); let start0 = null; let pinch = null; let moved = false; let lastTap = 0;
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pts.size === 1) start0 = { px: e.clientX, py: e.clientY, x, y, t: Date.now() };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        zoomAt(Math.min(5, Math.max(1, pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d))), pinch.cx, pinch.cy);
        moved = true; return;
      }
      if (!start0) return;
      const dx = e.clientX - start0.px; const dy = e.clientY - start0.py;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (z > 1) { x = start0.x + dx; y = start0.y + dy; clamp(); apply(false); }
      else if (moved) { img.style.transition = 'none'; img.style.transform = Math.abs(dy) > Math.abs(dx) && dy > 0 ? `translateY(${dy}px)` : `translateX(${dx}px)`; v.style.backgroundColor = Math.abs(dy) > Math.abs(dx) && dy > 0 ? `rgba(11, 11, 11, ${Math.max(0.3, 1 - dy / 400)})` : ''; }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size || !start0) return;
      const dx = e.clientX - start0.px; const dy = e.clientY - start0.py;
      v.style.backgroundColor = '';
      if (z === 1 && moved) {
        if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
        if (many && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { show(i + (dx < 0 ? 1 : -1)); start0 = null; return; }
        apply();
      }
      // Двойное касание на телефоне — увеличить или вернуть.
      if (!moved && e.pointerType === 'touch') { const t = Date.now(); if (t - lastTap < 280) { zoomAt(z > 1 ? 1 : 2.5, e.clientX, e.clientY); lastTap = 0; } else lastTap = t; }
      start0 = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    show(i);
    $('[data-pv-close]', v).focus({ preventScroll: true });
  }
  // Фото из чата и модерации (ссылки data-pv-src) — тоже во встроенном просмотре.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-pv-src]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const group = a.dataset.pvGroup ? $$(`a[data-pv-group="${a.dataset.pvGroup}"]`) : [a];
    photoViewer(group.map((x) => x.dataset.pvSrc), group.indexOf(a));
  });

  function confirmModal(title, text, okLabel = 'Подтвердить', danger = false) {
    return new Promise((resolve) => {
      openModal(String(html`<h2>${title}</h2><p class="muted" style="margin:0">${text}</p>
        <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn ${danger ? 'btn-danger' : 'btn-dark'}" data-ok>${okLabel}</button></div>`),
      (m, close) => {
        $('[data-x]', m).onclick = () => { close(); resolve(false); };
        $('[data-ok]', m).onclick = () => { close(); resolve(true); };
      });
    });
  }

  function cityModal(onPick) {
    const list = (q) => {
      const n = q.trim().toLowerCase().replace(/ё/g, 'е');
      const cities = S.config.cities.filter((c) => !n || c.toLowerCase().replace(/ё/g, 'е').includes(n));
      const custom = n && !cities.some((c) => c.toLowerCase() === n) ? [q.trim()] : [];
      return String(html`<button data-city="" class="${S.city ? '' : 'on'}">Вся Россия</button>
        ${[...custom, ...cities].slice(0, 80).map((c) => html`<button data-city="${c}" class="${S.city === c ? 'on' : ''}">${c}</button>`)}`);
    };
    openModal(String(html`<h2>Где искать?</h2>
      <label class="sr" for="city-q">Город</label>
      <input id="city-q" class="input" placeholder="Начните вводить город" autocomplete="off">
      <div class="city-list" id="city-list">${raw(list(''))}</div>`), (m, close) => {
      const input = $('#city-q', m);
      input.oninput = () => { $('#city-list', m).innerHTML = list(input.value); };
      $('#city-list', m).onclick = (e) => {
        const b = e.target.closest('[data-city]');
        if (!b) return;
        S.city = b.dataset.city;
        if (S.city) localStorage.setItem('tg_city', S.city); else localStorage.removeItem('tg_city');
        close();
        onPick(S.city);
      };
    });
  }

  // ================= каркас: шапка, меню, подвал =================
  // Шапка (1.23, вариант B): всё в одну строку — логотип, поиск с городом внутри, избранное, сообщения,
  // уведомления, «Разместить», меню. На телефоне поиск — второй строкой на главной (см. viewHome).
  function renderHeader() {
    const path = location.pathname;
    const q = path === '/search' ? new URLSearchParams(location.search).get('q') || '' : '';
    $('#header').innerHTML = String(html`<div class="wrap header-in">
      ${logo()}
      <form class="search header-search" role="search" data-search>
        ${ic('search', 18)}
        <label class="sr" for="hq">Поиск по объявлениям</label>
        <input id="hq" name="q" type="search" placeholder="Поиск по объявлениям" value="${q}" autocomplete="off" enterkeyhint="search">
        <button type="button" class="hs-city" data-city-btn aria-label="Город: ${S.city || 'Вся Россия'}">${ic('pin', 15, 2)}<span>${S.city || 'Вся Россия'}</span></button>
        <button class="btn btn-accent btn-sm" type="submit">Найти</button>
      </form>
      <nav class="header-nav" aria-label="Основное">
        <a href="/favorites" class="icon-btn hd-ic hide-m" aria-label="Избранное" title="Избранное">${ic('heart', 21, 1.9)}</a>
        <a href="/messages" class="icon-btn hd-ic hide-m" aria-label="Сообщения" title="Сообщения">${ic('chat', 21, 1.9)}<span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span></a>
        ${S.user ? html`<button type="button" class="icon-btn hd-ic bell-btn" data-bell aria-label="Уведомления" title="Уведомления" aria-haspopup="dialog">${ic('bell', 21, 1.9)}<span class="badge ${S.notices ? '' : 'hidden'}" data-notices>${S.notices || 0}</span></button>` : ''}
        <a href="/new" class="btn btn-dark btn-sm hide-m hd-new">${ic('plus', 17, 2.4)}Разместить</a>
        ${S.user ? '' : html`<a href="/login" class="nav-link hide-m">Войти</a>`}
        <button type="button" class="icon-btn menu-btn" data-menu aria-label="Меню" aria-haspopup="dialog">${ic('menu', 22, 2)}</button>
      </nav>
    </div>`);
    $('[data-menu]', $('#header')).onclick = openMenu;
    const bell = $('[data-bell]', $('#header'));
    if (bell) bell.onclick = openNotices;
  }

  // ================= уведомления (1.22) =================
  // Колокольчик: решения модерации, отзывы, оплата, продвижение, снижение цен. Панель справа, по дням.
  function setNotices(n) {
    S.notices = n || 0;
    $$('[data-notices]').forEach((el) => { el.textContent = S.notices > 99 ? '99+' : S.notices; el.classList.toggle('hidden', !S.notices); });
  }
  const NOTICE_TONE = { ok: 'ok', bad: 'bad', wait: 'wait' };
  function noticeDay(ts) {
    const d = new Date(ts); const t = new Date();
    const y = new Date(t); y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Сегодня';
    if (d.toDateString() === y.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.getFullYear() !== t.getFullYear() ? { year: 'numeric' } : {}) });
  }
  async function openNotices() {
    openModal(String(html`<div class="nt-top"><h2>Уведомления</h2><button type="button" class="icon-btn" data-x aria-label="Закрыть">${ic('close', 20, 2)}</button></div><div class="nt-body" id="nt-body"><div class="loader"></div></div>`), async (m, close) => {
      m.classList.add('drawer', 'nt-drawer'); m.parentElement.classList.add('drawer-back'); m.setAttribute('aria-label', 'Уведомления');
      $('[data-x]', m).onclick = close;
      m.addEventListener('click', (e) => { if (e.target.closest('a[href]')) close(); });
      let d;
      try { d = await api('GET', '/api/notices'); } catch (e) { $('#nt-body', m).innerHTML = String(html`<p class="muted">${e.message}</p>`); return; }
      const groups = [];
      d.items.forEach((n) => { const k = noticeDay(n.at); const g = groups[groups.length - 1]; if (g && g[0] === k) g[1].push(n); else groups.push([k, [n]]); });
      $('#nt-body', m).innerHTML = String(d.items.length ? html`${groups.map(([day, list]) => html`<div class="nt-day">${day}</div>
        ${list.map((n) => html`<a class="nt-it${n.read ? '' : ' new'}" href="${n.url || '#'}"><span class="nt-ic ${NOTICE_TONE[n.tone] || ''}">${ic(P[n.icon] ? n.icon : 'bell', 19, 2)}</span>
          <span class="nt-t"><b>${n.title}</b>${n.body ? html`<span>${n.body}</span>` : ''}<small>${hm(n.at)}</small></span></a>`)}`)}`
        : html`<div class="nt-empty"><span class="nt-empty-ic">${ic('bell', 30, 1.6)}</span><b>Здесь будут уведомления</b><p>Напишем, когда объявление опубликуют, придёт отзыв или подешевеет товар из избранного.</p></div>`);
      if (d.unread) { api('POST', '/api/notices/read', {}).then((r) => setNotices(r.unread)).catch(() => {}); }
      if (S.user && 'Notification' in window && Notification.permission === 'default') {
        const box = $('#nt-body', m);
        box.insertAdjacentHTML('afterbegin', String(html`<div class="nt-push">${ic('bell', 18, 2)}<span>Включите push — узнаете о публикации сразу, даже когда сайт закрыт.</span><button type="button" class="btn btn-dark btn-sm" data-push-on>Включить</button></div>`));
        $('[data-push-on]', box).onclick = async (e) => { e.currentTarget.disabled = true; try { await pushOn(); toast('Push включены'); $('.nt-push', box).remove(); } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; } };
      }
    });
  }

  function renderBottomNav() {
    const p = location.pathname;
    const on = (cond) => (cond ? 'on' : '');
    $('#bottom-nav').innerHTML = String(html`
      <a href="/" class="${on(p === '/' || p === '/search')}" aria-label="Главная">${ic('home', 23)}</a>
      <a href="/favorites" class="${on(p === '/favorites')}" aria-label="Избранное">${ic('heart', 23)}</a>
      <a href="/new" class="plus" aria-label="Разместить объявление">${ic('plus', 24, 2.2)}</a>
      <a href="/messages" class="${on(p.startsWith('/messages'))}" aria-label="Сообщения">${ic('chat', 23)}<span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span></a>
      <a href="${S.user ? '/profile' : '/login'}" class="${on(p.startsWith('/profile') || p === '/login')}" aria-label="Профиль">${ic('user', 23)}</a>`);
  }

  // Подвал: знак и кнопка поддержки, разделы (на телефоне раскрываются), контакты, © с реквизитами оператора, документы. Последняя колонка FOOTER_COLS — документы (их же показывает меню ≡).
  const FOOTER_COLS = [
    ['Покупателям', [['/page/help', 'Как искать'], ['/page/safety', 'Безопасность'], ['/favorites', 'Избранное']]],
    ['Продавцам', [['/new', 'Разместить объявление'], ['/business', 'Для бизнеса'], ['/page/rules', 'Правила площадки']]],
    ['Помощь', [['/page/support', 'Поддержка'], ['/page/contacts', 'Реквизиты и контакты']]],
    ['Документы', [['/page/terms', 'Пользовательское соглашение'], ['/page/privacy', 'Конфиденциальность'], ['/page/consent', 'Согласие на обработку данных']]]
  ];
  const FOOTER_NARROW = '(max-width: 760px)';
  function renderFooter() {
    const op = S.config.operator;
    const mail = S.config.supportEmail;
    const cols = FOOTER_COLS.slice(0, -1);
    const docs = FOOTER_COLS[FOOTER_COLS.length - 1][1];
    const contact = (icon, body) => html`<li><span class="f-ic">${ic(icon, 16)}</span>${body}</li>`;
    const footer = $('#footer');
    footer.innerHTML = String(html`<div class="wrap">
      <div class="f-hero">
        <div class="f-brand">${logo()}<p class="f-tag">Честная площадка объявлений по всей России</p></div>
        <div class="f-cta">
          <a class="f-support" href="/messages/support"><span class="f-support-ic">${ic('headset', 20)}</span>Написать в поддержку</a>
          <small>Отвечают модераторы, а не бот</small>
        </div>
      </div>
      <div class="f-grid">
        ${cols.map(([t, ls]) => html`<details class="fcol" open><summary><h4>${t}</h4>${ic('down', 18, 2)}</summary><ul>${ls.map(([href, label]) => html`<li><a href="${href}">${label}</a></li>`)}</ul></details>`)}
        <div class="fcol fcol-contacts"><h4>Контакты</h4><ul class="f-contacts">
          ${mail ? contact('mail', html`<a href="mailto:${mail}">${mail}</a>`) : ''}
          ${contact('shield', html`<span>Каждое объявление проверяет модератор</span>`)}
        </ul></div>
      </div>
      <div class="f-bottom"><div class="f-copy"><b>© ${new Date().getFullYear()} Торгана</b>${op ? html`<span>${op.name}, ИНН ${op.inn}, ОГРНИП ${op.ogrnip}</span>` : ''}</div>
        <nav class="f-docs" aria-label="Документы">${docs.map(([href, label]) => html`<a href="${href}">${label}</a>`)}${Number(S.config.metrika) ? html`<a href="#" data-cookie-settings>Настройки cookie</a>` : ''}</nav></div>
    </div>`);
    // На телефоне разделы свёрнуты, на компьютере всегда открыты.
    const narrow = window.matchMedia(FOOTER_NARROW).matches;
    $$('details.fcol', footer).forEach((d) => {
      if (narrow) d.open = false;
      $('summary', d).onclick = (e) => { if (!window.matchMedia(FOOTER_NARROW).matches) e.preventDefault(); };
    });
  }

  function setUnread(n) {
    S.unread = n;
    $$('[data-unread]').forEach((el) => { el.textContent = n; el.classList.toggle('hidden', !n); });
  }
  // Новое по сохранённым поискам — значок у пункта «Поиски».
  function setFresh(f) {
    S.fresh = f || { search: 0, price: 0, follow: 0 };
    $$('[data-fresh]').forEach((el) => { el.textContent = S.fresh.search; el.classList.toggle('hidden', !S.fresh.search); });
    $$('[data-fresh-follow]').forEach((el) => { el.textContent = S.fresh.follow || 0; el.classList.toggle('hidden', !S.fresh.follow); });
  }
  const freshBadge = () => html`<span class="badge ${S.fresh && S.fresh.search ? '' : 'hidden'}" data-fresh>${S.fresh ? S.fresh.search : 0}</span>`;

  // ================= карточки =================
  // it.ad — карточка из блока «Реклама»: пометка, рекламодатель и erid по кнопке «Реклама» (38-ФЗ, ст. 18.1).
  // it.boost — продвижение в ленте (lib/boost.js): XL — на две ячейки (на телефоне — во всю ширину) с ещё двумя фото
  // и началом описания, рамка — изумрудная обводка, tags — метки на фото. Подпись «Продвигается» — всегда.
  const boostImg = (src, cls = '', extra = '') => html`<span class="xl-ph ${cls}${src ? ' ph' : ''}"${src ? raw(` style="--ph:url('${esc(src)}')"`) : ''}>${src ? html`<img src="${src}" alt="" loading="lazy">` : svg(P.image, 28, 1.2)}${extra}</span>`;
  function card(it) {
    const meta = [it.metro ? `м. ${it.metro}` : it.city, shortWhen(it.createdAt)].filter(Boolean).join(' · ');
    const ad = it.ad;
    const bo = !ad && it.boost && it.status !== 'sold' ? it.boost : null;
    const xl = !!(bo && bo.xl);
    const tags = bo && bo.tags && bo.tags.length ? bo.tags : null;
    const side = xl ? [...(bo.photos || [])] : [];
    return html`<div class="card${ad ? ' is-ad' : ''}${xl ? ' is-xl' : ''}${bo && bo.frame ? ' is-frame' : ''}">
      <a href="${lpath(it)}" class="card-link"${ad ? raw(` data-adid="${Number(ad.id)}"`) : ''}>
        <div class="card-img${xl ? ' xl-img' : it.photo ? ' ph' : ''}"${!xl && it.photo ? raw(` style="--ph:url('${esc(it.photo)}')"`) : ''}>
          ${xl ? boostImg(it.photo, 'main') : it.photo ? html`<img src="${it.photo}" alt="" loading="lazy">` : svg(P.image, 40, 1.2)}
          ${xl ? html`<span class="xl-side">${boostImg(side[0])}${boostImg(side[1], '', bo.more ? html`<em>+${bo.more} фото</em>` : '')}</span>` : ''}
          ${tags ? html`<span class="b-tags">${tags.map((t, i) => html`<span class="b-tag${i ? ' alt' : ''}">${t}</span>`)}</span>`
    : ad ? '' : it.status === 'sold' ? html`<span class="tag dark sold-badge">Продано</span>` : it.fresh ? html`<span class="tag drop-badge">Новое</span>` : it.priceWas ? html`<span class="tag drop-badge" title="Было ${price(it.priceWas, it.priceUnit)}">${ic('down', 13, 2.4)}Цена снижена</span>` : ''}
          <span class="price-pill">${price(it.price, it.priceUnit)}</span>
          ${it.hasVideo ? html`<span class="vid-badge" title="Есть видео">${ic('play', 14, 0)}<span class="sr">Есть видео</span></span>` : ''}
        </div>
        <div class="card-body">
          <span class="card-title">${it.title}</span>
          ${xl && (bo.desc || it.summary) ? html`<span class="card-desc">${[it.summary, bo.desc].filter(Boolean).join('. ')}</span>` : it.summary ? html`<span class="card-sum">${it.summary}</span>` : ''}
          <span class="card-meta">${meta}${it.delivery ? html` · <span class="ok">Доставка</span>` : ''}${it.exchange ? html` · <span class="ok">Обмен</span>` : ''}${bo ? html` · <span class="b-mark">Продвигается</span>` : ''}</span>
        </div>
      </a>
      <button type="button" class="fav-btn ${it.isFav ? 'on' : ''}" data-fav="${it.id}" aria-label="${it.isFav ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${it.isFav ? 'true' : 'false'}">${ic('heart', 20)}</button>
      ${ad ? html`<button type="button" class="ad-mark" data-ad-info="${ad.id}" data-adv="${ad.advertiser}" data-inn="${ad.inn}" data-erid="${ad.erid}" aria-label="Реклама — о рекламодателе">Реклама${ic('info', 13, 2)}</button>` : ''}
    </div>`;
  }
  const grid = (items) => html`<div class="grid">${items.map(card)}</div>`;
  const skeletonGrid = (n = 8) => html`<div class="grid">${Array.from({ length: n }, () => html`<div><div class="skeleton" style="aspect-ratio:1/1"></div><div class="skeleton" style="height:16px;margin-top:12px;border-radius:8px;width:80%"></div></div>`)}</div>`;

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    e.preventDefault();
    if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    try {
      const { fav, favCount } = await api('POST', `/api/favorites/${b.dataset.fav}`);
      const fc = $('[data-favs]'); if (fc && location.pathname === `/l/${b.dataset.fav}`) fc.textContent = `в избранном у ${NF.format(favCount)}`;
      $$(`[data-fav="${b.dataset.fav}"]`).forEach((x) => {
        x.classList.toggle('on', fav);
        x.setAttribute('aria-pressed', fav ? 'true' : 'false');
        x.setAttribute('aria-label', fav ? 'Убрать из избранного' : 'В избранное');
      });
      toast(fav ? 'Добавлено в избранное' : 'Убрано из избранного');
    } catch (err) { toast(err.message, true); }
  });

  // «Реклама» на карточке: кто рекламодатель и токен erid.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ad-info]');
    if (!b) return;
    e.preventDefault();
    openModal(String(html`<h2>Реклама</h2>
      <div class="adm-facts ad-facts"><div><span>Рекламодатель</span><b>${b.dataset.adv}</b></div>${b.dataset.inn ? html`<div><span>ИНН</span><b>${b.dataset.inn}</b></div>` : ''}${b.dataset.erid ? html`<div><span>Токен</span><b>erid: ${b.dataset.erid}</b></div>` : ''}</div>
      <p class="muted" style="margin:14px 0 0;font-size:14px">Продавец оплатил показ объявления в блоке «Реклама». Объявление подобрано по вашему запросу, фильтрам и городу — мы не собираем сведения о ваших предпочтениях. Обычная выдача от рекламы не меняется.</p>
      <div class="modal-actions"><a class="btn btn-soft" href="/business">Как это работает</a><button class="btn btn-dark" data-x>Понятно</button></div>`), (m, close) => { $('[data-x]', m).onclick = close; m.addEventListener('click', (ev) => { if (ev.target.closest('a[href]')) close(); }); });
  });
  // Переход из блока «Реклама» — запоминаем, чтобы статистика записала источник «Реклама».
  document.addEventListener('click', (e) => { const a = e.target.closest('a[data-adid]'); if (a) S.adClick = a.getAttribute('href'); }, true);

  // ================= cookie и Яндекс.Метрика =================
  // Метрика загружается, только если модератор указал номер счётчика и человек нажал «Хорошо» в плашке cookie.
  // Без счётчика плашки нет: сайт использует только необходимые cookie (вход, защита).
  const COOKIE_KEY = 'tg_cookie';
  const cookieChoice = () => { try { return localStorage.getItem(COOKIE_KEY) || ''; } catch { return 'necessary'; } };
  let ymOn = false;
  let ymPrev = document.referrer;
  function metrikaStart() {
    const id = Number(S.config.metrika);
    if (!id || ymOn || cookieChoice() !== 'all') return;
    ymOn = true;
    window.ym = window.ym || function ym() { (window.ym.a = window.ym.a || []).push(arguments); }; // eslint-disable-line prefer-rest-params
    window.ym.l = Date.now();
    const sc = document.createElement('script');
    sc.async = true; sc.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.appendChild(sc);
    window.ym(id, 'init', { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  }
  // Просмотр страницы — после каждого перехода внутри сайта.
  function metrikaHit() {
    if (!ymOn) return;
    window.ym(Number(S.config.metrika), 'hit', location.href, { title: document.title, referer: ymPrev });
    ymPrev = location.href;
  }
  function cookieBar(force = false) {
    if (!Number(S.config.metrika) || (cookieChoice() && !force) || $('.cookie-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie');
    bar.innerHTML = String(html`<div class="cb-ic">${ic('shield', 20, 2)}</div>
      <p><b>Мы используем cookie.</b> Необходимые — для входа и защиты сайта. Статистические — Яндекс.Метрика: смотрим, что удобно, а что нет, без рекламы и без записи экрана. <a href="/page/privacy#cookie">Подробнее</a></p>
      <div class="cb-act"><button type="button" class="btn btn-soft btn-sm" data-c="necessary">Только необходимые</button><button type="button" class="btn btn-dark btn-sm" data-c="all">Хорошо</button></div>`);
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('show'));
    $$('[data-c]', bar).forEach((b) => {
      b.onclick = () => {
        try { localStorage.setItem(COOKIE_KEY, b.dataset.c); } catch { /* приватный режим */ }
        bar.remove();
        if (b.dataset.c === 'all') { metrikaStart(); metrikaHit(); } else if (ymOn) location.reload(); // отказались — выключаем Метрику
      };
    });
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); cookieBar(true); } });

  // ================= роутер =================
  let cleanup = null;
  function go(url, replace = false) {
    history[replace ? 'replaceState' : 'pushState']({}, '', url);
    render();
  }
  function goSearch(params) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, v === true ? '1' : v); });
    if (!sp.has('city') && S.city && params.city === undefined) sp.set('city', S.city);
    go(`/search?${sp}`);
  }
  // Кнопка города в строке поиска: выбрать город и обновить страницу (лента и поиск учитывают город).
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-city-btn]');
    if (!b) return;
    e.preventDefault();
    cityModal(() => {
      renderHeader();
      if (location.pathname === '/search') { const p = new URLSearchParams(location.search); if (S.city) p.set('city', S.city); else p.delete('city'); go(`/search?${p}`, true); } else render();
    });
  });
  // Все строки поиска (в шапке и на главной) — form[data-search] с полем q.
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-search]');
    if (!f) return;
    e.preventDefault(); goSearch({ q: f.q.value.trim() });
  });
  function requireAuth() {
    if (S.user) return true;
    go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, true);
    return false;
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/uploads/') || a.target === '_blank' || a.hasAttribute('download')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    go(href);
  });
  window.addEventListener('popstate', render);
  window.addEventListener('scroll', () => $('#header').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

  const ROUTES = [
    [/^\/$/, viewHome],
    [/^\/search$/, viewSearch],
    [/^\/l\/(\d+)(?:-[a-z0-9-]*)?$/, viewListing],
    [/^\/c\/([a-z]+(?:\/[a-z0-9-]+)?)$/, viewCategory],
    [/^\/new$/, viewEditor],
    [/^\/edit\/(\d+)$/, viewEditor],
    [/^\/login$/, viewLogin],
    [/^\/register$/, viewRegister],
    [/^\/forgot$/, viewForgot],
    [/^\/reset$/, viewReset],
    [/^\/(verify|unsubscribe)$/, viewMailLink],
    [/^\/confirm$/, viewConfirm],
    [/^\/favorites$/, viewFavorites],
    [/^\/messages(?:\/(\d+|support))?$/, viewMessages],
    [/^\/profile(?:\/(listings|settings|reviews|searches|following|stats\/\d+|business(?:\/(?:shop|stats|feed))?))?$/, viewProfile],
    [/^\/business$/, viewBusiness],
    [/^\/pay\/([\w-]+)$/, viewPay],
    [/^\/u\/(\d+)$/, viewUser],
    [/^\/admin$/, viewAdmin],
    [/^\/admin\/l\/(\d+)$/, viewAdminListing],
    [/^\/admin\/device$/, viewDevice],
    [/^\/admin\/u\/(\d+)$/, viewAdminUser],
    [/^\/page\/([a-z]+)$/, viewPage]
  ];

  async function render() {
    if (cleanup) { cleanup(); cleanup = null; }
    S.from = S.here || null; // предыдущая страница — источник перехода в объявление
    S.here = location.pathname + location.search;
    const path = location.pathname.replace(/\/+$/, '') || '/';
    renderHeader();
    renderBottomNav();
    const q = new URLSearchParams(location.search);
    const r = ROUTES.find(([re]) => re.test(path));
    window.scrollTo(0, 0);
    if (!r) { viewNotFound(); return; }
    const m = path.match(r[0]);
    try {
      await r[1](m[1], q);
      watchImpressions();
      metrikaHit();
    } catch (err) {
      if (err.status === 404) viewNotFound(err.message);
      else if (err.status === 403 && err.data && err.data.device) viewDevice();
      else app.innerHTML = String(html`<div class="wrap"><div class="empty" style="margin-top:40px"><h3>Не получилось загрузить страницу</h3><p>${err.message}</p><a href="${location.pathname + location.search}" class="btn btn-dark">Обновить</a></div></div>`);
    }
  }

  function setTitle(t) { document.title = t ? `${t} — Торгана` : 'Торгана — объявления по всей России'; }

  function viewNotFound(msg) {
    setTitle('Страница не найдена');
    app.innerHTML = String(html`<div class="wrap"><div class="empty" style="margin-top:40px"><h3>${msg || 'Такой страницы нет'}</h3><p>Возможно, объявление сняли с публикации или ссылка устарела.</p><a href="/" class="btn btn-dark">На главную</a></div></div>`);
  }

  // ================= статистика объявлений =================
  // Переход: откуда открыли объявление. Показ: карточка в поиске или ленте видна наполовину не меньше секунды.
  // Сервер сам решает, засчитывать ли (раз в сутки на человека, без продавца, роботов и сверх лимитов).
  function statSource() {
    if (S.adClick && S.adClick === location.pathname) { S.adClick = null; return 'ad'; }
    S.adClick = null;
    if (!S.from) return 'external';
    const u = new URL(S.from, location.origin);
    if (u.pathname === '/') return 'home';
    if (u.pathname === '/search') return u.searchParams.get('q') ? 'search' : 'category';
    return 'other';
  }
  const imp = { queue: new Set(), ads: new Set(), sent: new Set(), timers: new Map(), io: null, mo: null };
  function watchImpressions() {
    if (imp.io) { imp.io.disconnect(); imp.io = null; }
    if (imp.mo) { imp.mo.disconnect(); imp.mo = null; }
    imp.timers.forEach((t) => clearTimeout(t)); imp.timers.clear();
    const p = location.pathname;
    if ((p !== '/' && p !== '/search') || !('IntersectionObserver' in window)) return;
    imp.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const lid = e.target.dataset.lid;
        const adid = e.target.dataset.adid; // карточка из блока «Реклама» — ещё и показ рекламы
        const id = adid ? `a${adid}` : lid;
        if (e.isIntersecting) {
          if (!imp.sent.has(id) && !imp.timers.has(id)) imp.timers.set(id, setTimeout(() => { imp.timers.delete(id); imp.sent.add(id); imp.queue.add(lid); if (adid) imp.ads.add(adid); }, 1000));
        } else { clearTimeout(imp.timers.get(id)); imp.timers.delete(id); }
      }
    }, { threshold: 0.5 });
    const observe = () => $$('.card-link[href^="/l/"]:not([data-lid])').forEach((a) => { a.dataset.lid = a.getAttribute('href').slice(3); imp.io.observe(a); });
    observe();
    imp.mo = new MutationObserver(observe); // «Показать ещё» и лента дозагружают карточки
    imp.mo.observe(app, { childList: true, subtree: true });
  }
  function flushImpressions() {
    if (imp.ads.size) {
      const ads = [...imp.ads].slice(0, 12);
      ads.forEach((i) => imp.ads.delete(i));
      fetch('/api/stats/ads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: ads }), credentials: 'same-origin', keepalive: true }).catch(() => {});
    }
    if (!imp.queue.size) return;
    const ids = [...imp.queue].slice(0, 60);
    ids.forEach((i) => imp.queue.delete(i));
    fetch('/api/stats/impressions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'same-origin', keepalive: true }).catch(() => {});
  }
  setInterval(flushImpressions, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushImpressions(); });

  // ================= главная =================
  // Лента объявлений в box: первая страница, дальше — кнопка «Показать ещё» в .more после box
  // или (auto) сама при прокрутке. Возвращает функцию остановки для cleanup.
  function listingFeed(box, params, { limit = 24, empty, onFirst, auto = false }) {
    const more = box.nextElementSibling;
    let offset = 0; let total = Infinity; let busy = false; let io = null;
    const load = async () => {
      if (busy || offset >= total) return;
      busy = true;
      try {
        const data = await api('GET', `/api/listings?${new URLSearchParams({ ...params, limit, offset })}`);
        if (!box.isConnected) return;
        if (offset === 0) {
          if (onFirst) onFirst(data);
          box.innerHTML = String(data.items.length ? grid(data.items) : empty);
        } else {
          $('.grid', box).insertAdjacentHTML('beforeend', data.items.map((i) => String(card(i))).join(''));
        }
        offset += data.items.length;
        total = data.items.length ? data.total : offset;
        more.classList.toggle('hidden', offset >= total);
        if (io && offset < total) { io.unobserve(more); io.observe(more); } // экран ещё не заполнен — грузим дальше
      } catch (e) { if (!offset) throw e; toast(e.message, true); } finally { busy = false; } // первая страница — ошибку покажет роутер
    };
    if (auto && 'IntersectionObserver' in window) {
      more.innerHTML = '<div class="loader"></div>';
      io = new IntersectionObserver((es) => { if (es[0].isIntersecting) load(); }, { rootMargin: '800px 0px' });
      io.observe(more);
    } else {
      more.innerHTML = '<button class="btn btn-soft btn-lg" type="button">Показать ещё</button>';
      more.firstChild.onclick = load;
    }
    return { first: load(), stop: () => io && io.disconnect() };
  }

  // Блок «Реклама» над лентой или выдачей: один ряд — столько карточек, сколько колонок у сетки под ним.
  // Подбор — по тем же запросу, фильтрам и городу, что и выдача; сама выдача не меняется.
  async function adRow(box, params, cls = '', note = '') {
    const g = $('.grid', box);
    if (!g) return;
    const cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length || 3;
    const { items } = await api('GET', `/api/ads?${new URLSearchParams({ ...searchParams(params), limit: cols })}`).catch(() => ({ items: [] }));
    if (!items.length || !box.isConnected) return;
    box.insertAdjacentHTML('beforebegin', String(html`<section class="ads-row ${cls}" aria-label="Реклама"><div class="ads-head">${ic('megaphone', 15, 2)}Реклама${note ? ` · ${note}` : ''}</div><div class="grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${items.map(card)}</div></section>`));
  }

  // ================= главная =================
  // Строка поиска и город, категории, бесконечная лента (на телефоне по 3 в ряд, на компьютере по 5).
  async function viewHome() {
    setTitle('');
    app.innerHTML = String(html`
      <section class="wrap home-top">
        <h1 class="sr">Торгана — объявления по всей России</h1>
        <form class="search home-search" role="search" data-search>
          ${ic('search', 20)}
          <label class="sr" for="q">Что вы ищете</label>
          <input id="q" name="q" type="search" placeholder="Что вы ищете?" autocomplete="off" enterkeyhint="search">
          <button type="button" class="hs-city" data-city-btn aria-label="Город: ${S.city || 'Вся Россия'}">${ic('pin', 15, 2)}<span>${S.city || 'Вся Россия'}</span></button>
        </form>
        <div class="cat-rail"><button type="button" class="cat-arrow prev" data-cat-scroll="-1" aria-label="Назад">${ic('left', 18, 2.2)}</button>
          <nav class="cat-pills" aria-label="Категории"><a class="cat-pill on" href="/search${S.city ? `?city=${encodeURIComponent(S.city)}` : ''}">${ic('list', 17, 2)}Все</a>${S.config.categories.map((c) => html`<a class="cat-pill" href="${cpath(c.id, S.city)}">${catIc(c.id, 18)}${c.name}</a>`)}</nav>
          <button type="button" class="cat-arrow next" data-cat-scroll="1" aria-label="Дальше">${ic('right', 18, 2.2)}</button></div>
      </section>

      <section class="wrap home-feed">
        <div class="section-head"><h2>Свежие объявления${S.city ? html` · ${S.city}` : ''}</h2><a href="/search${S.city ? `?city=${encodeURIComponent(S.city)}` : ''}">Смотреть все</a></div>
        <div id="feed" class="feed">${skeletonGrid(15)}</div>
        <div class="more hidden"></div>
      </section>`);
    const feed = listingFeed($('#feed'), S.city ? { city: S.city } : {}, {
      limit: 30,
      auto: true,
      empty: html`<div class="empty"><h3>${S.city ? `В городе ${S.city} пока нет объявлений` : 'Здесь появятся первые объявления'}</h3><p>Разместите своё — это бесплатно и займёт пару минут.</p><a class="btn btn-dark" href="/new">Разместить объявление</a></div>`
    });
    // Стрелки ленты категорий: видны, только когда есть куда листать.
    const rail = $('.cat-rail'); const pills = $('.cat-pills', rail);
    const railPaint = () => { rail.classList.toggle('can-prev', pills.scrollLeft > 4); rail.classList.toggle('can-next', pills.scrollLeft + pills.clientWidth < pills.scrollWidth - 4); };
    pills.addEventListener('scroll', railPaint, { passive: true });
    $$('[data-cat-scroll]', rail).forEach((b) => { b.onclick = () => pills.scrollBy({ left: Number(b.dataset.catScroll) * pills.clientWidth * 0.7 }); });
    window.addEventListener('resize', railPaint);
    railPaint();
    cleanup = () => { feed.stop(); window.removeEventListener('resize', railPaint); };
    await feed.first;
    await adRow($('#feed'), S.city ? { city: S.city } : {}, 'feed', S.city ? `в городе ${S.city}` : '');
  }

  // ================= поиск =================
  // /c/:категория и /c/:категория/:город — страницы разделов для поисковиков; внутри — обычный поиск.
  function viewCategory(part) {
    const [cat, citySlug] = part.split('/');
    const city = citySlug ? S.config.cities.find((c) => slugify(c) === citySlug) : '';
    if (!S.config.categories.some((c) => c.id === cat) || (citySlug && !city)) { viewNotFound(); return undefined; }
    return viewSearch(null, new URLSearchParams({ category: cat, ...(city ? { city } : {}) }));
  }

  async function viewSearch(_, q) {
    const params = Object.fromEntries(q.entries());
    const sub = subOf(params.sub) ? params.sub : '';
    const category = (sub && Object.keys(S.config.subcategories).find((c) => subsOf(c).some((x) => x.id === sub))) || params.category || '';
    const title = params.q ? `«${params.q}»` : sub ? subName(sub) : category ? catName(category) : 'Все объявления';
    setTitle(params.q || subName(sub) || catName(category) || 'Поиск');
    // Активные уточнения — чипы с крестиком (убрать одно, не трогая остальное).
    const without = (...keys) => { const p = { ...params, ...(category ? { category } : {}) }; keys.forEach((k) => delete p[k]); if (keys.includes('sub')) Object.keys(p).filter((k) => k.startsWith('a_')).forEach((k) => delete p[k]); return `/search?${new URLSearchParams(p)}`; };
    const activeChips = [];
    if (sub) {
      activeChips.push([subName(sub), without('sub')]);
      for (const f of subOf(sub).fields) {
        if (f.type === 'select' && params[`a_${f.key}`]) activeChips.push([attrText(f, params[`a_${f.key}`]) || params[`a_${f.key}`], without(`a_${f.key}`)]);
        const lo = params[`a_${f.key}_min`]; const hi = params[`a_${f.key}_max`]; const u = f.unit ? ` ${f.unit}` : '';
        if (lo || hi) activeChips.push([`${f.label}: ${lo && hi ? `${attrNum(lo)}–${attrNum(hi)}` : lo ? `от ${attrNum(lo)}` : `до ${attrNum(hi)}`}${u}`, without(`a_${f.key}_min`, `a_${f.key}_max`)]);
      }
    }
    if (params.metro) activeChips.push([`м. ${params.metro}`, without('metro')]);
    const subChips = category && !sub ? subsOf(category) : [];
    const nFilters = ['category', 'city', 'min', 'max', 'delivery', 'bargain', 'exchange', 'metro'].filter((k) => params[k]).length + (sub ? 1 : 0) + Object.keys(params).filter((k) => k.startsWith('a_') && params[k]).length;
    app.innerHTML = String(html`<div class="wrap search-page">
      <aside class="filters collapsed" id="filters">
        <button type="button" class="btn btn-soft btn-block" id="filters-toggle" style="display:none">${ic('filter', 18)}Фильтры${nFilters ? html`<span class="f-count">${nFilters}</span>` : ''}</button>
        <form id="filter-form" class="filters-body">
          <h3>Фильтры</h3>
          <input type="hidden" name="q" value="${params.q || ''}">
          <div class="field"><label for="f-cat">Категория</label>
            <select id="f-cat" name="category" class="select"><option value="">Все категории</option>
              ${S.config.categories.map((c) => html`<option value="${c.id}" ${c.id === category ? raw('selected') : ''}>${c.name}</option>`)}
            </select></div>
          <div id="f-extra" class="f-extra"></div>
          <div class="field"><label for="f-city">Город</label>
            <input id="f-city" name="city" class="input" list="cities" placeholder="Вся Россия" value="${params.city || ''}">
            <datalist id="cities">${S.config.cities.map((c) => html`<option value="${c}">`)}</datalist></div>
          <div id="f-metro"></div>
          <div class="field"><span class="label">Цена, ₽</span>
            <div class="row"><label class="sr" for="f-min">Цена от</label><input id="f-min" name="min" class="input" inputmode="numeric" placeholder="от" value="${params.min || ''}">
            <label class="sr" for="f-max">Цена до</label><input id="f-max" name="max" class="input" inputmode="numeric" placeholder="до" value="${params.max || ''}"></div></div>
          ${[['delivery', 'С доставкой'], ['bargain', 'Торг уместен'], ['exchange', 'Возможен обмен']].map(([k, t]) => html`<label class="switch"><span>${t}</span><input type="checkbox" name="${k}" value="1" ${params[k] === '1' ? raw('checked') : ''}><span class="track"></span></label>`)}
          <button class="btn btn-dark btn-block" type="submit">Показать</button>
          <a href="/search${params.q ? `?q=${encodeURIComponent(params.q)}` : ''}" class="btn btn-soft btn-block">Сбросить</a>
        </form>
      </aside>
      <section class="results">
        <div class="results-head">
          <div><h1>${title}</h1><div class="muted" id="count">&nbsp;</div></div>
          <button type="button" class="btn btn-soft save-search" id="save-search">${ic('bell', 18, 2)}<span>Сохранить поиск</span></button>
          <label class="sr" for="sort">Сортировка</label>
          <select id="sort" class="select" style="width:auto;min-width:200px;height:44px;border-radius:999px">
            <option value="">Сначала новые</option>
            <option value="cheap" ${params.sort === 'cheap' ? raw('selected') : ''}>Сначала дешевле</option>
            <option value="expensive" ${params.sort === 'expensive' ? raw('selected') : ''}>Сначала дороже</option>
          </select>
        </div>
        ${subChips.length ? html`<nav class="sub-chips" aria-label="Разделы">${subChips.map((x) => html`<a class="chip" href="/search?${new URLSearchParams({ ...params, category, sub: x.id })}">${x.name}</a>`)}</nav>` : ''}
        ${activeChips.length ? html`<div class="active-chips">${activeChips.map(([t, href]) => html`<a class="chip on" href="${href}" aria-label="Убрать: ${t}">${t}${ic('close', 14, 2.2)}</a>`)}</div>` : ''}
        <div class="understood" id="understood"></div>
        <div id="results">${skeletonGrid(9)}</div>
        <div class="more hidden"></div>
      </section>
    </div>`);

    const ff = $('#filter-form');
    // Раздел и характеристики зависят от категории и раздела — перестраиваем без перезагрузки.
    const renderExtra = (cat, sb) => {
      const subs = subsOf(cat);
      const x = subOf(sb);
      const val = (k) => params[k] || '';
      $('#f-extra').innerHTML = String(html`
        ${subs.length ? html`<div class="field"><label for="f-sub">Раздел</label><select id="f-sub" name="sub" class="select"><option value="">Все разделы</option>
          ${subs.map((y) => html`<option value="${y.id}" ${y.id === sb ? raw('selected') : ''}>${y.name}</option>`)}</select></div>` : ''}
        ${x ? x.fields.map((f) => (f.type === 'select'
    ? html`<input type="hidden" name="a_${f.key}" value="${val(`a_${f.key}`)}">${attrChoice(f, val(`a_${f.key}`), { filter: true })}`
    : html`<div class="field"><span class="label">${f.label}${f.unit ? `, ${f.unit}` : ''}</span><div class="row">
        <label class="sr" for="fa-${f.key}-min">${f.label} от</label><input id="fa-${f.key}-min" name="a_${f.key}_min" class="input" inputmode="numeric" placeholder="от" value="${val(`a_${f.key}_min`)}">
        <label class="sr" for="fa-${f.key}-max">${f.label} до</label><input id="fa-${f.key}-max" name="a_${f.key}_max" class="input" inputmode="numeric" placeholder="до" value="${val(`a_${f.key}_max`)}"></div></div>`)) : ''}`);
      const fs = $('#f-sub');
      if (fs) fs.onchange = () => renderExtra(cat, fs.value);
    };
    // Характеристики-списки в фильтрах — чипсами; значение лежит в скрытом поле a_<ключ>.
    bindAttrChoices($('#f-extra'), { find: (fn) => (subOf(($('#f-sub') || {}).value || '') || { fields: [] }).fields.find(fn) },
      (k) => { const i = $(`#f-extra input[name="a_${k}"]`); return i ? i.value : ''; },
      (k, v) => { const i = $(`#f-extra input[name="a_${k}"]`); if (i) i.value = v || ''; }, { filter: true });
    renderExtra(category, sub);
    $('#f-cat').onchange = (e) => renderExtra(e.target.value, '');
    // Метро — когда в городе есть метро (справочник hh.ru).
    const renderMetro = async () => {
      const city = $('#f-city').value.trim();
      const box = $('#f-metro');
      if (!hasMetro(city)) { box.innerHTML = ''; return; }
      const list = await metroOf(city);
      if (!list.length || $('#f-city').value.trim() !== city) return;
      box.innerHTML = String(html`<div class="field"><label for="f-mt">Метро</label><select id="f-mt" name="metro" class="select"><option value="">Любая станция</option>
        ${list.map((m) => html`<option value="${m.name}" data-color="${m.color}" data-line="${m.line}" ${m.name === params.metro ? raw('selected') : ''}>${m.name}</option>`)}</select></div>`);
    };
    renderMetro();
    $('#f-city').addEventListener('change', renderMetro);
    const toggle = $('#filters-toggle');
    if (window.matchMedia('(max-width: 900px)').matches) {
      toggle.style.display = '';
      toggle.onclick = () => $('#filters').classList.toggle('collapsed');
    } else {
      $('#filters').classList.remove('collapsed');
    }
    ff.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(ff);
      const next = {};
      for (const [k, v] of fd.entries()) if (String(v).trim()) next[k] = String(v).trim();
      if (params.sort) next.sort = params.sort;
      next.city = next.city || '';
      goSearch(next);
    };
    $('#sort').onchange = (e) => { const p = { ...params, sort: e.target.value }; go(`/search?${new URLSearchParams(Object.entries(p).filter(([, v]) => v))}`); };
    bindSaveSearch($('#save-search'), params);

    await listingFeed($('#results'), params, {
      empty: html`<div class="empty"><h3>Ничего не нашлось</h3><p>Попробуйте другие слова, уберите часть фильтров или поищите по всей России.</p><a href="/search" class="btn btn-dark">Все объявления</a></div>`,
      onFirst: (data) => {
        $('#count').textContent = `${NF.format(data.total)} ${plural(data.total, 'объявление', 'объявления', 'объявлений')}`;
        const u = data.understood || {};
        const chips = [];
        if (params.q) {
          if (u.city && !params.city) chips.push(html`<span class="tag">${ic('pin', 14)}&nbsp;${u.city}</span>`);
          if (u.min && !params.min) chips.push(html`<span class="tag">от ${NF.format(u.min)} ₽</span>`);
          if (u.max && !params.max) chips.push(html`<span class="tag">до ${NF.format(u.max)} ₽</span>`);
          if (u.delivery && !params.delivery) chips.push(html`<span class="tag">с доставкой</span>`);
        }
        $('#understood').innerHTML = chips.length ? String(html`<span class="muted" style="font-size:14px;align-self:center">Поняли запрос:</span>${chips}`) : '';
      }
    }).first;
    await adRow($('#results'), params, '', 'подобрано по запросу и фильтрам');
  }

  // ---------- сохранённые поиски ----------
  // Параметры поиска в том же виде, что хранит сервер: только эти поля, без пустых, в этом порядке.
  const SEARCH_KEYS = ['q', 'category', 'sub', 'city', 'metro', 'min', 'max', 'delivery', 'bargain', 'exchange'];
  const searchParams = (p) => {
    const x = subOf(p.sub);
    const attrs = x ? Object.keys(p).filter((k) => /^a_[A-Za-z]+(_min|_max)?$/.test(k) && x.fields.some((f) => k.replace(/^a_|_min$|_max$/g, '') === f.key)).sort() : [];
    return Object.fromEntries([...SEARCH_KEYS, ...attrs].map((k) => [k, String(p[k] || '').trim()]).filter(([, v]) => v && v !== '0'));
  };
  const searchUrl = (s) => `/search?${new URLSearchParams({ ...s.params, ss: s.id })}`;
  async function bindSaveSearch(btn, params) {
    const want = JSON.stringify(searchParams(params));
    let saved = null;
    const paint = () => {
      btn.classList.toggle('on', !!saved);
      btn.innerHTML = String(html`${ic(saved ? 'check' : 'bell', 18, 2)}<span>${saved ? 'Поиск сохранён' : 'Сохранить поиск'}</span>`);
      btn.title = saved ? 'Пришлём уведомление о новых объявлениях. Нажмите, чтобы удалить поиск.' : 'Пришлём уведомление, когда появятся новые объявления';
    };
    if (S.user) {
      const { items } = await api('GET', '/api/saved-searches').catch(() => ({ items: [] }));
      saved = items.find((x) => JSON.stringify(x.params) === want) || null;
      if (saved && params.ss && Number(params.ss) === saved.id && saved.fresh) api('POST', `/api/saved-searches/${saved.id}/seen`).then(refreshMe).catch(() => {});
    }
    paint();
    btn.onclick = async () => {
      if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
      try {
        if (saved) { await api('DELETE', `/api/saved-searches/${saved.id}`); saved = null; toast('Поиск удалён'); }
        else { saved = (await api('POST', '/api/saved-searches', searchParams(params))).search; toast('Поиск сохранён — пришлём уведомление о новых объявлениях'); }
        paint();
      } catch (e) { toast(e.message, true); }
    };
  }

  // Подписки на продавцов: кто (сколько нового), лента их свежих объявлений; новое помечено.
  async function renderFollowing(reload) {
    const { sellers, items } = await api('GET', '/api/my/following');
    refreshMe();
    const box = $('#box');
    if (!sellers.length) {
      box.innerHTML = String(html`<div class="empty"><h3>Вы ни на кого не подписаны</h3><p>Откройте профиль продавца или магазина и нажмите «Подписаться» — новые объявления придут уведомлением и в подборке на почту.</p><a class="btn btn-dark" href="/">Смотреть объявления</a></div>`);
      return;
    }
    box.innerHTML = String(html`<div id="nudge"></div>
      <div class="fl-sellers">${sellers.map((x) => html`<div class="fl-seller">
        <a href="/u/${x.id}" class="fl-who">${ava(x)}<span class="fl-txt"><b>${x.name}${x.shop ? html` <span class="pf-badge dark">${ic('store', 12, 2)} Магазин</span>` : ''}</b><span>${x.active} ${plural(x.active, 'объявление', 'объявления', 'объявлений')}${x.city ? ` · ${x.city}` : ''}</span></span>
          ${x.fresh ? html`<span class="ss-new">${x.fresh} ${plural(x.fresh, 'новое', 'новых', 'новых')}</span>` : ''}</a>
        <button type="button" class="btn btn-line btn-sm" data-unfollow="${x.id}">Отписаться</button></div>`)}</div>
      <div class="section-head" style="margin-top:28px"><h2>Свежее у продавцов</h2></div>
      ${items.length ? grid(items) : html`<div class="pf-empty sm"><h3>Пока нет объявлений</h3><p>Как только продавцы что-то опубликуют, объявления появятся здесь.</p></div>`}`);
    pushNudge($('#nudge', box), 'Узнаете о новых объявлениях продавцов сразу.');
    $$('[data-unfollow]', box).forEach((b) => {
      b.onclick = async () => { try { await api('POST', `/api/users/${b.dataset.unfollow}/follow`, { follow: false }); toast('Вы отписались'); reload(); } catch (e) { toast(e.message, true); } };
    });
  }

  async function renderSavedSearches(reload) {
    const { items } = await api('GET', '/api/saved-searches');
    const box = $('#box');
    // Название поиска с сервера: «Что ищем · уточнения».
    const head = (s) => s.title.split(' · ')[0];
    const chips = (s) => s.title.split(' · ').slice(1);
    box.innerHTML = String(html`<div id="nudge"></div>
      ${items.length ? html`<div class="ss-list">${items.map((s) => html`<div class="ss-card">
          <a class="ss-main" href="${searchUrl(s)}"><span class="ss-ic">${ic(s.params.category ? 'tag' : 'search', 20, 2)}</span>
            <span class="ss-txt"><b>${head(s)}</b>
              <span>${chips(s).join(' · ') || 'Вся Россия'}</span></span>
            ${s.fresh ? html`<span class="ss-new">${s.fresh} ${plural(s.fresh, 'новое', 'новых', 'новых')}</span>` : ''}</a>
          <div class="ss-side">
            <label class="mini-switch" title="Уведомлять о новых"><input type="checkbox" data-ss-notify="${s.id}" ${s.notify ? raw('checked') : ''}><span class="track"></span><span class="sr">Уведомлять</span></label>
            <button type="button" class="icon-btn sm" data-ss-del="${s.id}" aria-label="Удалить поиск">${ic('trash', 17)}</button>
          </div></div>`)}</div>
        <p class="muted" style="margin:0;font-size:14px">Новые объявления по включённым поискам приходят push-уведомлением и подборкой на почту раз в день. Настроить — <a href="/profile/settings#sn" style="text-decoration:underline">в настройках</a>.</p>`
      : html`<div class="empty"><h3>Сохранённых поисков пока нет</h3><p>В выдаче нажмите «Сохранить поиск» — расскажем, когда появятся новые объявления.</p><a class="btn btn-dark" href="/search">Перейти к поиску</a></div>`}`);
    pushNudge($('#nudge', box), 'Сразу узнаете о новых объявлениях по вашим поискам.');
    $$('[data-ss-notify]', box).forEach((c) => {
      c.onchange = async () => { try { await api('PATCH', `/api/saved-searches/${c.dataset.ssNotify}`, { notify: c.checked }); toast(c.checked ? 'Будем уведомлять' : 'Уведомления по поиску выключены'); } catch (e) { c.checked = !c.checked; toast(e.message, true); } };
    });
    $$('[data-ss-del]', box).forEach((b) => {
      b.onclick = async () => { try { await api('DELETE', `/api/saved-searches/${b.dataset.ssDel}`); toast('Поиск удалён'); reload(); refreshMe(); } catch (e) { toast(e.message, true); } };
    });
  }

  // ================= объявление =================
  async function viewListing(id) {
    const data = await api('GET', `/api/listings/${id}`);
    const { listing: l, seller, similar, market } = data;
    setTitle(l.title);
    if (location.pathname !== lpath(l)) history.replaceState(history.state, '', lpath(l) + location.search); // адрес с названием
    let idx = 0;
    const photos = l.photos;
    // Галерея: фото, затем видео (если есть).
    const media = [...photos.map((src) => ({ src })), ...(l.video ? [{ src: l.video, video: true }] : [])];
    const vIdx = l.video ? media.length - 1 : -1;
    const mediaEl = (m) => (m.video
      ? html`<video class="g-video" src="${m.src}#t=0.1" controls playsinline preload="metadata"></video>`
      : html`<span class="g-ph" style="--ph:url('${m.src}')" aria-hidden="true"></span><img id="gimg" src="${m.src}" alt="${l.title}">`);
    const station = l.metro ? html`<span class="metro"><i style="--mline:${l.metro.color || '#C9C9C4'}"></i>${l.metro.name}</span>` : '';
    const marketChip = market ? ({
      below: html`<span class="tag accent">Ниже рынка</span>`,
      market: html`<span class="tag"><span class="dot"></span>&nbsp;Цена в рынке</span>`,
      above: html`<span class="tag">Выше рынка</span>`
    })[market.level] : '';
    // 1.22: два списка «название — значение»: что за товар и условия сделки.
    const specs = [
      ['Раздел', l.subcategory ? subName(l.subcategory) : catName(l.category)],
      ...(l.specs || []).map((x) => [x.label, x.value]),
      CONDITION_CATS.has(l.category) && l.condition ? ['Состояние', CONDITION_LABEL[l.condition]] : null
    ].filter(Boolean);
    const terms = [
      ['Где', html`${l.city}${l.metro ? html`<span class="kv-sub">${station}</span>` : ''}${l.district ? html`<span class="kv-sub">${l.district}</span>` : ''}`],
      ['Доставка', l.delivery ? 'Отправит по России' : 'Только встреча'],
      l.price !== null ? ['Торг', l.bargain ? 'Уместен' : 'Без торга'] : null,
      l.exchange ? ['Обмен', 'Возможен'] : null,
      ['Опубликовано', when(l.createdAt)]
    ].filter(Boolean);
    const kv = (rows) => html`<dl class="kv">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;

    let ownerBanner = '';
    if (l.isOwner && l.status === 'rejected') {
      ownerBanner = html`<div class="banner danger"><strong>Объявление отклонено модерацией.</strong> Причина: ${l.rejectReason || 'не указана'}.
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-dark btn-sm" href="/edit/${l.id}">Исправить</a>
        ${l.appealReply ? '' : l.appealText ? html`<span class="tag">Апелляция отправлена</span>` : html`<button class="btn btn-line btn-sm" data-appeal>Не согласен — подать апелляцию</button>`}</div>
        ${l.appealReply ? html`<div style="margin-top:10px"><strong>Ответ на апелляцию:</strong> ${l.appealReply}</div>` : ''}</div>`;
    } else if (l.isOwner && l.status === 'pending') {
      ownerBanner = html`<div class="banner warn"><strong>Объявление на проверке.</strong> Каждое объявление перед публикацией проверяет модератор — обычно это занимает несколько часов${S.config.mail ? ', о решении напишем на почту' : ''}.
        ${l.flags ? html`Оно похоже на товар из раздела «${l.flags}» <a href="/page/rules" style="text-decoration:underline">правил</a> — проверим внимательнее.` : ''}</div>`;
    } else if (l.isOwner && l.status === 'scheduled') {
      ownerBanner = html`<div class="banner ok"><strong>Проверено — опубликуем ${atTime(l.publishAt)} (мск).</strong> До этого объявление видите только вы. Опубликовать раньше можно кнопкой справа.</div>`;
    } else if (l.isOwner && l.status === 'archived') {
      ownerBanner = isExpired(l)
        ? html`<div class="banner soft"><strong>Прошло 30 дней — объявление снято.</strong> Если ещё актуально, опубликуйте снова: это бесплатно, оно окажется среди свежих.</div>`
        : html`<div class="banner soft"><strong>Объявление снято с публикации.</strong> Его не видят покупатели.</div>`;
    }

    let actions;
    const pm = data.promo;
    if (l.isOwner) {
      // 1.22: карточка автора — главное действие крупно, остальное плитками, «Удалить» — тихой ссылкой внизу.
      const tile = (attrs, icon, label, cls = '') => html`<button type="button" class="own-act ${cls}" ${raw(attrs)}>${ic(icon, 20, 1.9)}<span>${label}</span></button>`;
      const tiles = [
        ['active', 'sold', 'archived'].includes(l.status) ? html`<a class="own-act" href="/profile/stats/${l.id}">${ic('chart', 20, 1.9)}<span>Статистика</span></a>` : '',
        l.status === 'active' ? tile('data-status="sold"', 'check', 'Продано') : '',
        l.status === 'active' ? tile('data-status="archived"', 'pause', 'Снять') : '',
        l.status === 'scheduled' ? tile('data-status="archived"', 'pause', 'Не публиковать') : '',
        l.status === 'sold' || (l.status === 'archived' && !isExpired(l)) ? tile('data-status="active"', 'refresh', 'Опубликовать снова') : ''
      ].filter((x) => String(x));
      const canPromote = ['active', 'pending', 'scheduled'].includes(l.status) && (boostOn() || pm || (data.boost || []).length);
      actions = html`<div class="own">
        ${pm ? html`<div class="promo-now ${pm.status}">${ic(pm.status === 'active' ? 'megaphone' : 'clock', 20)}<div><b>${PROMO_STATUS[pm.status][1]}</b><span>${promoLine(pm)}</span></div></div>` : ''}
        ${(data.boost || []).length ? html`<div class="promo-now active">${ic('bolt', 20)}<div><b>Продвигается</b><span>${data.boost.map((b) => `${b.kinds.map((k) => BOOST.find((x) => x[0] === k)[2]).join(', ')} — ${b.tagsState === 'review' ? 'метки на проверке, ' : b.tagsState === 'off' ? 'метки не одобрены, ' : ''}${boostState(b)}`).join('; ')}</span></div></div>` : ''}
        ${isExpired(l) ? html`<button class="btn btn-accent btn-lg btn-block" data-status="active">${ic('refresh', 20, 2)}Опубликовать снова</button>` : ''}
        ${l.status === 'scheduled' ? html`<button class="btn btn-accent btn-lg btn-block" data-status="active">Опубликовать сейчас</button>` : ''}
        <a class="btn btn-dark btn-lg btn-block" href="/edit/${l.id}">${ic('edit', 19, 2)}${l.status === 'rejected' ? 'Исправить' : 'Редактировать'}</a>
        ${canPromote ? html`<button type="button" class="own-promo" data-promote><span class="own-promo-ic">${ic('bolt', 20, 2)}</span><span><b>Продвинуть</b><small>XL, рамка, метки · от ${rub(Math.min(...Object.values(boostPrices())))}</small></span>${ic('right', 18, 2)}</button>` : ''}
        ${tiles.length ? html`<div class="own-acts n${tiles.length}">${tiles}</div>` : ''}
        <button type="button" class="own-del" data-delete>${ic('trash', 16, 2)}Удалить объявление</button>
      </div>`;
    } else if (l.status === 'active') {
      actions = html`<div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-accent btn-lg btn-block" data-write>${ic('chat', 20)}Написать продавцу</button>
        ${l.price && l.bargain ? html`<button class="btn btn-soft btn-lg btn-block" data-offer>${ic('tag', 19, 2)}Предложить цену</button>` : ''}
        <button class="btn btn-line btn-block" data-report>${ic('warn', 18)}Пожаловаться</button>
      </div>`;
    } else {
      actions = html`<div class="banner soft">Товар уже продан. Посмотрите похожие объявления ниже.</div>`;
    }

    app.innerHTML = String(html`<div class="wrap">
      <nav class="crumbs" aria-label="Навигация"><a href="/">Главная</a><span aria-hidden="true">›</span><a href="${cpath(l.category)}">${catName(l.category)}</a><span aria-hidden="true">›</span><a href="${cpath(l.category, l.city)}">${l.city}</a></nav>
      ${ownerBanner ? html`<div style="margin-bottom:20px">${ownerBanner}</div>` : ''}
      <div class="item">
        <div class="item-main">
          <div>
            <div class="gallery-main" id="gallery">
              <div class="g-media" id="gmedia">${media.length ? mediaEl(media[0]) : svg(P.image, 56, 1.1)}</div>
              ${media.length > 1 ? html`
                <button class="icon-btn white gallery-nav prev" data-g="-1" aria-label="Назад">${ic('left', 20)}</button>
                <button class="icon-btn white gallery-nav next" data-g="1" aria-label="Вперёд">${ic('right', 20)}</button>
                <span class="gallery-count" id="gcount">1 из ${media.length}</span>` : ''}
              ${vIdx > 0 ? html`<button type="button" class="g-video-btn" id="gvbtn" data-t="${vIdx}">${ic('play', 14, 0)}Видео</button>` : ''}
              ${l.status === 'sold' ? html`<span class="tag dark" style="position:absolute;top:18px;left:18px">Продано</span>` : ''}
            </div>
            ${media.length > 1 ? html`<div class="thumbs">${media.map((m, i) => (m.video
    ? html`<button class="thumb vthumb ${i === 0 ? 'on' : ''}" data-t="${i}" aria-label="Видео">${photos[0] ? html`<img src="${photos[0]}" alt="" loading="lazy">` : ''}<span>${ic('play', 16, 0)}</span></button>`
    : html`<button class="thumb ${i === 0 ? 'on' : ''}" data-t="${i}" aria-label="Фото ${i + 1}"><img src="${m.src}" alt="" loading="lazy"></button>`))}</div>` : ''}
          </div>
          <section class="kv-sec"><h2 class="h2">Характеристики</h2>${kv(specs)}</section>
          ${l.description ? html`<section><h2 class="h2">Описание</h2><p class="desc">${l.description}</p></section>` : ''}
          <section class="kv-sec"><h2 class="h2">Условия</h2>${kv(terms)}</section>
        </div>
        <aside class="item-side">
          <div class="panel panel-shadow" style="display:flex;flex-direction:column;gap:22px">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <div style="flex:1;min-width:0">${l.isOwner ? html`<span class="own-state ${(isExpired(l) ? ['off'] : MY_TAG[l.status] || MY_TAG.archived)[0]}"><i></i>${isExpired(l) ? 'Срок истёк' : (MY_TAG[l.status] || MY_TAG.archived)[1]}${l.status === 'active' && l.expiresAt ? html`<em>до ${dateShort(l.expiresAt)}</em>` : ''}</span>` : ''}<h1 class="item-title">${l.title}</h1><p class="muted" style="margin:8px 0 0;font-size:14px">${l.city} · ${when(l.createdAt)}</p>
                ${l.metro || l.district ? html`<p class="item-where">${station}${l.district ? html`<span class="iw-d">${l.metro ? html`<span class="muted">·&nbsp;</span>` : ''}${l.district}</span>` : ''}</p>` : ''}
                <p class="item-counts"><span title="Просмотры">${ic('eye', 16)}<span data-views>${NF.format(l.views)} ${plural(l.views, 'просмотр', 'просмотра', 'просмотров')}</span></span><span title="В избранном">${ic('heart', 16)}<span data-favs>в избранном у ${NF.format(l.favCount)}</span></span></p></div>
              ${l.isOwner ? '' : html`<button class="icon-btn ${l.isFav ? 'on' : ''}" data-fav="${l.id}" aria-label="${l.isFav ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${l.isFav ? 'true' : 'false'}">${ic('heart', 20)}</button>`}
              <button class="icon-btn" data-share aria-label="Поделиться">${ic('share', 20)}</button>
            </div>
            <div><div class="item-price">${price(l.price, l.priceUnit)}${l.priceWas ? html` <s class="price-was">${price(l.priceWas, l.priceUnit)}</s>` : ''}</div>
              ${marketChip ? html`<div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${marketChip}<span class="muted" style="font-size:13px">по ${market.count} ${plural(market.count, 'похожему объявлению', 'похожим объявлениям', 'похожим объявлениям')}</span></div>` : ''}
            </div>
            ${actions}
            <div style="display:${l.isOwner ? 'none' : 'flex'};flex-direction:column;gap:14px">
              ${S.config.payments
    ? html`<div class="note"><span style="color:var(--accent)">${ic('shield', 22)}</span><div><strong>Безопасная сделка.</strong> Продавец получит деньги, только когда вы заберёте и проверите товар.</div></div>`
    : html`<div class="note"><span style="color:var(--accent)">${ic('shield', 22)}</span><div><strong>Общайтесь в чате Торганы.</strong> Так переписка сохранится, а мы сможем помочь при споре.</div></div>`}
              ${l.delivery ? html`<div class="note">${ic('truck', 22)}<div><strong>Доставка по России.</strong> Продавец готов отправить товар — договоритесь о способе в чате.</div></div>` : ''}
            </div>
          </div>
          <a href="/u/${seller.id}" class="panel" style="display:flex;align-items:center;gap:14px;color:var(--text)">
            ${ava(seller)}
            <span style="flex:1;min-width:0"><span style="display:block;font-size:17px;font-weight:700">${seller.name}</span>
            ${ratingLine(seller.rating)}
            <span class="muted" style="display:block;font-size:13px">На Торгане с ${since(seller.createdAt)} · ${seller.activeCount} ${plural(seller.activeCount, 'объявление', 'объявления', 'объявлений')}</span>
            ${seller.badges && (seller.badges.phone || seller.badges.biz) ? html`<span class="pf-badges" style="margin-top:8px">${trustBadges(seller.badges)}</span>` : ''}</span>
            ${ic('right', 20)}
          </a>
          ${l.isOwner ? '' : html`<div class="seller-follow">${followBtn(seller.id, seller.following)}<span class="muted"><b data-followers>${NF.format(seller.followers || 0)}</b> ${plural(seller.followers || 0, 'подписчик', 'подписчика', 'подписчиков')} · узнают о новых объявлениях первыми</span></div>`}
          <div class="banner soft" style="font-size:14px"><strong style="color:var(--text)">Мы никогда не просим</strong> переходить в мессенджеры, называть код из СМС или платить по ссылке. Если вас об этом просят — это мошенники.</div>
        </aside>
      </div>
      ${similar.length ? html`<section class="section"><div class="section-head"><h2>Похожие объявления</h2><a href="${cpath(l.category, l.city)}">Смотреть все</a></div>${grid(similar)}</section>` : ''}
    </div>`);

    if (l.status === 'active') api('POST', '/api/stats/view', { id: l.id, src: statSource() }).catch(() => {});

    // галерея
    const show = (i) => {
      if (media.length < 2) return;
      idx = (i + media.length) % media.length;
      $('#gmedia').innerHTML = String(mediaEl(media[idx]));
      const c = $('#gcount'); if (c) c.textContent = `${idx + 1} из ${media.length}`;
      const vb = $('#gvbtn'); if (vb) vb.hidden = idx === vIdx;
      $('#gallery').classList.toggle('is-video', idx === vIdx);
      $$('.thumb').forEach((t, j) => t.classList.toggle('on', j === idx));
    };
    if (vIdx === 0) $('#gallery').classList.add('is-video');
    // Нажатие на фото — просмотр на весь экран внутри Торганы (видео играет на месте).
    const photoList = media.filter((m) => !m.video).map((m) => m.src);
    $('#gmedia').addEventListener('click', (e) => {
      if (!e.target.closest('#gimg')) return;
      photoViewer(photoList, photoList.indexOf(media[idx] && media[idx].src), l.title);
    });
    $$('[data-g]').forEach((b) => { b.onclick = () => show(idx + Number(b.dataset.g)); });
    $$('[data-t]').forEach((b) => { b.onclick = () => show(Number(b.dataset.t)); });
    let tx = null;
    const g = $('#gallery');
    g.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
    g.addEventListener('touchend', (e) => { if (tx === null || idx === vIdx) { tx = null; return; } const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1)); tx = null; });

    $('[data-share]').onclick = async () => {
      const url = location.href;
      if (navigator.share) { try { await navigator.share({ title: l.title, url }); return; } catch { /* отмена */ } }
      try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { toast(url); }
    };

    const of = $('[data-offer]');
    if (of) {
      of.onclick = () => {
        if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
        offerModal({ listingPrice: l.price, title: l.title, onSubmit: async (sum) => {
          const { id: cid } = await api('POST', '/api/conversations', { listingId: l.id });
          await api('POST', `/api/conversations/${cid}/offer`, { price: sum });
          toast('Предложение отправлено — ответ придёт в чат');
          go(`/messages/${cid}`);
        } });
      };
    }
    const w = $('[data-write]');
    if (w) {
      w.onclick = async () => {
        if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
        try { const { id: cid } = await api('POST', '/api/conversations', { listingId: l.id }); go(`/messages/${cid}`); } catch (e) { toast(e.message, true); }
      };
    }
    $$('[data-status]').forEach((b) => {
      b.onclick = async () => {
        try {
          await api('PATCH', `/api/listings/${l.id}`, { status: b.dataset.status });
          toast({ sold: 'Отмечено как проданное', active: l.status === 'scheduled' ? 'Объявление опубликовано' : 'Объявление снова опубликовано', archived: l.status === 'scheduled' ? 'Публикация отменена' : 'Снято с публикации' }[b.dataset.status]);
          render();
        } catch (e) { toast(e.message, true); }
      };
    });
    const del = $('[data-delete]');
    if (del) {
      del.onclick = async () => {
        if (!(await confirmModal('Удалить объявление?', 'Объявление и фото удалятся без возможности восстановления.', 'Удалить', true))) return;
        try { await api('DELETE', `/api/listings/${l.id}`); toast('Объявление удалено'); go('/profile', true); } catch (e) { toast(e.message, true); }
      };
    }
    const ap = $('[data-appeal]');
    if (ap) ap.onclick = () => appealModal(l.id, () => render());
    const pr = $('[data-promote]');
    if (pr) pr.onclick = () => boostModal(l.id, l.title, pm);
    const rp = $('[data-report]');
    if (rp) {
      rp.onclick = () => {
        if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
        reasonModal({ title: 'Пожаловаться на объявление', hint: 'Жалобу рассмотрит модератор. Продавец не узнает, кто пожаловался.', url: `/api/listings/${l.id}/report`,
          okLabel: 'Отправить', reasons: REPORT_REASONS, pick: true, placeholder: 'Что не так? Например: просит предоплату на карту', danger: false, done: () => {} });
      };
    }
  }

  function appealModal(id, done) {
    openModal(String(html`<h2>Апелляция</h2><p class="muted" style="margin:0 0 14px">Объясните, почему решение модерации стоит пересмотреть. Апелляцию рассмотрит человек.</p>
      <label class="sr" for="ap-text">Текст апелляции</label>
      <textarea id="ap-text" class="textarea" maxlength="1000" placeholder="Например: на фото именно этот товар, вот ещё детали…"></textarea>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Отправить</button></div>`), (m, close) => {
      $('[data-x]', m).onclick = close;
      $('[data-ok]', m).onclick = async () => {
        try { await api('POST', `/api/listings/${id}/appeal`, { text: $('#ap-text', m).value }); close(); toast('Апелляция отправлена'); done(); } catch (e) { toast(e.message, true); }
      };
    });
  }

  // ================= размещение и редактирование =================
  // square — обрезать по центру до квадрата (фото профиля).
  // Отпечаток фото (dHash, 64 бита): одинаковые снимки дают почти одинаковый отпечаток даже после пересжатия.
  // Нужен модератору — подсказать, что фото уже есть у другого продавца.
  function photoHash(src) {
    const c = document.createElement('canvas');
    c.width = 9; c.height = 8;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, 9, 8);
    const px = ctx.getImageData(0, 0, 9, 8).data;
    const g = (x, y) => { const i = (y * 9 + x) * 4; return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; };
    let bits = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += g(x, y) > g(x + 1, y) ? '1' : '0';
    return bits.match(/.{4}/g).map((b) => parseInt(b, 2).toString(16)).join('');
  }
  // Уменьшает фото в браузере → { data: JPEG data-URL, hash: отпечаток }.
  function resizeImage(file, max = 1600, square = false) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sw = square ? side : img.naturalWidth;
        const sh = square ? side : img.naturalHeight;
        const scale = Math.min(1, max / Math.max(sw, sh));
        const w = Math.round(sw * scale);
        const h = Math.round(sh * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve({ data: c.toDataURL('image/jpeg', 0.85), hash: photoHash(c) });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото. Попробуйте JPG или PNG.')); };
      img.src = url;
    });
  }

  // ================= новое объявление и правка =================
  // Шесть шагов по одному на экране: фото, что продаёте, цена (торг, обмен), где, описание, публикация (сразу или в выбранное время).
  // Сверху полоска шагов — можно перейти к любому; «Далее» проверяет обязательное на текущем шаге.
  // На компьютере справа — превью карточки, что осталось заполнить и кнопка; на телефоне внизу «‹» и «Далее» вместо нижнего меню.
  // Новое объявление пишется в черновик в браузере (tg_draft) вместе с шагом — закрыли страницу, ничего не потеряли.
  const UNIT_LABEL = { '': 'за всё', мес: 'в месяц', сутки: 'за сутки', час: 'за час', 'м²': 'за м²', шт: 'за штуку' };
  const DESC_TIPS = ['Состояние', 'Комплектация', 'Причина продажи', 'Дефекты', 'Где можно посмотреть'];
  const DRAFT_KEY = 'tg_draft';
  // ================= продвижение в ленте (1.21) =================
  // Один выбор для формы объявления и окна «Продвинуть»: XL-карточка, рамка, метки (до двух) и пакет «Всё в одном».
  // Цена считается так же, как на сервере (lib/boost.js): все три — по цене пакета, если он дешевле суммы.
  const BOOST = [['xl', 'xl', 'XL-карточка', 'Две ячейки, три фото и описание'], ['frame', 'frame', 'Яркая рамка', 'Изумрудная обводка карточки'], ['tags', 'tag', 'Метки на фото', 'До двух — после проверки модератором']];
  const boostOn = () => !!(S.config.billing && S.config.billing.ready);
  const boostPrices = () => (S.config.billing && S.config.billing.prices && S.config.billing.prices.boost) || { xl: 99, frame: 39, tags: 29, all: 129 };
  function boostQuote(b) {
    const pr = boostPrices();
    const on = { xl: !!b.xl, frame: !!b.frame, tags: !!b.tagsOn };
    const full = (on.xl ? pr.xl : 0) + (on.frame ? pr.frame : 0) + (on.tags ? pr.tags : 0);
    const bundle = on.xl && on.frame && on.tags && pr.all < full;
    return { amount: bundle ? pr.all : full, full, bundle, any: on.xl || on.frame || on.tags };
  }
  // Что уже идёт или оплачено (current — из /api/listings/:id): такие услуги второй раз не купить.
  function boostBusy(current) {
    const busy = {};
    (current || []).forEach((b) => b.kinds.forEach((k) => { if (k !== 'tags' || b.tagsState !== 'off') busy[k] = b; }));
    return busy;
  }
  const boostState = (b) => (b.status === 'waiting' ? 'с публикацией' : `до ${dateShort(b.endsAt)}`);
  function boostPicker(busy = {}) {
    const pr = boostPrices();
    const sum = pr.xl + pr.frame + pr.tags;
    const free = BOOST.filter(([k]) => !busy[k]);
    return html`<div class="bp" data-bp>
      <div class="bp-grid">${BOOST.map(([k, icon, t, sub]) => html`<label class="bp-opt${busy[k] ? ' busy' : ''}">
        <span class="bp-top"><span class="bp-ic">${ic(icon, 20, 1.9)}</span><input type="checkbox" data-bk="${k}" ${busy[k] ? raw('disabled') : ''}></span>
        <span class="bp-t"><b>${t}</b><em>${busy[k] ? (k === 'tags' && busy[k].tagsState === 'review' ? 'на проверке' : boostState(busy[k])) : rub(pr[k])}</em></span>
        <small>${sub}</small></label>`)}</div>
      <div class="bp-tags hidden" data-bp-tags role="group" aria-label="Метки на фото"><span class="bp-tags-h">Выберите одну или две</span>
        ${S.config.billing.boostTags.map((t) => html`<button type="button" class="bp-chip" data-tag="${t}" aria-pressed="false">${t}</button>`)}</div>
      ${free.length === 3 && pr.all < sum ? html`<label class="bp-all"><input type="checkbox" data-bk="all"><span class="bp-ic">${ic('bolt', 20, 1.9)}</span>
        <span class="bp-t"><b>Всё в одном</b><small>XL, рамка и метки · <span class="bp-save">выгоднее на ${rub(sum - pr.all)}</span></small></span><em>${rub(pr.all)}</em></label>` : ''}
    </div>`;
  }
  // st = { xl, frame, tagsOn, tags: [] }; onChange — после каждого изменения.
  function bindBoostPicker(root, st, onChange) {
    const box = $('[data-bp]', root);
    if (!box) return;
    const sync = () => {
      $$('[data-bk]', box).forEach((x) => { if (x.dataset.bk !== 'all' && !x.disabled) x.checked = x.dataset.bk === 'tags' ? st.tagsOn : !!st[x.dataset.bk]; });
      const all = $('[data-bk="all"]', box); if (all) all.checked = st.xl && st.frame && st.tagsOn;
      $('[data-bp-tags]', box).classList.toggle('hidden', !st.tagsOn);
      $$('[data-tag]', box).forEach((c) => { const on = st.tags.includes(c.dataset.tag); c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); c.disabled = !on && st.tags.length >= 2; });
      onChange();
    };
    box.addEventListener('change', (e) => {
      const k = e.target.dataset.bk;
      if (!k) return;
      if (k === 'all') { st.xl = st.frame = st.tagsOn = e.target.checked; } else if (k === 'tags') st.tagsOn = e.target.checked; else st[k] = e.target.checked;
      if (!st.tagsOn) st.tags = [];
      sync();
    });
    box.addEventListener('click', (e) => {
      const c = e.target.closest('[data-tag]');
      if (!c) return;
      const t = c.dataset.tag;
      st.tags = st.tags.includes(t) ? st.tags.filter((x) => x !== t) : [...st.tags, t].slice(0, 2);
      sync();
    });
    sync();
  }
  const boostBody = (st) => ({ xl: st.xl, frame: st.frame, tags: st.tagsOn ? st.tags : [] });
  const boostErr = (st) => (st.tagsOn && !st.tags.length ? 'Выберите метки для фото — одну или две.' : '');
  async function boostPay(listingId, st) {
    const r = await api('POST', `/api/listings/${listingId}/boost`, boostBody(st));
    location.href = r.url;
  }

  // «Продвинуть» опубликованное или ждущее публикации объявление (из «Моих объявлений» и со страницы объявления).
  async function boostModal(listingId, title, promo = null) {
    let d;
    try { d = await api('GET', `/api/listings/${listingId}/boost`); } catch (e) { toast(e.message, true); return; }
    const busy = boostBusy(d.current);
    const st = { xl: false, frame: false, tagsOn: false, tags: [] };
    const all = Object.keys(busy).length >= 3;
    const biz = isBiz() || promo;
    openModal(String(html`<div class="bm"><h2>Продвижение</h2><p class="muted bm-sub">«${title}» · ${d.days} дней${d.status === 'active' ? '' : ' с публикации'}</p>
      ${d.current.length ? html`<div class="bm-now">${d.current.map((b) => html`<div>${ic('check', 16, 2.4)}<span>${b.kinds.map((k) => BOOST.find((x) => x[0] === k)[2]).join(', ')}${b.tags.length ? ` (${b.tags.join(', ')})` : ''}</span><em>${b.tagsState === 'review' ? 'метки на проверке · ' : b.tagsState === 'off' ? 'метки не одобрены · ' : ''}${boostState(b)}</em></div>`)}</div>` : ''}
      ${all ? html`<p class="muted">Всё уже включено.</p>` : d.ready ? boostPicker(busy) : html`<p class="muted">Оплата пока не подключена.</p>`}
      <p class="bm-note">Порядок выдачи не меняется — карточка заметнее и подписана «Продвигается». Оплата на странице ЮKassa, чек — на ${S.user.email}. <a href="/page/terms#paid">Условия</a></p>
      ${biz ? html`<button type="button" class="bm-biz" data-biz>${ic('megaphone', 18, 2)}<span><b>Реклама над поиском</b><small>для ИП и компаний${promo ? ` · ${PROMO_STATUS[promo.status][1].toLowerCase()}` : ''}</small></span>${ic('right', 18, 2)}</button>` : ''}
      <div class="modal-actions"><button class="btn btn-soft" data-x>Закрыть</button>${!all && d.ready ? html`<button class="btn btn-accent" data-ok disabled>Выберите</button>` : ''}</div></div>`), (m, close) => {
      $('[data-x]', m).onclick = close;
      m.addEventListener('click', (e) => { if (e.target.closest('a[href]')) close(); });
      const bz = $('[data-biz]', m); if (bz) bz.onclick = () => { close(); promoteModal(listingId, title); };
      const ok = $('[data-ok]', m);
      if (!ok) return;
      bindBoostPicker(m, st, () => { const q = boostQuote(st); ok.disabled = !q.any; ok.textContent = q.any ? `Оплатить ${rub(q.amount)}` : 'Выберите'; });
      ok.onclick = async () => {
        const err = boostErr(st);
        if (err) { toast(err, true); return; }
        ok.disabled = true; ok.textContent = 'Открываем оплату…';
        try { await boostPay(listingId, st); } catch (ex) { toast(ex.message, true); ok.disabled = false; ok.textContent = `Оплатить ${rub(boostQuote(st).amount)}`; }
      };
    });
  }

  const ED_STEPS = [['s-photos', 'Фото'], ['s-what', 'Что продаёте'], ['s-price', 'Цена'], ['s-where', 'Где'], ['s-desc', 'Описание'], ['s-publish', 'Публикация']];
  // Публикация в выбранное время: дни на 30 вперёд и время с шагом 30 минут — по Москве (UTC+3 круглый год).
  const MSK = 3 * 3600 * 1000;
  const mskDay = (ts) => new Date(ts + MSK).toISOString().slice(0, 10);
  const mskTs = (day, time) => Date.parse(`${day}T${time}:00Z`) - MSK;
  const dayLabelLong = (day) => { const t = new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }); return t[0].toUpperCase() + t.slice(1); };
  const draftLoad = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return d && Date.now() - d.at < 20 * 3600 * 1000 ? d : null; } catch { return null; } };
  const draftSave = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, at: Date.now() })); } catch { /* приватный режим */ } };
  const draftDrop = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* нет хранилища */ } };

  async function viewEditor(id) {
    if (!requireAuth()) return;
    let l = null;
    if (id) {
      const data = await api('GET', `/api/listings/${id}`);
      if (!data.listing.isOwner) { viewNotFound(); return; }
      l = data.listing;
    }
    setTitle(l ? 'Редактирование' : 'Новое объявление');
    const draft = l ? null : draftLoad();
    const src = l ? { ...l, photos: l.photos.map((u) => ({ file: u.split('/').pop(), url: u })), negotiable: l.price === null } : draft || {};
    const srcVideo = l ? (l.video ? { file: l.video.split('/').pop().split('#')[0], url: l.video } : null) : (src.video && src.video.file ? src.video : null);
    const st = {
      photos: (src.photos || []).filter((p) => p.file),
      category: src.category || '', condition: src.condition || '', priceUnit: src.priceUnit || '',
      sub: src.subcategory || '', attrs: { ...(src.attrs || {}) }, video: srcVideo,
      negotiable: !!src.negotiable, busy: 0, tried: false,
      step: Math.min(Math.max(Number(src.step) || 0, 0), ED_STEPS.length - 1)
    };
    const units = S.config.priceUnits || [''];
    const sendLabel = l ? 'Сохранить' : 'Отправить на проверку';
    // Время публикации выбирают, пока объявление ещё не опубликовано.
    const canSchedule = !l || ['pending', 'scheduled', 'rejected'].includes(l.status);
    const at0 = src.publishAt && src.publishAt > Date.now() ? src.publishAt : null;
    const tomorrow10 = mskTs(mskDay(Date.now() + 24 * 3600 * 1000), '10:00');
    const days = Array.from({ length: 31 }, (_, i) => mskDay(Date.now() + i * 24 * 3600 * 1000));
    const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
    const atDay = mskDay(at0 || tomorrow10);
    const atClock = new Date((at0 || tomorrow10) + MSK).toISOString().slice(11, 16);
    // Продвижение: когда оплата подключена и объявление ещё можно показать (не продано и не снято).
    const canBoost = boostOn() && (!l || ['active', 'pending', 'scheduled', 'rejected'].includes(l.status));
    const busyBoost = boostBusy(l && l.boost);
    st.boost = { xl: false, frame: false, tagsOn: false, tags: [] };
    const step = (n, sid, title, sub, body) => html`<section class="ed-step" id="${sid}"><div class="ed-step-h"><span class="ed-kick">Шаг ${n} из ${ED_STEPS.length}</span><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div><div class="ed-err" role="alert" hidden></div>${body}
      <div class="ed-nav">${n > 1 ? html`<button type="button" class="btn btn-soft" data-prev>${ic('left', 18, 2)}Назад</button>` : html`<span></span>`}${n < ED_STEPS.length
    ? html`<button type="button" class="btn btn-dark" data-next>Далее${ic('right', 18, 2)}</button>`
    : html`<button type="button" class="btn btn-accent" data-submit>${sendLabel}</button>`}</div></section>`;
    const opt = (name, icon, title, sub, on, id = '') => html`<label class="ed-opt" id="${id || name}-opt"><span class="ed-opt-top"><span class="ed-opt-ic">${ic(icon, 20)}</span><input type="checkbox" ${id ? raw(`id="${id}"`) : raw(`name="${name}"`)} ${on ? raw('checked') : ''}></span><b>${title}</b><small>${sub}</small></label>`;

    app.innerHTML = String(html`<div class="wrap ed">
      <div class="ed-head">
        <a class="pf-back always" href="${l ? `/l/${l.id}` : '/profile'}">${ic('left', 18, 2)}${l ? 'К объявлению' : 'Мои объявления'}</a>
        <h1>${l ? 'Редактирование' : 'Новое объявление'}</h1>
        <p>${l ? 'После сохранения объявление снова проверит модератор — обычно несколько часов. Пока идёт проверка, его не видно в поиске.' : 'Бесплатно и без лимитов. Каждое объявление проверяет модератор — обычно это несколько часов.'}</p>
        ${draft ? html`<div class="ed-draft">${ic('refresh', 16, 2)}<span>Восстановили черновик от ${when(draft.at)}</span><button type="button" class="btn btn-soft btn-sm" id="draft-drop">Начать заново</button></div>` : ''}
      </div>
      <nav class="ed-steps" aria-label="Шаги">${ED_STEPS.map(([sid, t], i) => html`<button type="button" data-step="${i}" aria-controls="${sid}"><i></i><span>${ic('check', 14, 2.6)}${t}</span></button>`)}</nav>
      <div class="ed-grid">
        <form id="ed" class="ed-form" novalidate>
          ${step(1, 's-photos', 'Фото и видео', 'До 10 фото и одно видео до минуты. Первое фото — обложка в поиске.', html`<div id="photos"></div>
            <input type="file" id="file" accept="image/jpeg,image/png,image/webp" multiple class="sr" tabindex="-1">
            <div id="ai-slot"></div>
            <div id="video-slot"></div>
            <input type="file" id="vfile" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v" class="sr" tabindex="-1">`)}
          ${step(2, 's-what', 'Что продаёте', '', html`
            <div class="field"><label for="title">Название</label>
              <div class="ed-input"><input id="title" name="title" class="input" maxlength="80" placeholder="Например: iPhone 15 Pro, 256 ГБ" value="${src.title || ''}" autocomplete="off"><span class="ed-count" id="title-count"></span></div>
              <span class="help">Марка, модель и главное — так объявление легче найти.</span></div>
            <div class="field"><span class="label">Категория</span><div class="ed-cats" role="radiogroup" aria-label="Категория">
              ${S.config.categories.map((c) => html`<button type="button" role="radio" aria-checked="false" data-cat="${c.id}"><span class="ed-cat-ic">${catIc(c.id, 24)}</span><span>${c.name}</span></button>`)}</div></div>
            <div class="field hidden" id="sub-field"><span class="label">Раздел</span><div class="ed-subs" id="subs" role="radiogroup" aria-label="Раздел"></div></div>
            <div class="ed-attrs hidden" id="attrs"></div>
            <div class="field hidden" id="cond-field"><span class="label">Состояние</span><div class="ed-seg" role="radiogroup" aria-label="Состояние">
              ${[['new', 'Новое'], ['used', 'Б/у'], ['', 'Не указывать']].map(([v, t]) => html`<button type="button" role="radio" data-cond="${v}">${t}</button>`)}</div></div>`)}
          ${step(3, 's-price', 'Сколько стоит?', 'Цена и условия сделки — покупатели видят их сразу', html`
            <div class="ed-money"><label class="sr" for="price">Цена в рублях</label><input id="price" name="price" class="input" inputmode="numeric" autocomplete="off" placeholder="0" value="${src.price !== null && src.price !== undefined && src.price !== '' ? NF.format(Number(String(src.price).replace(/\D/g, ''))) : ''}"><span>₽</span></div>
            ${units.length > 1 ? html`<div class="ed-seg ed-units" role="radiogroup" aria-label="За что цена">${units.map((u) => html`<button type="button" role="radio" data-unit="${u}">${UNIT_LABEL[u] || `за ${u}`}</button>`)}</div>` : ''}
            <div class="ed-hint hidden" id="price-hint"></div>
            <div class="field"><span class="label">Условия сделки</span><div class="ed-opts">
              ${opt('bargain', 'chat', 'Торг уместен', 'Покупатели смогут предложить свою цену — кнопкой «Предложить цену»', src.bargain !== false)}
              ${opt('exchange', 'refresh', 'Возможен обмен', 'Покажем «Обмен» в объявлении и в фильтрах поиска', !!src.exchange)}
              ${opt('', 'info', 'Договорная', 'Цену не показываем — договоритесь в чате', st.negotiable, 'neg')}
            </div></div>`)}
          ${step(4, 's-where', 'Где', '', html`
            <div class="field"><label for="city">Город</label>
              <div class="ed-icon-input">${ic('pin', 18)}<input id="city" name="city" class="input" list="cities" autocomplete="address-level2" value="${src.city || S.user.city || S.city || ''}" placeholder="Начните вводить город"></div>
              <datalist id="cities">${S.config.cities.map((c) => html`<option value="${c}">`)}</datalist></div>
            <div class="ed-where2">
              <div class="field hidden" id="metro-field"><label for="metro">Метро</label>
                <select id="metro" name="metro" class="select"><option value="">Не указывать</option></select></div>
              <div class="field"><label for="district">Район <small class="muted">— по желанию</small></label>
                <input id="district" name="district" class="input" maxlength="60" autocomplete="off" placeholder="Например: Центральный" value="${src.district || ''}"></div>
            </div>
            <label class="switch"><span>Отправлю по России<small>Покупатели из других городов увидят «Доставка»</small></span><input type="checkbox" name="delivery" ${src.delivery ? raw('checked') : ''}><span class="track"></span></label>`)}
          ${step(5, 's-desc', 'Описание', 'Честное описание экономит время и вам, и покупателю.', html`
            <div class="ed-tips" aria-label="Что написать">${DESC_TIPS.map((t) => html`<button type="button" class="chip" data-tip="${t}">${ic('plus', 14, 2.2)}${t}</button>`)}</div>
            <div class="ed-input"><label for="desc" class="sr">Описание</label><textarea id="desc" name="description" class="textarea" maxlength="4000" placeholder="Состояние, комплектация, причина продажи, особенности">${src.description || ''}</textarea><span class="ed-count" id="desc-count"></span></div>`)}
          ${step(6, 's-publish', 'Публикация', 'Объявление в любом случае сначала проверит модератор', html`
            <div class="ed-note">${ic('clock', 20)}<span>${l && l.status === 'active' && l.expiresAt ? html`Опубликовано до <b>${dateShort(l.expiresAt)}</b>. Правка срок не меняет: после проверки объявление вернётся в поиск.` : html`Объявление висит <b>30 дней бесплатно</b>. Потом — «Опубликовать снова» в один клик, тоже бесплатно.`}</span></div>
            ${canSchedule ? html`<fieldset class="ed-when"><legend class="label">Когда опубликовать</legend>
              <div class="ed-opts">
                <label class="ed-opt row"><input type="radio" name="pub-when" value="now" ${at0 ? '' : raw('checked')}><span><b>Сразу после проверки</b><small>Обычно это несколько часов</small></span></label>
                <label class="ed-opt row"><input type="radio" name="pub-when" value="later" ${at0 ? raw('checked') : ''}><span><b>В выбранное время</b><small>Например, утром в выходной — когда больше покупателей</small></span></label>
              </div>
              <div class="ed-when-at ${at0 ? '' : 'hidden'}" id="when-at">
                <div class="field"><label for="w-day">День</label><select id="w-day" class="select">${days.map((d) => html`<option value="${d}" ${d === atDay ? raw('selected') : ''}>${dayLabelLong(d)}</option>`)}</select></div>
                <div class="field"><label for="w-time">Время</label><select id="w-time" class="select">${times.map((t) => html`<option value="${t}" ${t === atClock ? raw('selected') : ''}>${t}</option>`)}</select></div>
                <small>По московскому времени. До публикации объявление видно только вам — в «Моих объявлениях» с меткой «Запланировано».</small>
              </div>
            </fieldset>` : ''}
            ${canBoost ? html`<div class="ed-boost"><div class="ed-boost-h"><span class="label">Продвижение</span><small>по желанию · 7 дней с публикации</small></div>
              ${boostPicker(busyBoost)}
              <p class="ed-boost-note">${ic('lock', 14, 2)}Оплата при отправке. Не опубликуем за 7 дней — вернём деньги.</p></div>` : ''}
            <p class="ed-rules muted">Нажимая «${sendLabel}», вы соглашаетесь с <a href="/page/rules" style="text-decoration:underline">правилами площадки</a><span id="paid-terms" class="hidden"> и <a href="/page/terms#paid" style="text-decoration:underline">условиями платных услуг</a></span>.</p>`)}
        </form>
        <aside class="ed-side">
          <div class="ed-panel">
            <div class="ed-preview-h">Так увидят в поиске</div>
            <div class="ed-preview" id="preview" aria-hidden="true"></div>
            <div class="ed-ready"><div class="ed-ready-h"><b id="ready-n"></b><span id="ready-t"></span></div><div class="ed-bar-track"><i id="ready-bar"></i></div>
              <ul class="ed-check" id="check"></ul><small class="ed-req">* обязательно, остальное — по желанию</small></div>
            <button type="button" class="btn btn-dark btn-lg btn-block" data-submit>${sendLabel}</button>
            <a class="btn btn-soft btn-block" href="${l ? `/l/${l.id}` : '/profile'}">Отмена</a>
          </div>
        </aside>
      </div>
      <div class="ed-dock"><button type="button" class="icon-btn" data-prev aria-label="Назад">${ic('left', 20, 2)}</button><button type="button" class="btn btn-dark" data-next id="dock-next">Далее</button><button type="button" class="btn btn-accent" data-submit id="dock-send">${l ? 'Сохранить' : 'На проверку'}</button></div>
    </div>`);
    document.body.classList.add('editing');
    const form = $('#ed');
    const fileInput = $('#file');
    const priceDigits = () => form.price.value.replace(/\D/g, '');

    // ---------- фото ----------
    const renderPhotos = () => {
      const box = $('#photos');
      const n = st.photos.length;
      box.innerHTML = String(n ? html`<div class="ed-photos">${st.photos.map((p, i) => html`<div class="ed-photo ${i === 0 ? 'cover' : ''} ${p.loading ? 'loading' : ''}">
          ${p.url ? html`<img src="${p.url}" alt="Фото ${i + 1}">` : ''}
          ${p.loading ? '' : html`${i === 0 ? html`<span class="ed-cover-tag">Обложка</span>` : ''}
            <button type="button" class="ed-ph-btn rm" data-rm="${i}" aria-label="Удалить фото ${i + 1}">${ic('close', 15, 2.2)}</button>
            ${n > 1 ? html`<div class="ed-ph-move">${i > 0 ? html`<button type="button" class="ed-ph-btn" data-mv="${i}" data-d="-1" aria-label="Переместить левее">${ic('left', 15, 2.2)}</button>` : ''}${i > 0 ? html`<button type="button" class="ed-ph-btn txt" data-cover="${i}">Обложка</button>` : ''}${i < n - 1 ? html`<button type="button" class="ed-ph-btn" data-mv="${i}" data-d="1" aria-label="Переместить правее">${ic('right', 15, 2.2)}</button>` : ''}</div>` : ''}`}
        </div>`)}
        ${n < 10 ? html`<button type="button" class="ed-add" data-pick>${ic('plus', 24, 2)}<span>Ещё фото</span><small>${n} из 10</small></button>` : ''}</div>`
        : html`<button type="button" class="ed-drop" data-pick>
          <span class="ed-drop-ic">${ic('camera', 28, 1.7)}</span><b>Добавьте фото</b><span>Нажмите или перетащите сюда · JPG, PNG, WebP</span></button>
        <ul class="ed-photo-tips"><li>${ic('sparkle', 16)}Светлое фото при дневном свете</li><li>${ic('image', 16)}Несколько ракурсов и детали</li><li>${ic('check', 16, 2)}Только ваш товар, без надписей</li></ul>`);
      $$('[data-pick]', box).forEach((b) => { b.onclick = () => fileInput.click(); });
      $$('[data-rm]', box).forEach((b) => { b.onclick = () => { st.photos.splice(Number(b.dataset.rm), 1); changed(); renderPhotos(); }; });
      $$('[data-mv]', box).forEach((b) => { b.onclick = () => { const i = Number(b.dataset.mv); const j = i + Number(b.dataset.d); [st.photos[i], st.photos[j]] = [st.photos[j], st.photos[i]]; changed(); renderPhotos(); }; });
      $$('[data-cover]', box).forEach((b) => { b.onclick = () => { const [p] = st.photos.splice(Number(b.dataset.cover), 1); st.photos.unshift(p); changed(); renderPhotos(); }; });
      renderAi();
    };
    const zone = $('#s-photos');
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('over'); };
    zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); addFiles([...e.dataTransfer.files]); };

    const addFiles = async (files) => {
      const imgs = files.filter((f) => /^image\//.test(f.type)).slice(0, 10 - st.photos.length);
      if (!imgs.length) { if (files.length) toast('Загрузите фото в формате JPG, PNG или WebP', true); return; }
      const slots = imgs.map(() => { const s = { loading: true, url: '' }; st.photos.push(s); return s; });
      renderPhotos();
      st.busy += imgs.length;
      await Promise.all(imgs.map(async (f, i) => {
        const slot = slots[i];
        try {
          const img = await resizeImage(f);
          slot.url = img.data;
          renderPhotos();
          const r = await api('POST', '/api/uploads', img);
          slot.file = r.file; slot.url = r.url; slot.loading = false;
        } catch (e) {
          st.photos.splice(st.photos.indexOf(slot), 1);
          toast(e.message, true);
        } finally {
          st.busy -= 1;
          renderPhotos(); changed();
        }
      }));
    };
    fileInput.onchange = () => { addFiles([...fileInput.files]); fileInput.value = ''; };

    const renderAi = () => {
      const slot = $('#ai-slot');
      if (!S.config.ai) { slot.innerHTML = ''; return; }
      const ready = st.photos.some((p) => p.file && !p.loading);
      slot.innerHTML = String(html`<div class="ed-ai"><span class="ed-ai-ic">${ic('sparkle', 20)}</span><p>${ready ? 'Заполним название, категорию и описание по первому фото.' : 'Добавьте фото — и мы заполним объявление за вас.'}</p>
        <button type="button" class="btn btn-accent btn-sm" id="ai-btn" ${ready ? '' : raw('disabled')}>Заполнить по фото</button></div>`);
      const b = $('#ai-btn');
      if (b) b.onclick = async () => {
        const first = st.photos.find((p) => p.file && !p.loading);
        b.disabled = true; b.textContent = 'Смотрим на фото…';
        try {
          const s = await api('POST', '/api/ai/suggest', { file: first.file });
          if (s.title) form.title.value = s.title;
          if (s.description && !form.description.value.trim()) form.description.value = s.description;
          if (s.category) setCat(s.category);
          if (s.condition) setCond(s.condition);
          if (s.priceHint) showHint(s.priceHint, s.priceHintCount); else fetchHint();
          changed();
          toast('Готово — проверьте и поправьте при необходимости');
        } catch (e) { toast(e.message, true); }
        b.disabled = false; b.textContent = 'Заполнить по фото';
      };
    };

    // ---------- видео: одно, до минуты, загрузка частями с продолжением после обрыва ----------
    const MB = 1024 * 1024;
    const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    const videoDuration = (url) => new Promise((done) => {
      const v = document.createElement('video');
      const t = setTimeout(() => done(null), 6000);
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => { clearTimeout(t); done(Number.isFinite(v.duration) ? v.duration : null); };
      v.onerror = () => { clearTimeout(t); done(null); };
      v.src = url;
    });
    async function putChunk(file, offset, blob) {
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await fetch(`/api/videos/${file}?offset=${offset}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) { const e = new Error(data.error || 'Не удалось загрузить видео'); e.final = r.status < 500; throw e; }
          return data;
        } catch (e) {
          if (e.final || attempt >= 4) throw e;
          await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1))); // плохая связь — пробуем ещё раз с того же места
        }
      }
    }
    const paintVideoProgress = () => {
      const v = st.video; if (!v || !v.uploading) return;
      const pct = Math.round((v.progress || 0) * 100);
      const b = $('#v-pct'); if (b) b.textContent = `${pct}%`;
      const bar = $('#v-bar'); if (bar) bar.style.width = `${pct}%`;
    };
    const renderVideo = () => {
      const box = $('#video-slot');
      const v = st.video;
      if (!v) {
        box.innerHTML = String(html`<button type="button" class="ed-vadd" data-vpick><span class="ed-vadd-ic">${ic('video', 22, 1.8)}</span>
          <span class="ed-vadd-t"><b>Добавить видео</b><small>До 60 секунд · MP4 или MOV · до 100 МБ</small></span><span class="ed-vadd-plus">${ic('plus', 18, 2.2)}</span></button>`);
      } else {
        const pct = Math.round((v.progress || 0) * 100);
        box.innerHTML = String(html`<div class="ed-video ${v.uploading ? 'loading' : ''}">
          <div class="ed-video-pic"><video src="${v.uploading ? v.local : `${v.url}#t=0.1`}" ${v.uploading ? raw('muted') : raw('controls')} playsinline preload="metadata"></video></div>
          <div class="ed-vinfo">${v.uploading
    ? html`<b>Загружаем видео · <span id="v-pct">${pct}%</span></b><div class="ed-bar-track"><i id="v-bar" style="width:${pct}%"></i></div><small>Можно заполнять дальше — только не закрывайте страницу</small>`
    : html`<b>${ic('check', 16, 2.4)}Видео добавлено</b><small>${v.duration ? `${mmss(v.duration)} · ` : ''}покупатели увидят его после фото</small>
      <button type="button" class="btn btn-soft btn-sm" data-vpick>Заменить</button>`}</div>
          <button type="button" class="ed-ph-btn rm" data-vrm aria-label="Убрать видео">${ic('close', 15, 2.2)}</button>
        </div>`);
      }
      $$('[data-vpick]', box).forEach((b) => { b.onclick = () => $('#vfile').click(); });
      const rm = $('[data-vrm]', box);
      if (rm) rm.onclick = () => { if (st.video && st.video.local) URL.revokeObjectURL(st.video.local); st.video = null; renderVideo(); changed(); };
    };
    async function addVideo(f) {
      if (!/^video\/(mp4|quicktime)$/.test(f.type) && !/\.(mp4|mov|m4v)$/i.test(f.name)) { toast('Видео — в формате MP4 или MOV', true); return; }
      if (f.size > 100 * MB) { toast(`Видео ${Math.round(f.size / MB)} МБ — нужно до 100 МБ. Сократите или сожмите его`, true); return; }
      const local = URL.createObjectURL(f);
      const duration = await videoDuration(local);
      if (duration && duration > 61) { URL.revokeObjectURL(local); toast(`Видео длится ${mmss(duration)} — обрежьте его до минуты`, true); return; }
      if (st.video && st.video.local) URL.revokeObjectURL(st.video.local);
      const v = { local, uploading: true, progress: 0, duration };
      st.video = v; renderVideo(); changed();
      try {
        const s = await api('POST', '/api/videos', { name: f.name, type: f.type, size: f.size, ...(duration ? { duration } : {}) });
        let off = 0;
        while (off < f.size) {
          if (st.video !== v) return; // убрали или заменили
          const r = await putChunk(s.file, off, f.slice(off, off + s.chunk));
          off = r.received; v.progress = off / f.size; paintVideoProgress();
          if (r.ready) { v.file = s.file; v.url = r.url; if (r.duration) v.duration = r.duration; break; }
        }
        if (st.video !== v) return;
        v.uploading = false; URL.revokeObjectURL(local); delete v.local;
        renderVideo(); changed();
      } catch (e) {
        if (st.video === v) { st.video = null; renderVideo(); changed(); }
        toast(e.message, true);
      }
    }
    $('#vfile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) addVideo(f); };

    // ---------- раздел и характеристики ----------
    const renderSubs = () => {
      const subs = subsOf(st.category);
      $('#sub-field').classList.toggle('hidden', !subs.length);
      $('#subs').innerHTML = String(html`${subs.map((x) => html`<button type="button" role="radio" class="chip ${x.id === st.sub ? 'on' : ''}" aria-checked="${x.id === st.sub ? 'true' : 'false'}" data-sub="${x.id}">${x.name}</button>`)}`);
      $$('[data-sub]').forEach((b) => { b.onclick = () => setSub(b.dataset.sub); });
    };
    const fmtAttrInput = (f, v) => (v === undefined || v === null || v === '' ? '' : f.max >= 100000 ? NF.format(Number(v)) : String(v).replace('.', ','));
    const renderAttrs = () => {
      const x = subOf(st.sub);
      const box = $('#attrs');
      box.classList.toggle('hidden', !x || !x.fields.length);
      if (!x || !x.fields.length) { box.innerHTML = ''; return; }
      box.innerHTML = String(html`<div class="ed-attrs-h"><b>Характеристики</b><span>${x.fields.some((f) => f.req) ? html`<i class="rq">*</i> — главные, остальное по желанию. ` : ''}По ним покупатели находят объявление в фильтрах</span></div>
        <div class="ed-attrs-grid">${[...x.fields].sort((a, b) => (b.req - a.req) || ((a.type !== 'select') - (b.type !== 'select'))).map((f) => {
    const v = st.attrs[f.key];
    if (f.type === 'select') return attrChoice(f, v);
    return html`<div class="field"><label for="at-${f.key}">${f.label}${f.req ? html`<i class="rq">*</i>` : ''}</label><div class="ed-unit-input"><input id="at-${f.key}" class="input" inputmode="${f.key === 'area' || f.key === 'land' ? 'decimal' : 'numeric'}" autocomplete="off" data-akn="${f.key}" data-max="${f.max}" placeholder="${f.key === 'year' ? `например, ${new Date().getFullYear() - 5}` : '—'}" value="${fmtAttrInput(f, v)}">${f.unit ? html`<span>${f.unit}</span>` : ''}</div></div>`;
  })}</div>`);
      if (!box.dataset.bound) {
        box.dataset.bound = '1';
        bindAttrChoices(box, { find: (fn) => (subOf(st.sub) || { fields: [] }).fields.find(fn) }, (k) => st.attrs[k], (k, val) => { if (val === undefined) delete st.attrs[k]; else st.attrs[k] = val; changed(); });
      }
      $$('[data-akn]', box).forEach((inp) => {
        inp.oninput = () => {
          const big = Number(inp.dataset.max) >= 100000;
          let t = inp.value.replace(big ? /\D/g : /[^\d,.-]/g, '').replace('.', ',');
          if (big) { t = t.slice(0, 9); inp.value = t ? NF.format(Number(t)) : ''; } else inp.value = t;
          const n = Number(t.replace(/\s/g, '').replace(',', '.'));
          if (t !== '' && Number.isFinite(n)) st.attrs[inp.dataset.akn] = n; else delete st.attrs[inp.dataset.akn];
          changed();
        };
      });
    };
    const setSub = (id) => {
      if (st.sub !== id) {
        // Общие поля (например, «Год выпуска») сохраняем, лишние — убираем.
        const x = subOf(id);
        st.attrs = Object.fromEntries(Object.entries(st.attrs).filter(([k]) => x && x.fields.some((f) => f.key === k)));
      }
      st.sub = id;
      renderSubs(); renderAttrs(); changed();
    };

    // ---------- метро ----------
    let metroWanted = src.metro ? (typeof src.metro === 'string' ? src.metro : src.metro.name) : '';
    const loadMetro = async () => {
      const city = form.city.value.trim();
      const field = $('#metro-field');
      if (!hasMetro(city)) { field.classList.add('hidden'); form.metro.value = ''; return; }
      const list = await metroOf(city);
      if (form.city.value.trim() !== city) return;
      if (form.metro.value) metroWanted = form.metro.value;
      form.metro.innerHTML = String(html`<option value="">Не указывать</option>${list.map((m) => html`<option value="${m.name}" data-color="${m.color}" data-line="${m.line}" ${m.name === metroWanted ? raw('selected') : ''}>${m.name}</option>`)}`);
      field.classList.toggle('hidden', !list.length);
      changed();
    };
    let metroTimer = null;
    form.metro.onchange = () => { metroWanted = form.metro.value; changed(); };

    // ---------- категория, состояние, цена ----------
    const setCat = (c) => {
      st.category = c;
      $$('[data-cat]').forEach((b) => { const on = b.dataset.cat === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      $('#cond-field').classList.toggle('hidden', !CONDITION_CATS.has(c));
      if (st.sub && !subsOf(c).some((x) => x.id === st.sub)) { st.sub = ''; st.attrs = {}; }
      renderSubs(); renderAttrs();
      fetchHint(); changed();
    };
    const setCond = (c) => { st.condition = c; $$('[data-cond]').forEach((b) => { const on = b.dataset.cond === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); changed(); };
    const setUnit = (u) => { st.priceUnit = u; $$('[data-unit]').forEach((b) => { const on = b.dataset.unit === u; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); changed(); };
    const setNeg = (on) => { st.negotiable = on; $('#neg').checked = on; form.price.disabled = on; if (on) form.price.value = ''; $('.ed-money').classList.toggle('off', on); changed(); };
    $$('[data-cat]').forEach((b) => { b.onclick = () => setCat(b.dataset.cat); });
    $$('[data-cond]').forEach((b) => { b.onclick = () => setCond(b.dataset.cond); });
    $$('[data-unit]').forEach((b) => { b.onclick = () => { setUnit(b.dataset.unit); fetchHint(); }; });
    $('#neg').onchange = (e) => setNeg(e.target.checked);
    form.price.oninput = () => {
      const d = priceDigits().slice(0, 11);
      form.price.value = d ? NF.format(Number(d)) : '';
      changed();
    };

    const showHint = (n, count) => {
      const el = $('#price-hint');
      el.innerHTML = String(html`<span class="ed-hint-txt">${ic('tag', 16, 2)}<span>Похожие продаются примерно за <b>${NF.format(n)} ₽</b>${count ? html` · ${count} ${plural(count, 'объявление', 'объявления', 'объявлений')}` : ''}</span></span>
        <button type="button" class="btn btn-soft btn-sm" data-use="${n}">Поставить эту цену</button>`);
      el.classList.remove('hidden');
      $('[data-use]', el).onclick = () => { setNeg(false); form.price.value = NF.format(n); changed(); };
    };
    let hintTimer = null;
    const fetchHintSoon = () => { clearTimeout(hintTimer); hintTimer = setTimeout(fetchHint, 600); };
    async function fetchHint() {
      const t = form.title.value.trim();
      if (!st.category || t.length < 3) { $('#price-hint').classList.add('hidden'); return; }
      try {
        const r = await api('GET', `/api/price-hint?${new URLSearchParams({ category: st.category, title: t, unit: st.priceUnit })}`);
        if (r.hint) showHint(r.hint, r.count); else $('#price-hint').classList.add('hidden');
      } catch { /* необязательно */ }
    }

    // ---------- описание ----------
    $$('[data-tip]').forEach((b) => {
      b.onclick = () => {
        const ta = form.description;
        const v = ta.value.replace(/\s+$/, '');
        ta.value = `${v}${v ? '\n' : ''}${b.dataset.tip}: `;
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
        changed();
      };
    });

    // ---------- готовность, превью, черновик ----------
    // Не form.when: у элементов в браузерах появился свой метод when() (Observable API).
    const laterOn = () => canSchedule && !!$('input[name="pub-when"][value="later"]:checked');
    const body = () => ({
      title: form.title.value.trim(), category: st.category, condition: CONDITION_CATS.has(st.category) ? st.condition : '',
      price: st.negotiable ? '' : priceDigits(), priceUnit: st.priceUnit, city: form.city.value.trim(),
      delivery: form.delivery.checked, description: form.description.value.trim(),
      photos: st.photos.filter((p) => p.file).map((p) => p.file),
      subcategory: st.sub, attrs: st.attrs, metro: $('#metro-field').classList.contains('hidden') ? '' : form.metro.value,
      district: form.district.value.trim(), video: st.video && st.video.file ? st.video.file : '',
      bargain: form.bargain.checked, exchange: form.exchange.checked,
      publishAt: laterOn() ? mskTs($('#w-day').value, $('#w-time').value) : null
    });
    // Заполнены ли главные характеристики (те, что видны в карточке).
    const attrsDone = (b) => { const x = subOf(b.subcategory); return !x || !x.summary.length || x.summary.every((k) => b.attrs[k] !== undefined); };
    // Главные характеристики раздела (req) — обязательны, как на сервере.
    const attrsMissing = (b) => ((subOf(b.subcategory) || { fields: [] }).fields.filter((f) => f.req && b.attrs[f.key] === undefined));
    const attrsReq = () => !!(subOf(st.sub) || { fields: [] }).fields.some((f) => f.req);
    const CHECK = [
      ['s-photos', 'Фото', (b) => b.photos.length > 0, false],
      ['s-what', 'Название', (b) => b.title.length >= 3, true],
      ['s-what', 'Категория', (b) => !!b.category, true],
      ['s-what', 'Раздел', (b) => !!b.subcategory || (!!b.category && !subsOf(b.category).length), true],
      ['s-what', 'Характеристики', (b) => !!b.subcategory && !attrsMissing(b).length && attrsDone(b), attrsReq],
      ['s-price', 'Цена', (b) => !!b.price || st.negotiable, false],
      ['s-where', 'Город', (b) => b.city.length >= 2, true],
      ['s-desc', 'Описание', (b) => b.description.length >= 20, false]
    ];
    const ERR = {
      's-what': (b) => (b.title.length < 3 ? 'Напишите название — хотя бы пару слов.' : !b.category ? 'Выберите категорию.' : !b.subcategory && subsOf(b.category).length ? 'Выберите раздел — так объявление попадёт в нужные фильтры.'
        : attrsMissing(b).length ? `Укажите: ${attrsMissing(b).map((f) => f.label.toLowerCase()).join(', ')}.` : ''),
      's-where': (b) => (b.city.length < 2 ? 'Укажите город.' : ''),
      's-publish': (b) => (b.publishAt !== null && b.publishAt < Date.now() + 5 * 60 * 1000 ? 'Выберите время позже — хотя бы через несколько минут.' : boostErr(st.boost))
    };
    let saveTimer = null;
    function changed() {
      const b = body();
      $('#title-count').textContent = `${form.title.value.length}/80`;
      $('#desc-count').textContent = `${form.description.value.length}/4000`;
      const done = CHECK.filter((c) => c[2](b)).length;
      const pct = Math.round((done / CHECK.length) * 100);
      const reqOf = (c) => (typeof c[3] === 'function' ? c[3]() : c[3]);
      const missing = CHECK.filter((c) => reqOf(c) && !c[2](b)).map((c) => c[1].toLowerCase());
      const soft = CHECK.filter((c) => !reqOf(c) && !c[2](b)).map((c) => c[1].toLowerCase());
      $('#ready-n').textContent = `Заполнено на ${pct}%`;
      $('#ready-t').textContent = missing.length ? `осталось: ${missing.join(', ')}` : soft.length ? 'можно отправлять' : 'всё готово';
      $('#ready-bar').style.width = `${pct}%`;
      $('#check').innerHTML = String(html`${CHECK.map((c) => { const [sid, t, ok] = c; return html`<li class="${ok(b) ? 'ok' : ''}"><a href="#${sid}" data-goto="${sid}">${ic(ok(b) ? 'check' : 'plus', 15, 2.4)}${t}${reqOf(c) ? '*' : ''}</a></li>`; })}`);
      $$('[data-goto]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); goStep(ED_STEPS.findIndex(([sid]) => sid === a.dataset.goto)); }; });
      // Шаг готов, если всё на нём заполнено; последний — когда готово обязательное.
      $$('[data-step]').forEach((x) => {
        const sid = ED_STEPS[Number(x.dataset.step)][0];
        const own = CHECK.filter((c) => c[0] === sid);
        x.classList.toggle('done', sid === 's-publish' ? !missing.length : own.length ? own.every((c) => c[2](b)) : false);
      });
      $('#bargain-opt').classList.toggle('hidden', st.negotiable); // без цены торговаться не о чем
      const first = st.photos.find((p) => p.url && !p.loading);
      const pb = st.boost;
      const ready = st.photos.filter((p) => p.url && !p.loading);
      const prevBoost = pb.xl || pb.frame || pb.tags.length ? { xl: pb.xl, frame: pb.frame, tags: pb.tags, photos: ready.slice(1, 3).map((p) => p.url), more: Math.max(0, ready.length - 3), desc: b.description.replace(/\s+/g, ' ').slice(0, 180) } : null;
      $('#preview').innerHTML = String(card({ id: 0, title: b.title || 'Название объявления', price: b.price ? Number(b.price) : null, priceUnit: b.priceUnit, city: b.city || 'Город', createdAt: Date.now(), photo: first ? first.url : null, delivery: b.delivery, exchange: b.exchange,
        summary: attrSummary(b.subcategory, b.attrs), metro: b.metro, hasVideo: !!st.video, boost: prevBoost }));
      const q = boostQuote(pb);
      $$('[data-submit]').forEach((x) => { const t = x.id === 'dock-send' ? (l ? 'Сохранить' : 'На проверку') : sendLabel; x.textContent = q.any ? `${t} · ${rub(q.amount)}` : t; });
      const pt = $('#paid-terms'); if (pt) pt.classList.toggle('hidden', !q.any);
      if (st.tried) for (const sid of Object.keys(ERR)) showErr(sid, ERR[sid](b));
      const has = b.title || b.photos.length || b.description || b.price;
      if (!l && !has) draftDrop();
      if (!l && has) { clearTimeout(saveTimer); saveTimer = setTimeout(() => draftSave({ ...b, price: b.price, negotiable: st.negotiable, step: st.step, photos: st.photos.filter((p) => p.file).map((p) => ({ file: p.file, url: p.url })), video: st.video && st.video.file ? { file: st.video.file, url: st.video.url, duration: st.video.duration } : null }), 400); }
    }
    const showErr = (sid, msg) => { const s = $(`#${sid}`); s.classList.toggle('bad', !!msg); const e = $('.ed-err', s); e.hidden = !msg; e.innerHTML = msg ? String(html`${ic('warn', 16, 2)}${msg}`) : ''; };
    form.title.oninput = () => { changed(); fetchHintSoon(); };
    form.city.oninput = () => { changed(); clearTimeout(metroTimer); metroTimer = setTimeout(loadMetro, 300); };
    form.district.oninput = changed;
    form.description.oninput = changed;
    form.delivery.onchange = changed;
    form.bargain.onchange = changed;
    form.exchange.onchange = changed;
    if (canSchedule) {
      $$('input[name="pub-when"]').forEach((r) => { r.onchange = () => { $('#when-at').classList.toggle('hidden', !laterOn()); changed(); }; });
      $('#w-day').onchange = changed; $('#w-time').onchange = changed;
    }

    // ---------- шаги ----------
    const focusErr = (sid) => {
      const b = body();
      const miss = sid === 's-what' && b.subcategory ? attrsMissing(b)[0] : null;
      const f = sid === 's-what' && b.title.length < 3 ? form.title : sid === 's-where' ? form.city : sid === 's-what' && b.category && !b.subcategory ? $('[data-sub]')
        : miss ? $(`#at-${miss.key}`) || $(`[data-field="${miss.key}"] button`) : sid === 's-publish' ? $('#w-time + .pick-btn') : null;
      if (f) setTimeout(() => { f.focus({ preventScroll: true }); if (miss) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
    };
    // check — «Далее» не пускает дальше, пока на текущем шаге не заполнено обязательное.
    function goStep(i, check = false) {
      const sid = ED_STEPS[st.step][0];
      if (check && i > st.step && ERR[sid] && ERR[sid](body())) { st.tried = true; changed(); focusErr(sid); return; }
      st.step = i;
      ED_STEPS.forEach(([x], k) => $(`#${x}`).classList.toggle('cur', k === i));
      $$('[data-step]').forEach((x) => { const on = Number(x.dataset.step) === i; x.classList.toggle('cur', on); if (on) x.setAttribute('aria-current', 'step'); else x.removeAttribute('aria-current'); });
      const last = i === ED_STEPS.length - 1;
      $('.ed-dock [data-prev]').style.visibility = i ? '' : 'hidden';
      $('#dock-next').classList.toggle('hidden', last);
      $('#dock-send').classList.toggle('hidden', !l && !last);
      changed();
      const top = $('.ed-steps').getBoundingClientRect().top + window.scrollY - 84;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
    }
    $$('[data-next]').forEach((b) => { b.onclick = () => goStep(Math.min(st.step + 1, ED_STEPS.length - 1), true); });
    $$('[data-prev]').forEach((b) => { b.onclick = () => goStep(Math.max(st.step - 1, 0)); });
    $$('[data-step]').forEach((b) => { b.onclick = () => goStep(Number(b.dataset.step), true); });
    const dd = $('#draft-drop');
    if (dd) dd.onclick = () => { draftDrop(); render(); };

    // ---------- отправка ----------
    let sending = false;
    const submit = async () => {
      if (sending) return;
      if (st.busy) { toast('Подождите, фото ещё загружаются', true); return; }
      if (st.video && st.video.uploading) { toast(`Видео ещё загружается — ${Math.round((st.video.progress || 0) * 100)}%. Подождите немного`, true); return; }
      st.tried = true;
      const b = body();
      const bad = Object.keys(ERR).find((sid) => ERR[sid](b));
      changed();
      if (bad) { goStep(ED_STEPS.findIndex(([sid]) => sid === bad)); focusErr(bad); return; }
      sending = true;
      $$('[data-submit]').forEach((x) => { x.disabled = true; });
      try {
        const r = l ? await api('PATCH', `/api/listings/${l.id}`, b) : await api('POST', '/api/listings', b);
        if (!l) draftDrop();
        const lid = l ? l.id : r.id;
        if (canBoost && boostQuote(st.boost).any) {
          // Объявление сохранено — дальше страница оплаты ЮKassa. Не открылась — продвинуть можно позже из «Моих объявлений».
          try { await boostPay(lid, st.boost); return; } catch (ex) { toast(`Объявление отправлено, но оплата не открылась: ${ex.message}`, true); go(`/l/${lid}`, true); return; }
        }
        toast(b.publishAt ? 'Отправлено на проверку — опубликуем в выбранное время' : 'Отправлено на проверку модератору');
        go(`/l/${lid}`, true);
      } catch (ex) {
        toast(ex.message, true);
        sending = false;
        $$('[data-submit]').forEach((x) => { x.disabled = false; });
      }
    };
    form.onsubmit = (e) => { e.preventDefault(); submit(); };
    $$('[data-submit]').forEach((x) => { x.onclick = submit; });

    cleanup = () => { document.body.classList.remove('editing'); clearTimeout(saveTimer); if (st.video && st.video.local) URL.revokeObjectURL(st.video.local); st.video = null; };
    setCat(st.category); setCond(st.condition); setUnit(st.priceUnit); setNeg(st.negotiable);
    if (canBoost) bindBoostPicker($('#s-publish'), st.boost, changed);
    renderPhotos(); renderVideo(); loadMetro();
    goStep(st.step);
    if (l) fetchHint();
  }

  // ================= код подтверждения почты =================
  // Шесть клеток: цифры, вставка из буфера, автоподстановка кода на телефоне (one-time-code), стирание — назад.
  function codeBoxes(box, onDone) {
    box.innerHTML = String(html`<div class="code-boxes" role="group" aria-label="Код из письма">${[0, 1, 2, 3, 4, 5].map((i) => html`<input class="code-box" inputmode="numeric" pattern="[0-9]*" maxlength="${i ? 1 : 6}" autocomplete="${i ? 'off' : 'one-time-code'}" aria-label="Цифра ${i + 1} из 6">`)}</div>`);
    const ins = $$('.code-box', box);
    const value = () => ins.map((x) => x.value).join('');
    const fill = (digits, from) => {
      digits.split('').forEach((d, k) => { if (ins[from + k]) ins[from + k].value = d; });
      box.classList.remove('bad');
      ins[Math.min(from + digits.length, 5)].focus();
      if (/^\d{6}$/.test(value())) onDone(value());
    };
    ins.forEach((inp, i) => {
      inp.onfocus = () => inp.select();
      inp.oninput = () => { const d = inp.value.replace(/\D/g, ''); inp.value = ''; if (d) fill(d.slice(0, 6 - i), i); };
      inp.onkeydown = (e) => {
        if (e.key === 'Backspace' && !inp.value && i > 0) { e.preventDefault(); ins[i - 1].value = ''; ins[i - 1].focus(); }
        if (e.key === 'ArrowLeft' && i > 0) ins[i - 1].focus();
        if (e.key === 'ArrowRight' && i < 5) ins[i + 1].focus();
      };
      inp.onpaste = (e) => { const d = ((e.clipboardData && e.clipboardData.getData('text')) || '').replace(/\D/g, '').slice(0, 6); if (d) { e.preventDefault(); ins.forEach((x) => { x.value = ''; }); fill(d, 0); } };
    });
    return {
      focus: () => ins[0].focus(),
      fail: () => { box.classList.add('bad'); ins.forEach((x) => { x.value = ''; }); ins[0].focus(); },
      lock: (on) => ins.forEach((x) => { x.disabled = on; })
    };
  }

  // Код и «Отправить ещё раз» с обратным отсчётом. send — повторная отправка; check(code) — проверка (бросает ошибку).
  function codeForm(root, { email, wait = 60, send, check }) {
    root.innerHTML = String(html`<div class="code-form">
      <div class="code-to">${ic('mail', 18, 2)}<span>Код отправили на <b>${email}</b></span></div>
      <div id="code-cells"></div>
      <div class="code-err hidden" role="alert"></div>
      <div class="code-again"><span class="muted">Не пришло? Проверьте «Спам».</span><button type="button" class="btn btn-soft btn-sm" data-again disabled></button></div>
    </div>`);
    const err = $('.code-err', root);
    const again = $('[data-again]', root);
    let left = wait; let timer = null;
    const tick = () => { again.disabled = left > 0; again.textContent = left > 0 ? `Отправить ещё раз · ${left} с` : 'Отправить ещё раз'; if (left-- > 0) timer = setTimeout(tick, 1000); };
    const boxes = codeBoxes($('#code-cells', root), async (code) => {
      err.classList.add('hidden'); boxes.lock(true);
      try { await check(code); } catch (e) { boxes.lock(false); boxes.fail(); err.textContent = e.message; err.classList.remove('hidden'); }
    });
    again.onclick = async () => {
      again.disabled = true;
      try { const r = await send(); left = r.wait || 60; toast('Отправили новый код'); err.classList.add('hidden'); boxes.focus(); } catch (e) { toast(e.message, true); left = 0; }
      clearTimeout(timer); tick();
    };
    tick();
    setTimeout(() => boxes.focus(), 50);
    return () => clearTimeout(timer);
  }

  // /confirm — после регистрации или входа с неподтверждённой почтой. Адрес — из sessionStorage (не в ссылке).
  const CONFIRM_KEY = 'tg_confirm';
  const confirmStart = (email, next) => { try { sessionStorage.setItem(CONFIRM_KEY, JSON.stringify({ email, next: next || '' })); } catch { /* приватный режим */ } go('/confirm', true); };
  async function viewConfirm() {
    if (S.user && S.user.emailVerified) { go('/', true); return; }
    setTitle('Подтверждение почты');
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem(CONFIRM_KEY) || 'null'); } catch { /* нет хранилища */ }
    const finish = async (r) => {
      try { sessionStorage.removeItem(CONFIRM_KEY); } catch { /* нет хранилища */ }
      S.user = r.user; await refreshMe(); toast('Почта подтверждена — добро пожаловать!');
      go(st && st.next && st.next.startsWith('/') && !st.next.startsWith('//') ? st.next : '/', true);
    };
    const showCode = (email, wait) => {
      authPage('Введите код из письма', 'Шесть цифр — так мы убедимся, что почта ваша. Код действует 15 минут.', html`<div id="cf"></div>`,
        html`<p class="alt">Ошиблись адресом? <a href="/register">Зарегистрироваться заново</a></p>`);
      cleanup = codeForm($('#cf'), {
        email, wait,
        send: () => api('POST', '/api/auth/code/resend', { email }),
        check: async (code) => finish(await api('POST', '/api/auth/code', { email, code }))
      });
    };
    if (st && st.email) { showCode(st.email, 60); return; }
    // Открыли страницу заново без адреса — спросим его и пришлём код.
    authPage('Подтверждение почты', 'Укажите почту, на которую регистрировались, — пришлём код.', html`<form id="f" novalidate>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" class="input" autocomplete="email" required></div>
      <button class="btn btn-dark btn-lg btn-block" type="submit">Прислать код</button></form>`);
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      const email = e.target.email.value.trim().toLowerCase();
      try { const r = await api('POST', '/api/auth/code/resend', { email }); st = { email, next: '' }; try { sessionStorage.setItem(CONFIRM_KEY, JSON.stringify(st)); } catch { /* нет */ } showCode(email, r.wait); } catch (ex) { toast(ex.message, true); }
    };
  }

  // Из профиля: прислать код и ввести его в окне.
  async function verifyModal(done) {
    let r;
    try { r = await api('POST', '/api/me/verify'); } catch (e) { toast(e.message, true); return; }
    if (r.already) { await refreshMe(); done(); return; }
    openModal(String(html`<h2>Подтвердите почту</h2><div id="vm"></div><div class="modal-actions"><button class="btn btn-soft" data-x>Позже</button></div>`), (m, close) => {
      $('[data-x]', m).onclick = close;
      const stop = codeForm($('#vm', m), {
        email: r.email, wait: r.wait,
        send: () => api('POST', '/api/me/verify'),
        check: async (code) => { await api('POST', '/api/auth/code', { email: r.email, code }); stop(); close(); await refreshMe(); toast('Почта подтверждена'); done(); }
      });
    });
  }

  // ================= вход и регистрация =================
  async function viewLogin(_, q) {
    if (S.user) { go(q.get('next') || '/', true); return; }
    setTitle('Вход');
    app.innerHTML = String(html`<div class="wrap"><div class="auth">
      <h1>Вход</h1><p class="sub">Рады видеть вас снова.</p>
      ${q.get('oauth_error') ? html`<div class="banner danger" style="margin-bottom:16px">${q.get('oauth_error')}</div>` : ''}
      ${oauthButtons()}
      <form id="f" novalidate>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" class="input" autocomplete="email" required></div>
        <div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" class="input" autocomplete="current-password" required>
          ${S.config.mail ? html`<a class="help" href="/forgot" style="text-decoration:underline;justify-self:start">Забыли пароль?</a>` : ''}</div>
        <div class="form-error hidden" id="err" role="alert"></div>
        <button class="btn btn-dark btn-lg btn-block" type="submit">Войти</button>
      </form>
      <p class="alt">Нет аккаунта? <a href="/register${q.get('next') ? `?next=${encodeURIComponent(q.get('next'))}` : ''}">Зарегистрироваться</a></p>
    </div></div>`);
    bindAuthForm('/api/auth/login', q.get('next'));
    bindOauth(app, q.get('next'));
  }

  async function viewRegister(_, q) {
    if (S.user) { go(q.get('next') || '/', true); return; }
    setTitle('Регистрация');
    app.innerHTML = String(html`<div class="wrap"><div class="auth">
      <h1>Регистрация</h1><p class="sub">Размещайте объявления бесплатно и пишите продавцам.</p>
      ${oauthButtons()}
      <form id="f" novalidate>
        <div class="field"><label for="name">Имя</label><input id="name" name="name" class="input" autocomplete="given-name" maxlength="60" required></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" class="input" autocomplete="email" required></div>
        <div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" class="input" autocomplete="new-password" minlength="8" required><span class="help">Минимум 8 символов</span></div>
        <label class="check"><input type="checkbox" name="consent" required><span>Даю <a href="/page/consent" target="_blank" style="text-decoration:underline">согласие на обработку персональных данных</a></span></label>
        <div class="form-error hidden" id="err" role="alert"></div>
        <button class="btn btn-dark btn-lg btn-block" type="submit">Создать аккаунт</button>
        <p class="muted" style="margin:0;font-size:13px">Регистрируясь, вы принимаете <a href="/page/terms" style="text-decoration:underline">пользовательское соглашение</a> и <a href="/page/rules" style="text-decoration:underline">правила размещения</a>. Как мы храним данные — в <a href="/page/privacy" style="text-decoration:underline">политике конфиденциальности</a>.</p>
      </form>
      <p class="alt">Уже есть аккаунт? <a href="/login${q.get('next') ? `?next=${encodeURIComponent(q.get('next'))}` : ''}">Войти</a></p>
    </div></div>`);
    bindAuthForm('/api/auth/register', q.get('next'), {
      extra: () => ({ consent: $('#f').consent.checked }),
      check: () => ($('#f').consent.checked ? '' : 'Отметьте согласие на обработку персональных данных — без него зарегистрироваться нельзя')
    });
    bindOauth(app, q.get('next'));
  }

  // Отправка формы #f. По умолчанию — вход: запоминаем пользователя и уходим на next.
  // extra — поля сверх формы (объект или функция, вызываемая при отправке);
  // check(body) может вернуть текст ошибки до отправки; done(r) — свой обработчик ответа.
  // Вход через Яндекс ID и VK ID — кнопки для страниц входа и регистрации (если модератор подключил сервис).
  const OAUTH = [['yandex', 'Яндекс ID', 'Войти с Яндекс ID'], ['vk', 'VK ID', 'Войти через VK ID']];
  const oauthOn = () => OAUTH.filter(([k]) => S.config.oauth && S.config.oauth[k]);
  const oauthButtons = () => (oauthOn().length ? html`<div class="oauth">
      ${oauthOn().map(([k, , label]) => html`<button type="button" class="btn btn-line btn-lg btn-block oauth-btn oauth-${k}" data-oauth="${k}"><span class="oauth-mark" aria-hidden="true">${k === 'vk' ? 'VK' : 'Я'}</span>${label}</button>`)}
      <p class="oauth-note">Продолжая, вы принимаете <a href="/page/terms" target="_blank">соглашение</a> и даёте <a href="/page/consent" target="_blank">согласие на обработку данных</a>. Телефон из сервиса отметим как подтверждённый.</p>
      <div class="or"><span>или по email</span></div></div>` : '');
  // Начать вход или привязку: сервер даёт адрес страницы сервиса, туда и уходим.
  async function oauthGo(provider, { next = '/', link = false } = {}) {
    try { const { url } = await api('POST', `/api/auth/oauth/${provider}/start`, { next, link, consent: !link }); location.href = url; } catch (e) { toast(e.message, true); }
  }
  function bindOauth(root, next) { $$('[data-oauth]', root).forEach((b) => { b.onclick = () => oauthGo(b.dataset.oauth, { next: next || '/profile' }); }); }

  function bindAuthForm(url, next, { extra = {}, check, done } = {}) {
    const f = $('#f');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#err');
      err.classList.add('hidden');
      const body = { ...Object.fromEntries(new FormData(f).entries()), ...(typeof extra === 'function' ? extra() : extra) };
      const problem = check && check(body);
      if (problem) { err.textContent = problem; err.classList.remove('hidden'); return; }
      const btn = $('button[type=submit]', f);
      btn.disabled = true;
      try {
        const r = await api('POST', url, body);
        if (r.needCode) { confirmStart(r.email, next); return; } // почта не подтверждена — сначала код из письма
        if (done) { done(r); return; }
        S.user = r.user;
        await refreshMe();
        go(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', true);
      } catch (ex) {
        err.textContent = ex.message; err.classList.remove('hidden');
        btn.disabled = false;
      }
    };
  }

  const authPage = (title, sub, form, alt = '') => {
    app.innerHTML = String(html`<div class="wrap"><div class="auth"><h1>${title}</h1><p class="sub">${sub}</p>${form}${alt}</div></div>`);
  };

  async function viewForgot() {
    setTitle('Восстановление пароля');
    authPage('Забыли пароль?', 'Пришлём на почту ссылку, по которой можно задать новый пароль.', html`<form id="f" novalidate>
        <div class="field"><label for="email">Email аккаунта</label><input id="email" name="email" type="email" class="input" autocomplete="email" required></div>
        <div class="form-error hidden" id="err" role="alert"></div>
        <button class="btn btn-dark btn-lg btn-block" type="submit">Отправить ссылку</button>
      </form>`, html`<p class="alt">Вспомнили? <a href="/login">Войти</a></p>`);
    bindAuthForm('/api/auth/forgot', null, {
      check: (b) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || '') ? '' : 'Проверьте email'),
      done: () => authPage('Проверьте почту', 'Если такой аккаунт есть, мы отправили письмо со ссылкой. Она действует 1 час. Письма нет — загляните в «Спам».',
        html`<a class="btn btn-soft btn-lg btn-block" href="/login">Вернуться ко входу</a>`)
    });
  }

  async function viewReset(_, q) {
    setTitle('Новый пароль');
    const token = q.get('token') || '';
    const { valid } = await api('GET', `/api/auth/reset?token=${encodeURIComponent(token)}`);
    if (!valid) {
      authPage('Ссылка устарела', 'Она действует 1 час и срабатывает один раз. Запросите новую — это займёт минуту.',
        html`<a class="btn btn-dark btn-lg btn-block" href="/forgot">Получить новую ссылку</a>`);
      return;
    }
    authPage('Новый пароль', 'Придумайте пароль — после смены мы выйдем из аккаунта на других устройствах.', html`<form id="f" novalidate>
        <div class="field"><label for="password">Новый пароль</label><input id="password" name="password" type="password" class="input" autocomplete="new-password" minlength="8" required><span class="help">Минимум 8 символов</span></div>
        <div class="field"><label for="password2">Ещё раз</label><input id="password2" name="password2" type="password" class="input" autocomplete="new-password" required></div>
        <div class="form-error hidden" id="err" role="alert"></div>
        <button class="btn btn-dark btn-lg btn-block" type="submit">Сохранить и войти</button>
      </form>`);
    bindAuthForm('/api/auth/reset', '/profile', {
      extra: { token },
      check: (b) => (b.password.length < 8 ? 'Пароль — минимум 8 символов' : b.password !== b.password2 ? 'Пароли не совпадают' : '')
    });
  }

  // Ссылки из писем: подтверждение email (срабатывает сразу) и отписка (по кнопке — почтовики иногда сами открывают ссылки).
  async function viewMailLink(kind, q) {
    const isVerify = kind === 'verify';
    setTitle(isVerify ? 'Подтверждение email' : 'Отписка от писем');
    const run = () => (isVerify ? api('POST', '/api/auth/verify', { token: q.get('token') }) : api('POST', '/api/unsubscribe', { t: q.get('t'), k: q.get('k') }));
    const fail = (e) => authPage('Не получилось', e.message, html`<a class="btn btn-dark btn-lg btn-block" href="${S.user ? '/profile' : '/'}">${S.user ? 'В профиль' : 'На главную'}</a>`);
    if (isVerify) {
      try { await run(); } catch (e) { fail(e); return; }
      if (S.user) await refreshMe();
      authPage('Email подтверждён', 'Спасибо! Теперь мы будем сообщать о новых сообщениях и сможем помочь восстановить доступ к аккаунту.',
        html`<a class="btn btn-dark btn-lg btn-block" href="/">На главную</a>`);
      return;
    }
    const isFollow = /^follow-\d+$/.test(q.get('k') || '');
    const what = isFollow ? 'о новых объявлениях этого продавца' : { messages: 'о новых сообщениях', moderation: 'о решениях модерации', reviews: 'об отзывах', digest: 'с подборкой за день', all: 'с уведомлениями' }[q.get('k')] || 'с уведомлениями';
    authPage(isFollow ? 'Отписаться от продавца?' : 'Отписаться?', isFollow ? 'Подписка на продавца будет отменена: не будем присылать его новые объявления. Подписаться снова можно в его профиле.' : `Больше не будем присылать письма ${what}. Включить их снова можно в профиле, в разделе «Настройки».`,
      html`<form id="f"><button class="btn btn-dark btn-lg btn-block" type="submit">Отписаться</button></form>`);
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { await run(); authPage('Готово', `Письма ${what} больше не придут.`, html`<a class="btn btn-soft btn-lg btn-block" href="/">На главную</a>`); } catch (ex) { fail(ex); }
    };
  }

  // ================= избранное =================
  async function viewFavorites() {
    if (!requireAuth()) return;
    setTitle('Избранное');
    app.innerHTML = String(html`<div class="wrap"><div class="section-head" style="padding-top:24px"><h2>Избранное</h2></div><div id="box">${skeletonGrid(4)}</div></div>`);
    const { items } = await api('GET', '/api/favorites');
    $('#box').innerHTML = items.length ? String(grid(items)) : String(html`<div class="empty"><h3>Пока пусто</h3><p>Нажимайте на сердечко у объявлений, чтобы вернуться к ним позже.</p><a class="btn btn-dark" href="/">Смотреть объявления</a></div>`);
  }

  // ================= сообщения =================
  const SCAM_RE = /(telegram|телеграм|телеграмм|\btg\b|whats\s?app|ватсап|вотсап|вацап|viber|вайбер|t\.me|wa\.me|номер карты|данные карты|код из смс|код из sms|cvv|cvc|предоплат|переведите|перевод на карту|ссылк[ауи] на оплату|оплат[аиу] по ссылке)/i;
  const supportAva = (size = 52) => html`<span class="conv-img support-ava" style="width:${size}px;height:${size}px" aria-hidden="true"><svg width="${Math.round(size * 0.55)}" height="${Math.round(size * 0.55)}" viewBox="0 0 48 48">${raw(MARK)}</svg></span>`;
  const SUPPORT_NAME = html`Поддержка Торганы <span class="verified" title="Официальный аккаунт">${ic('check', 12, 3)}</span>`;
  const SUPPORT_TOPICS = ['Почему отклонили объявление?', 'Не приходит письмо', 'Подозреваю мошенника', 'Как удалить аккаунт?'];

  // Один чат на весь сайт: диалоги по объявлениям, поддержка у пользователя и у модератора.
  // load(after) → { messages }, send(body) → message; сообщения { id, mine, body, createdAt }.
  // decorate(m) → { cls, body } — особый вид сообщения (предложение цены); onData(r) — после каждой загрузки;
  // tools — над полем ввода (быстрые ответы); left — кнопка слева от поля (₽ — предложить цену).
  function mountChat(box, { head, below = '', load, send, scam = false, empty, placeholder = 'Сообщение…', onActivity, back = '/messages', decorate, onData, tools = '', left = '' }) {
    box.innerHTML = String(html`
      <div class="chat-head">
        <a href="${back}" class="icon-btn chat-back" aria-label="Назад">${ic('left', 20)}</a>
        ${head}
      </div>
      ${below}
      ${scam ? html`<div class="banner warn chat-warn hidden" data-scam>${ic('warn', 18)} <strong>Осторожно.</strong> Похоже, собеседник предлагает уйти в мессенджер или заплатить вне Торганы. Так действуют мошенники — не переводите деньги и не называйте коды из СМС.</div>` : ''}
      <div class="chat-msgs" data-msgs></div>
      ${tools}
      <form class="chat-form" data-send>
        ${left}
        <label class="icon-btn chat-attach" title="Отправить фото"><input type="file" accept="image/jpeg,image/png,image/webp" data-photo hidden>${ic('camera', 20)}<span class="sr">Отправить фото</span></label>
        <label class="sr" for="chat-body">Сообщение</label>
        <textarea id="chat-body" rows="1" maxlength="4000" placeholder="${placeholder}"></textarea>
        <button class="btn btn-dark" type="submit" aria-label="Отправить" style="height:48px">${ic('right', 20, 2.2)}</button>
      </form>`);
    const msgs = $('[data-msgs]', box);
    const ta = $('#chat-body', box);
    const form = $('[data-send]', box);
    let lastId = 0;
    let lastDay = '';
    const append = (list) => {
      if (!list.length) return;
      const e = $('[data-empty]', msgs); if (e) e.remove();
      const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
      let out = '';
      for (const m of list) {
        const d = new Date(m.createdAt).toDateString();
        if (d !== lastDay) { lastDay = d; out += String(html`<div class="chat-day">${shortWhen(m.createdAt)}</div>`); }
        const d2 = decorate ? decorate(m) : null;
        out += d2 ? String(html`<div class="msg ${m.mine ? 'out' : 'in'} ${d2.cls}">${d2.body}<span class="t">${hm(m.createdAt)}</span></div>`)
          : String(html`<div class="msg ${m.mine ? 'out' : 'in'} ${m.photo ? 'has-photo' : ''}">${m.photo ? html`<a class="msg-photo" href="${m.photo}" target="_blank" rel="noopener" data-pv-src="${m.photo}" data-pv-group="chat"><img src="${m.photo}" alt="Фото" loading="lazy"></a>` : ''}${m.body}<span class="t">${hm(m.createdAt)}</span></div>`);
        if (scam && !m.mine && m.body && SCAM_RE.test(m.body)) $('[data-scam]', box).classList.remove('hidden');
        lastId = Math.max(lastId, m.id);
      }
      msgs.insertAdjacentHTML('beforeend', out);
      if (nearBottom || list.some((m) => m.mine)) msgs.scrollTop = msgs.scrollHeight;
    };
    const poll = async () => { const r = await load(lastId); if (r.messages.length) { append(r.messages); if (onActivity) onActivity(); } if (onData) onData(r); return r; };
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`; };
    ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
    // send получает { body, photo }: текст, фото (имя файла из /api/uploads) или и то и другое.
    const deliver = async (msg) => { append([await send(msg)]); if (onActivity) onActivity(); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) return;
      ta.value = ''; ta.style.height = 'auto';
      try { await deliver({ body }); } catch (ex) { ta.value = body; toast(ex.message, true); }
    };
    // Фото: уменьшаем в браузере, загружаем и отправляем вместе с набранным текстом.
    const pick = $('[data-photo]', box);
    pick.onchange = async () => {
      const file = pick.files[0];
      pick.value = '';
      if (!file) return;
      const attach = pick.parentElement;
      attach.classList.add('busy');
      try {
        const up = await api('POST', '/api/uploads', await resizeImage(file, 1600));
        const body = ta.value.trim();
        ta.value = ''; ta.style.height = 'auto';
        await deliver({ body, photo: up.file });
      } catch (ex) { toast(ex.message, true); } finally { attach.classList.remove('busy'); }
    };
    // Быстрые темы в приветствии: подставляют текст в поле.
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-topic]'); if (b) { ta.value = b.dataset.topic; ta.focus(); ta.oninput(); } });
    const timer = setInterval(() => poll().catch(() => {}), 4000);
    (async () => {
      const r = await load(0);
      if (!r.messages.length && empty) msgs.innerHTML = String(html`<div data-empty>${empty}</div>`);
      append(r.messages);
      if (onData) onData(r);
      msgs.scrollTop = msgs.scrollHeight;
      if (onActivity) onActivity();
    })().catch((e) => toast(e.message, true));
    if (window.matchMedia('(min-width: 901px)').matches) $('.chat-back', box).classList.add('hidden');
    ta.focus();
    const stop = () => clearInterval(timer);
    stop.poll = poll;
    stop.fill = (text) => { ta.value = text; ta.focus(); ta.oninput(); };
    return stop;
  }

  // ---------- торг: предложение цены ----------
  // Сумма-подсказка: −5/−10/−15% с округлением до «красивой» (100, 500 или 1000 ₽).
  const niceDown = (n) => { const step = n >= 100000 ? 1000 : n >= 10000 ? 500 : 100; return Math.max(step, Math.floor(n / step) * step); };
  function offerModal({ listingPrice, title, onSubmit }) {
    const min = listingPrice ? Math.ceil(listingPrice * 0.3) : 1;
    const picks = listingPrice ? [5, 10, 15].map((p) => niceDown(listingPrice * (1 - p / 100))).filter((v, i, a) => v < listingPrice && a.indexOf(v) === i) : [];
    openModal(String(html`<h2>Предложить цену</h2>
      <p class="muted" style="margin:0 0 16px">${title}${listingPrice ? html` · сейчас <b style="color:var(--text)">${rub(listingPrice)}</b>` : ''}</p>
      <div class="ed-money offer-money"><label class="sr" for="of-sum">Ваша цена</label><input id="of-sum" class="input" inputmode="numeric" autocomplete="off" placeholder="Ваша цена"><span>₽</span></div>
      ${picks.length ? html`<div class="offer-picks">${picks.map((v) => html`<button type="button" class="chip" data-pick-sum="${v}">${rub(v)}<span class="cnt">−${Math.round((1 - v / listingPrice) * 100)}%</span></button>`)}</div>` : ''}
      <p class="offer-note">${ic('info', 16, 2)}<span>Продавец примет или отклонит предложение одной кнопкой — ответ придёт в чат.${listingPrice ? ` Можно предложить от ${rub(min)}.` : ''}</span></p>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-accent" data-ok>Предложить</button></div>`), (m, close) => {
      const inp = $('#of-sum', m);
      inp.oninput = () => { const d = inp.value.replace(/\D/g, '').slice(0, 11); inp.value = d ? NF.format(Number(d)) : ''; };
      $$('[data-pick-sum]', m).forEach((b) => { b.onclick = () => { inp.value = NF.format(Number(b.dataset.pickSum)); inp.focus(); }; });
      $('[data-x]', m).onclick = close;
      const ok = $('[data-ok]', m);
      ok.onclick = async () => {
        const sum = Number(inp.value.replace(/\D/g, ''));
        if (!sum) { inp.focus(); toast('Укажите сумму', true); return; }
        ok.disabled = true;
        try { await onSubmit(sum); close(); } catch (e) { toast(e.message, true); ok.disabled = false; }
      };
      setTimeout(() => inp.focus(), 50);
    });
  }
  // Карточка предложения в чате и её низ (кнопки или итог) — низ перерисовывается при каждом опросе.
  const offerCard = (o, m) => html`<div class="offer-card" data-offer="${m.offerId}">
      <div class="offer-k">${ic('tag', 14, 2.2)}Предложение цены</div>
      <div class="offer-sum"><b data-offer-sum></b><s data-offer-was></s></div>
      <div class="offer-foot" data-offer-foot></div></div>`;
  function paintOffers(root, offers, role) {
    for (const o of offers || []) {
      const el = $(`[data-offer="${o.id}"]`, root);
      if (!el || el.dataset.state === o.status) continue;
      el.dataset.state = o.status;
      $('[data-offer-sum]', el).textContent = rub(o.price);
      $('[data-offer-was]', el).textContent = o.listingPrice ? rub(o.listingPrice) : '';
      el.closest('.msg').classList.toggle('offer-off', o.status === 'withdrawn' || o.status === 'declined');
      $('[data-offer-foot]', el).innerHTML = String(o.status === 'pending'
        ? (role === 'seller'
          ? html`<button type="button" class="btn btn-accent btn-sm" data-offer-act="accept" data-oid="${o.id}">${ic('check', 16, 2.4)}Принять</button><button type="button" class="btn btn-soft btn-sm" data-offer-act="decline" data-oid="${o.id}">Отклонить</button>`
          : html`<span class="offer-st wait">${ic('clock', 15, 2)}Ждём ответа продавца</span><button type="button" class="offer-link" data-offer-act="withdraw" data-oid="${o.id}">Отозвать</button>`)
        : o.status === 'accepted' ? html`<span class="offer-st ok">${ic('check', 15, 2.6)}${role === 'seller' ? 'Вы согласились' : 'Продавец согласился'}</span>`
          : o.status === 'declined' ? html`<span class="offer-st">${role === 'seller' ? 'Вы отказались' : 'Продавец отказался'}</span>`
            : html`<span class="offer-st">${role === 'buyer' ? 'Вы отозвали или заменили предложение' : 'Покупатель отозвал или заменил предложение'}</span>`);
    }
  }

  // ---------- быстрые ответы продавца ----------
  function repliesModal(items, done) {
    let list = [...items];
    openModal(String(html`<h2>Быстрые ответы</h2><p class="muted" style="margin:0 0 14px">Появляются над полем сообщения — нажмите, чтобы вставить, поправьте и отправьте.</p>
      <div class="qr-list" id="qr-list"></div>
      <div class="qr-add"><label class="sr" for="qr-new">Новый ответ</label><input id="qr-new" class="input" maxlength="300" placeholder="Например: Отправлю СДЭКом в день оплаты"><button type="button" class="btn btn-dark" data-qr-add>${ic('plus', 18, 2.2)}<span class="sr">Добавить</span></button></div>
      <div class="modal-actions"><button class="btn btn-line" data-qr-reset>Вернуть стандартные</button><span style="flex:1"></span><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Сохранить</button></div>`), (m, close) => {
      const paint = () => {
        $('#qr-list', m).innerHTML = String(list.length ? html`${list.map((t, i) => html`<div class="qr-item"><span>${t}</span><button type="button" class="icon-btn sm" data-qr-rm="${i}" aria-label="Удалить ответ">${ic('trash', 16)}</button></div>`)}`
          : html`<div class="qr-empty">Пока пусто — добавьте свой первый ответ.</div>`);
        $$('[data-qr-rm]', m).forEach((b) => { b.onclick = () => { list.splice(Number(b.dataset.qrRm), 1); paint(); }; });
      };
      paint();
      const add = () => { const v = $('#qr-new', m).value.trim(); if (!v) return; if (list.length >= 12) { toast('Не больше 12 ответов', true); return; } list.push(v); $('#qr-new', m).value = ''; paint(); };
      $('[data-qr-add]', m).onclick = add;
      $('#qr-new', m).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
      $('[data-x]', m).onclick = close;
      $('[data-qr-reset]', m).onclick = async () => { try { const r = await api('PUT', '/api/my/replies', { reset: true }); close(); done(r.items); toast('Вернули стандартные ответы'); } catch (e) { toast(e.message, true); } };
      $('[data-ok]', m).onclick = async () => {
        const pending = $('#qr-new', m).value.trim(); if (pending) list.push(pending);
        try { const r = await api('PUT', '/api/my/replies', { items: list }); close(); done(r.items); toast('Ответы сохранены'); } catch (e) { toast(e.message, true); }
      };
    });
  }
  const repliesRow = (items) => html`${items.map((t) => html`<button type="button" class="chip" data-topic="${t}" title="${t}">${t.length > 42 ? `${t.slice(0, 40)}…` : t}</button>`)}<button type="button" class="chip qr-edit" data-qr-edit>${ic('edit', 15, 2)}${items.length ? 'Шаблоны' : 'Добавить шаблон'}</button>`;

  // ---------- подписка на продавца ----------
  const followLabel = (on) => html`${ic(on ? 'check' : 'bell', 18, 2.2)}<span>${on ? 'Вы подписаны' : 'Подписаться'}</span>`;
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-follow]');
    if (!b) return;
    e.preventDefault();
    if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    b.disabled = true;
    try {
      const r = await api('POST', `/api/users/${b.dataset.follow}/follow`, { follow: b.getAttribute('aria-pressed') !== 'true' });
      $$(`[data-follow="${b.dataset.follow}"]`).forEach((x) => { x.setAttribute('aria-pressed', r.following ? 'true' : 'false'); x.classList.toggle('on', r.following); x.innerHTML = String(followLabel(r.following)); });
      $$('[data-followers]').forEach((x) => { x.textContent = NF.format(r.followers); });
      toast(r.following ? 'Подписка оформлена — расскажем о новых объявлениях' : 'Вы отписались');
    } catch (ex) { toast(ex.message, true); }
    b.disabled = false;
  });
  const followBtn = (id, on, cls = 'btn-soft') => html`<button type="button" class="btn ${cls} btn-block follow-btn ${on ? 'on' : ''}" data-follow="${id}" aria-pressed="${on ? 'true' : 'false'}">${followLabel(on)}</button>`;

  const supportWelcome = () => html`<div class="msg in support-hello">
      <strong>Здравствуйте${S.user ? `, ${S.user.name}` : ''}!</strong> Это поддержка Торганы. Напишите вопрос — ответит человек, а не бот.
      Никогда не сообщайте пароль и коды из СМС — мы их не спрашиваем.
      <span class="chat-quick">${SUPPORT_TOPICS.map((t) => html`<button type="button" class="chip" data-topic="${t}">${t}</button>`)}</span></div>`;

  async function viewMessages(cid) {
    if (!requireAuth()) return;
    setTitle('Сообщения');
    const isSupport = cid === 'support';
    const convId = cid && !isSupport ? Number(cid) : null;
    app.innerHTML = String(html`<div class="wrap"><div class="inbox ${cid ? 'has-chat' : ''}">
      <div class="inbox-list"><h1>Сообщения</h1>
        <div id="nudge" class="inbox-nudge"></div>
        <a href="/messages/support" class="conv support ${isSupport ? 'on' : ''}" id="support-row">
          ${supportAva()}
          <span class="conv-body"><span class="conv-top"><span class="support-name">${SUPPORT_NAME}</span><span class="pin" title="Закреплено">${ic('pin', 14)}</span></span>
            <span class="conv-last" style="display:block" id="support-last">Поможем с объявлениями, сделками и аккаунтом</span></span>
          <span class="badge hidden" id="support-badge"></span>
        </a>
        <div id="convs"><div class="loader"></div></div></div>
      <section class="chat" id="chat">${cid ? html`<div class="loader" style="flex:1"></div>` : html`<div class="chat-empty"><div>${svg(P.chat, 40, 1.4)}<p>Выберите диалог слева.<br>Чтобы написать продавцу, откройте объявление.</p></div></div>`}</section>
    </div></div>`);

    pushNudge($('#nudge'), 'Узнаете о новых сообщениях сразу, даже когда сайт закрыт.');
    const loadList = async () => {
      const [{ items }, sup] = await Promise.all([api('GET', '/api/conversations'), isSupport ? null : api('GET', '/api/support')]);
      const box = $('#convs');
      if (!box) return;
      if (sup) {
        const last = sup.messages[sup.messages.length - 1];
        if (last) $('#support-last').textContent = `${last.mine ? 'Вы: ' : ''}${last.body || (last.photo ? '📷 Фото' : '')}`;
      }
      box.innerHTML = items.length ? String(html`${items.map((c) => html`<a href="/messages/${c.id}" class="conv ${c.id === convId ? 'on' : ''}">
          <span class="conv-img">${c.photo ? html`<img src="${c.photo}" alt="" loading="lazy">` : svg(P.image, 22, 1.4)}${ava(c.other, 'xs conv-ava')}</span>
          <span class="conv-body">
            <span class="conv-top"><span>${c.other.name}${c.role === 'seller' ? ' · покупатель' : ''}</span><span>${shortWhen(c.updatedAt)}</span></span>
            <span class="conv-title" style="display:block">${c.title}</span>
            <span class="conv-last" style="display:block">${c.lastBody || 'Нет сообщений'}</span>
          </span>
          ${c.unread ? html`<span class="badge">${c.unread}</span>` : ''}
        </a>`)}`)
        : String(html`<div style="padding:8px 22px 22px" class="muted">Здесь появятся переписки с продавцами и покупателями.</div>`);
    };
    // Непрочитанные ответы поддержки — счётчик на закреплённом диалоге.
    const supportBadge = () => {
      const other = $$('#convs .badge').reduce((n, b) => n + Number(b.textContent || 0), 0);
      const n = Math.max(0, S.unread - other);
      const b = $('#support-badge'); if (b) { b.textContent = n; b.classList.toggle('hidden', !n || isSupport); }
    };

    await loadList();
    supportBadge();
    const listTimer = setInterval(() => loadList().then(supportBadge).catch(() => {}), 15000);
    let stopChat = () => {};
    cleanup = () => { clearInterval(listTimer); stopChat(); };
    if (!cid) return;

    if (isSupport) {
      stopChat = mountChat($('#chat'), {
        head: html`${supportAva(44)}<div style="flex:1;min-width:0"><div class="support-name">${SUPPORT_NAME}</div><span class="muted" style="font-size:14px">Отвечают люди, а не боты</span></div>`,
        load: (after) => api('GET', `/api/support?after=${after}`),
        send: async (msg) => (await api('POST', '/api/support/messages', msg)).message,
        empty: supportWelcome(),
        placeholder: 'Опишите вопрос…',
        onActivity: () => refreshMe()
      });
      return;
    }
    const data = await api('GET', `/api/conversations/${convId}`);
    const { listing: l, other } = data;
    const role = data.conversation.role;
    const canOffer = role === 'buyer' && l.status === 'active' && (l.bargain || l.price === null); // продавец указал «без торга» — кнопки ₽ нет
    const reviewBar = (rv) => {
      if (!rv) return '';
      if (rv.status) return html`<div class="rv-bar-chat done">${ic('check', 16, 2.4)}<span>${rv.status === 'pending' ? 'Ваш отзыв о продавце на проверке.' : rv.status === 'published' ? 'Ваш отзыв о продавце опубликован.' : 'Вы уже оставили отзыв по этому объявлению.'}</span><a href="/profile/reviews?tab=mine">Мои отзывы</a></div>`;
      if (!rv.can) return '';
      return html`<div class="rv-bar-chat">${starSvg(true, 18)}<span><b>Как прошла сделка?</b> Оставьте отзыв о продавце — товар получен или нет.</span><button type="button" class="btn btn-dark btn-sm" data-review>Оставить отзыв</button></div>`;
    };
    stopChat = mountChat($('#chat'), {
      head: html`<a href="/l/${l.id}" class="conv-img" aria-hidden="true" tabindex="-1">${l.photo ? html`<img src="${l.photo}" alt="">` : svg(P.image, 20, 1.4)}</a>
        <div style="flex:1;min-width:0"><a href="/l/${l.id}" style="display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.title}</a>
          <span class="muted" style="font-size:14px">${price(l.price, l.priceUnit)} · ${other.name}</span></div>
        ${l.status === 'sold' ? html`<span class="tag dark">Продано</span>` : ''}`,
      below: html`<div data-review-slot></div>`,
      load: async (after) => {
        const r = await api('GET', `/api/conversations/${convId}?after=${after}`);
        const slot = $('[data-review-slot]');
        if (slot && JSON.stringify(r.review) !== slot.dataset.state) {
          slot.dataset.state = JSON.stringify(r.review);
          slot.innerHTML = String(reviewBar(r.review));
          const b = $('[data-review]', slot);
          if (b) b.onclick = () => reviewForm(convId, other.name, l.title, () => { slot.dataset.state = ''; });
        }
        return r;
      },
      send: async (msg) => { const r = await api('POST', `/api/conversations/${convId}/messages`, msg); loadList().catch(() => {}); return r.message; },
      decorate: (m) => (m.kind === 'offer' ? { cls: 'offer-msg', body: offerCard(null, m) } : m.kind === 'offer-reply' ? { cls: 'offer-reply', body: html`${m.body}` } : null),
      onData: (r) => paintOffers($('#chat'), r.offers, role),
      tools: role === 'seller' ? html`<div class="chat-tools" data-replies></div>` : '',
      left: canOffer ? html`<button type="button" class="icon-btn chat-offer" data-make-offer title="Предложить цену" aria-label="Предложить цену">₽</button>` : '',
      scam: true,
      empty: html`<div class="chat-day">Напишите первое сообщение — например, уточните состояние или договоритесь о встрече.${canOffer && l.price ? ' Или предложите свою цену кнопкой ₽.' : ''}</div>`,
      onActivity: () => refreshMe()
    });
    const chatEl = $('#chat');
    chatEl.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-offer-act]');
      if (a) {
        a.disabled = true;
        try {
          await api('POST', `/api/offers/${a.dataset.oid}/${a.dataset.offerAct}`);
          await stopChat.poll(); loadList().catch(() => {});
          toast({ accept: 'Вы приняли предложение — покупатель получит уведомление', decline: 'Предложение отклонено', withdraw: 'Предложение отозвано' }[a.dataset.offerAct]);
        } catch (ex) { toast(ex.message, true); a.disabled = false; }
        return;
      }
      if (e.target.closest('[data-make-offer]')) {
        offerModal({ listingPrice: l.price, title: l.title, onSubmit: async (sum) => { await api('POST', `/api/conversations/${convId}/offer`, { price: sum }); await stopChat.poll(); loadList().catch(() => {}); toast('Предложение отправлено продавцу'); } });
        return;
      }
      if (e.target.closest('[data-qr-edit]')) repliesModal(qrItems, paintReplies);
    });
    let qrItems = [];
    const paintReplies = (items) => { qrItems = items; const row = $('[data-replies]', chatEl); if (row) row.innerHTML = String(repliesRow(items)); };
    if (role === 'seller') api('GET', '/api/my/replies').then((r) => paintReplies(r.items)).catch(() => {});
  }

  // ================= отзывы: общие части =================
  const STAR = '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>';
  const starSvg = (on, size) => raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="${on ? 'st-on' : 'st-off'}" aria-hidden="true">${STAR}</svg>`);
  const stars = (n, size = 15) => html`<span class="stars" role="img" aria-label="Оценка ${n} из 5">${[1, 2, 3, 4, 5].map((i) => starSvg(i <= n, size))}</span>`;
  const fmtAvg = (r) => r.avg.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const reviewsWord = (n) => plural(n, 'отзыв', 'отзыва', 'отзывов');
  // «★ 4,7 · 23 отзыва» или «Пока нет отзывов».
  const ratingLine = (r, href = '') => {
    const inner = r && r.count ? html`${starSvg(true, 16)}<b>${fmtAvg(r)}</b><span>· ${r.count} ${reviewsWord(r.count)}</span>` : html`${starSvg(false, 16)}<span>Пока нет отзывов</span>`;
    return href ? html`<a class="rating-line" href="${href}">${inner}</a>` : html`<span class="rating-line">${inner}</span>`;
  };
  // Крупная оценка и полоски «сколько пятёрок, четвёрок…».
  const ratingSummary = (r) => html`<div class="rv-sum">
      <div class="rv-sum-big"><b>${r.count ? fmtAvg(r) : '—'}</b>${stars(Math.round(r.avg), 17)}<span>${r.count ? `${r.count} ${reviewsWord(r.count)}` : 'Пока нет отзывов'}</span></div>
      <div class="rv-bars">${[5, 4, 3, 2, 1].map((k) => html`<div class="rv-bar"><span>${k}</span><div><i style="width:${r.count ? Math.round((r.dist[k] / r.count) * 100) : 0}%"></i></div><span class="n">${r.dist[k]}</span></div>`)}</div>
    </div>`;
  const RV_STATUS = { pending: ['wait', 'На проверке'], published: ['ok', 'Опубликован'], rejected: ['bad', 'Не опубликован'], hidden: ['bad', 'Скрыт по жалобе'] };
  // Карточка отзыва. mode: public | seller (обо мне — ответить, пожаловаться) | author (мой отзыв — статус).
  function reviewCard(rv, mode = 'public') {
    const other = mode === 'author' ? rv.seller : rv.author;
    const st = mode === 'author' ? RV_STATUS[rv.status] : null;
    const c = rv.complaint;
    return html`<article class="rv-card" data-rv="${rv.id}">
      <div class="rv-head">${ava(other, 'sm')}
        <div class="rv-who"><b>${mode === 'author' ? html`Продавец ${other.name}` : other.name}</b><span>${when(rv.createdAt).replace(/ в \d\d:\d\d$/, '')}${mode === 'author' ? '' : ' · покупатель'}</span></div>
        ${stars(rv.rating)}</div>
      <p class="rv-text">${rv.text}</p>
      <div class="rv-meta"><span class="rv-item">${ic('tag', 13)}${rv.listing.id ? html`<a href="/l/${rv.listing.id}">${rv.listing.title}</a>` : rv.listing.title}</span>
        <span class="rv-deal ${rv.received ? 'ok' : 'no'}">${rv.received ? html`${ic('check', 13, 2.6)}Товар получен` : 'Товар не получен'}</span>
        ${st ? html`<span class="ml-tag ${st[0]}"><i></i>${st[1]}</span>` : ''}</div>
      ${mode === 'author' && rv.reason && (rv.status === 'rejected' || rv.status === 'hidden') ? html`<div class="ml-note bad"><strong>Причина:</strong> ${rv.reason}</div>` : ''}
      ${rv.reply ? html`<div class="rv-reply"><b>Ответ продавца</b><p>${rv.reply.text}</p></div>` : ''}
      ${mode === 'seller' && rv.replyDraft ? html`<div class="ml-note ${rv.replyDraft.status === 'rejected' ? 'bad' : 'warn'}">${rv.replyDraft.status === 'rejected' ? html`<strong>Ответ не опубликован:</strong> ${rv.replyDraft.reason}. Можно написать заново.` : html`<strong>Ваш ответ на проверке:</strong> ${rv.replyDraft.text}`}</div>` : ''}
      ${mode === 'seller' && c ? html`<div class="ml-note ${c.resolved ? (c.decision === 'hidden' ? 'ok' : 'soft') : 'warn'}">${!c.resolved
    ? html`<strong>Жалоба на рассмотрении.</strong> Отзыв виден, пока модератор не решит.`
    : c.decision === 'hidden' ? html`<strong>Жалоба принята — отзыв скрыт.</strong> ${c.comment}` : html`<strong>Жалоба рассмотрена — отзыв остаётся.</strong> ${c.comment || ''}`}</div>` : ''}
      ${mode === 'seller' && rv.status === 'published' && (rv.canReply || rv.canComplain) ? html`<div class="rv-actions">
        ${rv.canReply ? html`<button type="button" class="btn btn-soft btn-sm" data-rv-reply="${rv.id}">${ic('reply', 16, 2)}Ответить</button>` : ''}
        ${rv.canComplain ? html`<button type="button" class="btn btn-soft btn-sm" data-rv-complain="${rv.id}">${ic('flag', 16, 2)}Пожаловаться</button>` : ''}</div>` : ''}
    </article>`;
  }

  // Оставить отзыв о продавце: итог сделки, оценка, текст. Изменить потом нельзя.
  function reviewForm(convId, sellerName, title, done) {
    const LABELS = ['', 'Очень плохо', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];
    openModal(String(html`<h2>Отзыв о продавце</h2>
      <p class="muted" style="margin:0 0 16px">${sellerName} · «${title}»</p>
      <fieldset class="rv-f"><legend>Как прошла сделка?</legend>
        <div class="rv-deal-pick"><label><input type="radio" name="received" value="1"><span>${ic('check', 16, 2.4)}Товар получен</span></label><label><input type="radio" name="received" value="0"><span>Товар не получен</span></label></div></fieldset>
      <fieldset class="rv-f"><legend>Оценка</legend>
        <div class="rv-stars-pick" role="radiogroup" aria-label="Оценка">${[1, 2, 3, 4, 5].map((i) => html`<button type="button" role="radio" aria-checked="false" aria-label="${i} из 5 — ${LABELS[i]}" data-star="${i}">${starSvg(false, 38)}</button>`)}</div>
        <div class="rv-star-label" data-star-label>Выберите от 1 до 5</div></fieldset>
      <div class="field"><label for="rv-text">Отзыв</label><textarea id="rv-text" class="textarea" maxlength="1000" placeholder="Расскажите по делу: товар, общение, встреча"></textarea>
        <span class="help">Без оскорблений, телефонов и ссылок.</span></div>
      <div class="rv-lock">${ic('lock', 18, 1.9)}<span><strong>Изменить или удалить отзыв будет нельзя.</strong> Он появится после проверки модератором.</span></div>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Отправить отзыв</button></div>`), (m, close) => {
      let rating = 0;
      const paint = () => {
        $$('[data-star]', m).forEach((b) => { const on = Number(b.dataset.star) <= rating; b.innerHTML = String(starSvg(on, 38)); b.setAttribute('aria-checked', Number(b.dataset.star) === rating ? 'true' : 'false'); });
        $('[data-star-label]', m).textContent = rating ? LABELS[rating] : 'Выберите от 1 до 5';
      };
      $$('[data-star]', m).forEach((b) => { b.onclick = () => { rating = Number(b.dataset.star); paint(); }; });
      $('[data-x]', m).onclick = close;
      $('[data-ok]', m).onclick = async () => {
        const rec = $('input[name="received"]:checked', m);
        if (!rec) { toast('Укажите, получили ли вы товар', true); return; }
        if (!rating) { toast('Поставьте оценку', true); return; }
        try {
          await api('POST', '/api/reviews', { conversationId: convId, rating, received: rec.value === '1', text: $('#rv-text', m).value.trim() });
          close(); toast('Спасибо! Отзыв появится после проверки'); done();
        } catch (e) { toast(e.message, true); }
      };
    });
  }

  // Ответ продавца на отзыв — один раз.
  function replyModal(id, done) {
    openModal(String(html`<h2>Ответ на отзыв</h2><p class="muted" style="margin:0 0 12px">Ответ увидят все рядом с отзывом. Изменить его потом нельзя, он появится после проверки модератором.</p>
      <label class="sr" for="rv-reply">Ответ</label><textarea id="rv-reply" class="textarea" style="min-height:120px" maxlength="1000" placeholder="Спокойно объясните, как всё было"></textarea>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Отправить ответ</button></div>`), (m, close) => {
      $('[data-x]', m).onclick = close;
      $('[data-ok]', m).onclick = async () => {
        try { await api('POST', `/api/reviews/${id}/reply`, { text: $('#rv-reply', m).value.trim() }); close(); toast('Ответ отправлен на проверку'); done(); } catch (e) { toast(e.message, true); }
      };
    });
  }

  // Жалоба на отзыв: причина и обязательное обоснование.
  function complaintModal(id, reasons, done) {
    openModal(String(html`<h2>Пожаловаться на отзыв</h2><p class="muted" style="margin:0 0 12px">Отзыв останется на месте, пока модератор не примет решение. Пожаловаться на отзыв можно один раз.</p>
      <fieldset class="rv-f"><legend>Что не так?</legend><div class="rv-reasons">${reasons.map((r, i) => html`<label><input type="radio" name="reason" value="${r}"${i === 0 ? raw(' checked') : ''}><span>${r}</span></label>`)}</div></fieldset>
      <div class="field"><label for="rv-why">Обоснуйте жалобу</label><textarea id="rv-why" class="textarea" maxlength="1000" placeholder="Что именно неправда или нарушает правила"></textarea>
        <span class="help">Минимум 20 символов. Модератор увидит отзыв, объявление и ваше обоснование.</span></div>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Отправить жалобу</button></div>`), (m, close) => {
      $('[data-x]', m).onclick = close;
      $('[data-ok]', m).onclick = async () => {
        try {
          await api('POST', `/api/reviews/${id}/complaint`, { reason: $('input[name="reason"]:checked', m).value, text: $('#rv-why', m).value.trim() });
          close(); toast('Жалоба отправлена — модератор проверит'); done();
        } catch (e) { toast(e.message, true); }
      };
    });
  }

  // ================= профиль =================
  const MY_STATUS = { active: 'Активные', scheduled: 'Запланированы', pending: 'На проверке', rejected: 'На исправлении', sold: 'Проданные', archived: 'Сняты' };
  const MY_TAG = { active: ['ok', 'Опубликовано'], scheduled: ['wait', 'Запланировано'], pending: ['wait', 'На проверке'], rejected: ['bad', 'Нужно исправить'], sold: ['dark', 'Продано'], archived: ['off', 'Снято'] };
  const isExpired = (i) => i.status === 'archived' && i.expiresAt && i.expiresAt <= Date.now(); // прошло 30 дней
  const atTime = (ts) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

  // Насколько заполнен профиль: имя есть всегда, дальше фото, город и (если есть почта) подтверждённый email.
  function profileTodo(u) {
    const todo = [
      [!!u.avatar, 'Добавить фото', 'avatar'],
      [!!u.city, 'Указать город', 'city'],
      ...(S.config.mail ? [[u.emailVerified, 'Подтвердить почту', 'verify']] : [])
    ];
    return { todo: todo.filter((t) => !t[0]), pct: Math.round(((todo.filter((t) => t[0]).length + 1) / (todo.length + 1)) * 100) };
  }
  // Своя карточка слева в профиле и настройках: фото с камерой, имя, значки, цифры, заполненность.
  function idCard(u, stats = []) {
    const { todo, pct } = profileTodo(u);
    const badges = html`${trustBadges(u.badges)}${S.config.mail ? (u.emailVerified
      ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Почта подтверждена</span>`
      : html`<span class="pf-badge warn">${ic('warn', 13, 2)} Почта не подтверждена</span>`) : ''}
      ${u.isAdmin ? html`<span class="pf-badge">${ic('shield', 13, 2)} ${u.isOwner ? 'Владелец' : 'Модератор'}</span>` : ''}`;
    return html`<div class="pf-card">
      <div class="pf-who">
        <div class="pf-ava">${ava(u, 'lg')}<button class="pf-cam" type="button" data-ava-pick aria-label="${u.avatar ? 'Сменить фото профиля' : 'Добавить фото профиля'}">${ic('camera', 15, 2)}</button></div>
        <div class="pf-who-txt">
          <div class="pf-name">${u.name}</div>
          <div class="pf-sub">${u.city ? `${u.city} · ` : ''}на Торгане с ${since(u.createdAt)}</div>
          ${u.rating ? ratingLine(u.rating, '/profile/reviews') : ''}
        </div>
        <a class="icon-btn pf-gear" href="/profile/settings" aria-label="Настройки">${ic('gear', 20)}</a>
      </div>
      ${String(badges).trim() ? html`<div class="pf-badges">${badges}</div>` : ''}
      ${stats.length ? html`<div class="pf-nums">${stats.map(([n, k, href]) => html`<a class="pf-num" href="${href}"><b>${NF.format(n)}</b><span>${k}</span></a>`)}</div>` : ''}
      ${pct < 100 ? html`<div class="pf-progress">
        <div class="pf-progress-head"><span>Профиль заполнен</span><b>${pct}%</b></div>
        <div class="pf-bar"><i style="width:${pct}%"></i></div>
        <div class="pf-todo">${todo.map((t) => html`<button type="button" class="chip" data-todo="${t[2]}">${ic('plus', 15, 2)}${t[1]}</button>`)}</div>
      </div>` : ''}
    </div>`;
  }
  // Камера на фото и подсказки «Добавить фото», «Указать город», «Подтвердить почту».
  function bindIdCard(again) {
    $('[data-ava-pick]').onclick = () => pickAvatar(again);
    $$('[data-todo]').forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.todo;
        if (t === 'avatar') pickAvatar(again);
        else if (t === 'city') go('/profile/settings#s-city');
        else verifyModal(again);
      };
    });
  }

  // Значки доверия продавца: «Телефон подтверждён», «ИП проверен» / «Компания проверена».
  const trustBadges = (b) => (b ? html`${b.shop ? html`<span class="pf-badge dark">${ic('store', 13, 2)} Магазин</span>` : ''}${b.biz ? html`<span class="pf-badge ok" title="${b.biz.name}">${ic('shield', 13, 2)} ${b.biz.kind === 'ИП' ? 'ИП проверен' : 'Компания проверена'}</span>` : ''}${b.phone ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Телефон подтверждён</span>` : ''}` : '');

  // Разделы аккаунта и «Выйти» — одно меню для левой колонки профиля (на компьютере) и для панели ≡ (full).
  // В панели вместо пункта «Настройки» — все группы настроек, публичный профиль и помощь.
  const FOOTER_LABEL = Object.fromEntries(FOOTER_COLS.flatMap((c) => c[1]));
  const HELP_LINKS = [['/page/help', 'search'], ['/page/safety', 'shield'], ['/page/rules', 'flag'], ['/business', 'store']];
  function navKey() {
    const p = location.pathname;
    if (p === '/profile' || p.startsWith('/profile/listings') || p.startsWith('/profile/stats')) return 'listings';
    if (p.startsWith('/profile/')) return p.split('/')[2];
    if (p === '/messages/support') return 'support';
    return { '/favorites': 'fav', '/messages': 'msg', '/admin': 'admin', '/new': 'new' }[p.startsWith('/messages') ? '/messages' : p] || p;
  }
  // Пункт меню со значком — один для меню профиля, панели ≡ и меню модерации.
  const navLink = (href, icon, label, on, right = '', key = '') => html`<a href="${href}" class="${on ? 'on' : ''}"${on ? raw(' aria-current="page"') : ''}${key ? raw(` data-k="${key}"`) : ''}>${ic(icon, 20)}<span class="lbl">${label}</span>${right}</a>`;
  // На телефоне в профиле меню прячется, а четыре пункта (data-k: msg, fav, searches, reviews) становятся плитками.
  function profileNav(full = false) {
    const active = navKey();
    const u = S.user;
    const item = (href, icon, label, key = href, right = '') => navLink(href, icon, label, active === key, right, key);
    const head = (t) => html`<div class="pf-nav-h">${t}</div>`;
    const help = HELP_LINKS.map(([href, icon]) => item(href, icon, FOOTER_LABEL[href]));
    if (!u) {
      return html`<nav class="pf-nav full" aria-label="Меню">
        ${item('/new', 'plus', 'Разместить объявление', 'new')}
        ${item('/page/support', 'headset', 'Поддержка')}
        ${head('Помощь')}${help}
      </nav>`;
    }
    const pub = item(`/u/${u.id}`, 'eye', 'Как меня видят покупатели');
    return html`<nav class="pf-nav ${full ? 'full' : ''}" aria-label="${full ? 'Меню' : 'Разделы профиля'}">
      ${item('/profile', 'tag', 'Мои объявления', 'listings')}
      ${item('/messages', 'chat', 'Сообщения', 'msg', html`<span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span>`)}
      ${item('/favorites', 'heart', 'Избранное', 'fav')}
      ${item('/profile/searches', 'bell', 'Поиски', 'searches', freshBadge())}
      ${item('/profile/following', 'users', 'Подписки', 'following', html`<span class="badge ${S.fresh && S.fresh.follow ? '' : 'hidden'}" data-fresh-follow>${S.fresh ? S.fresh.follow || 0 : 0}</span>`)}
      ${item('/profile/reviews', 'star', 'Отзывы', 'reviews', u.rating && u.rating.count ? html`<span class="nav-rating">${starSvg(true, 14)}${fmtAvg(u.rating)}</span>` : '')}
      ${item('/profile/business', 'store', 'Для бизнеса', 'business', u.plan ? html`<span class="nav-plan">${u.plan.id === 'pro' ? 'Про' : 'Магазин'}</span>` : '')}
      ${full ? '' : html`<hr>${item('/profile/settings', 'gear', 'Настройки', 'settings')}`}
      ${item('/messages/support', 'headset', 'Поддержка', 'support')}
      ${u.isAdmin ? item('/admin', 'shield', 'Модерация', 'admin') : ''}
      ${full ? html`${head('Настройки')}
        ${SET_SECTIONS.map(([id, icon, label]) => item(`/profile/settings#${id}`, icon, label, ''))}
        ${head('Публичный профиль')}
        ${pub}
        <button type="button" data-share-me>${ic('share', 20)}<span class="lbl">Поделиться профилем</span></button>
        ${head('Помощь')}${help}` : pub}
      <hr>
      <button type="button" class="out" data-logout>${ic('logout', 20, 2)}<span class="lbl">Выйти из аккаунта</span></button>
    </nav>`;
  }

  // Панель ≡ справа: кто вошёл (или «Войти»), все разделы и настройки, документы внизу.
  function openMenu() {
    const u = S.user;
    const docs = FOOTER_COLS[FOOTER_COLS.length - 1][1].concat([['/page/contacts', FOOTER_LABEL['/page/contacts']]]);
    openModal(String(html`<div class="menu-top">
        ${u ? html`<a class="menu-me" href="/profile">${ava(u, 'lg')}<span class="menu-me-txt"><b>${u.name}</b><small>${u.city ? `${u.city} · ` : ''}Мой профиль</small></span></a>`
    : html`<div class="menu-me-txt"><b>Добро пожаловать</b><small>Войдите, чтобы писать продавцам и размещать объявления</small></div>`}
        <button type="button" class="icon-btn" data-x aria-label="Закрыть меню">${ic('close', 20, 2)}</button>
      </div>
      ${u ? '' : html`<div class="menu-auth"><a class="btn btn-dark" href="/login">Войти</a><a class="btn btn-soft" href="/register">Регистрация</a></div>`}
      ${profileNav(true)}
      <div class="menu-docs">${docs.map(([href, label]) => html`<a href="${href}">${label}</a>`)}</div>`), (m, close) => {
      m.classList.add('drawer'); m.parentElement.classList.add('drawer-back'); m.setAttribute('aria-label', 'Меню');
      $('[data-x]', m).onclick = close;
      m.addEventListener('click', (e) => { if (e.target.closest('a[href], [data-logout]')) close(); });
      const sh = $('[data-share-me]', m);
      if (sh) sh.onclick = () => { close(); shareLink(`${location.origin}/u/${u.id}`, `${u.name} на Торгане`); };
    });
  }

  async function logout() {
    await api('POST', '/api/auth/logout').catch(() => {});
    S.user = null; setUnread(0);
    toast('Вы вышли из аккаунта');
    go('/', true);
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-logout]')) logout(); });

  // Загрузка фото профиля: квадрат 512×512 → /api/uploads → PATCH /api/me.
  function pickAvatar(done) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
    inp.onchange = async () => {
      const file = inp.files[0];
      if (!file) return;
      toast('Загружаем фото…');
      try {
        const up = await api('POST', '/api/uploads', await resizeImage(file, 512, true));
        const r = await api('PATCH', '/api/me', { avatar: up.file });
        S.user = r.user; renderHeader(); toast('Фото профиля обновлено'); done();
      } catch (e) { toast(e.message, true); }
    };
    inp.click();
  }
  async function removeAvatar(done) {
    if (!(await confirmModal('Убрать фото профиля?', 'Вместо фото будет первая буква имени.', 'Убрать', true))) return;
    try { const r = await api('PATCH', '/api/me', { avatar: '' }); S.user = r.user; renderHeader(); toast('Фото убрано'); done(); } catch (e) { toast(e.message, true); }
  }

  async function shareLink(url, title) {
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch { /* отмена */ } }
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { toast(url); }
  }

  // Меню действий: на телефоне выезжает снизу, на компьютере — окно по центру.
  function actionSheet(title, items) {
    openModal(String(html`<div class="sheet-title">${title}</div>
      <div class="sheet-list">${items.map((it, i) => (it.href
        ? html`<a class="sheet-item ${it.danger ? 'danger' : ''}" href="${it.href}">${ic(it.icon, 20)}<span>${it.label}</span></a>`
        : html`<button type="button" class="sheet-item ${it.danger ? 'danger' : ''}" data-i="${i}">${ic(it.icon, 20)}<span>${it.label}</span></button>`))}</div>
      <button type="button" class="btn btn-soft sheet-cancel" data-x>Отмена</button>`), (m, close) => {
      m.classList.add('sheet'); m.parentElement.classList.add('sheet-back');
      $('[data-x]', m).onclick = close;
      $$('.sheet-item', m).forEach((b) => { b.addEventListener('click', () => { close(); if (b.dataset.i !== undefined) items[Number(b.dataset.i)].run(); }); });
    });
  }

  // /profile (= /profile/listings) — карточка и «Мои объявления»; на компьютере слева ещё меню разделов.
  // Отзывы, настройки, статистика — разделы; на телефоне без карточки, со ссылкой «Профиль». Всё меню — в ≡.
  async function viewProfile(section, q) {
    if (!requireAuth()) return;
    if (!section && q.get('tab') === 'settings') { go(`/profile/settings${location.hash}`, true); return; }
    if (section === 'settings') { viewSettings(); return; }
    const hub = !section || section === 'listings';
    const statId = section && section.startsWith('stats/') ? section.slice(6) : null;
    const bizSub = section && section.startsWith('business') ? section.split('/')[1] || '' : null;
    const sec = statId ? 'stats' : bizSub !== null ? 'business' : section || 'listings';
    const BIZ_TITLE = { '': 'Для бизнеса', shop: 'Витрина магазина', stats: 'Статистика магазина', feed: 'Автозагрузка' };
    setTitle(sec === 'business' ? BIZ_TITLE[bizSub] : { stats: 'Статистика', reviews: 'Отзывы', searches: 'Поиски', following: 'Подписки' }[sec] || 'Профиль');
    const u = S.user;
    const { items } = await api('GET', '/api/my/listings');
    const count = (st) => items.filter((i) => i.status === st).length;
    const fix = items.filter((i) => i.status === 'rejected');
    const attention = fix.length ? html`<div class="pf-attn">
        <span class="pf-attn-ic">${ic('warn', 20, 2)}</span>
        <div class="pf-attn-txt"><strong>${fix.length === 1 ? '1 объявление нужно исправить' : `${fix.length} ${plural(fix.length, 'объявление', 'объявления', 'объявлений')} нужно исправить`}</strong>
          <span>«${fix[0].title}» — ${fix[0].rejectReason || 'причина не указана'}</span></div>
        <a class="btn btn-dark btn-sm" href="/edit/${fix[0].id}">Исправить</a>
      </div>` : '';
    const days = ['7', '30', '0'].includes(q.get('days')) ? q.get('days') : '30';
    const bizDays = ['7', '30', '90'].includes(q.get('days')) ? q.get('days') : '30';
    const head = sec === 'business'
      ? html`<div class="pf-head"><h1>${BIZ_TITLE[bizSub]}</h1>${bizSub === 'stats' ? html`<div class="seg" role="tablist">${[['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней']].map(([v, t]) => html`<a role="tab" aria-selected="${v === bizDays ? 'true' : 'false'}" class="${v === bizDays ? 'on' : ''}" href="/profile/business/stats?days=${v}">${t}</a>`)}</div>`
        : bizSub === '' ? html`<a class="btn btn-soft" href="/business">${ic('tag', 18, 2)}<span>Тарифы и цены</span></a>` : bizSub === 'shop' ? html`<a class="btn btn-soft" href="/u/${u.id}">${ic('eye', 18, 2)}<span>Как видят покупатели</span></a>` : ''}</div>`
      : sec === 'stats'
      ? html`<div class="pf-head"><h1>Статистика</h1><div class="seg" role="tablist">${[['7', '7 дней'], ['30', '30 дней'], ['0', 'Всё время']].map(([v, t]) => html`<a role="tab" aria-selected="${v === days ? 'true' : 'false'}" class="${v === days ? 'on' : ''}" href="/profile/stats/${statId}?days=${v}">${t}</a>`)}</div></div>`
      : sec === 'following'
      ? html`<div class="pf-head"><h1>Подписки</h1></div>`
      : sec === 'searches'
      ? html`<div class="pf-head"><h1>Поиски</h1><a class="btn btn-soft" href="/search">${ic('search', 18, 2)}<span>Новый поиск</span></a></div>`
      : sec === 'reviews'
      ? html`<div class="pf-head"><h1>Отзывы</h1><div class="seg" role="tablist">${[['', 'Обо мне'], ['mine', 'Я оставил']].map(([v, t]) => html`<a role="tab" aria-selected="${(q.get('tab') || '') === v ? 'true' : 'false'}" class="${(q.get('tab') || '') === v ? 'on' : ''}" href="/profile/reviews${v ? `?tab=${v}` : ''}">${t}</a>`)}</div></div>`
      : html`<div class="pf-head"><h1>Мои объявления</h1><a class="btn btn-accent" href="/new" aria-label="Разместить объявление">${ic('plus', 18, 2.2)}<span>Разместить</span></a></div>`;
    app.innerHTML = String(html`<div class="wrap pf2 ${hub ? 'is-hub' : 'is-section'}">
      <aside class="pf-side">
        ${idCard(u, [[count('active'), plural(count('active'), 'активное', 'активных', 'активных'), '/profile?status=active'], [count('sold'), 'продано', '/profile?status=sold']])}
        ${profileNav()}
      </aside>
      <section class="pf-main">
        ${sec === 'stats' ? html`<a class="pf-back always" href="/profile">${ic('left', 18, 2)}Мои объявления</a>` : sec === 'business' && bizSub ? html`<a class="pf-back always" href="/profile/business">${ic('left', 18, 2)}Для бизнеса</a>` : hub ? '' : html`<a class="pf-back" href="/profile">${ic('left', 18, 2)}Профиль</a>`}
        ${head}
        ${sec === 'listings' ? attention : ''}
        <div id="box"></div>
      </section>
    </div>`);
    const again = () => viewProfile(section, q);
    bindIdCard(again);
    if (sec === 'stats') return renderStats(statId, days);
    if (sec === 'business') return renderBusinessHub(bizSub, bizDays, again);
    if (sec === 'reviews') return renderMyReviews(q.get('tab') === 'mine' ? 'mine' : 'about', again);
    if (sec === 'searches') return renderSavedSearches(again);
    if (sec === 'following') return renderFollowing(again);
    return renderMyListings(items, q.get('status') || 'active', again);
  }

  function renderMyListings(items, status, reload) {
    const groups = { active: [], scheduled: [], pending: [], rejected: [], sold: [], archived: [] };
    items.forEach((i) => (groups[i.status] || groups.archived).push(i));
    const list = groups[status] || [];
    const tips = [
      ['camera', 'Светлые фото', 'Снимайте при дневном свете, с разных сторон — первое фото видно в поиске.'],
      ['sparkle', 'Честная цена', 'При размещении подскажем цену по похожим объявлениям.'],
      ['chat', 'Отвечайте быстро', 'Первые часы после публикации — самые активные.']
    ];
    $('#box').innerHTML = String(html`
      ${items.length ? html`<div class="pf-status" role="tablist">${Object.keys(MY_STATUS).filter((k) => k !== 'scheduled' || groups.scheduled.length || status === k).map((k) => html`<a class="chip ${k === status ? 'active' : ''} ${groups[k].length ? '' : 'zero'}" href="/profile?status=${k}">${MY_STATUS[k]}<span class="cnt">${groups[k].length}</span></a>`)}</div>` : ''}
      ${list.length ? html`<div class="ml-list">${list.map((i) => {
        const [tone, label] = isExpired(i) ? ['off', 'Срок истёк'] : MY_TAG[i.status] || MY_TAG.archived;
        return html`<article class="ml-card">
          <a href="/l/${i.id}" class="ml-img">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
          <div class="ml-info">
            <span class="ml-tag ${tone}"><i></i>${label}</span>
            <a href="/l/${i.id}" class="ml-title">${i.title}</a>
            <div class="ml-price">${price(i.price, i.priceUnit)}</div>
            ${i.promo ? html`<span class="ml-promo ${i.promo.status}">${ic('megaphone', 13, 2)}${i.promo.status === 'active' ? `Реклама до ${dateShort(i.promo.endsAt)}` : 'Ждёт маркировки'}</span>` : ''}
            ${(i.boost || []).map((b) => html`<span class="ml-promo ${b.status === 'active' ? 'active' : 'marking'}">${ic('bolt', 13, 2)}${b.kinds.map((k) => BOOST.find((x) => x[0] === k)[2]).join(', ')} · ${boostState(b)}${b.tagsState === 'review' ? ' · метки на проверке' : ''}</span>`)}
            <div class="ml-meta"><span title="Просмотры">${svg(P.eye, 15, 1.8)} ${NF.format(i.views)}</span><span title="В избранном">${svg(P.heart, 15, 1.8)} ${i.favCount}</span><span>${i.city} · ${shortWhen(i.createdAt)}</span>${i.status === 'active' && i.expiresAt ? html`<span title="Объявление висит 30 дней, потом его можно бесплатно опубликовать снова">${ic('clock', 15, 1.8)} до ${dateShort(i.expiresAt)}</span>` : ''}</div>
          </div>
          <div class="ml-side">
            ${i.status === 'rejected' ? html`<a class="btn btn-dark btn-sm hide-xs" href="/edit/${i.id}">Исправить</a>` : ''}
            ${isExpired(i) ? html`<button type="button" class="btn btn-accent btn-sm hide-xs" data-repost="${i.id}">Опубликовать снова</button>` : ''}
            ${['active', 'sold', 'archived'].includes(i.status) ? html`<a class="icon-btn ml-more" href="/profile/stats/${i.id}" aria-label="Статистика объявления" title="Статистика">${ic('chart', 20, 2)}</a>` : ''}
            <button type="button" class="icon-btn ml-more" data-more="${i.id}" aria-label="Действия с объявлением">${svg(P.more, 20, 2.2)}</button>
          </div>
          ${i.status === 'scheduled' ? html`<div class="ml-note ok">${ic('clock', 15, 2)} Проверено — опубликуем ${atTime(i.publishAt)} (мск). Видно только вам.</div>` : ''}
          ${isExpired(i) ? html`<div class="ml-note soft">Прошло 30 дней, объявление снято. Если ещё актуально — опубликуйте снова: бесплатно, окажется среди свежих.</div>` : ''}
          ${i.status === 'pending' ? html`<div class="ml-note warn">${i.flags ? `Проверяем внимательнее: похоже на «${i.flags}». ` : ''}Модератор проверит объявление — обычно это несколько часов.</div>` : ''}
          ${i.status === 'rejected' ? html`<div class="ml-note bad"><strong>Причина:</strong> ${i.rejectReason || 'не указана'}${i.appealAt ? ' · апелляция отправлена' : ''}${i.appealReply ? html`<br><strong>Ответ на апелляцию:</strong> ${i.appealReply}` : ''}</div>` : ''}
        </article>`;
      })}</div>`
      : status === 'active' && !items.length ? html`<div class="pf-empty">
          <div class="pf-empty-ic">${svg(P.tag, 34, 1.6)}</div>
          <h3>Разместите первое объявление</h3>
          <p>Это бесплатно и занимает пару минут. Каждое объявление проверяет модератор — обычно несколько часов.</p>
          <a class="btn btn-dark" href="/new">${ic('plus', 18, 2.2)}Разместить объявление</a>
          <div class="pf-tips">${tips.map(([icn, t, d]) => html`<div class="pf-tip"><span>${ic(icn, 20)}</span><div><b>${t}</b><p>${d}</p></div></div>`)}</div>
        </div>`
      : html`<div class="pf-empty sm"><h3>Здесь пусто</h3><p>${{ active: 'Нет опубликованных объявлений.', scheduled: 'Нет объявлений, ждущих выбранного времени.', pending: 'Сейчас ничего не ждёт проверки.', rejected: 'Нет объявлений, которые нужно исправить.', sold: 'Отметьте объявление «Продано», и оно появится здесь.', archived: 'Снятые с публикации объявления появятся здесь.' }[status]}</p></div>`}`);
    const byId = Object.fromEntries(items.map((i) => [String(i.id), i]));
    const setStatus = async (i, st, msg) => { try { await api('PATCH', `/api/listings/${i.id}`, { status: st }); toast(msg); reload(); } catch (e) { toast(e.message, true); } };
    $$('[data-repost]').forEach((b) => { b.onclick = () => setStatus(byId[b.dataset.repost], 'active', 'Снова опубликовано — на 30 дней'); });
    $$('[data-more]').forEach((b) => {
      b.onclick = () => {
        const i = byId[b.dataset.more];
        const acts = [{ icon: 'eye', label: 'Открыть объявление', href: `/l/${i.id}` }, { icon: 'edit', label: i.status === 'rejected' ? 'Исправить' : 'Изменить', href: `/edit/${i.id}` }];
        if (['active', 'sold', 'archived'].includes(i.status)) acts.splice(1, 0, { icon: 'chart', label: 'Статистика', href: `/profile/stats/${i.id}` });
        if (i.status === 'active') acts.push({ icon: 'check', label: 'Отметить «Продано»', run: () => setStatus(i, 'sold', 'Отмечено как проданное') }, { icon: 'pause', label: 'Снять с публикации', run: () => setStatus(i, 'archived', 'Снято с публикации') });
        if (i.status === 'sold' || i.status === 'archived') acts.push({ icon: 'refresh', label: 'Опубликовать снова', run: () => setStatus(i, 'active', 'Снова опубликовано') });
        if (i.status === 'scheduled') acts.push({ icon: 'refresh', label: 'Опубликовать сейчас', run: () => setStatus(i, 'active', 'Опубликовано') }, { icon: 'pause', label: 'Не публиковать', run: () => setStatus(i, 'archived', 'Публикация отменена') });
        if (i.status === 'rejected' && !i.appealAt && !i.appealReply) acts.push({ icon: 'chat', label: 'Подать апелляцию', run: () => appealModal(i.id, reload) });
        if (['active', 'pending', 'scheduled'].includes(i.status) && (boostOn() || i.promo || (i.boost || []).length)) acts.splice(1, 0, { icon: 'trend', label: 'Продвинуть', run: () => boostModal(i.id, i.title, i.promo) });
        if (i.status === 'active') acts.push({ icon: 'share', label: 'Поделиться', run: () => shareLink(`${location.origin}${lpath(i)}`, i.title) });
        acts.push({ icon: 'trash', label: 'Удалить', danger: true, run: async () => {
          if (!(await confirmModal('Удалить объявление?', 'Объявление и фото удалятся без возможности восстановления.', 'Удалить', true))) return;
          try { await api('DELETE', `/api/listings/${i.id}`); toast('Удалено'); reload(); } catch (e) { toast(e.message, true); }
        } });
        actionSheet(i.title, acts);
      };
    });
  }

  // Отзывы в профиле: обо мне (ответить, пожаловаться) и те, что оставил я (со статусом).
  async function renderMyReviews(tab, reload) {
    const d = await api('GET', '/api/my/reviews');
    const list = tab === 'mine' ? d.mine : d.about;
    $('#box').innerHTML = String(html`<div class="rv">
      ${tab === 'about' ? html`<div class="rv-top"><div class="rv-top-sum">${ratingSummary(d.rating)}</div>
        <div class="rv-rules">${ic('lock', 18, 1.9)}<span>Отзывы нельзя изменить или удалить — ни вам, ни автору. Можно один раз ответить, а если отзыв нарушает правила — пожаловаться и объяснить почему: модератор проверит и решит, оставить его или скрыть.</span></div></div>` : ''}
      ${list.length ? html`<div class="rv-list">${list.map((rv) => reviewCard(rv, tab === 'mine' ? 'author' : 'seller'))}</div>`
    : html`<div class="pf-empty sm"><h3>${tab === 'mine' ? 'Вы ещё не оставляли отзывов' : 'Отзывов пока нет'}</h3><p>${tab === 'mine' ? 'Отзыв о продавце можно оставить в чате по объявлению — после переписки.' : 'Отзыв о вас может оставить покупатель, с которым вы переписывались по объявлению. Он появится после проверки модератором.'}</p></div>`}
    </div>`);
    $$('[data-rv-reply]').forEach((b) => { b.onclick = () => replyModal(b.dataset.rvReply, reload); });
    $$('[data-rv-complain]').forEach((b) => { b.onclick = () => complaintModal(b.dataset.rvComplain, d.complaintReasons, reload); });
  }

  // Статистика объявления: цифры, переходы по дням, путь покупателя, источники, подсказка.
  const SHORT_M = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dayLabel = (d) => `${Number(d.slice(8, 10))} ${SHORT_M[Number(d.slice(5, 7)) - 1]}`;
  const STAT_SRC = [['search', 'search', 'Поиск'], ['home', 'home', 'Главная лента'], ['category', 'tag', 'Категории'], ['external', 'share', 'Прямые заходы и ссылки извне'], ['other', 'right', 'Другие страницы Торганы']];
  async function renderStats(id, days) {
    const d = await api('GET', `/api/my/listings/${id}/stats?days=${days}`);
    const { totals: t, prev: pv, listing: l } = d;
    const pct1 = (x) => (Math.round(x * 10) / 10).toLocaleString('ru-RU');
    const ctr = t.impressions ? (t.views / t.impressions) * 100 : 0;
    const delta = (a, b) => {
      if (!pv) return '';
      if (!b) return ''; // сравнивать не с чем
      const ch = Math.round(((a - b) / b) * 100);
      return `${ch > 0 ? '+' : ''}${ch}% к прошлым ${d.period} дням`;
    };
    const kpi = (n, label, sub, note, accent) => html`<div class="st-kpi ${accent ? 'accent' : ''}"><span class="k">${label}</span><b>${n}</b>${note ? html`<span class="d">${note}</span>` : ''}<span class="s">${sub}</span></div>`;
    const mx = Math.max(1, ...d.daily.map((x) => x.views));
    const n = d.daily.length;
    const labels = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
    const srcTotal = Object.values(d.sources).reduce((a, b) => a + b, 0);
    const bar = (w) => Math.max(w > 0 ? 3 : 0, Math.round(w));
    $('#box').innerHTML = String(html`<div class="st">
      <div class="st-item">
        <a class="st-img" href="/l/${l.id}">${l.photo ? html`<img src="${l.photo}" alt="" loading="lazy">` : svg(P.image, 24, 1.4)}</a>
        <div class="st-item-txt"><span class="ml-tag ${(MY_TAG[l.status] || MY_TAG.archived)[0]}"><i></i>${(MY_TAG[l.status] || MY_TAG.archived)[1]}</span>
          <a class="st-title" href="/l/${l.id}">${l.title}</a><span class="st-price">${price(l.price, l.priceUnit)}</span></div>
        <div class="st-item-act"><a class="btn btn-soft btn-sm" href="/edit/${l.id}">Изменить</a><a class="btn btn-dark btn-sm" href="/l/${l.id}">Открыть</a></div>
      </div>
      <div class="st-kpis">
        ${kpi(NF.format(t.impressions), 'Показы', 'в поиске и ленте', delta(t.impressions, pv && pv.impressions))}
        ${kpi(NF.format(t.views), 'Переходы', `сегодня ${NF.format(d.today.views)}`, delta(t.views, pv && pv.views), true)}
        ${kpi(`${pct1(ctr)}%`, 'Из показа в переход', 'доля открывших объявление', '')}
        ${kpi(NF.format(t.favs), 'В избранное', `сейчас в избранном у ${NF.format(d.favNow)}`, delta(t.favs, pv && pv.favs))}
      </div>
      <section class="st-card">
        <div class="st-card-head"><h2>Переходы по дням</h2>
          <div class="st-legend"><span><i class="b"></i>Переходы</span><span><i class="f"></i>Добавляли в избранное</span></div></div>
        <div class="st-chart" role="img" aria-label="Переходы по дням">
          ${d.daily.map((x, i) => html`<div class="st-col" title="${dayLabel(x.day)}: переходов ${x.views}, показов ${x.impressions}, в избранное ${x.favs}">
            <div class="st-bar ${i === n - 1 ? 'now' : ''}" style="height:${x.views ? Math.max(4, Math.round((x.views / mx) * 100)) : 0}%">${x.favs ? html`<i class="st-dot"></i>` : ''}</div></div>`)}
        </div>
        <div class="st-axis">${labels.map((i) => html`<span>${dayLabel(d.daily[i].day)}</span>`)}</div>
        ${t.views ? '' : html`<p class="muted st-empty">За этот период переходов ещё не было.</p>`}
      </section>
      <div class="st-row">
        <section class="st-card"><h2>Путь покупателя</h2>
          ${[['Показы в поиске и ленте', t.impressions, t.impressions ? 100 : 0, ''], ['Переходы в объявление', t.views, t.impressions ? (t.views / t.impressions) * 100 : (t.views ? 100 : 0), t.impressions ? `${pct1(ctr)}% от показов` : ''], ['Добавили в избранное', t.favs, t.impressions ? (t.favs / t.impressions) * 100 : 0, t.views ? `${pct1((t.favs / t.views) * 100)}% от переходов` : '']]
    .map(([k, v, w, sub]) => html`<div class="st-step"><div class="st-step-h"><span>${k}</span><span><b>${NF.format(v)}</b>${sub ? html` <small>· ${sub}</small>` : ''}</span></div><div class="st-track"><i style="width:${bar(w)}%"></i></div></div>`)}
        </section>
        <section class="st-card"><h2>Откуда переходили</h2>
          ${srcTotal ? STAT_SRC.filter(([k]) => d.sources[k] || k !== 'other').map(([k, icn, label]) => {
    const p = Math.round((d.sources[k] / srcTotal) * 100);
    return html`<div class="st-src"><span class="st-src-ic">${ic(icn, 17)}</span><div><div class="st-step-h"><span>${label}</span><b>${p}%</b></div><div class="st-track dark"><i style="width:${p}%"></i></div></div></div>`;
  }) : html`<p class="muted" style="margin:0">Появится после первых переходов.</p>`}
        </section>
      </div>
      ${d.tip ? html`<div class="st-tip"><span>${ic('sparkle', 20)}</span><div><strong>Подсказка.</strong> ${d.tip}</div></div>` : ''}
      <p class="st-note">Показ — карточку увидели в поиске или ленте не меньше секунды. Переход — объявление открыли. Каждый считается один раз в сутки на человека; ваши собственные просмотры, модераторы и роботы не учитываются. Статистику видите только вы. Всего просмотров с публикации — ${NF.format(l.viewsAll)}.</p>
    </div>`);
  }

  // Уведомления таблицей: событие, пояснение, поле push и поле письма (null — такого канала у события нет).
  const NOTIFY_ROWS = [
    ['Сообщения', 'Чаты и ответы поддержки. Письмо — если не прочитали за 5 минут', 'pushMessages', 'notifyMessages'],
    ['Поиски и подписки', 'Новые объявления по вашим поискам и от продавцов, на которых вы подписаны', 'pushSearches', null],
    ['Снижение цены', 'Подешевело то, что у вас в избранном', 'pushPrices', null],
    ['Подборка за день', 'Новое по поискам и подпискам и снижение цен — одним письмом', null, 'notifyDigest'],
    ['Модерация', 'Решения по объявлениям и апелляциям, проверка бизнеса, оплаты', 'pushModeration', 'notifyModeration'],
    ['Отзывы', 'Новый отзыв о вас и решения по отзывам', 'pushReviews', 'notifyReviews']
  ];
  const notifyCell = (u, k, title, kind) => (k
    ? html`<label class="mini-switch"><input type="checkbox" name="${k}" aria-label="${kind} — ${title}" ${u[k] ? raw('checked') : ''}><span class="track"></span></label>`
    : html`<span class="ntf-none" title="Для этого события нет">—</span>`);

  // Этот телефон или компьютер: включить, проверить, выключить push.
  async function renderPushDevice(el) {
    const st = await pushState();
    const card = (icon, title, sub, buttons = '') => html`<div class="push-dev ${st.sub ? 'on' : ''}"><span class="push-dev-ic">${ic(icon, 22, 2)}</span><span class="push-dev-txt"><b>${title}</b><span>${sub}</span></span>${buttons}</div>`;
    el.innerHTML = String(!st.ok
      ? card('bell', 'На этом устройстве push недоступны', st.ios ? 'На iPhone: «Поделиться» → «На экран «Домой»», откройте Торгану с экрана и включите уведомления здесь.' : 'Браузер не поддерживает уведомления. Письма на почту продолжат приходить.')
      : st.sub ? card('check', 'Включены на этом устройстве', deviceName(), html`<button type="button" class="btn btn-soft btn-sm" data-test>Проверить</button><button type="button" class="btn btn-line btn-sm" data-off>Выключить</button>`)
        : st.perm === 'denied' ? card('bell', 'Уведомления запрещены в браузере', 'Разрешите их в настройках сайта (значок замка в адресной строке), затем обновите страницу.')
          : card('bell', 'Push на этом устройстве выключены', 'Включите, чтобы сразу узнавать о сообщениях и новых объявлениях.', html`<button type="button" class="btn btn-dark btn-sm" data-on>Включить</button>`));
    const act = async (fn, okText) => { try { await fn(); if (okText) toast(okText); renderPushDevice(el); } catch (e) { toast(e.message, true); } };
    const on = $('[data-on]', el); if (on) on.onclick = () => act(pushOn, 'Уведомления включены');
    const off = $('[data-off]', el); if (off) off.onclick = () => act(pushOff, 'Уведомления на этом устройстве выключены');
    const tst = $('[data-test]', el); if (tst) tst.onclick = () => act(async () => { const r = await api('POST', '/api/push/test'); if (!r.ok) throw new Error('Не получилось отправить — выключите и включите уведомления'); }, 'Отправили проверочное уведомление');
  }

  // Для бизнеса: заявка на проверку ИП или компании (ИНН, ОГРН/ОГРНИП) и её статус.
  function bizBlock(b) {
    if (b && b.status === 'verified') return html`<div class="biz-ok">${ic('shield', 22, 2)}<span><b>${b.name} — ${b.kind === 'ip' ? 'ИП проверен' : 'компания проверена'}</b><span>ИНН ${b.inn} · ${b.kind === 'ip' ? 'ОГРНИП' : 'ОГРН'} ${b.ogrn}. Значок видят покупатели у ваших объявлений.</span></span></div>
      <div class="set-btns"><a class="btn btn-soft btn-sm" href="/profile/business">${ic('store', 16, 2)}Тарифы и продвижение</a><button type="button" class="btn btn-line btn-sm" data-biz-del>Убрать данные бизнеса</button></div>`;
    const stage = b && b.status === 'pending' ? 2 : 1;
    const step = (n, icon, t, sub) => html`<li class="${n === stage ? 'on' : n < stage ? 'done' : ''}"><span class="bs-n">${n}</span><span class="bs-ic">${ic(n < stage ? 'check' : icon, 20)}</span><b>${t}</b><small>${sub}</small></li>`;
    return html`<ol class="biz-steps">${step(1, 'edit', 'Заполните данные', 'Название, ИНН и ОГРН')}${step(2, 'shield', 'Проверка модератором', 'Сверим с ЕГРЮЛ или ЕГРИП')}${step(3, 'store', 'Значок у объявлений', 'Покупатели видят, что вы бизнес')}</ol>
      ${b && b.status === 'pending' ? html`<div class="banner warn">Заявка отправлена ${when(b.at)} — модератор сверит данные по ЕГРЮЛ/ЕГРИП, обычно в течение дня.</div>` : ''}
      ${b && b.status === 'rejected' ? html`<div class="banner danger"><strong>Проверка не пройдена:</strong> ${b.note}</div>` : ''}
      <p class="muted" style="margin:0;font-size:14px">ИП и компании получают значок «ИП проверен» или «Компания проверена» — покупатели доверяют таким продавцам больше. Данные сверяет модератор, другие пользователи видят только название.</p>
      <form id="bf" class="biz-form" novalidate>
        <div class="field"><label for="b-name">Название</label><input id="b-name" name="name" class="input" maxlength="120" value="${(b && b.name) || ''}" placeholder="ИП Иванов И. И. или ООО «Ромашка»"></div>
        <div class="row">
          <div class="field" style="flex:1"><label for="b-inn">ИНН</label><input id="b-inn" name="inn" class="input" inputmode="numeric" maxlength="12" value="${(b && b.inn) || ''}" placeholder="10 или 12 цифр"></div>
          <div class="field" style="flex:1"><label for="b-ogrn">ОГРН или ОГРНИП</label><input id="b-ogrn" name="ogrn" class="input" inputmode="numeric" maxlength="15" value="${(b && b.ogrn) || ''}" placeholder="13 или 15 цифр"></div>
        </div>
        <div class="set-btns"><button class="btn btn-dark" type="submit">${b && b.status === 'pending' ? 'Обновить заявку' : 'Отправить на проверку'}</button>${b ? html`<button type="button" class="btn btn-soft" data-biz-del>Отозвать</button>` : ''}</div>
      </form>`;
  }
  function bindBizForm(reload) {
    const f = $('#bf');
    if (f) {
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { await api('POST', '/api/me/business', Object.fromEntries(new FormData(f).entries())); toast('Заявка отправлена модератору'); await refreshMe(); reload(); } catch (ex) { toast(ex.message, true); }
      };
    }
    $$('[data-biz-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmModal('Убрать данные бизнеса?', 'Значок проверенного бизнеса пропадёт. Отправить заявку можно будет заново.', 'Убрать', true))) return;
        try { await api('DELETE', '/api/me/business'); toast('Данные убраны'); await refreshMe(); reload(); } catch (ex) { toast(ex.message, true); }
      };
    });
  }

  // ================= настройки =================
  // Слева карточка и пять разделов, справа открыт один. Раздел — в #якоре, старые ссылки (#s-photo, #s-city) ведут в «Профиль».
  // На телефоне без якоря — карточка и список разделов; раздел открывается своим экраном со ссылкой «Настройки».
  const SET_SECTIONS = [['sf', 'user', 'Профиль'], ['sn', 'bell', 'Уведомления'], ['sp', 'lock', 'Пароль и вход'], ['s-biz', 'shield', 'Для бизнеса'], ['s-acc', 'mail', 'Аккаунт']];
  const SET_ALIAS = { 's-photo': 'sf', 's-city': 'sf' };
  // Яндекс ID и VK ID: включённые на сайте и уже привязанные (отвязать можно, даже если вход выключили).
  const myOauth = (u) => OAUTH.filter(([k]) => (S.config.oauth && S.config.oauth[k]) || u.oauth.includes(k));
  function viewSettings() {
    setTitle('Настройки');
    const u = S.user;
    const hash = location.hash.slice(1);
    const cur = SET_ALIAS[hash] || (SET_SECTIONS.some(([id]) => id === hash) ? hash : '');
    const mailOn = (k) => k && S.config.mail;
    const nAll = NOTIFY_ROWS.reduce((n, [, , p, m]) => n + (p ? 1 : 0) + (mailOn(m) ? 1 : 0), 0);
    const nOn = NOTIFY_ROWS.reduce((n, [, , p, m]) => n + (p && u[p] ? 1 : 0) + (mailOn(m) && u[m] ? 1 : 0), 0);
    const b = u.business;
    const hint = {
      sf: 'Фото, имя, город, телефон',
      sn: `Включено ${nOn} из ${nAll}`,
      sp: ['Пароль', ...myOauth(u).map(([, name]) => name)].join(', '),
      's-biz': b ? { verified: b.kind === 'ip' ? 'ИП проверен' : 'Компания проверена', pending: 'Заявка на проверке', rejected: 'Проверка не пройдена' }[b.status] : 'Значок «ИП проверен»',
      's-acc': u.email
    };
    app.innerHTML = String(html`<div class="wrap setx ${cur ? 'has-sec' : ''}">
      <div class="setx-head"><h1>Настройки</h1><p>Как вас видят покупатели и как Торгана с вами связывается</p></div>
      <aside class="setx-side">
        ${idCard(u)}
        <nav class="setx-nav" aria-label="Разделы настроек">${SET_SECTIONS.map(([id, icon, label]) => html`<a href="/profile/settings#${id}" data-sec="${id}"><span class="setx-ic">${ic(icon, 20)}</span><span class="setx-t"><b>${label}</b><small>${hint[id]}</small></span>${ic('right', 18, 2)}</a>`)}</nav>
        <a class="setx-pub" href="/u/${u.id}">${ic('eye', 18)}Как меня видят покупатели</a>
        <div class="setx-m"><a class="btn btn-soft" href="/profile">Мой профиль</a><button type="button" class="btn btn-soft" data-logout>Выйти</button></div>
      </aside>
      <section class="setx-main"><a class="setx-back" href="/profile/settings">${ic('left', 18, 2)}Настройки</a><div id="box" class="setx-panel"></div></section>
    </div>`);
    const again = () => viewSettings();
    bindIdCard(again);
    const open = (id) => {
      $$('[data-sec]').forEach((a) => { const on = a.dataset.sec === id; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      renderSettings(id, again);
    };
    // Разделы переключаются без перезагрузки страницы; «Назад» в браузере вернёт прошлый раздел.
    $('.setx-nav').addEventListener('click', (e) => {
      const a = e.target.closest('[data-sec]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      history.pushState({}, '', a.getAttribute('href'));
      $('.setx').classList.add('has-sec');
      open(a.dataset.sec);
      if (window.matchMedia('(max-width: 600px)').matches) window.scrollTo(0, 0);
    });
    open(cur || 'sf');
  }

  function renderSettings(sec, reload) {
    const u = S.user;
    const head = (t, sub) => html`<div class="set-h"><h2>${t}</h2><p>${sub}</p></div>`;
    const row = (icon, label, value, action = '') => html`<div class="set-row"><span class="set-ic">${ic(icon, 20)}</span><div><span class="set-k">${label}</span><span class="set-v">${value}</span></div>${action}</div>`;
    const oauth = myOauth(u);
    const names = oauth.map(([, name]) => name).join(' или ');
    const phoneNote = u.phoneVia
      ? html`<div class="set-note ok">${ic('shield', 18, 2)}<span>Подтверждён через ${u.phoneVia === 'vk' ? 'VK ID' : 'Яндекс ID'} — у объявлений значок «Телефон подтверждён». Другим пользователям номер не показывается.</span></div>`
      : oauth.length ? html`<div class="set-note">${ic('shield', 18, 2)}<span>Подтвердите номер через ${names} — у объявлений появится значок «Телефон подтверждён». Другим пользователям номер не показывается.</span><a href="/profile/settings#sp">Подтвердить</a></div>`
        : html`<span class="help">Другим пользователям не показывается</span>`;
    const body = {
      sf: () => html`${head('Профиль', 'Покупатели видят это в объявлениях и в чате')}
        <div class="set-ava" id="s-photo">${u.avatar ? ava(u, 'xl') : html`<span class="set-ava-empty">${ic('camera', 28, 1.8)}</span>`}
          <div class="set-ava-t"><b>Фото профиля</b><span>С фото вам чаще пишут. JPG, PNG или WebP — обрежем по кругу</span></div>
          <div class="set-btns"><button type="button" class="btn btn-accent" data-ava-set>${ic('camera', 18, 2)}${u.avatar ? 'Заменить' : 'Загрузить фото'}</button>${u.avatar ? html`<button type="button" class="btn btn-soft" data-ava-del>Убрать</button>` : ''}</div>
        </div>
        <form id="sf" class="set-form">
          <div class="set-fields">
            <div class="field"><label for="s-name">Имя</label><input id="s-name" name="name" class="input" maxlength="60" value="${u.name}" required autocomplete="name"></div>
            <div class="field"><label for="s-city">Город</label><div class="ed-icon-input">${ic('pin', 18)}<input id="s-city" name="city" class="input" list="cities" value="${u.city || ''}" placeholder="Подставим в новые объявления"></div>
              <datalist id="cities">${S.config.cities.map((c) => html`<option value="${c}">`)}</datalist></div>
            <div class="field wide"><label for="s-phone">Телефон</label><input id="s-phone" name="phone" class="input" type="tel" inputmode="tel" maxlength="30" value="${u.phone || ''}" placeholder="+7" autocomplete="tel">${phoneNote}</div>
          </div>
          <div class="set-foot"><span>Имя и фото сразу обновятся во всех ваших объявлениях</span><button type="reset" class="btn btn-soft">Отменить</button><button class="btn btn-accent" type="submit">Сохранить</button></div>
        </form>`,
      sn: () => html`${head('Уведомления', 'О чём сообщать и куда. Переключатели сохраняются сразу')}
        <div id="push-dev"></div>
        <table class="ntf" id="sn">
          <thead><tr><th scope="col">Событие</th><th scope="col">${ic('bell', 16, 2)}Push</th>${S.config.mail ? html`<th scope="col">${ic('mail', 16, 2)}Письмо</th>` : ''}</tr></thead>
          <tbody>${NOTIFY_ROWS.filter(([, , p]) => p || S.config.mail).map(([t, sub, p, m]) => html`<tr><th scope="row"><b>${t}</b><small>${sub}</small></th><td>${notifyCell(u, p, t, 'Push')}</td>${S.config.mail ? html`<td>${notifyCell(u, m, t, 'Письмо')}</td>` : ''}</tr>`)}</tbody>
        </table>
        ${S.config.mail ? html`<p class="set-small">Письма приходят на ${u.email}</p>` : ''}`,
      sp: () => html`${head('Пароль и вход', oauth.length ? `Входите по паролю или в одно касание через ${names}` : 'Пароль для входа на Торгану')}
        ${oauth.length ? html`<div class="set-block"><h3>Быстрый вход</h3><div class="set-list">${oauth.map(([k, name]) => {
    const on = u.oauth.includes(k);
    return html`<div class="set-row oauth-${k}"><span class="oauth-mark" aria-hidden="true">${k === 'vk' ? 'VK' : 'Я'}</span><div><span class="set-v">${name}</span><span class="set-k">${on ? `Привязан${u.phoneVia === k ? ' · телефон подтверждён' : ''}` : 'Не привязан'}</span></div>
      ${on ? html`<button type="button" class="btn btn-line btn-sm" data-unlink="${k}">Отвязать</button>` : html`<button type="button" class="btn btn-soft btn-sm" data-link="${k}">Привязать</button>`}</div>`;
  })}</div></div>` : ''}
        <form class="set-block set-form" id="sp" autocomplete="on">
          <h3>Сменить пароль</h3>
          <input type="email" name="username" value="${u.email}" autocomplete="username" hidden>
          <div class="set-fields">
            <div class="field"><label for="p-cur">Текущий пароль</label><input id="p-cur" name="current" class="input" type="password" autocomplete="current-password" required></div>
            <div class="field"><label for="p-new">Новый пароль</label><input id="p-new" name="password" class="input" type="password" minlength="8" autocomplete="new-password" required></div>
          </div>
          <div class="set-foot"><span>Минимум 8 символов. На других устройствах потребуется войти заново</span><button class="btn btn-accent" type="submit">Сменить пароль</button></div>
        </form>`,
      's-biz': () => html`${head('Для бизнеса', 'ИП и компании получают значок у всех объявлений — покупатели доверяют таким продавцам больше')}${bizBlock(u.business)}`,
      's-acc': () => html`${head('Аккаунт', 'Почта для входа и писем от Торганы')}
        <div class="set-list">
          ${row('mail', 'Почта', u.email, S.config.mail ? (u.emailVerified ? html`<span class="pf-badge ok">${ic('check', 14, 2.4)} Подтверждена</span>` : html`<button type="button" class="btn btn-soft btn-sm" id="verify-again">Подтвердить</button>`) : '')}
          ${row('clock', 'На Торгане', `с ${since(u.createdAt)}`)}
          ${row('logout', 'Выйти из аккаунта', 'На этом устройстве', html`<button type="button" class="btn btn-soft btn-sm" data-logout>Выйти</button>`)}
        </div>
        <div class="set-danger"><div><b>Удалить аккаунт</b><span>Напишите в поддержку с этой почты — удалим профиль, объявления и переписку.</span></div><a class="btn btn-line btn-sm" href="/messages/support">Написать в поддержку</a></div>`
    };
    $('#box').innerHTML = String(body[sec]());
    // Пришли по ссылке на поле (#s-city) или фото (#s-photo) — покажем его.
    const to = location.hash.length > 1 && location.hash.slice(1) !== sec && document.getElementById(location.hash.slice(1));
    if (to) { const field = to.matches('input'); to.scrollIntoView({ block: 'center' }); if (field) to.focus(); }
    const q = new URLSearchParams(location.search).get('oauth');
    if (q) { toast(q === 'linked' ? 'Готово — сервис привязан' : 'Этот аккаунт сервиса уже привязан к другому пользователю', q !== 'linked'); history.replaceState({}, '', location.pathname + location.hash); }
    if (sec === 'sf') {
      $('[data-ava-set]').onclick = () => pickAvatar(reload);
      const del = $('[data-ava-del]'); if (del) del.onclick = () => removeAvatar(reload);
      $('#sf').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          const r = await api('PATCH', '/api/me', { name: f.name.value, city: f.city.value, phone: f.phone.value });
          S.user = r.user; toast('Сохранено'); renderHeader(); reload();
        } catch (ex) { toast(ex.message, true); }
      };
    }
    if (sec === 'sn') {
      $$('#sn input[name]').forEach((inp) => {
        inp.onchange = async () => {
          try { const r = await api('PATCH', '/api/me', { [inp.name]: inp.checked }); S.user = r.user; toast(inp.checked ? 'Включено' : 'Выключено'); } catch (ex) { inp.checked = !inp.checked; toast(ex.message, true); }
        };
      });
      renderPushDevice($('#push-dev'));
    }
    if (sec === 'sp') {
      $$('[data-link]').forEach((b) => { b.onclick = () => oauthGo(b.dataset.link, { link: true }); });
      $$('[data-unlink]').forEach((b) => {
        b.onclick = async () => { try { await api('POST', `/api/auth/oauth/${b.dataset.unlink}/unlink`); toast('Отвязано'); await refreshMe(); reload(); } catch (e) { toast(e.message, true); } };
      });
      $('#sp').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target; const btn = $('button[type=submit]', f); btn.disabled = true;
        try {
          const r = await api('POST', '/api/me/password', { current: f.current.value, password: f.password.value });
          f.reset();
          toast(r.signedOut ? `Пароль изменён. Вышли на других устройствах: ${r.signedOut}` : 'Пароль изменён');
        } catch (ex) { toast(ex.message, true); }
        btn.disabled = false;
      };
    }
    if (sec === 's-biz') bindBizForm(reload);
    const va = $('#verify-again');
    if (va) va.onclick = () => verifyModal(reload);
  }

  async function viewUser(id, q) {
    const tab = q && q.get('tab') === 'reviews' ? 'reviews' : 'ads';
    const { user: u, items } = await api('GET', `/api/users/${id}`);
    setTitle(u.name);
    const own = S.user && S.user.id === u.id;
    const followers = u.followers || 0;
    // Сверху — широкая карточка продавца, ниже вкладки и объявления во всю ширину.
    app.innerHTML = String(html`<div class="wrap pub">
      ${own ? html`<div class="pub-own">${ic('eye', 18)}<span>Так ваш профиль видят покупатели</span><a href="/profile/settings">Изменить профиль</a><a href="/profile">Мой профиль</a></div>` : ''}
      <section class="pub-hero" aria-label="Продавец">
        <div class="pub-ava">${ava(u, 'xl')}</div>
        <div class="pub-who">
          <h1>${u.name}</h1>
          <div class="pub-sub">${u.city ? `${u.city} · ` : ''}на Торгане с ${since(u.createdAt)}</div>
          ${ratingLine(u.rating, `/u/${u.id}?tab=reviews`)}
          <div class="pf-badges">${trustBadges(u.badges)}${S.config.mail && u.emailVerified ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Почта подтверждена</span>` : ''}</div>
        </div>
        <div class="pub-side">
          <div class="pf-nums">
            <div class="pf-num"><b>${NF.format(u.activeCount)}</b><span>${plural(u.activeCount, 'объявление', 'объявления', 'объявлений')}</span></div>
            <div class="pf-num"><b>${NF.format(u.soldCount)}</b><span>продано</span></div>
            <div class="pf-num"><b data-followers>${NF.format(followers)}</b><span>${plural(followers, 'подписчик', 'подписчика', 'подписчиков')}</span></div>
          </div>
          <div class="pub-acts">${own ? html`<a class="btn btn-accent btn-block" href="/profile/settings">${ic('edit', 18)}Изменить профиль</a>` : followBtn(u.id, u.following, 'btn-accent')}<button type="button" class="icon-btn pub-share" data-share aria-label="Поделиться профилем">${ic('share', 19)}</button></div>
        </div>
      </section>
      ${u.shop ? shopHero(u.shop) : ''}
      <div class="seg seg-lg" role="tablist">
        <a role="tab" aria-selected="${tab === 'ads' ? 'true' : 'false'}" class="${tab === 'ads' ? 'on' : ''}" href="/u/${u.id}">Объявления <span class="n">${u.activeCount}</span></a>
        <a role="tab" aria-selected="${tab === 'reviews' ? 'true' : 'false'}" class="${tab === 'reviews' ? 'on' : ''}" href="/u/${u.id}?tab=reviews">${starSvg(true, 15)}Отзывы <span class="n">${u.rating.count}</span></a>
      </div>
      <div id="box">${tab === 'ads' ? (items.length ? grid(items) : html`<div class="pf-empty sm"><h3>Активных объявлений нет</h3><p>Загляните позже.</p></div>`) : html`<div class="loader"></div>`}</div>
    </div>`);
    $('[data-share]').onclick = () => shareLink(`${location.origin}/u/${u.id}`, `${u.name} на Торгане`);
    if (tab !== 'reviews') return;
    let starsFilter = 0; let offset = 0; let acc = [];
    const load = async (reset) => {
      if (reset) { offset = 0; acc = []; }
      const d = await api('GET', `/api/users/${u.id}/reviews?stars=${starsFilter}&offset=${offset}`);
      acc = acc.concat(d.items); offset += d.items.length;
      $('#box').innerHTML = String(html`<div class="rv">
        ${u.rating.count ? html`<div class="pub-rv-sum">${ratingSummary(u.rating)}</div>` : ''}
        ${u.rating.count ? html`<div class="pf-status">${[[0, 'Все', u.rating.count], ...[5, 4, 3, 2, 1].filter((k) => u.rating.dist[k]).map((k) => [k, `${k} ★`, u.rating.dist[k]])].map(([k, t, n]) => html`<button type="button" class="chip ${k === starsFilter ? 'active' : ''}" data-stars="${k}">${t}<span class="cnt">${n}</span></button>`)}</div>` : ''}
        ${acc.length ? html`<div class="rv-list">${acc.map((rv) => reviewCard(rv))}</div>` : html`<div class="pf-empty sm"><h3>Отзывов пока нет</h3><p>Отзыв о продавце может оставить покупатель после переписки по объявлению.</p></div>`}
        ${d.more ? html`<div class="more"><button class="btn btn-soft btn-lg" type="button" data-more-rv>Показать ещё</button></div>` : ''}
      </div>`);
      $$('[data-stars]').forEach((b) => { b.onclick = () => { starsFilter = Number(b.dataset.stars); load(true).catch((e) => toast(e.message, true)); }; });
      const mb = $('[data-more-rv]'); if (mb) mb.onclick = () => load(false).catch((e) => toast(e.message, true));
    };
    await load(true);
  }

  // ================= для бизнеса: тарифы, оплата, продвижение =================
  const PLAN_NAME = { shop: 'Магазин', pro: 'Магазин Про' };
  const rub = (n) => `${NF.format(n)} ₽`;
  const dateLong = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateShort = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const daysLeft = (ts) => Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
  const isBiz = () => !!(S.user && S.user.business && S.user.business.status === 'verified');
  const planFeatures = (key, pr) => ({
    free: ['Объявления без лимитов', 'Чат с покупателями и поддержка', 'Статистика каждого объявления', 'Значок «ИП проверен» после проверки'],
    shop: ['Витрина: обложка, описание, часы, адрес и сайт', 'Значок «Магазин» в объявлениях и профиле', 'Статистика по всем объявлениям сразу', 'Выгрузка статистики в Excel'],
    pro: ['Всё из тарифа «Магазин»', 'Автозагрузка объявлений из фида Авито', 'Фид обновляется каждые 6 часов', pr.proDiscount ? `Скидка ${pr.proDiscount}% на продвижение` : 'Продвижение по обычной цене']
  })[key];

  // Подтверждение покупки → страница оплаты ЮKassa.
  function payModal({ title, lines, amount, url, body }) {
    openModal(String(html`<h2>${title}</h2>
      <div class="pay-sum">${lines.map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}<div class="pay-total"><span>К оплате</span><b>${rub(amount)}</b></div></div>
      <p class="pay-note">${ic('lock', 16, 2)}<span>Оплата на защищённой странице ЮKassa — картой, через СБП и другими способами. Данные карты Торгана не получает. Чек придёт на ${S.user.email}.</span></p>
      <p class="muted" style="margin:10px 0 0;font-size:13px">Нажимая «Оплатить», вы принимаете <a href="/page/terms#paid" style="text-decoration:underline">условия платных услуг</a>. Автоплатежей нет — продлеваете сами.</p>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-accent" data-ok>Оплатить ${rub(amount)}</button></div>`), (m, close) => {
      $('[data-x]', m).onclick = close;
      m.addEventListener('click', (e) => { if (e.target.closest('a[href]')) close(); });
      $('[data-ok]', m).onclick = async (e) => {
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Открываем оплату…';
        try { const r = await api('POST', url, body); location.href = r.url; } catch (ex) { toast(ex.message, true); b.disabled = false; b.textContent = `Оплатить ${rub(amount)}`; }
      };
    });
  }

  // /business — тарифы, продвижение, вопросы. Цены — с сервера (их задаёт владелец).
  const BIZ_FAQ = [
    ['Нужно ли платить, чтобы продавать?', 'Нет. Размещение объявлений бесплатно и без лимитов для всех — и для частных лиц, и для магазинов. Тариф добавляет инструменты: витрину, общую статистику, автозагрузку.'],
    ['Кто может подключить тариф или продвижение?', 'ИП и компании, подтвердившие данные в «Настройки → Для бизнеса»: название, ИНН и ОГРН(ИП). Модератор сверяет их с ЕГРЮЛ/ЕГРИП, обычно в течение дня. Данные нужны и для маркировки рекламы.'],
    ['Как оплатить?', 'На странице ЮKassa — банковской картой, через СБП и другими способами, доступными в ЮKassa. Чек придёт на почту. Автоплатежей нет: тариф продлеваете сами, когда нужно.'],
    ['Можно ли сменить тариф?', 'Да, в любой момент. Оставшиеся дни пересчитаем по цене месяца: например, 10 дней «Магазина» превратятся в 3 дня «Магазина Про», и к ним добавится оплаченный срок.'],
    ['Как работает продвижение?', 'Объявление показывается в блоке «Реклама» над выдачей и лентой — тем, кто ищет похожее в вашем городе. Объявления в блоке чередуются, аукциона ставок нет. Обычная выдача не меняется. Реклама маркируется по закону: пометка «Реклама», рекламодатель и токен erid.'],
    ['Можно ли вернуть деньги?', 'Да. Напишите в поддержку — вернём стоимость неиспользованных полных дней тарифа или продвижения тем же способом, которым вы платили. Если модератор остановил продвижение из-за нарушения правил, неиспользованные дни тоже возвращаются по запросу.'],
    ['Что такое автозагрузка?', 'В тарифе «Магазин Про» объявления загружаются из XML-файла в формате автозагрузки Авито — по ссылке, той же, что вы указываете в Авито. Новые и изменённые объявления проходят проверку модератора, пропавшие из файла — снимаются с публикации.']
  ];
  async function viewBusiness(_, q) {
    setTitle('Для бизнеса');
    const me = S.user ? await api('GET', '/api/my/business').catch(() => null) : null;
    const pr = (me && me.prices) || S.config.billing.prices;
    const ready = me ? me.ready : S.config.billing.ready;
    const plan = me && me.plan;
    const biz = !!(me && me.biz && me.biz.status === 'verified');
    let months = ['1', '3', '12'].includes(q.get('m')) ? Number(q.get('m')) : 1;
    app.innerHTML = String(html`<div class="wrap biz">
      <section class="biz-hero">
        <div class="biz-hero-txt"><span class="biz-kicker">${ic('store', 16, 2)}Торгана для бизнеса</span>
          <h1>Продавайте больше — по честным правилам</h1>
          <p>Размещение бесплатно и без лимитов для всех. Магазинам и компаниям — витрина, общая статистика, автозагрузка из фида и продвижение по фиксированной цене, без аукционов ставок.</p>
          <div class="biz-facts">${[['card', 'Карта и СБП через ЮKassa'], ['refresh', 'Без автоплатежей'], ['shield', 'Только проверенный бизнес']].map(([i, t]) => html`<span>${ic(i, 16, 2)}${t}</span>`)}</div>
        </div>
      </section>
      ${S.user && !biz ? html`<div class="banner warn biz-banner">${ic('shield', 20, 2)}<span><strong>Тарифы и продвижение — для ИП и компаний.</strong> Отправьте название, ИНН и ОГРН(ИП) на проверку — обычно это занимает до одного дня. <a href="/profile/settings#s-biz" style="text-decoration:underline">Подтвердить бизнес</a></span></div>` : ''}
      ${!ready ? html`<div class="banner soft biz-banner">${ic('clock', 20, 2)}<span><strong>Приём оплаты подключается.</strong> Цены уже действуют — напишите в <a href="/messages/support" style="text-decoration:underline">поддержку</a>, если хотите подключиться первыми.</span></div>` : ''}
      ${plan ? html`<div class="banner ok biz-banner">${ic('check', 20, 2.2)}<span>Сейчас у вас тариф <strong>«${plan.name}»</strong> до ${dateLong(plan.until)}. <a href="/profile/business" style="text-decoration:underline">Открыть «Для бизнеса»</a></span></div>` : ''}
      <section class="biz-sec" id="plans">
        <div class="biz-sec-head"><h2>Тарифы</h2>
          <div class="seg" role="tablist" aria-label="Срок">${[[1, '1 месяц'], [3, '3 месяца'], [12, '12 месяцев']].map(([m, t]) => html`<button type="button" role="tab" data-m="${m}">${t}</button>`)}</div></div>
        <div class="plans" id="plan-cards"></div>
        <p class="muted biz-small">Месяц тарифа — 30 дней. Сменить тариф можно в любой момент: оставшиеся дни пересчитаем по цене месяца.</p>
      </section>
      <section class="biz-sec">
        <div class="biz-sec-head"><div><span class="biz-kicker dark">${ic('trend', 16, 2)}Продвижение</span><h2>Ваше объявление — первым рядом</h2>
          <p class="biz-lead">Показываем в блоке «Реклама» над выдачей и лентой тем, кто ищет похожее в вашем городе. Обычная выдача не меняется: частные объявления не опускаются.</p></div></div>
        <div class="promo-wrap">
          <div class="promo-demo" aria-hidden="true">${[0, 1, 2].map((i) => html`<div class="pd-card ${i === 1 ? 'on' : ''}"><div class="pd-img"><span class="ad-mark static">Реклама</span></div><i></i><i class="s"></i></div>`)}</div>
          <div class="promo-opts">${[3, 7, 30].map((d) => html`<div class="promo-opt"><b>${d} ${plural(d, 'день', 'дня', 'дней')}</b><span class="promo-price">${rub(pr.promo[d])}</span><small>≈ ${rub(Math.round(pr.promo[d] / d))} в день${pr.proDiscount ? html`<br>в «Магазин Про» — ${rub(Math.max(1, Math.round(pr.promo[d] * (100 - pr.proDiscount) / 100)))}` : ''}</small></div>`)}</div>
        </div>
        <ol class="biz-steps">${[['tag', 'Опубликуйте объявление', 'Оно проходит обычную проверку модератора'], ['trend', 'Нажмите «Продвигать»', 'В объявлении или в «Моих объявлениях» → ⋯'], ['shield', 'Мы промаркируем рекламу', 'Получим токен erid в ОРД и запустим показ'], ['chart', 'Смотрите результат', 'Показы и переходы из блока — в статистике']].map(([i, t, d], n) => html`<li><span class="bs-n">${n + 1}</span><span class="bs-ic">${ic(i, 20)}</span><b>${t}</b><small>${d}</small></li>`)}</ol>
      </section>
      <section class="biz-sec"><div class="biz-sec-head"><h2>Вопросы и ответы</h2></div>
        <div class="faq">${BIZ_FAQ.map(([t, a]) => html`<details><summary>${t}${ic('down', 18, 2)}</summary><p>${a}</p></details>`)}</div>
        <p class="muted biz-small">Условия платных услуг — в <a href="/page/terms#paid" style="text-decoration:underline">разделе 7 Пользовательского соглашения</a>, правила рекламы — в <a href="/page/rules#ads" style="text-decoration:underline">Правилах</a>. Исполнитель — ${S.config.operator ? `${S.config.operator.name}, ИНН ${S.config.operator.inn}` : 'оператор Торганы'}.</p>
      </section>
    </div>`);
    const paint = () => {
      $$('[data-m]').forEach((b) => { b.classList.toggle('on', Number(b.dataset.m) === months); b.setAttribute('aria-selected', Number(b.dataset.m) === months ? 'true' : 'false'); });
      const save = (key) => { const full = pr[key][1] * months; return full > pr[key][months] ? Math.round((1 - pr[key][months] / full) * 100) : 0; };
      const cta = (key) => {
        const cls = key === 'pro' ? 'btn-accent' : 'btn-dark';
        if (!S.user) return html`<a class="btn ${cls} btn-block" href="/login?next=/business">Войти и подключить</a>`;
        if (!biz) return html`<a class="btn ${cls} btn-block" href="/profile/settings#s-biz">Подтвердить бизнес</a>`;
        if (!ready) return html`<button type="button" class="btn btn-soft btn-block" disabled>Оплата скоро</button>`;
        return html`<button type="button" class="btn ${cls} btn-block" data-buy="${key}">${plan && plan.id === key ? `Продлить на ${months} мес.` : plan ? `Перейти на «${PLAN_NAME[key]}»` : 'Подключить'}</button>`;
      };
      $('#plan-cards').innerHTML = String(html`
        <div class="plan free"><div class="plan-top"><h3>Частным лицам</h3><div class="plan-price"><b>0 ₽</b><span>всегда</span></div><p>Всё для продажи вещей и услуг — без ограничений.</p></div>
          <ul>${planFeatures('free', pr).map((f) => html`<li>${ic('check', 16, 2.4)}${f}</li>`)}</ul>
          <a class="btn btn-soft btn-block" href="/new">Разместить объявление</a></div>
        ${['shop', 'pro'].map((key) => html`<div class="plan ${key} ${plan && plan.id === key ? 'current' : ''}">
          <div class="plan-top"><h3>${PLAN_NAME[key]}${plan && plan.id === key ? html`<span class="plan-cur">ваш тариф</span>` : ''}</h3>
            <div class="plan-price"><b>${rub(Math.round(pr[key][months] / months))}</b><span>в месяц</span></div>
            <p>${months > 1 ? html`${rub(pr[key][months])} за ${months} мес.${save(key) ? html` · <span class="plan-save">выгода ${save(key)}%</span>` : ''}` : key === 'shop' ? 'Витрина и статистика для магазина.' : 'Для тех, у кого много товаров.'}</p></div>
          <ul>${planFeatures(key, pr).map((f) => html`<li>${ic('check', 16, 2.4)}${f}</li>`)}</ul>
          ${cta(key)}</div>`)}`);
      $$('[data-buy]').forEach((b) => {
        b.onclick = () => {
          const key = b.dataset.buy;
          payModal({ title: `Тариф «${PLAN_NAME[key]}»`, amount: pr[key][months], url: '/api/my/plan/pay', body: { plan: key, months },
            lines: [['Срок', `${months} мес. (${months * 30} дней)`], ...(plan && plan.id !== key ? [['Остаток «' + plan.name + '»', 'пересчитаем по цене месяца']] : plan ? [['Продление', `с ${dateShort(plan.until)}`]] : [])] });
        };
      });
    };
    $$('[data-m]').forEach((b) => { b.onclick = () => { months = Number(b.dataset.m); history.replaceState({}, '', `/business?m=${months}`); paint(); }; });
    paint();
  }

  // /pay/:id — человек вернулся со страницы ЮKassa. Пока платёж в обработке — проверяем каждые 2,5 секунды.
  const CANCEL_REASON = { expired_on_confirmation: 'Время на оплату истекло', insufficient_funds: 'Недостаточно средств', card_expired: 'Истёк срок действия карты', canceled_by_merchant: 'Платёж отменён', '3d_secure_failed': 'Банк не подтвердил оплату', permission_revoked: 'Оплата отменена', payment_method_limit_exceeded: 'Превышен лимит платежей', payment_method_restricted: 'Способ оплаты недоступен', fraud_suspected: 'Банк заподозрил мошенничество', country_forbidden: 'Оплата из этой страны недоступна' };
  async function viewPay(id) {
    if (!requireAuth()) return;
    setTitle('Оплата');
    app.innerHTML = String(html`<div class="wrap"><div class="pay-res" id="pay"><div class="loader"></div></div></div>`);
    const box = $('#pay');
    const started = Date.now();
    let timer = null;
    cleanup = () => clearTimeout(timer);
    const draw = ({ payment: p, url }) => {
      const isBoost = p.kind === 'boost';
      const back = p.kind === 'promo' || isBoost ? `/l/${p.item.listingId}` : '/business';
      const home = isBoost ? ['/profile', 'Мои объявления'] : ['/profile/business', 'Для бизнеса'];
      const state = p.status === 'succeeded' ? ['ok', 'check', 'Оплата прошла', p.kind === 'plan' ? `Тариф «${PLAN_NAME[p.item.plan]}» подключён. Чек ЮKassa пришлёт на почту.` : isBoost ? `Продвижение на 7 дней ${p.item.tags && p.item.tags.length ? '— метки появятся после проверки. ' : 'включено. '}Если объявление ещё на проверке — начнётся с публикацией.` : 'Продвижение оплачено. Чек ЮKassa пришлёт на почту.']
        : p.status === 'canceled' ? ['bad', 'close', 'Оплата не прошла', `${CANCEL_REASON[p.error] || 'Банк или ЮKassa отклонили платёж'}. Деньги не списаны.`]
          : ['wait', 'clock', 'Проверяем оплату', 'Если вы уже оплатили, страница обновится сама через несколько секунд.'];
      box.innerHTML = String(html`<div class="pay-ic ${state[0]}">${ic(state[1], 34, 2.2)}</div>
        <h1>${state[2]}</h1><p class="muted">${state[3]}</p>
        <div class="pay-sum">${[['Услуга', p.title], ['Сумма', rub(p.amount)], ...(p.method ? [['Способ', p.method]] : []), ...(p.test ? [['Режим', 'тестовый платёж ЮKassa']] : [])].map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>
        <div class="pay-act">${p.status === 'succeeded' ? html`${p.kind === 'plan' ? html`<a class="btn btn-accent" href="/profile/business/shop">Заполнить витрину</a>` : html`<a class="btn btn-accent" href="${back}">К объявлению</a>`}<a class="btn btn-soft" href="${home[0]}">${home[1]}</a>`
    : p.status === 'canceled' ? html`<a class="btn btn-dark" href="${back}">Попробовать ещё раз</a><a class="btn btn-soft" href="/messages/support">Поддержка</a>`
      : html`${url ? html`<a class="btn btn-dark" href="${url}" data-ext>Вернуться к оплате</a>` : ''}<a class="btn btn-soft" href="${home[0]}">${home[1]}</a>`}</div>`);
      const ext = $('[data-ext]', box); if (ext) ext.onclick = (e) => { e.preventDefault(); location.href = url; };
    };
    const poll = async () => {
      const d = await api('GET', `/api/payments/${encodeURIComponent(id)}`);
      if (!box.isConnected) return;
      draw(d);
      if (d.payment.status === 'pending' && Date.now() - started < 120000) timer = setTimeout(() => poll().catch(() => {}), 2500);
      if (d.payment.status === 'succeeded') refreshMe();
    };
    await poll();
  }

  // Продвижение объявления: срок, цена (со скидкой «Про»), что будет дальше.
  const PROMO_STATUS = { marking: ['wait', 'Ждёт маркировки'], active: ['ok', 'Продвигается'], ended: ['off', 'Завершено'], stopped: ['bad', 'Остановлено'] };
  const promoLine = (p) => (p.status === 'active' ? `до ${dateShort(p.endsAt)} · показов ${NF.format(p.shows)} · переходов ${NF.format(p.clicks)}` : p.status === 'marking' ? `${p.days} ${plural(p.days, 'день', 'дня', 'дней')} — запустим после маркировки, срок начнётся с запуска` : p.status === 'stopped' ? (p.note || 'остановлено модератором') : `${p.startsAt ? `${dateShort(p.startsAt)} — ${dateShort(p.endsAt)}` : ''} · показов ${NF.format(p.shows)} · переходов ${NF.format(p.clicks)}`);
  async function promoteModal(listingId, title) {
    let d;
    try { d = await api('GET', `/api/listings/${listingId}/promote`); } catch (e) { toast(e.message, true); return; }
    let days = 7;
    openModal(String(html`<h2>Продвижение</h2><p class="muted" style="margin:0 0 14px">«${title}»</p>
      ${d.current ? html`<div class="banner ${d.current.status === 'active' ? 'ok' : 'warn'}" style="margin-bottom:14px"><strong>${PROMO_STATUS[d.current.status][1]}</strong> ${promoLine(d.current)}. Новая оплата ${d.current.status === 'active' ? 'продлит срок' : 'добавит дни'}.</div>` : ''}
      ${!d.biz ? html`<div class="banner warn">Продвижение — для ИП и компаний: подтвердите данные бизнеса, они нужны для маркировки рекламы.</div><div class="modal-actions"><button class="btn btn-soft" data-x>Закрыть</button><a class="btn btn-dark" href="/profile/settings#s-biz">Подтвердить бизнес</a></div>`
    : html`<div class="promo-pick" role="radiogroup" aria-label="Срок продвижения">${d.options.map((o) => html`<label class="promo-pick-opt"><input type="radio" name="days" value="${o.days}" ${o.days === days ? raw('checked') : ''}><span><b>${o.days} ${plural(o.days, 'день', 'дня', 'дней')}</b><em>${rub(o.price)}${o.price !== o.base ? html` <s>${rub(o.base)}</s>` : ''}</em></span></label>`)}</div>
      ${d.discount ? html`<p class="muted" style="margin:8px 0 0;font-size:13px">Скидка ${d.discount}% — тариф «Магазин Про».</p>` : ''}
      <ul class="promo-how"><li>${ic('megaphone', 17)}Покажем в блоке «Реклама» над выдачей и лентой тем, кто ищет похожее в городе ${d.city || 'объявления'}.</li>
        <li>${ic('shield', 17)}${d.requireErid ? 'Сначала промаркируем рекламу (токен erid в ОРД) — обычно в течение рабочего дня; срок начнётся с запуска.' : 'Запустим сразу после оплаты.'}</li>
        <li>${ic('chart', 17)}Показы и переходы из блока — в статистике объявления.</li></ul>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button>${d.ready ? html`<button class="btn btn-accent" data-ok>Продолжить</button>` : html`<button class="btn btn-soft" disabled>Оплата скоро</button>`}</div>`}`), (m, close) => {
      $('[data-x]', m).onclick = close;
      m.addEventListener('click', (e) => { if (e.target.closest('a[href]')) close(); });
      m.addEventListener('change', (e) => { if (e.target.name === 'days') days = Number(e.target.value); });
      const ok = $('[data-ok]', m);
      if (ok) ok.onclick = () => { const o = d.options.find((x) => x.days === days); close(); payModal({ title: 'Продвижение объявления', amount: o.price, url: `/api/listings/${listingId}/promote`, body: { days }, lines: [['Объявление', title], ['Срок', `${days} ${plural(days, 'день', 'дня', 'дней')}`]] }); };
    });
  }

  // ---------- профиль → «Для бизнеса» ----------
  const PAY_STATUS = { succeeded: ['ok', 'Оплачен'], pending: ['wait', 'Ждёт оплаты'], canceled: ['off', 'Не оплачен'], error: ['bad', 'Ошибка'] };
  async function renderBusinessHub(sub, days, reload) {
    const d = await api('GET', '/api/my/business');
    const box = $('#box');
    const biz = d.biz && d.biz.status === 'verified';
    const lock = (need) => (!d.plan ? `в тарифе «${PLAN_NAME[need]}»` : need === 'pro' && d.plan.id !== 'pro' ? 'в тарифе «Магазин Про»' : '');
    const gate = (need, text) => html`<div class="biz-gate">${ic('store', 26, 1.8)}<div><b>${text}</b><span>${lock(need) ? `Доступно ${lock(need)}.` : ''} ${biz ? '' : 'Сначала подтвердите данные бизнеса.'}</span></div><a class="btn btn-dark" href="${biz ? `/business${need === 'pro' ? '?m=1' : ''}` : '/profile/settings#s-biz'}">${biz ? 'Выбрать тариф' : 'Подтвердить бизнес'}</a></div>`;
    if (sub === 'shop') return lock('shop') ? (box.innerHTML = String(gate('shop', 'Витрина магазина'))) : renderShopEditor(box, d, reload);
    if (sub === 'stats') return lock('shop') ? (box.innerHTML = String(gate('shop', 'Статистика магазина'))) : renderShopStats(box, days);
    if (sub === 'feed') return lock('pro') ? (box.innerHTML = String(gate('pro', 'Автозагрузка из фида'))) : renderFeed(box, d, reload);
    const tool = (href, icon, t, sub2, need) => html`<a class="biz-tool ${lock(need) ? 'locked' : ''}" href="${href}"><span class="bt-ic">${ic(icon, 22)}</span><b>${t}</b><small>${lock(need) ? html`${ic('lock', 13, 2)} ${lock(need)}` : sub2}</small></a>`;
    const fs = d.feed.state || {};
    box.innerHTML = String(html`<div class="bizhub">
      ${!biz ? html`<div class="biz-gate">${ic('shield', 26, 1.8)}<div><b>Подтвердите бизнес</b><span>Тарифы и продвижение — для ИП и компаний. Отправьте название, ИНН и ОГРН(ИП) — модератор сверит их с ЕГРЮЛ/ЕГРИП, обычно за день.</span></div><a class="btn btn-dark" href="/profile/settings#s-biz">Подтвердить</a></div>` : ''}
      <div class="plan-now ${d.plan ? d.plan.id : 'none'}">
        <div class="pn-txt"><span class="pn-k">Тариф</span><b>${d.plan ? `«${d.plan.name}»` : 'Не подключён'}</b>
          <span>${d.plan ? `до ${dateLong(d.plan.until)} · осталось ${daysLeft(d.plan.until)} ${plural(daysLeft(d.plan.until), 'день', 'дня', 'дней')}` : `Витрина, статистика магазина и автозагрузка — от ${rub(d.prices.shop[1])} в месяц. Размещение объявлений бесплатно всегда.`}</span></div>
        <a class="btn ${d.plan ? 'btn-light' : 'btn-dark'}" href="/business">${d.plan ? 'Продлить или сменить' : 'Выбрать тариф'}</a>
      </div>
      <div class="biz-tools">
        ${tool('/profile/business/shop', 'store', 'Витрина', d.shop.about || d.shop.cover ? 'заполнена · как видят покупатели' : 'обложка, описание, адрес, сайт', 'shop')}
        ${tool('/profile/business/stats', 'chart', 'Статистика магазина', 'все объявления · выгрузка в Excel', 'shop')}
        ${tool('/profile/business/feed', 'feed', 'Автозагрузка', d.feed.url ? (fs.status === 'error' ? 'ошибка — откройте' : fs.at ? `загружено ${when(fs.at)}` : 'загружается…') : 'фид Авито по ссылке', 'pro')}
      </div>
      <section class="st-card"><div class="st-card-head"><h2>Продвижение</h2><a class="btn btn-soft btn-sm" href="/profile?status=active">${ic('trend', 16, 2)}Выбрать объявление</a></div>
        ${d.promotions.length ? html`<div class="promo-list">${d.promotions.map((p) => html`<a class="promo-row" href="${p.listingId ? `/l/${p.listingId}` : '#'}">
            <span class="ml-tag ${PROMO_STATUS[p.status][0]}"><i></i>${PROMO_STATUS[p.status][1]}</span>
            <b>${p.title}</b><small>${promoLine(p)}</small></a>`)}</div>`
    : html`<p class="muted" style="margin:0">Продвигайте опубликованное объявление: «Мои объявления» → ⋯ → «Продвигать». Оно появится в блоке «Реклама» над выдачей по подходящим запросам.</p>`}
      </section>
      <section class="st-card"><h2>Платежи</h2>
        ${d.payments.length ? html`<div class="pay-list">${d.payments.map((p) => html`<div class="pay-row"><div><b>${p.title}</b><small>${when(p.createdAt)}${p.method ? ` · ${p.method}` : ''}${p.refunded ? ` · возвращено ${rub(p.refunded)}` : ''}${p.test ? ' · тестовый' : ''}</small></div>
            <span class="pay-amt">${rub(p.amount)}</span><span class="ml-tag ${(PAY_STATUS[p.status] || PAY_STATUS.error)[0]}"><i></i>${(PAY_STATUS[p.status] || PAY_STATUS.error)[1]}</span></div>`)}</div>
          <p class="muted" style="margin:0;font-size:13px">Кассовые чеки приходят на ${S.user.email} от ЮKassa. Вернуть деньги за неиспользованные дни — через <a href="/messages/support" style="text-decoration:underline">поддержку</a>.</p>`
    : html`<p class="muted" style="margin:0">Платежей пока не было.</p>`}
      </section>
    </div>`);
  }

  function renderShopEditor(box, d, reload) {
    const s = d.shop;
    let cover = null; // undefined — не трогать, '' — убрать, имя файла — новая
    box.innerHTML = String(html`<form class="set" id="shop-form">
      <section class="set-group set-wide">
        <h2>Обложка</h2>
        <button type="button" class="shop-cover-edit ${s.cover ? 'has' : ''}" data-cover>${s.cover ? html`<img src="${s.cover}" alt="">` : ''}<span class="sce-hint">${ic('camera', 20, 2)}${s.cover ? 'Заменить обложку' : 'Загрузить обложку · 1600×530'}</span></button>
        ${s.cover ? html`<div><button type="button" class="btn btn-line btn-sm" data-cover-del>Убрать обложку</button></div>` : ''}
        <p class="muted" style="margin:0;font-size:14px">Широкое фото магазина или товаров — сверху страницы продавца. JPG, PNG или WebP.</p>
      </section>
      <section class="set-group set-wide">
        <h2>О магазине</h2>
        <div class="field"><label for="sh-about">Описание</label><textarea id="sh-about" name="about" class="textarea" maxlength="1500" rows="5" placeholder="Что продаёте, гарантия, доставка, самовывоз">${s.about}</textarea></div>
        <div class="row stack-m">
          <div class="field" style="flex:1"><label for="sh-hours">Часы работы</label><input id="sh-hours" name="hours" class="input" maxlength="120" value="${s.hours}" placeholder="Пн–Пт 10:00–19:00"></div>
          <div class="field" style="flex:1"><label for="sh-site">Сайт</label><input id="sh-site" name="site" class="input" maxlength="200" value="${s.site}" placeholder="example.ru" inputmode="url"></div>
        </div>
        <div class="field"><label for="sh-addr">Адрес магазина или пункта выдачи</label><input id="sh-addr" name="address" class="input" maxlength="200" value="${s.address}" placeholder="Казань, ул. Баумана, 1"></div>
        <p class="muted" style="margin:0;font-size:13px">Витрину видят все на странице продавца. Пишите по правилам площадки: без телефонов и мессенджеров в описании — для связи есть чат. Модератор может очистить витрину, если она нарушает правила.</p>
        <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить</button><a class="btn btn-soft" href="/u/${S.user.id}">${ic('eye', 18)}Как видят покупатели</a></div>
      </section>
    </form>`);
    $('[data-cover]', box).onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
      inp.onchange = async () => {
        if (!inp.files[0]) return;
        toast('Загружаем обложку…');
        try {
          const up = await api('POST', '/api/uploads', await resizeImage(inp.files[0], 1600));
          cover = up.file;
          const b = $('[data-cover]', box); b.classList.add('has'); b.innerHTML = String(html`<img src="${up.url}" alt=""><span class="sce-hint">${ic('camera', 20, 2)}Заменить обложку</span>`);
          toast('Обложка загружена — нажмите «Сохранить»');
        } catch (e) { toast(e.message, true); }
      };
      inp.click();
    };
    const del = $('[data-cover-del]', box);
    if (del) del.onclick = () => { cover = ''; const b = $('[data-cover]', box); b.classList.remove('has'); b.innerHTML = String(html`<span class="sce-hint">${ic('camera', 20, 2)}Загрузить обложку · 1600×530</span>`); del.remove(); };
    $('#shop-form').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      if (cover !== null) body.cover = cover;
      try { await api('PUT', '/api/my/shop', body); toast('Витрина сохранена'); reload(); } catch (ex) { toast(ex.message, true); }
    };
  }

  const SHOP_SRC = [...STAT_SRC.slice(0, 4), ['ad', 'megaphone', 'Блок «Реклама»'], STAT_SRC[4]];
  async function renderShopStats(box, days) {
    const d = await api('GET', `/api/my/shop/stats?days=${days}`);
    const t = d.totals; const pv = d.prev;
    const pct1 = (x) => (Math.round(x * 10) / 10).toLocaleString('ru-RU');
    const delta = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}% к прошлым ${d.period} дням` : '');
    const kpi = (n, label, sub, note, accent) => html`<div class="st-kpi ${accent ? 'accent' : ''}"><span class="k">${label}</span><b>${n}</b>${note ? html`<span class="d">${note}</span>` : ''}<span class="s">${sub}</span></div>`;
    const mx = Math.max(1, ...d.daily.map((x) => x.views));
    const n = d.daily.length;
    const labels = [0, Math.floor((n - 1) / 2), n - 1];
    const srcTotal = Object.values(d.sources).reduce((a, b) => a + b, 0);
    box.innerHTML = String(html`<div class="st">
      <div class="st-kpis">
        ${kpi(NF.format(t.impressions), 'Показы', 'в поиске, ленте и рекламе', delta(t.impressions, pv.impressions))}
        ${kpi(NF.format(t.views), 'Переходы', `${d.active} ${plural(d.active, 'активное объявление', 'активных объявления', 'активных объявлений')}`, delta(t.views, pv.views), true)}
        ${kpi(`${pct1(t.impressions ? (t.views / t.impressions) * 100 : 0)}%`, 'Из показа в переход', 'доля открывших', '')}
        ${kpi(NF.format(t.favs), 'В избранное', `сейчас в избранном у ${NF.format(d.favNow)}`, delta(t.favs, pv.favs))}
      </div>
      <section class="st-card"><div class="st-card-head"><h2>Переходы по дням</h2><a class="btn btn-soft btn-sm" href="/api/my/shop/stats.csv?days=${days}" download>${ic('download', 16, 2)}Выгрузить в Excel</a></div>
        <div class="st-chart" role="img" aria-label="Переходы по дням">${d.daily.map((x, i) => html`<div class="st-col" title="${dayLabel(x.day)}: переходов ${x.views}, показов ${x.impressions}, в избранное ${x.favs}"><div class="st-bar ${i === n - 1 ? 'now' : ''}" style="height:${x.views ? Math.max(4, Math.round((x.views / mx) * 100)) : 0}%">${x.favs ? html`<i class="st-dot"></i>` : ''}</div></div>`)}</div>
        <div class="st-axis">${labels.map((i) => html`<span>${dayLabel(d.daily[i].day)}</span>`)}</div>
      </section>
      <div class="st-row">
        <section class="st-card"><h2>Откуда переходили</h2>
          ${srcTotal ? SHOP_SRC.filter(([k]) => d.sources[k]).map(([k, icn, label]) => { const p = Math.round((d.sources[k] / srcTotal) * 100); return html`<div class="st-src"><span class="st-src-ic">${ic(icn, 17)}</span><div><div class="st-step-h"><span>${label}</span><b>${p}%</b></div><div class="st-track dark"><i style="width:${p}%"></i></div></div></div>`; }) : html`<p class="muted" style="margin:0">Появится после первых переходов.</p>`}
        </section>
        <section class="st-card"><h2>Объявления</h2>
          ${d.listings.length ? html`<div class="sst">${d.listings.slice(0, 12).map((l) => html`<a class="sst-row" href="/profile/stats/${l.id}"><span class="sst-img">${l.photo ? html`<img src="${l.photo}" alt="" loading="lazy">` : svg(P.image, 18, 1.4)}</span>
              <span class="sst-t">${l.title}</span><span class="sst-n" title="Показы">${ic('eye', 14)}${NF.format(l.impressions)}</span><span class="sst-n" title="Переходы"><b>${NF.format(l.views)}</b></span></a>`)}</div>
            ${d.listings.length > 12 ? html`<p class="muted" style="margin:0;font-size:13px">Все ${d.listings.length} — в выгрузке Excel.</p>` : ''}` : html`<p class="muted" style="margin:0">Опубликованных объявлений пока нет.</p>`}
        </section>
      </div>
      <p class="st-note">Считаем так же, как в статистике объявления: показ и переход — один раз в сутки на человека, без ваших собственных просмотров, модераторов и роботов. «Блок «Реклама»» — переходы из продвижения.</p>
    </div>`);
  }

  function renderFeed(box, d, reload) {
    const f = d.feed; const st = f.state || {};
    box.innerHTML = String(html`<div class="set">
      <form class="set-group set-wide" id="feed-form">
        <h2>Ссылка на фид</h2>
        <p class="muted" style="margin:0;font-size:14px">XML-файл в формате автозагрузки Авито — та же ссылка, что вы указываете в Авито. Берём поля Id, Title, Description, Price, Category, Address, Condition и Images.</p>
        <div class="field"><label for="fd-url">Ссылка</label><input id="fd-url" name="url" class="input" inputmode="url" value="${f.url}" placeholder="https://example.ru/avito.xml"></div>
        <div class="row stack-m">
          <div class="field" style="flex:1"><label for="fd-cat">Категория, если не распознана</label><select id="fd-cat" name="category" class="select"><option value="">Не загружать такие</option>${S.config.categories.map((c) => html`<option value="${c.id}" ${c.id === f.category ? raw('selected') : ''}>${c.name}</option>`)}</select></div>
          <div class="field" style="flex:1"><label for="fd-city">Город, если нет в адресе</label><input id="fd-city" name="city" class="input" list="cities" value="${f.city}" placeholder="${S.user.city || 'Казань'}"><datalist id="cities">${S.config.cities.map((c) => html`<option value="${c}">`)}</datalist></div>
        </div>
        <div class="set-btns"><button class="btn btn-dark" type="submit">${f.url ? 'Сохранить и загрузить' : 'Подключить фид'}</button>${f.url ? html`<button type="button" class="btn btn-soft" data-run ${st.running ? raw('disabled') : ''}>${ic('refresh', 16, 2)}Загрузить сейчас</button>` : ''}</div>
      </form>
      ${f.url ? html`<section class="set-group set-wide" id="feed-state">
        <h2>Последняя загрузка</h2>
        ${st.running ? html`<div class="banner soft">${ic('clock', 18, 2)} Загружаем фид — это может занять несколько минут, если фото много.</div>`
    : st.at ? html`<div class="banner ${st.status === 'error' ? 'danger' : 'ok'}">${st.status === 'error' ? html`<strong>Ошибка.</strong> ${st.message}` : html`<strong>Готово ${when(st.at)}.</strong> ${st.message || ''}`}</div>
          ${st.status !== 'error' ? html`<div class="feed-nums">${[['В фиде', st.total], ['Новых', st.created], ['Изменено', st.updated], ['Без изменений', st.unchanged], ['Снято', st.archived], ['Пропущено', st.skipped]].map(([k, v]) => html`<div><b>${NF.format(v || 0)}</b><span>${k}</span></div>`)}</div>` : ''}
          ${st.errors && st.errors.length ? html`<h3 class="set-h3">Что не загрузилось</h3><ul class="feed-errs">${st.errors.map((e) => html`<li><b>${e.title || `Id ${e.id}`}</b> — ${e.error}</li>`)}</ul>` : ''}` : html`<p class="muted" style="margin:0">Ещё не загружали.</p>`}
        <p class="muted" style="margin:0;font-size:13px">Фид обновляется каждые 6 часов${f.next && !st.running ? ` — следующий раз ${when(f.next)}` : ''}. Новые и изменённые объявления проходят проверку модератора; те, что пропали из файла, снимаются с публикации.</p>
      </section>` : ''}
    </div>`);
    let timer = null;
    const watch = () => { timer = setTimeout(async () => { if (!box.isConnected) return; const n = await api('GET', '/api/my/business').catch(() => null); if (n && box.isConnected) { if (n.feed.state.running) watch(); else renderFeed(box, n, reload); } }, 2000); };
    if (st.running) watch();
    cleanup = () => clearTimeout(timer);
    $('#feed-form').onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('PUT', '/api/my/feed', Object.fromEntries(new FormData(e.target).entries())); toast(r.feed.url ? 'Фид сохранён — загружаем' : 'Фид отключён'); setTimeout(reload, 400); } catch (ex) { toast(ex.message, true); }
    };
    const run = $('[data-run]', box);
    if (run) run.onclick = async () => { try { await api('POST', '/api/my/feed/run'); toast('Загружаем фид'); setTimeout(reload, 400); } catch (ex) { toast(ex.message, true); } };
  }

  // Витрина магазина на публичной странице продавца.
  function shopHero(sh) {
    const site = sh.site ? (() => { try { return new URL(sh.site).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '';
    return html`<section class="shop-hero">
      <div class="shop-cover">${sh.cover ? html`<img src="${sh.cover}" alt="">` : ''}</div>
      <div class="shop-body">
        <div class="shop-name"><span class="pf-badge dark">${ic('store', 13, 2)} ${sh.plan === 'pro' ? 'Магазин Про' : 'Магазин'}</span><h2>${sh.name}</h2></div>
        ${sh.about ? html`<p class="shop-about">${sh.about}</p>` : ''}
        ${sh.hours || sh.address || site ? html`<div class="shop-facts">
          ${sh.hours ? html`<span>${ic('clock', 16)}${sh.hours}</span>` : ''}
          ${sh.address ? html`<span>${ic('pin', 16)}${sh.address}</span>` : ''}
          ${site ? html`<a href="${sh.site}" target="_blank" rel="nofollow noopener ugc">${ic('link', 16)}${site}</a>` : ''}</div>` : ''}
      </div>
    </section>`;
  }

  // ================= модерация =================
  const REASONS = ['Запрещённый товар или услуга', 'Фото не соответствует описанию', 'Неверная категория', 'Признаки мошенничества', 'Контакты или ссылки в тексте и на фото', 'Повторное объявление', 'Оскорбительное содержание'];
  const BLOCK_REASONS = ['Мошенничество', 'Продажа запрещённого', 'Спам и повторные объявления', 'Чужие фото и подделки', 'Оскорбления'];
  const REPORT_REASONS = ['Запрещённый товар или услуга', 'Мошенничество', 'Неверная цена или описание', 'Товар уже продан', 'Чужие фото или подделка', 'Оскорбления или спам', 'Нарушены мои права (правообладатель)'];

  // Одно окно «выбор причины + текст» — отклонение, отказ по апелляции, закрытие жалоб и жалоба пользователя.
  // pick: причину нужно выбрать из списка (жалоба); иначе список лишь подставляет текст.
  function reasonModal({ title, hint, url, okLabel, reasons, pick = false, minText = 5, placeholder = 'Объяснение для автора', danger = true, extra = {}, done = () => render() }) {
    openModal(String(html`<h2>${title}</h2><p class="muted" style="margin:0 0 12px">${hint}</p>
        ${reasons ? html`<div class="reasons">${reasons.map((r) => html`<button type="button" class="chip" data-r="${r}">${r}</button>`)}</div>` : ''}
        <label class="sr" for="rr">Текст</label><textarea id="rr" class="textarea" style="margin-top:12px;min-height:110px" maxlength="1000" placeholder="${placeholder}"></textarea>
        <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn ${danger ? 'btn-danger' : 'btn-dark'}" data-ok>${okLabel}</button></div>`), (m, close) => {
      let picked = '';
      $$('[data-r]', m).forEach((c) => {
        c.onclick = () => {
          picked = c.dataset.r;
          $$('[data-r]', m).forEach((x) => x.classList.toggle('active', x === c));
          if (!pick) $('#rr', m).value = picked;
        };
      });
      $('[data-x]', m).onclick = close;
      $('[data-ok]', m).onclick = async () => {
        const text = $('#rr', m).value.trim();
        if (pick && !picked) { toast('Выберите причину', true); return; }
        if (!pick && text.length < minText) { toast('Напишите объяснение — его увидит автор', true); return; }
        try { await api('POST', url, { ...extra, ...(pick ? { reason: picked, text } : { reason: text }) }); close(); toast('Готово'); done(); } catch (e) { toast(e.message, true); }
      };
    });
  }

  // Кнопки модератора — одни обработчики для очереди и страницы проверки. after — что делать после решения.
  function bindModActions(root, after = () => render()) {
    const mailNote = S.config.mail ? ' и получит письмом' : '';
    $$('[data-ava-remove]', root).forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmModal('Убрать фото профиля?', 'Фото удалится, вместо него будет буква имени. Пользователь сможет загрузить другое.', 'Убрать', true))) return;
        try { await api('POST', `/api/admin/users/${b.dataset.avaRemove}/avatar/remove`); toast('Фото убрано'); render(); } catch (e) { toast(e.message, true); }
      };
    });
    $$('[data-reject]', root).forEach((b) => { b.onclick = () => reasonModal({ title: 'Отклонить объявление', hint: `Причину увидит автор${mailNote}. Её можно не писать — тогда автор увидит «Причина не указана».`, url: `/api/admin/listings/${b.dataset.reject}/reject`, okLabel: 'Отклонить', reasons: REASONS, minText: 0, placeholder: 'Причина для автора — необязательно', done: after }); });
    $$('[data-deny]', root).forEach((b) => { b.onclick = () => reasonModal({ title: 'Отказать по апелляции', hint: `Ответ увидит автор${mailNote}.`, url: `/api/admin/listings/${b.dataset.deny}/appeal-deny`, okLabel: 'Отказать', done: after }); });
    $$('[data-dismiss]', root).forEach((b) => { b.onclick = () => reasonModal({ title: 'Закрыть жалобы', hint: 'Объявление останется опубликованным. Комментарий видят только модераторы.', url: `/api/admin/listings/${b.dataset.dismiss}/reports/dismiss`, okLabel: 'Закрыть жалобы', minText: 0, placeholder: 'Например: проверили — нарушений нет', danger: false, done: after }); });
    $$('[data-restore]', root).forEach((b) => {
      b.onclick = async () => { try { await api('POST', `/api/admin/listings/${b.dataset.restore}/restore`); toast('Опубликовано'); after(); } catch (e) { toast(e.message, true); } };
    });
    // Блокировка — с причиной (уйдёт человеку письмом), разблокировка — с подтверждением.
    $$('[data-block]', root).forEach((b) => {
      const url = `/api/admin/users/${b.dataset.block}/block`;
      b.onclick = async () => {
        if (!b.dataset.blocked) {
          reasonModal({ title: 'Заблокировать пользователя', hint: `Объявления скроются из поиска, войти он не сможет. Причину увидит пользователь${mailNote}.`, url, okLabel: 'Заблокировать', reasons: BLOCK_REASONS, extra: { blocked: true }, placeholder: 'Причина для пользователя' });
          return;
        }
        if (!(await confirmModal('Разблокировать?', `Объявления снова будут видны, войти можно будет как обычно${mailNote ? '. Пользователь получит письмо' : ''}.`, 'Разблокировать'))) return;
        try { await api('POST', url, { blocked: false }); toast('Разблокирован'); render(); } catch (e) { toast(e.message, true); }
      };
    });
  }

  // Кнопки решения для объявления в зависимости от состояния.
  const modButtons = (i) => html`
    ${i.status === 'pending' ? html`<button class="btn btn-accent btn-sm" data-restore="${i.id}">Опубликовать</button><button class="btn btn-danger btn-sm" data-reject="${i.id}">Отклонить</button>` : ''}
    ${i.status === 'rejected' ? html`<button class="btn btn-accent btn-sm" data-restore="${i.id}">${i.appealAt ? 'Одобрить апелляцию' : 'Восстановить'}</button>` : ''}
    ${i.appealAt ? html`<button class="btn btn-line btn-sm" data-deny="${i.id}">Отказать по апелляции</button>` : ''}
    ${['active', 'sold', 'archived'].includes(i.status) ? html`<button class="btn btn-danger btn-sm" data-reject="${i.id}">Снять с публикации</button>` : ''}
    ${i.reports ? html`<button class="btn btn-soft btn-sm" data-dismiss="${i.id}">Закрыть жалобы</button>` : ''}`;
  const STATUS_LABEL = { pending: 'На проверке', scheduled: 'Запланировано', active: 'Опубликовано', rejected: 'Отклонено', sold: 'Продано', archived: 'Снято' };

  // ---------- оболочка модерации: меню слева (на телефоне — лента сверху) ----------
  const ADMIN_NAV = [
    ['', [['dash', 'chart', 'Сводка']]],
    ['Проверка', [['pending', 'inbox', 'На проверке', 'pending'], ['reports', 'flag', 'Жалобы', 'reports'], ['appeals', 'reply', 'Апелляции', 'appeals'], ['reviews', 'star', 'Отзывы', 'reviews'], ['tags', 'tag', 'Метки на фото', 'tags'], ['support', 'headset', 'Поддержка', 'support'], ['biz', 'shield', 'Бизнес', 'biz']]],
    ['Объявления', [['active', 'tag', 'Опубликованные'], ['rejected', 'close', 'Отклонённые'], ['sold', 'check', 'Проданные'], ['archived', 'pause', 'Снятые']]],
    ['Люди', [['users', 'users', 'Пользователи'], ['log', 'list', 'Журнал действий']]],
    ['Деньги', [['payments', 'card', 'Платежи'], ['ads', 'megaphone', 'Реклама', 'ads'], ['billing', 'tag', 'Оплата и цены']]],
    ['Настройки', [['notify', 'bell', 'Мои уведомления'], ['mail', 'mail', 'Почта'], ['oauth', 'lock', 'Вход через сервисы'], ['seo', 'search', 'Поиск и статистика'], ['backup', 'shield', 'Копии и безопасность'], ['site', 'refresh', 'Версия сайта']]]
  ];
  const LISTING_TABS = ['pending', 'reports', 'appeals', 'active', 'rejected', 'sold', 'archived'];
  function adminShell(active, stats, body) {
    const badge = (k) => (k && stats[k] ? html`<span class="badge">${stats[k]}</span>` : '');
    return html`<div class="wrap adm">
      <aside class="adm-side">
        <div class="adm-title">Модерация</div>
        <nav class="pf-nav adm-nav" aria-label="Разделы модерации">${ADMIN_NAV.map(([group, items]) => html`
          ${group ? html`<div class="pf-nav-h">${group}</div>` : ''}
          ${items.map(([k, icon, label, cnt]) => navLink(`/admin?status=${k}`, icon, k === 'mail' && !S.config.mail ? `${label} · не подключена` : label, k === active, badge(cnt)))}`)}
        </nav>
      </aside>
      <section class="adm-main">${body}</section>
    </div>`;
  }
  // Длительность по-человечески: «40 мин», «3 ч 20 мин», «2 дн 4 ч».
  function fmtDur(ms) {
    if (ms === null || ms === undefined) return '—';
    const m = Math.round(ms / 60000);
    if (m < 1) return '< 1 мин';
    if (m < 60) return `${m} мин`;
    const hrs = Math.floor(m / 60);
    if (hrs < 24) return `${hrs} ч${m % 60 ? ` ${m % 60} мин` : ''}`;
    return `${Math.floor(hrs / 24)} дн${hrs % 24 ? ` ${hrs % 24} ч` : ''}`;
  }

  async function viewAdmin(_, q) {
    if (!requireAuth()) return;
    if (!S.user.isAdmin) { viewNotFound(); return; }
    const status = q.get('status') || 'dash';
    const title = ADMIN_NAV.flatMap((g) => g[1]).find(([k]) => k === status);
    setTitle(title ? `${title[2]} — модерация` : 'Модерация');
    const [stats, dev] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', '/api/admin/device').catch(() => null)]);
    const arm = dev && dev.required && !dev.armed ? html`<div class="banner warn adm-arm">${ic('shield', 20, 2)}<div><b>Защита входа в модерацию не включена.</b> Подтвердите это устройство кодом из письма — после этого на новых устройствах модерация будет открываться только по коду.</div><a class="btn btn-dark btn-sm" href="/admin/device">Включить</a></div>` : '';
    app.innerHTML = String(adminShell(status, stats, html`${arm}<div id="adm-box" class="adm-box"><div class="loader"></div></div>`));
    const box = $('#adm-box');
    const extraUrl = { mail: '/api/admin/mail', site: '/api/admin/update' }[status];
    const extra = extraUrl ? await api('GET', extraUrl) : null;
    const head = (h1, right = '') => html`<div class="adm-head"><h1>${h1}</h1>${right}</div>`;
    const R = {
      dash: () => renderDashboard(box, stats),
      users: () => renderUsersAdmin(box, q),
      biz: () => renderUsersAdmin(box, new URLSearchParams({ f: 'biz' }), 'Проверка бизнеса'),
      oauth: () => renderOauthAdmin(box),
      seo: () => renderSeoAdmin(box),
      backup: () => renderBackupAdmin(box),
      payments: () => renderPaymentsAdmin(box, q),
      tags: () => renderBoostTagsAdmin(box),
      ads: () => renderAdsAdmin(box, ['marking', 'active', 'ended'].includes(q.get('tab')) ? q.get('tab') : 'marking'),
      billing: () => renderBillingAdmin(box),
      log: () => renderLogAdmin(box, q),
      notify: () => renderNotifyAdmin(box),
      mail: () => { box.innerHTML = String(head('Почта')); box.insertAdjacentHTML('beforeend', '<div id="special-box"></div>'); renderMailAdmin($('#special-box'), extra); },
      site: () => { box.innerHTML = String(head('Версия сайта')); box.insertAdjacentHTML('beforeend', '<div id="special-box"></div>'); renderSiteAdmin($('#special-box'), extra.update); },
      support: async () => { box.innerHTML = String(head('Поддержка')); box.insertAdjacentHTML('beforeend', '<div id="special-box"></div>'); await renderSupportAdmin($('#special-box'), q.get('t')); },
      reviews: async () => { box.innerHTML = String(head('Отзывы')); box.insertAdjacentHTML('beforeend', '<div id="special-box"></div>'); await renderReviewsAdmin($('#special-box'), q.get('rt') || 'pending'); }
    };
    if (R[status]) { await R[status](); return; }
    if (!LISTING_TABS.includes(status)) { go('/admin', true); return; }
    await renderListingsAdmin(box, status, q.get('q') || '', head(title[2]));
  }

  // Замечания автопроверки и «похоже на запрещённое» — плашками в очереди и на странице проверки.
  const CHECK_ICON = { duplicate: 'refresh', photo: 'image', price: 'tag', contacts: 'chat' };
  const checkChips = (i) => (i.flags || (i.checks && i.checks.length) ? html`<div class="chk-list">
    ${i.flags ? html`<span class="chk danger">${ic('warn', 15, 2)}Похоже на запрещённое: ${i.flags}</span>` : ''}
    ${(i.checks || []).map((c) => html`<span class="chk">${ic(CHECK_ICON[c.kind] || 'warn', 15, 2)}${c.text}</span>`)}</div>` : '');

  async function renderListingsAdmin(box, status, search, head) {
    const { items } = await api('GET', `/api/admin/listings?${new URLSearchParams({ status, q: search })}`);
    box.innerHTML = String(html`${head}
      <form id="as" class="search adm-search">${ic('search', 18)}<label class="sr" for="aq">Поиск</label><input id="aq" name="q" placeholder="Текст объявления или email автора" value="${search}"></form>
      ${items.length ? items.map((i) => html`<div class="my-row">
        <a href="/admin/l/${i.id}" class="my-img">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
        <div class="my-info">
          <a href="/admin/l/${i.id}" class="t" style="display:block">${i.title}</a>
          <div class="p">${price(i.price, i.priceUnit)} <span class="muted" style="font-weight:500;font-size:14px">· ${catName(i.category)} · ${i.city}</span></div>
          <div class="m"><a href="/admin/u/${i.user.id}">${i.user.name}</a> (${i.user.email})${i.user.blocked ? ' · заблокирован' : ''} · ${when(i.updatedAt)}</div>
          ${checkChips(i)}
          ${i.reports ? html`<div class="banner warn" style="margin-top:8px;padding:8px 12px;font-size:14px"><strong>Жалоб:</strong> ${i.reports}</div>` : ''}
          ${i.appealAt ? html`<div class="banner warn" style="margin-top:8px;padding:8px 12px;font-size:14px"><strong>Апелляция:</strong> ${i.appealText}</div>` : ''}
        </div>
        <div class="my-actions"><a class="btn btn-dark btn-sm" href="/admin/l/${i.id}">Проверить</a>${modButtons(i)}</div>
      </div>`) : html`<div class="empty"><h3>${status === 'pending' ? 'Очередь пуста' : 'Здесь пусто'}</h3><p>${status === 'pending' ? 'Все объявления проверены.' : 'Нет объявлений в этом разделе.'}</p></div>`}`);
    $('#as').onsubmit = (e) => { e.preventDefault(); go(`/admin?${new URLSearchParams({ status, q: e.target.q.value.trim() })}`); };
    bindModActions(box);
  }

  // Столбики за 30 дней: подсказка с числом по наведению и по фокусу (на телефоне — по нажатию).
  function barChart(days, key, label) {
    const max = Math.max(1, ...days.map((d) => d[key]));
    const dm = (d) => { const [, m, dd] = d.split('-'); return `${Number(dd)} ${MONTHS[Number(m) - 1].slice(0, 3)}`; };
    return html`<div class="bars" role="img" aria-label="${label}: за 30 дней ${days.reduce((a, d) => a + d[key], 0)}, максимум за день ${max}">
        <span class="bars-max">${max}</span>
        ${days.map((d, i) => html`<button type="button" class="bar ${i > 23 ? 'r' : i < 6 ? 'l' : ''}" style="--h:${((d[key] / max) * 100).toFixed(1)}%" data-tip="${dm(d.day)}: ${d[key]}" aria-label="${dm(d.day)}: ${d[key]}"><i></i></button>`)}
      </div>
      <div class="bars-axis"><span>${dm(days[0].day)}</span><span>${dm(days[15].day)}</span><span>сегодня</span></div>`;
  }

  async function renderDashboard(box, st) {
    const d = await api('GET', '/api/admin/dashboard');
    const tile = (href, n, k, sub = '') => html`<a class="dash-tile" href="${href}"><b>${n}</b><span>${k}</span>${sub ? html`<small>${sub}</small>` : ''}</a>`;
    const CHARTS = [['listings', 'Объявления'], ['users', 'Пользователи'], ['approved', 'Опубликовано'], ['rejected', 'Отклонено']];
    box.innerHTML = String(html`<div class="adm-head"><h1>Сводка</h1><span class="muted">${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}</span></div>
      <div class="dash-top">
        <div class="dash-queue">
          <span class="dash-queue-k">Ждут проверки</span>
          <b>${NF.format(d.queue.pending)}</b>
          <span class="dash-queue-sub">${d.queue.pending ? html`Самое старое ждёт ${fmtDur(Date.now() - d.queue.oldestAt)}${d.queue.flagged ? html` · с замечаниями: ${d.queue.flagged}` : ''}` : 'Очередь пуста — всё проверено'}</span>
          ${d.queue.pending ? html`<a class="btn btn-light" href="/admin?status=pending">Проверять${ic('right', 18, 2)}</a>` : ''}
        </div>
        <div class="dash-tiles">
          ${tile('/admin?status=log', fmtDur(d.speed.median), 'время проверки', d.speed.count ? `медиана за 7 дней · среднее ${fmtDur(d.speed.avg)}` : 'за 7 дней решений не было')}
          ${tile('/admin?status=reports', NF.format(st.reports), 'жалоб ждут решения', `новых за сутки: ${d.today.reports}`)}
          ${tile('/admin?status=support', NF.format(st.support), 'ждут ответа поддержки')}
          ${tile('/admin?status=active', NF.format(d.totals.active), 'опубликовано', `новых за сутки: ${d.today.listings}`)}
          ${tile('/admin?status=users', NF.format(d.totals.users), 'пользователей', `новых за сутки: ${d.today.users}${d.totals.blocked ? ` · заблокировано: ${d.totals.blocked}` : ''}`)}
          ${tile('/admin?status=appeals', NF.format(st.appeals), 'апелляций', `отзывов на проверке: ${st.reviews}`)}
          ${st.ads ? tile('/admin?status=ads', NF.format(st.ads), 'реклама ждёт erid', 'оплачено — запустите после маркировки') : ''}
        </div>
      </div>
      <div class="dash-grid">
        <section class="panel dash-chart">
          <div class="dash-chart-head"><h2 class="h2">За 30 дней</h2>
            <div class="seg" role="tablist">${CHARTS.map(([k, t], i) => html`<a role="tab" href="#" data-chart="${k}" class="${i ? '' : 'on'}" aria-selected="${i ? 'false' : 'true'}">${t}</a>`)}</div></div>
          <div id="chart">${barChart(d.days, 'listings', 'Новые объявления')}</div>
        </section>
        <section class="panel dash-mods"><h2 class="h2">Модераторы за 7 дней</h2>
          ${d.moderators.map((m) => html`<a class="dash-mod" href="/admin?status=log&admin=${m.id}">${ava(m, 'sm')}<span>${m.name}${m.me ? html` <small class="muted">(вы)</small>` : ''}</span><b>${NF.format(m.actions)}</b></a>`)}
          <p class="muted" style="margin:6px 0 0;font-size:13px">Число действий: решения по объявлениям и отзывам, блокировки, ответы в поддержке.</p>
        </section>
      </div>`);
    $$('[data-chart]', box).forEach((a) => {
      a.onclick = (e) => {
        e.preventDefault();
        $$('[data-chart]', box).forEach((x) => { x.classList.toggle('on', x === a); x.setAttribute('aria-selected', x === a ? 'true' : 'false'); });
        $('#chart', box).innerHTML = String(barChart(d.days, a.dataset.chart, a.textContent));
      };
    });
  }

  // ---------- пользователи ----------
  const USER_FILTERS = [['all', 'Все'], ['new', 'Новые за неделю'], ['reported', 'С жалобами'], ['biz', 'Заявки бизнеса'], ['blocked', 'Заблокированные'], ['admins', 'Модераторы']];
  const userBadges = (u) => html`${u.isAdmin ? html`<span class="pf-badge">${ic('shield', 13, 2)} ${u.isOwner ? 'Владелец' : 'Модератор'}</span>` : ''}
    ${u.blocked ? html`<span class="pf-badge bad">${ic('lock', 13, 2)} Заблокирован</span>` : ''}
    ${u.reports ? html`<span class="pf-badge warn">${ic('flag', 13, 2)} Жалоб: ${u.reports}</span>` : ''}
    ${u.bizPending ? html`<span class="pf-badge warn">${ic('shield', 13, 2)} Заявка бизнеса</span>` : ''}
    ${S.config.mail && !u.emailVerified ? html`<span class="pf-badge">Почта не подтверждена</span>` : ''}`;

  async function renderUsersAdmin(box, q, title = 'Пользователи') {
    const f = q.get('f') || 'all';
    const search = q.get('q') || '';
    const url = (over) => `/admin?${new URLSearchParams({ status: 'users', ...(search ? { q: search } : {}), ...(f !== 'all' ? { f } : {}), ...over })}`;
    let offset = 0;
    const load = () => api('GET', `/api/admin/users?${new URLSearchParams({ f, q: search, offset })}`);
    const d = await load();
    const row = (u) => html`<a class="adm-user" href="/admin/u/${u.id}">
        ${ava(u)}
        <span class="adm-user-main"><b>${u.name}</b><span>${u.email}</span></span>
        <span class="adm-user-meta">${u.city ? `${u.city} · ` : ''}с ${since(u.createdAt)}<br>${NF.format(u.listings)} ${plural(u.listings, 'объявление', 'объявления', 'объявлений')} · опубл. ${u.active}</span>
        <span class="adm-user-badges">${userBadges(u)}</span>
        <span class="chev">${ic('right', 18, 2)}</span>
      </a>`;
    box.innerHTML = String(html`<div class="adm-head"><h1>${title}</h1><span class="muted">${NF.format(d.total)}</span></div>
      <form id="us" class="search adm-search">${ic('search', 18)}<label class="sr" for="uq">Поиск</label><input id="uq" name="q" placeholder="Имя, email, телефон или № пользователя" value="${search}"></form>
      <div class="tabs adm-chips">${USER_FILTERS.map(([k, t]) => html`<a class="chip ${k === f ? 'active' : ''}" href="${url({ f: k === 'all' ? '' : k })}">${t}<span class="cnt">${d.counts[k]}</span></a>`)}</div>
      ${d.items.length ? html`<div class="adm-users" id="ul">${d.items.map(row)}</div>` : html`<div class="empty"><h3>Никого не нашли</h3><p>Проверьте написание или уберите фильтр.</p></div>`}
      <div class="more ${d.items.length < d.total ? '' : 'hidden'}"><button class="btn btn-soft btn-lg" type="button" id="um">Показать ещё</button></div>`);
    $('#us').onsubmit = (e) => { e.preventDefault(); go(url({ q: e.target.q.value.trim() })); };
    const more = $('#um');
    more.onclick = async () => {
      offset += 30;
      const n = await load();
      $('#ul').insertAdjacentHTML('beforeend', n.items.map((u) => String(row(u))).join(''));
      more.parentElement.classList.toggle('hidden', offset + n.items.length >= n.total);
    };
  }

  async function viewAdminUser(id) {
    if (!requireAuth()) return;
    if (!S.user.isAdmin) { viewNotFound(); return; }
    const [stats, d] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', `/api/admin/users/${id}`)]);
    const u = d.user;
    setTitle(`${u.name} — модерация`);
    const blockedBy = d.log.find((e) => e.action === 'user-blocked');
    const tabs = [['listings', `Объявления · ${d.counts.total}`], ['reports', `Жалобы · ${d.reports.against.length + d.reports.by.length}`], ['reviews', `Отзывы · ${d.reviews.about.length + d.reviews.by.length}`], ['log', `История · ${d.log.length}`]];
    const reportItem = (r, mine) => html`<div class="report ${r.resolvedAt ? 'done' : ''}"><b>${r.reason}</b>${r.text ? html`<p>${r.text}</p>` : ''}
      <span class="muted"><a href="/admin/l/${r.listing.id}">«${r.listing.title}»</a> · ${mine ? 'пожаловался(ась)' : `от ${r.from ? r.from.name : 'пользователя'}`} · ${when(r.at)}${r.resolvedAt ? ` · закрыта: ${r.resolution}` : ''}</span></div>`;
    const reviewItem = (r, about) => html`<div class="report"><b>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} · ${RV_STATUS[r.status] ? RV_STATUS[r.status][1] : r.status}</b><p>${r.text}</p>
      <span class="muted">«${r.listing.title}» · ${about ? `от ${r.other ? r.other.name : '—'}` : `о продавце ${r.other ? r.other.name : '—'}`} · ${when(r.at)}</span></div>`;
    const section = (title, items, empty) => html`<h3 class="adm-sub">${title}</h3>${items.length ? items : html`<p class="muted" style="margin:0">${empty}</p>`}`;
    const panes = {
      listings: d.listings.length ? d.listings.map((i) => html`<div class="my-row">
          <a href="/admin/l/${i.id}" class="my-img">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
          <div class="my-info"><span class="ml-tag ${(MY_TAG[i.status] || MY_TAG.archived)[0]}"><i></i>${STATUS_LABEL[i.status]}</span>
            <a href="/admin/l/${i.id}" class="t" style="display:block;margin-top:4px">${i.title}</a>
            <div class="m">${price(i.price, i.priceUnit)} · ${i.city} · изменено ${when(i.updatedAt)}${i.reports ? ` · жалоб: ${i.reports}` : ''}</div>
            ${i.status === 'rejected' && i.rejectReason ? html`<div class="m">Причина отклонения: ${i.rejectReason}</div>` : ''}
            ${checkChips(i)}</div>
          <div class="my-actions"><a class="btn btn-soft btn-sm" href="/admin/l/${i.id}">Открыть</a></div></div>`) : html`<p class="muted">Объявлений нет.</p>`,
      reports: html`${section('На его объявления', d.reports.against.map((r) => reportItem(r, false)), 'Жалоб нет.')}${section('Его жалобы на других', d.reports.by.map((r) => reportItem(r, true)), 'Не жаловался.')}`,
      reviews: html`${section('О нём', d.reviews.about.map((r) => reviewItem(r, true)), 'Отзывов нет.')}${section('Он оставил', d.reviews.by.map((r) => reviewItem(r, false)), 'Не оставлял.')}`,
      log: d.log.length ? html`<div class="adm-log">${d.log.map(logRow)}</div>` : html`<p class="muted">Модераторы с ним ещё ничего не делали.</p>`
    };
    app.innerHTML = String(adminShell('users', stats, html`
      <a class="pf-back always" href="/admin?status=users">${ic('left', 18, 2)}Пользователи</a>
      <div class="adm-person panel">
        <div class="adm-person-top">${ava(u, 'xl')}
          <div class="adm-person-txt"><h1>${u.name}</h1>
            <div class="muted">№ ${u.id} · на Торгане с ${since(u.createdAt)}</div>
            ${u.rating && u.rating.count ? ratingLine(u.rating, `/u/${u.id}`) : ''}
            <div class="pf-badges">${userBadges({ ...u, reports: d.reports.against.filter((r) => !r.resolvedAt).length })}${trustBadges({ phone: u.phoneVerified, biz: u.business && u.business.status === 'verified' ? { kind: u.business.kind === 'ip' ? 'ИП' : 'Компания', name: u.business.name } : null })}${S.config.mail && u.emailVerified ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Почта подтверждена</span>` : ''}</div>
          </div>
        </div>
        ${u.business ? html`<div class="adm-biz ${u.business.status}">
          <div class="adm-biz-head"><b>${u.business.name}</b><span class="pf-badge ${u.business.status === 'verified' ? 'ok' : u.business.status === 'rejected' ? 'bad' : 'warn'}">${{ pending: 'ждёт проверки', verified: 'подтверждён', rejected: 'отклонён' }[u.business.status]}</span></div>
          <div class="adm-facts"><div><span>ИНН</span><b>${u.business.inn}</b></div><div><span>${u.business.kind === 'ip' ? 'ОГРНИП' : 'ОГРН'}</span><b>${u.business.ogrn}</b></div><div><span>Отправлено</span><b>${when(u.business.at)}</b></div></div>
          ${u.business.note ? html`<div class="muted" style="font-size:14px">Причина отказа: ${u.business.note}</div>` : ''}
          <div class="adm-person-act">
            <a class="btn btn-soft btn-sm" href="https://egrul.nalog.ru/index.html" target="_blank" rel="noopener">${ic('search', 16)}Проверить в ЕГРЮЛ/ЕГРИП</a>
            ${u.business.status !== 'verified' ? html`<button class="btn btn-accent btn-sm" data-biz-ok="${u.id}">Подтвердить</button>` : ''}
            ${u.business.status !== 'rejected' ? html`<button class="btn btn-line btn-sm" data-biz-no="${u.id}">${u.business.status === 'verified' ? 'Снять подтверждение' : 'Отказать'}</button>` : ''}
          </div>
          <p class="muted" style="margin:0;font-size:13px">Найдите ИНН в выписке ФНС и сверьте название, ОГРН(ИП) и что организация или ИП действуют.</p>
        </div>` : ''}
        ${u.plan ? html`<div class="adm-biz verified"><div class="adm-biz-head"><b>Тариф «${u.plan.name}»</b><span class="pf-badge ok">до ${dateLong(u.plan.until)}</span></div>
          ${u.shop && (u.shop.about || u.shop.cover || u.shop.site) ? html`<div class="muted" style="font-size:14px">Витрина: ${u.shop.about ? `«${u.shop.about.slice(0, 140)}${u.shop.about.length > 140 ? '…' : ''}»` : 'без описания'}${u.shop.site ? ` · ${u.shop.site}` : ''}</div>
          <div class="adm-person-act"><a class="btn btn-soft btn-sm" href="/u/${u.id}" target="_blank">${ic('store', 16)}Витрина</a><button class="btn btn-line btn-sm" data-shop-clear="${u.id}">Очистить витрину</button></div>` : html`<div class="muted" style="font-size:14px">Витрина не заполнена.</div>`}
          <a href="/admin?status=payments" class="muted" style="font-size:13px;text-decoration:underline">Платежи и возвраты</a></div>` : ''}
        ${u.blocked ? html`<div class="banner danger"><strong>Заблокирован${u.blockedAt ? ` ${when(u.blockedAt)}` : ''}${blockedBy && blockedBy.admin ? ` · ${blockedBy.admin.name}` : ''}.</strong> ${u.blockReason || 'Причина не указана.'}</div>` : ''}
        <div class="adm-facts">${[
          ['Email', u.email], ['Телефон', u.phone || '—'], ['Город', u.city || '—'],
          ['Объявления', ['active', 'pending', 'rejected', 'sold', 'archived'].filter((k) => d.counts[k]).map((k) => `${MY_STATUS[k].toLowerCase()} ${d.counts[k]}`).join(' · ') || 'нет'],
          ['Поддержка', d.support ? `${d.support.messages} ${plural(d.support.messages, 'сообщение', 'сообщения', 'сообщений')}${d.support.waiting ? ' · ждёт ответа' : ''}` : 'не писал']
        ].map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>
        <div class="adm-person-act">
          <button class="btn btn-dark btn-sm" data-support="${u.id}">${ic('headset', 18)}Написать</button>
          <a class="btn btn-soft btn-sm" href="/u/${u.id}" target="_blank">${ic('eye', 18)}Публичный профиль</a>
          ${u.avatar ? html`<button class="btn btn-soft btn-sm" data-ava-remove="${u.id}">${ic('image', 18)}Убрать фото</button>` : ''}
          ${u.isAdmin ? '' : html`<button class="btn ${u.blocked ? 'btn-line' : 'btn-danger'} btn-sm" data-block="${u.id}" data-blocked="${u.blocked ? '1' : ''}">${ic('lock', 18)}${u.blocked ? 'Разблокировать' : 'Заблокировать'}</button>`}
        </div>
      </div>
      <div class="seg adm-seg" role="tablist">${tabs.map(([k, t], i) => html`<a role="tab" href="#" data-pane="${k}" class="${i ? '' : 'on'}" aria-selected="${i ? 'false' : 'true'}">${t}</a>`)}</div>
      <div id="pane">${panes.listings}</div>`));
    $$('[data-pane]').forEach((a) => {
      a.onclick = (e) => {
        e.preventDefault();
        $$('[data-pane]').forEach((x) => { x.classList.toggle('on', x === a); x.setAttribute('aria-selected', x === a ? 'true' : 'false'); });
        $('#pane').innerHTML = String(panes[a.dataset.pane]);
      };
    });
    const bizOk = $('[data-biz-ok]');
    if (bizOk) bizOk.onclick = async () => { try { await api('POST', `/api/admin/users/${u.id}/business`, { decision: 'approve' }); toast('Бизнес подтверждён'); render(); } catch (e) { toast(e.message, true); } };
    const bizNo = $('[data-biz-no]');
    if (bizNo) bizNo.onclick = () => reasonModal({ title: 'Отказать в подтверждении', hint: 'Причину увидит пользователь — он сможет исправить данные и отправить заявку снова.', url: `/api/admin/users/${u.id}/business`, okLabel: 'Отказать', extra: { decision: 'reject' }, reasons: ['ИНН не найден в ЕГРЮЛ/ЕГРИП', 'Название не совпадает с выпиской', 'ИП или организация прекратили деятельность', 'ОГРН не совпадает с ИНН'], placeholder: 'Что не так — для пользователя' });
    $('[data-support]').onclick = async () => {
      try { const r = await api('POST', `/api/admin/users/${u.id}/support`); go(`/admin?status=support&t=${r.thread}`); } catch (e) { toast(e.message, true); }
    };
    const sc = $('[data-shop-clear]');
    if (sc) sc.onclick = () => reasonModal({ title: 'Очистить витрину', hint: 'Уберём описание, обложку, часы, адрес и сайт. Тариф продолжит действовать. Причину увидит продавец.', url: `/api/admin/users/${u.id}/shop/clear`, okLabel: 'Очистить', reasons: ['Контакты и мессенджеры в описании', 'Оскорбительное или недостоверное содержание', 'Ссылка на подозрительный сайт', 'Чужое фото на обложке'], placeholder: 'Что не так — для продавца' });
    bindModActions(app);
  }

  // ---------- журнал действий ----------
  const LOG_TEXT = {
    approved: 'Опубликовал объявление', restored: 'Восстановил объявление', 'appeal-approved': 'Одобрил апелляцию', 'appeal-denied': 'Отказал по апелляции',
    'reports-dismissed': 'Закрыл жалобы на объявление', 'avatar-removed': 'Убрал фото профиля', 'user-blocked': 'Заблокировал пользователя', 'user-unblocked': 'Разблокировал пользователя',
    'review-published': 'Опубликовал отзыв', 'review-rejected': 'Не опубликовал отзыв', 'review-hidden': 'Скрыл отзыв по жалобе', 'review-kept': 'Оставил отзыв после жалобы',
    'review-restored': 'Вернул отзыв', 'biz-verified': 'Подтвердил бизнес', 'biz-rejected': 'Отказал в подтверждении бизнеса', 'reply-published': 'Опубликовал ответ продавца', 'reply-rejected': 'Не опубликовал ответ продавца', 'support-reply': 'Ответил в поддержке',
    'billing-settings': 'Изменил настройки оплаты', 'billing-prices': 'Изменил цены', 'payment-refund': 'Оформил возврат', 'promo-erid': 'Указал erid и запустил рекламу',
    'promo-stopped': 'Остановил продвижение', 'seo-settings': 'Изменил настройки поиска и Метрики', 'ads-settings': 'Изменил настройки рекламы', 'shop-cleared': 'Очистил витрину магазина'
  };
  const LOG_TONE = { 'promo-erid': 'ok', 'promo-stopped': 'bad', 'shop-cleared': 'bad', 'biz-verified': 'ok', 'biz-rejected': 'bad', rejected: 'bad', 'appeal-denied': 'bad', 'user-blocked': 'bad', 'review-rejected': 'bad', 'review-hidden': 'bad', 'reply-rejected': 'bad', approved: 'ok', restored: 'ok', 'appeal-approved': 'ok', 'user-unblocked': 'ok', 'review-published': 'ok', 'reply-published': 'ok', 'review-restored': 'ok' };
  function logRow(e) {
    const act = e.action === 'rejected' ? (e.data.from === 'pending' ? 'Отклонил объявление' : 'Снял с публикации') : LOG_TEXT[e.action] || e.action;
    const target = e.listing ? html`<a href="/admin/l/${e.listing.id}">«${e.listing.title}»</a>`
      : e.action.startsWith('review') || e.action.startsWith('reply') ? html`по «${e.data.title}»` : '';
    const who = e.user && !e.listing && !e.action.startsWith('review') && !e.action.startsWith('reply') ? html`<a href="/admin/u/${e.user.id}">${e.user.name}</a>` : '';
    const reason = e.data.reason || e.data.comment || e.data.text;
    return html`<div class="adm-log-row">
      <span class="adm-log-dot ${LOG_TONE[e.action] || ''}"></span>
      <div class="adm-log-body">
        <div><b>${act}</b> ${target} ${who}</div>
        ${reason ? html`<div class="adm-log-reason">${reason}</div>` : ''}
        <div class="muted adm-log-meta">${e.admin ? html`${ava(e.admin, 'sm')}${e.admin.name}` : 'модератор удалён'} · ${when(e.at)}</div>
      </div>
    </div>`;
  }

  async function renderLogAdmin(box, q) {
    const adminId = q.get('admin') || '';
    const type = q.get('type') || '';
    const url = (over) => `/admin?${new URLSearchParams(Object.entries({ status: 'log', admin: adminId, type, ...over }).filter(([, v]) => v))}`;
    let offset = 0;
    const load = () => api('GET', `/api/admin/log?${new URLSearchParams({ admin: adminId, type, offset })}`);
    const d = await load();
    const TYPES = [['', 'Все'], ['listings', 'Объявления'], ['reviews', 'Отзывы'], ['users', 'Пользователи'], ['support', 'Поддержка']];
    box.innerHTML = String(html`<div class="adm-head"><h1>Журнал действий</h1>
        <label class="sr" for="la">Модератор</label><select id="la" class="select adm-select"><option value="">Все модераторы</option>${d.admins.map((a) => html`<option value="${a.id}" ${String(a.id) === adminId ? raw('selected') : ''}>${a.name}</option>`)}</select></div>
      <div class="tabs adm-chips">${TYPES.map(([k, t]) => html`<a class="chip ${k === type ? 'active' : ''}" href="${url({ type: k })}">${t}</a>`)}</div>
      ${d.items.length ? html`<div class="adm-log panel" id="ll">${d.items.map(logRow)}</div>` : html`<div class="empty"><h3>Пока пусто</h3><p>Здесь появятся решения модераторов: кто, когда и почему.</p></div>`}
      <div class="more ${d.more ? '' : 'hidden'}"><button class="btn btn-soft btn-lg" type="button" id="lm">Показать ещё</button></div>`);
    $('#la').onchange = (e) => go(url({ admin: e.target.value }));
    const more = $('#lm');
    more.onclick = async () => {
      offset += 50;
      const n = await load();
      $('#ll').insertAdjacentHTML('beforeend', n.items.map((e) => String(logRow(e))).join(''));
      more.parentElement.classList.toggle('hidden', !n.more);
    };
  }

  // ---------- вход через Яндекс ID и VK ID ----------
  async function renderOauthAdmin(box) {
    const { providers: p } = await api('GET', '/api/admin/oauth');
    const INFO = {
      yandex: ['Яндекс ID', 'https://oauth.yandex.ru/client/new', 'Создайте приложение «Для авторизации пользователей» (веб-сервисы), права: почта, имя, телефон. В «Redirect URI» вставьте адрес ниже.', true],
      vk: ['VK ID', 'https://id.vk.ru/business/go', 'Создайте веб-приложение в кабинете VK ID, доступы: почта и телефон. Доверенный Redirect URL — адрес ниже, базовый домен — ваш сайт.', false]
    };
    box.innerHTML = String(html`<div class="adm-head"><h1>Вход через сервисы</h1></div>
      <p class="muted" style="margin:0;max-width:720px">Кнопки «Войти с Яндекс ID» и «Войти через VK ID» появятся на страницах входа и регистрации, когда вы вставите ключи. Телефон, который передал сервис, отмечается как подтверждённый — у продавца появляется значок.</p>
      <form id="oa" class="oa-grid">${Object.entries(INFO).map(([k, [name, url, hint, secret]]) => html`<section class="panel oa-card">
          <div class="oa-head"><h2 class="h2">${name}</h2><span class="pf-badge ${p[k].ready ? 'ok' : ''}">${p[k].ready ? 'подключён' : 'не подключён'}</span></div>
          <p class="muted" style="margin:0;font-size:14px">${hint} <a href="${url}" target="_blank" rel="noopener" style="text-decoration:underline">Открыть кабинет</a></p>
          <div class="field"><span class="label">Redirect URI</span><div class="oa-copy"><code>${p[k].callback}</code><button type="button" class="btn btn-soft btn-sm" data-copy="${p[k].callback}">Скопировать</button></div></div>
          <div class="field"><label for="oa-${k}-id">${k === 'vk' ? 'ID приложения' : 'ClientID'}</label><input id="oa-${k}-id" name="${k}.id" class="input" value="${p[k].id}" autocomplete="off"></div>
          ${secret ? html`<div class="field"><label for="oa-${k}-s">Client secret</label><input id="oa-${k}-s" name="${k}.secret" class="input" type="password" autocomplete="new-password" placeholder="${p[k].hasSecret ? 'сохранён — оставьте пустым, чтобы не менять' : ''}"></div>` : ''}
        </section>`)}
        <div><button class="btn btn-dark" type="submit">Сохранить</button></div>
      </form>`);
    $$('[data-copy]', box).forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Скопировано'); } catch { toast(b.dataset.copy); } }; });
    $('#oa').onsubmit = async (e) => {
      e.preventDefault();
      const body = {};
      for (const [k, v] of new FormData(e.target).entries()) { const [pr, f] = k.split('.'); (body[pr] = body[pr] || {})[f] = v.trim(); }
      try { const r = await api('PUT', '/api/admin/oauth', body); S.config.oauth = r.enabled; toast('Сохранено'); renderOauthAdmin(box); } catch (ex) { toast(ex.message, true); }
    };
  }

  // ---------- деньги: платежи, возвраты ----------
  async function renderPaymentsAdmin(box, q) {
    const f = q.get('f') || '';
    const d = await api('GET', `/api/admin/payments${f ? `?f=${f}` : ''}`);
    const FILTERS = [['', 'Все'], ['succeeded', 'Оплачены'], ['pending', 'Ждут оплаты'], ['canceled', 'Не оплачены'], ['refunded', 'С возвратом']];
    const KIND = { plan: 'Тариф', promo: 'Продвижение' };
    box.innerHTML = String(html`<div class="adm-head"><h1>Платежи</h1>${S.config.billing.ready ? '' : html`<a class="btn btn-dark btn-sm" href="/admin?status=billing">Подключить ЮKassa</a>`}</div>
      <div class="stats">${[['за сутки', d.totals.today], ['за 30 дней', d.totals.month], ['всего', d.totals.all]].map(([k, t]) => html`<div class="stat"><div class="n">${rub(t.s)}</div><div class="k">${k} · ${t.n} ${plural(t.n, 'платёж', 'платежа', 'платежей')}</div></div>`)}</div>
      <p class="muted" style="margin:-14px 0 16px;font-size:13px">Выручка — оплаченное за вычетом возвратов, без платежей тестового магазина ЮKassa.</p>
      <div class="pf-status">${FILTERS.map(([k, t]) => html`<a class="chip ${k === f ? 'active' : ''}" href="/admin?status=payments${k ? `&f=${k}` : ''}">${t}</a>`)}</div>
      ${d.items.length ? html`<div class="adm-pay">${d.items.map((p) => html`<div class="adm-pay-row">
          <a class="adm-pay-who" href="/admin/u/${p.user.id}">${ava(p.user, 'sm')}<span><b>${p.user.name}</b><small>${p.user.email}</small></span></a>
          <div class="adm-pay-what"><b>${p.title}</b><small>${KIND[p.kind]} · ${when(p.createdAt)}${p.method ? ` · ${p.method}` : ''}${p.test ? ' · тестовый' : ''}${p.error ? ` · ${CANCEL_REASON[p.error] || p.error}` : ''}</small>
            ${p.refunds.map((r) => html`<small class="adm-pay-ref">Возврат ${rub(r.amount)} · ${when(r.at)} · ${r.reason}</small>`)}</div>
          <span class="pay-amt">${rub(p.amount)}</span>
          <span class="ml-tag ${(PAY_STATUS[p.status] || PAY_STATUS.error)[0]}"><i></i>${(PAY_STATUS[p.status] || PAY_STATUS.error)[1]}</span>
          <div class="adm-pay-act">${p.status === 'succeeded' && p.refunded < p.amount ? html`<button class="btn btn-line btn-sm" data-refund="${p.id}">Вернуть</button>` : ''}${p.status === 'pending' ? html`<button class="btn btn-soft btn-sm" data-sync="${p.id}">Проверить</button>` : ''}</div>
        </div>`)}</div>` : html`<div class="empty"><h3>Платежей нет</h3><p>${f ? 'В этом разделе пусто.' : 'Здесь появятся оплаты тарифов и продвижения.'}</p></div>`}`);
    const byId = Object.fromEntries(d.items.map((p) => [p.id, p]));
    $$('[data-sync]', box).forEach((b) => { b.onclick = async () => { try { await api('POST', `/api/admin/payments/${b.dataset.sync}/sync`); toast('Проверили в ЮKassa'); render(); } catch (e) { toast(e.message, true); } }; });
    $$('[data-refund]', box).forEach((b) => {
      b.onclick = () => {
        const p = byId[b.dataset.refund];
        const left = p.amount - p.refunded;
        openModal(String(html`<h2>Возврат</h2><p class="muted" style="margin:0 0 14px">${p.title} · ${p.user.name} · оплачено ${rub(p.amount)}${p.refunded ? `, уже возвращено ${rub(p.refunded)}` : ''}</p>
          <div class="field"><label for="rf-a">Сумма, ₽</label><input id="rf-a" class="input" inputmode="numeric" value="${left}"><span class="help">До ${rub(left)}. За неиспользованные дни: стоимость ÷ дни × оставшиеся полные дни.</span></div>
          <div class="reasons" style="margin-top:12px">${['Неиспользованные дни', 'Продвижение остановлено модератором', 'Ошибочная оплата', 'Технический сбой'].map((r) => html`<button type="button" class="chip" data-r="${r}">${r}</button>`)}</div>
          <label class="sr" for="rf-r">Причина</label><textarea id="rf-r" class="textarea" style="margin-top:12px;min-height:90px" maxlength="250" placeholder="Причина — её увидит покупатель в письме"></textarea>
          <label class="switch" style="margin-top:12px"><span>Завершить услугу<small>${p.kind === 'plan' ? 'Тариф закончится сейчас' : 'Продвижение остановится'}</small></span><input type="checkbox" id="rf-stop" checked><span class="track"></span></label>
          <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-danger" data-ok>Вернуть деньги</button></div>`), (m, close) => {
          $('[data-x]', m).onclick = close;
          $$('[data-r]', m).forEach((c) => { c.onclick = () => { $('#rf-r', m).value = c.dataset.r; }; });
          $('[data-ok]', m).onclick = async (e) => {
            e.currentTarget.disabled = true;
            try { await api('POST', `/api/admin/payments/${p.id}/refund`, { amount: parseInt($('#rf-a', m).value.replace(/\s/g, ''), 10), reason: $('#rf-r', m).value.trim(), stop: $('#rf-stop', m).checked }); close(); toast('Возврат оформлен'); render(); } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; }
          };
        });
      };
    });
  }

  // ---------- реклама: маркировка erid, идущие, завершённые ----------
  async function renderAdsAdmin(box, tab) {
    const d = await api('GET', `/api/admin/ads?tab=${tab}`);
    const TABS = [['marking', 'Ждут маркировки'], ['active', 'Идут'], ['ended', 'Завершены']];
    const copy = (v) => html`<button type="button" class="copy-v" data-copy="${v}" title="Скопировать">${v}</button>`;
    box.innerHTML = String(html`<div class="adm-head"><h1>Реклама</h1><a class="btn btn-soft btn-sm" href="/api/admin/ads.csv" download>${ic('download', 16, 2)}Отчёт для ОРД</a></div>
      <div class="panel ads-help">
        <label class="switch"><span>Показывать только с токеном erid<small>Оплаченное продвижение ждёт токена здесь; срок начинается с запуска. Выключите, только если юрист подтвердил, что маркировка не нужна.</small></span><input type="checkbox" id="req-erid" ${d.requireErid ? raw('checked') : ''}><span class="track"></span></label>
        <details><summary>${ic('info', 16, 2)}Как получить erid</summary><ol>
          <li>В личном кабинете ОРД (например, ОРД VK или Яндекса) зарегистрируйте договор с рекламодателем — название и ИНН ниже.</li>
          <li>Добавьте креатив: объект рекламирования — ссылка на объявление, текст — название объявления, период — срок продвижения.</li>
          <li>ОРД выдаст токен erid — вставьте его в поле и нажмите «Запустить». Продавцу придёт письмо, показ начнётся сразу.</li>
          <li>Раз в месяц передавайте в ОРД показы — они в «Отчёте для ОРД».</li></ol></details>
      </div>
      <div class="seg adm-seg" role="tablist">${TABS.map(([k, t]) => html`<a role="tab" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab ? 'true' : 'false'}" href="/admin?status=ads&tab=${k}">${t} · ${d.counts[k]}</a>`)}</div>
      ${d.items.length ? html`<div class="adm-ads">${d.items.map((a) => html`<div class="adm-ad">
          <a class="my-img" href="${a.listingId ? `/admin/l/${a.listingId}` : '#'}">${a.photo ? html`<img src="${a.photo}" alt="" loading="lazy">` : svg(P.image, 24, 1.3)}</a>
          <div class="adm-ad-body">
            <div class="adm-ad-head"><span class="ml-tag ${PROMO_STATUS[a.status][0]}"><i></i>${PROMO_STATUS[a.status][1]}</span>${a.listingStatus !== 'active' && a.status === 'active' ? html`<span class="ml-tag off"><i></i>объявление не в поиске</span>` : ''}</div>
            <a class="t" href="${a.listingId ? `/l/${a.listingId}` : '#'}" target="_blank">${a.title}</a>
            <div class="adm-facts">
              <div><span>Рекламодатель</span><b>${copy(a.advertiser)}</b></div><div><span>ИНН</span><b>${copy(a.inn || '—')}</b></div>
              <div><span>Объект</span><b>${a.listingId ? copy(`${location.origin}/l/${a.listingId}`) : 'удалено'}</b></div>
              <div><span>Срок и сумма</span><b>${a.days} ${plural(a.days, 'день', 'дня', 'дней')} · ${rub(a.price)}</b></div>
              ${a.startsAt ? html`<div><span>Период</span><b>${dateShort(a.startsAt)} — ${dateShort(a.endsAt)}</b></div><div><span>Показы / переходы</span><b>${NF.format(a.shows)} / ${NF.format(a.clicks)}</b></div>` : ''}
            </div>
            ${a.note ? html`<div class="muted" style="font-size:14px">${a.note}</div>` : ''}
            ${['marking', 'active'].includes(a.status) ? html`<form class="erid-form" data-erid="${a.id}"><label class="sr" for="erid-${a.id}">Токен erid</label><input id="erid-${a.id}" name="erid" class="input" value="${a.erid}" placeholder="erid из ОРД, например 2SDnjc7Jh3Q" autocomplete="off">
              <button class="btn ${a.status === 'marking' ? 'btn-accent' : 'btn-soft'} btn-sm" type="submit">${a.status === 'marking' ? 'Запустить' : 'Сохранить'}</button>
              <button type="button" class="btn btn-line btn-sm" data-stop="${a.id}">Остановить</button></form>` : a.erid ? html`<div class="muted" style="font-size:14px">erid: ${a.erid}</div>` : ''}
            <div class="muted adm-log-meta"><a href="/admin/u/${a.user.id}">${a.user.name}</a> · ${a.user.email} · оплачено ${when(a.createdAt)}</div>
          </div></div>`)}</div>` : html`<div class="empty"><h3>${tab === 'marking' ? 'Маркировки никто не ждёт' : 'Здесь пусто'}</h3><p>${tab === 'marking' ? 'Оплаченное продвижение появится здесь, если для показа нужен токен erid.' : 'Нет продвижений в этом разделе.'}</p></div>`}`);
    $$('[data-copy]', box).forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Скопировано'); } catch { toast(b.dataset.copy); } }; });
    $('#req-erid', box).onchange = async (e) => { try { await api('PUT', '/api/admin/ads/settings', { requireErid: e.target.checked }); toast(e.target.checked ? 'Показ только с erid' : 'Продвижение запускается сразу после оплаты'); } catch (ex) { e.target.checked = !e.target.checked; toast(ex.message, true); } };
    $$('[data-erid]', box).forEach((f) => {
      f.onsubmit = async (e) => { e.preventDefault(); try { await api('POST', `/api/admin/ads/${f.dataset.erid}/erid`, { erid: f.erid.value }); toast(tab === 'marking' ? 'Запущено — продавцу отправлено письмо' : 'Токен сохранён'); render(); } catch (ex) { toast(ex.message, true); } };
    });
    $$('[data-stop]', box).forEach((b) => {
      b.onclick = () => reasonModal({ title: 'Остановить продвижение', hint: 'Причину увидит продавец. Вернуть деньги за оставшиеся дни можно в «Платежах».', url: `/api/admin/ads/${b.dataset.stop}/stop`, okLabel: 'Остановить', reasons: ['Объявление нарушает правила', 'Рекламодатель попросил остановить', 'Нельзя рекламировать этот товар'], placeholder: 'Причина для продавца' });
    });
  }

  // ---------- метки на фото (продвижение в ленте) ----------
  // Метка должна быть правдой: «С чеком» — чек на фото, «Есть гарантия» — сказано в описании. Не одобрили — деньги за метки вернутся сами.
  async function renderBoostTagsAdmin(box) {
    const { items } = await api('GET', '/api/admin/boost-tags');
    box.innerHTML = String(html`<div class="adm-head"><h1>Метки на фото</h1></div>
      ${items.length ? html`<div class="bt-list">${items.map((b) => html`<article class="bt-item">
        <div class="bt-photos">${b.photos.length ? b.photos.slice(0, 6).map((src) => html`<a href="${src}" target="_blank"><img src="${src}" alt="" loading="lazy"></a>`) : html`<span class="bt-none">${svg(P.image, 24, 1.3)}</span>`}</div>
        <div class="bt-body">
          <div class="bt-tags">${b.tags.map((t) => html`<span class="b-tag">${t}</span>`)}</div>
          <a class="t" href="${b.listingId ? `/admin/l/${b.listingId}` : '#'}">${b.title}</a>
          ${b.description ? html`<p class="bt-desc">${b.description.slice(0, 400)}</p>` : ''}
          <div class="muted adm-log-meta"><a href="/admin/u/${b.user.id}">${b.user.name}</a> · ${b.status === 'waiting' ? 'ждёт публикации' : 'продвигается'} · оплачено ${when(b.createdAt)} · за метки ${rub(b.tagsPrice)}</div>
          <div class="bt-act"><button class="btn btn-accent btn-sm" data-tag-ok="${b.id}">${ic('check', 16, 2.4)}Одобрить</button><button class="btn btn-line btn-sm" data-tag-no="${b.id}">Отклонить и вернуть ${rub(b.tagsPrice)}</button></div>
        </div></article>`)}</div>`
    : html`<div class="empty"><h3>Все метки проверены</h3><p>Здесь появятся метки на фото, которые продавцы выбрали при продвижении.</p></div>`}`);
    $$('[data-tag-ok]', box).forEach((b) => { b.onclick = async () => { b.disabled = true; try { await api('POST', `/api/admin/boosts/${b.dataset.tagOk}/tags`, { ok: true }); toast('Метки включены'); render(); } catch (e) { b.disabled = false; toast(e.message, true); } }; });
    $$('[data-tag-no]', box).forEach((b) => {
      b.onclick = () => reasonModal({ title: 'Отклонить метки', hint: 'Причину увидит продавец. Деньги за метки вернутся автоматически, остальное продвижение продолжится.', url: `/api/admin/boosts/${b.dataset.tagNo}/tags`, extra: { ok: false }, okLabel: 'Отклонить',
        reasons: ['Чека нет на фото', 'В описании нет гарантии', 'Метка не соответствует товару', 'Товар не новый'], placeholder: 'Причина для продавца' });
    });
  }

  // ---------- оплата: подключение ЮKassa и цены ----------
  async function renderBillingAdmin(box) {
    const d = await api('GET', '/api/admin/billing');
    const c = d.config; const pr = d.prices;
    const opt = (map, cur) => Object.entries(map).map(([k, t]) => html`<option value="${k}" ${String(cur) === k ? raw('selected') : ''}>${t}</option>`);
    const priceIn = (name, v, label) => html`<label class="price-in"><span>${label}</span><input class="input" name="${name}" inputmode="numeric" value="${v}"><em>₽</em></label>`;
    box.innerHTML = String(html`<div class="adm-head"><h1>Оплата и цены</h1><span class="pf-badge ${c.ready ? 'ok' : ''}">${c.ready ? (c.test ? 'тестовый магазин' : 'ЮKassa подключена') : 'не подключена'}</span></div>
      <div class="mail-grid">
        <form class="panel settings" id="yk" style="max-width:none">
          <h2 class="h2" style="margin:0">ЮKassa</h2>
          <p class="muted" style="margin:0;font-size:14px">Отдельный магазин для torgana.ru в вашем кабинете ЮKassa (можно в том же договоре, что и у ALBAKOV). Ключи — в «Интеграция → Ключи API».</p>
          <div class="row stack-m"><div class="field" style="flex:1"><label for="yk-id">shopId</label><input id="yk-id" name="shopId" class="input" inputmode="numeric" value="${c.shopId}" autocomplete="off"></div>
            <div class="field" style="flex:2"><label for="yk-s">Секретный ключ</label><input id="yk-s" name="secret" type="password" class="input" autocomplete="new-password" placeholder="${c.hasSecret ? 'сохранён — оставьте пустым, чтобы не менять' : 'live_… или test_…'}"></div></div>
          <div class="field"><span class="label">Адрес для HTTP-уведомлений</span><div class="oa-copy"><code>${c.webhook}</code><button type="button" class="btn btn-soft btn-sm" data-copy="${c.webhook}">Скопировать</button></div>
            <span class="help">В ЮKassa: «Интеграция → HTTP-уведомления», события payment.succeeded и payment.canceled. Без уведомлений тоже работает — сайт проверяет платёж, когда человек возвращается с оплаты.</span></div>
          <label class="switch"><span>Отправлять чеки через ЮKassa<small>«Чеки от ЮKassa» или ваша онлайн-касса, подключённая к магазину (54-ФЗ)</small></span><input type="checkbox" name="receipts" ${c.receipts ? raw('checked') : ''}><span class="track"></span></label>
          <div class="row stack-m"><div class="field" style="flex:1"><label for="yk-vat">НДС в чеке</label><select id="yk-vat" name="vat" class="select">${opt(d.vat, c.vat)}</select></div>
            <div class="field" style="flex:1"><label for="yk-mode">Признак расчёта</label><select id="yk-mode" name="mode" class="select">${opt(d.modes, c.mode)}</select></div></div>
          <div class="field"><label for="yk-tax">Система налогообложения в чеке</label><select id="yk-tax" name="tax" class="select">${opt(d.tax, c.tax)}</select><span class="help">Нужна, только если у кассы несколько систем. Ставку НДС и систему налогообложения уточните у бухгалтера.</span></div>
          <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить</button>${c.ready ? html`<button type="button" class="btn btn-line" data-yk-off>Отключить</button>` : ''}</div>
        </form>
        <form class="panel settings" id="prices" style="max-width:none">
          <h2 class="h2" style="margin:0">Цены</h2>
          <p class="muted" style="margin:0;font-size:14px">Новые цены сразу видны на странице «Для бизнеса»; уже оплаченное не меняется.</p>
          <h3 class="set-h3">${ic('store', 18, 2)}«Магазин»</h3><div class="price-row">${[1, 3, 12].map((m) => priceIn(`shop.${m}`, pr.shop[m], `${m} мес.`))}</div>
          <h3 class="set-h3">${ic('store', 18, 2)}«Магазин Про»</h3><div class="price-row">${[1, 3, 12].map((m) => priceIn(`pro.${m}`, pr.pro[m], `${m} мес.`))}</div>
          <h3 class="set-h3">${ic('bolt', 18, 2)}Продвижение в ленте · 7 дней</h3><div class="price-row">${[['xl', 'XL'], ['frame', 'Рамка'], ['tags', 'Метки'], ['all', 'Всё в одном']].map(([k, t]) => priceIn(`boost.${k}`, pr.boost[k], t))}</div>
          <h3 class="set-h3">${ic('megaphone', 18, 2)}Реклама над поиском</h3><div class="price-row">${[3, 7, 30].map((dd) => priceIn(`promo.${dd}`, pr.promo[dd], `${dd} ${plural(dd, 'день', 'дня', 'дней')}`))}</div>
          <div class="field"><label for="pd">Скидка на продвижение для «Магазин Про», %</label><input id="pd" name="proDiscount" class="input" inputmode="numeric" value="${pr.proDiscount}"></div>
          <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить цены</button><button type="button" class="btn btn-soft" data-defaults>Цены по умолчанию</button></div>
        </form>
      </div>`);
    $$('[data-copy]', box).forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Скопировано'); } catch { toast(b.dataset.copy); } }; });
    const after = async (msg) => { S.config = await api('GET', '/api/config'); toast(msg); render(); };
    $('#yk', box).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try { await api('PUT', '/api/admin/billing', { config: { shopId: f.shopId.value, secret: f.secret.value, receipts: f.receipts.checked, vat: f.vat.value, mode: f.mode.value, tax: f.tax.value } }); await after('Сохранено. Проверьте оплату тестовым магазином или на 1 ₽.'); } catch (ex) { toast(ex.message, true); }
    };
    const off = $('[data-yk-off]', box);
    if (off) off.onclick = async () => { if (!(await confirmModal('Отключить оплату?', 'Кнопки оплаты пропадут с сайта. Уже оплаченные тарифы и продвижение продолжат работать.', 'Отключить', true))) return; try { await api('PUT', '/api/admin/billing', { config: { clear: true } }); await after('Оплата отключена'); } catch (ex) { toast(ex.message, true); } };
    const collect = (f) => { const b = { shop: {}, pro: {}, promo: {}, boost: {} }; for (const [k, v] of new FormData(f).entries()) { const [g, n] = k.split('.'); if (n) b[g][n] = v; else b[g] = parseInt(v, 10); } return b; };
    $('#prices', box).onsubmit = async (e) => { e.preventDefault(); try { await api('PUT', '/api/admin/billing', { prices: collect(e.target) }); await after('Цены сохранены'); } catch (ex) { toast(ex.message, true); } };
    $('[data-defaults]', box).onclick = async () => { try { await api('PUT', '/api/admin/billing', { prices: d.defaults }); await after('Вернули цены по умолчанию'); } catch (ex) { toast(ex.message, true); } };
  }

  // ---------- поиск и статистика: Вебмастер, Search Console, Метрика ----------
  async function renderSeoAdmin(box) {
    const d = await api('GET', '/api/admin/seo');
    const s = d.seo;
    const step = (n, t, body) => html`<li><span class="seo-n">${n}</span><div><b>${t}</b><p>${body}</p></div></li>`;
    box.innerHTML = String(html`<div class="adm-head"><h1>Поиск и статистика</h1></div>
      <div class="mail-grid">
        <form class="panel settings" id="seo-f" style="max-width:none">
          <h2 class="h2" style="margin:0">Подключение</h2>
          <div class="field"><label for="sy">Яндекс.Вебмастер — код подтверждения</label><input id="sy" name="yandex" class="input" value="${s.yandex}" placeholder="например 1a2b3c4d5e6f7a8b" autocomplete="off"><span class="help">Можно вставить весь тег &lt;meta name="yandex-verification" …&gt; — возьмём код сами.</span></div>
          <div class="field"><label for="sg">Google Search Console — код подтверждения</label><input id="sg" name="google" class="input" value="${s.google}" placeholder="необязательно" autocomplete="off"></div>
          <div class="field"><label for="sm">Яндекс.Метрика — номер счётчика</label><input id="sm" name="metrika" class="input" inputmode="numeric" value="${s.metrika}" placeholder="например 98765432" autocomplete="off"><span class="help">Счётчик включается только у тех, кто нажал «Хорошо» в плашке cookie. Вебвизор выключен.</span></div>
          <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить</button></div>
        </form>
        <section class="panel settings" style="max-width:none">
          <h2 class="h2" style="margin:0">Как подключить</h2>
          <ol class="seo-steps">
            ${step(1, 'Вебмастер', html`На <a href="https://webmaster.yandex.ru" target="_blank" rel="noopener" style="text-decoration:underline">webmaster.yandex.ru</a> добавьте сайт https://torgana.ru → способ «Мета-тег» → скопируйте код сюда и сохраните → нажмите «Проверить» в Вебмастере.`)}
            ${step(2, 'Карта сайта', html`В Вебмастере: «Индексирование → Файлы Sitemap» → добавьте <code>${d.sitemap}</code>. Она обновляется сама.`)}
            ${step(3, 'Метрика', html`На <a href="https://metrika.yandex.ru" target="_blank" rel="noopener" style="text-decoration:underline">metrika.yandex.ru</a> создайте счётчик для torgana.ru без Вебвизора → номер счётчика — сюда.`)}
            ${step(4, 'Google', 'По желанию: Search Console → «Тег HTML» → код сюда, затем добавьте ту же карту сайта.')}
          </ol>
          <div class="oa-copy"><code>${d.robots}</code><a class="btn btn-soft btn-sm" href="${d.robots}" target="_blank" rel="noopener">Открыть</a></div>
        </section>
      </div>`);
    $('#seo-f', box).onsubmit = async (e) => {
      e.preventDefault();
      try { await api('PUT', '/api/admin/seo', Object.fromEntries(new FormData(e.target).entries())); S.config = await api('GET', '/api/config'); toast('Сохранено'); render(); } catch (ex) { toast(ex.message, true); }
    };
  }

  // ---------- копии в облако, состояние сервера, устройства модератора ----------
  const fmtBytes = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} ГБ` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
  async function renderBackupAdmin(box) {
    const [d, dev] = await Promise.all([api('GET', '/api/admin/backup'), api('GET', '/api/admin/devices')]);
    const c = d.config;
    const sv = d.server;
    const owner = S.user.isOwner || !sv.owner;
    const L = d.last;
    const lastLine = d.running ? html`<div class="bk-state run"><span class="bk-dot"></span><div><b>Делаем копию…</b><span>${d.running.step || 'база'} · начали ${hm(d.running.at)}</span></div></div>`
      : L ? (L.ok ? html`<div class="bk-state ok">${ic('check', 20, 2.4)}<div><b>Последняя копия — ${when(L.at)}</b><span>база ${fmtBytes(L.dbSize)} · ${L.files ? `новых фото и видео: ${NF.format(L.files)} (${fmtBytes(L.bytes)})` : 'новых фото не было'} · ${L.seconds} с</span></div></div>`
        : html`<div class="bk-state bad">${ic('warn', 20, 2)}<div><b>Копия не сделана — ${when(L.at)}</b><span>${L.error}</span></div></div>`)
        : html`<div class="bk-state">${ic('clock', 20, 2)}<div><b>Копий в облаке ещё не было</b><span>${d.ready ? 'Первая — сегодня ночью или по кнопке «Сделать копию сейчас»' : 'Укажите хранилище слева'}</span></div></div>`;
    const V = d.verify;
    const verifyLine = V ? html`<div class="bk-state ${V.ok ? 'ok' : 'bad'}">${ic(V.ok ? 'shield' : 'warn', 20, 2)}<div><b>${V.ok ? 'Копия проверена' : 'Проверка нашла расхождения'} — ${when(V.at)}</b>
        <span>копия от ${when(V.made)} (${fmtBytes(V.size)}), всего копий базы: ${V.copies}. В копии: ${NF.format(V.copy.users)} польз., ${NF.format(V.copy.listings)} объявл., ${NF.format(V.copy.messages)} сообщ.; на сайте сейчас: ${NF.format(V.live.users)}, ${NF.format(V.live.listings)}, ${NF.format(V.live.messages)}. Фото: проверено ${V.photos.ok} из ${V.photos.checked}, в облаке ${NF.format(V.photos.total)}.</span></div></div>` : '';
    const disk = sv.disk ? Math.round((1 - sv.disk.free / sv.disk.total) * 100) : null;
    box.innerHTML = String(html`<div class="adm-head"><h1>Копии и безопасность</h1></div>
      <div class="mail-grid">
        <form class="panel settings" id="bk-f" style="max-width:none">
          <div><h2 class="h2" style="margin:0">Копия в облако Selectel</h2>
            <p class="muted" style="margin:6px 0 0;font-size:14px">Каждую ночь с 3:00 до 6:00 по Москве база (сжатая, хранится 30 дней) и новые фото и видео уходят в объектное хранилище. Даже если сервер сломается целиком, всё восстановится из облака.</p></div>
          <div class="field"><label for="bk-e">Адрес хранилища (S3)</label><input id="bk-e" name="endpoint" class="input" value="${c.endpoint}" placeholder="s3.ru-1.storage.selcloud.ru" autocomplete="off" ${owner ? '' : raw('disabled')}></div>
          <div class="row2"><div class="field"><label for="bk-b">Контейнер</label><input id="bk-b" name="bucket" class="input" value="${c.bucket}" placeholder="torgana-backup" autocomplete="off" ${owner ? '' : raw('disabled')}></div>
            <div class="field"><label for="bk-r">Регион</label><input id="bk-r" name="region" class="input" value="${c.region}" placeholder="ru-1" autocomplete="off" ${owner ? '' : raw('disabled')}></div></div>
          <div class="field"><label for="bk-a">Access key</label><input id="bk-a" name="accessKey" class="input" value="${c.accessKey}" autocomplete="off" spellcheck="false" ${owner ? '' : raw('disabled')}></div>
          <div class="field"><label for="bk-s">Secret key</label><input id="bk-s" name="secretKey" class="input" type="password" autocomplete="new-password" placeholder="${c.hasSecret ? 'сохранён — оставьте пустым, чтобы не менять' : ''}" ${owner ? '' : raw('disabled')}></div>
          <div class="field"><label for="bk-p">Папка в контейнере</label><input id="bk-p" name="prefix" class="input" value="${c.prefix}" placeholder="torgana" autocomplete="off" ${owner ? '' : raw('disabled')}><span class="help">При сохранении проверим доступ: запишем и удалим маленький файл.</span></div>
          ${owner ? html`<div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить и проверить</button>${d.ready ? html`<button type="button" class="btn btn-line" data-bk-clear>Отключить</button>` : ''}</div>` : html`<p class="muted" style="margin:0;font-size:13px">Ключи хранилища меняет только владелец сайта.</p>`}
        </form>
        <section class="panel settings" style="max-width:none">
          <h2 class="h2" style="margin:0">Состояние копий</h2>
          ${lastLine}
          ${verifyLine}
          <div class="set-btns"><button type="button" class="btn btn-accent" data-bk-run ${d.ready && !d.running ? '' : raw('disabled')}>${ic('refresh', 18, 2)}Сделать копию сейчас</button>
            <button type="button" class="btn btn-soft" data-bk-verify ${d.ready && d.lastOk ? '' : raw('disabled')}>${ic('shield', 18, 2)}Проверить копию</button></div>
          <p class="muted" style="margin:0;font-size:13px">«Проверить копию» скачивает последнюю копию базы из облака, проверяет её целостность, сравнивает с сайтом и сверяет несколько фото. В облаке уже ${NF.format(d.uploaded.n)} фото и видео (${fmtBytes(d.uploaded.b)}).</p>
          <details class="bk-how"><summary>Как получить ключи в Selectel</summary><ol>
            <li>Панель Selectel → «Объектное хранилище» → создайте <b>приватный</b> контейнер, например <code>torgana-backup</code>.</li>
            <li>«Управление доступом» → «Сервисные пользователи» → добавьте пользователя с ролью «Пользователь объектного хранилища» для этого проекта.</li>
            <li>У пользователя → «S3-ключи» → «Добавить ключ»: Access key и Secret key — сюда.</li>
            <li>Адрес и регион — в настройках контейнера (например, <code>s3.ru-1.storage.selcloud.ru</code>, регион <code>ru-1</code>).</li></ol></details>
        </section>
      </div>
      <div class="mail-grid" style="margin-top:20px">
        <section class="panel settings" style="max-width:none">
          <h2 class="h2" style="margin:0">Сервер</h2>
          <div class="kv">
            <span>Свободно на диске</span><b class="${disk !== null && disk > 90 ? 'danger-t' : ''}">${sv.disk ? `${fmtBytes(sv.disk.free)} из ${fmtBytes(sv.disk.total)} (занято ${disk}%)` : '—'}</b>
            <span>Копия на самом сервере</span><b>${sv.localBackup ? when(sv.localBackup) : 'нет данных'}</b>
            <span>Ошибок за час / сутки</span><b class="${sv.errorsHour >= 5 ? 'warn-t' : ''}">${sv.errorsHour} / ${sv.errorsDay}</b>
            <span>Письма о сбоях</span><b>${sv.mail ? sv.owner || 'первому модератору' : 'почта не подключена'}</b>
          </div>
          ${sv.lastErrors.length ? html`<ul class="bk-errs">${sv.lastErrors.map((e) => html`<li><span>${hm(e.at)}</span>${e.msg}</li>`)}</ul>` : ''}
          <p class="muted" style="margin:0;font-size:13px">Сервер пишет владельцу, если копия не сделана, на диске меньше 2 ГБ, копия на сервере старше суток или за 10 минут больше 10 ошибок. Доступность сайта снаружи каждые 5 минут проверяет GitHub — при падении придёт письмо от GitHub.</p>
        </section>
        <section class="panel settings" style="max-width:none">
          <h2 class="h2" style="margin:0">Мои устройства</h2>
          <p class="muted" style="margin:0;font-size:14px">Когда защита включена, модерация открывается только на подтверждённых устройствах: на новом — код из письма. Устройство помним 30 дней. Включается защита первым подтверждённым кодом — так никто не окажется заперт, если письма не доходят.</p>
          ${dev.items.length ? html`<div class="bk-devs">${dev.items.map((x) => html`<div class="bk-dev"><span class="bk-dev-ic">${ic(/iPhone|Android/.test(x.label) ? 'chat' : 'eye', 18, 2)}</span>
              <span class="bk-dev-t"><b>${x.label}${x.current ? html` <span class="tag accent">это устройство</span>` : ''}</b><span>${x.ip ? `IP ${x.ip} · ` : ''}заходили ${when(x.lastAt)} · до ${dateShort(x.until)}</span></span>
              <button type="button" class="btn btn-line btn-sm" data-dev-rm="${x.id}">${x.current ? 'Выйти' : 'Забыть'}</button></div>`)}</div>`
    : html`<div class="qr-empty">${S.config.mail ? 'Подтверждённых устройств нет.' : 'Почта не подключена — коды не отправить, поэтому модерация пока открывается без кода.'}</div>`}
        </section>
      </div>`);
    const f = $('#bk-f', box);
    if (owner) {
      f.onsubmit = async (e) => {
        e.preventDefault();
        const b = $('button[type=submit]', f); b.disabled = true; b.textContent = 'Проверяем доступ…';
        try { await api('PUT', '/api/admin/backup', Object.fromEntries(new FormData(f).entries())); toast('Хранилище подключено — доступ проверен'); renderBackupAdmin(box); } catch (ex) { toast(ex.message, true); b.disabled = false; b.textContent = 'Сохранить и проверить'; }
      };
      const cl = $('[data-bk-clear]', box);
      if (cl) cl.onclick = async () => { if (!(await confirmModal('Отключить копию в облако?', 'Новые копии перестанут уходить в хранилище. Уже сделанные останутся в Selectel.', 'Отключить', true))) return; try { await api('PUT', '/api/admin/backup', { clear: true }); toast('Отключено'); renderBackupAdmin(box); } catch (ex) { toast(ex.message, true); } };
    }
    const run = $('[data-bk-run]', box);
    run.onclick = async () => {
      run.disabled = true;
      try {
        await api('POST', '/api/admin/backup/run');
        toast('Копия началась — это займёт от минуты до нескольких');
        const poll = async () => { if (!box.isConnected) return; const x = await api('GET', '/api/admin/backup'); if (x.running) setTimeout(poll, 3000); else { renderBackupAdmin(box); toast(x.last && x.last.ok ? 'Копия готова' : 'Копия не сделана — подробности на странице', !(x.last && x.last.ok)); } };
        setTimeout(poll, 1500);
        renderBackupAdmin(box);
      } catch (ex) { toast(ex.message, true); run.disabled = false; }
    };
    if (d.running) setTimeout(async () => { if (box.isConnected && $('[data-bk-run]', box)) renderBackupAdmin(box); }, 4000);
    const ver = $('[data-bk-verify]', box);
    ver.onclick = async () => {
      ver.disabled = true; ver.textContent = 'Скачиваем и проверяем…';
      try { const r = await api('POST', '/api/admin/backup/verify'); toast(r.verify.ok ? 'Копия в порядке' : 'Проверка нашла расхождения', !r.verify.ok); renderBackupAdmin(box); } catch (ex) { toast(ex.message, true); renderBackupAdmin(box); }
    };
    $$('[data-dev-rm]', box).forEach((b) => {
      b.onclick = async () => { try { await api('DELETE', `/api/admin/devices/${b.dataset.devRm}`); toast('Устройство забыто'); render(); } catch (ex) { toast(ex.message, true); } };
    });
  }

  // Модерация с нового устройства: код из письма (lib/ops.js). Ниже кода — что стало с письмом:
  // принято почтовым сервисом (тогда искать в «Спаме») или не ушло (с текстом ошибки).
  async function viewDevice() {
    setTitle('Вход в модерацию');
    const st = await api('GET', '/api/admin/device').catch(() => ({}));
    if (st.confirmed || (st.trusted && st.armed)) { if (location.pathname === '/admin/device') go('/admin', true); else render(); return; }
    const arming = !st.armed; // защита ещё не включена — человек включает её сам
    authPage(arming ? 'Защита модерации' : 'Вход в модерацию', arming
      ? `Пришлём код на ${st.email || 'вашу почту'}. Когда введёте его, модерация на новых устройствах будет открываться только по коду из письма — даже если кто-то узнает пароль. Это устройство запомним на 30 дней.`
      : `Это устройство мы видим впервые. Чтобы модерацию не открыл никто, кроме вас, — даже зная пароль, — пришлём код на ${st.email || 'вашу почту'}. Устройство запомним на 30 дней.`,
      html`<div id="dev-code"><button type="button" class="btn btn-dark btn-lg btn-block" data-dev-send>${ic('mail', 18, 2)}Отправить код</button></div><div id="dev-mail" class="dev-mail" aria-live="polite"></div>`,
      html`<p class="alt"><a href="/">На главную</a></p>`);
    let timer = null;
    const paint = (x) => {
      const box = $('#dev-mail');
      if (!box || !x) return;
      const L = x.letter;
      if (x.armed && x.trusted && !x.confirmed) { clearTimeout(timer); toast('Почта сейчас не работает — модерация открыта без кода. Почините её в разделе «Почта»', true); render(); return; }
      box.innerHTML = String(!L ? '' : L.status === 'sent'
        ? html`<div class="bk-state ok">${ic('check', 20, 2.4)}<div><b>Письмо отправлено в ${hm(L.sentAt)}</b><span>Почтовый сервис его принял. Если письма нет пару минут — посмотрите «Спам» и «Рассылки», найдите «код для входа в модерацию».</span></div></div>`
        : L.error
          ? html`<div class="bk-state bad">${ic('warn', 20, 2)}<div><b>${L.status === 'failed' ? 'Письмо не отправлено' : `Письмо пока не ушло — пробуем ещё раз (попытка ${L.attempts})`}</b><span>Ответ почтового сервиса: ${L.error}</span></div></div>`
          : html`<div class="bk-state run"><span class="bk-dot"></span><div><b>Отправляем письмо…</b><span>Обычно это несколько секунд.</span></div></div>`);
      clearTimeout(timer);
      if (L && L.status === 'pending' && box.isConnected) timer = setTimeout(async () => paint(await api('GET', '/api/admin/device').catch(() => null)), 2500);
    };
    cleanup = () => clearTimeout(timer);
    const watch = async () => paint(await api('GET', '/api/admin/device').catch(() => null));
    const startCode = (r) => codeForm($('#dev-code'), {
      email: r.email || st.email, wait: r.wait || 60,
      send: async () => { const x = await api('POST', '/api/admin/device/send'); setTimeout(watch, 800); return x; },
      check: async (code) => { await api('POST', '/api/admin/device/verify', { code }); toast(arming ? 'Защита включена — это устройство подтверждено на 30 дней' : 'Устройство подтверждено на 30 дней'); if (location.pathname === '/admin/device') go('/admin?status=backup', true); else render(); }
    });
    if (st.letter && st.letter.createdAt > Date.now() - 15 * 60 * 1000) { startCode({ email: st.email, wait: Math.max(0, 60 - Math.round((Date.now() - st.letter.createdAt) / 1000)) }); paint(st); return; }
    $('[data-dev-send]').onclick = async (e) => {
      e.currentTarget.disabled = true;
      try { const r = await api('POST', '/api/admin/device/send'); startCode(r); setTimeout(watch, 800); } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; }
    };
  }

  // ---------- мои уведомления ----------
  async function renderNotifyAdmin(box) {
    const cur = await api('GET', '/api/admin/me/notify');
    const MODES = [['instant', 'Сразу', 'Одним письмом в течение минуты после нового'], ['hourly', 'Раз в час', 'Сводка всего нового за час'], ['off', 'Не присылать', 'Смотрю сам на сайте']];
    const KINDS = [['pending', 'Новые объявления на проверку', 'И изменённые — после правки они снова в очереди'], ['reports', 'Жалобы на объявления', ''], ['support', 'Сообщения в поддержку', 'Только те, что ещё никто не прочитал']];
    box.innerHTML = String(html`<div class="adm-head"><h1>Мои уведомления</h1></div>
      ${S.config.mail ? '' : html`<div class="banner warn" style="margin-bottom:16px">Почта ещё не подключена — письма начнут приходить после настройки в разделе <a href="/admin?status=mail" style="text-decoration:underline">«Почта»</a>.</div>`}
      <form class="panel nt-form" id="nt">
        <div><h2 class="h2">Как часто</h2><p class="muted" style="margin:4px 0 0">Письма приходят на ${S.user.email}. У каждого модератора — свои настройки.</p></div>
        <div class="nt-modes" role="radiogroup" aria-label="Как часто">${MODES.map(([k, t, sub]) => html`<label class="nt-mode"><input type="radio" name="mode" value="${k}" ${cur.mode === k ? raw('checked') : ''}><span><b>${t}</b><small>${sub}</small></span></label>`)}</div>
        <div class="nt-kinds ${cur.mode === 'off' ? 'off' : ''}"><h2 class="h2">О чём</h2>
          ${KINDS.map(([k, t, sub]) => html`<label class="switch"><span>${t}${sub ? html`<small>${sub}</small>` : ''}</span><input type="checkbox" name="kinds" value="${k}" ${cur.kinds.includes(k) ? raw('checked') : ''}><span class="track"></span></label>`)}</div>
      </form>`);
    const f = $('#nt');
    f.onchange = async () => {
      const mode = f.mode.value;
      const kinds = $$('input[name=kinds]:checked', f).map((x) => x.value);
      $('.nt-kinds', f).classList.toggle('off', mode === 'off');
      try { await api('PUT', '/api/admin/me/notify', { mode, kinds }); toast(mode === 'off' ? 'Письма о новом отключены' : 'Сохранено'); } catch (e) { toast(e.message, true); }
    };
  }

  // Найденные подозрительные основы слов → целые слова в тексте (ё = е, позиции совпадают).
  function stemHits(text, stems) {
    if (!stems.length || !text) return [];
    const re = new RegExp(`(?<![а-яa-z0-9])(?:${stems.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[а-яa-z0-9]*`, 'gi');
    return [...text.toLowerCase().replace(/ё/g, 'е').matchAll(re)].map((m) => [m.index, m.index + m[0].length]);
  }
  function highlight(text, stems) {
    let out = ''; let pos = 0;
    for (const [a, b] of stemHits(text, stems)) { out += `${esc(text.slice(pos, a))}<mark>${esc(text.slice(a, b))}</mark>`; pos = b; }
    return raw(out + esc(text.slice(pos)));
  }

  const FIELD = { title: 'название', description: 'описание', category: 'категория', price: 'цена', priceUnit: 'единица цены', city: 'город', condition: 'состояние', delivery: 'доставка', bargain: 'торг', exchange: 'обмен', photos: 'фото' };
  const fieldVal = (k, v) => (k === 'category' ? catName(v) : k === 'price' ? price(v, '') : ['delivery', 'bargain', 'exchange'].includes(k) ? (v ? 'есть' : 'нет') : k === 'condition' ? CONDITION_LABEL[v] : v === '' ? '—' : String(v));
  function eventText(e) {
    const d = e.data;
    switch (e.kind) {
      case 'created': return html`Создано${d.flags ? html` · <span class="warn-t">похоже на: ${d.flags}</span>` : ''}`;
      case 'edited': return html`Изменено и отправлено на проверку${Object.keys(d.changes || {}).length ? html`<ul class="tl-changes">${Object.entries(d.changes).map(([k, [a, b]]) => html`<li><strong>${FIELD[k] || k}:</strong> ${k === 'description' ? 'текст изменён' : k === 'photos' ? `${a} → ${b}` : html`${fieldVal(k, a)} → ${fieldVal(k, b)}`}</li>`)}</ul>` : ''}`;
      case 'status': return html`Автор: ${{ active: 'снова опубликовал', sold: 'отметил «продано»', archived: 'снял с публикации' }[d.status] || d.status}`;
      case 'approved': return 'Опубликовано после проверки';
      case 'published': return 'Опубликовано в выбранное автором время';
      case 'expired': return 'Снято: прошло 30 дней';
      case 'rejected': return html`<span class="danger-t">Отклонено:</span> ${d.reason}`;
      case 'appeal': return html`Апелляция: «${d.text}»`;
      case 'appeal-denied': return html`Отказ по апелляции: ${d.reason}`;
      case 'appeal-approved': return 'Апелляция одобрена, объявление опубликовано';
      case 'restored': return 'Восстановлено модератором';
      case 'report': return html`<span class="warn-t">Жалоба:</span> ${d.reason}${d.text ? html` — «${d.text}»` : ''}`;
      case 'reports-dismissed': return html`Жалобы закрыты (${d.count}): ${d.comment}`;
      case 'author-blocked': return html`<span class="danger-t">Автор заблокирован</span>`;
      case 'author-unblocked': return 'Автор разблокирован';
      default: return e.kind;
    }
  }

  // Модерация → проверка объявления «от и до».
  async function viewAdminListing(id) {
    if (!requireAuth()) return;
    if (!S.user.isAdmin) { viewNotFound(); return; }
    const { listing: l, seller: u, events, reports, next } = await api('GET', `/api/admin/listings/${id}`);
    setTitle(`Проверка: ${l.title}`);
    const words = l.matches.flatMap((m) => m.words);
    const open = reports.filter((r) => !r.resolvedAt);
    const specs = [['Категория', catName(l.category)], ['Раздел', subName(l.subcategory) || '—'], ...(l.specs || []).map((x) => [x.label, x.value]),
      ['Цена', price(l.price, l.priceUnit)], ['Город', l.city], ...(l.metro ? [['Метро', l.metro]] : []), ...(l.district ? [['Район', l.district]] : []), ['Состояние', CONDITION_LABEL[l.condition]],
      ['Доставка', l.delivery ? 'Отправит по России' : 'Только встреча'], ['Создано', when(l.createdAt)], ['Изменено', when(l.updatedAt)],
      ['Просмотры', NF.format(l.views)], ['В избранном', NF.format(l.favCount)], ['Диалогов', NF.format(l.chats)]];
    const nextUrl = next ? `/admin/l/${next}` : '/admin?status=pending';
    app.innerHTML = String(html`<div class="wrap mod-page">
      <div class="mod-top">
        <a href="/admin?status=${l.status === 'pending' ? 'pending' : open.length ? 'reports' : l.status}" class="btn btn-soft btn-sm">${ic('left', 18)}К списку</a>
        <span class="tag ${l.status === 'active' ? 'accent' : l.status === 'rejected' ? 'danger' : ''}">${STATUS_LABEL[l.status]}</span>
        <span class="muted" style="font-size:14px">№ ${l.id}</span>
        <span style="flex:1"></span>
        ${l.status === 'active' ? html`<a class="btn btn-line btn-sm" href="/l/${l.id}" target="_blank">Открыть на сайте</a>` : ''}
        <a class="btn btn-soft btn-sm" href="${nextUrl}">${next ? 'Следующее в очереди' : 'В очередь'}${ic('right', 18)}</a>
      </div>
      <div class="mod-grid">
        <div class="mod-main">
          ${l.matches.length ? html`<div class="banner danger"><strong>Похоже на запрещённое.</strong> ${l.matches.map((m) => {
    const found = [...new Set(stemHits(`${l.title} ${l.description}`, m.words).map(([a, b]) => `${l.title} ${l.description}`.slice(a, b)))];
    return html`<div style="margin-top:6px">${m.title}: ${(found.length ? found : m.words).map((w) => html`<mark>${w}</mark> `)}</div>`;
  })}
            <div style="margin-top:8px;font-size:14px">Слова подсвечены в тексте ниже. Проверьте по <a href="/page/rules" target="_blank" style="text-decoration:underline">правилам</a>.</div></div>` : ''}
          ${l.checks.length ? html`<div class="banner warn"><strong>Обратите внимание — автопроверка:</strong>
            <ul class="chk-ul">${l.checks.map((c) => html`<li>${ic(CHECK_ICON[c.kind] || 'warn', 16, 2)}<span>${c.text}${c.ref ? html` · <a href="/admin/l/${c.ref}" target="_blank">открыть</a>` : ''}</span></li>`)}</ul></div>` : ''}
          <h1 class="mod-title">${highlight(l.title, words)}</h1>
          ${l.video ? html`<div class="mod-video"><video src="${l.video}#t=0.1" controls playsinline preload="metadata"></video><span class="muted">${ic('video', 16)}Видео — проверьте так же, как фото: только этот товар, без контактов и ссылок</span></div>` : ''}
          <div class="mod-photos">${l.photos.length ? l.photos.map((p, i) => html`<a href="${p}" target="_blank" class="mod-photo" data-pv-src="${p}" data-pv-group="mod"><img src="${p}" alt="Фото ${i + 1}" loading="lazy"><span>${i + 1}</span></a>`) : html`<div class="empty" style="padding:28px"><p style="margin:0">Без фото</p></div>`}</div>
          <section><h2 class="h2">Описание</h2><p class="desc">${l.description ? highlight(l.description, words) : html`<span class="muted">Описания нет</span>`}</p></section>
          <section><h2 class="h2">Все поля</h2><div class="specs">${specs.map(([k, v]) => html`<div class="spec"><div class="k">${k}</div><div class="v">${v}</div></div>`)}</div></section>
          ${l.rejectReason && l.status === 'rejected' ? html`<div class="banner danger"><strong>Причина отклонения:</strong> ${l.rejectReason}</div>` : ''}
          ${l.appealAt ? html`<div class="banner warn"><strong>Апелляция автора:</strong> ${l.appealText}</div>` : ''}
        </div>
        <aside class="mod-side">
          <div class="panel mod-actions"><h2 class="h2" style="margin:0">Решение</h2>
            <div class="mod-btns">${modButtons({ ...l, reports: open.length })}</div>
            <p class="muted" style="margin:0;font-size:13px">После решения откроется следующее объявление из очереди.</p></div>
          <div class="panel"><h2 class="h2" style="margin:0 0 12px">Продавец</h2>
            <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">${ava(u)}
              <div style="min-width:0;flex:1"><a href="/admin/u/${u.id}" style="font-weight:700">${u.name}</a><div class="muted" style="font-size:13px;word-break:break-all">${u.email}${u.emailVerified ? ' · подтверждён' : ' · не подтверждён'}</div></div>
              ${u.avatar ? html`<button class="btn btn-line btn-sm" data-ava-remove="${u.id}">Убрать фото</button>` : ''}</div>
            <div class="kv">
              <span>На Торгане</span><b>с ${since(u.createdAt)}</b>
              <span>Телефон</span><b>${u.phone || '—'}</b>
              <span>Город</span><b>${u.city || '—'}</b>
              <span>Объявлений</span><b>${u.counts.total} · опубл. ${u.counts.active} · на проверке ${u.counts.pending}</b>
              <span>Отклонено ранее</span><b class="${u.counts.rejected ? 'danger-t' : ''}">${u.counts.rejected}</b>
              <span>Жалоб на него</span><b class="${u.reportsAgainst ? 'warn-t' : ''}">${u.reportsAgainst}</b>
              <span>Статус</span><b class="${u.blocked ? 'danger-t' : ''}">${u.blocked ? 'заблокирован' : 'активен'}</b>
            </div>
            ${u.isAdmin ? '' : html`<button class="btn btn-line btn-sm btn-block" style="margin-top:14px" data-block="${u.id}" data-blocked="${u.blocked ? '1' : ''}">${u.blocked ? 'Разблокировать' : 'Заблокировать автора'}</button>`}
          </div>
          ${reports.length ? html`<div class="panel"><h2 class="h2" style="margin:0 0 12px">Жалобы · ${reports.length}</h2>${reports.map((r) => html`<div class="report ${r.resolvedAt ? 'done' : ''}">
              <b>${r.reason}</b>${r.text ? html`<p>${r.text}</p>` : ''}<span class="muted">${r.user ? r.user.name : 'пользователь'} · ${when(r.at)}${r.resolvedAt ? ` · закрыта: ${r.resolution}` : ''}</span></div>`)}</div>` : ''}
          <div class="panel"><h2 class="h2" style="margin:0 0 12px">История</h2>
            <ol class="timeline">${[...events].reverse().map((e) => html`<li><span class="tl-dot"></span><div>${eventText(e)}<div class="muted" style="font-size:12px;margin-top:2px">${when(e.at)}${e.actor ? ` · ${e.actor.name}${e.actor.isAdmin ? ' (модератор)' : ''}` : ''}</div></div></li>`)}</ol></div>
        </aside>
      </div>
    </div>`);
    // После решения — сразу следующее объявление из очереди.
    bindModActions(app, () => go(nextUrl, true));
  }

  // Модерация → Поддержка: диалоги слева, чат и карточка пользователя справа.
  // Модерация отзывов: новые отзывы и ответы продавцов, жалобы продавцов на отзывы.
  async function renderReviewsAdmin(box, tab) {
    const d = await api('GET', `/api/admin/reviews?tab=${tab}`);
    const tabs = [['pending', `На проверке${d.counts.pending ? ` · ${d.counts.pending}` : ''}`], ['complaints', `Жалобы${d.counts.complaints ? ` · ${d.counts.complaints}` : ''}`], ['all', 'Последние']];
    const item = (rv) => html`<div class="adm-rv">
      ${reviewCard(rv, 'public')}
      <div class="adm-rv-side">
        <div class="muted" style="font-size:13px">Автор: ${rv.author.name} (${rv.authorEmail}) · о продавце <a href="/u/${rv.seller.id}" target="_blank">${rv.seller.name}</a> · ${RV_STATUS[rv.status][1]}</div>
        ${rv.status === 'pending' ? html`<div class="adm-rv-act"><button class="btn btn-accent btn-sm" data-rv-ok="${rv.id}">Опубликовать отзыв</button><button class="btn btn-danger btn-sm" data-rv-no="${rv.id}">Не публиковать</button></div>` : ''}
        ${rv.replyDraft && rv.replyDraft.status === 'pending' ? html`<div class="banner warn" style="font-size:14px"><strong>Ответ продавца на проверке:</strong> ${rv.replyDraft.text}</div>
          <div class="adm-rv-act"><button class="btn btn-accent btn-sm" data-rp-ok="${rv.id}">Опубликовать ответ</button><button class="btn btn-danger btn-sm" data-rp-no="${rv.id}">Не публиковать ответ</button></div>` : ''}
        ${rv.complaint && !rv.complaint.resolved ? html`<div class="banner danger" style="font-size:14px"><strong>Жалоба продавца: ${rv.complaint.reason}.</strong> ${rv.complaint.text}</div>
          <div class="adm-rv-act"><button class="btn btn-soft btn-sm" data-cm-keep="${rv.id}">Оставить отзыв</button><button class="btn btn-danger btn-sm" data-cm-hide="${rv.id}">Скрыть отзыв</button></div>` : ''}
        ${rv.status === 'hidden' || rv.status === 'rejected' ? html`<div class="adm-rv-act"><button class="btn btn-line btn-sm" data-rv-back="${rv.id}">Вернуть отзыв</button></div>` : ''}
      </div></div>`;
    box.innerHTML = String(html`<div class="tabs" style="margin:0 0 16px">${tabs.map(([k, t]) => html`<a class="chip ${k === tab ? 'active' : ''}" href="/admin?status=reviews&rt=${k}">${t}</a>`)}</div>
      ${d.items.length ? html`<div class="adm-rv-list">${d.items.map(item)}</div>` : html`<div class="empty"><h3>${tab === 'complaints' ? 'Жалоб нет' : 'Очередь пуста'}</h3><p>${tab === 'complaints' ? 'Все жалобы на отзывы рассмотрены.' : 'Все отзывы и ответы проверены.'}</p></div>`}`);
    const again = () => render();
    const post = async (url, body) => { try { await api('POST', url, body); toast('Готово'); again(); } catch (e) { toast(e.message, true); } };
    $$('[data-rv-ok]', box).forEach((b) => { b.onclick = () => post(`/api/admin/reviews/${b.dataset.rvOk}/publish`); });
    $$('[data-rp-ok]', box).forEach((b) => { b.onclick = () => post(`/api/admin/reviews/${b.dataset.rpOk}/reply/publish`); });
    $$('[data-rv-back]', box).forEach((b) => { b.onclick = () => post(`/api/admin/reviews/${b.dataset.rvBack}/restore`); });
    $$('[data-rv-no]', box).forEach((b) => { b.onclick = () => reasonModal({ title: 'Не публиковать отзыв', hint: 'Причину увидит автор. Новый отзыв по этому объявлению он оставить не сможет.', url: `/api/admin/reviews/${b.dataset.rvNo}/reject`, okLabel: 'Не публиковать', reasons: ['Оскорбления или грубость', 'Телефон, ссылки или личные данные', 'Отзыв не о сделке', 'Реклама или спам'], done: again }); });
    $$('[data-rp-no]', box).forEach((b) => { b.onclick = () => reasonModal({ title: 'Не публиковать ответ', hint: 'Причину увидит продавец, он сможет написать ответ заново.', url: `/api/admin/reviews/${b.dataset.rpNo}/reply/reject`, okLabel: 'Не публиковать', reasons: ['Оскорбления или грубость', 'Телефон, ссылки или личные данные', 'Реклама или спам'], done: again }); });
    $$('[data-cm-keep]', box).forEach((b) => { b.onclick = () => reasonModal({ title: 'Оставить отзыв', hint: 'Комментарий увидит продавец.', url: `/api/admin/reviews/${b.dataset.cmKeep}/complaint/keep`, okLabel: 'Оставить отзыв', minText: 0, placeholder: 'Например: нарушений правил нет', danger: false, done: again }); });
    $$('[data-cm-hide]', box).forEach((b) => { b.onclick = () => reasonModal({ title: 'Скрыть отзыв', hint: 'Причину увидят продавец и автор отзыва. Отзыв перестанет учитываться в оценке.', url: `/api/admin/reviews/${b.dataset.cmHide}/complaint/hide`, okLabel: 'Скрыть отзыв', reasons: ['Сделки не было', 'Оскорбления', 'Ложные сведения', 'Отзыв о другом человеке или товаре', 'Личные данные в тексте'], done: again }); });
  }

  async function renderSupportAdmin(box, threadId) {
    const { items } = await api('GET', '/api/admin/support');
    const id = Number(threadId) || (items[0] && items[0].id);
    box.innerHTML = String(html`<div class="inbox ${threadId ? 'has-chat' : ''}" style="margin-top:0">
      <div class="inbox-list">${items.length ? items.map((t) => html`<a href="/admin?status=support&t=${t.id}" class="conv ${t.id === id ? 'on' : ''}">
          ${ava(t.user)}
          <span class="conv-body"><span class="conv-top"><span>${t.user.name}</span><span>${shortWhen(t.updatedAt)}</span></span>
            <span class="conv-title" style="display:block">${t.waiting ? 'Ждёт ответа' : 'Отвечено'}</span>
            <span class="conv-last" style="display:block">${t.lastBody}</span></span>
          ${t.unread ? html`<span class="badge">${t.unread}</span>` : ''}</a>`) : html`<div style="padding:22px" class="muted">Обращений пока нет. Пользователи пишут в закреплённый диалог «Поддержка Торганы».</div>`}</div>
      <section class="chat" id="support-chat">${id ? html`<div class="loader" style="flex:1"></div>` : html`<div class="chat-empty"><div>${supportAva(56)}<p>Выберите обращение слева.</p></div></div>`}</section>
    </div>`);
    if (!id) return;
    const first = await api('GET', `/api/admin/support/${id}`);
    const u = first.user;
    cleanup = mountChat($('#support-chat'), {
      back: '/admin?status=support',
      head: html`${ava(u)}<div style="flex:1;min-width:0"><a href="/admin/u/${u.id}" style="font-weight:700">${u.name}</a>
        <span class="muted" style="font-size:13px;word-break:break-all">${u.email}${u.emailVerified ? '' : ' · не подтверждён'} · с ${since(u.createdAt)} · объявлений ${u.listings}${u.rejected ? ` · отклонено ${u.rejected}` : ''}${u.blocked ? ' · заблокирован' : ''}</span></div>`,
      load: (after) => api('GET', `/api/admin/support/${id}?after=${after}`),
      send: async (msg) => (await api('POST', `/api/admin/support/${id}/messages`, msg)).message,
      placeholder: 'Ответ от имени поддержки…'
    });
  }

  // Модерация → Версия сайта: что работает сейчас и как прошло последнее автообновление из ветки release.
  function renderSiteAdmin(box, u) {
    const at = (iso) => (iso ? when(Date.parse(iso)) : '—');
    const stale = u && u.checkedAt && Date.now() - Date.parse(u.checkedAt) > 10 * 60 * 1000;
    const row = (k, v, bad) => html`<div style="display:flex;gap:16px;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line);font-size:15px">
      <span class="muted" style="flex:none">${k}</span><span style="text-align:right;min-width:0;overflow-wrap:anywhere;${bad ? 'color:var(--danger);font-weight:600' : ''}">${v}</span></div>`;
    box.innerHTML = String(html`<div class="panel" style="max-width:760px">
      ${u && u.enabled ? html`
        ${u.version ? html`<div style="font-size:30px;font-weight:800;letter-spacing:-0.03em;margin:4px 0 6px">V${u.version}</div>` : ''}
        ${row('Работает', u.commit ? `${u.version ? `V${u.version} · ` : ''}${u.commit}${u.subject ? ` — ${u.subject}` : ''}` : '—')}
        ${row('Установлена', at(u.updatedAt))}
        ${row('Автообновление', u.checkError || (stale ? `нет проверок с ${at(u.checkedAt)} — проверьте службу torgana-update` : `ветка ${u.branch}, проверка каждые 30 секунд · последняя ${at(u.checkedAt)}`), !!(u.checkError || stale))}
        ${u.lastError ? html`<div class="banner danger" style="margin-top:16px">${u.lastError} · ${at(u.failedAt)}. Эта версия больше не ставится — выпустите исправление в ${u.branch}.</div>` : ''}`
      : html`<p class="muted" style="margin:0 0 8px">Автообновление ещё ни разу не запускалось на этом сервере.</p>`}
      <p class="muted" style="margin:16px 0 0;font-size:14px">Как выпустить: в GitHub слейте pull request <strong>main → ${u && u.branch ? u.branch : 'release'}</strong> (кнопка Merge). Название — номер версии и что изменилось, например «1.1.0: …». Сервер проверит новую версию на временной базе, сделает копию базы и перезапустит сайт. Если что-то не так — останется прежняя версия.</p>
    </div>`);
  }

  // Модерация → Почта: подключение SMTP, проверка письмом, журнал отправки.
  function renderMailAdmin(box, { config: c, stats: st, codes }) {
    const SECURITY = [['ssl', 'SSL (обычно порт 465)'], ['starttls', 'STARTTLS (порт 587 или 2525)']];
    const STATUS = { pending: 'в очереди', sent: 'отправлено', failed: 'не доставлено' };
    const KIND = { device: 'Код для модерации', ops: 'Владельцу о сбое', verify: 'Подтверждение email', reset: 'Восстановление пароля', message: 'Новое сообщение', moderation: 'Модерация', review: 'Отзывы', support: 'Ответ поддержки', account: 'Блокировка аккаунта', mod: 'Модератору о новом', billing: 'Оплата и тарифы', code: 'Код подтверждения', test: 'Проверка' };
    const domain = (c.from || 'no-reply@torgana.ru').split('@')[1];
    box.innerHTML = String(html`
      <div class="stats">
        <div class="stat"><div class="n">${c.ready ? 'Подключена' : 'Нет'}</div><div class="k">${c.ready ? `письма уходят с ${c.from}` : 'письма не отправляются'}</div></div>
        <div class="stat"><div class="n">${NF.format(st.sent)}</div><div class="k">отправлено за 30 дней</div></div>
        <div class="stat"><div class="n">${NF.format(st.pending)}</div><div class="k">в очереди</div></div>
        <div class="stat"><div class="n">${NF.format(st.failed)}</div><div class="k">не доставлено</div></div>
      </div>
      ${c.ready ? '' : html`<div class="banner warn" style="margin-bottom:20px"><strong>Почта не подключена.</strong> Пока её нет, на сайте скрыты «Забыли пароль?» и подтверждение email, письма о сообщениях и решениях модерации не уходят.</div>`}
      <div class="mail-grid">
        <form class="panel settings" id="mf" style="max-width:none">
          <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><h2 class="h2" style="margin:0">Подключение</h2>
            <button type="button" class="btn btn-soft btn-sm" id="preset">Заполнить для SMTP.BZ</button></div>
          <div class="row stack-m"><div class="field" style="flex:2"><label for="m-host">Сервер SMTP</label><input id="m-host" name="host" class="input" value="${c.host || ''}" placeholder="connect.smtp.bz"></div>
            <div class="field" style="flex:1"><label for="m-port">Порт</label><input id="m-port" name="port" class="input" inputmode="numeric" value="${c.port || ''}" placeholder="2525"></div></div>
          <div class="field"><label for="m-sec">Шифрование</label><select id="m-sec" name="security" class="select">${SECURITY.map(([v, t]) => html`<option value="${v}" ${c.security === v ? raw('selected') : ''}>${t}</option>`)}</select></div>
          <div class="field"><label for="m-user">Логин</label><input id="m-user" name="user" class="input" value="${c.user || ''}" autocomplete="off" placeholder="Логин из личного кабинета SMTP.BZ"></div>
          <div class="field"><label for="m-pass">Пароль</label><input id="m-pass" name="pass" type="password" class="input" autocomplete="new-password" placeholder="${c.hasPass ? 'Сохранён — оставьте пустым, чтобы не менять' : 'Пароль SMTP из личного кабинета'}"></div>
          <div class="row stack-m"><div class="field" style="flex:1"><label for="m-from">Адрес отправителя</label><input id="m-from" name="from" class="input" value="${c.from || ''}" placeholder="no-reply@torgana.ru"></div>
            <div class="field" style="flex:1"><label for="m-name">Имя отправителя</label><input id="m-name" name="fromName" class="input" value="${c.fromName || ''}" placeholder="Торгана"></div></div>
          <div class="field"><label for="m-reply">Ответы на письма — на адрес</label><input id="m-reply" name="replyTo" class="input" type="email" value="${c.replyTo || ''}" placeholder="${S.config.supportEmail || 'support@torgana.ru'}">
            <span class="help">Если человек ответит на уведомление, письмо придёт сюда, а не на адрес отправителя. По умолчанию — адрес поддержки.</span></div>
          <div class="form-error hidden" id="m-err" role="alert"></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-dark" type="submit">Сохранить</button></div>
          <p class="muted" style="margin:0;font-size:13px">Чтобы письма не попадали в спам, домен ${domain} подтверждается в SMTP.BZ, а в DNS домена добавляются записи SPF и DKIM, которые выдаст сервис.</p>
        </form>
        <div style="display:flex;flex-direction:column;gap:20px">
          <div class="panel" style="display:flex;flex-direction:column;gap:12px">
            <h2 class="h2" style="margin:0">Коды по почте</h2>
            <label class="switch"><span>Спрашивать код из письма<small>6 цифр при регистрации и входе с неподтверждённой почтой, код для входа в модерацию с нового устройства</small></span><input type="checkbox" id="m-codes" ${codes ? raw('checked') : ''} ${c.ready ? '' : raw('disabled')}><span class="track"></span></label>
            ${codes ? '' : html`<div class="banner warn" style="font-size:14px">${c.ready ? 'Коды выключены: регистрация и вход — без кода, модерация — без подтверждения устройства. Включите, когда тестовое письмо дойдёт до почты.' : 'Почта не подключена — коды не отправить, поэтому они выключены.'}</div>`}
          </div>
          <form class="panel" id="mt" style="display:flex;flex-direction:column;gap:14px">
            <h2 class="h2" style="margin:0">Проверка</h2>
            <p class="muted" style="margin:0;font-size:14px">Отправим тестовое письмо сразу, минуя очередь, и покажем ответ почтового сервиса.</p>
            <div class="row"><label class="sr" for="mt-to">Кому</label><input id="mt-to" class="input" type="email" value="${S.user.email}">
              <button class="btn btn-accent" type="submit" ${c.ready ? '' : raw('disabled')}>Отправить</button></div>
            <div class="form-error hidden" id="mt-err" role="alert"></div>
          </form>
          <div class="panel" id="avatar"><h2 class="h2" style="margin:0">Аватарка отправителя</h2>
            <p class="muted" style="margin:0;font-size:14px">Картинку рядом с письмом каждая почта берёт из своего источника. Сайт сам её не передаёт: подключите один раз в каждой почте, затем проверьте тестовым письмом.</p>
            <ol class="avatar-steps">
              <li><strong>Mail.ru</strong> — <a href="https://postmaster.mail.ru/" target="_blank" rel="noopener">postmaster.mail.ru</a>: добавить домен ${domain}, «Настройки» → «Изменить аватар», загрузить <a href="/assets/icons/apple-touch-icon.png" download="torgana-avatar-180.png">картинку 180×180</a>. Действует на весь домен после модерации Mail.ru.</li>
              <li><strong>Яндекс Почта</strong> — портрет Яндекс ID ящика ${c.from || `no-reply@${domain}`} в Яндекс 360: <a href="https://id.yandex.ru/" target="_blank" rel="noopener">id.yandex.ru</a> → фото, <a href="/assets/icons/icon-512.png" download="torgana-avatar-512.png">картинка 512×512</a>. Яндекс не обещает показ для писем через сторонний сервис отправки — проверьте письмом.</li>
              <li><strong>Gmail</strong> — Google-аккаунт на адрес ${c.from || `no-reply@${domain}`} («Использовать существующий адрес» при регистрации), фото профиля — <a href="/assets/icons/icon-512.png" download="torgana-avatar-512.png">та же картинка</a>. Появляется через несколько дней.</li>
            </ol>
          </div>
          <div class="panel"><h2 class="h2" style="margin:0 0 12px">Последние письма</h2>
            ${st.recent.length ? html`<div style="display:flex;flex-direction:column;gap:10px">${st.recent.map((r) => html`<div style="display:flex;gap:10px;justify-content:space-between;font-size:14px;border-bottom:1px solid var(--line);padding-bottom:10px">
              <span style="min-width:0"><strong>${KIND[r.kind] || r.kind}</strong> · ${r.to_email}<br><span class="muted">${when(r.created_at)}${r.last_error ? html` · ${r.last_error}` : ''}</span></span>
              <span class="tag ${r.status === 'sent' ? 'accent' : ''}" style="flex:none;align-self:flex-start">${STATUS[r.status]}</span></div>`)}</div>` : html`<p class="muted" style="margin:0">Писем пока не было.</p>`}
          </div>
        </div>
      </div>`);
    const mc = $('#m-codes', box);
    mc.onchange = async () => {
      if (mc.checked && !(await confirmModal('Включить коды по почте?', 'Убедитесь, что тестовое письмо дошло: иначе новые пользователи не смогут зарегистрироваться, а вы — войти в модерацию с нового устройства.', 'Включить'))) { mc.checked = false; return; }
      try { await api('PUT', '/api/admin/mail/codes', { on: mc.checked }); toast(mc.checked ? 'Коды включены' : 'Коды выключены'); render(); } catch (ex) { mc.checked = !mc.checked; toast(ex.message, true); }
    };
    const f = $('#mf', box);
    // Selectel закрывает исходящий порт 465 — SMTP.BZ подключаем через 2525 со STARTTLS (как в ALBAKOV).
    $('#preset', box).onclick = () => { f.host.value = 'connect.smtp.bz'; f.port.value = '2525'; f.security.value = 'starttls'; if (!f.from.value) f.from.value = 'no-reply@torgana.ru'; if (!f.fromName.value) f.fromName.value = 'Торгана'; f.user.focus(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#m-err', box); err.classList.add('hidden');
      try {
        await api('PUT', '/api/admin/mail', Object.fromEntries(new FormData(f).entries()));
        S.config = await api('GET', '/api/config');
        toast('Сохранено. Отправьте тестовое письмо, чтобы проверить.');
        render();
      } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
    };
    $('#mt', box).onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#mt-err', box); err.classList.add('hidden');
      const b = $('button', e.target); b.disabled = true; b.textContent = 'Отправляем…';
      try { const r = await api('POST', '/api/admin/mail/test', { to: $('#mt-to', box).value }); toast(`Письмо отправлено на ${r.to}`); render(); } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); b.disabled = false; b.textContent = 'Отправить'; }
    };
  }

  // ================= информационные страницы =================
  const LEGAL = new Set(['terms', 'rules', 'privacy', 'consent', 'contacts']);
  async function viewPage(slug) {
    if (slug === 'business') { go('/business', true); return; }
    if (LEGAL.has(slug)) {
      const d = await api('GET', `/api/pages/${slug}`);
      setTitle(d.title);
      app.innerHTML = String(html`<div class="wrap"><article class="page"><h1>${d.title}</h1>${raw(d.html)}</article></div>`);
      const to = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
      if (to) to.scrollIntoView({ block: 'start' });
      return;
    }
    const email = S.config.supportEmail;
    const contact = email ? html`<a href="mailto:${email}" style="text-decoration:underline">${email}</a>` : html`через форму на сайте (адрес поддержки появится здесь)`;
    const PAGES = {
      safety: ['Безопасность', html`
        <p>Большинство мошеннических схем строится на одном: увести вас из чата площадки и получить деньги или данные карты.</p>
        <h2>Чего никогда не делать</h2><ul><li>Не переходите в мессенджеры по просьбе собеседника.</li><li>Не называйте коды из СМС, CVV/CVC и данные карты.</li><li>Не переходите по ссылкам «для получения оплаты» или «оформления доставки».</li><li>Не вносите предоплату незнакомым продавцам.</li></ul>
        <h2>Как покупать спокойно</h2><ul><li>Общайтесь в чате Торганы — переписка сохраняется.</li><li>Проверяйте товар при встрече до оплаты.</li><li>Смотрите, сколько продавец на площадке и сколько у него объявлений.</li></ul>
        <p>Если чат заподозрит обман, мы покажем предупреждение. О подозрительном объявлении сообщите в поддержку: ${contact}.</p>`],
      help: ['Как искать', html`
        <p>Пишите в поиск так, как сказали бы человеку. Торгана поймёт цену, доставку и город.</p>
        <h2>Примеры</h2><ul><li>«коляска до 15 000 с доставкой»</li><li>«iPhone от 40 тыс в Казани»</li><li>«диван до 20к в Москве»</li></ul>
        <p>Уточнить результаты можно фильтрами: категория, город, цена и доставка. Нажмите на сердечко, чтобы сохранить объявление в избранное.</p>`],
      support: ['Поддержка', html`
        <p>Мы отвечаем людьми, а не шаблонами.</p>
        <h2>Как связаться</h2><p>Быстрее всего — в чате «Поддержка Торганы»: он всегда закреплён первым в разделе «Сообщения».</p>
        <p><a class="btn btn-accent" href="/messages/support" style="text-decoration:none;color:#fff">${ic('chat', 18)}Написать в поддержку</a></p>
        <p>Или на почту: ${contact}. Укажите ссылку на объявление или диалог, если вопрос о них. Реквизиты — на странице <a href="/page/contacts" style="text-decoration:underline">«Реквизиты и контакты»</a>.</p>
        <h2>Частые вопросы</h2>
        <p><strong>Почему отклонили объявление?</strong> Причина указана в профиле в разделе «На исправлении». Исправьте объявление или подайте апелляцию.</p>
        <p><strong>Сколько стоит размещение?</strong> Для частных лиц — бесплатно и без лимитов.</p>
        <p><strong>Как удалить аккаунт?</strong> Напишите в поддержку с email, на который зарегистрирован аккаунт.</p>`]
    };
    const p = PAGES[slug];
    if (!p) { viewNotFound(); return; }
    setTitle(p[0]);
    app.innerHTML = String(html`<div class="wrap"><article class="page"><h1>${p[0]}</h1>${p[1]}</article></div>`);
  }

  // ================= «потянуть вниз — обновить» =================
  // Только в установленном приложении (значок на экране «Домой»): в браузере телефона у Safari и Chrome
  // есть свой такой жест. Жест только наблюдает за пальцем (passive) и не мешает прокрутке и нажатиям.
  // Обновление мягкое: заново берём данные и перерисовываем страницу; вышла новая версия сайта — перезагрузка.
  async function softRefresh() {
    const cur = ($('script[src*="/assets/app.js"]') || {}).src || '';
    try {
      const page = await fetch('/', { cache: 'no-store' }).then((r) => r.text());
      const m = /\/assets\/app\.js\?v=([\w-]+)/.exec(page);
      if (m && !cur.includes(m[1])) { location.reload(); return; }
    } catch { /* офлайн — обновим то, что получится */ }
    try { S.config = await api('GET', '/api/config'); } catch { /* офлайн */ }
    await refreshMe();
    await render();
  }

  function setupPullToRefresh() {
    const installed = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    if (!installed || !('ontouchstart' in window)) return;
    const START = 16; const TRIGGER = 96; const MAX = 120;
    const FIELD = 'input, textarea, select, [contenteditable], label';
    let typed = [];
    document.addEventListener('input', (e) => { const t = e.target; if (t && t.matches && t.matches('input, textarea, [contenteditable]') && !typed.includes(t)) typed.push(t); }, true);
    // Напечатанное и не отправленное (сообщение, объявление) обновлением не стираем
    const hasDraft = () => { typed = typed.filter((el) => document.contains(el)); return typed.some((el) => String(el.isContentEditable ? el.textContent : el.value || '').trim()); };
    const typingNow = () => {
      const a = document.activeElement;
      if (a && a !== document.body && a.matches && a.matches('input, textarea, select, [contenteditable]')) return true;
      const vv = window.visualViewport;
      return !!(vv && (vv.offsetTop > 0 || vv.height < window.innerHeight * 0.8));
    };
    // Палец на блоке со своей прокруткой не в самом верху (переписка) — тянут его, а не страницу
    const innerScrolled = (node) => {
      for (let el = node; el && el !== document.body; el = el.parentElement) {
        if (el.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return true;
      }
      return false;
    };
    const ind = document.createElement('div');
    ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true');
    ind.innerHTML = `<span class="ptr-ic">${ic('refresh', 20, 1.8)}</span>`;
    document.body.appendChild(ind);
    const icn = ind.firstChild;
    let x0 = 0; let y0 = 0; let dist = 0; let state = 'idle'; // idle → maybe → pull → busy
    let lastScroll = 0;
    window.addEventListener('scroll', () => { lastScroll = Date.now(); }, { passive: true });
    const show = (d) => {
      const pr = Math.min(1, d / TRIGGER);
      ind.style.transform = `translate(-50%, ${d - 48}px)`;
      ind.style.opacity = String(Math.min(1, pr * 1.4));
      icn.style.transform = `rotate(${pr * 270}deg)`;
      ind.classList.toggle('ready', d >= TRIGGER);
    };
    const hide = () => {
      ind.classList.add('back'); ind.classList.remove('ready', 'busy');
      ind.style.transform = ''; ind.style.opacity = ''; icn.style.transform = '';
      setTimeout(() => ind.classList.remove('back'), 400);
    };
    document.addEventListener('touchstart', (e) => {
      if (state === 'busy' || e.touches.length !== 1) return;
      state = 'idle';
      if (typingNow() || (e.target.closest && e.target.closest(FIELD))) return;
      if (window.scrollY > 0 || Date.now() - lastScroll < 450 || $('.modal-back') || innerScrolled(e.target)) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dist = 0; state = 'maybe';
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (state !== 'maybe' && state !== 'pull') return;
      if (e.touches.length !== 1) { state = 'idle'; hide(); return; }
      const dx = e.touches[0].clientX - x0; const dy = e.touches[0].clientY - y0;
      if (state === 'maybe') {
        if (Math.abs(dx) < START && Math.abs(dy) < START) return;
        if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0 || typingNow()) { state = 'idle'; return; }
        state = 'pull'; ind.classList.remove('back');
      }
      dist = Math.min(MAX, Math.max(0, (dy - START) * 0.5));
      show(dist);
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (state !== 'pull') { if (state === 'maybe') state = 'idle'; return; }
      if (dist < TRIGGER || hasDraft()) { state = 'idle'; hide(); return; }
      state = 'busy';
      ind.classList.add('busy', 'back'); ind.classList.remove('ready');
      ind.style.transform = `translate(-50%, ${TRIGGER - 48}px)`; icn.style.transform = '';
      const t0 = Date.now();
      softRefresh().catch(() => {}).then(() => {
        // слишком быстрое обновление выглядит как сбой — значок крутится хотя бы полсекунды
        setTimeout(() => { hide(); state = 'idle'; }, Math.max(0, 500 - (Date.now() - t0)));
      });
    }, { passive: true });
    document.addEventListener('touchcancel', () => { if (state === 'pull' || state === 'maybe') { state = 'idle'; hide(); } }, { passive: true });
  }

  // ================= push-уведомления =================
  const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // На iPhone push работает только у Торганы, добавленной на экран «Домой».
  const IOS_TAB = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(navigator.standalone || window.matchMedia('(display-mode: standalone)').matches);
  let swReg = null;
  function swReady() {
    if (!PUSH_OK) return Promise.resolve(null);
    if (!swReg) {
      swReg = navigator.serviceWorker.register('/sw.js').catch(() => null);
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.go) go(new URL(e.data.go).pathname); });
    }
    return swReg;
  }
  async function pushState() {
    const reg = await swReady();
    if (!reg) return { ok: false, ios: IOS_TAB };
    return { ok: true, sub: await reg.pushManager.getSubscription(), perm: Notification.permission };
  }
  const b64uBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const deviceName = () => { const ua = navigator.userAgent; return `${/Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Устройство'} · ${/YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'браузер'}`; };
  async function pushOn() {
    if (!PUSH_OK) throw new Error(IOS_TAB ? 'Добавьте Торгану на экран «Домой» — на iPhone уведомления работают оттуда' : 'Этот браузер не поддерживает уведомления');
    if (await Notification.requestPermission() !== 'granted') throw new Error('Уведомления запрещены — разрешите их в настройках сайта в браузере');
    const reg = await swReady();
    const { key } = await api('GET', '/api/push');
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key) });
    await api('POST', '/api/push/subscribe', { subscription: sub.toJSON(), device: deviceName() });
  }
  async function pushOff() {
    const { sub } = await pushState();
    if (!sub) return;
    await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  // Подсказка «включите уведомления» — в поисках и сообщениях, пока push не включён и человек её не закрыл.
  const NUDGE_KEY = 'torgana:push-nudge';
  async function pushNudge(box, text) {
    if (!box || !S.user) return;
    try { if (localStorage.getItem(NUDGE_KEY)) return; } catch { /* приватный режим */ }
    const st = await pushState();
    if ((st.ok && (st.sub || st.perm === 'denied')) || (!st.ok && !st.ios)) return;
    box.innerHTML = String(html`<div class="nudge">${ic('bell', 22, 2)}<span class="nudge-txt"><b>Включите уведомления</b><span>${st.ios ? 'На iPhone: «Поделиться» → «На экран «Домой»», затем откройте Торгану оттуда.' : text}</span></span>
      ${st.ios ? '' : html`<button type="button" class="btn btn-dark btn-sm" data-on>Включить</button>`}<button type="button" class="icon-btn sm" data-x aria-label="Скрыть">${ic('close', 16, 2)}</button></div>`);
    const on = $('[data-on]', box);
    if (on) on.onclick = async () => { try { await pushOn(); box.innerHTML = ''; toast('Уведомления включены'); } catch (e) { toast(e.message, true); } };
    $('[data-x]', box).onclick = () => { box.innerHTML = ''; try { localStorage.setItem(NUDGE_KEY, '1'); } catch { /* ничего */ } };
  }

  // ================= запуск =================
  // Кто вошёл, непрочитанное и новое по поискам — при запуске и раз в 30 секунд.
  function applyMe(r) {
    const changed = (S.user && S.user.id) !== (r.user && r.user.id);
    S.user = r.user;
    setUnread(r.unread || 0);
    setFresh(r.fresh);
    setNotices(r.notices);
    return changed;
  }
  async function refreshMe() {
    try { if (applyMe(await api('GET', '/api/me'))) { renderHeader(); renderBottomNav(); pushAskOnce(); } } catch { /* офлайн */ }
  }

  // Разовый вопрос про уведомления (1.23): при первом заходе вошедшего человека — один раз на устройство и навсегда,
  // обновления сайта его не повторяют (метка в localStorage). Не спрашиваем, если браузер уже знает ответ
  // (разрешено или запрещено), push не поддерживается или уже есть подписка. Системный запрос браузера —
  // только по нажатию «Включить»: так браузер его не прячет.
  const ASK_KEY = 'tg_push_asked';
  let asking = false;
  async function pushAskOnce() {
    if (!S.user || asking) return;
    try { if (localStorage.getItem(ASK_KEY)) return; } catch { return; }
    if (['/confirm', '/login', '/register', '/reset', '/forgot'].includes(location.pathname)) return;
    asking = true;
    const st = await pushState().catch(() => ({ ok: false }));
    const mark = () => { try { localStorage.setItem(ASK_KEY, String(Date.now())); } catch { /* нет хранилища */ } };
    if ((st.ok && (st.sub || st.perm !== 'default')) || (!st.ok && !st.ios)) { mark(); asking = false; return; }
    await new Promise((r) => setTimeout(r, 1200));
    if (!S.user || $('.modal-back')) { asking = false; return; } // занято другим окном — спросим при следующем заходе
    mark();
    openModal(String(html`<div class="ask-push"><span class="ask-ic">${ic('bell', 30, 1.9)}</span>
      <h2>Включить уведомления?</h2>
      <p>${st.ios ? 'На iPhone уведомления работают, если открыть Торгану с экрана «Домой»: «Поделиться» → «На экран «Домой»».' : 'Сообщим, когда объявление опубликуют, напишут в чате или подешевеет товар из избранного. Выключить можно в настройках.'}</p>
      <div class="ask-act">${st.ios ? html`<button class="btn btn-dark btn-lg btn-block" data-x>Понятно</button>`
    : html`<button class="btn btn-accent btn-lg btn-block" data-ok>Включить</button><button class="btn btn-soft btn-lg btn-block" data-x>Не сейчас</button>`}</div></div>`), (m, close) => {
      m.classList.add('ask-modal'); m.parentElement.classList.add('ask-back');
      $('[data-x]', m).onclick = close;
      const ok = $('[data-ok]', m);
      if (ok) {
        ok.onclick = async () => {
          ok.disabled = true;
          try { await pushOn(); close(); toast('Уведомления включены'); } catch (e) { close(); toast(e.message, true); }
        };
      }
    });
    asking = false;
  }

  async function boot() {
    try {
      const [config, me] = await Promise.all([api('GET', '/api/config'), api('GET', '/api/me')]);
      S.config = config;
      applyMe(me);
      if (S.user) swReady(); // подписка на push живёт, пока зарегистрирован service worker
    } catch (e) {
      app.innerHTML = String(html`<div class="wrap"><div class="empty" style="margin-top:40px"><h3>Нет связи с сервером</h3><p>${e.message}</p><a class="btn btn-dark" href="/">Обновить</a></div></div>`);
      return;
    }
    renderFooter();
    metrikaStart();
    await render();
    cookieBar();
    pushAskOnce();
    setupPullToRefresh();
    setInterval(() => { if (S.user && document.visibilityState === 'visible') refreshMe(); }, 30000);
  }

  boot();
})();

'use strict';
/* Торгана — клиентское приложение (одностраничное, без зависимостей). */
(() => {
  // 1.56.0: приложение Торгана для iPhone (репозиторий torgana-ios) открывает сайт внутри себя и даёт мост
  // window.TorganaApp. В приложении нет оплаты — ни продвижения, ни тарифов, ни раздела «Для бизнеса»
  // (правило App Store 3.1.1: цифровое — только через покупки Apple, а они в России не работают);
  // купленное на сайте работает и в приложении. Установка на экран и web-push — свои, нативные.
  const NATIVE = !!window.TorganaApp || /TorganaApp\//.test(navigator.userAgent);
  const PAY = !NATIVE;
  const nativePost = (msg) => { try { window.TorganaApp.post(msg); return true; } catch { return false; } };

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
    minus: '<path d="M5 12h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>',
    ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    camera: '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    pushpin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 16v4"/>',
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
    gift: '<rect x="3" y="8" width="18" height="5" rx="1.5"/><path d="M5 13v8h14v-8M12 8v13M12 8c-1.6-3.6-5-3.8-5-1.6C7 8 10 8 12 8zm0 0c1.6-3.6 5-3.8 5-1.6C17 8 14 8 12 8z"/>',
    megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l7 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M17.5 9a4 4 0 0 1 0 6"/><path d="M7.5 15l1.2 4.5"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.4"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    xl: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M14 5v14M14 12h7"/>',
    frame: '<rect x="4" y="4" width="16" height="16" rx="4"/><rect x="7.5" y="7.5" width="9" height="9" rx="2"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'
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
  const MARK = '<path d="M13.5 11H34.5a4.5 4.5 0 0 1 0 9H13.5L9 15.5z" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><rect x="19.5" y="15" width="9" height="24" rx="4.5" fill="#fff"/><circle cx="14.6" cy="15.5" r="1.7" fill="#3D67D0"/>';
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
  // <auto-title> 1.48.0: название из характеристик — свой стиль Торганы: короткие части через «·», полными словами
  // (вариант B владельца): «Toyota Camry · 2018 · автомат», «Квартира · 2 комнаты · 54,5 м²». Тот же код — в lib/taxonomy.js (тест сверяет).
  const TITLE_SUBS = new Set(['cars', 'moto', 'phones', 'flats', 'flats_rent', 'daily', 'rooms', 'houses', 'land', 'garages', 'commercial']);
  function autoTitle(sub, a) {
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
  // </auto-title>
  // Слова для строки в карточке: «Седан, бензин, передний привод» (то же — в app.js).
  const CARD_WORDS = {
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
  function attrText(f, v) {
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
  const attrSummary = (subId, attrs) => {
    const x = subOf(subId);
    if (!x || !attrs) return '';
    const line = (x.card || x.summary).map((k) => { const f = x.fields.find((y) => y.key === k); if (!f) return ''; if (x.card && k === 'floor' && attrs.floor !== undefined && attrs.floors !== undefined) return `${attrs.floor} этаж из ${attrs.floors}`; return attrText(f, attrs[k]); }).filter(Boolean).join(', ');
    return line ? line[0].toUpperCase() + line.slice(1) : '';
  };
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
    if (sel.hidden) b.hidden = true; // скрытый список (сортировка в режиме карты) — скрыта и кнопка
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

  // 1.34: поле города — подсказки красивым списком в стиле pickList вместо системного <datalist>.
  // Вписать город не из списка по-прежнему можно (input остаётся обычным полем). data-any — первый пункт «Вся Россия» (пусто).
  function enhanceCity(inp) {
    if (inp.dataset.enh) return;
    inp.dataset.enh = '1';
    const id = `cs-${Math.random().toString(36).slice(2, 8)}`;
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', id);
    let box = null; let items = []; let act = -1;
    const norm = (t) => String(t).toLowerCase().replace(/ё/g, 'е');
    const close = () => { if (box) { box.remove(); box = null; } inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
    function place() {
      if (!box) return;
      const r = inp.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const up = below < 220 && r.top > below;
      box.style.left = `${Math.max(8, r.left)}px`;
      box.style.width = `${Math.max(240, r.width)}px`;
      box.style.maxHeight = `${Math.min(320, (up ? r.top : below) - 8)}px`;
      box.style.top = up ? '' : `${r.bottom + 6}px`;
      box.style.bottom = up ? `${window.innerHeight - r.top + 6}px` : '';
    }
    const pick = (v) => { inp.value = v; close(); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };
    const mark = (i) => {
      act = i;
      $$('.pick-it', box).forEach((b, k) => b.classList.toggle('act', k === i));
      const el = box && $$('.pick-it', box)[i];
      if (el) { el.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', el.id); }
    };
    function open() {
      const t = norm(inp.value.trim());
      const cur = inp.value.trim();
      const all = S.config.cities || [];
      // Сначала города, которые начинаются с набранного, потом — где оно встречается внутри.
      const hit = t && !all.some((c) => norm(c) === t) ? [...all.filter((c) => norm(c).startsWith(t)), ...all.filter((c) => !norm(c).startsWith(t) && norm(c).includes(t))] : all;
      items = [...(inp.dataset.any && (!t || hit.length === all.length) ? [{ v: '', label: inp.dataset.any }] : []), ...hit.map((c) => ({ v: c, label: c }))];
      if (!items.length) { close(); return; }
      if (!box) {
        box = document.createElement('div');
        box.className = 'pick pop city-sug'; box.id = id; box.setAttribute('role', 'listbox');
        box.addEventListener('mousedown', (e) => e.preventDefault());
        box.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) pick(b.dataset.v); });
        document.body.append(box);
        window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
      }
      box.innerHTML = String(html`<div class="pick-list">${items.map((x, k) => html`<button type="button" class="pick-it${x.v === cur ? ' on' : ''}" role="option" id="${id}-${k}" data-v="${x.v}" tabindex="-1" aria-selected="${x.v === cur ? 'true' : 'false'}"><span class="pick-t"><b>${x.label}</b></span>${x.v === cur ? ic('check', 18, 2.4) : ''}</button>`)}</div>`);
      inp.setAttribute('aria-expanded', 'true');
      act = -1;
      place();
    }
    inp.addEventListener('focus', open);
    inp.addEventListener('click', () => { if (!box) open(); });
    inp.addEventListener('input', (e) => { if (e.isTrusted) open(); });
    inp.addEventListener('blur', () => setTimeout(close, 120));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && box) { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!box) open(); if (box) mark(Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1)))); return; }
      if (e.key === 'Enter' && box && act >= 0) { e.preventDefault(); pick(items[act].v); }
    });
  }
  new MutationObserver(() => $$('input[data-cities]:not([data-enh])').forEach(enhanceCity)).observe(document.body, { childList: true, subtree: true });

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
    // 1.47.3: «Владельцев по ПТС» — широкая капсула «− 2 владельца +» (вариант A): от 0 (новая) до 30.
    // В фильтре — плашки «Без владельцев», «1», «2», «3», «4+».
    if (f.custom) {
      const plus = `${f.options.length + 1}+`;
      if (filter) {
        const list = [...(f.custom.min === 0 ? ['0'] : []), ...f.options, plus];
        return html`<div class="field wide av" data-field="${f.key}">${head}<div class="av-chips" role="radiogroup" aria-label="${f.label}">
          ${list.map((o) => html`<button type="button" role="radio" class="av-chip${o === String(v) ? ' on' : ''}" data-av="${o}" aria-checked="${o === String(v) ? 'true' : 'false'}">${o === '0' ? 'Без владельцев' : o}</button>`)}</div></div>`;
      }
      const sv = has ? String(v) : '';
      const n = !has ? null : sv === plus ? f.options.length + 1 : Number(sv);
      const word = has ? (n === 0 ? 'нет — новая машина' : attrText(f, sv).replace(/^\S+\s/, '')) : '';
      return html`<div class="field wide own-a" data-field="${f.key}">${head}
        <div class="own-cap" role="group" aria-label="${f.label}">
          <button type="button" class="own-pm" data-own="-1" aria-label="Меньше" ${has ? '' : raw('disabled')}>${ic('minus', 20, 2.4)}</button>
          <span class="own-val" aria-live="polite">${has ? html`<b>${sv === plus ? plus : n}</b><small>${word}</small>` : html`<em>Не указано</em>`}</span>
          <button type="button" class="own-pm" data-own="1" aria-label="Больше" ${has && n >= f.custom.max ? raw('disabled') : ''}>${ic('plus', 20, 2.4)}</button>
        </div></div>`;
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
      // Счётчик владельцев.
      const st = e.target.closest('[data-own]');
      if (st && f.custom) {
        // «+»: «Не указано» → 0 (новая) → 1 → … → 30; «−»: обратно, с 0 — снова «Не указано».
        const cur = get(key); const sv = cur === undefined || cur === null ? '' : String(cur);
        const now = sv === '' ? null : sv === `${f.options.length + 1}+` ? f.options.length + 1 : Number(sv);
        const d = Number(st.dataset.own);
        const next = d > 0 ? (now === null ? f.custom.min : Math.min(f.custom.max, now + 1)) : (now === null || now <= f.custom.min ? undefined : now - 1);
        set(key, next === undefined ? undefined : String(next));
        paint(key);
        const again = $(`[data-field="${key}"] [data-own="${st.dataset.own}"]`, box);
        if (again && !again.disabled) again.focus();
        if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* нет вибрации */ }
        return;
      }
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
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let busy = false;
    // Листание как лента: соседнее фото едет рядом с текущим (за пальцем или по кнопке), без затемнения.
    const gw = document.createElement('div'); gw.className = 'pv-gwrap'; gw.setAttribute('aria-hidden', 'true');
    gw.innerHTML = '<img class="pv-img" alt="" draggable="false">';
    stage.appendChild(gw);
    const gimg = gw.firstChild;
    const GAP = 24;
    const EASE = 'transform .36s cubic-bezier(.22,.8,.24,1)';
    const ghostTo = (k) => { if (gimg.dataset.k !== String(k)) { gimg.src = srcs[k]; gimg.dataset.k = String(k); } };
    const ghostHide = () => { gw.style.transition = 'none'; gw.style.visibility = 'hidden'; gw.style.transform = ''; };
    const peek = (dx) => { // во время свайпа: сосед с той стороны, куда тянут
      if (!many) return;
      const dir = dx < 0 ? 1 : -1;
      ghostTo((i + dir + srcs.length) % srcs.length);
      gw.style.transition = 'none'; gw.style.visibility = 'visible';
      gw.style.transform = `translateX(${dx + dir * (stage.clientWidth + GAP)}px)`;
    };
    const slide = (k, dir, dx = 0) => {
      if (!many || busy) return;
      k = (k + srcs.length) % srcs.length;
      if (reduce) { show(k); return; }
      busy = true;
      const W = stage.clientWidth + GAP;
      ghostTo(k);
      gw.style.transition = 'none'; gw.style.visibility = 'visible'; gw.style.transform = `translateX(${dx + dir * W}px)`;
      img.style.transition = 'none'; img.style.transform = `translateX(${dx}px)`;
      void gw.offsetWidth;
      gw.style.transition = EASE; img.style.transition = EASE;
      gw.style.transform = 'translateX(0px)'; img.style.transform = `translateX(${-dir * W}px)`;
      setTimeout(() => {
        show(k);
        const done = () => { ghostHide(); img.style.transition = ''; busy = false; };
        img.decode ? img.decode().then(done, done) : done();
      }, 360);
    };
    const snapBack = (dx) => { // не дотянули — оба фото возвращаются на место
      if (!dx) { ghostHide(); apply(); return; }
      const dir = dx < 0 ? 1 : -1;
      gw.style.transition = EASE; gw.style.transform = `translateX(${dir * (stage.clientWidth + GAP)}px)`;
      apply();
      setTimeout(ghostHide, 360);
    };
    const show = (k) => {
      i = (k + srcs.length) % srcs.length; z = 1; x = 0; y = 0; apply(false);
      img.src = srcs[i];
      $('.pv-count', v).textContent = many ? `${i + 1} из ${srcs.length}` : '';
      $$('[data-pv-to]', v).forEach((b, n) => { b.classList.toggle('on', n === i); if (n === i) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); });
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
      else if (e.key === 'ArrowRight' && many) slide(i + 1, 1);
      else if (e.key === 'ArrowLeft' && many) slide(i - 1, -1);
    };
    document.addEventListener('keydown', onKey, true);
    v.addEventListener('click', (e) => {
      if (e.target.closest('[data-pv-close]')) { close(); return; }
      const nb = e.target.closest('[data-pv]'); if (nb) { slide(i + Number(nb.dataset.pv), Number(nb.dataset.pv)); return; }
      const tb = e.target.closest('[data-pv-to]'); if (tb) { const k = Number(tb.dataset.pvTo); if (k !== i) slide(k, k > i ? 1 : -1); return; }
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
      else if (moved && !busy) {
        const down = Math.abs(dy) > Math.abs(dx) && dy > 0;
        img.style.transition = 'none'; img.style.transform = down ? `translateY(${dy}px)` : `translateX(${dx}px)`;
        v.style.backgroundColor = down ? `rgba(11, 11, 11, ${Math.max(0.3, 1 - dy / 400)})` : '';
        if (down) ghostHide(); else peek(dx);
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size || !start0) return;
      const dx = e.clientX - start0.px; const dy = e.clientY - start0.py;
      v.style.backgroundColor = '';
      if (z === 1 && moved) {
        if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
        const fast = Math.abs(dx) / Math.max(1, Date.now() - start0.t) > 0.35;
        if (many && !busy && (Math.abs(dx) > 60 || (fast && Math.abs(dx) > 24)) && Math.abs(dx) > Math.abs(dy)) { start0 = null; slide(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1, dx); return; }
        if (!busy) snapBack(Math.abs(dx) > Math.abs(dy) ? dx : 0);
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

  // Красный градиент для сердечка «В избранное» (1.35.2) — один на страницу, на него ссылаются стили .fav-btn.
  document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><linearGradient id="tg-heart" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6B6B"/><stop offset="1" stop-color="#E0115F"/></linearGradient></defs></svg>');

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

  // 1.48.0: оформление — как на устройстве, светлое или тёмное (выбор хранится на этом устройстве; до отрисовки его ставит theme.js).
  const THEMES = [['auto', 'auto', 'Как на устройстве', 'Само переключится вместе с телефоном или компьютером'], ['light', 'sun', 'Светлое', 'Всегда светлое'], ['dark', 'moon', 'Тёмное', 'Бережёт глаза вечером']];
  const themeGet = () => { try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; } };
  const darkNow = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const themeMeta = () => { const m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', darkNow() ? '#0F121B' : '#FFFFFF'); };
  function themeSet(t) {
    try { if (t === 'auto') localStorage.removeItem('theme'); else localStorage.setItem('theme', t); } catch { /* закрытое хранилище — до перезагрузки */ }
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    themeMeta();
  }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeMeta); } catch { /* старый браузер */ }

  // 1.48.0: заблокировать / разблокировать. Возвращает новое состояние (true — заблокирован) или undefined — передумали.
  async function blockFlow(user, blocked) {
    try {
      if (blocked) {
        await api('DELETE', `/api/blocks/${user.id}`);
        toast(`${user.name} разблокирован — снова может вам писать`);
        return false;
      }
      const ok = await confirmModal(`Заблокировать ${user.name}?`, 'Он не сможет писать вам и предлагать цену, а его объявления пропадут из вашей ленты и поиска. Разблокировать можно в любой момент — здесь или в настройках, раздел «Чёрный список».', 'Заблокировать', true);
      if (!ok) return undefined;
      await api('POST', '/api/blocks', { userId: user.id });
      toast('Заблокирован. Если он нарушает правила — напишите в поддержку, модератор разберётся');
      return true;
    } catch (e) { toast(e.message, true); return undefined; }
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
        <a href="/favorites" class="icon-btn hd-ic hide-m" aria-label="Избранное" title="Избранное">${ic('heart', 22, 1.8)}</a>
        <a href="/messages" class="icon-btn hd-ic hide-m" aria-label="Сообщения" title="Сообщения">${ic('chat', 22, 1.8)}<span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span></a>
        ${S.user ? html`<button type="button" class="icon-btn hd-ic bell-btn" data-bell aria-label="Уведомления" title="Уведомления" aria-haspopup="dialog">${ic('bell', 22, 1.8)}<span class="badge ${S.notices ? '' : 'hidden'}" data-notices>${S.notices || 0}</span></button>` : ''}
        <a href="/new" class="btn btn-dark btn-sm hide-m hd-new">${ic('plus', 17, 2.4)}Разместить</a>
        ${S.user ? '' : html`<a href="/login" class="nav-link hide-m">Войти</a>`}
        <button type="button" class="menu-btn menu-pill" data-menu aria-label="${S.user ? 'Меню профиля' : 'Меню'}" aria-haspopup="dialog">${ic('menu', 18, 2)}${S.user ? ava(S.user, 'mp-ava') : html`<span class="mp-ava mp-guest">${ic('user', 17, 1.9)}</span>`}</button>
      </nav>
    </div>`);
    $('[data-menu]', $('#header')).onclick = openMenu;
    const bell = $('[data-bell]', $('#header'));
    if (bell) bell.onclick = openNotices;
  }

  // ================= уведомления (1.22) =================
  // Колокольчик: решения модерации, оплата, продвижение, снижение цен. Панель справа, по дням.
  // 1.56.0: в приложении — число на значке: непрочитанные сообщения и уведомления.
  const appBadge = () => { if (NATIVE) nativePost({ type: 'badge', count: (S.unread || 0) + (S.notices || 0) }); };
  function setNotices(n) {
    S.notices = n || 0;
    appBadge();
    $$('[data-notices]').forEach((el) => { el.textContent = S.notices > 99 ? '99+' : S.notices; el.classList.toggle('hidden', !S.notices); });
  }
  // 1.47.2: у всех уведомлений один вид — картинка (фото объявления или знак Торганы) и цветной значок события в углу.
  // Цвет события (1.25): зелёный — опубликовано, красный — нужно исправить, жёлтый — сроки,
  // синий — оплата и возвраты, фиолетовый — продвижение.
  const NOTICE_COLOR = { check: 'green', warn: 'red', clock: 'amber', star: 'amber', store: 'amber', card: 'blue', megaphone: 'violet', tag: 'violet', bolt: 'violet', down: 'green', shield: 'green' };
  const noticeColor = (n) => (n.tone === 'bad' ? 'red' : NOTICE_COLOR[n.icon] || (n.tone === 'ok' ? 'green' : n.tone === 'wait' ? 'amber' : 'gray'));
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
        ${list.map((n) => { const col = noticeColor(n); const icn = ic(P[n.icon] ? n.icon : 'bell', 12, 2.6); return html`<a class="nt-it${n.read ? '' : ' new'}" href="${n.url || '#'}">
          ${n.icon === 'medal' ? html`<span class="nt-ph medal">${firstMedal(30)}</span>` /* 1.52.0: медаль «Один из первых» */
    : html`<span class="nt-ph${n.photo ? '' : ' brand'}">${n.photo ? html`<img src="${n.photo}" alt="" loading="lazy">` : html`<svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">${raw(MARK)}</svg>`}<i class="nt-badge ${col}">${icn}</i></span>`}
          <span class="nt-t"><b>${n.title}</b>${n.body ? html`<span>${n.body}</span>` : ''}<small>${hm(n.at)}</small></span></a>`; })}`)}`
        : html`<div class="nt-empty"><span class="nt-empty-ic">${ic('bell', 30, 1.6)}</span><b>Здесь будут уведомления</b><p>Напишем, когда объявление опубликуют или подешевеет товар из избранного.</p></div>`);
      if (d.unread) { api('POST', '/api/notices/read', {}).then((r) => setNotices(r.unread)).catch(() => {}); }
    });
  }

  function renderBottomNav() {
    const p = location.pathname;
    const on = (cond) => (cond ? 'on' : '');
    // 1.28 (вариант 4): открытый раздел — прозрачная изумрудная «таблетка» с названием, остальные — иконки.
    const item = (href, icon, label, cond, extra = '') => html`<a href="${href}" class="${on(cond)}" aria-label="${label}"${cond ? raw(' aria-current="page"') : ''}><span class="bn-i">${ic(icon, 23, cond ? 2 : 1.8)}${extra}</span><span class="bn-t" aria-hidden="true">${label}</span></a>`;
    $('#bottom-nav').innerHTML = String(html`
      ${item('/', 'home', 'Главная', p === '/' || p === '/search')}
      ${item('/favorites', 'heart', 'Избранное', p === '/favorites')}
      <a href="/new" class="plus" aria-label="Разместить объявление">${ic('plus', 22, 2.4)}</a>
      ${item('/messages', 'chat', 'Сообщения', p.startsWith('/messages'), html`<span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span>`)}
      ${item(S.user ? '/profile' : '/login', 'user', 'Профиль', p.startsWith('/profile') || p === '/login')}`);
  }

  // Подвал: знак и кнопка поддержки, разделы (на телефоне раскрываются), контакты, © с реквизитами оператора, документы. Последняя колонка FOOTER_COLS — документы (их же показывает меню ≡).
  const FOOTER_COLS = [
    ['Покупателям', [['/page/help', 'Как искать'], ['/page/safety', 'Безопасность'], ['/favorites', 'Избранное']]],
    ['Продавцам', [['/new', 'Разместить объявление'], ...(PAY ? [['/business', 'Для бизнеса']] : []), ['/page/rules', 'Правила площадки']]],
    ['Помощь', [['/page/support', 'Поддержка'], ['/page/contacts', 'Реквизиты и контакты']]],
    ['Документы', [['/page/terms', 'Пользовательское соглашение'], ['/page/privacy', 'Конфиденциальность'], ['/page/consent', 'Согласие на обработку данных']]]
  ];
  const FOOTER_NARROW = '(max-width: 760px)';
  function renderFooter() {
    const op = S.config.operator;
    const mail = S.config.supportEmail;
    const cols = FOOTER_COLS.slice(0, -1);
    const docs = FOOTER_COLS[FOOTER_COLS.length - 1][1];
    const footer = $('#footer');
    // 1.30 (вариант 2): светло-серая плита; слева знак и разделы, справа белая карточка «Нужна помощь?».
    footer.innerHTML = String(html`<div class="wrap">
      <div class="f-main">
        <div class="f-grid">
          <div class="f-brand">${logo()}<p class="f-tag"><b>Сторгуемся!</b>Объявления по всей России — бесплатно и с проверкой модератора</p></div>
          ${cols.map(([t, ls]) => html`<details class="fcol" open><summary><h4>${t}</h4>${ic('down', 18, 2)}</summary><ul>${ls.map(([href, label]) => html`<li><a href="${href}">${label}</a></li>`)}</ul></details>`)}
        </div>
        <div class="f-help">
          <div class="f-help-h"><span class="f-help-ic">${ic('headset', 20)}</span><b>Нужна помощь?</b></div>
          <p>Отвечают модераторы, а не бот.${mail ? ' Можно и на почту.' : ''}</p>
          <a class="btn btn-accent btn-block" href="/messages/support">Написать в поддержку</a>
          ${mail ? html`<a class="f-mail" href="mailto:${mail}">${mail}</a>` : ''}
        </div>
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
    appBadge();
    $$('[data-unread]').forEach((el) => { el.textContent = n; el.classList.toggle('hidden', !n); });
  }
  // Новое у продавцов, на которых подписан, — значок у пункта «Подписки».
  function setFresh(f) {
    S.fresh = f || { price: 0, follow: 0 };
    $$('[data-fresh-follow]').forEach((el) => { el.textContent = S.fresh.follow || 0; el.classList.toggle('hidden', !S.fresh.follow); });
  }

  // ================= карточки =================
  // it.ad — карточка из блока «Реклама»: пометка и рекламодатель по кнопке «Реклама».
  // it.boost — продвижение в ленте (lib/boost.js): XL — на две ячейки (на телефоне — во всю ширину) с ещё двумя фото
  // и началом описания, рамка — синяя обводка в цвет Торганы, tags — метки на фото. Подписи «Продвигается» на карточке нет (1.43.1).
  const boostImg = (src, cls = '', extra = '') => html`<span class="xl-ph ${cls}${src ? ' ph' : ''}"${src ? raw(` style="--ph:url('${esc(src)}')"`) : ''}>${src ? html`<img src="${src}" alt="" loading="lazy">` : svg(P.image, 28, 1.2)}${extra}</span>`;
  // 1.26 (вариант 7 «С продавцом»): под описанием карточки — фото и имя продавца, значок уровня (1.46.0), если он есть.
  const cardSeller = (s) => html`<span class="card-seller">${ava(s, 'xs')}<span class="cs-name">${s.name}</span>${s.shop ? html`<span class="cs-shop" title="Магазин на Торгане">${ic('store', 12, 2.2)}<span class="sr">Магазин</span></span>` : ''}${s.level ? html`<span class="cs-rate" title="${['', 'Надёжный', 'Опытный', 'Мастер Торганы'][s.level]} продавец">${levelMedal(s.level, 14)}</span>` : ''}</span>`;
  function card(it) {
    const meta = [it.metro ? `м. ${it.metro}` : it.city, shortWhen(it.createdAt)].filter(Boolean).join(' · ');
    const ad = it.ad;
    const bo = !ad && it.boost && it.status !== 'sold' ? it.boost : null;
    const xl = !!(bo && bo.xl);
    const tags = bo && bo.tags && bo.tags.length ? bo.tags : null;
    const side = xl ? [...(bo.photos || [])] : [];
    // «Новое» / «Цена упала» — внизу слева на фото, где им не мешает сердечко.
    // 1.48.0: «Хорошая цена» — дешевле похожих (lib/goodprice.js); важнее «Новое» и «Цена упала».
    const low = tags || ad || it.status === 'sold' ? '' : it.goodPrice ? html`<span class="tag drop-badge is-good" title="Цена ниже, чем у похожих объявлений на Торгане">${ic('check', 12, 3)}Хорошая цена</span>` : it.fresh ? html`<span class="tag drop-badge">Новое</span>`
      : it.priceWas ? html`<span class="tag drop-badge is-drop" title="Цена упала, было ${price(it.priceWas, it.priceUnit)}">Цена упала</span>` : '';
    return html`<div class="card${ad ? ' is-ad' : ''}${xl ? ' is-xl' : ''}${bo && bo.frame ? ' is-frame' : ''}">
      <a href="${lpath(it)}" class="card-link"${ad ? raw(` data-adid="${Number(ad.id)}"`) : ''}>
        <div class="card-img${xl ? ' xl-img' : it.photo ? ' ph' : ''}"${!xl && it.photo ? raw(` style="--ph:url('${esc(it.photo)}')"`) : ''}>
          ${xl ? boostImg(it.photo, 'main') : it.photo ? html`<img src="${it.photo}" alt="" loading="lazy">` : svg(P.image, 40, 1.2)}
          ${xl ? html`<span class="xl-side">${boostImg(side[0])}${boostImg(side[1], '', bo.more ? html`<em>+${bo.more} фото</em>` : '')}</span>` : ''}
          ${tags ? html`<span class="b-tags">${tags.map((t, i) => html`<span class="b-tag${i ? ' alt' : ''}" title="${t}"><span>${t}</span></span>`)}</span>` : ''}
          ${!ad && it.status === 'sold' ? html`<span class="tag dark sold-badge">Продано</span>` : ''}
          ${low ? html`<span class="b-low">${low}</span>` : ''}
          ${xl ? html`<span class="price-pill">${price(it.price, it.priceUnit)}</span>` : ''}
          ${it.hasVideo ? html`<span class="vid-badge" title="Есть видео">${ic('play', 14, 0)}<span class="sr">Есть видео</span></span>` : ''}
        </div>
        <div class="card-body">
          ${xl ? '' : html`<span class="card-price">${price(it.price, it.priceUnit)}</span>`}
          <span class="card-title">${it.title}</span>
          ${xl && (bo.desc || it.summary) ? html`<span class="card-desc">${[it.summary, bo.desc].filter(Boolean).join('. ')}</span>` : it.summary ? html`<span class="card-sum">${it.summary}</span>` : ''}
          <span class="card-meta">${meta}</span>
          ${it.delivery || it.exchange ? html`<span class="card-perks">${ic(it.delivery ? 'truck' : 'refresh', 13, 2.2)}${[it.delivery && 'Доставка', it.exchange && 'Обмен'].filter(Boolean).join(' · ')}</span>` : ''}
          ${it.seller ? cardSeller(it.seller) : ''}
        </div>
      </a>
      <button type="button" class="fav-btn ${it.isFav ? 'on' : ''}" data-fav="${it.id}" aria-label="${it.isFav ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${it.isFav ? 'true' : 'false'}">${ic('heart', 20)}</button>
      ${ad ? html`<button type="button" class="ad-mark" data-ad-info="${ad.id}" data-adv="${ad.advertiser}" data-inn="${ad.inn}" aria-label="Реклама — о рекламодателе">Реклама${ic('info', 13, 2)}</button>` : ''}
    </div>`;
  }
  const grid = (items) => html`<div class="grid">${items.map(card)}</div>`;
  // Заглушки появляются, только если загрузка дольше трети секунды — иначе при обновлении они мелькают.
  // Фото в карточке: размытая подложка и само фото проявляются вместе, когда фото загрузилось (без мелькания).
  document.addEventListener('load', (e) => { const t = e.target; if (t.tagName === 'IMG' && t.parentElement && t.parentElement.classList.contains('card-img')) t.parentElement.classList.add('ok'); }, true);
  document.addEventListener('error', (e) => { const t = e.target; if (t.tagName === 'IMG' && t.parentElement && t.parentElement.classList.contains('card-img')) t.parentElement.classList.add('ok'); }, true);
  new MutationObserver(() => { for (const im of document.querySelectorAll('.card-img.ph:not(.ok) > img')) if (im.complete) im.parentElement.classList.add('ok'); }).observe(document.documentElement, { childList: true, subtree: true });
  const skeletonGrid = (n = 8) => html`<div class="grid skel-grid">${Array.from({ length: n }, () => html`<div><div class="skeleton" style="aspect-ratio:1/1"></div><div class="skeleton" style="height:16px;margin-top:12px;border-radius:8px;width:80%"></div></div>`)}</div>`;

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

  // «Реклама» на карточке: кто рекламодатель.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ad-info]');
    if (!b) return;
    e.preventDefault();
    openModal(String(html`<h2>Реклама</h2>
      <div class="adm-facts ad-facts"><div><span>Рекламодатель</span><b>${b.dataset.adv}</b></div>${b.dataset.inn ? html`<div><span>ИНН</span><b>${b.dataset.inn}</b></div>` : ''}</div>
      <p class="muted" style="margin:14px 0 0;font-size:14px">Продавец оплатил показ объявления в блоке «Реклама». Объявление подобрано по вашему запросу, фильтрам и городу — мы не собираем сведения о ваших предпочтениях. Обычная выдача от рекламы не меняется.</p>
      <div class="modal-actions">${PAY ? html`<a class="btn btn-soft" href="/business">Как это работает</a>` : ''}<button class="btn btn-dark" data-x>Понятно</button></div>`), (m, close) => { $('[data-x]', m).onclick = close; m.addEventListener('click', (ev) => { if (ev.target.closest('a[href]')) close(); }); });
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
  // 1.47.2: фильтры поиска закрыты и на компьютере; открытые остаются открытыми при смене фильтра (страница перерисовывается).
  let filtersOpen = false;
  // 1.51.1: «Назад» и «Вперёд» возвращают туда же, где читали: у записи истории — прокрутка и сколько карточек ленты
  // было загружено. Браузер сам прокрутку не восстанавливает — страница рисуется заново, позже его попытки.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  let restoreTo = null; // { y, n } — запись истории, на которую вернулись «Назад»/«Вперёд»
  let backTo = null; // то же на время отрисовки страницы (читает лента)
  let feedN = 0; // сколько карточек загрузила лента на текущей странице
  function rememberPlace() {
    try { history.replaceState({ ...(history.state || {}), y: Math.round(window.scrollY), n: feedN }, ''); } catch { /* слишком часто — не важно */ }
  }
  function go(url, replace = false) {
    if (!replace) rememberPlace();
    history[replace ? 'replaceState' : 'pushState']({}, '', url);
    window.dispatchEvent(new Event('torgana:route')); // закрыть подсказки, привязанные к старой странице
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
  window.addEventListener('popstate', (e) => { restoreTo = e.state && e.state.y != null ? e.state : null; render(); });
  window.addEventListener('pagehide', rememberPlace); // ушли на другой сайт или обновили — вернёмся на то же место
  window.addEventListener('scroll', () => $('#header').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

  const ROUTES = [
    [/^\/$/, viewHome],
    [/^\/search$/, viewSearch],
    [/^\/l\/(\d+)(?:-[a-z0-9-]*)?$/, viewListing],
    [/^\/c\/([a-z]+(?:\/[a-z0-9_-]+)?(?:\/[a-z0-9-]+)?)$/, viewCategory],
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
    [/^\/profile(?:\/(listings|settings|reputation|reviews|searches|following|stats\/\d+|business(?:\/(?:shop|stats))?))?$/, viewProfile],
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
    const keep = S.keep; S.keep = null;
    backTo = restoreTo || (!S.from && history.state && history.state.y != null ? history.state : null); // «Назад» или возврат на страницу
    const back = backTo;
    restoreTo = null; feedN = 0;
    window.scrollTo(0, 0);
    // Профиль временно удалён — после входа открыт только экран восстановления (и правила).
    if (S.user && S.user.deactivatedAt && !path.startsWith('/page/')) { viewDeactivated(); return; }
    if (!PAY && /^\/(business|pay|profile\/business)(\/|$)/.test(path)) { history.replaceState(null, '', '/profile'); render(); return; } // в приложении оплаты нет
    if (!r) { viewNotFound(); return; }
    const m = path.match(r[0]);
    try {
      const done = r[1](m[1], q);
      if (keep) { // фильтры применились на месте: остаёмся там же, где были
        window.scrollTo(0, keep.y);
        const f = $('#filters'); if (f) f.scrollTop = keep.fy;
        const el = keep.focus && document.getElementById(keep.focus); if (el) el.focus({ preventScroll: true });
      }
      await done;
      backTo = null;
      if (back && back.y && !keep) window.scrollTo(0, back.y);
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
  // Переход: откуда открыли объявление. Показ: карточка в поиске, ленте или категории видна наполовину не меньше секунды.
  // Показы и «переходы из выдачи» считаются на одних и тех же страницах (главная, поиск, категории, блок «Реклама»),
  // поэтому доля «из показа в переход» честная и не бывает больше 100%.
  // Сервер сам решает, засчитывать ли (раз в сутки на человека, без продавца, роботов и сверх лимитов).
  function statSource() {
    if (S.adClick && S.adClick === location.pathname) { S.adClick = null; return 'ad'; }
    S.adClick = null;
    if (!S.from) return 'external';
    const u = new URL(S.from, location.origin);
    if (u.pathname === '/') return 'home';
    if (u.pathname === '/search') return u.searchParams.get('q') ? 'search' : 'category';
    if (u.pathname.startsWith('/c/')) return 'category';
    return 'other';
  }
  const imp = { queue: new Set(), ads: new Set(), sent: new Set(), timers: new Map(), io: null, mo: null };
  function watchImpressions() {
    if (imp.io) { imp.io.disconnect(); imp.io = null; }
    if (imp.mo) { imp.mo.disconnect(); imp.mo = null; }
    imp.timers.forEach((t) => clearTimeout(t)); imp.timers.clear();
    const p = location.pathname;
    if ((p !== '/' && p !== '/search' && !p.startsWith('/c/')) || !('IntersectionObserver' in window)) return;
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
  // map — как показать карточку (например, без строки продавца в его же профиле).
  function listingFeed(box, params, { limit = 24, empty, onFirst, auto = false, map = null }) {
    const more = box.nextElementSibling;
    let offset = 0; let total = Infinity; let busy = false; let io = null; let dead = false;
    const want = backTo && backTo.n > limit ? Math.min(backTo.n, 60) : limit; // «Назад»: сразу столько, сколько видели (сервер отдаёт до 60 за раз)
    const load = async () => {
      if (busy || dead || offset >= total) return;
      busy = true;
      try {
        const data = await api('GET', `/api/listings?${new URLSearchParams({ ...params, limit: offset ? limit : want, offset })}`);
        if (!box.isConnected || dead) return; // ленту уже сменили (другая категория на главной)
        if (map) data.items = data.items.map(map);
        if (offset === 0) {
          if (onFirst) onFirst(data);
          box.innerHTML = String(data.items.length ? grid(data.items) : empty);
        } else {
          $('.grid', box).insertAdjacentHTML('beforeend', data.items.map((i) => String(card(i))).join(''));
        }
        offset += data.items.length; feedN = offset;
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
    return { first: load(), stop: () => { dead = true; if (io) io.disconnect(); } };
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
    // 1.38.1: капсула категории переключает ленту на месте (/?cat=…), без перехода в поиск.
    let cat = new URLSearchParams(location.search).get('cat') || '';
    if (!S.config.categories.some((c) => c.id === cat)) cat = '';
    app.innerHTML = String(html`
      <section class="wrap home-top">
        <h1 class="sr">Торгана — объявления по всей России</h1>
        <form class="search home-search" role="search" data-search>
          ${ic('search', 20)}
          <label class="sr" for="q">Что вы ищете</label>
          <input id="q" name="q" type="search" placeholder="Поиск" autocomplete="off" enterkeyhint="search">
          <button type="button" class="hs-city" data-city-btn aria-label="Город: ${S.city || 'Вся Россия'}">${ic('pin', 15, 2)}<span>${S.city || 'Вся Россия'}</span></button>
          <button class="hs-go" type="submit" aria-label="Найти">${ic('search', 16, 2.2)}</button>
        </form>
        <div class="cat-rail"><button type="button" class="cat-arrow prev" data-cat-scroll="-1" aria-label="Назад">${ic('left', 18, 2.2)}</button>
          <nav class="cat-pills" aria-label="Категории"><a class="cat-pill ${cat ? '' : 'on'}" data-cat="" href="/search${S.city ? `?city=${encodeURIComponent(S.city)}` : ''}" ${cat ? '' : raw('aria-current="true"')}>${ic('list', 17, 2)}Все</a>${S.config.categories.map((c) => html`<a class="cat-pill ${c.id === cat ? 'on' : ''}" data-cat="${c.id}" href="${cpath(c.id, S.city)}" ${c.id === cat ? raw('aria-current="true"') : ''}>${catIc(c.id, 18)}${c.name}</a>`)}</nav>
          <button type="button" class="cat-arrow next" data-cat-scroll="1" aria-label="Дальше">${ic('right', 18, 2.2)}</button></div>
      </section>

      <section class="wrap home-feed">
        <div class="section-head"><h2 id="feed-h"></h2><a id="feed-all" href="/search">Смотреть все</a></div>
        <div id="feed" class="feed">${skeletonGrid(15)}</div>
        <div class="more hidden"></div>
      </section>`);
    let feed = null;
    const startFeed = () => {
      if (feed) feed.stop();
      $$('.ads-row.feed').forEach((x) => x.remove());
      const name = cat ? catName(cat) : '';
      $('#feed-h').textContent = name ? `${name}${S.city ? ` · ${S.city}` : ''}` : `Свежие объявления${S.city ? ` · ${S.city}` : ''}`;
      $('#feed-all').href = cat ? cpath(cat, S.city) : `/search${S.city ? `?city=${encodeURIComponent(S.city)}` : ''}`;
      const params = { ...(S.city ? { city: S.city } : {}), ...(cat ? { category: cat } : {}) };
      const box = $('#feed');
      box.innerHTML = String(skeletonGrid(cat ? 9 : 15));
      feed = listingFeed(box, params, {
        limit: 30,
        auto: true,
        empty: cat ? html`<div class="empty"><h3>В разделе «${name}» пока пусто${S.city ? ` · ${S.city}` : ''}</h3><p>Станьте первым — разместить объявление бесплатно.</p><a class="btn btn-dark" href="/new">Разместить объявление</a></div>`
          : html`<div class="empty"><h3>${S.city ? `В городе ${S.city} пока нет объявлений` : 'Здесь появятся первые объявления'}</h3><p>Разместите своё — это бесплатно и займёт пару минут.</p><a class="btn btn-dark" href="/new">Разместить объявление</a></div>`
      });
      // ряд «Реклама» встаёт над лентой — ждём его, чтобы «Назад» вернул на то же место
      return feed.first.then(() => adRow(box, params, 'feed', S.city ? `в городе ${S.city}` : '').catch(() => {}));
    };
    $('.cat-pills').addEventListener('click', (e) => {
      const a = e.target.closest('[data-cat]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; // в новой вкладке — обычная страница раздела
      e.preventDefault();
      if (a.dataset.cat === cat) return;
      cat = a.dataset.cat;
      $$('.cat-pill').forEach((x) => { const on = x === a; x.classList.toggle('on', on); if (on) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
      a.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      history.replaceState(history.state, '', cat ? `/?cat=${cat}` : '/');
      startFeed().catch((ex) => toast(ex.message, true));
    });
    // Стрелки ленты категорий: видны, только когда есть куда листать.
    const rail = $('.cat-rail'); const pills = $('.cat-pills', rail);
    const railPaint = () => { rail.classList.toggle('can-prev', pills.scrollLeft > 4); rail.classList.toggle('can-next', pills.scrollLeft + pills.clientWidth < pills.scrollWidth - 4); };
    pills.addEventListener('scroll', railPaint, { passive: true });
    $$('[data-cat-scroll]', rail).forEach((b) => { b.onclick = () => pills.scrollBy({ left: Number(b.dataset.catScroll) * pills.clientWidth * 0.7 }); });
    window.addEventListener('resize', railPaint);
    railPaint();
    cleanup = () => { if (feed) feed.stop(); window.removeEventListener('resize', railPaint); };
    await startFeed();
    if (cat) $('.cat-pill.on').scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  // ================= поиск =================
  // Страницы разделов (как в lib/seo.js): /c/:категория, /c/:категория/:раздел, /c/:категория/:город,
  // /c/:категория/:раздел/:город. Внутри — обычный поиск и внизу блок «О разделе».
  function viewCategory(part) {
    const [cat, a, b] = part.split('/');
    const sub = a && subsOf(cat).some((x) => x.id === a) ? a : '';
    const citySlug = sub ? b : a;
    const city = citySlug ? S.config.cities.find((c) => slugify(c) === citySlug) : '';
    if (!S.config.categories.some((c) => c.id === cat) || (citySlug && !city) || (!sub && b)) { viewNotFound(); return undefined; }
    return viewSearch(null, new URLSearchParams({ category: cat, ...(sub ? { sub } : {}), ...(city ? { city } : {}) }), { category: cat, sub, city });
  }
  // Блок «О разделе»: числа, города и соседние разделы — с сервера (/api/sections/info), из настоящих объявлений.
  // Сумма для примера запроса — в том виде, который понимает поиск (lib/search.js: «2 млн», «800к»; дроби он не разбирает).
  const shortSum = (n) => (n >= 1e6 ? `${Math.max(1, Math.round(n / 1e6))} млн` : n >= 1000 ? `${Math.round(n / 1000)}к` : String(n));
  function secAbout(d) {
    const tile = (icon, tone, v, t) => html`<div class="sa-tile"><span class="bz-ic ${tone}">${ic(icon, 19, 1.9)}</span><span><b>${v}</b><span>${t}</span></span></div>`;
    const priced = d.count && d.min !== null && d.max !== null;
    const word = (d.name.split(/[ ,—]+/)[0] || '').toLowerCase();
    const example = priced && d.max > 0 ? `${word} до ${shortSum(Math.max(d.min, Math.round((d.min + d.max) / 2 / 1000) * 1000))}` : word;
    return html`<div class="sa-main">
        <span class="bz-label">О разделе</span><h2>${d.h1} на Торгане</h2>
        <div class="sa-tiles">${tile('list', 'green', NF.format(d.count), plural(d.count, 'объявление', 'объявления', 'объявлений'))}${priced ? (d.min === d.max ? tile('tag', 'blue', rub(d.min), 'цена') : html`${tile('down', 'blue', rub(d.min), 'самая низкая цена')}${tile('trend', 'amber', rub(d.max), 'самая высокая')}`) : ''}</div>
        <p>Все объявления прошли проверку модератором. Ищите обычными словами и уточняйте фильтрами: ${d.fields.length ? d.fields.join(', ') : 'раздел, город, цена и доставка'}.</p>
        ${example ? html`<form class="sa-search" data-search role="search"><span>${ic('search', 18)}</span><label class="sr" for="sa-q">Поиск</label><input id="sa-q" name="q" type="search" placeholder="Например: ${example}" autocomplete="off" enterkeyhint="search"><button class="btn btn-accent btn-sm" type="submit">Найти</button></form>` : ''}
        <a class="sa-safe" href="/page/safety"><span>${ic('shield', 18)}</span><span class="sa-safe-t">Договаривайтесь в чате Торганы и не вносите предоплату незнакомым продавцам.<b>Как покупать безопасно ›</b></span></a>
      </div>
      <div class="sa-side">
        ${d.cities.length ? html`<div class="sa-h"><span class="bz-ic green sm">${ic('pin', 16, 2)}</span><b>${d.name} в других городах</b></div>
        <div class="sa-chips">${d.cities.map((c) => html`<a href="${c.path}">${c.name}${c.n ? html`<span>${NF.format(c.n)}</span>` : ''}</a>`)}</div>` : ''}
        ${d.subs.length ? html`<div class="sa-h"><span class="bz-ic violet sm">${ic('list', 16, 2)}</span><b>${d.sub ? `Рядом в разделе «${d.catName}»` : 'Разделы'}</b></div>
        <div class="sa-links">${d.subs.map((x) => html`<a href="${x.path}"><span>${x.label}</span>${x.n ? html`<em>${NF.format(x.n)}</em>` : ''}${ic('right', 16, 2)}</a>`)}</div>` : ''}
      </div>`;
  }

  async function viewSearch(_, q, sec = null) {
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
    const onMap = S.config.maps && params.view === 'map';
    const nFilters = ['category', 'city', 'min', 'max', 'delivery', 'bargain', 'exchange', 'trusted', 'metro'].filter((k) => params[k]).length + (sub ? 1 : 0) + Object.keys(params).filter((k) => k.startsWith('a_') && params[k]).length;
    app.innerHTML = String(html`<div class="wrap search-page">
      <aside class="filters ${filtersOpen && !window.matchMedia('(max-width: 900px)').matches ? '' : 'collapsed'}" id="filters">
        <button type="button" class="btn btn-soft btn-block" id="filters-toggle" aria-controls="filter-form" aria-expanded="false">${ic('filter', 18)}Фильтры${nFilters ? html`<span class="f-count">${nFilters}</span>` : ''}</button>
        <form id="filter-form" class="filters-body">
          <div class="f-head"><h3>Фильтры</h3><button type="button" class="icon-btn f-close" data-f-close aria-label="Скрыть фильтры">${ic('close', 20, 2)}</button></div>
          <input type="hidden" name="q" value="${params.q || ''}">
          <div class="f-row2">
            <div class="field"><label for="f-cat">Категория</label>
              <select id="f-cat" name="category" class="select"><option value="">Все категории</option>
                ${S.config.categories.map((c) => html`<option value="${c.id}" ${c.id === category ? raw('selected') : ''}>${c.name}</option>`)}
              </select></div>
            <div class="field"><label for="f-city">Город</label>
              <input id="f-city" name="city" class="input" data-cities data-any="Вся Россия" autocomplete="off" placeholder="Вся Россия" value="${params.city || ''}"></div>
          </div>
          <div id="f-metro"></div>
          <div id="f-extra" class="f-extra"></div>
          <div class="field"><span class="label">Цена, ₽</span>
            <div class="row"><label class="sr" for="f-min">Цена от</label><input id="f-min" name="min" class="input" inputmode="numeric" placeholder="от" value="${params.min || ''}">
            <label class="sr" for="f-max">Цена до</label><input id="f-max" name="max" class="input" inputmode="numeric" placeholder="до" value="${params.max || ''}"></div></div>
          <div class="f-switches">${[['delivery', 'С доставкой'], ['bargain', 'Торг уместен'], ['exchange', 'Возможен обмен'], ['trusted', 'Надёжные продавцы']].map(([k, t]) => html`<label class="switch"><span>${t}</span><input type="checkbox" name="${k}" value="1" ${params[k] === '1' ? raw('checked') : ''}><span class="track"></span></label>`)}</div>
          <div class="f-go"><button class="btn btn-dark btn-block" type="submit" id="f-show">Показать</button>
          <a href="/search${params.q ? `?q=${encodeURIComponent(params.q)}` : ''}" class="btn btn-soft btn-block">Сбросить</a></div>
        </form>
      </aside>
      <section class="results">
        <div class="results-head">
          <div class="rh-title"><h1>${title}</h1><div class="muted" id="count">&nbsp;</div></div>
          <div class="rh-tools">
            <button type="button" class="rh-filters" id="filters-open" aria-controls="filter-form" aria-expanded="false">${ic('sliders', 17, 2)}<span>Фильтры</span>${nFilters ? html`<span class="f-count">${nFilters}</span>` : ''}</button>
            <label class="sr" for="sort">Сортировка</label>
            <select id="sort" ${onMap ? raw('hidden') : ''} class="select">
              <option value="">Сначала новые</option>
              <option value="cheap" ${params.sort === 'cheap' ? raw('selected') : ''}>Сначала дешевле</option>
              <option value="expensive" ${params.sort === 'expensive' ? raw('selected') : ''}>Сначала дороже</option>
            </select>
            ${S.config.maps ? html`<nav class="seg view-sw" aria-label="Вид">${[['', 'Список', 'list'], ['map', 'Карта', 'pin']].map(([v, t, i]) => html`<a href="/search?${new URLSearchParams(Object.entries({ ...params, view: v }).filter(([, x]) => x))}" class="${(params.view === 'map') === (v === 'map') ? 'on' : ''}" ${(params.view === 'map') === (v === 'map') ? raw('aria-current="page"') : ''} aria-label="${t}">${ic(i, 17, 2)}<span>${t}</span></a>`)}</nav>` : ''}
          </div>
        </div>
        ${subChips.length ? html`<nav class="sub-chips" aria-label="Разделы">${subChips.map((x) => html`<a class="chip" href="/search?${new URLSearchParams({ ...params, category, sub: x.id })}">${x.name}</a>`)}</nav>` : ''}
        ${activeChips.length ? html`<div class="active-chips">${activeChips.map(([t, href]) => html`<a class="chip on" href="${href}" aria-label="Убрать: ${t}">${t}${ic('close', 14, 2.2)}</a>`)}</div>` : ''}
        <div class="understood" id="understood"></div>
        <div id="results">${skeletonGrid(9)}</div>
        <div class="more hidden"></div>
        ${sec ? html`<section class="sec-about" id="sec-about" aria-label="О разделе"></section>` : ''}
      </section>
    </div>`);
    if (sec) {
      api('GET', `/api/sections/info?${new URLSearchParams(sec)}`).then((d) => {
        const box = $('#sec-about'); if (!box) return;
        box.innerHTML = String(secAbout(d));
        const h = $('.results-head h1'); if (h) h.textContent = d.h1;
        setTitle(d.h1);
      }).catch(() => {});
    }

    const ff = $('#filter-form');
    // Раздел и характеристики зависят от категории и раздела — перестраиваем без перезагрузки.
    const renderExtra = (cat, sb) => {
      const subs = subsOf(cat);
      const x = subOf(sb);
      const val = (k) => params[k] || '';
      $('#f-extra').innerHTML = String(html`
        ${subs.length ? html`<div class="field"><label for="f-sub">Раздел</label><select id="f-sub" name="sub" class="select"><option value="">Все разделы</option>
          ${subs.map((y) => html`<option value="${y.id}" ${y.id === sb ? raw('selected') : ''}>${y.name}</option>`)}</select></div>` : ''}
        ${x ? x.fields.filter((f) => f.type !== 'text').map((f) => (f.type === 'select'
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
      (k, v) => { const i = $(`#f-extra input[name="a_${k}"]`); if (i) { i.value = v || ''; i.dispatchEvent(new Event('change', { bubbles: true })); } }, { filter: true });
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
    // 1.35: на компьютере фильтры применяются сразу (любой выбор, переключатель, поле — по Enter или уходу из поля);
    // на телефоне панель открывается кнопкой «Фильтры», а «Показать» внизу сразу пишет, сколько найдётся.
    const narrow = () => window.matchMedia('(max-width: 900px)').matches;
    const toggle = $('#filters-toggle');
    toggle.onclick = () => { const open = $('#filters').classList.toggle('collapsed') === false; filtersOpen = open; toggle.setAttribute('aria-expanded', String(open)); $('#filters-open').setAttribute('aria-expanded', String(open)); };
    $('#filters-open').setAttribute('aria-expanded', String(!$('#filters').classList.contains('collapsed')));
    // 1.47.2: на телефоне «Фильтры» — в одной строке с сортировкой и «Список / Карта»; панель открывается над результатами.
    $('[data-f-close]').onclick = () => { toggle.onclick(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    $('#filters-open').onclick = () => { toggle.onclick(); if (narrow() && !$('#filters').classList.contains('collapsed')) $('#filters').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    const formParams = () => {
      const next = {};
      for (const [k, v] of new FormData(ff).entries()) {
        let t = String(v).trim();
        if (k === 'min' || k === 'max') t = t.replace(/\D/g, ''); // «1 000 000» → 1000000
        else if (/^a_.+_(min|max)$/.test(k)) t = t.replace(/[\s\u00a0]/g, '').replace(',', '.'); // «2,5» → 2.5
        if (t) next[k] = t;
      }
      if (params.sort) next.sort = params.sort;
      if (params.view) next.view = params.view;
      next.city = next.city || '';
      return next;
    };
    // Применить на месте: страница не прыгает наверх, фокус остаётся в поле, куда перешли (Tab из «от» в «до»).
    let applyTimer = null;
    const apply = () => {
      clearTimeout(applyTimer);
      applyTimer = setTimeout(() => {
        if (!ff.isConnected) return;
        const a = document.activeElement;
        S.keep = { y: window.scrollY, fy: $('#filters').scrollTop, focus: a && ff.contains(a) && a.id ? a.id : '' };
        goSearch(formParams());
      }, 0);
    };
    let countTimer = null;
    const showBtn = $('#f-show');
    const liveCount = () => {
      clearTimeout(countTimer);
      countTimer = setTimeout(async () => {
        const p = Object.fromEntries(Object.entries(formParams()).filter(([, v]) => v));
        const d = await api('GET', `/api/listings?${new URLSearchParams({ ...p, limit: 1 })}`).catch(() => null);
        if (d && showBtn.isConnected) showBtn.textContent = d.total ? `Показать ${NF.format(d.total)} ${plural(d.total, 'объявление', 'объявления', 'объявлений')}` : 'Ничего не найдено';
      }, 250);
    };
    ff.addEventListener('change', (e) => {
      if (e.target.id === 'f-city') { // город — только целиком: пусто («Вся Россия») или город из списка, недописанный не ищем
        const t = e.target.value.trim().toLowerCase().replace(/ё/g, 'е');
        const c = (S.config.cities || []).find((x) => x.toLowerCase().replace(/ё/g, 'е') === t);
        if (t && !c) return;
        if (c) e.target.value = c;
      }
      if (narrow()) liveCount(); else apply();
    });
    ff.addEventListener('input', (e) => { if (narrow() && e.target.matches('input.input')) liveCount(); });
    ff.onsubmit = (e) => { e.preventDefault(); if (narrow()) { clearTimeout(applyTimer); goSearch(formParams()); } else apply(); };
    $('#sort').onchange = (e) => { const p = { ...params, sort: e.target.value }; go(`/search?${new URLSearchParams(Object.entries(p).filter(([, v]) => v))}`); };

    if (onMap) { await mountMap($('#results'), params); return; }
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
        // 1.43.0: по запросу с опечаткой сервер нашёл исправленный вариант — говорим об этом и даём искать как написано.
        const fixed = data.corrected ? html`<div class="q-fixed">${ic('check', 16, 2.4)}<span>Показаны результаты по запросу <b>«${data.corrected}»</b>
          <a href="/search?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), exact: '1' })}">Искать «${params.q}», как написано</a></span></div>` : '';
        $('#understood').innerHTML = String(html`${fixed}${chips.length ? html`<span class="muted" style="font-size:14px;align-self:center">Поняли запрос:</span>${chips}` : ''}`);
      }
    }).first;
    await adRow($('#results'), params, '', 'подобрано по запросу и фильтрам');
  }

  // ---------- объявления на карте ----------
  // Карта Яндекса — в отдельной рамке-песочнице (/map-frame): у неё нет доступа к сайту, входу и cookie.
  // Точки отдаём ей сообщением; в ответ рамка говорит только «открой объявление №…».
  // Точка стоит у станции метро или в центре города — точный адрес на карте не показываем.
  async function mountMap(box, params) {
    box.innerHTML = String(html`<div class="map-box"><iframe class="map-frame" src="/map-frame" title="Объявления на карте"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        <div class="map-state" id="map-state">${ic('pin', 22, 2)}<span>Загружаем карту…</span></div></div>
      <p class="map-note">${ic('shield', 16, 2)}<span>Точка — у станции метро или в центре города. Точный адрес продавец сообщает в чате.</span></p>`);
    const fr = $('.map-frame', box);
    const state = $('#map-state', box);
    const q = Object.fromEntries(Object.entries(params).filter(([k, v]) => v && k !== 'view' && k !== 'sort'));
    let items = null;
    const send = () => { if (items && fr.contentWindow) fr.contentWindow.postMessage({ type: 'points', items, origin: location.origin }, '*'); };
    const onMsg = (e) => {
      if (!fr.isConnected) { window.removeEventListener('message', onMsg); return; }
      if (e.source !== fr.contentWindow || !e.data || typeof e.data !== 'object') return;
      const t = e.data.type;
      if (t === 'hello' || t === 'ready') { send(); if (t === 'ready') state.classList.add('hidden'); }
      else if (t === 'open') { const id = Number(e.data.id); if (Number.isInteger(id) && id > 0) go(`/l/${id}`); }
      else if (t === 'error') {
        state.classList.remove('hidden');
        state.innerHTML = String(html`${ic('warn', 22, 2)}<span>Карта сейчас не загрузилась</span><a class="btn btn-soft btn-sm" href="/search?${new URLSearchParams(q)}">Показать списком</a>`);
      }
    };
    window.addEventListener('message', onMsg);
    try {
      const d = await api('GET', `/api/listings/map?${new URLSearchParams(q)}`);
      if (!fr.isConnected) return;
      items = d.items.map((x) => ({ id: x.id, lat: x.lat, lng: x.lng, title: x.title, place: x.place, priceText: price(x.price, x.priceUnit), photo: x.photo ? location.origin + x.photo : '' }));
      const n = d.total;
      $('#count').textContent = !n ? 'Ничего не найдено'
        : d.shown < n ? `${NF.format(n)} ${plural(n, 'объявление', 'объявления', 'объявлений')} · на карте ${NF.format(items.length)} самых свежих`
          : `${NF.format(n)} ${plural(n, 'объявление', 'объявления', 'объявлений')} на карте`;
      send();
    } catch (ex) { state.innerHTML = String(html`${ic('warn', 22, 2)}<span>${ex.message}</span>`); }
  }

  // Параметры поиска для блока «Реклама»: только эти поля, без пустых.
  const SEARCH_KEYS = ['q', 'category', 'sub', 'city', 'metro', 'min', 'max', 'delivery', 'bargain', 'exchange', 'trusted', 'exact'];
  const searchParams = (p) => {
    const x = subOf(p.sub);
    const attrs = x ? Object.keys(p).filter((k) => /^a_[A-Za-z]+(_min|_max)?$/.test(k) && x.fields.some((f) => k.replace(/^a_|_min$|_max$/g, '') === f.key)).sort() : [];
    return Object.fromEntries([...SEARCH_KEYS, ...attrs].map((k) => [k, String(p[k] || '').trim()]).filter(([, v]) => v && v !== '0'));
  };

  // Подписки на продавцов: кто (сколько нового), лента их свежих объявлений; новое помечено.
  async function renderFollowing(reload) {
    const { sellers, items } = await api('GET', '/api/my/following');
    refreshMe();
    const box = $('#box');
    if (!sellers.length) {
      box.innerHTML = String(html`<div class="empty"><h3>Вы ни на кого не подписаны</h3><p>Откройте профиль продавца или магазина и нажмите «Подписаться» — новые объявления придут уведомлением и в подборке на почту.</p><a class="btn btn-dark" href="/">Смотреть объявления</a></div>`);
      return;
    }
    box.innerHTML = String(html`<div class="fl-sellers">${sellers.map((x) => html`<div class="fl-seller">
        <a href="/u/${x.id}" class="fl-who">${ava(x)}<span class="fl-txt"><b>${x.name}${x.shop ? html` <span class="pf-badge dark">${ic('store', 12, 2)} Магазин</span>` : ''}</b><span>${x.active} ${plural(x.active, 'объявление', 'объявления', 'объявлений')}${x.city ? ` · ${x.city}` : ''}</span></span>
          ${x.fresh ? html`<span class="ss-new">${x.fresh} ${plural(x.fresh, 'новое', 'новых', 'новых')}</span>` : ''}</a>
        <button type="button" class="btn btn-line btn-sm" data-unfollow="${x.id}">Отписаться</button></div>`)}</div>
      <div class="section-head" style="margin-top:28px"><h2>Свежее у продавцов</h2></div>
      ${items.length ? grid(items) : html`<div class="pf-empty sm"><h3>Пока нет объявлений</h3><p>Как только продавцы что-то опубликуют, объявления появятся здесь.</p></div>`}`);
    $$('[data-unfollow]', box).forEach((b) => {
      b.onclick = async () => { try { await api('POST', `/api/users/${b.dataset.unfollow}/follow`, { follow: false }); toast('Вы отписались'); reload(); } catch (e) { toast(e.message, true); } };
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
      : html`<span class="g-ph" style="--ph:url('${m.src}')" aria-hidden="true"></span><img class="g-img" src="${m.src}" alt="${l.title}" draggable="false">`);
    const station = l.metro ? html`<span class="metro"><i style="--mline:${l.metro.color || '#C9C9C4'}"></i>${l.metro.name}</span>` : '';
    const marketChip = market ? ({
      below: html`<span class="tag accent">Ниже рынка</span>`,
      market: html`<span class="tag"><span class="dot"></span>&nbsp;Цена в рынке</span>`,
      above: html`<span class="tag">Выше рынка</span>`
    })[market.level] : '';
    // 1.24 (вариант A): путь раздела строкой, главное — плитками (то, что видно в карточке, состояние, цвет),
    // остальное — списком «название — значение», условия сделки — значками.
    const subX = subOf(l.subcategory);
    const allSpecs = [...(l.specs || []).map((x) => ({ ...x })), ...(CONDITION_CATS.has(l.category) && l.condition ? [{ key: '_cond', label: 'Состояние', value: CONDITION_LABEL[l.condition] }] : [])];
    const mainKeys = [...new Set(['brand', ...((subX && subX.summary) || []), '_cond', 'color'])];
    const tiles = allSpecs.filter((x) => mainKeys.includes(x.key)).sort((a, b) => mainKeys.indexOf(a.key) - mainKeys.indexOf(b.key)).slice(0, 4);
    const rest = allSpecs.filter((x) => !tiles.includes(x));
    const specPath = [catName(l.category), l.subcategory ? subName(l.subcategory) : ''].filter(Boolean);
    const specVal = (x) => (x.key === 'color' && COLOR_HEX[x.value] ? html`<i class="sp-dot" style="background:${COLOR_HEX[x.value]}"></i>${x.value}` : x.value);
    const kv = (rows) => html`<dl class="kv">${rows.map((x) => html`<div><dt>${x.label}</dt><dd>${specVal(x)}</dd></div>`)}</dl>`;
    const terms = [
      [l.delivery ? 'truck' : 'users', l.delivery ? 'Отправит по России' : 'Только встреча', l.delivery ? 'ok' : ''],
      l.price !== null ? ['tag', l.bargain ? 'Торг уместен' : 'Без торга', l.bargain ? 'ok' : ''] : null,
      l.exchange ? ['refresh', 'Возможен обмен', 'ok'] : null
    ].filter(Boolean);

    let ownerBanner = '';
    if (l.isOwner && l.status === 'rejected') {
      ownerBanner = html`<div class="banner danger"><strong>Объявление отклонено модерацией.</strong> Причина: ${l.rejectReason || 'не указана'}.
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-dark btn-sm" href="/edit/${l.id}">Исправить</a>
        ${l.appealReply ? '' : l.appealText ? html`<span class="tag">Апелляция отправлена</span>` : html`<button class="btn btn-line btn-sm" data-appeal>Не согласен — подать апелляцию</button>`}</div>
        ${l.appealReply ? html`<div style="margin-top:10px"><strong>Ответ на апелляцию:</strong> ${l.appealReply}</div>` : ''}</div>`;
    } else if (l.isOwner && l.status === 'pending') {
      ownerBanner = reviewCard(data.review, l);
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
      const freeKinds = BOOST.filter(([k]) => !boostBusy(data.boost)[k]);
      const canPromote = ['active', 'pending', 'scheduled'].includes(l.status) && boostOn();
      actions = html`<div class="own">
        ${pm && pm.status === 'active' ? promoCard(pm) : ''}
        ${boostCard(data.boost)}
        ${isExpired(l) ? html`<button class="btn btn-accent btn-lg btn-block" data-status="active">${ic('refresh', 20, 2)}Опубликовать снова</button>` : ''}
        ${l.status === 'scheduled' ? html`<button class="btn btn-accent btn-lg btn-block" data-status="active">Опубликовать сейчас</button>` : ''}
        <a class="btn btn-dark btn-lg btn-block" href="/edit/${l.id}">${ic('edit', 19, 2)}${l.status === 'rejected' ? 'Исправить' : 'Редактировать'}</a>
        ${canPromote ? html`<button type="button" class="own-promo" data-promote><span class="own-promo-ic">${ic('bolt', 20, 2)}</span><span><b>${freeKinds.length < 3 ? 'Добавить продвижение' : 'Продвинуть'}</b><small>${freeKinds.length ? `${freeKinds.map(([k]) => ({ xl: 'XL', frame: 'рамка', tags: 'метки' })[k]).join(', ')} · от ${rub(Math.min(...freeKinds.map(([k]) => boostPrices()[k])))}` : 'реклама над поиском'}</small></span>${ic('right', 18, 2)}</button>` : ''}
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
              <div class="g-media" id="gmedia">${media.length ? html`<div class="g-track" id="gtrack">${media.map((m, k) => html`<div class="g-slide" ${k ? raw('aria-hidden="true"') : ''}>${mediaEl(m)}</div>`)}</div>` : svg(P.image, 56, 1.1)}</div>
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
          <section class="sp-sec"><h2 class="h2">Характеристики</h2>
            <nav class="sp-path" aria-label="Раздел">${specPath.map((t, k) => html`${k ? html`<span aria-hidden="true">›</span>` : ''}<a href="${k ? `/c/${l.category}/${l.subcategory}` : cpath(l.category)}">${t}</a>`)}</nav>
            ${tiles.length ? html`<div class="sp-tiles">${tiles.map((x) => html`<div class="sp-tile"><small>${x.label}</small><b>${specVal(x)}</b></div>`)}</div>` : ''}
            ${rest.length ? kv(rest) : ''}
            ${l.vinMasked ? html`<div class="vin-row" id="vin-row"><span class="vin-ic">${ic('shield', 18, 2)}</span><div class="vin-t"><small>VIN или номер кузова</small><b id="vin-val">${l.vin || l.vinMasked}</b></div>
              ${l.vin ? html`<button type="button" class="btn btn-soft btn-sm" data-vin-copy aria-label="Скопировать VIN">${ic('copy', 15, 2)}<span class="vin-bt">Скопировать</span></button>` : html`<button type="button" class="btn btn-soft btn-sm" data-vin-show aria-label="Показать VIN целиком">${ic('eye', 15, 2)}<span class="vin-bt">Показать</span></button>`}</div>
              <p class="vin-note hidden" id="vin-note">По VIN можно проверить историю машины — например, на <a href="https://xn--90adear.xn--p1ai/check/auto" target="_blank" rel="noopener">сайте Госавтоинспекции</a>: регистрации, ДТП, розыск и ограничения.</p>` : ''}</section>
          ${l.description ? html`<section><h2 class="h2">Описание</h2><p class="desc">${l.description}</p></section>` : ''}
          <section class="sp-sec"><h2 class="h2">Условия</h2><div class="sp-terms">
            ${terms.map(([icon, t, tone]) => html`<span class="sp-term ${tone}">${ic(icon, 17, 2)}${t}</span>`)}
            <span class="sp-term">${l.metro ? html`<i class="sp-dot" style="background:${l.metro.color || '#C9C9C4'}"></i>${l.metro.name} · ` : ic('pin', 17, 2)}${l.city}${l.district ? `, ${l.district}` : ''}</span></div></section>
        </div>
        <aside class="item-side">
          <div class="panel panel-shadow" style="display:flex;flex-direction:column;gap:22px">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <div style="flex:1;min-width:0">${l.isOwner ? html`<span class="own-state ${(isExpired(l) ? ['off'] : MY_TAG[l.status] || MY_TAG.archived)[0]}"><i></i>${isExpired(l) ? 'Срок истёк' : (MY_TAG[l.status] || MY_TAG.archived)[1]}${l.status === 'active' && l.expiresAt ? html`<em>до ${dateShort(l.expiresAt)}</em>` : ''}</span>` : ''}<h1 class="item-title">${l.title}</h1><p class="muted" style="margin:8px 0 0;font-size:14px">${l.city} · ${when(l.createdAt)}</p>
                ${l.metro || l.district ? html`<p class="item-where">${station}${l.district ? html`<span class="iw-d">${l.district}</span>` : ''}</p>` : ''}
                <p class="item-counts"><span title="Просмотры">${ic('eye', 16)}<span data-views>${NF.format(l.views)} ${plural(l.views, 'просмотр', 'просмотра', 'просмотров')}</span></span><span title="В избранном">${ic('heart', 16)}<span data-favs>в избранном у ${NF.format(l.favCount)}</span></span></p></div>
              ${l.isOwner ? '' : html`<button class="icon-btn ${l.isFav ? 'on' : ''}" data-fav="${l.id}" aria-label="${l.isFav ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${l.isFav ? 'true' : 'false'}">${ic('heart', 20)}</button>`}
              <button class="icon-btn" data-share aria-label="Поделиться">${ic('share', 20)}</button>
            </div>
            <div><div class="item-price">${price(l.price, l.priceUnit)}${l.priceWas ? html` <s class="price-was">${price(l.priceWas, l.priceUnit)}</s>` : ''}</div>
              ${market && market.level === 'good' ? html`<div class="gp-box"><span class="gp-ic">${ic('check', 16, 2.8)}</span><div><b>Хорошая цена</b>
                <span>${market.perM2 ? 'Цена за м² на' : 'На'} ${market.pct}% ниже, чем в среднем у ${market.count} ${plural(market.count, 'похожего объявления', 'похожих объявлений', 'похожих объявлений')} на Торгане${market.basis ? ` — ${market.basis}` : ''}</span></div></div>`
    : marketChip ? html`<div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${marketChip}<span class="muted" style="font-size:13px">по ${market.count} ${plural(market.count, 'похожему объявлению', 'похожим объявлениям', 'похожим объявлениям')}${market.basis ? ` · ${market.basis}` : ''}</span></div>` : ''}
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
            <span style="flex:1;min-width:0"><span style="display:block;font-size:17px;font-weight:700">${nameSeal(seller.name, seller.badges)}</span>
            ${repLine(seller.rep, '', { first: seller.badges && seller.badges.first, who: seller.name, kind: seller.badges && seller.badges.shop ? 'shop' : '' })}
            <span class="muted" style="display:block;font-size:13px">На Торгане с ${since(seller.createdAt)} · ${seller.activeCount} ${plural(seller.activeCount, 'объявление', 'объявления', 'объявлений')}</span>
            ${seller.badges && (seller.badges.phone || seller.badges.biz) ? html`<span class="pf-badges" style="margin-top:8px">${trustBadges(seller.badges)}</span>` : ''}</span>
            ${ic('right', 20)}
          </a>
          ${seller.rep && !seller.rep.newbie ? html`<a class="rep-link" href="/u/${seller.id}?tab=rep">${repCard(seller.rep, true)}</a>` : seller.reply ? html`<div class="reply-tiles">
            ${seller.reply.time ? html`<div class="reply-tile">${ic('clock', 16, 2.2)}<b>${{ hour: 'Отвечает за час', hours: 'Отвечает за 1–3 часа', day: 'Отвечает в течение дня', days: 'Отвечает за 1–2 дня' }[seller.reply.time]}</b><span>обычно, за последние 30 дней</span></div>` : ''}
            <div class="reply-tile">${ic('chat', 16, 2.2)}<b>${seller.reply.rate} из 10 чатов</b><span>получают ответ</span></div>
          </div>` : ''}
          ${l.isOwner ? '' : html`<div class="seller-follow">${followBtn(seller.id, seller.following)}<span class="muted"><b data-followers>${NF.format(seller.followers || 0)}</b> ${plural(seller.followers || 0, 'подписчик', 'подписчика', 'подписчиков')} · узнают о новых объявлениях первыми</span></div>`}
          <div class="banner soft" style="font-size:14px"><strong style="color:var(--text)">Мы никогда не просим</strong> переходить в мессенджеры, называть код из СМС или платить по ссылке. Если вас об этом просят — это мошенники.</div>
        </aside>
      </div>
      ${similar.length ? html`<section class="section"><div class="section-head"><h2>Похожие объявления</h2><a href="${cpath(l.category, l.city)}">Смотреть все</a></div>${grid(similar)}</section>` : ''}
    </div>`);

    if (l.status === 'active') api('POST', '/api/stats/view', { id: l.id, src: statSource() }).catch(() => {});

    // галерея: лента слайдов — едет за пальцем, листается плавно, на краях пружинит
    const track = $('#gtrack');
    const EASE = 'transform .42s cubic-bezier(.22,.8,.24,1)';
    const place = (px = 0, anim = true) => {
      if (!track) return;
      track.style.transition = anim && !matchMedia('(prefers-reduced-motion: reduce)').matches ? EASE : 'none';
      track.style.transform = px ? `translate3d(calc(${-idx * 100}% + ${px}px), 0, 0)` : `translate3d(${-idx * 100}%, 0, 0)`;
    };
    const show = (i) => {
      if (media.length < 2) return;
      const prev = idx;
      idx = (i + media.length) % media.length;
      place();
      if (prev !== idx) { const pv = $$('.g-slide video')[0]; if (pv && !pv.paused) pv.pause(); }
      $$('.g-slide').forEach((sl, j) => { if (j === idx) sl.removeAttribute('aria-hidden'); else sl.setAttribute('aria-hidden', 'true'); });
      const th = $$('.thumb')[idx]; if (th) th.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      const c = $('#gcount'); if (c) c.textContent = `${idx + 1} из ${media.length}`;
      const vb = $('#gvbtn'); if (vb) vb.hidden = idx === vIdx;
      $('#gallery').classList.toggle('is-video', idx === vIdx);
      $$('.thumb').forEach((t, j) => t.classList.toggle('on', j === idx));
    };
    if (vIdx === 0) $('#gallery').classList.add('is-video');
    // Нажатие на фото — просмотр на весь экран внутри Торганы (видео играет на месте).
    const photoList = media.filter((m) => !m.video).map((m) => m.src);
    let dragged = false;
    $('#gmedia').addEventListener('click', (e) => {
      if (dragged || !e.target.closest('.g-img')) return;
      photoViewer(photoList, photoList.indexOf(media[idx] && media[idx].src), l.title);
    });
    $$('[data-g]').forEach((b) => { b.onclick = () => show(idx + Number(b.dataset.g)); });
    $$('[data-t]').forEach((b) => { b.onclick = () => show(Number(b.dataset.t)); });
    // Свайп: слайд следует за пальцем; отпустили — доезжает до соседнего или возвращается.
    const g = $('#gallery');
    let sw = null;
    g.addEventListener('touchstart', (e) => {
      if (media.length < 2 || e.touches.length > 1 || e.target.closest('video, .gallery-nav, .g-video-btn')) { sw = null; return; }
      const t = e.touches[0]; sw = { x: t.clientX, y: t.clientY, t: Date.now(), dx: 0, axis: '' }; dragged = false;
    }, { passive: true });
    g.addEventListener('touchmove', (e) => {
      if (!sw) return;
      const t = e.touches[0]; const dx = t.clientX - sw.x; const dy = t.clientY - sw.y;
      if (!sw.axis && Math.abs(dx) + Math.abs(dy) > 8) sw.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (sw.axis !== 'x') return;
      dragged = true;
      const edge = (idx === 0 && dx > 0) || (idx === media.length - 1 && dx < 0);
      sw.dx = edge ? dx * 0.3 : dx; // на краях — пружина
      place(sw.dx, false);
    }, { passive: true });
    const swEnd = () => {
      if (!sw) return;
      const { dx, t, axis } = sw; sw = null;
      if (axis !== 'x') return;
      const v = Math.abs(dx) / Math.max(1, Date.now() - t);
      const far = Math.abs(dx) > g.clientWidth * 0.18 || (v > 0.35 && Math.abs(dx) > 24);
      const next = idx + (dx < 0 ? 1 : -1);
      if (far && next >= 0 && next < media.length) show(next); else place();
      setTimeout(() => { dragged = false; }, 60);
    };
    g.addEventListener('touchend', swEnd);
    g.addEventListener('touchcancel', swEnd);
    window.addEventListener('resize', () => place(0, false), { passive: true });

    // 1.48.0: VIN целиком — по кнопке, только вошедшим.
    const vinCopy = (btn) => { btn.onclick = async () => { try { await navigator.clipboard.writeText($('#vin-val').textContent.trim()); toast('VIN скопирован'); } catch { toast('Не удалось скопировать — выделите VIN и скопируйте вручную', true); } }; };
    const vs = $('[data-vin-show]');
    if (vs) {
      vs.onclick = async () => {
        if (!requireAuth()) return;
        try {
          const r = await api('GET', `/api/listings/${l.id}/vin`);
          $('#vin-val').textContent = r.vin;
          $('#vin-row').classList.add('open');
          $('#vin-note').classList.remove('hidden');
          vs.outerHTML = String(html`<button type="button" class="btn btn-soft btn-sm" data-vin-copy aria-label="Скопировать VIN">${ic('copy', 15, 2)}<span class="vin-bt">Скопировать</span></button>`);
          vinCopy($('[data-vin-copy]'));
        } catch (e) { toast(e.message, true); }
      };
    }
    if ($('[data-vin-copy]')) vinCopy($('[data-vin-copy]'));
    $('[data-share]').onclick = () => shareLink(location.href, l.title); // одна функция «Поделиться» на сайт (в приложении — окно iPhone)

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
      del.onclick = async () => { if (await deleteListing(l.id)) go('/profile', true); };
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
  // thumb — ширина лёгкой копии для ленты (1.43.0): WebP, где браузер умеет, иначе JPEG.
  function resizeImage(file, max = 1600, square = false, thumb = 0) {
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
        const out = { data: c.toDataURL('image/jpeg', 0.85), hash: photoHash(c) };
        if (thumb && Math.max(w, h) > thumb) {
          const k = thumb / Math.max(w, h);
          const t = document.createElement('canvas');
          t.width = Math.round(w * k); t.height = Math.round(h * k);
          t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
          const webp = t.toDataURL('image/webp', 0.8);
          out.thumb = webp.startsWith('data:image/webp') ? webp : t.toDataURL('image/jpeg', 0.8);
        }
        resolve(out);
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
  // 1.48.0: что написать в описании — под раздел.
  const descTips = (cat, sub) => (['cars', 'moto', 'trucks', 'water'].includes(sub) ? ['Обслуживание', 'Вложения', 'ДТП и окрасы', 'Комплектация', 'Причина продажи']
    : sub === 'parts' ? ['Совместимость', 'Состояние', 'Номер детали', 'Причина продажи']
      : ['flats_rent', 'daily'].includes(sub) ? ['Что есть в квартире', 'Условия', 'Коммунальные платежи', 'Транспорт рядом']
        : sub === 'land' ? ['Коммуникации', 'Документы', 'Подъезд', 'Что рядом']
          : cat === 'realty' ? ['Документы', 'Ремонт', 'Что рядом', 'Транспорт рядом', 'Собственники']
            : sub === 'resumes' ? ['Опыт', 'Навыки', 'Образование', 'Пожелания']
              : cat === 'jobs' ? ['Обязанности', 'Требования', 'Условия', 'График']
                : cat === 'services' ? ['Что входит', 'Сроки', 'Опыт', 'Гарантия']
                  : cat === 'personal' ? ['Размер по бирке', 'Замеры', 'Материал', 'Состояние']
                    : cat === 'animals' ? ['Характер', 'Прививки', 'Питание', 'Родители']
                      : cat === 'electronics' ? ['Состояние', 'Комплект', 'Гарантия', 'Дефекты', 'Причина продажи'] : DESC_TIPS);
  // 1.48.0: советы, что добавить, — под раздел; только то, что правда помогает (без обещаний «в N раз больше просмотров»).
  const PHOTO_TIP = { cars: 'салон, приборную панель с пробегом, багажник, колёса', moto: 'с обеих сторон, приборы с пробегом, двигатель', phones: 'включённый экран и корпус со всех сторон',
    laptops: 'включённый экран, клавиатуру, корпус', flats: 'каждую комнату, кухню, санузел, вид из окна', flats_rent: 'каждую комнату, кухню, санузел, вид из окна', daily: 'каждую комнату, кухню, санузел, вид из окна',
    houses: 'дом снаружи, комнаты, участок', women: 'вещь целиком, бирку с размером, детали', men: 'вещь целиком, бирку с размером, детали', shoes: 'пару целиком, подошву, бирку с размером', furniture: 'целиком, детали, размеры рядом с рулеткой' };
  const DRAFT_KEY = 'tg_draft';
  // Удаление объявления — одно для страницы объявления и «Моих объявлений». С сайта пропадает, переписки остаются (1.42.0).
  async function deleteListing(id) {
    if (!(await confirmModal('Удалить объявление?', 'Объявление пропадёт с сайта, вернуть его нельзя. Переписки с покупателями сохранятся — в них будет пометка «Объявление удалено».', 'Удалить', true))) return false;
    try { await api('DELETE', `/api/listings/${id}`); toast('Объявление удалено'); return true; } catch (e) { toast(e.message, true); return false; }
  }
  // ================= продвижение в ленте (1.21) =================
  // Один выбор для формы объявления и окна «Продвинуть»: XL-карточка, рамка, метки (до двух) и пакет «Всё в одном».
  // Цена считается так же, как на сервере (lib/boost.js): все три — по цене пакета, если он дешевле суммы.
  const BOOST = [['xl', 'xl', 'XL-карточка', 'Две ячейки, три фото и описание'], ['frame', 'frame', 'Яркая рамка', 'Синяя обводка карточки'], ['tags', 'tag', 'Метки на фото', 'Одна или две прямо на фото']];
  const boostOn = () => PAY && !!(S.config.billing && S.config.billing.ready);
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
    (current || []).forEach((b) => b.kinds.forEach((k) => { busy[k] = b; }));
    return busy;
  }
  const boostState = (b) => (b.status === 'waiting' ? 'с публикацией' : `до ${dateShort(b.endsAt)}`);
  // Реклама над поиском у автора — тем же видом, что и продвижение в ленте.
  function promoCard(p) {
    const left = Math.max(0, p.endsAt - Date.now());
    const pct = Math.max(3, Math.min(100, Math.round((left / Math.max(1, p.endsAt - p.startsAt)) * 100)));
    return html`<div class="bst"><span class="bst-ic">${ic('megaphone', 18, 2.2)}</span><div class="bst-body">
      <div class="bst-top"><b>Реклама над поиском</b><em>${left < 86400000 ? 'последний день' : `ещё ${dayWord(Math.max(1, daysLeft(p.endsAt)))}`}</em></div>
      <span class="bst-sub">показов ${NF.format(p.shows)} · переходов ${NF.format(p.clicks)}</span>
      <span class="bst-bar" role="progressbar" aria-label="Осталось срока" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></span>
      <span class="bst-end">до ${dateShort(p.endsAt)}</span></div></div>`;
  }
  // «Мои объявления»: строка во всю ширину карточки — «Продвигается», сколько осталось, полоска срока.
  function mlBoostRow(list) {
    const on = (list || []).filter((b) => b.status === 'active').sort((a, b) => b.endsAt - a.endsAt);
    if (!on.length) return (list || []).length ? html`<div class="ml-bst wait"><span class="ml-bst-ic">${ic('clock', 16, 2.2)}</span><b>Продвижение</b><span class="ml-bst-left">начнётся после проверки</span></div>` : '';
    const b = on[0];
    const left = Math.max(0, b.endsAt - Date.now());
    const pct = Math.max(3, Math.min(100, Math.round((left / Math.max(1, b.endsAt - b.startsAt)) * 100)));
    const kinds = [...new Set(on.flatMap((x) => x.kinds))].map((k) => ({ xl: 'XL', frame: 'рамка', tags: 'метки' })[k]).join(', ');
    return html`<div class="ml-bst"><span class="ml-bst-ic">${ic('bolt', 16, 2.2)}</span><b>Продвигается</b><span class="ml-bst-kinds">${kinds}</span>
      <span class="ml-bst-left">${left < 86400000 ? 'последний день' : `ещё ${dayWord(Math.max(1, daysLeft(b.endsAt)))}`}</span><i class="ml-bst-bar"><i style="width:${pct}%"></i></i></div>`;
  }
  // 1.40.0: «Продвигается» у автора — одна карточка на всё купленное (страница объявления и окно «Продвижение»):
  // срок с полоской и список услуг, метки — чипсами. Разные сроки у услуг — дата у каждой строки.
  function boostCard(list) {
    const items = (list || []).filter((b) => b.kinds.length);
    if (!items.length) return '';
    const on = items.filter((b) => b.status === 'active');
    const last = on.reduce((a, b) => (!a || b.endsAt > a.endsAt ? b : a), null);
    const perRow = new Set(on.map((b) => dateShort(b.endsAt))).size > 1;
    const rows = BOOST.filter(([k]) => items.some((b) => b.kinds.includes(k))).map(([k, icon, name]) => {
      const b = items.find((x) => x.kinds.includes(k));
      return html`<li><span class="bst-k">${ic(icon, 16, 2)}</span><span class="bst-n">${name}</span>${perRow ? html`<em>${boostState(b)}</em>` : ''}
        ${k === 'tags' && b.tags.length ? html`<span class="bst-tags">${b.tags.map((t) => html`<i>${t}</i>`)}</span>` : ''}</li>`;
    });
    if (!last) {
      return html`<div class="bst wait"><span class="bst-ic">${ic('clock', 18, 2.2)}</span><div class="bst-body">
        <div class="bst-top"><b>Начнётся после проверки</b><em>7 дней</em></div><ul class="bst-list">${rows}</ul></div></div>`;
    }
    const left = Math.max(0, last.endsAt - Date.now());
    const pct = Math.max(3, Math.min(100, Math.round((left / Math.max(1, last.endsAt - last.startsAt)) * 100)));
    return html`<div class="bst"><span class="bst-ic">${ic('bolt', 18, 2.2)}</span><div class="bst-body">
      <div class="bst-top"><b>Продвигается</b><em>${left < 86400000 ? 'последний день' : `ещё ${dayWord(Math.max(1, daysLeft(last.endsAt)))}`}</em></div>
      <span class="bst-bar" role="progressbar" aria-label="Осталось срока" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></span>
      <span class="bst-end">до ${dateShort(last.endsAt)}</span>
      <ul class="bst-list">${rows}</ul></div></div>`;
  }
  // onlyFree — без уже купленного (в окне «Продвижение» оно показано карточкой выше).
  function boostPicker(busy = {}, onlyFree = false) {
    const pr = boostPrices();
    const sum = pr.xl + pr.frame + pr.tags;
    const free = BOOST.filter(([k]) => !busy[k]);
    return html`<div class="bp" data-bp>
      <div class="bp-grid">${(onlyFree ? free : BOOST).map(([k, icon, t, sub]) => html`<label class="bp-opt${busy[k] ? ' busy' : ''}">
        <span class="bp-top"><span class="bp-ic">${ic(icon, 20, 1.9)}</span><input type="checkbox" data-bk="${k}" ${busy[k] ? raw('disabled') : ''}></span>
        <span class="bp-t"><b>${t}</b><em>${busy[k] ? boostState(busy[k]) : rub(pr[k])}</em></span>
        <small>${sub}</small></label>`)}</div>
      <div class="bp-tags hidden" data-bp-tags role="group" aria-label="Метки на фото"><span class="bp-tags-h">Выберите одну или две</span>
        ${S.config.billing.boostTags.map((t) => html`<button type="button" class="bp-chip" data-tag="${t}" aria-pressed="false">${t}</button>`)}</div>
      ${free.length === 3 && pr.all < sum ? html`<label class="bp-all"><input type="checkbox" data-bk="all"><span class="bp-ic">${ic('bolt', 20, 1.9)}</span>
        <span class="bp-t"><b>Всё в одном</b><small>XL, рамка и метки\u00a0· <span class="bp-save">выгоднее на ${rub(sum - pr.all)}</span></small></span><em>${rub(pr.all)}</em></label>` : ''}
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
    goPay(await api('POST', `/api/listings/${listingId}/boost`, boostBody(st)));
  }

  // «Продвинуть» опубликованное или ждущее публикации объявление (из «Моих объявлений» и со страницы объявления).
  async function boostModal(listingId, title, promo = null) {
    let d;
    try { d = await api('GET', `/api/listings/${listingId}/boost`); } catch (e) { toast(e.message, true); return; }
    const busy = boostBusy(d.current);
    const st = { xl: false, frame: false, tagsOn: false, tags: [] };
    const all = Object.keys(busy).length >= 3;
    openModal(String(html`<div class="bm"><h2>Продвижение</h2><p class="muted bm-sub">«${title}»${all ? '' : ` · ${d.days}\u00a0дней${d.status === 'active' ? '' : ' с публикации'}`}</p>
      ${boostCard(d.current)}
      ${all ? '' : d.ready ? boostPicker(busy, true) : html`<p class="muted">Оплата пока не подключена.</p>`}
      <p class="bm-note">${all ? 'Все виды продвижения уже включены. ' : ''}Порядок выдачи не меняется — карточка просто заметнее.${all ? '' : ` Оплата на странице ЮKassa, чек — на ${S.user.email}.`} <a href="/page/terms#paid">Условия</a></p>
      <button type="button" class="bm-biz" data-biz>${ic('megaphone', 18, 2)}<span><b>Реклама над поиском</b><small>${promo ? PROMO_STATUS[promo.status][1].toLowerCase() : 'отдельный блок над выдачей'}</small></span>${ic('right', 18, 2)}</button>
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

  // 1.36: три шага — фото, «что и сколько» (главное), «проверьте и отправьте» (город, описание, остальное свёрнуто).
  const ED_STEPS = [['s-photos', 'Фото'], ['s-what', 'Что и сколько'], ['s-publish', 'Отправка']];
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
      negotiable: !!src.negotiable, busy: 0, tried: false, vin: src.vin || '',
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
        ${!l && S.first && S.first.left && !(S.user.badges && S.user.badges.first) && !S.user.isOwner ? html`<div class="ed-first">${firstMedal(30)}<span><b>Медаль «${firstName(S.first.form)}»</b> — первой тысяче продавцов, с личным номером. Осталось ${NF.format(S.first.left)}: медаль будет вашей, когда объявление одобрят</span></div>` : ''}
        ${draft ? html`<div class="ed-draft">${ic('refresh', 15, 2.2)}<span>Черновик от ${when(draft.at)}</span><button type="button" id="draft-drop">Сбросить</button></div>` : ''}
      </div>
      <nav class="ed-steps" aria-label="Шаги">${ED_STEPS.map(([sid, t], i) => html`<button type="button" data-step="${i}" aria-controls="${sid}" aria-label="Шаг ${i + 1}: ${t}"><i></i><span>${ic('check', 14, 2.6)}${t}</span></button>`)}</nav>
      <div class="ed-grid">
        <form id="ed" class="ed-form" novalidate>
          ${step(1, 's-photos', 'Фото и видео', 'До 10 фото и одно видео до минуты. Первое фото — обложка в поиске.', html`<div id="photos"></div>
            <input type="file" id="file" accept="image/jpeg,image/png,image/webp" multiple class="sr" tabindex="-1">
            <div id="ai-slot"></div>
            <input type="file" id="vfile" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v" class="sr" tabindex="-1">`)}
          ${step(2, 's-what', 'Что и сколько', '', html`
            <div class="field" id="title-field"><label for="title">Название</label>
              <div class="ed-input"><input id="title" name="title" class="input" maxlength="80" placeholder="Например: iPhone 15 Pro, 256 ГБ" value="${src.title || ''}" autocomplete="off"><span class="ed-count" id="title-count"></span></div>
              <span class="help">Марка, модель и главное — так объявление легче найти.</span></div>
            <div class="field"><span class="label">Категория</span><div class="ed-cats" role="radiogroup" aria-label="Категория">
              ${S.config.categories.map((c) => html`<button type="button" role="radio" aria-checked="false" data-cat="${c.id}"><span class="ed-cat-ic">${catIc(c.id, 24)}</span><span>${c.name}</span></button>`)}</div></div>
            <div class="field hidden" id="sub-field"><span class="label">Раздел</span><div class="ed-subs" id="subs" role="radiogroup" aria-label="Раздел"></div></div>
            <div class="ed-attrs hidden" id="attrs"></div>
            <div class="ed-autot hidden" id="auto-title" aria-live="polite"></div>
            <div class="field hidden" id="cond-field"><span class="label">Состояние</span><div class="ed-seg" role="radiogroup" aria-label="Состояние">
              ${[['new', 'Новое'], ['used', 'Б/у'], ['', 'Не указывать']].map(([v, t]) => html`<button type="button" role="radio" data-cond="${v}">${t}</button>`)}</div></div>
            <div class="field ed-price"><label class="label" for="price">Цена</label>
            <div class="ed-money"><label class="sr" for="price">Цена в рублях</label><input id="price" name="price" class="input" inputmode="numeric" autocomplete="off" placeholder="0" value="${src.price !== null && src.price !== undefined && src.price !== '' ? NF.format(Number(String(src.price).replace(/\D/g, ''))) : ''}"><span>₽</span></div>
            ${units.length > 1 ? html`<div class="ed-seg ed-units" role="radiogroup" aria-label="За что цена">${units.map((u) => html`<button type="button" role="radio" data-unit="${u}">${UNIT_LABEL[u] || `за ${u}`}</button>`)}</div>` : ''}
            <div class="ed-hint hidden" id="price-hint"></div>
            </div>
            <div class="ed-opts ed-deal" role="group" aria-label="Условия сделки">
              ${opt('bargain', 'chat', 'Торг', 'Покупатели смогут предложить свою цену', src.bargain !== false)}
              ${opt('exchange', 'refresh', 'Обмен', 'Покажем «Обмен» в объявлении и фильтрах', !!src.exchange)}
              ${opt('delivery', 'truck', 'Доставка', 'Отправлю по России', !!src.delivery)}
              ${opt('', 'info', 'Договорная', 'Цену не показываем — договоритесь в чате', st.negotiable, 'neg')}
            </div>
            <div class="field"><label for="city">Город</label>
              <div class="ed-icon-input">${ic('pin', 18)}<input id="city" name="city" class="input" data-cities autocomplete="off" value="${src.city || S.user.city || S.city || ''}" placeholder="Начните вводить город"></div></div>
            <div class="field"><label for="desc">Описание <small class="muted">— по желанию</small></label>
            <div class="ed-tips" id="desc-tips" aria-label="Что написать"></div>
            <div class="ed-input"><label for="desc" class="sr">Описание</label><textarea id="desc" name="description" class="textarea" maxlength="4000" placeholder="Состояние, комплектация, причина продажи, особенности">${src.description || ''}</textarea><span class="ed-count" id="desc-count"></span></div></div>
            <details class="ed-more" id="ed-more"><summary><span class="em-ic">${ic('sparkle', 20, 1.9)}</span><span class="eb-t"><b>Дополнительно</b><small id="more-sub">метро, район, характеристики, видео — по желанию</small></span><span class="em-open">${ic('down', 18, 2)}</span></summary>
              <div class="ed-more-in">
            <div class="ed-where2">
              <div class="field hidden" id="metro-field"><label for="metro">Метро</label>
                <select id="metro" name="metro" class="select"><option value="">Не указывать</option></select></div>
              <div class="field"><label for="district">Район <small class="muted">— по желанию</small></label>
                <input id="district" name="district" class="input" maxlength="60" autocomplete="off" placeholder="Например: Центральный" value="${src.district || ''}"></div>
            </div>
                <div class="ed-attrs hidden" id="attrs-more"></div>
                <div id="vin-slot"></div>
                <div id="video-slot"></div>
              </div>
            </details>`)}
          ${step(3, 's-publish', 'Проверьте и отправьте', l && l.status === 'active' && l.expiresAt ? `Так увидят покупатели · опубликовано до ${dateShort(l.expiresAt)}` : 'Так увидят покупатели · 30 дней бесплатно', html`
            <div class="ed-advice hidden" id="advice"></div>
            <div class="rv" id="review"></div>
            ${canSchedule ? html`<fieldset class="ed-when"><legend class="sr">Когда опубликовать</legend>
              <div class="ed-seg">
                <label><input type="radio" name="pub-when" value="now" ${at0 ? '' : raw('checked')}><span>${ic('bolt', 16, 2)}Сразу</span></label>
                <label><input type="radio" name="pub-when" value="later" ${at0 ? raw('checked') : ''}><span>${ic('clock', 16, 2)}Позже</span></label>
              </div>
              <div class="ed-when-at ${at0 ? '' : 'hidden'}" id="when-at">
                <div class="field"><label for="w-day">День</label><select id="w-day" class="select">${days.map((d) => html`<option value="${d}" ${d === atDay ? raw('selected') : ''}>${dayLabelLong(d)}</option>`)}</select></div>
                <div class="field"><label for="w-time">Время, МСК</label><select id="w-time" class="select">${times.map((t) => html`<option value="${t}" ${t === atClock ? raw('selected') : ''}>${t}</option>`)}</select></div>
              </div>
            </fieldset>` : ''}
            ${canBoost ? html`<details class="ed-boost" id="ed-boost"><summary><span class="eb-ic">${ic('bolt', 18, 2.2)}</span><span class="eb-t"><b>Продвинуть</b><small>по желанию · 7 дней</small></span>${(() => { const from = `от ${rub(Math.min(...BOOST.filter(([k]) => !busyBoost[k]).map(([k]) => boostPrices()[k])))}`; return html`<em id="eb-sum" data-from="${from}">${from}</em>`; })()}${ic('down', 18, 2)}</summary>
              ${boostPicker(busyBoost)}
              <p class="ed-boost-note">${ic('lock', 13, 2)}Не опубликуем за 7 дней — вернём деньги</p></details>` : ''}
            <p class="ed-rules muted">Отправляя, вы принимаете <a href="/page/rules">правила</a><span id="paid-terms" class="hidden"> и <a href="/page/terms#paid">условия платных услуг</a></span></p>`)}
        </form>
        <aside class="ed-side">
          <div class="ed-panel">
            <div class="ed-preview-h">Так увидят в поиске</div>
            <div class="ed-preview" id="preview" aria-hidden="true"></div>
            <div class="ed-ready"><div class="ed-ready-h"><b id="ready-n"></b><span id="ready-t"></span></div><div class="ed-bar-track"><i id="ready-bar"></i></div>
              <ul class="ed-check" id="check"></ul><small class="ed-req">* обязательно, остальное — по желанию</small></div>
            <div class="ed-advice side hidden" id="advice-side"></div>
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
          const img = await resizeImage(f, 1600, false, 640);
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
      if (!l && !st.aiDone && !form.title.value.trim()) aiFill();
    };
    fileInput.onchange = () => { addFiles([...fileInput.files]); fileInput.value = ''; };

    const renderAi = () => {
      const slot = $('#ai-slot');
      if (!S.config.ai) { slot.innerHTML = ''; return; }
      const ready = st.photos.some((p) => p.file && !p.loading);
      slot.innerHTML = String(html`<div class="ed-ai ${st.aiBusy ? 'busy' : ''}"><span class="ed-ai-ic">${ic('sparkle', 20)}</span><p>${st.aiBusy ? (S.config.aiBy === 'yandex' ? 'Алиса AI смотрит на фото и заполняет объявление…' : 'Смотрим на фото и заполняем объявление…') : st.aiDone ? 'Заполнили по фото — проверьте на следующем шаге.' : ready ? 'Заполним название, категорию, характеристики и описание по первому фото.' : 'Добавьте фото — и мы заполним объявление за вас.'}</p>
        ${st.aiBusy ? '' : html`<button type="button" class="btn ${st.aiDone ? 'btn-soft' : 'btn-accent'} btn-sm" id="ai-btn" ${ready ? '' : raw('disabled')}>${st.aiDone ? 'Ещё раз' : 'Заполнить по фото'}</button>`}</div>`);
      const b = $('#ai-btn');
      if (b) b.onclick = () => aiFill(true);
    };
    // Заполнить по фото: название, категорию, раздел, главные характеристики, состояние, описание.
    // Сам — один раз, когда загрузилось первое фото и название ещё пустое; кнопкой — когда угодно.
    const aiFill = async (manual = false) => {
      const first = st.photos.find((p) => p.file && !p.loading);
      if (!S.config.ai || !first || st.aiBusy) return;
      st.aiBusy = true; renderAi();
      try {
        const r = await api('POST', '/api/ai/suggest', { file: first.file });
        if (r.title && (manual || !form.title.value.trim())) form.title.value = r.title; // у разделов с названием из характеристик оно не нужно, но пусть будет, если раздел сменят
        if (r.description && !form.description.value.trim()) form.description.value = r.description;
        if (r.category && (manual || !st.category)) setCat(r.category);
        if (r.subcategory && (manual || !st.sub)) setSub(r.subcategory);
        if (r.attrs && Object.keys(r.attrs).length) { for (const [k, v] of Object.entries(r.attrs)) if (manual || st.attrs[k] === undefined) st.attrs[k] = v; renderAttrs(); }
        if (r.condition && (manual || !st.condition)) setCond(r.condition);
        if (r.priceHint) showHint(r.priceHint, r.priceHintCount); else fetchHint();
        st.aiDone = true;
        changed();
        if (manual) toast('Готово — проверьте и поправьте при необходимости');
      } catch (e) { if (manual) toast(e.message, true); }
      st.aiBusy = false; renderAi();
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
    // Главные характеристики (req) — на шаге «Что и сколько», остальные — в «Ещё по желанию» на последнем шаге.
    // 1.48.0: модель — поле с подсказками частых моделей выбранной марки.
    const modelSug = (f) => { const list = f.suggest ? (f.suggest[st.attrs.brand] || []) : []; const v = st.attrs[f.key];
      return list.length ? html`<div class="av-chips at-sug" role="group" aria-label="Частые модели">${list.map((o) => html`<button type="button" class="av-chip${o === v ? ' on' : ''}" data-sug="${o}">${o}</button>`)}</div>` : ''; };
    const attrField = (f) => {
      const v = st.attrs[f.key];
      if (f.type === 'select') return attrChoice(f, v);
      if (f.type === 'text') {
        return html`<div class="field wide at-text" data-tfield="${f.key}"><label for="at-${f.key}">${f.label}${f.req ? html`<i class="rq">*</i>` : ''}</label>
          <input id="at-${f.key}" class="input" maxlength="${f.max || 40}" autocomplete="off" autocapitalize="sentences" data-akt="${f.key}" placeholder="${f.placeholder || ''}" value="${v || ''}">
          <span class="at-sug-box">${modelSug(f)}</span></div>`;
      }
      return html`<div class="field"><label for="at-${f.key}">${f.label}${f.req ? html`<i class="rq">*</i>` : ''}</label><div class="ed-unit-input"><input id="at-${f.key}" class="input" inputmode="${f.key === 'area' || f.key === 'land' ? 'decimal' : 'numeric'}" autocomplete="off" data-akn="${f.key}" data-max="${f.max}" placeholder="${f.key === 'year' ? `например, ${new Date().getFullYear() - 5}` : '—'}" value="${fmtAttrInput(f, v)}">${f.unit ? html`<span>${f.unit}</span>` : ''}</div></div>`;
    };
    const paintAttrs = (box, fields, head) => {
      box.classList.toggle('hidden', !fields.length);
      if (!fields.length) { box.innerHTML = ''; return; }
      // Сначала списки, потом числа; модель — сразу после марки.
      const sorted = [...fields].filter((f) => f.type !== 'text').sort((a, b) => (a.type !== 'select') - (b.type !== 'select'));
      for (const t of fields.filter((f) => f.type === 'text')) { const at = sorted.findIndex((f) => f.key === 'brand'); sorted.splice(at >= 0 ? at + 1 : sorted.findIndex((f) => f.type !== 'select') < 0 ? sorted.length : sorted.findIndex((f) => f.type !== 'select'), 0, t); }
      box.innerHTML = String(html`${head}<div class="ed-attrs-grid">${sorted.map(attrField)}</div>`);
      if (!box.dataset.bound) {
        box.dataset.bound = '1';
        bindAttrChoices(box, { find: (fn) => (subOf(st.sub) || { fields: [] }).fields.find(fn) }, (k) => st.attrs[k], (k, val) => {
          if (val === undefined) delete st.attrs[k]; else st.attrs[k] = val;
          if (k === 'brand') paintSug();
          changed();
        });
        box.addEventListener('click', (e) => {
          const b = e.target.closest('[data-sug]'); if (!b) return;
          const wrap = b.closest('[data-tfield]'); const key = wrap.dataset.tfield;
          st.attrs[key] = b.dataset.sug; $('input', wrap).value = b.dataset.sug;
          paintSug(); changed();
        });
      }
      $$('[data-akt]', box).forEach((inp) => {
        inp.oninput = () => { const t = inp.value.replace(/\s+/g, ' ').replace(/^\s/, ''); if (t.trim()) st.attrs[inp.dataset.akt] = t.trim(); else delete st.attrs[inp.dataset.akt]; paintSug(false); changed(); };
      });
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
    // Плашки моделей: под выбранную марку; выбранная подсвечена.
    function paintSug(full = true) {
      $$('[data-tfield]').forEach((w) => {
        const f = (subOf(st.sub) || { fields: [] }).fields.find((x) => x.key === w.dataset.tfield);
        if (!f) return;
        const box = $('.at-sug-box', w);
        if (full) box.innerHTML = String(modelSug(f));
        else $$('[data-sug]', box).forEach((b) => b.classList.toggle('on', b.dataset.sug === st.attrs[f.key]));
      });
    }
    const renderAttrs = () => {
      const fields = (subOf(st.sub) || { fields: [] }).fields;
      paintAttrs($('#attrs'), fields.filter((f) => f.req), '');
      paintAttrs($('#attrs-more'), fields.filter((f) => !f.req), html`<div class="ed-attrs-h"><b>Характеристики</b><span>По ним покупатели находят объявление в фильтрах</span></div>`);
      renderVin(); renderDescTips();
    };
    // 1.48.0: название из характеристик — у машин, квартир, телефонов и других разделов, где оно есть (как на Авито).
    const isAuto = () => !!(subOf(st.sub) || {}).auto;
    const renderAuto = () => {
      const on = isAuto();
      $('#title-field').classList.toggle('hidden', on);
      const box = $('#auto-title');
      box.classList.toggle('hidden', !on);
      if (!on) return;
      const t = autoTitle(st.sub, st.attrs);
      const need = (subOf(st.sub) || { fields: [] }).fields.filter((f) => f.req && st.attrs[f.key] === undefined).map((f) => f.label.toLowerCase());
      box.innerHTML = String(html`<span class="at-ic">${ic('sparkle', 18, 2)}</span><div class="at-t"><small>Название объявления</small>
        ${t ? html`<b>${t}</b>` : html`<b class="at-wait">Появится, когда укажете ${need.length ? need.join(', ') : 'главное'}</b>`}
        <span>Собирается из характеристик — только главное. Поменяете их — название обновится.</span></div>`);
    };
    // 1.48.0: VIN или номер кузова — у машин. В объявлении виден частично, целиком — по кнопке «Показать».
    const LAT = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };
    const vinNorm = (v) => { let t = String(v || '').toUpperCase().replace(/\s/g, '').replace(/[АВЕКМНОРСТХУ]/g, (c) => LAT[c]).replace(/[^A-Z0-9-]/g, '').slice(0, 17); if (t.length === 17) t = t.replace(/O|Q/g, '0').replace(/I/g, '1'); return t; };
    const vinOk = (v) => (v.length === 17 ? /^[A-HJ-NPR-Z0-9]{17}$/.test(v) : /^[A-Z0-9-]{6,17}$/.test(v) && /\d{4}/.test(v));
    const vinState = (v) => (!v ? '' : v.length === 17 && vinOk(v) ? '17 из 17 · формат верный' : vinOk(v) ? `${v.length} из 17 — если это номер кузова, всё верно` : /[IOQ]/.test(v) ? 'В VIN нет букв I, O и Q' : `${v.length} из 17`);
    function renderVin() {
      const box = $('#vin-slot');
      if (st.sub !== 'cars') { box.innerHTML = ''; return; }
      if ($('#vin', box)) return;
      box.innerHTML = String(html`<div class="field ed-vin"><label for="vin">VIN или номер кузова <small class="muted">— по желанию</small></label>
        <div class="ed-vin-in">${ic('shield', 18, 2)}<input id="vin" class="input" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="17 латинских букв и цифр" value="${st.vin}"></div>
        <span class="ed-vin-st" id="vin-st" aria-live="polite"></span>
        <span class="help">В объявлении будет видна часть VIN, целиком — по кнопке «Показать» для вошедших на Торгану. По VIN покупатель сам проверит историю машины.</span></div>`);
      const inp = $('#vin', box);
      const paint = () => { const v = st.vin; const ok = !v || vinOk(v); const el = $('#vin-st'); el.textContent = vinState(v); el.classList.toggle('ok', !!v && ok); el.classList.toggle('bad', !!v && !ok && v.length >= 17); };
      inp.oninput = () => { const pos = inp.selectionStart; const before = inp.value.length; st.vin = vinNorm(inp.value); inp.value = st.vin; try { const d = inp.value.length - before; inp.setSelectionRange(pos + d, pos + d); } catch { /* нет выделения */ } paint(); changed(); };
      paint();
    }
    // Что написать в описании — плашки под раздел.
    let tipsFor = null;
    function renderDescTips() {
      const key = `${st.category}|${st.sub}`;
      if (tipsFor === key) return;
      tipsFor = key;
      $('#desc-tips').innerHTML = String(html`${descTips(st.category, st.sub).map((t) => html`<button type="button" class="chip" data-tip="${t}">${ic('plus', 14, 2.2)}${t}</button>`)}`);
    }
    // 1.48.0: советы — что ещё добавить. Только правда: про фильтры, VIN, фото; без обещаний просмотров.
    const adviceOf = (b) => {
      const out = [];
      const x = subOf(b.subcategory);
      const n = b.photos.length;
      if (n > 0 && n < 3) out.push(['camera', `Добавьте ещё фото — ${PHOTO_TIP[b.subcategory] || 'с разных сторон и детали крупно'}`, 's-photos', 'photos']);
      if (b.subcategory === 'cars' && !b.vin) out.push(['shield', 'Укажите VIN — покупатель сможет сам проверить историю машины', 's-what', 'vin']);
      if (!b.price && !st.negotiable) out.push(['tag', 'Укажите цену — без неё объявление не покажется тем, кто ищет с фильтром по цене', 's-what', 'price']);
      const lc = (t) => (/^[А-ЯЁA-Z]{2}/.test(t) ? t : t[0].toLowerCase() + t.slice(1)); // «ДТП» — как есть
      if (b.description.length < 20) out.push(['edit', `Расскажите в описании: ${descTips(b.category, b.subcategory).slice(0, 3).map(lc).join(', ')}`, 's-what', 'desc']);
      const opt = x ? x.fields.filter((f) => !f.req && b.attrs[f.key] === undefined) : [];
      if (opt.length >= 2) out.push(['filter', `Заполните ${opt.slice(0, 3).map((f) => f.label.toLowerCase()).join(', ')} — по характеристикам ищут в фильтрах`, 's-what', 'more']);
      if (hasMetro(b.city) && !b.metro) out.push(['pin', 'Укажите метро — по нему ищут в фильтрах и на карте', 's-what', 'metro']);
      return out.slice(0, 3);
    };
    const renderAdvice = (b) => {
      const list = adviceOf(b);
      for (const id of ['advice', 'advice-side']) {
        const box = $(`#${id}`); if (!box) continue;
        box.classList.toggle('hidden', !list.length);
        box.innerHTML = list.length ? String(html`<div class="adv-h">${ic('sparkle', 16, 2)}<b>Советы</b><span>что ещё добавить</span></div>
          <ul>${list.map(([icon, t, sid, what]) => html`<li><span class="adv-ic">${ic(icon, 16, 2)}</span><span class="adv-t">${t}</span><button type="button" class="adv-go" data-adv="${sid}|${what}" aria-label="Перейти">${ic('right', 16, 2.2)}</button></li>`)}</ul>`) : '';
      }
    };
    $('.ed').addEventListener('click', (e) => {
      const b = e.target.closest('[data-adv]'); if (!b) return;
      const [sid, what] = b.dataset.adv.split('|');
      goStep(ED_STEPS.findIndex(([x]) => x === sid));
      const more = $('#ed-more');
      if (['vin', 'more', 'metro'].includes(what) && more) more.open = true;
      const el = what === 'vin' ? $('#vin') : what === 'price' ? form.price : what === 'desc' ? form.description : what === 'metro' ? form.metro : what === 'more' ? $('#attrs-more') : what === 'photos' ? $('[data-pick]') : null;
      if (el) setTimeout(() => { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el.focus) el.focus({ preventScroll: true }); }, 80);
    });
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
      const t = body().title;
      if (!st.category || t.length < 3) { $('#price-hint').classList.add('hidden'); return; }
      try {
        const r = await api('GET', `/api/price-hint?${new URLSearchParams({ category: st.category, title: t, unit: st.priceUnit })}`);
        if (r.hint) showHint(r.hint, r.count); else $('#price-hint').classList.add('hidden');
      } catch { /* необязательно */ }
    }

    // ---------- описание ----------
    $('#desc-tips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tip]'); if (!b) return;
      const ta = form.description;
      const v = ta.value.replace(/\s+$/, '');
      ta.value = `${v}${v ? '\n' : ''}${b.dataset.tip}: `;
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      changed();
    });

    // ---------- готовность, превью, черновик ----------
    // Не form.when: у элементов в браузерах появился свой метод when() (Observable API).
    const laterOn = () => canSchedule && !!$('input[name="pub-when"][value="later"]:checked');
    const body = () => ({
      title: isAuto() ? autoTitle(st.sub, st.attrs) : form.title.value.trim(), category: st.category, condition: CONDITION_CATS.has(st.category) ? st.condition : '',
      price: st.negotiable ? '' : priceDigits(), priceUnit: st.priceUnit, city: form.city.value.trim(),
      delivery: form.delivery.checked, description: form.description.value.trim(),
      photos: st.photos.filter((p) => p.file).map((p) => p.file),
      subcategory: st.sub, attrs: st.attrs, metro: $('#metro-field').classList.contains('hidden') ? '' : form.metro.value,
      district: form.district.value.trim(), video: st.video && st.video.file ? st.video.file : '',
      bargain: form.bargain.checked, exchange: form.exchange.checked, vin: st.sub === 'cars' ? st.vin : '',
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
      ['s-what', 'Цена', (b) => !!b.price || st.negotiable, false],
      ['s-what', 'Город', (b) => b.city.length >= 2, true],
      ['s-what', 'Описание', (b) => b.description.length >= 20, false]
    ];
    const ERR = {
      's-what': (b) => (b.title.length < 3 && !isAuto() ? 'Напишите название — хотя бы пару слов.' : b.vin && !vinOk(b.vin) ? 'Проверьте VIN: 17 латинских букв и цифр без I, O, Q или номер кузова — либо оставьте поле пустым.' : !b.category ? 'Выберите категорию.' : !b.subcategory && subsOf(b.category).length ? 'Выберите раздел — так объявление попадёт в нужные фильтры.'
        : attrsMissing(b).length ? `Укажите: ${attrsMissing(b).map((f) => f.label.toLowerCase()).join(', ')}.` : b.city.length < 2 ? 'Укажите город.' : ''),
      's-publish': (b) => (b.publishAt !== null && b.publishAt < Date.now() + 5 * 60 * 1000 ? 'Выберите время позже — хотя бы через несколько минут.' : boostErr(st.boost))
    };
    let saveTimer = null;
    function changed() {
      const b = body();
      $('#title-count').textContent = `${form.title.value.length}/80`;
      renderAuto(); renderAdvice(b);
      if (isAuto() && b.title !== st.autoT) { st.autoT = b.title; setTimeout(() => fetchHintSoon(), 0); } // цена похожих — по новому названию
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
      const moreN = [b.metro, b.district, b.video].filter(Boolean).length + (subOf(b.subcategory) || { fields: [] }).fields.filter((f) => !f.req && b.attrs[f.key] !== undefined).length;
      $('#more-sub').textContent = moreN ? `заполнено: ${moreN} · можно добавить ещё` : 'метро, район, характеристики, видео — по желанию';
      renderReview(b);
      const eb = $('#ed-boost');
      if (eb) { if (q.any) eb.open = true; eb.classList.toggle('on', q.any); const es = $('#eb-sum'); es.textContent = q.any ? rub(q.amount) : es.dataset.from; }
      if (st.tried) for (const sid of Object.keys(ERR)) showErr(sid, ERR[sid](b));
      const has = b.title || b.photos.length || b.description || b.price;
      if (!l && !has) draftDrop();
      if (!l && has) { clearTimeout(saveTimer); saveTimer = setTimeout(() => draftSave({ ...b, price: b.price, negotiable: st.negotiable, step: st.step, photos: st.photos.filter((p) => p.file).map((p) => ({ file: p.file, url: p.url })), video: st.video && st.video.file ? { file: st.video.file, url: st.video.url, duration: st.video.duration } : null }), 400); }
    }
    // Шаг «Отправка»: объявление целиком — как увидят покупатели, с переходом к правке.
    const renderReview = (b) => {
      const box = $('#review'); if (!box) return;
      const ph = st.photos.filter((p) => p.url && !p.loading);
      const x = subOf(b.subcategory);
      const kv = [...(x ? x.fields.filter((f) => b.attrs[f.key] !== undefined).map((f) => [f.label, `${typeof b.attrs[f.key] === 'number' ? NF.format(b.attrs[f.key]) : b.attrs[f.key]}${f.unit ? ` ${f.unit}` : ''}`]) : []), ...(b.vin ? [['VIN', b.vin]] : [])];
      const deal = [b.bargain && !st.negotiable && 'Торг', b.exchange && 'Обмен', b.delivery && 'Доставка'].filter(Boolean);
      const cat = S.config.categories.find((c) => c.id === b.category);
      box.innerHTML = String(html`<div class="rv-media">${ph.length ? html`<div class="rv-main"><img src="${ph[0].url}" alt=""></div>${ph.length > 1 ? html`<div class="rv-strip">${ph.slice(1, 5).map((p, k) => html`<span><img src="${p.url}" alt="">${k === 3 && ph.length > 5 ? html`<em>+${ph.length - 5}</em>` : ''}</span>`)}</div>` : ''}` : html`<button type="button" class="rv-nophoto" data-rv="0">${ic('camera', 26, 1.7)}<b>Без фото</b><span>Объявления с фото смотрят в разы чаще — добавить</span></button>`}${st.video ? html`<span class="rv-vid">${ic('play', 12, 0)}Видео</span>` : ''}</div>
        <div class="rv-body">
          <div class="rv-top"><b class="rv-price">${b.price ? price(Number(b.price), b.priceUnit) : 'Цена договорная'}</b><button type="button" class="rv-edit" data-rv="1">${ic('edit', 15, 2)}Изменить</button></div>
          <h3>${b.title || 'Без названия'}</h3>
          <span class="rv-where">${ic('pin', 15, 2)}${b.city || 'Город не указан'}${b.metro ? ` · м. ${b.metro}` : ''}${b.district ? ` · ${b.district}` : ''}</span>
          ${cat ? html`<span class="rv-cat">${cat.name}${x ? ` › ${x.name}` : ''}${CONDITION_CATS.has(b.category) && b.condition ? ` · ${b.condition === 'new' ? 'новое' : 'б/у'}` : ''}</span>` : ''}
          ${deal.length ? html`<div class="rv-tags">${deal.map((t) => html`<span>${t}</span>`)}</div>` : ''}
          ${kv.length ? html`<dl class="rv-kv">${kv.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ''}
          <p class="rv-desc ${b.description ? '' : 'empty'}">${b.description || 'Описание не добавлено — по желанию, но с ним продают быстрее.'}</p>
        </div>`);
      $$('[data-rv]', box).forEach((x2) => { x2.onclick = () => goStep(Number(x2.dataset.rv)); });
    };
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
      const f = sid === 's-what' && b.title.length < 3 && !isAuto() ? form.title : sid === 's-what' && b.vin && !vinOk(b.vin) ? $('#vin') : sid === 's-what' && b.category && !b.subcategory ? $('[data-sub]')
        : miss ? $(`#at-${miss.key}`) || $(`[data-field="${miss.key}"] button`) : sid === 's-what' && b.city.length < 2 ? form.city : sid === 's-publish' ? $('#w-time + .pick-btn') : null;
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
      $('.ed-dock [data-prev]').classList.toggle('hidden', !i); // 1.55.0: на первом шаге «Назад» нет — «Далее» на всю ширину, без пустого места слева
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
    if (src.district || src.metro || st.video || st.vin || (subOf(st.sub) || { fields: [] }).fields.some((f) => !f.req && st.attrs[f.key] !== undefined)) $('#ed-more').open = true;
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
      extra: () => ({ consent: $('#f').consent.checked, src: srcOf() }),
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
  // 1.56.0: в приложении для iPhone — первой кнопкой «Войти с Apple» (правило App Store 4.8). Значок Apple — символ
  // системного шрифта iPhone (U+F8FF), кнопка чёрная, как требует Apple.
  const appleButton = (label = 'Войти с Apple') => (NATIVE ? html`<button type="button" class="btn btn-lg btn-block oauth-btn oauth-apple" data-apple><span class="apple-glyph" aria-hidden="true">\uF8FF</span>${label}</button>` : '');
  const oauthButtons = () => (oauthOn().length || NATIVE ? html`<div class="oauth">
      ${appleButton()}
      ${oauthOn().map(([k, , label]) => html`<button type="button" class="btn btn-line btn-lg btn-block oauth-btn oauth-${k}" data-oauth="${k}"><span class="oauth-mark" aria-hidden="true">${k === 'vk' ? 'VK' : 'Я'}</span>${label}</button>`)}
      <p class="oauth-note">Продолжая, вы принимаете <a href="/page/terms" target="_blank">соглашение</a> и даёте <a href="/page/consent" target="_blank">согласие на обработку данных</a>. Телефон из сервиса отметим как подтверждённый.</p>
      <div class="or"><span>или по email</span></div></div>` : '');
  // Начать вход или привязку: сервер даёт адрес страницы сервиса, туда и уходим.
  async function oauthGo(provider, { next = '/', link = false } = {}) {
    try { const { url } = await api('POST', `/api/auth/oauth/${provider}/start`, { next, link, consent: !link, src: srcOf() }); location.href = url; } catch (e) { toast(e.message, true); }
  }
  function bindOauth(root, next) {
    $$('[data-oauth]', root).forEach((b) => { b.onclick = () => oauthGo(b.dataset.oauth, { next: next || '/profile' }); });
    $$('[data-apple]', root).forEach((b) => { b.onclick = () => appleGo({ next: next || '/profile' }); });
  }
  // «Войти с Apple»: одноразовый nonce с сервера → системное окно Apple в приложении → токен на сервер.
  async function appleGo({ next = '/profile', link = false } = {}) {
    try {
      const { nonce } = await api('POST', '/api/auth/apple/nonce', { next, link, src: srcOf() });
      const wait = new Promise((res) => {
        const on = (e) => { const m = e.detail || {}; if (m.type === 'auth.apple' || m.type === 'auth.apple.error') { window.removeEventListener('torgana-native', on); res(m); } };
        window.addEventListener('torgana-native', on);
        setTimeout(() => { window.removeEventListener('torgana-native', on); res({ type: 'auth.apple.error', code: 'timeout' }); }, 180000);
      });
      if (!nativePost({ type: 'auth.apple', nonce })) throw new Error('Войти с Apple можно в приложении Торгана для iPhone');
      const m = await wait;
      if (m.type === 'auth.apple.error') { if (m.code !== 'canceled') toast('Apple не подтвердил вход — попробуйте ещё раз', true); return; }
      const r = await api('POST', '/api/auth/apple', { identityToken: m.identityToken, nonce, name: m.name || '', consent: !link });
      if (link) { toast('Apple ID привязан'); await refreshMe(); render(); return; }
      location.href = r.next || next; // полная загрузка — подтянуть вошедшего человека везде
    } catch (e) { toast(e.message, true); }
  }

  // 1.51.1: пустые и неверные поля ловим до запроса — подсвечиваем и говорим, что исправить.
  function fieldProblem(f) {
    const label = (i) => (($(`label[for="${i.id}"]`, f) || {}).textContent || '').trim();
    const why = (i) => {
      const v = i.value.trim();
      if (i.required && !v) return 'empty';
      if (i.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Проверьте email — например, name@mail.ru';
      if (i.minLength > 0 && v && i.value.length < i.minLength) return `${label(i)} — минимум ${i.minLength} символов`;
      return '';
    };
    const list = $$('input.input', f).map((i) => [i, why(i)]);
    list.forEach(([i, w]) => { if (w) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); i.oninput = () => i.removeAttribute('aria-invalid'); });
    const bad = list.filter(([, w]) => w);
    if (!bad.length) return '';
    bad[0][0].focus();
    const empty = bad.filter(([, w]) => w === 'empty').map(([i]) => `«${label(i)}»`);
    return empty.length ? `Заполните ${empty.length > 1 ? 'поля' : 'поле'} ${empty.join(' и ')}` : bad[0][1];
  }
  function bindAuthForm(url, next, { extra = {}, check, done } = {}) {
    const f = $('#f');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#err');
      err.classList.add('hidden');
      const body = { ...Object.fromEntries(new FormData(f).entries()), ...(typeof extra === 'function' ? extra() : extra) };
      const problem = fieldProblem(f) || (check && check(body));
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
      check: (b) => (b.password !== b.password2 ? 'Пароли не совпадают' : '')
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
    const what = isFollow ? 'о новых объявлениях этого продавца' : { messages: 'о новых сообщениях', moderation: 'о решениях модерации', digest: 'с подборкой за день', all: 'с уведомлениями' }[q.get('k')] || 'с уведомлениями';
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
  const riskOf = (t) => {
    if (!t) return null;
    for (const [k, re, text] of RISKS) if (k === 'link' ? hasLink(t) : k === 'card' ? hasCard(t) : re.test(t)) return { k, text };
    return null;
  };
  // 1.47.2: аватарка Торганы — объёмный круг «небо → сирень» с бликом и знаком (та же, что на экране «Сделка состоялась»).
  let avaN = 0;
  const torganaAva = (size) => {
    const k = `ta${++avaN}`;
    return raw(`<svg width="${size}" height="${size}" viewBox="0 0 112 112" aria-hidden="true"><defs>
      <linearGradient id="${k}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C86E0"/><stop offset=".55" stop-color="#3D67D0"/><stop offset="1" stop-color="#6A63D8"/></linearGradient>
      <linearGradient id="${k}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <circle cx="56" cy="56" r="56" fill="url(#${k}a)"/><ellipse cx="48" cy="28" rx="40" ry="22" fill="url(#${k}g)"/>
      <circle cx="56" cy="56" r="55" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>
      <g transform="scale(2.3333) translate(6.5 6.5) scale(.73)">${MARK.replace(/fill="#[0-9A-Fa-f]{6}"\/>$/, 'fill="#4566D2"/>')}</g></svg>`);
  };
  const supportAva = (size = 52) => html`<span class="conv-img support-ava" style="width:${size}px;height:${size}px" aria-hidden="true">${torganaAva(size)}</span>`;
  // Функция, а не готовая строка: галочка (verifiedSeal) объявлена ниже и у каждой — свои id градиентов.
  const supportName = () => html`Поддержка Торганы<span class="name-seal" title="Официальный аккаунт Торганы">${verifiedSeal(18)}</span>`;
  const SUPPORT_TOPICS = ['Почему отклонили объявление?', 'Не приходит письмо', 'Подозреваю мошенника', 'Как удалить аккаунт?'];

  // 1.55.0: галочки у своих сообщений — ✓ отправлено, ✓✓ (синие) прочитано.
  const tickSvg = (read) => raw(read
    ? '<svg width="17" height="11" viewBox="0 0 17 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6l3 3 6.5-7.5"/><path d="M7.2 8.4l.6.6 6.7-7.5"/></svg>'
    : '<svg width="12" height="11" viewBox="0 0 12 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6l3 3 6.5-7.5"/></svg>');
  const tickMark = (read) => html`<i class="tk ${read ? 'rd' : ''}" data-tk role="img" aria-label="${read ? 'Прочитано' : 'Отправлено'}">${tickSvg(read)}</i>`;

  // Один чат на весь сайт: диалоги по объявлениям, поддержка у пользователя и у модератора.
  // load(after) → { messages }, send(body) → message; сообщения { id, mine, body, createdAt }.
  // decorate(m) → { cls, body } — особый вид сообщения (предложение цены); onData(r) — после каждой загрузки;
  // tools — над полем ввода (быстрые ответы); left — кнопка слева от поля (₽ — предложить цену).
  // 1.54.0: reply — { other: имя собеседника } включает ответ на конкретное сообщение: кнопка у сообщения (мышь),
  // свайп вправо или долгое нажатие (телефон); над полем — «Ответ …», в сообщении — цитата, нажатие ведёт к оригиналу.
  // 1.55.0: как в мессенджерах — у своих сообщений ✓ (отправлено) и ✓✓ синим (прочитано, r.readUpTo), строка
  // «… печатает» (r.typing) и отметка собеседнику, пока я набираю (typing — функция, шлёт не чаще раза в 3 секунды).
  function mountChat(box, { head, below = '', load, send, scam = false, empty, placeholder = 'Сообщение…', onActivity, back = '/messages', decorate, onData, tools = '', left = '', reply = null, typing = null, receipts = false }) {
    box.innerHTML = String(html`
      <div class="chat-head">
        <a href="${back}" class="icon-btn chat-back" aria-label="Назад">${ic('left', 20)}</a>
        ${head}
      </div>
      ${below}
      <div class="chat-msgs" data-msgs></div>
      ${typing && reply ? html`<div class="chat-typing" data-typing aria-live="polite"><span class="ct-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${reply.other} печатает</span></div>` : ''}
      ${tools}
      ${reply ? html`<div class="chat-reply hidden" data-reply-bar><span class="cr-ic">${ic('reply', 18, 2.2)}</span><div class="cr-tx"><b data-rb-who></b><span data-rb-text></span></div><button type="button" class="icon-btn cr-x" data-rb-x aria-label="Отменить ответ">${ic('close', 18, 2)}</button></div>` : ''}
      <form class="chat-form" data-send>
        ${left}
        <label class="icon-btn chat-attach" title="Отправить фото"><input type="file" accept="image/jpeg,image/png,image/webp" data-photo hidden>${ic('camera', 20)}<span class="sr">Отправить фото</span></label>
        <label class="sr" for="chat-body">Сообщение</label>
        <textarea id="chat-body" rows="1" maxlength="4000" placeholder="${placeholder}"></textarea>
        <button class="btn chat-send" type="submit" aria-label="Отправить">${ic('right', 20, 2.2)}<span class="chat-send-t">Отправить</span></button>
      </form>`);
    const msgs = $('[data-msgs]', box);
    const ta = $('#chat-body', box);
    const form = $('[data-send]', box);
    let lastId = 0;
    let lastDay = '';
    const known = new Map(); // id → сообщение (для цитаты в ответе)
    const qText = (q) => (q.body ? q.body : q.photo ? 'Фото' : q.kind === 'offer' ? 'Предложение цены' : 'Сообщение');
    const quote = (q) => html`<button type="button" class="msg-q" data-goto="${q.id}"><b>${q.mine ? 'Вы' : reply.other}</b><span>${q.photo ? ic('camera', 13, 2) : ''}${qText(q)}</span></button>`;
    const rpBtn = () => (reply ? html`<button type="button" class="msg-rp" data-rp aria-label="Ответить">${ic('reply', 16, 2.2)}</button>` : '');
    const append = (list) => {
      if (!list.length) return;
      const e = $('[data-empty]', msgs); if (e) e.remove();
      const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
      let out = '';
      for (const m of list) {
        const d = new Date(m.createdAt).toDateString();
        if (d !== lastDay) { lastDay = d; out += String(html`<div class="chat-day">${shortWhen(m.createdAt)}</div>`); }
        const d2 = decorate ? decorate(m) : null;
        known.set(m.id, { id: m.id, mine: m.mine, body: m.body, photo: !!m.photo, kind: m.kind || '' });
        const q = reply && m.reply ? quote(m.reply) : '';
        const can = reply && m.kind !== 'offer' ? 'can-rp' : ''; // на карточку предложения не отвечают — у неё свои кнопки
        const tm = html`<span class="t">${hm(m.createdAt)}${receipts && m.mine ? tickMark(m.read) : ''}</span>`;
        out += d2 ? String(html`<div class="msg ${m.mine ? 'out' : 'in'} ${d2.cls} ${can}" data-mid="${m.id}">${q}${d2.body}${tm}${can ? rpBtn() : ''}</div>`)
          : String(html`<div class="msg ${m.mine ? 'out' : 'in'} ${m.photo ? 'has-photo' : ''} ${q ? 'has-q' : ''} ${can}" data-mid="${m.id}">${q}${m.photo ? html`<a class="msg-photo" href="${m.photo}" target="_blank" rel="noopener" data-pv-src="${m.photo}" data-pv-group="chat"><img src="${m.photo}" alt="Фото" loading="lazy"></a>` : ''}${m.body}${tm}${can ? rpBtn() : ''}</div>`);
        const risk = scam && !m.mine && !m.kind ? riskOf(m.body) : null;
        if (risk) out += String(html`<div class="msg-risk r-${risk.k}" role="note">${ic(risk.k === 'messenger' ? 'chat' : risk.k === 'link' ? 'link' : risk.k === 'card' ? 'card' : 'shield', 16, 2.2)}<span>${risk.text}</span></div>`);
        lastId = Math.max(lastId, m.id);
      }
      msgs.insertAdjacentHTML('beforeend', out);
      if (nearBottom || list.some((m) => m.mine)) msgs.scrollTop = msgs.scrollHeight;
    };
    // Прочитано: все мои сообщения до readUpTo — ✓✓. Печатает: строка над полем и класс у чата (шапка — «печатает…»).
    const tpRow = $('[data-typing]', box);
    const live = (r) => {
      if (receipts && r.readUpTo) $$('.msg.out[data-mid] [data-tk]:not(.rd)', msgs).forEach((t) => { if (Number(t.closest('[data-mid]').dataset.mid) <= r.readUpTo) { t.classList.add('rd'); t.innerHTML = String(tickSvg(true)); t.setAttribute('aria-label', 'Прочитано'); } });
      if (tpRow && r.typing !== undefined) {
        const on = !!r.typing;
        if (on !== tpRow.classList.contains('on')) {
          const near = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
          tpRow.classList.toggle('on', on); box.classList.toggle('is-typing', on);
          if (near) msgs.scrollTop = msgs.scrollHeight;
        }
      }
    };
    const poll = async () => { const r = await load(lastId); if (r.messages.length) { append(r.messages); if (onActivity) onActivity(); } live(r); if (onData) onData(r); return r; };
    let tpSent = 0;
    ta.oninput = () => {
      ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
      if (typing && ta.value.trim() && Date.now() - tpSent > 3000) { tpSent = Date.now(); typing().catch(() => {}); }
    };
    ta.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
      if (e.key === 'Escape' && replyTo) { e.preventDefault(); setReply(null); }
    };
    // Ответ на сообщение: полоса над полем ввода, отмена — крестиком или Esc.
    let replyTo = null;
    const bar = $('[data-reply-bar]', box);
    const setReply = (id) => {
      const m = id ? known.get(Number(id)) : null;
      replyTo = m ? m.id : null;
      if (!bar) return;
      bar.classList.toggle('hidden', !m);
      if (!m) return;
      $('[data-rb-who]', bar).textContent = m.mine ? 'Ответ себе' : `Ответ ${reply.other}`;
      $('[data-rb-text]', bar).textContent = qText(m);
      ta.focus();
    };
    if (bar) $('[data-rb-x]', bar).onclick = () => setReply(null);
    if (reply) {
      msgs.addEventListener('click', (e) => {
        const rp = e.target.closest('[data-rp]');
        if (rp) { setReply(rp.closest('[data-mid]').dataset.mid); return; }
        const g = e.target.closest('[data-goto]');
        if (g) {
          const t = $(`[data-mid="${g.dataset.goto}"]`, msgs);
          if (!t) { toast('Это сообщение было давно — пролистайте переписку выше', true); return; }
          t.scrollIntoView({ behavior: 'smooth', block: 'center' });
          t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
        }
      });
      // Телефон: свайп вправо или долгое нажатие на сообщении — ответить.
      let sw = null;
      msgs.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        const el = e.target.closest('.msg.can-rp');
        if (!el || e.target.closest('a, button')) return;
        sw = { el, x: e.clientX, y: e.clientY, dx: 0, lp: setTimeout(() => { if (sw && Math.abs(sw.dx) < 8) { navigator.vibrate?.(10); setReply(el.dataset.mid); sw = null; } }, 480) };
      });
      msgs.addEventListener('pointermove', (e) => {
        if (!sw) return;
        const dx = e.clientX - sw.x; const dy = e.clientY - sw.y;
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { clearTimeout(sw.lp); sw.el.style.transform = ''; sw = null; return; }
        sw.dx = dx;
        if (Math.abs(dx) > 8) clearTimeout(sw.lp);
        if (dx > 0) { sw.el.style.transform = `translateX(${Math.min(dx, 72)}px)`; sw.el.classList.toggle('rp-ready', dx > 56); }
      });
      const end = () => {
        if (!sw) return;
        clearTimeout(sw.lp);
        const { el, dx } = sw; sw = null;
        el.style.transition = 'transform .18s ease'; el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; el.classList.remove('rp-ready'); }, 200);
        if (dx > 56) { navigator.vibrate?.(10); setReply(el.dataset.mid); }
      };
      msgs.addEventListener('pointerup', end);
      msgs.addEventListener('pointercancel', end);
      msgs.addEventListener('contextmenu', (e) => { if (e.target.closest('.msg.can-rp') && matchMedia('(hover: none)').matches) e.preventDefault(); });
    }
    // send получает { body, photo, replyTo }: текст, фото (имя файла из /api/uploads) или и то и другое.
    const deliver = async (msg) => { append([await send(replyTo ? { ...msg, replyTo } : msg)]); setReply(null); if (onActivity) onActivity(); };
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
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-topic]');
      if (!b) return;
      ta.value = b.dataset.topic;
      // Быстрый вопрос покупателя: текст — в поле (можно дописать и отправить), остальные вопросы убираем.
      const asks = b.closest('.chat-asks'); if (asks) asks.remove();
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.oninput();
    });
    // Пока переписка на экране — раз в 2,5 секунды (галочки и «печатает» почти сразу); свёрнута — раз в 10 секунд.
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; if (!document.hidden || ticks % 4 === 0) poll().catch(() => {}); }, 2500);
    const onVis = () => { if (!document.hidden) poll().catch(() => {}); };
    document.addEventListener('visibilitychange', onVis);
    (async () => {
      const r = await load(0);
      if (!r.messages.length && empty) msgs.innerHTML = String(html`<div data-empty>${empty}</div>`);
      append(r.messages);
      live(r);
      if (onData) onData(r);
      msgs.scrollTop = msgs.scrollHeight;
      if (onActivity) onActivity();
    })().catch((e) => toast(e.message, true));
    if (window.matchMedia('(min-width: 901px)').matches) $('.chat-back', box).classList.add('hidden');
    ta.focus();
    const stop = () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
    stop.poll = poll;
    stop.fill = (text) => { ta.value = text; ta.focus(); ta.oninput(); };
    return stop;
  }

  // ---------- торг: предложение цены ----------
  // 1.54.0: сколько ждать проверки — по медиане за 14 дней (lib/admin.js reviewEta); пока решений мало — «несколько часов».
  const etaText = (ms) => {
    if (!ms) return 'в течение нескольких часов';
    const m = Math.max(5, Math.round(ms / 60000 / 5) * 5);
    if (m < 60) return `за ${m} мин`;
    const h = Math.round(m / 60);
    return h <= 1 ? 'примерно за час' : h < 24 ? `примерно за ${h} ${plural(h, 'час', 'часа', 'часов')}` : 'в течение дня';
  };
  const reviewLine = (rv) => (rv ? `${rv.night ? 'Ночью модераторы отдыхают — проверим утром' : `Обычно проверяем ${etaText(rv.median)}`}. ${rv.place > 1 ? `В очереди перед вами: ${rv.place - 1}.` : 'Вы первый в очереди.'}` : 'Модератор проверит объявление — обычно это несколько часов.');
  // Карточка «На проверке» у своего объявления: срок, место в очереди, три шага и что пришлём, когда проверим.
  function reviewCard(rv, l) {
    const sent = l.updatedAt || l.createdAt;
    return html`<section class="mq-card" aria-label="Объявление на проверке">
      <span class="mq-ic">${ic(rv && rv.night ? 'moon' : 'clock', 22, 2)}</span>
      <div class="mq-main">
        <b class="mq-t">Объявление на проверке</b>
        <span class="mq-s">${rv && rv.night ? 'Ночью модераторы отдыхают — проверим утром.' : html`Обычно проверяем <b>${etaText(rv && rv.median)}</b>.`}
          ${rv ? (rv.place > 1 ? html` Перед вами в очереди: <b>${rv.place - 1}</b>.` : ' Вы первый в очереди.') : ''}</span>
        <ol class="mq-steps">
          <li class="done"><i>${ic('check', 13, 3)}</i><span>Отправлено<small>${shortWhen(sent) === 'сегодня' ? `в ${hm(sent)}` : shortWhen(sent)}</small></span></li>
          <li class="now"><i></i><span>Проверка<small>сейчас</small></span></li>
          <li><i></i><span>Опубликовано<small>после проверки</small></span></li>
        </ol>
        <span class="mq-foot">${ic('bell', 16, 2)}Как только проверим — пришлём уведомление${S.config.mail ? ' и письмо' : ''}.</span>
        ${l.flags ? html`<span class="mq-flag">Объявление похоже на товар из раздела «${l.flags}» <a href="/page/rules">правил</a> — проверим внимательнее.</span>` : ''}
      </div>
    </section>`;
  }
  // Сумма-подсказка: −5/−10/−15% с округлением до «красивой» (100, 500 или 1000 ₽).
  const niceStep = (n) => (n >= 100000 ? 1000 : n >= 10000 ? 500 : 100);
  const niceDown = (n) => { const step = niceStep(n); return Math.max(step, Math.floor(n / step) * step); };
  // 1.54.0: окно и для первого предложения покупателя, и для встречной цены (counter): тогда сумма — строго между
  // low и high (продавец: между предложением и ценой; покупатель: ниже цены продавца), подсказки — середина и четверти.
  function offerModal({ listingPrice, title, onSubmit, counter = null }) {
    const min = listingPrice ? Math.ceil(listingPrice * 0.3) : 1;
    let picks; let head; let note; let ok = 'Предложить';
    if (counter) {
      const { low, high, theirs, bySeller } = counter; // theirs — на что отвечаем; bySeller — отвечает продавец
      const step = niceStep(high || theirs);
      const round = (v) => Math.round(v / step) * step;
      picks = high ? [0.25, 0.5, 0.75].map((k) => round(low + (high - low) * k)).filter((v, i, x) => v > low && v < high && x.indexOf(v) === i) : [];
      head = html`<h2>${bySeller ? 'Ваша цена' : 'Предложить свою'}</h2>
        <p class="muted" style="margin:0 0 14px">${title}${listingPrice ? html` · в объявлении <b style="color:var(--text)">${rub(listingPrice)}</b>` : ''}</p>
        <div class="offer-vs"><span><small>${bySeller ? 'Предлагает покупатель' : 'Цена продавца'}</small><b>${rub(theirs)}</b></span>${ic('right', 18, 2)}<span class="you"><small>${bySeller ? 'Вы уступите до' : 'Вы предложите'}</small><b data-vs>—</b></span></div>`;
      note = bySeller ? `Сумма — больше ${rub(low)}${high ? ` и меньше ${rub(high)}` : ''}. Покупатель сможет согласиться, отказаться или предложить свою.`
        : `Сумма — меньше ${rub(high)}${listingPrice ? `, но не меньше ${rub(min)}` : ''}. Продавец сможет согласиться, отказаться или назвать свою.`;
      ok = 'Отправить';
    } else {
      picks = listingPrice ? [5, 10, 15].map((p) => niceDown(listingPrice * (1 - p / 100))).filter((v, i, a) => v < listingPrice && a.indexOf(v) === i) : [];
      head = html`<h2>Предложить цену</h2><p class="muted" style="margin:0 0 16px">${title}${listingPrice ? html` · сейчас <b style="color:var(--text)">${rub(listingPrice)}</b>` : ''}</p>`;
      note = `Продавец сможет согласиться, отказаться или назвать свою цену — ответ придёт в чат.${listingPrice ? ` Можно предложить от ${rub(min)}.` : ''}`;
    }
    const off = (v) => (listingPrice && v < listingPrice ? html`<span class="cnt">−${Math.round((1 - v / listingPrice) * 100)}%</span>` : '');
    openModal(String(html`${head}
      <div class="ed-money offer-money"><label class="sr" for="of-sum">${counter ? 'Ваша цена' : 'Ваша цена'}</label><input id="of-sum" class="input" inputmode="numeric" autocomplete="off" placeholder="Ваша цена"><span>₽</span></div>
      ${picks.length ? html`<div class="offer-picks">${picks.map((v) => html`<button type="button" class="chip" data-pick-sum="${v}">${rub(v)}${off(v)}</button>`)}</div>` : ''}
      <p class="offer-note">${ic('info', 16, 2)}<span>${note}</span></p>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-accent" data-ok>${ok}</button></div>`), (m, close) => {
      const inp = $('#of-sum', m); const vs = $('[data-vs]', m);
      const show = () => { if (vs) { const d = Number(inp.value.replace(/\D/g, '')); vs.textContent = d ? rub(d) : '—'; } };
      inp.oninput = () => { const d = inp.value.replace(/\D/g, '').slice(0, 11); inp.value = d ? NF.format(Number(d)) : ''; show(); };
      $$('[data-pick-sum]', m).forEach((b) => { b.onclick = () => { inp.value = NF.format(Number(b.dataset.pickSum)); show(); inp.focus(); }; });
      $('[data-x]', m).onclick = close;
      const btn = $('[data-ok]', m);
      btn.onclick = async () => {
        const sum = Number(inp.value.replace(/\D/g, ''));
        if (!sum) { inp.focus(); toast('Укажите сумму', true); return; }
        btn.disabled = true;
        try { await onSubmit(sum); close(); } catch (e) { toast(e.message, true); btn.disabled = false; }
      };
      setTimeout(() => inp.focus(), 50);
    });
  }
  // Карточка предложения в чате и её низ (кнопки или итог) — низ перерисовывается при каждом опросе.
  // 1.54.0: торгуются обе стороны — у карточки свой заголовок (предложение / цена продавца / новое предложение),
  // отвечает тот, кому предложили: «Принять», «Своя цена», «Отклонить».
  const offerCard = (o, m) => html`<div class="offer-card" data-offer="${m.offerId}">
      <div class="offer-k">${ic('tag', 14, 2.2)}<span data-offer-k>Предложение цены</span></div>
      <div class="offer-sum"><b data-offer-sum></b><s data-offer-was></s><span class="offer-pct" data-offer-off></span></div>
      <div class="offer-foot" data-offer-foot></div></div>`;
  function paintOffers(root, offers, role) {
    for (const o of offers || []) {
      const el = $(`[data-offer="${o.id}"]`, root);
      if (!el || el.dataset.state === o.status) continue;
      el.dataset.state = o.status;
      const mine = (o.bySeller ? 'seller' : 'buyer') === role; // это предложение сделал я
      const them = o.bySeller ? 'Продавец' : 'Покупатель';
      el.classList.toggle('by-seller', o.bySeller);
      $('[data-offer-k]', el).textContent = o.bySeller ? (mine ? 'Ваша цена' : 'Цена продавца') : o.parentId ? 'Новое предложение' : 'Предложение цены';
      $('[data-offer-sum]', el).textContent = rub(o.price);
      $('[data-offer-was]', el).textContent = o.listingPrice ? rub(o.listingPrice) : '';
      $('[data-offer-off]', el).textContent = o.listingPrice && o.price < o.listingPrice ? `−${Math.round((1 - o.price / o.listingPrice) * 100)}%` : '';
      el.closest('.msg').classList.toggle('offer-off', ['withdrawn', 'declined', 'countered'].includes(o.status));
      $('[data-offer-foot]', el).innerHTML = String(o.status === 'pending'
        ? (!mine
          ? html`<button type="button" class="btn btn-accent btn-sm" data-offer-act="accept" data-oid="${o.id}">${ic('check', 16, 2.4)}Принять</button><button type="button" class="btn btn-soft btn-sm" data-offer-act="counter" data-oid="${o.id}">${ic('tag', 16, 2)}Своя цена</button><button type="button" class="offer-link offer-no" data-offer-act="decline" data-oid="${o.id}">Отклонить</button>`
          : html`<span class="offer-st wait">${ic('clock', 15, 2)}Ждём ответа ${o.bySeller ? 'покупателя' : 'продавца'}</span><button type="button" class="offer-link" data-offer-act="withdraw" data-oid="${o.id}">Отозвать</button>`)
        : o.status === 'accepted' ? html`<span class="offer-st ok">${ic('check', 15, 2.6)}Договорились на ${rub(o.price)}</span>`
          : o.status === 'declined' ? html`<span class="offer-st">${mine ? `${them === 'Продавец' ? 'Покупатель' : 'Продавец'} отказался` : 'Вы отказались'}</span>`
            : o.status === 'countered' ? html`<span class="offer-st">${ic('refresh', 15, 2)}${mine ? `${o.bySeller ? 'Покупатель' : 'Продавец'} предложил свою цену` : 'Вы предложили свою цену'}</span>`
              : html`<span class="offer-st">${mine ? 'Вы отозвали или заменили предложение' : `${them} отозвал или заменил предложение`}</span>`);
    }
  }


  // ---------- быстрые ответы продавца ----------
  let qrMax = 12; // сколько шаблонов можно (сервер: 12, с тарифом магазина — 30)
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
      const add = () => { const v = $('#qr-new', m).value.trim(); if (!v) return; if (list.length >= qrMax) { toast(`Не больше ${qrMax} ответов`, true); return; } list.push(v); $('#qr-new', m).value = ''; paint(); };
      $('[data-qr-add]', m).onclick = add;
      $('#qr-new', m).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
      $('[data-x]', m).onclick = close;
      $('[data-qr-reset]', m).onclick = async () => { try { const r = await api('PUT', '/api/my/replies', { reset: true }); close(); done(r.items, r.max); toast('Вернули стандартные ответы'); } catch (e) { toast(e.message, true); } };
      $('[data-ok]', m).onclick = async () => {
        const pending = $('#qr-new', m).value.trim(); if (pending) list.push(pending);
        try { const r = await api('PUT', '/api/my/replies', { items: list }); close(); done(r.items, r.max); toast('Ответы сохранены'); } catch (e) { toast(e.message, true); }
      };
    });
  }
  // Быстрые вопросы покупателя — под это объявление: торг — если продавец разрешил, доставка — если отправляет.
  const buyerAsks = (l) => ['Здравствуйте! Ещё актуально?', 'Где и когда можно посмотреть?',
    ...(l.price && l.bargain ? ['Торг возможен?'] : []), ...(l.delivery ? ['Отправите по России?'] : []), 'Пришлёте ещё фото?'];
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

  // 1.27 (вариант 3): справа от чата — объявление и собеседник с оценкой, напоминание о безопасности.
  // Только на широком экране (CSS); на телефоне и планшете объявление — в шапке чата.
  const chatSide = (l, o, role) => {
    const since = o.createdAt ? `на Торгане с ${new Date(o.createdAt).getFullYear()}` : '';
    const gone = l.status === 'deleted';
    return html`<aside class="chat-side" aria-label="Объявление и ${role === 'buyer' ? 'продавец' : 'покупатель'}">
      <a href="/l/${l.id}" class="chs-photo${l.photo ? ' ph' : ''}"${l.photo ? raw(` style="--ph:url('${esc(l.photo)}')"`) : ''} tabindex="-1" aria-hidden="true">${l.photo ? html`<img src="${l.photo}" alt="" loading="lazy">` : svg(P.image, 32, 1.3)}</a>
      <div class="chs-item"><b class="chs-price">${price(l.price, l.priceUnit)}</b>${gone ? html`<span class="chs-title">${l.title}</span>` : html`<a href="/l/${l.id}" class="chs-title">${l.title}</a>`}<span class="chs-place">${l.metro ? `м. ${l.metro}` : l.city}${l.status === 'sold' ? ' · продано' : ''}</span></div>
      ${gone ? html`<p class="chs-gone">${ic('info', 16, 2)}Объявление удалено продавцом — переписка сохранена.</p>` : html`<a href="/l/${l.id}" class="btn btn-line btn-block btn-sm">Открыть объявление</a>`}
      <hr>
      <a href="/u/${o.id}" class="chs-person">${ava(o, 'sm')}<span><b>${o.name}</b><span class="chs-meta">${o.rep ? html`${levelMedal(o.rep.level, 14)}<b>${o.rep.levelName}</b>${o.rep.deals ? ` · ${dealsWord(o.rep.deals)}` : ''}${o.rep.buyer ? ' · надёжный покупатель' : ''}` : ''}${since ? ` · ${since}` : ''}</span></span></a>
      <p class="chs-safe">${ic('shield', 18)}<span>${role === 'buyer' ? 'Не переходите в мессенджеры и не вносите предоплату — общайтесь здесь.' : 'Не называйте коды из СМС и не переходите по ссылкам «для получения оплаты».'}</span></p>
    </aside>`;
  };

  async function viewMessages(cid) {
    if (!requireAuth()) return;
    setTitle('Сообщения');
    const isSupport = cid === 'support';
    const convId = cid && !isSupport ? Number(cid) : null;
    app.innerHTML = String(html`<div class="wrap"><div class="inbox ${cid ? 'has-chat' : ''}">
      <div class="inbox-list"><h1>Сообщения</h1>
        <a href="/messages/support" class="conv support ${isSupport ? 'on' : ''}" id="support-row">
          ${supportAva(44)}
          <span class="conv-body"><span class="support-name">${supportName()}</span><span class="conv-sub">Отвечают люди, а не боты</span></span>
          <span class="badge hidden" id="support-badge"></span>
          <span class="pin" title="Закреплено">${ic('pushpin', 16)}<span class="sr">Закреплено</span></span>
        </a>
        <div class="inbox-label">Переписки</div>
        <div id="convs"><div class="loader"></div></div></div>
      <section class="chat" id="chat">${cid ? html`<div class="loader" style="flex:1"></div>` : html`<div class="chat-empty"><div>${svg(P.chat, 40, 1.4)}<p>Выберите диалог слева.<br>Чтобы написать продавцу, откройте объявление.</p></div></div>`}</section>
    </div></div>`);

    const loadList = async () => {
      const { items } = await api('GET', '/api/conversations');
      const box = $('#convs');
      if (!box) return;
      box.innerHTML = items.length ? String(html`${items.map((c) => html`<a href="/messages/${c.id}" class="conv ${c.id === convId ? 'on' : ''}">
          <span class="conv-img">${c.photo ? html`<img src="${c.photo}" alt="" loading="lazy">` : svg(P.image, 22, 1.4)}${ava(c.other, 'xs conv-ava')}</span>
          <span class="conv-body">
            <span class="conv-top"><span class="conv-name">${c.other.name}${c.role === 'seller' ? html` <span class="conv-role">· покупатель</span>` : ''}</span><span class="conv-when">${shortWhen(c.updatedAt)}</span></span>
            <span class="conv-title" style="display:block">${c.title} · ${c.status === 'deleted' ? 'объявление удалено' : price(c.price, c.priceUnit)}</span>
            <span class="conv-last" style="display:block">${c.lastMine ? tickMark(c.lastMine === 2) : ''}${c.lastBody || 'Нет сообщений'}</span>
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
    let offersNow = []; // предложения цены в открытом диалоге — для «Своя цена»
    cleanup = () => { clearInterval(listTimer); stopChat(); };
    if (!cid) return;

    if (isSupport) {
      stopChat = mountChat($('#chat'), {
        head: html`${supportAva(44)}<div style="flex:1;min-width:0"><div class="support-name">${supportName()}</div><span class="muted" style="font-size:14px">Отвечают люди, а не боты</span></div>`,
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
    stopChat = mountChat($('#chat'), {
      // 1.54.0: шапка — фото, название в одну строку, ниже цена и собеседник; статус — меткой на фото и в строке цены.
      head: (() => {
        const gone = l.status === 'deleted'; const sold = l.status === 'sold';
        const st = gone ? html`<span class="ch-st" title="Объявление удалено">Удалено</span>` : sold ? html`<span class="ch-st dark">Продано</span>` : '';
        const ph = html`${l.photo ? html`<img src="${l.photo}" alt="">` : svg(P.image, 20, 1.4)}`;
        return html`${gone ? html`<span class="ch-ph gone" aria-hidden="true">${ph}</span>` : html`<a href="/l/${l.id}" class="ch-ph ${sold ? 'sold' : ''}" aria-hidden="true" tabindex="-1">${ph}</a>`}
          <div class="ch-tx">
            ${gone ? html`<span class="ch-t">${l.title}</span>` : html`<a href="/l/${l.id}" class="ch-t">${l.title}</a>`}
            <div class="ch-m">${gone ? '' : html`<b class="${sold ? 'off' : ''}">${price(l.price, l.priceUnit)}</b>`}${st}<i aria-hidden="true">·</i><a href="/u/${other.id}" class="ch-who">${ava(other, 'xs')}<span>${other.name}</span></a></div>
          </div>
          <button type="button" class="icon-btn chat-more" data-chat-more aria-label="Ещё" aria-haspopup="menu">${ic('more', 20)}</button>`;
      })(),
      reply: { other: other.name },
      receipts: true,
      typing: () => api('POST', `/api/conversations/${convId}/typing`),
      below: html`<div data-deal-slot></div>`,
      load: async (after) => {
        const r = await api('GET', `/api/conversations/${convId}?after=${after}&seen=${document.hidden ? 0 : 1}`);
        const slot = $('[data-deal-slot]');
        const paintDeal = (st) => {
          if (!slot || JSON.stringify(st) === slot.dataset.state) return;
          slot.dataset.state = JSON.stringify(st);
          slot.innerHTML = String(dealBar(st));
          bindDeal(slot, convId, async () => { const x = await api('GET', `/api/conversations/${convId}?after=999999999`); slot.dataset.state = ''; paintDeal(x.deal); });
          dealWow(convId, st, slot);
        };
        paintDeal(r.deal);
        return r;
      },
      send: async (msg) => { const r = await api('POST', `/api/conversations/${convId}/messages`, msg); loadList().catch(() => {}); return r.message; },
      decorate: (m) => (m.kind === 'offer' ? { cls: 'offer-msg', body: offerCard(null, m) } : m.kind === 'offer-reply' ? { cls: 'offer-reply', body: html`${m.body}` } : null),
      onData: (r) => { offersNow = r.offers || offersNow; paintOffers($('#chat'), r.offers, role); },
      tools: role === 'seller' ? html`<div class="chat-tools" data-replies></div>`
        : l.status === 'active' ? html`<div class="chat-tools chat-asks" aria-label="Быстрые вопросы">${buyerAsks(l).map((t) => html`<button type="button" class="chip" data-topic="${t}">${t}</button>`)}</div>` : '',
      left: canOffer ? html`<button type="button" class="icon-btn chat-offer" data-make-offer title="Предложить цену" aria-label="Предложить цену">₽</button>` : '',
      scam: true,
      empty: html`<div class="chat-day">Напишите первое сообщение — например, уточните состояние или договоритесь о встрече.${canOffer && l.price ? ' Или предложите свою цену кнопкой ₽.' : ''}</div>`,
      onActivity: () => refreshMe()
    });
    $('.inbox').insertAdjacentHTML('beforeend', String(chatSide(l, other, role)));
    const chatEl = $('#chat');
    // 1.48.0: чёрный список — вместо поля ввода плашка: кто кого заблокировал и что делать.
    let block = data.block || null;
    const paintBlock = () => {
      const f = $('[data-send]', chatEl); const tl = $('.chat-tools', chatEl); const old = $('.chat-blocked', chatEl);
      if (old) old.remove();
      if (f) f.classList.toggle('hidden', !!block);
      if (tl) tl.classList.toggle('hidden', !!block);
      if (!block) return;
      f.insertAdjacentHTML('beforebegin', String(block === 'me'
        ? html`<div class="chat-blocked"><span class="cb-ic">${ic('ban', 18, 2)}</span><div><b>Вы заблокировали ${other.name}</b><span>Он не может писать вам и предлагать цену.</span></div><button type="button" class="btn btn-soft btn-sm" data-unblock>Разблокировать</button></div>`
        : html`<div class="chat-blocked"><span class="cb-ic">${ic('ban', 18, 2)}</span><div><b>Нельзя отправить сообщение</b><span>${other.name} ограничил сообщения от вас.</span></div></div>`));
    };
    paintBlock();
    chatEl.addEventListener('click', async (e) => {
      const mb = e.target.closest('[data-chat-more]');
      if (mb) {
        pickList({ anchor: mb, title: other.name, search: false, value: '', items: [
          { value: 'profile', label: 'Профиль собеседника' },
          ...(l.status !== 'deleted' ? [{ value: 'listing', label: 'Открыть объявление' }] : []),
          { value: block === 'me' ? 'unblock' : 'block', label: block === 'me' ? 'Разблокировать' : 'Заблокировать' },
          { value: 'report', label: 'Пожаловаться в поддержку' }
        ], onPick: async (v) => {
          if (v === 'profile') go(`/u/${other.id}`);
          else if (v === 'listing') go(`/l/${l.id}`);
          else if (v === 'report') go('/messages/support');
          else if (v === 'block' || v === 'unblock') { const r = await blockFlow(other, block === 'me'); if (r !== undefined) { block = r ? 'me' : null; paintBlock(); } }
        } });
        return;
      }
      if (e.target.closest('[data-unblock]')) { const r = await blockFlow(other, true); if (r !== undefined) { block = r ? 'me' : null; paintBlock(); } }
    });
    chatEl.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-offer-act]');
      if (a && a.dataset.offerAct === 'counter') { // 1.54.0: своя цена в ответ
        const o = offersNow.find((x) => String(x.id) === a.dataset.oid);
        if (!o) return;
        const prev = o.parentId ? offersNow.find((x) => x.id === o.parentId) : null; // моё прошлое предложение
        const min = l.price ? Math.ceil(l.price * 0.3) : 1;
        offerModal({ listingPrice: l.price, title: l.title,
          counter: o.bySeller ? { theirs: o.price, bySeller: false, high: o.price, low: Math.max(min, prev ? prev.price : min) }
            : { theirs: o.price, bySeller: true, low: o.price, high: l.price },
          onSubmit: async (sum) => { await api('POST', `/api/offers/${o.id}/counter`, { price: sum }); await stopChat.poll(); loadList().catch(() => {}); toast(o.bySeller ? 'Ваше предложение отправлено продавцу' : 'Ваша цена отправлена покупателю'); } });
        return;
      }
      if (a) {
        a.disabled = true;
        try {
          await api('POST', `/api/offers/${a.dataset.oid}/${a.dataset.offerAct}`);
          await stopChat.poll(); loadList().catch(() => {});
          toast({ accept: `Договорились — ${role === 'seller' ? 'покупатель' : 'продавец'} получит уведомление`, decline: 'Предложение отклонено', withdraw: 'Предложение отозвано' }[a.dataset.offerAct]);
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
    const paintReplies = (items, max) => { qrItems = items; if (max) qrMax = max; const row = $('[data-replies]', chatEl); if (row) row.innerHTML = String(repliesRow(items)); };
    if (role === 'seller') api('GET', '/api/my/replies').then((r) => paintReplies(r.items, r.max)).catch(() => {});
  }

  // ================= репутация (1.46.0): сделки, а не оценки =================
  // Уровень — объёмный шестигранник своего цвета: серый, зелёный, синий, золотой.
  let medalN = 0;
  const MEDAL = [['#D9DCD8', '#8E948F'], ['#7DDBB4', '#1F7A5A'], ['#7FB2FF', '#3646D8'], ['#FFD978', '#B8650A']];
  const MEDAL_MARK = ['<circle cx="12" cy="12.5" r="2.6" fill="#fff"/>', '<path d="M8.5 12.5l2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    '<path d="M12 7.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" fill="#fff"/>', '<path d="M7 14.5l1.2-5 2.4 2.6L12 8l1.4 4.1 2.4-2.6 1.2 5z" fill="#fff"/>'];
  function levelMedal(level = 0, size = 20) {
    const k = `md${++medalN}`; const [a, b] = MEDAL[level] || MEDAL[0];
    return raw(`<svg class="medal" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><path d="M12 2l8.5 5v10L12 22 3.5 17V7z" fill="url(#${k})"/><path d="M12 2l8.5 5L12 12 3.5 7z" fill="#fff" opacity=".3"/>${MEDAL_MARK[level] || MEDAL_MARK[0]}</svg>`);
  }
  const dealsWord = (n) => `${NF.format(n)}\u00a0${plural(n, 'сделка', 'сделки', 'сделок')}`; // «5 сделок» не разрывается
  // Строка под именем: «⬢ Опытный · 27 сделок». 1.49.0: shop — у магазина без уровня «Новый магазин» вместо «Новичок»;
  // deals: false — без числа сделок (в публичном профиле оно в счётчиках рядом).
  // 1.52.0: first — медаль «Один из первых» (badges.first): стоит в той же строке, справа от уровня.
  const repLine = (r, href = '', { shop = false, deals = true, first = null, who = '', kind = '' } = {}) => {
    const inner = r ? html`${levelMedal(r.level, 18)}<b>${shop && !r.level ? 'Новый магазин' : r.levelName}</b>${deals && r.deals ? html`<span>·\u00a0${dealsWord(r.deals)}</span>` : ''}` : '';
    const line = !r ? '' : href ? html`<a class="rep-line l${r.level}" href="${href}">${inner}</a>` : html`<span class="rep-line l${r.level}">${inner}</span>`;
    return first ? html`<span class="rep-row">${line}${firstChip(first, who, kind || (shop ? 'shop' : ''))}</span>` : line;
  };
  const REPLY_TXT = { hour: '~1 ч', hours: '1–3 ч', day: '< суток', days: '1–2 дня' };
  const MARKS = { first: 'Первая сделка', 10: '10 сделок', 50: '50 сделок', 100: '100 сделок', year: 'Год без жалоб' };
  // Карточка репутации: уровень, три факта, комплименты, вехи. compact — для объявления (две метки, без вех).
  function repCard(r, compact = false) {
    if (!r) return '';
    const tags = compact ? r.tags.slice(0, 2) : r.tags;
    return html`<div class="rep ${compact ? 'compact' : ''}">
      ${compact ? '' : html`<div class="rep-head">${levelMedal(r.level, 40)}<span><b>${r.levelName}</b><small>${r.newbie ? 'сделок пока мало' : 'за 12 месяцев'}</small></span>
        ${r.buyer ? html`<span class="rep-buyer">${ic('check', 13, 2.6)}Надёжный покупатель</span>` : ''}</div>`}
      ${r.newbie ? '' : html`<div class="rep-nums">
        <span><b>${NF.format(r.deals)}</b>${plural(r.deals, 'сделка', 'сделки', 'сделок')}</span>
        ${r.reply && r.reply.time ? html`<span><b>${REPLY_TXT[r.reply.time]}</b>ответ</span>` : ''}
        <span class="${r.complaints ? 'bad' : ''}"><b>${r.complaints}</b>${plural(r.complaints, 'жалоба', 'жалобы', 'жалоб')}</span></div>`}
      ${tags.length ? html`<div class="rep-tags">${tags.map((t) => html`<span>${t.tag}<b>${t.n}</b></span>`)}</div>` : ''}
      ${!compact && r.marks.length ? html`<div class="rep-marks">${r.marks.map((m) => html`<span>${ic('star', 13, 2)}${MARKS[m]}</span>`)}</div>` : ''}
    </div>`;
  }
  // Подсказка: как считается (одна строка, без простыни).
  // «Как считается»: три правила и лестница уровней (условия — как в lib/reputation.js).
  const REP_STEPS = [
    ['Новичок', 'с первого дня'],
    ['Надёжный', 'от 5 сделок · ответ в течение дня'],
    ['Опытный', 'от 20 сделок · ответ за 1–3 ч · на Торгане от 3 мес.'],
    ['Мастер Торганы', 'от 50 сделок · ответ за час · полгода без жалоб']
  ];
  const repHow = () => html`<details class="rep-how"><summary><span class="rh-q">${ic('info', 16, 2)}</span><b>Как считается</b><span class="rh-chev">${ic('down', 16, 2.2)}</span></summary>
    <div class="rh-body">
      <ul class="rh-rules">
        <li><span class="rh-ic">${ic('check', 15, 2.4)}</span><span><b>Сделка</b> — когда её подтвердили обе стороны в чате</span></li>
        <li><span class="rh-ic">${ic('sparkle', 15, 2)}</span><span><b>Комплименты</b> — только после сделки</span></li>
        <li><span class="rh-ic">${ic('shield', 15, 2)}</span><span><b>Жалобы</b> проверяет модератор. Подтверждённая видна в профиле и на 90 дней снижает уровень</span></li>
      </ul>
      <ol class="rh-levels">${REP_STEPS.map(([name, rule], i) => html`<li>${levelMedal(i, 28)}<span><b>${name}</b><small>${rule}</small></span></li>`)}</ol>
    </div></details>`;

  // В чате: «Сделка состоялась?» → комплименты; «Что-то пошло не так» → модератору.
  function dealBar(st) {
    if (!st) return '';
    const issue = st.issue ? html`<span class="deal-issue">${ic('warn', 14, 2)}${{ open: 'Жалоба у модератора', confirmed: 'Жалоба подтверждена', dismissed: 'Жалоба не подтвердилась' }[st.issue.status]}</span>` : '';
    const problem = st.canIssue && !st.issue ? html`<button type="button" class="link-btn deal-problem" data-deal-issue>Что-то пошло не так</button>` : '';
    if (st.confirmed && !st.praised) {
      return html`<div class="deal-bar"><b>${ic('check', 16, 2.6)}Сделка подтверждена. Что понравилось?</b>
        <div class="deal-tags">${st.tags.map((t) => html`<button type="button" class="chip" data-deal-tag="${t}" aria-pressed="false">${t}</button>`)}</div>
        <div class="deal-acts"><button type="button" class="btn btn-dark btn-sm" data-deal-praise disabled>Отправить</button>${problem}${issue}</div></div>`;
    }
    if (st.confirmed) return issue || problem ? html`<div class="deal-bar slim">${issue}${problem}</div>` : '';
    if (!st.ready || st.mine === 'no') return issue || (st.mine === 'no' && problem) ? html`<div class="deal-bar slim">${issue}${problem}</div>` : '';
    if (st.mine === 'yes') return html`<div class="deal-bar slim"><span class="muted">${ic('clock', 14, 2)}Ждём, когда подтвердит ${st.role === 'buyer' ? 'продавец' : 'покупатель'}</span>${problem}${issue}</div>`;
    return html`<div class="deal-bar ask"><b>Сделка состоялась?${st.other ? html` <span class="muted">${st.role === 'buyer' ? 'Продавец' : 'Покупатель'} уже подтвердил</span>` : ''}</b>
      <div class="deal-acts"><button type="button" class="btn btn-dark btn-sm" data-deal="yes">Да</button><button type="button" class="btn btn-soft btn-sm" data-deal="no">Нет</button>${problem}${issue}</div></div>`;
  }
  // 1.47.2: экран «Сделка состоялась» — один раз на сделку, когда её подтвердили обе стороны
  // (тому, кто подтвердил вторым, — сразу; первому — когда откроет чат). Что уже показали — в localStorage.
  const DW_KEY = 'tg-deal-wow';
  const dealWowSeen = (id) => { try { return (localStorage.getItem(DW_KEY) || '').split(',').includes(String(id)); } catch { return false; } };
  const dealWowMark = (id) => { try { const a = (localStorage.getItem(DW_KEY) || '').split(',').filter(Boolean); a.push(String(id)); localStorage.setItem(DW_KEY, a.slice(-200).join(',')); } catch { /* приватный режим */ } };
  // Картинка экрана: аватарка Торганы (как у «Поддержки Торганы») и наша галочка проверки, мягкое свечение и искры.
  const dealWowArt = () => raw(`<svg class="dw-svg" viewBox="0 0 240 210" width="240" height="210" aria-hidden="true">
      <defs>
        <radialGradient id="dwH" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#DCE6FF"/><stop offset=".6" stop-color="#ECE8FF" stop-opacity=".7"/><stop offset="1" stop-color="#F3F1FF" stop-opacity="0"/></radialGradient>
        <filter id="dwS" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#3D4FB8" flood-opacity=".28"/></filter>
      </defs>
      <circle cx="120" cy="104" r="104" fill="url(#dwH)"/>
      <g class="dw-rings" fill="none" stroke="#B9B4F5"><circle cx="120" cy="104" r="86" stroke-opacity=".35"/><circle cx="120" cy="104" r="72" stroke-opacity=".5" stroke-dasharray="2 6" stroke-linecap="round"/></g>
      <g class="dw-ava" filter="url(#dwS)">${String(torganaAva(112)).replace('<svg ', '<svg x="64" y="48" ')}</g>
      <g class="dw-seal"><circle cx="164" cy="146" r="29" fill="#fff"/>${String(verifiedSeal(50)).replace('<svg class="vseal"', '<svg class="vseal" x="139" y="121"')}</g>
      <g class="dw-sp"><path d="M200 50l3.5 8.5 8.5 3.5-8.5 3.5-3.5 8.5-3.5-8.5-8.5-3.5 8.5-3.5z" fill="#8FA8FF"/><path d="M38 136l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#B3A4F7"/><path d="M48 40l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#9CC0FF"/><circle cx="206" cy="122" r="3.5" fill="#C9BEFF"/><circle cx="70" cy="178" r="3" fill="#9CC0FF"/></g>
    </svg>`);
  function dealWow(convId, st, slot) {
    if (!st || !st.confirmed || dealWowSeen(convId) || $('.dw')) return;
    dealWowMark(convId);
    const back = document.createElement('div');
    back.className = 'dw';
    back.innerHTML = String(html`<div class="dw-card" role="dialog" aria-modal="true" aria-labelledby="dw-t" tabindex="-1">
      <button type="button" class="dw-x" data-dw-x aria-label="Закрыть">${ic('close', 24, 2)}</button>
      <div class="dw-art">${dealWowArt()}</div>
      <h2 id="dw-t">Сделка состоялась</h2>
      <p>Вы оба подтвердили её в чате. Спасибо — так репутация на Торгане остаётся честной</p>
      <div class="dw-acts">${st.praised ? html`<button type="button" class="btn btn-accent" data-dw-x>Вернуться в чат</button>`
        : html`<button type="button" class="btn btn-soft" data-dw-x>Позже</button><button type="button" class="btn btn-accent" data-dw-praise>${ic('sparkle', 18, 2)}Отметить, что понравилось</button>`}</div>
    </div>`);
    document.body.appendChild(back);
    document.documentElement.classList.add('dw-open');
    const prev = document.activeElement;
    const close = () => { back.remove(); document.documentElement.classList.remove('dw-open'); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    $$('[data-dw-x]', back).forEach((b) => { b.onclick = close; });
    const pr = $('[data-dw-praise]', back);
    if (pr) pr.onclick = () => { close(); const t = slot && $('[data-deal-tag]', slot); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.focus({ preventScroll: true }); } };
    $('.dw-card', back).focus(); // фокус в окне, без рамки на кнопке; Tab — к кнопкам
  }
  function bindDeal(slot, convId, reset) {
    $$('[data-deal]', slot).forEach((b) => { b.onclick = async () => { try { const r = await api('POST', `/api/conversations/${convId}/deal`, { answer: b.dataset.deal }); if (b.dataset.deal === 'yes' && !(r && r.deal && r.deal.confirmed)) toast('Отмечено'); reset(); } catch (e) { toast(e.message, true); } }; });
    const tags = $$('[data-deal-tag]', slot); const send = $('[data-deal-praise]', slot);
    tags.forEach((b) => {
      b.onclick = () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        if (on && tags.filter((x) => x.getAttribute('aria-pressed') === 'true').length >= 3) { toast('Не больше трёх', true); return; }
        b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('active', on);
        send.disabled = !tags.some((x) => x.getAttribute('aria-pressed') === 'true');
      };
    });
    if (send) send.onclick = async () => { try { await api('POST', `/api/conversations/${convId}/praise`, { tags: tags.filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.dataset.dealTag) }); toast('Спасибо!'); reset(); } catch (e) { toast(e.message, true); } };
    const pb = $('[data-deal-issue]', slot);
    if (pb) pb.onclick = () => issueModal(convId, JSON.parse(slot.dataset.state).reasons, reset);
  }
  function issueModal(convId, reasons, done) {
    openModal(String(html`<h2>Что случилось?</h2><p class="muted" style="margin:0 0 12px">Увидит только модератор. Вторая сторона сможет объясниться.</p>
      <div class="rv-reasons">${reasons.map((r, i) => html`<label><input type="radio" name="reason" value="${r}"${i === 0 ? raw(' checked') : ''}><span>${r}</span></label>`)}</div>
      <div class="field" style="margin-top:12px"><label for="is-text">Подробности — по желанию</label><textarea id="is-text" class="textarea" maxlength="500"></textarea></div>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Отправить</button></div>`), (m, close) => {
      $('[data-x]', m).onclick = close;
      $('[data-ok]', m).onclick = async () => {
        try { await api('POST', `/api/conversations/${convId}/issue`, { reason: $('input[name="reason"]:checked', m).value, text: $('#is-text', m).value.trim() }); close(); toast('Отправлено модератору'); done(); } catch (e) { toast(e.message, true); }
      };
    });
  }

  // ================= профиль =================
  const MY_STATUS = { active: 'Активные', scheduled: 'Запланированы', pending: 'На проверке', rejected: 'На исправлении', sold: 'Проданные', archived: 'Сняты' };
  const MY_TAG = { active: ['ok', 'Опубликовано'], scheduled: ['wait', 'Запланировано'], pending: ['wait', 'На проверке'], rejected: ['bad', 'Нужно исправить'], sold: ['dark', 'Продано'], archived: ['off', 'Снято'] };
  const isExpired = (i) => i.status === 'archived' && i.expiresAt && i.expiresAt <= Date.now(); // прошло 30 дней
  const atTime = (ts) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

  // Насколько заполнен профиль: имя есть всегда, дальше фото, город и (если есть почта) подтверждённый email.
  // 1.49.0: с тарифом — и витрина. Каждый пункт — [готово, что, действие, ключ]; ключ ведёт туда, где это заполнить.
  function profileTodo(u) {
    const sh = u.shop; // витрина — при тарифе или у официального аккаунта
    const todo = [
      [!!u.avatar, 'Фото профиля', 'Добавить', 'avatar'],
      [!!u.city, 'Город', 'Указать', 'city'],
      ...(S.config.mail ? [[u.emailVerified, 'Почта', 'Подтвердить', 'verify']] : []),
      ...(sh ? [[!!sh.cover, 'Обложка витрины', 'Загрузить', 'cover'], [!!sh.about, 'Описание магазина', 'Написать', 'about'], [!!sh.hours, 'Часы работы', 'Указать', 'hours'],
        [!!sh.address, 'Адрес', 'Указать', 'addr'], [!!sh.delivery, 'Доставка', 'Указать', 'delivery'], [!!sh.site, 'Сайт', 'Указать', 'site']] : [])
    ];
    return { todo: todo.filter((t) => !t[0]), pct: Math.round(((todo.filter((t) => t[0]).length + 1) / (todo.length + 1)) * 100) };
  }
  // Своя карточка слева в профиле и настройках: фото с камерой, имя, отметка проверки, цифры, что ещё заполнить.
  // 1.49.0: имя и галочка бренда — в одну строку, из отметок — только проверка ИП/компании и телефона;
  // у магазина — своя обложка и две плитки: «Статистика» и «Настройка витрины».
  function idCard(u, stats = []) {
    const { todo, pct } = profileTodo(u);
    const sh = u.shop; // витрина — при тарифе или у официального аккаунта
    // 1.50.1: на обложке плашек нет — тариф (или «Официальный аккаунт» вместо «Владелец») стоит первой плашкой; это не ссылка.
    const badges = html`${planBadge(sh, u.plan, true)}${trustBadges(u.badges && { ...u.badges, shop: false, tm: null })}${u.isAdmin && !(sh && sh.official) ? html`<span class="pf-badge">${ic('shield', 13, 2)} ${u.isOwner ? 'Владелец' : 'Модератор'}</span>` : ''}`;
    return html`<div class="pf-card ${sh ? `shop ${sh.plan}` : ''}">
      ${sh ? html`<a class="pf-cover ${sh.cover ? 'has' : ''}" href="/profile/business/shop" aria-label="Обложка витрины"${sh.cover ? raw(` style="--cv:url('${esc(sh.cover)}')"`) : ''}></a>` : ''}
      <div class="pf-who">
        <div class="pf-ava">${ava(u, 'lg')}<button class="pf-cam" type="button" data-ava-pick aria-label="${u.avatar ? 'Сменить фото профиля' : 'Добавить фото профиля'}">${ic('camera', 15, 2)}</button></div>
        <div class="pf-who-txt">
          <div class="pf-name">${nameSeal(u.name, u.badges)}</div>
          <div class="pf-sub">${u.city ? `${u.city} · ` : ''}на Торгане с ${since(u.createdAt)}</div>
          ${u.rep && !(sh && sh.official) ? repLine(u.rep, '/profile/reputation', { shop: !!sh, first: u.badges && u.badges.first, kind: 'me' }) : ''}
        </div>
        <a class="icon-btn pf-gear" href="/profile/settings" aria-label="Настройки">${ic('gear', 20)}</a>
      </div>
      ${String(badges).trim() ? html`<div class="pf-badges">${badges}</div>` : ''}
      ${sh && sh.about ? html`<div class="pf-about"><p data-about>${sh.about}</p><div class="pf-about-acts"><button type="button" class="pf-about-more" data-about-more hidden>Ещё</button><a href="/profile/business/shop#sh-about">${ic('edit', 14, 2.2)}Изменить</a></div></div>` : ''}
      ${stats.length ? html`<div class="pf-nums">${stats.map(([n, k, href]) => html`<a class="pf-num" href="${href}"><b>${NF.format(n)}</b><span>${k}</span></a>`)}</div>` : ''}
      ${sh ? html`<div class="pf-tools">
        <a class="pft" href="/profile/business/stats"><span class="pft-ic">${ic('chart', 19, 2.2)}</span><b>Статистика</b><small>Показы и переходы</small><span class="pft-go">${ic('right', 16, 2.4)}</span></a>
        <a class="pft" href="/profile/business/shop"><span class="pft-ic">${ic('store', 19, 2.2)}</span><b>Настройка витрины</b><small>Обложка и описание</small><span class="pft-go">${ic('right', 16, 2.4)}</span></a>
      </div>` : ''}
      ${pct < 100 ? html`<div class="pf-progress ${todoClosed() ? 'closed' : ''}">
        <button type="button" class="pf-progress-head" data-todo-toggle aria-expanded="${todoClosed() ? 'false' : 'true'}" aria-label="${todoClosed() ? 'Показать, что ещё заполнить' : 'Скрыть список'}"><span>Профиль заполнен</span><b>${pct}%</b>${ic('down', 16, 2.4)}</button>
        <div class="pf-bar"><i style="width:${pct}%"></i></div>
        <div class="pf-todo">${todo.map((t) => html`<button type="button" class="pf-todo-row" data-todo="${t[3]}"><i aria-hidden="true"></i><span>${t[1]}</span><b>${t[2]}</b></button>`)}</div>
      </div>` : ''}
    </div>`;
  }
  // 1.50.3: список «Что ещё заполнить» можно свернуть — нажатием на «Профиль заполнен»; запоминается на устройстве.
  const TODO_KEY = 'tg-todo-closed';
  const todoClosed = () => { try { return localStorage.getItem(TODO_KEY) === '1'; } catch { return false; } };
  // «Что ещё заполнить»: фото — сразу выбор файла, город — настройки, почта — письмо с кодом, витрина — нужное поле.
  function bindIdCard(again) {
    $('[data-ava-pick]').onclick = () => pickAvatar(again);
    // 1.50.4: своё описание магазина — первые строки и «Ещё», если текст длиннее.
    const ab = $('[data-about]'); const more = $('[data-about-more]');
    if (ab && more) {
      more.hidden = ab.scrollHeight <= ab.clientHeight + 1;
      more.onclick = () => { const open = ab.classList.toggle('open'); more.textContent = open ? 'Свернуть' : 'Ещё'; };
    }
    const tg = $('[data-todo-toggle]');
    if (tg) tg.onclick = () => {
      const closed = tg.parentElement.classList.toggle('closed');
      tg.setAttribute('aria-expanded', closed ? 'false' : 'true');
      tg.setAttribute('aria-label', closed ? 'Показать, что ещё заполнить' : 'Скрыть список');
      try { localStorage.setItem(TODO_KEY, closed ? '1' : '0'); } catch { /* без памяти — просто на этой странице */ }
    };
    $$('[data-todo]').forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.todo;
        if (t === 'avatar') pickAvatar(again);
        else if (t === 'city') go('/profile/settings#s-city');
        else if (t === 'verify') verifyModal(again);
        else go(`/profile/business/shop#sh-${t}`);
      };
    });
  }

  // 1.50.1: плашка тарифа (или «Официальный аккаунт») в строке плашек — вместо меток на обложке. Не ссылка.
  // mine — в своём профиле ещё и срок: «Магазин Про · до 10 декабря», у бесплатного — «бесплатно до …».
  function planBadge(sh, plan = null, mine = false) {
    if (!sh) return '';
    if (sh.official) return html`<span class="pf-badge pf-tariff">Официальный аккаунт</span>`;
    const name = sh.plan === 'pro' ? 'Магазин Про' : 'Магазин';
    const until = mine && plan ? ` · ${plan.trial ? 'бесплатно\u00a0' : ''}до\u00a0${new Date(plan.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(' ', '\u00a0')}` : ''; // срок не разрывается
    return html`<span class="pf-badge pf-tariff">${ic('store', 13, 2.2)} ${name}${until}</span>`;
  }

  // Значки доверия продавца: «Телефон подтверждён», «ИП проверен» / «Компания проверена».
  // 1.45.0: объёмная цветная галочка проверенного бренда (товарный знак сверен с реестром Роспатента) — рядом с именем.
  // У каждого значка свои id градиентов: общие id ломаются, если первый значок на странице скрыт.
  let sealN = 0;
  const SEAL_PATH = 'M12 1L14.48 2.73L17.5 2.47L18.79 5.21L21.53 6.5L21.27 9.52L23 12L21.27 14.48L21.53 17.5L18.79 18.79L17.5 21.53L14.48 21.27L12 23L9.52 21.27L6.5 21.53L5.21 18.79L2.47 17.5L2.73 14.48L1 12L2.73 9.52L2.47 6.5L5.21 5.21L6.5 2.47L9.52 2.73Z';
  function verifiedSeal(size = 20) {
    const k = `vs${++sealN}`;
    return raw(`<svg class="vseal" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs>
      <linearGradient id="${k}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5FE0FF"/><stop offset=".45" stop-color="#2F8BFF"/><stop offset="1" stop-color="#5B3DF5"/></linearGradient>
      <linearGradient id="${k}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <path d="${SEAL_PATH}" transform="translate(0 .9)" fill="#2A1F8F" opacity=".45" stroke="#2A1F8F" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="${SEAL_PATH}" fill="url(#${k}a)" stroke="url(#${k}a)" stroke-width="1.6" stroke-linejoin="round"/>
      <ellipse cx="11" cy="7.4" rx="7" ry="4.2" fill="url(#${k}b)"/>
      <path d="M7.6 12.6l3 3 6-6.4" fill="none" stroke="#1B2A8A" stroke-opacity=".35" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 .7)"/>
      <path d="M7.6 12.6l3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  }
  // 1.52.0: медаль «Один из первых / Одна из первых» — первые 1000 продавцов (lib/first.js). Объёмная, как галочка
  // проверки, но в индиго Торганы, чтобы их не путали. n — номер на медали (подсказка, настройки); без номера — звезда.
  const MEDAL_R = ['M16 33L9 54.5l5.6-2.6 3.6 5 5.4-19z', 'M32 33l7 21.5-5.6-2.6-3.6 5-5.4-19z'];
  const MEDAL_STAR = 'M24 13.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L24 28.4l-5.8 3 1.1-6.4-4.7-4.6 6.5-.9z';
  function firstMedal(w = 18, n = 0) {
    const k = `fm${++sealN}`; const g = (id, a, b, c) => `<linearGradient id="${k}${id}" x1="0" y1="0" x2="${c ? 1 : 0}" y2="1"><stop offset="0" stop-color="${a}"/>${c ? `<stop offset=".45" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>` : `<stop offset="1" stop-color="${b}"/>`}</linearGradient>`;
    const big = w >= 30; const fs = String(n).length > 3 ? 8.8 : 10.5;
    const face = n ? `<ellipse cx="21.5" cy="17" rx="9" ry="4.6" fill="url(#${k}h)" opacity=".7"/><path d="M24 12.2l1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4z" fill="#fff"/>
      <text x="24" y="30.6" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#24187A" fill-opacity=".5" letter-spacing="-.3">${n}</text><text x="24" y="29.8" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#fff" letter-spacing="-.3">${n}</text>`
      : `<path d="${MEDAL_STAR}" fill="#24187A" fill-opacity=".35" transform="translate(0 1)"/><path d="${MEDAL_STAR}" fill="#fff"/>`;
    return raw(`<svg class="fmedal${big ? ' big' : ''}" width="${w}" height="${Math.round(w * 58 / 48)}" viewBox="0 0 48 58" aria-hidden="true"><defs>
      ${g('g', '#B9C6FF', '#5B6FE8', '#5B3DF5')}${g('a', '#3963CC', '#4B33E6')}${g('b', '#7C8CFF', '#3963CC')}${g('h', '#fff', 'rgba(255,255,255,0)')}
      <radialGradient id="${k}f" cx=".34" cy=".28" r=".9"><stop offset="0" stop-color="#9AA8FF"/><stop offset=".48" stop-color="#4A5BE0"/><stop offset="1" stop-color="#3A23B8"/></radialGradient></defs>
      ${MEDAL_R.map((d) => `<path d="${d}" fill="#24187A" opacity=".45" transform="translate(0 1.4)"/>`).join('')}<path d="${MEDAL_R[0]}" fill="url(#${k}a)"/><path d="${MEDAL_R[1]}" fill="url(#${k}b)"/>
      <path d="M16 33l7.6 4.9-3 10.6-5.3-1.2 2.6-11z" fill="#fff" opacity=".16"/><circle cx="24" cy="23" r="19" fill="#24187A" opacity=".5" transform="translate(0 2.6)"/>
      <circle cx="24" cy="23" r="19" fill="#33229E" transform="translate(0 1.5)"/><circle cx="24" cy="23" r="19" fill="url(#${k}g)"/>
      ${big ? '<circle cx="24" cy="23" r="17.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".7" stroke-dasharray=".9 1.3"/>' : ''}
      <circle cx="24" cy="23.7" r="14.6" fill="#24187A" opacity=".45"/><circle cx="24" cy="23" r="14.4" fill="url(#${k}f)"/><ellipse cx="22" cy="10.6" rx="12" ry="5" fill="url(#${k}h)"/>${face}</svg>`);
  }
  const firstName = (form) => (form === 'f' ? 'Одна из первых' : 'Один из первых');
  // Метка у уровня репутации. Касание (телефон) или наведение мыши — подсказка с номером (bindFirstPop).
  // who — имя для текста подсказки; kind: me — свой профиль, shop — магазин.
  const firstChip = (f, who = '', kind = '') => (f ? html`<span class="fm-chip" role="button" tabindex="0" data-first="${f.no}" data-form="${f.form}" data-who="${who}" data-kind="${kind}" aria-label="${firstName(f.form)}, номер ${f.no}" aria-haspopup="dialog">${firstMedal(16)}<b>${firstName(f.form)}</b></span>` : '');
  function firstText(d) {
    const no = d.first; const she = d.form === 'f';
    if (d.kind === 'me') return `Вы в первой тысяче продавцов Торганы, ваш номер — ${no}. Медаль остаётся навсегда.`;
    if (d.kind === 'shop') return `«${d.who}» — в первой тысяче продавцов Торганы, номер — ${no}. Медаль остаётся навсегда.`;
    return `${d.who} ${she ? 'вошла' : 'вошёл'} в первую тысячу продавцов Торганы, ${she ? 'её' : 'его'} номер — ${no}. Медаль остаётся навсегда.`;
  }
  // Одна подсказка на страницу: под меткой (или над ней, если внизу нет места), в пределах экрана.
  function bindFirstPop() {
    let pop = null; let at = null; let timer = 0;
    const hide = () => { clearTimeout(timer); if (pop) { pop.remove(); pop = null; } if (at) { at.setAttribute('aria-expanded', 'false'); at = null; } };
    const show = (chip) => {
      clearTimeout(timer);
      if (at === chip) return;
      hide(); at = chip; chip.setAttribute('aria-expanded', 'true');
      const d = chip.dataset;
      pop = document.createElement('div');
      pop.className = 'fm-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', firstName(d.form));
      pop.innerHTML = String(html`${firstMedal(46, d.first)}<span><b>${firstName(d.form)} · № ${d.first}</b><small>${firstText(d)}</small></span>`);
      document.body.appendChild(pop);
      const r = chip.getBoundingClientRect(); const pw = pop.offsetWidth; const ph = pop.offsetHeight; const vw = document.documentElement.clientWidth;
      const left = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), vw - pw - 12);
      const below = r.bottom + 10 + ph < window.innerHeight || r.top < ph + 20;
      pop.style.left = `${left + window.scrollX}px`;
      pop.style.top = `${(below ? r.bottom + 10 : r.top - ph - 10) + window.scrollY}px`;
      pop.style.setProperty('--ax', `${Math.min(Math.max(22, r.left + r.width / 2 - left), pw - 22)}px`);
      pop.classList.add(below ? 'down' : 'up');
      pop.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-first]'))) timer = setTimeout(hide, 150); });
      pop.addEventListener('pointerenter', () => clearTimeout(timer));
    };
    const chipOf = (e) => e.target.closest && e.target.closest('[data-first]');
    // Метка бывает внутри ссылки (карточка продавца в объявлении) — касание не уводит со страницы.
    document.addEventListener('click', (e) => {
      const c = chipOf(e);
      if (c) { e.preventDefault(); e.stopPropagation(); if (at === c && !matchMedia('(hover: hover)').matches) hide(); else show(c); return; }
      if (pop && !pop.contains(e.target)) hide();
    }, true);
    document.addEventListener('keydown', (e) => {
      const c = chipOf(e);
      if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); if (at === c) hide(); else show(c); }
      if (e.key === 'Escape' && pop) { const a = at; hide(); if (a) a.focus(); }
    }, true);
    document.addEventListener('pointerover', (e) => { const c = chipOf(e); if (c && e.pointerType === 'mouse') show(c); });
    document.addEventListener('pointerout', (e) => {
      const c = chipOf(e);
      if (!c || e.pointerType !== 'mouse' || c !== at) return;
      const to = e.relatedTarget;
      if (to && (c.contains(to) || (pop && pop.contains(to)))) return;
      timer = setTimeout(hide, 150);
    });
    document.addEventListener('focusout', (e) => { if (chipOf(e) && !(pop && pop.contains(e.relatedTarget))) timer = setTimeout(hide, 150); });
    window.addEventListener('resize', hide);
    window.addEventListener('popstate', hide);
    window.addEventListener('torgana:route', hide);
  }
  bindFirstPop();
  // Имя с галочкой — только у проверенного бренда (товарный знак из реестра Роспатента).
  // 1.49.0: последнее слово и галочка не разрываются — галочка не уходит одна на новую строку.
  // 1.50.0: у официального аккаунта Торганы — та же галочка, что у «Поддержки Торганы».
  const nameSeal = (name, b) => {
    if (!(b && (b.official || b.tm))) return name;
    const n = String(name); const cut = n.lastIndexOf(' ') + 1;
    const title = b.official ? 'Официальный аккаунт Торганы' : `Проверенный бренд «${b.tm.name}» — товарный знак № ${b.tm.number} в реестре Роспатента`;
    return html`${n.slice(0, cut)}<span class="ns-tail">${n.slice(cut)}<span class="name-seal" title="${title}">${verifiedSeal(22)}</span></span>`;
  };
  const trustBadges = (b) => (b ? html`${b.shop ? html`<span class="pf-badge dark">${ic('store', 13, 2)} Магазин</span>` : ''}${b.tm ? html`<span class="pf-badge seal" title="Товарный знак «${b.tm.name}», свидетельство Роспатента № ${b.tm.number}">${verifiedSeal(15)} Проверенный бренд</span>` : ''}${b.biz ? html`<span class="pf-badge ok" title="${b.biz.name}">${ic('shield', 13, 2)} ${b.biz.kind === 'ИП' ? 'ИП проверен' : 'Компания проверена'}</span>` : ''}${b.phone ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Телефон подтверждён</span>` : ''}` : '');

  // Разделы аккаунта и «Выйти» — одно меню для левой колонки профиля (на компьютере) и для панели ≡ (full).
  // В панели вместо пункта «Настройки» — все группы настроек, публичный профиль и помощь.
  const FOOTER_LABEL = Object.fromEntries(FOOTER_COLS.flatMap((c) => c[1]));
  const HELP_LINKS = [['/page/help', 'search'], ['/page/safety', 'shield'], ['/page/rules', 'flag'], ...(PAY ? [['/business', 'store']] : [])];
  function navKey() {
    const p = location.pathname;
    if (p === '/profile' || p.startsWith('/profile/listings') || p.startsWith('/profile/stats')) return 'listings';
    if (p.startsWith('/profile/')) return p.split('/')[2];
    if (p === '/messages/support') return 'support';
    return { '/favorites': 'fav', '/messages': 'msg', '/admin': 'admin', '/new': 'new' }[p.startsWith('/messages') ? '/messages' : p] || p;
  }
  // Пункт меню со значком — один для меню профиля, панели ≡ и меню модерации.
  const navLink = (href, icon, label, on, right = '', key = '') => html`<a href="${href}" class="${on ? 'on' : ''}"${on ? raw(' aria-current="page"') : ''}${key ? raw(` data-k="${key}"`) : ''}>${ic(icon, 20)}<span class="lbl">${label}</span>${right}</a>`;
  // На телефоне в профиле меню прячется, а четыре пункта (data-k: msg, fav, following, rep) становятся плитками.
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
      ${item('/profile/following', 'users', 'Подписки', 'following', html`<span class="badge ${S.fresh && S.fresh.follow ? '' : 'hidden'}" data-fresh-follow>${S.fresh ? S.fresh.follow || 0 : 0}</span>`)}
      ${item('/profile/reputation', 'star', 'Репутация', 'rep', u.rep && u.rep.level ? html`<span class="nav-rating">${levelMedal(u.rep.level, 14)}</span>` : '')}
      ${PAY ? item('/profile/business', 'store', 'Для бизнеса', 'business') : ''}
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
    if (NATIVE && apnsToken) { await api('POST', '/api/push/apns/off', { token: apnsToken.token }).catch(() => {}); apnsMark(''); apnsSent = ''; }
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
    if (NATIVE && nativePost({ type: 'share', url, text: title })) return; // системное «Поделиться» iPhone
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
  // Репутация, настройки, статистика — разделы; на телефоне без карточки, со ссылкой «Профиль». Всё меню — в ≡.
  async function viewProfile(section, q) {
    if (!requireAuth()) return;
    if (!section && q.get('tab') === 'settings') { go(`/profile/settings${location.hash}`, true); return; }
    if (section === 'settings') { viewSettings(); return; }
    if (section === 'searches') { go('/profile/following', true); return; } // 1.39.0: сохранённые поиски убраны
    if (section === 'reviews') { go('/profile/reputation', true); return; } // 1.47.2: отзывов нет, старые ссылки — на репутацию
    const hub = !section || section === 'listings';
    const statId = section && section.startsWith('stats/') ? section.slice(6) : null;
    const bizSub = section && section.startsWith('business') ? section.split('/')[1] || '' : null;
    const sec = statId ? 'stats' : bizSub !== null ? 'business' : section || 'listings';
    const BIZ_TITLE = { '': 'Для бизнеса', shop: 'Настройка витрины', stats: 'Статистика магазина' };
    setTitle(sec === 'business' ? BIZ_TITLE[bizSub] : { stats: 'Статистика', reputation: 'Репутация', following: 'Подписки' }[sec] || 'Профиль');
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
      : sec === 'reputation'
      ? html`<div class="pf-head"><h1>Репутация</h1></div>`
      : html`<div class="pf-head"><h1>Мои объявления</h1></div>`; // 1.50.0: «Разместить» — в шапке сайта (на телефоне — «+» внизу), второй кнопки здесь нет
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
    if (sec === 'reputation') return renderMyRep(again);
    if (sec === 'following') return renderFollowing(again);
    return renderMyListings(items, q.get('status') || 'active', again);
  }

  const pinnedIds = () => (S.user && S.user.shop ? S.user.shop.pins || [] : []);
  const canPin = () => !!(S.user && S.user.shop && (S.user.shop.official || S.user.shop.plan === 'pro'));
  function renderMyListings(items, status, reload) {
    const groups = { active: [], scheduled: [], pending: [], rejected: [], sold: [], archived: [] };
    items.forEach((i) => (groups[i.status] || groups.archived).push(i));
    const list = groups[status] || [];
    $('#box').innerHTML = String(html`
      ${items.length ? html`<div class="pf-status" role="tablist">${Object.keys(MY_STATUS).filter((k) => k !== 'scheduled' || groups.scheduled.length || status === k).map((k) => html`<a class="chip ${k === status ? 'active' : ''} ${groups[k].length ? '' : 'zero'}" href="/profile?status=${k}">${MY_STATUS[k]}<span class="cnt">${groups[k].length}</span></a>`)}</div>` : ''}
      ${list.length ? html`<div class="ml-list">${list.map((i) => {
        const [tone, label] = isExpired(i) ? ['off', 'Срок истёк'] : MY_TAG[i.status] || MY_TAG.archived;
        // Продвижение — прямо под объявлением, пока есть что докупить (XL, рамка, метки).
        const busy = boostBusy(i.boost);
        const free = BOOST.filter(([k]) => !busy[k]);
        const canBoost = boostOn() && ['active', 'pending', 'scheduled'].includes(i.status) && !isExpired(i) && free.length;
        return html`<article class="ml-card">
          <a href="/l/${i.id}" class="ml-img" tabindex="-1" aria-hidden="true">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
          <div class="ml-info">
            <span class="ml-tag ${tone}"><i></i>${label}</span>
            <a href="/l/${i.id}" class="ml-title">${i.title}</a>
            ${i.status === 'active' && pinnedIds().includes(i.id) ? html`<span class="ml-promo pinned">${ic('pushpin', 13, 2)}Закреплено на витрине</span>` : ''}
            <div class="ml-price">${price(i.price, i.priceUnit)}</div>
            ${i.promo ? html`<span class="ml-promo ${i.promo.status}">${ic('megaphone', 13, 2)}${i.promo.status === 'active' ? `Реклама · ещё ${dayWord(Math.max(1, daysLeft(i.promo.endsAt)))}` : 'Реклама'}</span>` : ''}
            <div class="ml-meta"><span title="Просмотры">${svg(P.eye, 15, 1.8)} ${NF.format(i.views)}</span><span title="В избранном">${svg(P.heart, 15, 1.8)} ${i.favCount}</span><span>${i.city} · ${shortWhen(i.createdAt)}</span>${i.status === 'active' && i.expiresAt ? html`<span title="Объявление висит 30 дней, потом его можно бесплатно опубликовать снова">${ic('clock', 15, 1.8)} до ${dateShort(i.expiresAt)}</span>` : ''}</div>
          </div>
          <div class="ml-side">
            ${i.status === 'rejected' ? html`<a class="btn btn-dark btn-sm hide-xs" href="/edit/${i.id}">Исправить</a>` : ''}
            ${isExpired(i) ? html`<button type="button" class="btn btn-accent btn-sm hide-xs" data-repost="${i.id}">Опубликовать снова</button>` : ''}
            ${['active', 'sold', 'archived'].includes(i.status) ? html`<a class="icon-btn ml-more" href="/profile/stats/${i.id}" aria-label="Статистика объявления" title="Статистика">${ic('chart', 20, 2)}</a>` : ''}
            <button type="button" class="icon-btn ml-more" data-more="${i.id}" aria-label="Действия с объявлением">${svg(P.more, 20, 2.2)}</button>
          </div>
          ${mlBoostRow(i.boost)}
          ${canBoost ? html`<button type="button" class="ml-boost" data-boost="${i.id}"><span class="ml-boost-ic">${ic('bolt', 17, 2.2)}</span><b>${free.length < 3 ? 'Добавить продвижение' : 'Продвинуть'}</b><small>${free.map(([k]) => ({ xl: 'XL', frame: 'рамка', tags: 'метки' })[k]).join(', ')} · от ${rub(Math.min(...free.map(([k]) => boostPrices()[k])))}</small>${ic('right', 17, 2)}</button>` : ''}
          ${i.status === 'scheduled' ? html`<div class="ml-note ok">${ic('clock', 15, 2)} Проверено — опубликуем ${atTime(i.publishAt)} (мск). Видно только вам.</div>` : ''}
          ${isExpired(i) ? html`<div class="ml-note soft">Прошло 30 дней, объявление снято. Если ещё актуально — опубликуйте снова: бесплатно, окажется среди свежих.</div>` : ''}
          ${i.status === 'pending' ? html`<div class="ml-note warn">${i.flags ? `Проверяем внимательнее: похоже на «${i.flags}». ` : ''}${reviewLine(i.review)}</div>` : ''}
          ${i.status === 'rejected' ? html`<div class="ml-note bad"><strong>Причина:</strong> ${i.rejectReason || 'не указана'}${i.appealAt ? ' · апелляция отправлена' : ''}${i.appealReply ? html`<br><strong>Ответ на апелляцию:</strong> ${i.appealReply}` : ''}</div>` : ''}
        </article>`;
      })}</div>`
      : status === 'active' && !items.length ? html`<div class="pf-empty">
          <div class="pf-empty-ic">${svg(P.tag, 34, 1.6)}</div>
          <h3>Пока нет объявлений</h3>
          <p>Бесплатно и за пару минут.</p>
          <a class="btn btn-dark" href="/new">${ic('plus', 18, 2.2)}Создать первое объявление</a>
        </div>`
      : html`<div class="pf-empty sm"><h3>Здесь пусто</h3><p>${{ active: 'Нет опубликованных объявлений.', scheduled: 'Нет объявлений, ждущих выбранного времени.', pending: 'Сейчас ничего не ждёт проверки.', rejected: 'Нет объявлений, которые нужно исправить.', sold: 'Отметьте объявление «Продано», и оно появится здесь.', archived: 'Снятые с публикации объявления появятся здесь.' }[status]}</p></div>`}`);
    const byId = Object.fromEntries(items.map((i) => [String(i.id), i]));
    const setStatus = async (i, st, msg) => { try { await api('PATCH', `/api/listings/${i.id}`, { status: st }); toast(msg); reload(); } catch (e) { toast(e.message, true); } };
    $$('[data-repost]').forEach((b) => { b.onclick = () => setStatus(byId[b.dataset.repost], 'active', 'Снова опубликовано — на 30 дней'); });
    $$('[data-boost]').forEach((b) => { b.onclick = () => { const i = byId[b.dataset.boost]; boostModal(i.id, i.title, i.promo); }; });
    $$('[data-more]').forEach((b) => {
      b.onclick = () => {
        const i = byId[b.dataset.more];
        const acts = [{ icon: 'eye', label: 'Открыть объявление', href: `/l/${i.id}` }, { icon: 'edit', label: i.status === 'rejected' ? 'Исправить' : 'Изменить', href: `/edit/${i.id}` }];
        if (['active', 'sold', 'archived'].includes(i.status)) acts.splice(1, 0, { icon: 'chart', label: 'Статистика', href: `/profile/stats/${i.id}` });
        if (i.status === 'active') acts.push({ icon: 'check', label: 'Отметить «Продано»', run: () => setStatus(i, 'sold', 'Отмечено как проданное') }, { icon: 'pause', label: 'Снять с публикации', run: () => setStatus(i, 'archived', 'Снято с публикации') });
        if (i.status === 'sold' || i.status === 'archived') acts.push({ icon: 'refresh', label: 'Опубликовать снова', run: () => setStatus(i, 'active', 'Снова опубликовано') });
        if (i.status === 'scheduled') acts.push({ icon: 'refresh', label: 'Опубликовать сейчас', run: () => setStatus(i, 'active', 'Опубликовано') }, { icon: 'pause', label: 'Не публиковать', run: () => setStatus(i, 'archived', 'Публикация отменена') });
        if (i.status === 'rejected' && !i.appealAt && !i.appealReply) acts.push({ icon: 'chat', label: 'Подать апелляцию', run: () => appealModal(i.id, reload) });
        if (PAY && ['active', 'pending', 'scheduled'].includes(i.status) && (boostOn() || i.promo || (i.boost || []).length)) acts.splice(1, 0, { icon: 'trend', label: 'Продвинуть', run: () => boostModal(i.id, i.title, i.promo) });
        if (i.status === 'active') acts.push({ icon: 'share', label: 'Поделиться', run: () => shareLink(`${location.origin}${lpath(i)}`, i.title) });
        // 1.49.0: «Магазин Про» — до 3 объявлений в начале витрины.
        if (i.status === 'active' && canPin()) {
          const on = pinnedIds().includes(i.id);
          acts.push({ icon: 'pushpin', label: on ? 'Открепить с витрины' : 'Закрепить на витрине', run: async () => { if (await setPin(i.id, !on)) reload(); } });
        }
        acts.push({ icon: 'trash', label: 'Удалить', danger: true, run: async () => { if (await deleteListing(i.id)) reload(); } });
        actionSheet(i.title, acts);
      };
    });
  }

  // 1.46.0: своя репутация — как её видят другие, жалобы на меня (можно объясниться) и мои жалобы.
  const ISSUE_ST = { open: ['wait', 'У модератора'], confirmed: ['bad', 'Подтверждена'], dismissed: ['ok', 'Не подтвердилась'] };
  async function renderMyRep(reload) {
    const d = await api('GET', '/api/my/reputation');
    const row = (x, mine) => html`<div class="rep-issue"><span class="ml-tag ${ISSUE_ST[x.status][0]}"><i></i>${ISSUE_ST[x.status][1]}</span>
      <b>${mine ? 'Вы пожаловались' : 'На вас пожаловались'}: ${x.reason}</b><small>«${x.title}» · ${when(x.at)}${x.note ? ` · ${x.note}` : ''}</small>
      ${x.reply ? html`<small>Ваше объяснение: ${x.reply}</small>` : ''}
      ${x.canReply ? html`<button type="button" class="btn btn-soft btn-sm" data-issue-reply="${x.id}">Объяснить модератору</button>` : ''}</div>`;
    $('#box').innerHTML = String(html`<div class="rep-page">
      ${repCard(d.rep)}${repHow()}
      ${d.against.length || d.mine.length ? html`<section class="rep-issues"><h2>Жалобы по сделкам</h2>${d.against.map((x) => row(x, false))}${d.mine.map((x) => row(x, true))}</section>` : ''}
    </div>`);
    $$('[data-issue-reply]').forEach((b) => {
      b.onclick = () => openModal(String(html`<h2>Ваше объяснение</h2><p class="muted" style="margin:0 0 12px">Увидит только модератор. Ответить можно один раз.</p>
        <label class="sr" for="ir-text">Объяснение</label><textarea id="ir-text" class="textarea" maxlength="1000" placeholder="Как всё было"></textarea>
        <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Отправить</button></div>`), (m, close) => {
        $('[data-x]', m).onclick = close;
        $('[data-ok]', m).onclick = async () => { try { await api('POST', `/api/issues/${b.dataset.issueReply}/reply`, { text: $('#ir-text', m).value.trim() }); close(); toast('Отправлено модератору'); reload(); } catch (e) { toast(e.message, true); } };
      });
    });
  }

  // Статистика объявления: цифры, переходы по дням, путь покупателя, источники, подсказка.
  const SHORT_M = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dayLabel = (d) => `${Number(d.slice(8, 10))} ${SHORT_M[Number(d.slice(5, 7)) - 1]}`;
  const STAT_SRC = [['search', 'search', 'Поиск'], ['home', 'home', 'Главная лента'], ['category', 'tag', 'Категории'], ['ad', 'megaphone', 'Блок «Реклама»'], ['external', 'share', 'Прямые заходы и ссылки извне'], ['other', 'right', 'Другие страницы Торганы']];
  // Переходы из выдачи — только с тех страниц, где считаются показы. Прямые ссылки, чаты и профиль показов не дают.
  const listViews = (s) => (s.search || 0) + (s.home || 0) + (s.category || 0) + (s.ad || 0);
  const ctrOf = (imp, s) => (imp ? Math.min(100, (listViews(s) / imp) * 100) : null);
  const pct1 = (x) => (Math.round(x * 10) / 10).toLocaleString('ru-RU');
  // Доли в процентах, которые в сумме дают ровно 100 (метод наибольшего остатка).
  function shares(vals) {
    const total = vals.reduce((a, b) => a + b, 0);
    if (!total) return vals.map(() => 0);
    const raw = vals.map((v) => (v * 100) / total);
    const out = raw.map(Math.floor);
    let rest = 100 - out.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0 && vals[i]) { out[i] += 1; rest -= 1; } });
    return out;
  }
  const srcRows = (sources, keep) => {
    const rows = STAT_SRC.filter(([k]) => sources[k] || keep(k));
    const p = shares(rows.map(([k]) => sources[k] || 0));
    return rows.map(([, icn, label], i) => html`<div class="st-src"><span class="st-src-ic">${ic(icn, 17)}</span><div><div class="st-step-h"><span>${label}</span><b>${p[i]}%</b></div><div class="st-track dark"><i style="width:${p[i]}%"></i></div></div></div>`);
  };
  async function renderStats(id, days) {
    const d = await api('GET', `/api/my/listings/${id}/stats?days=${days}`);
    const { totals: t, prev: pv, listing: l } = d;
    const ctr = ctrOf(t.impressions, d.sources);
    const fromList = listViews(d.sources);
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
    const bar = (w) => Math.min(100, Math.max(w > 0 ? 3 : 0, Math.round(w)));
    $('#box').innerHTML = String(html`<div class="st">
      <div class="st-item">
        <a class="st-img" href="/l/${l.id}" tabindex="-1" aria-hidden="true">${l.photo ? html`<img src="${l.photo}" alt="" loading="lazy">` : svg(P.image, 24, 1.4)}</a>
        <div class="st-item-txt"><span class="ml-tag ${(MY_TAG[l.status] || MY_TAG.archived)[0]}"><i></i>${(MY_TAG[l.status] || MY_TAG.archived)[1]}</span>
          <a class="st-title" href="/l/${l.id}">${l.title}</a><span class="st-price">${price(l.price, l.priceUnit)}</span></div>
        <div class="st-item-act"><a class="btn btn-soft btn-sm" href="/edit/${l.id}">Изменить</a><a class="btn btn-dark btn-sm" href="/l/${l.id}">Открыть</a></div>
      </div>
      <div class="st-kpis">
        ${kpi(NF.format(t.impressions), 'Показы', 'в поиске, ленте и категориях', delta(t.impressions, pv && pv.impressions))}
        ${kpi(NF.format(t.views), 'Переходы', `сегодня ${NF.format(d.today.views)}`, delta(t.views, pv && pv.views), true)}
        ${kpi(ctr === null ? '—' : `${pct1(ctr)}%`, 'Из показа в переход', ctr === null ? 'появится после первых показов' : 'доля открывших карточку', '')}
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
          ${[['Показы в поиске, ленте и категориях', t.impressions, t.impressions ? 100 : 0, ''], ['Открыли карточку из выдачи', fromList, ctr || 0, ctr === null ? '' : `${pct1(ctr)}% от показов`], ['Добавили в избранное', t.favs, t.impressions ? (t.favs / t.impressions) * 100 : 0, t.views ? `${pct1(Math.min(100, (t.favs / t.views) * 100))}% от переходов` : '']]
    .map(([k, v, w, sub]) => html`<div class="st-step"><div class="st-step-h"><span>${k}</span><span><b>${NF.format(v)}</b>${sub ? html` <small>· ${sub}</small>` : ''}</span></div><div class="st-track"><i style="width:${bar(w)}%"></i></div></div>`)}
        </section>
        <section class="st-card"><h2>Откуда переходили</h2>
          ${srcTotal ? srcRows(d.sources, (k) => !['other', 'ad'].includes(k)) : html`<p class="muted" style="margin:0">Появится после первых переходов.</p>`}
        </section>
      </div>
      ${d.tip ? html`<div class="st-tip"><span>${ic('sparkle', 20)}</span><div><strong>Подсказка.</strong> ${d.tip}</div></div>` : ''}
      <p class="st-note">Показ — карточку увидели в поиске, ленте или категории не меньше секунды. Переход — объявление открыли откуда угодно, в том числе по прямой ссылке; в долю «из показа в переход» идут только переходы из выдачи. Каждый считается один раз в сутки на человека; ваши собственные просмотры, модераторы и роботы не учитываются. Статистику видите только вы. Всего просмотров с публикации — ${NF.format(l.viewsAll)}.</p>
    </div>`);
  }

  // Уведомления таблицей: событие, пояснение, поле push и поле письма (null — такого канала у события нет).
  const NOTIFY_ROWS = [
    ['Сообщения', 'Чаты и ответы поддержки. Письмо — если не прочитали за 5 минут', 'pushMessages', 'notifyMessages'],
    ['Подписки', 'Новые объявления продавцов, на которых вы подписаны', 'pushSearches', null],
    ['Снижение цены', 'Подешевело то, что у вас в избранном', 'pushPrices', null],
    ['Подборка за день', 'Новое у продавцов и снижение цен — одним письмом', null, 'notifyDigest'],
    ['Объявления и сделки', 'Решения модерации, срок публикации, сделки и репутация, проверка бизнеса, оплаты', 'pushModeration', 'notifyModeration']
  ];
  const notifyCell = (u, k, title, kind) => (k
    ? html`<label class="mini-switch"><input type="checkbox" name="${k}" aria-label="${kind} — ${title}" ${u[k] ? raw('checked') : ''}><span class="track"></span></label>`
    : html`<span class="ntf-none" title="Для этого события нет">—</span>`);

  // Этот телефон или компьютер: включить, проверить, выключить push.
  async function renderPushDevice(el) {
    const st = await pushState();
    const card = (icon, title, sub, buttons = '') => html`<div class="push-dev ${st.sub ? 'on' : ''}"><span class="push-dev-ic">${ic(icon, 22, 2)}</span><span class="push-dev-txt"><b>${title}</b><span>${sub}</span></span>${buttons}</div>`;
    el.innerHTML = String(!st.ok
      ? card('bell', 'На этом устройстве push недоступны', st.ios ? 'В браузере на iPhone уведомления не работают — они приходят в приложении Торгана. Письма на почту продолжат приходить.' : 'Браузер не поддерживает уведомления. Письма на почту продолжат приходить.')
      : st.sub ? card('check', 'Включены на этом устройстве', deviceName(), html`<button type="button" class="btn btn-soft btn-sm" data-test>Проверить</button><button type="button" class="btn btn-line btn-sm" data-off>Выключить</button>`)
        : st.perm === 'denied' && st.native ? card('bell', 'Уведомления запрещены', 'Разрешите их в Настройках iPhone → Торгана → Уведомления.', html`<button type="button" class="btn btn-accent" data-ios-set>Открыть настройки</button>`)
        : st.perm === 'denied' ? card('bell', 'Уведомления запрещены в браузере', 'Вы отклонили запрос. Разрешите уведомления в настройках сайта (значок замка рядом с адресом), обновите страницу и нажмите «Включить уведомления».', html`<button type="button" class="btn btn-accent" data-reload>Я разрешил — обновить</button>`)
          : card('bell', 'Уведомления выключены', 'Сообщим о новых сообщениях, решениях модерации, снижении цен и новом у продавцов из подписок.', html`<button type="button" class="btn btn-accent" data-on>${ic('bell', 18, 2)}Включить уведомления</button>`));
    const act = async (fn, okText) => { try { await fn(); if (okText) toast(okText); renderPushDevice(el); } catch (e) { toast(e.message, true); } };
    const on = $('[data-on]', el); if (on) on.onclick = () => act(pushOn, 'Уведомления включены');
    const rl = $('[data-reload]', el); if (rl) rl.onclick = () => location.reload();
    const iset = $('[data-ios-set]', el); if (iset) iset.onclick = () => nativePost({ type: 'open.settings' });
    const off = $('[data-off]', el); if (off) off.onclick = () => act(pushOff, 'Уведомления на этом устройстве выключены');
    const tst = $('[data-test]', el); if (tst) tst.onclick = () => act(async () => { const r = await api('POST', '/api/push/test'); if (!r.ok) throw new Error(r.error || 'Не получилось отправить — выключите и снова включите уведомления'); }, 'Отправили проверочное уведомление');
  }

  // Для бизнеса (1.45.0): переключатель бизнес-аккаунта (для всех, открывает тарифы) и получение галочки —
  // объёмного значка «Проверенный бренд». Галочка — только правообладателю товарного знака из реестра Роспатента:
  // шаг 1 — компания или ИП (ИНН, ОГРН/ОГРНИП, сверка с ЕГРЮЛ/ЕГРИП, даёт плашку «ИП/Компания проверена»),
  // шаг 2 — номер свидетельства на товарный знак (модератор сверяет запись в реестре ФИПС), шаг 3 — галочка у имени.
  const TM_REGISTRY = 'https://fips.ru/registers-web/';
  const dateIn = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');
  function bizBlock(b, on, hasPlan, tm) {
    const acc = html`<label class="switch biz-switch"><span>Бизнес-аккаунт<small>${!PAY ? (on ? 'Включён' : 'Бесплатно') : on ? 'Включён — тарифы для магазина доступны' : 'Бесплатно. Открывает тарифы: витрину и статистику магазина'}</small></span><input type="checkbox" data-biz-acc ${on ? raw('checked') : ''} ${on && hasPlan ? raw('disabled') : ''}><span class="track"></span></label>
      ${on && PAY ? html`<div class="set-btns"><a class="btn btn-soft btn-sm" href="/business">${ic('store', 16, 2)}Тарифы</a><a class="btn btn-soft btn-sm" href="/profile/business">Мой магазин</a></div>` : ''}`;
    const bizDone = b && b.status === 'verified';
    const bizSent = b && ['pending', 'verified'].includes(b.status);
    const tmDone = tm && tm.live;
    // Каждый шаг — со своим статусом: «готово», «на проверке» или «сейчас».
    const tmWait = bizSent && tm && tm.status === 'pending';
    const s1 = bizDone ? 'done' : bizSent ? 'on' : 'on';
    const s2 = tmDone ? 'done' : bizSent ? 'on' : '';
    const step = (cls, n, icon, t, sub) => html`<li class="${cls}"><span class="bs-n">${n}</span><span class="bs-ic">${cls === 'done' ? ic('check', 20) : n === 3 ? verifiedSeal(22) : ic(icon, 20)}</span><b>${t}</b><small>${sub}</small></li>`;
    const head = html`<h3 class="set-h3 seal-h">${verifiedSeal(22)}Галочка проверенного бренда</h3>
      <p class="muted" style="margin:0;font-size:14px">Только для правообладателей товарного знака, зарегистрированного в Роспатенте. Покупатели видят галочку рядом с вашим именем.</p>
      <ol class="biz-steps">${step(s1, 1, 'shield', 'Компания или ИП', bizDone ? 'Подтверждено' : bizSent ? 'На проверке' : 'ИНН и ОГРН — сверим с ЕГРЮЛ/ЕГРИП')}${step(s2, 2, 'edit', 'Товарный знак и документы', tmDone ? 'Подтверждено' : tmWait ? 'На проверке' : 'Свидетельство Роспатента и письмо с кодом')}${step(tmDone ? 'done' : '', 3, 'check', 'Галочка у имени', tmDone ? 'Выдана модератором' : 'Выдаёт только модератор')}</ol>`;
    // Шаг 1 — данные компании (как раньше, отдельная плашка «ИП проверен / Компания проверена»).
    const bizStatus = bizDone ? html`<div class="biz-ok">${ic('shield', 22, 2)}<span><b>${b.name} — ${b.kind === 'ip' ? 'ИП проверен' : 'компания проверена'}</b><span>ИНН ${b.inn} · ${b.kind === 'ip' ? 'ОГРНИП' : 'ОГРН'} ${b.ogrn}</span></span><button type="button" class="btn btn-line btn-sm" data-biz-del>Убрать</button></div>`
      : b && b.status === 'pending' ? html`<div class="banner warn"><strong>${b.name}</strong> — данные на проверке с ${when(b.at)}, обычно в течение дня. <button type="button" class="link-btn" data-biz-del>Отозвать</button></div>` : '';
    const bizForm = html`${b && b.status === 'rejected' ? html`<div class="banner danger"><strong>Проверка не пройдена:</strong> ${b.note}</div>` : ''}
      <form id="bf" class="biz-form" novalidate>
        <div class="field"><label for="b-name">Название</label><input id="b-name" name="name" class="input" maxlength="120" value="${(b && b.name) || ''}" placeholder="ИП Иванов И. И. или ООО «Ромашка»"></div>
        <div class="row">
          <div class="field" style="flex:1"><label for="b-inn">ИНН</label><input id="b-inn" name="inn" class="input" inputmode="numeric" maxlength="12" value="${(b && b.inn) || ''}" placeholder="10 или 12 цифр"></div>
          <div class="field" style="flex:1"><label for="b-ogrn">ОГРН или ОГРНИП</label><input id="b-ogrn" name="ogrn" class="input" inputmode="numeric" maxlength="15" value="${(b && b.ogrn) || ''}" placeholder="13 или 15 цифр"></div>
        </div>
        <p class="muted" style="margin:0;font-size:13px">Название и ИНН — те же, что у правообладателя товарного знака. ИНН видит только модератор.</p>
        <div class="set-btns"><button class="btn btn-dark" type="submit">Отправить на проверку</button>${b ? html`<button type="button" class="btn btn-soft" data-biz-del>Отозвать</button>` : ''}</div>
      </form>`;
    // Шаг 2 — товарный знак с документами: грузится отдельно (renderTmBox), нужен код заявки и список файлов.
    return html`${acc}${head}
      ${bizSent ? bizStatus : bizForm}
      ${bizSent ? html`<div id="tm-box" class="tm-box"><div class="loader"></div></div>` : ''}`;
  }
  const TM_STATUS = { pending: ['wait', 'На проверке'], rejected: ['bad', 'Нужно исправить'], verified: ['ok', 'Подтверждено'] };
  const fileData = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Не удалось прочитать файл')); r.readAsDataURL(f); });
  const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);
  async function renderTmBox(reload) {
    const box = $('#tm-box');
    if (!box) return;
    const d = await api('GET', '/api/me/trademark');
    const tm = d.trademark; const b = S.user.business;
    const st = tm && (tm.status === 'verified' && !tm.live ? ['bad', 'Срок истёк'] : TM_STATUS[tm.status]);
    const lock = tm && tm.status === 'pending';
    const has = (k) => d.docs.some((x) => x.kind === k);
    const letter = `Подтверждаю, что аккаунт ${S.user.email} на сайте torgana.ru принадлежит ${b.name} (ИНН ${b.inn}, ${b.kind === 'ip' ? 'ОГРНИП' : 'ОГРН'} ${b.ogrn}) — правообладателю товарного знака № ${(tm && tm.number) || '______'} «${(tm && tm.name) || '______'}», и прошу подтвердить бренд.\nКод заявки: ${d.code}\nДата, должность, ФИО, подпись${b.kind === 'ip' ? '' : ', печать (если есть)'}.`;
    const docRow = (x) => html`<div class="tm-doc"><span class="tm-doc-ic">${ic(x.mime === 'application/pdf' ? 'list' : 'image', 18, 2)}</span><span><b>${x.kindName}</b><small>${x.name || 'файл'} · ${fmtSize(x.size)}</small></span>
      <a class="btn btn-soft btn-sm" href="/api/me/verify-docs/${x.id}" target="_blank" rel="noopener">Открыть</a>${lock ? '' : html`<button type="button" class="btn btn-line btn-sm" data-doc-del="${x.id}">Удалить</button>`}</div>`;
    box.innerHTML = String(html`
      <div class="tm-head"><b>Товарный знак</b>${st ? html`<span class="ml-tag ${st[0]}"><i></i>${st[1]}</span>` : ''}</div>
      ${tm && tm.live ? html`<div class="biz-ok tm-ok">${verifiedSeal(30)}<span><b>«${tm.name}» — бренд подтверждён</b><span>Свидетельство № ${tm.number} · действует до ${dateLong(tm.until)}. Галочка видна рядом с вашим именем.</span></span><button type="button" class="btn btn-line btn-sm" data-tm-del>Убрать</button></div>` : ''}
      ${lock ? html`<div class="banner warn"><strong>«${tm.name}», № ${tm.number} — на проверке</strong> с ${when(tm.at)}. Модератор сверит реестр Роспатента и документы. Пока заявка на проверке, её нельзя менять. <button type="button" class="link-btn" data-tm-del>Отозвать</button></div>` : ''}
      ${tm && tm.status === 'rejected' ? html`<div class="banner danger"><strong>Нужно исправить:</strong> ${tm.note}</div>` : ''}
      ${tm && tm.status === 'verified' && !tm.live ? html`<div class="banner danger">Срок регистрации «${tm.name}» истёк — галочка снята. Продлите регистрацию в Роспатенте и отправьте заявку снова.</div>` : ''}
      ${tm && tm.live ? '' : html`
      <form id="tmf" class="biz-form" novalidate>
        <div class="row stack-m">
          <div class="field" style="flex:1"><label for="tm-num">Номер свидетельства</label><input id="tm-num" name="number" class="input" inputmode="numeric" maxlength="9" value="${(tm && tm.number) || ''}" placeholder="Например, 912345" ${lock ? raw('disabled') : ''}></div>
          <div class="field" style="flex:1.4"><label for="tm-name">Обозначение</label><input id="tm-name" name="name" class="input" maxlength="100" value="${(tm && tm.name) || ''}" placeholder="Название бренда, как в свидетельстве" ${lock ? raw('disabled') : ''}></div>
        </div>
        <div class="field"><label for="tm-until">Срок действия — до</label><input id="tm-until" name="until" type="date" class="input" value="${dateIn(tm && tm.until)}" ${lock ? raw('disabled') : ''}><span class="help">Есть в свидетельстве и в <a href="${TM_REGISTRY}" target="_blank" rel="noopener" style="text-decoration:underline">открытом реестре Роспатента</a> (ФИПС, «Товарные знаки»).</span></div>
        <div class="tm-docs">
          <b class="tm-sub">Документы <span class="muted">— видят только вы и модератор</span></b>
          <ol class="tm-need">
            <li class="${has('cert') ? 'done' : ''}">${ic(has('cert') ? 'check' : 'image', 16, 2.2)}<span><b>Свидетельство на товарный знак</b> или выписка из реестра Роспатента</span></li>
            <li class="${has('letter') ? 'done' : ''}">${ic(has('letter') ? 'check' : 'edit', 16, 2.2)}<span><b>Письмо-подтверждение с кодом ${d.code}</b> — текст ниже, подпись ${b.kind === 'ip' ? 'ИП' : 'руководителя'}${b.kind === 'ip' ? '' : ' и печать, если есть'}</span></li>
            ${b.kind === 'ip' ? '' : html`<li class="${has('power') ? 'done' : ''}">${ic(has('power') ? 'check' : 'list', 16, 2.2)}<span><b>Доверенность</b> — только если письмо подписал не руководитель</span></li>`}
          </ol>
          <details class="tm-letter"><summary>Текст письма-подтверждения</summary><pre>${letter}</pre><button type="button" class="btn btn-soft btn-sm" data-copy-letter>Скопировать текст</button></details>
          ${d.docs.length ? html`<div class="tm-doc-list">${d.docs.map(docRow)}</div>` : ''}
          ${lock ? '' : html`<div class="row stack-m tm-up">
            <div class="field" style="flex:1"><label for="doc-kind">Что загружаете</label><select id="doc-kind" class="select">${Object.entries(d.kinds).filter(([k]) => k !== 'power' || b.kind !== 'ip').map(([k, t]) => html`<option value="${k}" ${!has('cert') ? (k === 'cert' ? raw('selected') : '') : !has('letter') && k === 'letter' ? raw('selected') : ''}>${t}</option>`)}</select></div>
            <label class="btn btn-soft tm-file">${ic('plus', 16, 2)}Загрузить файл<input type="file" id="doc-file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden></label></div>
            <p class="muted" style="margin:0;font-size:13px">PDF, JPG, PNG или WebP до 8 МБ. Скан или чёткое фото, весь документ целиком.</p>`}
        </div>
        <p class="muted" style="margin:0;font-size:13px">Правообладателем в реестре должна быть ${b.name}${/\.$/.test(b.name) ? '' : '.'} Лицензиатов и знаки, которые ещё не зарегистрированы, не подтверждаем. Галочку выдаёт только модератор после проверки.</p>
        ${lock ? '' : html`<div class="set-btns"><button class="btn btn-dark" type="submit">Отправить на проверку</button></div>`}
      </form>`}`);
    const tf = $('#tmf', box);
    if (tf) {
      tf.onsubmit = async (e) => {
        e.preventDefault();
        try { await api('POST', '/api/me/trademark', Object.fromEntries(new FormData(tf).entries())); toast('Заявка отправлена — статус «На проверке»'); await refreshMe(); reload(); } catch (ex) { toast(ex.message, true); }
      };
    }
    const fi = $('#doc-file', box);
    if (fi) {
      fi.onchange = async () => {
        const f = fi.files[0]; if (!f) return;
        if (f.size > 8 * 1024 * 1024) { toast('Файл больше 8 МБ', true); return; }
        try { await api('POST', '/api/me/verify-docs', { kind: $('#doc-kind', box).value, name: f.name, data: await fileData(f) }); toast('Документ загружен'); renderTmBox(reload); } catch (ex) { toast(ex.message, true); }
      };
    }
    $$('[data-doc-del]', box).forEach((x) => { x.onclick = async () => { try { await api('DELETE', `/api/me/verify-docs/${x.dataset.docDel}`); renderTmBox(reload); } catch (ex) { toast(ex.message, true); } }; });
    const cl = $('[data-copy-letter]', box);
    if (cl) cl.onclick = async () => { try { await navigator.clipboard.writeText(letter); toast('Текст скопирован'); } catch { toast('Не удалось скопировать — выделите текст вручную', true); } };
    $$('[data-tm-del]', box).forEach((x) => {
      x.onclick = async () => {
        if (!(await confirmModal(tm && tm.live ? 'Убрать галочку?' : 'Отозвать заявку?', 'Данные знака и загруженные документы удалятся. Отправить заявку можно будет заново.', tm && tm.live ? 'Убрать' : 'Отозвать', true))) return;
        try { await api('DELETE', '/api/me/trademark'); toast('Готово'); await refreshMe(); reload(); } catch (ex) { toast(ex.message, true); }
      };
    });
  }
  function bindBizForm(reload) {
    const acc = $('[data-biz-acc]');
    if (acc) {
      acc.onchange = async () => {
        try {
          if (acc.checked) await bizAccountOn();
          else { await api('PUT', '/api/me/business-account', { on: false }); await refreshMe(); toast('Бизнес-аккаунт выключен'); }
          reload();
        } catch (ex) { acc.checked = !acc.checked; toast(ex.message, true); }
      };
    }
    const f = $('#bf');
    if (f) {
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { await api('POST', '/api/me/business', Object.fromEntries(new FormData(f).entries())); toast('Заявка отправлена модератору'); await refreshMe(); reload(); } catch (ex) { toast(ex.message, true); }
      };
    }
    renderTmBox(reload).catch((ex) => { const x = $('#tm-box'); if (x) x.innerHTML = String(html`<div class="banner danger">${ex.message}</div>`); });
    $$('[data-biz-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmModal('Убрать данные бизнеса?', 'Плашка проверенного бизнеса и галочка бренда пропадут. Бизнес-аккаунт и тариф останутся. Отправить заявку можно будет заново.', 'Убрать', true))) return;
        try { await api('DELETE', '/api/me/business'); toast('Данные убраны'); await refreshMe(); reload(); } catch (ex) { toast(ex.message, true); }
      };
    });
  }

  // ================= удаление профиля (1.39) =================
  // «Напишите УДАЛИТЬ» — общее окно для пользователя и модератора.
  function eraseModal(title, text, onOk) {
    openModal(String(html`<h2>${title}</h2><p class="muted" style="margin:0">${text}</p>
      <div class="field" style="margin-top:14px"><label for="er-word">Напишите <b>УДАЛИТЬ</b>, чтобы подтвердить</label><input id="er-word" class="input" autocomplete="off" autocapitalize="characters"></div>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-danger" data-ok disabled>Удалить навсегда</button></div>`), (m, close) => {
      const inp = $('#er-word', m); const ok = $('[data-ok]', m);
      inp.oninput = () => { ok.disabled = inp.value.trim().toUpperCase() !== 'УДАЛИТЬ'; };
      $('[data-x]', m).onclick = close;
      ok.onclick = async () => { ok.disabled = true; try { await onOk(inp.value.trim()); close(); } catch (e) { ok.disabled = false; toast(e.message, true); } };
      setTimeout(() => inp.focus(), 50);
    });
  }
  function bindAccountDelete() {
    const off = $('[data-acc-off]');
    if (off) {
      off.onclick = async () => {
        if (!(await confirmModal('Удалить профиль временно?', 'Профиль и объявления скроются, вы выйдете на всех устройствах. Вернуться можно в любой момент: войдите и нажмите «Восстановить».', 'Удалить временно', true))) return;
        try { await api('POST', '/api/me/deactivate'); S.user = null; go('/', true); toast('Профиль удалён временно. Чтобы вернуться — просто войдите'); } catch (e) { toast(e.message, true); }
      };
    }
    const er = $('[data-acc-erase]');
    if (er) er.onclick = () => eraseModal('Удалить профиль навсегда?', 'Объявления, фото, избранное, подписки и данные профиля удалятся. Восстановить их будет нельзя.', async (word) => {
      await api('POST', '/api/me/erase', { confirm: word }); S.user = null; go('/', true); toast('Профиль удалён');
    });
  }
  // После входа во временно удалённый профиль: вернуть или удалить навсегда.
  function viewDeactivated() {
    setTitle('Профиль удалён');
    app.innerHTML = String(html`<div class="wrap"><div class="acc-gone">
      <span class="acc-gone-ic">${ic('user', 30, 1.9)}</span>
      <h1>Профиль временно удалён</h1>
      <p>${dateLong(S.user.deactivatedAt)} вы удалили профиль. Его и ваши объявления никто не видит. Восстановите профиль — объявления будут ждать в архиве, их можно опубликовать снова.</p>
      <div class="acc-gone-act"><button class="btn btn-accent btn-lg" data-restore>Восстановить профиль</button><button class="btn btn-soft btn-lg" data-logout>Выйти</button></div>
      <button type="button" class="acc-gone-erase" data-acc-erase>Удалить навсегда</button>
    </div></div>`);
    $('[data-restore]').onclick = async (e) => {
      e.currentTarget.disabled = true;
      try { await api('POST', '/api/me/restore'); await refreshMe(); toast('С возвращением! Объявления — в архиве «Моих объявлений»'); go('/profile?status=archived', true); } catch (ex) { e.currentTarget.disabled = false; toast(ex.message, true); }
    };
    bindAccountDelete();
  }

  // ================= настройки =================
  // Слева карточка и пять разделов, справа открыт один. Раздел — в #якоре, старые ссылки (#s-photo, #s-city) ведут в «Профиль».
  // На телефоне без якоря — карточка и список разделов; раздел открывается своим экраном со ссылкой «Настройки».
  const SET_SECTIONS = [['sf', 'user', 'Профиль'], ['sn', 'bell', 'Уведомления'], ['sp', 'lock', 'Пароль и вход'], ['s-look', 'moon', 'Оформление'], ['s-block', 'ban', 'Чёрный список'], ['s-biz', 'shield', 'Для бизнеса'], ['s-acc', 'mail', 'Аккаунт']];
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
      's-look': { auto: 'Как на устройстве', light: 'Светлое', dark: 'Тёмное' }[themeGet()],
      's-block': 'Кому нельзя вам писать',
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
            <div class="field"><label for="s-city">Город</label><div class="ed-icon-input">${ic('pin', 18)}<input id="s-city" name="city" class="input" data-cities autocomplete="off" value="${u.city || ''}" placeholder="Подставим в новые объявления"></div></div>
            <div class="field wide"><label for="s-phone">Телефон</label><input id="s-phone" name="phone" class="input" type="tel" inputmode="tel" maxlength="30" value="${u.phone || ''}" placeholder="+7" autocomplete="tel">${phoneNote}</div>
          </div>
          <div class="set-foot"><span>Имя и фото сразу обновятся во всех ваших объявлениях</span><button type="reset" class="btn btn-soft">Отменить</button><button class="btn btn-accent" type="submit">Сохранить</button></div>
        </form>
        ${u.badges && u.badges.first ? html`<div class="set-medal">${firstMedal(46, u.badges.first.no)}<div class="set-medal-t"><b>Медаль № ${u.badges.first.no}</b>
          <span>Вы в первой тысяче продавцов Торганы — медаль видна в профиле и в ваших объявлениях. Как её подписать:</span>
          <div class="seg" role="radiogroup" aria-label="Подпись медали">${['m', 'f'].map((v) => html`<button type="button" role="radio" class="${u.badges.first.form === v ? 'on' : ''}" aria-checked="${u.badges.first.form === v ? 'true' : 'false'}" data-medal-form="${v}">${firstName(v)}</button>`)}</div></div></div>` : ''}`,
      sn: () => html`${head('Уведомления', 'О чём сообщать и куда. Переключатели сохраняются сразу')}
        <div id="push-dev"></div>
        <table class="ntf" id="sn">
          <thead><tr><th scope="col">Событие</th><th scope="col">${ic('bell', 16, 2)}Push</th>${S.config.mail ? html`<th scope="col">${ic('mail', 16, 2)}Письмо</th>` : ''}</tr></thead>
          <tbody>${NOTIFY_ROWS.filter(([, , p]) => p || S.config.mail).map(([t, sub, p, m]) => html`<tr><th scope="row"><b>${t}</b><small>${sub}</small></th><td>${notifyCell(u, p, t, 'Push')}</td>${S.config.mail ? html`<td>${notifyCell(u, m, t, 'Письмо')}</td>` : ''}</tr>`)}</tbody>
        </table>
        ${S.config.mail ? html`<p class="set-small">Письма приходят на ${u.email}</p>` : ''}`,
      sp: () => html`${head('Пароль и вход', oauth.length ? `Входите по паролю или в одно касание через ${names}` : 'Пароль для входа на Торгану')}
        ${NATIVE || u.oauth.includes('apple') ? html`<div class="set-block"><h3>Apple ID</h3><div class="set-list"><div class="set-row oauth-apple"><span class="oauth-mark" aria-hidden="true"><span class="apple-glyph">\uF8FF</span></span><div><span class="set-v">Войти с Apple</span><span class="set-k">${u.oauth.includes('apple') ? 'Привязан' : 'Не привязан'}</span></div>
          ${u.oauth.includes('apple') ? html`<button type="button" class="btn btn-line btn-sm" data-unlink="apple">Отвязать</button>` : NATIVE ? html`<button type="button" class="btn btn-soft btn-sm" data-link-apple>Привязать</button>` : ''}</div></div></div>` : ''}
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
      's-biz': () => html`${head('Для бизнеса', 'Бизнес-аккаунт открывает тарифы. Галочка у имени — правообладателям товарного знака')}${bizBlock(u.business, u.bizAccount, !!u.plan, u.trademark)}`,
      's-look': () => html`${head('Оформление', 'Светлое, тёмное или как на устройстве. Сохраняется на этом устройстве')}
        <div class="look" role="radiogroup" aria-label="Оформление">${THEMES.map(([v, icon, t, sub]) => html`<button type="button" role="radio" class="look-it${themeGet() === v ? ' on' : ''}" aria-checked="${themeGet() === v ? 'true' : 'false'}" data-theme-set="${v}">
          <span class="look-pv lp-${v}" aria-hidden="true"><i></i><i></i><i></i></span><span class="look-t">${ic(icon, 18, 2)}<b>${t}</b></span><small>${sub}</small></button>`)}</div>`,
      's-block': () => html`${head('Чёрный список', 'Заблокированные не могут писать вам и предлагать цену, их объявлений нет в вашей ленте и поиске')}<div id="blocks" class="set-list"><div class="loader"></div></div>`,
      's-acc': () => html`${head('Аккаунт', 'Почта для входа и писем от Торганы')}
        <div class="set-list">
          ${row('mail', 'Почта', u.email, S.config.mail ? (u.emailVerified ? html`<span class="pf-badge ok">${ic('check', 14, 2.4)} Подтверждена</span>` : html`<button type="button" class="btn btn-soft btn-sm" id="verify-again">Подтвердить</button>`) : '')}
          ${row('clock', 'На Торгане', `с ${since(u.createdAt)}`)}
          ${row('logout', 'Выйти из аккаунта', 'На этом устройстве', html`<button type="button" class="btn btn-soft btn-sm" data-logout>Выйти</button>`)}
        </div>
        ${u.isOwner ? '' : html`<div class="acc-del">
          <h3>Удаление профиля</h3>
          <div class="acc-del-row"><span class="acc-del-ic">${ic('clock', 20, 2)}</span><span class="acc-del-txt"><b>Удалить временно</b><span>Профиль и объявления скроются. Чтобы вернуться, войдите и нажмите «Восстановить» — объявления будут ждать в архиве.</span></span><button type="button" class="btn btn-line btn-sm" data-acc-off>Удалить временно</button></div>
          <div class="acc-del-row danger"><span class="acc-del-ic">${ic('trash', 20, 2)}</span><span class="acc-del-txt"><b>Удалить навсегда</b><span>Объявления, фото, избранное, подписки и данные профиля удалятся без возможности восстановления.</span></span><button type="button" class="btn btn-danger btn-sm" data-acc-erase>Удалить навсегда</button></div>
        </div>`}`
    };
    $('#box').innerHTML = String(body[sec]());
    // Пришли по ссылке на поле (#s-city) или фото (#s-photo) — покажем его.
    const to = location.hash.length > 1 && location.hash.slice(1) !== sec && document.getElementById(location.hash.slice(1));
    if (to) { const field = to.matches('input'); to.scrollIntoView({ block: 'center' }); if (field) to.focus(); }
    const q = new URLSearchParams(location.search).get('oauth');
    if (q) { toast(q === 'linked' ? 'Готово — сервис привязан' : 'Этот аккаунт сервиса уже привязан к другому пользователю', q !== 'linked'); history.replaceState({}, '', location.pathname + location.hash); }
    if (sec === 's-acc') bindAccountDelete();
    if (sec === 's-look') $$('[data-theme-set]').forEach((b) => { b.onclick = () => { themeSet(b.dataset.themeSet); renderSettings(sec, reload); const h = $('[data-sec="s-look"] small'); if (h) h.textContent = { auto: 'Как на устройстве', light: 'Светлое', dark: 'Тёмное' }[themeGet()]; }; });
    if (sec === 's-block') {
      const paint = async () => {
        const box = $('#blocks'); if (!box) return;
        try {
          const { items } = await api('GET', '/api/blocks');
          box.innerHTML = items.length ? String(html`${items.map((x) => html`<div class="set-row bl-row">${ava(x, 'sm')}<div><span class="set-v">${x.name}</span><span class="set-k">Заблокирован ${dateShort(x.at)}</span></div><button type="button" class="btn btn-soft btn-sm" data-unb="${x.id}">Разблокировать</button></div>`)}`)
            : String(html`<div class="bl-empty">${ic('ban', 28, 1.8)}<b>Никого нет</b><span>Заблокировать можно в чате или в профиле человека — кнопка «…»</span></div>`);
          $$('[data-unb]', box).forEach((b) => { b.onclick = async () => { const x = items.find((i) => String(i.id) === b.dataset.unb); const r = await blockFlow(x, true); if (r === false) paint(); }; });
        } catch (e) { box.innerHTML = String(html`<p class="muted">${e.message}</p>`); }
      };
      paint();
    }
    if (sec === 'sf') {
      $('[data-ava-set]').onclick = () => pickAvatar(reload);
      $$('[data-medal-form]').forEach((b) => { b.onclick = async () => {
        if (b.classList.contains('on')) return;
        try { S.user = (await api('PATCH', '/api/me', { medalForm: b.dataset.medalForm })).user; toast(`Подпись медали: «${firstName(b.dataset.medalForm)}»`); reload(); } catch (e) { toast(e.message, true); }
      }; });
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
      $$('[data-link-apple]').forEach((b) => { b.onclick = () => appleGo({ link: true }); });
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

  // 1.54.0: «Написать магазину / продавцу» из профиля. Переписка на Торгане всегда о конкретном объявлении,
  // поэтому сначала выбираем, о каком (одно — сразу в чат). У кого много — с поиском по названию.
  async function writePicker(u, name, shop = false) {
    if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
    const start = async (lid) => { const { id: cid } = await api('POST', '/api/conversations', { listingId: lid }); go(`/messages/${cid}`); };
    let items;
    try { items = (await api('GET', `/api/listings?${new URLSearchParams({ user: u.id, limit: 60 })}`)).items || []; } catch (e) { toast(e.message, true); return; }
    if (!items.length) { toast('Сейчас у продавца нет объявлений', true); return; }
    if (items.length === 1) { try { await start(items[0].id); } catch (e) { toast(e.message, true); } return; }
    const row = (i) => html`<button type="button" class="wp-row" data-wp="${i.id}" data-t="${String(i.title).toLowerCase()}">
        <span class="wp-ph">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : ic('image', 22, 1.6)}</span>
        <span class="wp-tx"><b>${i.title}</b><span>${price(i.price, i.priceUnit)}</span></span>${ic('right', 18, 2)}</button>`;
    openModal(String(html`<h2>${shop ? 'Написать магазину' : 'Написать продавцу'}</h2>
      <p class="muted" style="margin:0 0 14px"><b style="color:var(--text)">${name}</b> · выберите объявление — переписка будет о нём, так проще ответить.</p>
      ${items.length > 6 ? html`<label class="search wp-search">${ic('search', 18)}<span class="sr">Найти объявление</span><input type="search" placeholder="Найти по названию" data-wp-q></label>` : ''}
      <div class="wp-list">${items.map(row)}</div><p class="wp-none muted hidden">Ничего не нашлось</p>`), (m, close) => {
      const q = $('[data-wp-q]', m);
      if (q) q.oninput = () => { const v = q.value.trim().toLowerCase(); let n = 0; $$('[data-wp]', m).forEach((b) => { const on = !v || b.dataset.t.includes(v); b.classList.toggle('hidden', !on); n += on; }); $('.wp-none', m).classList.toggle('hidden', !!n); };
      $$('[data-wp]', m).forEach((b) => { b.onclick = async () => { b.disabled = true; try { close(); await start(Number(b.dataset.wp)); } catch (e) { toast(e.message, true); b.disabled = false; } }; });
    });
  }

  async function viewUser(id, q) {
    const tab = q && ['rep', 'reviews'].includes(q.get('tab')) ? 'rep' : 'ads'; // reviews — старые ссылки
    const { user: u, sections, pinned } = await api('GET', `/api/users/${id}`);
    setTitle(u.name);
    const own = S.user && S.user.id === u.id;
    const followers = u.followers || 0;
    const deals = u.rep ? u.rep.total || 0 : 0;
    const sh = u.shop; // 1.46.1: у магазина — одна шапка: обложка, тариф, название, описание
    const canWrite = !own && u.activeCount > 0 && u.block !== 'me' && !(sh && sh.official); // 1.54.0: «Написать» — о любом его объявлении
    // 1.49.0: одна отметка проверки (галочка бренда — у имени); три числа всегда, даже 0: объявления, сделки, подписчики.
    const badges = String(html`${planBadge(sh)}${trustBadges(u.badges && { ...u.badges, shop: false, tm: null })}`).trim();
    const num = (n, one, few, many, attr = '') => html`<div class="pf-num"><b${raw(attr)}>${NF.format(n)}</b><span>${plural(n, one, few, many)}</span></div>`;
    // Сверху — широкая карточка продавца, ниже вкладки и объявления (у магазина — с колонкой «О магазине»).
    app.innerHTML = String(html`<div class="wrap pub">
      ${own ? html`<div class="pub-own">${ic('eye', 18)}<span>Так ваш профиль видят покупатели</span><a href="/profile/settings">Изменить профиль</a><a href="/profile">Мой профиль</a></div>` : ''}
      <section class="pub-hero ${sh ? `is-shop ${sh.plan}` : ''}" aria-label="${sh ? 'Магазин' : 'Продавец'}">
        ${sh ? html`<div class="psh-cover">${sh.cover ? html`<img src="${sh.cover}" alt="">` : ''}</div>` : ''}
        <div class="pub-ava">${ava(u, 'xl')}</div>
        <div class="pub-who">
          <h1>${nameSeal(sh ? sh.name : u.name, u.badges)}</h1>
          <div class="pub-sub">${u.city ? `${u.city} · ` : ''}на Торгане с ${since(u.createdAt)}</div>
          ${sh && sh.official ? '' : repLine(u.rep, `/u/${u.id}?tab=rep`, { shop: !!sh, deals: false, first: u.badges && u.badges.first, who: sh ? sh.name : u.name, kind: own ? 'me' : '' })}
          ${sh && sh.about ? html`<p class="shop-about">${sh.about}</p>` : ''}
          ${badges ? html`<div class="pf-badges">${raw(badges)}</div>` : ''}
        </div>
        <div class="pub-side">
          <div class="pf-nums">
            ${num(u.activeCount, 'объявление', 'объявления', 'объявлений')}
            ${num(deals, 'сделка', 'сделки', 'сделок')}
            ${num(followers, 'подписчик', 'подписчика', 'подписчиков', ' data-followers')}
          </div>
          <div class="pub-acts">${own ? html`<a class="btn btn-accent btn-block" href="/profile/settings">${ic('edit', 18)}Изменить профиль</a>`
    : canWrite ? html`<button type="button" class="btn btn-accent btn-block pub-write" data-pub-write>${ic('chat', 18, 2)}Написать ${sh ? 'магазину' : 'продавцу'}</button>${followBtn(u.id, u.following)}` : followBtn(u.id, u.following, 'btn-accent')}<button type="button" class="icon-btn pub-share" data-share aria-label="Поделиться профилем">${ic('share', 19)}</button>${own || !S.user ? '' : html`<button type="button" class="icon-btn pub-share" data-pub-more aria-label="Ещё" aria-haspopup="menu">${ic('more', 19)}</button>`}</div>
        </div>
      </section>
      <div id="pub-block"></div>
      <div class="seg seg-lg" role="tablist">
        <a role="tab" aria-selected="${tab === 'ads' ? 'true' : 'false'}" class="${tab === 'ads' ? 'on' : ''}" href="/u/${u.id}">Объявления <span class="n">${u.activeCount}</span></a>
        <a role="tab" aria-selected="${tab === 'rep' ? 'true' : 'false'}" class="${tab === 'rep' ? 'on' : ''}" href="/u/${u.id}?tab=rep">${levelMedal(u.rep ? u.rep.level : 0, 16)}Репутация</a>
      </div>
      <div id="box"><div class="loader"></div></div>
    </div>`);
    $('[data-share]').onclick = () => shareLink(`${location.origin}/u/${u.id}`, `${u.name} на Торгане`);
    const wb = $('[data-pub-write]');
    if (wb) wb.onclick = () => writePicker(u, sh ? sh.name : u.name, !!sh);
    // 1.48.0: чёрный список — «…» в шапке профиля.
    let block = u.block || null;
    const paintPubBlock = () => {
      $('#pub-block').innerHTML = block === 'me' ? String(html`<div class="chat-blocked pub-blocked"><span class="cb-ic">${ic('ban', 18, 2)}</span><div><b>Вы заблокировали ${u.name}</b><span>Он не может писать вам, его объявлений нет в вашей ленте и поиске.</span></div><button type="button" class="btn btn-soft btn-sm" data-unblock>Разблокировать</button></div>`) : '';
      const ub = $('[data-unblock]'); if (ub) ub.onclick = async () => { const r = await blockFlow(u, true); if (r !== undefined) { block = r ? 'me' : null; paintPubBlock(); } };
    };
    paintPubBlock();
    const pm = $('[data-pub-more]');
    if (pm) pm.onclick = () => pickList({ anchor: pm, title: u.name, search: false, items: [
      { value: block === 'me' ? 'unblock' : 'block', label: block === 'me' ? 'Разблокировать' : 'Заблокировать' },
      { value: 'support', label: 'Пожаловаться в поддержку' }
    ], onPick: async (v) => {
      if (v === 'support') { go('/messages/support'); return; }
      const r = await blockFlow(u, block === 'me'); if (r !== undefined) { block = r ? 'me' : null; paintPubBlock(); }
    } });
    if (tab === 'ads') return renderPubAds(u, sections, pinned);
    $('#box').innerHTML = String(html`<div class="rep-page">${repCard(u.rep)}${repHow()}</div>`);
  }

  // 1.49.0: объявления продавца — лентой с «Показать ещё». У магазина: закреплённые («Магазин Про»), поиск,
  // разделы с числом объявлений, сортировка и «О магазине» (на компьютере — колонкой справа, на телефоне — ниже).
  async function renderPubAds(u, sections, pinned) {
    const sh = u.shop;
    const st = { q: '', sec: '', sort: '' };
    $('#box').innerHTML = String(html`<div class="${sh ? 'shop-body' : ''}">
      <div class="shop-main">
        ${pinned.length ? html`<section class="shop-pins" aria-label="Главное в магазине"><h2>${ic('pushpin', 18, 2)}Главное в магазине</h2>${grid(pinned)}</section>` : ''}
        ${sh && u.activeCount ? html`<div class="shop-tools">
          <form class="shop-find" role="search" data-shop-find>
            ${ic('search', 18)}<label class="sr" for="shop-q">Поиск в магазине</label>
            <input id="shop-q" name="q" type="search" placeholder="Поиск в магазине" autocomplete="off" enterkeyhint="search" maxlength="100">
          </form>
          <label class="sr" for="shop-sort">Порядок</label>
          <select id="shop-sort" class="select" data-shop-sort><option value="">Сначала новые</option><option value="cheap">Сначала дешевле</option><option value="expensive">Сначала дороже</option></select>
          ${sections.length > 1 ? html`<div class="shop-secs" aria-label="Разделы магазина">
            <button type="button" class="chip active" data-sec="" aria-pressed="true">Все <span>${NF.format(u.activeCount)}</span></button>${sections.map((x) => html`<button type="button" class="chip" data-sec="${x.sub ? `sub:${x.sub}` : `category:${x.category}`}" aria-pressed="false">${x.name} <span>${NF.format(x.n)}</span></button>`)}
          </div>` : ''}
        </div>` : ''}
        <div id="pub-list"><div class="loader"></div></div><div class="more hidden"></div>
      </div>
      ${sh ? shopAbout(sh) : ''}
    </div>`);
    let feed = null;
    const load = () => {
      if (feed) feed.stop();
      const [k, v] = st.sec ? st.sec.split(':') : [];
      const params = { user: u.id, ...(st.q ? { q: st.q } : {}), ...(k ? { [k]: v } : {}), ...(st.sort ? { sort: st.sort } : {}) };
      feed = listingFeed($('#pub-list'), params, {
        map: (i) => ({ ...i, seller: null }), // все объявления этого продавца — строка продавца не нужна
        empty: String(html`<div class="pf-empty sm">${st.q || st.sec ? html`<h3>Ничего не нашлось</h3><p>Попробуйте другие слова или раздел.</p>` : html`<h3>Активных объявлений нет</h3><p>Загляните позже.</p>`}</div>`)
      });
      return feed.first;
    };
    cleanup = () => { if (feed) feed.stop(); };
    const find = $('[data-shop-find]');
    if (find) {
      let t = null;
      const inp = $('#shop-q');
      find.onsubmit = (e) => { e.preventDefault(); clearTimeout(t); st.q = inp.value.trim(); load().catch((ex) => toast(ex.message, true)); };
      inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { if (st.q !== inp.value.trim()) { st.q = inp.value.trim(); load().catch((ex) => toast(ex.message, true)); } }, 400); };
      $('[data-shop-sort]').onchange = (e) => { st.sort = e.target.value; load().catch((ex) => toast(ex.message, true)); };
      $$('[data-sec]').forEach((b) => {
        b.onclick = () => {
          st.sec = b.dataset.sec;
          $$('[data-sec]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          load().catch((ex) => toast(ex.message, true));
        };
      });
    }
    await load();
  }

  // ================= для бизнеса: тарифы, оплата, продвижение =================
  const PLAN_NAME = { shop: 'Магазин', pro: 'Магазин Про' };
  const rub = (n) => `${NF.format(n)} ₽`;
  const dateLong = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.$/, ''); // «9 ноября 2031» — без «г.», иначе «г..» в конце фразы
  const dateShort = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const daysLeft = (ts) => Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
  // Что даёт каждый тариф — ровно то, что работает в коде (lib/business.js, lib/deals.js, lib/support.js, lib/promo.js).
  // 1.45.0: коротко — по три-четыре строки на тариф.
  const planFeatures = (key, pr) => ({
    shop: ['Витрина: обложка, поиск и разделы, «О магазине»', 'Значок «Магазин» у объявлений', 'Статистика всех объявлений и выгрузка в Excel'],
    pro: ['Всё из «Магазина»', 'До 3 закреплённых товаров в начале витрины', pr.proDiscount ? `Скидка ${pr.proDiscount}% на рекламу над поиском` : 'Обращения в поддержку — первыми', ...(pr.proDiscount ? ['Обращения в поддержку — первыми'] : [])]
  })[key];
  // Цена, зачёркнутая «от руки» (1.45.0): неровная линия рисуется при появлении.
  const handStrike = (text) => html`<span class="hand-strike">${text}<svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true"><path pathLength="100" d="M3 15.5c13-2.6 27-5.4 43-6.4 17-1.1 33 .3 47-1.6 9.6-1.3 16-3.1 24-5.2"/><path pathLength="100" class="hs2" d="M8 19.5c18-3.3 39-6.1 61-6.3 15-.2 29 .4 46-3.9"/></svg></span>`;
  // Включить бизнес-аккаунт — с любой страницы, где он нужен (страница «Для бизнеса», «Мой бизнес», настройки).
  async function bizAccountOn() {
    await api('PUT', '/api/me/business-account', { on: true });
    await refreshMe();
    toast('Бизнес-аккаунт включён — выберите тариф');
  }

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
        try { goPay(await api('POST', url, body)); } catch (ex) { toast(ex.message, true); b.disabled = false; b.textContent = `Оплатить ${rub(amount)}`; }
      };
    });
  }

  // /business — тарифы, продвижение, вопросы. Цены — с сервера (их задаёт владелец).
  // 1.45.0: страница упрощена до трёх шагов: бизнес-аккаунт (для всех, бесплатно) → тариф (первым — 0 ₽) → витрина.
  const BIZ_FAQ = [
    ['Нужно ли платить, чтобы продавать?', 'Нет. Объявления бесплатны и без лимитов для всех. Тариф добавляет инструменты магазина.'],
    ['Кто может подключить тариф?', 'Любой, кто включил бизнес-аккаунт, — это бесплатно. Проверка ИНН не обязательна: она даёт значок проверенного бизнеса в профиле.'],
    ['Что будет после бесплатного периода?', 'Тариф просто закончится — объявления останутся. Продлить можно по обычной цене. Автоплатежей нет.'],
    ['Как оплатить и вернуть деньги?', 'Картой или через СБП на странице ЮKassa, чек придёт на почту. За неиспользованные дни вернём деньги через поддержку.']
  ];
  async function viewBusiness(_, q) {
    setTitle('Для бизнеса');
    const me = S.user ? await api('GET', '/api/my/business').catch(() => null) : null;
    const pr = (me && me.prices) || S.config.billing.prices;
    const ready = me ? me.ready : S.config.billing.ready;
    const plan = me && me.plan;
    const bizOn = !!(me && me.bizAccount);
    const st = S.config.billing.starter; // бесплатный старт: { days, limit, left } — пока есть места
    // 0 ₽ показываем гостю и тем, кому старт доступен (или станет доступен после включения бизнес-аккаунта).
    const free = !!st && (!me || me.trial || me.trialWhy === 'Сначала включите бизнес-аккаунт');
    let months = ['1', '3', '12'].includes(q.get('m')) ? Number(q.get('m')) : 1;
    const bp = pr.boost || {};
    const flow = (n, t, done) => html`<li class="${done ? 'done' : ''}"><span>${done ? ic('check', 14, 3) : n}</span>${t}</li>`;
    const heroCta = !S.user ? html`<a class="btn btn-accent btn-lg" href="/login?next=/business">Войти и начать</a>`
      : !bizOn ? html`<button type="button" class="btn btn-accent btn-lg" data-biz-on>Включить бизнес-аккаунт</button>`
        : plan ? html`<a class="btn btn-accent btn-lg" href="/profile/business">Мой магазин</a>` : html`<a class="btn btn-accent btn-lg" href="#plans">Выбрать тариф</a>`;
    app.innerHTML = String(html`<div class="wrap biz bz">
      <section class="bz-hero">
        <div class="bz-hero-txt">
          <span class="bz-kicker">${ic('store', 15, 2)}Торгана для бизнеса</span>
          <h1>Продавайте как магазин</h1>
          <p>Объявления — бесплатно для всех. Тариф добавляет витрину с поиском и разделами и статистику магазина.</p>
          <ol class="bz-flow">${flow(1, 'Бизнес-аккаунт', bizOn)}${flow(2, 'Тариф', !!plan)}${flow(3, 'Витрина', false)}</ol>
          <div class="bz-cta">${heroCta}</div>
        </div>
        <div class="bz-mini" aria-hidden="true">
          <div class="bzm-cover"></div>
          <div class="bzm-head"><span class="bzm-ava">${ic('store', 22, 2)}</span><span><b>Ваш магазин</b><span class="bzm-badges"><i class="g">${ic('store', 11, 2.4)}Магазин</i><i>${verifiedSeal(13)}Бренд</i></span></span></div>
          <div class="bzm-grid">${['#DCE3DF', '#E9E6E0', '#DDE4EC'].map((c) => html`<span class="bzm-card"><span style="background:${c}"></span><i></i><i class="s"></i></span>`)}</div>
          <span class="bzm-tag">Пример</span>
        </div>
      </section>
      ${!ready ? html`<div class="banner soft biz-banner">${ic('clock', 20, 2)}<span><strong>Оплата подключается.</strong> Цены действуют, но оплатить пока нельзя.</span></div>` : ''}
      ${plan ? html`<div class="banner ok biz-banner">${ic('check', 20, 2.2)}<span>${plan.trial ? 'Бесплатный тариф' : 'Тариф'} <strong>«${plan.name}»</strong> до ${dateLong(plan.until)}. <a href="/profile/business" style="text-decoration:underline">Мой магазин</a></span></div>` : ''}

      <section class="biz-sec" id="plans">
        <div class="biz-sec-head"><div><h2>Тарифы</h2>${free ? html`<span class="bz-free">${ic('gift', 15, 2)}Первым ${st.limit} — ${st.days} ${plural(st.days, 'день', 'дня', 'дней')} бесплатно · осталось ${st.left} ${plural(st.left, 'место', 'места', 'мест')}</span>` : ''}</div>
          <div class="seg" role="tablist" aria-label="Срок">${[[1, '1 месяц'], [3, '3 месяца'], [12, '12 месяцев']].map(([m, t]) => html`<button type="button" role="tab" data-m="${m}">${t}</button>`)}</div></div>
        <div class="plans two" id="plan-cards"></div>
        <p class="muted biz-small">Без тарифа всё бесплатно: объявления без лимитов, чат, торг и статистика каждого объявления. Автоплатежей нет.</p>
      </section>

      <section class="biz-sec">
        <div class="biz-sec-head"><h2>Продвижение</h2></div>
        <div class="bz-promo">
          <div class="bz-pcard"><span class="bz-ic violet">${ic('xl', 20, 1.9)}</span><span><b class="bz-ph">Продвижение в ленте</b><span class="bz-for">XL, рамка или метки на фото · 7 дней</span></span><b class="bz-from">от ${rub(Math.min(bp.xl, bp.frame, bp.tags))}</b></div>
          <div class="bz-pcard"><span class="bz-ic blue">${ic('megaphone', 20, 1.9)}</span><span><b class="bz-ph">Реклама над поиском</b><span class="bz-for">Блок «Реклама» над выдачей в вашем городе</span></span><b class="bz-from">от ${rub(pr.promo[3])}</b></div>
        </div>
        <p class="muted biz-small">Для всех продавцов. Подключается в «Моих объявлениях» → «Продвигать».</p>
      </section>

      <section class="biz-sec"><div class="biz-sec-head"><h2>Вопросы</h2></div>
        <div class="faq">${BIZ_FAQ.map(([t, a]) => html`<details><summary>${t}${ic('down', 18, 2)}</summary><p>${a}</p></details>`)}</div>
        <p class="muted biz-small">Условия — в <a href="/page/terms#paid" style="text-decoration:underline">разделе 7 Пользовательского соглашения</a>. Исполнитель — ${S.config.operator ? `${S.config.operator.name}, ИНН ${S.config.operator.inn}` : 'оператор Торганы'}.</p>
      </section>
    </div>`);
    const turnOn = async (b) => { b.disabled = true; try { await bizAccountOn(); viewBusiness(_, new URLSearchParams({ m: String(months) })); } catch (ex) { toast(ex.message, true); b.disabled = false; } };
    const paint = () => {
      $$('[data-m]').forEach((b) => { b.classList.toggle('on', Number(b.dataset.m) === months); b.setAttribute('aria-selected', Number(b.dataset.m) === months ? 'true' : 'false'); });
      const save = (key) => { const full = pr[key][1] * months; return full > pr[key][months] ? Math.round((1 - pr[key][months] / full) * 100) : 0; };
      const perMonth = (key) => Math.round(pr[key][months] / months);
      const cta = (key) => {
        const cls = key === 'pro' ? 'btn-accent' : 'btn-dark';
        if (!S.user) return html`<a class="btn ${cls} btn-block" href="/login?next=/business">${free ? 'Войти и начать бесплатно' : 'Войти и подключить'}</a>`;
        if (!bizOn) return html`<button type="button" class="btn ${cls} btn-block" data-biz-on>Включить бизнес-аккаунт</button>`;
        if (free && !plan) return html`<button type="button" class="btn ${cls} btn-block" data-trial="${key}">Начать бесплатно</button>`;
        if (!ready) return html`<button type="button" class="btn btn-soft btn-block" disabled>Оплата скоро</button>`;
        return html`<button type="button" class="btn ${cls} btn-block" data-buy="${key}">${plan && plan.id === key ? `Продлить на ${months} мес.` : plan ? `Перейти на «${PLAN_NAME[key]}»` : 'Подключить'}</button>`;
      };
      const price = (key) => (free ? html`
            <div class="plan-price is-free"><b>0 ₽</b>${handStrike(rub(perMonth(key)))}</div>
            <p class="plan-then">${st.days} ${plural(st.days, 'день', 'дня', 'дней')} бесплатно, далее <b>${rub(perMonth(key))}</b> в месяц</p>`
        : html`
            <div class="plan-price"><b>${rub(perMonth(key))}</b><span>в месяц</span></div>
            <p class="plan-then">${months > 1 ? html`${rub(pr[key][months])} за ${months} мес.${save(key) ? html` · <span class="plan-save">выгода ${save(key)}%</span>` : ''}` : key === 'shop' ? 'Витрина и статистика' : 'Для тех, у кого много товаров'}</p>`);
      $('#plan-cards').innerHTML = String(html`
        ${['shop', 'pro'].map((key) => html`<div class="plan ${key} ${plan && plan.id === key ? 'current' : ''}">
          <div class="plan-top"><h3>${PLAN_NAME[key]}${plan && plan.id === key ? html`<span class="plan-cur">ваш тариф</span>` : key === 'pro' ? html`<span class="plan-cur">больше всего</span>` : ''}</h3>${price(key)}</div>
          <ul>${planFeatures(key, pr).map((f) => html`<li>${ic('check', 16, 2.4)}${f}</li>`)}</ul>
          ${cta(key)}</div>`)}`);
      $$('[data-biz-on]').forEach((b) => { b.onclick = () => turnOn(b); });
      $$('[data-trial]').forEach((b) => {
        b.onclick = async () => {
          const key = b.dataset.trial;
          if (!(await confirmModal(`«${PLAN_NAME[key]}» бесплатно на ${st.days} ${plural(st.days, 'день', 'дня', 'дней')}?`, `Без оплаты и без карты. Дальше — ${rub(pr[key][1])} в месяц, только если продлите сами. Бесплатный период — один раз.`, 'Начать бесплатно'))) return;
          b.disabled = true;
          try { await api('POST', '/api/my/plan/trial', { plan: key }); await refreshMe(); toast(`«${PLAN_NAME[key]}» подключён — оформите витрину`); go('/profile/business/shop'); } catch (ex) { toast(ex.message, true); b.disabled = false; }
        };
      });
      $$('[data-buy]').forEach((b) => {
        b.onclick = () => {
          const key = b.dataset.buy;
          payModal({ title: `Тариф «${PLAN_NAME[key]}»`, amount: pr[key][months], url: '/api/my/plan/pay', body: { plan: key, months },
            lines: [['Срок', `${months} мес. (${months * 30} дней)`], ...(plan && plan.id !== key ? [[plan.trial ? `Бесплатный «${plan.name}»` : `Остаток «${plan.name}»`, plan.trial ? 'закончится, новый тариф — с сегодня' : 'пересчитаем по цене месяца']] : plan ? [['Начало', `с ${dateShort(plan.until)}${plan.trial ? ', после бесплатного' : ''}`]] : [])] });
        };
      });
    };
    $$('[data-m]').forEach((b) => { b.onclick = () => { months = Number(b.dataset.m); history.replaceState({}, '', `/business?m=${months}`); paint(); }; });
    const hb = $('.bz-cta [data-biz-on]'); if (hb) hb.onclick = () => turnOn(hb);
    paint();
  }

  // /pay/:id — человек вернулся со страницы ЮKassa. Пока платёж в обработке — проверяем каждые 2,5 секунды.
  const CANCEL_REASON = { expired_on_confirmation: 'Время на оплату истекло', insufficient_funds: 'Недостаточно средств', card_expired: 'Истёк срок действия карты', canceled_by_merchant: 'Платёж отменён', '3d_secure_failed': 'Банк не подтвердил оплату', permission_revoked: 'Оплата отменена', payment_method_limit_exceeded: 'Превышен лимит платежей', payment_method_restricted: 'Способ оплаты недоступен', fraud_suspected: 'Банк заподозрил мошенничество', country_forbidden: 'Оплата из этой страны недоступна' };
  // 1.38.1: возврат с ЮKassa. Вход не обязателен — на iPhone приложение с экрана «Домой» открывает оплату
  // во встроенном Safari, где человек не вошёл. Оплачено — коротко «что включилось» и сразу к объявлению.
  const PAY_KEY = 'tg_pay';
  const payMark = (id) => { try { if (id) localStorage.setItem(PAY_KEY, JSON.stringify({ id, at: Date.now() })); else localStorage.removeItem(PAY_KEY); } catch { /* нет хранилища */ } };
  const payPending = () => { try { const p = JSON.parse(localStorage.getItem(PAY_KEY) || 'null'); return p && p.id && Date.now() - p.at < 2 * 3600 * 1000 ? p.id : ''; } catch { return ''; } };
  function goPay(r) {
    payMark(r.id);
    location.href = r.url;
    // Страница осталась на месте (оплата открылась поверх приложения) — под ней уже ждёт результат.
    setTimeout(() => { if (!location.pathname.startsWith('/pay/')) go(`/pay/${r.id}`); }, 1500);
  }
  const dayWord = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
  async function viewPay(id) {
    setTitle('Оплата');
    app.innerHTML = String(html`<div class="wrap"><div class="pay-res" id="pay"><div class="loader"></div></div></div>`);
    const box = $('#pay');
    const started = Date.now();
    let timer = null;
    cleanup = () => clearTimeout(timer);
    const okText = (p, r) => {
      if (p.kind === 'plan') return r && r.endsAt ? `Тариф «${PLAN_NAME[r.plan] || PLAN_NAME[p.item.plan]}» действует до ${dateShort(r.endsAt)}.` : `Тариф «${PLAN_NAME[p.item.plan]}» подключён.`;
      if (p.kind === 'promo') return r && r.endsAt ? `Реклама над поиском идёт до ${dateShort(r.endsAt)}.` : 'Реклама над поиском запущена.';
      if (!r) return 'Продвижение включено.';
      return r.status === 'active' ? `Продвигается ещё ${dayWord(Math.max(1, daysLeft(r.endsAt)))} — до ${dateShort(r.endsAt)}.` : 'Начнётся, как только объявление пройдёт проверку, и продлится 7 дней.';
    };
    const draw = ({ payment: p, result: r, url, guest }) => {
      const lid = (r && r.listingId) || p.item.listingId;
      const toListing = p.kind !== 'plan' && lid;
      const back = toListing ? `/l/${lid}` : '/business';
      const home = p.kind === 'boost' ? ['/profile', 'Мои объявления'] : ['/profile/business', 'Для бизнеса'];
      if (p.status === 'succeeded') {
        payMark('');
        box.innerHTML = String(html`<div class="pay-ic ok pop">${ic('check', 34, 2.4)}</div>
          <h1>Оплачено</h1><p class="pay-lead">${okText(p, r)}</p>
          <div class="pay-line"><span>${p.title}</span><b>${rub(p.amount)}</b></div>
          ${guest ? html`<p class="pay-hint">${ic('phone', 16, 2)}<span>Можно закрыть эту страницу и вернуться в приложение — всё уже включено.</span></p>` : ''}
          <div class="pay-act">${toListing ? html`<a class="btn btn-accent btn-lg pay-go" href="${back}" data-go><span>Перейти к объявлению</span><i class="pay-bar"></i></a>`
            : html`<a class="btn btn-accent btn-lg" href="/profile/business/shop">Заполнить витрину</a>`}
            ${guest ? '' : html`<a class="btn btn-soft btn-lg" href="${home[0]}">${home[1]}</a>`}</div>
          <p class="pay-foot">Чек ЮKassa пришлёт на почту.</p>`);
        // Вошедшего через 4 секунды ведём к объявлению — там уже видно «Продвигается». Любое касание отменяет.
        const go2 = $('[data-go]', box);
        if (go2 && !guest) {
          go2.classList.add('run');
          timer = setTimeout(() => { if (box.isConnected) go(back, true); }, 4000);
          const stop = () => { clearTimeout(timer); go2.classList.remove('run'); };
          box.addEventListener('pointerdown', (e) => { if (!e.target.closest('[data-go]')) stop(); }, { once: true });
        }
        return;
      }
      const state = p.status === 'canceled' ? ['bad', 'close', 'Оплата не прошла', `${CANCEL_REASON[p.error] || 'Банк или ЮKassa отклонили платёж'}. Деньги не списаны.`]
        : ['wait', 'clock', 'Проверяем оплату', 'Если вы уже оплатили, страница обновится сама.'];
      box.innerHTML = String(html`<div class="pay-ic ${state[0]}">${ic(state[1], 34, 2.2)}</div>
        <h1>${state[2]}</h1><p class="pay-lead">${state[3]}</p>
        <div class="pay-line"><span>${p.title}</span><b>${rub(p.amount)}</b></div>
        <div class="pay-act">${p.status === 'canceled' ? html`<a class="btn btn-dark btn-lg" href="${back}">Попробовать ещё раз</a><a class="btn btn-soft btn-lg" href="/messages/support">Поддержка</a>`
    : html`${url ? html`<a class="btn btn-dark btn-lg" href="${url}" data-ext>Вернуться к оплате</a>` : ''}<a class="btn btn-soft btn-lg" href="${toListing ? back : home[0]}">${toListing ? 'К объявлению' : home[1]}</a>`}</div>`);
      if (p.status === 'canceled') payMark('');
      const ext = $('[data-ext]', box); if (ext) ext.onclick = (e) => { e.preventDefault(); location.href = url; };
    };
    const poll = async () => {
      let d;
      try { d = await api('GET', `/api/payments/${encodeURIComponent(id)}`); } catch (e) {
        if (!box.isConnected) return;
        payMark('');
        box.innerHTML = String(html`<div class="pay-ic bad">${ic('close', 34, 2.2)}</div><h1>Платёж не найден</h1><p class="pay-lead">${e.message}</p><div class="pay-act"><a class="btn btn-soft btn-lg" href="/">На главную</a></div>`);
        return;
      }
      if (!box.isConnected) return;
      draw(d);
      const age = Date.now() - started;
      if (d.payment.status === 'pending' && age < 15 * 60 * 1000) timer = setTimeout(() => poll().catch(() => {}), age < 2 * 60 * 1000 ? 2500 : 8000);
      if (d.payment.status === 'succeeded' && S.user) refreshMe();
    };
    await poll();
  }

  // Продвижение объявления: срок, цена (со скидкой «Про»), что будет дальше.
  const PROMO_STATUS = { active: ['ok', 'Продвигается'], ended: ['off', 'Завершено'], stopped: ['bad', 'Остановлено'] };
  const promoLine = (p) => (p.status === 'active' ? `до ${dateShort(p.endsAt)} · показов ${NF.format(p.shows)} · переходов ${NF.format(p.clicks)}` : p.status === 'stopped' ? (p.note || 'остановлено модератором') : `${p.startsAt ? `${dateShort(p.startsAt)} — ${dateShort(p.endsAt)}` : ''} · показов ${NF.format(p.shows)} · переходов ${NF.format(p.clicks)}`);
  async function promoteModal(listingId, title) {
    let d;
    try { d = await api('GET', `/api/listings/${listingId}/promote`); } catch (e) { toast(e.message, true); return; }
    let days = 7;
    openModal(String(html`<h2>Продвижение</h2><p class="muted" style="margin:0 0 14px">«${title}»</p>
      ${d.current ? html`<div class="banner ok" style="margin-bottom:14px"><strong>Продвигается</strong> ${promoLine(d.current)}. Новая оплата продлит срок.</div>` : ''}
      ${html`<div class="promo-pick" role="radiogroup" aria-label="Срок продвижения">${d.options.map((o) => html`<label class="promo-pick-opt"><input type="radio" name="days" value="${o.days}" ${o.days === days ? raw('checked') : ''}><span><b>${o.days} ${plural(o.days, 'день', 'дня', 'дней')}</b><em>${rub(o.price)}${o.price !== o.base ? html` <s>${rub(o.base)}</s>` : ''}</em></span></label>`)}</div>
      ${d.discount ? html`<p class="muted" style="margin:8px 0 0;font-size:13px">Скидка ${d.discount}% — тариф «Магазин Про».</p>` : ''}
      <ul class="promo-how"><li>${ic('megaphone', 17)}Покажем в блоке «Реклама» над выдачей и лентой тем, кто ищет похожее в городе ${d.city || 'объявления'}.</li>
        <li>${ic('bolt', 17)}Запустим сразу после оплаты — без ожидания.</li>
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
    const biz = d.bizAccount; // 1.45.0: тарифы — после включения бизнес-аккаунта, проверка ИНН не нужна
    const official = !!(d.shop && d.shop.official); // 1.50.0: официальному аккаунту всё открыто без тарифа
    const lock = (need) => (official ? '' : !d.plan ? `в тарифе «${PLAN_NAME[need]}»` : need === 'pro' && d.plan.id !== 'pro' ? 'в тарифе «Магазин Про»' : '');
    const gate = (need, text) => html`<div class="biz-gate">${ic('store', 26, 1.8)}<div><b>${text}</b><span>${lock(need) ? `Доступно ${lock(need)}.` : ''} ${biz ? '' : 'Сначала включите бизнес-аккаунт — это бесплатно.'}</span></div><a class="btn btn-dark" href="/business">${biz ? 'Выбрать тариф' : 'Включить бизнес-аккаунт'}</a></div>`;
    if (sub === 'shop') return lock('shop') ? (box.innerHTML = String(gate('shop', 'Витрина магазина'))) : renderShopEditor(box, d, reload);
    if (sub === 'stats') return lock('shop') ? (box.innerHTML = String(gate('shop', 'Статистика магазина'))) : renderShopStats(box, days);
    const tool = (href, icon, t, sub2, need) => html`<a class="biz-tool ${lock(need) ? 'locked' : ''}" href="${href}"><span class="bt-ic">${ic(icon, 22)}</span><b>${t}</b><small>${lock(need) ? html`${ic('lock', 13, 2)} ${lock(need)}` : sub2}</small></a>`;
    box.innerHTML = String(html`<div class="bizhub">
      ${!biz && !official ? html`<div class="biz-gate">${ic('store', 26, 1.8)}<div><b>Включите бизнес-аккаунт</b><span>Бесплатно. После этого можно подключить тариф — первым бизнес-аккаунтам он бесплатный.</span></div><button type="button" class="btn btn-dark" data-biz-on>Включить</button></div>` : ''}
      ${official ? html`<div class="plan-now pro">
        <div class="pn-txt"><span class="pn-k">Аккаунт</span><b>«Официальный аккаунт Торганы»</b><span>Витрина, статистика и закреплённые — без тарифа и без срока.</span></div>
      </div>` : html`<div class="plan-now ${d.plan ? d.plan.id : 'none'}">
        <div class="pn-txt"><span class="pn-k">${d.plan && d.plan.trial ? 'Бесплатный тариф' : 'Тариф'}</span><b>${d.plan ? `«${d.plan.name}»` : 'Не подключён'}</b>
          <span>${d.plan ? `до ${dateLong(d.plan.until)} · осталось ${daysLeft(d.plan.until)} ${plural(daysLeft(d.plan.until), 'день', 'дня', 'дней')}` : `Витрина и статистика магазина — от ${rub(d.prices.shop[1])} в месяц. Размещение объявлений бесплатно всегда.`}</span></div>
        <a class="btn ${d.plan ? 'btn-light' : 'btn-dark'}" href="/business">${d.plan ? 'Продлить или сменить' : 'Выбрать тариф'}</a>
      </div>`}
      <div class="biz-tools">
        ${tool('/profile/business/shop', 'store', 'Витрина', d.shop.about || d.shop.cover ? 'заполнена · как видят покупатели' : 'обложка, описание, адрес, сайт', 'shop')}
        ${tool('/profile/business/stats', 'chart', 'Статистика магазина', 'все объявления · выгрузка в Excel', 'shop')}
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
    const on = $('[data-biz-on]', box);
    if (on) on.onclick = async () => { on.disabled = true; try { await bizAccountOn(); go('/business#plans'); } catch (ex) { toast(ex.message, true); on.disabled = false; } };
  }

  // 1.49.0: закрепить на витрине («Магазин Про») или открепить; true — получилось.
  async function setPin(id, pin) {
    try {
      const r = await api('PUT', '/api/my/shop/pins', { id, pin });
      S.user.shop = r.shop;
      toast(pin ? 'Закреплено — покупатели увидят его первым на витрине' : 'Откреплено');
      return true;
    } catch (e) { toast(e.message, true); return false; }
  }
  function renderShopEditor(box, d, reload) {
    const s = d.shop;
    let cover = null; // undefined — не трогать, '' — убрать, имя файла — новая
    box.innerHTML = String(html`<form class="set" id="shop-form">
      <section class="set-group set-wide">
        <h2>Обложка</h2>
        <button type="button" id="sh-cover" class="shop-cover-edit ${s.cover ? 'has' : ''}" data-cover>${s.cover ? html`<img src="${s.cover}" alt="">` : ''}<span class="sce-hint">${ic('camera', 20, 2)}${s.cover ? 'Заменить обложку' : 'Загрузить обложку · 1600×530'}</span></button>
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
        <div class="field"><label for="sh-delivery">Доставка</label><input id="sh-delivery" name="delivery" class="input" maxlength="200" value="${s.delivery}" placeholder="Самовывоз, курьер по городу, СДЭК по России"></div>
        <p class="muted" style="margin:0;font-size:13px">Витрину видят все на странице продавца. Пишите по правилам площадки: без телефонов и мессенджеров в описании — для связи есть чат. Модератор может очистить витрину, если она нарушает правила.</p>
        <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить</button><a class="btn btn-soft" href="/u/${S.user.id}">${ic('eye', 18)}Как видят покупатели</a></div>
      </section>
      <section class="set-group set-wide">
        <h2>Главное в магазине</h2>
        ${!d.shop.official && d.plan.id !== 'pro' ? html`<p class="muted" style="margin:0;font-size:14px">${ic('lock', 14, 2)} До 3 объявлений в начале витрины — в тарифе «Магазин Про».</p>`
    : html`${d.pinned.length ? html`<div class="pin-list">${d.pinned.map((l) => html`<div class="pin-row"><span class="pin-ic">${ic('pushpin', 16, 2)}</span><a href="/l/${l.id}">${l.title}</a><button type="button" class="btn btn-line btn-sm" data-unpin="${l.id}">Открепить</button></div>`)}</div>` : ''}
        <p class="muted" style="margin:0;font-size:14px">${d.pinned.length >= 3 ? 'Закреплено 3 из 3 — чтобы закрепить другое, открепите одно.' : `Закреплено ${d.pinned.length} из 3. Закрепить: «Мои объявления» → ⋯ → «Закрепить на витрине».`} Закреплённые покупатели видят первыми.</p>`}
      </section>
    </form>`);
    $$('[data-unpin]', box).forEach((b) => { b.onclick = async () => { if (await setPin(Number(b.dataset.unpin), false)) reload(); }; });
    // Из «Что ещё заполнить» в карточке профиля — сразу к нужному полю.
    const target = location.hash && $(location.hash, box);
    if (target) { target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); }
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

  async function renderShopStats(box, days) {
    const d = await api('GET', `/api/my/shop/stats?days=${days}`);
    const t = d.totals; const pv = d.prev;
    const ctr = ctrOf(t.impressions, d.sources);
    const delta = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}% к прошлым ${d.period} дням` : '');
    const kpi = (n, label, sub, note, accent) => html`<div class="st-kpi ${accent ? 'accent' : ''}"><span class="k">${label}</span><b>${n}</b>${note ? html`<span class="d">${note}</span>` : ''}<span class="s">${sub}</span></div>`;
    const mx = Math.max(1, ...d.daily.map((x) => x.views));
    const n = d.daily.length;
    const labels = [0, Math.floor((n - 1) / 2), n - 1];
    const srcTotal = Object.values(d.sources).reduce((a, b) => a + b, 0);
    box.innerHTML = String(html`<div class="st">
      <div class="st-kpis">
        ${kpi(NF.format(t.impressions), 'Показы', 'в поиске, ленте, категориях и рекламе', delta(t.impressions, pv.impressions))}
        ${kpi(NF.format(t.views), 'Переходы', `${d.active} ${plural(d.active, 'активное объявление', 'активных объявления', 'активных объявлений')}`, delta(t.views, pv.views), true)}
        ${kpi(ctr === null ? '—' : `${pct1(ctr)}%`, 'Из показа в переход', ctr === null ? 'появится после первых показов' : 'доля открывших карточку', '')}
        ${kpi(NF.format(t.favs), 'В избранное', `сейчас в избранном у ${NF.format(d.favNow)}`, delta(t.favs, pv.favs))}
      </div>
      <section class="st-card"><div class="st-card-head"><h2>Переходы по дням</h2><a class="btn btn-soft btn-sm" href="/api/my/shop/stats.csv?days=${days}" download>${ic('download', 16, 2)}Выгрузить в Excel</a></div>
        <div class="st-chart" role="img" aria-label="Переходы по дням">${d.daily.map((x, i) => html`<div class="st-col" title="${dayLabel(x.day)}: переходов ${x.views}, показов ${x.impressions}, в избранное ${x.favs}"><div class="st-bar ${i === n - 1 ? 'now' : ''}" style="height:${x.views ? Math.max(4, Math.round((x.views / mx) * 100)) : 0}%">${x.favs ? html`<i class="st-dot"></i>` : ''}</div></div>`)}</div>
        <div class="st-axis">${labels.map((i) => html`<span>${dayLabel(d.daily[i].day)}</span>`)}</div>
      </section>
      <div class="st-row">
        <section class="st-card"><h2>Откуда переходили</h2>
          ${srcTotal ? srcRows(d.sources, () => false) : html`<p class="muted" style="margin:0">Появится после первых переходов.</p>`}
        </section>
        <section class="st-card"><h2>Объявления</h2>
          ${d.listings.length ? html`<div class="sst"><div class="sst-row sst-h" aria-hidden="true"><span></span><span></span><span class="sst-n">показы</span><span class="sst-n">переходы</span></div>${d.listings.slice(0, 12).map((l) => html`<a class="sst-row" href="/profile/stats/${l.id}"><span class="sst-img">${l.photo ? html`<img src="${l.photo}" alt="" loading="lazy">` : svg(P.image, 18, 1.4)}</span>
              <span class="sst-t">${l.title}</span><span class="sst-n" aria-label="Показы: ${NF.format(l.impressions)}">${NF.format(l.impressions)}</span><span class="sst-n" aria-label="Переходы: ${NF.format(l.views)}"><b>${NF.format(l.views)}</b></span></a>`)}</div>
            ${d.listings.length > 12 ? html`<p class="muted" style="margin:0;font-size:13px">Все ${d.listings.length} — в выгрузке Excel.</p>` : ''}` : html`<p class="muted" style="margin:0">Опубликованных объявлений пока нет.</p>`}
        </section>
      </div>
      <p class="st-note">Считаем так же, как в статистике объявления: показ и переход — один раз в сутки на человека, без ваших собственных просмотров, модераторов и роботов. В долю «из показа в переход» идут только переходы из выдачи. «Блок «Реклама»» — переходы из продвижения.</p>
    </div>`);
  }

  // «О магазине» — часы, адрес (ссылка на Яндекс Карты), доставка, сайт. Пусто — блока нет.
  // 1.50.2: шапка в градиенте (у официального аккаунта — знак Торганы), значки в цветных плитках, ссылки со стрелкой;
  // «Открыто» — только когда в часах написано «круглосуточно» (24/7): тогда это правда в любой момент.
  function shopAbout(sh) {
    const site = sh.site ? (() => { try { return new URL(sh.site).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '';
    const go = (href, text, rel) => html`<a class="si-link" href="${href}" target="_blank" rel="${rel}">${text}${ic('right', 15, 2.4)}</a>`;
    const allDay = /круглосуточ|24\s*\/\s*7|24\s*час/i.test(sh.hours || '');
    const rows = [
      sh.hours && ['clock', 'Часы работы', html`<span class="si-v">${sh.hours}${allDay ? html`<span class="si-open">Открыто</span>` : ''}</span>`],
      sh.address && ['pin', 'Адрес', html`<span class="si-v">${sh.address}</span>${go(`https://yandex.ru/maps/?text=${encodeURIComponent(sh.address)}`, 'Открыть в Яндекс Картах', 'noopener')}`],
      sh.delivery && ['truck', 'Доставка', html`<span class="si-v">${sh.delivery}</span>`],
      site && ['link', 'Сайт', go(sh.site, site, 'nofollow noopener ugc')]
    ].filter(Boolean);
    const t = sh.official ? 'О Торгане' : 'О магазине';
    return rows.length ? html`<aside class="shop-info" aria-label="${t}">
      <div class="si-head"><span class="si-mark">${sh.official ? torganaAva(40) : ic('store', 20, 2.2)}</span><h2>${t}</h2></div>
      <div class="si-list">${rows.map(([icn, k, v]) => html`<div class="si-row"><span class="si-ic">${ic(icn, 18, 2.2)}</span><div><small>${k}</small>${v}</div></div>`)}</div>
    </aside>` : '';
  }

  // ================= жалоба на объявление =================
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

  // ================= модерация: отдельный файл admin.js (1.51.2) =================
  // Грузим при первом заходе в /admin и запоминаем. Помощники отдаём одним объектом.
  let adminMod = null;
  function loadAdmin() {
    if (!adminMod) {
      adminMod = new Promise((ok, fail) => {
        const v = (/[?&]v=([\w-]+)/.exec(($('script[src*="/assets/app.js"]') || {}).src || '') || [])[1];
        const s = document.createElement('script');
        s.src = `/assets/admin.js${v ? `?v=${v}` : ''}`;
        s.onload = () => ok(window.TorganaAdmin({ $, $$, CANCEL_REASON, CONDITION_LABEL, MONTHS, MY_STATUS, MY_TAG, NF, P, PAY_STATUS, S, api, app, authPage, ava, catName, codeForm, confirmModal, dateLong, dateShort, eraseModal, esc, go, hm, html, ic, mountChat, nameSeal, navLink, openModal, plural, price, raw, reasonModal, render, renderPushDevice, repLine, requireAuth, rub, setTitle, shortWhen, since, subName, supportAva, svg, toast, trustBadges, verifiedSeal, viewNotFound, when, setCleanup: (f) => { cleanup = f; } }));
        s.onerror = () => { adminMod = null; s.remove(); fail(new Error('Не получилось загрузить модерацию — проверьте связь и обновите страницу')); };
        document.head.append(s);
      });
    }
    return adminMod;
  }
  // Обычные функции, а не const: маршруты (ROUTES) ссылаются на них раньше этого места.
  async function viewAdmin(...a) { return (await loadAdmin()).viewAdmin(...a); }
  async function viewAdminListing(...a) { return (await loadAdmin()).viewAdminListing(...a); }
  async function viewAdminUser(...a) { return (await loadAdmin()).viewAdminUser(...a); }
  async function viewDevice(...a) { return (await loadAdmin()).viewDevice(...a); }

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
    const q = (t) => html`<li class="help-q">${ic('search', 17)}<a href="/search?q=${encodeURIComponent(t)}">${t}</a></li>`;
    // 1.31 (вариант A): у страниц помощи слева общее меню, справа статья. Тексты описывают ровно то, что умеет сайт.
    const PAGES = {
      help: ['Как искать', html`
        <p class="help-lead">Пишите в поиск так, как сказали бы человеку. Торгана сама поймёт цену, доставку и город.</p>
        <section class="help-box"><h2>Примеры запросов</h2><ul class="help-qs">
          ${q('коляска до 15 000 с доставкой')}${q('iPhone от 40 тыс в Казани')}${q('диван до 20к в Москве')}${q('ноутбук от 30к до 60к')}</ul>
          <p class="help-note">Нажмите на пример — откроется выдача.</p></section>
        <h2>Что понимает поиск</h2>
        <ul><li><b>Цену</b> со словами «до» и «от»: числом, с «тыс», «к» или «млн» — например, «до 20к» или «от 2 млн».</li>
          <li><b>Доставку</b> — слова «с доставкой» оставят только объявления, где продавец её предлагает.</li>
          <li><b>Город</b> — если назвать крупный город («в Казани»), поиск покажет объявления оттуда. Город также можно выбрать кнопкой в строке поиска.</li>
          <li><b>Опечатки</b> — если по запросу ничего нет, Торгана поищет похожее слово из объявлений («айфн» → «айфон») и скажет об этом над выдачей. Там же — ссылка «Искать как написано».</li>
          <li>Слова вроде «купить», «продам» или «б/у» поиск пропускает — они не сужают выдачу.</li></ul>
        <h2>Как уточнить выдачу</h2>
        <p>В выдаче есть фильтры: категория и раздел, характеристики раздела (например, марка, год или размер), город и метро, цена, доставка, «Торг уместен» и «Возможен обмен». Сортировка — сначала новые, дешевле или дороже.</p>
        <h2>Как не пропустить нужное</h2>
        <ul><li><b>Избранное.</b> Нажмите на сердечко — объявление сохранится в «Избранном». Если продавец снизит цену, придёт уведомление.</li>
          <li><b>Подписка на продавца.</b> Кнопка «Подписаться» в профиле продавца — узнаете о его новых объявлениях.</li></ul>
        <h2>Честная выдача</h2>
        <p>Платное продвижение не меняет порядок объявлений: такие карточки только заметнее — крупнее, в рамке или с метками на фото. Реклама показывается отдельным блоком с пометкой «Реклама».</p>`],
      safety: ['Безопасность', html`
        <p class="help-lead">Большинство мошеннических схем строится на одном: увести вас из чата площадки и получить деньги или данные карты.</p>
        <section class="help-box bad"><h2>Чего никогда не делать</h2><ul>
          <li>Не переходите в мессенджеры по просьбе собеседника.</li>
          <li>Не называйте коды из СМС, CVV/CVC и данные карты — для получения денег они не нужны.</li>
          <li>Не переходите по ссылкам «для получения оплаты» или «оформления доставки».</li>
          <li>Не вносите предоплату незнакомым продавцам.</li></ul></section>
        <section class="help-box ok"><h2>Как покупать спокойно</h2><ul>
          <li>Общайтесь в чате Торганы — переписка сохраняется.</li>
          <li>Встречайтесь в людных местах и проверяйте товар до оплаты.</li>
          <li>Смотрите репутацию продавца: уровень, подтверждённые сделки и жалобы.</li>
          <li>Цена намного ниже, чем у похожих объявлений, и спешка («только сегодня», «уже едут другие») — повод насторожиться.</li></ul></section>
        <h2>Что делает Торгана</h2>
        <ul><li>Модератор проверяет каждое объявление и каждую правку до публикации.</li>
          <li>Если собеседник в чате предлагает уйти в мессенджер или заплатить вне Торганы, мы показываем предупреждение.</li>
          <li>Сделка попадает в репутацию, только когда её подтвердили обе стороны после переписки. Накрутку отсеиваем: повторные и встречные сделки, новые аккаунты без телефона.</li>
          <li>Значки «Телефон подтверждён», «ИП проверен» и «Компания проверена» появляются только после подтверждения.</li>
          <li>Сотрудники Торганы никогда не спрашивают пароль и коды из СМС.</li></ul>
        <p>Торгана не участвует в расчётах между покупателем и продавцом: оплату и передачу товара вы согласуете между собой.</p>
        <h2>Если что-то пошло не так</h2>
        <ul><li>О подозрительном объявлении сообщите кнопкой «Пожаловаться» на его странице.</li>
          <li>Напишите в <a href="/messages/support">поддержку</a> или на почту: ${contact}.</li>
          <li>Если вы перевели деньги или назвали данные карты — сразу позвоните в свой банк, а затем обратитесь в полицию.</li></ul>`],
      support: ['Поддержка', html`
        <p class="help-lead">Мы отвечаем людьми, а не шаблонами.</p>
        <section class="help-contact">${supportAva(52)}
          <div><b>Быстрее всего — в чате</b><span>«Поддержка Торганы» всегда закреплена первой в «Сообщениях». В чат можно отправить фото или скриншот.</span></div>
          <a class="btn btn-accent" href="/messages/support">Написать в поддержку</a></section>
        <p>Или на почту: ${contact}. Укажите ссылку на объявление или диалог, если вопрос о них. На сообщение в чате ответим там же, а если включены уведомления — дадим знать push или письмом. Реквизиты — на странице <a href="/page/contacts">«Реквизиты и контакты»</a>.</p>
        <h2>Частые вопросы</h2>
        <div class="help-faq">${(S.config.supportFaq || []).map(([t, a]) => html`<div><b>${t}</b><p>${a}</p></div>`)}
        </div>`]
    };
    const p = PAGES[slug];
    if (!p) { viewNotFound(); return; }
    setTitle(p[0]);
    const NAV = [['help', 'Как искать'], ['safety', 'Безопасность'], ['support', 'Поддержка'], ['rules', 'Правила площадки'], ['contacts', 'Реквизиты и контакты']];
    app.innerHTML = String(html`<div class="wrap"><div class="help">
      <nav class="help-nav" aria-label="Помощь"><span class="help-nav-h">Помощь</span>${NAV.map(([k, t]) => html`<a href="/page/${k}" class="${k === slug ? 'on' : ''}"${k === slug ? raw(' aria-current="page"') : ''}>${t}</a>`)}</nav>
      <article class="page help-art"><div class="help-crumbs">Помощь › ${p[0]}</div><h1>${p[0]}</h1>${p[1]}</article>
    </div></div>`);
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
    if (!STANDALONE || !('ontouchstart' in window)) return;
    // 1.54.0: срабатывает надёжнее — короче рывок (~125 px пальцем), не мешают текст в поиске, дробная прокрутка
    // и только что закончившаяся прокрутка; если обновить нельзя (недописанное сообщение) — говорим об этом.
    const START = 12; const TRIGGER = 80; const MAX = 120; const PULL = 0.7;
    const FIELD = 'input, textarea, select, [contenteditable]';
    let typed = [];
    // Черновик — только то, что жалко потерять: сообщение, текст объявления, формы. Поиск и фильтры — не черновик.
    const isDraftField = (t) => t && t.matches && t.matches('textarea, [contenteditable], input:not([type=search]):not([type=checkbox]):not([type=radio])') && !t.closest('form[role=search], .search, .hdr, header, [data-no-draft]');
    document.addEventListener('input', (e) => { const t = e.target; if (isDraftField(t) && !typed.includes(t)) typed.push(t); }, true);
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
        if (el.scrollTop > 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return true;
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
      if (window.scrollY > 2 || (window.scrollY > 0 && Date.now() - lastScroll < 150) || $('.modal-back') || innerScrolled(e.target)) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dist = 0; state = 'maybe';
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (state !== 'maybe' && state !== 'pull') return;
      if (e.touches.length !== 1) { state = 'idle'; hide(); return; }
      const dx = e.touches[0].clientX - x0; const dy = e.touches[0].clientY - y0;
      if (state === 'maybe') {
        if (Math.abs(dx) < START && Math.abs(dy) < START) return;
        if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 2 || typingNow()) { state = 'idle'; return; }
        state = 'pull'; ind.classList.remove('back');
      }
      const was = dist >= TRIGGER;
      dist = Math.min(MAX, Math.max(0, (dy - START) * PULL));
      if (!was && dist >= TRIGGER) navigator.vibrate?.(8); // «можно отпускать»
      show(dist);
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (state !== 'pull') { if (state === 'maybe') state = 'idle'; return; }
      if (dist < TRIGGER) { state = 'idle'; hide(); return; }
      if (hasDraft()) { state = 'idle'; hide(); toast('Не обновляем — есть недописанный текст. Отправьте или сотрите его'); return; }
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

  // Торгана открыта из приложения для iPhone или с экрана «Домой» (установлена раньше) — без адресной строки.
  const STANDALONE = NATIVE || (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ================= push-уведомления =================
  const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // В Safari на iPhone push нет: только в приложении Торгана (и у Торганы, добавленной раньше на экран «Домой»).
  const IOS_TAB = IOS && !STANDALONE;
  let swReg = null;
  function swReady() {
    if (!PUSH_OK) return Promise.resolve(null);
    if (!swReg) {
      swReg = navigator.serviceWorker.register('/sw.js').catch(() => null);
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.go) go(new URL(e.data.go).pathname); });
    }
    return swReg;
  }
  // 1.56.0: в приложении push — через Apple (APNs): разрешение спрашивает iPhone, адрес устройства (token) приходит
  // событием push.token после каждой загрузки страницы — сохраняем на сервере для вошедшего человека.
  const nativeWait = (type, ms = 4000) => new Promise((res) => {
    const on = (e) => { if (e.detail && e.detail.type === type) { window.removeEventListener('torgana-native', on); res(e.detail); } };
    window.addEventListener('torgana-native', on);
    setTimeout(() => { window.removeEventListener('torgana-native', on); res(null); }, ms);
  });
  // В хранилище: адрес устройства, если push включены, или 'off' — человек выключил их в настройках.
  // Адрес отправляем на сервер раз за запуск: сервер мог удалить его (Apple ответил, что он устарел).
  let apnsToken = null; let apnsErr = ''; let apnsSent = '';
  const apnsKey = () => `tg_apns_${S.user ? S.user.id : 0}`;
  const apnsMark = (v) => { try { if (v) localStorage.setItem(apnsKey(), v); else localStorage.removeItem(apnsKey()); } catch { /* нет хранилища */ } };
  const apnsOn = () => { try { const v = localStorage.getItem(apnsKey()); return !!v && v !== 'off'; } catch { return false; } };
  async function apnsSend(force = false) {
    if (!NATIVE || !apnsToken || !S.user) return false;
    const was = (() => { try { return localStorage.getItem(apnsKey()); } catch { return null; } })();
    if (!force && (was === 'off' || apnsSent === `${S.user.id}:${apnsToken.token}`)) return true;
    try { await api('POST', '/api/push/apns', apnsToken); } catch { return false; }
    apnsSent = `${S.user.id}:${apnsToken.token}`; apnsMark(apnsToken.token);
    return true;
  }
  if (NATIVE) {
    window.addEventListener('torgana-native', (e) => {
      const m = e.detail || {};
      if (m.type === 'push.token' && m.token) { apnsToken = { token: m.token, env: m.env === 'development' ? 'development' : 'production' }; apnsSend(); }
      if (m.type === 'push.error') apnsErr = String(m.message || '');
    });
  }
  async function pushState() {
    if (NATIVE) {
      nativePost({ type: 'push.status' });
      const r = await nativeWait('push.status', 2500);
      const perm = r ? r.status : 'default';
      return { ok: true, native: true, sub: perm === 'granted' && apnsOn() ? { native: true } : null, perm };
    }
    const reg = await swReady();
    if (!reg) return { ok: false, ios: IOS_TAB };
    return { ok: true, sub: await reg.pushManager.getSubscription(), perm: Notification.permission };
  }
  const b64uBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const deviceName = () => { const ua = navigator.userAgent; if (NATIVE) return 'iPhone · приложение Торгана'; return `${/Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Устройство'} · ${/YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'браузер'}`; };
  async function pushOn() {
    if (NATIVE) {
      nativePost({ type: 'push.request' });
      const r = await nativeWait('push.status', 60000); // ждём ответа в системном окне
      if (!r || r.status !== 'granted') throw new Error('Уведомления запрещены — включите их в Настройках iPhone → Торгана → Уведомления');
      const t = apnsToken || await nativeWait('push.token', 8000);
      if (!t || !t.token) throw new Error(`iPhone не выдал адрес для уведомлений${apnsErr ? ` (${apnsErr})` : ''}. Закройте приложение, откройте снова и включите ещё раз`);
      apnsToken = { token: t.token, env: t.env === 'development' ? 'development' : 'production' };
      if (!(await apnsSend(true))) throw new Error('Не получилось подключить уведомления — проверьте интернет и попробуйте ещё раз');
      return;
    }
    if (!PUSH_OK) throw new Error(IOS_TAB ? 'В браузере на iPhone уведомления не работают — они приходят в приложении Торгана' : 'Этот браузер не поддерживает уведомления');
    if (await Notification.requestPermission() !== 'granted') throw new Error('Уведомления запрещены — разрешите их в настройках сайта в браузере');
    const reg = await swReady();
    const { key } = await api('GET', '/api/push');
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key) });
    await api('POST', '/api/push/subscribe', { subscription: sub.toJSON(), device: deviceName() });
  }
  async function pushOff() {
    if (NATIVE) { // разрешение iPhone не отзовёшь из приложения — перестаём слать на это устройство
      if (apnsToken) await api('POST', '/api/push/apns/off', { token: apnsToken.token }).catch(() => {});
      apnsMark('off');
      return;
    }
    const { sub } = await pushState();
    if (!sub) return;
    await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  // ================= запуск =================
  // Кто вошёл, непрочитанное и новое у продавцов — при запуске и раз в 30 секунд.
  function applyMe(r) {
    const changed = (S.user && S.user.id) !== (r.user && r.user.id);
    S.user = r.user;
    S.first = r.first || null; // медаль «Один из первых»: { left, form }
    setUnread(r.unread || 0);
    setFresh(r.fresh);
    setNotices(r.notices);
    return changed;
  }
  async function refreshMe() {
    try { if (applyMe(await api('GET', '/api/me'))) { renderHeader(); renderBottomNav(); pushAskOnce(); apnsSend(); } } catch { /* офлайн */ }
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
    if (!st.ok || st.sub || st.perm !== 'default') { mark(); asking = false; return; }
    await new Promise((r) => setTimeout(r, 1200));
    if (!S.user || $('.modal-back')) { asking = false; return; } // занято другим окном — спросим при следующем заходе
    mark();
    openModal(String(html`<div class="ask-push"><span class="ask-ic">${ic('bell', 30, 1.9)}</span>
      <h2>Включить уведомления?</h2>
      <p>Сообщим, когда объявление опубликуют, напишут в чате или подешевеет товар из избранного. Выключить можно в настройках.</p>
      <div class="ask-act"><button class="btn btn-accent btn-lg btn-block" data-ok>Включить</button><button class="btn btn-soft btn-lg btn-block" data-x>Не сейчас</button></div></div>`), (m, close) => {
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

  // Откуда пришёл человек (первый заход браузера): метка utm_source или сайт, с которого перешли.
  // Храним только в браузере (localStorage, без cookie), один раз сообщаем о заходе; при регистрации передаём серверу.
  const srcOf = () => { try { return localStorage.getItem('tg_src') || ''; } catch { return ''; } };
  const SRC_HOSTS = [[/(^|\.)vk\.(com|ru)$|^vk\.cc$/, 'vk'], [/instagram\.com$/, 'instagram'], [/(^|\.)t\.me$|telegram\.(org|me)$/, 'telegram'], [/(^|\.)max\.ru$/, 'max'],
    [/(^|\.)(yandex\.[a-z.]+|ya\.ru)$/, 'yandex'], [/(^|\.)google\.[a-z.]+$/, 'google'], [/(^|\.)dzen\.ru$/, 'dzen'], [/(^|\.)ok\.ru$/, 'ok'], [/(^|\.)avito\.ru$/, 'avito']];
  const SRC_ALIAS = { ig: 'instagram', insta: 'instagram', tg: 'telegram', vkontakte: 'vk', yd: 'yandex', direct: 'yandex-direct' };
  function trackSource() {
    try {
      if (localStorage.getItem('tg_src')) return;
      const q = new URLSearchParams(location.search);
      let src = (q.get('utm_source') || '').toLowerCase().trim();
      const campaign = (q.get('utm_campaign') || '').toLowerCase().trim();
      if (src) src = SRC_ALIAS[src] || src;
      else if (document.referrer) {
        const host = new URL(document.referrer).hostname.replace(/^www\./, '');
        if (host !== location.hostname) src = (SRC_HOSTS.find(([re]) => re.test(host)) || [null, host])[1];
      }
      src = (src || 'direct').replace(/[^a-z0-9а-яё_.-]+/gi, '-').slice(0, 40);
      const val = `${src}|${campaign.replace(/[^a-z0-9а-яё_.-]+/gi, '-').slice(0, 60)}`;
      localStorage.setItem('tg_src', val);
      api('POST', '/api/visit', { src, campaign }).catch(() => {});
    } catch { /* приватный режим — не считаем */ }
  }

  async function boot() {
    trackSource();
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
    // Приложение открыли заново, а платёж ушёл на ЮKassa недавно — сразу показываем, чем закончилось.
    const pend = payPending();
    if (pend && !location.pathname.startsWith('/pay/')) history.replaceState(null, '', `/pay/${pend}`);
    await render();
    cookieBar();
    pushAskOnce();
    setupPullToRefresh();
    setInterval(() => { if (S.user && document.visibilityState === 'visible') refreshMe(); }, 30000);
  }

  boot();
})();

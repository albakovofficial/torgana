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
    feed: '<path d="M5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/>'
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
  function renderHeader() {
    const path = location.pathname;
    const isHome = path === '/';
    const q = path === '/search' ? new URLSearchParams(location.search).get('q') || '' : '';
    $('#header').innerHTML = String(html`<div class="wrap header-in">
      ${logo()}
      ${isHome ? '' : html`<form class="search header-search" role="search" data-search>
        ${ic('search', 18)}
        <label class="sr" for="hq">Поиск по объявлениям</label>
        <input id="hq" name="q" type="search" placeholder="Поиск по всей России" value="${q}" autocomplete="off">
        <button class="btn btn-accent btn-sm" type="submit">Найти</button>
      </form>`}
      <nav class="header-nav" aria-label="Основное">
        <a href="/favorites" class="nav-link hide-m">${ic('heart', 20)}<span class="nav-text">Избранное</span></a>
        <a href="/messages" class="nav-link hide-m">${ic('chat', 20)}<span class="nav-text">Сообщения</span><span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span></a>
        <a href="/new" class="btn btn-dark btn-sm hide-m" style="margin-left:8px">Разместить</a>
        ${S.user ? '' : html`<a href="/login" class="nav-link hide-m" style="margin-left:4px">Войти</a>`}
        <button type="button" class="icon-btn menu-btn" data-menu aria-label="Меню" aria-haspopup="dialog">${ic('menu', 22, 2)}</button>
      </nav>
    </div>`);
    $('[data-menu]', $('#header')).onclick = openMenu;
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
        <nav class="f-docs" aria-label="Документы">${docs.map(([href, label]) => html`<a href="${href}">${label}</a>`)}</nav></div>
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
    S.fresh = f || { search: 0, price: 0 };
    $$('[data-fresh]').forEach((el) => { el.textContent = S.fresh.search; el.classList.toggle('hidden', !S.fresh.search); });
  }
  const freshBadge = () => html`<span class="badge ${S.fresh && S.fresh.search ? '' : 'hidden'}" data-fresh>${S.fresh ? S.fresh.search : 0}</span>`;

  // ================= карточки =================
  // it.ad — карточка из блока «Реклама»: пометка, рекламодатель и erid по кнопке «Реклама» (38-ФЗ, ст. 18.1).
  function card(it) {
    const meta = [it.city, shortWhen(it.createdAt)].filter(Boolean).join(' · ');
    const ad = it.ad;
    return html`<div class="card${ad ? ' is-ad' : ''}">
      <a href="/l/${it.id}" class="card-link"${ad ? raw(` data-adid="${Number(ad.id)}"`) : ''}>
        <div class="card-img">
          ${it.photo ? html`<img src="${it.photo}" alt="" loading="lazy">` : svg(P.image, 40, 1.2)}
          ${ad ? '' : it.status === 'sold' ? html`<span class="tag dark sold-badge">Продано</span>` : it.priceWas ? html`<span class="tag drop-badge" title="Было ${price(it.priceWas, it.priceUnit)}">${ic('down', 13, 2.4)}Цена снижена</span>` : ''}
          <span class="price-pill">${price(it.price, it.priceUnit)}</span>
        </div>
        <div class="card-body">
          <span class="card-title">${it.title}</span>
          <span class="card-meta">${meta}${it.delivery ? html` · <span class="ok">Доставка</span>` : ''}</span>
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
    [/^\/l\/(\d+)$/, viewListing],
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
    [/^\/profile(?:\/(listings|settings|reviews|searches|stats\/\d+|business(?:\/(?:shop|stats|feed))?))?$/, viewProfile],
    [/^\/business$/, viewBusiness],
    [/^\/pay\/([\w-]+)$/, viewPay],
    [/^\/u\/(\d+)$/, viewUser],
    [/^\/admin$/, viewAdmin],
    [/^\/admin\/l\/(\d+)$/, viewAdminListing],
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
    } catch (err) {
      if (err.status === 404) viewNotFound(err.message);
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
        <div class="home-find">
          <form class="search home-search" role="search" data-search>
            ${ic('search', 20)}
            <label class="sr" for="q">Что вы ищете</label>
            <input id="q" name="q" type="search" placeholder="Что вы ищете?" autocomplete="off" enterkeyhint="search">
            <button class="btn btn-accent" type="submit">Найти</button>
          </form>
          <button type="button" class="city-btn" id="city-btn">${ic('pin', 18)}<span>${S.city || 'Вся Россия'}</span>${ic('down', 16, 2)}</button>
        </div>
        <div class="cats">${S.config.categories.map((c) => html`<a class="cat" href="/search?category=${c.id}"><span class="cat-ic">${catIc(c.id)}</span>${c.name}</a>`)}</div>
      </section>

      <section class="wrap home-feed">
        <div class="section-head"><h2>Свежие объявления${S.city ? html` · ${S.city}` : ''}</h2><a href="/search${S.city ? `?city=${encodeURIComponent(S.city)}` : ''}">Смотреть все</a></div>
        <div id="feed" class="feed">${skeletonGrid(15)}</div>
        <div class="more hidden"></div>
      </section>`);
    $('#city-btn').onclick = () => cityModal(() => render());
    const feed = listingFeed($('#feed'), S.city ? { city: S.city } : {}, {
      limit: 30,
      auto: true,
      empty: html`<div class="empty"><h3>${S.city ? `В городе ${S.city} пока нет объявлений` : 'Здесь появятся первые объявления'}</h3><p>Разместите своё — это бесплатно и займёт пару минут.</p><a class="btn btn-dark" href="/new">Разместить объявление</a></div>`
    });
    cleanup = feed.stop;
    await feed.first;
    await adRow($('#feed'), S.city ? { city: S.city } : {}, 'feed', S.city ? `в городе ${S.city}` : '');
  }

  // ================= поиск =================
  async function viewSearch(_, q) {
    const params = Object.fromEntries(q.entries());
    const category = params.category || '';
    const title = params.q ? `«${params.q}»` : category ? catName(category) : 'Все объявления';
    setTitle(params.q || catName(category) || 'Поиск');
    app.innerHTML = String(html`<div class="wrap search-page">
      <aside class="filters collapsed" id="filters">
        <button type="button" class="btn btn-soft btn-block" id="filters-toggle" style="display:none">${ic('filter', 18)}Фильтры</button>
        <form id="filter-form" class="filters-body" style="display:flex;flex-direction:column;gap:20px">
          <h3>Фильтры</h3>
          <input type="hidden" name="q" value="${params.q || ''}">
          <div class="field"><label for="f-cat">Категория</label>
            <select id="f-cat" name="category" class="select"><option value="">Все категории</option>
              ${S.config.categories.map((c) => html`<option value="${c.id}" ${c.id === category ? raw('selected') : ''}>${c.name}</option>`)}
            </select></div>
          <div class="field"><label for="f-city">Город</label>
            <input id="f-city" name="city" class="input" list="cities" placeholder="Вся Россия" value="${params.city || ''}">
            <datalist id="cities">${S.config.cities.map((c) => html`<option value="${c}">`)}</datalist></div>
          <div class="field"><span class="label">Цена, ₽</span>
            <div class="row"><label class="sr" for="f-min">Цена от</label><input id="f-min" name="min" class="input" inputmode="numeric" placeholder="от" value="${params.min || ''}">
            <label class="sr" for="f-max">Цена до</label><input id="f-max" name="max" class="input" inputmode="numeric" placeholder="до" value="${params.max || ''}"></div></div>
          <label class="switch"><span>С доставкой</span><input type="checkbox" name="delivery" value="1" ${params.delivery === '1' ? raw('checked') : ''}><span class="track"></span></label>
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
        <div class="understood" id="understood"></div>
        <div id="results">${skeletonGrid(9)}</div>
        <div class="more hidden"></div>
      </section>
    </div>`);

    const ff = $('#filter-form');
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
  const SEARCH_KEYS = ['q', 'category', 'city', 'min', 'max', 'delivery'];
  const searchParams = (p) => Object.fromEntries(SEARCH_KEYS.map((k) => [k, String(p[k] || '').trim()]).filter(([, v]) => v && v !== '0'));
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

  async function renderSavedSearches(reload) {
    const { items } = await api('GET', '/api/saved-searches');
    const box = $('#box');
    const chips = (p) => [p.city, p.min && `от ${NF.format(p.min)} ₽`, p.max && `до ${NF.format(p.max)} ₽`, p.delivery && 'с доставкой', p.q && p.category && catName(p.category)].filter(Boolean);
    box.innerHTML = String(html`<div id="nudge"></div>
      ${items.length ? html`<div class="ss-list">${items.map((s) => html`<div class="ss-card">
          <a class="ss-main" href="${searchUrl(s)}"><span class="ss-ic">${ic(s.params.category ? 'tag' : 'search', 20, 2)}</span>
            <span class="ss-txt"><b>${s.params.q ? `«${s.params.q}»` : catName(s.params.category) || 'Все объявления'}</b>
              <span>${chips(s.params).join(' · ') || 'Вся Россия'}</span></span>
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
    let idx = 0;
    const photos = l.photos;
    const marketChip = market ? ({
      below: html`<span class="tag accent">Ниже рынка</span>`,
      market: html`<span class="tag"><span class="dot"></span>&nbsp;Цена в рынке</span>`,
      above: html`<span class="tag">Выше рынка</span>`
    })[market.level] : '';
    const specs = [
      ['Категория', catName(l.category)],
      CONDITION_CATS.has(l.category) && l.condition ? ['Состояние', CONDITION_LABEL[l.condition]] : null,
      ['Город', l.city],
      ['Доставка', l.delivery ? 'Отправит по России' : 'Только встреча'],
      ['Опубликовано', when(l.createdAt)]
    ].filter(Boolean);

    let ownerBanner = '';
    if (l.isOwner && l.status === 'rejected') {
      ownerBanner = html`<div class="banner danger"><strong>Объявление отклонено модерацией.</strong> Причина: ${l.rejectReason || 'не указана'}.
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-dark btn-sm" href="/edit/${l.id}">Исправить</a>
        ${l.appealReply ? '' : l.appealText ? html`<span class="tag">Апелляция отправлена</span>` : html`<button class="btn btn-line btn-sm" data-appeal>Не согласен — подать апелляцию</button>`}</div>
        ${l.appealReply ? html`<div style="margin-top:10px"><strong>Ответ на апелляцию:</strong> ${l.appealReply}</div>` : ''}</div>`;
    } else if (l.isOwner && l.status === 'pending') {
      ownerBanner = html`<div class="banner warn"><strong>Объявление на проверке.</strong> Каждое объявление перед публикацией проверяет модератор — обычно это занимает несколько часов${S.config.mail ? ', о решении напишем на почту' : ''}.
        ${l.flags ? html`Оно похоже на товар из раздела «${l.flags}» <a href="/page/rules" style="text-decoration:underline">правил</a> — проверим внимательнее.` : ''}</div>`;
    } else if (l.isOwner && l.status === 'archived') {
      ownerBanner = html`<div class="banner soft"><strong>Объявление снято с публикации.</strong> Его не видят покупатели.</div>`;
    }

    let actions;
    const pm = data.promo;
    if (l.isOwner) {
      actions = html`<div style="display:flex;flex-direction:column;gap:10px">
        ${pm ? html`<div class="promo-now ${pm.status}">${ic(pm.status === 'active' ? 'megaphone' : 'clock', 20)}<div><b>${PROMO_STATUS[pm.status][1]}</b><span>${promoLine(pm)}</span></div></div>` : ''}
        ${l.status === 'active' && (isBiz() || pm) ? html`<button class="btn btn-accent btn-lg btn-block" data-promote>${ic('trend', 20, 2)}${pm ? 'Продлить продвижение' : 'Продвигать'}</button>` : ''}
        <a class="btn btn-dark btn-lg btn-block" href="/edit/${l.id}">Редактировать</a>
        ${['active', 'sold', 'archived'].includes(l.status) ? html`<a class="btn btn-soft btn-lg btn-block" href="/profile/stats/${l.id}">${ic('chart', 20)}Статистика</a>` : ''}
        ${l.status === 'active' ? html`<button class="btn btn-soft btn-lg btn-block" data-status="sold">Отметить проданным</button>` : ''}
        ${l.status === 'sold' || l.status === 'archived' ? html`<button class="btn btn-soft btn-lg btn-block" data-status="active">Опубликовать снова</button>` : ''}
        ${l.status === 'active' ? html`<button class="btn btn-line btn-block" data-status="archived">Снять с публикации</button>` : ''}
        <button class="btn btn-danger btn-block" data-delete>Удалить</button>
      </div>`;
    } else if (l.status === 'active') {
      actions = html`<div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-accent btn-lg btn-block" data-write>${ic('chat', 20)}Написать продавцу</button>
        <button class="btn btn-line btn-block" data-report>${ic('warn', 18)}Пожаловаться</button>
      </div>`;
    } else {
      actions = html`<div class="banner soft">Товар уже продан. Посмотрите похожие объявления ниже.</div>`;
    }

    app.innerHTML = String(html`<div class="wrap">
      <nav class="crumbs" aria-label="Навигация"><a href="/">Главная</a><span aria-hidden="true">›</span><a href="/search?category=${l.category}">${catName(l.category)}</a></nav>
      ${ownerBanner ? html`<div style="margin-bottom:20px">${ownerBanner}</div>` : ''}
      <div class="item">
        <div class="item-main">
          <div>
            <div class="gallery-main" id="gallery">
              ${photos.length ? html`<img id="gimg" src="${photos[0]}" alt="${l.title}">` : svg(P.image, 56, 1.1)}
              ${photos.length > 1 ? html`
                <button class="icon-btn white gallery-nav prev" data-g="-1" aria-label="Предыдущее фото">${ic('left', 20)}</button>
                <button class="icon-btn white gallery-nav next" data-g="1" aria-label="Следующее фото">${ic('right', 20)}</button>
                <span class="gallery-count" id="gcount">1 из ${photos.length}</span>` : ''}
              ${l.status === 'sold' ? html`<span class="tag dark" style="position:absolute;top:18px;left:18px">Продано</span>` : ''}
            </div>
            ${photos.length > 1 ? html`<div class="thumbs">${photos.map((p, i) => html`<button class="thumb ${i === 0 ? 'on' : ''}" data-t="${i}" aria-label="Фото ${i + 1}"><img src="${p}" alt="" loading="lazy"></button>`)}</div>` : ''}
          </div>
          <section><h2 class="h2">Характеристики</h2><div class="specs">${specs.map(([k, v]) => html`<div class="spec"><div class="k">${k}</div><div class="v">${v}</div></div>`)}</div></section>
          ${l.description ? html`<section><h2 class="h2">Описание</h2><p class="desc">${l.description}</p></section>` : ''}
        </div>
        <aside class="item-side">
          <div class="panel panel-shadow" style="display:flex;flex-direction:column;gap:22px">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <div style="flex:1;min-width:0"><h1 class="item-title">${l.title}</h1><p class="muted" style="margin:8px 0 0;font-size:14px">${l.city} · ${when(l.createdAt)}</p>
                <p class="item-counts"><span title="Просмотры">${ic('eye', 16)}<span data-views>${NF.format(l.views)} ${plural(l.views, 'просмотр', 'просмотра', 'просмотров')}</span></span><span title="В избранном">${ic('heart', 16)}<span data-favs>в избранном у ${NF.format(l.favCount)}</span></span></p></div>
              ${l.isOwner ? '' : html`<button class="icon-btn ${l.isFav ? 'on' : ''}" data-fav="${l.id}" aria-label="${l.isFav ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${l.isFav ? 'true' : 'false'}">${ic('heart', 20)}</button>`}
              <button class="icon-btn" data-share aria-label="Поделиться">${ic('share', 20)}</button>
            </div>
            <div><div class="item-price">${price(l.price, l.priceUnit)}${l.priceWas ? html` <s class="price-was">${price(l.priceWas, l.priceUnit)}</s>` : ''}</div>
              ${marketChip ? html`<div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${marketChip}<span class="muted" style="font-size:13px">по ${market.count} ${plural(market.count, 'похожему объявлению', 'похожим объявлениям', 'похожим объявлениям')}</span></div>` : ''}
            </div>
            ${actions}
            <div style="display:flex;flex-direction:column;gap:14px">
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
          <div class="banner soft" style="font-size:14px"><strong style="color:var(--text)">Мы никогда не просим</strong> переходить в мессенджеры, называть код из СМС или платить по ссылке. Если вас об этом просят — это мошенники.</div>
        </aside>
      </div>
      ${similar.length ? html`<section class="section"><div class="section-head"><h2>Похожие объявления</h2><a href="/search?category=${l.category}">Смотреть все</a></div>${grid(similar)}</section>` : ''}
    </div>`);

    if (l.status === 'active') api('POST', '/api/stats/view', { id: l.id, src: statSource() }).catch(() => {});

    // галерея
    const show = (i) => {
      if (!photos.length) return;
      idx = (i + photos.length) % photos.length;
      $('#gimg').src = photos[idx];
      const c = $('#gcount'); if (c) c.textContent = `${idx + 1} из ${photos.length}`;
      $$('.thumb').forEach((t, j) => t.classList.toggle('on', j === idx));
    };
    $$('[data-g]').forEach((b) => { b.onclick = () => show(idx + Number(b.dataset.g)); });
    $$('[data-t]').forEach((b) => { b.onclick = () => show(Number(b.dataset.t)); });
    let tx = null;
    const g = $('#gallery');
    g.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
    g.addEventListener('touchend', (e) => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1)); tx = null; });

    $('[data-share]').onclick = async () => {
      const url = location.href;
      if (navigator.share) { try { await navigator.share({ title: l.title, url }); return; } catch { /* отмена */ } }
      try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { toast(url); }
    };

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
          toast({ sold: 'Отмечено как проданное', active: 'Объявление снова опубликовано', archived: 'Снято с публикации' }[b.dataset.status]);
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
    if (pr) pr.onclick = () => promoteModal(l.id, l.title);
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
  // Пять шагов (фото, что продаёте, цена, где, описание). На компьютере справа — превью карточки,
  // что осталось заполнить и кнопка; на телефоне кнопка закреплена внизу вместо нижнего меню.
  // Новое объявление пишется в черновик в браузере (tg_draft) — закрыли страницу, ничего не потеряли.
  const UNIT_LABEL = { '': 'за всё', мес: 'в месяц', сутки: 'за сутки', час: 'за час', 'м²': 'за м²', шт: 'за штуку' };
  const DESC_TIPS = ['Состояние', 'Комплектация', 'Причина продажи', 'Дефекты', 'Где можно посмотреть'];
  const DRAFT_KEY = 'tg_draft';
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
    const st = {
      photos: (src.photos || []).filter((p) => p.file),
      category: src.category || '', condition: src.condition || '', priceUnit: src.priceUnit || '',
      negotiable: !!src.negotiable, busy: 0, tried: false
    };
    const units = S.config.priceUnits || [''];
    const step = (n, sid, title, sub, body) => html`<section class="ed-step" id="${sid}"><div class="ed-step-h"><span class="ed-n">${n}</span><div><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div></div><div class="ed-err" role="alert" hidden></div>${body}</section>`;

    app.innerHTML = String(html`<div class="wrap ed">
      <div class="ed-head">
        <a class="pf-back always" href="${l ? `/l/${l.id}` : '/profile'}">${ic('left', 18, 2)}${l ? 'К объявлению' : 'Мои объявления'}</a>
        <h1>${l ? 'Редактирование' : 'Новое объявление'}</h1>
        <p>${l ? 'После сохранения объявление снова проверит модератор — обычно несколько часов. Пока идёт проверка, его не видно в поиске.' : 'Бесплатно и без лимитов. Каждое объявление проверяет модератор — обычно это несколько часов.'}</p>
        ${draft ? html`<div class="ed-draft">${ic('refresh', 16, 2)}<span>Восстановили черновик от ${when(draft.at)}</span><button type="button" class="btn btn-soft btn-sm" id="draft-drop">Начать заново</button></div>` : ''}
      </div>
      <div class="ed-grid">
        <form id="ed" class="ed-form" novalidate>
          ${step(1, 's-photos', 'Фото', 'До 10 фото. Первое — обложка в поиске.', html`<div id="photos"></div>
            <input type="file" id="file" accept="image/jpeg,image/png,image/webp" multiple class="sr" tabindex="-1">
            <div id="ai-slot"></div>`)}
          ${step(2, 's-what', 'Что продаёте', '', html`
            <div class="field"><label for="title">Название</label>
              <div class="ed-input"><input id="title" name="title" class="input" maxlength="80" placeholder="Например: iPhone 15 Pro, 256 ГБ" value="${src.title || ''}" autocomplete="off"><span class="ed-count" id="title-count"></span></div>
              <span class="help">Марка, модель и главное — так объявление легче найти.</span></div>
            <div class="field"><span class="label">Категория</span><div class="ed-cats" role="radiogroup" aria-label="Категория">
              ${S.config.categories.map((c) => html`<button type="button" role="radio" aria-checked="false" data-cat="${c.id}"><span class="ed-cat-ic">${catIc(c.id, 24)}</span><span>${c.name}</span></button>`)}</div></div>
            <div class="field hidden" id="cond-field"><span class="label">Состояние</span><div class="ed-seg" role="radiogroup" aria-label="Состояние">
              ${[['new', 'Новое'], ['used', 'Б/у'], ['', 'Не указывать']].map(([v, t]) => html`<button type="button" role="radio" data-cond="${v}">${t}</button>`)}</div></div>`)}
          ${step(3, 's-price', 'Цена', '', html`
            <div class="ed-price">
              <div class="ed-money"><label class="sr" for="price">Цена в рублях</label><input id="price" name="price" class="input" inputmode="numeric" autocomplete="off" placeholder="0" value="${src.price !== null && src.price !== undefined && src.price !== '' ? NF.format(Number(String(src.price).replace(/\D/g, ''))) : ''}"><span>₽</span></div>
              <label class="ed-neg"><input type="checkbox" id="neg" ${st.negotiable ? raw('checked') : ''}><span class="track"></span><span>Договорная</span></label>
            </div>
            ${units.length > 1 ? html`<div class="ed-seg ed-units" role="radiogroup" aria-label="За что цена">${units.map((u) => html`<button type="button" role="radio" data-unit="${u}">${UNIT_LABEL[u] || `за ${u}`}</button>`)}</div>` : ''}
            <div class="ed-hint hidden" id="price-hint"></div>`)}
          ${step(4, 's-where', 'Где', '', html`
            <div class="field"><label for="city">Город</label>
              <div class="ed-icon-input">${ic('pin', 18)}<input id="city" name="city" class="input" list="cities" autocomplete="address-level2" value="${src.city || S.user.city || S.city || ''}" placeholder="Начните вводить город"></div>
              <datalist id="cities">${S.config.cities.map((c) => html`<option value="${c}">`)}</datalist></div>
            <label class="switch"><span>Отправлю по России<small>Покупатели из других городов увидят «Доставка»</small></span><input type="checkbox" name="delivery" ${src.delivery ? raw('checked') : ''}><span class="track"></span></label>`)}
          ${step(5, 's-desc', 'Описание', 'Честное описание экономит время и вам, и покупателю.', html`
            <div class="ed-tips" aria-label="Что написать">${DESC_TIPS.map((t) => html`<button type="button" class="chip" data-tip="${t}">${ic('plus', 14, 2.2)}${t}</button>`)}</div>
            <div class="ed-input"><label for="desc" class="sr">Описание</label><textarea id="desc" name="description" class="textarea" maxlength="4000" placeholder="Состояние, комплектация, причина продажи, особенности">${src.description || ''}</textarea><span class="ed-count" id="desc-count"></span></div>`)}
          <p class="ed-rules muted">Нажимая «${l ? 'Сохранить' : 'Отправить на проверку'}», вы соглашаетесь с <a href="/page/rules" style="text-decoration:underline">правилами площадки</a>.</p>
        </form>
        <aside class="ed-side">
          <div class="ed-panel">
            <div class="ed-preview-h">Так увидят в поиске</div>
            <div class="ed-preview" id="preview" aria-hidden="true"></div>
            <div class="ed-ready"><div class="ed-ready-h"><b id="ready-n"></b><span id="ready-t"></span></div><div class="ed-bar-track"><i id="ready-bar"></i></div>
              <ul class="ed-check" id="check"></ul><small class="ed-req">* обязательно, остальное — по желанию</small></div>
            <button type="button" class="btn btn-dark btn-lg btn-block" data-submit>${l ? 'Сохранить' : 'Отправить на проверку'}</button>
            <a class="btn btn-soft btn-block" href="${l ? `/l/${l.id}` : '/profile'}">Отмена</a>
          </div>
        </aside>
      </div>
      <div class="ed-dock"><div class="ed-dock-txt"><b id="dock-n"></b><span id="dock-t"></span></div><button type="button" class="btn btn-dark" data-submit>${l ? 'Сохранить' : 'На проверку'}</button></div>
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

    // ---------- категория, состояние, цена ----------
    const setCat = (c) => {
      st.category = c;
      $$('[data-cat]').forEach((b) => { const on = b.dataset.cat === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      $('#cond-field').classList.toggle('hidden', !CONDITION_CATS.has(c));
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
    const body = () => ({
      title: form.title.value.trim(), category: st.category, condition: CONDITION_CATS.has(st.category) ? st.condition : '',
      price: st.negotiable ? '' : priceDigits(), priceUnit: st.priceUnit, city: form.city.value.trim(),
      delivery: form.delivery.checked, description: form.description.value.trim(),
      photos: st.photos.filter((p) => p.file).map((p) => p.file)
    });
    const CHECK = [
      ['s-photos', 'Фото', (b) => b.photos.length > 0, false],
      ['s-what', 'Название', (b) => b.title.length >= 3, true],
      ['s-what', 'Категория', (b) => !!b.category, true],
      ['s-price', 'Цена', (b) => !!b.price || st.negotiable, false],
      ['s-where', 'Город', (b) => b.city.length >= 2, true],
      ['s-desc', 'Описание', (b) => b.description.length >= 20, false]
    ];
    const ERR = { 's-what': (b) => (b.title.length < 3 ? 'Напишите название — хотя бы пару слов.' : !b.category ? 'Выберите категорию.' : ''), 's-where': (b) => (b.city.length < 2 ? 'Укажите город.' : '') };
    let saveTimer = null;
    function changed() {
      const b = body();
      $('#title-count').textContent = `${form.title.value.length}/80`;
      $('#desc-count').textContent = `${form.description.value.length}/4000`;
      const done = CHECK.filter((c) => c[2](b)).length;
      const pct = Math.round((done / CHECK.length) * 100);
      const missing = CHECK.filter((c) => c[3] && !c[2](b)).map((c) => c[1].toLowerCase());
      const soft = CHECK.filter((c) => !c[3] && !c[2](b)).map((c) => c[1].toLowerCase());
      $('#ready-n').textContent = `Заполнено на ${pct}%`;
      $('#ready-t').textContent = missing.length ? `осталось: ${missing.join(', ')}` : soft.length ? 'можно отправлять' : 'всё готово';
      $('#ready-bar').style.width = `${pct}%`;
      $('#dock-n').textContent = missing.length ? `Осталось: ${missing.join(', ')}` : 'Можно отправлять';
      $('#dock-t').textContent = missing.length ? `заполнено на ${pct}%` : soft.length ? `советуем добавить: ${soft.join(', ')}` : 'модератор проверит за несколько часов';
      $('#check').innerHTML = String(html`${CHECK.map(([sid, t, ok, req]) => html`<li class="${ok(b) ? 'ok' : ''}"><a href="#${sid}" data-goto="${sid}">${ic(ok(b) ? 'check' : 'plus', 15, 2.4)}${t}${req ? '*' : ''}</a></li>`)}`);
      $$('[data-goto]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); $(`#${a.dataset.goto}`).scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
      const first = st.photos.find((p) => p.url && !p.loading);
      $('#preview').innerHTML = String(card({ id: 0, title: b.title || 'Название объявления', price: b.price ? Number(b.price) : null, priceUnit: b.priceUnit, city: b.city || 'Город', createdAt: Date.now(), photo: first ? first.url : null, delivery: b.delivery }));
      if (st.tried) for (const sid of Object.keys(ERR)) showErr(sid, ERR[sid](b));
      const has = b.title || b.photos.length || b.description || b.price;
      if (!l && !has) draftDrop();
      if (!l && has) { clearTimeout(saveTimer); saveTimer = setTimeout(() => draftSave({ ...b, price: b.price, negotiable: st.negotiable, photos: st.photos.filter((p) => p.file).map((p) => ({ file: p.file, url: p.url })) }), 400); }
    }
    const showErr = (sid, msg) => { const s = $(`#${sid}`); s.classList.toggle('bad', !!msg); const e = $('.ed-err', s); e.hidden = !msg; e.innerHTML = msg ? String(html`${ic('warn', 16, 2)}${msg}`) : ''; };
    form.title.oninput = () => { changed(); fetchHintSoon(); };
    form.city.oninput = changed;
    form.description.oninput = changed;
    form.delivery.onchange = changed;
    const dd = $('#draft-drop');
    if (dd) dd.onclick = () => { draftDrop(); render(); };

    // ---------- отправка ----------
    let sending = false;
    const submit = async () => {
      if (sending) return;
      if (st.busy) { toast('Подождите, фото ещё загружаются', true); return; }
      st.tried = true;
      const b = body();
      const bad = Object.keys(ERR).find((sid) => ERR[sid](b));
      changed();
      if (bad) {
        $(`#${bad}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
        const f = bad === 's-what' && b.title.length < 3 ? form.title : bad === 's-where' ? form.city : null;
        if (f) setTimeout(() => f.focus({ preventScroll: true }), 350);
        return;
      }
      sending = true;
      $$('[data-submit]').forEach((x) => { x.disabled = true; });
      try {
        const r = l ? await api('PATCH', `/api/listings/${l.id}`, b) : await api('POST', '/api/listings', b);
        if (!l) draftDrop();
        toast('Отправлено на проверку модератору');
        go(`/l/${l ? l.id : r.id}`, true);
      } catch (ex) {
        toast(ex.message, true);
        sending = false;
        $$('[data-submit]').forEach((x) => { x.disabled = false; });
      }
    };
    form.onsubmit = (e) => { e.preventDefault(); submit(); };
    $$('[data-submit]').forEach((x) => { x.onclick = submit; });

    cleanup = () => { document.body.classList.remove('editing'); clearTimeout(saveTimer); };
    setCat(st.category); setCond(st.condition); setUnit(st.priceUnit); setNeg(st.negotiable);
    renderPhotos();
    changed();
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
    const what = { messages: 'о новых сообщениях', moderation: 'о решениях модерации', reviews: 'об отзывах', all: 'с уведомлениями' }[q.get('k')] || 'с уведомлениями';
    authPage('Отписаться?', `Больше не будем присылать письма ${what}. Включить их снова можно в профиле, в разделе «Настройки».`,
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
  function mountChat(box, { head, below = '', load, send, scam = false, empty, placeholder = 'Сообщение…', onActivity, back = '/messages' }) {
    box.innerHTML = String(html`
      <div class="chat-head">
        <a href="${back}" class="icon-btn chat-back" aria-label="Назад">${ic('left', 20)}</a>
        ${head}
      </div>
      ${below}
      ${scam ? html`<div class="banner warn chat-warn hidden" data-scam>${ic('warn', 18)} <strong>Осторожно.</strong> Похоже, собеседник предлагает уйти в мессенджер или заплатить вне Торганы. Так действуют мошенники — не переводите деньги и не называйте коды из СМС.</div>` : ''}
      <div class="chat-msgs" data-msgs></div>
      <form class="chat-form" data-send>
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
        out += String(html`<div class="msg ${m.mine ? 'out' : 'in'} ${m.photo ? 'has-photo' : ''}">${m.photo ? html`<a class="msg-photo" href="${m.photo}" target="_blank" rel="noopener"><img src="${m.photo}" alt="Фото" loading="lazy"></a>` : ''}${m.body}<span class="t">${hm(m.createdAt)}</span></div>`);
        if (scam && !m.mine && m.body && SCAM_RE.test(m.body)) $('[data-scam]', box).classList.remove('hidden');
        lastId = Math.max(lastId, m.id);
      }
      msgs.insertAdjacentHTML('beforeend', out);
      if (nearBottom || list.some((m) => m.mine)) msgs.scrollTop = msgs.scrollHeight;
    };
    const poll = async () => { const r = await load(lastId); if (r.messages.length) { append(r.messages); if (onActivity) onActivity(); } return r; };
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
      msgs.scrollTop = msgs.scrollHeight;
      if (onActivity) onActivity();
    })().catch((e) => toast(e.message, true));
    if (window.matchMedia('(min-width: 901px)').matches) $('.chat-back', box).classList.add('hidden');
    ta.focus();
    return () => clearInterval(timer);
  }

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
      scam: true,
      empty: html`<div class="chat-day">Напишите первое сообщение — например, уточните состояние или договоритесь о встрече.</div>`,
      onActivity: () => refreshMe()
    });
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
  const MY_STATUS = { active: 'Активные', pending: 'На проверке', rejected: 'На исправлении', sold: 'Проданные', archived: 'Сняты' };
  const MY_TAG = { active: ['ok', 'Опубликовано'], pending: ['wait', 'На проверке'], rejected: ['bad', 'Нужно исправить'], sold: ['dark', 'Продано'], archived: ['off', 'Снято'] };

  // Карточка человека слева в профиле — своя и публичная: фото, имя, город, дата, цифры.
  function idCard(u, { own = false, stats = [], badges = '', extra = '', foot = '', ratingHref = '' }) {
    return html`<div class="pf-card">
      <div class="pf-who">
        <div class="pf-ava">${ava(u, own ? 'lg' : 'xl')}${own ? html`<button class="pf-cam" type="button" data-ava-pick aria-label="${u.avatar ? 'Сменить фото профиля' : 'Добавить фото профиля'}">${ic('camera', 15, 2)}</button>` : ''}</div>
        <div class="pf-who-txt">
          ${own ? html`<div class="pf-name">${u.name}</div>` : html`<h1 class="pf-name">${u.name}</h1>`}
          <div class="pf-sub">${u.city ? `${u.city} · ` : ''}на Торгане с ${since(u.createdAt)}</div>
          ${u.rating ? ratingLine(u.rating, ratingHref) : ''}
          ${badges ? html`<div class="pf-badges">${badges}</div>` : ''}
        </div>
      </div>
      ${stats.length ? html`<div class="pf-nums">${stats.map(([n, k]) => html`<div class="pf-num"><b>${NF.format(n)}</b><span>${k}</span></div>`)}</div>` : ''}
      ${extra}
      ${foot}
    </div>`;
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
  const navLink = (href, icon, label, on, right = '') => html`<a href="${href}" class="${on ? 'on' : ''}"${on ? raw(' aria-current="page"') : ''}>${ic(icon, 20)}<span class="lbl">${label}</span>${right}</a>`;
  function profileNav(full = false) {
    const active = navKey();
    const u = S.user;
    const item = (href, icon, label, key = href, right = '') => navLink(href, icon, label, active === key, right);
    const head = (t) => html`<div class="pf-nav-h">${t}</div>`;
    const help = HELP_LINKS.map(([href, icon]) => item(href, icon, FOOTER_LABEL[href]));
    if (!u) {
      return html`<nav class="pf-nav full" aria-label="Меню">
        ${item('/new', 'plus', 'Разместить объявление', 'new')}
        ${item('/page/support', 'headset', 'Поддержка')}
        ${head('Помощь')}${help}
      </nav>`;
    }
    const set = (id, icon, label) => item(`/profile/settings#${id}`, icon, label, '');
    return html`<nav class="pf-nav ${full ? 'full' : ''}" aria-label="${full ? 'Меню' : 'Разделы профиля'}">
      ${item('/profile', 'tag', 'Мои объявления', 'listings')}
      ${item('/profile/reviews', 'star', 'Отзывы', 'reviews', u.rating && u.rating.count ? html`<span class="nav-rating">${starSvg(true, 14)}${fmtAvg(u.rating)}</span>` : '')}
      ${item('/profile/searches', 'bell', 'Поиски', 'searches', freshBadge())}
      ${item('/favorites', 'heart', 'Избранное', 'fav')}
      ${item('/messages', 'chat', 'Сообщения', 'msg', html`<span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span>`)}
      ${item('/profile/business', 'store', 'Для бизнеса', 'business', u.plan ? html`<span class="nav-plan">${u.plan.id === 'pro' ? 'Про' : 'Магазин'}</span>` : '')}
      ${full ? '' : item('/profile/settings', 'gear', 'Настройки', 'settings')}
      ${item('/messages/support', 'headset', 'Поддержка', 'support')}
      ${u.isAdmin ? item('/admin', 'shield', 'Модерация', 'admin') : ''}
      ${full ? html`${head('Настройки профиля')}
        ${set('s-photo', 'camera', 'Фото профиля')}
        ${set('sf', 'user', 'Имя, город и телефон')}
        ${set('sn', 'bell', 'Уведомления')}
        ${set('s-biz', 'shield', 'Для бизнеса')}
        ${set('sp', 'lock', 'Пароль')}
        ${set('s-acc', 'gear', 'Аккаунт')}
        ${head('Публичный профиль')}
        ${item(`/u/${u.id}`, 'eye', 'Как меня видят покупатели')}
        <button type="button" data-share-me>${ic('share', 20)}<span class="lbl">Поделиться профилем</span></button>
        ${head('Помощь')}${help}` : ''}
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
    const hub = !section || section === 'listings';
    const statId = section && section.startsWith('stats/') ? section.slice(6) : null;
    const bizSub = section && section.startsWith('business') ? section.split('/')[1] || '' : null;
    const sec = statId ? 'stats' : bizSub !== null ? 'business' : section || 'listings';
    const BIZ_TITLE = { '': 'Для бизнеса', shop: 'Витрина магазина', stats: 'Статистика магазина', feed: 'Автозагрузка' };
    setTitle(sec === 'business' ? BIZ_TITLE[bizSub] : { settings: 'Настройки', stats: 'Статистика', reviews: 'Отзывы', searches: 'Поиски' }[sec] || 'Профиль');
    const u = S.user;
    const { items } = await api('GET', '/api/my/listings');
    const count = (st) => items.filter((i) => i.status === st).length;
    const todo = [
      [!!u.avatar, 'Добавить фото', 'avatar'],
      [!!u.city, 'Указать город', 'city'],
      ...(S.config.mail ? [[u.emailVerified, 'Подтвердить почту', 'verify']] : [])
    ];
    const pct = Math.round(((todo.filter((t) => t[0]).length + 1) / (todo.length + 1)) * 100); // имя есть всегда
    const badges = html`${trustBadges(u.badges)}${S.config.mail ? (u.emailVerified
      ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Почта подтверждена</span>`
      : html`<span class="pf-badge warn">${ic('warn', 13, 2)} Почта не подтверждена</span>`) : ''}
      ${u.isAdmin ? html`<span class="pf-badge">${ic('shield', 13, 2)} ${u.isOwner ? 'Владелец' : 'Модератор'}</span>` : ''}`;
    const progress = pct < 100 ? html`<div class="pf-progress">
        <div class="pf-progress-head"><strong>Профиль заполнен на ${pct}%</strong></div>
        <div class="pf-bar"><i style="width:${pct}%"></i></div>
        <div class="pf-todo">${todo.filter((t) => !t[0]).map((t) => html`<button type="button" class="chip" data-todo="${t[2]}">${ic('plus', 15, 2)}${t[1]}</button>`)}</div>
      </div>` : '';
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
      : sec === 'settings'
      ? html`<div class="pf-head"><h1>Настройки</h1></div>`
      : sec === 'searches'
      ? html`<div class="pf-head"><h1>Поиски</h1><a class="btn btn-soft" href="/search">${ic('search', 18, 2)}<span>Новый поиск</span></a></div>`
      : sec === 'reviews'
      ? html`<div class="pf-head"><h1>Отзывы</h1><div class="seg" role="tablist">${[['', 'Обо мне'], ['mine', 'Я оставил']].map(([v, t]) => html`<a role="tab" aria-selected="${(q.get('tab') || '') === v ? 'true' : 'false'}" class="${(q.get('tab') || '') === v ? 'on' : ''}" href="/profile/reviews${v ? `?tab=${v}` : ''}">${t}</a>`)}</div></div>`
      : html`<div class="pf-head"><h1>Мои объявления</h1><a class="btn btn-dark" href="/new" aria-label="Разместить объявление">${ic('plus', 18, 2.2)}<span>Разместить</span></a></div>`;
    app.innerHTML = String(html`<div class="wrap pf2 ${hub ? 'is-hub' : 'is-section'}">
      <aside class="pf-side">
        ${idCard(u, {
          own: true,
          badges,
          ratingHref: '/profile/reviews',
          stats: [[count('active'), plural(count('active'), 'активное', 'активных', 'активных')], [count('sold'), 'продано']],
          extra: progress
        })}
        ${attention}
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
    $('[data-ava-pick]').onclick = () => pickAvatar(again);
    $$('[data-todo]').forEach((b) => {
      b.onclick = async () => {
        const t = b.dataset.todo;
        if (t === 'avatar') pickAvatar(again);
        else if (t === 'city') go('/profile/settings#s-city');
        else verifyModal(again);
      };
    });
    if (sec === 'stats') return renderStats(statId, days);
    if (sec === 'business') return renderBusinessHub(bizSub, bizDays, again);
    if (sec === 'reviews') return renderMyReviews(q.get('tab') === 'mine' ? 'mine' : 'about', again);
    if (sec === 'searches') return renderSavedSearches(again);
    if (sec === 'settings') return renderSettings(again);
    return renderMyListings(items, q.get('status') || 'active', again);
  }

  function renderMyListings(items, status, reload) {
    const groups = { active: [], pending: [], rejected: [], sold: [], archived: [] };
    items.forEach((i) => (groups[i.status] || groups.archived).push(i));
    const list = groups[status] || [];
    const tips = [
      ['camera', 'Светлые фото', 'Снимайте при дневном свете, с разных сторон — первое фото видно в поиске.'],
      ['sparkle', 'Честная цена', 'При размещении подскажем цену по похожим объявлениям.'],
      ['chat', 'Отвечайте быстро', 'Первые часы после публикации — самые активные.']
    ];
    $('#box').innerHTML = String(html`
      ${items.length ? html`<div class="pf-status" role="tablist">${Object.keys(MY_STATUS).map((k) => html`<a class="chip ${k === status ? 'active' : ''} ${groups[k].length ? '' : 'zero'}" href="/profile?status=${k}">${MY_STATUS[k]}<span class="cnt">${groups[k].length}</span></a>`)}</div>` : ''}
      ${list.length ? html`<div class="ml-list">${list.map((i) => {
        const [tone, label] = MY_TAG[i.status] || MY_TAG.archived;
        return html`<article class="ml-card">
          <a href="/l/${i.id}" class="ml-img">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
          <div class="ml-info">
            <span class="ml-tag ${tone}"><i></i>${label}</span>
            <a href="/l/${i.id}" class="ml-title">${i.title}</a>
            <div class="ml-price">${price(i.price, i.priceUnit)}</div>
            ${i.promo ? html`<span class="ml-promo ${i.promo.status}">${ic('megaphone', 13, 2)}${i.promo.status === 'active' ? `Реклама до ${dateShort(i.promo.endsAt)}` : 'Ждёт маркировки'}</span>` : ''}
            <div class="ml-meta"><span title="Просмотры">${svg(P.eye, 15, 1.8)} ${NF.format(i.views)}</span><span title="В избранном">${svg(P.heart, 15, 1.8)} ${i.favCount}</span><span>${i.city} · ${shortWhen(i.createdAt)}</span></div>
          </div>
          <div class="ml-side">
            ${i.status === 'rejected' ? html`<a class="btn btn-dark btn-sm hide-xs" href="/edit/${i.id}">Исправить</a>` : ''}
            ${['active', 'sold', 'archived'].includes(i.status) ? html`<a class="icon-btn ml-more" href="/profile/stats/${i.id}" aria-label="Статистика объявления" title="Статистика">${ic('chart', 20, 2)}</a>` : ''}
            <button type="button" class="icon-btn ml-more" data-more="${i.id}" aria-label="Действия с объявлением">${svg(P.more, 20, 2.2)}</button>
          </div>
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
      : html`<div class="pf-empty sm"><h3>Здесь пусто</h3><p>${{ active: 'Нет опубликованных объявлений.', pending: 'Сейчас ничего не ждёт проверки.', rejected: 'Нет объявлений, которые нужно исправить.', sold: 'Отметьте объявление «Продано», и оно появится здесь.', archived: 'Снятые с публикации объявления появятся здесь.' }[status]}</p></div>`}`);
    const byId = Object.fromEntries(items.map((i) => [String(i.id), i]));
    const setStatus = async (i, st, msg) => { try { await api('PATCH', `/api/listings/${i.id}`, { status: st }); toast(msg); reload(); } catch (e) { toast(e.message, true); } };
    $$('[data-more]').forEach((b) => {
      b.onclick = () => {
        const i = byId[b.dataset.more];
        const acts = [{ icon: 'eye', label: 'Открыть объявление', href: `/l/${i.id}` }, { icon: 'edit', label: i.status === 'rejected' ? 'Исправить' : 'Изменить', href: `/edit/${i.id}` }];
        if (['active', 'sold', 'archived'].includes(i.status)) acts.splice(1, 0, { icon: 'chart', label: 'Статистика', href: `/profile/stats/${i.id}` });
        if (i.status === 'active') acts.push({ icon: 'check', label: 'Отметить «Продано»', run: () => setStatus(i, 'sold', 'Отмечено как проданное') }, { icon: 'pause', label: 'Снять с публикации', run: () => setStatus(i, 'archived', 'Снято с публикации') });
        if (i.status === 'sold' || i.status === 'archived') acts.push({ icon: 'refresh', label: 'Опубликовать снова', run: () => setStatus(i, 'active', 'Снова опубликовано') });
        if (i.status === 'rejected' && !i.appealAt && !i.appealReply) acts.push({ icon: 'chat', label: 'Подать апелляцию', run: () => appealModal(i.id, reload) });
        if (i.status === 'active' && (isBiz() || i.promo)) acts.splice(1, 0, { icon: 'trend', label: i.promo ? 'Продлить продвижение' : 'Продвигать', run: () => promoteModal(i.id, i.title) });
        if (i.status === 'active') acts.push({ icon: 'share', label: 'Поделиться', run: () => shareLink(`${location.origin}/l/${i.id}`, i.title) });
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

  // Уведомления: какие push и письма бывают (поле API, название, пояснение).
  const NOTIFY_PUSH = [['pushMessages', 'Сообщения', 'Новые сообщения в чатах и ответы поддержки'], ['pushSearches', 'Сохранённые поиски', 'Новые объявления по вашим поискам'],
    ['pushPrices', 'Снижение цены', 'Объявления из избранного стали дешевле'], ['pushModeration', 'Модерация и отзывы', 'Решения по объявлениям, новые отзывы о вас']];
  const NOTIFY_MAIL = [['notifyMessages', 'Сообщения', 'Если не прочитали в течение 5 минут, не чаще раза в 15 минут'], ['notifyDigest', 'Подборка за день', 'Новое по поискам и снижение цен — одним письмом'],
    ['notifyModeration', 'Решения модерации', 'Опубликовано, отклонено, ответ на апелляцию'], ['notifyReviews', 'Отзывы', 'Новый отзыв о вас, решения по отзывам и ответ продавца']];
  const notifySwitch = (u, k, t, sub) => html`<label class="switch"><span>${t}<small>${sub}</small></span><input type="checkbox" name="${k}" ${u[k] ? raw('checked') : ''}><span class="track"></span></label>`;

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
      <div><button type="button" class="btn btn-line btn-sm" data-biz-del>Убрать данные бизнеса</button></div>`;
    return html`${b && b.status === 'pending' ? html`<div class="banner warn">Заявка отправлена ${when(b.at)} — модератор сверит данные по ЕГРЮЛ/ЕГРИП, обычно в течение дня.</div>` : ''}
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

  function renderSettings(reload) {
    const u = S.user;
    const row = (label, value, action = '') => html`<div class="set-row"><div><span class="set-k">${label}</span><span class="set-v">${value}</span></div>${action}</div>`;
    $('#box').innerHTML = String(html`<div class="set">
      <section class="set-group" id="s-photo">
        <h2>Фото профиля</h2>
        <div class="set-ava">${ava(u, 'lg')}
          <div><p class="muted">Фото видят покупатели и продавцы — на объявлениях и в чатах. JPG, PNG или WebP, обрежем по кругу.</p>
            <div class="set-btns"><button type="button" class="btn btn-dark btn-sm" data-ava-set>${u.avatar ? 'Заменить фото' : 'Загрузить фото'}</button>
              ${u.avatar ? html`<button type="button" class="btn btn-line btn-sm" data-ava-del>Убрать</button>` : ''}</div></div>
        </div>
      </section>

      <form class="set-group" id="sf">
        <h2>Профиль</h2>
        <div class="field"><label for="s-name">Имя</label><input id="s-name" name="name" class="input" maxlength="60" value="${u.name}" required autocomplete="name"></div>
        <div class="field"><label for="s-city">Город</label><input id="s-city" name="city" class="input" list="cities" value="${u.city || ''}" placeholder="Подставим в новые объявления">
          <datalist id="cities">${S.config.cities.map((c) => html`<option value="${c}">`)}</datalist></div>
        <div class="field"><label for="s-phone">Телефон</label><input id="s-phone" name="phone" class="input" type="tel" inputmode="tel" maxlength="30" value="${u.phone || ''}" placeholder="+7" autocomplete="tel">
          <span class="help">${u.phoneVia ? `Подтверждён через ${u.phoneVia === 'vk' ? 'VK ID' : 'Яндекс ID'} · ` : ''}Другим пользователям не показывается</span></div>
        <div><button class="btn btn-dark" type="submit">Сохранить</button></div>
      </form>

      <section class="set-group set-wide" id="sn">
        <h2>Уведомления</h2>
        <div id="push-dev"></div>
        <div class="set-cols">
          <div class="set-col"><h3 class="set-h3">${ic('bell', 18, 2)}Push на телефон и компьютер</h3>
            ${NOTIFY_PUSH.map(([k, t, sub]) => notifySwitch(u, k, t, sub))}</div>
          ${S.config.mail ? html`<div class="set-col"><h3 class="set-h3">${ic('mail', 18, 2)}Письма на ${u.email}</h3>
            ${NOTIFY_MAIL.map(([k, t, sub]) => notifySwitch(u, k, t, sub))}</div>` : ''}
        </div>
      </section>

      <form class="set-group" id="sp" autocomplete="on">
        <h2>Пароль</h2>
        <input type="email" name="username" value="${u.email}" autocomplete="username" hidden>
        <div class="field"><label for="p-cur">Текущий пароль</label><input id="p-cur" name="current" class="input" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="p-new">Новый пароль</label><input id="p-new" name="password" class="input" type="password" minlength="8" autocomplete="new-password" required><span class="help">Минимум 8 символов. На других устройствах потребуется войти заново.</span></div>
        <div><button class="btn btn-dark" type="submit">Сменить пароль</button></div>
      </form>

      <section class="set-group" id="s-biz">
        <h2>Для бизнеса</h2>
        ${bizBlock(u.business)}
      </section>

      <section class="set-group" id="s-acc">
        <h2>Аккаунт</h2>
        ${row('Email для входа', u.email, S.config.mail ? (u.emailVerified ? html`<span class="pf-badge ok">${ic('check', 14, 2.4)} Подтверждён</span>` : html`<button type="button" class="btn btn-soft btn-sm" id="verify-again">Подтвердить</button>`) : '')}
        ${row('На Торгане', `с ${since(u.createdAt)}`)}
        ${OAUTH.filter(([k]) => (S.config.oauth && S.config.oauth[k]) || u.oauth.includes(k)).map(([k, name]) => row(`Вход через ${name}`, u.oauth.includes(k) ? 'привязан' : 'не привязан',
          u.oauth.includes(k) ? html`<button type="button" class="btn btn-line btn-sm" data-unlink="${k}">Отвязать</button>` : html`<button type="button" class="btn btn-soft btn-sm" data-link="${k}">Привязать</button>`))}
        <div class="set-row"><div><span class="set-k">Удалить аккаунт</span><span class="set-v muted">Напишите в поддержку с этого email — удалим аккаунт и данные.</span></div><a class="btn btn-soft btn-sm" href="/messages/support">Поддержка</a></div>
      </section>
    </div>`);
    // Переход из меню ≡ к группе настроек (#sp) или к полю (#s-city).
    const to = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (to) { const field = to.matches('input'); to.scrollIntoView({ block: field ? 'center' : 'start' }); if (field) to.focus(); }
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
    $$('#sn input[name]').forEach((inp) => {
      inp.onchange = async () => {
        try { const r = await api('PATCH', '/api/me', { [inp.name]: inp.checked }); S.user = r.user; toast(inp.checked ? 'Включено' : 'Выключено'); } catch (ex) { inp.checked = !inp.checked; toast(ex.message, true); }
      };
    });
    renderPushDevice($('#push-dev'));
    $$('[data-link]').forEach((b) => { b.onclick = () => oauthGo(b.dataset.link, { link: true }); });
    $$('[data-unlink]').forEach((b) => {
      b.onclick = async () => { try { await api('POST', `/api/auth/oauth/${b.dataset.unlink}/unlink`); toast('Отвязано'); await refreshMe(); reload(); } catch (e) { toast(e.message, true); } };
    });
    const q = new URLSearchParams(location.search).get('oauth');
    if (q) { toast(q === 'linked' ? 'Готово — сервис привязан' : 'Этот аккаунт сервиса уже привязан к другому пользователю', q !== 'linked'); history.replaceState({}, '', location.pathname + location.hash); }
    bindBizForm(reload);
    $('#sp').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target; const b = $('button[type=submit]', f); b.disabled = true;
      try {
        const r = await api('POST', '/api/me/password', { current: f.current.value, password: f.password.value });
        f.reset();
        toast(r.signedOut ? `Пароль изменён. Вышли на других устройствах: ${r.signedOut}` : 'Пароль изменён');
      } catch (ex) { toast(ex.message, true); }
      b.disabled = false;
    };
    const va = $('#verify-again');
    if (va) va.onclick = () => verifyModal(reload);
  }

  async function viewUser(id, q) {
    const tab = q && q.get('tab') === 'reviews' ? 'reviews' : 'ads';
    const { user: u, items } = await api('GET', `/api/users/${id}`);
    setTitle(u.name);
    const own = S.user && S.user.id === u.id;
    app.innerHTML = String(html`<div class="wrap pf2 pf-pub">
      <aside class="pf-side">
        ${idCard(u, {
          badges: html`${trustBadges(u.badges)}${S.config.mail && u.emailVerified ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Почта подтверждена</span>` : ''}`,
          ratingHref: `/u/${u.id}?tab=reviews`,
          stats: [[u.activeCount, plural(u.activeCount, 'объявление', 'объявления', 'объявлений')], [u.soldCount, 'продано']],
          extra: u.rating.count ? html`<div class="pf-rv-sum">${ratingSummary(u.rating)}</div>` : '',
          foot: html`<div class="pf-pub-actions"><button type="button" class="btn btn-soft btn-block" data-share>${ic('share', 18)}Поделиться профилем</button>${own ? html`<a class="btn btn-dark btn-block" href="/profile">Мой профиль</a>` : ''}</div>`
        })}
      </aside>
      <section class="pf-main">
        ${u.shop ? shopHero(u.shop) : ''}
        <div class="seg seg-lg" role="tablist">
          <a role="tab" aria-selected="${tab === 'ads' ? 'true' : 'false'}" class="${tab === 'ads' ? 'on' : ''}" href="/u/${u.id}">Объявления <span class="n">${u.activeCount}</span></a>
          <a role="tab" aria-selected="${tab === 'reviews' ? 'true' : 'false'}" class="${tab === 'reviews' ? 'on' : ''}" href="/u/${u.id}?tab=reviews">${starSvg(true, 15)}Отзывы <span class="n">${u.rating.count}</span></a>
        </div>
        <div id="box">${tab === 'ads' ? (items.length ? grid(items) : html`<div class="pf-empty sm"><h3>Активных объявлений нет</h3><p>Загляните позже.</p></div>`) : html`<div class="loader"></div>`}</div>
      </section>
    </div>`);
    $('[data-share]').onclick = () => shareLink(`${location.origin}/u/${u.id}`, `${u.name} на Торгане`);
    if (tab !== 'reviews') return;
    let starsFilter = 0; let offset = 0; let acc = [];
    const load = async (reset) => {
      if (reset) { offset = 0; acc = []; }
      const d = await api('GET', `/api/users/${u.id}/reviews?stars=${starsFilter}&offset=${offset}`);
      acc = acc.concat(d.items); offset += d.items.length;
      $('#box').innerHTML = String(html`<div class="rv">
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
      const back = p.kind === 'promo' ? `/l/${p.item.listingId}` : '/business';
      const state = p.status === 'succeeded' ? ['ok', 'check', 'Оплата прошла', p.kind === 'plan' ? `Тариф «${PLAN_NAME[p.item.plan]}» подключён. Чек ЮKassa пришлёт на почту.` : 'Продвижение оплачено. Чек ЮKassa пришлёт на почту.']
        : p.status === 'canceled' ? ['bad', 'close', 'Оплата не прошла', `${CANCEL_REASON[p.error] || 'Банк или ЮKassa отклонили платёж'}. Деньги не списаны.`]
          : ['wait', 'clock', 'Проверяем оплату', 'Если вы уже оплатили, страница обновится сама через несколько секунд.'];
      box.innerHTML = String(html`<div class="pay-ic ${state[0]}">${ic(state[1], 34, 2.2)}</div>
        <h1>${state[2]}</h1><p class="muted">${state[3]}</p>
        <div class="pay-sum">${[['Услуга', p.title], ['Сумма', rub(p.amount)], ...(p.method ? [['Способ', p.method]] : []), ...(p.test ? [['Режим', 'тестовый платёж ЮKassa']] : [])].map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>
        <div class="pay-act">${p.status === 'succeeded' ? html`${p.kind === 'plan' ? html`<a class="btn btn-accent" href="/profile/business/shop">Заполнить витрину</a>` : html`<a class="btn btn-accent" href="${back}">К объявлению</a>`}<a class="btn btn-soft" href="/profile/business">Для бизнеса</a>`
    : p.status === 'canceled' ? html`<a class="btn btn-dark" href="${back}">Попробовать ещё раз</a><a class="btn btn-soft" href="/messages/support">Поддержка</a>`
      : html`${url ? html`<a class="btn btn-dark" href="${url}" data-ext>Вернуться к оплате</a>` : ''}<a class="btn btn-soft" href="/profile/business">Для бизнеса</a>`}</div>`);
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
  const STATUS_LABEL = { pending: 'На проверке', active: 'Опубликовано', rejected: 'Отклонено', sold: 'Продано', archived: 'Снято' };

  // ---------- оболочка модерации: меню слева (на телефоне — лента сверху) ----------
  const ADMIN_NAV = [
    ['', [['dash', 'chart', 'Сводка']]],
    ['Проверка', [['pending', 'inbox', 'На проверке', 'pending'], ['reports', 'flag', 'Жалобы', 'reports'], ['appeals', 'reply', 'Апелляции', 'appeals'], ['reviews', 'star', 'Отзывы', 'reviews'], ['support', 'headset', 'Поддержка', 'support'], ['biz', 'shield', 'Бизнес', 'biz']]],
    ['Объявления', [['active', 'tag', 'Опубликованные'], ['rejected', 'close', 'Отклонённые'], ['sold', 'check', 'Проданные'], ['archived', 'pause', 'Снятые']]],
    ['Люди', [['users', 'users', 'Пользователи'], ['log', 'list', 'Журнал действий']]],
    ['Деньги', [['payments', 'card', 'Платежи'], ['ads', 'megaphone', 'Реклама', 'ads'], ['billing', 'tag', 'Оплата и цены']]],
    ['Настройки', [['notify', 'bell', 'Мои уведомления'], ['mail', 'mail', 'Почта'], ['oauth', 'lock', 'Вход через сервисы'], ['site', 'refresh', 'Версия сайта']]]
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
    const stats = await api('GET', '/api/admin/stats');
    app.innerHTML = String(adminShell(status, stats, html`<div id="adm-box" class="adm-box"><div class="loader"></div></div>`));
    const box = $('#adm-box');
    const extraUrl = { mail: '/api/admin/mail', site: '/api/admin/update' }[status];
    const extra = extraUrl ? await api('GET', extraUrl) : null;
    const head = (h1, right = '') => html`<div class="adm-head"><h1>${h1}</h1>${right}</div>`;
    const R = {
      dash: () => renderDashboard(box, stats),
      users: () => renderUsersAdmin(box, q),
      biz: () => renderUsersAdmin(box, new URLSearchParams({ f: 'biz' }), 'Проверка бизнеса'),
      oauth: () => renderOauthAdmin(box),
      payments: () => renderPaymentsAdmin(box, q),
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
    'promo-stopped': 'Остановил продвижение', 'ads-settings': 'Изменил настройки рекламы', 'shop-cleared': 'Очистил витрину магазина'
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
          <h3 class="set-h3">${ic('trend', 18, 2)}Продвижение</h3><div class="price-row">${[3, 7, 30].map((dd) => priceIn(`promo.${dd}`, pr.promo[dd], `${dd} ${plural(dd, 'день', 'дня', 'дней')}`))}</div>
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
    const collect = (f) => { const b = { shop: {}, pro: {}, promo: {} }; for (const [k, v] of new FormData(f).entries()) { const [g, n] = k.split('.'); if (n) b[g][n] = v; else b[g] = parseInt(v, 10); } return b; };
    $('#prices', box).onsubmit = async (e) => { e.preventDefault(); try { await api('PUT', '/api/admin/billing', { prices: collect(e.target) }); await after('Цены сохранены'); } catch (ex) { toast(ex.message, true); } };
    $('[data-defaults]', box).onclick = async () => { try { await api('PUT', '/api/admin/billing', { prices: d.defaults }); await after('Вернули цены по умолчанию'); } catch (ex) { toast(ex.message, true); } };
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

  const FIELD = { title: 'название', description: 'описание', category: 'категория', price: 'цена', priceUnit: 'единица цены', city: 'город', condition: 'состояние', delivery: 'доставка', photos: 'фото' };
  const fieldVal = (k, v) => (k === 'category' ? catName(v) : k === 'price' ? price(v, '') : k === 'delivery' ? (v ? 'есть' : 'нет') : k === 'condition' ? CONDITION_LABEL[v] : v === '' ? '—' : String(v));
  function eventText(e) {
    const d = e.data;
    switch (e.kind) {
      case 'created': return html`Создано${d.flags ? html` · <span class="warn-t">похоже на: ${d.flags}</span>` : ''}`;
      case 'edited': return html`Изменено и отправлено на проверку${Object.keys(d.changes || {}).length ? html`<ul class="tl-changes">${Object.entries(d.changes).map(([k, [a, b]]) => html`<li><strong>${FIELD[k] || k}:</strong> ${k === 'description' ? 'текст изменён' : k === 'photos' ? `${a} → ${b}` : html`${fieldVal(k, a)} → ${fieldVal(k, b)}`}</li>`)}</ul>` : ''}`;
      case 'status': return html`Автор: ${{ active: 'снова опубликовал', sold: 'отметил «продано»', archived: 'снял с публикации' }[d.status] || d.status}`;
      case 'approved': return 'Опубликовано после проверки';
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
    const specs = [['Категория', catName(l.category)], ['Цена', price(l.price, l.priceUnit)], ['Город', l.city], ['Состояние', CONDITION_LABEL[l.condition]],
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
          <div class="mod-photos">${l.photos.length ? l.photos.map((p, i) => html`<a href="${p}" target="_blank" class="mod-photo"><img src="${p}" alt="Фото ${i + 1}" loading="lazy"><span>${i + 1}</span></a>`) : html`<div class="empty" style="padding:28px"><p style="margin:0">Без фото</p></div>`}</div>
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
  function renderMailAdmin(box, { config: c, stats: st }) {
    const SECURITY = [['ssl', 'SSL (обычно порт 465)'], ['starttls', 'STARTTLS (порт 587 или 2525)']];
    const STATUS = { pending: 'в очереди', sent: 'отправлено', failed: 'не доставлено' };
    const KIND = { verify: 'Подтверждение email', reset: 'Восстановление пароля', message: 'Новое сообщение', moderation: 'Модерация', review: 'Отзывы', support: 'Ответ поддержки', account: 'Блокировка аккаунта', mod: 'Модератору о новом', billing: 'Оплата и тарифы', code: 'Код подтверждения', test: 'Проверка' };
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
    return changed;
  }
  async function refreshMe() {
    try { if (applyMe(await api('GET', '/api/me'))) { renderHeader(); renderBottomNav(); } } catch { /* офлайн */ }
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
    await render();
    setupPullToRefresh();
    setInterval(() => { if (S.user && document.visibilityState === 'visible') refreshMe(); }, 30000);
  }

  boot();
})();

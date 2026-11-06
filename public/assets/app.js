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
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'
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
      ${isHome ? '' : html`<form class="search header-search" role="search" id="header-search">
        ${ic('search', 18)}
        <label class="sr" for="hq">Поиск по объявлениям</label>
        <input id="hq" name="q" type="search" placeholder="Поиск по всей России" value="${q}" autocomplete="off">
        <button class="btn btn-accent btn-sm" type="submit">Найти</button>
      </form>`}
      <nav class="header-nav" aria-label="Основное">
        <a href="/favorites" class="nav-link hide-m">${ic('heart', 20)}<span class="nav-text">Избранное</span></a>
        <a href="/messages" class="nav-link hide-m">${ic('chat', 20)}<span class="nav-text">Сообщения</span><span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span></a>
        <a href="/new" class="btn btn-dark btn-sm hide-m" style="margin-left:8px">Разместить</a>
        ${S.user
    ? html`<a href="/profile" class="ava-link" style="margin-left:6px" aria-label="Профиль">${ava(S.user, 'sm')}</a>`
    : html`<a href="/login" class="nav-link" style="margin-left:4px">Войти</a>`}
      </nav>
    </div>`);
    const hs = $('#header-search');
    if (hs) hs.onsubmit = (e) => { e.preventDefault(); goSearch({ q: hs.q.value.trim() }); };
  }

  function renderBottomNav() {
    const p = location.pathname;
    const on = (cond) => (cond ? 'on' : '');
    $('#bottom-nav').innerHTML = String(html`
      <a href="/" class="${on(p === '/' || p === '/search')}" aria-label="Главная">${ic('home', 23)}</a>
      <a href="/favorites" class="${on(p === '/favorites')}" aria-label="Избранное">${ic('heart', 23)}</a>
      <a href="/new" class="plus" aria-label="Разместить объявление">${ic('plus', 24, 2.2)}</a>
      <a href="/messages" class="${on(p.startsWith('/messages'))}" aria-label="Сообщения">${ic('chat', 23)}<span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span></a>
      <a href="${S.user ? '/profile' : '/login'}" class="${on(p === '/profile' || p === '/login')}" aria-label="Профиль">${ic('user', 23)}</a>`);
  }

  function renderFooter() {
    $('#footer').innerHTML = String(html`<div class="wrap">
      <div class="footer-in">
        <div class="footer-col brand">${logo()}<p class="muted" style="margin:6px 0 0;max-width:300px">Честная площадка объявлений по всей России.</p></div>
        <div class="footer-col"><b>Покупателям</b><a href="/page/safety">Безопасность</a><a href="/page/help">Как искать</a><a href="/favorites">Избранное</a></div>
        <div class="footer-col"><b>Продавцам</b><a href="/new">Разместить объявление</a><a href="/page/business">Для бизнеса</a><a href="/page/rules">Правила площадки</a></div>
        <div class="footer-col"><b>Помощь</b><a href="/page/support">Поддержка</a><a href="/page/terms">Пользовательское соглашение</a><a href="/page/privacy">Конфиденциальность</a><a href="/page/consent">Согласие на обработку данных</a></div>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} Торгана${S.config.operator ? ` · ${S.config.operator.name} · ИНН ${S.config.operator.inn} · ОГРНИП ${S.config.operator.ogrnip}` : ''}</span><a href="/page/contacts">Реквизиты и контакты</a></div>
    </div>`);
  }

  function setUnread(n) {
    S.unread = n;
    $$('[data-unread]').forEach((el) => { el.textContent = n; el.classList.toggle('hidden', !n); });
  }

  // ================= карточки =================
  function card(it) {
    const meta = [it.city, shortWhen(it.createdAt)].filter(Boolean).join(' · ');
    return html`<div class="card">
      <a href="/l/${it.id}" class="card-link">
        <div class="card-img">
          ${it.photo ? html`<img src="${it.photo}" alt="" loading="lazy">` : svg(P.image, 40, 1.2)}
          ${it.status === 'sold' ? html`<span class="tag dark sold-badge">Продано</span>` : ''}
          <span class="price-pill">${price(it.price, it.priceUnit)}</span>
        </div>
        <div class="card-body">
          <span class="card-title">${it.title}</span>
          <span class="card-meta">${meta}${it.delivery ? html` · <span class="ok">Доставка</span>` : ''}</span>
        </div>
      </a>
      <button type="button" class="fav-btn ${it.isFav ? 'on' : ''}" data-fav="${it.id}" aria-label="${it.isFav ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${it.isFav ? 'true' : 'false'}">${ic('heart', 20)}</button>
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
      const { fav } = await api('POST', `/api/favorites/${b.dataset.fav}`);
      $$(`[data-fav="${b.dataset.fav}"]`).forEach((x) => {
        x.classList.toggle('on', fav);
        x.setAttribute('aria-pressed', fav ? 'true' : 'false');
        x.setAttribute('aria-label', fav ? 'Убрать из избранного' : 'В избранное');
      });
      toast(fav ? 'Добавлено в избранное' : 'Убрано из избранного');
    } catch (err) { toast(err.message, true); }
  });

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
    [/^\/favorites$/, viewFavorites],
    [/^\/messages(?:\/(\d+|support))?$/, viewMessages],
    [/^\/profile$/, viewProfile],
    [/^\/u\/(\d+)$/, viewUser],
    [/^\/admin$/, viewAdmin],
    [/^\/admin\/l\/(\d+)$/, viewAdminListing],
    [/^\/page\/([a-z]+)$/, viewPage]
  ];

  async function render() {
    if (cleanup) { cleanup(); cleanup = null; }
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

  // ================= главная =================
  async function viewHome() {
    setTitle('');
    const hints = ['iPhone до 60 000', 'Детская коляска с доставкой', 'Аренда квартиры', 'Ремонт под ключ', 'Велосипед'];
    app.innerHTML = String(html`
      <section class="hero">
        <span class="pill-note"><span class="dot"></span>Новое: поиск обычными словами</span>
        <h1>Найдётся всё.<br><span>По всей России.</span></h1>
        <p>Бесплатно для частных лиц, честная выдача и понятная модерация.</p>
        <form class="search search-xl" role="search" id="hero-search">
          <button type="button" class="city-btn" id="city-btn">${ic('pin', 18)}<span>${S.city || 'Вся Россия'}</span></button>
          <label class="sr" for="q">Что вы ищете</label>
          <input id="q" name="q" type="search" placeholder="Например: детская коляска до 15 000 с доставкой" autocomplete="off">
          <button class="btn btn-accent" type="submit">${ic('search', 18, 2)}Найти</button>
        </form>
        <div class="hint-chips">${hints.map((h) => html`<a class="chip" href="/search?q=${encodeURIComponent(h)}">${h}</a>`)}</div>
      </section>

      <section class="wrap section">
        <div class="cats">${S.config.categories.map((c) => html`<a class="cat" href="/search?category=${c.id}"><span class="cat-ic">${catIc(c.id)}</span>${c.name}</a>`)}</div>
      </section>

      <section class="wrap section">
        <div class="section-head"><h2>Свежие объявления${S.city ? html` · ${S.city}` : ''}</h2><a href="/search${S.city ? `?city=${encodeURIComponent(S.city)}` : ''}">Смотреть все</a></div>
        <div id="feed">${skeletonGrid(8)}</div>
        <div class="more hidden" id="more"><button class="btn btn-soft btn-lg" type="button">Показать ещё</button></div>
      </section>

      <section class="wrap section">
        <div class="promo">
          <div style="flex:1 1 460px;min-width:0">
            ${S.config.ai
    ? html`<h2>Сфотографируйте вещь —<br><span>объявление готово.</span></h2><p>ИИ напишет описание, выберет категорию и подскажет цену по похожим объявлениям. Бесплатно для частных лиц.</p>`
    : html`<h2>Объявление за минуту —<br><span>бесплатно.</span></h2><p>Добавьте фото, название и цену. Подскажем, за сколько продаются похожие вещи.</p>`}
          </div>
          <a href="/new" class="btn btn-dark btn-lg">${ic('camera', 20)}${S.config.ai ? 'Разместить по фото' : 'Разместить объявление'}</a>
        </div>
      </section>

      <section class="wrap section">
        <div class="trust">
          <div><h3>Бесплатно для частных лиц</h3><p>Без лимитов и платных «поднятий».</p></div>
          <div><h3>Модерация с объяснением</h3><p>У каждого решения есть причина. Не согласны — подайте апелляцию, её рассмотрит человек.</p></div>
          <div><h3>Сделка под защитой ${S.config.payments ? '' : html`<span class="tag">Скоро</span>`}</h3><p>Деньги придут продавцу, только когда покупатель получит и проверит товар.</p></div>
        </div>
      </section>`);

    const form = $('#hero-search');
    form.onsubmit = (e) => { e.preventDefault(); goSearch({ q: form.q.value.trim() }); };
    $('#city-btn').onclick = () => cityModal(() => render());

    let offset = 0;
    const load = async () => {
      const sp = new URLSearchParams({ limit: 16, offset });
      if (S.city) sp.set('city', S.city);
      const { items, total } = await api('GET', `/api/listings?${sp}`);
      const feed = $('#feed');
      if (!feed) return;
      if (offset === 0) {
        feed.innerHTML = items.length ? String(grid(items)) : String(html`<div class="empty"><h3>${S.city ? `В городе ${S.city} пока нет объявлений` : 'Здесь появятся первые объявления'}</h3><p>Разместите своё — это бесплатно и займёт пару минут.</p><a class="btn btn-dark" href="/new">Разместить объявление</a></div>`);
      } else {
        $('.grid', feed).insertAdjacentHTML('beforeend', items.map((i) => String(card(i))).join(''));
      }
      offset += items.length;
      $('#more').classList.toggle('hidden', offset >= total);
    };
    $('#more button').onclick = () => load().catch((e) => toast(e.message, true));
    await load();
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
          <label class="sr" for="sort">Сортировка</label>
          <select id="sort" class="select" style="width:auto;min-width:200px;height:44px;border-radius:999px">
            <option value="">Сначала новые</option>
            <option value="cheap" ${params.sort === 'cheap' ? raw('selected') : ''}>Сначала дешевле</option>
            <option value="expensive" ${params.sort === 'expensive' ? raw('selected') : ''}>Сначала дороже</option>
          </select>
        </div>
        <div class="understood" id="understood"></div>
        <div id="results">${skeletonGrid(9)}</div>
        <div class="more hidden" id="more"><button class="btn btn-soft btn-lg" type="button">Показать ещё</button></div>
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

    let offset = 0;
    const load = async () => {
      const sp = new URLSearchParams({ ...params, limit: 24, offset });
      const data = await api('GET', `/api/listings?${sp}`);
      const box = $('#results');
      if (!box) return;
      if (offset === 0) {
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
        box.innerHTML = data.items.length ? String(grid(data.items)) : String(html`<div class="empty"><h3>Ничего не нашлось</h3><p>Попробуйте другие слова, уберите часть фильтров или поищите по всей России.</p><a href="/search" class="btn btn-dark">Все объявления</a></div>`);
      } else {
        $('.grid', box).insertAdjacentHTML('beforeend', data.items.map((i) => String(card(i))).join(''));
      }
      offset += data.items.length;
      $('#more').classList.toggle('hidden', offset >= data.total);
    };
    $('#more button').onclick = () => load().catch((e) => toast(e.message, true));
    await load();
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
      ['Опубликовано', when(l.createdAt)],
      ['Просмотры', NF.format(l.views)]
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
    if (l.isOwner) {
      actions = html`<div style="display:flex;flex-direction:column;gap:10px">
        <a class="btn btn-dark btn-lg btn-block" href="/edit/${l.id}">Редактировать</a>
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
              <div style="flex:1;min-width:0"><h1 class="item-title">${l.title}</h1><p class="muted" style="margin:8px 0 0;font-size:14px">${l.city} · ${when(l.createdAt)}</p></div>
              ${l.isOwner ? '' : html`<button class="icon-btn ${l.isFav ? 'on' : ''}" data-fav="${l.id}" aria-label="${l.isFav ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${l.isFav ? 'true' : 'false'}">${ic('heart', 20)}</button>`}
              <button class="icon-btn" data-share aria-label="Поделиться">${ic('share', 20)}</button>
            </div>
            <div><div class="item-price">${price(l.price, l.priceUnit)}</div>
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
            <span class="muted" style="display:block;font-size:13px">На Торгане с ${since(seller.createdAt)} · ${seller.activeCount} ${plural(seller.activeCount, 'объявление', 'объявления', 'объявлений')}</span></span>
            ${ic('right', 20)}
          </a>
          <div class="banner soft" style="font-size:14px"><strong style="color:var(--text)">Мы никогда не просим</strong> переходить в мессенджеры, называть код из СМС или платить по ссылке. Если вас об этом просят — это мошенники.</div>
        </aside>
      </div>
      ${similar.length ? html`<section class="section"><div class="section-head"><h2>Похожие объявления</h2><a href="/search?category=${l.category}">Смотреть все</a></div>${grid(similar)}</section>` : ''}
    </div>`);

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
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото. Попробуйте JPG или PNG.')); };
      img.src = url;
    });
  }

  async function viewEditor(id) {
    if (!requireAuth()) return;
    let l = null;
    if (id) {
      const data = await api('GET', `/api/listings/${id}`);
      if (!data.listing.isOwner) { viewNotFound(); return; }
      l = data.listing;
    }
    setTitle(l ? 'Редактирование' : 'Новое объявление');
    const st = {
      photos: l ? l.photos.map((u) => ({ file: u.split('/').pop(), url: u })) : [],
      category: l ? l.category : '',
      condition: l ? l.condition : '',
      busy: 0
    };
    const units = S.config.priceUnits || [''];

    app.innerHTML = String(html`<div class="wrap"><div class="editor">
      <h1>${l ? 'Редактирование' : 'Новое объявление'}</h1>
      <p class="lead">${l ? 'Изменения сразу появятся на сайте.' : 'Бесплатно для частных лиц. Хорошие фото и честное описание — половина продажи.'}</p>
      <form id="ed" novalidate>
        <div class="editor-card">
          <h2>Фото <span class="muted" style="font-weight:500;font-size:14px">до 10, первое — обложка</span></h2>
          <div class="photos" id="photos"></div>
          <input type="file" id="file" accept="image/jpeg,image/png,image/webp" multiple class="sr" tabindex="-1">
          <div id="ai-slot"></div>
        </div>
        <div class="editor-card">
          <h2>Что продаёте</h2>
          <div class="field"><label for="title">Название</label><input id="title" name="title" class="input" maxlength="80" placeholder="Например: iPhone 15 Pro, 256 ГБ" value="${l ? l.title : ''}" required><span class="help" id="title-count"></span></div>
          <div class="field"><span class="label">Категория</span><div class="cat-pick" id="cat-pick" role="radiogroup" aria-label="Категория">
            ${S.config.categories.map((c) => html`<button type="button" role="radio" data-cat="${c.id}">${c.name}</button>`)}</div></div>
          <div class="field" id="cond-field"><span class="label">Состояние</span><div class="seg" id="cond">
            <button type="button" data-cond="">Не указано</button><button type="button" data-cond="new">Новое</button><button type="button" data-cond="used">Б/у</button></div></div>
        </div>
        <div class="editor-card">
          <h2>Цена</h2>
          <div class="row stack-m">
            <div class="field" style="flex:2"><label for="price">Цена, ₽</label><input id="price" name="price" class="input" inputmode="numeric" placeholder="Оставьте пустым — «Цена договорная»" value="${l && l.price !== null ? l.price : ''}"></div>
            <div class="field" style="flex:1"><label for="unit">За что</label><select id="unit" name="priceUnit" class="select">
              ${units.map((u) => html`<option value="${u}" ${l && l.priceUnit === u ? raw('selected') : ''}>${u ? `за ${u}` : 'за всё'}</option>`)}</select></div>
          </div>
          <div class="price-hint hidden" id="price-hint"></div>
        </div>
        <div class="editor-card">
          <h2>Где и как</h2>
          <div class="field"><label for="city">Город</label><input id="city" name="city" class="input" list="cities" autocomplete="address-level2" value="${l ? l.city : (S.user.city || S.city || '')}" placeholder="Например: Казань" required>
            <datalist id="cities">${S.config.cities.map((c) => html`<option value="${c}">`)}</datalist></div>
          <label class="switch"><span><strong style="display:block;font-weight:600">Готов отправить по России</strong><span class="muted" style="font-size:14px">Покупатели из других городов увидят отметку «Доставка»</span></span>
            <input type="checkbox" name="delivery" ${l && l.delivery ? raw('checked') : ''}><span class="track"></span></label>
        </div>
        <div class="editor-card">
          <h2>Описание</h2>
          <div class="field"><label for="desc" class="sr">Описание</label><textarea id="desc" name="description" class="textarea" maxlength="4000" placeholder="Состояние, комплектация, причина продажи, особенности. Честное описание экономит время и вам, и покупателю.">${l ? l.description : ''}</textarea></div>
        </div>
        <div class="form-error hidden" id="err" role="alert"></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn-dark btn-lg" type="submit" id="submit">${l ? 'Сохранить изменения' : 'Опубликовать'}</button>
          <a class="btn btn-soft btn-lg" href="${l ? `/l/${l.id}` : '/'}">Отмена</a>
        </div>
        <p class="muted" style="margin:0;font-size:13px">Публикуя объявление, вы соглашаетесь с <a href="/page/rules" style="text-decoration:underline">правилами площадки</a>.</p>
      </form>
    </div></div>`);

    const form = $('#ed');
    const photosBox = $('#photos');
    const fileInput = $('#file');

    const renderPhotos = () => {
      photosBox.innerHTML = String(html`${st.photos.map((p, i) => html`<div class="photo ${p.loading ? 'loading' : ''}">
          ${p.url ? html`<img src="${p.url}" alt="Фото ${i + 1}">` : ''}
          ${p.loading ? '' : html`<button type="button" class="rm" data-rm="${i}" aria-label="Удалить фото">${ic('close', 16, 2)}</button>`}
          ${i === 0 && !p.loading ? html`<span class="tag dark cover">Обложка</span>` : ''}
          ${i > 0 && !p.loading ? html`<button type="button" class="make-cover" data-cover="${i}">Сделать обложкой</button>` : ''}
        </div>`)}
        ${st.photos.length < 10 ? html`<button type="button" class="drop" id="drop">${ic('camera', 26, 1.6)}<span>Добавить фото</span><span class="muted" style="font-weight:500">или перетащите сюда</span></button>` : ''}`);
      const drop = $('#drop');
      if (drop) {
        drop.onclick = () => fileInput.click();
        drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
        drop.ondragleave = () => drop.classList.remove('over');
        drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); };
      }
      $$('[data-rm]', photosBox).forEach((b) => { b.onclick = () => { st.photos.splice(Number(b.dataset.rm), 1); renderPhotos(); }; });
      $$('[data-cover]', photosBox).forEach((b) => { b.onclick = () => { const [p] = st.photos.splice(Number(b.dataset.cover), 1); st.photos.unshift(p); renderPhotos(); }; });
      renderAi();
    };

    const addFiles = async (files) => {
      const imgs = files.filter((f) => /^image\//.test(f.type)).slice(0, 10 - st.photos.length);
      if (!imgs.length) return;
      const slots = imgs.map(() => { const s = { loading: true, url: '' }; st.photos.push(s); return s; });
      renderPhotos();
      st.busy += imgs.length;
      await Promise.all(imgs.map(async (f, i) => {
        const slot = slots[i];
        try {
          const data = await resizeImage(f);
          slot.url = data;
          renderPhotos();
          const r = await api('POST', '/api/uploads', { data });
          slot.file = r.file; slot.url = r.url; slot.loading = false;
        } catch (e) {
          st.photos.splice(st.photos.indexOf(slot), 1);
          toast(e.message, true);
        } finally {
          st.busy -= 1;
          renderPhotos();
        }
      }));
    };
    fileInput.onchange = () => { addFiles([...fileInput.files]); fileInput.value = ''; };

    const renderAi = () => {
      const slot = $('#ai-slot');
      if (!S.config.ai) { slot.innerHTML = ''; return; }
      const ready = st.photos.some((p) => p.file && !p.loading);
      slot.innerHTML = String(html`<div class="ai-box"><p>${ic('sparkle', 18)} ${ready ? 'Заполним название, категорию и описание по первому фото.' : 'Добавьте фото — и мы заполним объявление за вас.'}</p>
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
          updateCount();
          if (s.priceHint) showHint(s.priceHint, s.priceHintCount);
          else fetchHint();
          toast('Готово — проверьте и поправьте при необходимости');
        } catch (e) { toast(e.message, true); }
        b.disabled = false; b.textContent = 'Заполнить по фото';
      };
    };

    const setCat = (c) => {
      st.category = c;
      $$('[data-cat]').forEach((b) => { const on = b.dataset.cat === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      $('#cond-field').classList.toggle('hidden', !CONDITION_CATS.has(c));
      fetchHint();
    };
    const setCond = (c) => { st.condition = c; $$('[data-cond]').forEach((b) => b.classList.toggle('on', b.dataset.cond === c)); };
    $$('[data-cat]').forEach((b) => { b.onclick = () => setCat(b.dataset.cat); });
    $$('[data-cond]').forEach((b) => { b.onclick = () => setCond(b.dataset.cond); });
    setCat(st.category); setCond(st.condition);

    const updateCount = () => { $('#title-count').textContent = `${form.title.value.length} / 80`; };
    form.title.oninput = () => { updateCount(); fetchHintSoon(); };
    form.priceUnit.onchange = () => fetchHint();
    updateCount();

    const showHint = (n, count) => {
      const el = $('#price-hint');
      el.innerHTML = String(html`<span class="dot"></span>Похожие продаются примерно за <strong style="color:var(--text)">${NF.format(n)} ₽</strong>${count ? html` · ${count} ${plural(count, 'объявление', 'объявления', 'объявлений')}` : ''}`);
      el.classList.remove('hidden');
    };
    let hintTimer = null;
    const fetchHintSoon = () => { clearTimeout(hintTimer); hintTimer = setTimeout(fetchHint, 600); };
    async function fetchHint() {
      const t = form.title.value.trim();
      if (!st.category || t.length < 3) { $('#price-hint').classList.add('hidden'); return; }
      try {
        const r = await api('GET', `/api/price-hint?${new URLSearchParams({ category: st.category, title: t, unit: form.priceUnit.value })}`);
        if (r.hint) showHint(r.hint, r.count); else $('#price-hint').classList.add('hidden');
      } catch { /* необязательно */ }
    }

    form.price.oninput = () => { form.price.value = form.price.value.replace(/[^\d]/g, '').slice(0, 11); };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#err');
      err.classList.add('hidden');
      if (st.busy) { err.textContent = 'Подождите, фото ещё загружаются.'; err.classList.remove('hidden'); return; }
      const body = {
        title: form.title.value.trim(),
        category: st.category,
        condition: CONDITION_CATS.has(st.category) ? st.condition : '',
        price: form.price.value.trim(),
        priceUnit: form.priceUnit.value,
        city: form.city.value.trim(),
        delivery: form.delivery.checked,
        description: form.description.value.trim(),
        photos: st.photos.filter((p) => p.file).map((p) => p.file)
      };
      const problem = body.title.length < 3 ? 'Добавьте название — хотя бы пару слов.'
        : !body.category ? 'Выберите категорию.'
          : body.city.length < 2 ? 'Укажите город.' : '';
      if (problem) { err.textContent = problem; err.classList.remove('hidden'); err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      const btn = $('#submit');
      btn.disabled = true;
      try {
        const r = l ? await api('PATCH', `/api/listings/${l.id}`, body) : await api('POST', '/api/listings', body);
        toast(r.status === 'pending' ? 'Отправлено на проверку модератору' : l ? 'Изменения сохранены' : 'Объявление опубликовано');
        go(`/l/${l ? l.id : r.id}`, true);
      } catch (ex) {
        err.textContent = ex.message; err.classList.remove('hidden');
        btn.disabled = false;
      }
    };

    renderPhotos();
    if (l) fetchHint();
  }

  // ================= вход и регистрация =================
  async function viewLogin(_, q) {
    if (S.user) { go(q.get('next') || '/', true); return; }
    setTitle('Вход');
    app.innerHTML = String(html`<div class="wrap"><div class="auth">
      <h1>Вход</h1><p class="sub">Рады видеть вас снова.</p>
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
  }

  async function viewRegister(_, q) {
    if (S.user) { go(q.get('next') || '/', true); return; }
    setTitle('Регистрация');
    app.innerHTML = String(html`<div class="wrap"><div class="auth">
      <h1>Регистрация</h1><p class="sub">Размещайте объявления бесплатно и пишите продавцам.</p>
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
  }

  // Отправка формы #f. По умолчанию — вход: запоминаем пользователя и уходим на next.
  // extra — поля сверх формы (объект или функция, вызываемая при отправке);
  // check(body) может вернуть текст ошибки до отправки; done(r) — свой обработчик ответа.
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
    const what = { messages: 'о новых сообщениях', moderation: 'о решениях модерации', all: 'с уведомлениями' }[q.get('k')] || 'с уведомлениями';
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
  function mountChat(box, { head, load, send, scam = false, empty, placeholder = 'Напишите сообщение…', onActivity, back = '/messages' }) {
    box.innerHTML = String(html`
      <div class="chat-head">
        <a href="${back}" class="icon-btn chat-back" aria-label="Назад">${ic('left', 20)}</a>
        ${head}
      </div>
      ${scam ? html`<div class="banner warn chat-warn hidden" data-scam>${ic('warn', 18)} <strong>Осторожно.</strong> Похоже, собеседник предлагает уйти в мессенджер или заплатить вне Торганы. Так действуют мошенники — не переводите деньги и не называйте коды из СМС.</div>` : ''}
      <div class="chat-msgs" data-msgs></div>
      <form class="chat-form" data-send>
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
        out += String(html`<div class="msg ${m.mine ? 'out' : 'in'}">${m.body}<span class="t">${hm(m.createdAt)}</span></div>`);
        if (scam && !m.mine && SCAM_RE.test(m.body)) $('[data-scam]', box).classList.remove('hidden');
        lastId = Math.max(lastId, m.id);
      }
      msgs.insertAdjacentHTML('beforeend', out);
      if (nearBottom || list.some((m) => m.mine)) msgs.scrollTop = msgs.scrollHeight;
    };
    const poll = async () => { const r = await load(lastId); if (r.messages.length) { append(r.messages); if (onActivity) onActivity(); } return r; };
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`; };
    ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) return;
      ta.value = ''; ta.style.height = 'auto';
      try { append([await send(body)]); if (onActivity) onActivity(); } catch (ex) { ta.value = body; toast(ex.message, true); }
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
        <a href="/messages/support" class="conv support ${isSupport ? 'on' : ''}" id="support-row">
          ${supportAva()}
          <span class="conv-body"><span class="conv-top"><span class="support-name">${SUPPORT_NAME}</span><span class="pin" title="Закреплено">${ic('pin', 14)}</span></span>
            <span class="conv-last" style="display:block" id="support-last">Поможем с объявлениями, сделками и аккаунтом</span></span>
          <span class="badge hidden" id="support-badge"></span>
        </a>
        <div id="convs"><div class="loader"></div></div></div>
      <section class="chat" id="chat">${cid ? html`<div class="loader" style="flex:1"></div>` : html`<div class="chat-empty"><div>${svg(P.chat, 40, 1.4)}<p>Выберите диалог слева.<br>Чтобы написать продавцу, откройте объявление.</p></div></div>`}</section>
    </div></div>`);

    const loadList = async () => {
      const [{ items }, sup] = await Promise.all([api('GET', '/api/conversations'), isSupport ? null : api('GET', '/api/support')]);
      const box = $('#convs');
      if (!box) return;
      if (sup) {
        const last = sup.messages[sup.messages.length - 1];
        if (last) $('#support-last').textContent = `${last.mine ? 'Вы: ' : ''}${last.body}`;
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
        send: async (body) => (await api('POST', '/api/support/messages', { body })).message,
        empty: supportWelcome(),
        placeholder: 'Опишите вопрос…',
        onActivity: () => refreshMe()
      });
      return;
    }
    const data = await api('GET', `/api/conversations/${convId}`);
    const { listing: l, other } = data;
    stopChat = mountChat($('#chat'), {
      head: html`<a href="/l/${l.id}" class="conv-img" aria-hidden="true" tabindex="-1">${l.photo ? html`<img src="${l.photo}" alt="">` : svg(P.image, 20, 1.4)}</a>
        <div style="flex:1;min-width:0"><a href="/l/${l.id}" style="display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.title}</a>
          <span class="muted" style="font-size:14px">${price(l.price, l.priceUnit)} · ${other.name}</span></div>
        ${l.status === 'sold' ? html`<span class="tag dark">Продано</span>` : ''}`,
      load: (after) => api('GET', `/api/conversations/${convId}?after=${after}`),
      send: async (body) => { const r = await api('POST', `/api/conversations/${convId}/messages`, { body }); loadList().catch(() => {}); return r.message; },
      scam: true,
      empty: html`<div class="chat-day">Напишите первое сообщение — например, уточните состояние или договоритесь о встрече.</div>`,
      onActivity: () => refreshMe()
    });
  }

  // ================= профиль =================
  const MY_STATUS = { active: 'Активные', pending: 'На проверке', rejected: 'На исправлении', sold: 'Проданные', archived: 'Сняты' };
  const MY_TAG = { active: ['ok', 'Опубликовано'], pending: ['wait', 'На проверке'], rejected: ['bad', 'Нужно исправить'], sold: ['dark', 'Продано'], archived: ['off', 'Снято'] };

  // Шапка профиля — своя и публичная: фото, имя, город, дата, цифры. own — с кнопкой смены фото.
  function profileHero(u, { own = false, stats = [], meta = '', badges = '', actions = '', extra = '' }) {
    return html`<section class="pf-hero">
      <div class="pf-top">
        <div class="pf-ava">${ava(u, 'xl')}${own ? html`<button class="pf-cam" type="button" data-ava-pick aria-label="${u.avatar ? 'Сменить фото профиля' : 'Добавить фото профиля'}">${ic('camera', 18)}</button>` : ''}</div>
        <div class="pf-id">
          <h1>${u.name}</h1>
          <div class="pf-meta">${meta}</div>
          ${badges ? html`<div class="pf-badges">${badges}</div>` : ''}
        </div>
        ${actions ? html`<div class="pf-actions">${actions}</div>` : ''}
      </div>
      ${stats.length ? html`<div class="pf-stats">${stats.map(([n, k]) => html`<div class="pf-stat"><b>${NF.format(n)}</b><span>${k}</span></div>`)}</div>` : ''}
      ${extra}
    </section>`;
  }

  // Загрузка фото профиля: квадрат 512×512 → /api/uploads → PATCH /api/me.
  function pickAvatar(done) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
    inp.onchange = async () => {
      const file = inp.files[0];
      if (!file) return;
      toast('Загружаем фото…');
      try {
        const data = await resizeImage(file, 512, true);
        const up = await api('POST', '/api/uploads', { data });
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

  async function viewProfile(_, q) {
    if (!requireAuth()) return;
    setTitle('Профиль');
    const tab = q.get('tab') || 'listings';
    const u = S.user;
    const { items } = await api('GET', '/api/my/listings');
    const count = (st) => items.filter((i) => i.status === st).length;
    const sum = (k) => items.reduce((n, i) => n + (i[k] || 0), 0);
    const todo = [
      [!!u.avatar, 'Добавить фото', 'avatar'],
      [!!u.city, 'Указать город', 'city'],
      ...(S.config.mail ? [[u.emailVerified, 'Подтвердить почту', 'verify']] : [])
    ];
    const done = todo.filter((t) => t[0]).length;
    const pct = Math.round(((done + 1) / (todo.length + 1)) * 100); // имя есть всегда
    const badges = html`${S.config.mail ? (u.emailVerified
      ? html`<span class="pf-badge ok">${ic('check', 14, 2.4)} Почта подтверждена</span>`
      : html`<span class="pf-badge warn">${ic('warn', 14, 2)} Почта не подтверждена</span>`) : ''}
      ${u.isAdmin ? html`<span class="pf-badge">${ic('shield', 14, 2)} ${u.isOwner ? 'Владелец' : 'Модератор'}</span>` : ''}`;
    const extra = pct < 100 ? html`<div class="pf-progress">
        <div class="pf-progress-head"><strong>Профиль заполнен на ${pct}%</strong><span class="muted">Покупатели больше доверяют заполненным профилям</span></div>
        <div class="pf-bar"><i style="width:${pct}%"></i></div>
        <div class="pf-todo">${todo.filter((t) => !t[0]).map((t) => html`<button type="button" class="chip" data-todo="${t[2]}">${ic('plus', 16, 2)}${t[1]}</button>`)}</div>
      </div>` : '';
    app.innerHTML = String(html`<div class="wrap pf">
      ${profileHero(u, {
        own: true,
        meta: `${u.city ? `${u.city} · ` : ''}на Торгане с ${since(u.createdAt)}`,
        badges,
        stats: [[count('active'), 'активных'], [count('sold'), 'продано'], [sum('views'), 'просмотров'], [sum('favCount'), 'в избранном']],
        actions: html`<a class="btn btn-dark" href="/new">${ic('plus', 18, 2.2)}Разместить</a>
          <button type="button" class="btn btn-soft" data-share>${ic('share', 18)}<span class="hide-xs">Мой профиль</span></button>
          ${u.isAdmin ? html`<a class="btn btn-soft" href="/admin">${ic('shield', 18)}<span class="hide-xs">Модерация</span></a>` : ''}`,
        extra
      })}
      <div class="pf-tabs" role="tablist">
        <a role="tab" aria-selected="${tab !== 'settings'}" class="${tab !== 'settings' ? 'on' : ''}" href="/profile">Мои объявления<span>${items.length}</span></a>
        <a role="tab" aria-selected="${tab === 'settings'}" class="${tab === 'settings' ? 'on' : ''}" href="/profile?tab=settings">Настройки</a>
      </div>
      <div id="box"></div>
    </div>`);
    const again = () => viewProfile(_, q);
    $('[data-ava-pick]').onclick = () => pickAvatar(again);
    $('[data-share]').onclick = () => shareLink(`${location.origin}/u/${u.id}`, `${u.name} на Торгане`);
    $$('[data-todo]').forEach((b) => {
      b.onclick = async () => {
        const t = b.dataset.todo;
        if (t === 'avatar') pickAvatar(again);
        else if (t === 'city') go('/profile?tab=settings#s-city');
        else { b.disabled = true; try { await api('POST', '/api/me/verify'); toast(`Письмо отправлено на ${u.email}`); } catch (e) { toast(e.message, true); b.disabled = false; } }
      };
    });
    if (tab === 'settings') return renderSettings(again);
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
            <div class="ml-meta"><span title="Просмотры">${svg(P.eye, 15, 1.8)} ${NF.format(i.views)}</span><span title="В избранном">${svg(P.heart, 15, 1.8)} ${i.favCount}</span><span>${i.city} · ${shortWhen(i.createdAt)}</span></div>
          </div>
          <div class="ml-side">
            ${i.status === 'rejected' ? html`<a class="btn btn-dark btn-sm hide-xs" href="/edit/${i.id}">Исправить</a>` : ''}
            <button type="button" class="icon-btn ml-more" data-more="${i.id}" aria-label="Действия с объявлением">${svg(P.more, 20, 2.2)}</button>
          </div>
          ${i.status === 'pending' ? html`<div class="ml-note warn">${i.flags ? `Проверяем внимательнее: похоже на «${i.flags}». ` : ''}Модератор проверит объявление — обычно это несколько часов.</div>` : ''}
          ${i.status === 'rejected' ? html`<div class="ml-note bad"><strong>Причина:</strong> ${i.rejectReason}${i.appealAt ? ' · апелляция отправлена' : ''}${i.appealReply ? html`<br><strong>Ответ на апелляцию:</strong> ${i.appealReply}` : ''}</div>` : ''}
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
        if (i.status === 'active') acts.push({ icon: 'check', label: 'Отметить «Продано»', run: () => setStatus(i, 'sold', 'Отмечено как проданное') }, { icon: 'pause', label: 'Снять с публикации', run: () => setStatus(i, 'archived', 'Снято с публикации') });
        if (i.status === 'sold' || i.status === 'archived') acts.push({ icon: 'refresh', label: 'Опубликовать снова', run: () => setStatus(i, 'active', 'Снова опубликовано') });
        if (i.status === 'rejected' && !i.appealAt && !i.appealReply) acts.push({ icon: 'chat', label: 'Подать апелляцию', run: () => appealModal(i.id, reload) });
        if (i.status === 'active') acts.push({ icon: 'share', label: 'Поделиться', run: () => shareLink(`${location.origin}/l/${i.id}`, i.title) });
        acts.push({ icon: 'trash', label: 'Удалить', danger: true, run: async () => {
          if (!(await confirmModal('Удалить объявление?', 'Объявление и фото удалятся без возможности восстановления.', 'Удалить', true))) return;
          try { await api('DELETE', `/api/listings/${i.id}`); toast('Удалено'); reload(); } catch (e) { toast(e.message, true); }
        } });
        actionSheet(i.title, acts);
      };
    });
  }

  function renderSettings(reload) {
    const u = S.user;
    const row = (label, value, action = '') => html`<div class="set-row"><div><span class="set-k">${label}</span><span class="set-v">${value}</span></div>${action}</div>`;
    $('#box').innerHTML = String(html`<div class="set">
      <section class="set-group">
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
          <span class="help">Другим пользователям не показывается</span></div>
        <div><button class="btn btn-dark" type="submit">Сохранить</button></div>
      </form>

      ${S.config.mail ? html`<section class="set-group" id="sn">
        <h2>Письма на почту</h2>
        <label class="switch"><span>Новые сообщения в чате<small>Не чаще раза в 15 минут на диалог</small></span><input type="checkbox" name="notifyMessages" ${u.notifyMessages ? raw('checked') : ''}><span class="track"></span></label>
        <label class="switch"><span>Решения модерации<small>Опубликовано, отклонено, ответ на апелляцию</small></span><input type="checkbox" name="notifyModeration" ${u.notifyModeration ? raw('checked') : ''}><span class="track"></span></label>
      </section>` : ''}

      <form class="set-group" id="sp" autocomplete="on">
        <h2>Пароль</h2>
        <input type="email" name="username" value="${u.email}" autocomplete="username" hidden>
        <div class="field"><label for="p-cur">Текущий пароль</label><input id="p-cur" name="current" class="input" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="p-new">Новый пароль</label><input id="p-new" name="password" class="input" type="password" minlength="8" autocomplete="new-password" required><span class="help">Минимум 8 символов. На других устройствах потребуется войти заново.</span></div>
        <div><button class="btn btn-dark" type="submit">Сменить пароль</button></div>
      </form>

      <section class="set-group">
        <h2>Аккаунт</h2>
        ${row('Email для входа', u.email, S.config.mail ? (u.emailVerified ? html`<span class="pf-badge ok">${ic('check', 14, 2.4)} Подтверждён</span>` : html`<button type="button" class="btn btn-soft btn-sm" id="verify-again">Подтвердить</button>`) : '')}
        ${row('На Торгане', `с ${since(u.createdAt)}`)}
        <div class="set-row"><div><span class="set-k">Удалить аккаунт</span><span class="set-v muted">Напишите в поддержку с этого email — удалим аккаунт и данные.</span></div><a class="btn btn-soft btn-sm" href="/messages/support">Поддержка</a></div>
        <button type="button" class="btn btn-line set-logout" id="logout">Выйти из аккаунта</button>
      </section>
    </div>`);
    if (location.hash === '#s-city') { const c = $('#s-city'); c.scrollIntoView({ block: 'center' }); c.focus(); }
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
    const sn = $('#sn');
    if (sn) {
      $$('input', sn).forEach((inp) => {
        inp.onchange = async () => {
          try { const r = await api('PATCH', '/api/me', { [inp.name]: inp.checked }); S.user = r.user; toast(inp.checked ? 'Письма включены' : 'Письма отключены'); } catch (ex) { inp.checked = !inp.checked; toast(ex.message, true); }
        };
      });
    }
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
    if (va) va.onclick = async () => { va.disabled = true; try { await api('POST', '/api/me/verify'); toast(`Письмо отправлено на ${u.email}`); } catch (e) { toast(e.message, true); va.disabled = false; } };
    $('#logout').onclick = async () => {
      await api('POST', '/api/auth/logout').catch(() => {});
      S.user = null; setUnread(0);
      toast('Вы вышли из аккаунта');
      go('/', true);
    };
  }

  async function viewUser(id) {
    const { user: u, items } = await api('GET', `/api/users/${id}`);
    setTitle(u.name);
    const own = S.user && S.user.id === u.id;
    app.innerHTML = String(html`<div class="wrap pf">
      ${profileHero(u, {
        meta: `${u.city ? `${u.city} · ` : ''}на Торгане с ${since(u.createdAt)}`,
        stats: [[u.activeCount, plural(u.activeCount, 'объявление', 'объявления', 'объявлений')], [u.soldCount, 'продано']],
        actions: html`<button type="button" class="btn btn-soft" data-share>${ic('share', 18)}Поделиться</button>${own ? html`<a class="btn btn-dark" href="/profile">Мой профиль</a>` : ''}`
      })}
      <div class="section-head"><h2>Объявления</h2></div>
      ${items.length ? grid(items) : html`<div class="pf-empty sm"><h3>Активных объявлений нет</h3><p>Загляните позже.</p></div>`}
    </div>`);
    $('[data-share]').onclick = () => shareLink(location.href, `${u.name} на Торгане`);
  }

  // ================= модерация =================
  const REASONS = ['Запрещённый товар или услуга', 'Фото не соответствует описанию', 'Неверная категория', 'Признаки мошенничества', 'Контакты или ссылки в тексте и на фото', 'Повторное объявление', 'Оскорбительное содержание'];
  const REPORT_REASONS = ['Запрещённый товар или услуга', 'Мошенничество', 'Неверная цена или описание', 'Товар уже продан', 'Чужие фото или подделка', 'Оскорбления или спам', 'Нарушены мои права (правообладатель)'];

  // Одно окно «выбор причины + текст» — отклонение, отказ по апелляции, закрытие жалоб и жалоба пользователя.
  // pick: причину нужно выбрать из списка (жалоба); иначе список лишь подставляет текст.
  function reasonModal({ title, hint, url, okLabel, reasons, pick = false, minText = 5, placeholder = 'Объяснение для автора', danger = true, done = () => render() }) {
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
        try { await api('POST', url, pick ? { reason: picked, text } : { reason: text }); close(); toast('Готово'); done(); } catch (e) { toast(e.message, true); }
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
    $$('[data-reject]', root).forEach((b) => { b.onclick = () => reasonModal({ title: 'Отклонить объявление', hint: `Причину увидит автор${mailNote}. Пишите понятно и вежливо.`, url: `/api/admin/listings/${b.dataset.reject}/reject`, okLabel: 'Отклонить', reasons: REASONS, done: after }); });
    $$('[data-deny]', root).forEach((b) => { b.onclick = () => reasonModal({ title: 'Отказать по апелляции', hint: `Ответ увидит автор${mailNote}.`, url: `/api/admin/listings/${b.dataset.deny}/appeal-deny`, okLabel: 'Отказать', done: after }); });
    $$('[data-dismiss]', root).forEach((b) => { b.onclick = () => reasonModal({ title: 'Закрыть жалобы', hint: 'Объявление останется опубликованным. Комментарий видят только модераторы.', url: `/api/admin/listings/${b.dataset.dismiss}/reports/dismiss`, okLabel: 'Закрыть жалобы', minText: 0, placeholder: 'Например: проверили — нарушений нет', danger: false, done: after }); });
    $$('[data-restore]', root).forEach((b) => {
      b.onclick = async () => { try { await api('POST', `/api/admin/listings/${b.dataset.restore}/restore`); toast('Опубликовано'); after(); } catch (e) { toast(e.message, true); } };
    });
    $$('[data-block]', root).forEach((b) => {
      b.onclick = async () => {
        const blocked = !b.dataset.blocked;
        if (blocked && !(await confirmModal('Заблокировать автора?', 'Все его объявления скроются, а войти в аккаунт он не сможет.', 'Заблокировать', true))) return;
        try { await api('POST', `/api/admin/users/${b.dataset.block}/block`, { blocked }); toast(blocked ? 'Заблокирован' : 'Разблокирован'); render(); } catch (e) { toast(e.message, true); }
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

  async function viewAdmin(_, q) {
    if (!requireAuth()) return;
    if (!S.user.isAdmin) { viewNotFound(); return; }
    setTitle('Модерация');
    const status = q.get('status') || 'pending';
    const search = q.get('q') || '';
    const special = { mail: 1, support: 1, site: 1 }[status];
    const extraUrl = { mail: '/api/admin/mail', site: '/api/admin/update' }[status];
    const [stats, list, extra] = await Promise.all([
      api('GET', '/api/admin/stats'),
      special ? { items: [] } : api('GET', `/api/admin/listings?${new URLSearchParams({ status, q: search })}`),
      extraUrl ? api('GET', extraUrl) : null
    ]);
    const cnt = (n) => (n ? ` · ${n}` : '');
    const tabs = { pending: `На проверке${cnt(stats.pending)}`, reports: `Жалобы${cnt(stats.reports)}`, support: `Поддержка${cnt(stats.support)}`, appeals: `Апелляции${cnt(stats.appeals)}`,
      active: 'Опубликованные', rejected: 'Отклонённые', sold: 'Проданные', archived: 'Снятые', mail: `Почта${S.config.mail ? '' : ' · не подключена'}`, site: 'Версия сайта' };
    app.innerHTML = String(html`<div class="wrap">
      <div class="profile-head"><h1 style="flex:1">Модерация</h1></div>
      ${special ? '' : html`<div class="stats">
        <div class="stat"><div class="n">${NF.format(stats.pending)}</div><div class="k">ждут проверки</div></div>
        <div class="stat"><div class="n">${NF.format(stats.active)}</div><div class="k">опубликовано · +${stats.listingsToday} за сутки</div></div>
        <div class="stat"><div class="n">${NF.format(stats.users)}</div><div class="k">пользователей · +${stats.usersToday} за сутки</div></div>
        <div class="stat"><div class="n">${NF.format(stats.messagesToday)}</div><div class="k">сообщений за сутки</div></div>
      </div>`}
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:20px">
        <div class="tabs" style="margin:0;flex:1">${Object.entries(tabs).map(([k, v]) => html`<a class="chip ${k === status ? 'active' : ''}" href="/admin?status=${k}">${v}</a>`)}</div>
        ${special ? '' : html`<form id="as" class="search" style="width:320px;max-width:100%">${ic('search', 18)}<label class="sr" for="aq">Поиск</label><input id="aq" name="q" placeholder="Текст или email автора" value="${search}"></form>`}
      </div>
      ${special ? html`<div id="special-box"></div>` : list.items.length ? list.items.map((i) => html`<div class="my-row">
        <a href="/admin/l/${i.id}" class="my-img">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
        <div class="my-info">
          <a href="/admin/l/${i.id}" class="t" style="display:block">${i.title}</a>
          <div class="p">${price(i.price, i.priceUnit)} <span class="muted" style="font-weight:500;font-size:14px">· ${catName(i.category)} · ${i.city}</span></div>
          <div class="m">${i.user.name} (${i.user.email})${i.user.blocked ? ' · заблокирован' : ''} · ${when(i.updatedAt)}</div>
          ${i.flags ? html`<div class="banner danger" style="margin-top:8px;padding:8px 12px;font-size:14px"><strong>Похоже на запрещённое:</strong> ${i.flags}</div>` : ''}
          ${i.reports ? html`<div class="banner warn" style="margin-top:8px;padding:8px 12px;font-size:14px"><strong>Жалоб:</strong> ${i.reports}</div>` : ''}
          ${i.appealAt ? html`<div class="banner warn" style="margin-top:8px;padding:8px 12px;font-size:14px"><strong>Апелляция:</strong> ${i.appealText}</div>` : ''}
        </div>
        <div class="my-actions"><a class="btn btn-dark btn-sm" href="/admin/l/${i.id}">Проверить</a>${modButtons(i)}</div>
      </div>`) : html`<div class="empty"><h3>${status === 'pending' ? 'Очередь пуста' : 'Здесь пусто'}</h3><p>${status === 'pending' ? 'Все объявления проверены.' : 'Нет объявлений в этом разделе.'}</p></div>`}
    </div>`);
    if (status === 'mail') { renderMailAdmin($('#special-box'), extra); return; }
    if (status === 'site') { renderSiteAdmin($('#special-box'), extra.update); return; }
    if (status === 'support') { await renderSupportAdmin($('#special-box'), q.get('t')); return; }
    $('#as').onsubmit = (e) => { e.preventDefault(); go(`/admin?${new URLSearchParams({ status, q: e.target.q.value.trim() })}`); };
    bindModActions(app);
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
              <div style="min-width:0;flex:1"><a href="/u/${u.id}" target="_blank" style="font-weight:700">${u.name}</a><div class="muted" style="font-size:13px;word-break:break-all">${u.email}${u.emailVerified ? ' · подтверждён' : ' · не подтверждён'}</div></div>
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
      head: html`${ava(u)}<div style="flex:1;min-width:0"><div style="font-weight:700">${u.name}</div>
        <span class="muted" style="font-size:13px;word-break:break-all">${u.email}${u.emailVerified ? '' : ' · не подтверждён'} · с ${since(u.createdAt)} · объявлений ${u.listings}${u.rejected ? ` · отклонено ${u.rejected}` : ''}${u.blocked ? ' · заблокирован' : ''}</span></div>`,
      load: (after) => api('GET', `/api/admin/support/${id}?after=${after}`),
      send: async (body) => (await api('POST', `/api/admin/support/${id}/messages`, { body })).message,
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
      <h2 class="h2" style="margin:0 0 6px">Версия сайта</h2>
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
    const KIND = { verify: 'Подтверждение email', reset: 'Восстановление пароля', message: 'Новое сообщение', moderation: 'Модерация', test: 'Проверка' };
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
            <div class="field" style="flex:1"><label for="m-port">Порт</label><input id="m-port" name="port" class="input" inputmode="numeric" value="${c.port || ''}" placeholder="465"></div></div>
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
    $('#preset', box).onclick = () => { f.host.value = 'connect.smtp.bz'; f.port.value = '465'; f.security.value = 'ssl'; if (!f.from.value) f.from.value = 'no-reply@torgana.ru'; if (!f.fromName.value) f.fromName.value = 'Торгана'; f.user.focus(); };
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
    if (LEGAL.has(slug)) {
      const d = await api('GET', `/api/pages/${slug}`);
      setTitle(d.title);
      app.innerHTML = String(html`<div class="wrap"><article class="page"><h1>${d.title}</h1>${raw(d.html)}</article></div>`);
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
      business: ['Для бизнеса', html`
        <p>Частным лицам Торгана бесплатна. Для магазинов и компаний готовим понятные тарифы с фиксированной ценой — без аукционов ставок.</p>
        <h2>Что будет доступно</h2><ul><li>Загрузка каталога фидом в один клик.</li><li>Страница магазина с вашими товарами.</li><li>Статистика просмотров и обращений.</li></ul>
        <p>Хотите подключиться одним из первых? Напишите нам: ${contact}.</p>`],
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

  // ================= запуск =================
  async function refreshMe() {
    try {
      const r = await api('GET', '/api/me');
      const changed = (S.user && S.user.id) !== (r.user && r.user.id);
      S.user = r.user;
      setUnread(r.unread || 0);
      if (changed) { renderHeader(); renderBottomNav(); }
    } catch { /* офлайн */ }
  }

  async function boot() {
    try {
      const [config, me] = await Promise.all([api('GET', '/api/config'), api('GET', '/api/me')]);
      S.config = config;
      S.user = me.user;
      S.unread = me.unread || 0;
    } catch (e) {
      app.innerHTML = String(html`<div class="wrap"><div class="empty" style="margin-top:40px"><h3>Нет связи с сервером</h3><p>${e.message}</p><a class="btn btn-dark" href="/">Обновить</a></div></div>`);
      return;
    }
    renderFooter();
    await render();
    setInterval(() => { if (S.user && document.visibilityState === 'visible') refreshMe(); }, 30000);
  }

  boot();
})();

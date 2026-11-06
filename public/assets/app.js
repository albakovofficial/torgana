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
  const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
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
  const since = (ts) => { const d = new Date(ts); return `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`; };
  const hm = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();

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
    check: '<path d="M5 12l5 5 9-10"/>'
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
    ? html`<a href="/profile" class="avatar sm" style="margin-left:6px" aria-label="Профиль">${initial(S.user.name)}</a>`
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
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} Торгана</span><span>Бесплатно для частных лиц</span></div>
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
    [/^\/messages(?:\/(\d+))?$/, viewMessages],
    [/^\/profile$/, viewProfile],
    [/^\/u\/(\d+)$/, viewUser],
    [/^\/admin$/, viewAdmin],
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
      ownerBanner = html`<div class="banner warn"><strong>Объявление на проверке.</strong> Похоже на товар из раздела «${l.flags}» <a href="/page/rules" style="text-decoration:underline">правил</a>, поэтому его сначала посмотрит модератор. Обычно это занимает несколько часов${S.config.mail ? ' — мы напишем на почту' : ''}.</div>`;
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
            <span class="avatar">${initial(seller.name)}</span>
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
  function resizeImage(file, max = 1600) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
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

  async function viewMessages(cid) {
    if (!requireAuth()) return;
    setTitle('Сообщения');
    const convId = cid ? Number(cid) : null;
    app.innerHTML = String(html`<div class="wrap"><div class="inbox ${convId ? 'has-chat' : ''}">
      <div class="inbox-list"><h1>Сообщения</h1><div id="convs"><div class="loader"></div></div></div>
      <section class="chat" id="chat">${convId ? html`<div class="loader" style="flex:1"></div>` : html`<div class="chat-empty"><div>${svg(P.chat, 40, 1.4)}<p>Выберите диалог слева.<br>Чтобы написать продавцу, откройте объявление.</p></div></div>`}</section>
    </div></div>`);

    const loadList = async () => {
      const { items } = await api('GET', '/api/conversations');
      const box = $('#convs');
      if (!box) return;
      box.innerHTML = items.length ? String(html`${items.map((c) => html`<a href="/messages/${c.id}" class="conv ${c.id === convId ? 'on' : ''}">
          <span class="conv-img">${c.photo ? html`<img src="${c.photo}" alt="" loading="lazy">` : svg(P.image, 22, 1.4)}</span>
          <span class="conv-body">
            <span class="conv-top"><span>${c.other.name}${c.role === 'seller' ? ' · покупатель' : ''}</span><span>${shortWhen(c.updatedAt)}</span></span>
            <span class="conv-title" style="display:block">${c.title}</span>
            <span class="conv-last" style="display:block">${c.lastBody || 'Нет сообщений'}</span>
          </span>
          ${c.unread ? html`<span class="badge">${c.unread}</span>` : ''}
        </a>`)}`)
        : String(html`<div style="padding:8px 22px 22px" class="muted">Здесь появятся переписки с продавцами и покупателями.</div>`);
    };

    let lastId = 0;
    let timer = null;
    let listTimer = null;
    cleanup = () => { clearInterval(timer); clearInterval(listTimer); };

    await loadList();
    listTimer = setInterval(() => loadList().catch(() => {}), 15000);
    if (!convId) return;

    const data = await api('GET', `/api/conversations/${convId}`);
    const { listing: l, other } = data;
    $('#chat').innerHTML = String(html`
      <div class="chat-head">
        <a href="/messages" class="icon-btn" aria-label="Назад к диалогам" id="chat-back">${ic('left', 20)}</a>
        <a href="/l/${l.id}" class="conv-img" aria-hidden="true" tabindex="-1">${l.photo ? html`<img src="${l.photo}" alt="">` : svg(P.image, 20, 1.4)}</a>
        <div style="flex:1;min-width:0"><a href="/l/${l.id}" style="display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.title}</a>
          <span class="muted" style="font-size:14px">${price(l.price, l.priceUnit)} · ${other.name}</span></div>
        ${l.status === 'sold' ? html`<span class="tag dark">Продано</span>` : ''}
      </div>
      <div class="banner warn chat-warn hidden" id="scam">${ic('warn', 18)} <strong>Осторожно.</strong> Похоже, собеседник предлагает уйти в мессенджер или заплатить вне Торганы. Так действуют мошенники — не переводите деньги и не называйте коды из СМС.</div>
      <div class="chat-msgs" id="msgs"></div>
      <form class="chat-form" id="send">
        <label class="sr" for="body">Сообщение</label>
        <textarea id="body" rows="1" maxlength="2000" placeholder="Напишите сообщение…"></textarea>
        <button class="btn btn-dark" type="submit" aria-label="Отправить" style="height:48px">${ic('right', 20, 2.2)}</button>
      </form>`);
    if (window.matchMedia('(min-width: 901px)').matches) $('#chat-back').classList.add('hidden');

    const msgs = $('#msgs');
    let lastDay = '';
    const append = (list) => {
      if (!list.length) return;
      const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
      let out = '';
      for (const m of list) {
        const d = new Date(m.createdAt).toDateString();
        if (d !== lastDay) { lastDay = d; out += String(html`<div class="chat-day">${shortWhen(m.createdAt)}</div>`); }
        out += String(html`<div class="msg ${m.mine ? 'out' : 'in'}">${m.body}<span class="t">${hm(m.createdAt)}</span></div>`);
        if (!m.mine && SCAM_RE.test(m.body)) $('#scam').classList.remove('hidden');
        lastId = Math.max(lastId, m.id);
      }
      msgs.insertAdjacentHTML('beforeend', out);
      if (nearBottom || list.some((m) => m.mine)) msgs.scrollTop = msgs.scrollHeight;
    };
    if (!data.messages.length) msgs.innerHTML = String(html`<div class="chat-day" id="first-hint">Напишите первое сообщение — например, уточните состояние или договоритесь о встрече.</div>`);
    append(data.messages);
    msgs.scrollTop = msgs.scrollHeight;
    refreshMe();

    timer = setInterval(async () => {
      try {
        const r = await api('GET', `/api/conversations/${convId}?after=${lastId}`);
        if (r.messages.length) { const h = $('#first-hint'); if (h) h.remove(); append(r.messages); refreshMe(); }
      } catch { /* подождём */ }
    }, 4000);

    const form = $('#send');
    const ta = $('#body');
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`; };
    ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) return;
      ta.value = ''; ta.style.height = 'auto';
      try {
        const r = await api('POST', `/api/conversations/${convId}/messages`, { body });
        const h = $('#first-hint'); if (h) h.remove();
        append([r.message]);
        loadList().catch(() => {});
      } catch (ex) { ta.value = body; toast(ex.message, true); }
    };
    ta.focus();
  }

  // ================= профиль =================
  async function viewProfile(_, q) {
    if (!requireAuth()) return;
    setTitle('Профиль');
    const tab = q.get('tab') || 'listings';
    const u = S.user;
    app.innerHTML = String(html`<div class="wrap">
      <div class="profile-head">
        <span class="avatar lg">${initial(u.name)}</span>
        <div style="flex:1;min-width:0"><h1>${u.name}</h1><div class="muted">${u.email} · на Торгане с ${since(u.createdAt)}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${u.isAdmin ? html`<a class="btn btn-soft" href="/admin">Модерация</a>` : ''}
          <a class="btn btn-soft" href="/u/${u.id}">Публичный профиль</a>
          <button class="btn btn-line" id="logout">Выйти</button>
        </div>
      </div>
      ${S.config.mail && !u.emailVerified ? html`<div class="banner warn" style="margin-bottom:20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span style="flex:1 1 260px">${ic('warn', 18)} <strong>Подтвердите email.</strong> Мы отправили письмо на ${u.email} — без этого не придут уведомления о сообщениях.</span>
        <button class="btn btn-soft btn-sm" id="verify-again">Отправить ещё раз</button></div>` : ''}
      <div class="tabs">
        <a class="chip ${tab === 'listings' ? 'active' : ''}" href="/profile">Мои объявления</a>
        <a class="chip ${tab === 'settings' ? 'active' : ''}" href="/profile?tab=settings">Настройки</a>
      </div>
      <div id="box"><div class="loader"></div></div>
    </div>`);
    $('#logout').onclick = async () => {
      await api('POST', '/api/auth/logout').catch(() => {});
      S.user = null; setUnread(0);
      toast('Вы вышли из аккаунта');
      go('/', true);
    };
    const va = $('#verify-again');
    if (va) va.onclick = async () => { va.disabled = true; try { await api('POST', '/api/me/verify'); toast(`Письмо отправлено на ${u.email}`); } catch (e) { toast(e.message, true); va.disabled = false; } };
    if (tab === 'settings') return renderSettings();
    return renderMyListings(q.get('status') || 'active');
  }

  async function renderMyListings(status) {
    const { items } = await api('GET', '/api/my/listings');
    const groups = { active: [], pending: [], sold: [], rejected: [], archived: [] };
    items.forEach((i) => (groups[i.status] || groups.archived).push(i));
    const labels = { active: 'Активные', pending: 'На проверке', rejected: 'На исправлении', sold: 'Проданные', archived: 'Сняты' };
    const list = groups[status] || [];
    $('#box').innerHTML = String(html`
      <div class="tabs">${Object.keys(labels).map((k) => html`<a class="chip ${k === status ? 'active' : ''}" href="/profile?status=${k}">${labels[k]} · ${groups[k].length}</a>`)}</div>
      ${list.length ? list.map((i) => html`<div class="my-row">
        <a href="/l/${i.id}" class="my-img">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
        <div class="my-info">
          <a href="/l/${i.id}" class="t" style="display:block">${i.title}</a>
          <div class="p">${price(i.price, i.priceUnit)}</div>
          <div class="m">${i.city} · ${shortWhen(i.createdAt)} · ${NF.format(i.views)} ${plural(i.views, 'просмотр', 'просмотра', 'просмотров')} · в избранном у ${i.favCount}</div>
          ${i.status === 'pending' ? html`<div class="banner warn" style="margin-top:10px;padding:10px 14px;font-size:14px">Ждёт проверки модератором: похоже на «${i.flags}».</div>` : ''}
          ${i.status === 'rejected' ? html`<div class="banner danger" style="margin-top:10px;padding:10px 14px;font-size:14px"><strong>Причина:</strong> ${i.rejectReason}${i.appealAt ? html` · <span>апелляция отправлена</span>` : ''}${i.appealReply ? html`<br><strong>Ответ на апелляцию:</strong> ${i.appealReply}` : ''}</div>` : ''}
        </div>
        <div class="my-actions">
          <a class="btn btn-soft btn-sm" href="/edit/${i.id}">${i.status === 'rejected' ? 'Исправить' : 'Изменить'}</a>
          ${i.status === 'active' ? html`<button class="btn btn-soft btn-sm" data-st="sold" data-id="${i.id}">Продано</button><button class="btn btn-line btn-sm" data-st="archived" data-id="${i.id}">Снять</button>` : ''}
          ${i.status === 'sold' || i.status === 'archived' ? html`<button class="btn btn-soft btn-sm" data-st="active" data-id="${i.id}">Опубликовать</button>` : ''}
          ${i.status === 'rejected' && !i.appealAt && !i.appealReply ? html`<button class="btn btn-line btn-sm" data-appeal="${i.id}">Апелляция</button>` : ''}
          <button class="btn btn-danger btn-sm" data-del="${i.id}">Удалить</button>
        </div>
      </div>`) : html`<div class="empty"><h3>${status === 'active' ? 'У вас пока нет объявлений' : 'Здесь пусто'}</h3><p>${status === 'active' ? 'Разместите первое — это бесплатно.' : 'Объявления появятся здесь, когда сменят статус.'}</p>${status === 'active' ? html`<a class="btn btn-dark" href="/new">Разместить объявление</a>` : ''}</div>`}`);
    $$('[data-st]').forEach((b) => {
      b.onclick = async () => {
        try { await api('PATCH', `/api/listings/${b.dataset.id}`, { status: b.dataset.st }); toast('Готово'); renderMyListings(status); } catch (e) { toast(e.message, true); }
      };
    });
    $$('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmModal('Удалить объявление?', 'Объявление и фото удалятся без возможности восстановления.', 'Удалить', true))) return;
        try { await api('DELETE', `/api/listings/${b.dataset.del}`); toast('Удалено'); renderMyListings(status); } catch (e) { toast(e.message, true); }
      };
    });
    $$('[data-appeal]').forEach((b) => { b.onclick = () => appealModal(b.dataset.appeal, () => renderMyListings(status)); });
  }

  function renderSettings() {
    const u = S.user;
    $('#box').innerHTML = String(html`<form class="settings" id="sf">
      <div class="field"><label for="s-name">Имя</label><input id="s-name" name="name" class="input" maxlength="60" value="${u.name}" required></div>
      <div class="field"><label for="s-city">Город</label><input id="s-city" name="city" class="input" list="cities" value="${u.city || ''}" placeholder="Подставим в новые объявления">
        <datalist id="cities">${S.config.cities.map((c) => html`<option value="${c}">`)}</datalist></div>
      <div class="field"><label for="s-email">Email</label><input id="s-email" class="input" value="${u.email}" disabled><span class="help">Email используется для входа${S.config.mail ? (u.emailVerified ? ' · подтверждён' : ' · не подтверждён') : ''}</span></div>
      ${S.config.mail ? html`<div class="field"><span class="label">Письма на почту</span>
        <label class="switch"><span>Новые сообщения в чате</span><input type="checkbox" name="notifyMessages" ${u.notifyMessages ? raw('checked') : ''}><span class="track"></span></label>
        <label class="switch"><span>Решения модерации по моим объявлениям</span><input type="checkbox" name="notifyModeration" ${u.notifyModeration ? raw('checked') : ''}><span class="track"></span></label></div>` : ''}
      <div><button class="btn btn-dark" type="submit">Сохранить</button></div>
    </form>`);
    $('#sf').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const f = e.target;
        const body = { name: f.name.value, city: f.city.value };
        if (f.notifyMessages) Object.assign(body, { notifyMessages: f.notifyMessages.checked, notifyModeration: f.notifyModeration.checked });
        const r = await api('PATCH', '/api/me', body);
        S.user = r.user; toast('Сохранено'); renderHeader();
      } catch (ex) { toast(ex.message, true); }
    };
  }

  async function viewUser(id) {
    const { user: u, items } = await api('GET', `/api/users/${id}`);
    setTitle(u.name);
    app.innerHTML = String(html`<div class="wrap">
      <div class="profile-head"><span class="avatar lg">${initial(u.name)}</span>
        <div><h1>${u.name}</h1><div class="muted">${u.city ? `${u.city} · ` : ''}на Торгане с ${since(u.createdAt)}${u.soldCount ? ` · продано ${u.soldCount}` : ''}</div></div></div>
      <div class="section-head"><h2>Объявления · ${items.length}</h2></div>
      ${items.length ? grid(items) : html`<div class="empty"><h3>Активных объявлений нет</h3><p>Загляните позже.</p></div>`}
    </div>`);
  }

  // ================= модерация =================
  const REASONS = ['Запрещённый товар или услуга', 'Фото не соответствует описанию', 'Неверная категория', 'Признаки мошенничества', 'Контакты или ссылки в тексте и на фото', 'Повторное объявление', 'Оскорбительное содержание'];

  async function viewAdmin(_, q) {
    if (!requireAuth()) return;
    if (!S.user.isAdmin) { viewNotFound(); return; }
    setTitle('Модерация');
    const status = q.get('status') || 'pending';
    const search = q.get('q') || '';
    const isMail = status === 'mail';
    const [stats, list, mail] = await Promise.all([
      api('GET', '/api/admin/stats'),
      isMail ? { items: [] } : api('GET', `/api/admin/listings?${new URLSearchParams({ status, q: search })}`),
      isMail ? api('GET', '/api/admin/mail') : null
    ]);
    const tabs = { pending: `На проверке${stats.pending ? ` · ${stats.pending}` : ''}`, active: 'Активные', appeals: `Апелляции${stats.appeals ? ` · ${stats.appeals}` : ''}`, rejected: 'Отклонённые', sold: 'Проданные', archived: 'Снятые', mail: `Почта${S.config.mail ? '' : ' · не подключена'}` };
    app.innerHTML = String(html`<div class="wrap">
      <div class="profile-head"><h1 style="flex:1">Модерация</h1></div>
      ${isMail ? '' : html`<div class="stats">
        <div class="stat"><div class="n">${NF.format(stats.users)}</div><div class="k">пользователей · +${stats.usersToday} за сутки</div></div>
        <div class="stat"><div class="n">${NF.format(stats.active)}</div><div class="k">активных · +${stats.listingsToday} за сутки</div></div>
        <div class="stat"><div class="n">${NF.format(stats.messagesToday)}</div><div class="k">сообщений за сутки</div></div>
        <div class="stat"><div class="n">${NF.format(stats.rejected)}</div><div class="k">отклонено</div></div>
      </div>`}
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:20px">
        <div class="tabs" style="margin:0;flex:1">${Object.entries(tabs).map(([k, v]) => html`<a class="chip ${k === status ? 'active' : ''}" href="/admin?status=${k}">${v}</a>`)}</div>
        ${isMail ? '' : html`<form id="as" class="search" style="width:320px;max-width:100%">${ic('search', 18)}<label class="sr" for="aq">Поиск</label><input id="aq" name="q" placeholder="Текст или email автора" value="${search}"></form>`}
      </div>
      ${isMail ? html`<div id="mail-box"></div>` : list.items.length ? list.items.map((i) => html`<div class="my-row">
        <a href="/l/${i.id}" class="my-img">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
        <div class="my-info">
          <a href="/l/${i.id}" class="t" style="display:block">${i.title}</a>
          <div class="p">${price(i.price, i.priceUnit)} <span class="muted" style="font-weight:500;font-size:14px">· ${catName(i.category)} · ${i.city}</span></div>
          <div class="m">${i.user.name} (${i.user.email})${i.user.blocked ? ' · заблокирован' : ''} · ${when(i.createdAt)}</div>
          ${i.description ? html`<div class="m" style="max-width:640px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${i.description}</div>` : ''}
          ${i.rejectReason && i.status === 'rejected' ? html`<div class="banner danger" style="margin-top:8px;padding:10px 14px;font-size:14px"><strong>Причина:</strong> ${i.rejectReason}</div>` : ''}
          ${i.flags ? html`<div class="banner warn" style="margin-top:8px;padding:10px 14px;font-size:14px"><strong>Похоже на запрещённое:</strong> ${i.flags}</div>` : ''}
          ${i.appealAt ? html`<div class="banner warn" style="margin-top:8px;padding:10px 14px;font-size:14px"><strong>Апелляция:</strong> ${i.appealText}</div>` : ''}
          ${i.appealReply ? html`<div class="banner soft" style="margin-top:8px;padding:10px 14px;font-size:14px"><strong>Ответ на апелляцию:</strong> ${i.appealReply}</div>` : ''}
        </div>
        <div class="my-actions">
          ${i.status !== 'rejected' && i.status !== 'pending' ? html`<button class="btn btn-danger btn-sm" data-reject="${i.id}">Отклонить</button>` : html`<button class="btn btn-accent btn-sm" data-restore="${i.id}">${i.status === 'pending' ? 'Опубликовать' : i.appealAt ? 'Одобрить апелляцию' : 'Восстановить'}</button>`}
          ${i.status === 'pending' ? html`<button class="btn btn-danger btn-sm" data-reject="${i.id}">Отклонить</button>` : ''}
          ${i.appealAt ? html`<button class="btn btn-line btn-sm" data-deny="${i.id}">Отказать по апелляции</button>` : ''}
          <button class="btn btn-line btn-sm" data-block="${i.user.id}" data-blocked="${i.user.blocked ? '1' : ''}">${i.user.blocked ? 'Разблокировать' : 'Заблокировать автора'}</button>
        </div>
      </div>`) : html`<div class="empty"><h3>Здесь пусто</h3><p>Нет объявлений в этом разделе.</p></div>`}
    </div>`);
    if (isMail) { renderMailAdmin($('#mail-box'), mail); return; }
    $('#as').onsubmit = (e) => { e.preventDefault(); go(`/admin?${new URLSearchParams({ status, q: e.target.q.value.trim() })}`); };
    // Одно окно «решение с объяснением» — для отклонения объявления и для отказа по апелляции.
    const reasonModal = (title, url, okLabel, reasons) => openModal(String(html`<h2>${title}</h2><p class="muted" style="margin:0 0 12px">Текст увидит автор${S.config.mail ? ' — и получит его письмом' : ''}. Пишите понятно и вежливо.</p>
        ${reasons ? html`<div class="reasons">${reasons.map((r) => html`<button type="button" class="chip" data-r="${r}">${r}</button>`)}</div>` : ''}
        <label class="sr" for="rr">Объяснение</label><textarea id="rr" class="textarea" style="margin-top:12px;min-height:110px" maxlength="500" placeholder="Объяснение для автора"></textarea>
        <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-danger" data-ok>${okLabel}</button></div>`), (m, close) => {
      $$('[data-r]', m).forEach((c) => { c.onclick = () => { $('#rr', m).value = c.dataset.r; }; });
      $('[data-x]', m).onclick = close;
      $('[data-ok]', m).onclick = async () => {
        try { await api('POST', url, { reason: $('#rr', m).value }); close(); toast('Готово'); render(); } catch (e) { toast(e.message, true); }
      };
    });
    $$('[data-reject]').forEach((b) => { b.onclick = () => reasonModal('Отклонить объявление', `/api/admin/listings/${b.dataset.reject}/reject`, 'Отклонить', REASONS); });
    $$('[data-deny]').forEach((b) => { b.onclick = () => reasonModal('Отказать по апелляции', `/api/admin/listings/${b.dataset.deny}/appeal-deny`, 'Отказать'); });
    $$('[data-restore]').forEach((b) => {
      b.onclick = async () => { try { await api('POST', `/api/admin/listings/${b.dataset.restore}/restore`); toast('Восстановлено'); render(); } catch (e) { toast(e.message, true); } };
    });
    $$('[data-block]').forEach((b) => {
      b.onclick = async () => {
        const blocked = !b.dataset.blocked;
        if (blocked && !(await confirmModal('Заблокировать автора?', 'Все его объявления скроются, а войти в аккаунт он не сможет.', 'Заблокировать', true))) return;
        try { await api('POST', `/api/admin/users/${b.dataset.block}/block`, { blocked }); toast(blocked ? 'Заблокирован' : 'Разблокирован'); render(); } catch (e) { toast(e.message, true); }
      };
    });
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
  const LEGAL = new Set(['terms', 'rules', 'privacy', 'consent']);
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
        <h2>Как связаться</h2><p>Напишите нам: ${contact}. Укажите ссылку на объявление или диалог, если вопрос о них.</p>
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

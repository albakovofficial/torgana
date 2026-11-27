// Каркас страницы: шапка, меню, подвал, оформление (светлое и тёмное), колокольчик уведомлений, cookie и Метрика.
import { $, $$, NATIVE, PAY, S, api, ava, hm, html, nativePost, raw } from './core.js';
import { MARK, P, ic, logo } from './icons.js';
import { openModal } from './ui.js';
import { openMenu } from './profile.js';
import { firstMedal } from './badges.js';

// 1.48.0: оформление — как на устройстве, светлое или тёмное (выбор хранится на этом устройстве; до отрисовки его ставит theme.js).
export const THEMES = [['auto', 'auto', 'Как на устройстве', 'Само переключится вместе с телефоном или компьютером'], ['light', 'sun', 'Светлое', 'Всегда светлое'], ['dark', 'moon', 'Тёмное', 'Бережёт глаза вечером']];
export const themeGet = () => { try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; } };
const darkNow = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
const themeMeta = () => { const m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', darkNow() ? '#0F121B' : '#FFFFFF'); };
export function themeSet(t) {
  try { if (t === 'auto') localStorage.removeItem('theme'); else localStorage.setItem('theme', t); } catch { /* закрытое хранилище — до перезагрузки */ }
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  themeMeta();
}
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeMeta); } catch { /* старый браузер */ }

// ================= каркас: шапка, меню, подвал =================
// Шапка (1.23, вариант B): всё в одну строку — логотип, поиск с городом внутри, избранное, сообщения,
// уведомления, «Разместить», меню. На телефоне поиск — второй строкой на главной (см. viewHome).
export function renderHeader() {
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
export function setNotices(n) {
  S.notices = n || 0;
  appBadge();
  $$('[data-notices]').forEach((el) => { el.textContent = S.notices > 99 ? '99+' : S.notices; el.classList.toggle('hidden', !S.notices); });
}
// 1.47.2: у всех уведомлений один вид — картинка (фото объявления или знак Торганы) и цветной значок события в углу.
// Цвет события (1.25): зелёный — опубликовано, красный — нужно исправить, жёлтый — сроки,
// синий — оплата и возвраты, фиолетовый — продвижение.
const NOTICE_COLOR = { check: 'green', warn: 'red', clock: 'amber', handshake: 'amber', store: 'amber', card: 'blue', megaphone: 'violet', tag: 'violet', bolt: 'violet', down: 'green', shield: 'green' };
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

export function renderBottomNav() {
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
export const FOOTER_COLS = [
  ['Покупателям', [['/page/search', 'Как искать'], ['/page/safety', 'Безопасность'], ['/favorites', 'Избранное']]],
  ['Продавцам', [['/new', 'Разместить объявление'], ['/page/sell', 'Как продавать'], ...(PAY ? [['/business', 'Для бизнеса']] : []), ['/page/rules', 'Правила площадки']]],
  ['Помощь', [['/page/help', 'Помощь и безопасность'], ['/page/support', 'Поддержка'], ['/page/contacts', 'Реквизиты и контакты']]],
  ['Документы', [['/page/terms', 'Пользовательское соглашение'], ['/page/privacy', 'Конфиденциальность'], ['/page/consent', 'Согласие на обработку данных']]]
];
const FOOTER_NARROW = '(max-width: 760px)';
export function renderFooter() {
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

export function setUnread(n) {
  S.unread = n;
  appBadge();
  $$('[data-unread]').forEach((el) => { el.textContent = n; el.classList.toggle('hidden', !n); });
}
// Новое у продавцов, на которых подписан, — значок у пункта «Подписки».
export function setFresh(f) {
  S.fresh = f || { price: 0, follow: 0 };
  $$('[data-fresh-follow]').forEach((el) => { el.textContent = S.fresh.follow || 0; el.classList.toggle('hidden', !S.fresh.follow); });
}

// ================= cookie и Яндекс.Метрика =================
// Метрика загружается, только если модератор указал номер счётчика и человек нажал «Хорошо» в плашке cookie.
// Без счётчика плашки нет: сайт использует только необходимые cookie (вход, защита).
const COOKIE_KEY = 'tg_cookie';
const cookieChoice = () => { try { return localStorage.getItem(COOKIE_KEY) || ''; } catch { return 'necessary'; } };
let ymOn = false;
let ymPrev = document.referrer;
export function metrikaStart() {
  const id = Number(S.config.metrika);
  if (!id || ymOn || cookieChoice() !== 'all') return;
  ymOn = true;
  window.ym = window.ym || function ym() { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = Date.now();
  const sc = document.createElement('script');
  sc.async = true; sc.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.appendChild(sc);
  window.ym(id, 'init', { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
}
// Просмотр страницы — после каждого перехода внутри сайта.
export function metrikaHit() {
  if (!ymOn) return;
  window.ym(Number(S.config.metrika), 'hit', location.href, { title: document.title, referer: ymPrev });
  ymPrev = location.href;
}
export function cookieBar(force = false) {
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

// Разделы аккаунта и «Выйти» — одно меню для левой колонки профиля (на компьютере) и для панели ≡ (full).
// В панели вместо пункта «Настройки» — все группы настроек, публичный профиль и помощь.
export const FOOTER_LABEL = Object.fromEntries(FOOTER_COLS.flatMap((c) => c[1]));
export const HELP_LINKS = [['/page/help', 'info'], ['/page/safety', 'shield'], ['/page/rules', 'flag'], ...(PAY ? [['/business', 'store']] : [])];

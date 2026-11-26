// Запуск: порядок подключения разделов, «потянуть вниз — обновить», первая загрузка.
// Порядок важен: разделы вешают обработчики кликов при загрузке, и «избранное» на карточке (cards)
// должно срабатывать раньше перехода по ссылке (router).
import './core.js';
import './rules.js';
import './icons.js';
import './ui.js';
import './photos.js';
import './layout.js';
import './cards.js';
import './router.js';
import './home.js';
import './search.js';
import './listing.js';
import './boost.js';
import './editor.js';
import './auth.js';
import './messages.js';
import './reputation.js';
import './profile.js';
import './badges.js';
import './settings.js';
import './business.js';
import './pages.js';
import { $, NATIVE, S, api, app, html } from './core.js';
import { ic } from './icons.js';
import { toast } from './ui.js';
import { cookieBar, metrikaStart, renderBottomNav, renderFooter, renderHeader, setFresh, setNotices, setUnread } from './layout.js';
import { render } from './router.js';
import { payPending } from './business.js';

// ================= «потянуть вниз — обновить» =================
// Только на страницах сайта внутри приложения для iPhone: в браузере телефона у Safari и Chrome
// есть свой такой жест. Жест только наблюдает за пальцем (passive) и не мешает прокрутке и нажатиям.
// Обновление мягкое: заново берём данные и перерисовываем страницу; вышла новая версия сайта — перезагрузка.
async function softRefresh() {
  const cur = ($('script[src*="/assets/js/main.js"]') || {}).src || '';
  try {
    const page = await fetch('/', { cache: 'no-store' }).then((r) => r.text());
    const m = /\/assets\/js\/main\.js\?v=([\w-]+)/.exec(page);
    if (m && !cur.includes(m[1])) { location.reload(); return; }
  } catch { /* офлайн — обновим то, что получится */ }
  try { S.config = await api('GET', '/api/config'); } catch { /* офлайн */ }
  await refreshMe();
  await render();
}

function setupPullToRefresh() {
  if (!NATIVE || !('ontouchstart' in window)) return;
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
export async function refreshMe() {
  try { if (applyMe(await api('GET', '/api/me'))) { renderHeader(); renderBottomNav(); } } catch { /* офлайн */ }
}

// Откуда пришёл человек (первый заход браузера): метка utm_source или сайт, с которого перешли.
// Храним только в браузере (localStorage, без cookie), один раз сообщаем о заходе; при регистрации передаём серверу.
export const srcOf = () => { try { return localStorage.getItem('tg_src') || ''; } catch { return ''; } };
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
  // 1.60.0: push в браузер (с тех пор, как сайт ставили на экран «Домой») убраны — снимаем их service worker.
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  try {
    const [config, me] = await Promise.all([api('GET', '/api/config'), api('GET', '/api/me')]);
    S.config = config;
    applyMe(me);
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
  setupPullToRefresh();
  setInterval(() => { if (S.user && document.visibilityState === 'visible') refreshMe(); }, 30000);
}

boot();

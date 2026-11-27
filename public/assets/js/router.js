// Адреса страниц, переходы без перезагрузки, восстановление прокрутки, загрузка модерации (admin.js).
import { $, PAY, S, app, html } from './core.js';
import { cityModal } from './ui.js';
import { watchImpressions } from './cards.js';
import { metrikaHit, renderBottomNav, renderHeader } from './layout.js';
import { viewMessages } from './messages.js';
import { viewCategory, viewSearch } from './search.js';
import { viewFavorites, viewHome } from './home.js';
import { viewListing } from './listing.js';
import { viewEditor } from './editor.js';
import { viewConfirm, viewForgot, viewLogin, viewMailLink, viewRegister, viewReset } from './auth.js';
import { viewProfile } from './profile.js';
import { viewDeactivated, viewUser } from './settings.js';
import { viewBusiness, viewPay } from './business.js';
import { viewPage } from './pages.js';

// ================= роутер =================
export let cleanup = null;
// 1.51.1: «Назад» и «Вперёд» возвращают туда же, где читали: у записи истории — прокрутка и сколько карточек ленты
// было загружено. Браузер сам прокрутку не восстанавливает — страница рисуется заново, позже его попытки.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let restoreTo = null; // { y, n } — запись истории, на которую вернулись «Назад»/«Вперёд»
export let backTo = null; // то же на время отрисовки страницы (читает лента)
let feedN = 0; // сколько карточек загрузила лента на текущей странице
function rememberPlace() {
  try { history.replaceState({ ...(history.state || {}), y: Math.round(window.scrollY), n: feedN }, ''); } catch { /* слишком часто — не важно */ }
}
export function go(url, replace = false) {
  if (!replace) rememberPlace();
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  window.dispatchEvent(new Event('torgana:route')); // закрыть подсказки, привязанные к старой странице
  render();
}
export function goSearch(params) {
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
export function requireAuth() {
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
  [/^\/profile(?:\/(listings|settings|reputation|reviews|following|stats\/\d+|business(?:\/(?:shop|stats))?))?$/, viewProfile],
  [/^\/business$/, viewBusiness],
  [/^\/pay\/([\w-]+)$/, viewPay],
  [/^\/u\/(\d+)$/, viewUser],
  [/^\/admin$/, viewAdmin],
  [/^\/admin\/l\/(\d+)$/, viewAdminListing],
  [/^\/admin\/device$/, viewDevice],
  [/^\/admin\/u\/(\d+)$/, viewAdminUser],
  [/^\/page\/([a-z]+)$/, viewPage]
];

export async function render() {
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

export function setTitle(t) { document.title = t ? `${t} — Торгана` : 'Торгана — объявления по всей России'; }

export function viewNotFound(msg) {
  setTitle('Страница не найдена');
  app.innerHTML = String(html`<div class="wrap"><div class="empty" style="margin-top:40px"><h3>${msg || 'Такой страницы нет'}</h3><p>Возможно, объявление сняли с публикации или ссылка устарела.</p><a href="/" class="btn btn-dark">На главную</a></div></div>`);
}

// ================= модерация: отдельный файл admin.js (1.51.2) =================
// Модуль admin.js грузим при первом заходе в /admin и запоминаем; не загрузился — следующий заход попробует снова.
let adminMod = null;
function loadAdmin() {
  adminMod ||= import('./admin.js').catch(() => {
    adminMod = null;
    throw new Error('Не получилось загрузить модерацию — проверьте связь и обновите страницу');
  });
  return adminMod;
}

// Обычные функции, а не const: маршруты (ROUTES) ссылаются на них раньше этого места.
async function viewAdmin(...a) { return (await loadAdmin()).viewAdmin(...a); }
async function viewAdminListing(...a) { return (await loadAdmin()).viewAdminListing(...a); }
async function viewAdminUser(...a) { return (await loadAdmin()).viewAdminUser(...a); }
async function viewDevice(...a) { return (await loadAdmin()).viewDevice(...a); }
export function setCleanup(value) { cleanup = value; }
export function rememberFeed(value) { feedN = value; }

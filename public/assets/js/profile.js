// Профиль: карточка, меню, «Мои объявления», своя репутация, статистика, бизнес и товарный знак.
import { $, $$, NATIVE, NF, PAY, S, api, app, ava, dateLong, dateShort, esc, html, lpath, nativePost, plural, price, raw, rub, shortWhen, when } from './core.js';
import { pageCover, tileIc } from './cover.js';
import { P, ic, svg } from './icons.js';
import { confirmModal, openModal, toast } from './ui.js';
import { resizeImage } from './photos.js';
import { renderHeader, setUnread } from './layout.js';
import { reviewLine } from './messages.js';
import { go, requireAuth, setTitle } from './router.js';
import { renderFollowing } from './search.js';
import { appealModal } from './listing.js';
import { deleteListing } from './editor.js';
import { BOOST, boostBusy, boostModal, boostOn, boostPrices, mlBoostRow } from './boost.js';
import { verifyModal } from './auth.js';
import { levelMedal, repCard, repHow, repLine, repTasks } from './reputation.js';
import { nameSeal, planBadge, trustBadges, verifiedSeal } from './badges.js';
import { viewSettings } from './settings.js';
import { dayWord, daysLeft, renderBusinessHub, setPin } from './business.js';
import { refreshMe } from './main.js';

// ================= профиль =================
export const MY_STATUS = { active: 'Активные', scheduled: 'Запланированы', pending: 'На проверке', rejected: 'На исправлении', sold: 'Проданные', archived: 'Сняты' };
export const MY_TAG = { active: ['ok', 'Опубликовано'], scheduled: ['wait', 'Запланировано'], pending: ['wait', 'На проверке'], rejected: ['bad', 'Нужно исправить'], sold: ['dark', 'Продано'], archived: ['off', 'Снято'] };
export const isExpired = (i) => i.status === 'archived' && i.expiresAt && i.expiresAt <= Date.now(); // прошло 30 дней
export const atTime = (ts) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

// Насколько заполнен профиль: имя есть всегда, дальше фото и (если есть почта) подтверждённый email.
// 1.49.0: с тарифом — и витрина. Каждый пункт — [готово, что, действие, ключ]; ключ ведёт туда, где это заполнить.
function profileTodo(u) {
  const sh = u.shop; // витрина — при тарифе или у официального аккаунта
  const todo = [
    [!!u.avatar, 'Фото профиля', 'Добавить', 'avatar'],
    ...(S.config.mail ? [[u.emailVerified, 'Почта', 'Подтвердить', 'verify']] : []),
    ...(sh ? [[!!sh.cover, 'Обложка витрины', 'Загрузить', 'cover'], [!!sh.about, 'Описание магазина', 'Написать', 'about'], [!!sh.hours, 'Часы работы', 'Указать', 'hours'],
      [!!sh.address, 'Адрес', 'Указать', 'addr'], [!!sh.delivery, 'Доставка', 'Указать', 'delivery'], [!!sh.site, 'Сайт', 'Указать', 'site']] : [])
  ];
  return { todo: todo.filter((t) => !t[0]), pct: Math.round(((todo.filter((t) => t[0]).length + 1) / (todo.length + 1)) * 100) };
}
// Своя карточка слева в профиле и настройках: фото с камерой, имя, отметка проверки, цифры, что ещё заполнить.
// 1.49.0: имя и галочка бренда — в одну строку, из отметок — только проверка ИП/компании и телефона;
// у магазина — своя обложка и две плитки: «Статистика» и «Настройка витрины».
export function idCard(u, stats = []) {
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
        ${u.rep && !(sh && sh.official) ? repLine(u.rep, '/profile/reputation', { shop: !!sh, first: u.badges && u.badges.first, kind: 'me' }) : ''}
      </div>
      <a class="icon-btn pf-gear" href="/profile/settings" aria-label="Настройки">${ic('gear', 20)}</a>
    </div>
    ${String(badges).trim() ? html`<div class="pf-badges">${badges}</div>` : ''}
    ${sh && sh.about ? html`<div class="pf-about"><p data-about>${sh.about}</p><div class="pf-about-acts"><button type="button" class="pf-about-more" data-about-more hidden>Ещё</button><a href="/profile/business/shop#sh-about">${ic('edit', 14, 2.2)}Изменить</a></div></div>` : ''}
    ${sh ? '' : PAY ? html`<a class="pf-lockcov" href="/business">${ic('lock', 16, 2.2)}<span>Обложка и витрина — с тарифом «Магазин»</span><b>Открыть</b></a>`
    : html`<div class="pf-lockcov">${ic('lock', 16, 2.2)}<span>Обложка и витрина — с тарифом «Магазин»</span></div>`}
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
export function bindIdCard(again) {
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
      else if (t === 'verify') verifyModal(again);
      else go(`/profile/business/shop#sh-${t}`);
    };
  });
}
function navKey() {
  const p = location.pathname;
  if (p === '/profile' || p.startsWith('/profile/listings') || p.startsWith('/profile/stats')) return 'listings';
  if (p.startsWith('/profile/')) return p.split('/')[2];
  if (p === '/messages/support') return 'support';
  return { '/favorites': 'fav', '/messages': 'msg', '/admin': 'admin', '/new': 'new' }[p.startsWith('/messages') ? '/messages' : p] || p;
}
// Пункт меню со значком — один для меню профиля, панели ≡ и меню модерации.
export const navLink = (href, icon, label, on, right = '', key = '') => html`<a href="${href}" class="${on ? 'on' : ''}"${on ? raw(' aria-current="page"') : ''}${key ? raw(` data-k="${key}"`) : ''}>${ic(icon, 20)}<span class="lbl">${label}</span>${right}</a>`;
// Меню профиля на компьютере (слева). На телефоне в профиле оно прячется, а четыре пункта (data-k: msg, fav, following, rep)
// становятся плитками. Панель ≡ — своя (openMenu).
function profileNav() {
  const active = navKey();
  const u = S.user;
  const item = (href, icon, label, key = href, right = '') => navLink(href, icon, label, active === key, right, key);
  return html`<nav class="pf-nav" aria-label="Разделы профиля">
    ${item('/profile', 'tag', 'Мои объявления', 'listings')}
    ${item('/messages', 'chat', 'Сообщения', 'msg', html`<span class="badge ${S.unread ? '' : 'hidden'}" data-unread>${S.unread}</span>`)}
    ${item('/favorites', 'heart', 'Избранное', 'fav')}
    ${item('/profile/following', 'users', 'Подписки', 'following', html`<span class="badge ${S.fresh && S.fresh.follow ? '' : 'hidden'}" data-fresh-follow>${S.fresh ? S.fresh.follow || 0 : 0}</span>`)}
    ${item('/profile/reputation', 'handshake', 'Репутация', 'rep', u.rep && u.rep.level ? html`<span class="nav-rating">${levelMedal(u.rep.level, 14)}</span>` : '')}
    ${PAY ? item('/profile/business', 'store', 'Для бизнеса', 'business') : ''}
    <hr>${item('/profile/settings', 'gear', 'Настройки', 'settings')}
    ${item('/messages/support', 'headset', 'Поддержка', 'support')}
    ${u.isAdmin ? item('/admin', 'shield', 'Модерация', 'admin') : ''}
    ${item(`/u/${u.id}`, 'eye', 'Как меня видят покупатели')}
    <hr>
    <button type="button" class="out" data-logout>${ic('logout', 20, 2)}<span class="lbl">Выйти из аккаунта</span></button>
  </nav>`;
}

// Панель ≡ справа — вариант A «Плитки» (выбор владельца 27.11, как в приложении): вы, модерация (модераторам),
// шесть плиток — подписки, уведомления, бизнес, профиль, оформление, чёрный список; помощь; «Выйти».
// Без повторов: «Мои объявления» и «Репутация» — в профиле, сообщения и избранное — в шапке и в нижнем меню.
const MENU_TILES = [['/profile/following', 'users', 'purple', 'Подписки', 'Продавцы и новинки'], ['/profile/settings#sn', 'bell', 'red', 'Уведомления', 'Push и письма'],
  ['/profile/business', 'store', 'yellow', 'Для бизнеса', 'Витрина, статистика'], ['/profile/settings#sf', 'user', 'blue', 'Профиль', 'Фото, имя, вход'],
  ['/profile/settings#s-look', 'moon', 'purple', 'Оформление', 'Светлое, тёмное, авто'], ['/profile/settings#s-block', 'ban', 'gray', 'Чёрный список', 'Кому нельзя писать']];
export function openMenu() {
  const u = S.user;
  const tiles = MENU_TILES.filter(([href]) => PAY || href !== '/profile/business');
  const fresh = S.fresh && S.fresh.follow;
  openModal(String(html`<div class="menu-top">
      ${u ? html`<a class="menu-me" href="/profile">${ava(u, 'lg')}<span class="menu-me-txt"><b>${u.name}</b><small>Мой профиль</small></span>${ic('right', 18, 2)}</a>`
  : html`<div class="menu-me-txt"><b>Добро пожаловать</b><small>Войдите, чтобы писать продавцам и размещать объявления</small></div>`}
      <button type="button" class="icon-btn" data-x aria-label="Закрыть меню">${ic('close', 20, 2)}</button>
    </div>
    ${u ? '' : html`<div class="menu-auth"><a class="btn btn-dark" href="/login">Войти</a><a class="btn btn-soft" href="/register">Регистрация</a></div>`}
    ${u && u.isAdmin ? html`<a class="menu-mod" href="/admin"><span class="menu-mod-ic">${ic('shield', 20, 2)}</span><span class="menu-me-txt"><b>Модерация</b><small data-mod-sub>Загружаем…</small></span><em data-mod-n hidden></em></a>` : ''}
    ${u ? html`<nav class="menu-tiles" aria-label="Разделы">${tiles.map(([href, icon, tone, t, sub]) => html`<a class="menu-tile" href="${href}">${tileIc(icon, tone, 18)}<b>${t}</b><small>${href === '/profile/following' && fresh ? `${fresh} ${plural(fresh, 'новое', 'новых', 'новых')}` : sub}</small></a>`)}</nav>` : html`<nav class="menu-tiles"><a class="menu-tile" href="/new">${tileIc('plus', 'blue', 18)}<b>Разместить</b><small>Бесплатно</small></a><a class="menu-tile" href="/page/search">${tileIc('search', 'purple', 18)}<b>Как искать</b><small>Советы</small></a></nav>`}
    <div class="menu-help">${[['/messages/support', 'headset', 'Поддержка', 'Отвечают люди, а не боты'], ['/page/help', 'info', 'Помощь и безопасность', ''], ['/page/rules', 'list', 'Правила и документы', '']].map(([href, icon, t, sub]) => html`<a href="${href}">${tileIc(icon, icon === 'list' ? 'gray' : 'blue', 16)}<span class="menu-me-txt"><b>${t}</b>${sub ? html`<small>${sub}</small>` : ''}</span>${ic('right', 16, 2)}</a>`)}</div>
    ${u ? html`<button type="button" class="btn btn-line menu-out" data-logout>${ic('logout', 18, 2)}Выйти</button>` : ''}`), (m, close) => {
    m.classList.add('drawer'); m.parentElement.classList.add('drawer-back'); m.setAttribute('aria-label', 'Меню');
    $('[data-x]', m).onclick = close;
    m.addEventListener('click', (e) => { if (e.target.closest('a[href], [data-logout]')) close(); });
    // Модераторам — что ждёт решения (те же счётчики, что на пульте модерации).
    if (u && u.isAdmin) api('GET', '/api/admin/stats').then((st) => {
      const parts = [st.pending && `${st.pending} на проверке`, st.reports && `${st.reports} ${plural(st.reports, 'жалоба', 'жалобы', 'жалоб')}`, st.support && `${st.support} в поддержке`, st.appeals && `${st.appeals} ${plural(st.appeals, 'апелляция', 'апелляции', 'апелляций')}`].filter(Boolean);
      const total = ['pending', 'reports', 'appeals', 'rep', 'support', 'biz'].reduce((n, k) => n + (st[k] || 0), 0);
      const sub = $('[data-mod-sub]', m); if (sub) sub.textContent = parts.length ? parts.join(' · ') : 'Всё разобрано';
      const n = $('[data-mod-n]', m); if (n && total) { n.textContent = total; n.hidden = false; }
    }).catch(() => {});
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
export function pickAvatar(done) {
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
export async function removeAvatar(done) {
  if (!(await confirmModal('Убрать фото профиля?', 'Вместо фото будет первая буква имени.', 'Убрать', true))) return;
  try { const r = await api('PATCH', '/api/me', { avatar: '' }); S.user = r.user; renderHeader(); toast('Фото убрано'); done(); } catch (e) { toast(e.message, true); }
}

export async function shareLink(url, title) {
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
export async function viewProfile(section, q) {
  if (!requireAuth()) return;
  if (!section && q.get('tab') === 'settings') { go(`/profile/settings${location.hash}`, true); return; }
  if (section === 'settings') { viewSettings(); return; }
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
  // 27.11: шапка раздела — общая обложка (cover.js); «‹» ведёт на уровень выше, вкладки периода — под заголовком.
  const seg = (opts, cur, href) => html`<div class="seg" role="tablist">${opts.map(([v, t]) => html`<a role="tab" aria-selected="${v === cur ? 'true' : 'false'}" class="${v === cur ? 'on' : ''}" href="${href(v)}">${t}</a>`)}</div>`;
  const nActive = count('active'); const nPending = count('pending');
  const head = sec === 'business'
    ? pageCover({ title: BIZ_TITLE[bizSub], back: bizSub ? '/profile/business' : '/profile', icon: 'store', tone: 'blue',
      below: bizSub === 'stats' ? seg([['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней']], bizDays, (v) => `/profile/business/stats?days=${v}`) : '',
      side: bizSub === '' ? html`<a class="btn btn-soft" href="/business">${ic('tag', 18, 2)}<span>Тарифы и цены</span></a>` : bizSub === 'shop' ? html`<a class="btn btn-soft" href="/u/${u.id}">${ic('eye', 18, 2)}<span>Как видят покупатели</span></a>` : '' })
    : sec === 'stats'
    ? pageCover({ title: 'Статистика', back: '/profile', icon: 'chart', tone: 'teal', below: seg([['7', '7 дней'], ['30', '30 дней'], ['0', 'Всё время']], days, (v) => `/profile/stats/${statId}?days=${v}`) })
    : sec === 'following'
    ? pageCover({ title: 'Подписки', back: '/profile', icon: 'users', tone: 'purple' })
    : sec === 'reputation'
    ? pageCover({ title: 'Репутация', back: '/profile', icon: 'handshake', tone: 'yellow' })
    : pageCover({ title: 'Мои объявления', sub: [`${nActive} ${plural(nActive, 'активное', 'активных', 'активных')}`, ...(nPending ? [`${nPending} на проверке`] : [])].join(' · '), back: '/', icon: 'tag', tone: 'blue' });
  app.innerHTML = String(html`<div class="wrap pf2 ${hub ? 'is-hub' : 'is-section'}">
    <aside class="pf-side">
      ${idCard(u, [[nActive, plural(nActive, 'активное', 'активных', 'активных'), '/profile?status=active'], [count('sold'), 'продано', '/profile?status=sold']])}
      ${profileNav()}
    </aside>
    <section class="pf-main">
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
    ${repCard(d.rep)}${repTasks(d.next)}${repHow()}
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
export const dayLabel = (d) => `${Number(d.slice(8, 10))} ${SHORT_M[Number(d.slice(5, 7)) - 1]}`;
const STAT_SRC = [['search', 'search', 'Поиск'], ['home', 'home', 'Главная лента'], ['category', 'tag', 'Категории'], ['ad', 'megaphone', 'Блок «Реклама»'], ['external', 'share', 'Прямые заходы и ссылки извне'], ['other', 'right', 'Другие страницы Торганы']];
// Переходы из выдачи — только с тех страниц, где считаются показы. Прямые ссылки, чаты и профиль показов не дают.
const listViews = (s) => (s.search || 0) + (s.home || 0) + (s.category || 0) + (s.ad || 0);
export const ctrOf = (imp, s) => (imp ? Math.min(100, (listViews(s) / imp) * 100) : null);
export const pct1 = (x) => (Math.round(x * 10) / 10).toLocaleString('ru-RU');
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
export const srcRows = (sources, keep) => {
  const rows = STAT_SRC.filter(([k]) => sources[k] || keep(k));
  const p = shares(rows.map(([k]) => sources[k] || 0));
  return rows.map(([, icn, label], i) => html`<div class="st-src"><span class="st-src-ic">${ic(icn, 17)}</span><div><div class="st-step-h"><span>${label}</span><b>${p[i]}%</b></div><div class="st-track dark"><i style="width:${p[i]}%"></i></div></div></div>`);
};
// 1.61.1: сравнение с прошлым периодом — зелёная стрелка вверх или красная вниз, процент и «было N за прошлую неделю»
// (так же в приложении). Плитка статистики объявления и магазина — одна.
const PAST = { 7: 'за прошлую неделю', 30: 'за прошлые 30 дней', 90: 'за прошлые 90 дней' };
export const trend = (a, b, period) => {
  const was = html`<span class="t-was">было ${NF.format(b)} ${PAST[period] || `за прошлые ${period} дн.`}</span>`;
  if (a === b) return html`<span class="t-row"><span class="t-pill same">${ic('flat', 13, 2.6)}0%</span>${was}</span>`;
  const up = a > b;
  return html`<span class="t-row"><span class="t-pill ${up ? 'up' : 'down'}">${ic(up ? 'rise' : 'fall', 13, 2.6)}${b ? `${Math.abs(Math.round(((a - b) / b) * 100))}%` : 'новое'}</span>${was}</span>`;
};
export const kpi = (n, label, sub, note, accent) => html`<div class="st-kpi ${accent ? 'accent' : ''}"><span class="k">${label}</span><b>${n}</b>${note ? html`<span class="d">${note}</span>` : ''}<span class="s">${sub}</span></div>`;
async function renderStats(id, days) {
  const d = await api('GET', `/api/my/listings/${id}/stats?days=${days}`);
  const { totals: t, prev: pv, listing: l } = d;
  const ctr = ctrOf(t.impressions, d.sources);
  const fromList = listViews(d.sources);
  const delta = (a, b) => (pv ? trend(a, b, d.period) : '');
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
export const NOTIFY_ROWS = [
  ['Сообщения', 'Чаты с покупателями и продавцами, ответы поддержки. Письмо — если не прочитали за 5 минут', 'pushMessages', 'notifyMessages'],
  ['Мои объявления', 'Проверка модератором, апелляции, срок публикации', 'pushModeration', 'notifyModeration'],
  ['Сделки и репутация', 'Подтверждение сделок, отметки, уровень, жалобы', 'pushDeals', null],
  ['Бизнес и оплата', 'Оплаты и возвраты, тариф, продвижение, проверка бизнеса', 'pushMoney', null],
  ['Подписки', 'Новые объявления продавцов, на которых вы подписаны', 'pushSearches', null],
  ['Снижение цены', 'Подешевело то, что у вас в избранном', 'pushPrices', null],
  ['Подборка за день', 'Новое у продавцов и снижение цен — одним письмом', null, 'notifyDigest']
];
export const notifyCell = (u, k, title, kind) => (k
  ? html`<label class="mini-switch"><input type="checkbox" name="${k}" aria-label="${kind} — ${title}" ${u[k] ? raw('checked') : ''}><span class="track"></span></label>`
  : html`<span class="ntf-none" title="Для этого события нет">—</span>`);

// Для бизнеса (1.45.0; 1.61.0 — без переключателя «Бизнес-аккаунт»): проверка ИП и получение галочки —
// объёмного значка «Проверенный бренд». Галочка — только правообладателю товарного знака из реестра Роспатента:
// шаг 1 — компания или ИП (ИНН, ОГРН/ОГРНИП, сверка с ЕГРЮЛ/ЕГРИП, даёт плашку «ИП/Компания проверена»),
// шаг 2 — номер свидетельства на товарный знак (модератор сверяет запись в реестре ФИПС), шаг 3 — галочка у имени.
const TM_REGISTRY = 'https://fips.ru/registers-web/';
const dateIn = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');
// 1.61.0: без переключателя «Бизнес-аккаунт» и без шагов «1 2 3» — две строки со статусом словами.
export const bizState = (b) => (!b ? ['off', 'Не начато'] : { verified: ['ok', 'Готово'], pending: ['wait', 'На проверке'], rejected: ['bad', 'Исправить'] }[b.status] || ['off', 'Не начато']);
export const tmState = (b, tm) => (tm && tm.live ? ['ok', 'Готово'] : tm && tm.status === 'pending' ? ['wait', 'На проверке'] : tm && tm.status === 'rejected' ? ['bad', 'Исправить']
  : b && ['pending', 'verified'].includes(b.status) ? ['off', 'Не начато'] : ['off', 'После ИП']);
export const trustRow = (icon, t, sub, [cls, word], href) => html`<${href ? 'a' : 'div'} class="trust-row"${href ? raw(` href="${href}"`) : ''}><span class="tr-ic">${icon}</span><span class="tr-txt"><b>${t}</b><small>${sub}</small></span><span class="ml-tag ${cls}"><i></i>${word}</span></${href ? 'a' : 'div'}>`;
export function bizBlock(b, tm) {
  const bizDone = b && b.status === 'verified';
  const bizSent = b && ['pending', 'verified'].includes(b.status);
  const head = html`<div class="trust-rows">
      ${trustRow(ic('shield', 20, 2), bizDone && b.kind !== 'ip' ? 'Компания проверена' : 'ИП или компания', 'Значок у имени · сверим с ЕГРЮЛ/ЕГРИП', bizState(b))}
      ${trustRow(verifiedSeal(20), 'Галочка бренда', 'Для владельцев товарного знака из реестра Роспатента', tmState(b, tm))}
    </div>`;
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
  return html`${head}
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
  const letter = d.letter; // текст письма — с сервера (1.61.0), тот же в приложении
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
export function bindBizForm(reload) {
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

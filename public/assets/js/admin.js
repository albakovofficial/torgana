// Модерация Торганы — отдельные модули: грузятся только при заходе в /admin, покупатели и продавцы их не скачивают.
// Этот — вход: меню и разделы, очередь проверки, сводка, воронка продавцов.
import { $, $$, MONTHS, NF, S, api, app, ava, catName, html, plural, price, raw, when } from './core.js';
import { P, ic, svg } from './icons.js';
import { confirmModal, reasonModal, toast } from './ui.js';
import { go, render, requireAuth, setTitle, viewNotFound } from './router.js';
import { navLink } from './profile.js';
import { verifiedSeal } from './badges.js';
import { renderAdsAdmin, renderUsersAdmin } from './admin-users.js';
import { renderLogAdmin, renderModPane, renderOauthAdmin, renderRepAdmin, renderSiteAdmin, renderSupportAdmin } from './admin-content.js';
import { renderAiAdmin, renderApnsAdmin, renderBackupAdmin, renderBillingAdmin, renderMailAdmin, renderNotifyAdmin, renderPaymentsAdmin, renderSeoAdmin, renderSourcesAdmin } from './admin-settings.js';

// ================= модерация =================
const REASONS = ['Запрещённый товар или услуга', 'Фото не соответствует описанию', 'Неверная категория', 'Признаки мошенничества', 'Контакты или ссылки в тексте и на фото', 'Повторное объявление', 'Оскорбительное содержание'];
const BLOCK_REASONS = ['Мошенничество', 'Продажа запрещённого', 'Спам и повторные объявления', 'Чужие фото и подделки', 'Оскорбления'];

// Кнопки модератора — одни обработчики для очереди и страницы проверки. after — что делать после решения.
export function bindModActions(root, after = () => render()) {
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
export const modButtons = (i) => html`
  ${i.status === 'pending' ? html`<button class="btn btn-accent btn-sm" data-restore="${i.id}">Опубликовать</button><button class="btn btn-danger btn-sm" data-reject="${i.id}">Отклонить</button>` : ''}
  ${i.status === 'rejected' ? html`<button class="btn btn-accent btn-sm" data-restore="${i.id}">${i.appealAt ? 'Одобрить апелляцию' : 'Восстановить'}</button>` : ''}
  ${i.appealAt ? html`<button class="btn btn-line btn-sm" data-deny="${i.id}">Отказать по апелляции</button>` : ''}
  ${['active', 'sold', 'archived'].includes(i.status) ? html`<button class="btn btn-danger btn-sm" data-reject="${i.id}">Снять с публикации</button>` : ''}
  ${i.reports ? html`<button class="btn btn-soft btn-sm" data-dismiss="${i.id}">Закрыть жалобы</button>` : ''}`;
export const STATUS_LABEL = { pending: 'На проверке', scheduled: 'Запланировано', active: 'Опубликовано', rejected: 'Отклонено', sold: 'Продано', archived: 'Снято', deleted: 'Удалено автором' };

// ---------- оболочка модерации (вариант C, 1.62.0) ----------
// Компьютер: слева разделы, как в почте; у очередей — список и объявление рядом (renderListingsAdmin).
// Телефон: главный экран модерации — список разделов со значками и счётчиками (renderAdminHome), в разделе — «‹ Модерация».
// [ключ, значок, название, счётчик из /api/admin/stats, подпись на телефоне, цвет значка]
const ADMIN_NAV = [
  ['Ждут решения', [['pending', 'inbox', 'На проверке', 'pending', 'новые и изменённые объявления', 'blue'], ['reports', 'flag', 'Жалобы', 'reports', 'на объявления от покупателей', 'red'],
    ['appeals', 'reply', 'Апелляции', 'appeals', 'просят пересмотреть отказ', 'amber'], ['rep', 'star', 'Сделки', 'rep', 'жалобы по сделкам и накрутка', 'amber'],
    ['support', 'headset', 'Поддержка', 'support', 'вопросы пользователей', 'violet'], ['biz', 'shield', 'Бизнес', 'biz', 'проверка ИП, компаний и брендов', 'violet']]],
  ['Площадка', [['dash', 'chart', 'Сводка', '', 'очередь, графики, воронка продавцов', 'sky'], ['active', 'tag', 'Объявления', '', 'опубликованные, отклонённые, проданные', 'sky'],
    ['users', 'users', 'Люди', '', 'поиск, блокировка, модераторы', 'sky'], ['payments', 'card', 'Деньги', '', 'платежи, реклама, настройки оплаты', 'sky'],
    ['sources', 'trend', 'Откуда приходят', '', 'источники посетителей', 'sky'], ['log', 'list', 'Журнал действий', '', 'кто и что сделал в модерации', 'sky']]],
  ['', [['settings', 'gear', 'Настройки', '', 'почта, вход, приложение, копии', 'gray']]]
];
// Подразделы → пункт меню, который подсвечивается.
const ADMIN_PARENT = { rejected: 'active', sold: 'active', archived: 'active', ads: 'payments', billing: 'payments', notify: 'settings', mail: 'settings', oauth: 'settings', apns: 'settings', ai: 'settings', seo: 'settings', backup: 'settings', site: 'settings' };
const LISTING_STATUS_TABS = [['active', 'Опубликованные'], ['rejected', 'Отклонённые'], ['sold', 'Проданные'], ['archived', 'Снятые']];
const MONEY_TABS = [['payments', 'Платежи'], ['ads', 'Реклама'], ['billing', 'Настройки оплаты']];
const ADMIN_SETTINGS = [['notify', 'bell', 'Мои уведомления', 'Push и письма о новом'], ['mail', 'mail', 'Почта', 'Отправка писем, коды, очередь'], ['oauth', 'lock', 'Вход через сервисы', 'Яндекс ID и VK ID'], ['apns', 'phone', 'Приложение iPhone', 'Push через Apple, ссылки в приложение'],
  ['ai', 'sparkle', 'ИИ по фото', 'Заполнение объявления по фото'], ['seo', 'search', 'Поиск и статистика', 'Вебмастер, Метрика, карта сайта'], ['backup', 'shield', 'Копии и безопасность', 'Резервные копии базы, защита входа'], ['site', 'refresh', 'Версия сайта', 'Обновления и откат']];
const NAV_ITEMS = ADMIN_NAV.flatMap((g) => g[1]);
const adminLabel = (k) => { const x = NAV_ITEMS.find(([key]) => key === k) || ADMIN_SETTINGS.find(([key]) => key === k); return x ? x[2] : ({ rejected: 'Отклонённые', sold: 'Проданные', archived: 'Снятые', ads: 'Реклама', billing: 'Настройки оплаты' }[k] || 'Модерация'); };
const LISTING_TABS = ['pending', 'reports', 'appeals', 'active', 'rejected', 'sold', 'archived'];
const QUEUES = ['pending', 'reports', 'appeals'];
// Как у телефона в вёрстке модерации (app.css, max-width: 900px).
const isPhone = () => window.matchMedia('(max-width: 900px)').matches;
export function adminShell(active, stats, body) {
  const on = ADMIN_PARENT[active] || active;
  const badge = (k) => (k && stats[k] ? html`<span class="badge">${stats[k]}</span>` : '');
  return html`<div class="wrap adm">
    <aside class="adm-side">
      <nav class="pf-nav adm-nav" aria-label="Разделы модерации">${ADMIN_NAV.map(([group, items]) => html`
        ${group ? html`<div class="pf-nav-h">${group}</div>` : html`<div class="adm-nav-end"></div>`}
        ${items.map(([k, icon, label, cnt]) => navLink(`/admin?status=${k}`, icon, label, k === on, badge(cnt)))}`)}
      </nav>
    </aside>
    <section class="adm-main">
      ${active === 'home' ? '' : html`<a class="adm-up" href="/admin">${ic('left', 18, 2.2)}Модерация</a>`}
      ${body}
    </section>
  </div>`;
}
// Телефон: главный экран — разделы списком, как в «Настройках» iPhone.
function renderAdminHome(box, stats) {
  box.innerHTML = String(html`<div class="adm-head"><h1>Модерация</h1></div>
    ${ADMIN_NAV.map(([group, items]) => html`<section class="adm-list">${group ? html`<div class="adm-list-h">${group}</div>` : ''}
      <div class="adm-rows">${items.map(([k, icon, label, cnt, sub, tone]) => html`<a class="adm-row" href="/admin?status=${k}"><span class="adm-row-ic ${tone}">${ic(icon, 19, 2)}</span>
        <span class="adm-row-t"><b>${label}</b><small>${sub}</small></span>${cnt && stats[cnt] ? html`<em>${stats[cnt]}</em>` : ''}${ic('right', 18, 2)}</a>`)}</div></section>`)}`);
}
// Раздел «Настройки» — плитки; внутри каждой настройки — ссылка назад.
function renderSettingsHub(box) {
  box.innerHTML = String(html`<div class="adm-head"><h1>Настройки</h1></div>
    <div class="set-hub">${ADMIN_SETTINGS.map(([k, icon, t, sub]) => html`<a class="set-tile" href="/admin?status=${k}"><span class="set-tile-ic">${ic(icon, 22, 2)}</span><span class="set-tile-t"><b>${t}</b><small>${k === 'mail' && !S.config.mail ? 'Не подключена — письма не уходят' : sub}</small></span>${k === 'mail' && !S.config.mail ? html`<i class="set-tile-warn">${ic('warn', 14, 2.4)}</i>` : ''}${ic('right', 18, 2)}</a>`)}</div>`);
}
// Подвкладки: статусы объявлений, «Платежи / Настройки оплаты»; у настроек — «← Настройки».
function adminSubNav(box, status) {
  const tabs = (list) => html`<nav class="seg adm-tabs" aria-label="Подразделы">${list.map(([k, t]) => html`<a href="/admin?status=${k}" class="${k === status ? 'on' : ''}"${k === status ? raw(' aria-current="page"') : ''}>${t}</a>`)}</nav>`;
  const headEl = $('.adm-head', box);
  if (ADMIN_PARENT[status] === 'settings') box.insertAdjacentHTML('afterbegin', String(html`<a class="pf-back always adm-back" href="/admin?status=settings">${ic('left', 18, 2)}Настройки</a>`));
  else if (['active', 'rejected', 'sold', 'archived'].includes(status) && headEl) headEl.insertAdjacentHTML('afterend', String(tabs(LISTING_STATUS_TABS)));
  else if (MONEY_TABS.some(([k]) => k === status) && headEl) headEl.insertAdjacentHTML('afterend', String(tabs(MONEY_TABS)));
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

export async function viewAdmin(_, q) {
  if (!requireAuth()) return;
  if (!S.user.isAdmin) { viewNotFound(); return; }
  // Без раздела: на телефоне — список разделов, на компьютере — очередь (если есть), иначе сводка.
  let status = q.get('status') || (isPhone() ? 'home' : '');
  if (status === 'listings') { go('/admin?status=active', true); return; }
  const [stats, dev] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', '/api/admin/device').catch(() => null)]);
  if (!status) status = stats.pending ? 'pending' : 'dash';
  setTitle(status === 'home' ? 'Модерация' : `${adminLabel(status)} — модерация`);
  const arm = dev && dev.required && !dev.armed ? html`<div class="banner warn adm-arm">${ic('shield', 20, 2)}<div><b>Защита входа в модерацию не включена.</b> Подтвердите это устройство кодом из письма — после этого на новых устройствах модерация будет открываться только по коду.</div><a class="btn btn-dark btn-sm" href="/admin/device">Включить</a></div>` : '';
  app.innerHTML = String(adminShell(status, stats, html`${arm}<div id="adm-box" class="adm-box"><div class="loader"></div></div>`));
  const box = $('#adm-box');
  const extraUrl = { mail: '/api/admin/mail', site: '/api/admin/update' }[status];
  const extra = extraUrl ? await api('GET', extraUrl) : null;
  const head = (h1, right = '') => html`<div class="adm-head"><h1>${h1}</h1>${right}</div>`;
  const R = {
    home: () => renderAdminHome(box, stats),
    dash: () => renderDashboard(box, stats),
    users: () => renderUsersAdmin(box, q),
    biz: () => renderUsersAdmin(box, new URLSearchParams({ f: 'biz' }), 'Проверка бизнеса'),
    oauth: () => renderOauthAdmin(box),
    ai: () => renderAiAdmin(box),
    apns: () => renderApnsAdmin(box),
    sources: () => renderSourcesAdmin(box, q),
    seo: () => renderSeoAdmin(box),
    backup: () => renderBackupAdmin(box),
    payments: () => renderPaymentsAdmin(box, q),
    billing: () => renderBillingAdmin(box),
    ads: () => renderAdsAdmin(box, q),
    log: () => renderLogAdmin(box, q),
    notify: () => renderNotifyAdmin(box),
    mail: () => { box.innerHTML = String(head('Почта')); box.insertAdjacentHTML('beforeend', '<div id="special-box"></div>'); renderMailAdmin($('#special-box'), extra); },
    site: () => { box.innerHTML = String(head('Версия сайта')); box.insertAdjacentHTML('beforeend', '<div id="special-box"></div>'); renderSiteAdmin($('#special-box'), extra.update); },
    support: async () => { box.innerHTML = String(head('Поддержка')); box.insertAdjacentHTML('beforeend', '<div id="special-box"></div>'); await renderSupportAdmin($('#special-box'), q.get('t')); },
    rep: () => renderRepAdmin(box),
    settings: () => renderSettingsHub(box),
  };
  if (R[status]) { await R[status](); adminSubNav(box, status); return; }
  if (!LISTING_TABS.includes(status)) { go('/admin', true); return; }
  await renderListingsAdmin(box, status, q, head(['active', 'rejected', 'sold', 'archived'].includes(status) ? 'Объявления' : adminLabel(status)));
  adminSubNav(box, status);
}

// Замечания автопроверки и «похоже на запрещённое» — плашками в очереди и на странице проверки.
export const CHECK_ICON = { duplicate: 'refresh', photo: 'image', price: 'tag', contacts: 'chat' };
export const checkChips = (i) => (i.flags || (i.checks && i.checks.length) ? html`<div class="chk-list">
  ${i.flags ? html`<span class="chk danger">${ic('warn', 15, 2)}Похоже на запрещённое: ${i.flags}</span>` : ''}
  ${(i.checks || []).map((c) => html`<span class="chk">${ic(CHECK_ICON[c.kind] || 'warn', 15, 2)}${c.text}</span>`)}</div>` : '');

// Объявления раздела. Очереди на компьютере — как в почте: список слева, выбранное объявление справа (renderModPane).
async function renderListingsAdmin(box, status, q, head) {
  const search = q.get('q') || '';
  const { items } = await api('GET', `/api/admin/listings?${new URLSearchParams({ status, q: search })}`);
  const split = QUEUES.includes(status) && !isPhone() && items.length;
  const empty = html`<div class="empty"><h3>${status === 'pending' ? 'Очередь пуста' : 'Здесь пусто'}</h3><p>${status === 'pending' ? 'Все объявления проверены.' : 'Нет объявлений в этом разделе.'}</p></div>`;
  const searchForm = html`<form id="as" class="search adm-search">${ic('search', 18)}<label class="sr" for="aq">Поиск</label><input id="aq" name="q" placeholder="Текст объявления или email автора" value="${search}"></form>`;
  if (split) {
    const cur = items.find((i) => String(i.id) === q.get('l')) || items[0];
    const link = (i) => `/admin?${new URLSearchParams({ status, ...(search ? { q: search } : {}), l: i.id })}`;
    box.innerHTML = String(html`<div class="adm-split">
      <div class="adm-q">
        <div class="adm-q-h"><h1>${adminLabel(status)}</h1><span class="pill-n">${items.length}</span></div>
        ${searchForm}
        <div class="adm-q-list">${items.map((i) => html`<a class="adm-q-row ${i === cur ? 'on' : ''}" href="${link(i)}"${i === cur ? raw(' aria-current="true"') : ''}>
          <span class="adm-q-img">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 22, 1.3)}</span>
          <span class="adm-q-t"><b>${i.title}</b><small>${price(i.price, i.priceUnit)} · ${i.city} · ${i.user.name}</small>
            ${i.flags || (i.checks && i.checks.length) || i.reports || i.appealAt ? html`<span class="adm-q-tags">${i.flags ? html`<i class="bad">Похоже на запрещённое</i>` : ''}${(i.checks || []).slice(0, 2).map((c) => html`<i>${c.text}</i>`)}${i.reports ? html`<i class="bad">Жалоб: ${i.reports}</i>` : ''}${i.appealAt ? html`<i>Апелляция</i>` : ''}</span>` : ''}</span>
          <span class="adm-q-tm">${shortAgo(i.updatedAt)}</span></a>`)}</div>
      </div>
      <div class="adm-pane" id="adm-pane"><div class="loader"></div></div>
    </div>`);
    const idx = items.indexOf(cur);
    const nextItem = items[idx + 1] || items[idx - 1];
    renderModPane($('#adm-pane', box), cur.id, () => go(nextItem ? link(nextItem) : `/admin?status=${status}`, true));
  } else {
    box.innerHTML = String(html`${head}${searchForm}
    ${items.length ? items.map((i) => html`<div class="my-row">
      <a href="/admin/l/${i.id}" class="my-img" tabindex="-1" aria-hidden="true">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
      <div class="my-info">
        <a href="/admin/l/${i.id}" class="t" style="display:block">${i.title}</a>
        <div class="p">${price(i.price, i.priceUnit)} <span class="muted" style="font-weight:500;font-size:14px">· ${catName(i.category)} · ${i.city}</span></div>
        <div class="m"><a href="/admin/u/${i.user.id}">${i.user.name}</a> (${i.user.email})${i.user.blocked ? ' · заблокирован' : ''} · ${when(i.updatedAt)}</div>
        ${checkChips(i)}
        ${i.reports ? html`<div class="banner warn" style="margin-top:8px;padding:8px 12px;font-size:14px"><strong>Жалоб:</strong> ${i.reports}</div>` : ''}
        ${i.appealAt ? html`<div class="banner warn" style="margin-top:8px;padding:8px 12px;font-size:14px"><strong>Апелляция:</strong> ${i.appealText}</div>` : ''}
      </div>
      <div class="my-actions"><a class="btn btn-dark btn-sm" href="/admin/l/${i.id}">Проверить</a>${modButtons(i)}</div>
    </div>`) : empty}`);
    bindModActions(box);
  }
  $('#as').onsubmit = (e) => { e.preventDefault(); go(`/admin?${new URLSearchParams({ status, q: e.target.q.value.trim() })}`); };
}
// «25 мин», «3 ч», «2 дн» — сколько ждёт объявление в очереди.
const shortAgo = (t) => fmtDur(Date.now() - t).replace(/^(\d+ (?:ч|дн)) \d+ (?:мин|ч)$/, '$1');

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
  const CHARTS = [['listings', 'Подано'], ['users', 'Пользователи'], ['approved', 'Одобрено'], ['rejected', 'Отклонено']];
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
        ${tile('/admin?status=reports', NF.format(st.reports), plural(st.reports, 'объявление с жалобами', 'объявления с жалобами', 'объявлений с жалобами'), `новых жалоб за сутки: ${d.today.reports}`)}
        ${tile('/admin?status=support', NF.format(st.support), 'ждут ответа поддержки')}
        ${tile('/admin?status=active', NF.format(d.totals.active), 'опубликовано сейчас', `подано за сутки: ${d.today.listings} · одобрено: ${d.today.approved}`)}
        ${tile('/admin?status=users', NF.format(d.totals.users), 'пользователей', `новых за сутки: ${d.today.users}${d.totals.blocked ? ` · заблокировано: ${d.totals.blocked}` : ''}`)}
        ${tile('/admin?status=appeals', NF.format(st.appeals), 'апелляций', `по репутации ждут решения: ${st.rep || 0}`)}
      </div>
    </div>
    <div class="dash-grid">
      <section class="panel dash-chart">
        <div class="dash-chart-head"><h2 class="h2">За 30 дней</h2>
          <div class="seg" role="tablist">${CHARTS.map(([k, t], i) => html`<a role="tab" href="#" data-chart="${k}" class="${i ? '' : 'on'}" aria-selected="${i ? 'false' : 'true'}">${t}</a>`)}</div></div>
        <div id="chart">${barChart(d.days, 'listings', 'Подано')}</div>
      </section>
      <section class="panel dash-mods"><h2 class="h2">Модераторы за 7 дней</h2>
        ${d.moderators.map((m) => html`<a class="dash-mod" href="/admin?status=log&admin=${m.id}">${ava(m, 'sm')}<span>${m.name}${m.me ? html` <small class="muted">(вы)</small>` : ''}</span><b>${NF.format(m.actions)}</b></a>`)}
        <p class="muted" style="margin:6px 0 0;font-size:13px">Число действий: решения по объявлениям, блокировки, ответы в поддержке.</p>
      </section>
    </div>
    <section class="panel dash-funnel" id="funnel" aria-label="Воронка продавцов"></section>`);
  renderFunnel($('#funnel', box), 30);
  $$('[data-chart]', box).forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      $$('[data-chart]', box).forEach((x) => { x.classList.toggle('on', x === a); x.setAttribute('aria-selected', x === a ? 'true' : 'false'); });
      $('#chart', box).innerHTML = String(barChart(d.days, a.dataset.chart, a.textContent));
    };
  });
}

// 1.54.0: воронка продавцов — где теряются люди (lib/admin.js /api/admin/funnel). Шаги — по тем, кто зарегистрировался
// за период; первый шаг — новые посетители. Самый большой провал подсвечен, рядом — что с ним делать.
const FUNNEL_TIPS = {
  signups: 'Заходят, но не регистрируются — проверьте, понятно ли на главной, зачем регистрироваться и что это бесплатно.',
  sellers: 'Регистрируются, но не размещают — напомните про медаль «Один из первых» и что размещение бесплатное.',
  approved: 'Объявления не проходят проверку — посмотрите частые причины отказа в «Журнале действий» и поправьте подсказки.',
  contacted: 'Покупатели не пишут — нужен поток покупателей: посты, реклама, понятные фото и цены в объявлениях.',
  sold: 'Пишут, но не продают — подскажите продавцам про торг, встречную цену и быстрые ответы.'
};
const FUNNEL_DAYS = [[7, '7 дней'], [30, '30 дней'], [90, '90 дней'], [0, 'Всё время']];
async function renderFunnel(el, days) {
  if (!el) return;
  let f;
  try { f = await api('GET', `/api/admin/funnel?days=${days}`); } catch (e) { el.innerHTML = String(html`<p class="muted">${e.message}</p>`); return; }
  const max = Math.max(1, ...f.steps.map((x) => x.n));
  const conv = f.steps.map((x, i) => (i && f.steps[i - 1].n ? Math.round((x.n / f.steps[i - 1].n) * 100) : null));
  let worst = -1;
  conv.forEach((c, i) => { if (c !== null && f.steps[i - 1].n >= 3 && (worst < 0 || c < conv[worst])) worst = i; });
  el.innerHTML = String(html`<div class="dash-chart-head"><h2 class="h2">Воронка продавцов</h2>
      <div class="seg" role="tablist">${FUNNEL_DAYS.map(([d, t]) => html`<a role="tab" href="#" data-fd="${d}" class="${d === f.days ? 'on' : ''}" aria-selected="${d === f.days ? 'true' : 'false'}">${t}</a>`)}</div></div>
    <ol class="fn">${f.steps.map((x, i) => html`<li class="fn-row ${i === worst ? 'worst' : ''}">
      <span class="fn-l">${x.label}</span>
      <span class="fn-bar"><i style="--w:${Math.max(x.n ? 2 : 0, (x.n / max) * 100).toFixed(1)}%"></i><b>${NF.format(x.n)}</b></span>
      <span class="fn-c">${conv[i] === null ? '' : html`${ic('right', 14, 2.4)}${conv[i]}%`}</span></li>`)}</ol>
    ${worst > 0 ? html`<div class="fn-tip">${ic('info', 18, 2)}<div><b>Больше всего теряем на шаге «${f.steps[worst].label}» — доходит ${conv[worst]}%.</b> ${FUNNEL_TIPS[f.steps[worst].key]}</div></div>` : ''}
    <p class="fn-note muted">Шаги считаются по тем, кто зарегистрировался ${f.days ? `за ${f.days} ${plural(f.days, 'день', 'дня', 'дней')}` : 'за всё время'} (без модераторов); посетители — браузеры, впервые открывшие сайт.${f.toFirst !== null ? ` От регистрации до первого объявления — обычно ${fmtDur(f.toFirst)}.` : ''}</p>`);
  $$('[data-fd]', el).forEach((a) => { a.onclick = (e) => { e.preventDefault(); renderFunnel(el, Number(a.dataset.fd)); }; });
}

// ---------- пользователи ----------
export const USER_FILTERS = [['all', 'Все'], ['new', 'Новые за неделю'], ['reported', 'С жалобами'], ['biz', 'Заявки бизнеса'], ['blocked', 'Заблокированные'], ['admins', 'Модераторы']];
export const userBadges = (u) => html`${u.isAdmin ? html`<span class="pf-badge">${ic('shield', 13, 2)} ${u.isOwner ? 'Владелец' : 'Модератор'}</span>` : ''}
  ${u.blocked ? html`<span class="pf-badge bad">${ic('lock', 13, 2)} Заблокирован</span>` : ''}
  ${u.reports ? html`<span class="pf-badge warn">${ic('flag', 13, 2)} Жалоб: ${u.reports}</span>` : ''}
  ${u.bizPending ? html`<span class="pf-badge warn">${ic('shield', 13, 2)} Заявка бизнеса</span>` : ''}${u.tmPending ? html`<span class="pf-badge warn">${verifiedSeal(13)} Заявка на бренд</span>` : ''}
  ${S.config.mail && !u.emailVerified ? html`<span class="pf-badge">Почта не подтверждена</span>` : ''}`;

// Страницы модерации из других файлов — для router.js, который подключает только этот.
export { viewAdminUser } from './admin-users.js';
export { viewDevice } from './admin-settings.js';
export { viewAdminListing } from './admin-content.js';

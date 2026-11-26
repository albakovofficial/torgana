// Модерация: реклама, жалобы на сделки, журнал, проверка объявления «от и до», поддержка.
import { $, $$, CONDITION_LABEL, NF, S, api, app, ava, catName, esc, html, price, raw, shortWhen, subName, when } from './core.js';
import { ic } from './icons.js';
import { reasonModal, toast } from './ui.js';
import { mountChat, supportAva } from './messages.js';
import { go, render, requireAuth, setCleanup, setTitle, viewNotFound } from './router.js';
import { CHECK_ICON, STATUS_LABEL, bindModActions, modButtons } from './admin.js';
import { stemHits } from './admin-settings.js';

// ---------- репутация (1.46.0): жалобы по сделкам и подозрительные сделки ----------
export async function renderRepAdmin(box) {
  const d = await api('GET', '/api/admin/reputation');
  const who = (x) => (x ? html`<a href="/admin/u/${x.id}">${x.name}</a> <span class="muted">${x.email}</span>` : '—');
  box.innerHTML = String(html`<div class="adm-head"><h1>Репутация</h1></div>
    <section class="panel rep-adm"><h2 class="h2" style="margin:0">Жалобы по сделкам · ${d.issues.length}</h2>
      ${d.issues.length ? d.issues.map((x) => html`<div class="rep-adm-row">
        <b>${x.reason}</b><span class="muted">«${x.title}» · ${when(x.at)}</span>
        <span>От: ${who(x.author)} → на ${x.targetRole === 'seller' ? 'продавца' : 'покупателя'}: ${who(x.target)}</span>
        ${x.text ? html`<p>${x.text}</p>` : ''}
        ${x.reply ? html`<p class="rep-adm-reply"><b>Объяснение:</b> ${x.reply}</p>` : html`<span class="muted">Вторая сторона ещё не объяснилась</span>`}
        <div class="adm-person-act"><button class="btn btn-danger btn-sm" data-is-ok="${x.id}">Подтвердить</button><button class="btn btn-soft btn-sm" data-is-no="${x.id}">Не подтвердилась</button></div>
      </div>`) : html`<p class="muted" style="margin:0">Жалоб нет.</p>`}</section>
    <section class="panel rep-adm"><h2 class="h2" style="margin:0">Подозрительные сделки · ${d.deals.length}</h2>
      <p class="muted" style="margin:0;font-size:14px">Подтверждены обеими сторонами, но пока не засчитаны.</p>
      ${d.deals.length ? d.deals.map((x) => html`<div class="rep-adm-row">
        <b>${x.flagText}</b><span class="muted">«${x.title}» · ${when(x.at)}</span>
        <span>Продавец: ${who(x.seller)} · покупатель: ${who(x.buyer)}</span>
        <div class="adm-person-act"><button class="btn btn-soft btn-sm" data-dl-ok="${x.id}">Засчитать</button><button class="btn btn-line btn-sm" data-dl-no="${x.id}">Не засчитывать</button></div>
      </div>`) : html`<p class="muted" style="margin:0">Подозрительных нет.</p>`}</section>`);
  const post = async (url, body, msg) => { try { await api('POST', url, body); toast(msg); render(); } catch (e) { toast(e.message, true); } };
  $$('[data-is-ok]', box).forEach((b) => { b.onclick = () => reasonModal({ title: 'Подтвердить жалобу', hint: 'Увидят обе стороны. Жалоба появится в профиле и на 90 дней снизит уровень.', url: `/api/admin/issues/${b.dataset.isOk}`, okLabel: 'Подтвердить', extra: { decision: 'confirm' }, reasons: ['Подтверждено перепиской', 'Подтверждено фото', 'Повторные жалобы на одно и то же'], placeholder: 'Что подтвердилось' }); });
  $$('[data-is-no]', box).forEach((b) => { b.onclick = () => post(`/api/admin/issues/${b.dataset.isNo}`, { decision: 'dismiss' }, 'Жалоба закрыта'); });
  $$('[data-dl-ok]', box).forEach((b) => { b.onclick = () => post(`/api/admin/deals/${b.dataset.dlOk}`, { decision: 'count' }, 'Сделка засчитана'); });
  $$('[data-dl-no]', box).forEach((b) => { b.onclick = () => post(`/api/admin/deals/${b.dataset.dlNo}`, { decision: 'drop' }, 'Не засчитана'); });
}

// ---------- журнал действий ----------
const LOG_TEXT = {
  approved: 'Опубликовал объявление', restored: 'Восстановил объявление', 'appeal-approved': 'Одобрил апелляцию', 'appeal-denied': 'Отказал по апелляции',
  'reports-dismissed': 'Закрыл жалобы на объявление', 'plan-gift': 'Подарил тариф', 'promo-gift': 'Подарил рекламу над поиском', 'boost-gift': 'Подарил продвижение в ленте', 'avatar-removed': 'Убрал фото профиля', 'user-blocked': 'Заблокировал пользователя', 'user-unblocked': 'Разблокировал пользователя',
  'biz-verified': 'Подтвердил бизнес', 'biz-rejected': 'Отказал в подтверждении бизнеса', 'support-reply': 'Ответил в поддержке',
  'billing-settings': 'Изменил настройки оплаты', 'billing-prices': 'Изменил цены', 'payment-refund': 'Оформил возврат', 'promo-erid': 'Указал erid и запустил рекламу',
  'promo-stopped': 'Отключил рекламу над поиском', 'plan-stopped': 'Отключил тариф', 'boost-stopped': 'Отключил продвижение', 'user-deactivated': 'Временно удалил профиль', 'user-restored': 'Восстановил профиль', 'user-erased': 'Удалил профиль навсегда', 'seo-settings': 'Изменил настройки поиска и Метрики', 'ads-settings': 'Изменил настройки рекламы', 'shop-cleared': 'Очистил витрину магазина', 'starter-settings': 'Изменил бесплатный старт', 'issue-confirmed': 'Подтвердил жалобу по сделке', 'issue-dismissed': 'Закрыл жалобу по сделке', 'deal-counted': 'Засчитал подозрительную сделку', 'deal-dropped': 'Не засчитал подозрительную сделку', 'tm-verified': 'Выдал галочку бренда', 'tm-rejected': 'Вернул заявку на галочку на исправление', 'tm-doc-viewed': 'Открыл документ заявки на галочку'
};
const LOG_TONE = { 'promo-erid': 'ok', 'promo-stopped': 'bad', 'plan-stopped': 'bad', 'boost-stopped': 'bad', 'user-deactivated': 'bad', 'user-erased': 'bad', 'user-restored': 'ok', 'shop-cleared': 'bad', 'biz-verified': 'ok', 'biz-rejected': 'bad', 'tm-verified': 'ok', 'tm-rejected': 'bad', rejected: 'bad', 'appeal-denied': 'bad', 'user-blocked': 'bad', approved: 'ok', restored: 'ok', 'appeal-approved': 'ok', 'user-unblocked': 'ok' };
export function logRow(e) {
  const act = e.action === 'rejected' ? (e.data.from === 'pending' ? 'Отклонил объявление' : 'Снял с публикации') : LOG_TEXT[e.action] || e.action;
  const target = e.listing ? html`<a href="/admin/l/${e.listing.id}">«${e.listing.title}»</a>`
    : '';
  const who = e.user && !e.listing ? html`<a href="/admin/u/${e.user.id}">${e.user.name}</a>` : '';
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

export async function renderLogAdmin(box, q) {
  const adminId = q.get('admin') || '';
  const type = q.get('type') || '';
  const url = (over) => `/admin?${new URLSearchParams(Object.entries({ status: 'log', admin: adminId, type, ...over }).filter(([, v]) => v))}`;
  let offset = 0;
  const load = () => api('GET', `/api/admin/log?${new URLSearchParams({ admin: adminId, type, offset })}`);
  const d = await load();
  const TYPES = [['', 'Все'], ['listings', 'Объявления'], ['users', 'Пользователи'], ['support', 'Поддержка']];
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
export async function renderOauthAdmin(box) {
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
    case 'status': return html`Автор: ${{ active: 'снова опубликовал', sold: 'отметил «продано»', archived: 'снял с публикации', deleted: 'удалил объявление (переписки сохранены)' }[d.status] || d.status}`;
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
// Проверка объявления: страница /admin/l/:id и правая колонка очереди на компьютере (вариант C) — одни и те же блоки.
function modParts(d) {
  const { listing: l, seller: u, events, reports } = d;
  const words = l.matches.flatMap((m) => m.words);
  const open = reports.filter((r) => !r.resolvedAt);
  const specs = [['Категория', catName(l.category)], ['Раздел', subName(l.subcategory) || '—'], ...(l.specs || []).map((x) => [x.label, x.value]),
    ['Цена', price(l.price, l.priceUnit)], ['Город', l.city], ...(l.metro ? [['Метро', l.metro]] : []), ...(l.district ? [['Район', l.district]] : []), ['Состояние', CONDITION_LABEL[l.condition]],
    ['Доставка', l.delivery ? 'Отправит по России' : 'Только встреча'], ['Создано', when(l.createdAt)], ['Изменено', when(l.updatedAt)],
    ['Просмотры', NF.format(l.views)], ['В избранном', NF.format(l.favCount)], ['Диалогов', NF.format(l.chats)]];
  const main = html`
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
        ${l.appealAt ? html`<div class="banner warn"><strong>Апелляция автора:</strong> ${l.appealText}</div>` : ''}`;
  const side = html`
        <div class="panel"><h2 class="h2" style="margin:0 0 12px">Продавец</h2>
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">${ava(u)}
            <div style="min-width:0;flex:1"><a href="/admin/u/${u.id}" style="font-weight:700">${u.name}</a><div class="muted" style="font-size:13px;word-break:break-all">${u.email}${u.emailVerified ? ' · подтверждён' : ' · не подтверждён'}</div></div>
            ${u.avatar ? html`<button class="btn btn-line btn-sm" data-ava-remove="${u.id}">Убрать фото</button>` : ''}</div>
          <div class="kv">
            <span>Телефон</span><b>${u.phone || '—'}</b>
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
          <ol class="timeline">${[...events].reverse().map((e) => html`<li><span class="tl-dot"></span><div>${eventText(e)}<div class="muted" style="font-size:12px;margin-top:2px">${when(e.at)}${e.actor ? ` · ${e.actor.name}${e.actor.isAdmin ? ' (модератор)' : ''}` : ''}</div></div></li>`)}</ol></div>`;
  return { l, main, side, buttons: modButtons({ ...l, reports: open.length }), back: l.status === 'pending' ? 'pending' : open.length ? 'reports' : l.status };
}

export async function viewAdminListing(id) {
  if (!requireAuth()) return;
  if (!S.user.isAdmin) { viewNotFound(); return; }
  const d = await api('GET', `/api/admin/listings/${id}`);
  const { l, main, side, buttons, back } = modParts(d);
  setTitle(`Проверка: ${l.title}`);
  const nextUrl = d.next ? `/admin/l/${d.next}` : '/admin?status=pending';
  app.innerHTML = String(html`<div class="wrap mod-page">
    <div class="mod-top">
      <a href="/admin?status=${back}" class="btn btn-soft btn-sm">${ic('left', 18)}К списку</a>
      <span class="tag ${l.status === 'active' ? 'accent' : l.status === 'rejected' ? 'danger' : ''}">${STATUS_LABEL[l.status]}</span>
      <span class="muted" style="font-size:14px">№ ${l.id}</span>
      <span style="flex:1"></span>
      ${l.status === 'active' ? html`<a class="btn btn-line btn-sm" href="/l/${l.id}" target="_blank">Открыть на сайте</a>` : ''}
      <a class="btn btn-soft btn-sm" href="${nextUrl}">${d.next ? 'Следующее в очереди' : 'В очередь'}${ic('right', 18)}</a>
    </div>
    <div class="mod-grid">
      <div class="mod-main">${main}</div>
      <aside class="mod-side">
        <div class="panel mod-actions"><h2 class="h2" style="margin:0">Решение</h2>
          <div class="mod-btns">${buttons}</div>
          <p class="muted" style="margin:0;font-size:13px">После решения откроется следующее объявление из очереди.</p></div>
        ${side}
      </aside>
    </div>
  </div>`);
  // После решения — сразу следующее объявление из очереди.
  bindModActions(app, () => go(nextUrl, true));
}

// Правая колонка очереди на компьютере: объявление целиком, решение — в панели снизу. after — что открыть после решения.
export async function renderModPane(el, id, after) {
  let d;
  try { d = await api('GET', `/api/admin/listings/${id}`); } catch (e) { el.innerHTML = String(html`<div class="empty"><p>${e.message}</p></div>`); return; }
  const { l, main, side, buttons } = modParts(d);
  el.innerHTML = String(html`<div class="adm-pane-body">
      <div class="adm-pane-top"><span class="tag ${l.status === 'active' ? 'accent' : l.status === 'rejected' ? 'danger' : ''}">${STATUS_LABEL[l.status]}</span><span class="muted">№ ${l.id}</span><span style="flex:1"></span><a class="btn btn-line btn-sm" href="/admin/l/${l.id}">Открыть целиком</a></div>
      ${main}${side}</div>
    <div class="adm-pane-bar">${buttons}</div>`);
  bindModActions(el, after);
}

// Модерация → Поддержка: диалоги слева, чат и карточка пользователя справа.
export async function renderSupportAdmin(box, threadId) {
  const { items } = await api('GET', '/api/admin/support');
  const id = Number(threadId) || (items[0] && items[0].id);
  box.innerHTML = String(html`<div class="inbox ${threadId ? 'has-chat' : ''}" style="margin-top:0">
    <div class="inbox-list">${items.length ? items.map((t) => html`<a href="/admin?status=support&t=${t.id}" class="conv ${t.id === id ? 'on' : ''}">
        ${ava(t.user)}
        <span class="conv-body"><span class="conv-top"><span>${t.user.name}</span><span>${shortWhen(t.updatedAt)}</span></span>
          <span class="conv-title" style="display:block">${t.waiting ? 'Ждёт ответа' : 'Отвечено'}${t.pro ? html` · <span class="pro-mark">Магазин Про</span>` : ''}</span>
          <span class="conv-last" style="display:block">${t.lastBody}</span></span>
        ${t.unread ? html`<span class="badge">${t.unread}</span>` : ''}</a>`) : html`<div style="padding:22px" class="muted">Обращений пока нет. Пользователи пишут в закреплённый диалог «Поддержка Торганы».</div>`}</div>
    <section class="chat" id="support-chat">${id ? html`<div class="loader" style="flex:1"></div>` : html`<div class="chat-empty"><div>${supportAva(56)}<p>Выберите обращение слева.</p></div></div>`}</section>
  </div>`);
  if (!id) return;
  const first = await api('GET', `/api/admin/support/${id}`);
  const u = first.user;
  setCleanup(mountChat($('#support-chat'), {
    back: '/admin?status=support',
    head: html`${ava(u)}<div style="flex:1;min-width:0"><a href="/admin/u/${u.id}" style="font-weight:700">${u.name}</a>
      <span class="muted" style="font-size:13px;word-break:break-all">${u.email}${u.emailVerified ? '' : ' · не подтверждён'} · объявлений ${u.listings}${u.rejected ? ` · отклонено ${u.rejected}` : ''}${u.blocked ? ' · заблокирован' : ''}</span></div>`,
    load: (after) => api('GET', `/api/admin/support/${id}?after=${after}`),
    send: async (msg) => (await api('POST', `/api/admin/support/${id}/messages`, msg)).message,
    placeholder: 'Ответ от имени поддержки…'
  }));
}

// Модерация → Версия сайта: что работает сейчас и как прошло последнее автообновление из ветки release.
export function renderSiteAdmin(box, u) {
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

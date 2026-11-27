// Модерация: пользователи — список, карточка, блокировка, подарки и остановка услуг.
import { $, $$, NF, S, api, app, ava, dateLong, dateShort, html, plural, price, raw, when } from './core.js';
import { P, ic, svg } from './icons.js';
import { confirmModal, openModal, reasonModal, toast } from './ui.js';
import { go, render, requireAuth, setTitle, viewNotFound } from './router.js';
import { repLine } from './reputation.js';
import { MY_STATUS, MY_TAG } from './profile.js';
import { nameSeal, trustBadges, verifiedSeal } from './badges.js';
import { eraseModal } from './settings.js';
import { STATUS_LABEL, USER_FILTERS, adminShell, bindModActions, checkChips, userBadges } from './admin.js';
import { logRow } from './admin-content.js';

export async function renderUsersAdmin(box, q, title = 'Пользователи') {
  const f = q.get('f') || 'all';
  const search = q.get('q') || '';
  const url = (over) => `/admin?${new URLSearchParams({ status: 'users', ...(search ? { q: search } : {}), ...(f !== 'all' ? { f } : {}), ...over })}`;
  let offset = 0;
  const load = () => api('GET', `/api/admin/users?${new URLSearchParams({ f, q: search, offset })}`);
  const d = await load();
  const row = (u) => html`<a class="adm-user" href="/admin/u/${u.id}">
      ${ava(u)}
      <span class="adm-user-main"><b>${u.name}</b><span>${u.email}</span></span>
      <span class="adm-user-meta">${NF.format(u.listings)} ${plural(u.listings, 'объявление', 'объявления', 'объявлений')} · опубл. ${u.active}</span>
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

export async function viewAdminUser(id) {
  if (!requireAuth()) return;
  if (!S.user.isAdmin) { viewNotFound(); return; }
  const [stats, d] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', `/api/admin/users/${id}`)]);
  const u = d.user;
  setTitle(`${u.name} — модерация`);
  const blockedBy = d.log.find((e) => e.action === 'user-blocked');
  const tabs = [['listings', `Объявления · ${d.counts.total}`], ['reports', `Жалобы · ${d.reports.against.length + d.reports.by.length}`], ['log', `История · ${d.log.length}`]];
  const reportItem = (r, mine) => html`<div class="report ${r.resolvedAt ? 'done' : ''}"><b>${r.reason}</b>${r.text ? html`<p>${r.text}</p>` : ''}
    <span class="muted"><a href="/admin/l/${r.listing.id}">«${r.listing.title}»</a> · ${mine ? 'пожаловался(ась)' : `от ${r.from ? r.from.name : 'пользователя'}`} · ${when(r.at)}${r.resolvedAt ? ` · закрыта: ${r.resolution}` : ''}</span></div>`;
  const section = (title, items, empty) => html`<h3 class="adm-sub">${title}</h3>${items.length ? items : html`<p class="muted" style="margin:0">${empty}</p>`}`;
  const panes = {
    listings: d.listings.length ? d.listings.map((i) => html`<div class="my-row">
        <a href="/admin/l/${i.id}" class="my-img" tabindex="-1" aria-hidden="true">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : svg(P.image, 26, 1.3)}</a>
        <div class="my-info"><span class="ml-tag ${(MY_TAG[i.status] || MY_TAG.archived)[0]}"><i></i>${STATUS_LABEL[i.status]}</span>
          <a href="/admin/l/${i.id}" class="t" style="display:block;margin-top:4px">${i.title}</a>
          <div class="m">${price(i.price, i.priceUnit)} · ${i.city} · изменено ${when(i.updatedAt)}${i.reports ? ` · жалоб: ${i.reports}` : ''}</div>
          ${i.status === 'rejected' && i.rejectReason ? html`<div class="m">Причина отклонения: ${i.rejectReason}</div>` : ''}
          ${checkChips(i)}</div>
        <div class="my-actions"><a class="btn btn-soft btn-sm" href="/admin/l/${i.id}">Открыть</a></div></div>`) : html`<p class="muted">Объявлений нет.</p>`,
    reports: html`${section('На его объявления', d.reports.against.map((r) => reportItem(r, false)), 'Жалоб нет.')}${section('Его жалобы на других', d.reports.by.map((r) => reportItem(r, true)), 'Не жаловался.')}`,
    log: d.log.length ? html`<div class="adm-log">${d.log.map(logRow)}</div>` : html`<p class="muted">Модераторы с ним ещё ничего не делали.</p>`
  };
  app.innerHTML = String(adminShell('users', stats, html`
    <div class="adm-person panel">
      <div class="adm-person-top">${ava(u, 'xl')}
        <div class="adm-person-txt"><h1>${nameSeal(u.name, { tm: u.trademark && u.trademark.live ? u.trademark : null })}</h1>
          <div class="muted">№ ${u.id}</div>
          ${u.rep ? repLine(u.rep, `/u/${u.id}?tab=rep`) : ''}
          <div class="pf-badges">${userBadges({ ...u, reports: d.reports.against.filter((r) => !r.resolvedAt).length })}${trustBadges({ phone: u.phoneVerified, biz: u.business && u.business.status === 'verified' ? { kind: u.business.kind === 'ip' ? 'ИП' : 'Компания', name: u.business.name } : null })}${S.config.mail && u.emailVerified ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Почта подтверждена</span>` : ''}</div>
        </div>
      </div>
      ${u.business ? html`<div class="adm-biz is-${u.business.status}">
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
      ${u.trademark ? html`<div class="adm-biz is-${u.trademark.status}">
        <div class="adm-biz-head"><b>${verifiedSeal(18)} Галочка бренда: «${u.trademark.name}»</b><span class="pf-badge ${u.trademark.live ? 'ok' : u.trademark.status === 'pending' ? 'warn' : 'bad'}">${u.trademark.live ? 'галочка выдана' : u.trademark.status === 'pending' ? 'на проверке' : u.trademark.status === 'rejected' ? 'нужно исправить' : 'срок истёк'}</span></div>
        <div class="adm-facts"><div><span>Свидетельство</span><b>№ ${u.trademark.number}</b></div><div><span>Действует до</span><b>${dateLong(u.trademark.until)}</b></div><div><span>Код заявки</span><b>${d.user.tmReview.code}</b></div><div><span>Правообладатель должен быть</span><b>${u.business ? `${u.business.name}, ИНН ${u.business.inn}` : '—'}${u.business && u.business.status !== 'verified' ? ' (ИНН ещё не подтверждён)' : ''}</b></div></div>
        ${d.user.tmReview.sameNumber.length || d.user.tmReview.sameInn.length ? html`<div class="banner danger"><strong>Совпадения с другими аккаунтами.</strong> ${d.user.tmReview.sameNumber.map((x) => html`Знак № ${u.trademark.number} — <a href="/admin/u/${x.id}">${x.name}</a> (${x.email}). `)}${d.user.tmReview.sameInn.map((x) => html`ИНН — <a href="/admin/u/${x.id}">${x.name}</a> (${x.email}). `)}Проверьте, не попытка ли это выдать себя за чужой бизнес.</div>` : ''}
        <div class="tm-doc-list">${d.user.tmReview.docs.length ? d.user.tmReview.docs.map((x) => html`<div class="tm-doc"><span class="tm-doc-ic">${ic(x.mime === 'application/pdf' ? 'list' : 'image', 18, 2)}</span><span><b>${x.kindName}</b><small>${x.name || 'файл'} · ${when(x.at)}</small></span><a class="btn btn-soft btn-sm" href="/api/admin/verify-docs/${x.id}" target="_blank" rel="noopener">Открыть</a></div>`) : html`<p class="muted" style="margin:0">Документов нет.</p>`}</div>
        ${u.trademark.note ? html`<div class="muted" style="font-size:14px">Что нужно исправить: ${u.trademark.note}</div>` : ''}
        <div class="adm-person-act">
          <a class="btn btn-soft btn-sm" href="${d.user.tmReview.fips}" target="_blank" rel="noopener">${ic('search', 16)}Реестр Роспатента</a>
          <a class="btn btn-soft btn-sm" href="https://egrul.nalog.ru/index.html" target="_blank" rel="noopener">${ic('search', 16)}ЕГРЮЛ/ЕГРИП</a>
          ${u.trademark.status === 'pending' ? html`<button class="btn btn-accent btn-sm" data-tm-ok ${u.business && u.business.status === 'verified' ? '' : raw('disabled title="Сначала подтвердите ИНН"')}>Проверить и выдать галочку</button>` : ''}
          ${u.trademark.status !== 'rejected' ? html`<button class="btn btn-line btn-sm" data-tm-no>${u.trademark.live ? 'Снять галочку' : 'Вернуть на исправление'}</button>` : ''}
        </div>
      </div>` : ''}
      ${u.plan ? html`<div class="adm-biz is-verified"><div class="adm-biz-head"><b>${u.plan.trial ? 'Пробный ' : 'Тариф '}«${u.plan.name}»</b><span class="pf-badge ok">до ${dateLong(u.plan.until)}</span></div>
        ${u.shop && (u.shop.about || u.shop.cover || u.shop.site) ? html`<div class="muted" style="font-size:14px">Витрина: ${u.shop.about ? `«${u.shop.about.slice(0, 140)}${u.shop.about.length > 140 ? '…' : ''}»` : 'без описания'}${u.shop.site ? ` · ${u.shop.site}` : ''}</div>
        <div class="adm-person-act"><a class="btn btn-soft btn-sm" href="/u/${u.id}" target="_blank">${ic('store', 16)}Витрина</a><button class="btn btn-line btn-sm" data-shop-clear="${u.id}">Очистить витрину</button></div>` : html`<div class="muted" style="font-size:14px">Витрина не заполнена.</div>`}
        <a href="/admin?status=payments" class="muted" style="font-size:13px;text-decoration:underline">Платежи и возвраты</a></div>` : ''}
      ${svcBrief(u, d.services)}
      ${u.blocked ? html`<div class="banner danger"><strong>Заблокирован${u.blockedAt ? ` ${when(u.blockedAt)}` : ''}${blockedBy && blockedBy.admin ? ` · ${blockedBy.admin.name}` : ''}.</strong> ${u.blockReason || 'Причина не указана.'}</div>` : ''}
      <div class="adm-facts">${[
        ['Email', u.email], ['Телефон', u.phone || '—'],
        ['Объявления', ['active', 'pending', 'rejected', 'sold', 'archived'].filter((k) => d.counts[k]).map((k) => `${MY_STATUS[k].toLowerCase()} ${d.counts[k]}`).join(' · ') || 'нет'],
        ['Поддержка', d.support ? `${d.support.messages} ${plural(d.support.messages, 'сообщение', 'сообщения', 'сообщений')}${d.support.waiting ? ' · ждёт ответа' : ''}` : 'не писал']
      ].map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>
      <div class="adm-person-act">
        <button class="btn btn-dark btn-sm" data-support="${u.id}">${ic('headset', 18)}Написать</button>
        <a class="btn btn-soft btn-sm" href="/u/${u.id}" target="_blank">${ic('eye', 18)}Публичный профиль</a>
        ${u.avatar ? html`<button class="btn btn-soft btn-sm" data-ava-remove="${u.id}">${ic('image', 18)}Убрать фото</button>` : ''}
        ${u.isAdmin || u.deletedAt ? '' : html`<button class="btn ${u.blocked ? 'btn-line' : 'btn-danger'} btn-sm" data-block="${u.id}" data-blocked="${u.blocked ? '1' : ''}">${ic('lock', 18)}${u.blocked ? 'Разблокировать' : 'Заблокировать'}</button>`}
      </div>
      ${u.isAdmin ? '' : u.deletedAt ? html`<div class="banner danger"><strong>Профиль удалён навсегда ${when(u.deletedAt)}.</strong> Личные данные стёрты, объявления удалены; платежи сохранены обезличенно.</div>`
  : html`<div class="adm-del">
        ${u.deactivatedAt ? html`<span class="adm-del-note">${ic('clock', 16, 2)}Профиль временно удалён ${when(u.deactivatedAt)}</span><button class="btn btn-soft btn-sm" data-u-restore>Восстановить</button>`
  : html`<span class="adm-del-note">Удаление профиля</span><button class="btn btn-line btn-sm" data-u-off>Удалить временно</button>`}
        <button class="btn btn-danger btn-sm" data-u-erase>${ic('trash', 16)}Удалить навсегда</button>
      </div>`}
    </div>
    <div class="seg adm-seg" role="tablist">${tabs.map(([k, t], i) => html`<a role="tab" href="#" data-pane="${k}" class="${i ? '' : 'on'}" aria-selected="${i ? 'false' : 'true'}">${t}</a>`)}</div>
    <div id="pane">${panes.listings}</div>`, { title: 'Пользователь', back: '/admin?status=users' }));
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
  const tmOk = $('[data-tm-ok]');
  if (tmOk) tmOk.onclick = () => openModal(String(html`<h2>Выдать галочку «${u.trademark.name}»</h2>
      <p class="muted" style="margin:0">Свидетельство № ${u.trademark.number}, код заявки ${d.user.tmReview.code}. Отметьте каждый пункт — только после того, как сами проверили.</p>
      <fieldset class="g-kinds tm-checks">${Object.entries(d.user.tmReview.checks).map(([k, t]) => html`<label class="g-opt"><input type="checkbox" name="${k}"> ${t}</label>`)}</fieldset>
      <div class="field"><label for="tm-u">Действует до (по реестру)</label><input id="tm-u" type="date" class="input" value="${new Date(u.trademark.until).toISOString().slice(0, 10)}"></div>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-accent" data-ok disabled>Выдать галочку</button></div>`), (m, close) => {
    const boxes = $$('.tm-checks input', m); const ok = $('[data-ok]', m);
    boxes.forEach((x) => { x.onchange = () => { ok.disabled = !boxes.every((y) => y.checked); }; });
    $('[data-x]', m).onclick = close;
    ok.onclick = async () => {
      ok.disabled = true;
      try { await api('POST', `/api/admin/users/${u.id}/trademark`, { decision: 'approve', until: $('#tm-u', m).value, checks: Object.fromEntries(boxes.map((x) => [x.name, x.checked])) }); close(); toast('Галочка выдана — продавец получил уведомление'); render(); } catch (ex) { toast(ex.message, true); ok.disabled = false; }
    };
  });
  const tmNo = $('[data-tm-no]');
  if (tmNo) tmNo.onclick = () => reasonModal({ title: u.trademark.live ? 'Снять галочку бренда' : 'Вернуть заявку на исправление', hint: 'Причину увидит пользователь — он сможет исправить данные и документы и отправить заявку снова.', url: `/api/admin/users/${u.id}/trademark`, okLabel: u.trademark.live ? 'Снять' : 'Вернуть', extra: { decision: 'reject' }, reasons: ['Номер не найден в реестре Роспатента', 'Правообладатель — другая компания', 'Регистрация прекращена или срок истёк', 'Нет кода заявки в письме или письмо подписал не руководитель', 'Документ нечитаемый или не целиком', 'Вы лицензиат, а не правообладатель'], placeholder: 'Что не так — для пользователя' });
  $('[data-support]').onclick = async () => {
    try { const r = await api('POST', `/api/admin/users/${u.id}/support`); go(`/admin?status=support&t=${r.thread}`); } catch (e) { toast(e.message, true); }
  };
  // Удаление профиля модератором: временно (можно восстановить) и навсегда — со словом УДАЛИТЬ.
  const uOff = $('[data-u-off]');
  if (uOff) uOff.onclick = () => reasonModal({ title: `Удалить профиль ${u.name} временно?`, hint: 'Профиль и объявления скроются, пользователь выйдет на всех устройствах. Вернуть можно здесь же или сам пользователь — войдя и нажав «Восстановить».', url: `/api/admin/users/${u.id}/deactivate`, okLabel: 'Удалить временно', minText: 0, reasons: ['Просьба пользователя', 'Нарушение правил площадки', 'Подозрение на мошенничество'], placeholder: 'Причина — для журнала (необязательно)' });
  const uRe = $('[data-u-restore]');
  if (uRe) uRe.onclick = async () => { if (!(await confirmModal('Восстановить профиль?', 'Профиль снова будет виден. Объявления останутся в архиве — пользователь опубликует их сам.', 'Восстановить'))) return; try { await api('POST', `/api/admin/users/${u.id}/restore`); toast('Профиль восстановлен'); render(); } catch (e) { toast(e.message, true); } };
  const uEr = $('[data-u-erase]');
  if (uEr) uEr.onclick = () => eraseModal(`Удалить профиль ${u.name} навсегда?`, 'Личные данные сотрутся, объявления с фото, избранное и подписки удалятся. Платежи останутся обезличенными для учёта и возвратов. Отменить нельзя.', async (word) => { await api('POST', `/api/admin/users/${u.id}/erase`, { confirm: word }); toast('Профиль удалён навсегда'); render(); });
  const sc = $('[data-shop-clear]');
  if (sc) sc.onclick = () => reasonModal({ title: 'Очистить витрину', hint: 'Уберём описание, обложку, часы, адрес и сайт. Тариф продолжит действовать. Причину увидит продавец.', url: `/api/admin/users/${u.id}/shop/clear`, okLabel: 'Очистить', reasons: ['Контакты и мессенджеры в описании', 'Оскорбительное или недостоверное содержание', 'Ссылка на подозрительный сайт', 'Чужое фото на обложке'], placeholder: 'Что не так — для продавца' });
  bindModActions(app);
}

// Карточка пользователя в модерации (1.45.0): коротко, что идёт; подарить и отключить — в разделе «Реклама».
function svcBrief(u, sv) {
  sv = sv || { promos: [], boosts: [] };
  const parts = [u.plan ? `${u.plan.trial ? 'бесплатный тариф' : 'тариф'} «${u.plan.name}» до ${dateShort(u.plan.until)}` : '',
    sv.promos.length ? `реклама над поиском: ${sv.promos.length}` : '', sv.boosts.length ? `продвижение: ${sv.boosts.length}` : ''].filter(Boolean);
  return html`<div class="adm-svc adm-svc-brief"><span class="adm-svc-ic">${ic('megaphone', 18, 2)}</span><span class="adm-svc-txt"><b>Реклама и тариф</b><span>${parts.length ? parts.join(' · ') : 'ничего не подключено'}</span></span>
    <a class="btn btn-soft btn-sm" href="/admin?status=ads&u=${u.id}">${u.blocked ? 'Открыть' : 'Подарить или отключить'}</a></div>`;
}

// ---------- раздел «Реклама» (1.45.0): всё, что касается рекламы, тарифов и подарков, — в одном месте ----------
const SVC_REASONS = ['Нарушение правил площадки', 'Запрещённый товар или услуга', 'Жалобы покупателей', 'По просьбе продавца'];
const SVC_HINT = 'Причину увидит продавец. Деньги не возвращаются автоматически — возврат оформляется в «Платежах».';
const giftModal = (title, note, body, send, done) => openModal(String(html`<h2>${title}</h2><p class="muted" style="margin:0">${note}</p>${body}
    <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Подарить</button></div>`), (m, close) => {
  $('[data-x]', m).onclick = close;
  $('[data-ok]', m).onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { await send(m); close(); toast(done); render(); } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; }
  };
});
// Подарки выбранному пользователю: тариф — любому, реклама и продвижение — его объявлениям.
function bindGifts(root, u, listings) {
  const pickListing = (statuses) => html`<div class="field"><label for="g-l">Объявление</label><select id="g-l" class="select">${listings.filter((i) => statuses.includes(i.status))
    .map((i) => html`<option value="${i.id}">${i.title} · ${STATUS_LABEL[i.status].toLowerCase()}</option>`)}</select></div>`;
  const gp = $('[data-gift-plan]', root);
  if (gp) gp.onclick = () => giftModal(`Подарить тариф — ${u.name}`, 'Бесплатно, без оплаты. Если такой тариф уже есть — продлим на эти дни.',
    html`<div class="field"><label for="g-plan">Тариф</label><select id="g-plan" class="select"><option value="pro">«Магазин Про»</option><option value="shop">«Магазин»</option></select></div>
      <div class="field"><label for="g-days">Дней</label><input id="g-days" class="input" inputmode="numeric" value="90"></div>`,
    (m) => api('POST', `/api/admin/users/${u.id}/plan`, { plan: $('#g-plan', m).value, days: $('#g-days', m).value }), 'Тариф подарен — продавец получил уведомление');
  const gr = $('[data-gift-promo]', root);
  if (gr) gr.onclick = () => giftModal('Подарить рекламу над поиском', 'Бесплатно: объявление появится в блоке «Реклама» над выдачей. Если реклама уже идёт — продлим.',
    html`${pickListing(['active'])}<div class="field"><label for="g-days">Дней (1–90)</label><input id="g-days" class="input" inputmode="numeric" value="7"></div>`,
    (m) => api('POST', `/api/admin/listings/${$('#g-l', m).value}/promo`, { days: $('#g-days', m).value }), 'Реклама подарена — продавец получил уведомление');
  const gb = $('[data-gift-boost]', root);
  if (gb) gb.onclick = () => giftModal('Подарить продвижение в ленте', 'Бесплатно, на 7 дней. Объявление на проверке — начнётся с публикацией.',
    html`${pickListing(['active', 'pending', 'scheduled', 'rejected'])}
      <fieldset class="g-kinds"><legend>Что включить</legend>
        <label class="g-opt"><input type="checkbox" name="g-xl" checked> XL-карточка</label>
        <label class="g-opt"><input type="checkbox" name="g-frame" checked> Яркая рамка</label></fieldset>
      <fieldset class="g-kinds"><legend>Метки на фото — до двух</legend>
        ${S.config.billing.boostTags.map((t) => html`<label class="g-opt"><input type="checkbox" name="g-tag" value="${t}"> ${t}</label>`)}</fieldset>`,
    (m) => {
      const tags = $$('[name="g-tag"]:checked', m).map((x) => x.value);
      return api('POST', `/api/admin/listings/${$('#g-l', m).value}/boost`, { xl: $('[name="g-xl"]', m).checked, frame: $('[name="g-frame"]', m).checked, tags });
    }, 'Продвижение подарено — продавец получил уведомление');
}
// Отключить идущее (даже оплаченное): тариф, рекламу над поиском, продвижение.
function bindStops(root) {
  $$('[data-svc-plan]', root).forEach((b) => { b.onclick = () => reasonModal({ title: `Отключить тариф — ${b.dataset.name}`, hint: SVC_HINT, url: `/api/admin/users/${b.dataset.svcPlan}/plan/stop`, okLabel: 'Отключить тариф', reasons: SVC_REASONS, placeholder: 'Почему отключаем — для продавца' }); });
  $$('[data-svc-promo]', root).forEach((b) => { b.onclick = () => reasonModal({ title: 'Отключить рекламу над поиском', hint: SVC_HINT, url: `/api/admin/ads/${b.dataset.svcPromo}/stop`, okLabel: 'Отключить рекламу', reasons: SVC_REASONS, placeholder: 'Почему отключаем — для продавца' }); });
  $$('[data-svc-boost]', root).forEach((b) => { b.onclick = () => reasonModal({ title: 'Отключить продвижение', hint: SVC_HINT, url: `/api/admin/boosts/${b.dataset.svcBoost}/stop`, okLabel: 'Отключить продвижение', reasons: SVC_REASONS, placeholder: 'Почему отключаем — для продавца' }); });
}

export async function renderAdsAdmin(box, q) {
  const uid = parseInt(q.get('u') || '0', 10) || 0;
  const tab = ['plans', 'promos', 'boosts'].includes(q.get('t')) ? q.get('t') : 'promos';
  const [d, stt, bill, target] = await Promise.all([api('GET', '/api/admin/ads'), api('GET', '/api/admin/starter'), api('GET', '/api/admin/billing'),
    uid ? api('GET', `/api/admin/users/${uid}`).catch(() => null) : null]);
  const pr = bill.prices;
  const priceIn = (name, v, label) => html`<label class="price-in"><span>${label}</span><input class="input" name="${name}" inputmode="numeric" value="${v}"><em>₽</em></label>`;
  const who = (x) => html`<a href="/admin?status=ads&u=${x.id}">${x.name}</a> <span class="muted">${x.email}</span>`;
  const row = (icon, t, sub, attr) => html`<div class="adm-svc-row"><span class="adm-svc-ic">${ic(icon, 18, 2)}</span><span class="adm-svc-txt"><b>${t}</b><span>${sub}</span></span><button type="button" class="btn btn-line btn-sm" ${raw(attr)}>Отключить</button></div>`;
  const lists = {
    promos: d.promos.map((p) => row('megaphone', p.title, html`${who(p.user)} · до ${dateShort(p.endsAt)} · показы ${NF.format(p.shows)}, переходы ${NF.format(p.clicks)}${p.gift ? ' · подарок' : ''}${p.listingId ? html` · <a href="/admin/l/${p.listingId}">объявление</a>` : ''}`, `data-svc-promo="${Number(p.id)}"`)),
    boosts: d.boosts.map((b) => row('bolt', `${b.title}${b.kinds.length ? ` — ${b.kinds.join(', ')}` : ''}`, html`${who(b.user)} · ${b.status === 'active' ? `до ${dateShort(b.endsAt)}` : 'начнётся после проверки'}${b.gift ? ' · подарок' : ''}${b.listingId ? html` · <a href="/admin/l/${b.listingId}">объявление</a>` : ''}`, `data-svc-boost="${Number(b.id)}"`)),
    plans: d.plans.map((p) => row('store', `«${p.plan.name}»${p.plan.trial ? ' · бесплатный' : ''}`, html`${who(p.user)} · до ${dateShort(p.plan.until)}`, `data-svc-plan="${Number(p.user.id)}" data-name="${p.user.name}"`))
  };
  const TABS = [['promos', 'Реклама над поиском', d.promos.length], ['boosts', 'Продвижение в ленте', d.boosts.length], ['plans', 'Тарифы', d.plans.length]];
  const tu = target && target.user;
  const has = (st) => target && target.listings.some((i) => st.includes(i.status));
  box.innerHTML = String(html`<div class="adm-head"><h1>Реклама</h1><span class="muted">Тарифы, реклама над поиском, продвижение в ленте и подарки</span></div>
    <div class="dash-tiles ads-tiles">
      ${TABS.map(([k, t, n]) => html`<a class="dash-tile" href="/admin?status=ads&t=${k}${uid ? `&u=${uid}` : ''}#ads-now"><b>${NF.format(n)}</b><span>${t}</span><small>идёт сейчас</small></a>`)}
      <a class="dash-tile" href="#ads-start"><b>${stt.on ? `${stt.used} / ${stt.limit}` : 'выкл.'}</b><span>Бесплатный старт</span><small>${stt.on ? `осталось мест: ${Math.max(0, stt.limit - stt.used)}` : 'выключен'}</small></a>
    </div>

    <section class="panel ads-gift">
      <h2 class="h2" style="margin:0">${ic('gift', 20, 2)} Подарить</h2>
      <form id="ads-find" class="search adm-search">${ic('search', 18)}<label class="sr" for="ads-q">Пользователь</label><input id="ads-q" name="q" placeholder="Email, имя или № пользователя" value="${tu ? tu.email : ''}" autocomplete="off"></form>
      <div id="ads-found"></div>
      ${uid && !tu ? html`<p class="muted" style="margin:0">Пользователь № ${uid} не найден.</p>` : ''}
      ${tu ? html`<div class="ads-target">
        <div class="ads-who">${ava(tu)}<span><b>${nameSeal(tu.name, { tm: tu.trademark && tu.trademark.live ? tu.trademark : null })}</b><span class="muted">${tu.email} · № ${tu.id}${tu.plan ? ` · ${tu.plan.trial ? 'бесплатный ' : ''}«${tu.plan.name}» до ${dateShort(tu.plan.until)}` : ' · без тарифа'}</span></span>
          <a class="btn btn-soft btn-sm" href="/admin/u/${tu.id}">Карточка</a></div>
        ${tu.blocked ? html`<div class="banner danger">Пользователь заблокирован — дарить нельзя.</div>` : html`<div class="adm-person-act">
          <button type="button" class="btn btn-dark btn-sm" data-gift-plan>${ic('store', 16)}Подарить тариф</button>
          <button type="button" class="btn btn-soft btn-sm" data-gift-promo ${has(['active']) ? '' : raw('disabled title="Нет опубликованных объявлений"')}>${ic('megaphone', 16)}Подарить рекламу</button>
          <button type="button" class="btn btn-soft btn-sm" data-gift-boost ${has(['active', 'pending', 'scheduled', 'rejected']) ? '' : raw('disabled title="Нет подходящих объявлений"')}>${ic('bolt', 16)}Подарить продвижение</button></div>`}
        ${tu.plan || target.services.promos.length || target.services.boosts.length ? html`<div class="adm-svc">
          ${tu.plan ? row('store', `${tu.plan.trial ? 'Бесплатный тариф' : 'Тариф'} «${tu.plan.name}»`, `до ${dateLong(tu.plan.until)}`, `data-svc-plan="${tu.id}" data-name="${tu.name}"`) : ''}
          ${target.services.promos.map((p) => row('megaphone', 'Реклама над поиском', html`<a href="/admin/l/${p.listingId}">«${p.title}»</a> · до ${dateShort(p.endsAt)}`, `data-svc-promo="${Number(p.id)}"`))}
          ${target.services.boosts.map((b) => row('bolt', `Продвижение${b.kinds.length ? `: ${b.kinds.join(', ')}` : ''}`, html`<a href="/admin/l/${b.listingId}">«${b.title}»</a> · ${b.status === 'active' ? `до ${dateShort(b.endsAt)}` : 'начнётся после проверки'}`, `data-svc-boost="${Number(b.id)}"`))}</div>` : ''}
      </div>` : html`<p class="muted" style="margin:0;font-size:14px">Найдите пользователя — подарите тариф любому, а рекламу и продвижение — его объявлениям. Всё бесплатно, пользователь получит уведомление.</p>`}
    </section>

    <section class="panel" id="ads-now">
      <h2 class="h2" style="margin:0">Идёт сейчас</h2>
      <div class="seg adm-seg" role="tablist">${TABS.map(([k, t, n]) => html`<a role="tab" href="/admin?status=ads&t=${k}${uid ? `&u=${uid}` : ''}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab ? 'true' : 'false'}">${t} · ${n}</a>`)}</div>
      ${lists[tab].length ? html`<div class="adm-svc">${lists[tab]}</div>` : html`<p class="muted" style="margin:0">Сейчас ничего не идёт.</p>`}
      <p class="muted" style="margin:0;font-size:13px">Отключение не возвращает деньги — возврат оформляется в <a href="/admin?status=payments" style="text-decoration:underline">«Платежах»</a>.</p>
    </section>

    <div class="mail-grid">
      <form class="panel settings" id="starter" style="max-width:none">
        <div class="adm-head" style="margin:0" id="ads-start"><h2 class="h2" style="margin:0">Бесплатный старт</h2><span class="pf-badge ${stt.on ? 'ok' : ''}">${stt.on ? `занято ${stt.used} из ${stt.limit}` : 'выключено'}</span></div>
        <p class="muted" style="margin:0;font-size:14px">Первые бизнес-аккаунты сами выбирают «Магазин» или «Магазин Про» за 0 ₽ на странице «Для бизнеса»; дальше — по обычной цене, если продлят. Один раз на аккаунт и на ИНН. Там же видно, сколько мест осталось.</p>
        <label class="switch"><span>Бесплатный старт включён<small>Выключите — новые подключения прекратятся, выданные продолжат действовать</small></span><input type="checkbox" name="on" ${stt.on ? raw('checked') : ''}><span class="track"></span></label>
        <div class="row stack-m">
          <div class="field" style="flex:1"><label for="st-days">Дней бесплатно</label><input id="st-days" name="days" class="input" inputmode="numeric" value="${stt.days}"></div>
          <div class="field" style="flex:1"><label for="st-limit">Мест</label><input id="st-limit" name="limit" class="input" inputmode="numeric" value="${stt.limit}"></div>
        </div>
        <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить</button></div>
      </form>
      <form class="panel settings" id="prices" style="max-width:none">
        <h2 class="h2" style="margin:0">Цены</h2>
        <p class="muted" style="margin:0;font-size:14px">Новые цены сразу видны на сайте; уже оплаченное не меняется.</p>
        <h3 class="set-h3">${ic('store', 18, 2)}«Магазин»</h3><div class="price-row">${[1, 3, 12].map((m) => priceIn(`shop.${m}`, pr.shop[m], `${m} мес.`))}</div>
        <h3 class="set-h3">${ic('store', 18, 2)}«Магазин Про»</h3><div class="price-row">${[1, 3, 12].map((m) => priceIn(`pro.${m}`, pr.pro[m], `${m} мес.`))}</div>
        <h3 class="set-h3">${ic('bolt', 18, 2)}Продвижение в ленте · 7 дней</h3><div class="price-row">${[['xl', 'XL'], ['frame', 'Рамка'], ['tags', 'Метки'], ['all', 'Всё в одном']].map(([k, t]) => priceIn(`boost.${k}`, pr.boost[k], t))}</div>
        <h3 class="set-h3">${ic('megaphone', 18, 2)}Реклама над поиском</h3><div class="price-row">${[3, 7, 30].map((dd) => priceIn(`promo.${dd}`, pr.promo[dd], `${dd} ${plural(dd, 'день', 'дня', 'дней')}`))}</div>
        <div class="field"><label for="pd">Скидка на рекламу над поиском для «Магазин Про», %</label><input id="pd" name="proDiscount" class="input" inputmode="numeric" value="${pr.proDiscount}"></div>
        <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить цены</button><button type="button" class="btn btn-soft" data-defaults>Цены по умолчанию</button></div>
      </form>
    </div>`);
  const after = async (msg) => { S.config = await api('GET', '/api/config'); toast(msg); render(); };
  $('#ads-find', box).onsubmit = async (e) => {
    e.preventDefault();
    const qv = e.target.q.value.trim();
    const out = $('#ads-found', box);
    if (!qv) { out.innerHTML = ''; return; }
    try {
      const r = await api('GET', `/api/admin/users?${new URLSearchParams({ q: qv })}`);
      if (r.items.length === 1) { go(`/admin?status=ads&u=${r.items[0].id}`); return; }
      out.innerHTML = String(r.items.length ? html`<div class="ads-found">${r.items.slice(0, 8).map((x) => html`<a href="/admin?status=ads&u=${x.id}">${ava(x)}<span><b>${x.name}</b><span class="muted">${x.email} · № ${x.id}</span></span></a>`)}</div>` : html`<p class="muted" style="margin:0">Никого не нашли.</p>`);
    } catch (ex) { toast(ex.message, true); }
  };
  if (tu) bindGifts(box, tu, target.listings);
  bindStops(box);
  $('#starter', box).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api('PUT', '/api/admin/starter', { on: f.on.checked, days: f.days.value, limit: f.limit.value }); await after('Сохранено'); } catch (ex) { toast(ex.message, true); }
  };
  const collect = (f) => { const b = { shop: {}, pro: {}, promo: {}, boost: {} }; for (const [k, v] of new FormData(f).entries()) { const [g, n] = k.split('.'); if (n) b[g][n] = v; else b[g] = parseInt(v, 10); } return b; };
  $('#prices', box).onsubmit = async (e) => { e.preventDefault(); try { await api('PUT', '/api/admin/billing', { prices: collect(e.target) }); await after('Цены сохранены'); } catch (ex) { toast(ex.message, true); } };
  $('[data-defaults]', box).onclick = async () => { try { await api('PUT', '/api/admin/billing', { prices: bill.defaults }); await after('Вернули цены по умолчанию'); } catch (ex) { toast(ex.message, true); } };
}

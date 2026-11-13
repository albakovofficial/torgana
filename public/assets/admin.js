'use strict';
// Модерация Торганы (1.51.2) — отдельный файл: грузится только при заходе в /admin,
// поэтому покупатели и продавцы этот код не скачивают. T — общие помощники из app.js.
window.TorganaAdmin = function (T) {
  const { $, $$, CANCEL_REASON, CONDITION_LABEL, MONTHS, MY_STATUS, MY_TAG, NF, P, PAY_STATUS, S, api, app, authPage, ava, catName, codeForm, confirmModal, dateLong, dateShort, eraseModal, esc, go, hm, html, ic, mountChat, nameSeal, navLink, openModal, plural, price, raw, reasonModal, render, renderPushDevice, repLine, requireAuth, rub, setTitle, shortWhen, since, subName, supportAva, svg, toast, trustBadges, verifiedSeal, viewNotFound, when } = T;
  const setCleanup = T.setCleanup; // что сделать при уходе со страницы (таймеры, чат)
  // ================= модерация =================
  const REASONS = ['Запрещённый товар или услуга', 'Фото не соответствует описанию', 'Неверная категория', 'Признаки мошенничества', 'Контакты или ссылки в тексте и на фото', 'Повторное объявление', 'Оскорбительное содержание'];
  const BLOCK_REASONS = ['Мошенничество', 'Продажа запрещённого', 'Спам и повторные объявления', 'Чужие фото и подделки', 'Оскорбления'];

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
  const STATUS_LABEL = { pending: 'На проверке', scheduled: 'Запланировано', active: 'Опубликовано', rejected: 'Отклонено', sold: 'Продано', archived: 'Снято', deleted: 'Удалено автором' };

  // ---------- оболочка модерации: меню слева (на телефоне — лента сверху) ----------
  // 1.47.2: меню модерации проще — 14 пунктов вместо 24. Статусы объявлений — вкладки одного раздела,
  // «Оплата» — вкладка «Платежей», все настройки — один раздел с плитками.
  const ADMIN_NAV = [
    ['', [['dash', 'chart', 'Сводка']]],
    ['Ждут решения', [['pending', 'inbox', 'На проверке', 'pending'], ['reports', 'flag', 'Жалобы', 'reports'], ['appeals', 'reply', 'Апелляции', 'appeals'], ['rep', 'star', 'Репутация', 'rep'], ['support', 'headset', 'Поддержка', 'support'], ['biz', 'shield', 'Бизнес', 'biz']]],
    ['Сайт', [['active', 'tag', 'Объявления'], ['users', 'users', 'Пользователи'], ['sources', 'trend', 'Откуда приходят'], ['log', 'list', 'Журнал действий']]],
    ['Деньги', [['ads', 'megaphone', 'Реклама'], ['payments', 'card', 'Платежи']]],
    ['', [['settings', 'gear', 'Настройки']]]
  ];
  // Подразделы → пункт меню, который подсвечивается.
  const ADMIN_PARENT = { rejected: 'active', sold: 'active', archived: 'active', billing: 'payments', notify: 'settings', mail: 'settings', oauth: 'settings', ai: 'settings', seo: 'settings', backup: 'settings', site: 'settings' };
  const LISTING_STATUS_TABS = [['active', 'Опубликованные'], ['rejected', 'Отклонённые'], ['sold', 'Проданные'], ['archived', 'Снятые']];
  const ADMIN_SETTINGS = [['notify', 'bell', 'Мои уведомления', 'Push и письма о новом'], ['mail', 'mail', 'Почта', 'Отправка писем, коды, очередь'], ['oauth', 'lock', 'Вход через сервисы', 'Яндекс ID и VK ID'], ['apns', 'phone', 'Приложение iPhone', 'Push через Apple, ссылки в приложение'],
    ['ai', 'sparkle', 'ИИ по фото', 'Заполнение объявления по фото'], ['seo', 'search', 'Поиск и статистика', 'Вебмастер, Метрика, карта сайта'], ['backup', 'shield', 'Копии и безопасность', 'Резервные копии базы, защита входа'], ['site', 'refresh', 'Версия сайта', 'Обновления и откат']];
  const adminLabel = (k) => { const x = ADMIN_NAV.flatMap((g) => g[1]).find(([key]) => key === k) || ADMIN_SETTINGS.find(([key]) => key === k); return x ? x[2] : ({ rejected: 'Отклонённые', sold: 'Проданные', archived: 'Снятые', billing: 'Настройки оплаты' }[k] || 'Модерация'); };
  const LISTING_TABS = ['pending', 'reports', 'appeals', 'active', 'rejected', 'sold', 'archived'];
  document.addEventListener('click', (e) => { if (e.target.closest('[data-adm-menu]') && S.adm) adminMenu(S.adm.active, S.adm.stats); });
  function adminShell(active, stats, body) {
    const on = ADMIN_PARENT[active] || active;
    S.adm = { active, stats };
    const badge = (k) => (k && stats[k] ? html`<span class="badge">${stats[k]}</span>` : '');
    const waiting = ADMIN_NAV[1][1].filter(([, , , cnt]) => stats[cnt]);
    const cur = ADMIN_NAV.flatMap((g) => g[1]).find(([k]) => k === on);
    return html`<div class="wrap adm">
      <aside class="adm-side">
        <div class="adm-title">Модерация</div>
        <nav class="pf-nav adm-nav" aria-label="Разделы модерации">${ADMIN_NAV.map(([group, items]) => html`
          ${group ? html`<div class="pf-nav-h">${group}</div>` : ''}
          ${items.map(([k, icon, label, cnt]) => navLink(`/admin?status=${k}`, icon, label, k === on, badge(cnt)))}`)}
        </nav>
      </aside>
      <section class="adm-main">
        <div class="adm-mbar">
          <button type="button" class="adm-switch" data-adm-menu aria-haspopup="dialog">${ic(cur ? cur[1] : 'list', 18, 2)}<span>${cur ? cur[2] : 'Модерация'}</span>${ic('down', 16, 2.2)}</button>
          ${waiting.length ? html`<nav class="adm-quick" aria-label="Ждут решения">${waiting.map(([k, icon, label, cnt]) => html`<a href="/admin?status=${k}" class="${k === on ? 'on' : ''}">${ic(icon, 15, 2)}${label}<b>${stats[cnt]}</b></a>`)}</nav>` : ''}
        </div>
        ${body}
      </section>
    </div>`;
  }
  // Телефон: все разделы — плитками в нижней панели (вместо длинной ленты кнопок).
  function adminMenu(active, stats) {
    const on = ADMIN_PARENT[active] || active;
    openModal(String(html`<div class="nt-top"><h2>Модерация</h2><button type="button" class="icon-btn" data-x aria-label="Закрыть">${ic('close', 20, 2)}</button></div>
      <div class="adm-sheet">${ADMIN_NAV.map(([group, items]) => html`${group ? html`<div class="adm-sheet-h">${group}</div>` : ''}<div class="adm-tiles">${items.map(([k, icon, label, cnt]) => html`<a href="/admin?status=${k}" class="${k === on ? 'on' : ''}"><span class="adm-tile-ic">${ic(icon, 20, 2)}</span><span>${label}</span>${cnt && stats[cnt] ? html`<b>${stats[cnt]}</b>` : ''}</a>`)}</div>`)}</div>`), (m, close) => {
      m.classList.add('adm-sheet-modal'); m.setAttribute('aria-label', 'Разделы модерации');
      $('[data-x]', m).onclick = close;
      m.addEventListener('click', (e) => { if (e.target.closest('a[href]')) close(); });
    });
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
    else if (['payments', 'billing'].includes(status) && headEl) headEl.insertAdjacentHTML('afterend', String(tabs([['payments', 'Платежи'], ['billing', 'Настройки оплаты']])));
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
    if (status === 'listings') { go('/admin?status=active', true); return; }
    setTitle(`${adminLabel(status)} — модерация`);
    const [stats, dev] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', '/api/admin/device').catch(() => null)]);
    const arm = dev && dev.required && !dev.armed ? html`<div class="banner warn adm-arm">${ic('shield', 20, 2)}<div><b>Защита входа в модерацию не включена.</b> Подтвердите это устройство кодом из письма — после этого на новых устройствах модерация будет открываться только по коду.</div><a class="btn btn-dark btn-sm" href="/admin/device">Включить</a></div>` : '';
    app.innerHTML = String(adminShell(status, stats, html`${arm}<div id="adm-box" class="adm-box"><div class="loader"></div></div>`));
    const box = $('#adm-box');
    const extraUrl = { mail: '/api/admin/mail', site: '/api/admin/update' }[status];
    const extra = extraUrl ? await api('GET', extraUrl) : null;
    const head = (h1, right = '') => html`<div class="adm-head"><h1>${h1}</h1>${right}</div>`;
    const R = {
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
    await renderListingsAdmin(box, status, q.get('q') || '', head(['active', 'rejected', 'sold', 'archived'].includes(status) ? 'Объявления' : adminLabel(status)));
    adminSubNav(box, status);
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
  const USER_FILTERS = [['all', 'Все'], ['new', 'Новые за неделю'], ['reported', 'С жалобами'], ['biz', 'Заявки бизнеса'], ['blocked', 'Заблокированные'], ['admins', 'Модераторы']];
  const userBadges = (u) => html`${u.isAdmin ? html`<span class="pf-badge">${ic('shield', 13, 2)} ${u.isOwner ? 'Владелец' : 'Модератор'}</span>` : ''}
    ${u.blocked ? html`<span class="pf-badge bad">${ic('lock', 13, 2)} Заблокирован</span>` : ''}
    ${u.reports ? html`<span class="pf-badge warn">${ic('flag', 13, 2)} Жалоб: ${u.reports}</span>` : ''}
    ${u.bizPending ? html`<span class="pf-badge warn">${ic('shield', 13, 2)} Заявка бизнеса</span>` : ''}${u.tmPending ? html`<span class="pf-badge warn">${verifiedSeal(13)} Заявка на бренд</span>` : ''}
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
      <a class="pf-back always" href="/admin?status=users">${ic('left', 18, 2)}Пользователи</a>
      <div class="adm-person panel">
        <div class="adm-person-top">${ava(u, 'xl')}
          <div class="adm-person-txt"><h1>${nameSeal(u.name, { tm: u.trademark && u.trademark.live ? u.trademark : null })}</h1>
            <div class="muted">№ ${u.id} · на Торгане с ${since(u.createdAt)}</div>
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
          ['Email', u.email], ['Телефон', u.phone || '—'], ['Город', u.city || '—'],
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

  async function renderAdsAdmin(box, q) {
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

  // ---------- репутация (1.46.0): жалобы по сделкам и подозрительные сделки ----------
  async function renderRepAdmin(box) {
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
  function logRow(e) {
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

  async function renderLogAdmin(box, q) {
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

  // ---------- откуда приходят люди ----------
  const SRC_NAME = { vk: 'ВКонтакте', instagram: 'Instagram', telegram: 'Telegram', max: 'MAX', yandex: 'Яндекс', 'yandex-direct': 'Яндекс Директ', google: 'Google', dzen: 'Дзен', ok: 'Одноклассники', avito: 'Авито', direct: 'Прямые заходы', unknown: 'До начала учёта' };
  async function renderSourcesAdmin(box, q) {
    const days = ['7', '30', '90', '365'].includes(q.get('days')) ? q.get('days') : '30';
    const d = await api('GET', `/api/admin/sources?days=${days}`);
    const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}`.replace('.', ',') + '%' : '—');
    const max = Math.max(1, ...d.items.map((r) => r.signups));
    box.innerHTML = String(html`<div class="adm-head"><h1>Откуда приходят</h1></div>
      <div class="pf-status">${[['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней'], ['365', 'Год']].map(([k, t]) => html`<a class="chip ${k === days ? 'active' : ''}" href="/admin?status=sources&days=${k}">${t}</a>`)}</div>
      <div class="stats">${[['заходов', d.total.visits], ['регистраций', d.total.signups], ['стали продавцами', d.total.sellers], ['объявлений от них', d.total.listings]].map(([k, n]) => html`<div class="stat"><div class="n">${NF.format(n)}</div><div class="k">${k}</div></div>`)}</div>
      ${d.items.length ? html`<div class="src-tbl" role="table">
        <div class="src-row src-h" role="row"><span>Источник</span><span>Заходы</span><span>Регистрации</span><span>Конверсия</span><span>Продавцы</span><span>Объявления</span></div>
        ${d.items.map((r) => html`<div class="src-row" role="row"><span class="src-name"><b>${SRC_NAME[r.src] || r.src}</b>${r.campaign ? html`<small>${r.campaign}</small>` : ''}<i style="width:${Math.round((r.signups / max) * 100)}%"></i></span>
          <span>${NF.format(r.visits)}</span><span><b>${NF.format(r.signups)}</b></span><span>${pct(r.signups, r.visits)}</span><span>${NF.format(r.sellers)}</span><span>${NF.format(r.listings)}</span></div>`)}</div>`
    : html`<div class="empty"><h3>Пока пусто</h3><p>Заходы начнут считаться с этой версии сайта.</p></div>`}
      <section class="panel src-link"><h2 class="h2" style="margin:0">Ссылка с меткой</h2>
        <p class="muted" style="margin:0;font-size:14px">Ставьте такие ссылки в посты, рекламу и сторис — и здесь будет видно, сколько людей пришло и сколько из них стали продавцами.</p>
        <div class="row stack-m"><div class="field" style="flex:1"><label for="sl-src">Где разместите</label><select id="sl-src" class="select">${['vk', 'max', 'telegram', 'instagram', 'yandex-direct', 'dzen', 'ok'].map((k) => html`<option value="${k}">${SRC_NAME[k]}</option>`)}</select></div>
          <div class="field" style="flex:1"><label for="sl-c">Метка кампании <small class="muted">— по желанию</small></label><input id="sl-c" class="input" placeholder="например, post-velosiped" autocomplete="off"></div></div>
        <div class="oa-copy"><code id="sl-url"></code><button type="button" class="btn btn-soft btn-sm" id="sl-copy">Скопировать</button></div>
        <p class="muted" style="margin:0;font-size:13px">Без метки тоже считаем: если человек перешёл из ВКонтакте, Яндекса или Google, источник определится по сайту, с которого он пришёл. «Прямые заходы» — набрали адрес сами или открыли из закладок и мессенджеров, которые не сообщают источник.</p>
      </section>`);
    const upd = () => { const c = $('#sl-c').value.trim().toLowerCase().replace(/[^a-z0-9а-яё_.-]+/gi, '-'); $('#sl-url').textContent = `${location.origin}/?utm_source=${$('#sl-src').value}${c ? `&utm_campaign=${encodeURIComponent(c)}` : ''}`; };
    $('#sl-src').onchange = upd; $('#sl-c').oninput = upd; upd();
    $('#sl-copy').onclick = async () => { const t = $('#sl-url').textContent; try { await navigator.clipboard.writeText(t); toast('Скопировано'); } catch { toast(t); } };
  }

  // ---------- ИИ по фото: Яндекс AI Studio ----------
  // 1.56.0: приложение для iPhone — ключ Apple для push (APNs). Он же даёт Team ID для ссылок torgana.ru → приложение.
  async function renderApnsAdmin(box) {
    const a = await api('GET', '/api/admin/apns');
    box.innerHTML = String(html`<div class="adm-head"><h1>Приложение iPhone</h1><span class="pf-badge ${a.ready ? 'ok' : ''}">${a.ready ? 'push подключены' : 'не подключено'}</span></div>
      <p class="muted" style="margin:0;max-width:720px">Push в приложение Торгана приходят через Apple. Нужен ключ APNs из Apple Developer — один на все приложения команды.
        С ним же ссылки torgana.ru открываются сразу в приложении. Устройств с приложением: <b>${NF.format(a.devices)}</b>.</p>
      <form id="apns-f" class="oa-grid"><section class="panel oa-card">
        <div class="oa-head"><h2 class="h2">Ключ Apple Push</h2><span class="pf-badge ${a.ready ? 'ok' : ''}">${a.ready ? 'сохранён' : 'нет ключа'}</span></div>
        <ol class="ai-steps">
          <li><a href="https://developer.apple.com/account/resources/authkeys/list" target="_blank" rel="noopener">Certificates, Identifiers &amp; Profiles → Keys</a> → «+».</li>
          <li>Имя «Torgana Push», галочка <b>Apple Push Notifications service (APNs)</b> → Continue → Register.</li>
          <li>Скачайте файл <code>AuthKey_….p8</code> (его дают один раз), откройте в Блокноте и вставьте ниже целиком. Key ID — рядом с ключом.</li>
          <li>Team ID — <a href="https://developer.apple.com/account#MembershipDetailsCard" target="_blank" rel="noopener">Membership details</a>.</li>
        </ol>
        <div class="row stack-m"><div class="field" style="flex:1"><label for="ap-team">Team ID</label><input id="ap-team" name="teamId" class="input" value="${a.teamId}" autocomplete="off" maxlength="10" placeholder="10 символов"></div>
          <div class="field" style="flex:1"><label for="ap-kid">Key ID</label><input id="ap-kid" name="keyId" class="input" value="${a.keyId}" autocomplete="off" maxlength="10" placeholder="10 символов"></div></div>
        <div class="field"><label for="ap-key">Ключ .p8</label><textarea id="ap-key" name="key" class="input" rows="5" autocomplete="off" spellcheck="false" style="height:auto;font-family:ui-monospace,monospace;font-size:13px" placeholder="${a.hasKey ? 'сохранён — оставьте пустым, чтобы не менять' : '-----BEGIN PRIVATE KEY-----'}"></textarea></div>
        <details class="ai-more"><summary>Bundle ID</summary><div class="field"><label for="ap-topic">Bundle ID приложения</label><input id="ap-topic" name="topic" class="input" value="${a.topic}" autocomplete="off"></div></details>
        <div class="ai-act"><button class="btn btn-dark" type="submit">Сохранить</button><button class="btn btn-soft" type="button" id="ap-test" ${a.ready ? '' : raw('disabled')}>Проверить на моём iPhone</button>${a.ready ? html`<button class="btn btn-line" type="button" id="ap-off">Удалить ключ</button>` : ''}</div>
        <p class="muted" style="margin:0;font-size:13px">Проверка придёт на iPhone, где открыто приложение Торгана под вашим аккаунтом и разрешены уведомления${a.mine ? ` (у вас: ${a.mine})` : ''}.</p>
        ${a.lastError ? html`<p style="margin:0;font-size:13px;color:var(--danger)">Последняя ошибка Apple (${new Date(a.lastError.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}): ${a.lastError.text}</p>` : ''}
      </section></form>`);
    $('#apns-f').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try { await api('PUT', '/api/admin/apns', { teamId: f.teamId.value, keyId: f.keyId.value, key: f.key.value, topic: f.topic.value }); toast('Ключ сохранён'); renderApnsAdmin(box); } catch (ex) { toast(ex.message, true); }
    };
    $('#ap-test').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await api('POST', '/api/admin/apns/test'); toast('Отправили — посмотрите на iPhone'); } catch (ex) { toast(ex.message, true); renderApnsAdmin(box); return; }
      b.disabled = false;
    };
    const off = $('#ap-off');
    if (off) off.onclick = async () => { if (!(await confirmModal('Удалить ключ Apple?', 'Push в приложение перестанут приходить, ссылки torgana.ru перестанут открываться в приложении.', 'Удалить', true))) return; try { await api('PUT', '/api/admin/apns', { clear: true }); toast('Ключ удалён'); renderApnsAdmin(box); } catch (ex) { toast(ex.message, true); } };
  }

  async function renderAiAdmin(box) {
    const a = await api('GET', '/api/admin/ai');
    const state = a.off ? ['', 'выключено'] : a.provider === 'yandex' ? ['ok', 'подключено'] : a.provider ? ['ok', 'работает через Claude'] : ['', 'не подключено'];
    box.innerHTML = String(html`<div class="adm-head"><h1>ИИ по фото</h1></div>
      <p class="muted" style="margin:0;max-width:720px">Продавец загружает первое фото — и Торгана сама заполняет название, категорию, раздел, главные характеристики и описание. Фото распознаёт модель ${a.defaults.vision} в Яндекс AI Studio, текст пишет Алиса AI. Серверы — в России.</p>
      <form id="ai-f" class="oa-grid"><section class="panel oa-card">
        <div class="oa-head"><h2 class="h2">Яндекс AI Studio</h2><span class="pf-badge ${state[0]}">${state[1]}</span></div>
        <ol class="ai-steps">
          <li>Откройте <a href="https://console.yandex.cloud" target="_blank" rel="noopener">консоль Yandex Cloud</a> и выберите каталог. Его идентификатор (начинается с b1g…) — в адресной строке и на странице каталога.</li>
          <li>«Сервисные аккаунты» → создайте аккаунт с ролью <code>ai.languageModels.user</code>.</li>
          <li>В аккаунте: «Создать новый ключ» → «API-ключ». Скопируйте секрет — он показывается один раз.</li>
        </ol>
        <div class="field"><label for="ai-key">API-ключ</label><input id="ai-key" name="key" class="input" type="password" autocomplete="new-password" placeholder="${a.hasKey ? 'сохранён — оставьте пустым, чтобы не менять' : a.fromEnv ? 'задан на сервере' : 'AQVN…'}"></div>
        <div class="field"><label for="ai-folder">Идентификатор каталога</label><input id="ai-folder" name="folder" class="input" value="${a.folder}" autocomplete="off" placeholder="b1g…"></div>
        <details class="ai-more"><summary>Модели</summary>
          <div class="field"><label for="ai-vision">Распознавание фото</label><input id="ai-vision" name="vision" class="input" value="${a.vision}" autocomplete="off"></div>
          <div class="field"><label for="ai-text">Текст объявления <small class="muted">— пусто, чтобы не переписывать</small></label><input id="ai-text" name="text" class="input" value="${a.text}" autocomplete="off"></div>
        </details>
        <label class="switch"><span>Выключить ИИ по фото<small>Продавцы будут заполнять объявление сами</small></span><input type="checkbox" name="off" ${a.off ? raw('checked') : ''}><span class="track"></span></label>
        <div class="ai-act"><button class="btn btn-dark" type="submit">Сохранить</button><button class="btn btn-soft" type="button" id="ai-test" ${a.provider === 'yandex' ? '' : raw('disabled')}>Проверить</button></div>
        <p class="ai-res hidden" id="ai-res" role="status"></p>
      </section></form>`);
    $('#ai-f').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api('PUT', '/api/admin/ai', { key: f.key.value.trim(), folder: f.folder.value.trim(), vision: f.vision.value.trim(), text: f.text.value.trim(), off: f.off.checked });
        S.config = await api('GET', '/api/config').catch(() => S.config);
        toast('Сохранено'); renderAiAdmin(box);
      } catch (ex) { toast(ex.message, true); }
    };
    $('#ai-test').onclick = async (e) => {
      const b = e.currentTarget; const res = $('#ai-res');
      b.disabled = true; b.textContent = 'Проверяем…';
      try { const r = await api('POST', '/api/admin/ai/test'); res.className = 'ai-res ok'; res.textContent = `Работает — Алиса ответила: «${r.answer}»`; } catch (ex) { res.className = 'ai-res bad'; res.textContent = ex.message; }
      b.disabled = false; b.textContent = 'Проверить';
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

  // ---------- оплата: подключение ЮKassa (цены и бесплатный старт — в разделе «Реклама», 1.45.0) ----------
  async function renderBillingAdmin(box) {
    const d = await api('GET', '/api/admin/billing');
    const c = d.config;
    const opt = (map, cur) => Object.entries(map).map(([k, t]) => html`<option value="${k}" ${String(cur) === k ? raw('selected') : ''}>${t}</option>`);
    box.innerHTML = String(html`<div class="adm-head"><h1>Оплата</h1><span class="pf-badge ${c.ready ? 'ok' : ''}">${c.ready ? (c.test ? 'тестовый магазин' : 'ЮKassa подключена') : 'не подключена'}</span></div>
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
  }

  // ---------- поиск и статистика: Вебмастер, Search Console, Метрика ----------
  async function renderSeoAdmin(box) {
    const d = await api('GET', '/api/admin/seo');
    const s = d.seo;
    const step = (n, t, body) => html`<li><span class="seo-n">${n}</span><div><b>${t}</b><p>${body}</p></div></li>`;
    box.innerHTML = String(html`<div class="adm-head"><h1>Поиск и статистика</h1></div>
      <div class="mail-grid">
        <form class="panel settings" id="seo-f" style="max-width:none">
          <h2 class="h2" style="margin:0">Подключение</h2>
          <div class="field"><label for="sy">Яндекс.Вебмастер — код подтверждения</label><input id="sy" name="yandex" class="input" value="${s.yandex}" placeholder="например 1a2b3c4d5e6f7a8b" autocomplete="off"><span class="help">Можно вставить весь тег &lt;meta name="yandex-verification" …&gt; — возьмём код сами.</span></div>
          <div class="field"><label for="sg">Google Search Console — код подтверждения</label><input id="sg" name="google" class="input" value="${s.google}" placeholder="необязательно" autocomplete="off"></div>
          <div class="field"><label for="sm">Яндекс.Метрика — номер счётчика</label><input id="sm" name="metrika" class="input" inputmode="numeric" value="${s.metrika}" placeholder="например 98765432" autocomplete="off"><span class="help">Счётчик включается только у тех, кто нажал «Хорошо» в плашке cookie. Вебвизор выключен.</span></div>
          <div class="field"><label for="smk">Яндекс Карты — ключ JavaScript API</label><input id="smk" name="mapsKey" class="input" value="${s.mapsKey}" placeholder="например 0a1b2c3d-…" autocomplete="off"><span class="help">С ключом в поиске появляется переключатель «Список | Карта». Без ключа карты нет.</span></div>
          <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить</button></div>
        </form>
        <section class="panel settings" style="max-width:none">
          <h2 class="h2" style="margin:0">Как подключить</h2>
          <ol class="seo-steps">
            ${step(1, 'Вебмастер', html`На <a href="https://webmaster.yandex.ru" target="_blank" rel="noopener" style="text-decoration:underline">webmaster.yandex.ru</a> добавьте сайт https://torgana.ru → способ «Мета-тег» → скопируйте код сюда и сохраните → нажмите «Проверить» в Вебмастере.`)}
            ${step(2, 'Карта сайта', html`В Вебмастере: «Индексирование → Файлы Sitemap» → добавьте <code>${d.sitemap}</code>. Она обновляется сама.`)}
            ${step(3, 'Яндекс Товары', html`В Вебмастере: «Товары и цены → Фиды» → «Добавить фид» → <code>${d.feed}</code>. Объявления-вещи с ценой и фото появятся в товарном блоке выдачи. Фид обновляется раз в час.`)}
            ${step(4, 'Метрика', html`На <a href="https://metrika.yandex.ru" target="_blank" rel="noopener" style="text-decoration:underline">metrika.yandex.ru</a> создайте счётчик для torgana.ru без Вебвизора → номер счётчика — сюда.`)}
            ${step(5, 'Google', 'По желанию: Search Console → «Тег HTML» → код сюда, затем добавьте ту же карту сайта.')}
            ${step(6, 'Карта объявлений', html`В <a href="https://developer.tech.yandex.ru" target="_blank" rel="noopener" style="text-decoration:underline">Кабинете разработчика Яндекса</a> → «Подключить API» → «JavaScript API и HTTP Геокодер» → в ограничениях укажите сайт torgana.ru → ключ сюда.`)}
          </ol>
          <div class="oa-copy"><code>${d.robots}</code><a class="btn btn-soft btn-sm" href="${d.robots}" target="_blank" rel="noopener">Открыть</a></div>
          <div class="seo-now"><b>IndexNow</b> — Яндекс узнаёт о новых, изменённых и снятых объявлениях за минуты, настраивать ничего не нужно.
            ${d.indexnow.on ? html`${d.indexnow.lastAt ? html`Последняя отправка — ${new Date(d.indexnow.lastAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}, адресов: ${d.indexnow.lastCount}. Всего отправлено: ${d.indexnow.sent}.` : 'Первая отправка — в ближайшие минуты.'}${d.indexnow.error ? html` <span style="color:var(--danger)">Ошибка: ${d.indexnow.error}</span>` : ''}` : 'Включится на настоящем адресе сайта (https).'}</div>
        </section>
      </div>`);
    $('#seo-f', box).onsubmit = async (e) => {
      e.preventDefault();
      try { await api('PUT', '/api/admin/seo', Object.fromEntries(new FormData(e.target).entries())); S.config = await api('GET', '/api/config'); toast('Сохранено'); render(); } catch (ex) { toast(ex.message, true); }
    };
  }

  // ---------- копии в облако, состояние сервера, устройства модератора ----------
  const fmtBytes = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} ГБ` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
  async function renderBackupAdmin(box) {
    const [d, dev] = await Promise.all([api('GET', '/api/admin/backup'), api('GET', '/api/admin/devices')]);
    const c = d.config;
    const sv = d.server;
    const owner = S.user.isOwner || !sv.owner;
    const L = d.last;
    const lastLine = d.running ? html`<div class="bk-state run"><span class="bk-dot"></span><div><b>Делаем копию…</b><span>${d.running.step || 'база'} · начали ${hm(d.running.at)}</span></div></div>`
      : L ? (L.ok ? html`<div class="bk-state ok">${ic('check', 20, 2.4)}<div><b>Последняя копия — ${when(L.at)}</b><span>база ${fmtBytes(L.dbSize)} · ${L.files ? `новых фото и видео: ${NF.format(L.files)} (${fmtBytes(L.bytes)})` : 'новых фото не было'} · ${L.seconds} с</span></div></div>`
        : html`<div class="bk-state bad">${ic('warn', 20, 2)}<div><b>Копия не сделана — ${when(L.at)}</b><span>${L.error}</span></div></div>`)
        : html`<div class="bk-state">${ic('clock', 20, 2)}<div><b>Копий в облаке ещё не было</b><span>${d.ready ? 'Первая — сегодня ночью или по кнопке «Сделать копию сейчас»' : 'Укажите хранилище слева'}</span></div></div>`;
    const V = d.verify;
    const verifyLine = V ? html`<div class="bk-state ${V.ok ? 'ok' : 'bad'}">${ic(V.ok ? 'shield' : 'warn', 20, 2)}<div><b>${V.ok ? 'Копия проверена' : 'Проверка нашла расхождения'} — ${when(V.at)}</b>
        <span>копия от ${when(V.made)} (${fmtBytes(V.size)}), всего копий базы: ${V.copies}. В копии: ${NF.format(V.copy.users)} польз., ${NF.format(V.copy.listings)} объявл., ${NF.format(V.copy.messages)} сообщ.; на сайте сейчас: ${NF.format(V.live.users)}, ${NF.format(V.live.listings)}, ${NF.format(V.live.messages)}. Фото: проверено ${V.photos.ok} из ${V.photos.checked}, в облаке ${NF.format(V.photos.total)}.</span></div></div>` : '';
    const disk = sv.disk ? Math.round((1 - sv.disk.free / sv.disk.total) * 100) : null;
    box.innerHTML = String(html`<div class="adm-head"><h1>Копии и безопасность</h1></div>
      <div class="mail-grid">
        <form class="panel settings" id="bk-f" style="max-width:none">
          <div><h2 class="h2" style="margin:0">Копия в облако Selectel</h2>
            <p class="muted" style="margin:6px 0 0;font-size:14px">Каждую ночь с 3:00 до 6:00 по Москве база (сжатая, хранится 30 дней) и новые фото и видео уходят в объектное хранилище. Даже если сервер сломается целиком, всё восстановится из облака.</p></div>
          <div class="field"><label for="bk-e">Адрес хранилища (S3)</label><input id="bk-e" name="endpoint" class="input" value="${c.endpoint}" placeholder="s3.ru-1.storage.selcloud.ru" autocomplete="off" ${owner ? '' : raw('disabled')}></div>
          <div class="row2"><div class="field"><label for="bk-b">Контейнер</label><input id="bk-b" name="bucket" class="input" value="${c.bucket}" placeholder="torgana-backup" autocomplete="off" ${owner ? '' : raw('disabled')}></div>
            <div class="field"><label for="bk-r">Регион</label><input id="bk-r" name="region" class="input" value="${c.region}" placeholder="ru-1" autocomplete="off" ${owner ? '' : raw('disabled')}></div></div>
          <div class="field"><label for="bk-a">Access key</label><input id="bk-a" name="accessKey" class="input" value="${c.accessKey}" autocomplete="off" spellcheck="false" ${owner ? '' : raw('disabled')}></div>
          <div class="field"><label for="bk-s">Secret key</label><input id="bk-s" name="secretKey" class="input" type="password" autocomplete="new-password" placeholder="${c.hasSecret ? 'сохранён — оставьте пустым, чтобы не менять' : ''}" ${owner ? '' : raw('disabled')}></div>
          <div class="field"><label for="bk-p">Папка в контейнере</label><input id="bk-p" name="prefix" class="input" value="${c.prefix}" placeholder="torgana" autocomplete="off" ${owner ? '' : raw('disabled')}><span class="help">При сохранении проверим доступ: запишем и удалим маленький файл.</span></div>
          ${owner ? html`<div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить и проверить</button>${d.ready ? html`<button type="button" class="btn btn-line" data-bk-clear>Отключить</button>` : ''}</div>` : html`<p class="muted" style="margin:0;font-size:13px">Ключи хранилища меняет только владелец сайта.</p>`}
        </form>
        <section class="panel settings" style="max-width:none">
          <h2 class="h2" style="margin:0">Состояние копий</h2>
          ${lastLine}
          ${verifyLine}
          <div class="set-btns"><button type="button" class="btn btn-accent" data-bk-run ${d.ready && !d.running ? '' : raw('disabled')}>${ic('refresh', 18, 2)}Сделать копию сейчас</button>
            <button type="button" class="btn btn-soft" data-bk-verify ${d.ready && d.lastOk ? '' : raw('disabled')}>${ic('shield', 18, 2)}Проверить копию</button></div>
          <p class="muted" style="margin:0;font-size:13px">«Проверить копию» скачивает последнюю копию базы из облака, проверяет её целостность, сравнивает с сайтом и сверяет несколько фото. В облаке уже ${NF.format(d.uploaded.n)} фото и видео (${fmtBytes(d.uploaded.b)}).</p>
          <details class="bk-how"><summary>Как получить ключи в Selectel</summary><ol>
            <li>Панель Selectel → «Объектное хранилище» → создайте <b>приватный</b> контейнер, например <code>torgana-backup</code>.</li>
            <li>«Управление доступом» → «Сервисные пользователи» → добавьте пользователя с ролью «Пользователь объектного хранилища» для этого проекта.</li>
            <li>У пользователя → «S3-ключи» → «Добавить ключ»: Access key и Secret key — сюда.</li>
            <li>Адрес и регион — в настройках контейнера (например, <code>s3.ru-1.storage.selcloud.ru</code>, регион <code>ru-1</code>).</li></ol></details>
        </section>
      </div>
      <div class="mail-grid" style="margin-top:20px">
        <section class="panel settings" style="max-width:none">
          <h2 class="h2" style="margin:0">Сервер</h2>
          <div class="kv">
            <span>Свободно на диске</span><b class="${disk !== null && disk > 90 ? 'danger-t' : ''}">${sv.disk ? `${fmtBytes(sv.disk.free)} из ${fmtBytes(sv.disk.total)} (занято ${disk}%)` : '—'}</b>
            <span>Копия на самом сервере</span><b>${sv.localBackup ? when(sv.localBackup) : 'нет данных'}</b>
            <span>Ошибок за час / сутки</span><b class="${sv.errorsHour >= 5 ? 'warn-t' : ''}">${sv.errorsHour} / ${sv.errorsDay}</b>
            <span>Письма о сбоях</span><b>${sv.mail ? sv.owner || 'первому модератору' : 'почта не подключена'}</b>
          </div>
          ${sv.lastErrors.length ? html`<ul class="bk-errs">${sv.lastErrors.map((e) => html`<li><span>${hm(e.at)}</span>${e.msg}</li>`)}</ul>` : ''}
          <p class="muted" style="margin:0;font-size:13px">Сервер пишет владельцу, если копия не сделана, на диске меньше 2 ГБ, копия на сервере старше суток или за 10 минут больше 10 ошибок. Доступность сайта снаружи каждые 5 минут проверяет GitHub — при падении придёт письмо от GitHub.</p>
        </section>
        <section class="panel settings" style="max-width:none">
          <h2 class="h2" style="margin:0">Мои устройства</h2>
          <p class="muted" style="margin:0;font-size:14px">Когда защита включена, модерация открывается только на подтверждённых устройствах: на новом — код из письма. Устройство помним 30 дней. Включается защита первым подтверждённым кодом — так никто не окажется заперт, если письма не доходят.</p>
          ${dev.items.length ? html`<div class="bk-devs">${dev.items.map((x) => html`<div class="bk-dev"><span class="bk-dev-ic">${ic(/iPhone|Android/.test(x.label) ? 'chat' : 'eye', 18, 2)}</span>
              <span class="bk-dev-t"><b>${x.label}${x.current ? html` <span class="tag accent">это устройство</span>` : ''}</b><span>${x.ip ? `IP ${x.ip} · ` : ''}заходили ${when(x.lastAt)} · до ${dateShort(x.until)}</span></span>
              <button type="button" class="btn btn-line btn-sm" data-dev-rm="${x.id}">${x.current ? 'Выйти' : 'Забыть'}</button></div>`)}</div>`
    : html`<div class="qr-empty">${S.config.mail ? 'Подтверждённых устройств нет.' : 'Почта не подключена — коды не отправить, поэтому модерация пока открывается без кода.'}</div>`}
        </section>
      </div>`);
    const f = $('#bk-f', box);
    if (owner) {
      f.onsubmit = async (e) => {
        e.preventDefault();
        const b = $('button[type=submit]', f); b.disabled = true; b.textContent = 'Проверяем доступ…';
        try { await api('PUT', '/api/admin/backup', Object.fromEntries(new FormData(f).entries())); toast('Хранилище подключено — доступ проверен'); renderBackupAdmin(box); } catch (ex) { toast(ex.message, true); b.disabled = false; b.textContent = 'Сохранить и проверить'; }
      };
      const cl = $('[data-bk-clear]', box);
      if (cl) cl.onclick = async () => { if (!(await confirmModal('Отключить копию в облако?', 'Новые копии перестанут уходить в хранилище. Уже сделанные останутся в Selectel.', 'Отключить', true))) return; try { await api('PUT', '/api/admin/backup', { clear: true }); toast('Отключено'); renderBackupAdmin(box); } catch (ex) { toast(ex.message, true); } };
    }
    const run = $('[data-bk-run]', box);
    run.onclick = async () => {
      run.disabled = true;
      try {
        await api('POST', '/api/admin/backup/run');
        toast('Копия началась — это займёт от минуты до нескольких');
        const poll = async () => { if (!box.isConnected) return; const x = await api('GET', '/api/admin/backup'); if (x.running) setTimeout(poll, 3000); else { renderBackupAdmin(box); toast(x.last && x.last.ok ? 'Копия готова' : 'Копия не сделана — подробности на странице', !(x.last && x.last.ok)); } };
        setTimeout(poll, 1500);
        renderBackupAdmin(box);
      } catch (ex) { toast(ex.message, true); run.disabled = false; }
    };
    if (d.running) setTimeout(async () => { if (box.isConnected && $('[data-bk-run]', box)) renderBackupAdmin(box); }, 4000);
    const ver = $('[data-bk-verify]', box);
    ver.onclick = async () => {
      ver.disabled = true; ver.textContent = 'Скачиваем и проверяем…';
      try { const r = await api('POST', '/api/admin/backup/verify'); toast(r.verify.ok ? 'Копия в порядке' : 'Проверка нашла расхождения', !r.verify.ok); renderBackupAdmin(box); } catch (ex) { toast(ex.message, true); renderBackupAdmin(box); }
    };
    $$('[data-dev-rm]', box).forEach((b) => {
      b.onclick = async () => { try { await api('DELETE', `/api/admin/devices/${b.dataset.devRm}`); toast('Устройство забыто'); render(); } catch (ex) { toast(ex.message, true); } };
    });
  }

  // Модерация с нового устройства: код из письма (lib/ops.js). Ниже кода — что стало с письмом:
  // принято почтовым сервисом (тогда искать в «Спаме») или не ушло (с текстом ошибки).
  async function viewDevice() {
    setTitle('Вход в модерацию');
    const st = await api('GET', '/api/admin/device').catch(() => ({}));
    if (st.confirmed || (st.trusted && st.armed)) { if (location.pathname === '/admin/device') go('/admin', true); else render(); return; }
    const arming = !st.armed; // защита ещё не включена — человек включает её сам
    authPage(arming ? 'Защита модерации' : 'Вход в модерацию', arming
      ? `Пришлём код на ${st.email || 'вашу почту'}. Когда введёте его, модерация на новых устройствах будет открываться только по коду из письма — даже если кто-то узнает пароль. Это устройство запомним на 30 дней.`
      : `Это устройство мы видим впервые. Чтобы модерацию не открыл никто, кроме вас, — даже зная пароль, — пришлём код на ${st.email || 'вашу почту'}. Устройство запомним на 30 дней.`,
      html`<div id="dev-code"><button type="button" class="btn btn-dark btn-lg btn-block" data-dev-send>${ic('mail', 18, 2)}Отправить код</button></div><div id="dev-mail" class="dev-mail" aria-live="polite"></div>`,
      html`<p class="alt"><a href="/">На главную</a></p>`);
    let timer = null;
    const paint = (x) => {
      const box = $('#dev-mail');
      if (!box || !x) return;
      const L = x.letter;
      if (x.armed && x.trusted && !x.confirmed) { clearTimeout(timer); toast('Почта сейчас не работает — модерация открыта без кода. Почините её в разделе «Почта»', true); render(); return; }
      box.innerHTML = String(!L ? '' : L.status === 'sent'
        ? html`<div class="bk-state ok">${ic('check', 20, 2.4)}<div><b>Письмо отправлено в ${hm(L.sentAt)}</b><span>Почтовый сервис его принял. Если письма нет пару минут — посмотрите «Спам» и «Рассылки», найдите «код для входа в модерацию».</span></div></div>`
        : L.error
          ? html`<div class="bk-state bad">${ic('warn', 20, 2)}<div><b>${L.status === 'failed' ? 'Письмо не отправлено' : `Письмо пока не ушло — пробуем ещё раз (попытка ${L.attempts})`}</b><span>Ответ почтового сервиса: ${L.error}</span></div></div>`
          : html`<div class="bk-state run"><span class="bk-dot"></span><div><b>Отправляем письмо…</b><span>Обычно это несколько секунд.</span></div></div>`);
      clearTimeout(timer);
      if (L && L.status === 'pending' && box.isConnected) timer = setTimeout(async () => paint(await api('GET', '/api/admin/device').catch(() => null)), 2500);
    };
    setCleanup(() => clearTimeout(timer));
    const watch = async () => paint(await api('GET', '/api/admin/device').catch(() => null));
    const startCode = (r) => codeForm($('#dev-code'), {
      email: r.email || st.email, wait: r.wait || 60,
      send: async () => { const x = await api('POST', '/api/admin/device/send'); setTimeout(watch, 800); return x; },
      check: async (code) => { await api('POST', '/api/admin/device/verify', { code }); toast(arming ? 'Защита включена — это устройство подтверждено на 30 дней' : 'Устройство подтверждено на 30 дней'); if (location.pathname === '/admin/device') go('/admin?status=backup', true); else render(); }
    });
    if (st.letter && st.letter.createdAt > Date.now() - 15 * 60 * 1000) { startCode({ email: st.email, wait: Math.max(0, 60 - Math.round((Date.now() - st.letter.createdAt) / 1000)) }); paint(st); return; }
    $('[data-dev-send]').onclick = async (e) => {
      e.currentTarget.disabled = true;
      try { const r = await api('POST', '/api/admin/device/send'); startCode(r); setTimeout(watch, 800); } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; }
    };
  }

  // ---------- мои уведомления ----------
  async function renderNotifyAdmin(box) {
    const cur = await api('GET', '/api/admin/me/notify');
    const MODES = [['instant', 'Сразу', 'Одним письмом в течение минуты после нового'], ['hourly', 'Раз в час', 'Сводка всего нового за час'], ['off', 'Не присылать', 'Смотрю сам на сайте']];
    const KINDS = [['pending', 'Новые объявления на проверку', 'И изменённые — после правки они снова в очереди'], ['reports', 'Жалобы на объявления', ''], ['support', 'Сообщения в поддержку', 'Только те, что ещё никто не прочитал']];
    // 1.47.2: push — сразу, на этот телефон или компьютер; отдельно от писем.
    // 1.53.0: + новые продавцы, долгое ожидание, апелляции, медали, итоги дня, сбои сайта (порядок — как на сервере).
    const PUSH = [['pending', 'Новые и изменённые объявления', 'Не чаще раза в 2 минуты — со счётчиком очереди'],
      ['sellers', 'Новые продавцы', 'Первое объявление человека — вместо обычного «на проверку»'],
      ['waiting', 'Объявления долго ждут', 'Если ждут проверки дольше часа — днём, не чаще раза в час'],
      ['appeals', 'Апелляции', 'Продавец оспаривает отказ'], ['reports', 'Жалобы на объявления', ''], ['support', 'Сообщения в поддержку', ''],
      ['biz', 'Проверка бизнеса и галочки бренда', 'Новые заявки'], ['rep', 'Репутация', 'Жалобы по сделкам и подозрительные сделки'], ['pay', 'Оплаты', 'Каждая прошедшая оплата'],
      ['medals', 'Медали «Один из первых»', 'Медаль № 1, 10, 50, 100, 250, 500, 750, 900 и 1000'],
      ['digest', 'Итоги дня', 'В 21:00 по Москве: регистрации, объявления, проверка, оплаты'],
      ['ops', 'Сбои сайта', 'Резервные копии, место на диске, почта, ошибки сервера']];
    box.innerHTML = String(html`<div class="adm-head"><h1>Мои уведомления</h1></div>
      <form class="panel nt-form" id="ntp" style="margin-bottom:16px">
        <div><h2 class="h2">Push — сразу на телефон</h2><p class="muted" style="margin:4px 0 0">Приходят на устройства, где вы включили уведомления. Ваши собственные действия не присылаем.</p></div>
        <div id="ntp-dev"></div>
        <div class="nt-kinds">${PUSH.map(([k, t, sub]) => html`<label class="switch"><span>${t}${sub ? html`<small>${sub}</small>` : ''}</span><input type="checkbox" name="push" value="${k}" ${cur.push.includes(k) ? raw('checked') : ''}><span class="track"></span></label>`)}</div>
      </form>
      ${S.config.mail ? '' : html`<div class="banner warn" style="margin-bottom:16px">Почта ещё не подключена — письма начнут приходить после настройки в разделе <a href="/admin?status=mail" style="text-decoration:underline">«Почта»</a>.</div>`}
      <form class="panel nt-form" id="nt">
        <div><h2 class="h2">Письма — как часто</h2><p class="muted" style="margin:4px 0 0">Письма приходят на ${S.user.email}. У каждого модератора — свои настройки.</p></div>
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
    const fp = $('#ntp');
    fp.onchange = async (e) => {
      if (e.target.name !== 'push') return;
      try { await api('PUT', '/api/admin/me/notify', { push: $$('input[name=push]:checked', fp).map((x) => x.value) }); toast('Сохранено'); } catch (ex) { toast(ex.message, true); }
    };
    renderPushDevice($('#ntp-dev')).catch(() => {});
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
  async function viewAdminListing(id) {
    if (!requireAuth()) return;
    if (!S.user.isAdmin) { viewNotFound(); return; }
    const { listing: l, seller: u, events, reports, next } = await api('GET', `/api/admin/listings/${id}`);
    setTitle(`Проверка: ${l.title}`);
    const words = l.matches.flatMap((m) => m.words);
    const open = reports.filter((r) => !r.resolvedAt);
    const specs = [['Категория', catName(l.category)], ['Раздел', subName(l.subcategory) || '—'], ...(l.specs || []).map((x) => [x.label, x.value]),
      ['Цена', price(l.price, l.priceUnit)], ['Город', l.city], ...(l.metro ? [['Метро', l.metro]] : []), ...(l.district ? [['Район', l.district]] : []), ['Состояние', CONDITION_LABEL[l.condition]],
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
          ${l.video ? html`<div class="mod-video"><video src="${l.video}#t=0.1" controls playsinline preload="metadata"></video><span class="muted">${ic('video', 16)}Видео — проверьте так же, как фото: только этот товар, без контактов и ссылок</span></div>` : ''}
          <div class="mod-photos">${l.photos.length ? l.photos.map((p, i) => html`<a href="${p}" target="_blank" class="mod-photo" data-pv-src="${p}" data-pv-group="mod"><img src="${p}" alt="Фото ${i + 1}" loading="lazy"><span>${i + 1}</span></a>`) : html`<div class="empty" style="padding:28px"><p style="margin:0">Без фото</p></div>`}</div>
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
  async function renderSupportAdmin(box, threadId) {
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
        <span class="muted" style="font-size:13px;word-break:break-all">${u.email}${u.emailVerified ? '' : ' · не подтверждён'} · с ${since(u.createdAt)} · объявлений ${u.listings}${u.rejected ? ` · отклонено ${u.rejected}` : ''}${u.blocked ? ' · заблокирован' : ''}</span></div>`,
      load: (after) => api('GET', `/api/admin/support/${id}?after=${after}`),
      send: async (msg) => (await api('POST', `/api/admin/support/${id}/messages`, msg)).message,
      placeholder: 'Ответ от имени поддержки…'
    }));
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
  function renderMailAdmin(box, { config: c, stats: st, codes }) {
    const SECURITY = [['ssl', 'SSL (обычно порт 465)'], ['starttls', 'STARTTLS (порт 587 или 2525)']];
    const STATUS = { pending: 'в очереди', sent: 'отправлено', failed: 'не доставлено' };
    const KIND = { device: 'Код для модерации', ops: 'Владельцу о сбое', verify: 'Подтверждение email', reset: 'Восстановление пароля', message: 'Новое сообщение', moderation: 'Модерация', support: 'Ответ поддержки', account: 'Блокировка аккаунта', mod: 'Модератору о новом', billing: 'Оплата и тарифы', code: 'Код подтверждения', test: 'Проверка' };
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
          <div class="panel" style="display:flex;flex-direction:column;gap:12px">
            <h2 class="h2" style="margin:0">Коды по почте</h2>
            <label class="switch"><span>Спрашивать код из письма<small>6 цифр при регистрации и входе с неподтверждённой почтой, код для входа в модерацию с нового устройства</small></span><input type="checkbox" id="m-codes" ${codes ? raw('checked') : ''} ${c.ready ? '' : raw('disabled')}><span class="track"></span></label>
            ${codes ? '' : html`<div class="banner warn" style="font-size:14px">${c.ready ? 'Коды выключены: регистрация и вход — без кода, модерация — без подтверждения устройства. Включите, когда тестовое письмо дойдёт до почты.' : 'Почта не подключена — коды не отправить, поэтому они выключены.'}</div>`}
          </div>
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
    const mc = $('#m-codes', box);
    mc.onchange = async () => {
      if (mc.checked && !(await confirmModal('Включить коды по почте?', 'Убедитесь, что тестовое письмо дошло: иначе новые пользователи не смогут зарегистрироваться, а вы — войти в модерацию с нового устройства.', 'Включить'))) { mc.checked = false; return; }
      try { await api('PUT', '/api/admin/mail/codes', { on: mc.checked }); toast(mc.checked ? 'Коды включены' : 'Коды выключены'); render(); } catch (ex) { mc.checked = !mc.checked; toast(ex.message, true); }
    };
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

  return { viewAdmin, viewAdminListing, viewAdminUser, viewDevice };
};

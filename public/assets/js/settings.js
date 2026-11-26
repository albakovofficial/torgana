// Настройки: фото, имя и город, уведомления, пароль, удаление профиля.
import { $, $$, NATIVE, NF, PAY, S, api, app, ava, dateLong, dateShort, html, plural, price, raw } from './core.js';
import { pageCover } from './cover.js';
import { ic } from './icons.js';
import { confirmModal, openModal, pickList, toast } from './ui.js';
import { grid } from './cards.js';
import { THEMES, renderHeader, themeGet, themeSet } from './layout.js';
import { blockFlow, followBtn } from './messages.js';
import { go, setCleanup, setTitle } from './router.js';
import { listingFeed } from './home.js';
import { OAUTH, appleGo, oauthGo, verifyModal } from './auth.js';
import { levelMedal, repCard, repHow, repLine } from './reputation.js';
import { NOTIFY_ROWS, bindBizForm, bindIdCard, bizBlock, idCard, notifyCell, pickAvatar, removeAvatar, shareLink } from './profile.js';
import { firstMedal, firstName, nameSeal, planBadge, trustBadges } from './badges.js';
import { shopAbout } from './business.js';
import { refreshMe } from './main.js';

// ================= удаление профиля (1.39) =================
// «Напишите УДАЛИТЬ» — общее окно для пользователя и модератора.
export function eraseModal(title, text, onOk) {
  openModal(String(html`<h2>${title}</h2><p class="muted" style="margin:0">${text}</p>
    <div class="field" style="margin-top:14px"><label for="er-word">Напишите <b>УДАЛИТЬ</b>, чтобы подтвердить</label><input id="er-word" class="input" autocomplete="off" autocapitalize="characters"></div>
    <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-danger" data-ok disabled>Удалить навсегда</button></div>`), (m, close) => {
    const inp = $('#er-word', m); const ok = $('[data-ok]', m);
    inp.oninput = () => { ok.disabled = inp.value.trim().toUpperCase() !== 'УДАЛИТЬ'; };
    $('[data-x]', m).onclick = close;
    ok.onclick = async () => { ok.disabled = true; try { await onOk(inp.value.trim()); close(); } catch (e) { ok.disabled = false; toast(e.message, true); } };
    setTimeout(() => inp.focus(), 50);
  });
}
function bindAccountDelete() {
  const off = $('[data-acc-off]');
  if (off) {
    off.onclick = async () => {
      if (!(await confirmModal('Удалить профиль временно?', 'Профиль и объявления скроются, вы выйдете на всех устройствах. Вернуться можно в любой момент: войдите и нажмите «Восстановить».', 'Удалить временно', true))) return;
      try { await api('POST', '/api/me/deactivate'); S.user = null; go('/', true); toast('Профиль удалён временно. Чтобы вернуться — просто войдите'); } catch (e) { toast(e.message, true); }
    };
  }
  const er = $('[data-acc-erase]');
  if (er) er.onclick = () => eraseModal('Удалить профиль навсегда?', 'Объявления, фото, избранное, подписки и данные профиля удалятся. Восстановить их будет нельзя.', async (word) => {
    await api('POST', '/api/me/erase', { confirm: word }); S.user = null; go('/', true); toast('Профиль удалён');
  });
}
// После входа во временно удалённый профиль: вернуть или удалить навсегда.
export function viewDeactivated() {
  setTitle('Профиль удалён');
  app.innerHTML = String(html`<div class="wrap"><div class="acc-gone">
    <span class="acc-gone-ic">${ic('user', 30, 1.9)}</span>
    <h1>Профиль временно удалён</h1>
    <p>${dateLong(S.user.deactivatedAt)} вы удалили профиль. Его и ваши объявления никто не видит. Восстановите профиль — объявления будут ждать в архиве, их можно опубликовать снова.</p>
    <div class="acc-gone-act"><button class="btn btn-accent btn-lg" data-restore>Восстановить профиль</button><button class="btn btn-soft btn-lg" data-logout>Выйти</button></div>
    <button type="button" class="acc-gone-erase" data-acc-erase>Удалить навсегда</button>
  </div></div>`);
  $('[data-restore]').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { await api('POST', '/api/me/restore'); await refreshMe(); toast('С возвращением! Объявления — в архиве «Моих объявлений»'); go('/profile?status=archived', true); } catch (ex) { e.currentTarget.disabled = false; toast(ex.message, true); }
  };
  bindAccountDelete();
}

// ================= настройки =================
// Слева карточка и пять разделов, справа открыт один. Раздел — в #якоре, старая ссылка #s-photo ведёт в «Профиль».
// На телефоне без якоря — карточка и список разделов; раздел открывается своим экраном со ссылкой «Настройки».
export const SET_SECTIONS = [['sf', 'user', 'Профиль'], ['sn', 'bell', 'Уведомления'], ['sp', 'lock', 'Пароль и вход'], ['s-look', 'moon', 'Оформление'], ['s-block', 'ban', 'Чёрный список'], ['s-biz', 'shield', 'Для бизнеса'], ['s-acc', 'mail', 'Аккаунт']];
const SET_ALIAS = { 's-photo': 'sf' };
// Яндекс ID и VK ID: включённые на сайте и уже привязанные (отвязать можно, даже если вход выключили).
const myOauth = (u) => OAUTH.filter(([k]) => (S.config.oauth && S.config.oauth[k]) || u.oauth.includes(k));
export function viewSettings() {
  setTitle('Настройки');
  const u = S.user;
  const hash = location.hash.slice(1);
  const cur = SET_ALIAS[hash] || (SET_SECTIONS.some(([id]) => id === hash) ? hash : '');
  const mailOn = (k) => k && S.config.mail;
  const nAll = NOTIFY_ROWS.reduce((n, [, , p, m]) => n + (p ? 1 : 0) + (mailOn(m) ? 1 : 0), 0);
  const nOn = NOTIFY_ROWS.reduce((n, [, , p, m]) => n + (p && u[p] ? 1 : 0) + (mailOn(m) && u[m] ? 1 : 0), 0);
  const b = u.business;
  const hint = {
    sf: 'Фото, имя, город, телефон',
    sn: `Включено ${nOn} из ${nAll}`,
    sp: ['Пароль', ...myOauth(u).map(([, name]) => name)].join(', '),
    's-biz': b ? { verified: b.kind === 'ip' ? 'ИП проверен' : 'Компания проверена', pending: 'Заявка на проверке', rejected: 'Проверка не пройдена' }[b.status] : 'Значок «ИП проверен»',
    's-look': { auto: 'Как на устройстве', light: 'Светлое', dark: 'Тёмное' }[themeGet()],
    's-block': 'Кому нельзя вам писать',
    's-acc': u.email
  };
  app.innerHTML = String(html`<div class="wrap setx ${cur ? 'has-sec' : ''}">
    ${pageCover({ title: 'Настройки', sub: 'Как вас видят покупатели и как Торгана с вами связывается', back: '/profile', icon: 'gear', tone: 'gray', cls: 'setx-head' })}
    <aside class="setx-side">
      ${idCard(u)}
      <nav class="setx-nav" aria-label="Разделы настроек">${SET_SECTIONS.map(([id, icon, label]) => html`<a href="/profile/settings#${id}" data-sec="${id}"><span class="setx-ic">${ic(icon, 20)}</span><span class="setx-t"><b>${label}</b><small>${hint[id]}</small></span>${ic('right', 18, 2)}</a>`)}</nav>
      <a class="setx-pub" href="/u/${u.id}">${ic('eye', 18)}Как меня видят покупатели</a>
      <div class="setx-m"><a class="btn btn-soft" href="/profile">Мой профиль</a><button type="button" class="btn btn-soft" data-logout>Выйти</button></div>
    </aside>
    <section class="setx-main"><a class="setx-back" href="/profile/settings">${ic('left', 18, 2)}Настройки</a><div id="box" class="setx-panel"></div></section>
  </div>`);
  const again = () => viewSettings();
  bindIdCard(again);
  const open = (id) => {
    $$('[data-sec]').forEach((a) => { const on = a.dataset.sec === id; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    renderSettings(id, again);
  };
  // Разделы переключаются без перезагрузки страницы; «Назад» в браузере вернёт прошлый раздел.
  $('.setx-nav').addEventListener('click', (e) => {
    const a = e.target.closest('[data-sec]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    history.pushState({}, '', a.getAttribute('href'));
    $('.setx').classList.add('has-sec');
    open(a.dataset.sec);
    if (window.matchMedia('(max-width: 600px)').matches) window.scrollTo(0, 0);
  });
  open(cur || 'sf');
}

function renderSettings(sec, reload) {
  const u = S.user;
  const head = (t, sub) => html`<div class="set-h"><h2>${t}</h2><p>${sub}</p></div>`;
  const row = (icon, label, value, action = '') => html`<div class="set-row"><span class="set-ic">${ic(icon, 20)}</span><div><span class="set-k">${label}</span><span class="set-v">${value}</span></div>${action}</div>`;
  const oauth = myOauth(u);
  const names = oauth.map(([, name]) => name).join(' или ');
  const phoneNote = u.phoneVia
    ? html`<div class="set-note ok">${ic('shield', 18, 2)}<span>Подтверждён через ${u.phoneVia === 'vk' ? 'VK ID' : 'Яндекс ID'} — у объявлений значок «Телефон подтверждён». Другим пользователям номер не показывается.</span></div>`
    : oauth.length ? html`<div class="set-note">${ic('shield', 18, 2)}<span>Подтвердите номер через ${names} — у объявлений появится значок «Телефон подтверждён». Другим пользователям номер не показывается.</span><a href="/profile/settings#sp">Подтвердить</a></div>`
      : html`<span class="help">Другим пользователям не показывается</span>`;
  const body = {
    sf: () => html`${head('Профиль', 'Покупатели видят это в объявлениях и в чате')}
      <div class="set-ava" id="s-photo">${u.avatar ? ava(u, 'xl') : html`<span class="set-ava-empty">${ic('camera', 28, 1.8)}</span>`}
        <div class="set-ava-t"><b>Фото профиля</b><span>С фото вам чаще пишут. JPG, PNG или WebP — обрежем по кругу</span></div>
        <div class="set-btns"><button type="button" class="btn btn-accent" data-ava-set>${ic('camera', 18, 2)}${u.avatar ? 'Заменить' : 'Загрузить фото'}</button>${u.avatar ? html`<button type="button" class="btn btn-soft" data-ava-del>Убрать</button>` : ''}</div>
      </div>
      <form id="sf" class="set-form">
        <div class="set-fields">
          <div class="field"><label for="s-name">Имя</label><input id="s-name" name="name" class="input" maxlength="60" value="${u.name}" required autocomplete="name"></div>
          <div class="field wide"><label for="s-phone">Телефон</label><input id="s-phone" name="phone" class="input" type="tel" inputmode="tel" maxlength="30" value="${u.phone || ''}" placeholder="+7" autocomplete="tel">${phoneNote}</div>
        </div>
        <div class="set-foot"><span>Имя и фото сразу обновятся во всех ваших объявлениях</span><button type="reset" class="btn btn-soft">Отменить</button><button class="btn btn-accent" type="submit">Сохранить</button></div>
      </form>
      ${u.badges && u.badges.first ? html`<div class="set-medal">${firstMedal(46, u.badges.first.no)}<div class="set-medal-t"><b>Медаль № ${u.badges.first.no}</b>
        <span>Вы в первой тысяче продавцов Торганы — медаль видна в профиле и в ваших объявлениях. Как её подписать:</span>
        <div class="seg" role="radiogroup" aria-label="Подпись медали">${['m', 'f'].map((v) => html`<button type="button" role="radio" class="${u.badges.first.form === v ? 'on' : ''}" aria-checked="${u.badges.first.form === v ? 'true' : 'false'}" data-medal-form="${v}">${firstName(v)}</button>`)}</div></div></div>` : ''}`,
    sn: () => html`${head('Уведомления', 'О чём сообщать и куда. Переключатели сохраняются сразу')}
      <table class="ntf" id="sn">
        <thead><tr><th scope="col">Событие</th><th scope="col">${ic('phone', 16, 2)}Приложение</th>${S.config.mail ? html`<th scope="col">${ic('mail', 16, 2)}Письмо</th>` : ''}</tr></thead>
        <tbody>${NOTIFY_ROWS.filter(([, , p]) => p || S.config.mail).map(([t, sub, p, m]) => html`<tr><th scope="row"><b>${t}</b><small>${sub}</small></th><td>${notifyCell(u, p, t, 'Приложение')}</td>${S.config.mail ? html`<td>${notifyCell(u, m, t, 'Письмо')}</td>` : ''}</tr>`)}</tbody>
      </table>
      <p class="set-small">Push приходят в приложение Торгана на iPhone — включите уведомления в нём.${S.config.mail ? ` Письма — на ${u.email}.` : ''}</p>`,
    sp: () => html`${head('Пароль и вход', oauth.length ? `Входите по паролю или в одно касание через ${names}` : 'Пароль для входа на Торгану')}
      ${NATIVE || u.oauth.includes('apple') ? html`<div class="set-block"><h3>Apple ID</h3><div class="set-list"><div class="set-row oauth-apple"><span class="oauth-mark" aria-hidden="true"><span class="apple-glyph">\uF8FF</span></span><div><span class="set-v">Войти с Apple</span><span class="set-k">${u.oauth.includes('apple') ? 'Привязан' : 'Не привязан'}</span></div>
        ${u.oauth.includes('apple') ? html`<button type="button" class="btn btn-line btn-sm" data-unlink="apple">Отвязать</button>` : NATIVE ? html`<button type="button" class="btn btn-soft btn-sm" data-link-apple>Привязать</button>` : ''}</div></div></div>` : ''}
      ${oauth.length ? html`<div class="set-block"><h3>Быстрый вход</h3><div class="set-list">${oauth.map(([k, name]) => {
  const on = u.oauth.includes(k);
  return html`<div class="set-row oauth-${k}"><span class="oauth-mark" aria-hidden="true">${k === 'vk' ? 'VK' : 'Я'}</span><div><span class="set-v">${name}</span><span class="set-k">${on ? `Привязан${u.phoneVia === k ? ' · телефон подтверждён' : ''}` : 'Не привязан'}</span></div>
    ${on ? html`<button type="button" class="btn btn-line btn-sm" data-unlink="${k}">Отвязать</button>` : html`<button type="button" class="btn btn-soft btn-sm" data-link="${k}">Привязать</button>`}</div>`;
})}</div></div>` : ''}
      <form class="set-block set-form" id="sp" autocomplete="on">
        <h3>Сменить пароль</h3>
        <input type="email" name="username" value="${u.email}" autocomplete="username" hidden>
        <div class="set-fields">
          <div class="field"><label for="p-cur">Текущий пароль</label><input id="p-cur" name="current" class="input" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="p-new">Новый пароль</label><input id="p-new" name="password" class="input" type="password" minlength="8" autocomplete="new-password" required></div>
        </div>
        <div class="set-foot"><span>Минимум 8 символов. На других устройствах потребуется войти заново</span><button class="btn btn-accent" type="submit">Сменить пароль</button></div>
      </form>`,
    's-biz': () => html`${head('Для бизнеса', 'Значки доверия у имени — бесплатно и без тарифа')}${PAY ? html`<a class="trust-row shop-link" href="/profile/business"><span class="tr-ic">${ic('store', 20, 2)}</span><span class="tr-txt"><b>Мой магазин</b><small>Тариф, витрина, статистика, продвижение и платежи</small></span>${ic('right', 18, 2)}</a>` : ''}${bizBlock(u.business, u.trademark)}`,
    's-look': () => html`${head('Оформление', 'Светлое, тёмное или как на устройстве. Сохраняется на этом устройстве')}
      <div class="look" role="radiogroup" aria-label="Оформление">${THEMES.map(([v, icon, t, sub]) => html`<button type="button" role="radio" class="look-it${themeGet() === v ? ' on' : ''}" aria-checked="${themeGet() === v ? 'true' : 'false'}" data-theme-set="${v}">
        <span class="look-pv lp-${v}" aria-hidden="true"><i></i><i></i><i></i></span><span class="look-t">${ic(icon, 18, 2)}<b>${t}</b></span><small>${sub}</small></button>`)}</div>`,
    's-block': () => html`${head('Чёрный список', 'Заблокированные не могут писать вам и предлагать цену, их объявлений нет в вашей ленте и поиске')}<div id="blocks" class="set-list"><div class="loader"></div></div>`,
    's-acc': () => html`${head('Аккаунт', 'Почта для входа и писем от Торганы')}
      <div class="set-list">
        ${row('mail', 'Почта', u.email, S.config.mail ? (u.emailVerified ? html`<span class="pf-badge ok">${ic('check', 14, 2.4)} Подтверждена</span>` : html`<button type="button" class="btn btn-soft btn-sm" id="verify-again">Подтвердить</button>`) : '')}
        ${row('logout', 'Выйти из аккаунта', 'На этом устройстве', html`<button type="button" class="btn btn-soft btn-sm" data-logout>Выйти</button>`)}
      </div>
      ${u.isOwner ? '' : html`<div class="acc-del">
        <h3>Удаление профиля</h3>
        <div class="acc-del-row"><span class="acc-del-ic">${ic('clock', 20, 2)}</span><span class="acc-del-txt"><b>Удалить временно</b><span>Профиль и объявления скроются. Чтобы вернуться, войдите и нажмите «Восстановить» — объявления будут ждать в архиве.</span></span><button type="button" class="btn btn-line btn-sm" data-acc-off>Удалить временно</button></div>
        <div class="acc-del-row danger"><span class="acc-del-ic">${ic('trash', 20, 2)}</span><span class="acc-del-txt"><b>Удалить навсегда</b><span>Объявления, фото, избранное, подписки и данные профиля удалятся без возможности восстановления.</span></span><button type="button" class="btn btn-danger btn-sm" data-acc-erase>Удалить навсегда</button></div>
      </div>`}`
  };
  $('#box').innerHTML = String(body[sec]());
  // Пришли по ссылке на фото (#s-photo) — покажем его.
  const to = location.hash.length > 1 && location.hash.slice(1) !== sec && document.getElementById(location.hash.slice(1));
  if (to) { const field = to.matches('input'); to.scrollIntoView({ block: 'center' }); if (field) to.focus(); }
  const q = new URLSearchParams(location.search).get('oauth');
  if (q) { toast(q === 'linked' ? 'Готово — сервис привязан' : 'Этот аккаунт сервиса уже привязан к другому пользователю', q !== 'linked'); history.replaceState({}, '', location.pathname + location.hash); }
  if (sec === 's-acc') bindAccountDelete();
  if (sec === 's-look') $$('[data-theme-set]').forEach((b) => { b.onclick = () => { themeSet(b.dataset.themeSet); renderSettings(sec, reload); const h = $('[data-sec="s-look"] small'); if (h) h.textContent = { auto: 'Как на устройстве', light: 'Светлое', dark: 'Тёмное' }[themeGet()]; }; });
  if (sec === 's-block') {
    const paint = async () => {
      const box = $('#blocks'); if (!box) return;
      try {
        const { items } = await api('GET', '/api/blocks');
        box.innerHTML = items.length ? String(html`${items.map((x) => html`<div class="set-row bl-row">${ava(x, 'sm')}<div><span class="set-v">${x.name}</span><span class="set-k">Заблокирован ${dateShort(x.at)}</span></div><button type="button" class="btn btn-soft btn-sm" data-unb="${x.id}">Разблокировать</button></div>`)}`)
          : String(html`<div class="bl-empty">${ic('ban', 28, 1.8)}<b>Никого нет</b><span>Заблокировать можно в чате или в профиле человека — кнопка «…»</span></div>`);
        $$('[data-unb]', box).forEach((b) => { b.onclick = async () => { const x = items.find((i) => String(i.id) === b.dataset.unb); const r = await blockFlow(x, true); if (r === false) paint(); }; });
      } catch (e) { box.innerHTML = String(html`<p class="muted">${e.message}</p>`); }
    };
    paint();
  }
  if (sec === 'sf') {
    $('[data-ava-set]').onclick = () => pickAvatar(reload);
    $$('[data-medal-form]').forEach((b) => { b.onclick = async () => {
      if (b.classList.contains('on')) return;
      try { S.user = (await api('PATCH', '/api/me', { medalForm: b.dataset.medalForm })).user; toast(`Подпись медали: «${firstName(b.dataset.medalForm)}»`); reload(); } catch (e) { toast(e.message, true); }
    }; });
    const del = $('[data-ava-del]'); if (del) del.onclick = () => removeAvatar(reload);
    $('#sf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const r = await api('PATCH', '/api/me', { name: f.name.value, phone: f.phone.value });
        S.user = r.user; toast('Сохранено'); renderHeader(); reload();
      } catch (ex) { toast(ex.message, true); }
    };
  }
  if (sec === 'sn') {
    $$('#sn input[name]').forEach((inp) => {
      inp.onchange = async () => {
        try { const r = await api('PATCH', '/api/me', { [inp.name]: inp.checked }); S.user = r.user; toast(inp.checked ? 'Включено' : 'Выключено'); } catch (ex) { inp.checked = !inp.checked; toast(ex.message, true); }
      };
    });
  }
  if (sec === 'sp') {
    $$('[data-link]').forEach((b) => { b.onclick = () => oauthGo(b.dataset.link, { link: true }); });
    $$('[data-link-apple]').forEach((b) => { b.onclick = () => appleGo({ link: true }); });
    $$('[data-unlink]').forEach((b) => {
      b.onclick = async () => { try { await api('POST', `/api/auth/oauth/${b.dataset.unlink}/unlink`); toast('Отвязано'); await refreshMe(); reload(); } catch (e) { toast(e.message, true); } };
    });
    $('#sp').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target; const btn = $('button[type=submit]', f); btn.disabled = true;
      try {
        const r = await api('POST', '/api/me/password', { current: f.current.value, password: f.password.value });
        f.reset();
        toast(r.signedOut ? `Пароль изменён. Вышли на других устройствах: ${r.signedOut}` : 'Пароль изменён');
      } catch (ex) { toast(ex.message, true); }
      btn.disabled = false;
    };
  }
  if (sec === 's-biz') bindBizForm(reload);
  const va = $('#verify-again');
  if (va) va.onclick = () => verifyModal(reload);
}

// 1.54.0: «Написать магазину / продавцу» из профиля. Переписка на Торгане всегда о конкретном объявлении,
// поэтому сначала выбираем, о каком (одно — сразу в чат). У кого много — с поиском по названию.
async function writePicker(u, name, shop = false) {
  if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
  const start = async (lid) => { const { id: cid } = await api('POST', '/api/conversations', { listingId: lid }); go(`/messages/${cid}`); };
  let items;
  try { items = (await api('GET', `/api/listings?${new URLSearchParams({ user: u.id, limit: 60 })}`)).items || []; } catch (e) { toast(e.message, true); return; }
  if (!items.length) { toast('Сейчас у продавца нет объявлений', true); return; }
  if (items.length === 1) { try { await start(items[0].id); } catch (e) { toast(e.message, true); } return; }
  const row = (i) => html`<button type="button" class="wp-row" data-wp="${i.id}" data-t="${String(i.title).toLowerCase()}">
      <span class="wp-ph">${i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : ic('image', 22, 1.6)}</span>
      <span class="wp-tx"><b>${i.title}</b><span>${price(i.price, i.priceUnit)}</span></span>${ic('right', 18, 2)}</button>`;
  openModal(String(html`<h2>${shop ? 'Написать магазину' : 'Написать продавцу'}</h2>
    <p class="muted" style="margin:0 0 14px"><b style="color:var(--text)">${name}</b> · выберите объявление — переписка будет о нём, так проще ответить.</p>
    ${items.length > 6 ? html`<label class="search wp-search">${ic('search', 18)}<span class="sr">Найти объявление</span><input type="search" placeholder="Найти по названию" data-wp-q></label>` : ''}
    <div class="wp-list">${items.map(row)}</div><p class="wp-none muted hidden">Ничего не нашлось</p>`), (m, close) => {
    const q = $('[data-wp-q]', m);
    if (q) q.oninput = () => { const v = q.value.trim().toLowerCase(); let n = 0; $$('[data-wp]', m).forEach((b) => { const on = !v || b.dataset.t.includes(v); b.classList.toggle('hidden', !on); n += on; }); $('.wp-none', m).classList.toggle('hidden', !!n); };
    $$('[data-wp]', m).forEach((b) => { b.onclick = async () => { b.disabled = true; try { close(); await start(Number(b.dataset.wp)); } catch (e) { toast(e.message, true); b.disabled = false; } }; });
  });
}

export async function viewUser(id, q) {
  const tab = q && ['rep', 'reviews'].includes(q.get('tab')) ? 'rep' : 'ads'; // reviews — старые ссылки
  const { user: u, sections, pinned } = await api('GET', `/api/users/${id}`);
  setTitle(u.name);
  const own = S.user && S.user.id === u.id;
  const followers = u.followers || 0;
  const deals = u.rep ? u.rep.total || 0 : 0;
  const sh = u.shop; // 1.46.1: у магазина — одна шапка: обложка, тариф, название, описание
  const canWrite = !own && u.activeCount > 0 && u.block !== 'me' && !(sh && sh.official); // 1.54.0: «Написать» — о любом его объявлении
  // 1.49.0: одна отметка проверки (галочка бренда — у имени); три числа всегда, даже 0: объявления, сделки, подписчики.
  const badges = String(html`${planBadge(sh)}${trustBadges(u.badges && { ...u.badges, shop: false, tm: null })}`).trim();
  const num = (n, one, few, many, attr = '') => html`<div class="pf-num"><b${raw(attr)}>${NF.format(n)}</b><span>${plural(n, one, few, many)}</span></div>`;
  // Сверху — широкая карточка продавца, ниже вкладки и объявления (у магазина — с колонкой «О магазине»).
  app.innerHTML = String(html`<div class="wrap pub">
    ${own ? html`<div class="pub-own">${ic('eye', 18)}<span>Так ваш профиль видят покупатели</span><a href="/profile/settings">Изменить профиль</a><a href="/profile">Мой профиль</a></div>` : ''}
    <section class="pub-hero ${sh ? `is-shop ${sh.plan}` : ''}" aria-label="${sh ? 'Магазин' : 'Продавец'}">
      ${sh ? html`<div class="psh-cover">${sh.cover ? html`<img src="${sh.cover}" alt="">` : ''}</div>` : ''}
      <div class="pub-ava">${ava(u, 'xl')}</div>
      <div class="pub-who">
        <h1>${nameSeal(sh ? sh.name : u.name, u.badges)}</h1>
        ${sh && sh.official ? '' : repLine(u.rep, `/u/${u.id}?tab=rep`, { shop: !!sh, deals: false, first: u.badges && u.badges.first, who: sh ? sh.name : u.name, kind: own ? 'me' : '' })}
        ${sh && sh.about ? html`<p class="shop-about">${sh.about}</p>` : ''}
        ${badges ? html`<div class="pf-badges">${raw(badges)}</div>` : ''}
      </div>
      <div class="pub-side">
        <div class="pf-nums">
          ${num(u.activeCount, 'объявление', 'объявления', 'объявлений')}
          ${num(deals, 'сделка', 'сделки', 'сделок')}
          ${num(followers, 'подписчик', 'подписчика', 'подписчиков', ' data-followers')}
        </div>
        <div class="pub-acts">${own ? html`<a class="btn btn-accent btn-block" href="/profile/settings">${ic('edit', 18)}Изменить профиль</a>`
  : canWrite ? html`<button type="button" class="btn btn-accent btn-block pub-write" data-pub-write>${ic('chat', 18, 2)}Написать ${sh ? 'магазину' : 'продавцу'}</button>${followBtn(u.id, u.following)}` : followBtn(u.id, u.following, 'btn-accent')}<button type="button" class="icon-btn pub-share" data-share aria-label="Поделиться профилем">${ic('share', 19)}</button>${own || !S.user ? '' : html`<button type="button" class="icon-btn pub-share" data-pub-more aria-label="Ещё" aria-haspopup="menu">${ic('more', 19)}</button>`}</div>
      </div>
    </section>
    <div id="pub-block"></div>
    <div class="seg seg-lg" role="tablist">
      <a role="tab" aria-selected="${tab === 'ads' ? 'true' : 'false'}" class="${tab === 'ads' ? 'on' : ''}" href="/u/${u.id}">Объявления <span class="n">${u.activeCount}</span></a>
      <a role="tab" aria-selected="${tab === 'rep' ? 'true' : 'false'}" class="${tab === 'rep' ? 'on' : ''}" href="/u/${u.id}?tab=rep">${levelMedal(u.rep ? u.rep.level : 0, 16)}Репутация</a>
    </div>
    <div id="box"><div class="loader"></div></div>
  </div>`);
  $('[data-share]').onclick = () => shareLink(`${location.origin}/u/${u.id}`, `${u.name} на Торгане`);
  const wb = $('[data-pub-write]');
  if (wb) wb.onclick = () => writePicker(u, sh ? sh.name : u.name, !!sh);
  // 1.48.0: чёрный список — «…» в шапке профиля.
  let block = u.block || null;
  const paintPubBlock = () => {
    $('#pub-block').innerHTML = block === 'me' ? String(html`<div class="chat-blocked pub-blocked"><span class="cb-ic">${ic('ban', 18, 2)}</span><div><b>Вы заблокировали ${u.name}</b><span>Он не может писать вам, его объявлений нет в вашей ленте и поиске.</span></div><button type="button" class="btn btn-soft btn-sm" data-unblock>Разблокировать</button></div>`) : '';
    const ub = $('[data-unblock]'); if (ub) ub.onclick = async () => { const r = await blockFlow(u, true); if (r !== undefined) { block = r ? 'me' : null; paintPubBlock(); } };
  };
  paintPubBlock();
  const pm = $('[data-pub-more]');
  if (pm) pm.onclick = () => pickList({ anchor: pm, title: u.name, search: false, items: [
    { value: block === 'me' ? 'unblock' : 'block', label: block === 'me' ? 'Разблокировать' : 'Заблокировать' },
    { value: 'support', label: 'Пожаловаться в поддержку' }
  ], onPick: async (v) => {
    if (v === 'support') { go('/messages/support'); return; }
    const r = await blockFlow(u, block === 'me'); if (r !== undefined) { block = r ? 'me' : null; paintPubBlock(); }
  } });
  if (tab === 'ads') return renderPubAds(u, sections, pinned);
  $('#box').innerHTML = String(html`<div class="rep-page">${repCard(u.rep)}${repHow()}</div>`);
}

// 1.49.0: объявления продавца — лентой с «Показать ещё». У магазина: закреплённые («Магазин Про»), поиск,
// разделы с числом объявлений, сортировка и «О магазине» (на компьютере — колонкой справа, на телефоне — ниже).
async function renderPubAds(u, sections, pinned) {
  const sh = u.shop;
  const st = { q: '', sec: '', sort: '' };
  $('#box').innerHTML = String(html`<div class="${sh ? 'shop-body' : ''}">
    <div class="shop-main">
      ${pinned.length ? html`<section class="shop-pins" aria-label="Главное в магазине"><h2>${ic('pushpin', 18, 2)}Главное в магазине</h2>${grid(pinned)}</section>` : ''}
      ${sh && u.activeCount ? html`<div class="shop-tools">
        <form class="shop-find" role="search" data-shop-find>
          ${ic('search', 18)}<label class="sr" for="shop-q">Поиск в магазине</label>
          <input id="shop-q" name="q" type="search" placeholder="Поиск в магазине" autocomplete="off" enterkeyhint="search" maxlength="100">
        </form>
        <label class="sr" for="shop-sort">Порядок</label>
        <select id="shop-sort" class="select" data-shop-sort><option value="">Сначала новые</option><option value="cheap">Сначала дешевле</option><option value="expensive">Сначала дороже</option></select>
        ${sections.length > 1 ? html`<div class="shop-secs" aria-label="Разделы магазина">
          <button type="button" class="chip active" data-sec="" aria-pressed="true">Все <span>${NF.format(u.activeCount)}</span></button>${sections.map((x) => html`<button type="button" class="chip" data-sec="${x.sub ? `sub:${x.sub}` : `category:${x.category}`}" aria-pressed="false">${x.name} <span>${NF.format(x.n)}</span></button>`)}
        </div>` : ''}
      </div>` : ''}
      <div id="pub-list"><div class="loader"></div></div><div class="more hidden"></div>
    </div>
    ${sh ? shopAbout(sh) : ''}
  </div>`);
  let feed = null;
  const load = () => {
    if (feed) feed.stop();
    const [k, v] = st.sec ? st.sec.split(':') : [];
    const params = { user: u.id, ...(st.q ? { q: st.q } : {}), ...(k ? { [k]: v } : {}), ...(st.sort ? { sort: st.sort } : {}) };
    feed = listingFeed($('#pub-list'), params, {
      map: (i) => ({ ...i, seller: null }), // все объявления этого продавца — строка продавца не нужна
      empty: String(html`<div class="pf-empty sm">${st.q || st.sec ? html`<h3>Ничего не нашлось</h3><p>Попробуйте другие слова или раздел.</p>` : html`<h3>Активных объявлений нет</h3><p>Загляните позже.</p>`}</div>`)
    });
    return feed.first;
  };
  setCleanup(() => { if (feed) feed.stop(); });
  const find = $('[data-shop-find]');
  if (find) {
    let t = null;
    const inp = $('#shop-q');
    find.onsubmit = (e) => { e.preventDefault(); clearTimeout(t); st.q = inp.value.trim(); load().catch((ex) => toast(ex.message, true)); };
    inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { if (st.q !== inp.value.trim()) { st.q = inp.value.trim(); load().catch((ex) => toast(ex.message, true)); } }, 400); };
    $('[data-shop-sort]').onchange = (e) => { st.sort = e.target.value; load().catch((ex) => toast(ex.message, true)); };
    $$('[data-sec]').forEach((b) => {
      b.onclick = () => {
        st.sec = b.dataset.sec;
        $$('[data-sec]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        load().catch((ex) => toast(ex.message, true));
      };
    });
  }
  await load();
}

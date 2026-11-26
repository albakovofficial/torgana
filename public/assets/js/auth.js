// Вход и регистрация: пароль, код из письма, Яндекс ID и VK ID, «Войти с Apple» в приложении.
import { $, $$, NATIVE, S, api, app, html, nativePost } from './core.js';
import { ic } from './icons.js';
import { openModal, toast } from './ui.js';
import { go, render, setCleanup, setTitle } from './router.js';
import { refreshMe, srcOf } from './main.js';

// ================= код подтверждения почты =================
// Шесть клеток: цифры, вставка из буфера, автоподстановка кода на телефоне (one-time-code), стирание — назад.
function codeBoxes(box, onDone) {
  box.innerHTML = String(html`<div class="code-boxes" role="group" aria-label="Код из письма">${[0, 1, 2, 3, 4, 5].map((i) => html`<input class="code-box" inputmode="numeric" pattern="[0-9]*" maxlength="${i ? 1 : 6}" autocomplete="${i ? 'off' : 'one-time-code'}" aria-label="Цифра ${i + 1} из 6">`)}</div>`);
  const ins = $$('.code-box', box);
  const value = () => ins.map((x) => x.value).join('');
  const fill = (digits, from) => {
    digits.split('').forEach((d, k) => { if (ins[from + k]) ins[from + k].value = d; });
    box.classList.remove('bad');
    ins[Math.min(from + digits.length, 5)].focus();
    if (/^\d{6}$/.test(value())) onDone(value());
  };
  ins.forEach((inp, i) => {
    inp.onfocus = () => inp.select();
    inp.oninput = () => { const d = inp.value.replace(/\D/g, ''); inp.value = ''; if (d) fill(d.slice(0, 6 - i), i); };
    inp.onkeydown = (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) { e.preventDefault(); ins[i - 1].value = ''; ins[i - 1].focus(); }
      if (e.key === 'ArrowLeft' && i > 0) ins[i - 1].focus();
      if (e.key === 'ArrowRight' && i < 5) ins[i + 1].focus();
    };
    inp.onpaste = (e) => { const d = ((e.clipboardData && e.clipboardData.getData('text')) || '').replace(/\D/g, '').slice(0, 6); if (d) { e.preventDefault(); ins.forEach((x) => { x.value = ''; }); fill(d, 0); } };
  });
  return {
    focus: () => ins[0].focus(),
    fail: () => { box.classList.add('bad'); ins.forEach((x) => { x.value = ''; }); ins[0].focus(); },
    lock: (on) => ins.forEach((x) => { x.disabled = on; })
  };
}

// Код и «Отправить ещё раз» с обратным отсчётом. send — повторная отправка; check(code) — проверка (бросает ошибку).
export function codeForm(root, { email, wait = 60, send, check }) {
  root.innerHTML = String(html`<div class="code-form">
    <div class="code-to">${ic('mail', 18, 2)}<span>Код отправили на <b>${email}</b></span></div>
    <div id="code-cells"></div>
    <div class="code-err hidden" role="alert"></div>
    <div class="code-again"><span class="muted">Не пришло? Проверьте «Спам».</span><button type="button" class="btn btn-soft btn-sm" data-again disabled></button></div>
  </div>`);
  const err = $('.code-err', root);
  const again = $('[data-again]', root);
  let left = wait; let timer = null;
  const tick = () => { again.disabled = left > 0; again.textContent = left > 0 ? `Отправить ещё раз · ${left} с` : 'Отправить ещё раз'; if (left-- > 0) timer = setTimeout(tick, 1000); };
  const boxes = codeBoxes($('#code-cells', root), async (code) => {
    err.classList.add('hidden'); boxes.lock(true);
    try { await check(code); } catch (e) { boxes.lock(false); boxes.fail(); err.textContent = e.message; err.classList.remove('hidden'); }
  });
  again.onclick = async () => {
    again.disabled = true;
    try { const r = await send(); left = r.wait || 60; toast('Отправили новый код'); err.classList.add('hidden'); boxes.focus(); } catch (e) { toast(e.message, true); left = 0; }
    clearTimeout(timer); tick();
  };
  tick();
  setTimeout(() => boxes.focus(), 50);
  return () => clearTimeout(timer);
}

// /confirm — после регистрации или входа с неподтверждённой почтой. Адрес — из sessionStorage (не в ссылке).
const CONFIRM_KEY = 'tg_confirm';
const confirmStart = (email, next) => { try { sessionStorage.setItem(CONFIRM_KEY, JSON.stringify({ email, next: next || '' })); } catch { /* приватный режим */ } go('/confirm', true); };
export async function viewConfirm() {
  if (S.user && S.user.emailVerified) { go('/', true); return; }
  setTitle('Подтверждение почты');
  let st = null;
  try { st = JSON.parse(sessionStorage.getItem(CONFIRM_KEY) || 'null'); } catch { /* нет хранилища */ }
  const finish = async (r) => {
    try { sessionStorage.removeItem(CONFIRM_KEY); } catch { /* нет хранилища */ }
    S.user = r.user; await refreshMe(); toast('Почта подтверждена — добро пожаловать!');
    go(st && st.next && st.next.startsWith('/') && !st.next.startsWith('//') ? st.next : '/', true);
  };
  const showCode = (email, wait) => {
    authPage('Введите код из письма', 'Шесть цифр — так мы убедимся, что почта ваша. Код действует 15 минут.', html`<div id="cf"></div>`,
      html`<p class="alt">Ошиблись адресом? <a href="/register">Зарегистрироваться заново</a></p>`);
    setCleanup(codeForm($('#cf'), {
      email, wait,
      send: () => api('POST', '/api/auth/code/resend', { email }),
      check: async (code) => finish(await api('POST', '/api/auth/code', { email, code }))
    }));
  };
  if (st && st.email) { showCode(st.email, 60); return; }
  // Открыли страницу заново без адреса — спросим его и пришлём код.
  authPage('Подтверждение почты', 'Укажите почту, на которую регистрировались, — пришлём код.', html`<form id="f" novalidate>
    <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" class="input" autocomplete="email" required></div>
    <button class="btn btn-dark btn-lg btn-block" type="submit">Прислать код</button></form>`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim().toLowerCase();
    try { const r = await api('POST', '/api/auth/code/resend', { email }); st = { email, next: '' }; try { sessionStorage.setItem(CONFIRM_KEY, JSON.stringify(st)); } catch { /* нет */ } showCode(email, r.wait); } catch (ex) { toast(ex.message, true); }
  };
}

// Из профиля: прислать код и ввести его в окне.
export async function verifyModal(done) {
  let r;
  try { r = await api('POST', '/api/me/verify'); } catch (e) { toast(e.message, true); return; }
  if (r.already) { await refreshMe(); done(); return; }
  openModal(String(html`<h2>Подтвердите почту</h2><div id="vm"></div><div class="modal-actions"><button class="btn btn-soft" data-x>Позже</button></div>`), (m, close) => {
    $('[data-x]', m).onclick = close;
    const stop = codeForm($('#vm', m), {
      email: r.email, wait: r.wait,
      send: () => api('POST', '/api/me/verify'),
      check: async (code) => { await api('POST', '/api/auth/code', { email: r.email, code }); stop(); close(); await refreshMe(); toast('Почта подтверждена'); done(); }
    });
  });
}

// ================= вход и регистрация =================
export async function viewLogin(_, q) {
  if (S.user) { go(q.get('next') || '/', true); return; }
  setTitle('Вход');
  app.innerHTML = String(html`<div class="wrap"><div class="auth">
    <h1>Вход</h1><p class="sub">Рады видеть вас снова.</p>
    ${q.get('oauth_error') ? html`<div class="banner danger" style="margin-bottom:16px">${q.get('oauth_error')}</div>` : ''}
    ${oauthButtons()}
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
  bindOauth(app, q.get('next'));
}

export async function viewRegister(_, q) {
  if (S.user) { go(q.get('next') || '/', true); return; }
  setTitle('Регистрация');
  app.innerHTML = String(html`<div class="wrap"><div class="auth">
    <h1>Регистрация</h1><p class="sub">Размещайте объявления бесплатно и пишите продавцам.</p>
    ${oauthButtons()}
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
    extra: () => ({ consent: $('#f').consent.checked, src: srcOf() }),
    check: () => ($('#f').consent.checked ? '' : 'Отметьте согласие на обработку персональных данных — без него зарегистрироваться нельзя')
  });
  bindOauth(app, q.get('next'));
}

// Отправка формы #f. По умолчанию — вход: запоминаем пользователя и уходим на next.
// extra — поля сверх формы (объект или функция, вызываемая при отправке);
// check(body) может вернуть текст ошибки до отправки; done(r) — свой обработчик ответа.
// Вход через Яндекс ID и VK ID — кнопки для страниц входа и регистрации (если модератор подключил сервис).
export const OAUTH = [['yandex', 'Яндекс ID', 'Войти с Яндекс ID'], ['vk', 'VK ID', 'Войти через VK ID']];
const oauthOn = () => OAUTH.filter(([k]) => S.config.oauth && S.config.oauth[k]);
// 1.56.0: в приложении для iPhone — первой кнопкой «Войти с Apple» (правило App Store 4.8). Значок Apple — символ
// системного шрифта iPhone (U+F8FF), кнопка чёрная, как требует Apple.
const appleButton = (label = 'Войти с Apple') => (NATIVE ? html`<button type="button" class="btn btn-lg btn-block oauth-btn oauth-apple" data-apple><span class="apple-glyph" aria-hidden="true">\uF8FF</span>${label}</button>` : '');
const oauthButtons = () => (oauthOn().length || NATIVE ? html`<div class="oauth">
    ${appleButton()}
    ${oauthOn().map(([k, , label]) => html`<button type="button" class="btn btn-line btn-lg btn-block oauth-btn oauth-${k}" data-oauth="${k}"><span class="oauth-mark" aria-hidden="true">${k === 'vk' ? 'VK' : 'Я'}</span>${label}</button>`)}
    <p class="oauth-note">Продолжая, вы принимаете <a href="/page/terms" target="_blank">соглашение</a> и даёте <a href="/page/consent" target="_blank">согласие на обработку данных</a>. Телефон из сервиса отметим как подтверждённый.</p>
    <div class="or"><span>или по email</span></div></div>` : '');
// Начать вход или привязку: сервер даёт адрес страницы сервиса, туда и уходим.
export async function oauthGo(provider, { next = '/', link = false } = {}) {
  try { const { url } = await api('POST', `/api/auth/oauth/${provider}/start`, { next, link, consent: !link, src: srcOf() }); location.href = url; } catch (e) { toast(e.message, true); }
}
function bindOauth(root, next) {
  $$('[data-oauth]', root).forEach((b) => { b.onclick = () => oauthGo(b.dataset.oauth, { next: next || '/profile' }); });
  $$('[data-apple]', root).forEach((b) => { b.onclick = () => appleGo({ next: next || '/profile' }); });
}
// «Войти с Apple»: одноразовый nonce с сервера → системное окно Apple в приложении → токен на сервер.
export async function appleGo({ next = '/profile', link = false } = {}) {
  try {
    const { nonce } = await api('POST', '/api/auth/apple/nonce', { next, link, src: srcOf() });
    const wait = new Promise((res) => {
      const on = (e) => { const m = e.detail || {}; if (m.type === 'auth.apple' || m.type === 'auth.apple.error') { window.removeEventListener('torgana-native', on); res(m); } };
      window.addEventListener('torgana-native', on);
      setTimeout(() => { window.removeEventListener('torgana-native', on); res({ type: 'auth.apple.error', code: 'timeout' }); }, 180000);
    });
    if (!nativePost({ type: 'auth.apple', nonce })) throw new Error('Войти с Apple можно в приложении Торгана для iPhone');
    const m = await wait;
    if (m.type === 'auth.apple.error') { if (m.code !== 'canceled') toast('Apple не подтвердил вход — попробуйте ещё раз', true); return; }
    const r = await api('POST', '/api/auth/apple', { identityToken: m.identityToken, nonce, name: m.name || '', consent: !link });
    if (link) { toast('Apple ID привязан'); await refreshMe(); render(); return; }
    location.href = r.next || next; // полная загрузка — подтянуть вошедшего человека везде
  } catch (e) { toast(e.message, true); }
}

// 1.51.1: пустые и неверные поля ловим до запроса — подсвечиваем и говорим, что исправить.
function fieldProblem(f) {
  const label = (i) => (($(`label[for="${i.id}"]`, f) || {}).textContent || '').trim();
  const why = (i) => {
    const v = i.value.trim();
    if (i.required && !v) return 'empty';
    if (i.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Проверьте email — например, name@mail.ru';
    if (i.minLength > 0 && v && i.value.length < i.minLength) return `${label(i)} — минимум ${i.minLength} символов`;
    return '';
  };
  const list = $$('input.input', f).map((i) => [i, why(i)]);
  list.forEach(([i, w]) => { if (w) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); i.oninput = () => i.removeAttribute('aria-invalid'); });
  const bad = list.filter(([, w]) => w);
  if (!bad.length) return '';
  bad[0][0].focus();
  const empty = bad.filter(([, w]) => w === 'empty').map(([i]) => `«${label(i)}»`);
  return empty.length ? `Заполните ${empty.length > 1 ? 'поля' : 'поле'} ${empty.join(' и ')}` : bad[0][1];
}
function bindAuthForm(url, next, { extra = {}, check, done } = {}) {
  const f = $('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#err');
    err.classList.add('hidden');
    const body = { ...Object.fromEntries(new FormData(f).entries()), ...(typeof extra === 'function' ? extra() : extra) };
    const problem = fieldProblem(f) || (check && check(body));
    if (problem) { err.textContent = problem; err.classList.remove('hidden'); return; }
    const btn = $('button[type=submit]', f);
    btn.disabled = true;
    try {
      const r = await api('POST', url, body);
      if (r.needCode) { confirmStart(r.email, next); return; } // почта не подтверждена — сначала код из письма
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

export const authPage = (title, sub, form, alt = '') => {
  app.innerHTML = String(html`<div class="wrap"><div class="auth"><h1>${title}</h1><p class="sub">${sub}</p>${form}${alt}</div></div>`);
};

export async function viewForgot() {
  setTitle('Восстановление пароля');
  authPage('Забыли пароль?', 'Пришлём на почту ссылку, по которой можно задать новый пароль.', html`<form id="f" novalidate>
      <div class="field"><label for="email">Email аккаунта</label><input id="email" name="email" type="email" class="input" autocomplete="email" required></div>
      <div class="form-error hidden" id="err" role="alert"></div>
      <button class="btn btn-dark btn-lg btn-block" type="submit">Отправить ссылку</button>
    </form>`, html`<p class="alt">Вспомнили? <a href="/login">Войти</a></p>`);
  bindAuthForm('/api/auth/forgot', null, {
    done: () => authPage('Проверьте почту', 'Если такой аккаунт есть, мы отправили письмо со ссылкой. Она действует 1 час. Письма нет — загляните в «Спам».',
      html`<a class="btn btn-soft btn-lg btn-block" href="/login">Вернуться ко входу</a>`)
  });
}

export async function viewReset(_, q) {
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
    check: (b) => (b.password !== b.password2 ? 'Пароли не совпадают' : '')
  });
}

// Ссылки из писем: подтверждение email (срабатывает сразу) и отписка (по кнопке — почтовики иногда сами открывают ссылки).
export async function viewMailLink(kind, q) {
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
  const isFollow = /^follow-\d+$/.test(q.get('k') || '');
  const what = isFollow ? 'о новых объявлениях этого продавца' : { messages: 'о новых сообщениях', moderation: 'о решениях модерации', digest: 'с подборкой за день', all: 'с уведомлениями' }[q.get('k')] || 'с уведомлениями';
  authPage(isFollow ? 'Отписаться от продавца?' : 'Отписаться?', isFollow ? 'Подписка на продавца будет отменена: не будем присылать его новые объявления. Подписаться снова можно в его профиле.' : `Больше не будем присылать письма ${what}. Включить их снова можно в профиле, в разделе «Настройки».`,
    html`<form id="f"><button class="btn btn-dark btn-lg btn-block" type="submit">Отписаться</button></form>`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try { await run(); authPage('Готово', `Письма ${what} больше не придут.`, html`<a class="btn btn-soft btn-lg btn-block" href="/">На главную</a>`); } catch (ex) { fail(ex); }
  };
}

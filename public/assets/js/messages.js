// Сообщения: список, переписка, торг, быстрые ответы, подписка на продавца, поддержка.
import { $, $$, NF, S, api, app, ava, hm, html, plural, price, raw, rub, shortWhen } from './core.js';
import { MARK, P, ic, svg } from './icons.js';
import { riskOf } from './rules.js';
import { confirmModal, openModal, pickList, toast } from './ui.js';
import { resizeImage } from './photos.js';
import { go, requireAuth, setCleanup, setTitle } from './router.js';
import { bindDeal, dealBar, dealWow, repCard, repLine } from './reputation.js';
import { nameSeal, verifiedSeal } from './badges.js';
import { refreshMe } from './main.js';

// 1.48.0: заблокировать / разблокировать. Возвращает новое состояние (true — заблокирован) или undefined — передумали.
export async function blockFlow(user, blocked) {
  try {
    if (blocked) {
      await api('DELETE', `/api/blocks/${user.id}`);
      toast(`${user.name} разблокирован — снова может вам писать`);
      return false;
    }
    const ok = await confirmModal(`Заблокировать ${user.name}?`, 'Он не сможет писать вам и предлагать цену, а его объявления пропадут из вашей ленты и поиска. Разблокировать можно в любой момент — здесь или в настройках, раздел «Чёрный список».', 'Заблокировать', true);
    if (!ok) return undefined;
    await api('POST', '/api/blocks', { userId: user.id });
    toast('Заблокирован. Если он нарушает правила — напишите в поддержку, модератор разберётся');
    return true;
  } catch (e) { toast(e.message, true); return undefined; }
}
// 1.47.2: аватарка Торганы — объёмный круг «небо → сирень» с бликом и знаком (та же, что на экране «Сделка состоялась»).
let avaN = 0;
export const torganaAva = (size) => {
  const k = `ta${++avaN}`;
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 112 112" aria-hidden="true"><defs>
    <linearGradient id="${k}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C86E0"/><stop offset=".55" stop-color="#3D67D0"/><stop offset="1" stop-color="#6A63D8"/></linearGradient>
    <linearGradient id="${k}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <circle cx="56" cy="56" r="56" fill="url(#${k}a)"/><ellipse cx="48" cy="28" rx="40" ry="22" fill="url(#${k}g)"/>
    <circle cx="56" cy="56" r="55" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>
    <g transform="scale(2.3333) translate(6.5 6.5) scale(.73)">${MARK.replace(/fill="#[0-9A-Fa-f]{6}"\/>$/, 'fill="#4566D2"/>')}</g></svg>`);
};
export const supportAva = (size = 52) => html`<span class="conv-img support-ava" style="width:${size}px;height:${size}px" aria-hidden="true">${torganaAva(size)}</span>`;
// Функция, а не готовая строка: галочка (verifiedSeal) объявлена ниже и у каждой — свои id градиентов.
const supportName = () => html`Поддержка Торганы<span class="name-seal" title="Официальный аккаунт Торганы">${verifiedSeal(18)}</span>`;
const SUPPORT_TOPICS = ['Почему отклонили объявление?', 'Не приходит письмо', 'Подозреваю мошенника', 'Как удалить аккаунт?'];

// 1.55.0: галочки у своих сообщений — ✓ отправлено, ✓✓ (синие) прочитано.
const tickSvg = (read) => raw(read
  ? '<svg width="17" height="11" viewBox="0 0 17 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6l3 3 6.5-7.5"/><path d="M7.2 8.4l.6.6 6.7-7.5"/></svg>'
  : '<svg width="12" height="11" viewBox="0 0 12 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6l3 3 6.5-7.5"/></svg>');
const tickMark = (read) => html`<i class="tk ${read ? 'rd' : ''}" data-tk role="img" aria-label="${read ? 'Прочитано' : 'Отправлено'}">${tickSvg(read)}</i>`;

// Один чат на весь сайт: диалоги по объявлениям, поддержка у пользователя и у модератора.
// load(after) → { messages }, send(body) → message; сообщения { id, mine, body, createdAt }.
// decorate(m) → { cls, body } — особый вид сообщения (предложение цены); onData(r) — после каждой загрузки;
// tools — над полем ввода (быстрые ответы); left — кнопка слева от поля (₽ — предложить цену).
// 1.54.0: reply — { other: имя собеседника } включает ответ на конкретное сообщение: кнопка у сообщения (мышь),
// свайп вправо или долгое нажатие (телефон); над полем — «Ответ …», в сообщении — цитата, нажатие ведёт к оригиналу.
// 1.55.0: как в мессенджерах — у своих сообщений ✓ (отправлено) и ✓✓ синим (прочитано, r.readUpTo), строка
// «… печатает» (r.typing) и отметка собеседнику, пока я набираю (typing — функция, шлёт не чаще раза в 3 секунды).
// 27.11: шапка — обложка, как у внутренних страниц: строка «‹ … » (head) и под ней top (карточка объявления).
// «печатает…» показывается в шапке на месте строки репутации (класс .is-typing у чата).
export function mountChat(box, { head, top = '', below = '', load, send, scam = false, empty, placeholder = 'Сообщение…', onActivity, back = '/messages', decorate, onData, tools = '', left = '', reply = null, typing = null, receipts = false }) {
  box.innerHTML = String(html`
    <div class="chat-head">
      <div class="chat-row"><a href="${back}" class="pc-back chat-back" aria-label="Назад">${ic('left', 20, 2.2)}</a>${head}</div>
      ${top}
    </div>
    ${below}
    <div class="chat-msgs" data-msgs></div>
    ${tools}
    ${reply ? html`<div class="chat-reply hidden" data-reply-bar><span class="cr-ic">${ic('reply', 18, 2.2)}</span><div class="cr-tx"><b data-rb-who></b><span data-rb-text></span></div><button type="button" class="icon-btn cr-x" data-rb-x aria-label="Отменить ответ">${ic('close', 18, 2)}</button></div>` : ''}
    <form class="chat-form" data-send>
      ${left}
      <label class="icon-btn chat-attach" title="Отправить фото"><input type="file" accept="image/jpeg,image/png,image/webp" data-photo hidden>${ic('camera', 20)}<span class="sr">Отправить фото</span></label>
      <label class="sr" for="chat-body">Сообщение</label>
      <textarea id="chat-body" rows="1" maxlength="4000" placeholder="${placeholder}"></textarea>
      <button class="btn chat-send" type="submit" aria-label="Отправить">${ic('right', 20, 2.2)}<span class="chat-send-t">Отправить</span></button>
    </form>`);
  const msgs = $('[data-msgs]', box);
  const ta = $('#chat-body', box);
  const form = $('[data-send]', box);
  let lastId = 0;
  let lastDay = '';
  const known = new Map(); // id → сообщение (для цитаты в ответе)
  const qText = (q) => (q.body ? q.body : q.photo ? 'Фото' : q.video ? 'Видео' : q.file ? 'Файл' : q.kind === 'offer' ? 'Предложение цены' : 'Сообщение');
  // 1.57.0: видео и файл (присылают из приложения для iPhone), «изменено» у поправленного сообщения.
  const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);
  const attachHtml = (m) => html`${m.video ? html`<video class="msg-video" src="${m.video}" controls playsinline preload="metadata"></video>` : ''}${m.file ? html`<a class="msg-file" href="${m.file.url}" target="_blank" rel="noopener" download="${m.file.name}">${ic('download', 20, 2)}<span><b>${m.file.name}</b><small>${kb(m.file.size)}</small></span></a>` : ''}`;
  const edMark = (m) => html`<span class="msg-ed ${m.editedAt ? '' : 'hidden'}" data-ed>изменено · </span>`; // не .ed — это форма объявления
  const quote = (q) => html`<button type="button" class="msg-q" data-goto="${q.id}"><b>${q.mine ? 'Вы' : reply.other}</b><span>${q.photo ? ic('camera', 13, 2) : ''}${qText(q)}</span></button>`;
  const rpBtn = () => (reply ? html`<button type="button" class="msg-rp" data-rp aria-label="Ответить">${ic('reply', 16, 2.2)}</button>` : '');
  const append = (list) => {
    if (!list.length) return;
    const e = $('[data-empty]', msgs); if (e) e.remove();
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
    let out = '';
    for (const m of list) {
      const d = new Date(m.createdAt).toDateString();
      if (d !== lastDay) { lastDay = d; out += String(html`<div class="chat-day">${shortWhen(m.createdAt)}</div>`); }
      const d2 = decorate ? decorate(m) : null;
      known.set(m.id, { id: m.id, mine: m.mine, body: m.body, photo: !!m.photo, video: !!m.video, file: !!m.file, kind: m.kind || '' });
      const q = reply && m.reply ? quote(m.reply) : '';
      const can = reply && m.kind !== 'offer' ? 'can-rp' : ''; // на карточку предложения не отвечают — у неё свои кнопки
      const tm = html`<span class="t">${edMark(m)}${hm(m.createdAt)}${receipts && m.mine ? tickMark(m.read) : ''}</span>`;
      out += d2 ? String(html`<div class="msg ${m.mine ? 'out' : 'in'} ${d2.cls} ${can}" data-mid="${m.id}">${q}${d2.body}${tm}${can ? rpBtn() : ''}</div>`)
        : String(html`<div class="msg ${m.mine ? 'out' : 'in'} ${m.photo ? 'has-photo' : ''} ${q ? 'has-q' : ''} ${can}" data-mid="${m.id}">${q}${m.photo ? html`<a class="msg-photo" href="${m.photo}" target="_blank" rel="noopener" data-pv-src="${m.photo}" data-pv-group="chat"><img src="${m.photo}" alt="Фото" loading="lazy"></a>` : ''}${attachHtml(m)}<span data-mb>${m.body}</span>${tm}${can ? rpBtn() : ''}</div>`);
      const risk = scam && !m.mine && !m.kind ? riskOf(m.body) : null;
      if (risk) out += String(html`<div class="msg-risk r-${risk.k}" role="note">${ic(risk.k === 'messenger' ? 'chat' : risk.k === 'link' ? 'link' : risk.k === 'card' ? 'card' : 'shield', 16, 2.2)}<span>${risk.text}</span></div>`);
      lastId = Math.max(lastId, m.id);
    }
    msgs.insertAdjacentHTML('beforeend', out);
    if (nearBottom || list.some((m) => m.mine)) msgs.scrollTop = msgs.scrollHeight;
  };
  // Прочитано: все мои сообщения до readUpTo — ✓✓. Печатает: класс у чата (шапка — «печатает…»).
  const live = (r) => {
    if (receipts && r.readUpTo) $$('.msg.out[data-mid] [data-tk]:not(.rd)', msgs).forEach((t) => { if (Number(t.closest('[data-mid]').dataset.mid) <= r.readUpTo) { t.classList.add('rd'); t.innerHTML = String(tickSvg(true)); t.setAttribute('aria-label', 'Прочитано'); } });
    if (typing && r.typing !== undefined) box.classList.toggle('is-typing', !!r.typing);
  };
  // Правки: сервер присылает изменённые после прошлого опроса (r.edited; время — r.now).
  let editsSince = 0;
  const applyEdits = (list) => (list || []).forEach((e) => {
    const el = $(`[data-mid="${e.id}"]`, msgs);
    const k = known.get(e.id); if (k) k.body = e.body;
    if (!el) return;
    const b = $('[data-mb]', el); if (b) b.textContent = e.body;
    const ed = $('[data-ed]', el); if (ed) ed.classList.remove('hidden');
  });
  const poll = async () => { const r = await load(lastId, editsSince); if (r.messages.length) { append(r.messages); if (onActivity) onActivity(); } applyEdits(r.edited); if (r.now) editsSince = r.now; live(r); if (onData) onData(r); return r; };
  let tpSent = 0;
  ta.oninput = () => {
    ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    if (typing && ta.value.trim() && Date.now() - tpSent > 3000) { tpSent = Date.now(); typing().catch(() => {}); }
  };
  ta.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    if (e.key === 'Escape' && replyTo) { e.preventDefault(); setReply(null); }
  };
  // Ответ на сообщение: полоса над полем ввода, отмена — крестиком или Esc.
  let replyTo = null;
  const bar = $('[data-reply-bar]', box);
  const setReply = (id) => {
    const m = id ? known.get(Number(id)) : null;
    replyTo = m ? m.id : null;
    if (!bar) return;
    bar.classList.toggle('hidden', !m);
    if (!m) return;
    $('[data-rb-who]', bar).textContent = m.mine ? 'Ответ себе' : `Ответ ${reply.other}`;
    $('[data-rb-text]', bar).textContent = qText(m);
    ta.focus();
  };
  if (bar) $('[data-rb-x]', bar).onclick = () => setReply(null);
  if (reply) {
    msgs.addEventListener('click', (e) => {
      const rp = e.target.closest('[data-rp]');
      if (rp) { setReply(rp.closest('[data-mid]').dataset.mid); return; }
      const g = e.target.closest('[data-goto]');
      if (g) {
        const t = $(`[data-mid="${g.dataset.goto}"]`, msgs);
        if (!t) { toast('Это сообщение было давно — пролистайте переписку выше', true); return; }
        t.scrollIntoView({ behavior: 'smooth', block: 'center' });
        t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
      }
    });
    // Телефон: свайп вправо или долгое нажатие на сообщении — ответить.
    let sw = null;
    msgs.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const el = e.target.closest('.msg.can-rp');
      if (!el || e.target.closest('a, button')) return;
      sw = { el, x: e.clientX, y: e.clientY, dx: 0, lp: setTimeout(() => { if (sw && Math.abs(sw.dx) < 8) { navigator.vibrate?.(10); setReply(el.dataset.mid); sw = null; } }, 480) };
    });
    msgs.addEventListener('pointermove', (e) => {
      if (!sw) return;
      const dx = e.clientX - sw.x; const dy = e.clientY - sw.y;
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { clearTimeout(sw.lp); sw.el.style.transform = ''; sw = null; return; }
      sw.dx = dx;
      if (Math.abs(dx) > 8) clearTimeout(sw.lp);
      if (dx > 0) { sw.el.style.transform = `translateX(${Math.min(dx, 72)}px)`; sw.el.classList.toggle('rp-ready', dx > 56); }
    });
    const end = () => {
      if (!sw) return;
      clearTimeout(sw.lp);
      const { el, dx } = sw; sw = null;
      el.style.transition = 'transform .18s ease'; el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; el.classList.remove('rp-ready'); }, 200);
      if (dx > 56) { navigator.vibrate?.(10); setReply(el.dataset.mid); }
    };
    msgs.addEventListener('pointerup', end);
    msgs.addEventListener('pointercancel', end);
    msgs.addEventListener('contextmenu', (e) => { if (e.target.closest('.msg.can-rp') && matchMedia('(hover: none)').matches) e.preventDefault(); });
  }
  // send получает { body, photo, replyTo }: текст, фото (имя файла из /api/uploads) или и то и другое.
  const deliver = async (msg) => { append([await send(replyTo ? { ...msg, replyTo } : msg)]); setReply(null); if (onActivity) onActivity(); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = ta.value.trim();
    if (!body) return;
    ta.value = ''; ta.style.height = 'auto';
    try { await deliver({ body }); } catch (ex) { ta.value = body; toast(ex.message, true); }
  };
  // Фото: уменьшаем в браузере, загружаем и отправляем вместе с набранным текстом.
  const pick = $('[data-photo]', box);
  pick.onchange = async () => {
    const file = pick.files[0];
    pick.value = '';
    if (!file) return;
    const attach = pick.parentElement;
    attach.classList.add('busy');
    try {
      const up = await api('POST', '/api/uploads', await resizeImage(file, 1600));
      const body = ta.value.trim();
      ta.value = ''; ta.style.height = 'auto';
      await deliver({ body, photo: up.file });
    } catch (ex) { toast(ex.message, true); } finally { attach.classList.remove('busy'); }
  };
  // Быстрые темы в приветствии: подставляют текст в поле.
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-topic]');
    if (!b) return;
    ta.value = b.dataset.topic;
    // Быстрый вопрос покупателя: текст — в поле (можно дописать и отправить), остальные вопросы убираем.
    const asks = b.closest('.chat-asks'); if (asks) asks.remove();
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.oninput();
  });
  // Пока переписка на экране — раз в 2,5 секунды (галочки и «печатает» почти сразу); свёрнута — раз в 10 секунд.
  let ticks = 0;
  const timer = setInterval(() => { ticks += 1; if (!document.hidden || ticks % 4 === 0) poll().catch(() => {}); }, 2500);
  const onVis = () => { if (!document.hidden) poll().catch(() => {}); };
  document.addEventListener('visibilitychange', onVis);
  (async () => {
    const r = await load(0);
    if (!r.messages.length && empty) msgs.innerHTML = String(html`<div data-empty>${empty}</div>`);
    append(r.messages);
    live(r);
    if (onData) onData(r);
    msgs.scrollTop = msgs.scrollHeight;
    if (onActivity) onActivity();
  })().catch((e) => toast(e.message, true));
  if (window.matchMedia('(min-width: 901px)').matches) $('.chat-back', box).classList.add('hidden');
  ta.focus();
  const stop = () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  stop.poll = poll;
  stop.fill = (text) => { ta.value = text; ta.focus(); ta.oninput(); };
  return stop;
}

// ---------- торг: предложение цены ----------
// 1.54.0: сколько ждать проверки — по медиане за 14 дней (lib/admin.js reviewEta); пока решений мало — «несколько часов».
const etaText = (ms) => {
  if (!ms) return 'в течение нескольких часов';
  const m = Math.max(5, Math.round(ms / 60000 / 5) * 5);
  if (m < 60) return `за ${m} мин`;
  const h = Math.round(m / 60);
  return h <= 1 ? 'примерно за час' : h < 24 ? `примерно за ${h} ${plural(h, 'час', 'часа', 'часов')}` : 'в течение дня';
};
export const reviewLine = (rv) => (rv ? `${rv.night ? 'Ночью модераторы отдыхают — проверим утром' : `Обычно проверяем ${etaText(rv.median)}`}. ${rv.place > 1 ? `В очереди перед вами: ${rv.place - 1}.` : 'Вы первый в очереди.'}` : 'Модератор проверит объявление — обычно это несколько часов.');
// Карточка «На проверке» у своего объявления: срок, место в очереди, три шага и что пришлём, когда проверим.
export function reviewCard(rv, l) {
  const sent = l.updatedAt || l.createdAt;
  return html`<section class="mq-card" aria-label="Объявление на проверке">
    <span class="mq-ic">${ic(rv && rv.night ? 'moon' : 'clock', 22, 2)}</span>
    <div class="mq-main">
      <b class="mq-t">Объявление на проверке</b>
      <span class="mq-s">${rv && rv.night ? 'Ночью модераторы отдыхают — проверим утром.' : html`Обычно проверяем <b>${etaText(rv && rv.median)}</b>.`}
        ${rv ? (rv.place > 1 ? html` Перед вами в очереди: <b>${rv.place - 1}</b>.` : ' Вы первый в очереди.') : ''}</span>
      <ol class="mq-steps">
        <li class="done"><i>${ic('check', 13, 3)}</i><span>Отправлено<small>${shortWhen(sent) === 'сегодня' ? `в ${hm(sent)}` : shortWhen(sent)}</small></span></li>
        <li class="now"><i></i><span>Проверка<small>сейчас</small></span></li>
        <li><i></i><span>Опубликовано<small>после проверки</small></span></li>
      </ol>
      <span class="mq-foot">${ic('bell', 16, 2)}Как только проверим — пришлём уведомление${S.config.mail ? ' и письмо' : ''}.</span>
      ${l.flags ? html`<span class="mq-flag">Объявление похоже на товар из раздела «${l.flags}» <a href="/page/rules">правил</a> — проверим внимательнее.</span>` : ''}
    </div>
  </section>`;
}
// Сумма-подсказка: −5/−10/−15% с округлением до «красивой» (100, 500 или 1000 ₽).
const niceStep = (n) => (n >= 100000 ? 1000 : n >= 10000 ? 500 : 100);
const niceDown = (n) => { const step = niceStep(n); return Math.max(step, Math.floor(n / step) * step); };
// 1.54.0: окно и для первого предложения покупателя, и для встречной цены (counter): тогда сумма — строго между
// low и high (продавец: между предложением и ценой; покупатель: ниже цены продавца), подсказки — середина и четверти.
export function offerModal({ listingPrice, title, onSubmit, counter = null }) {
  const min = listingPrice ? Math.ceil(listingPrice * 0.3) : 1;
  let picks; let head; let note; let ok = 'Предложить';
  if (counter) {
    const { low, high, theirs, bySeller } = counter; // theirs — на что отвечаем; bySeller — отвечает продавец
    const step = niceStep(high || theirs);
    const round = (v) => Math.round(v / step) * step;
    picks = high ? [0.25, 0.5, 0.75].map((k) => round(low + (high - low) * k)).filter((v, i, x) => v > low && v < high && x.indexOf(v) === i) : [];
    head = html`<h2>${bySeller ? 'Ваша цена' : 'Предложить свою'}</h2>
      <p class="muted" style="margin:0 0 14px">${title}${listingPrice ? html` · в объявлении <b style="color:var(--text)">${rub(listingPrice)}</b>` : ''}</p>
      <div class="offer-vs"><span><small>${bySeller ? 'Предлагает покупатель' : 'Цена продавца'}</small><b>${rub(theirs)}</b></span>${ic('right', 18, 2)}<span class="you"><small>${bySeller ? 'Вы уступите до' : 'Вы предложите'}</small><b data-vs>—</b></span></div>`;
    note = bySeller ? `Сумма — больше ${rub(low)}${high ? ` и меньше ${rub(high)}` : ''}. Покупатель сможет согласиться, отказаться или предложить свою.`
      : `Сумма — меньше ${rub(high)}${listingPrice ? `, но не меньше ${rub(min)}` : ''}. Продавец сможет согласиться, отказаться или назвать свою.`;
    ok = 'Отправить';
  } else {
    picks = listingPrice ? [5, 10, 15].map((p) => niceDown(listingPrice * (1 - p / 100))).filter((v, i, a) => v < listingPrice && a.indexOf(v) === i) : [];
    head = html`<h2>Предложить цену</h2><p class="muted" style="margin:0 0 16px">${title}${listingPrice ? html` · сейчас <b style="color:var(--text)">${rub(listingPrice)}</b>` : ''}</p>`;
    note = `Продавец сможет согласиться, отказаться или назвать свою цену — ответ придёт в чат.${listingPrice ? ` Можно предложить от ${rub(min)}.` : ''}`;
  }
  const off = (v) => (listingPrice && v < listingPrice ? html`<span class="cnt">−${Math.round((1 - v / listingPrice) * 100)}%</span>` : '');
  openModal(String(html`${head}
    <div class="ed-money offer-money"><label class="sr" for="of-sum">${counter ? 'Ваша цена' : 'Ваша цена'}</label><input id="of-sum" class="input" inputmode="numeric" autocomplete="off" placeholder="Ваша цена"><span>₽</span></div>
    ${picks.length ? html`<div class="offer-picks">${picks.map((v) => html`<button type="button" class="chip" data-pick-sum="${v}">${rub(v)}${off(v)}</button>`)}</div>` : ''}
    <p class="offer-note">${ic('info', 16, 2)}<span>${note}</span></p>
    <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-accent" data-ok>${ok}</button></div>`), (m, close) => {
    const inp = $('#of-sum', m); const vs = $('[data-vs]', m);
    const show = () => { if (vs) { const d = Number(inp.value.replace(/\D/g, '')); vs.textContent = d ? rub(d) : '—'; } };
    inp.oninput = () => { const d = inp.value.replace(/\D/g, '').slice(0, 11); inp.value = d ? NF.format(Number(d)) : ''; show(); };
    $$('[data-pick-sum]', m).forEach((b) => { b.onclick = () => { inp.value = NF.format(Number(b.dataset.pickSum)); show(); inp.focus(); }; });
    $('[data-x]', m).onclick = close;
    const btn = $('[data-ok]', m);
    btn.onclick = async () => {
      const sum = Number(inp.value.replace(/\D/g, ''));
      if (!sum) { inp.focus(); toast('Укажите сумму', true); return; }
      btn.disabled = true;
      try { await onSubmit(sum); close(); } catch (e) { toast(e.message, true); btn.disabled = false; }
    };
    setTimeout(() => inp.focus(), 50);
  });
}
// Карточка предложения в чате и её низ (кнопки или итог) — низ перерисовывается при каждом опросе.
// 1.54.0: торгуются обе стороны — у карточки свой заголовок (предложение / цена продавца / новое предложение),
// отвечает тот, кому предложили: «Принять», «Своя цена», «Отклонить».
const offerCard = (o, m) => html`<div class="offer-card" data-offer="${m.offerId}">
    <div class="offer-k">${ic('tag', 14, 2.2)}<span data-offer-k>Предложение цены</span></div>
    <div class="offer-sum"><b data-offer-sum></b><s data-offer-was></s><span class="offer-pct" data-offer-off></span></div>
    <div class="offer-foot" data-offer-foot></div></div>`;
function paintOffers(root, offers, role) {
  for (const o of offers || []) {
    const el = $(`[data-offer="${o.id}"]`, root);
    if (!el || el.dataset.state === o.status) continue;
    el.dataset.state = o.status;
    const mine = (o.bySeller ? 'seller' : 'buyer') === role; // это предложение сделал я
    const them = o.bySeller ? 'Продавец' : 'Покупатель';
    el.classList.toggle('by-seller', o.bySeller);
    $('[data-offer-k]', el).textContent = o.bySeller ? (mine ? 'Ваша цена' : 'Цена продавца') : o.parentId ? 'Новое предложение' : 'Предложение цены';
    $('[data-offer-sum]', el).textContent = rub(o.price);
    $('[data-offer-was]', el).textContent = o.listingPrice ? rub(o.listingPrice) : '';
    $('[data-offer-off]', el).textContent = o.listingPrice && o.price < o.listingPrice ? `−${Math.round((1 - o.price / o.listingPrice) * 100)}%` : '';
    el.closest('.msg').classList.toggle('offer-off', ['withdrawn', 'declined', 'countered'].includes(o.status));
    $('[data-offer-foot]', el).innerHTML = String(o.status === 'pending'
      ? (!mine
        ? html`<button type="button" class="btn btn-accent btn-sm" data-offer-act="accept" data-oid="${o.id}">${ic('check', 16, 2.4)}Принять</button><button type="button" class="btn btn-soft btn-sm" data-offer-act="counter" data-oid="${o.id}">${ic('tag', 16, 2)}Своя цена</button><button type="button" class="offer-link offer-no" data-offer-act="decline" data-oid="${o.id}">Отклонить</button>`
        : html`<span class="offer-st wait">${ic('clock', 15, 2)}Ждём ответа ${o.bySeller ? 'покупателя' : 'продавца'}</span><button type="button" class="offer-link" data-offer-act="withdraw" data-oid="${o.id}">Отозвать</button>`)
      : o.status === 'accepted' ? html`<span class="offer-st ok">${ic('check', 15, 2.6)}Договорились на ${rub(o.price)}</span>`
        : o.status === 'declined' ? html`<span class="offer-st">${mine ? `${them === 'Продавец' ? 'Покупатель' : 'Продавец'} отказался` : 'Вы отказались'}</span>`
          : o.status === 'countered' ? html`<span class="offer-st">${ic('refresh', 15, 2)}${mine ? `${o.bySeller ? 'Покупатель' : 'Продавец'} предложил свою цену` : 'Вы предложили свою цену'}</span>`
            : html`<span class="offer-st">${mine ? 'Вы отозвали или заменили предложение' : `${them} отозвал или заменил предложение`}</span>`);
  }
}

// ---------- быстрые ответы продавца ----------
let qrMax = 12; // сколько шаблонов можно (сервер: 12, с тарифом магазина — 30)
function repliesModal(items, done) {
  let list = [...items];
  openModal(String(html`<h2>Быстрые ответы</h2><p class="muted" style="margin:0 0 14px">Появляются над полем сообщения — нажмите, чтобы вставить, поправьте и отправьте.</p>
    <div class="qr-list" id="qr-list"></div>
    <div class="qr-add"><label class="sr" for="qr-new">Новый ответ</label><input id="qr-new" class="input" maxlength="300" placeholder="Например: Отправлю СДЭКом в день оплаты"><button type="button" class="btn btn-dark" data-qr-add>${ic('plus', 18, 2.2)}<span class="sr">Добавить</span></button></div>
    <div class="modal-actions"><button class="btn btn-line" data-qr-reset>Вернуть стандартные</button><span style="flex:1"></span><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Сохранить</button></div>`), (m, close) => {
    const paint = () => {
      $('#qr-list', m).innerHTML = String(list.length ? html`${list.map((t, i) => html`<div class="qr-item"><span>${t}</span><button type="button" class="icon-btn sm" data-qr-rm="${i}" aria-label="Удалить ответ">${ic('trash', 16)}</button></div>`)}`
        : html`<div class="qr-empty">Пока пусто — добавьте свой первый ответ.</div>`);
      $$('[data-qr-rm]', m).forEach((b) => { b.onclick = () => { list.splice(Number(b.dataset.qrRm), 1); paint(); }; });
    };
    paint();
    const add = () => { const v = $('#qr-new', m).value.trim(); if (!v) return; if (list.length >= qrMax) { toast(`Не больше ${qrMax} ответов`, true); return; } list.push(v); $('#qr-new', m).value = ''; paint(); };
    $('[data-qr-add]', m).onclick = add;
    $('#qr-new', m).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    $('[data-x]', m).onclick = close;
    $('[data-qr-reset]', m).onclick = async () => { try { const r = await api('PUT', '/api/my/replies', { reset: true }); close(); done(r.items, r.max); toast('Вернули стандартные ответы'); } catch (e) { toast(e.message, true); } };
    $('[data-ok]', m).onclick = async () => {
      const pending = $('#qr-new', m).value.trim(); if (pending) list.push(pending);
      try { const r = await api('PUT', '/api/my/replies', { items: list }); close(); done(r.items, r.max); toast('Ответы сохранены'); } catch (e) { toast(e.message, true); }
    };
  });
}
// Быстрые вопросы покупателя — под это объявление: торг — если продавец разрешил, доставка — если отправляет.
const buyerAsks = (l) => ['Здравствуйте! Ещё актуально?', 'Где и когда можно посмотреть?',
  ...(l.price && l.bargain ? ['Торг возможен?'] : []), ...(l.delivery ? ['Отправите по России?'] : []), 'Пришлёте ещё фото?'];
const repliesRow = (items) => html`${items.map((t) => html`<button type="button" class="chip" data-topic="${t}" title="${t}">${t.length > 42 ? `${t.slice(0, 40)}…` : t}</button>`)}<button type="button" class="chip qr-edit" data-qr-edit>${ic('edit', 15, 2)}${items.length ? 'Шаблоны' : 'Добавить шаблон'}</button>`;

// ---------- подписка на продавца ----------
const followLabel = (on) => html`${ic(on ? 'check' : 'bell', 18, 2.2)}<span>${on ? 'Вы подписаны' : 'Подписаться'}</span>`;
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-follow]');
  if (!b) return;
  e.preventDefault();
  if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
  b.disabled = true;
  try {
    const r = await api('POST', `/api/users/${b.dataset.follow}/follow`, { follow: b.getAttribute('aria-pressed') !== 'true' });
    $$(`[data-follow="${b.dataset.follow}"]`).forEach((x) => { x.setAttribute('aria-pressed', r.following ? 'true' : 'false'); x.classList.toggle('on', r.following); x.innerHTML = String(followLabel(r.following)); });
    $$('[data-followers]').forEach((x) => { x.textContent = NF.format(r.followers); });
    toast(r.following ? 'Подписка оформлена — расскажем о новых объявлениях' : 'Вы отписались');
  } catch (ex) { toast(ex.message, true); }
  b.disabled = false;
});
export const followBtn = (id, on, cls = 'btn-soft') => html`<button type="button" class="btn ${cls} btn-block follow-btn ${on ? 'on' : ''}" data-follow="${id}" aria-pressed="${on ? 'true' : 'false'}">${followLabel(on)}</button>`;

const supportWelcome = () => html`<div class="msg in support-hello">
    <strong>Здравствуйте${S.user ? `, ${S.user.name}` : ''}!</strong> Это поддержка Торганы. Напишите вопрос — ответит человек, а не бот.
    Никогда не сообщайте пароль и коды из СМС — мы их не спрашиваем.
    <span class="chat-quick">${SUPPORT_TOPICS.map((t) => html`<button type="button" class="chip" data-topic="${t}">${t}</button>`)}</span></div>`;

// 27.11: нажали на имя в шапке — карточка репутации собеседника (вместо колонки справа): уровень за 12 месяцев,
// «Телефон подтверждён», сделки / ответ / жалобы, комплименты, напоминание о безопасности, ссылка на профиль.
async function repPopover(btn, o, role) {
  const head = btn.closest('.chat-head');
  const old = $('.rep-pop', head);
  if (old) { old.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  const { user } = await api('GET', `/api/users/${o.id}`);
  head.insertAdjacentHTML('beforeend', String(html`<div class="rep-pop" role="dialog" aria-label="Репутация: ${o.name}">
    ${repCard(user.rep)}
    ${user.badges && user.badges.phone ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Телефон подтверждён</span>` : ''}
    <p class="rp-safe">${ic('shield', 18)}<span>${role === 'buyer' ? 'Не переходите в мессенджеры и не вносите предоплату — общайтесь здесь.' : 'Не называйте коды из СМС и не переходите по ссылкам «для получения оплаты».'}</span></p>
    <a class="rp-more" href="/u/${o.id}">Профиль и все объявления${ic('right', 16, 2.2)}</a>
  </div>`));
  btn.setAttribute('aria-expanded', 'true');
}

export async function viewMessages(cid) {
  if (!requireAuth()) return;
  setTitle('Сообщения');
  const isSupport = cid === 'support';
  const convId = cid && !isSupport ? Number(cid) : null;
  app.innerHTML = String(html`<div class="wrap"><div class="inbox ${cid ? 'has-chat' : ''}">
    <div class="inbox-list"><h1>Сообщения</h1>
      <a href="/messages/support" class="conv support ${isSupport ? 'on' : ''}" id="support-row">
        ${supportAva(44)}
        <span class="conv-body"><span class="support-name">${supportName()}</span><span class="conv-sub">Отвечают люди, а не боты</span></span>
        <span class="badge hidden" id="support-badge"></span>
        <span class="pin" title="Закреплено">${ic('pushpin', 16)}<span class="sr">Закреплено</span></span>
      </a>
      <div class="inbox-label">Переписки</div>
      <div id="convs"><div class="loader"></div></div></div>
    <section class="chat" id="chat">${cid ? html`<div class="loader" style="flex:1"></div>` : html`<div class="chat-empty"><div>${svg(P.chat, 40, 1.4)}<p>Выберите диалог слева.<br>Чтобы написать продавцу, откройте объявление.</p></div></div>`}</section>
  </div></div>`);

  const loadList = async () => {
    const { items } = await api('GET', '/api/conversations');
    const box = $('#convs');
    if (!box) return;
    box.innerHTML = items.length ? String(html`${items.map((c) => html`<a href="/messages/${c.id}" class="conv ${c.id === convId ? 'on' : ''}">
        <span class="conv-img">${c.photo ? html`<img src="${c.photo}" alt="" loading="lazy">` : svg(P.image, 22, 1.4)}${ava(c.other, 'xs conv-ava')}</span>
        <span class="conv-body">
          <span class="conv-top"><span class="conv-name">${c.other.name}${c.role === 'seller' ? html` <span class="conv-role">· покупатель</span>` : ''}</span><span class="conv-when">${shortWhen(c.updatedAt)}</span></span>
          <span class="conv-title" style="display:block">${c.title} · ${c.status === 'deleted' ? 'объявление удалено' : price(c.price, c.priceUnit)}</span>
          <span class="conv-last" style="display:block">${c.lastMine ? tickMark(c.lastMine === 2) : ''}${c.lastBody || 'Нет сообщений'}</span>
        </span>
        ${c.unread ? html`<span class="badge">${c.unread}</span>` : ''}
      </a>`)}`)
      : String(html`<div style="padding:8px 22px 22px" class="muted">Здесь появятся переписки с продавцами и покупателями.</div>`);
  };
  // Непрочитанные ответы поддержки — счётчик на закреплённом диалоге.
  const supportBadge = () => {
    const other = $$('#convs .badge').reduce((n, b) => n + Number(b.textContent || 0), 0);
    const n = Math.max(0, S.unread - other);
    const b = $('#support-badge'); if (b) { b.textContent = n; b.classList.toggle('hidden', !n || isSupport); }
  };

  await loadList();
  supportBadge();
  const listTimer = setInterval(() => loadList().then(supportBadge).catch(() => {}), 15000);
  let stopChat = () => {};
  let offersNow = []; // предложения цены в открытом диалоге — для «Своя цена»
  setCleanup(() => { clearInterval(listTimer); stopChat(); });
  if (!cid) return;

  if (isSupport) {
    stopChat = mountChat($('#chat'), {
      head: html`${supportAva(44)}<div style="flex:1;min-width:0"><div class="support-name">${supportName()}</div><span class="muted" style="font-size:14px">Отвечают люди, а не боты</span></div>`,
      load: (after) => api('GET', `/api/support?after=${after}`),
      send: async (msg) => (await api('POST', '/api/support/messages', msg)).message,
      empty: supportWelcome(),
      placeholder: 'Опишите вопрос…',
      onActivity: () => refreshMe()
    });
    return;
  }
  const data = await api('GET', `/api/conversations/${convId}`);
  const { listing: l, other } = data;
  const role = data.conversation.role;
  const canOffer = role === 'buyer' && l.status === 'active' && (l.bargain || l.price === null); // продавец указал «без торга» — кнопки ₽ нет
  stopChat = mountChat($('#chat'), {
    // 27.11 («1+5 · аватар справа»): имя (нажатие — карточка репутации), под ним уровень или «печатает…», ⋮, аватар;
    // ниже — объявление: фото, название, цена или статус.
    head: html`<button type="button" class="ch-who" data-rep aria-haspopup="dialog" aria-expanded="false">
        <b class="ch-name">${nameSeal(other.name, other.badges)}</b>
        <span class="ch-rep">${other.rep ? repLine(other.rep) : role === 'buyer' ? 'Продавец' : 'Покупатель'}</span>
        <span class="ch-typ"><span class="ct-dots" aria-hidden="true"><i></i><i></i><i></i></span>печатает…</span></button>
      <button type="button" class="icon-btn chat-more" data-chat-more aria-label="Ещё" aria-haspopup="menu">${ic('more', 20)}</button>
      <a href="/u/${other.id}" class="ch-ava" aria-label="Профиль: ${other.name}">${ava(other)}</a>`,
    top: (() => {
      const gone = l.status === 'deleted'; const sold = l.status === 'sold';
      const inner = html`<span class="ch-ph ${gone || sold ? 'off' : ''}">${l.photo ? html`<img src="${l.photo}" alt="">` : svg(P.image, 20, 1.4)}</span>
        <span class="ch-tx"><span class="ch-t">${l.title}</span><span class="ch-m">${gone ? html`<span class="ch-st">Объявление удалено — переписка сохранена</span>` : html`<b class="${sold ? 'off' : ''}">${price(l.price, l.priceUnit)}</b>${sold ? html`<span class="ch-st dark">Продано</span>` : ''}`}</span></span>`;
      return gone ? html`<div class="ch-item">${inner}</div>` : html`<a class="ch-item" href="/l/${l.id}">${inner}${ic('right', 18, 2.2)}</a>`;
    })(),
    reply: { other: other.name },
    receipts: true,
    typing: () => api('POST', `/api/conversations/${convId}/typing`),
    below: html`<div data-deal-slot></div>`,
    load: async (after, edits) => {
      const r = await api('GET', `/api/conversations/${convId}?after=${after}&seen=${document.hidden ? 0 : 1}&edits=${edits || 0}`);
      const slot = $('[data-deal-slot]');
      const paintDeal = (st) => {
        if (!slot || JSON.stringify(st) === slot.dataset.state) return;
        slot.dataset.state = JSON.stringify(st);
        slot.innerHTML = String(dealBar(st));
        bindDeal(slot, convId, async () => { const x = await api('GET', `/api/conversations/${convId}?after=999999999`); slot.dataset.state = ''; paintDeal(x.deal); });
        dealWow(convId, st, slot);
      };
      paintDeal(r.deal);
      return r;
    },
    send: async (msg) => { const r = await api('POST', `/api/conversations/${convId}/messages`, msg); loadList().catch(() => {}); return r.message; },
    decorate: (m) => (m.kind === 'offer' ? { cls: 'offer-msg', body: offerCard(null, m) } : m.kind === 'offer-reply' ? { cls: 'offer-reply', body: html`${m.body}` } : null),
    onData: (r) => { offersNow = r.offers || offersNow; paintOffers($('#chat'), r.offers, role); },
    tools: role === 'seller' ? html`<div class="chat-tools" data-replies></div>`
      : l.status === 'active' ? html`<div class="chat-tools chat-asks" aria-label="Быстрые вопросы">${buyerAsks(l).map((t) => html`<button type="button" class="chip" data-topic="${t}">${t}</button>`)}</div>` : '',
    left: canOffer ? html`<button type="button" class="icon-btn chat-offer" data-make-offer title="Предложить цену" aria-label="Предложить цену">₽</button>` : '',
    scam: true,
    empty: html`<div class="chat-day">Напишите первое сообщение — например, уточните состояние или договоритесь о встрече.${canOffer && l.price ? ' Или предложите свою цену кнопкой ₽.' : ''}</div>`,
    onActivity: () => refreshMe()
  });
  const chatEl = $('#chat');
  // 1.48.0: чёрный список — вместо поля ввода плашка: кто кого заблокировал и что делать.
  let block = data.block || null;
  const paintBlock = () => {
    const f = $('[data-send]', chatEl); const tl = $('.chat-tools', chatEl); const old = $('.chat-blocked', chatEl);
    if (old) old.remove();
    if (f) f.classList.toggle('hidden', !!block);
    if (tl) tl.classList.toggle('hidden', !!block);
    if (!block) return;
    f.insertAdjacentHTML('beforebegin', String(block === 'me'
      ? html`<div class="chat-blocked"><span class="cb-ic">${ic('ban', 18, 2)}</span><div><b>Вы заблокировали ${other.name}</b><span>Он не может писать вам и предлагать цену.</span></div><button type="button" class="btn btn-soft btn-sm" data-unblock>Разблокировать</button></div>`
      : html`<div class="chat-blocked"><span class="cb-ic">${ic('ban', 18, 2)}</span><div><b>Нельзя отправить сообщение</b><span>${other.name} ограничил сообщения от вас.</span></div></div>`));
  };
  paintBlock();
  chatEl.addEventListener('click', async (e) => {
    const pop = $('.rep-pop', chatEl); // карточка репутации закрывается нажатием мимо неё
    if (pop && !e.target.closest('.rep-pop, [data-rep]')) { pop.remove(); $('[data-rep]', chatEl).setAttribute('aria-expanded', 'false'); }
    const rb = e.target.closest('[data-rep]');
    if (rb) { repPopover(rb, other, role).catch((ex) => toast(ex.message, true)); return; }
    const mb = e.target.closest('[data-chat-more]');
    if (mb) {
      pickList({ anchor: mb, title: other.name, search: false, value: '', items: [
        { value: 'profile', label: 'Профиль собеседника' },
        ...(l.status !== 'deleted' ? [{ value: 'listing', label: 'Открыть объявление' }] : []),
        { value: block === 'me' ? 'unblock' : 'block', label: block === 'me' ? 'Разблокировать' : 'Заблокировать' },
        { value: 'report', label: 'Пожаловаться в поддержку' }
      ], onPick: async (v) => {
        if (v === 'profile') go(`/u/${other.id}`);
        else if (v === 'listing') go(`/l/${l.id}`);
        else if (v === 'report') go('/messages/support');
        else if (v === 'block' || v === 'unblock') { const r = await blockFlow(other, block === 'me'); if (r !== undefined) { block = r ? 'me' : null; paintBlock(); } }
      } });
      return;
    }
    if (e.target.closest('[data-unblock]')) { const r = await blockFlow(other, true); if (r !== undefined) { block = r ? 'me' : null; paintBlock(); } }
  });
  chatEl.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-offer-act]');
    if (a && a.dataset.offerAct === 'counter') { // 1.54.0: своя цена в ответ
      const o = offersNow.find((x) => String(x.id) === a.dataset.oid);
      if (!o) return;
      const prev = o.parentId ? offersNow.find((x) => x.id === o.parentId) : null; // моё прошлое предложение
      const min = l.price ? Math.ceil(l.price * 0.3) : 1;
      offerModal({ listingPrice: l.price, title: l.title,
        counter: o.bySeller ? { theirs: o.price, bySeller: false, high: o.price, low: Math.max(min, prev ? prev.price : min) }
          : { theirs: o.price, bySeller: true, low: o.price, high: l.price },
        onSubmit: async (sum) => { await api('POST', `/api/offers/${o.id}/counter`, { price: sum }); await stopChat.poll(); loadList().catch(() => {}); toast(o.bySeller ? 'Ваше предложение отправлено продавцу' : 'Ваша цена отправлена покупателю'); } });
      return;
    }
    if (a) {
      a.disabled = true;
      try {
        await api('POST', `/api/offers/${a.dataset.oid}/${a.dataset.offerAct}`);
        await stopChat.poll(); loadList().catch(() => {});
        toast({ accept: `Договорились — ${role === 'seller' ? 'покупатель' : 'продавец'} получит уведомление`, decline: 'Предложение отклонено', withdraw: 'Предложение отозвано' }[a.dataset.offerAct]);
      } catch (ex) { toast(ex.message, true); a.disabled = false; }
      return;
    }
    if (e.target.closest('[data-make-offer]')) {
      offerModal({ listingPrice: l.price, title: l.title, onSubmit: async (sum) => { await api('POST', `/api/conversations/${convId}/offer`, { price: sum }); await stopChat.poll(); loadList().catch(() => {}); toast('Предложение отправлено продавцу'); } });
      return;
    }
    if (e.target.closest('[data-qr-edit]')) repliesModal(qrItems, paintReplies);
  });
  let qrItems = [];
  const paintReplies = (items, max) => { qrItems = items; if (max) qrMax = max; const row = $('[data-replies]', chatEl); if (row) row.innerHTML = String(repliesRow(items)); };
  if (role === 'seller') api('GET', '/api/my/replies').then((r) => paintReplies(r.items, r.max)).catch(() => {});
}

// Репутация: сделки, комплименты, «Что-то пошло не так».
import { $, $$, NF, api, html, plural, raw } from './core.js';
import { ic } from './icons.js';
import { openModal, toast } from './ui.js';
import { torganaAva } from './messages.js';
import { firstChip, verifiedSeal } from './badges.js';

// ================= репутация (1.46.0): сделки, а не оценки =================
// 1.59.0: уровень — объёмная монета: Новичок — бронза с листком, Надёжный — изумруд со щитом, Опытный — золото
// с рукопожатием (1.66.0, было со звездой), Мастер Торганы — бриллиант с короной. Те же монеты — картинками в приложении (Assets Level0–3).
// Цвета: [светлый, середина, тёмный, обод светлый, обод тёмный, знак].
let medalN = 0;
const MEDAL = [['#F6C9A0', '#C7834F', '#7A4320', '#FFE2C6', '#B06D3C', '#FFF4EA'], ['#B8F5C9', '#2FBF6A', '#0B6B3A', '#D8FFE3', '#22A35A', '#FFFFFF'],
  ['#FFF1B0', '#F2B925', '#9A5B05', '#FFF6CF', '#D99A12', '#FFFBEA'], ['#E8F3FF', '#7FB2FF', '#4B2FD6', '#F2E9FF', '#8F6BFF', '#FFFFFF']];
const MEDAL_MARK = [
  (g) => `<path d="M16.8 7.2c-5.6-.2-9.4 2.3-9.6 6.6 0 .9.2 1.7.6 2.4 1.1-2.6 3.2-4.3 5.9-5.4-2.4 1.5-4.2 3.4-5.1 5.9.7.4 1.5.5 2.3.5 4.4-.1 6.2-4 5.9-10z" fill="${g}"/>`,
  (g, d) => `<path d="M12 6.3l5.2 1.9v3.7c0 3.2-2.2 5.6-5.2 6.6-3-1-5.2-3.4-5.2-6.6V8.2z" fill="${g}"/><path d="M9.6 12.2l1.7 1.7 3.2-3.3" fill="none" stroke="${d}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  (g) => `<g transform="translate(5.1 4.9) scale(.575)" fill="none" stroke="${g}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l2 2a1.4 1.4 0 0 0 2-2"/><path d="M14 14l2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2.8 2.8 0 0 0-4 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a4 4 0 0 1 4.8-.6l.5.3a3 3 0 0 0 2 .4H21v8h-2M3 4h3l4 4M3 13h3l1.5 1.5"/><path d="M8 17l1.5 1.5a1.4 1.4 0 0 0 2-2"/></g>`, // «Опытный» — рукопожатие (1.66.0)
  (g) => `<path d="M7.2 15l-.7-5.8 3.3 2.5L12 7.6l2.2 4.1 3.3-2.5-.7 5.8z" fill="${g}"/><rect x="7.3" y="15.9" width="9.4" height="1.6" rx=".8" fill="${g}"/>`];
export function levelMedal(level = 0, size = 20) {
  const k = `md${++medalN}`; const [light, mid, dark, rimL, rimD, glyph] = MEDAL[level] || MEDAL[0];
  return raw(`<svg class="medal" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs>
<linearGradient id="${k}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rimL}"/><stop offset=".55" stop-color="${rimD}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
<radialGradient id="${k}f" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
<linearGradient id="${k}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="${k}s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy=".55" stdDeviation=".35" flood-color="#000" flood-opacity=".35"/></filter></defs>
<ellipse cx="12" cy="22.6" rx="7.5" ry="1.1" fill="#000" opacity=".16"/><circle cx="12" cy="12.6" r="10.6" fill="${dark}"/><circle cx="12" cy="11.6" r="10.6" fill="url(#${k}r)"/>
<circle cx="12" cy="11.6" r="8.6" fill="url(#${k}f)"/><circle cx="12" cy="11.6" r="8.6" fill="none" stroke="#000" stroke-opacity=".18" stroke-width=".5"/>
<path d="M5.2 9.2a7.4 6 0 0 1 13.6 0c-2-1.3-4.3-1.9-6.8-1.9s-4.8.6-6.8 1.9z" fill="url(#${k}g)"/>
<g transform="translate(0 -.4)" filter="url(#${k}s)">${(MEDAL_MARK[level] || MEDAL_MARK[0])(glyph, dark)}</g></svg>`);
}
const dealsWord = (n) => `${NF.format(n)}\u00a0${plural(n, 'сделка', 'сделки', 'сделок')}`; // «5 сделок» не разрывается
// Строка под именем: «● Опытный · 27 сделок». 1.49.0: shop — у магазина без уровня «Новый магазин» вместо «Новичок»;
// deals: false — без числа сделок (в публичном профиле оно в счётчиках рядом).
// 1.52.0: first — медаль «Один из первых» (badges.first): стоит в той же строке, справа от уровня.
export const repLine = (r, href = '', { shop = false, deals = true, first = null, who = '', kind = '' } = {}) => {
  const inner = r ? html`${levelMedal(r.level, 18)}<b>${shop && !r.level ? 'Новый магазин' : r.levelName}</b>${deals && r.deals ? html`<span>·\u00a0${dealsWord(r.deals)}</span>` : ''}` : '';
  const line = !r ? '' : href ? html`<a class="rep-line l${r.level}" href="${href}">${inner}</a>` : html`<span class="rep-line l${r.level}">${inner}</span>`;
  return first ? html`<span class="rep-row">${line}${firstChip(first, who, kind || (shop ? 'shop' : ''))}</span>` : line;
};
const REPLY_TXT = { hour: '~1 ч', hours: '1–3 ч', day: '< суток', days: '1–2 дня' };
const MARKS = { first: 'Первая сделка', 10: '10 сделок', 50: '50 сделок', 100: '100 сделок', year: 'Год без жалоб' };
// Карточка репутации: уровень, три факта, комплименты, вехи. compact — для объявления (две метки, без вех).
export function repCard(r, compact = false) {
  if (!r) return '';
  const tags = compact ? r.tags.slice(0, 2) : r.tags;
  return html`<div class="rep ${compact ? 'compact' : ''}">
    ${compact ? '' : html`<div class="rep-head">${levelMedal(r.level, 40)}<span><b>${r.levelName}</b><small>${r.newbie ? 'сделок пока мало' : 'за 12 месяцев'}</small></span>
      ${r.buyer ? html`<span class="rep-buyer">${ic('check', 13, 2.6)}Надёжный покупатель</span>` : ''}</div>`}
    ${r.newbie ? '' : html`<div class="rep-nums">
      <span><b>${NF.format(r.deals)}</b>${plural(r.deals, 'сделка', 'сделки', 'сделок')}</span>
      ${r.reply && r.reply.time ? html`<span><b>${REPLY_TXT[r.reply.time]}</b>ответ</span>` : ''}
      <span class="${r.complaints ? 'bad' : ''}"><b>${r.complaints}</b>${plural(r.complaints, 'жалоба', 'жалобы', 'жалоб')}</span></div>`}
    ${tags.length ? html`<div class="rep-tags">${tags.map((t) => html`<span>${t.tag}<b>${t.n}</b></span>`)}</div>` : ''}
    ${!compact && r.marks.length ? html`<div class="rep-marks">${r.marks.map((m) => html`<span>${ic('check', 13, 2.4)}${MARKS[m]}</span>`)}</div>` : ''}
  </div>`;
}
// Подсказка: как считается (одна строка, без простыни).
// «Как считается»: три правила и лестница уровней (условия — как в lib/reputation.js).
// 1.59.0: условия — задания уровня (как в lib/reputation.js TASKS).
const REP_STEPS = [
  ['Новичок', 'с первого дня'],
  ['Надёжный', 'телефон и фото профиля · 5 сделок · 3 комплимента · ответ в течение дня'],
  ['Опытный', '30 сделок · 15 комплиментов · ответ за 1–3 ч · 2 месяца на Торгане'],
  ['Мастер Торганы', '100 сделок · 50 комплиментов · ответ за час · 3 месяца без жалоб']
];
// Задания до следующего уровня — на своей странице репутации: что сделано и сколько осталось.
export const repTasks = (next) => (next ? html`<section class="rep-tasks">
    <div class="rt-head">${levelMedal(next.level, 36)}<span><small>Задания до уровня</small><b>${next.name}</b></span><em>${next.tasks.filter((t) => t.done).length} из ${next.tasks.length}</em></div>
    <ul>${next.tasks.map((t) => {
      const body = html`<span class="rt-check">${t.done ? ic('check', 14, 3) : ''}</span><span class="rt-text">${t.text}</span>${t.need && !t.done ? html`<span class="rt-prog"><i style="width:${Math.round((t.have / t.need) * 100)}%"></i></span><small>${t.have}/${t.need}</small>` : ''}`;
      // Телефон и фото — в настройках профиля: невыполненное задание ведёт туда.
      return !t.done && (t.key === 'phone' || t.key === 'photo') ? html`<li><a href="/profile/settings">${body}${ic('right', 16, 2)}</a></li>` : html`<li class="${t.done ? 'done' : ''}">${body}</li>`;
    })}</ul>
  </section>` : html`<section class="rep-tasks top"><div class="rt-head">${levelMedal(3, 36)}<span><small>Все задания выполнены</small><b>Высший уровень</b></span></div></section>`);
export const repHow = () => html`<details class="rep-how"><summary><span class="rh-q">${ic('info', 16, 2)}</span><b>Как считается</b><span class="rh-chev">${ic('down', 16, 2.2)}</span></summary>
  <div class="rh-body">
    <ul class="rh-rules">
      <li><span class="rh-ic">${ic('check', 15, 2.4)}</span><span><b>Сделка</b> — когда её подтвердили обе стороны в чате</span></li>
      <li><span class="rh-ic">${ic('sparkle', 15, 2)}</span><span><b>Комплименты</b> — только после сделки</span></li>
      <li><span class="rh-ic">${ic('shield', 15, 2)}</span><span><b>Жалобы</b> проверяет модератор. Подтверждённая видна в профиле и на 90 дней снижает уровень</span></li>
    </ul>
    <ol class="rh-levels">${REP_STEPS.map(([name, rule], i) => html`<li>${levelMedal(i, 28)}<span><b>${name}</b><small>${rule}</small></span></li>`)}</ol>
  </div></details>`;

// В чате: «Сделка состоялась?» → комплименты; «Что-то пошло не так» → модератору.
export function dealBar(st) {
  if (!st) return '';
  const issue = st.issue ? html`<span class="deal-issue">${ic('warn', 14, 2)}${{ open: 'Жалоба у модератора', confirmed: 'Жалоба подтверждена', dismissed: 'Жалоба не подтвердилась' }[st.issue.status]}</span>` : '';
  const problem = st.canIssue && !st.issue ? html`<button type="button" class="link-btn deal-problem" data-deal-issue>Что-то пошло не так</button>` : '';
  if (st.confirmed && !st.praised) {
    return html`<div class="deal-bar"><b>${ic('check', 16, 2.6)}Сделка подтверждена. Что понравилось?</b>
      <div class="deal-tags">${st.tags.map((t) => html`<button type="button" class="chip" data-deal-tag="${t}" aria-pressed="false">${t}</button>`)}</div>
      <div class="deal-acts"><button type="button" class="btn btn-dark btn-sm" data-deal-praise disabled>Отправить</button>${problem}${issue}</div></div>`;
  }
  if (st.confirmed) return issue || problem ? html`<div class="deal-bar slim">${issue}${problem}</div>` : '';
  if (!st.ready || st.mine === 'no') return issue || (st.mine === 'no' && problem) ? html`<div class="deal-bar slim">${issue}${problem}</div>` : '';
  if (st.mine === 'yes') return html`<div class="deal-bar slim"><span class="muted">${ic('clock', 14, 2)}Ждём, когда подтвердит ${st.role === 'buyer' ? 'продавец' : 'покупатель'}</span>${problem}${issue}</div>`;
  return html`<div class="deal-bar ask"><b>Сделка состоялась?${st.other ? html` <span class="muted">${st.role === 'buyer' ? 'Продавец' : 'Покупатель'} уже подтвердил</span>` : ''}</b>
    <div class="deal-acts"><button type="button" class="btn btn-dark btn-sm" data-deal="yes">Да</button><button type="button" class="btn btn-soft btn-sm" data-deal="no">Нет</button>${problem}${issue}</div></div>`;
}
// 1.47.2: экран «Сделка состоялась» — один раз на сделку, когда её подтвердили обе стороны
// (тому, кто подтвердил вторым, — сразу; первому — когда откроет чат). Что уже показали — в localStorage.
const DW_KEY = 'tg-deal-wow';
const dealWowSeen = (id) => { try { return (localStorage.getItem(DW_KEY) || '').split(',').includes(String(id)); } catch { return false; } };
const dealWowMark = (id) => { try { const a = (localStorage.getItem(DW_KEY) || '').split(',').filter(Boolean); a.push(String(id)); localStorage.setItem(DW_KEY, a.slice(-200).join(',')); } catch { /* приватный режим */ } };
// Картинка экрана: аватарка Торганы (как у «Поддержки Торганы») и наша галочка проверки, мягкое свечение и искры.
const dealWowArt = () => raw(`<svg class="dw-svg" viewBox="0 0 240 210" width="240" height="210" aria-hidden="true">
    <defs>
      <radialGradient id="dwH" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#DCE6FF"/><stop offset=".6" stop-color="#ECE8FF" stop-opacity=".7"/><stop offset="1" stop-color="#F3F1FF" stop-opacity="0"/></radialGradient>
      <filter id="dwS" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#3D4FB8" flood-opacity=".28"/></filter>
    </defs>
    <circle cx="120" cy="104" r="104" fill="url(#dwH)"/>
    <g class="dw-rings" fill="none" stroke="#B9B4F5"><circle cx="120" cy="104" r="86" stroke-opacity=".35"/><circle cx="120" cy="104" r="72" stroke-opacity=".5" stroke-dasharray="2 6" stroke-linecap="round"/></g>
    <g class="dw-ava" filter="url(#dwS)">${String(torganaAva(112)).replace('<svg ', '<svg x="64" y="48" ')}</g>
    <g class="dw-seal"><circle cx="164" cy="146" r="29" fill="#fff"/>${String(verifiedSeal(50)).replace('<svg class="vseal"', '<svg class="vseal" x="139" y="121"')}</g>
    <g class="dw-sp"><path d="M200 50l3.5 8.5 8.5 3.5-8.5 3.5-3.5 8.5-3.5-8.5-8.5-3.5 8.5-3.5z" fill="#8FA8FF"/><path d="M38 136l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#B3A4F7"/><path d="M48 40l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#9CC0FF"/><circle cx="206" cy="122" r="3.5" fill="#C9BEFF"/><circle cx="70" cy="178" r="3" fill="#9CC0FF"/></g>
  </svg>`);
export function dealWow(convId, st, slot) {
  if (!st || !st.confirmed || dealWowSeen(convId) || $('.dw')) return;
  dealWowMark(convId);
  const back = document.createElement('div');
  back.className = 'dw';
  back.innerHTML = String(html`<div class="dw-card" role="dialog" aria-modal="true" aria-labelledby="dw-t" tabindex="-1">
    <button type="button" class="dw-x" data-dw-x aria-label="Закрыть">${ic('close', 24, 2)}</button>
    <div class="dw-art">${dealWowArt()}</div>
    <h2 id="dw-t">Сделка состоялась</h2>
    <p>Вы оба подтвердили её в чате. Спасибо — так репутация на Торгане остаётся честной</p>
    <div class="dw-acts">${st.praised ? html`<button type="button" class="btn btn-accent" data-dw-x>Вернуться в чат</button>`
      : html`<button type="button" class="btn btn-soft" data-dw-x>Позже</button><button type="button" class="btn btn-accent" data-dw-praise>${ic('sparkle', 18, 2)}Отметить, что понравилось</button>`}</div>
  </div>`);
  document.body.appendChild(back);
  document.documentElement.classList.add('dw-open');
  const prev = document.activeElement;
  const close = () => { back.remove(); document.documentElement.classList.remove('dw-open'); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  $$('[data-dw-x]', back).forEach((b) => { b.onclick = close; });
  const pr = $('[data-dw-praise]', back);
  if (pr) pr.onclick = () => { close(); const t = slot && $('[data-deal-tag]', slot); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.focus({ preventScroll: true }); } };
  $('.dw-card', back).focus(); // фокус в окне, без рамки на кнопке; Tab — к кнопкам
}
export function bindDeal(slot, convId, reset) {
  $$('[data-deal]', slot).forEach((b) => { b.onclick = async () => { try { const r = await api('POST', `/api/conversations/${convId}/deal`, { answer: b.dataset.deal }); if (b.dataset.deal === 'yes' && !(r && r.deal && r.deal.confirmed)) toast('Отмечено'); reset(); } catch (e) { toast(e.message, true); } }; });
  const tags = $$('[data-deal-tag]', slot); const send = $('[data-deal-praise]', slot);
  tags.forEach((b) => {
    b.onclick = () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      if (on && tags.filter((x) => x.getAttribute('aria-pressed') === 'true').length >= 3) { toast('Не больше трёх', true); return; }
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('active', on);
      send.disabled = !tags.some((x) => x.getAttribute('aria-pressed') === 'true');
    };
  });
  if (send) send.onclick = async () => { try { await api('POST', `/api/conversations/${convId}/praise`, { tags: tags.filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.dataset.dealTag) }); toast('Спасибо!'); reset(); } catch (e) { toast(e.message, true); } };
  const pb = $('[data-deal-issue]', slot);
  if (pb) pb.onclick = () => issueModal(convId, JSON.parse(slot.dataset.state).reasons, reset);
}
function issueModal(convId, reasons, done) {
  openModal(String(html`<h2>Что случилось?</h2><p class="muted" style="margin:0 0 12px">Увидит только модератор. Вторая сторона сможет объясниться.</p>
    <div class="rv-reasons">${reasons.map((r, i) => html`<label><input type="radio" name="reason" value="${r}"${i === 0 ? raw(' checked') : ''}><span>${r}</span></label>`)}</div>
    <div class="field" style="margin-top:12px"><label for="is-text">Подробности — по желанию</label><textarea id="is-text" class="textarea" maxlength="500"></textarea></div>
    <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Отправить</button></div>`), (m, close) => {
    $('[data-x]', m).onclick = close;
    $('[data-ok]', m).onclick = async () => {
      try { await api('POST', `/api/conversations/${convId}/issue`, { reason: $('input[name="reason"]:checked', m).value, text: $('#is-text', m).value.trim() }); close(); toast('Отправлено модератору'); done(); } catch (e) { toast(e.message, true); }
    };
  });
}

// Продвижение: XL-карточка, рамка, метки — выбор, цена и оплата.
import { $, $$, NF, PAY, S, api, dateShort, html, raw, rub } from './core.js';
import { ic } from './icons.js';
import { openModal, toast } from './ui.js';
import { PROMO_STATUS, dayWord, daysLeft, goPay, promoteModal } from './business.js';

// ================= продвижение в ленте (1.21) =================
// Один выбор для формы объявления и окна «Продвинуть»: XL-карточка, рамка, метки (до двух) и пакет «Всё в одном».
// Цена считается так же, как на сервере (lib/boost.js): все три — по цене пакета, если он дешевле суммы.
export const BOOST = [['xl', 'xl', 'XL-карточка', 'Две ячейки, три фото и описание'], ['frame', 'frame', 'Яркая рамка', 'Синяя обводка карточки'], ['tags', 'tag', 'Метки на фото', 'Одна или две прямо на фото']];
export const boostOn = () => PAY && !!(S.config.billing && S.config.billing.ready);
export const boostPrices = () => (S.config.billing && S.config.billing.prices && S.config.billing.prices.boost) || { xl: 99, frame: 39, tags: 29, all: 129 };
export function boostQuote(b) {
  const pr = boostPrices();
  const on = { xl: !!b.xl, frame: !!b.frame, tags: !!b.tagsOn };
  const full = (on.xl ? pr.xl : 0) + (on.frame ? pr.frame : 0) + (on.tags ? pr.tags : 0);
  const bundle = on.xl && on.frame && on.tags && pr.all < full;
  return { amount: bundle ? pr.all : full, full, bundle, any: on.xl || on.frame || on.tags };
}
// Что уже идёт или оплачено (current — из /api/listings/:id): такие услуги второй раз не купить.
export function boostBusy(current) {
  const busy = {};
  (current || []).forEach((b) => b.kinds.forEach((k) => { busy[k] = b; }));
  return busy;
}
const boostState = (b) => (b.status === 'waiting' ? 'с публикацией' : `до ${dateShort(b.endsAt)}`);
// Реклама над поиском у автора — тем же видом, что и продвижение в ленте.
export function promoCard(p) {
  const left = Math.max(0, p.endsAt - Date.now());
  const pct = Math.max(3, Math.min(100, Math.round((left / Math.max(1, p.endsAt - p.startsAt)) * 100)));
  return html`<div class="bst"><span class="bst-ic">${ic('megaphone', 18, 2.2)}</span><div class="bst-body">
    <div class="bst-top"><b>Реклама над поиском</b><em>${left < 86400000 ? 'последний день' : `ещё ${dayWord(Math.max(1, daysLeft(p.endsAt)))}`}</em></div>
    <span class="bst-sub">показов ${NF.format(p.shows)} · переходов ${NF.format(p.clicks)}</span>
    <span class="bst-bar" role="progressbar" aria-label="Осталось срока" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></span>
    <span class="bst-end">до ${dateShort(p.endsAt)}</span></div></div>`;
}
// «Мои объявления»: строка во всю ширину карточки — «Продвигается», сколько осталось, полоска срока.
export function mlBoostRow(list) {
  const on = (list || []).filter((b) => b.status === 'active').sort((a, b) => b.endsAt - a.endsAt);
  if (!on.length) return (list || []).length ? html`<div class="ml-bst wait"><span class="ml-bst-ic">${ic('clock', 16, 2.2)}</span><b>Продвижение</b><span class="ml-bst-left">начнётся после проверки</span></div>` : '';
  const b = on[0];
  const left = Math.max(0, b.endsAt - Date.now());
  const pct = Math.max(3, Math.min(100, Math.round((left / Math.max(1, b.endsAt - b.startsAt)) * 100)));
  const kinds = [...new Set(on.flatMap((x) => x.kinds))].map((k) => ({ xl: 'XL', frame: 'рамка', tags: 'метки' })[k]).join(', ');
  return html`<div class="ml-bst"><span class="ml-bst-ic">${ic('bolt', 16, 2.2)}</span><b>Продвигается</b><span class="ml-bst-kinds">${kinds}</span>
    <span class="ml-bst-left">${left < 86400000 ? 'последний день' : `ещё ${dayWord(Math.max(1, daysLeft(b.endsAt)))}`}</span><i class="ml-bst-bar"><i style="width:${pct}%"></i></i></div>`;
}
// 1.40.0: «Продвигается» у автора — одна карточка на всё купленное (страница объявления и окно «Продвижение»):
// срок с полоской и список услуг, метки — чипсами. Разные сроки у услуг — дата у каждой строки.
export function boostCard(list) {
  const items = (list || []).filter((b) => b.kinds.length);
  if (!items.length) return '';
  const on = items.filter((b) => b.status === 'active');
  const last = on.reduce((a, b) => (!a || b.endsAt > a.endsAt ? b : a), null);
  const perRow = new Set(on.map((b) => dateShort(b.endsAt))).size > 1;
  const rows = BOOST.filter(([k]) => items.some((b) => b.kinds.includes(k))).map(([k, icon, name]) => {
    const b = items.find((x) => x.kinds.includes(k));
    return html`<li><span class="bst-k">${ic(icon, 16, 2)}</span><span class="bst-n">${name}</span>${perRow ? html`<em>${boostState(b)}</em>` : ''}
      ${k === 'tags' && b.tags.length ? html`<span class="bst-tags">${b.tags.map((t) => html`<i>${t}</i>`)}</span>` : ''}</li>`;
  });
  if (!last) {
    return html`<div class="bst wait"><span class="bst-ic">${ic('clock', 18, 2.2)}</span><div class="bst-body">
      <div class="bst-top"><b>Начнётся после проверки</b><em>7 дней</em></div><ul class="bst-list">${rows}</ul></div></div>`;
  }
  const left = Math.max(0, last.endsAt - Date.now());
  const pct = Math.max(3, Math.min(100, Math.round((left / Math.max(1, last.endsAt - last.startsAt)) * 100)));
  return html`<div class="bst"><span class="bst-ic">${ic('bolt', 18, 2.2)}</span><div class="bst-body">
    <div class="bst-top"><b>Продвигается</b><em>${left < 86400000 ? 'последний день' : `ещё ${dayWord(Math.max(1, daysLeft(last.endsAt)))}`}</em></div>
    <span class="bst-bar" role="progressbar" aria-label="Осталось срока" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></span>
    <span class="bst-end">до ${dateShort(last.endsAt)}</span>
    <ul class="bst-list">${rows}</ul></div></div>`;
}
// onlyFree — без уже купленного (в окне «Продвижение» оно показано карточкой выше).
export function boostPicker(busy = {}, onlyFree = false) {
  const pr = boostPrices();
  const sum = pr.xl + pr.frame + pr.tags;
  const free = BOOST.filter(([k]) => !busy[k]);
  return html`<div class="bp" data-bp>
    <div class="bp-grid">${(onlyFree ? free : BOOST).map(([k, icon, t, sub]) => html`<label class="bp-opt${busy[k] ? ' busy' : ''}">
      <span class="bp-top"><span class="bp-ic">${ic(icon, 20, 1.9)}</span><input type="checkbox" data-bk="${k}" ${busy[k] ? raw('disabled') : ''}></span>
      <span class="bp-t"><b>${t}</b><em>${busy[k] ? boostState(busy[k]) : rub(pr[k])}</em></span>
      <small>${sub}</small></label>`)}</div>
    <div class="bp-tags hidden" data-bp-tags role="group" aria-label="Метки на фото"><span class="bp-tags-h">Выберите одну или две</span>
      ${S.config.billing.boostTags.map((t) => html`<button type="button" class="bp-chip" data-tag="${t}" aria-pressed="false">${t}</button>`)}</div>
    ${free.length === 3 && pr.all < sum ? html`<label class="bp-all"><input type="checkbox" data-bk="all"><span class="bp-ic">${ic('bolt', 20, 1.9)}</span>
      <span class="bp-t"><b>Всё в одном</b><small>XL, рамка и метки\u00a0· <span class="bp-save">выгоднее на ${rub(sum - pr.all)}</span></small></span><em>${rub(pr.all)}</em></label>` : ''}
  </div>`;
}
// st = { xl, frame, tagsOn, tags: [] }; onChange — после каждого изменения.
export function bindBoostPicker(root, st, onChange) {
  const box = $('[data-bp]', root);
  if (!box) return;
  const sync = () => {
    $$('[data-bk]', box).forEach((x) => { if (x.dataset.bk !== 'all' && !x.disabled) x.checked = x.dataset.bk === 'tags' ? st.tagsOn : !!st[x.dataset.bk]; });
    const all = $('[data-bk="all"]', box); if (all) all.checked = st.xl && st.frame && st.tagsOn;
    $('[data-bp-tags]', box).classList.toggle('hidden', !st.tagsOn);
    $$('[data-tag]', box).forEach((c) => { const on = st.tags.includes(c.dataset.tag); c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); c.disabled = !on && st.tags.length >= 2; });
    onChange();
  };
  box.addEventListener('change', (e) => {
    const k = e.target.dataset.bk;
    if (!k) return;
    if (k === 'all') { st.xl = st.frame = st.tagsOn = e.target.checked; } else if (k === 'tags') st.tagsOn = e.target.checked; else st[k] = e.target.checked;
    if (!st.tagsOn) st.tags = [];
    sync();
  });
  box.addEventListener('click', (e) => {
    const c = e.target.closest('[data-tag]');
    if (!c) return;
    const t = c.dataset.tag;
    st.tags = st.tags.includes(t) ? st.tags.filter((x) => x !== t) : [...st.tags, t].slice(0, 2);
    sync();
  });
  sync();
}
const boostBody = (st) => ({ xl: st.xl, frame: st.frame, tags: st.tagsOn ? st.tags : [] });
export const boostErr = (st) => (st.tagsOn && !st.tags.length ? 'Выберите метки для фото — одну или две.' : '');
export async function boostPay(listingId, st) {
  goPay(await api('POST', `/api/listings/${listingId}/boost`, boostBody(st)));
}

// «Продвинуть» опубликованное или ждущее публикации объявление (из «Моих объявлений» и со страницы объявления).
export async function boostModal(listingId, title, promo = null) {
  let d;
  try { d = await api('GET', `/api/listings/${listingId}/boost`); } catch (e) { toast(e.message, true); return; }
  const busy = boostBusy(d.current);
  const st = { xl: false, frame: false, tagsOn: false, tags: [] };
  const all = Object.keys(busy).length >= 3;
  openModal(String(html`<div class="bm"><h2>Продвижение</h2><p class="muted bm-sub">«${title}»${all ? '' : ` · ${d.days}\u00a0дней${d.status === 'active' ? '' : ' с публикации'}`}</p>
    ${boostCard(d.current)}
    ${all ? '' : d.ready ? boostPicker(busy, true) : html`<p class="muted">Оплата пока не подключена.</p>`}
    <p class="bm-note">${all ? 'Все виды продвижения уже включены. ' : ''}Порядок выдачи не меняется — карточка просто заметнее.${all ? '' : ` Оплата на странице ЮKassa, чек — на ${S.user.email}.`} <a href="/page/terms#paid">Условия</a></p>
    <button type="button" class="bm-biz" data-biz>${ic('megaphone', 18, 2)}<span><b>Реклама над поиском</b><small>${promo ? PROMO_STATUS[promo.status][1].toLowerCase() : 'отдельный блок над выдачей'}</small></span>${ic('right', 18, 2)}</button>
    <div class="modal-actions"><button class="btn btn-soft" data-x>Закрыть</button>${!all && d.ready ? html`<button class="btn btn-accent" data-ok disabled>Выберите</button>` : ''}</div></div>`), (m, close) => {
    $('[data-x]', m).onclick = close;
    m.addEventListener('click', (e) => { if (e.target.closest('a[href]')) close(); });
    const bz = $('[data-biz]', m); if (bz) bz.onclick = () => { close(); promoteModal(listingId, title); };
    const ok = $('[data-ok]', m);
    if (!ok) return;
    bindBoostPicker(m, st, () => { const q = boostQuote(st); ok.disabled = !q.any; ok.textContent = q.any ? `Оплатить ${rub(q.amount)}` : 'Выберите'; });
    ok.onclick = async () => {
      const err = boostErr(st);
      if (err) { toast(err, true); return; }
      ok.disabled = true; ok.textContent = 'Открываем оплату…';
      try { await boostPay(listingId, st); } catch (ex) { toast(ex.message, true); ok.disabled = false; ok.textContent = `Оплатить ${rub(boostQuote(st).amount)}`; }
    };
  });
}

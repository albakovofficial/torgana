// Значки продавца: тариф, галочка бренда, медаль «Один из первых», знаки доверия.
import { html, raw } from './core.js';
import { ic } from './icons.js';

// 1.50.1: плашка тарифа (или «Официальный аккаунт») в строке плашек — вместо меток на обложке. Не ссылка.
// mine — в своём профиле ещё и срок: «Магазин Про · до 10 декабря», у бесплатного — «бесплатно до …».
export function planBadge(sh, plan = null, mine = false) {
  if (!sh) return '';
  if (sh.official) return html`<span class="pf-badge pf-tariff">Официальный аккаунт</span>`;
  const name = sh.plan === 'pro' ? 'Магазин Про' : 'Магазин';
  const until = mine && plan ? ` · ${plan.trial ? 'бесплатно\u00a0' : ''}до\u00a0${new Date(plan.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(' ', '\u00a0')}` : ''; // срок не разрывается
  return html`<span class="pf-badge pf-tariff">${ic('store', 13, 2.2)} ${name}${until}</span>`;
}

// Значки доверия продавца: «Телефон подтверждён», «ИП проверен» / «Компания проверена».
// 1.45.0: объёмная цветная галочка проверенного бренда (товарный знак сверен с реестром Роспатента) — рядом с именем.
// У каждого значка свои id градиентов: общие id ломаются, если первый значок на странице скрыт.
let sealN = 0;
const SEAL_PATH = 'M12 1L14.48 2.73L17.5 2.47L18.79 5.21L21.53 6.5L21.27 9.52L23 12L21.27 14.48L21.53 17.5L18.79 18.79L17.5 21.53L14.48 21.27L12 23L9.52 21.27L6.5 21.53L5.21 18.79L2.47 17.5L2.73 14.48L1 12L2.73 9.52L2.47 6.5L5.21 5.21L6.5 2.47L9.52 2.73Z';
export function verifiedSeal(size = 20) {
  const k = `vs${++sealN}`;
  return raw(`<svg class="vseal" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs>
    <linearGradient id="${k}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5FE0FF"/><stop offset=".45" stop-color="#2F8BFF"/><stop offset="1" stop-color="#5B3DF5"/></linearGradient>
    <linearGradient id="${k}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="${SEAL_PATH}" transform="translate(0 .9)" fill="#2A1F8F" opacity=".45" stroke="#2A1F8F" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="${SEAL_PATH}" fill="url(#${k}a)" stroke="url(#${k}a)" stroke-width="1.6" stroke-linejoin="round"/>
    <ellipse cx="11" cy="7.4" rx="7" ry="4.2" fill="url(#${k}b)"/>
    <path d="M7.6 12.6l3 3 6-6.4" fill="none" stroke="#1B2A8A" stroke-opacity=".35" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 .7)"/>
    <path d="M7.6 12.6l3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
}
// 1.52.0: медаль «Один из первых / Одна из первых» — первые 1000 продавцов (lib/first.js). Объёмная, как галочка
// проверки, но в индиго Торганы, чтобы их не путали. n — номер на медали (подсказка, настройки); без номера — звезда.
const MEDAL_R = ['M16 33L9 54.5l5.6-2.6 3.6 5 5.4-19z', 'M32 33l7 21.5-5.6-2.6-3.6 5-5.4-19z'];
const MEDAL_STAR = 'M24 13.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L24 28.4l-5.8 3 1.1-6.4-4.7-4.6 6.5-.9z';
export function firstMedal(w = 18, n = 0) {
  const k = `fm${++sealN}`; const g = (id, a, b, c) => `<linearGradient id="${k}${id}" x1="0" y1="0" x2="${c ? 1 : 0}" y2="1"><stop offset="0" stop-color="${a}"/>${c ? `<stop offset=".45" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>` : `<stop offset="1" stop-color="${b}"/>`}</linearGradient>`;
  const big = w >= 30; const fs = String(n).length > 3 ? 8.8 : 10.5;
  const face = n ? `<ellipse cx="21.5" cy="17" rx="9" ry="4.6" fill="url(#${k}h)" opacity=".7"/><path d="M24 12.2l1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4z" fill="#fff"/>
    <text x="24" y="30.6" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#24187A" fill-opacity=".5" letter-spacing="-.3">${n}</text><text x="24" y="29.8" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#fff" letter-spacing="-.3">${n}</text>`
    : `<path d="${MEDAL_STAR}" fill="#24187A" fill-opacity=".35" transform="translate(0 1)"/><path d="${MEDAL_STAR}" fill="#fff"/>`;
  return raw(`<svg class="fmedal${big ? ' big' : ''}" width="${w}" height="${Math.round(w * 58 / 48)}" viewBox="0 0 48 58" aria-hidden="true"><defs>
    ${g('g', '#B9C6FF', '#5B6FE8', '#5B3DF5')}${g('a', '#3963CC', '#4B33E6')}${g('b', '#7C8CFF', '#3963CC')}${g('h', '#fff', 'rgba(255,255,255,0)')}
    <radialGradient id="${k}f" cx=".34" cy=".28" r=".9"><stop offset="0" stop-color="#9AA8FF"/><stop offset=".48" stop-color="#4A5BE0"/><stop offset="1" stop-color="#3A23B8"/></radialGradient></defs>
    ${MEDAL_R.map((d) => `<path d="${d}" fill="#24187A" opacity=".45" transform="translate(0 1.4)"/>`).join('')}<path d="${MEDAL_R[0]}" fill="url(#${k}a)"/><path d="${MEDAL_R[1]}" fill="url(#${k}b)"/>
    <path d="M16 33l7.6 4.9-3 10.6-5.3-1.2 2.6-11z" fill="#fff" opacity=".16"/><circle cx="24" cy="23" r="19" fill="#24187A" opacity=".5" transform="translate(0 2.6)"/>
    <circle cx="24" cy="23" r="19" fill="#33229E" transform="translate(0 1.5)"/><circle cx="24" cy="23" r="19" fill="url(#${k}g)"/>
    ${big ? '<circle cx="24" cy="23" r="17.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".7" stroke-dasharray=".9 1.3"/>' : ''}
    <circle cx="24" cy="23.7" r="14.6" fill="#24187A" opacity=".45"/><circle cx="24" cy="23" r="14.4" fill="url(#${k}f)"/><ellipse cx="22" cy="10.6" rx="12" ry="5" fill="url(#${k}h)"/>${face}</svg>`);
}
export const firstName = (form) => (form === 'f' ? 'Одна из первых' : 'Один из первых');
// Метка у уровня репутации. Касание (телефон) или наведение мыши — подсказка с номером (bindFirstPop).
// who — имя для текста подсказки; kind: me — свой профиль, shop — магазин.
export const firstChip = (f, who = '', kind = '') => (f ? html`<span class="fm-chip" role="button" tabindex="0" data-first="${f.no}" data-form="${f.form}" data-who="${who}" data-kind="${kind}" aria-label="${firstName(f.form)}, номер ${f.no}" aria-haspopup="dialog">${firstMedal(16)}<b>${firstName(f.form)}</b></span>` : '');
function firstText(d) {
  const no = d.first; const she = d.form === 'f';
  if (d.kind === 'me') return `Вы в первой тысяче продавцов Торганы, ваш номер — ${no}. Медаль остаётся навсегда.`;
  if (d.kind === 'shop') return `«${d.who}» — в первой тысяче продавцов Торганы, номер — ${no}. Медаль остаётся навсегда.`;
  return `${d.who} ${she ? 'вошла' : 'вошёл'} в первую тысячу продавцов Торганы, ${she ? 'её' : 'его'} номер — ${no}. Медаль остаётся навсегда.`;
}
// Одна подсказка на страницу: под меткой (или над ней, если внизу нет места), в пределах экрана.
function bindFirstPop() {
  let pop = null; let at = null; let timer = 0;
  const hide = () => { clearTimeout(timer); if (pop) { pop.remove(); pop = null; } if (at) { at.setAttribute('aria-expanded', 'false'); at = null; } };
  const show = (chip) => {
    clearTimeout(timer);
    if (at === chip) return;
    hide(); at = chip; chip.setAttribute('aria-expanded', 'true');
    const d = chip.dataset;
    pop = document.createElement('div');
    pop.className = 'fm-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', firstName(d.form));
    pop.innerHTML = String(html`${firstMedal(46, d.first)}<span><b>${firstName(d.form)} · № ${d.first}</b><small>${firstText(d)}</small></span>`);
    document.body.appendChild(pop);
    const r = chip.getBoundingClientRect(); const pw = pop.offsetWidth; const ph = pop.offsetHeight; const vw = document.documentElement.clientWidth;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), vw - pw - 12);
    const below = r.bottom + 10 + ph < window.innerHeight || r.top < ph + 20;
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${(below ? r.bottom + 10 : r.top - ph - 10) + window.scrollY}px`;
    pop.style.setProperty('--ax', `${Math.min(Math.max(22, r.left + r.width / 2 - left), pw - 22)}px`);
    pop.classList.add(below ? 'down' : 'up');
    pop.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-first]'))) timer = setTimeout(hide, 150); });
    pop.addEventListener('pointerenter', () => clearTimeout(timer));
  };
  const chipOf = (e) => e.target.closest && e.target.closest('[data-first]');
  // Метка бывает внутри ссылки (карточка продавца в объявлении) — касание не уводит со страницы.
  document.addEventListener('click', (e) => {
    const c = chipOf(e);
    if (c) { e.preventDefault(); e.stopPropagation(); if (at === c && !matchMedia('(hover: hover)').matches) hide(); else show(c); return; }
    if (pop && !pop.contains(e.target)) hide();
  }, true);
  document.addEventListener('keydown', (e) => {
    const c = chipOf(e);
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); if (at === c) hide(); else show(c); }
    if (e.key === 'Escape' && pop) { const a = at; hide(); if (a) a.focus(); }
  }, true);
  document.addEventListener('pointerover', (e) => { const c = chipOf(e); if (c && e.pointerType === 'mouse') show(c); });
  document.addEventListener('pointerout', (e) => {
    const c = chipOf(e);
    if (!c || e.pointerType !== 'mouse' || c !== at) return;
    const to = e.relatedTarget;
    if (to && (c.contains(to) || (pop && pop.contains(to)))) return;
    timer = setTimeout(hide, 150);
  });
  document.addEventListener('focusout', (e) => { if (chipOf(e) && !(pop && pop.contains(e.relatedTarget))) timer = setTimeout(hide, 150); });
  window.addEventListener('resize', hide);
  window.addEventListener('popstate', hide);
  window.addEventListener('torgana:route', hide);
}
bindFirstPop();
// Имя с галочкой — только у проверенного бренда (товарный знак из реестра Роспатента).
// 1.49.0: последнее слово и галочка не разрываются — галочка не уходит одна на новую строку.
// 1.50.0: у официального аккаунта Торганы — та же галочка, что у «Поддержки Торганы».
export const nameSeal = (name, b) => {
  if (!(b && (b.official || b.tm))) return name;
  const n = String(name); const cut = n.lastIndexOf(' ') + 1;
  const title = b.official ? 'Официальный аккаунт Торганы' : `Проверенный бренд «${b.tm.name}» — товарный знак № ${b.tm.number} в реестре Роспатента`;
  return html`${n.slice(0, cut)}<span class="ns-tail">${n.slice(cut)}<span class="name-seal" title="${title}">${verifiedSeal(22)}</span></span>`;
};
export const trustBadges = (b) => (b ? html`${b.shop ? html`<span class="pf-badge dark">${ic('store', 13, 2)} Магазин</span>` : ''}${b.tm ? html`<span class="pf-badge seal" title="Товарный знак «${b.tm.name}», свидетельство Роспатента № ${b.tm.number}">${verifiedSeal(15)} Проверенный бренд</span>` : ''}${b.biz ? html`<span class="pf-badge ok" title="${b.biz.name}">${ic('shield', 13, 2)} ${b.biz.kind === 'ИП' ? 'ИП проверен' : 'Компания проверена'}</span>` : ''}${b.phone ? html`<span class="pf-badge ok">${ic('check', 13, 2.4)} Телефон подтверждён</span>` : ''}` : '');

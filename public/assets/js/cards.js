// Карточки объявлений, «избранное» в карточке, учёт показов.
import { $, $$, NF, PAY, S, api, app, ava, esc, html, lpath, price, raw, shortWhen } from './core.js';
import { P, ic, svg } from './icons.js';
import { openModal, toast } from './ui.js';
import { go } from './router.js';
import { levelMedal } from './reputation.js';

// Красный градиент для сердечка «В избранное» (1.35.2) — один на страницу, на него ссылаются стили .fav-btn.
document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><linearGradient id="tg-heart" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6B6B"/><stop offset="1" stop-color="#E0115F"/></linearGradient></defs></svg>');

// ================= карточки =================
// it.ad — карточка из блока «Реклама»: пометка и рекламодатель по кнопке «Реклама».
// it.boost — продвижение в ленте (lib/boost.js): XL — на две ячейки (на телефоне — во всю ширину) с ещё двумя фото
// и началом описания, рамка — синяя обводка в цвет Торганы, tags — метки на фото. Подписи «Продвигается» на карточке нет (1.43.1).
const boostImg = (src, cls = '', extra = '') => html`<span class="xl-ph ${cls}${src ? ' ph' : ''}"${src ? raw(` style="--ph:url('${esc(src)}')"`) : ''}>${src ? html`<img src="${src}" alt="" loading="lazy">` : svg(P.image, 28, 1.2)}${extra}</span>`;
// 1.26 (вариант 7 «С продавцом»): под описанием карточки — фото и имя продавца, значок уровня (1.46.0), если он есть.
const cardSeller = (s) => html`<span class="card-seller">${ava(s, 'xs')}<span class="cs-name">${s.name}</span>${s.shop ? html`<span class="cs-shop" title="Магазин на Торгане">${ic('store', 12, 2.2)}<span class="sr">Магазин</span></span>` : ''}${s.level ? html`<span class="cs-rate" title="${['', 'Надёжный', 'Опытный', 'Мастер Торганы'][s.level]} продавец">${levelMedal(s.level, 14)}</span>` : ''}</span>`;
export function card(it) {
  const meta = [it.metro ? `м. ${it.metro}` : it.city, shortWhen(it.createdAt)].filter(Boolean).join(' · ');
  const ad = it.ad;
  const bo = !ad && it.boost && it.status !== 'sold' ? it.boost : null;
  const xl = !!(bo && bo.xl);
  const tags = bo && bo.tags && bo.tags.length ? bo.tags : null;
  const side = xl ? [...(bo.photos || [])] : [];
  // «Новое» / «Цена упала» — внизу слева на фото, где им не мешает сердечко.
  // 1.48.0: «Хорошая цена» — дешевле похожих (lib/goodprice.js); важнее «Новое» и «Цена упала».
  const low = tags || ad || it.status === 'sold' ? '' : it.goodPrice ? html`<span class="tag drop-badge is-good" title="Цена ниже, чем у похожих объявлений на Торгане">${ic('check', 12, 3)}Хорошая цена</span>` : it.fresh ? html`<span class="tag drop-badge">Новое</span>`
    : it.priceWas ? html`<span class="tag drop-badge is-drop" title="Цена упала, было ${price(it.priceWas, it.priceUnit)}">Цена упала</span>` : '';
  return html`<div class="card${ad ? ' is-ad' : ''}${xl ? ' is-xl' : ''}${bo && bo.frame ? ' is-frame' : ''}">
    <a href="${lpath(it)}" class="card-link"${ad ? raw(` data-adid="${Number(ad.id)}"`) : ''}>
      <div class="card-img${xl ? ' xl-img' : it.photo ? ' ph' : ''}"${!xl && it.photo ? raw(` style="--ph:url('${esc(it.photo)}')"`) : ''}>
        ${xl ? boostImg(it.photo, 'main') : it.photo ? html`<img src="${it.photo}" alt="" loading="lazy">` : svg(P.image, 40, 1.2)}
        ${xl ? html`<span class="xl-side">${boostImg(side[0])}${boostImg(side[1], '', bo.more ? html`<em>+${bo.more} фото</em>` : '')}</span>` : ''}
        ${tags ? html`<span class="b-tags">${tags.map((t, i) => html`<span class="b-tag${i ? ' alt' : ''}" title="${t}"><span>${t}</span></span>`)}</span>` : ''}
        ${!ad && it.status === 'sold' ? html`<span class="tag dark sold-badge">Продано</span>` : ''}
        ${low ? html`<span class="b-low">${low}</span>` : ''}
        ${xl ? html`<span class="price-pill">${price(it.price, it.priceUnit)}</span>` : ''}
        ${it.hasVideo ? html`<span class="vid-badge" title="Есть видео">${ic('play', 14, 0)}<span class="sr">Есть видео</span></span>` : ''}
      </div>
      <div class="card-body">
        ${xl ? '' : html`<span class="card-price">${price(it.price, it.priceUnit)}</span>`}
        <span class="card-title">${it.title}</span>
        ${xl && (bo.desc || it.summary) ? html`<span class="card-desc">${[it.summary, bo.desc].filter(Boolean).join('. ')}</span>` : it.summary ? html`<span class="card-sum">${it.summary}</span>` : ''}
        <span class="card-meta">${meta}</span>
        ${it.delivery || it.exchange ? html`<span class="card-perks">${ic(it.delivery ? 'truck' : 'refresh', 13, 2.2)}${[it.delivery && 'Доставка', it.exchange && 'Обмен'].filter(Boolean).join(' · ')}</span>` : ''}
        ${it.seller ? cardSeller(it.seller) : ''}
      </div>
    </a>
    <button type="button" class="fav-btn ${it.isFav ? 'on' : ''}" data-fav="${it.id}" aria-label="${it.isFav ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${it.isFav ? 'true' : 'false'}">${ic('heart', 20)}</button>
    ${ad ? html`<button type="button" class="ad-mark" data-ad-info="${ad.id}" data-adv="${ad.advertiser}" data-inn="${ad.inn}" aria-label="Реклама — о рекламодателе">Реклама${ic('info', 13, 2)}</button>` : ''}
  </div>`;
}
export const grid = (items) => html`<div class="grid">${items.map(card)}</div>`;
// Заглушки появляются, только если загрузка дольше трети секунды — иначе при обновлении они мелькают.
// Фото в карточке: размытая подложка и само фото проявляются вместе, когда фото загрузилось (без мелькания).
document.addEventListener('load', (e) => { const t = e.target; if (t.tagName === 'IMG' && t.parentElement && t.parentElement.classList.contains('card-img')) t.parentElement.classList.add('ok'); }, true);
document.addEventListener('error', (e) => { const t = e.target; if (t.tagName === 'IMG' && t.parentElement && t.parentElement.classList.contains('card-img')) t.parentElement.classList.add('ok'); }, true);
new MutationObserver(() => { for (const im of document.querySelectorAll('.card-img.ph:not(.ok) > img')) if (im.complete) im.parentElement.classList.add('ok'); }).observe(document.documentElement, { childList: true, subtree: true });
export const skeletonGrid = (n = 8) => html`<div class="grid skel-grid">${Array.from({ length: n }, () => html`<div><div class="skeleton" style="aspect-ratio:1/1"></div><div class="skeleton" style="height:16px;margin-top:12px;border-radius:8px;width:80%"></div></div>`)}</div>`;

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-fav]');
  if (!b) return;
  e.preventDefault();
  if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
  try {
    const { fav, favCount } = await api('POST', `/api/favorites/${b.dataset.fav}`);
    const fc = $('[data-favs]'); if (fc && location.pathname === `/l/${b.dataset.fav}`) fc.textContent = `в избранном у ${NF.format(favCount)}`;
    $$(`[data-fav="${b.dataset.fav}"]`).forEach((x) => {
      x.classList.toggle('on', fav);
      x.setAttribute('aria-pressed', fav ? 'true' : 'false');
      x.setAttribute('aria-label', fav ? 'Убрать из избранного' : 'В избранное');
    });
    toast(fav ? 'Добавлено в избранное' : 'Убрано из избранного');
  } catch (err) { toast(err.message, true); }
});

// «Реклама» на карточке: кто рекламодатель.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ad-info]');
  if (!b) return;
  e.preventDefault();
  openModal(String(html`<h2>Реклама</h2>
    <div class="adm-facts ad-facts"><div><span>Рекламодатель</span><b>${b.dataset.adv}</b></div>${b.dataset.inn ? html`<div><span>ИНН</span><b>${b.dataset.inn}</b></div>` : ''}</div>
    <p class="muted" style="margin:14px 0 0;font-size:14px">Продавец оплатил показ объявления в блоке «Реклама». Объявление подобрано по вашему запросу, фильтрам и городу — мы не собираем сведения о ваших предпочтениях. Обычная выдача от рекламы не меняется.</p>
    <div class="modal-actions">${PAY ? html`<a class="btn btn-soft" href="/business">Как это работает</a>` : ''}<button class="btn btn-dark" data-x>Понятно</button></div>`), (m, close) => { $('[data-x]', m).onclick = close; m.addEventListener('click', (ev) => { if (ev.target.closest('a[href]')) close(); }); });
});
// Переход из блока «Реклама» — запоминаем, чтобы статистика записала источник «Реклама».
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-adid]'); if (a) S.adClick = a.getAttribute('href'); }, true);

// ================= статистика объявлений =================
// Переход: откуда открыли объявление. Показ: карточка в поиске, ленте или категории видна наполовину не меньше секунды.
// Показы и «переходы из выдачи» считаются на одних и тех же страницах (главная, поиск, категории, блок «Реклама»),
// поэтому доля «из показа в переход» честная и не бывает больше 100%.
// Сервер сам решает, засчитывать ли (раз в сутки на человека, без продавца, роботов и сверх лимитов).
export function statSource() {
  if (S.adClick && S.adClick === location.pathname) { S.adClick = null; return 'ad'; }
  S.adClick = null;
  if (!S.from) return 'external';
  const u = new URL(S.from, location.origin);
  if (u.pathname === '/') return 'home';
  if (u.pathname === '/search') return u.searchParams.get('q') ? 'search' : 'category';
  if (u.pathname.startsWith('/c/')) return 'category';
  return 'other';
}
const imp = { queue: new Set(), ads: new Set(), sent: new Set(), timers: new Map(), io: null, mo: null };
export function watchImpressions() {
  if (imp.io) { imp.io.disconnect(); imp.io = null; }
  if (imp.mo) { imp.mo.disconnect(); imp.mo = null; }
  imp.timers.forEach((t) => clearTimeout(t)); imp.timers.clear();
  const p = location.pathname;
  if ((p !== '/' && p !== '/search' && !p.startsWith('/c/')) || !('IntersectionObserver' in window)) return;
  imp.io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const lid = e.target.dataset.lid;
      const adid = e.target.dataset.adid; // карточка из блока «Реклама» — ещё и показ рекламы
      const id = adid ? `a${adid}` : lid;
      if (e.isIntersecting) {
        if (!imp.sent.has(id) && !imp.timers.has(id)) imp.timers.set(id, setTimeout(() => { imp.timers.delete(id); imp.sent.add(id); imp.queue.add(lid); if (adid) imp.ads.add(adid); }, 1000));
      } else { clearTimeout(imp.timers.get(id)); imp.timers.delete(id); }
    }
  }, { threshold: 0.5 });
  const observe = () => $$('.card-link[href^="/l/"]:not([data-lid])').forEach((a) => { a.dataset.lid = a.getAttribute('href').slice(3); imp.io.observe(a); });
  observe();
  imp.mo = new MutationObserver(observe); // «Показать ещё» и лента дозагружают карточки
  imp.mo.observe(app, { childList: true, subtree: true });
}
function flushImpressions() {
  if (imp.ads.size) {
    const ads = [...imp.ads].slice(0, 12);
    ads.forEach((i) => imp.ads.delete(i));
    fetch('/api/stats/ads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: ads }), credentials: 'same-origin', keepalive: true }).catch(() => {});
  }
  if (!imp.queue.size) return;
  const ids = [...imp.queue].slice(0, 60);
  ids.forEach((i) => imp.queue.delete(i));
  fetch('/api/stats/impressions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'same-origin', keepalive: true }).catch(() => {});
}
setInterval(flushImpressions, 4000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushImpressions(); });

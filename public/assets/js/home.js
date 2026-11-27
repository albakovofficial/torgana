// Главная: лента, разделы, свежие объявления; страница «Избранное».
import { $, $$, S, api, app, catName, cpath, html, raw } from './core.js';
import { pageCover } from './cover.js';
import { catIc, ic } from './icons.js';
import { toast } from './ui.js';
import { card, grid, skeletonGrid } from './cards.js';
import { backTo, rememberFeed, requireAuth, setCleanup, setTitle } from './router.js';
import { searchParams } from './search.js';

// ================= главная =================
// Лента объявлений в box: первая страница, дальше — кнопка «Показать ещё» в .more после box
// или (auto) сама при прокрутке. Возвращает функцию остановки для cleanup.
// map — как показать карточку (например, без строки продавца в его же профиле).
export function listingFeed(box, params, { limit = 24, empty, onFirst, auto = false, map = null }) {
  const more = box.nextElementSibling;
  let offset = 0; let total = Infinity; let busy = false; let io = null; let dead = false;
  const want = backTo && backTo.n > limit ? Math.min(backTo.n, 60) : limit; // «Назад»: сразу столько, сколько видели (сервер отдаёт до 60 за раз)
  const load = async () => {
    if (busy || dead || offset >= total) return;
    busy = true;
    try {
      const data = await api('GET', `/api/listings?${new URLSearchParams({ ...params, limit: offset ? limit : want, offset })}`);
      if (!box.isConnected || dead) return; // ленту уже сменили (другая категория на главной)
      if (map) data.items = data.items.map(map);
      if (offset === 0) {
        if (onFirst) onFirst(data);
        box.innerHTML = String(data.items.length ? grid(data.items) : empty);
      } else {
        $('.grid', box).insertAdjacentHTML('beforeend', data.items.map((i) => String(card(i))).join(''));
      }
      offset += data.items.length; rememberFeed(offset);
      total = data.items.length ? data.total : offset;
      more.classList.toggle('hidden', offset >= total);
      if (io && offset < total) { io.unobserve(more); io.observe(more); } // экран ещё не заполнен — грузим дальше
    } catch (e) { if (!offset) throw e; toast(e.message, true); } finally { busy = false; } // первая страница — ошибку покажет роутер
  };
  if (auto && 'IntersectionObserver' in window) {
    more.innerHTML = '<div class="loader"></div>';
    io = new IntersectionObserver((es) => { if (es[0].isIntersecting) load(); }, { rootMargin: '800px 0px' });
    io.observe(more);
  } else {
    more.innerHTML = '<button class="btn btn-soft btn-lg" type="button">Показать ещё</button>';
    more.firstChild.onclick = load;
  }
  return { first: load(), stop: () => { dead = true; if (io) io.disconnect(); } };
}

// Блок «Реклама» над лентой или выдачей: один ряд — столько карточек, сколько колонок у сетки под ним.
// Подбор — по тем же запросу, фильтрам и городу, что и выдача; сама выдача не меняется.
export async function adRow(box, params, cls = '', note = '') {
  const g = $('.grid', box);
  if (!g) return;
  const cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length || 3;
  const { items } = await api('GET', `/api/ads?${new URLSearchParams({ ...searchParams(params), limit: cols })}`).catch(() => ({ items: [] }));
  if (!items.length || !box.isConnected) return;
  box.insertAdjacentHTML('beforebegin', String(html`<section class="ads-row ${cls}" aria-label="Реклама"><div class="ads-head">${ic('megaphone', 15, 2)}Реклама${note ? ` · ${note}` : ''}</div><div class="grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${items.map(card)}</div></section>`));
}

// ================= главная =================
// Строка поиска и город, категории, бесконечная лента (на телефоне по 3 в ряд, на компьютере по 5).
export async function viewHome() {
  setTitle('');
  // 1.38.1: капсула категории переключает ленту на месте (/?cat=…), без перехода в поиск.
  let cat = new URLSearchParams(location.search).get('cat') || '';
  if (!S.config.categories.some((c) => c.id === cat)) cat = '';
  app.innerHTML = String(html`
    <section class="wrap home-top">
      <h1 class="sr">Торгана — объявления по всей России</h1>
      <form class="search home-search" role="search" data-search>
        ${ic('search', 20)}
        <label class="sr" for="q">Что вы ищете</label>
        <input id="q" name="q" type="search" placeholder="Поиск" autocomplete="off" enterkeyhint="search">
        <button type="button" class="hs-city" data-city-btn aria-label="Город: ${S.city || 'Вся Россия'}">${ic('pin', 15, 2)}<span>${S.city || 'Вся Россия'}</span></button>
        <button class="hs-go" type="submit" aria-label="Найти">${ic('search', 16, 2.2)}</button>
      </form>
      <div class="cat-rail"><button type="button" class="cat-arrow prev" data-cat-scroll="-1" aria-label="Назад">${ic('left', 18, 2.2)}</button>
        <nav class="cat-pills" aria-label="Категории"><a class="cat-pill ${cat ? '' : 'on'}" data-cat="" href="/search${S.city ? `?city=${encodeURIComponent(S.city)}` : ''}" ${cat ? '' : raw('aria-current="true"')}>${ic('list', 17, 2)}Все</a>${S.config.categories.map((c) => html`<a class="cat-pill ${c.id === cat ? 'on' : ''}" data-cat="${c.id}" href="${cpath(c.id, S.city)}" ${c.id === cat ? raw('aria-current="true"') : ''}>${catIc(c.id, 18)}${c.name}</a>`)}</nav>
        <button type="button" class="cat-arrow next" data-cat-scroll="1" aria-label="Дальше">${ic('right', 18, 2.2)}</button></div>
    </section>

    <section class="wrap home-feed">
      <div class="section-head"><h2 id="feed-h"></h2><a id="feed-all" href="/search">Смотреть все</a></div>
      <div id="feed" class="feed">${skeletonGrid(15)}</div>
      <div class="more hidden"></div>
    </section>`);
  let feed = null;
  const startFeed = () => {
    if (feed) feed.stop();
    $$('.ads-row.feed').forEach((x) => x.remove());
    const name = cat ? catName(cat) : '';
    $('#feed-h').textContent = name ? `${name}${S.city ? ` · ${S.city}` : ''}` : `Все объявления${S.city ? ` · ${S.city}` : ''}`;
    $('#feed-all').href = cat ? cpath(cat, S.city) : `/search${S.city ? `?city=${encodeURIComponent(S.city)}` : ''}`;
    const params = { ...(S.city ? { city: S.city } : {}), ...(cat ? { category: cat } : {}) };
    const box = $('#feed');
    box.innerHTML = String(skeletonGrid(cat ? 9 : 15));
    feed = listingFeed(box, params, {
      limit: 30,
      auto: true,
      empty: cat ? html`<div class="empty"><h3>В разделе «${name}» пока пусто${S.city ? ` · ${S.city}` : ''}</h3><p>Станьте первым — разместить объявление бесплатно.</p><a class="btn btn-dark" href="/new">Разместить объявление</a></div>`
        : html`<div class="empty"><h3>${S.city ? `В городе ${S.city} пока нет объявлений` : 'Здесь появятся первые объявления'}</h3><p>Разместите своё — это бесплатно и займёт пару минут.</p><a class="btn btn-dark" href="/new">Разместить объявление</a></div>`
    });
    // ряд «Реклама» встаёт над лентой — ждём его, чтобы «Назад» вернул на то же место
    return feed.first.then(() => adRow(box, params, 'feed', S.city ? `в городе ${S.city}` : '').catch(() => {}));
  };
  $('.cat-pills').addEventListener('click', (e) => {
    const a = e.target.closest('[data-cat]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; // в новой вкладке — обычная страница раздела
    e.preventDefault();
    if (a.dataset.cat === cat) return;
    cat = a.dataset.cat;
    $$('.cat-pill').forEach((x) => { const on = x === a; x.classList.toggle('on', on); if (on) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
    a.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    history.replaceState(history.state, '', cat ? `/?cat=${cat}` : '/');
    startFeed().catch((ex) => toast(ex.message, true));
  });
  // Стрелки ленты категорий: видны, только когда есть куда листать.
  const rail = $('.cat-rail'); const pills = $('.cat-pills', rail);
  const railPaint = () => { rail.classList.toggle('can-prev', pills.scrollLeft > 4); rail.classList.toggle('can-next', pills.scrollLeft + pills.clientWidth < pills.scrollWidth - 4); };
  pills.addEventListener('scroll', railPaint, { passive: true });
  $$('[data-cat-scroll]', rail).forEach((b) => { b.onclick = () => pills.scrollBy({ left: Number(b.dataset.catScroll) * pills.clientWidth * 0.7 }); });
  window.addEventListener('resize', railPaint);
  railPaint();
  setCleanup(() => { if (feed) feed.stop(); window.removeEventListener('resize', railPaint); });
  await startFeed();
  if (cat) $('.cat-pill.on').scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

// ================= избранное =================
export async function viewFavorites() {
  if (!requireAuth()) return;
  setTitle('Избранное');
  app.innerHTML = String(html`<div class="wrap">${pageCover({ title: 'Избранное', sub: 'Снизят цену — придёт уведомление', icon: 'heart', tone: 'red' })}<div id="box">${skeletonGrid(4)}</div></div>`);
  const { items } = await api('GET', '/api/favorites');
  $('#box').innerHTML = items.length ? String(grid(items)) : String(html`<div class="empty"><h3>Пока пусто</h3><p>Нажимайте на сердечко у объявлений, чтобы вернуться к ним позже.</p><a class="btn btn-dark" href="/">Смотреть объявления</a></div>`);
}

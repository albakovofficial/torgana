// Поиск: фильтры, выдача, объявления на карте.
import { $, $$, NF, S, api, app, attrNum, attrText, ava, catName, hasMetro, html, metroOf, plural, price, raw, rub, subName, subOf, subsOf } from './core.js';
import { ic } from './icons.js';
import { slugify } from './rules.js';
import { attrChoice, bindAttrChoices, toast } from './ui.js';
import { grid, skeletonGrid } from './cards.js';
import { go, goSearch, setTitle, viewNotFound } from './router.js';
import { adRow, listingFeed } from './home.js';
import { refreshMe } from './main.js';

// 1.47.2: фильтры поиска закрыты и на компьютере; открытые остаются открытыми при смене фильтра (страница перерисовывается).
let filtersOpen = false;

// ================= поиск =================
// Страницы разделов (как в lib/seo.js): /c/:категория, /c/:категория/:раздел, /c/:категория/:город,
// /c/:категория/:раздел/:город. Внутри — обычный поиск и внизу блок «О разделе».
export function viewCategory(part) {
  const [cat, a, b] = part.split('/');
  const sub = a && subsOf(cat).some((x) => x.id === a) ? a : '';
  const citySlug = sub ? b : a;
  const city = citySlug ? S.config.cities.find((c) => slugify(c) === citySlug) : '';
  if (!S.config.categories.some((c) => c.id === cat) || (citySlug && !city) || (!sub && b)) { viewNotFound(); return undefined; }
  return viewSearch(null, new URLSearchParams({ category: cat, ...(sub ? { sub } : {}), ...(city ? { city } : {}) }), { category: cat, sub, city });
}
// Блок «О разделе»: числа, города и соседние разделы — с сервера (/api/sections/info), из настоящих объявлений.
// Сумма для примера запроса — в том виде, который понимает поиск (lib/search.js: «2 млн», «800к»; дроби он не разбирает).
const shortSum = (n) => (n >= 1e6 ? `${Math.max(1, Math.round(n / 1e6))} млн` : n >= 1000 ? `${Math.round(n / 1000)}к` : String(n));
function secAbout(d) {
  const tile = (icon, tone, v, t) => html`<div class="sa-tile"><span class="bz-ic ${tone}">${ic(icon, 19, 1.9)}</span><span><b>${v}</b><span>${t}</span></span></div>`;
  const priced = d.count && d.min !== null && d.max !== null;
  const word = (d.name.split(/[ ,—]+/)[0] || '').toLowerCase();
  const example = priced && d.max > 0 ? `${word} до ${shortSum(Math.max(d.min, Math.round((d.min + d.max) / 2 / 1000) * 1000))}` : word;
  return html`<div class="sa-main">
      <span class="bz-label">О разделе</span><h2>${d.h1} на Торгане</h2>
      <div class="sa-tiles">${tile('list', 'green', NF.format(d.count), plural(d.count, 'объявление', 'объявления', 'объявлений'))}${priced ? (d.min === d.max ? tile('tag', 'blue', rub(d.min), 'цена') : html`${tile('down', 'blue', rub(d.min), 'самая низкая цена')}${tile('trend', 'amber', rub(d.max), 'самая высокая')}`) : ''}</div>
      <p>Все объявления прошли проверку модератором. Ищите обычными словами и уточняйте фильтрами: ${d.fields.length ? d.fields.join(', ') : 'раздел, город, цена и доставка'}.</p>
      ${example ? html`<form class="sa-search" data-search role="search"><span>${ic('search', 18)}</span><label class="sr" for="sa-q">Поиск</label><input id="sa-q" name="q" type="search" placeholder="Например: ${example}" autocomplete="off" enterkeyhint="search"><button class="btn btn-accent btn-sm" type="submit">Найти</button></form>` : ''}
      <a class="sa-safe" href="/page/safety"><span>${ic('shield', 18)}</span><span class="sa-safe-t">Договаривайтесь в чате Торганы и не вносите предоплату незнакомым продавцам.<b>Как покупать безопасно ›</b></span></a>
    </div>
    <div class="sa-side">
      ${d.cities.length ? html`<div class="sa-h"><span class="bz-ic green sm">${ic('pin', 16, 2)}</span><b>${d.name} в других городах</b></div>
      <div class="sa-chips">${d.cities.map((c) => html`<a href="${c.path}">${c.name}${c.n ? html`<span>${NF.format(c.n)}</span>` : ''}</a>`)}</div>` : ''}
      ${d.subs.length ? html`<div class="sa-h"><span class="bz-ic violet sm">${ic('list', 16, 2)}</span><b>${d.sub ? `Рядом в разделе «${d.catName}»` : 'Разделы'}</b></div>
      <div class="sa-links">${d.subs.map((x) => html`<a href="${x.path}"><span>${x.label}</span>${x.n ? html`<em>${NF.format(x.n)}</em>` : ''}${ic('right', 16, 2)}</a>`)}</div>` : ''}
    </div>
    ${d.faq && d.faq.length ? html`<div class="sa-faq">
      <div class="sa-h"><span class="bz-ic blue sm">${ic('info', 16, 2)}</span><b>Частые вопросы</b></div>
      <div class="sa-qs">${d.faq.map((x, i) => html`<details class="sa-q" ${i < 2 ? raw('open') : ''}><summary><span>${x.q}</span>${ic('down', 18, 2)}</summary><p>${x.a}</p></details>`)}</div>
    </div>` : ''}`;
}

export async function viewSearch(_, q, sec = null) {
  const params = Object.fromEntries(q.entries());
  const sub = subOf(params.sub) ? params.sub : '';
  const category = (sub && Object.keys(S.config.subcategories).find((c) => subsOf(c).some((x) => x.id === sub))) || params.category || '';
  const title = params.q ? `«${params.q}»` : sub ? subName(sub) : category ? catName(category) : 'Все объявления';
  setTitle(params.q || subName(sub) || catName(category) || 'Поиск');
  // Активные уточнения — чипы с крестиком (убрать одно, не трогая остальное).
  const without = (...keys) => { const p = { ...params, ...(category ? { category } : {}) }; keys.forEach((k) => delete p[k]); if (keys.includes('sub')) Object.keys(p).filter((k) => k.startsWith('a_')).forEach((k) => delete p[k]); return `/search?${new URLSearchParams(p)}`; };
  const activeChips = [];
  if (sub) {
    activeChips.push([subName(sub), without('sub')]);
    for (const f of subOf(sub).fields) {
      if (f.type === 'select' && params[`a_${f.key}`]) activeChips.push([attrText(f, params[`a_${f.key}`]) || params[`a_${f.key}`], without(`a_${f.key}`)]);
      const lo = params[`a_${f.key}_min`]; const hi = params[`a_${f.key}_max`]; const u = f.unit ? ` ${f.unit}` : '';
      if (lo || hi) activeChips.push([`${f.label}: ${lo && hi ? `${attrNum(lo)}–${attrNum(hi)}` : lo ? `от ${attrNum(lo)}` : `до ${attrNum(hi)}`}${u}`, without(`a_${f.key}_min`, `a_${f.key}_max`)]);
    }
  }
  if (params.metro) activeChips.push([`м. ${params.metro}`, without('metro')]);
  const subChips = category && !sub ? subsOf(category) : [];
  const onMap = S.config.maps && params.view === 'map';
  const nFilters = ['category', 'city', 'min', 'max', 'delivery', 'bargain', 'exchange', 'trusted', 'metro'].filter((k) => params[k]).length + (sub ? 1 : 0) + Object.keys(params).filter((k) => k.startsWith('a_') && params[k]).length;
  app.innerHTML = String(html`<div class="wrap search-page">
    <aside class="filters ${filtersOpen && !window.matchMedia('(max-width: 900px)').matches ? '' : 'collapsed'}" id="filters">
      <button type="button" class="btn btn-soft btn-block" id="filters-toggle" aria-controls="filter-form" aria-expanded="false">${ic('filter', 18)}Фильтры${nFilters ? html`<span class="f-count">${nFilters}</span>` : ''}</button>
      <form id="filter-form" class="filters-body">
        <div class="f-head"><h3>Фильтры</h3><button type="button" class="icon-btn f-close" data-f-close aria-label="Скрыть фильтры">${ic('close', 20, 2)}</button></div>
        <input type="hidden" name="q" value="${params.q || ''}">
        <div class="f-row2">
          <div class="field"><label for="f-cat">Категория</label>
            <select id="f-cat" name="category" class="select"><option value="">Все категории</option>
              ${S.config.categories.map((c) => html`<option value="${c.id}" ${c.id === category ? raw('selected') : ''}>${c.name}</option>`)}
            </select></div>
          <div class="field"><label for="f-city">Город</label>
            <input id="f-city" name="city" class="input" data-cities data-any="Вся Россия" autocomplete="off" placeholder="Вся Россия" value="${params.city || ''}"></div>
        </div>
        <div id="f-metro"></div>
        <div id="f-extra" class="f-extra"></div>
        <div class="field"><span class="label">Цена, ₽</span>
          <div class="row"><label class="sr" for="f-min">Цена от</label><input id="f-min" name="min" class="input" inputmode="numeric" placeholder="от" value="${params.min || ''}">
          <label class="sr" for="f-max">Цена до</label><input id="f-max" name="max" class="input" inputmode="numeric" placeholder="до" value="${params.max || ''}"></div></div>
        <div class="f-switches">${[['delivery', 'С доставкой'], ['bargain', 'Торг уместен'], ['exchange', 'Возможен обмен'], ['trusted', 'Надёжные продавцы']].map(([k, t]) => html`<label class="switch"><span>${t}</span><input type="checkbox" name="${k}" value="1" ${params[k] === '1' ? raw('checked') : ''}><span class="track"></span></label>`)}</div>
        <div class="f-go"><button class="btn btn-dark btn-block" type="submit" id="f-show">Показать</button>
        <a href="/search${params.q ? `?q=${encodeURIComponent(params.q)}` : ''}" class="btn btn-soft btn-block">Сбросить</a></div>
      </form>
    </aside>
    <section class="results">
      <div class="results-head">
        <div class="rh-title"><h1>${title}</h1><div class="muted" id="count">&nbsp;</div></div>
        <div class="rh-tools">
          <button type="button" class="rh-filters" id="filters-open" aria-controls="filter-form" aria-expanded="false">${ic('sliders', 17, 2)}<span>Фильтры</span>${nFilters ? html`<span class="f-count">${nFilters}</span>` : ''}</button>
          <label class="sr" for="sort">Сортировка</label>
          <select id="sort" ${onMap ? raw('hidden') : ''} class="select">
            <option value="">Сначала новые</option>
            <option value="cheap" ${params.sort === 'cheap' ? raw('selected') : ''}>Сначала дешевле</option>
            <option value="expensive" ${params.sort === 'expensive' ? raw('selected') : ''}>Сначала дороже</option>
          </select>
          ${S.config.maps ? html`<nav class="seg view-sw" aria-label="Вид">${[['', 'Список', 'list'], ['map', 'Карта', 'pin']].map(([v, t, i]) => html`<a href="/search?${new URLSearchParams(Object.entries({ ...params, view: v }).filter(([, x]) => x))}" class="${(params.view === 'map') === (v === 'map') ? 'on' : ''}" ${(params.view === 'map') === (v === 'map') ? raw('aria-current="page"') : ''} aria-label="${t}">${ic(i, 17, 2)}<span>${t}</span></a>`)}</nav>` : ''}
        </div>
      </div>
      ${subChips.length ? html`<nav class="sub-chips" aria-label="Разделы">${subChips.map((x) => html`<a class="chip" href="/search?${new URLSearchParams({ ...params, category, sub: x.id })}">${x.name}</a>`)}</nav>` : ''}
      ${activeChips.length ? html`<div class="active-chips">${activeChips.map(([t, href]) => html`<a class="chip on" href="${href}" aria-label="Убрать: ${t}">${t}${ic('close', 14, 2.2)}</a>`)}</div>` : ''}
      <div class="understood" id="understood"></div>
      <div id="results">${skeletonGrid(9)}</div>
      <div class="more hidden"></div>
      ${sec ? html`<section class="sec-about" id="sec-about" aria-label="О разделе"></section>` : ''}
    </section>
  </div>`);
  if (sec) {
    api('GET', `/api/sections/info?${new URLSearchParams(sec)}`).then((d) => {
      const box = $('#sec-about'); if (!box) return;
      box.innerHTML = String(secAbout(d));
      const h = $('.results-head h1'); if (h) h.textContent = d.h1;
      document.title = d.title || `${d.h1} — Торгана`; // тот же заголовок, что отдаёт сервер (lib/seo.js)
    }).catch(() => {});
  }

  const ff = $('#filter-form');
  // Раздел и характеристики зависят от категории и раздела — перестраиваем без перезагрузки.
  const renderExtra = (cat, sb) => {
    const subs = subsOf(cat);
    const x = subOf(sb);
    const val = (k) => params[k] || '';
    $('#f-extra').innerHTML = String(html`
      ${subs.length ? html`<div class="field"><label for="f-sub">Раздел</label><select id="f-sub" name="sub" class="select"><option value="">Все разделы</option>
        ${subs.map((y) => html`<option value="${y.id}" ${y.id === sb ? raw('selected') : ''}>${y.name}</option>`)}</select></div>` : ''}
      ${x ? x.fields.filter((f) => f.type !== 'text').map((f) => (f.type === 'select'
  ? html`<input type="hidden" name="a_${f.key}" value="${val(`a_${f.key}`)}">${attrChoice(f, val(`a_${f.key}`), { filter: true })}`
  : html`<div class="field"><span class="label">${f.label}${f.unit ? `, ${f.unit}` : ''}</span><div class="row">
      <label class="sr" for="fa-${f.key}-min">${f.label} от</label><input id="fa-${f.key}-min" name="a_${f.key}_min" class="input" inputmode="numeric" placeholder="от" value="${val(`a_${f.key}_min`)}">
      <label class="sr" for="fa-${f.key}-max">${f.label} до</label><input id="fa-${f.key}-max" name="a_${f.key}_max" class="input" inputmode="numeric" placeholder="до" value="${val(`a_${f.key}_max`)}"></div></div>`)) : ''}`);
    const fs = $('#f-sub');
    if (fs) fs.onchange = () => renderExtra(cat, fs.value);
  };
  // Характеристики-списки в фильтрах — чипсами; значение лежит в скрытом поле a_<ключ>.
  bindAttrChoices($('#f-extra'), { find: (fn) => (subOf(($('#f-sub') || {}).value || '') || { fields: [] }).fields.find(fn) },
    (k) => { const i = $(`#f-extra input[name="a_${k}"]`); return i ? i.value : ''; },
    (k, v) => { const i = $(`#f-extra input[name="a_${k}"]`); if (i) { i.value = v || ''; i.dispatchEvent(new Event('change', { bubbles: true })); } }, { filter: true });
  renderExtra(category, sub);
  $('#f-cat').onchange = (e) => renderExtra(e.target.value, '');
  // Метро — когда в городе есть метро (справочник hh.ru).
  const renderMetro = async () => {
    const city = $('#f-city').value.trim();
    const box = $('#f-metro');
    if (!hasMetro(city)) { box.innerHTML = ''; return; }
    const list = await metroOf(city);
    if (!list.length || $('#f-city').value.trim() !== city) return;
    box.innerHTML = String(html`<div class="field"><label for="f-mt">Метро</label><select id="f-mt" name="metro" class="select"><option value="">Любая станция</option>
      ${list.map((m) => html`<option value="${m.name}" data-color="${m.color}" data-line="${m.line}" ${m.name === params.metro ? raw('selected') : ''}>${m.name}</option>`)}</select></div>`);
  };
  renderMetro();
  $('#f-city').addEventListener('change', renderMetro);
  // 1.35: на компьютере фильтры применяются сразу (любой выбор, переключатель, поле — по Enter или уходу из поля);
  // на телефоне панель открывается кнопкой «Фильтры», а «Показать» внизу сразу пишет, сколько найдётся.
  const narrow = () => window.matchMedia('(max-width: 900px)').matches;
  const toggle = $('#filters-toggle');
  toggle.onclick = () => { const open = $('#filters').classList.toggle('collapsed') === false; filtersOpen = open; toggle.setAttribute('aria-expanded', String(open)); $('#filters-open').setAttribute('aria-expanded', String(open)); };
  $('#filters-open').setAttribute('aria-expanded', String(!$('#filters').classList.contains('collapsed')));
  // 1.47.2: на телефоне «Фильтры» — в одной строке с сортировкой и «Список / Карта»; панель открывается над результатами.
  $('[data-f-close]').onclick = () => { toggle.onclick(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('#filters-open').onclick = () => { toggle.onclick(); if (narrow() && !$('#filters').classList.contains('collapsed')) $('#filters').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  const formParams = () => {
    const next = {};
    for (const [k, v] of new FormData(ff).entries()) {
      let t = String(v).trim();
      if (k === 'min' || k === 'max') t = t.replace(/\D/g, ''); // «1 000 000» → 1000000
      else if (/^a_.+_(min|max)$/.test(k)) t = t.replace(/[\s\u00a0]/g, '').replace(',', '.'); // «2,5» → 2.5
      if (t) next[k] = t;
    }
    if (params.sort) next.sort = params.sort;
    if (params.view) next.view = params.view;
    next.city = next.city || '';
    return next;
  };
  // Применить на месте: страница не прыгает наверх, фокус остаётся в поле, куда перешли (Tab из «от» в «до»).
  let applyTimer = null;
  const apply = () => {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      if (!ff.isConnected) return;
      const a = document.activeElement;
      S.keep = { y: window.scrollY, fy: $('#filters').scrollTop, focus: a && ff.contains(a) && a.id ? a.id : '' };
      goSearch(formParams());
    }, 0);
  };
  let countTimer = null;
  const showBtn = $('#f-show');
  const liveCount = () => {
    clearTimeout(countTimer);
    countTimer = setTimeout(async () => {
      const p = Object.fromEntries(Object.entries(formParams()).filter(([, v]) => v));
      const d = await api('GET', `/api/listings?${new URLSearchParams({ ...p, limit: 1 })}`).catch(() => null);
      if (d && showBtn.isConnected) showBtn.textContent = d.total ? `Показать ${NF.format(d.total)} ${plural(d.total, 'объявление', 'объявления', 'объявлений')}` : 'Ничего не найдено';
    }, 250);
  };
  ff.addEventListener('change', (e) => {
    if (e.target.id === 'f-city') { // город — только целиком: пусто («Вся Россия») или город из списка, недописанный не ищем
      const t = e.target.value.trim().toLowerCase().replace(/ё/g, 'е');
      const c = (S.config.cities || []).find((x) => x.toLowerCase().replace(/ё/g, 'е') === t);
      if (t && !c) return;
      if (c) e.target.value = c;
    }
    if (narrow()) liveCount(); else apply();
  });
  ff.addEventListener('input', (e) => { if (narrow() && e.target.matches('input.input')) liveCount(); });
  ff.onsubmit = (e) => { e.preventDefault(); if (narrow()) { clearTimeout(applyTimer); goSearch(formParams()); } else apply(); };
  $('#sort').onchange = (e) => { const p = { ...params, sort: e.target.value }; go(`/search?${new URLSearchParams(Object.entries(p).filter(([, v]) => v))}`); };

  if (onMap) { await mountMap($('#results'), params); return; }
  await listingFeed($('#results'), params, {
    empty: html`<div class="empty"><h3>Ничего не нашлось</h3><p>Попробуйте другие слова, уберите часть фильтров или поищите по всей России.</p><a href="/search" class="btn btn-dark">Все объявления</a></div>`,
    onFirst: (data) => {
      $('#count').textContent = `${NF.format(data.total)} ${plural(data.total, 'объявление', 'объявления', 'объявлений')}`;
      const u = data.understood || {};
      const chips = [];
      if (params.q) {
        if (u.city && !params.city) chips.push(html`<span class="tag">${ic('pin', 14)}&nbsp;${u.city}</span>`);
        if (u.min && !params.min) chips.push(html`<span class="tag">от ${NF.format(u.min)} ₽</span>`);
        if (u.max && !params.max) chips.push(html`<span class="tag">до ${NF.format(u.max)} ₽</span>`);
        if (u.delivery && !params.delivery) chips.push(html`<span class="tag">с доставкой</span>`);
      }
      // 1.43.0: по запросу с опечаткой сервер нашёл исправленный вариант — говорим об этом и даём искать как написано.
      const fixed = data.corrected ? html`<div class="q-fixed">${ic('check', 16, 2.4)}<span>Показаны результаты по запросу <b>«${data.corrected}»</b>
        <a href="/search?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), exact: '1' })}">Искать «${params.q}», как написано</a></span></div>` : '';
      $('#understood').innerHTML = String(html`${fixed}${chips.length ? html`<span class="muted" style="font-size:14px;align-self:center">Поняли запрос:</span>${chips}` : ''}`);
    }
  }).first;
  await adRow($('#results'), params, '', 'подобрано по запросу и фильтрам');
}

// ---------- объявления на карте ----------
// Карта Яндекса — в отдельной рамке-песочнице (/map-frame): у неё нет доступа к сайту, входу и cookie.
// Точки отдаём ей сообщением; в ответ рамка говорит только «открой объявление №…».
// Точка стоит у станции метро или в центре города — точный адрес на карте не показываем.
async function mountMap(box, params) {
  box.innerHTML = String(html`<div class="map-box"><iframe class="map-frame" src="/map-frame" title="Объявления на карте"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <div class="map-state" id="map-state">${ic('pin', 22, 2)}<span>Загружаем карту…</span></div></div>
    <p class="map-note">${ic('shield', 16, 2)}<span>Точка — у станции метро или в центре города. Точный адрес продавец сообщает в чате.</span></p>`);
  const fr = $('.map-frame', box);
  const state = $('#map-state', box);
  const q = Object.fromEntries(Object.entries(params).filter(([k, v]) => v && k !== 'view' && k !== 'sort'));
  let items = null;
  const send = () => { if (items && fr.contentWindow) fr.contentWindow.postMessage({ type: 'points', items, origin: location.origin }, '*'); };
  const onMsg = (e) => {
    if (!fr.isConnected) { window.removeEventListener('message', onMsg); return; }
    if (e.source !== fr.contentWindow || !e.data || typeof e.data !== 'object') return;
    const t = e.data.type;
    if (t === 'hello' || t === 'ready') { send(); if (t === 'ready') state.classList.add('hidden'); }
    else if (t === 'open') { const id = Number(e.data.id); if (Number.isInteger(id) && id > 0) go(`/l/${id}`); }
    else if (t === 'error') {
      state.classList.remove('hidden');
      state.innerHTML = String(html`${ic('warn', 22, 2)}<span>Карта сейчас не загрузилась</span><a class="btn btn-soft btn-sm" href="/search?${new URLSearchParams(q)}">Показать списком</a>`);
    }
  };
  window.addEventListener('message', onMsg);
  try {
    const d = await api('GET', `/api/listings/map?${new URLSearchParams(q)}`);
    if (!fr.isConnected) return;
    items = d.items.map((x) => ({ id: x.id, lat: x.lat, lng: x.lng, title: x.title, place: x.place, priceText: price(x.price, x.priceUnit), photo: x.photo ? location.origin + x.photo : '' }));
    const n = d.total;
    $('#count').textContent = !n ? 'Ничего не найдено'
      : d.shown < n ? `${NF.format(n)} ${plural(n, 'объявление', 'объявления', 'объявлений')} · на карте ${NF.format(items.length)} самых свежих`
        : `${NF.format(n)} ${plural(n, 'объявление', 'объявления', 'объявлений')} на карте`;
    send();
  } catch (ex) { state.innerHTML = String(html`${ic('warn', 22, 2)}<span>${ex.message}</span>`); }
}

// Параметры поиска для блока «Реклама»: только эти поля, без пустых.
const SEARCH_KEYS = ['q', 'category', 'sub', 'city', 'metro', 'min', 'max', 'delivery', 'bargain', 'exchange', 'trusted', 'exact'];
export const searchParams = (p) => {
  const x = subOf(p.sub);
  const attrs = x ? Object.keys(p).filter((k) => /^a_[A-Za-z]+(_min|_max)?$/.test(k) && x.fields.some((f) => k.replace(/^a_|_min$|_max$/g, '') === f.key)).sort() : [];
  return Object.fromEntries([...SEARCH_KEYS, ...attrs].map((k) => [k, String(p[k] || '').trim()]).filter(([, v]) => v && v !== '0'));
};

// Подписки на продавцов: кто (сколько нового), лента их свежих объявлений; новое помечено.
export async function renderFollowing(reload) {
  const { sellers, items } = await api('GET', '/api/my/following');
  refreshMe();
  const box = $('#box');
  if (!sellers.length) {
    box.innerHTML = String(html`<div class="empty"><h3>Вы ни на кого не подписаны</h3><p>Откройте профиль продавца или магазина и нажмите «Подписаться» — новые объявления придут уведомлением и в подборке на почту.</p><a class="btn btn-dark" href="/">Смотреть объявления</a></div>`);
    return;
  }
  box.innerHTML = String(html`<div class="fl-sellers">${sellers.map((x) => html`<div class="fl-seller">
      <a href="/u/${x.id}" class="fl-who">${ava(x)}<span class="fl-txt"><b>${x.name}${x.shop ? html` <span class="pf-badge dark">${ic('store', 12, 2)} Магазин</span>` : ''}</b><span>${x.active} ${plural(x.active, 'объявление', 'объявления', 'объявлений')}${x.city ? ` · ${x.city}` : ''}</span></span>
        ${x.fresh ? html`<span class="ss-new">${x.fresh} ${plural(x.fresh, 'новое', 'новых', 'новых')}</span>` : ''}</a>
      <button type="button" class="btn btn-line btn-sm" data-unfollow="${x.id}">Отписаться</button></div>`)}</div>
    <div class="section-head" style="margin-top:28px"><h2>Свежее у продавцов</h2></div>
    ${items.length ? grid(items) : html`<div class="pf-empty sm"><h3>Пока нет объявлений</h3><p>Как только продавцы что-то опубликуют, объявления появятся здесь.</p></div>`}`);
  $$('[data-unfollow]', box).forEach((b) => {
    b.onclick = async () => { try { await api('POST', `/api/users/${b.dataset.unfollow}/follow`, { follow: false }); toast('Вы отписались'); reload(); } catch (e) { toast(e.message, true); } };
  });
}

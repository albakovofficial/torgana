// Страница объявления: фото, характеристики, продавец, похожие; жалоба на объявление.
import { $, $$, CONDITION_CATS, CONDITION_LABEL, NF, S, api, app, ava, catName, cpath, dateShort, html, lpath, plural, price, raw, rub, subName, subOf, when } from './core.js';
import { P, ic, svg } from './icons.js';
import { COLOR_HEX, openModal, reasonModal, toast } from './ui.js';
import { photoViewer } from './photos.js';
import { grid, statSource } from './cards.js';
import { followBtn, offerModal, reviewCard } from './messages.js';
import { go, render, requireAuth, setTitle } from './router.js';
import { deleteListing } from './editor.js';
import { BOOST, boostBusy, boostCard, boostModal, boostOn, boostPrices, promoCard } from './boost.js';
import { repCard, repLine } from './reputation.js';
import { MY_TAG, atTime, isExpired, shareLink } from './profile.js';
import { nameSeal, trustBadges } from './badges.js';

// ================= объявление =================
export async function viewListing(id) {
  const data = await api('GET', `/api/listings/${id}`);
  const { listing: l, seller, similar, market } = data;
  setTitle(l.title);
  if (location.pathname !== lpath(l)) history.replaceState(history.state, '', lpath(l) + location.search); // адрес с названием
  let idx = 0;
  const photos = l.photos;
  // Галерея: фото, затем видео (если есть).
  const media = [...photos.map((src) => ({ src })), ...(l.video ? [{ src: l.video, video: true }] : [])];
  const vIdx = l.video ? media.length - 1 : -1;
  const mediaEl = (m) => (m.video
    ? html`<video class="g-video" src="${m.src}#t=0.1" controls playsinline preload="metadata"></video>`
    : html`<span class="g-ph" style="--ph:url('${m.src}')" aria-hidden="true"></span><img class="g-img" src="${m.src}" alt="${l.title}" draggable="false">`);
  const station = l.metro ? html`<span class="metro"><i style="--mline:${l.metro.color || '#C9C9C4'}"></i>${l.metro.name}</span>` : '';
  const marketChip = market ? ({
    below: html`<span class="tag accent">Ниже рынка</span>`,
    market: html`<span class="tag"><span class="dot"></span>&nbsp;Цена в рынке</span>`,
    above: html`<span class="tag">Выше рынка</span>`
  })[market.level] : '';
  // 1.24 (вариант A): путь раздела строкой, главное — плитками (то, что видно в карточке, состояние, цвет),
  // остальное — списком «название — значение», условия сделки — значками.
  const subX = subOf(l.subcategory);
  const allSpecs = [...(l.specs || []).map((x) => ({ ...x })), ...(CONDITION_CATS.has(l.category) && l.condition ? [{ key: '_cond', label: 'Состояние', value: CONDITION_LABEL[l.condition] }] : [])];
  const mainKeys = [...new Set(['brand', ...((subX && subX.summary) || []), '_cond', 'color'])];
  const tiles = allSpecs.filter((x) => mainKeys.includes(x.key)).sort((a, b) => mainKeys.indexOf(a.key) - mainKeys.indexOf(b.key)).slice(0, 4);
  const rest = allSpecs.filter((x) => !tiles.includes(x));
  const specPath = [catName(l.category), l.subcategory ? subName(l.subcategory) : ''].filter(Boolean);
  const specVal = (x) => (x.key === 'color' && COLOR_HEX[x.value] ? html`<i class="sp-dot" style="background:${COLOR_HEX[x.value]}"></i>${x.value}` : x.value);
  const kv = (rows) => html`<dl class="kv">${rows.map((x) => html`<div><dt>${x.label}</dt><dd>${specVal(x)}</dd></div>`)}</dl>`;
  const terms = [
    [l.delivery ? 'truck' : 'users', l.delivery ? 'Отправит по России' : 'Только встреча', l.delivery ? 'ok' : ''],
    l.price !== null ? ['tag', l.bargain ? 'Торг уместен' : 'Без торга', l.bargain ? 'ok' : ''] : null,
    l.exchange ? ['refresh', 'Возможен обмен', 'ok'] : null
  ].filter(Boolean);

  let ownerBanner = '';
  if (l.isOwner && l.status === 'rejected') {
    ownerBanner = html`<div class="banner danger"><strong>Объявление отклонено модерацией.</strong> Причина: ${l.rejectReason || 'не указана'}.
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-dark btn-sm" href="/edit/${l.id}">Исправить</a>
      ${l.appealReply ? '' : l.appealText ? html`<span class="tag">Апелляция отправлена</span>` : html`<button class="btn btn-line btn-sm" data-appeal>Не согласен — подать апелляцию</button>`}</div>
      ${l.appealReply ? html`<div style="margin-top:10px"><strong>Ответ на апелляцию:</strong> ${l.appealReply}</div>` : ''}</div>`;
  } else if (l.isOwner && l.status === 'pending') {
    ownerBanner = reviewCard(data.review, l);
  } else if (l.isOwner && l.status === 'scheduled') {
    ownerBanner = html`<div class="banner ok"><strong>Проверено — опубликуем ${atTime(l.publishAt)} (мск).</strong> До этого объявление видите только вы. Опубликовать раньше можно кнопкой справа.</div>`;
  } else if (l.isOwner && l.status === 'archived') {
    ownerBanner = isExpired(l)
      ? html`<div class="banner soft"><strong>Прошло 30 дней — объявление снято.</strong> Если ещё актуально, опубликуйте снова: это бесплатно, оно окажется среди свежих.</div>`
      : html`<div class="banner soft"><strong>Объявление снято с публикации.</strong> Его не видят покупатели.</div>`;
  }

  let actions;
  const pm = data.promo;
  if (l.isOwner) {
    // 1.22: карточка автора — главное действие крупно, остальное плитками, «Удалить» — тихой ссылкой внизу.
    const tile = (attrs, icon, label, cls = '') => html`<button type="button" class="own-act ${cls}" ${raw(attrs)}>${ic(icon, 20, 1.9)}<span>${label}</span></button>`;
    const tiles = [
      ['active', 'sold', 'archived'].includes(l.status) ? html`<a class="own-act" href="/profile/stats/${l.id}">${ic('chart', 20, 1.9)}<span>Статистика</span></a>` : '',
      l.status === 'active' ? tile('data-status="sold"', 'check', 'Продано') : '',
      l.status === 'active' ? tile('data-status="archived"', 'pause', 'Снять') : '',
      l.status === 'scheduled' ? tile('data-status="archived"', 'pause', 'Не публиковать') : '',
      l.status === 'sold' || (l.status === 'archived' && !isExpired(l)) ? tile('data-status="active"', 'refresh', 'Опубликовать снова') : ''
    ].filter((x) => String(x));
    const freeKinds = BOOST.filter(([k]) => !boostBusy(data.boost)[k]);
    const canPromote = ['active', 'pending', 'scheduled'].includes(l.status) && boostOn();
    actions = html`<div class="own">
      ${pm && pm.status === 'active' ? promoCard(pm) : ''}
      ${boostCard(data.boost)}
      ${isExpired(l) ? html`<button class="btn btn-accent btn-lg btn-block" data-status="active">${ic('refresh', 20, 2)}Опубликовать снова</button>` : ''}
      ${l.status === 'scheduled' ? html`<button class="btn btn-accent btn-lg btn-block" data-status="active">Опубликовать сейчас</button>` : ''}
      <a class="btn btn-dark btn-lg btn-block" href="/edit/${l.id}">${ic('edit', 19, 2)}${l.status === 'rejected' ? 'Исправить' : 'Редактировать'}</a>
      ${canPromote ? html`<button type="button" class="own-promo" data-promote><span class="own-promo-ic">${ic('bolt', 20, 2)}</span><span><b>${freeKinds.length < 3 ? 'Добавить продвижение' : 'Продвинуть'}</b><small>${freeKinds.length ? `${freeKinds.map(([k]) => ({ xl: 'XL', frame: 'рамка', tags: 'метки' })[k]).join(', ')} · от ${rub(Math.min(...freeKinds.map(([k]) => boostPrices()[k])))}` : 'реклама над поиском'}</small></span>${ic('right', 18, 2)}</button>` : ''}
      ${tiles.length ? html`<div class="own-acts n${tiles.length}">${tiles}</div>` : ''}
      <button type="button" class="own-del" data-delete>${ic('trash', 16, 2)}Удалить объявление</button>
    </div>`;
  } else if (l.status === 'active') {
    actions = html`<div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-accent btn-lg btn-block" data-write>${ic('chat', 20)}Написать продавцу</button>
      ${l.price && l.bargain ? html`<button class="btn btn-soft btn-lg btn-block" data-offer>${ic('tag', 19, 2)}Предложить цену</button>` : ''}
      <button class="btn btn-line btn-block" data-report>${ic('warn', 18)}Пожаловаться</button>
    </div>`;
  } else {
    actions = html`<div class="banner soft">Товар уже продан. Посмотрите похожие объявления ниже.</div>`;
  }

  app.innerHTML = String(html`<div class="wrap">
    <nav class="crumbs" aria-label="Навигация"><a href="/">Главная</a><span aria-hidden="true">›</span><a href="${cpath(l.category)}">${catName(l.category)}</a><span aria-hidden="true">›</span><a href="${cpath(l.category, l.city)}">${l.city}</a></nav>
    ${ownerBanner ? html`<div style="margin-bottom:20px">${ownerBanner}</div>` : ''}
    <div class="item">
      <div class="item-main">
        <div>
          <div class="gallery-main" id="gallery">
            <div class="g-media" id="gmedia">${media.length ? html`<div class="g-track" id="gtrack">${media.map((m, k) => html`<div class="g-slide" ${k ? raw('aria-hidden="true"') : ''}>${mediaEl(m)}</div>`)}</div>` : svg(P.image, 56, 1.1)}</div>
            ${media.length > 1 ? html`
              <button class="icon-btn white gallery-nav prev" data-g="-1" aria-label="Назад">${ic('left', 20)}</button>
              <button class="icon-btn white gallery-nav next" data-g="1" aria-label="Вперёд">${ic('right', 20)}</button>
              <span class="gallery-count" id="gcount">1 из ${media.length}</span>` : ''}
            ${vIdx > 0 ? html`<button type="button" class="g-video-btn" id="gvbtn" data-t="${vIdx}">${ic('play', 14, 0)}Видео</button>` : ''}
            ${l.status === 'sold' ? html`<span class="tag dark" style="position:absolute;top:18px;left:18px">Продано</span>` : ''}
          </div>
          ${media.length > 1 ? html`<div class="thumbs">${media.map((m, i) => (m.video
  ? html`<button class="thumb vthumb ${i === 0 ? 'on' : ''}" data-t="${i}" aria-label="Видео">${photos[0] ? html`<img src="${photos[0]}" alt="" loading="lazy">` : ''}<span>${ic('play', 16, 0)}</span></button>`
  : html`<button class="thumb ${i === 0 ? 'on' : ''}" data-t="${i}" aria-label="Фото ${i + 1}"><img src="${m.src}" alt="" loading="lazy"></button>`))}</div>` : ''}
        </div>
        <section class="sp-sec"><h2 class="h2">Характеристики</h2>
          <nav class="sp-path" aria-label="Раздел">${specPath.map((t, k) => html`${k ? html`<span aria-hidden="true">›</span>` : ''}<a href="${k ? `/c/${l.category}/${l.subcategory}` : cpath(l.category)}">${t}</a>`)}</nav>
          ${tiles.length ? html`<div class="sp-tiles">${tiles.map((x) => html`<div class="sp-tile"><small>${x.label}</small><b>${specVal(x)}</b></div>`)}</div>` : ''}
          ${rest.length ? kv(rest) : ''}
          ${l.vinMasked ? html`<div class="vin-row" id="vin-row"><span class="vin-ic">${ic('shield', 18, 2)}</span><div class="vin-t"><small>VIN или номер кузова</small><b id="vin-val">${l.vin || l.vinMasked}</b></div>
            ${l.vin ? html`<button type="button" class="btn btn-soft btn-sm" data-vin-copy aria-label="Скопировать VIN">${ic('copy', 15, 2)}<span class="vin-bt">Скопировать</span></button>` : html`<button type="button" class="btn btn-soft btn-sm" data-vin-show aria-label="Показать VIN целиком">${ic('eye', 15, 2)}<span class="vin-bt">Показать</span></button>`}</div>
            <p class="vin-note hidden" id="vin-note">По VIN можно проверить историю машины — например, на <a href="https://xn--90adear.xn--p1ai/check/auto" target="_blank" rel="noopener">сайте Госавтоинспекции</a>: регистрации, ДТП, розыск и ограничения.</p>` : ''}</section>
        ${l.description ? html`<section><h2 class="h2">Описание</h2><p class="desc">${l.description}</p></section>` : ''}
        <section class="sp-sec"><h2 class="h2">Условия</h2><div class="sp-terms">
          ${terms.map(([icon, t, tone]) => html`<span class="sp-term ${tone}">${ic(icon, 17, 2)}${t}</span>`)}
          <span class="sp-term">${l.metro ? html`<i class="sp-dot" style="background:${l.metro.color || '#C9C9C4'}"></i>${l.metro.name} · ` : ic('pin', 17, 2)}${l.city}${l.district ? `, ${l.district}` : ''}</span></div></section>
      </div>
      <aside class="item-side">
        <div class="panel panel-shadow" style="display:flex;flex-direction:column;gap:22px">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="flex:1;min-width:0">${l.isOwner ? html`<span class="own-state ${(isExpired(l) ? ['off'] : MY_TAG[l.status] || MY_TAG.archived)[0]}"><i></i>${isExpired(l) ? 'Срок истёк' : (MY_TAG[l.status] || MY_TAG.archived)[1]}${l.status === 'active' && l.expiresAt ? html`<em>до ${dateShort(l.expiresAt)}</em>` : ''}</span>` : ''}<h1 class="item-title">${l.title}</h1><p class="muted" style="margin:8px 0 0;font-size:14px">${l.city} · ${when(l.createdAt)}</p>
              ${l.metro || l.district ? html`<p class="item-where">${station}${l.district ? html`<span class="iw-d">${l.district}</span>` : ''}</p>` : ''}
              <p class="item-counts"><span title="Просмотры">${ic('eye', 16)}<span data-views>${NF.format(l.views)} ${plural(l.views, 'просмотр', 'просмотра', 'просмотров')}</span></span><span title="В избранном">${ic('heart', 16)}<span data-favs>в избранном у ${NF.format(l.favCount)}</span></span></p></div>
            ${l.isOwner ? '' : html`<button class="icon-btn ${l.isFav ? 'on' : ''}" data-fav="${l.id}" aria-label="${l.isFav ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${l.isFav ? 'true' : 'false'}">${ic('heart', 20)}</button>`}
            <button class="icon-btn" data-share aria-label="Поделиться">${ic('share', 20)}</button>
          </div>
          <div><div class="item-price">${price(l.price, l.priceUnit)}${l.priceWas ? html` <s class="price-was">${price(l.priceWas, l.priceUnit)}</s>` : ''}</div>
            ${market && market.level === 'good' ? html`<div class="gp-box"><span class="gp-ic">${ic('check', 16, 2.8)}</span><div><b>Хорошая цена</b>
              <span>${market.perM2 ? 'Цена за м² на' : 'На'} ${market.pct}% ниже, чем в среднем у ${market.count} ${plural(market.count, 'похожего объявления', 'похожих объявлений', 'похожих объявлений')} на Торгане${market.basis ? ` — ${market.basis}` : ''}</span></div></div>`
  : marketChip ? html`<div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${marketChip}<span class="muted" style="font-size:13px">по ${market.count} ${plural(market.count, 'похожему объявлению', 'похожим объявлениям', 'похожим объявлениям')}${market.basis ? ` · ${market.basis}` : ''}</span></div>` : ''}
          </div>
          ${actions}
          <div style="display:${l.isOwner ? 'none' : 'flex'};flex-direction:column;gap:14px">
            ${S.config.payments
  ? html`<div class="note"><span style="color:var(--accent)">${ic('shield', 22)}</span><div><strong>Безопасная сделка.</strong> Продавец получит деньги, только когда вы заберёте и проверите товар.</div></div>`
  : html`<div class="note"><span style="color:var(--accent)">${ic('shield', 22)}</span><div><strong>Общайтесь в чате Торганы.</strong> Так переписка сохранится, а мы сможем помочь при споре.</div></div>`}
            ${l.delivery ? html`<div class="note">${ic('truck', 22)}<div><strong>Доставка по России.</strong> Продавец готов отправить товар — договоритесь о способе в чате.</div></div>` : ''}
          </div>
        </div>
        <a href="/u/${seller.id}" class="panel" style="display:flex;align-items:center;gap:14px;color:var(--text)">
          ${ava(seller)}
          <span style="flex:1;min-width:0"><span style="display:block;font-size:17px;font-weight:700">${nameSeal(seller.name, seller.badges)}</span>
          ${repLine(seller.rep, '', { first: seller.badges && seller.badges.first, who: seller.name, kind: seller.badges && seller.badges.shop ? 'shop' : '' })}
          <span class="muted" style="display:block;font-size:13px">${seller.activeCount} ${plural(seller.activeCount, 'объявление', 'объявления', 'объявлений')}</span>
          ${seller.badges && (seller.badges.phone || seller.badges.biz) ? html`<span class="pf-badges" style="margin-top:8px">${trustBadges(seller.badges)}</span>` : ''}</span>
          ${ic('right', 20)}
        </a>
        ${seller.rep && !seller.rep.newbie ? html`<a class="rep-link" href="/u/${seller.id}?tab=rep">${repCard(seller.rep, true)}</a>` : seller.reply ? html`<div class="reply-tiles">
          ${seller.reply.time ? html`<div class="reply-tile">${ic('clock', 16, 2.2)}<b>${{ hour: 'Отвечает за час', hours: 'Отвечает за 1–3 часа', day: 'Отвечает в течение дня', days: 'Отвечает за 1–2 дня' }[seller.reply.time]}</b><span>обычно, за последние 30 дней</span></div>` : ''}
          <div class="reply-tile">${ic('chat', 16, 2.2)}<b>${seller.reply.rate} из 10 чатов</b><span>получают ответ</span></div>
        </div>` : ''}
        ${l.isOwner ? '' : html`<div class="seller-follow">${followBtn(seller.id, seller.following)}<span class="muted"><b data-followers>${NF.format(seller.followers || 0)}</b> ${plural(seller.followers || 0, 'подписчик', 'подписчика', 'подписчиков')} · узнают о новых объявлениях первыми</span></div>`}
        <div class="banner soft" style="font-size:14px"><strong style="color:var(--text)">Мы никогда не просим</strong> переходить в мессенджеры, называть код из СМС или платить по ссылке. Если вас об этом просят — это мошенники.</div>
      </aside>
    </div>
    ${similar.length ? html`<section class="section"><div class="section-head"><h2>Похожие объявления</h2><a href="${cpath(l.category, l.city)}">Смотреть все</a></div>${grid(similar)}</section>` : ''}
  </div>`);

  if (l.status === 'active') api('POST', '/api/stats/view', { id: l.id, src: statSource() }).catch(() => {});

  // галерея: лента слайдов — едет за пальцем, листается плавно, на краях пружинит
  const track = $('#gtrack');
  const EASE = 'transform .42s cubic-bezier(.22,.8,.24,1)';
  const place = (px = 0, anim = true) => {
    if (!track) return;
    track.style.transition = anim && !matchMedia('(prefers-reduced-motion: reduce)').matches ? EASE : 'none';
    track.style.transform = px ? `translate3d(calc(${-idx * 100}% + ${px}px), 0, 0)` : `translate3d(${-idx * 100}%, 0, 0)`;
  };
  const show = (i) => {
    if (media.length < 2) return;
    const prev = idx;
    idx = (i + media.length) % media.length;
    place();
    if (prev !== idx) { const pv = $$('.g-slide video')[0]; if (pv && !pv.paused) pv.pause(); }
    $$('.g-slide').forEach((sl, j) => { if (j === idx) sl.removeAttribute('aria-hidden'); else sl.setAttribute('aria-hidden', 'true'); });
    const th = $$('.thumb')[idx]; if (th) th.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    const c = $('#gcount'); if (c) c.textContent = `${idx + 1} из ${media.length}`;
    const vb = $('#gvbtn'); if (vb) vb.hidden = idx === vIdx;
    $('#gallery').classList.toggle('is-video', idx === vIdx);
    $$('.thumb').forEach((t, j) => t.classList.toggle('on', j === idx));
  };
  if (vIdx === 0) $('#gallery').classList.add('is-video');
  // Нажатие на фото — просмотр на весь экран внутри Торганы (видео играет на месте).
  const photoList = media.filter((m) => !m.video).map((m) => m.src);
  let dragged = false;
  $('#gmedia').addEventListener('click', (e) => {
    if (dragged || !e.target.closest('.g-img')) return;
    photoViewer(photoList, photoList.indexOf(media[idx] && media[idx].src), l.title);
  });
  $$('[data-g]').forEach((b) => { b.onclick = () => show(idx + Number(b.dataset.g)); });
  $$('[data-t]').forEach((b) => { b.onclick = () => show(Number(b.dataset.t)); });
  // Свайп: слайд следует за пальцем; отпустили — доезжает до соседнего или возвращается.
  const g = $('#gallery');
  let sw = null;
  g.addEventListener('touchstart', (e) => {
    if (media.length < 2 || e.touches.length > 1 || e.target.closest('video, .gallery-nav, .g-video-btn')) { sw = null; return; }
    const t = e.touches[0]; sw = { x: t.clientX, y: t.clientY, t: Date.now(), dx: 0, axis: '' }; dragged = false;
  }, { passive: true });
  g.addEventListener('touchmove', (e) => {
    if (!sw) return;
    const t = e.touches[0]; const dx = t.clientX - sw.x; const dy = t.clientY - sw.y;
    if (!sw.axis && Math.abs(dx) + Math.abs(dy) > 8) sw.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (sw.axis !== 'x') return;
    dragged = true;
    const edge = (idx === 0 && dx > 0) || (idx === media.length - 1 && dx < 0);
    sw.dx = edge ? dx * 0.3 : dx; // на краях — пружина
    place(sw.dx, false);
  }, { passive: true });
  const swEnd = () => {
    if (!sw) return;
    const { dx, t, axis } = sw; sw = null;
    if (axis !== 'x') return;
    const v = Math.abs(dx) / Math.max(1, Date.now() - t);
    const far = Math.abs(dx) > g.clientWidth * 0.18 || (v > 0.35 && Math.abs(dx) > 24);
    const next = idx + (dx < 0 ? 1 : -1);
    if (far && next >= 0 && next < media.length) show(next); else place();
    setTimeout(() => { dragged = false; }, 60);
  };
  g.addEventListener('touchend', swEnd);
  g.addEventListener('touchcancel', swEnd);
  window.addEventListener('resize', () => place(0, false), { passive: true });

  // 1.48.0: VIN целиком — по кнопке, только вошедшим.
  const vinCopy = (btn) => { btn.onclick = async () => { try { await navigator.clipboard.writeText($('#vin-val').textContent.trim()); toast('VIN скопирован'); } catch { toast('Не удалось скопировать — выделите VIN и скопируйте вручную', true); } }; };
  const vs = $('[data-vin-show]');
  if (vs) {
    vs.onclick = async () => {
      if (!requireAuth()) return;
      try {
        const r = await api('GET', `/api/listings/${l.id}/vin`);
        $('#vin-val').textContent = r.vin;
        $('#vin-row').classList.add('open');
        $('#vin-note').classList.remove('hidden');
        vs.outerHTML = String(html`<button type="button" class="btn btn-soft btn-sm" data-vin-copy aria-label="Скопировать VIN">${ic('copy', 15, 2)}<span class="vin-bt">Скопировать</span></button>`);
        vinCopy($('[data-vin-copy]'));
      } catch (e) { toast(e.message, true); }
    };
  }
  if ($('[data-vin-copy]')) vinCopy($('[data-vin-copy]'));
  $('[data-share]').onclick = () => shareLink(location.href, l.title); // одна функция «Поделиться» на сайт (в приложении — окно iPhone)

  const of = $('[data-offer]');
  if (of) {
    of.onclick = () => {
      if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
      offerModal({ listingPrice: l.price, title: l.title, onSubmit: async (sum) => {
        const { id: cid } = await api('POST', '/api/conversations', { listingId: l.id });
        await api('POST', `/api/conversations/${cid}/offer`, { price: sum });
        toast('Предложение отправлено — ответ придёт в чат');
        go(`/messages/${cid}`);
      } });
    };
  }
  const w = $('[data-write]');
  if (w) {
    w.onclick = async () => {
      if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
      try { const { id: cid } = await api('POST', '/api/conversations', { listingId: l.id }); go(`/messages/${cid}`); } catch (e) { toast(e.message, true); }
    };
  }
  $$('[data-status]').forEach((b) => {
    b.onclick = async () => {
      try {
        await api('PATCH', `/api/listings/${l.id}`, { status: b.dataset.status });
        toast({ sold: 'Отмечено как проданное', active: l.status === 'scheduled' ? 'Объявление опубликовано' : 'Объявление снова опубликовано', archived: l.status === 'scheduled' ? 'Публикация отменена' : 'Снято с публикации' }[b.dataset.status]);
        render();
      } catch (e) { toast(e.message, true); }
    };
  });
  const del = $('[data-delete]');
  if (del) {
    del.onclick = async () => { if (await deleteListing(l.id)) go('/profile', true); };
  }
  const ap = $('[data-appeal]');
  if (ap) ap.onclick = () => appealModal(l.id, () => render());
  const pr = $('[data-promote]');
  if (pr) pr.onclick = () => boostModal(l.id, l.title, pm);
  const rp = $('[data-report]');
  if (rp) {
    rp.onclick = () => {
      if (!S.user) { go(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
      reasonModal({ title: 'Пожаловаться на объявление', hint: 'Жалобу рассмотрит модератор. Продавец не узнает, кто пожаловался.', url: `/api/listings/${l.id}/report`,
        okLabel: 'Отправить', reasons: REPORT_REASONS, pick: true, placeholder: 'Что не так? Например: просит предоплату на карту', danger: false, done: () => {} });
    };
  }
}

export function appealModal(id, done) {
  openModal(String(html`<h2>Апелляция</h2><p class="muted" style="margin:0 0 14px">Объясните, почему решение модерации стоит пересмотреть. Апелляцию рассмотрит человек.</p>
    <label class="sr" for="ap-text">Текст апелляции</label>
    <textarea id="ap-text" class="textarea" maxlength="1000" placeholder="Например: на фото именно этот товар, вот ещё детали…"></textarea>
    <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-dark" data-ok>Отправить</button></div>`), (m, close) => {
    $('[data-x]', m).onclick = close;
    $('[data-ok]', m).onclick = async () => {
      try { await api('POST', `/api/listings/${id}/appeal`, { text: $('#ap-text', m).value }); close(); toast('Апелляция отправлена'); done(); } catch (e) { toast(e.message, true); }
    };
  });
}

// ================= жалоба на объявление =================
const REPORT_REASONS = ['Запрещённый товар или услуга', 'Мошенничество', 'Неверная цена или описание', 'Товар уже продан', 'Чужие фото или подделка', 'Оскорбления или спам', 'Нарушены мои права (правообладатель)'];

// Размещение и правка объявления: три шага, фото и видео, характеристики, черновик.
// Части: editor-media (фото, видео), editor-attrs (раздел, характеристики, VIN), editor-deal (категория, цена, метро), editor-ready (готовность, советы, черновик).
import { $, $$, CONDITION_CATS, NF, S, api, app, dateShort, html, raw, rub, subOf, when } from './core.js';
import { catIc, ic } from './icons.js';
import { autoTitle } from './rules.js';
import { confirmModal, toast } from './ui.js';
import { go, render, requireAuth, setCleanup, setTitle, viewNotFound } from './router.js';
import { BOOST, bindBoostPicker, boostBusy, boostOn, boostPay, boostPicker, boostPrices, boostQuote } from './boost.js';
import { firstMedal, firstName } from './badges.js';
import { mediaPart } from './editor-media.js';
import { attrsPart } from './editor-attrs.js';
import { dealPart } from './editor-deal.js';
import { ED_STEPS, draftDrop, draftLoad, readyPart } from './editor-ready.js';

// Отпечаток фото (dHash, 64 бита): одинаковые снимки дают почти одинаковый отпечаток даже после пересжатия.
// Нужен модератору — подсказать, что фото уже есть у другого продавца.
export function photoHash(src) {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, 9, 8);
  const px = ctx.getImageData(0, 0, 9, 8).data;
  const g = (x, y) => { const i = (y * 9 + x) * 4; return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; };
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += g(x, y) > g(x + 1, y) ? '1' : '0';
  return bits.match(/.{4}/g).map((b) => parseInt(b, 2).toString(16)).join('');
}

// Удаление объявления — одно для страницы объявления и «Моих объявлений». С сайта пропадает, переписки остаются (1.42.0).
export async function deleteListing(id) {
  if (!(await confirmModal('Удалить объявление?', 'Объявление пропадёт с сайта, вернуть его нельзя. Переписки с покупателями сохранятся — в них будет пометка «Объявление удалено».', 'Удалить', true))) return false;
  try { await api('DELETE', `/api/listings/${id}`); toast('Объявление удалено'); return true; } catch (e) { toast(e.message, true); return false; }
}

// ================= новое объявление и правка =================
// Три шага по одному на экране: фото и видео, «что и сколько» (раздел, цена, город, описание), отправка (сразу или в выбранное время).
// Сверху полоска шагов — можно перейти к любому; «Далее» проверяет обязательное на текущем шаге.
// На компьютере справа — превью карточки, что осталось заполнить и кнопка; на телефоне внизу «‹» и «Далее» вместо нижнего меню.
const UNIT_LABEL = { '': 'за всё', мес: 'в месяц', сутки: 'за сутки', час: 'за час', 'м²': 'за м²', шт: 'за штуку' };
// Публикация в выбранное время: дни на 30 вперёд и время с шагом 30 минут — по Москве (UTC+3 круглый год).
const MSK = 3 * 3600 * 1000;
const mskDay = (ts) => new Date(ts + MSK).toISOString().slice(0, 10);
const mskTs = (day, time) => Date.parse(`${day}T${time}:00Z`) - MSK;
const dayLabelLong = (day) => { const t = new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }); return t[0].toUpperCase() + t.slice(1); };

// Разметка страницы: шапка, полоска шагов, три шага формы, панель справа (компьютер) и нижняя панель (телефон).
function editorPage({ l, src, st, draft, sendLabel, canSchedule, canBoost }) {
  const units = S.config.priceUnits || [''];
  const at0 = src.publishAt && src.publishAt > Date.now() ? src.publishAt : null;
  const tomorrow10 = mskTs(mskDay(Date.now() + 24 * 3600 * 1000), '10:00');
  const days = Array.from({ length: 31 }, (_, i) => mskDay(Date.now() + i * 24 * 3600 * 1000));
  const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
  const atDay = mskDay(at0 || tomorrow10);
  const atClock = new Date((at0 || tomorrow10) + MSK).toISOString().slice(11, 16);
  const busyBoost = boostBusy(l && l.boost);
  const step = (n, sid, title, sub, body) => html`<section class="ed-step" id="${sid}"><div class="ed-step-h"><span class="ed-kick">Шаг ${n} из ${ED_STEPS.length}</span><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div><div class="ed-err" role="alert" hidden></div>${body}
    <div class="ed-nav">${n > 1 ? html`<button type="button" class="btn btn-soft" data-prev>${ic('left', 18, 2)}Назад</button>` : html`<span></span>`}${n < ED_STEPS.length
  ? html`<button type="button" class="btn btn-dark" data-next>Далее${ic('right', 18, 2)}</button>`
  : html`<button type="button" class="btn btn-accent" data-submit>${sendLabel}</button>`}</div></section>`;
  const opt = (name, icon, title, sub, on, id = '') => html`<label class="ed-opt" id="${id || name}-opt"><span class="ed-opt-top"><span class="ed-opt-ic">${ic(icon, 20)}</span><input type="checkbox" ${id ? raw(`id="${id}"`) : raw(`name="${name}"`)} ${on ? raw('checked') : ''}></span><b>${title}</b><small>${sub}</small></label>`;
  return String(html`<div class="wrap ed">
    <div class="ed-head">
      <a class="pf-back always" href="${l ? `/l/${l.id}` : '/profile'}">${ic('left', 18, 2)}${l ? 'К объявлению' : 'Мои объявления'}</a>
      <h1>${l ? 'Редактирование' : 'Новое объявление'}</h1>
      <p>${l ? 'После сохранения объявление снова проверит модератор — обычно несколько часов. Пока идёт проверка, его не видно в поиске.' : 'Бесплатно и без лимитов. Каждое объявление проверяет модератор — обычно это несколько часов.'}</p>
      ${!l && S.first && S.first.left && !(S.user.badges && S.user.badges.first) && !S.user.isOwner ? html`<div class="ed-first">${firstMedal(30)}<span><b>Медаль «${firstName(S.first.form)}»</b> — первой тысяче продавцов, с личным номером. Осталось ${NF.format(S.first.left)}: медаль будет вашей, когда объявление одобрят</span></div>` : ''}
      ${draft ? html`<div class="ed-draft">${ic('refresh', 15, 2.2)}<span>Черновик от ${when(draft.at)}</span><button type="button" id="draft-drop">Сбросить</button></div>` : ''}
    </div>
    <nav class="ed-steps" aria-label="Шаги">${ED_STEPS.map(([sid, t], i) => html`<button type="button" data-step="${i}" aria-controls="${sid}" aria-label="Шаг ${i + 1}: ${t}"><i></i><span>${ic('check', 14, 2.6)}${t}</span></button>`)}</nav>
    <div class="ed-grid">
      <form id="ed" class="ed-form" novalidate>
        ${step(1, 's-photos', 'Фото и видео', 'До 10 фото и одно видео до минуты. Первое фото — обложка в поиске.', html`<div id="photos"></div>
          <input type="file" id="file" accept="image/jpeg,image/png,image/webp" multiple class="sr" tabindex="-1">
          <div id="ai-slot"></div>
          <input type="file" id="vfile" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v" class="sr" tabindex="-1">`)}
        ${step(2, 's-what', 'Что и сколько', '', html`
          <div class="field" id="title-field"><label for="title">Название</label>
            <div class="ed-input"><input id="title" name="title" class="input" maxlength="80" placeholder="Например: iPhone 15 Pro, 256 ГБ" value="${src.title || ''}" autocomplete="off"><span class="ed-count" id="title-count"></span></div>
            <span class="help">Марка, модель и главное — так объявление легче найти.</span></div>
          <div class="field"><span class="label">Категория</span><div class="ed-cats" role="radiogroup" aria-label="Категория">
            ${S.config.categories.map((c) => html`<button type="button" role="radio" aria-checked="false" data-cat="${c.id}"><span class="ed-cat-ic">${catIc(c.id, 24)}</span><span>${c.name}</span></button>`)}</div></div>
          <div class="field hidden" id="sub-field"><span class="label">Раздел</span><div class="ed-subs" id="subs" role="radiogroup" aria-label="Раздел"></div></div>
          <div class="ed-attrs hidden" id="attrs"></div>
          <div class="ed-autot hidden" id="auto-title" aria-live="polite"></div>
          <div class="field hidden" id="cond-field"><span class="label">Состояние</span><div class="ed-seg" role="radiogroup" aria-label="Состояние">
            ${[['new', 'Новое'], ['used', 'Б/у'], ['', 'Не указывать']].map(([v, t]) => html`<button type="button" role="radio" data-cond="${v}">${t}</button>`)}</div></div>
          <div class="field ed-price"><label class="label" for="price">Цена</label>
          <div class="ed-money"><label class="sr" for="price">Цена в рублях</label><input id="price" name="price" class="input" inputmode="numeric" autocomplete="off" placeholder="0" value="${src.price !== null && src.price !== undefined && src.price !== '' ? NF.format(Number(String(src.price).replace(/\D/g, ''))) : ''}"><span>₽</span></div>
          ${units.length > 1 ? html`<div class="ed-seg ed-units" role="radiogroup" aria-label="За что цена">${units.map((u) => html`<button type="button" role="radio" data-unit="${u}">${UNIT_LABEL[u] || `за ${u}`}</button>`)}</div>` : ''}
          <div class="ed-hint hidden" id="price-hint"></div>
          </div>
          <div class="ed-opts ed-deal" role="group" aria-label="Условия сделки">
            ${opt('bargain', 'chat', 'Торг', 'Покупатели смогут предложить свою цену', src.bargain !== false)}
            ${opt('exchange', 'refresh', 'Обмен', 'Покажем «Обмен» в объявлении и фильтрах', !!src.exchange)}
            ${opt('delivery', 'truck', 'Доставка', 'Отправлю по России', !!src.delivery)}
            ${opt('', 'info', 'Договорная', 'Цену не показываем — договоритесь в чате', st.negotiable, 'neg')}
          </div>
          <div class="field"><label for="city">Город</label>
            <div class="ed-icon-input">${ic('pin', 18)}<input id="city" name="city" class="input" data-cities autocomplete="off" value="${src.city || S.city || ''}" placeholder="Начните вводить город"></div></div>
          <div class="field"><label for="desc">Описание <small class="muted">— по желанию</small></label>
          <div class="ed-tips" id="desc-tips" aria-label="Что написать"></div>
          <div class="ed-input"><label for="desc" class="sr">Описание</label><textarea id="desc" name="description" class="textarea" maxlength="4000" placeholder="Состояние, комплектация, причина продажи, особенности">${src.description || ''}</textarea><span class="ed-count" id="desc-count"></span></div></div>
          <details class="ed-more" id="ed-more"><summary><span class="em-ic">${ic('sparkle', 20, 1.9)}</span><span class="eb-t"><b>Дополнительно</b><small id="more-sub">метро, район, характеристики, видео — по желанию</small></span><span class="em-open">${ic('down', 18, 2)}</span></summary>
            <div class="ed-more-in">
          <div class="ed-where2">
            <div class="field hidden" id="metro-field"><label for="metro">Метро</label>
              <select id="metro" name="metro" class="select"><option value="">Не указывать</option></select></div>
            <div class="field"><label for="district">Район <small class="muted">— по желанию</small></label>
              <input id="district" name="district" class="input" maxlength="60" autocomplete="off" placeholder="Например: Центральный" value="${src.district || ''}"></div>
          </div>
              <div class="ed-attrs hidden" id="attrs-more"></div>
              <div id="vin-slot"></div>
              <div id="video-slot"></div>
            </div>
          </details>`)}
        ${step(3, 's-publish', 'Проверьте и отправьте', l && l.status === 'active' && l.expiresAt ? `Так увидят покупатели · опубликовано до ${dateShort(l.expiresAt)}` : 'Так увидят покупатели · 30 дней бесплатно', html`
          <div class="ed-advice hidden" id="advice"></div>
          <div class="rv" id="review"></div>
          ${canSchedule ? html`<fieldset class="ed-when"><legend class="sr">Когда опубликовать</legend>
            <div class="ed-seg">
              <label><input type="radio" name="pub-when" value="now" ${at0 ? '' : raw('checked')}><span>${ic('bolt', 16, 2)}Сразу</span></label>
              <label><input type="radio" name="pub-when" value="later" ${at0 ? raw('checked') : ''}><span>${ic('clock', 16, 2)}Позже</span></label>
            </div>
            <div class="ed-when-at ${at0 ? '' : 'hidden'}" id="when-at">
              <div class="field"><label for="w-day">День</label><select id="w-day" class="select">${days.map((d) => html`<option value="${d}" ${d === atDay ? raw('selected') : ''}>${dayLabelLong(d)}</option>`)}</select></div>
              <div class="field"><label for="w-time">Время, МСК</label><select id="w-time" class="select">${times.map((t) => html`<option value="${t}" ${t === atClock ? raw('selected') : ''}>${t}</option>`)}</select></div>
            </div>
          </fieldset>` : ''}
          ${canBoost ? html`<details class="ed-boost" id="ed-boost"><summary><span class="eb-ic">${ic('bolt', 18, 2.2)}</span><span class="eb-t"><b>Продвинуть</b><small>по желанию · 7 дней</small></span>${(() => { const from = `от ${rub(Math.min(...BOOST.filter(([k]) => !busyBoost[k]).map(([k]) => boostPrices()[k])))}`; return html`<em id="eb-sum" data-from="${from}">${from}</em>`; })()}${ic('down', 18, 2)}</summary>
            ${boostPicker(busyBoost)}
            <p class="ed-boost-note">${ic('lock', 13, 2)}Не опубликуем за 7 дней — вернём деньги</p></details>` : ''}
          <p class="ed-rules muted">Отправляя, вы принимаете <a href="/page/rules">правила</a><span id="paid-terms" class="hidden"> и <a href="/page/terms#paid">условия платных услуг</a></span></p>`)}
      </form>
      <aside class="ed-side">
        <div class="ed-panel">
          <div class="ed-preview-h">Так увидят в поиске</div>
          <div class="ed-preview" id="preview" aria-hidden="true"></div>
          <div class="ed-ready"><div class="ed-ready-h"><b id="ready-n"></b><span id="ready-t"></span></div><div class="ed-bar-track"><i id="ready-bar"></i></div>
            <ul class="ed-check" id="check"></ul><small class="ed-req">* обязательно, остальное — по желанию</small></div>
          <div class="ed-advice side hidden" id="advice-side"></div>
          <button type="button" class="btn btn-dark btn-lg btn-block" data-submit>${sendLabel}</button>
          <a class="btn btn-soft btn-block" href="${l ? `/l/${l.id}` : '/profile'}">Отмена</a>
        </div>
      </aside>
    </div>
    <div class="ed-dock"><button type="button" class="icon-btn" data-prev aria-label="Назад">${ic('left', 20, 2)}</button><button type="button" class="btn btn-dark" data-next id="dock-next">Далее</button><button type="button" class="btn btn-accent" data-submit id="dock-send">${l ? 'Сохранить' : 'На проверку'}</button></div>
  </div>`);
}

export async function viewEditor(id) {
  if (!requireAuth()) return;
  let l = null;
  if (id) {
    const data = await api('GET', `/api/listings/${id}`);
    if (!data.listing.isOwner) { viewNotFound(); return; }
    l = data.listing;
  }
  setTitle(l ? 'Редактирование' : 'Новое объявление');
  const draft = l ? null : draftLoad();
  const src = l ? { ...l, photos: l.photos.map((u) => ({ file: u.split('/').pop(), url: u })), negotiable: l.price === null } : draft || {};
  const srcVideo = l ? (l.video ? { file: l.video.split('/').pop().split('#')[0], url: l.video } : null) : (src.video && src.video.file ? src.video : null);
  const st = {
    photos: (src.photos || []).filter((p) => p.file),
    category: src.category || '', condition: src.condition || '', priceUnit: src.priceUnit || '',
    sub: src.subcategory || '', attrs: { ...(src.attrs || {}) }, video: srcVideo,
    negotiable: !!src.negotiable, busy: 0, tried: false, vin: src.vin || '',
    step: Math.min(Math.max(Number(src.step) || 0, 0), ED_STEPS.length - 1)
  };
  const sendLabel = l ? 'Сохранить' : 'Отправить на проверку';
  // Время публикации выбирают, пока объявление ещё не опубликовано.
  const canSchedule = !l || ['pending', 'scheduled', 'rejected'].includes(l.status);
  // Продвижение: когда оплата подключена и объявление ещё можно показать (не продано и не снято).
  const canBoost = boostOn() && (!l || ['active', 'pending', 'scheduled', 'rejected'].includes(l.status));
  st.boost = { xl: false, frame: false, tagsOn: false, tags: [] };
  app.innerHTML = editorPage({ l, src, st, draft, sendLabel, canSchedule, canBoost });
  document.body.classList.add('editing');
  const form = $('#ed');
  // Части редактора общаются через ed: каждая добавляет в него свои функции, вызовы — ed.имя() в момент вызова.
  const ed = { st, l, src, form, sendLabel };
  Object.assign(ed, mediaPart(ed), attrsPart(ed), dealPart(ed), readyPart(ed));

  // Не form.when: у элементов в браузерах появился свой метод when() (Observable API).
  const laterOn = () => canSchedule && !!$('input[name="pub-when"][value="later"]:checked');
  const body = () => ({
    title: ed.isAuto() ? autoTitle(st.sub, st.attrs) : form.title.value.trim(), category: st.category, condition: CONDITION_CATS.has(st.category) ? st.condition : '',
    price: st.negotiable ? '' : ed.priceDigits(), priceUnit: st.priceUnit, city: form.city.value.trim(),
    delivery: form.delivery.checked, description: form.description.value.trim(),
    photos: st.photos.filter((p) => p.file).map((p) => p.file),
    subcategory: st.sub, attrs: st.attrs, metro: $('#metro-field').classList.contains('hidden') ? '' : form.metro.value,
    district: form.district.value.trim(), video: st.video && st.video.file ? st.video.file : '',
    bargain: form.bargain.checked, exchange: form.exchange.checked, vin: st.sub === 'cars' ? st.vin : '',
    publishAt: laterOn() ? mskTs($('#w-day').value, $('#w-time').value) : null
  });
  ed.body = body;
  form.title.oninput = () => { ed.changed(); ed.fetchHintSoon(); };
  form.district.oninput = ed.changed;
  form.description.oninput = ed.changed;
  form.delivery.onchange = ed.changed;
  form.bargain.onchange = ed.changed;
  form.exchange.onchange = ed.changed;
  if (canSchedule) {
    $$('input[name="pub-when"]').forEach((r) => { r.onchange = () => { $('#when-at').classList.toggle('hidden', !laterOn()); ed.changed(); }; });
    $('#w-day').onchange = ed.changed; $('#w-time').onchange = ed.changed;
  }

  // ---------- шаги ----------
  // check — «Далее» не пускает дальше, пока на текущем шаге не заполнено обязательное.
  function goStep(i, check = false) {
    const sid = ED_STEPS[st.step][0];
    if (check && i > st.step && ed.ERR[sid] && ed.ERR[sid](body())) { st.tried = true; ed.changed(); ed.focusErr(sid); return; }
    st.step = i;
    ED_STEPS.forEach(([x], k) => $(`#${x}`).classList.toggle('cur', k === i));
    $$('[data-step]').forEach((x) => { const on = Number(x.dataset.step) === i; x.classList.toggle('cur', on); if (on) x.setAttribute('aria-current', 'step'); else x.removeAttribute('aria-current'); });
    const last = i === ED_STEPS.length - 1;
    $('.ed-dock [data-prev]').classList.toggle('hidden', !i); // 1.55.0: на первом шаге «Назад» нет — «Далее» на всю ширину, без пустого места слева
    $('#dock-next').classList.toggle('hidden', last);
    $('#dock-send').classList.toggle('hidden', !l && !last);
    ed.changed();
    const top = $('.ed-steps').getBoundingClientRect().top + window.scrollY - 84;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }
  $$('[data-next]').forEach((b) => { b.onclick = () => goStep(Math.min(st.step + 1, ED_STEPS.length - 1), true); });
  $$('[data-prev]').forEach((b) => { b.onclick = () => goStep(Math.max(st.step - 1, 0)); });
  $$('[data-step]').forEach((b) => { b.onclick = () => goStep(Number(b.dataset.step), true); });
  const dd = $('#draft-drop');
  if (dd) dd.onclick = () => { draftDrop(); render(); };
  ed.goStep = goStep;

  // ---------- отправка ----------
  let sending = false;
  const submit = async () => {
    if (sending) return;
    if (st.busy) { toast('Подождите, фото ещё загружаются', true); return; }
    if (st.video && st.video.uploading) { toast(`Видео ещё загружается — ${Math.round((st.video.progress || 0) * 100)}%. Подождите немного`, true); return; }
    st.tried = true;
    const b = body();
    const bad = Object.keys(ed.ERR).find((sid) => ed.ERR[sid](b));
    ed.changed();
    if (bad) { goStep(ED_STEPS.findIndex(([sid]) => sid === bad)); ed.focusErr(bad); return; }
    sending = true;
    $$('[data-submit]').forEach((x) => { x.disabled = true; });
    try {
      const r = l ? await api('PATCH', `/api/listings/${l.id}`, b) : await api('POST', '/api/listings', b);
      if (!l) draftDrop();
      const lid = l ? l.id : r.id;
      if (canBoost && boostQuote(st.boost).any) {
        // Объявление сохранено — дальше страница оплаты ЮKassa. Не открылась — продвинуть можно позже из «Моих объявлений».
        try { await boostPay(lid, st.boost); return; } catch (ex) { toast(`Объявление отправлено, но оплата не открылась: ${ex.message}`, true); go(`/l/${lid}`, true); return; }
      }
      toast(b.publishAt ? 'Отправлено на проверку — опубликуем в выбранное время' : 'Отправлено на проверку модератору');
      go(`/l/${lid}`, true);
    } catch (ex) {
      toast(ex.message, true);
      sending = false;
      $$('[data-submit]').forEach((x) => { x.disabled = false; });
    }
  };
  form.onsubmit = (e) => { e.preventDefault(); submit(); };
  $$('[data-submit]').forEach((x) => { x.onclick = submit; });

  setCleanup(() => { document.body.classList.remove('editing'); ed.stopDraft(); if (st.video && st.video.local) URL.revokeObjectURL(st.video.local); st.video = null; });
  ed.setCat(st.category); ed.setCond(st.condition); ed.setUnit(st.priceUnit); ed.setNeg(st.negotiable);
  if (canBoost) bindBoostPicker($('#s-publish'), st.boost, ed.changed);
  ed.renderPhotos(); ed.renderVideo(); ed.loadMetro();
  if (src.district || src.metro || st.video || st.vin || (subOf(st.sub) || { fields: [] }).fields.some((f) => !f.req && st.attrs[f.key] !== undefined)) $('#ed-more').open = true;
  goStep(st.step);
  if (l) ed.fetchHint();
}

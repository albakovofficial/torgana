// Размещение и правка объявления: три шага, фото и видео, характеристики, черновик.
import { $, $$, CONDITION_CATS, NF, S, api, app, attrSummary, dateShort, hasMetro, html, metroOf, plural, price, raw, rub, subOf, subsOf, when } from './core.js';
import { catIc, ic } from './icons.js';
import { autoTitle } from './rules.js';
import { attrChoice, bindAttrChoices, confirmModal, toast } from './ui.js';
import { resizeImage } from './photos.js';
import { card } from './cards.js';
import { go, render, requireAuth, setCleanup, setTitle, viewNotFound } from './router.js';
import { BOOST, bindBoostPicker, boostBusy, boostErr, boostOn, boostPay, boostPicker, boostPrices, boostQuote } from './boost.js';
import { firstMedal, firstName } from './badges.js';

// ================= размещение и редактирование =================
// square — обрезать по центру до квадрата (фото профиля).
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

// ================= новое объявление и правка =================
// Шесть шагов по одному на экране: фото, что продаёте, цена (торг, обмен), где, описание, публикация (сразу или в выбранное время).
// Сверху полоска шагов — можно перейти к любому; «Далее» проверяет обязательное на текущем шаге.
// На компьютере справа — превью карточки, что осталось заполнить и кнопка; на телефоне внизу «‹» и «Далее» вместо нижнего меню.
// Новое объявление пишется в черновик в браузере (tg_draft) вместе с шагом — закрыли страницу, ничего не потеряли.
const UNIT_LABEL = { '': 'за всё', мес: 'в месяц', сутки: 'за сутки', час: 'за час', 'м²': 'за м²', шт: 'за штуку' };
const DESC_TIPS = ['Состояние', 'Комплектация', 'Причина продажи', 'Дефекты', 'Где можно посмотреть'];
// 1.48.0: что написать в описании — под раздел.
const descTips = (cat, sub) => (['cars', 'moto', 'trucks', 'water'].includes(sub) ? ['Обслуживание', 'Вложения', 'ДТП и окрасы', 'Комплектация', 'Причина продажи']
  : sub === 'parts' ? ['Совместимость', 'Состояние', 'Номер детали', 'Причина продажи']
    : ['flats_rent', 'daily'].includes(sub) ? ['Что есть в квартире', 'Условия', 'Коммунальные платежи', 'Транспорт рядом']
      : sub === 'land' ? ['Коммуникации', 'Документы', 'Подъезд', 'Что рядом']
        : cat === 'realty' ? ['Документы', 'Ремонт', 'Что рядом', 'Транспорт рядом', 'Собственники']
          : sub === 'resumes' ? ['Опыт', 'Навыки', 'Образование', 'Пожелания']
            : cat === 'jobs' ? ['Обязанности', 'Требования', 'Условия', 'График']
              : cat === 'services' ? ['Что входит', 'Сроки', 'Опыт', 'Гарантия']
                : cat === 'personal' ? ['Размер по бирке', 'Замеры', 'Материал', 'Состояние']
                  : cat === 'animals' ? ['Характер', 'Прививки', 'Питание', 'Родители']
                    : cat === 'electronics' ? ['Состояние', 'Комплект', 'Гарантия', 'Дефекты', 'Причина продажи'] : DESC_TIPS);
// 1.48.0: советы, что добавить, — под раздел; только то, что правда помогает (без обещаний «в N раз больше просмотров»).
const PHOTO_TIP = { cars: 'салон, приборную панель с пробегом, багажник, колёса', moto: 'с обеих сторон, приборы с пробегом, двигатель', phones: 'включённый экран и корпус со всех сторон',
  laptops: 'включённый экран, клавиатуру, корпус', flats: 'каждую комнату, кухню, санузел, вид из окна', flats_rent: 'каждую комнату, кухню, санузел, вид из окна', daily: 'каждую комнату, кухню, санузел, вид из окна',
  houses: 'дом снаружи, комнаты, участок', women: 'вещь целиком, бирку с размером, детали', men: 'вещь целиком, бирку с размером, детали', shoes: 'пару целиком, подошву, бирку с размером', furniture: 'целиком, детали, размеры рядом с рулеткой' };
const DRAFT_KEY = 'tg_draft';
// Удаление объявления — одно для страницы объявления и «Моих объявлений». С сайта пропадает, переписки остаются (1.42.0).
export async function deleteListing(id) {
  if (!(await confirmModal('Удалить объявление?', 'Объявление пропадёт с сайта, вернуть его нельзя. Переписки с покупателями сохранятся — в них будет пометка «Объявление удалено».', 'Удалить', true))) return false;
  try { await api('DELETE', `/api/listings/${id}`); toast('Объявление удалено'); return true; } catch (e) { toast(e.message, true); return false; }
}

// 1.36: три шага — фото, «что и сколько» (главное), «проверьте и отправьте» (город, описание, остальное свёрнуто).
const ED_STEPS = [['s-photos', 'Фото'], ['s-what', 'Что и сколько'], ['s-publish', 'Отправка']];
// Публикация в выбранное время: дни на 30 вперёд и время с шагом 30 минут — по Москве (UTC+3 круглый год).
const MSK = 3 * 3600 * 1000;
const mskDay = (ts) => new Date(ts + MSK).toISOString().slice(0, 10);
const mskTs = (day, time) => Date.parse(`${day}T${time}:00Z`) - MSK;
const dayLabelLong = (day) => { const t = new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }); return t[0].toUpperCase() + t.slice(1); };
const draftLoad = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return d && Date.now() - d.at < 20 * 3600 * 1000 ? d : null; } catch { return null; } };
const draftSave = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, at: Date.now() })); } catch { /* приватный режим */ } };
const draftDrop = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* нет хранилища */ } };

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
  const units = S.config.priceUnits || [''];
  const sendLabel = l ? 'Сохранить' : 'Отправить на проверку';
  // Время публикации выбирают, пока объявление ещё не опубликовано.
  const canSchedule = !l || ['pending', 'scheduled', 'rejected'].includes(l.status);
  const at0 = src.publishAt && src.publishAt > Date.now() ? src.publishAt : null;
  const tomorrow10 = mskTs(mskDay(Date.now() + 24 * 3600 * 1000), '10:00');
  const days = Array.from({ length: 31 }, (_, i) => mskDay(Date.now() + i * 24 * 3600 * 1000));
  const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
  const atDay = mskDay(at0 || tomorrow10);
  const atClock = new Date((at0 || tomorrow10) + MSK).toISOString().slice(11, 16);
  // Продвижение: когда оплата подключена и объявление ещё можно показать (не продано и не снято).
  const canBoost = boostOn() && (!l || ['active', 'pending', 'scheduled', 'rejected'].includes(l.status));
  const busyBoost = boostBusy(l && l.boost);
  st.boost = { xl: false, frame: false, tagsOn: false, tags: [] };
  const step = (n, sid, title, sub, body) => html`<section class="ed-step" id="${sid}"><div class="ed-step-h"><span class="ed-kick">Шаг ${n} из ${ED_STEPS.length}</span><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div><div class="ed-err" role="alert" hidden></div>${body}
    <div class="ed-nav">${n > 1 ? html`<button type="button" class="btn btn-soft" data-prev>${ic('left', 18, 2)}Назад</button>` : html`<span></span>`}${n < ED_STEPS.length
  ? html`<button type="button" class="btn btn-dark" data-next>Далее${ic('right', 18, 2)}</button>`
  : html`<button type="button" class="btn btn-accent" data-submit>${sendLabel}</button>`}</div></section>`;
  const opt = (name, icon, title, sub, on, id = '') => html`<label class="ed-opt" id="${id || name}-opt"><span class="ed-opt-top"><span class="ed-opt-ic">${ic(icon, 20)}</span><input type="checkbox" ${id ? raw(`id="${id}"`) : raw(`name="${name}"`)} ${on ? raw('checked') : ''}></span><b>${title}</b><small>${sub}</small></label>`;

  app.innerHTML = String(html`<div class="wrap ed">
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
            <div class="ed-icon-input">${ic('pin', 18)}<input id="city" name="city" class="input" data-cities autocomplete="off" value="${src.city || S.user.city || S.city || ''}" placeholder="Начните вводить город"></div></div>
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
  document.body.classList.add('editing');
  const form = $('#ed');
  const fileInput = $('#file');
  const priceDigits = () => form.price.value.replace(/\D/g, '');

  // ---------- фото ----------
  const renderPhotos = () => {
    const box = $('#photos');
    const n = st.photos.length;
    box.innerHTML = String(n ? html`<div class="ed-photos">${st.photos.map((p, i) => html`<div class="ed-photo ${i === 0 ? 'cover' : ''} ${p.loading ? 'loading' : ''}">
        ${p.url ? html`<img src="${p.url}" alt="Фото ${i + 1}">` : ''}
        ${p.loading ? '' : html`${i === 0 ? html`<span class="ed-cover-tag">Обложка</span>` : ''}
          <button type="button" class="ed-ph-btn rm" data-rm="${i}" aria-label="Удалить фото ${i + 1}">${ic('close', 15, 2.2)}</button>
          ${n > 1 ? html`<div class="ed-ph-move">${i > 0 ? html`<button type="button" class="ed-ph-btn" data-mv="${i}" data-d="-1" aria-label="Переместить левее">${ic('left', 15, 2.2)}</button>` : ''}${i > 0 ? html`<button type="button" class="ed-ph-btn txt" data-cover="${i}">Обложка</button>` : ''}${i < n - 1 ? html`<button type="button" class="ed-ph-btn" data-mv="${i}" data-d="1" aria-label="Переместить правее">${ic('right', 15, 2.2)}</button>` : ''}</div>` : ''}`}
      </div>`)}
      ${n < 10 ? html`<button type="button" class="ed-add" data-pick>${ic('plus', 24, 2)}<span>Ещё фото</span><small>${n} из 10</small></button>` : ''}</div>`
      : html`<button type="button" class="ed-drop" data-pick>
        <span class="ed-drop-ic">${ic('camera', 28, 1.7)}</span><b>Добавьте фото</b><span>Нажмите или перетащите сюда · JPG, PNG, WebP</span></button>
      <ul class="ed-photo-tips"><li>${ic('sparkle', 16)}Светлое фото при дневном свете</li><li>${ic('image', 16)}Несколько ракурсов и детали</li><li>${ic('check', 16, 2)}Только ваш товар, без надписей</li></ul>`);
    $$('[data-pick]', box).forEach((b) => { b.onclick = () => fileInput.click(); });
    $$('[data-rm]', box).forEach((b) => { b.onclick = () => { st.photos.splice(Number(b.dataset.rm), 1); changed(); renderPhotos(); }; });
    $$('[data-mv]', box).forEach((b) => { b.onclick = () => { const i = Number(b.dataset.mv); const j = i + Number(b.dataset.d); [st.photos[i], st.photos[j]] = [st.photos[j], st.photos[i]]; changed(); renderPhotos(); }; });
    $$('[data-cover]', box).forEach((b) => { b.onclick = () => { const [p] = st.photos.splice(Number(b.dataset.cover), 1); st.photos.unshift(p); changed(); renderPhotos(); }; });
    renderAi();
  };
  const zone = $('#s-photos');
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('over'); };
  zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); addFiles([...e.dataTransfer.files]); };

  const addFiles = async (files) => {
    const imgs = files.filter((f) => /^image\//.test(f.type)).slice(0, 10 - st.photos.length);
    if (!imgs.length) { if (files.length) toast('Загрузите фото в формате JPG, PNG или WebP', true); return; }
    const slots = imgs.map(() => { const s = { loading: true, url: '' }; st.photos.push(s); return s; });
    renderPhotos();
    st.busy += imgs.length;
    await Promise.all(imgs.map(async (f, i) => {
      const slot = slots[i];
      try {
        const img = await resizeImage(f, 1600, false, 640);
        slot.url = img.data;
        renderPhotos();
        const r = await api('POST', '/api/uploads', img);
        slot.file = r.file; slot.url = r.url; slot.loading = false;
      } catch (e) {
        st.photos.splice(st.photos.indexOf(slot), 1);
        toast(e.message, true);
      } finally {
        st.busy -= 1;
        renderPhotos(); changed();
      }
    }));
    if (!l && !st.aiDone && !form.title.value.trim()) aiFill();
  };
  fileInput.onchange = () => { addFiles([...fileInput.files]); fileInput.value = ''; };

  const renderAi = () => {
    const slot = $('#ai-slot');
    if (!S.config.ai) { slot.innerHTML = ''; return; }
    const ready = st.photos.some((p) => p.file && !p.loading);
    slot.innerHTML = String(html`<div class="ed-ai ${st.aiBusy ? 'busy' : ''}"><span class="ed-ai-ic">${ic('sparkle', 20)}</span><p>${st.aiBusy ? (S.config.aiBy === 'yandex' ? 'Алиса AI смотрит на фото и заполняет объявление…' : 'Смотрим на фото и заполняем объявление…') : st.aiDone ? 'Заполнили по фото — проверьте на следующем шаге.' : ready ? 'Заполним название, категорию, характеристики и описание по первому фото.' : 'Добавьте фото — и мы заполним объявление за вас.'}</p>
      ${st.aiBusy ? '' : html`<button type="button" class="btn ${st.aiDone ? 'btn-soft' : 'btn-accent'} btn-sm" id="ai-btn" ${ready ? '' : raw('disabled')}>${st.aiDone ? 'Ещё раз' : 'Заполнить по фото'}</button>`}</div>`);
    const b = $('#ai-btn');
    if (b) b.onclick = () => aiFill(true);
  };
  // Заполнить по фото: название, категорию, раздел, главные характеристики, состояние, описание.
  // Сам — один раз, когда загрузилось первое фото и название ещё пустое; кнопкой — когда угодно.
  const aiFill = async (manual = false) => {
    const first = st.photos.find((p) => p.file && !p.loading);
    if (!S.config.ai || !first || st.aiBusy) return;
    st.aiBusy = true; renderAi();
    try {
      const r = await api('POST', '/api/ai/suggest', { file: first.file });
      if (r.title && (manual || !form.title.value.trim())) form.title.value = r.title; // у разделов с названием из характеристик оно не нужно, но пусть будет, если раздел сменят
      if (r.description && !form.description.value.trim()) form.description.value = r.description;
      if (r.category && (manual || !st.category)) setCat(r.category);
      if (r.subcategory && (manual || !st.sub)) setSub(r.subcategory);
      if (r.attrs && Object.keys(r.attrs).length) { for (const [k, v] of Object.entries(r.attrs)) if (manual || st.attrs[k] === undefined) st.attrs[k] = v; renderAttrs(); }
      if (r.condition && (manual || !st.condition)) setCond(r.condition);
      if (r.priceHint) showHint(r.priceHint, r.priceHintCount); else fetchHint();
      st.aiDone = true;
      changed();
      if (manual) toast('Готово — проверьте и поправьте при необходимости');
    } catch (e) { if (manual) toast(e.message, true); }
    st.aiBusy = false; renderAi();
  };

  // ---------- видео: одно, до минуты, загрузка частями с продолжением после обрыва ----------
  const MB = 1024 * 1024;
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const videoDuration = (url) => new Promise((done) => {
    const v = document.createElement('video');
    const t = setTimeout(() => done(null), 6000);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { clearTimeout(t); done(Number.isFinite(v.duration) ? v.duration : null); };
    v.onerror = () => { clearTimeout(t); done(null); };
    v.src = url;
  });
  async function putChunk(file, offset, blob) {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(`/api/videos/${file}?offset=${offset}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) { const e = new Error(data.error || 'Не удалось загрузить видео'); e.final = r.status < 500; throw e; }
        return data;
      } catch (e) {
        if (e.final || attempt >= 4) throw e;
        await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1))); // плохая связь — пробуем ещё раз с того же места
      }
    }
  }
  const paintVideoProgress = () => {
    const v = st.video; if (!v || !v.uploading) return;
    const pct = Math.round((v.progress || 0) * 100);
    const b = $('#v-pct'); if (b) b.textContent = `${pct}%`;
    const bar = $('#v-bar'); if (bar) bar.style.width = `${pct}%`;
  };
  const renderVideo = () => {
    const box = $('#video-slot');
    const v = st.video;
    if (!v) {
      box.innerHTML = String(html`<button type="button" class="ed-vadd" data-vpick><span class="ed-vadd-ic">${ic('video', 22, 1.8)}</span>
        <span class="ed-vadd-t"><b>Добавить видео</b><small>До 60 секунд · MP4 или MOV · до 100 МБ</small></span><span class="ed-vadd-plus">${ic('plus', 18, 2.2)}</span></button>`);
    } else {
      const pct = Math.round((v.progress || 0) * 100);
      box.innerHTML = String(html`<div class="ed-video ${v.uploading ? 'loading' : ''}">
        <div class="ed-video-pic"><video src="${v.uploading ? v.local : `${v.url}#t=0.1`}" ${v.uploading ? raw('muted') : raw('controls')} playsinline preload="metadata"></video></div>
        <div class="ed-vinfo">${v.uploading
  ? html`<b>Загружаем видео · <span id="v-pct">${pct}%</span></b><div class="ed-bar-track"><i id="v-bar" style="width:${pct}%"></i></div><small>Можно заполнять дальше — только не закрывайте страницу</small>`
  : html`<b>${ic('check', 16, 2.4)}Видео добавлено</b><small>${v.duration ? `${mmss(v.duration)} · ` : ''}покупатели увидят его после фото</small>
    <button type="button" class="btn btn-soft btn-sm" data-vpick>Заменить</button>`}</div>
        <button type="button" class="ed-ph-btn rm" data-vrm aria-label="Убрать видео">${ic('close', 15, 2.2)}</button>
      </div>`);
    }
    $$('[data-vpick]', box).forEach((b) => { b.onclick = () => $('#vfile').click(); });
    const rm = $('[data-vrm]', box);
    if (rm) rm.onclick = () => { if (st.video && st.video.local) URL.revokeObjectURL(st.video.local); st.video = null; renderVideo(); changed(); };
  };
  async function addVideo(f) {
    if (!/^video\/(mp4|quicktime)$/.test(f.type) && !/\.(mp4|mov|m4v)$/i.test(f.name)) { toast('Видео — в формате MP4 или MOV', true); return; }
    if (f.size > 100 * MB) { toast(`Видео ${Math.round(f.size / MB)} МБ — нужно до 100 МБ. Сократите или сожмите его`, true); return; }
    const local = URL.createObjectURL(f);
    const duration = await videoDuration(local);
    if (duration && duration > 61) { URL.revokeObjectURL(local); toast(`Видео длится ${mmss(duration)} — обрежьте его до минуты`, true); return; }
    if (st.video && st.video.local) URL.revokeObjectURL(st.video.local);
    const v = { local, uploading: true, progress: 0, duration };
    st.video = v; renderVideo(); changed();
    try {
      const s = await api('POST', '/api/videos', { name: f.name, type: f.type, size: f.size, ...(duration ? { duration } : {}) });
      let off = 0;
      while (off < f.size) {
        if (st.video !== v) return; // убрали или заменили
        const r = await putChunk(s.file, off, f.slice(off, off + s.chunk));
        off = r.received; v.progress = off / f.size; paintVideoProgress();
        if (r.ready) { v.file = s.file; v.url = r.url; if (r.duration) v.duration = r.duration; break; }
      }
      if (st.video !== v) return;
      v.uploading = false; URL.revokeObjectURL(local); delete v.local;
      renderVideo(); changed();
    } catch (e) {
      if (st.video === v) { st.video = null; renderVideo(); changed(); }
      toast(e.message, true);
    }
  }
  $('#vfile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) addVideo(f); };

  // ---------- раздел и характеристики ----------
  const renderSubs = () => {
    const subs = subsOf(st.category);
    $('#sub-field').classList.toggle('hidden', !subs.length);
    $('#subs').innerHTML = String(html`${subs.map((x) => html`<button type="button" role="radio" class="chip ${x.id === st.sub ? 'on' : ''}" aria-checked="${x.id === st.sub ? 'true' : 'false'}" data-sub="${x.id}">${x.name}</button>`)}`);
    $$('[data-sub]').forEach((b) => { b.onclick = () => setSub(b.dataset.sub); });
  };
  const fmtAttrInput = (f, v) => (v === undefined || v === null || v === '' ? '' : f.max >= 100000 ? NF.format(Number(v)) : String(v).replace('.', ','));
  // Главные характеристики (req) — на шаге «Что и сколько», остальные — в «Ещё по желанию» на последнем шаге.
  // 1.48.0: модель — поле с подсказками частых моделей выбранной марки. 1.60.1: у машин — только из списка марки:
  // плашками первые восемь (частые), полный список — подсказкой при вводе; не из списка — сразу говорим.
  const modelList = (f) => (f.suggest ? f.suggest[st.attrs.brand] || [] : []);
  const modelOk = (f) => { const v = st.attrs[f.key]; const list = modelList(f); const k = (x) => String(x).toLowerCase().replace(/[\s-]+/g, ''); return !f.fixed || !v || !list.length || list.some((m) => k(m) === k(v)); };
  const modelSug = (f) => { const list = modelList(f); const v = st.attrs[f.key];
    const chips = [...list.slice(0, 8), ...(v && list.slice(8).includes(v) ? [v] : [])];
    return list.length ? html`<div class="av-chips at-sug" role="group" aria-label="Частые модели">${chips.map((o) => html`<button type="button" class="av-chip${o === v ? ' on' : ''}" data-sug="${o}">${o}</button>`)}</div>
      <datalist id="dl-${f.key}">${list.map((o) => html`<option value="${o}"></option>`)}</datalist>
      ${f.fixed ? html`<small class="at-bad${modelOk(f) ? ' hidden' : ''}">Такой модели нет у ${st.attrs.brand} — выберите из списка</small>` : ''}` : ''; };
  const attrField = (f) => {
    const v = st.attrs[f.key];
    if (f.type === 'select') return attrChoice(f, v);
    if (f.type === 'text') {
      return html`<div class="field wide at-text" data-tfield="${f.key}"><label for="at-${f.key}">${f.label}${f.req ? html`<i class="rq">*</i>` : ''}</label>
        <input id="at-${f.key}" class="input" maxlength="${f.max || 40}" autocomplete="off" autocapitalize="sentences" data-akt="${f.key}" list="dl-${f.key}" placeholder="${f.placeholder || ''}" value="${v || ''}">
        <span class="at-sug-box">${modelSug(f)}</span></div>`;
    }
    return html`<div class="field"><label for="at-${f.key}">${f.label}${f.req ? html`<i class="rq">*</i>` : ''}</label><div class="ed-unit-input"><input id="at-${f.key}" class="input" inputmode="${f.key === 'area' || f.key === 'land' ? 'decimal' : 'numeric'}" autocomplete="off" data-akn="${f.key}" data-max="${f.max}" placeholder="${f.key === 'year' ? `например, ${new Date().getFullYear() - 5}` : '—'}" value="${fmtAttrInput(f, v)}">${f.unit ? html`<span>${f.unit}</span>` : ''}</div></div>`;
  };
  const paintAttrs = (box, fields, head) => {
    box.classList.toggle('hidden', !fields.length);
    if (!fields.length) { box.innerHTML = ''; return; }
    // Сначала списки, потом числа; модель — сразу после марки.
    const sorted = [...fields].filter((f) => f.type !== 'text').sort((a, b) => (a.type !== 'select') - (b.type !== 'select'));
    for (const t of fields.filter((f) => f.type === 'text')) { const at = sorted.findIndex((f) => f.key === 'brand'); sorted.splice(at >= 0 ? at + 1 : sorted.findIndex((f) => f.type !== 'select') < 0 ? sorted.length : sorted.findIndex((f) => f.type !== 'select'), 0, t); }
    box.innerHTML = String(html`${head}<div class="ed-attrs-grid">${sorted.map(attrField)}</div>`);
    if (!box.dataset.bound) {
      box.dataset.bound = '1';
      bindAttrChoices(box, { find: (fn) => (subOf(st.sub) || { fields: [] }).fields.find(fn) }, (k) => st.attrs[k], (k, val) => {
        if (val === undefined) delete st.attrs[k]; else st.attrs[k] = val;
        if (k === 'brand') paintSug();
        changed();
      });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sug]'); if (!b) return;
        const wrap = b.closest('[data-tfield]'); const key = wrap.dataset.tfield;
        st.attrs[key] = b.dataset.sug; $('input', wrap).value = b.dataset.sug;
        paintSug(); changed();
      });
    }
    $$('[data-akt]', box).forEach((inp) => {
      inp.oninput = () => { const t = inp.value.replace(/\s+/g, ' ').replace(/^\s/, ''); if (t.trim()) st.attrs[inp.dataset.akt] = t.trim(); else delete st.attrs[inp.dataset.akt]; paintSug(false); changed(); };
    });
    $$('[data-akn]', box).forEach((inp) => {
      inp.oninput = () => {
        const big = Number(inp.dataset.max) >= 100000;
        let t = inp.value.replace(big ? /\D/g : /[^\d,.-]/g, '').replace('.', ',');
        if (big) { t = t.slice(0, 9); inp.value = t ? NF.format(Number(t)) : ''; } else inp.value = t;
        const n = Number(t.replace(/\s/g, '').replace(',', '.'));
        if (t !== '' && Number.isFinite(n)) st.attrs[inp.dataset.akn] = n; else delete st.attrs[inp.dataset.akn];
        changed();
      };
    });
  };
  // Плашки моделей: под выбранную марку; выбранная подсвечена.
  function paintSug(full = true) {
    $$('[data-tfield]').forEach((w) => {
      const f = (subOf(st.sub) || { fields: [] }).fields.find((x) => x.key === w.dataset.tfield);
      if (!f) return;
      const box = $('.at-sug-box', w);
      if (full) box.innerHTML = String(modelSug(f));
      else {
        $$('[data-sug]', box).forEach((b) => b.classList.toggle('on', b.dataset.sug === st.attrs[f.key]));
        const bad = $('.at-bad', box); if (bad) bad.classList.toggle('hidden', modelOk(f));
      }
    });
  }
  const renderAttrs = () => {
    const fields = (subOf(st.sub) || { fields: [] }).fields;
    paintAttrs($('#attrs'), fields.filter((f) => f.req), '');
    paintAttrs($('#attrs-more'), fields.filter((f) => !f.req), html`<div class="ed-attrs-h"><b>Характеристики</b><span>По ним покупатели находят объявление в фильтрах</span></div>`);
    renderVin(); renderDescTips();
  };
  // 1.48.0: название из характеристик — у машин, квартир, телефонов и других разделов, где оно есть (как на Авито).
  const isAuto = () => !!(subOf(st.sub) || {}).auto;
  const renderAuto = () => {
    const on = isAuto();
    $('#title-field').classList.toggle('hidden', on);
    const box = $('#auto-title');
    box.classList.toggle('hidden', !on);
    if (!on) return;
    const t = autoTitle(st.sub, st.attrs);
    const need = (subOf(st.sub) || { fields: [] }).fields.filter((f) => f.req && st.attrs[f.key] === undefined).map((f) => f.label.toLowerCase());
    box.innerHTML = String(html`<span class="at-ic">${ic('sparkle', 18, 2)}</span><div class="at-t"><small>Название объявления</small>
      ${t ? html`<b>${t}</b>` : html`<b class="at-wait">Появится, когда укажете ${need.length ? need.join(', ') : 'главное'}</b>`}
      <span>Собирается из характеристик — только главное. Поменяете их — название обновится.</span></div>`);
  };
  // 1.48.0: VIN или номер кузова — у машин. В объявлении виден частично, целиком — по кнопке «Показать».
  const LAT = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };
  const vinNorm = (v) => { let t = String(v || '').toUpperCase().replace(/\s/g, '').replace(/[АВЕКМНОРСТХУ]/g, (c) => LAT[c]).replace(/[^A-Z0-9-]/g, '').slice(0, 17); if (t.length === 17) t = t.replace(/O|Q/g, '0').replace(/I/g, '1'); return t; };
  const vinOk = (v) => (v.length === 17 ? /^[A-HJ-NPR-Z0-9]{17}$/.test(v) : /^[A-Z0-9-]{6,17}$/.test(v) && /\d{4}/.test(v));
  const vinState = (v) => (!v ? '' : v.length === 17 && vinOk(v) ? '17 из 17 · формат верный' : vinOk(v) ? `${v.length} из 17 — если это номер кузова, всё верно` : /[IOQ]/.test(v) ? 'В VIN нет букв I, O и Q' : `${v.length} из 17`);
  function renderVin() {
    const box = $('#vin-slot');
    if (st.sub !== 'cars') { box.innerHTML = ''; return; }
    if ($('#vin', box)) return;
    box.innerHTML = String(html`<div class="field ed-vin"><label for="vin">VIN или номер кузова <small class="muted">— по желанию</small></label>
      <div class="ed-vin-in">${ic('shield', 18, 2)}<input id="vin" class="input" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="17 латинских букв и цифр" value="${st.vin}"></div>
      <span class="ed-vin-st" id="vin-st" aria-live="polite"></span>
      <span class="help">В объявлении будет видна часть VIN, целиком — по кнопке «Показать» для вошедших на Торгану. По VIN покупатель сам проверит историю машины.</span></div>`);
    const inp = $('#vin', box);
    const paint = () => { const v = st.vin; const ok = !v || vinOk(v); const el = $('#vin-st'); el.textContent = vinState(v); el.classList.toggle('ok', !!v && ok); el.classList.toggle('bad', !!v && !ok && v.length >= 17); };
    inp.oninput = () => { const pos = inp.selectionStart; const before = inp.value.length; st.vin = vinNorm(inp.value); inp.value = st.vin; try { const d = inp.value.length - before; inp.setSelectionRange(pos + d, pos + d); } catch { /* нет выделения */ } paint(); changed(); };
    paint();
  }
  // Что написать в описании — плашки под раздел.
  let tipsFor = null;
  function renderDescTips() {
    const key = `${st.category}|${st.sub}`;
    if (tipsFor === key) return;
    tipsFor = key;
    $('#desc-tips').innerHTML = String(html`${descTips(st.category, st.sub).map((t) => html`<button type="button" class="chip" data-tip="${t}">${ic('plus', 14, 2.2)}${t}</button>`)}`);
  }
  // 1.48.0: советы — что ещё добавить. Только правда: про фильтры, VIN, фото; без обещаний просмотров.
  const adviceOf = (b) => {
    const out = [];
    const x = subOf(b.subcategory);
    const n = b.photos.length;
    if (n > 0 && n < 3) out.push(['camera', `Добавьте ещё фото — ${PHOTO_TIP[b.subcategory] || 'с разных сторон и детали крупно'}`, 's-photos', 'photos']);
    if (b.subcategory === 'cars' && !b.vin) out.push(['shield', 'Укажите VIN — покупатель сможет сам проверить историю машины', 's-what', 'vin']);
    if (!b.price && !st.negotiable) out.push(['tag', 'Укажите цену — без неё объявление не покажется тем, кто ищет с фильтром по цене', 's-what', 'price']);
    const lc = (t) => (/^[А-ЯЁA-Z]{2}/.test(t) ? t : t[0].toLowerCase() + t.slice(1)); // «ДТП» — как есть
    if (b.description.length < 20) out.push(['edit', `Расскажите в описании: ${descTips(b.category, b.subcategory).slice(0, 3).map(lc).join(', ')}`, 's-what', 'desc']);
    const opt = x ? x.fields.filter((f) => !f.req && b.attrs[f.key] === undefined) : [];
    if (opt.length >= 2) out.push(['filter', `Заполните ${opt.slice(0, 3).map((f) => f.label.toLowerCase()).join(', ')} — по характеристикам ищут в фильтрах`, 's-what', 'more']);
    if (hasMetro(b.city) && !b.metro) out.push(['pin', 'Укажите метро — по нему ищут в фильтрах и на карте', 's-what', 'metro']);
    return out.slice(0, 3);
  };
  const renderAdvice = (b) => {
    const list = adviceOf(b);
    for (const id of ['advice', 'advice-side']) {
      const box = $(`#${id}`); if (!box) continue;
      box.classList.toggle('hidden', !list.length);
      box.innerHTML = list.length ? String(html`<div class="adv-h">${ic('sparkle', 16, 2)}<b>Советы</b><span>что ещё добавить</span></div>
        <ul>${list.map(([icon, t, sid, what]) => html`<li><span class="adv-ic">${ic(icon, 16, 2)}</span><span class="adv-t">${t}</span><button type="button" class="adv-go" data-adv="${sid}|${what}" aria-label="Перейти">${ic('right', 16, 2.2)}</button></li>`)}</ul>`) : '';
    }
  };
  $('.ed').addEventListener('click', (e) => {
    const b = e.target.closest('[data-adv]'); if (!b) return;
    const [sid, what] = b.dataset.adv.split('|');
    goStep(ED_STEPS.findIndex(([x]) => x === sid));
    const more = $('#ed-more');
    if (['vin', 'more', 'metro'].includes(what) && more) more.open = true;
    const el = what === 'vin' ? $('#vin') : what === 'price' ? form.price : what === 'desc' ? form.description : what === 'metro' ? form.metro : what === 'more' ? $('#attrs-more') : what === 'photos' ? $('[data-pick]') : null;
    if (el) setTimeout(() => { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el.focus) el.focus({ preventScroll: true }); }, 80);
  });
  const setSub = (id) => {
    if (st.sub !== id) {
      // Общие поля (например, «Год выпуска») сохраняем, лишние — убираем.
      const x = subOf(id);
      st.attrs = Object.fromEntries(Object.entries(st.attrs).filter(([k]) => x && x.fields.some((f) => f.key === k)));
    }
    st.sub = id;
    renderSubs(); renderAttrs(); changed();
  };

  // ---------- метро ----------
  let metroWanted = src.metro ? (typeof src.metro === 'string' ? src.metro : src.metro.name) : '';
  const loadMetro = async () => {
    const city = form.city.value.trim();
    const field = $('#metro-field');
    if (!hasMetro(city)) { field.classList.add('hidden'); form.metro.value = ''; return; }
    const list = await metroOf(city);
    if (form.city.value.trim() !== city) return;
    if (form.metro.value) metroWanted = form.metro.value;
    form.metro.innerHTML = String(html`<option value="">Не указывать</option>${list.map((m) => html`<option value="${m.name}" data-color="${m.color}" data-line="${m.line}" ${m.name === metroWanted ? raw('selected') : ''}>${m.name}</option>`)}`);
    field.classList.toggle('hidden', !list.length);
    changed();
  };
  let metroTimer = null;
  form.metro.onchange = () => { metroWanted = form.metro.value; changed(); };

  // ---------- категория, состояние, цена ----------
  const setCat = (c) => {
    st.category = c;
    $$('[data-cat]').forEach((b) => { const on = b.dataset.cat === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    $('#cond-field').classList.toggle('hidden', !CONDITION_CATS.has(c));
    if (st.sub && !subsOf(c).some((x) => x.id === st.sub)) { st.sub = ''; st.attrs = {}; }
    renderSubs(); renderAttrs();
    fetchHint(); changed();
  };
  const setCond = (c) => { st.condition = c; $$('[data-cond]').forEach((b) => { const on = b.dataset.cond === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); changed(); };
  const setUnit = (u) => { st.priceUnit = u; $$('[data-unit]').forEach((b) => { const on = b.dataset.unit === u; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); changed(); };
  const setNeg = (on) => { st.negotiable = on; $('#neg').checked = on; form.price.disabled = on; if (on) form.price.value = ''; $('.ed-money').classList.toggle('off', on); changed(); };
  $$('[data-cat]').forEach((b) => { b.onclick = () => setCat(b.dataset.cat); });
  $$('[data-cond]').forEach((b) => { b.onclick = () => setCond(b.dataset.cond); });
  $$('[data-unit]').forEach((b) => { b.onclick = () => { setUnit(b.dataset.unit); fetchHint(); }; });
  $('#neg').onchange = (e) => setNeg(e.target.checked);
  form.price.oninput = () => {
    const d = priceDigits().slice(0, 11);
    form.price.value = d ? NF.format(Number(d)) : '';
    changed();
  };

  const showHint = (n, count) => {
    const el = $('#price-hint');
    el.innerHTML = String(html`<span class="ed-hint-txt">${ic('tag', 16, 2)}<span>Похожие продаются примерно за <b>${NF.format(n)} ₽</b>${count ? html` · ${count} ${plural(count, 'объявление', 'объявления', 'объявлений')}` : ''}</span></span>
      <button type="button" class="btn btn-soft btn-sm" data-use="${n}">Поставить эту цену</button>`);
    el.classList.remove('hidden');
    $('[data-use]', el).onclick = () => { setNeg(false); form.price.value = NF.format(n); changed(); };
  };
  let hintTimer = null;
  const fetchHintSoon = () => { clearTimeout(hintTimer); hintTimer = setTimeout(fetchHint, 600); };
  async function fetchHint() {
    const t = body().title;
    if (!st.category || t.length < 3) { $('#price-hint').classList.add('hidden'); return; }
    try {
      const r = await api('GET', `/api/price-hint?${new URLSearchParams({ category: st.category, title: t, unit: st.priceUnit })}`);
      if (r.hint) showHint(r.hint, r.count); else $('#price-hint').classList.add('hidden');
    } catch { /* необязательно */ }
  }

  // ---------- описание ----------
  $('#desc-tips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tip]'); if (!b) return;
    const ta = form.description;
    const v = ta.value.replace(/\s+$/, '');
    ta.value = `${v}${v ? '\n' : ''}${b.dataset.tip}: `;
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    changed();
  });

  // ---------- готовность, превью, черновик ----------
  // Не form.when: у элементов в браузерах появился свой метод when() (Observable API).
  const laterOn = () => canSchedule && !!$('input[name="pub-when"][value="later"]:checked');
  const body = () => ({
    title: isAuto() ? autoTitle(st.sub, st.attrs) : form.title.value.trim(), category: st.category, condition: CONDITION_CATS.has(st.category) ? st.condition : '',
    price: st.negotiable ? '' : priceDigits(), priceUnit: st.priceUnit, city: form.city.value.trim(),
    delivery: form.delivery.checked, description: form.description.value.trim(),
    photos: st.photos.filter((p) => p.file).map((p) => p.file),
    subcategory: st.sub, attrs: st.attrs, metro: $('#metro-field').classList.contains('hidden') ? '' : form.metro.value,
    district: form.district.value.trim(), video: st.video && st.video.file ? st.video.file : '',
    bargain: form.bargain.checked, exchange: form.exchange.checked, vin: st.sub === 'cars' ? st.vin : '',
    publishAt: laterOn() ? mskTs($('#w-day').value, $('#w-time').value) : null
  });
  // Заполнены ли главные характеристики (те, что видны в карточке).
  const attrsDone = (b) => { const x = subOf(b.subcategory); return !x || !x.summary.length || x.summary.every((k) => b.attrs[k] !== undefined); };
  // Главные характеристики раздела (req) — обязательны, как на сервере.
  const attrsMissing = (b) => ((subOf(b.subcategory) || { fields: [] }).fields.filter((f) => f.req && b.attrs[f.key] === undefined));
  const attrsReq = () => !!(subOf(st.sub) || { fields: [] }).fields.some((f) => f.req);
  const CHECK = [
    ['s-photos', 'Фото', (b) => b.photos.length > 0, false],
    ['s-what', 'Название', (b) => b.title.length >= 3, true],
    ['s-what', 'Категория', (b) => !!b.category, true],
    ['s-what', 'Раздел', (b) => !!b.subcategory || (!!b.category && !subsOf(b.category).length), true],
    ['s-what', 'Характеристики', (b) => !!b.subcategory && !attrsMissing(b).length && attrsDone(b), attrsReq],
    ['s-what', 'Цена', (b) => !!b.price || st.negotiable, false],
    ['s-what', 'Город', (b) => b.city.length >= 2, true],
    ['s-what', 'Описание', (b) => b.description.length >= 20, false]
  ];
  const ERR = {
    's-what': (b) => (b.title.length < 3 && !isAuto() ? 'Напишите название — хотя бы пару слов.' : b.vin && !vinOk(b.vin) ? 'Проверьте VIN: 17 латинских букв и цифр без I, O, Q или номер кузова — либо оставьте поле пустым.' : !b.category ? 'Выберите категорию.' : !b.subcategory && subsOf(b.category).length ? 'Выберите раздел — так объявление попадёт в нужные фильтры.'
      : (subOf(b.subcategory) || { fields: [] }).fields.some((f) => f.fixed && !modelOk(f)) ? `Выберите модель ${st.attrs.brand} из списка.`
      : attrsMissing(b).length ? `Укажите: ${attrsMissing(b).map((f) => f.label.toLowerCase()).join(', ')}.` : b.city.length < 2 ? 'Укажите город.' : ''),
    's-publish': (b) => (b.publishAt !== null && b.publishAt < Date.now() + 5 * 60 * 1000 ? 'Выберите время позже — хотя бы через несколько минут.' : boostErr(st.boost))
  };
  let saveTimer = null;
  function changed() {
    const b = body();
    $('#title-count').textContent = `${form.title.value.length}/80`;
    renderAuto(); renderAdvice(b);
    if (isAuto() && b.title !== st.autoT) { st.autoT = b.title; setTimeout(() => fetchHintSoon(), 0); } // цена похожих — по новому названию
    $('#desc-count').textContent = `${form.description.value.length}/4000`;
    const done = CHECK.filter((c) => c[2](b)).length;
    const pct = Math.round((done / CHECK.length) * 100);
    const reqOf = (c) => (typeof c[3] === 'function' ? c[3]() : c[3]);
    const missing = CHECK.filter((c) => reqOf(c) && !c[2](b)).map((c) => c[1].toLowerCase());
    const soft = CHECK.filter((c) => !reqOf(c) && !c[2](b)).map((c) => c[1].toLowerCase());
    $('#ready-n').textContent = `Заполнено на ${pct}%`;
    $('#ready-t').textContent = missing.length ? `осталось: ${missing.join(', ')}` : soft.length ? 'можно отправлять' : 'всё готово';
    $('#ready-bar').style.width = `${pct}%`;
    $('#check').innerHTML = String(html`${CHECK.map((c) => { const [sid, t, ok] = c; return html`<li class="${ok(b) ? 'ok' : ''}"><a href="#${sid}" data-goto="${sid}">${ic(ok(b) ? 'check' : 'plus', 15, 2.4)}${t}${reqOf(c) ? '*' : ''}</a></li>`; })}`);
    $$('[data-goto]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); goStep(ED_STEPS.findIndex(([sid]) => sid === a.dataset.goto)); }; });
    // Шаг готов, если всё на нём заполнено; последний — когда готово обязательное.
    $$('[data-step]').forEach((x) => {
      const sid = ED_STEPS[Number(x.dataset.step)][0];
      const own = CHECK.filter((c) => c[0] === sid);
      x.classList.toggle('done', sid === 's-publish' ? !missing.length : own.length ? own.every((c) => c[2](b)) : false);
    });
    $('#bargain-opt').classList.toggle('hidden', st.negotiable); // без цены торговаться не о чем
    const first = st.photos.find((p) => p.url && !p.loading);
    const pb = st.boost;
    const ready = st.photos.filter((p) => p.url && !p.loading);
    const prevBoost = pb.xl || pb.frame || pb.tags.length ? { xl: pb.xl, frame: pb.frame, tags: pb.tags, photos: ready.slice(1, 3).map((p) => p.url), more: Math.max(0, ready.length - 3), desc: b.description.replace(/\s+/g, ' ').slice(0, 180) } : null;
    $('#preview').innerHTML = String(card({ id: 0, title: b.title || 'Название объявления', price: b.price ? Number(b.price) : null, priceUnit: b.priceUnit, city: b.city || 'Город', createdAt: Date.now(), photo: first ? first.url : null, delivery: b.delivery, exchange: b.exchange,
      summary: attrSummary(b.subcategory, b.attrs), metro: b.metro, hasVideo: !!st.video, boost: prevBoost }));
    const q = boostQuote(pb);
    $$('[data-submit]').forEach((x) => { const t = x.id === 'dock-send' ? (l ? 'Сохранить' : 'На проверку') : sendLabel; x.textContent = q.any ? `${t} · ${rub(q.amount)}` : t; });
    const pt = $('#paid-terms'); if (pt) pt.classList.toggle('hidden', !q.any);
    const moreN = [b.metro, b.district, b.video].filter(Boolean).length + (subOf(b.subcategory) || { fields: [] }).fields.filter((f) => !f.req && b.attrs[f.key] !== undefined).length;
    $('#more-sub').textContent = moreN ? `заполнено: ${moreN} · можно добавить ещё` : 'метро, район, характеристики, видео — по желанию';
    renderReview(b);
    const eb = $('#ed-boost');
    if (eb) { if (q.any) eb.open = true; eb.classList.toggle('on', q.any); const es = $('#eb-sum'); es.textContent = q.any ? rub(q.amount) : es.dataset.from; }
    if (st.tried) for (const sid of Object.keys(ERR)) showErr(sid, ERR[sid](b));
    const has = b.title || b.photos.length || b.description || b.price;
    if (!l && !has) draftDrop();
    if (!l && has) { clearTimeout(saveTimer); saveTimer = setTimeout(() => draftSave({ ...b, price: b.price, negotiable: st.negotiable, step: st.step, photos: st.photos.filter((p) => p.file).map((p) => ({ file: p.file, url: p.url })), video: st.video && st.video.file ? { file: st.video.file, url: st.video.url, duration: st.video.duration } : null }), 400); }
  }
  // Шаг «Отправка»: объявление целиком — как увидят покупатели, с переходом к правке.
  const renderReview = (b) => {
    const box = $('#review'); if (!box) return;
    const ph = st.photos.filter((p) => p.url && !p.loading);
    const x = subOf(b.subcategory);
    const kv = [...(x ? x.fields.filter((f) => b.attrs[f.key] !== undefined).map((f) => [f.label, `${typeof b.attrs[f.key] === 'number' ? NF.format(b.attrs[f.key]) : b.attrs[f.key]}${f.unit ? ` ${f.unit}` : ''}`]) : []), ...(b.vin ? [['VIN', b.vin]] : [])];
    const deal = [b.bargain && !st.negotiable && 'Торг', b.exchange && 'Обмен', b.delivery && 'Доставка'].filter(Boolean);
    const cat = S.config.categories.find((c) => c.id === b.category);
    box.innerHTML = String(html`<div class="rv-media">${ph.length ? html`<div class="rv-main"><img src="${ph[0].url}" alt=""></div>${ph.length > 1 ? html`<div class="rv-strip">${ph.slice(1, 5).map((p, k) => html`<span><img src="${p.url}" alt="">${k === 3 && ph.length > 5 ? html`<em>+${ph.length - 5}</em>` : ''}</span>`)}</div>` : ''}` : html`<button type="button" class="rv-nophoto" data-rv="0">${ic('camera', 26, 1.7)}<b>Без фото</b><span>Объявления с фото смотрят в разы чаще — добавить</span></button>`}${st.video ? html`<span class="rv-vid">${ic('play', 12, 0)}Видео</span>` : ''}</div>
      <div class="rv-body">
        <div class="rv-top"><b class="rv-price">${b.price ? price(Number(b.price), b.priceUnit) : 'Цена договорная'}</b><button type="button" class="rv-edit" data-rv="1">${ic('edit', 15, 2)}Изменить</button></div>
        <h3>${b.title || 'Без названия'}</h3>
        <span class="rv-where">${ic('pin', 15, 2)}${b.city || 'Город не указан'}${b.metro ? ` · м. ${b.metro}` : ''}${b.district ? ` · ${b.district}` : ''}</span>
        ${cat ? html`<span class="rv-cat">${cat.name}${x ? ` › ${x.name}` : ''}${CONDITION_CATS.has(b.category) && b.condition ? ` · ${b.condition === 'new' ? 'новое' : 'б/у'}` : ''}</span>` : ''}
        ${deal.length ? html`<div class="rv-tags">${deal.map((t) => html`<span>${t}</span>`)}</div>` : ''}
        ${kv.length ? html`<dl class="rv-kv">${kv.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ''}
        <p class="rv-desc ${b.description ? '' : 'empty'}">${b.description || 'Описание не добавлено — по желанию, но с ним продают быстрее.'}</p>
      </div>`);
    $$('[data-rv]', box).forEach((x2) => { x2.onclick = () => goStep(Number(x2.dataset.rv)); });
  };
  const showErr = (sid, msg) => { const s = $(`#${sid}`); s.classList.toggle('bad', !!msg); const e = $('.ed-err', s); e.hidden = !msg; e.innerHTML = msg ? String(html`${ic('warn', 16, 2)}${msg}`) : ''; };
  form.title.oninput = () => { changed(); fetchHintSoon(); };
  form.city.oninput = () => { changed(); clearTimeout(metroTimer); metroTimer = setTimeout(loadMetro, 300); };
  form.district.oninput = changed;
  form.description.oninput = changed;
  form.delivery.onchange = changed;
  form.bargain.onchange = changed;
  form.exchange.onchange = changed;
  if (canSchedule) {
    $$('input[name="pub-when"]').forEach((r) => { r.onchange = () => { $('#when-at').classList.toggle('hidden', !laterOn()); changed(); }; });
    $('#w-day').onchange = changed; $('#w-time').onchange = changed;
  }

  // ---------- шаги ----------
  const focusErr = (sid) => {
    const b = body();
    const miss = sid === 's-what' && b.subcategory ? attrsMissing(b)[0] : null;
    const f = sid === 's-what' && b.title.length < 3 && !isAuto() ? form.title : sid === 's-what' && b.vin && !vinOk(b.vin) ? $('#vin') : sid === 's-what' && b.category && !b.subcategory ? $('[data-sub]')
      : miss ? $(`#at-${miss.key}`) || $(`[data-field="${miss.key}"] button`) : sid === 's-what' && b.city.length < 2 ? form.city : sid === 's-publish' ? $('#w-time + .pick-btn') : null;
    if (f) setTimeout(() => { f.focus({ preventScroll: true }); if (miss) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
  };
  // check — «Далее» не пускает дальше, пока на текущем шаге не заполнено обязательное.
  function goStep(i, check = false) {
    const sid = ED_STEPS[st.step][0];
    if (check && i > st.step && ERR[sid] && ERR[sid](body())) { st.tried = true; changed(); focusErr(sid); return; }
    st.step = i;
    ED_STEPS.forEach(([x], k) => $(`#${x}`).classList.toggle('cur', k === i));
    $$('[data-step]').forEach((x) => { const on = Number(x.dataset.step) === i; x.classList.toggle('cur', on); if (on) x.setAttribute('aria-current', 'step'); else x.removeAttribute('aria-current'); });
    const last = i === ED_STEPS.length - 1;
    $('.ed-dock [data-prev]').classList.toggle('hidden', !i); // 1.55.0: на первом шаге «Назад» нет — «Далее» на всю ширину, без пустого места слева
    $('#dock-next').classList.toggle('hidden', last);
    $('#dock-send').classList.toggle('hidden', !l && !last);
    changed();
    const top = $('.ed-steps').getBoundingClientRect().top + window.scrollY - 84;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }
  $$('[data-next]').forEach((b) => { b.onclick = () => goStep(Math.min(st.step + 1, ED_STEPS.length - 1), true); });
  $$('[data-prev]').forEach((b) => { b.onclick = () => goStep(Math.max(st.step - 1, 0)); });
  $$('[data-step]').forEach((b) => { b.onclick = () => goStep(Number(b.dataset.step), true); });
  const dd = $('#draft-drop');
  if (dd) dd.onclick = () => { draftDrop(); render(); };

  // ---------- отправка ----------
  let sending = false;
  const submit = async () => {
    if (sending) return;
    if (st.busy) { toast('Подождите, фото ещё загружаются', true); return; }
    if (st.video && st.video.uploading) { toast(`Видео ещё загружается — ${Math.round((st.video.progress || 0) * 100)}%. Подождите немного`, true); return; }
    st.tried = true;
    const b = body();
    const bad = Object.keys(ERR).find((sid) => ERR[sid](b));
    changed();
    if (bad) { goStep(ED_STEPS.findIndex(([sid]) => sid === bad)); focusErr(bad); return; }
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

  setCleanup(() => { document.body.classList.remove('editing'); clearTimeout(saveTimer); if (st.video && st.video.local) URL.revokeObjectURL(st.video.local); st.video = null; });
  setCat(st.category); setCond(st.condition); setUnit(st.priceUnit); setNeg(st.negotiable);
  if (canBoost) bindBoostPicker($('#s-publish'), st.boost, changed);
  renderPhotos(); renderVideo(); loadMetro();
  if (src.district || src.metro || st.video || st.vin || (subOf(st.sub) || { fields: [] }).fields.some((f) => !f.req && st.attrs[f.key] !== undefined)) $('#ed-more').open = true;
  goStep(st.step);
  if (l) fetchHint();
}

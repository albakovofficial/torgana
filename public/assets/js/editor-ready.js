// Редактор объявления: что заполнено и чего не хватает, советы, ошибки шагов, превью карточки, шаг «Отправка» и черновик.
import { $, $$, CONDITION_CATS, NF, S, attrSummary, hasMetro, html, price, rub, subOf, subsOf } from './core.js';
import { ic } from './icons.js';
import { vinOk } from './rules.js';
import { card } from './cards.js';
import { boostErr, boostQuote } from './boost.js';
import { descTips } from './editor-attrs.js';

// 1.36: три шага — фото, «что и сколько» (главное), «проверьте и отправьте» (город, описание, остальное свёрнуто).
export const ED_STEPS = [['s-photos', 'Фото'], ['s-what', 'Что и сколько'], ['s-publish', 'Отправка']];
// Новое объявление пишется в черновик в браузере (tg_draft) вместе с шагом — закрыли страницу, ничего не потеряли.
const DRAFT_KEY = 'tg_draft';
export const draftLoad = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return d && Date.now() - d.at < 20 * 3600 * 1000 ? d : null; } catch { return null; } };
const draftSave = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, at: Date.now() })); } catch { /* приватный режим */ } };
export const draftDrop = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* нет хранилища */ } };
// 1.48.0: советы, что добавить, — под раздел; только то, что правда помогает (без обещаний «в N раз больше просмотров»).
const PHOTO_TIP = { cars: 'салон, приборную панель с пробегом, багажник, колёса', moto: 'с обеих сторон, приборы с пробегом, двигатель', phones: 'включённый экран и корпус со всех сторон',
  laptops: 'включённый экран, клавиатуру, корпус', flats: 'каждую комнату, кухню, санузел, вид из окна', flats_rent: 'каждую комнату, кухню, санузел, вид из окна', daily: 'каждую комнату, кухню, санузел, вид из окна',
  houses: 'дом снаружи, комнаты, участок', women: 'вещь целиком, бирку с размером, детали', men: 'вещь целиком, бирку с размером, детали', shoes: 'пару целиком, подошву, бирку с размером', furniture: 'целиком, детали, размеры рядом с рулеткой' };

export function readyPart(ed) {
  const { st, form, l, sendLabel } = ed;
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
    ed.goStep(ED_STEPS.findIndex(([x]) => x === sid));
    const more = $('#ed-more');
    if (['vin', 'more', 'metro'].includes(what) && more) more.open = true;
    const el = what === 'vin' ? $('#vin') : what === 'price' ? form.price : what === 'desc' ? form.description : what === 'metro' ? form.metro : what === 'more' ? $('#attrs-more') : what === 'photos' ? $('[data-pick]') : null;
    if (el) setTimeout(() => { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el.focus) el.focus({ preventScroll: true }); }, 80);
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
    's-what': (b) => (b.title.length < 3 && !ed.isAuto() ? 'Напишите название — хотя бы пару слов.' : b.vin && !vinOk(b.vin) ? 'Проверьте VIN: 17 латинских букв и цифр без I, O, Q или номер кузова — либо оставьте поле пустым.' : !b.category ? 'Выберите категорию.' : !b.subcategory && subsOf(b.category).length ? 'Выберите раздел — так объявление попадёт в нужные фильтры.'
      : (subOf(b.subcategory) || { fields: [] }).fields.some((f) => f.fixed && !ed.modelOk(f)) ? `Выберите модель ${st.attrs.brand} из списка.`
      : attrsMissing(b).length ? `Укажите: ${attrsMissing(b).map((f) => f.label.toLowerCase()).join(', ')}.` : b.city.length < 2 ? 'Укажите город.' : ''),
    's-publish': (b) => (b.publishAt !== null && b.publishAt < Date.now() + 5 * 60 * 1000 ? 'Выберите время позже — хотя бы через несколько минут.' : boostErr(st.boost))
  };
  let saveTimer = null;
  function changed() {
    const b = ed.body();
    $('#title-count').textContent = `${form.title.value.length}/80`;
    ed.renderAuto(); renderAdvice(b);
    if (ed.isAuto() && b.title !== st.autoT) { st.autoT = b.title; setTimeout(() => ed.fetchHintSoon(), 0); } // цена похожих — по новому названию
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
    $$('[data-goto]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); ed.goStep(ED_STEPS.findIndex(([sid]) => sid === a.dataset.goto)); }; });
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
    $$('[data-rv]', box).forEach((x2) => { x2.onclick = () => ed.goStep(Number(x2.dataset.rv)); });
  };
  const showErr = (sid, msg) => { const s = $(`#${sid}`); s.classList.toggle('bad', !!msg); const e = $('.ed-err', s); e.hidden = !msg; e.innerHTML = msg ? String(html`${ic('warn', 16, 2)}${msg}`) : ''; };
  const focusErr = (sid) => {
    const b = ed.body();
    const miss = sid === 's-what' && b.subcategory ? attrsMissing(b)[0] : null;
    const f = sid === 's-what' && b.title.length < 3 && !ed.isAuto() ? form.title : sid === 's-what' && b.vin && !vinOk(b.vin) ? $('#vin') : sid === 's-what' && b.category && !b.subcategory ? $('[data-sub]')
      : miss ? $(`#at-${miss.key}`) || $(`[data-field="${miss.key}"] button`) : sid === 's-what' && b.city.length < 2 ? form.city : sid === 's-publish' ? $('#w-time + .pick-btn') : null;
    if (f) setTimeout(() => { f.focus({ preventScroll: true }); if (miss) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
  };
  const stopDraft = () => clearTimeout(saveTimer);
  return { changed, ERR, focusErr, stopDraft };
}

// Редактор объявления: раздел и характеристики, название из характеристик, VIN, подсказки «что написать».
import { $, $$, NF, html, subOf, subsOf } from './core.js';
import { ic } from './icons.js';
import { autoTitle, vinNorm, vinOk } from './rules.js';
import { attrChoice, bindAttrChoices } from './ui.js';

const DESC_TIPS = ['Состояние', 'Комплектация', 'Причина продажи', 'Дефекты', 'Где можно посмотреть'];
// 1.48.0: что написать в описании — под раздел.
export const descTips = (cat, sub) => (['cars', 'moto', 'trucks', 'water'].includes(sub) ? ['Обслуживание', 'Вложения', 'ДТП и окрасы', 'Комплектация', 'Причина продажи']
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

export function attrsPart(ed) {
  const { st } = ed;
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
        ed.changed();
      });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sug]'); if (!b) return;
        const wrap = b.closest('[data-tfield]'); const key = wrap.dataset.tfield;
        st.attrs[key] = b.dataset.sug; $('input', wrap).value = b.dataset.sug;
        paintSug(); ed.changed();
      });
    }
    $$('[data-akt]', box).forEach((inp) => {
      inp.oninput = () => { const t = inp.value.replace(/\s+/g, ' ').replace(/^\s/, ''); if (t.trim()) st.attrs[inp.dataset.akt] = t.trim(); else delete st.attrs[inp.dataset.akt]; paintSug(false); ed.changed(); };
    });
    $$('[data-akn]', box).forEach((inp) => {
      inp.oninput = () => {
        const big = Number(inp.dataset.max) >= 100000;
        let t = inp.value.replace(big ? /\D/g : /[^\d,.-]/g, '').replace('.', ',');
        if (big) { t = t.slice(0, 9); inp.value = t ? NF.format(Number(t)) : ''; } else inp.value = t;
        const n = Number(t.replace(/\s/g, '').replace(',', '.'));
        if (t !== '' && Number.isFinite(n)) st.attrs[inp.dataset.akn] = n; else delete st.attrs[inp.dataset.akn];
        ed.changed();
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
  // Пока набирают: лишние знаки не даём ввести, не длиннее 17; дальше — общее правило VIN (rules.js).
  const vinTyped = (v) => vinNorm(String(v).toUpperCase().replace(/[^A-Z0-9АВЕКМНОРСТХУ-]/g, '').slice(0, 17));
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
    inp.oninput = () => { const pos = inp.selectionStart; const before = inp.value.length; st.vin = vinTyped(inp.value); inp.value = st.vin; try { const d = inp.value.length - before; inp.setSelectionRange(pos + d, pos + d); } catch { /* нет выделения */ } paint(); ed.changed(); };
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
  const setSub = (id) => {
    if (st.sub !== id) {
      // Общие поля (например, «Год выпуска») сохраняем, лишние — убираем.
      const x = subOf(id);
      st.attrs = Object.fromEntries(Object.entries(st.attrs).filter(([k]) => x && x.fields.some((f) => f.key === k)));
    }
    st.sub = id;
    renderSubs(); renderAttrs(); ed.changed();
  };
  return { renderSubs, renderAttrs, setSub, isAuto, renderAuto, modelOk };
}

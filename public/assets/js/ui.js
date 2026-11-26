// Окна (подтверждение, причина, город), уведомления, выбор из списка, поля характеристик.
import { $, $$, S, api, attrText, html, raw } from './core.js';
import { ic } from './icons.js';
import { render } from './router.js';

// ================= уведомления и окна =================
export function toast(text, err = false) {
  const el = document.createElement('div');
  el.className = `toast${err ? ' err' : ''}`;
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function openModal(content, onMount) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${content}</div>`;
  document.body.appendChild(back);
  const prevFocus = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (prevFocus) prevFocus.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  const modal = $('.modal', back);
  if (onMount) onMount(modal, close);
  const f = $('input, textarea, button', modal);
  if (f) f.focus();
  return close;
}

// ================= выбор из списка (1.22) =================
// Вместо системного выпадающего списка: на телефоне — шторка снизу, на компьютере — меню под полем.
// Поиск — когда вариантов больше 10. items: [{ value, label, sub, color }].
export function pickList({ anchor, title = '', items, value = '', onPick, search = items.length > 10, placeholder = 'Найти' }) {
  const mobile = window.matchMedia('(max-width: 600px)').matches;
  const wrap = document.createElement('div');
  wrap.className = mobile ? 'pick-back' : 'pick-layer';
  const dot = (c) => (c ? html`<i class="pick-dot" style="background:${c}"></i>` : '');
  const row = (it) => html`<button type="button" role="option" class="pick-it${it.value === value ? ' on' : ''}" data-v="${it.value}" aria-selected="${it.value === value ? 'true' : 'false'}">${dot(it.color)}<span class="pick-t"><b>${it.label}</b>${it.sub ? html`<small>${it.sub}</small>` : ''}</span>${it.value === value ? ic('check', 18, 2.4) : ''}</button>`;
  wrap.innerHTML = String(html`<div class="pick ${mobile ? 'sheet' : 'pop'}" role="dialog" aria-label="${title || 'Выбор'}">
    ${mobile ? html`<div class="pick-grip"></div>${title ? html`<div class="pick-h">${title}</div>` : ''}` : ''}
    ${search ? html`<label class="pick-search">${ic('search', 18)}<input type="search" placeholder="${placeholder}" autocomplete="off" enterkeyhint="done"></label>` : ''}
    <div class="pick-list" role="listbox">${items.map(row)}</div><div class="pick-empty" hidden>Ничего не нашлось</div></div>`);
  document.body.appendChild(wrap);
  const box = $('.pick', wrap);
  if (!mobile) {
    const r = anchor.getBoundingClientRect();
    const w = Math.max(r.width, 260);
    const below = window.innerHeight - r.bottom - 12;
    const h = Math.min(380, Math.max(below, r.top - 12));
    box.style.width = `${w}px`;
    box.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - w - 8)}px`;
    box.style.maxHeight = `${h}px`;
    if (below >= Math.min(260, box.scrollHeight) || below >= r.top) box.style.top = `${r.bottom + 6}px`; else box.style.bottom = `${window.innerHeight - r.top + 6}px`;
  }
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', close); if (!mobile) window.removeEventListener('scroll', onScroll, true); anchor.focus({ preventScroll: true }); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Enter' && e.target.closest('.pick-search')) { e.preventDefault(); const f = $('.pick-it:not([hidden])', box); if (f) f.click(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = $$('.pick-it:not([hidden])', box);
      const i = list.indexOf(document.activeElement);
      const n = list[Math.min(list.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) n.focus();
    }
  };
  const onScroll = (e) => { if (!box.contains(e.target)) close(); };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', close);
  if (!mobile) setTimeout(() => window.addEventListener('scroll', onScroll, true), 0);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { close(); onPick(b.dataset.v); } });
  const q = $('.pick-search input', box);
  if (q) {
    const norm = (t) => t.toLowerCase().replace(/ё/g, 'е');
    q.oninput = () => {
      const t = norm(q.value.trim()); let any = false;
      $$('.pick-it', box).forEach((b) => { const ok = !t || norm(b.textContent).includes(t); b.hidden = !ok; any = any || ok; });
      $('.pick-empty', box).hidden = any;
    };
    if (!mobile) q.focus();
  }
  const cur = $('.pick-it.on', box);
  if (cur) cur.scrollIntoView({ block: 'center' });
  if (!q) (cur || $('.pick-it', box)).focus({ preventScroll: true });
}
// Любой <select class="select"> на сайте показывается кнопкой с pickList; сам select остаётся в форме (значение, change).
function enhanceSelect(sel) {
  if (sel.dataset.enh || sel.multiple) return;
  sel.dataset.enh = '1';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `pick-btn${sel.classList.contains('adm-select') ? ' sm' : ''}`;
  if (sel.getAttribute('style')) b.setAttribute('style', sel.getAttribute('style'));
  if (sel.hidden) b.hidden = true; // скрытый список (сортировка в режиме карты) — скрыта и кнопка
  const lab = sel.id ? document.querySelector(`label[for="${sel.id}"]`) : null;
  if (lab) { b.setAttribute('aria-label', lab.textContent.trim()); lab.addEventListener('click', (e) => { e.preventDefault(); b.click(); }); }
  sel.classList.add('pick-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  sel.after(b);
  const paint = () => {
    const o = sel.selectedOptions[0];
    b.disabled = sel.disabled;
    b.classList.toggle('empty', !sel.value);
    b.innerHTML = String(html`${o && o.dataset.color ? html`<i class="pick-dot" style="background:${o.dataset.color}"></i>` : ''}<span>${o ? o.textContent : ''}</span>${ic('down', 18, 2)}`);
  };
  sel._paint = paint;
  paint();
  new MutationObserver(paint).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  sel.addEventListener('change', paint);
  b.onclick = () => pickList({
    anchor: b, title: lab ? lab.textContent.trim() : '', value: sel.value,
    items: [...sel.options].map((o) => ({ value: o.value, label: o.textContent, sub: o.dataset.line || '', color: o.dataset.color || '' })),
    onPick: (v) => { if (sel.value === v) return; sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); paint(); }
  });
}
new MutationObserver(() => $$('select.select:not([data-enh])').forEach(enhanceSelect)).observe(document.body, { childList: true, subtree: true });

// 1.34: поле города — подсказки красивым списком в стиле pickList вместо системного <datalist>.
// Вписать город не из списка по-прежнему можно (input остаётся обычным полем). data-any — первый пункт «Вся Россия» (пусто).
function enhanceCity(inp) {
  if (inp.dataset.enh) return;
  inp.dataset.enh = '1';
  const id = `cs-${Math.random().toString(36).slice(2, 8)}`;
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', id);
  let box = null; let items = []; let act = -1;
  const norm = (t) => String(t).toLowerCase().replace(/ё/g, 'е');
  const close = () => { if (box) { box.remove(); box = null; } inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  function place() {
    if (!box) return;
    const r = inp.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const up = below < 220 && r.top > below;
    box.style.left = `${Math.max(8, r.left)}px`;
    box.style.width = `${Math.max(240, r.width)}px`;
    box.style.maxHeight = `${Math.min(320, (up ? r.top : below) - 8)}px`;
    box.style.top = up ? '' : `${r.bottom + 6}px`;
    box.style.bottom = up ? `${window.innerHeight - r.top + 6}px` : '';
  }
  const pick = (v) => { inp.value = v; close(); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };
  const mark = (i) => {
    act = i;
    $$('.pick-it', box).forEach((b, k) => b.classList.toggle('act', k === i));
    const el = box && $$('.pick-it', box)[i];
    if (el) { el.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', el.id); }
  };
  function open() {
    const t = norm(inp.value.trim());
    const cur = inp.value.trim();
    const all = S.config.cities || [];
    // Сначала города, которые начинаются с набранного, потом — где оно встречается внутри.
    const hit = t && !all.some((c) => norm(c) === t) ? [...all.filter((c) => norm(c).startsWith(t)), ...all.filter((c) => !norm(c).startsWith(t) && norm(c).includes(t))] : all;
    items = [...(inp.dataset.any && (!t || hit.length === all.length) ? [{ v: '', label: inp.dataset.any }] : []), ...hit.map((c) => ({ v: c, label: c }))];
    if (!items.length) { close(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'pick pop city-sug'; box.id = id; box.setAttribute('role', 'listbox');
      box.addEventListener('mousedown', (e) => e.preventDefault());
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) pick(b.dataset.v); });
      document.body.append(box);
      window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    }
    box.innerHTML = String(html`<div class="pick-list">${items.map((x, k) => html`<button type="button" class="pick-it${x.v === cur ? ' on' : ''}" role="option" id="${id}-${k}" data-v="${x.v}" tabindex="-1" aria-selected="${x.v === cur ? 'true' : 'false'}"><span class="pick-t"><b>${x.label}</b></span>${x.v === cur ? ic('check', 18, 2.4) : ''}</button>`)}</div>`);
    inp.setAttribute('aria-expanded', 'true');
    act = -1;
    place();
  }
  inp.addEventListener('focus', open);
  inp.addEventListener('click', () => { if (!box) open(); });
  inp.addEventListener('input', (e) => { if (e.isTrusted) open(); });
  inp.addEventListener('blur', () => setTimeout(close, 120));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && box) { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!box) open(); if (box) mark(Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1)))); return; }
    if (e.key === 'Enter' && box && act >= 0) { e.preventDefault(); pick(items[act].v); }
  });
}
new MutationObserver(() => $$('input[data-cities]:not([data-enh])').forEach(enhanceCity)).observe(document.body, { childList: true, subtree: true });

// ================= характеристики (1.22) =================
// Короткие списки — чипсами, длинные — частые значения чипсами и «Все N» с поиском, цвета — кружками.
// Одна разметка для формы объявления и фильтров поиска.
export const COLOR_HEX = { Чёрный: '#141414', Белый: '#FFFFFF', Серый: '#9A9A96', Серебристый: '#C9CDD2', Бежевый: '#E5D5BA', Коричневый: '#7A5235', Красный: '#C8312B', Оранжевый: '#EE7B30', Жёлтый: '#F2C94C', Зелёный: '#2E8B57', Голубой: '#86C8F0', Синий: '#2D4F9E', Фиолетовый: '#7B4FB8', Розовый: '#F2A7C3', Золотой: '#D4AF37',
  Разноцветный: 'conic-gradient(#C8312B, #F2C94C, #2E8B57, #2D4F9E, #7B4FB8, #C8312B)' };
const optLabel = (f, o) => (f.key === 'rooms' && o !== 'Студия' ? `${o}${o === '5+' ? ' комн.' : '-комн.'}` : o);
export function attrChoice(f, v, { filter = false } = {}) {
  const has = v !== undefined && v !== null && v !== '';
  const head = html`<span class="label">${f.label}${f.req && !filter ? html`<i class="rq">*</i>` : ''}${f.color && has ? html`<em class="av-val">${v}</em>` : ''}</span>`;
  if (f.color) {
    return html`<div class="field wide av" data-field="${f.key}">${head}<div class="av-sw-row" role="radiogroup" aria-label="${f.label}">${f.options.map((o) => html`<button type="button" role="radio" class="av-sw${o === v ? ' on' : ''}" data-av="${o}" title="${o}" aria-label="${o}" aria-checked="${o === v ? 'true' : 'false'}" style="--sw:${COLOR_HEX[o] || '#ccc'}"></button>`)}</div></div>`;
  }
  // 1.47.3: «Владельцев по ПТС» — широкая капсула «− 2 владельца +» (вариант A): от 0 (новая) до 30.
  // В фильтре — плашки «Без владельцев», «1», «2», «3», «4+».
  if (f.custom) {
    const plus = `${f.options.length + 1}+`;
    if (filter) {
      const list = [...(f.custom.min === 0 ? ['0'] : []), ...f.options, plus];
      return html`<div class="field wide av" data-field="${f.key}">${head}<div class="av-chips" role="radiogroup" aria-label="${f.label}">
        ${list.map((o) => html`<button type="button" role="radio" class="av-chip${o === String(v) ? ' on' : ''}" data-av="${o}" aria-checked="${o === String(v) ? 'true' : 'false'}">${o === '0' ? 'Без владельцев' : o}</button>`)}</div></div>`;
    }
    const sv = has ? String(v) : '';
    const n = !has ? null : sv === plus ? f.options.length + 1 : Number(sv);
    const word = has ? (n === 0 ? 'нет — новая машина' : attrText(f, sv).replace(/^\S+\s/, '')) : '';
    return html`<div class="field wide own-a" data-field="${f.key}">${head}
      <div class="own-cap" role="group" aria-label="${f.label}">
        <button type="button" class="own-pm" data-own="-1" aria-label="Меньше" ${has ? '' : raw('disabled')}>${ic('minus', 20, 2.4)}</button>
        <span class="own-val" aria-live="polite">${has ? html`<b>${sv === plus ? plus : n}</b><small>${word}</small>` : html`<em>Не указано</em>`}</span>
        <button type="button" class="own-pm" data-own="1" aria-label="Больше" ${has && n >= f.custom.max ? raw('disabled') : ''}>${ic('plus', 20, 2.4)}</button>
      </div></div>`;
  }
  const long = f.popular && f.options.length > f.popular.length;
  const shown = long ? [...f.popular, ...(has && !f.popular.includes(v) ? [v] : [])] : f.options;
  return html`<div class="field wide av" data-field="${f.key}">${head}<div class="av-chips" role="radiogroup" aria-label="${f.label}">
    ${shown.map((o) => html`<button type="button" role="radio" class="av-chip${o === v ? ' on' : ''}" data-av="${o}" aria-checked="${o === v ? 'true' : 'false'}">${optLabel(f, o)}</button>`)}
    ${long ? html`<button type="button" class="av-chip av-all" data-av-more>${filter ? 'Все' : `Все ${f.options.length}`}${ic('down', 15, 2.2)}</button>` : ''}</div></div>`;
}
// get(key) / set(key, value|undefined) — где хранится значение (состояние формы или скрытые поля фильтров).
export function bindAttrChoices(box, fields, get, set, opts = {}) {
  const paint = (key) => {
    const f = fields.find((x) => x.key === key);
    const el = $(`[data-field="${key}"]`, box);
    if (f && el) el.outerHTML = String(attrChoice(f, get(key), opts));
  };
  box.addEventListener('click', (e) => {
    const fieldEl = e.target.closest('[data-field]');
    if (!fieldEl) return;
    const key = fieldEl.dataset.field;
    const f = fields.find((x) => x.key === key);
    if (!f) return;
    // Счётчик владельцев.
    const st = e.target.closest('[data-own]');
    if (st && f.custom) {
      // «+»: «Не указано» → 0 (новая) → 1 → … → 30; «−»: обратно, с 0 — снова «Не указано».
      const cur = get(key); const sv = cur === undefined || cur === null ? '' : String(cur);
      const now = sv === '' ? null : sv === `${f.options.length + 1}+` ? f.options.length + 1 : Number(sv);
      const d = Number(st.dataset.own);
      const next = d > 0 ? (now === null ? f.custom.min : Math.min(f.custom.max, now + 1)) : (now === null || now <= f.custom.min ? undefined : now - 1);
      set(key, next === undefined ? undefined : String(next));
      paint(key);
      const again = $(`[data-field="${key}"] [data-own="${st.dataset.own}"]`, box);
      if (again && !again.disabled) again.focus();
      if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* нет вибрации */ }
      return;
    }
    const b = e.target.closest('[data-av]');
    if (b) { set(key, get(key) === b.dataset.av ? undefined : b.dataset.av); paint(key); return; }
    const m = e.target.closest('[data-av-more]');
    if (m) pickList({ anchor: m, title: f.label, value: get(key) || '', items: f.options.map((o) => ({ value: o, label: optLabel(f, o) })), onPick: (val) => { set(key, val); paint(key); } });
  });
}

export function confirmModal(title, text, okLabel = 'Подтвердить', danger = false) {
  return new Promise((resolve) => {
    openModal(String(html`<h2>${title}</h2><p class="muted" style="margin:0">${text}</p>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn ${danger ? 'btn-danger' : 'btn-dark'}" data-ok>${okLabel}</button></div>`),
    (m, close) => {
      $('[data-x]', m).onclick = () => { close(); resolve(false); };
      $('[data-ok]', m).onclick = () => { close(); resolve(true); };
    });
  });
}

export function cityModal(onPick) {
  const list = (q) => {
    const n = q.trim().toLowerCase().replace(/ё/g, 'е');
    const cities = S.config.cities.filter((c) => !n || c.toLowerCase().replace(/ё/g, 'е').includes(n));
    const custom = n && !cities.some((c) => c.toLowerCase() === n) ? [q.trim()] : [];
    return String(html`<button data-city="" class="${S.city ? '' : 'on'}">Вся Россия</button>
      ${[...custom, ...cities].slice(0, 80).map((c) => html`<button data-city="${c}" class="${S.city === c ? 'on' : ''}">${c}</button>`)}`);
  };
  openModal(String(html`<h2>Где искать?</h2>
    <label class="sr" for="city-q">Город</label>
    <input id="city-q" class="input" placeholder="Начните вводить город" autocomplete="off">
    <div class="city-list" id="city-list">${raw(list(''))}</div>`), (m, close) => {
    const input = $('#city-q', m);
    input.oninput = () => { $('#city-list', m).innerHTML = list(input.value); };
    $('#city-list', m).onclick = (e) => {
      const b = e.target.closest('[data-city]');
      if (!b) return;
      S.city = b.dataset.city;
      if (S.city) localStorage.setItem('tg_city', S.city); else localStorage.removeItem('tg_city');
      close();
      onPick(S.city);
    };
  });
}

// Одно окно «выбор причины + текст» — отклонение, отказ по апелляции, закрытие жалоб и жалоба пользователя.
// pick: причину нужно выбрать из списка (жалоба); иначе список лишь подставляет текст.
export function reasonModal({ title, hint, url, okLabel, reasons, pick = false, minText = 5, placeholder = 'Объяснение для автора', danger = true, extra = {}, done = () => render() }) {
  openModal(String(html`<h2>${title}</h2><p class="muted" style="margin:0 0 12px">${hint}</p>
      ${reasons ? html`<div class="reasons">${reasons.map((r) => html`<button type="button" class="chip" data-r="${r}">${r}</button>`)}</div>` : ''}
      <label class="sr" for="rr">Текст</label><textarea id="rr" class="textarea" style="margin-top:12px;min-height:110px" maxlength="1000" placeholder="${placeholder}"></textarea>
      <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn ${danger ? 'btn-danger' : 'btn-dark'}" data-ok>${okLabel}</button></div>`), (m, close) => {
    let picked = '';
    $$('[data-r]', m).forEach((c) => {
      c.onclick = () => {
        picked = c.dataset.r;
        $$('[data-r]', m).forEach((x) => x.classList.toggle('active', x === c));
        if (!pick) $('#rr', m).value = picked;
      };
    });
    $('[data-x]', m).onclick = close;
    $('[data-ok]', m).onclick = async () => {
      const text = $('#rr', m).value.trim();
      if (pick && !picked) { toast('Выберите причину', true); return; }
      if (!pick && text.length < minText) { toast('Напишите объяснение — его увидит автор', true); return; }
      try { await api('POST', url, { ...extra, ...(pick ? { reason: picked, text } : { reason: text }) }); close(); toast('Готово'); done(); } catch (e) { toast(e.message, true); }
    };
  });
}

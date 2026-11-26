// Редактор объявления: категория, состояние, цена (подсказка по похожим), город и метро, подсказки к описанию.
import { $, $$, CONDITION_CATS, NF, api, hasMetro, html, metroOf, plural, raw, subsOf } from './core.js';
import { ic } from './icons.js';

export function dealPart(ed) {
  const { st, form, src } = ed;
  const priceDigits = () => form.price.value.replace(/\D/g, '');
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
    ed.changed();
  };
  let metroTimer = null;
  form.metro.onchange = () => { metroWanted = form.metro.value; ed.changed(); };
  // ---------- категория, состояние, цена ----------
  const setCat = (c) => {
    st.category = c;
    $$('[data-cat]').forEach((b) => { const on = b.dataset.cat === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    $('#cond-field').classList.toggle('hidden', !CONDITION_CATS.has(c));
    if (st.sub && !subsOf(c).some((x) => x.id === st.sub)) { st.sub = ''; st.attrs = {}; }
    ed.renderSubs(); ed.renderAttrs();
    fetchHint(); ed.changed();
  };
  const setCond = (c) => { st.condition = c; $$('[data-cond]').forEach((b) => { const on = b.dataset.cond === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); ed.changed(); };
  const setUnit = (u) => { st.priceUnit = u; $$('[data-unit]').forEach((b) => { const on = b.dataset.unit === u; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); ed.changed(); };
  const setNeg = (on) => { st.negotiable = on; $('#neg').checked = on; form.price.disabled = on; if (on) form.price.value = ''; $('.ed-money').classList.toggle('off', on); ed.changed(); };
  $$('[data-cat]').forEach((b) => { b.onclick = () => setCat(b.dataset.cat); });
  $$('[data-cond]').forEach((b) => { b.onclick = () => setCond(b.dataset.cond); });
  $$('[data-unit]').forEach((b) => { b.onclick = () => { setUnit(b.dataset.unit); fetchHint(); }; });
  $('#neg').onchange = (e) => setNeg(e.target.checked);
  form.price.oninput = () => {
    const d = priceDigits().slice(0, 11);
    form.price.value = d ? NF.format(Number(d)) : '';
    ed.changed();
  };

  const showHint = (n, count) => {
    const el = $('#price-hint');
    el.innerHTML = String(html`<span class="ed-hint-txt">${ic('tag', 16, 2)}<span>Похожие продаются примерно за <b>${NF.format(n)} ₽</b>${count ? html` · ${count} ${plural(count, 'объявление', 'объявления', 'объявлений')}` : ''}</span></span>
      <button type="button" class="btn btn-soft btn-sm" data-use="${n}">Поставить эту цену</button>`);
    el.classList.remove('hidden');
    $('[data-use]', el).onclick = () => { setNeg(false); form.price.value = NF.format(n); ed.changed(); };
  };
  let hintTimer = null;
  const fetchHintSoon = () => { clearTimeout(hintTimer); hintTimer = setTimeout(fetchHint, 600); };
  async function fetchHint() {
    const t = ed.body().title;
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
    ed.changed();
  });
  form.city.oninput = () => { ed.changed(); clearTimeout(metroTimer); metroTimer = setTimeout(loadMetro, 300); };
  return { priceDigits, setCat, setCond, setUnit, setNeg, showHint, fetchHint, fetchHintSoon, loadMetro };
}

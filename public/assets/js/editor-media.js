// Редактор объявления: фото (порядок, обложка), «Заполнить по фото» и видео с загрузкой частями.
import { $, $$, S, api, html, raw } from './core.js';
import { ic } from './icons.js';
import { toast } from './ui.js';
import { resizeImage } from './photos.js';

export function mediaPart(ed) {
  const { st, form, l } = ed;
  const fileInput = $('#file');
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
    $$('[data-rm]', box).forEach((b) => { b.onclick = () => { st.photos.splice(Number(b.dataset.rm), 1); ed.changed(); renderPhotos(); }; });
    $$('[data-mv]', box).forEach((b) => { b.onclick = () => { const i = Number(b.dataset.mv); const j = i + Number(b.dataset.d); [st.photos[i], st.photos[j]] = [st.photos[j], st.photos[i]]; ed.changed(); renderPhotos(); }; });
    $$('[data-cover]', box).forEach((b) => { b.onclick = () => { const [p] = st.photos.splice(Number(b.dataset.cover), 1); st.photos.unshift(p); ed.changed(); renderPhotos(); }; });
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
        renderPhotos(); ed.changed();
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
      if (r.category && (manual || !st.category)) ed.setCat(r.category);
      if (r.subcategory && (manual || !st.sub)) ed.setSub(r.subcategory);
      if (r.attrs && Object.keys(r.attrs).length) { for (const [k, v] of Object.entries(r.attrs)) if (manual || st.attrs[k] === undefined) st.attrs[k] = v; ed.renderAttrs(); }
      if (r.condition && (manual || !st.condition)) ed.setCond(r.condition);
      if (r.priceHint) ed.showHint(r.priceHint, r.priceHintCount); else ed.fetchHint();
      st.aiDone = true;
      ed.changed();
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
    if (rm) rm.onclick = () => { if (st.video && st.video.local) URL.revokeObjectURL(st.video.local); st.video = null; renderVideo(); ed.changed(); };
  };
  async function addVideo(f) {
    if (!/^video\/(mp4|quicktime)$/.test(f.type) && !/\.(mp4|mov|m4v)$/i.test(f.name)) { toast('Видео — в формате MP4 или MOV', true); return; }
    if (f.size > 100 * MB) { toast(`Видео ${Math.round(f.size / MB)} МБ — нужно до 100 МБ. Сократите или сожмите его`, true); return; }
    const local = URL.createObjectURL(f);
    const duration = await videoDuration(local);
    if (duration && duration > 61) { URL.revokeObjectURL(local); toast(`Видео длится ${mmss(duration)} — обрежьте его до минуты`, true); return; }
    if (st.video && st.video.local) URL.revokeObjectURL(st.video.local);
    const v = { local, uploading: true, progress: 0, duration };
    st.video = v; renderVideo(); ed.changed();
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
      renderVideo(); ed.changed();
    } catch (e) {
      if (st.video === v) { st.video = null; renderVideo(); ed.changed(); }
      toast(e.message, true);
    }
  }
  $('#vfile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) addVideo(f); };
  return { renderPhotos, renderVideo };
}

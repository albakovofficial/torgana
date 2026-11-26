// Фото: просмотр на весь экран (листание, увеличение, свайп) и уменьшение перед загрузкой.
import { $, $$, html } from './core.js';
import { ic } from './icons.js';
import { photoHash } from './editor.js';

// ================= просмотр фото (1.23) =================
// Фото на весь экран внутри Торганы: листание стрелками, свайпом и клавишами, увеличение двойным нажатием,
// колёсиком и двумя пальцами, перетаскивание увеличенного. Закрыть — крестик, Esc, нажатие на фон, свайп вниз.
export function photoViewer(srcs, start = 0, title = '') {
  if (!srcs.length) return;
  let i = Math.min(Math.max(start, 0), srcs.length - 1);
  let z = 1; let x = 0; let y = 0; // увеличение и сдвиг
  const many = srcs.length > 1;
  const v = document.createElement('div');
  v.className = 'pv';
  v.setAttribute('role', 'dialog');
  v.setAttribute('aria-modal', 'true');
  v.setAttribute('aria-label', title ? `Фото: ${title}` : 'Фото');
  v.innerHTML = String(html`<div class="pv-top"><span class="pv-count" aria-live="polite"></span>${title ? html`<span class="pv-title">${title}</span>` : html`<span></span>`}
      <button type="button" class="pv-btn" data-pv-close aria-label="Закрыть">${ic('close', 22, 2)}</button></div>
    <div class="pv-stage"><img class="pv-img" alt="" draggable="false"></div>
    ${many ? html`<button type="button" class="pv-btn pv-nav prev" data-pv="-1" aria-label="Предыдущее фото">${ic('left', 24, 2)}</button>
      <button type="button" class="pv-btn pv-nav next" data-pv="1" aria-label="Следующее фото">${ic('right', 24, 2)}</button>
      <div class="pv-thumbs">${srcs.map((src, k) => html`<button type="button" data-pv-to="${k}" aria-label="Фото ${k + 1}"><img src="${src}" alt="" loading="lazy"></button>`)}</div>` : ''}`);
  document.body.appendChild(v);
  document.body.classList.add('pv-open');
  const img = $('.pv-img', v);
  const stage = $('.pv-stage', v);
  const prevFocus = document.activeElement;
  const apply = (anim = true) => { img.style.transition = anim ? '' : 'none'; img.style.transform = `translate(${x}px, ${y}px) scale(${z})`; v.classList.toggle('zoomed', z > 1); };
  const clamp = () => {
    const r = stage.getBoundingClientRect(); const w = img.offsetWidth * z; const h = img.offsetHeight * z;
    const mx = Math.max(0, (w - r.width) / 2); const my = Math.max(0, (h - r.height) / 2);
    x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let busy = false;
  // Листание как лента: соседнее фото едет рядом с текущим (за пальцем или по кнопке), без затемнения.
  const gw = document.createElement('div'); gw.className = 'pv-gwrap'; gw.setAttribute('aria-hidden', 'true');
  gw.innerHTML = '<img class="pv-img" alt="" draggable="false">';
  stage.appendChild(gw);
  const gimg = gw.firstChild;
  const GAP = 24;
  const EASE = 'transform .36s cubic-bezier(.22,.8,.24,1)';
  const ghostTo = (k) => { if (gimg.dataset.k !== String(k)) { gimg.src = srcs[k]; gimg.dataset.k = String(k); } };
  const ghostHide = () => { gw.style.transition = 'none'; gw.style.visibility = 'hidden'; gw.style.transform = ''; };
  const peek = (dx) => { // во время свайпа: сосед с той стороны, куда тянут
    if (!many) return;
    const dir = dx < 0 ? 1 : -1;
    ghostTo((i + dir + srcs.length) % srcs.length);
    gw.style.transition = 'none'; gw.style.visibility = 'visible';
    gw.style.transform = `translateX(${dx + dir * (stage.clientWidth + GAP)}px)`;
  };
  const slide = (k, dir, dx = 0) => {
    if (!many || busy) return;
    k = (k + srcs.length) % srcs.length;
    if (reduce) { show(k); return; }
    busy = true;
    const W = stage.clientWidth + GAP;
    ghostTo(k);
    gw.style.transition = 'none'; gw.style.visibility = 'visible'; gw.style.transform = `translateX(${dx + dir * W}px)`;
    img.style.transition = 'none'; img.style.transform = `translateX(${dx}px)`;
    void gw.offsetWidth;
    gw.style.transition = EASE; img.style.transition = EASE;
    gw.style.transform = 'translateX(0px)'; img.style.transform = `translateX(${-dir * W}px)`;
    setTimeout(() => {
      show(k);
      const done = () => { ghostHide(); img.style.transition = ''; busy = false; };
      img.decode ? img.decode().then(done, done) : done();
    }, 360);
  };
  const snapBack = (dx) => { // не дотянули — оба фото возвращаются на место
    if (!dx) { ghostHide(); apply(); return; }
    const dir = dx < 0 ? 1 : -1;
    gw.style.transition = EASE; gw.style.transform = `translateX(${dir * (stage.clientWidth + GAP)}px)`;
    apply();
    setTimeout(ghostHide, 360);
  };
  const show = (k) => {
    i = (k + srcs.length) % srcs.length; z = 1; x = 0; y = 0; apply(false);
    img.src = srcs[i];
    $('.pv-count', v).textContent = many ? `${i + 1} из ${srcs.length}` : '';
    $$('[data-pv-to]', v).forEach((b, n) => { b.classList.toggle('on', n === i); if (n === i) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); });
    if (many) [srcs[(i + 1) % srcs.length], srcs[(i - 1 + srcs.length) % srcs.length]].forEach((u) => { const p = new Image(); p.src = u; });
  };
  const zoomAt = (nz, cx, cy) => {
    const r = img.getBoundingClientRect();
    const ox = cx - (r.left + r.width / 2); const oy = cy - (r.top + r.height / 2);
    const k = nz / z;
    x -= ox * (k - 1); y -= oy * (k - 1); z = nz;
    if (z <= 1.01) { z = 1; x = 0; y = 0; }
    clamp(); apply();
  };
  const close = () => { v.remove(); document.body.classList.remove('pv-open'); document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight' && many) slide(i + 1, 1);
    else if (e.key === 'ArrowLeft' && many) slide(i - 1, -1);
  };
  document.addEventListener('keydown', onKey, true);
  v.addEventListener('click', (e) => {
    if (e.target.closest('[data-pv-close]')) { close(); return; }
    const nb = e.target.closest('[data-pv]'); if (nb) { slide(i + Number(nb.dataset.pv), Number(nb.dataset.pv)); return; }
    const tb = e.target.closest('[data-pv-to]'); if (tb) { const k = Number(tb.dataset.pvTo); if (k !== i) slide(k, k > i ? 1 : -1); return; }
    if (e.target === stage && z === 1 && !moved) close(); // нажатие на фон вокруг фото
  });
  stage.addEventListener('dblclick', (e) => { e.preventDefault(); zoomAt(z > 1 ? 1 : 2.5, e.clientX, e.clientY); });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.min(5, Math.max(1, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2))), e.clientX, e.clientY); }, { passive: false });
  // Пальцы и мышь: один — листать (свайп) или двигать увеличенное, два — увеличивать.
  const pts = new Map(); let start0 = null; let pinch = null; let moved = false; let lastTap = 0;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 1) start0 = { px: e.clientX, py: e.clientY, x, y, t: Date.now() };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      zoomAt(Math.min(5, Math.max(1, pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d))), pinch.cx, pinch.cy);
      moved = true; return;
    }
    if (!start0) return;
    const dx = e.clientX - start0.px; const dy = e.clientY - start0.py;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if (z > 1) { x = start0.x + dx; y = start0.y + dy; clamp(); apply(false); }
    else if (moved && !busy) {
      const down = Math.abs(dy) > Math.abs(dx) && dy > 0;
      img.style.transition = 'none'; img.style.transform = down ? `translateY(${dy}px)` : `translateX(${dx}px)`;
      v.style.backgroundColor = down ? `rgba(11, 11, 11, ${Math.max(0.3, 1 - dy / 400)})` : '';
      if (down) ghostHide(); else peek(dx);
    }
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size || !start0) return;
    const dx = e.clientX - start0.px; const dy = e.clientY - start0.py;
    v.style.backgroundColor = '';
    if (z === 1 && moved) {
      if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
      const fast = Math.abs(dx) / Math.max(1, Date.now() - start0.t) > 0.35;
      if (many && !busy && (Math.abs(dx) > 60 || (fast && Math.abs(dx) > 24)) && Math.abs(dx) > Math.abs(dy)) { start0 = null; slide(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1, dx); return; }
      if (!busy) snapBack(Math.abs(dx) > Math.abs(dy) ? dx : 0);
    }
    // Двойное касание на телефоне — увеличить или вернуть.
    if (!moved && e.pointerType === 'touch') { const t = Date.now(); if (t - lastTap < 280) { zoomAt(z > 1 ? 1 : 2.5, e.clientX, e.clientY); lastTap = 0; } else lastTap = t; }
    start0 = null;
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  show(i);
  $('[data-pv-close]', v).focus({ preventScroll: true });
}
// Фото из чата и модерации (ссылки data-pv-src) — тоже во встроенном просмотре.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-pv-src]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const group = a.dataset.pvGroup ? $$(`a[data-pv-group="${a.dataset.pvGroup}"]`) : [a];
  photoViewer(group.map((x) => x.dataset.pvSrc), group.indexOf(a));
});
// Уменьшает фото в браузере → { data: JPEG data-URL, hash: отпечаток }.
// thumb — ширина лёгкой копии для ленты (1.43.0): WebP, где браузер умеет, иначе JPEG.
export function resizeImage(file, max = 1600, square = false, thumb = 0) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sw = square ? side : img.naturalWidth;
      const sh = square ? side : img.naturalHeight;
      const scale = Math.min(1, max / Math.max(sw, sh));
      const w = Math.round(sw * scale);
      const h = Math.round(sh * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const out = { data: c.toDataURL('image/jpeg', 0.85), hash: photoHash(c) };
      if (thumb && Math.max(w, h) > thumb) {
        const k = thumb / Math.max(w, h);
        const t = document.createElement('canvas');
        t.width = Math.round(w * k); t.height = Math.round(h * k);
        t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
        const webp = t.toDataURL('image/webp', 0.8);
        out.thumb = webp.startsWith('data:image/webp') ? webp : t.toDataURL('image/jpeg', 0.8);
      }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото. Попробуйте JPG или PNG.')); };
    img.src = url;
  });
}

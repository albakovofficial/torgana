'use strict';

// 1.57.0: вложения в переписке (по объявлению и с поддержкой) — видео и файлы.
// Видео — та же загрузка частями, что у видео объявления (lib/video.js: POST /api/videos, PUT частями), здесь только проверка
// и привязка к сообщению. Файлы — документы до 10 МБ одним запросом (POST /api/files?name=…, тело — сам файл).
// Файл лежит в uploads под случайным именем, отдаётся с исходным названием и только на скачивание (не открывается как страница).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_SIZE = 10 * 1024 * 1024;
const TYPES = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8', zip: 'application/zip'
};
const NAME_RE = new RegExp(`^[a-f0-9]{32}\\.(${Object.keys(TYPES).join('|')})$`);
// Начало файла должно совпадать с форматом: PDF, ZIP (docx, xlsx, pptx, odt… — тоже ZIP), старый Office, RTF; текст — без нулевых байтов.
const ZIP = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'zip'];
function looksLike(ext, buf) {
  const head = buf.subarray(0, 8);
  if (ext === 'pdf') return head.toString('latin1', 0, 5) === '%PDF-';
  if (ZIP.includes(ext)) return head[0] === 0x50 && head[1] === 0x4b;
  if (['doc', 'xls', 'ppt'].includes(ext)) return head.toString('hex') === 'd0cf11e0a1b11ae1';
  if (ext === 'rtf') return head.toString('latin1', 0, 5) === '{\\rtf';
  return !buf.subarray(0, 4096).includes(0); // txt, csv
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error('Файл больше 10 МБ'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

module.exports = function attach({ route, db, h, dir, video }) {
  const { HttpError, requireUser, rateLimit, now } = h;
  db.exec(`CREATE TABLE IF NOT EXISTS chat_files (
    file TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  const fileRow = db.prepare('SELECT * FROM chat_files WHERE file = ?');

  // Название для показа и скачивания: без путей и служебных символов, до 120 знаков.
  const cleanName = (s, ext) => {
    let n = String(s || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f"<>|*?:]/g, '').trim().slice(0, 120);
    if (!n) n = `файл.${ext}`;
    return n;
  };

  route('POST', '/api/files', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`file:${u.id}`, 40, 60 * 60 * 1000);
    const raw = String(ctx.query.get('name') || '');
    const ext = (/\.([a-z0-9]{2,4})$/i.exec(raw) || [])[1]?.toLowerCase() || '';
    if (!TYPES[ext]) throw new HttpError(400, 'Можно отправить PDF, Word, Excel, PowerPoint, OpenOffice, текст, CSV или ZIP');
    const buf = await readRaw(ctx.req, MAX_SIZE);
    if (buf.length < 1) throw new HttpError(400, 'Файл пустой');
    if (!looksLike(ext, buf)) throw new HttpError(400, `Файл не похож на ${ext.toUpperCase()} — проверьте его`);
    const file = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, file), buf);
    const name = cleanName(raw, ext);
    db.prepare('INSERT INTO chat_files (file, user_id, name, size, created_at) VALUES (?, ?, ?, ?, ?)').run(file, u.id, name, buf.length, now());
    return { file, name, size: buf.length, url: `/uploads/${file}` };
  });

  // Видео и файл для нового сообщения: свои, загруженные целиком, ещё не отправленные.
  function take(u, input) {
    const v = input.video ? video.check(u.id, input.video) : '';
    if (v && (db.prepare('SELECT 1 FROM messages WHERE video = ? UNION ALL SELECT 1 FROM support_messages WHERE video = ?').get(v, v)
      || db.prepare('SELECT 1 FROM listings WHERE video = ?').get(v))) throw new HttpError(400, 'Это видео уже отправлено — выберите его заново');
    let f = '';
    if (input.file) {
      const r = fileRow.get(String(input.file));
      if (!r || r.user_id !== u.id) throw new HttpError(400, 'Сначала загрузите файл');
      if (r.used) throw new HttpError(400, 'Этот файл уже отправлен — выберите его заново');
      f = r.file;
    }
    return { video: v, file: f };
  }
  const markUsed = (file) => { if (file) db.prepare('UPDATE chat_files SET used = 1 WHERE file = ?').run(file); };

  // В ответе: видео — адрес, файл — адрес, название и размер.
  function view(row) {
    const out = { video: row.video ? video.url(row.video) : null, file: null };
    if (row.file) { const r = fileRow.get(row.file); if (r) out.file = { url: `/uploads/${r.file}`, name: r.name, size: r.size }; }
    return out;
  }
  // Подпись в списке переписок и в уведомлении.
  function preview(row) {
    if (row.body) return row.body;
    if (row.photo) return '📷 Фото';
    if (row.video) return '🎬 Видео';
    if (row.file) { const r = fileRow.get(row.file); return `📎 ${r ? r.name : 'Файл'}`; }
    return '';
  }

  // Скачивание: исходное название, тип по расширению, без показа в браузере как страницы.
  function serve(req, res, name, headers) {
    const r = fileRow.get(name);
    const p = path.join(dir, name);
    fs.stat(p, (err, st) => {
      if (err || !st.isFile() || !r) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Не найдено'); return; }
      const ext = name.split('.').pop();
      res.writeHead(200, {
        ...headers,
        'Content-Type': TYPES[ext] || 'application/octet-stream',
        'Content-Length': st.size,
        'Content-Disposition': `${ext === 'pdf' ? 'inline' : 'attachment'}; filename="file.${ext}"; filename*=UTF-8''${encodeURIComponent(r.name)}`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=31536000, immutable'
      });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(p).pipe(res);
    });
  }

  // Неотправленные файлы — через сутки.
  function cleanup() {
    for (const { file } of db.prepare('SELECT file FROM chat_files WHERE used = 0 AND created_at < ?').all(now() - 24 * 3600 * 1000)) {
      db.prepare('DELETE FROM chat_files WHERE file = ?').run(file);
      fs.rm(path.join(dir, file), { force: true }, () => {});
    }
  }

  return { take, markUsed, view, preview, serve, cleanup, NAME_RE, MAX_SIZE };
};

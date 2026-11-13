'use strict';

// Видео в объявлении: одно, до 60 секунд, MP4 или MOV, до 100 МБ.
// Загружается частями по 8 МБ (каждая часть — отдельный запрос, укладывается в лимит nginx 12 МБ
// и переживает плохую связь: при обрыве браузер продолжает с принятого места).
// Файл лежит в той же папке, что и фото (uploads), — попадает в ежедневную копию.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_SIZE = 100 * 1024 * 1024;
const MAX_SECONDS = 60;
const CHUNK = 8 * 1024 * 1024;
const NAME_RE = /^[a-f0-9]{32}\.(mp4|mov)$/;

// Длительность из заголовка MP4/MOV (moov → mvhd). null — если заголовок не найден.
function readBoxes(fd, start, end, visit) {
  const head = Buffer.alloc(16);
  let pos = start;
  while (pos + 8 <= end) {
    fs.readSync(fd, head, 0, 16, pos);
    let size = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let hdr = 8;
    if (size === 1) { size = Number(head.readBigUInt64BE(8)); hdr = 16; } else if (size === 0) size = end - pos;
    if (size < hdr) return;
    if (visit(type, pos + hdr, pos + size) === false) return;
    pos += size;
  }
}
function probe(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const st = fs.fstatSync(fd);
    const first = Buffer.alloc(12);
    fs.readSync(fd, first, 0, 12, 0);
    if (first.toString('latin1', 4, 8) !== 'ftyp') return { ok: false };
    const brand = first.toString('latin1', 8, 12);
    let duration = null;
    readBoxes(fd, 0, st.size, (type, from, to) => {
      if (type !== 'moov') return true;
      readBoxes(fd, from, to, (t, f) => {
        if (t !== 'mvhd') return true;
        const b = Buffer.alloc(32);
        fs.readSync(fd, b, 0, 32, f);
        if (b[0] === 1) duration = Number(b.readBigUInt64BE(24)) / b.readUInt32BE(20);
        else duration = b.readUInt32BE(16) / b.readUInt32BE(12);
        return false;
      });
      return false;
    });
    return { ok: true, brand, duration: Number.isFinite(duration) ? duration : null };
  } finally { fs.closeSync(fd); }
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error('Слишком большая часть файла'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

module.exports = function videos({ route, db, h, dir }) {
  const { HttpError, requireUser, readJson, rateLimit, now } = h;
  const url = (file) => (file ? `/uploads/${file}` : null);
  const remove = (file) => {
    if (!file) return;
    db.prepare('DELETE FROM videos WHERE file = ?').run(file);
    fs.rm(path.join(dir, file), { force: true }, () => {});
    fs.rm(path.join(dir, `${file}.part`), { force: true }, () => {});
  };

  // Начать загрузку: размер и формат известны заранее, длительность браузер уже проверил по метаданным.
  route('POST', '/api/videos', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`video:${u.id}`, 20, 60 * 60 * 1000);
    const body = await readJson(ctx.req);
    const size = parseInt(body.size, 10);
    const name = String(body.name || '').toLowerCase();
    const type = String(body.type || '').toLowerCase();
    const ext = /\.mov$/.test(name) || type === 'video/quicktime' ? 'mov' : /\.mp4$|\.m4v$/.test(name) || type === 'video/mp4' ? 'mp4' : '';
    if (!ext) throw new HttpError(400, 'Загрузите видео в формате MP4 или MOV');
    if (!Number.isFinite(size) || size < 1000) throw new HttpError(400, 'Файл пустой или повреждён');
    if (size > MAX_SIZE) throw new HttpError(413, 'Видео больше 100 МБ — сократите или сожмите его');
    if (body.duration !== undefined && Number(body.duration) > MAX_SECONDS + 1) throw new HttpError(400, 'Видео длиннее минуты — обрежьте его до 60 секунд');
    const file = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, `${file}.part`), Buffer.alloc(0));
    db.prepare('INSERT INTO videos (file, user_id, size, received, mime, created_at) VALUES (?, ?, ?, 0, ?, ?)').run(file, u.id, size, ext, now());
    return { file, chunk: CHUNK };
  });

  // Часть файла: ?offset= — с какого байта. Повтор уже принятой части безопасен.
  route('PUT', '/api/videos/:file', async (ctx) => {
    const u = requireUser(ctx);
    const file = String(ctx.params.file);
    const v = db.prepare('SELECT * FROM videos WHERE file = ? AND user_id = ?').get(file, u.id);
    if (!v || !NAME_RE.test(file)) throw new HttpError(404, 'Загрузка не найдена — выберите видео заново');
    if (v.ready) return { received: v.size, ready: true, url: url(file) };
    const offset = parseInt(ctx.query.get('offset'), 10);
    const buf = await readRaw(ctx.req, CHUNK + 1024);
    if (offset !== v.received) return { received: v.received, ready: false }; // браузер продолжит с этого места
    if (!buf.length || v.received + buf.length > v.size) throw new HttpError(400, 'Размер файла не совпадает — выберите видео заново');
    const part = path.join(dir, `${file}.part`);
    fs.appendFileSync(part, buf);
    const received = v.received + buf.length;
    db.prepare('UPDATE videos SET received = ? WHERE file = ?').run(received, file);
    if (received < v.size) return { received, ready: false };
    // Файл целиком: проверяем, что это действительно видео и не длиннее минуты.
    let info;
    try { info = probe(part); } catch { info = { ok: false }; }
    if (!info.ok) { remove(file); throw new HttpError(400, 'Файл не похож на видео MP4 или MOV'); }
    if (info.duration !== null && info.duration > MAX_SECONDS + 1) { remove(file); throw new HttpError(400, 'Видео длиннее минуты — обрежьте его до 60 секунд'); }
    fs.renameSync(part, path.join(dir, file));
    db.prepare('UPDATE videos SET ready = 1 WHERE file = ?').run(file);
    return { received, ready: true, url: url(file), duration: info.duration };
  });

  // Привязать к объявлению (или убрать: file = ''). Прежнее видео удаляется.
  function attach(userId, listingId, file) {
    const cur = db.prepare('SELECT video FROM listings WHERE id = ?').get(listingId);
    if (!cur) return;
    file = String(file || '');
    if (file === cur.video) return;
    if (file) {
      const v = db.prepare('SELECT * FROM videos WHERE file = ? AND user_id = ? AND ready = 1').get(file, userId);
      if (!v || (v.listing_id !== null && v.listing_id !== listingId)) return; // чужое или незагруженное — не трогаем
      db.prepare('UPDATE videos SET listing_id = ? WHERE file = ?').run(listingId, file);
    }
    db.prepare('UPDATE listings SET video = ? WHERE id = ?').run(file, listingId);
    if (cur.video) remove(cur.video);
  }
  const check = (userId, file) => {
    if (!file) return '';
    const v = db.prepare('SELECT ready FROM videos WHERE file = ? AND user_id = ?').get(String(file), userId);
    if (!v || !v.ready) throw new HttpError(400, 'Видео ещё загружается — подождите пару секунд');
    return String(file);
  };

  // Брошенные загрузки: недогруженные — через 6 часов, не привязанные к объявлению — через сутки.
  function cleanup() {
    const t = now();
    const old = db.prepare('SELECT file FROM videos WHERE listing_id IS NULL AND ((ready = 0 AND created_at < ?) OR created_at < ?)').all(t - 6 * 3600 * 1000, t - 24 * 3600 * 1000);
    // 1.57.0: видео, отправленное в переписке, тоже не трогаем.
    const used = db.prepare('SELECT 1 FROM listings WHERE video = ? UNION ALL SELECT 1 FROM messages WHERE video = ? UNION ALL SELECT 1 FROM support_messages WHERE video = ?');
    for (const { file } of old) if (!used.get(file, file, file)) remove(file);
  }

  return { attach, check, remove, url, cleanup, probe, NAME_RE, MAX_SIZE, MAX_SECONDS, CHUNK };
};
module.exports.probe = probe;

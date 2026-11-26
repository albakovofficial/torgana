'use strict';
// Фото: проверка по содержимому (JPG, PNG, WebP), сохранение с лёгкой копией для ленты, фото профиля,
// удаление файлов и ежечасная уборка брошенных загрузок.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = function uploads({ route, db, h, dir: UPLOAD_DIR }) {
  const { HttpError, requireUser, readJson, rateLimit, now } = h;

  const photoUrl = (file) => (file ? `/uploads/${file}` : null);

  // Фото профиля: файл из uploads, не привязанный к объявлению. Прежнее фото удаляется с диска.
  function setAvatar(userId, file) {
    const cur = db.prepare('SELECT avatar FROM users WHERE id = ?').get(userId);
    if (!cur || cur.avatar === file) return;
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(file, userId);
    if (cur.avatar) {
      db.prepare('DELETE FROM uploads WHERE file = ?').run(cur.avatar);
      fs.rm(path.join(UPLOAD_DIR, cur.avatar), { force: true }, () => {});
    }
  }

  const IMAGE_TYPES = [
    { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { ext: 'png', mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    { ext: 'webp', mime: 'image/webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
  ];

  // Сохранить фото на диск и в uploads (своё, ещё не привязанное). Возвращает имя файла или бросает 400.
  // hash — отпечаток dHash от браузера (только подсказка модератору о повторах).
  // thumb — лёгкая копия для ленты (1.43.0): тот же формат имени, лежит рядом, удаляется вместе с фото (removeUploadFiles).
  function saveImage(userId, buf, hash = '', thumb = null) {
    if (buf.length > 6 * 1024 * 1024) throw new HttpError(413, 'Фото больше 6 МБ');
    const write = (b) => {
      const type = IMAGE_TYPES.find((t) => t.test(b));
      if (!type) throw new HttpError(400, 'Файл не похож на изображение');
      const name = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), b);
      return name;
    };
    const file = write(buf);
    const small = thumb && thumb.length <= 400 * 1024 ? write(thumb) : '';
    db.prepare('INSERT INTO uploads (file, user_id, hash, thumb, created_at) VALUES (?, ?, ?, ?, ?)').run(file, userId, /^[0-9a-f]{16}$/.test(String(hash)) ? hash : '', small, now());
    return file;
  }
  // Файлы фото (и их лёгкие копии) с диска; строки uploads удаляет вызывающий.
  function removeUploadFiles(rows) {
    for (const r of rows) for (const f of [r.file, r.thumb]) if (f) fs.rm(path.join(UPLOAD_DIR, f), { force: true }, () => {});
  }

  route('POST', '/api/uploads', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`upload:${u.id}`, 120, 60 * 60 * 1000);
    const body = await readJson(ctx.req, 9 * 1024 * 1024);
    const dataUrl = (v) => /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(v || ''));
    const m = dataUrl(body.data);
    if (!m) throw new HttpError(400, 'Загрузите фото в формате JPG, PNG или WebP');
    const t = dataUrl(body.thumb);
    const file = saveImage(u.id, Buffer.from(m[2], 'base64'), body.hash, t ? Buffer.from(t[2], 'base64') : null);
    return { file, url: photoUrl(file) };
  });

  // Брошенные загрузки (не в объявлении, не фото профиля, не в чате, не обложка витрины) старше суток — с диска и из базы.
  function cleanup() {
    const old = db.prepare(`SELECT file, thumb FROM uploads WHERE listing_id IS NULL AND created_at < ? AND file NOT IN (SELECT avatar FROM users WHERE avatar != '')
      AND file NOT IN (SELECT photo FROM messages WHERE photo != '') AND file NOT IN (SELECT photo FROM support_messages WHERE photo != '')
      AND file NOT IN (SELECT shop_cover FROM users WHERE shop_cover != '')`).all(now() - 24 * 3600 * 1000);
    removeUploadFiles(old);
    for (const { file } of old) db.prepare('DELETE FROM uploads WHERE file = ?').run(file);
  }

  return { photoUrl, setAvatar, saveImage, removeUploadFiles, IMAGE_TYPES, cleanup };
};

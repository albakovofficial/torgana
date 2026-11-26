'use strict';
// Всё, что не /api/: файлы сайта с версией в адресе, фото и видео из uploads (видео — частями), страницы приложения
// со снимком для поисковиков, карта в отдельной рамке, sitemap, robots, фид, Universal Links.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = function staticFiles({ db, headers: SECURITY_HEADERS, publicDir: PUBLIC_DIR, uploadDir: UPLOAD_DIR, seo, indexnow, apns, video, attach }) {

  const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.woff2': 'font/woff2'
  };


  // Карта Яндекса живёт в отдельной странице-рамке со своей политикой безопасности:
  // основной сайт не пускает чужие скрипты, а скрипты карт работают только внутри рамки.
  // Рамка открывается в песочнице (без доступа к сайту, cookie и входу); точки получает сообщением от страницы поиска.
  const MAP_FRAME = fs.readFileSync(path.join(__dirname, 'map-frame.html'), 'utf8');
  function serveMapFrame(res) {
    const key = (db.setting('seo') || {}).mapsKey || '';
    const nonce = crypto.randomBytes(16).toString('base64');
    const Y = 'https://*.yandex.ru https://*.yandex.net https://yandex.ru https://yastatic.net https://*.yastatic.net';
    res.writeHead(key ? 200 : 404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' ${Y}; style-src 'unsafe-inline' blob: ${Y}; img-src 'self' data: blob: ${Y}; connect-src ${Y}; frame-src ${Y}; font-src ${Y}; worker-src blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`
    });
    if (!key) { res.end('Карта не подключена'); return; }
    res.end(MAP_FRAME.replace(/__NONCE__/g, nonce).replace('__KEY__', encodeURIComponent(key)));
  }

  // 1.41.0: ETag — браузер переспрашивает файл (иконки, манифест, sw.js) и получает 304 без повторной загрузки.
  function serveFile(res, filePath, cache, req = null) {
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Не найдено');
        return;
      }
      const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
      if (req && req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); res.end(); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': cache,
        ETag: etag,
        ...SECURITY_HEADERS
      });
      if (req && req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(filePath).pipe(res);
    });
  }

  // Видео отдаём частями (Range): браузер сразу начинает показ и может перематывать.
  function serveVideo(req, res, filePath) {
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Не найдено'); return; }
      const base = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', ...SECURITY_HEADERS };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (!m || (m[1] === '' && m[2] === '')) {
        res.writeHead(200, { ...base, 'Content-Length': st.size });
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      let start = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1]);
      let end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
      res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(filePath, { start, end }).pipe(res);
    });
  }

  // Версия интерфейса: хеш app.js, app.css, theme.js и admin.js. Попадает в адреса файлов в index.html (?v=…),
  // поэтому после обновления браузер сразу берёт свежие файлы, а не держит старые из кеша.
  const ASSET_VERSION = crypto.createHash('sha1')
    .update(fs.readFileSync(path.join(PUBLIC_DIR, 'assets/app.js')))
    .update(fs.readFileSync(path.join(PUBLIC_DIR, 'assets/app.css')))
    .update(fs.readFileSync(path.join(PUBLIC_DIR, 'assets/theme.js')))
    .update(fs.readFileSync(path.join(PUBLIC_DIR, 'assets/admin.js'))) // 1.51.2: модерация — отдельным файлом
    .digest('hex').slice(0, 10);
  const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
    .replace(/(\/assets\/(?:app\.(?:css|js)|theme\.js))"/g, `$1?v=${ASSET_VERSION}"`);

  // Страница приложения: заголовок, описание, карточка для мессенджеров и снимок содержимого для поисковиков (lib/seo.js).
  function serveIndex(res, pathname, search = '') {
    let page;
    try { page = seo.inject(INDEX_HTML, pathname); } catch (e) { console.error('seo:', e.message); page = { status: 200, html: INDEX_HTML }; }
    if (page.location) { res.writeHead(301, { Location: page.location + (search || ''), 'Cache-Control': 'public, max-age=3600' }); res.end(); return; }
    const body = Buffer.from(page.html);
    res.writeHead(page.status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS
    });
    res.end(body);
  }
  function serveText(res, type, text) {
    const body = Buffer.from(text);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'public, max-age=1800', ...SECURITY_HEADERS });
    res.end(body);
  }

  function serveStatic(req, res, pathname, search) {
    if (pathname.startsWith('/uploads/')) {
      const name = pathname.slice('/uploads/'.length);
      if (video.NAME_RE.test(name)) { serveVideo(req, res, path.join(UPLOAD_DIR, name)); return; }
      if (attach.NAME_RE.test(name)) { attach.serve(req, res, name, SECURITY_HEADERS); return; }
      if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) { res.writeHead(404); res.end(); return; }
      serveFile(res, path.join(UPLOAD_DIR, name), 'public, max-age=31536000, immutable', req);
      return;
    }
    if (pathname !== '/' && pathname !== '/index.html' && !pathname.includes('..')) {
      const filePath = path.join(PUBLIC_DIR, pathname);
      if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const versioned = search === `?v=${ASSET_VERSION}`;
        const cache = versioned ? 'public, max-age=31536000, immutable'
          : pathname.startsWith('/assets/fonts/') ? 'public, max-age=2592000' : 'no-cache';
        serveFile(res, filePath, cache, req);
        return;
      }
    }
    if (pathname === '/map-frame') { serveMapFrame(res); return; }
    if (pathname === '/sitemap.xml') { serveText(res, 'application/xml; charset=utf-8', seo.sitemap()); return; }
    if (pathname === '/robots.txt') { serveText(res, 'text/plain; charset=utf-8', seo.robots()); return; }
    // 1.58.0: фид для Яндекс Товаров, ключ IndexNow, значок для поисковиков, которые спрашивают /favicon.ico.
    if (pathname === '/feeds/yandex.yml') { serveText(res, 'application/xml; charset=utf-8', seo.feed()); return; }
    if (pathname === `/${indexnow.key}.txt`) { serveText(res, 'text/plain; charset=utf-8', indexnow.key); return; }
    if (pathname === '/favicon.ico') { res.writeHead(301, { Location: '/assets/icons/icon-192.png', 'Cache-Control': 'public, max-age=86400' }); res.end(); return; }
    // 1.56.0: Universal Links — ссылки torgana.ru открываются в приложении. Team ID — из ключа Apple в модерации.
    if (pathname === '/.well-known/apple-app-site-association' || pathname === '/apple-app-site-association') {
      const team = apns.teamId();
      if (!team) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Приложение ещё не подключено'); return; }
      const app = `${team}.${apns.topic()}`;
      serveText(res, 'application/json', JSON.stringify({ applinks: { details: [{ appIDs: [app], components: [{ '/': '/api/*', exclude: true }, { '/': '/.well-known/*', exclude: true }, { '/': '/uploads/*', exclude: true }, { '/': '*' }] }] }, webcredentials: { apps: [app] } }));
      return;
    }
    // Все остальные пути — страницы приложения.
    serveIndex(res, pathname, search);
  }

  return { serveStatic };
};

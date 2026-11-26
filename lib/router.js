'use strict';
// Адреса API: регистрация обработчиков route(метод, '/api/…/:id', fn) и разбор запроса — вход по cookie, защита
// от запросов с чужих сайтов, ответ JSON, переход (302) или файл, понятная ошибка вместо падения.
const auth = require('./auth');
const { HttpError, sendJson, parseCookies } = require('./http');

module.exports = function router({ db, trustProxy, headers: SECURITY_HEADERS, onError }) {
  const routes = [];
  // Обработчик может вернуть redirect(url) вместо JSON — тогда ответ 302 (нужно для возврата из Яндекс ID и VK ID).
  const REDIRECT = Symbol('redirect');
  const redirect = (url) => ({ [REDIRECT]: url });
  // file(...) — ответ файлом (выгрузка CSV, Excel), а не JSON.
  const FILE = Symbol('file');
  const file = (type, body, name) => ({ [FILE]: { type, body, name } });

  function route(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  }

  // За nginx: он дописывает настоящий адрес посетителя в конец X-Forwarded-For ($proxy_add_x_forwarded_for).
  // Берём последний адрес — первые посетитель может подставить сам, чтобы обойти лимиты.
  function clientIp(req) {
    if (trustProxy) {
      const xf = req.headers['x-forwarded-for'];
      if (xf) return String(xf).split(',').pop().trim();
    }
    return req.socket.remoteAddress || '';
  }

  async function handle(req, res, url, pathname) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[auth.SESSION_COOKIE];
    const headers = { ...SECURITY_HEADERS };
    const ctx = {
      req, res, query: url.searchParams, params: {}, ip: clientIp(req), token, cookies,
      user: auth.userFromSession(db, token),
      setCookie: (c) => { headers['Set-Cookie'] = [...(headers['Set-Cookie'] || []), c]; }
    };
    try {
      // Изменяющие запросы принимаются только со своего домена.
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        if (origin) {
          const host = req.headers['x-forwarded-host'] || req.headers.host;
          if (new URL(origin).host !== host) throw new HttpError(403, 'Запрос с другого сайта отклонён');
        }
      }
      const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
      if (!r) throw new HttpError(404, 'Не найдено');
      const m = r.re.exec(pathname);
      r.keys.forEach((k, i) => { ctx.params[k] = m[i + 1]; });
      const result = await r.handler(ctx);
      if (result && result[REDIRECT]) { res.writeHead(302, { ...headers, Location: result[REDIRECT], 'Cache-Control': 'no-store' }); res.end(); return; }
      if (result && result[FILE]) {
        const f = result[FILE]; const body = Buffer.from(f.body);
        res.writeHead(200, { ...headers, 'Content-Type': f.type, 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${f.name}"` });
        res.end(body); return;
      }
      sendJson(res, 200, result, headers);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) { console.error(e); onError(e); }
      sendJson(res, status, { error: status === 500 ? 'Что-то пошло не так. Попробуйте ещё раз.' : e.message, ...(e.extra || {}) }, headers);
    }
  }

  return { route, handle, redirect, file };
};

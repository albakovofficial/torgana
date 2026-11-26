'use strict';
// Вход и регистрация по почте: пароль, код из письма, восстановление и смена пароля, отписка от писем.
// Подбор пароля ограничен и по адресу, и по аккаунту (lib/http.js guard/failure).
const auth = require('./auth');
const { failure, guard } = require('./http');

module.exports = function session({ route, db, h, mailer, codesOn, publicUser, adminEmails: ADMIN_EMAILS, secureCookies: SECURE_COOKIES }) {
  const { HttpError, readJson, rateLimit, requireUser, now, str } = h;

  route('POST', '/api/auth/register', async (ctx) => {
    rateLimit(`reg:${ctx.ip}`, 10, 10 * 60 * 1000);
    const body = await readJson(ctx.req);
    const name = str(body.name, 60);
    const email = str(body.email, 120).toLowerCase();
    const password = String(body.password || '');
    if (name.length < 2) throw new HttpError(400, 'Укажите имя');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Проверьте email');
    if (password.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
    if (password.length > 200) throw new HttpError(400, 'Слишком длинный пароль');
    if (body.consent !== true) throw new HttpError(400, 'Нужно согласие на обработку персональных данных');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Этот email уже зарегистрирован');
    const isAdmin = ADMIN_EMAILS.includes(email) ? 1 : 0;
    const info = db.prepare('INSERT INTO users (email, name, password_hash, is_admin, created_at, consent_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(email, name, auth.hashPassword(password), isAdmin, now(), now());
    h.sources.tag(info.lastInsertRowid, body.src);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    // Почта подключена — войти можно только после кода из письма (6 цифр). Без почты код не отправить — входим сразу.
    if (codesOn()) { mailer.sendCode(user); return { needCode: true, email: user.email }; }
    const s = auth.createSession(db, user.id);
    ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
    return { user: publicUser(user) };
  });

  route('POST', '/api/auth/login', async (ctx) => {
    rateLimit(`login:${ctx.ip}`, 15, 10 * 60 * 1000);
    const body = await readJson(ctx.req);
    const email = str(body.email, 120).toLowerCase();
    const password = String(body.password || '');
    // Подбор к одному аккаунту с разных адресов: 10 неверных паролей — вход в него закрыт на 15 минут.
    const fails = `login-fail:${email}`;
    guard(fails, 10, 'Слишком много неверных паролей для этого аккаунта. Подождите 15 минут или восстановите пароль.');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !auth.verifyPassword(password, user.password_hash)) { failure(fails, 15 * 60 * 1000); throw new HttpError(401, 'Неверный email или пароль'); }
    if (ADMIN_EMAILS.includes(email) && !user.is_admin) {
      db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
      user.is_admin = 1;
    }
    // Почта не подтверждена — сначала код (новый, если прошлому больше минуты).
    if (!user.email_verified && codesOn()) { mailer.sendCode(user); return { needCode: true, email: user.email }; }
    const s = auth.createSession(db, user.id);
    ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
    return { user: publicUser(user) };
  });

  route('POST', '/api/auth/logout', (ctx) => {
    if (ctx.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(ctx.token);
    ctx.setCookie(auth.clearCookie(SECURE_COOKIES));
    return { ok: true };
  });

  // ---------- письма: подтверждение email, восстановление пароля, отписка ----------

  function requireMail() {
    if (!mailer.ready()) throw new HttpError(503, 'Отправка писем пока не подключена. Напишите в поддержку.');
  }

  route('POST', '/api/auth/forgot', async (ctx) => {
    requireMail();
    rateLimit(`forgot:${ctx.ip}`, 5, 60 * 60 * 1000);
    const email = str((await readJson(ctx.req)).email, 120).toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_blocked = 0').get(email);
    // Ответ одинаковый, есть такой аккаунт или нет: по форме нельзя узнать, кто зарегистрирован.
    if (user) {
      try { rateLimit(`forgot-mail:${email}`, 3, 60 * 60 * 1000); mailer.sendResetLetter(user); } catch { /* лимит: молча */ }
    }
    return { ok: true };
  });

  route('GET', '/api/auth/reset', (ctx) => ({ valid: !!mailer.checkToken(ctx.query.get('token'), 'reset', false) }));

  route('POST', '/api/auth/reset', async (ctx) => {
    rateLimit(`reset:${ctx.ip}`, 20, 60 * 60 * 1000);
    const body = await readJson(ctx.req);
    const password = String(body.password || '');
    if (password.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
    if (password.length > 200) throw new HttpError(400, 'Слишком длинный пароль');
    const t = mailer.checkToken(body.token, 'reset');
    if (!t) throw new HttpError(400, 'Ссылка устарела или уже использована. Запросите новую.');
    // Ссылка пришла на этот ящик — значит, он подтверждён. Все старые сессии завершаем.
    db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').run(auth.hashPassword(password), t.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(t.user_id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(t.user_id);
    if (user.is_blocked) throw new HttpError(403, 'Аккаунт заблокирован. Напишите в поддержку.');
    const s = auth.createSession(db, user.id);
    ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
    return { user: publicUser(user) };
  });

  route('POST', '/api/auth/verify', async (ctx) => {
    rateLimit(`verify:${ctx.ip}`, 30, 60 * 60 * 1000);
    const t = mailer.checkToken((await readJson(ctx.req)).token, 'verify');
    if (!t) throw new HttpError(400, 'Ссылка устарела или уже использована. Отправьте письмо ещё раз из профиля.');
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(t.user_id);
    return { ok: true };
  });

  route('POST', '/api/me/verify', (ctx) => {
    const u = requireUser(ctx);
    requireMail();
    if (u.email_verified) return { ok: true, already: true };
    rateLimit(`verify-send:${u.id}`, 10, 60 * 60 * 1000);
    return { ok: true, email: u.email, ...mailer.sendCode(u) };
  });

  // Код из письма: подтверждает почту и открывает вход (при регистрации, при входе и из профиля).
  const CODE_ERR = { bad: 'Неверный код — проверьте цифры', expired: 'Код устарел — отправьте новый', tries: 'Слишком много попыток — отправьте новый код', none: 'Отправьте код ещё раз' };
  route('POST', '/api/auth/code', async (ctx) => {
    rateLimit(`code:${ctx.ip}`, 30, 10 * 60 * 1000);
    const b = await readJson(ctx.req);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(str(b.email, 120).toLowerCase());
    if (!user) throw new HttpError(400, CODE_ERR.none);
    if (user.is_blocked) throw new HttpError(403, 'Аккаунт заблокирован. Напишите в поддержку.');
    if (!user.email_verified) {
      const r = mailer.checkCode(user, String(b.code || '').replace(/\D/g, ''));
      if (r !== 'ok') throw new HttpError(400, CODE_ERR[r]);
      db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id);
    } else if (!(ctx.user && ctx.user.id === user.id)) throw new HttpError(400, 'Почта уже подтверждена — войдите с паролем');
    const s = auth.createSession(db, user.id);
    ctx.setCookie(auth.sessionCookie(s.token, s.expires, SECURE_COOKIES));
    return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) };
  });

  // Отправить код ещё раз. Ответ одинаковый, есть такой аккаунт или нет.
  route('POST', '/api/auth/code/resend', async (ctx) => {
    rateLimit(`code-resend:${ctx.ip}`, 10, 60 * 60 * 1000);
    requireMail();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND email_verified = 0 AND is_blocked = 0').get(str((await readJson(ctx.req)).email, 120).toLowerCase());
    const r = user ? mailer.sendCode(user) : { sent: true, wait: 60 };
    return { ok: true, wait: r.wait };
  });

  // Отписка: со страницы /unsubscribe и «в один клик» из почтового клиента (List-Unsubscribe-Post).
  route('POST', '/api/unsubscribe', async (ctx) => {
    const body = ctx.req.headers['content-type'] === 'application/json' ? await readJson(ctx.req) : {};
    const ok = mailer.unsubscribe(body.t || ctx.query.get('t'), body.k || ctx.query.get('k') || 'all');
    if (!ok) throw new HttpError(400, 'Ссылка для отписки неверная');
    return { ok: true };
  });

  // Смена пароля из настроек: нужен текущий пароль; остальные устройства выходят из аккаунта.
  route('POST', '/api/me/password', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`password:${u.id}`, 10, 60 * 60 * 1000);
    const body = await readJson(ctx.req);
    const password = String(body.password || '');
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id);
    if (!auth.verifyPassword(String(body.current || ''), row.password_hash)) throw new HttpError(400, 'Текущий пароль указан неверно');
    if (password.length < 8) throw new HttpError(400, 'Новый пароль — минимум 8 символов');
    if (password.length > 200) throw new HttpError(400, 'Слишком длинный пароль');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), u.id);
    const others = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, ctx.token || '');
    return { ok: true, signedOut: Number(others.changes) };
  });

  return {};
};

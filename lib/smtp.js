'use strict';

// Минимальный SMTP-клиент без зависимостей: SSL (465), STARTTLS (587/2525), без шифрования (только для
// локального ретранслятора и тестов), AUTH PLAIN/LOGIN, письмо multipart/alternative (текст + HTML) в UTF-8.
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');

// inline — картинки внутри письма (логотип): [{ cid, type, name, data: Buffer }]. Тогда письмо
// multipart/related: почта показывает их сразу, не загружая с сайта (Яндекс и Mail.ru часто прячут внешние картинки).
function buildMessage({ from, fromName, replyTo, to, subject, text, html, headers = {}, inline = [] }) {
  const boundary = `tg-${crypto.randomBytes(12).toString('hex')}`;
  const related = `tg-${crypto.randomBytes(12).toString('hex')}`;
  const domain = String(from).split('@')[1] || 'localhost';
  const head = {
    From: fromName ? `${encodeWord(fromName)} <${from}>` : `<${from}>`,
    // Ответ на уведомление с no-reply@ уходит в поддержку.
    ...(replyTo && replyTo !== from ? { 'Reply-To': `<${replyTo}>` } : {}),
    To: `<${to}>`,
    Subject: encodeWord(subject),
    Date: new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID': `<${crypto.randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version': '1.0',
    'Auto-Submitted': 'auto-generated',
    'Content-Type': inline.length ? `multipart/related; type="multipart/alternative"; boundary="${related}"` : `multipart/alternative; boundary="${boundary}"`,
    ...headers
  };
  const part = (type, body) => `--${boundary}\r\nContent-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(body))}`;
  const alternative = `${part('text/plain', text)}${part('text/html', html)}--${boundary}--\r\n`;
  const top = Object.entries(head).map(([k, v]) => `${k}: ${v}`).join('\r\n');
  if (!inline.length) return `${top}\r\n\r\n${alternative}`;
  const files = inline.map((f) => `--${related}\r\nContent-Type: ${f.type}; name="${f.name}"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${f.cid}>\r\nContent-Disposition: inline; filename="${f.name}"\r\n\r\n${wrap76(f.data.toString('base64'))}`).join('');
  return `${top}\r\n\r\n--${related}\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${alternative}${files}--${related}--\r\n`;
}

// Понятная причина вместо кода ответа сервера.
function explain(code, text) {
  if (code === 535 || code === 534) return 'Почтовый сервис не принял логин или пароль. Проверьте их в личном кабинете сервиса (для Яндекса и Mail.ru нужен «пароль приложения»).';
  if (code === 550 || code === 553 || code === 554) return `Почтовый сервис отклонил адрес отправителя или получателя: ${text}`;
  return `Почтовый сервис ответил: ${code} ${text}`.slice(0, 300);
}

// Соединение, которое умеет отправить строку и дождаться ответа «NNN …» (в том числе многострочного).
function conversation(sock, timeoutMs) {
  let buf = '';
  let lines = [];
  let waiting = null;
  const replies = [];
  const settle = (fn) => { if (waiting) { const w = waiting; waiting = null; fn(w); } };
  sock.setTimeout(timeoutMs);
  sock.on('data', (d) => {
    buf += d.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const m = /^(\d{3})([ -]?)(.*)$/.exec(buf.slice(0, nl).replace(/\r$/, ''));
      buf = buf.slice(nl + 1);
      if (!m) continue;
      lines.push(m[3]);
      if (m[2] === '-') continue;
      const reply = { code: Number(m[1]), lines };
      lines = [];
      if (waiting) settle((w) => w.resolve(reply)); else replies.push(reply);
    }
  });
  sock.on('error', (e) => settle((w) => w.reject(new Error(`Нет связи с почтовым сервисом: ${e.message}`))));
  sock.on('timeout', () => { settle((w) => w.reject(new Error('Почтовый сервис не ответил за 20 секунд'))); sock.destroy(); });
  return async (line, expect) => {
    if (line !== null) sock.write(`${line}\r\n`);
    const reply = replies.length ? replies.shift() : await new Promise((resolve, reject) => { waiting = { resolve, reject }; });
    if (![].concat(expect).includes(reply.code)) throw new Error(explain(reply.code, reply.lines.join(' ')));
    return reply;
  };
}

function connect(opts, secure) {
  return new Promise((resolve, reject) => {
    const s = secure ? tls.connect(opts, () => resolve(s)) : net.connect(opts, () => resolve(s));
    s.once('error', (e) => reject(new Error(`Нет связи с почтовым сервисом: ${e.message}`)));
  });
}

async function sendMail(cfg, msg) {
  const { host, port, security = 'ssl', user, pass, from, fromName, replyTo } = cfg;
  if (!host || !port || !from) throw new Error('Почта не настроена');
  const timeoutMs = cfg.timeoutMs || 20000;
  const tlsOpts = { servername: host, rejectUnauthorized: cfg.rejectUnauthorized !== false };
  let sock = await connect({ host, port: Number(port), ...tlsOpts }, security === 'ssl');
  try {
    let cmd = conversation(sock, timeoutMs);
    await cmd(null, 220);
    let ehlo = await cmd('EHLO torgana', 250);
    if (security === 'starttls') {
      await cmd('STARTTLS', 220);
      sock.removeAllListeners('data');
      sock.removeAllListeners('timeout');
      sock.setTimeout(0);
      sock = await connect({ socket: sock, ...tlsOpts }, true);
      cmd = conversation(sock, timeoutMs);
      ehlo = await cmd('EHLO torgana', 250);
    }
    if (user) {
      const auth = ehlo.lines.find((l) => /^AUTH\b/i.test(l)) || '';
      if (/LOGIN/i.test(auth) && !/PLAIN/i.test(auth)) {
        await cmd('AUTH LOGIN', 334);
        await cmd(b64(user), 334);
        await cmd(b64(pass || ''), 235);
      } else {
        await cmd(`AUTH PLAIN ${b64(`\0${user}\0${pass || ''}`)}`, 235);
      }
    }
    await cmd(`MAIL FROM:<${from}>`, 250);
    await cmd(`RCPT TO:<${msg.to}>`, [250, 251]);
    await cmd('DATA', 354);
    await cmd(`${buildMessage({ from, fromName, replyTo, ...msg }).replace(/^\./gm, '..')}\r\n.`, 250);
    await cmd('QUIT', [221, 250]).catch(() => {});
  } finally {
    sock.destroy();
  }
}

module.exports = { sendMail, buildMessage };

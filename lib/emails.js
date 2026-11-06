'use strict';

// Письма Торганы: единый шаблон в стиле сайта (белый фон, графит, изумрудная кнопка).
// Вёрстка таблицами и инлайн-стилями — так письмо одинаково выглядит в Яндекс, Mail.ru, Gmail и Outlook.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const FONT = "Onest,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

function layout({ base, preheader, title, paragraphs, button, note, unsubscribe }) {
  const p = paragraphs.map((t) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#444444">${t}</p>`).join('');
  const btn = button ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 6px"><tr><td style="border-radius:999px;background:#1F5E4A">
      <a href="${esc(button.url)}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${esc(button.label)}</a></td></tr></table>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#9A9A96">Если кнопка не нажимается, откройте ссылку:<br><a href="${esc(button.url)}" style="color:#1F5E4A;word-break:break-all">${esc(button.url)}</a></p>` : '';
  const unsub = unsubscribe ? `<br><a href="${esc(unsubscribe)}" style="color:#9A9A96;text-decoration:underline">Отписаться от таких писем</a>` : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F3F3F1">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F3F1"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
    <tr><td style="padding:0 4px 20px">
      <a href="${esc(base)}" style="text-decoration:none"><table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="width:34px;height:34px;border-radius:17px;background:#1F5E4A;color:#ffffff;font-family:${FONT};font-size:18px;font-weight:800;text-align:center;line-height:34px">Т</td>
        <td style="padding-left:10px;font-family:${FONT};font-size:21px;font-weight:700;color:#101010;letter-spacing:-0.3px">торгана</td>
      </tr></table></a>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:28px;padding:36px 32px;font-family:${FONT}">
      <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:700;color:#101010;letter-spacing:-0.3px">${esc(title)}</h1>
      ${p}${btn}
      ${note ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid #E7E7E4;font-size:13px;line-height:1.5;color:#666666">${note}</p>` : ''}
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:#9A9A96;text-align:center">
      Торгана — честная площадка объявлений по всей России.<br>Мы никогда не просим код из СМС, данные карты или оплату по ссылке.${unsub}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function plain({ title, paragraphs, button, note, unsubscribe }) {
  const strip = (s) => String(s).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return [title, '', ...paragraphs.map(strip), button ? `\n${button.label}: ${button.url}` : '', note ? `\n${strip(note)}` : '',
    '\n—\nТоргана — честная площадка объявлений по всей России.', unsubscribe ? `Отписаться: ${unsubscribe}` : ''].filter((x) => x !== '').join('\n');
}

function make(opts) {
  return { subject: opts.subject, html: layout(opts), text: plain(opts) };
}

const T = {
  verify: ({ base, name, url }) => make({
    base, subject: 'Подтвердите email на Торгане', title: 'Подтвердите email', preheader: 'Один клик — и почта подтверждена',
    paragraphs: [`${esc(name)}, добро пожаловать на Торгану!`, 'Подтвердите, что это ваш адрес: так мы сможем присылать уведомления о сообщениях и помочь восстановить доступ к аккаунту.'],
    button: { label: 'Подтвердить email', url }, note: 'Ссылка действует 7 дней. Если вы не регистрировались на Торгане — просто удалите это письмо.'
  }),
  reset: ({ base, name, url }) => make({
    base, subject: 'Восстановление пароля на Торгане', title: 'Новый пароль', preheader: 'Ссылка действует 1 час',
    paragraphs: [`${esc(name)}, мы получили запрос на смену пароля для вашего аккаунта.`, 'Нажмите кнопку и придумайте новый пароль. После смены мы выйдем из аккаунта на всех устройствах.'],
    button: { label: 'Задать новый пароль', url }, note: 'Ссылка действует 1 час и срабатывает один раз. Если вы не просили сменить пароль — ничего не делайте, пароль останется прежним.'
  }),
  message: ({ base, name, from, title, preview, url, unsubscribe }) => make({
    base, subject: `Новое сообщение: ${title}`, title: 'Вам написали', preheader: `${from}: ${preview}`, unsubscribe,
    paragraphs: [`${esc(name)}, <strong style="color:#101010">${esc(from)}</strong> написал(а) по объявлению «${esc(title)}»:`,
      `<span style="display:block;padding:14px 18px;background:#F3F3F1;border-radius:14px;color:#101010">${esc(preview)}</span>`],
    button: { label: 'Ответить', url }, note: 'Отвечайте в чате Торганы — так переписка сохранится. Не переходите в мессенджеры и не платите по ссылкам от незнакомцев.'
  }),
  // Одно письмо на все решения модерации: event — rejected | approved | restored | appeal-approved | appeal-denied.
  moderation: ({ base, name, title, reason, url, event, unsubscribe }) => {
    const V = {
      rejected: ['Объявление отклонено', 'Объявление нужно исправить', `модерация сняла объявление «${esc(title)}».`, 'Причина',
        'Исправьте объявление — после сохранения оно снова появится в поиске. Если считаете решение ошибочным, подайте апелляцию: её рассмотрит человек.', 'Открыть объявление'],
      'appeal-denied': ['Апелляция отклонена', 'Решение осталось прежним', `мы внимательно рассмотрели апелляцию по объявлению «${esc(title)}».`, 'Ответ модератора',
        'Вы можете исправить объявление — после сохранения оно снова появится в поиске.', 'Исправить объявление'],
      restored: ['Объявление снова опубликовано', 'Объявление снова в поиске', `модерация восстановила объявление «${esc(title)}».`, '', 'Оно снова опубликовано и видно покупателям.', 'Открыть объявление'],
      approved: ['Объявление опубликовано', 'Объявление прошло проверку', `модератор проверил объявление «${esc(title)}».`, '', 'Оно опубликовано и видно покупателям.', 'Открыть объявление'],
      'appeal-approved': ['Апелляция одобрена', 'Апелляция одобрена', `мы пересмотрели решение по объявлению «${esc(title)}».`, '', 'Оно снова опубликовано и видно покупателям.', 'Открыть объявление']
    }[event];
    return make({
      base, subject: `${V[0]}: ${title}`, title: V[1], preheader: reason || V[4], unsubscribe,
      paragraphs: [`${esc(name)}, ${V[2]}`, ...(V[3] && reason ? [`<strong style="color:#101010">${V[3]}:</strong> ${esc(reason)}`] : []), V[4]],
      button: { label: V[5], url }
    });
  },
  test: ({ base }) => make({
    base, subject: 'Проверка почты Торганы', title: 'Почта работает', preheader: 'Тестовое письмо',
    paragraphs: ['Это тестовое письмо из раздела «Модерация → Почта». Если вы его видите — письма пользователям будут доходить.'],
    button: { label: 'Открыть Торгану', url: base }
  })
};

module.exports = { T, esc };

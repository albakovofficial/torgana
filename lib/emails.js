'use strict';

// Письма Торганы: единый шаблон в стиле сайта (белый фон, графит, изумрудная кнопка).
// Вёрстка таблицами и инлайн-стилями — так письмо одинаково выглядит в Яндекс, Mail.ru, Gmail и Outlook.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const FONT = "Onest,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

function layout({ base, support, preheader, title, paragraphs, button, note, unsubscribe }) {
  // Абзац — строка; готовый блок (список и т. п.) начинается с <div и вставляется как есть.
  const p = paragraphs.map((t) => (t.startsWith('<div') ? t : `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#444444">${t}</p>`)).join('');
  const btn = button ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 6px"><tr><td style="border-radius:999px;background:#1F5E4A">
      <a href="${esc(button.url)}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${esc(button.label)}</a></td></tr></table>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#9A9A96">Если кнопка не нажимается, откройте ссылку:<br><a href="${esc(button.url)}" style="color:#1F5E4A;word-break:break-all">${esc(button.url)}</a></p>` : '';
  const unsub = unsubscribe ? `<br><a href="${esc(unsubscribe)}" style="color:#9A9A96;text-decoration:underline">Отписаться от таких писем</a>` : '';
  const help = support ? `<br>Вопросы — ответьте на это письмо или напишите на <a href="mailto:${esc(support)}" style="color:#9A9A96;text-decoration:underline">${esc(support)}</a>.` : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F3F3F1">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F3F1"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
    <tr><td style="padding:0 4px 20px">
      <a href="${esc(base)}" style="text-decoration:none"><table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td width="34" height="34" style="width:34px;height:34px;border-radius:17px;background:#1F5E4A"><img src="${esc(base)}/assets/icons/mail-logo.png" width="34" height="34" alt="Т" style="display:block;width:34px;height:34px;border:0;border-radius:17px;color:#ffffff;font-family:${FONT};font-size:18px;font-weight:800;text-align:center;line-height:34px"></td>
        <td style="padding-left:10px;font-family:${FONT};font-size:21px;font-weight:700;color:#101010;letter-spacing:-0.3px">торгана</td>
      </tr></table></a>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:28px;padding:36px 32px;font-family:${FONT}">
      <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:700;color:#101010;letter-spacing:-0.3px">${esc(title)}</h1>
      ${p}${btn}
      ${note ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid #E7E7E4;font-size:13px;line-height:1.5;color:#666666">${note}</p>` : ''}
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:#9A9A96;text-align:center">
      Торгана — честная площадка объявлений по всей России.<br>Мы никогда не просим код из СМС, данные карты или оплату по ссылке.${help}${unsub}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function plain({ support, title, paragraphs, button, note, unsubscribe }) {
  const strip = (s) => String(s).replace(/<br\s*\/?>/g, '\n').replace(/<li[^>]*>/g, '\n• ').replace(/<\/ul>/g, '\n').replace(/<[^>]+>/g, '').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return [title, '', ...paragraphs.map(strip), button ? `\n${button.label}: ${button.url}` : '', note ? `\n${strip(note)}` : '',
    '\n—\nТоргана — честная площадка объявлений по всей России.', support ? `Вопросы — ответьте на это письмо или напишите на ${support}.` : '', unsubscribe ? `Отписаться: ${unsubscribe}` : ''].filter((x) => x !== '').join('\n');
}

function make(opts) {
  return { subject: opts.subject, html: layout(opts), text: plain(opts) };
}

const T = {
  verify: ({ base, support, name, url }) => make({
    base, support, subject: 'Подтвердите email на Торгане', title: 'Подтвердите email', preheader: 'Один клик — и почта подтверждена',
    paragraphs: [`${esc(name)}, добро пожаловать на Торгану!`, 'Подтвердите, что это ваш адрес: так мы сможем присылать уведомления о сообщениях и помочь восстановить доступ к аккаунту.'],
    button: { label: 'Подтвердить email', url }, note: 'Ссылка действует 7 дней. Если вы не регистрировались на Торгане — просто удалите это письмо.'
  }),
  reset: ({ base, support, name, url }) => make({
    base, support, subject: 'Восстановление пароля на Торгане', title: 'Новый пароль', preheader: 'Ссылка действует 1 час',
    paragraphs: [`${esc(name)}, мы получили запрос на смену пароля для вашего аккаунта.`, 'Нажмите кнопку и придумайте новый пароль. После смены мы выйдем из аккаунта на всех устройствах.'],
    button: { label: 'Задать новый пароль', url }, note: 'Ссылка действует 1 час и срабатывает один раз. Если вы не просили сменить пароль — ничего не делайте, пароль останется прежним.'
  }),
  // about — о чём сообщение; по умолчанию «по объявлению «…»» (для поддержки — «в чате поддержки»).
  message: ({ base, support, name, from, title, preview, url, unsubscribe, about }) => make({
    base, support, subject: `Новое сообщение: ${title}`, title: 'Вам написали', preheader: `${from}: ${preview}`, unsubscribe,
    paragraphs: [`${esc(name)}, <strong style="color:#101010">${esc(from)}</strong> ${about ? esc(about) : `написал(а) по объявлению «${esc(title)}»`}:`,
      `<span style="display:block;padding:14px 18px;background:#F3F3F1;border-radius:14px;color:#101010">${esc(preview)}</span>`],
    button: { label: 'Ответить', url }, note: 'Отвечайте в чате Торганы — так переписка сохранится. Не переходите в мессенджеры и не платите по ссылкам от незнакомцев.'
  }),
  // Одно письмо на все решения модерации: event — rejected | approved | restored | appeal-approved | appeal-denied.
  moderation: ({ base, support, name, title, reason, url, event, unsubscribe }) => {
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
      base, support, subject: `${V[0]}: ${title}`, title: V[1], preheader: reason || V[4], unsubscribe,
      paragraphs: [`${esc(name)}, ${V[2]}`, ...(V[3] && reason ? [`<strong style="color:#101010">${V[3]}:</strong> ${esc(reason)}`] : []), V[4]],
      button: { label: V[5], url }
    });
  },
  // Отзывы: event — new | published | rejected | hidden | reply | reply-rejected | complaint-kept | complaint-hidden.
  review: ({ base, support, name, event, title, rating, text, reason, url, unsubscribe }) => {
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const quote = `<span style="display:block;padding:14px 18px;background:#F3F3F1;border-radius:14px;color:#101010"><span style="color:#E39A00;letter-spacing:2px">${stars}</span><br>${esc(text)}</span>`;
    const V = {
      new: ['Новый отзыв о вас', 'О вас оставили отзыв', `покупатель оставил отзыв по объявлению «${esc(title)}»:`, '', 'Изменить или удалить отзыв нельзя. Вы можете один раз ответить на него, а если он нарушает правила — пожаловаться с обоснованием.', 'Открыть отзывы'],
      published: ['Отзыв опубликован', 'Отзыв опубликован', `модератор проверил ваш отзыв по объявлению «${esc(title)}» — он опубликован.`, '', 'Спасибо, что помогаете другим покупателям.', 'Мои отзывы'],
      rejected: ['Отзыв не опубликован', 'Отзыв не прошёл проверку', `модератор не опубликовал ваш отзыв по объявлению «${esc(title)}».`, 'Причина', 'Отзыв по этому объявлению можно оставить только один раз, поэтому новый написать не получится.', 'Мои отзывы'],
      hidden: ['Отзыв скрыт', 'Отзыв скрыт по жалобе', `модератор рассмотрел жалобу продавца и скрыл ваш отзыв по объявлению «${esc(title)}».`, 'Причина', 'Если не согласны, напишите в поддержку.', 'Мои отзывы'],
      reply: ['Продавец ответил на отзыв', 'Продавец ответил', `продавец ответил на ваш отзыв по объявлению «${esc(title)}».`, '', 'Ответ виден в профиле продавца рядом с вашим отзывом.', 'Посмотреть'],
      'reply-rejected': ['Ответ на отзыв не опубликован', 'Ответ не прошёл проверку', `модератор не опубликовал ваш ответ на отзыв по объявлению «${esc(title)}».`, 'Причина', 'Вы можете написать ответ заново.', 'Открыть отзывы'],
      'complaint-kept': ['Жалоба на отзыв рассмотрена', 'Отзыв остаётся', `модератор рассмотрел вашу жалобу на отзыв по объявлению «${esc(title)}» и не нашёл нарушений.`, 'Комментарий', 'Вы можете один раз публично ответить на отзыв.', 'Открыть отзывы'],
      'complaint-hidden': ['Жалоба на отзыв принята', 'Отзыв скрыт', `модератор рассмотрел вашу жалобу на отзыв по объявлению «${esc(title)}» и скрыл его.`, 'Причина', 'Отзыв больше не виден покупателям и не учитывается в оценке.', 'Открыть отзывы']
    }[event];
    return make({
      base, support, subject: `${V[0]}: ${title}`, title: V[1], preheader: reason || V[4], unsubscribe,
      paragraphs: [`${esc(name)}, ${V[2]}`, ...(['new', 'published', 'rejected', 'hidden'].includes(event) ? [quote] : []), ...(V[3] && reason ? [`<strong style="color:#101010">${V[3]}:</strong> ${esc(reason)}`] : []), V[4]],
      button: { label: V[5], url }
    });
  },
  // Подборка за день: карточки объявлений по сохранённым поискам и снижения цен в избранном.
  digest: ({ base, support, name, searches, prices, unsubscribe }) => {
    const money = (n) => (n === null || n === undefined ? 'Цена договорная' : `${new Intl.NumberFormat('ru-RU').format(n)} ₽`);
    const card = (r, old) => `<tr><td style="padding:0 0 12px"><a href="${esc(base)}/l/${r.listing_id}" style="display:block;text-decoration:none;color:#101010">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F3F1;border-radius:18px"><tr>
        <td width="76" style="padding:10px"><div style="width:64px;height:64px;border-radius:12px;background:#E7E7E4;overflow:hidden">${r.photo ? `<img src="${esc(base)}/uploads/${esc(r.photo)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border:0">` : ''}</div></td>
        <td style="padding:10px 14px 10px 0;font-family:${FONT}"><div style="font-size:15px;font-weight:600;line-height:1.35">${esc(r.title)}</div>
          <div style="margin-top:4px;font-size:15px;font-weight:700">${money(r.price)}${old ? ` <span style="font-weight:400;color:#9A9A96;text-decoration:line-through">${money(old)}</span>` : ''}</div>
          <div style="margin-top:2px;font-size:13px;color:#666666">${esc(r.city)}</div></td></tr></table></a></td></tr>`;
    const block = (title, rows) => `<div style="margin:0 0 8px"><div style="margin:0 0 10px;font-size:15px;font-weight:700;color:#101010">${title}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></div>`;
    const parts = [
      ...searches.map((s) => block(`${esc(s.title)} · ${s.items.length} нов.`, s.items.slice(0, 6).map((r) => card(r)).join(''))),
      ...(prices.length ? [block('Цена снижена в избранном', prices.slice(0, 6).map((r) => card(r, r.old)).join(''))] : [])
    ];
    const total = searches.reduce((a, s) => a + s.items.length, 0);
    const subject = total && prices.length ? `Новое по поискам (${total}) и снижение цен` : total ? `Новое по вашим поискам: ${total}` : `Цена снижена: ${prices[0].title}`;
    return make({
      base, support, subject, title: 'Подборка за день', preheader: subject, unsubscribe,
      paragraphs: [`${esc(name)}, вот что появилось по вашим сохранённым поискам и избранному.`, ...parts],
      button: { label: 'Мои поиски', url: `${base}/profile/searches` },
      note: 'Поиски и уведомления настраиваются в профиле: «Поиски» и «Настройки → Уведомления».'
    });
  },
  // Аккаунт заблокирован или разблокирован модератором.
  account: ({ base, support, name, event, reason }) => (event === 'biz-verified' ? make({
    base, support, subject: 'Бизнес подтверждён на Торгане', title: 'Проверка пройдена', preheader: reason,
    paragraphs: [`${esc(name)}, модератор сверил данные: ${esc(reason)}. Теперь у ваших объявлений и в профиле — значок проверенного бизнеса.`],
    button: { label: 'Мои объявления', url: `${base}/profile` }
  }) : event === 'biz-rejected' ? make({
    base, support, subject: 'Проверка бизнеса не пройдена', title: 'Проверка не пройдена', preheader: reason,
    paragraphs: [`${esc(name)}, модератор не смог подтвердить данные бизнеса.`, `<strong style="color:#101010">Что не так:</strong> ${esc(reason)}`, 'Исправьте данные и отправьте заявку заново в «Настройки → Для бизнеса».'],
    button: { label: 'Открыть настройки', url: `${base}/profile/settings#s-biz` }
  }) : event === 'blocked' ? make({
    base, support, subject: 'Аккаунт на Торгане заблокирован', title: 'Аккаунт заблокирован', preheader: reason,
    paragraphs: [`${esc(name)}, модерация заблокировала ваш аккаунт на Торгане. Объявления скрыты из поиска, войти в аккаунт не получится.`,
      `<strong style="color:#101010">Причина:</strong> ${esc(reason)}`, 'Если считаете решение ошибочным, ответьте на это письмо — его прочитает человек.']
  }) : make({
    base, support, subject: 'Аккаунт на Торгане снова работает', title: 'Аккаунт разблокирован', preheader: 'Можно снова входить и размещать объявления',
    paragraphs: [`${esc(name)}, модерация сняла блокировку с вашего аккаунта. Объявления снова видны покупателям.`],
    button: { label: 'Войти на Торгану', url: `${base}/login` }
  })),
  // Модератору: что нового на проверке, в жалобах и в поддержке (сразу или сводкой за час).
  mod: ({ base, support, name, mode, pending, reports, chats, queue }) => {
    const li = (href, text, note = '') => `<li style="margin:0 0 8px"><a href="${esc(base + href)}" style="color:#1F5E4A;font-weight:600;text-decoration:none">${esc(text)}</a>${note ? `<br><span style="font-size:14px;color:#666666">${esc(note)}</span>` : ''}</li>`;
    const block = (title, items) => (items.length ? `<div style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#444444"><strong style="color:#101010">${title} · ${items.length}</strong><ul style="margin:8px 0 0;padding-left:18px">${items.join('')}</ul></div>` : '');
    const parts = [
      block('На проверку', pending.map((l) => li(`/admin/l/${l.id}`, l.title, l.flags || l.checks ? 'есть замечания автопроверки' : ''))),
      block('Жалобы', reports.map((r) => li(`/admin/l/${r.id}`, r.title, r.reason))),
      block('Поддержка', chats.map((m) => li(`/admin?status=support&t=${m.tid}`, m.name, m.body.length > 140 ? `${m.body.slice(0, 140)}…` : m.body)))
    ].filter(Boolean);
    const total = pending.length + reports.length + chats.length;
    return make({
      base, support, subject: mode === 'hourly' ? `Модерация за час: ${total} нов.` : `Модерация: ${total} нов.`, title: mode === 'hourly' ? 'Сводка модерации за час' : 'Новое на модерации',
      preheader: `В очереди: ${queue}`, paragraphs: [`${esc(name)}, вот что появилось. Сейчас в очереди проверки: ${queue}.`, ...parts],
      button: { label: 'Открыть модерацию', url: `${base}/admin` },
      note: `Как часто присылать и о чём — <a href="${esc(base)}/admin?status=notify" style="color:#666666">Модерация → Мои уведомления</a>.`
    });
  },
  test: ({ base, support }) => make({
    base, support, subject: 'Проверка почты Торганы', title: 'Почта работает', preheader: 'Тестовое письмо',
    paragraphs: ['Это тестовое письмо из раздела «Модерация → Почта». Если вы его видите — письма пользователям будут доходить.'],
    button: { label: 'Открыть Торгану', url: base }
  })
};

module.exports = { T, esc };

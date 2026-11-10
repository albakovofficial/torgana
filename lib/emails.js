'use strict';

// Письма Торганы: единый шаблон в стиле сайта (белый фон, графит, изумрудная кнопка).
// Вёрстка таблицами и инлайн-стилями — так письмо одинаково выглядит в Яндекс, Mail.ru, Gmail и Outlook.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const FONT = "Onest,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

function layout({ base, support, preheader, title, paragraphs, button, note, unsubscribe }) {
  // Абзац — строка; готовый блок (список и т. п.) начинается с <div и вставляется как есть.
  const p = paragraphs.map((t) => (t.startsWith('<div') ? t : `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#444444">${t}</p>`)).join('');
  // Кнопка без ссылки под ней: нажимается вся плашка (ссылка — сам блок с фоном), так надёжнее в мобильных почтах.
  const btn = button ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 4px"><tr><td align="center" bgcolor="#3D67D0" style="border-radius:999px;background:#3D67D0">
      <a href="${esc(button.url)}" target="_blank" style="display:block;padding:16px 30px;border-radius:999px;background:#3D67D0;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;mso-padding-alt:0">${esc(button.label)}</a></td></tr></table>` : '';
  const unsub = unsubscribe ? `<br><a href="${esc(unsubscribe)}" style="color:#9A9A96;text-decoration:underline">Отписаться от таких писем</a>` : '';
  const help = support ? `<br>Вопросы — ответьте на это письмо или напишите на <a href="mailto:${esc(support)}" style="color:#9A9A96;text-decoration:underline">${esc(support)}</a>.` : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F3F3F1">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F3F1"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
    <tr><td style="padding:0 4px 20px">
      <a href="${esc(base)}" style="text-decoration:none"><table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td width="34" height="34" style="width:34px;height:34px;border-radius:17px;background:#3D67D0"><img src="cid:tg-logo" width="34" height="34" alt="Т" style="display:block;width:34px;height:34px;border:0;border-radius:17px;color:#ffffff;font-family:${FONT};font-size:18px;font-weight:800;text-align:center;line-height:34px"></td>
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
  // Код подтверждения почты при регистрации и входе. Без кнопки: код вводится на сайте.
  code: ({ base, support, name, code }) => make({
    base, support, subject: `${code} — код подтверждения Торганы`, title: 'Код подтверждения', preheader: `Ваш код: ${code}. Действует 15 минут.`,
    paragraphs: [`${esc(name)}, введите этот код на Торгане, чтобы подтвердить почту:`,
      `<div style="margin:6px 0 18px;padding:20px 12px;border-radius:20px;background:#F3F3F1;text-align:center;font-family:${FONT};font-size:38px;line-height:1;font-weight:800;letter-spacing:10px;color:#101010">${esc(code)}</div>`],
    note: 'Код действует 15 минут. Никому его не сообщайте — сотрудники Торганы никогда не спрашивают коды. Если вы не регистрировались на Торгане, просто удалите это письмо.'
  }),
  // Вход в модерацию с нового устройства — код в письме, устройство запоминается на 30 дней.
  device: ({ base, support, name, code, where }) => make({
    base, support, subject: `${code} — код для входа в модерацию Торганы`, title: 'Вход в модерацию', preheader: `Код: ${code}. Действует 15 минут.`,
    paragraphs: [`${esc(name)}, кто-то открывает модерацию Торганы с нового устройства${where ? ` (${esc(where)})` : ''}. Если это вы — введите код:`,
      `<div style="margin:6px 0 18px;padding:20px 12px;border-radius:20px;background:#F3F3F1;text-align:center;font-family:${FONT};font-size:38px;line-height:1;font-weight:800;letter-spacing:10px;color:#101010">${esc(code)}</div>`,
      'Устройство запомним на 30 дней — потом спросим код снова.'],
    note: 'Если это не вы — никому не сообщайте код и сразу смените пароль в настройках профиля: кто-то знает ваш пароль.'
  }),
  // Служебное письмо владельцу: копия не сделана, мало места, всплеск ошибок.
  ops: ({ base, support, title, lines, url }) => make({
    base, support, subject: `Торгана: ${title}`, title, preheader: lines[0] || title,
    paragraphs: lines.map((l) => esc(l)),
    button: { label: 'Открыть модерацию', url: url || `${base}/admin?status=backup` },
    note: 'Это автоматическое письмо сервера Торганы владельцу сайта. Повтор — не чаще раза в сутки по одной причине (ошибки — раз в час).'
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
  // Одно письмо на все решения модерации: event — rejected | approved | restored | appeal-approved | appeal-denied | scheduled | expired.
  moderation: ({ base, support, name, title, reason, url, event, unsubscribe }) => {
    const V = {
      rejected: ['Объявление отклонено', 'Объявление нужно исправить', `модерация сняла объявление «${esc(title)}».`, 'Причина',
        'Исправьте объявление — после сохранения оно снова появится в поиске. Если считаете решение ошибочным, подайте апелляцию: её рассмотрит человек.', 'Открыть объявление'],
      'appeal-denied': ['Апелляция отклонена', 'Решение осталось прежним', `мы внимательно рассмотрели апелляцию по объявлению «${esc(title)}».`, 'Ответ модератора',
        'Вы можете исправить объявление — после сохранения оно снова появится в поиске.', 'Исправить объявление'],
      restored: ['Объявление снова опубликовано', 'Объявление снова в поиске', `модерация восстановила объявление «${esc(title)}».`, '', 'Оно снова опубликовано и видно покупателям.', 'Открыть объявление'],
      approved: ['Объявление опубликовано', 'Объявление прошло проверку', `модератор проверил объявление «${esc(title)}».`, '', 'Оно опубликовано и видно покупателям.', 'Открыть объявление'],
      'appeal-approved': ['Апелляция одобрена', 'Апелляция одобрена', `мы пересмотрели решение по объявлению «${esc(title)}».`, '', 'Оно снова опубликовано и видно покупателям.', 'Открыть объявление'],
      scheduled: ['Объявление проверено', 'Объявление прошло проверку', `модератор проверил объявление «${esc(title)}».`, 'Публикация', 'Оно появится в поиске в выбранное вами время. Опубликовать раньше можно в «Моих объявлениях».', 'Мои объявления'],
      expired: ['Объявление снято: прошло 30 дней', 'Прошло 30 дней', `объявление «${esc(title)}» провисело 30 дней и снято с публикации.`, '', 'Если ещё актуально — опубликуйте снова в «Моих объявлениях»: это бесплатно, объявление окажется среди свежих.', 'Опубликовать снова']
    }[event];
    return make({
      base, support, subject: `${V[0]}: ${title}`, title: V[1], preheader: reason || V[4], unsubscribe,
      paragraphs: [`${esc(name)}, ${V[2]}`, ...(V[3] && reason ? [`<strong style="color:#101010">${V[3]}:</strong> ${esc(reason)}`] : []), V[4]],
      button: { label: V[5], url }
    });
  },
  // Подборка за день: новое у продавцов из подписок и снижения цен в избранном.
  digest: ({ base, support, name, prices, follows = [], unsubscribe }) => {
    const money = (n) => (n === null || n === undefined ? 'Цена договорная' : `${new Intl.NumberFormat('ru-RU').format(n)} ₽`);
    const card = (r, old) => `<tr><td style="padding:0 0 12px"><a href="${esc(base)}/l/${r.listing_id}" style="display:block;text-decoration:none;color:#101010">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F3F1;border-radius:18px"><tr>
        <td width="76" style="padding:10px"><div style="width:64px;height:64px;border-radius:12px;background:#E7E7E4;overflow:hidden">${r.photo ? `<img src="${esc(base)}/uploads/${esc(r.photo)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border:0">` : ''}</div></td>
        <td style="padding:10px 14px 10px 0;font-family:${FONT}"><div style="font-size:15px;font-weight:600;line-height:1.35">${esc(r.title)}</div>
          <div style="margin-top:4px;font-size:15px;font-weight:700">${money(r.price)}${old ? ` <span style="font-weight:400;color:#9A9A96;text-decoration:line-through">${money(old)}</span>` : ''}</div>
          <div style="margin-top:2px;font-size:13px;color:#666666">${esc(r.city)}</div></td></tr></table></a></td></tr>`;
    const block = (title, rows) => `<div style="margin:0 0 8px"><div style="margin:0 0 10px;font-size:15px;font-weight:700;color:#101010">${title}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></div>`;
    const parts = [
      ...follows.map((f) => `${block(`Новое у продавца ${esc(f.name)} · ${f.items.length}`, f.items.slice(0, 6).map((r) => card(r)).join(''))}<div style="margin:-4px 0 14px;font-size:13px"><a href="${esc(base)}/u/${f.id}" style="color:#3D67D0;font-weight:600;text-decoration:none">Все объявления продавца</a> <span style="color:#C9C9C4">·</span> <a href="${esc(f.unsubscribe)}" style="color:#9A9A96;text-decoration:underline">Отписаться от продавца</a></div>`),
      ...(prices.length ? [block('Цена снижена в избранном', prices.slice(0, 6).map((r) => card(r, r.old)).join(''))] : [])
    ];
    const fromFollows = follows.reduce((a, f) => a + f.items.length, 0);
    const subject = !prices.length ? (follows.length === 1 ? `Новое у продавца ${follows[0].name}: ${fromFollows}` : `Новое у продавцов, на которых вы подписаны: ${fromFollows}`)
      : fromFollows ? `Новое в подписках (${fromFollows}) и снижение цен` : `Цена снижена: ${prices[0].title}`;
    return make({
      base, support, subject, title: 'Подборка за день', preheader: subject, unsubscribe,
      paragraphs: [`${esc(name)}, ${!prices.length ? 'вот что появилось у продавцов, на которых вы подписаны.' : 'вот что нового для вас на Торгане.'}`, ...parts],
      button: follows.length ? { label: 'Мои подписки', url: `${base}/profile/following` } : { label: 'Избранное', url: `${base}/favorites` },
      note: 'Подписки и уведомления настраиваются в профиле: «Подписки» и «Настройки → Уведомления».'
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
  }) : event === 'tm-verified' ? make({
    base, support, subject: 'Бренд подтверждён на Торгане', title: 'Товарный знак подтверждён', preheader: reason,
    paragraphs: [`${esc(name)}, модератор сверил запись в реестре Роспатента: ${esc(reason)}. Рядом с вашим именем на Торгане теперь значок проверенного бренда.`],
    button: { label: 'Мой профиль', url: `${base}/profile` }
  }) : event === 'tm-rejected' ? make({
    base, support, subject: 'Товарный знак не подтверждён', title: 'Проверка не пройдена', preheader: reason,
    paragraphs: [`${esc(name)}, модератор не смог подтвердить товарный знак по реестру Роспатента.`, `<strong style="color:#101010">Что не так:</strong> ${esc(reason)}`, 'Исправьте данные и отправьте заявку заново в «Настройки → Для бизнеса».'],
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
    const li = (href, text, note = '') => `<li style="margin:0 0 8px"><a href="${esc(base + href)}" style="color:#3D67D0;font-weight:600;text-decoration:none">${esc(text)}</a>${note ? `<br><span style="font-size:14px;color:#666666">${esc(note)}</span>` : ''}</li>`;
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
  // Платные услуги: event — paid | refund | plan-ending | promo-stopped | shop-cleared.
  billing: ({ base, support, name, event, title, amount, info, reason, until, url, button }) => {
    const rub = (n) => `${new Intl.NumberFormat('ru-RU').format(n)} ₽`;
    const date = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
    const box = (rows) => `<div style="margin:0 0 14px;padding:16px 18px;background:#F3F3F1;border-radius:16px;font-size:15px;line-height:1.6;color:#101010">${rows.map(([k, v]) => `<div><span style="color:#666666">${k}:</span> <strong>${v}</strong></div>`).join('')}</div>`;
    const V = {
      paid: ['Оплата прошла', 'Спасибо, оплата прошла', [`${esc(name)}, мы получили оплату.`, box([['Услуга', esc(title)], ['Сумма', rub(amount)], ...(info ? [['Что дальше', esc(info)]] : [])]), 'Кассовый чек ЮKassa присылает отдельным письмом.'], 'Открыть «Для бизнеса»'],
      refund: ['Деньги возвращены', 'Возврат оформлен', [`${esc(name)}, мы вернули деньги за услугу «${esc(title)}».`, box([['Сумма возврата', rub(amount)], ...(reason ? [['Причина', esc(reason)]] : [])]), 'Деньги придут тем же способом, которым вы платили: обычно в течение нескольких дней, в зависимости от банка.'], 'Открыть «Для бизнеса»'],
      'plan-ending': ['Тариф заканчивается', 'Тариф скоро закончится', [`${esc(name)}, ${esc(title)} действует до ${date(until)}.`, 'После этого витрина магазина и статистика по всем объявлениям скроются. Объявления останутся опубликованными — размещение бесплатно. Автоплатежей нет: продлите тариф сами, если он нужен.'], 'Продлить тариф'],
      'promo-stopped': ['Продвижение остановлено', 'Продвижение остановлено', [`${esc(name)}, модератор остановил продвижение объявления «${esc(title)}».`, `<strong style="color:#101010">Причина:</strong> ${esc(reason)}`, 'Если считаете решение ошибочным или хотите вернуть деньги за оставшиеся дни, напишите в поддержку.'], 'Открыть «Для бизнеса»'],
      'shop-cleared': ['Витрина магазина очищена', 'Витрина очищена', [`${esc(name)}, модератор убрал описание и обложку витрины вашего магазина.`, `<strong style="color:#101010">Причина:</strong> ${esc(reason)}`, 'Тариф продолжает действовать — заполните витрину заново по правилам площадки.'], 'Открыть витрину']
    }[event];
    return make({ base, support, subject: `${V[0]}${title && event !== 'plan-ending' ? `: ${title}` : ''}`, title: V[1], preheader: V[2][0].replace(/<[^>]+>/g, ''), paragraphs: V[2], button: { label: button || V[3], url } });
  },
  test: ({ base, support }) => make({
    base, support, subject: 'Проверка почты Торганы', title: 'Почта работает', preheader: 'Тестовое письмо',
    paragraphs: ['Это тестовое письмо из раздела «Модерация → Почта». Если вы его видите — письма пользователям будут доходить.'],
    button: { label: 'Открыть Торгану', url: base }
  })
};

module.exports = { T, esc };

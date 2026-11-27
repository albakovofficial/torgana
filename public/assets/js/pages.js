// Информационные страницы и документы.
import { PAY, S, api, app, html, plural, raw } from './core.js';
import { pageCover, tileIc } from './cover.js';
import { ic } from './icons.js';
import { supportAva } from './messages.js';
import { repHow } from './reputation.js';
import { go, setTitle, viewNotFound } from './router.js';

// ================= информационные страницы =================
// 1.62.0: документы (вариант A) — «коротко», плитки главного, нумерованные разделы, запрещённое плитками,
// на компьютере — оглавление сбоку, на телефоне — «Содержание» сверху. Текст документа — с сервера (lib/legal.js), как есть.
// 27.11: шапка документа — общая обложка (cover.js): название, под ним время чтения и редакция, значок справа.
const DOCS = [['rules', 'Правила площадки', 'list', 'teal'], ['terms', 'Пользовательское соглашение', 'edit', 'blue'], ['privacy', 'Конфиденциальность', 'lock', 'purple'],
  ['consent', 'Согласие на обработку данных', 'check', 'green'], ['contacts', 'Реквизиты и контакты', 'store', 'gray']];
const BRIEF_TONES = ['blue', 'red', 'purple', 'yellow'];
const BAN_ICON = [[/наркот/i, 'ban'], [/оруж/i, 'warn'], [/лекарств/i, 'plus'], [/алкогол/i, 'ban'], [/документ/i, 'user'], [/финанс/i, 'card'], [/подделк/i, 'copy'],
  [/шпион/i, 'eye'], [/людьми/i, 'users'], [/эрот/i, 'lock'], [/животн/i, 'shield'], [/экстрем/i, 'flag'], [/маги/i, 'sparkle'], [/опасн/i, 'bolt']];
function docPage(slug, d) {
  const t = document.createElement('template');
  t.innerHTML = d.html; // текст документа собирает сервер (реквизиты экранированы там же)
  const ed = [...t.content.querySelectorAll('p.muted')].find((p) => /^Редакция/.test(p.textContent));
  const edition = ed ? ed.textContent.replace(/\.$/, '') : '';
  if (ed) ed.remove();
  // «Запрещено размещать» — плитки: название, пояснение, закон.
  t.content.querySelectorAll('ol.rules-list > li').forEach((li) => {
    const b = li.querySelector('strong'); const law = li.querySelector('.muted');
    const name = b ? b.textContent.replace(/:$/, '') : '';
    if (b) b.remove(); if (law) law.remove(); li.querySelector('br')?.remove();
    const icon = (BAN_ICON.find(([re]) => re.test(name)) || [, 'ban'])[1];
    li.innerHTML = String(html`<span class="ban-ic">${ic(icon, 18, 2)}</span><b>${name}</b><span class="ban-t">${li.textContent.trim().replace(/^[.:\s]+/, '')}</span>${law ? html`<small>${law.textContent}</small>` : ''}`);
  });
  // Разделы: каждый заголовок h2 с текстом под ним — отдельный блок с номером.
  const intro = []; const secs = [];
  [...t.content.childNodes].forEach((n) => {
    if (n.nodeName === 'H2') secs.push({ id: n.id || `s${secs.length + 1}`, title: n.textContent.replace(/^\d+\.\s*/, ''), body: [] });
    else (secs.length ? secs[secs.length - 1].body : intro).push(n.outerHTML || (n.textContent.trim() ? n.textContent : ''));
  });
  const words = t.content.textContent.split(/\s+/).length;
  const doc = DOCS.find(([k]) => k === slug);
  const toc = html`<div class="doc-toc-h">Содержание</div>${secs.map((x, i) => html`<a href="#${x.id}">${i + 1}. ${x.title}</a>`)}`;
  return html`<div class="wrap doc">
    ${pageCover({ title: d.title, sub: [`${Math.max(1, Math.round(words / 180))} мин чтения`, edition].filter(Boolean).join(' · '), back: '/page/help', icon: doc[2], tone: doc[3] })}
    ${d.lead ? html`<p class="doc-lead"><b>Коротко.</b> ${d.lead}</p>` : ''}
    ${d.brief && d.brief.length ? html`<div class="doc-brief">${d.brief.map(([icon, title, text], i) => html`<div class="doc-tile">${tileIc(icon, BRIEF_TONES[i % 4], 19)}<b>${title}</b><span>${text}</span></div>`)}</div>` : ''}
    ${secs.length > 2 ? html`<details class="doc-toc-m"><summary>${ic('list', 18, 2)}Содержание · ${secs.length} ${plural(secs.length, 'раздел', 'раздела', 'разделов')}${ic('down', 16, 2.2)}</summary><nav>${secs.map((x, i) => html`<a href="#${x.id}">${i + 1}. ${x.title}</a>`)}</nav></details>` : ''}
    <div class="doc-lay">
      <nav class="doc-toc" aria-label="Содержание">${toc}<div class="doc-toc-h other">Другие документы</div>${DOCS.filter(([k]) => k !== slug).map(([k, label]) => html`<a href="/page/${k}">${label}</a>`)}</nav>
      <article class="doc-body">${raw(intro.join(''))}${secs.map((x, i) => html`<section class="doc-sec" id="${x.id}"><h2><span class="doc-n">${i + 1}</span>${x.title}</h2>${raw(x.body.join(''))}</section>`)}
        <nav class="doc-more" aria-label="Другие документы">${DOCS.filter(([k]) => k !== slug).map(([k, label, icon]) => html`<a href="/page/${k}"><span>${ic(icon, 18, 2)}</span>${label}${ic('right', 16, 2)}</a>`)}</nav>
      </article>
    </div>
  </div>`;
}

const LEGAL = new Set(DOCS.map(([k]) => k));
// 27.11: «Помощь» на одном шаблоне — шапка-обложка (cover.js), плитки тем 2×3, частые вопросы, поддержка.
// Темы — один список: плитки, шапки тем и «Другие темы». Частые вопросы — SUPPORT_FAQ (lib/constants.js, через /api/config).
const TOPICS = [
  { k: 'search', t: 'Как искать', sub: 'Пишите, как сказали бы человеку', icon: 'search', tone: 'blue', more: ['safety', 'sell'] },
  { k: 'sell', t: 'Как продавать', sub: 'Фото, цена, проверка модератором', icon: 'tag', tone: 'red', more: ['rules', 'deals'] },
  { k: 'safety', t: 'Безопасность', sub: 'Как не попасться мошенникам', icon: 'shield', tone: 'purple', more: ['deals', 'support'] },
  { k: 'deals', t: 'Сделки и репутация', sub: 'Уровни, подтверждение, жалобы', icon: 'handshake', tone: 'yellow', more: ['safety', 'sell'] },
  { k: 'rules', t: 'Правила площадки', sub: 'Что можно и нельзя размещать', icon: 'list', tone: 'teal' },
  { k: 'support', t: 'Поддержка', sub: 'Чат с людьми, почта', icon: 'chat', tone: 'green', more: ['safety', 'rules'] }
];
const topic = (k) => TOPICS.find((x) => x.k === k);
const CARD_MARK = { bad: 'close', ok: 'check', info: 'info' };
// Карточка темы: красная — нельзя, зелёная — можно, синяя — полезно.
const card = (kind, title, items) => html`<section class="hcard ${kind}"><h2>${title}</h2><ul>${items.map((li) => html`<li><span class="hcard-m">${ic(CARD_MARK[kind], 13, 2.8)}</span><span>${li}</span></li>`)}</ul></section>`;
const askCard = () => html`<a class="help-ask" href="/messages/support">${supportAva(48)}<span><b>Не нашли ответ?</b><small>Отвечают люди, а не боты</small></span><span class="btn btn-accent btn-sm">Написать</span></a>`;
const findKey = (...t) => t.join(' ').toLowerCase();

function viewHelpHub() {
  setTitle('Помощь и безопасность');
  const faq = S.config.supportFaq || [];
  app.innerHTML = String(html`<div class="wrap help">
    ${pageCover({ title: 'Помощь и безопасность', sub: 'Всё о покупках, продаже и защите от мошенников.', icon: 'info', tone: 'blue',
      below: html`<label class="help-find">${ic('search', 20, 2.2)}<input type="search" placeholder="Найти ответ" aria-label="Найти ответ" data-help-find></label>` })}
    <div class="help-tiles" data-find-group>${TOPICS.map((x) => html`<a class="help-tile" href="/page/${x.k}" data-find="${findKey(x.t, x.sub)}">${tileIc(x.icon, x.tone)}<b>${x.t}</b><small>${x.sub}</small></a>`)}</div>
    <div data-find-group><h2 class="help-h">Частые вопросы</h2>
      <div class="help-faq">${faq.map(([q, a]) => html`<details data-find="${findKey(q, a)}"><summary>${q}${ic('down', 18, 2.2)}</summary><p>${a}</p></details>`)}</div></div>
    <p class="help-none" hidden>Ничего не нашли — спросите поддержку, ответим.</p>
    ${askCard()}
    <nav class="help-more" aria-label="Документы"><a href="/page/terms">${ic('edit', 18, 2)}Правила и документы${ic('right', 16, 2)}</a><a href="/page/contacts">${ic('store', 18, 2)}Реквизиты и контакты${ic('right', 16, 2)}</a></nav>
  </div>`);
  // Поиск по темам и вопросам — прямо на странице: прячет то, что не подходит.
  const find = app.querySelector('[data-help-find]');
  find.addEventListener('input', () => {
    const v = find.value.trim().toLowerCase();
    let shown = 0;
    app.querySelectorAll('[data-find-group]').forEach((g) => {
      let n = 0;
      g.querySelectorAll('[data-find]').forEach((el) => { el.hidden = !!v && !el.dataset.find.includes(v); n += !el.hidden; });
      g.hidden = !n; shown += n;
    });
    app.querySelector('.help-none').hidden = shown > 0;
  });
}

// Содержимое тем. Тексты описывают ровно то, что умеет сайт (условия — как в Правилах и lib/reputation.js).
function topicBody(k) {
  const email = S.config.supportEmail;
  const contact = email ? html`<a href="mailto:${email}">${email}</a>` : html`через форму на сайте`;
  const q = (t) => html`<a class="help-q" href="/search?q=${encodeURIComponent(t)}">${ic('search', 16, 2.2)}${t}</a>`;
  switch (k) {
    case 'search': return html`
      <section class="hcard info"><h2>Попробуйте</h2><div class="help-qs">${q('коляска до 15 000 с доставкой')}${q('iPhone от 40 тыс в Казани')}${q('диван до 20к в Москве')}${q('ноутбук от 30к до 60к')}</div></section>
      ${card('ok', 'Что понимает поиск', [
        html`<b>Цену</b> со словами «до» и «от»: числом, с «тыс», «к» или «млн» — например, «до 20к» или «от 2 млн».`,
        html`<b>Доставку</b> — «с доставкой» оставит объявления, где продавец её предлагает.`,
        html`<b>Город</b> — назовите крупный город («в Казани») или выберите его кнопкой в строке поиска.`,
        html`<b>Опечатки</b> — если по запросу пусто, Торгана поищет похожее слово («айфн» → «айфон») и скажет об этом. Там же — «Искать как написано».`,
        'Слова вроде «купить», «продам» или «б/у» поиск пропускает — они не сужают выдачу.'])}
      <h2>Как уточнить выдачу</h2>
      <p>Фильтры: категория и раздел, характеристики (марка, год, размер), город и метро, цена, доставка, «Торг уместен» и «Возможен обмен». Сортировка — сначала новые, дешевле или дороже.</p>
      <h2>Как не пропустить нужное</h2>
      <p><b>Избранное</b> — нажмите на сердечко; если продавец снизит цену, придёт уведомление. <b>Подписка</b> в профиле продавца — узнаете о его новых объявлениях.</p>
      <h2>Честная выдача</h2>
      <p>Платное продвижение не меняет порядок объявлений: такие карточки только заметнее — крупнее, в рамке или с метками на фото. Реклама — отдельным блоком с пометкой «Реклама».</p>`;
    case 'sell': return html`
      ${card('ok', 'Перед публикацией', [
        html`<b>Фото</b> — свои, при хорошем свете. Первое видно в ленте и поиске.`,
        html`<b>Название</b> — что это и главное: модель, размер, объём памяти.`,
        html`<b>Цена</b> — в рублях и за то, что на фото. Можно отметить торг, обмен и доставку.`,
        html`<b>Описание</b> — состояние, комплектация, честно о дефектах.`])}
      ${card('bad', 'Нельзя', [
        html`<b>Телефоны и ссылки</b> в тексте и на фото — покупатели пишут в чат Торганы.`,
        html`Запрещённые товары — список в <a href="/page/rules">Правилах площадки</a>.`])}
      <h2>Проверка</h2>
      <p>Каждое объявление и каждую правку модератор проверяет до публикации — обычно это несколько часов. Если отклонили, причина видна в профиле: исправьте объявление или подайте апелляцию — её рассмотрит человек. Объявление показывается 30 дней, потом его можно бесплатно опубликовать снова.</p>
      ${card('info', 'Как продать быстрее', [
        'Отвечайте быстро — покупатели видят, как скоро продавец отвечает.',
        html`Подтверждайте сделки в чате — растёт <a href="/page/deals">репутация</a>, а с ней доверие.`,
        ...(PAY ? ['Продвижение на 7 дней делает карточку заметнее: крупнее, в рамке или с метками. Порядок выдачи оно не меняет.'] : [])])}`;
    case 'safety': return html`
      ${card('bad', 'Чего никогда не делать', [
        'Не переходите в мессенджеры по просьбе собеседника.',
        'Не называйте коды из СМС, CVV/CVC и данные карты — для получения денег они не нужны.',
        'Не переходите по ссылкам «для получения оплаты» или «оформления доставки».',
        'Не вносите предоплату незнакомым продавцам.'])}
      ${card('ok', 'Как покупать спокойно', [
        'Общайтесь в чате Торганы — переписка сохраняется.',
        'Встречайтесь в людных местах и проверяйте товар до оплаты.',
        'Смотрите репутацию продавца: уровень, подтверждённые сделки и жалобы.',
        'Цена намного ниже, чем у похожих, и спешка («только сегодня», «уже едут другие») — повод насторожиться.'])}
      ${card('info', 'Если что-то пошло не так', [
        'О подозрительном объявлении сообщите кнопкой «Пожаловаться» на его странице.',
        html`Напишите в <a href="/messages/support">поддержку</a> или на почту: ${contact}.`,
        'Перевели деньги или назвали данные карты — сразу позвоните в свой банк, затем обратитесь в полицию.'])}
      <h2>Что делает Торгана</h2>
      <ul><li>Модератор проверяет каждое объявление и каждую правку до публикации.</li>
        <li>Если собеседник предлагает уйти в мессенджер или заплатить вне Торганы, чат покажет предупреждение.</li>
        <li>Сделка попадает в репутацию, только когда её подтвердили обе стороны после переписки. Накрутку отсеиваем: повторные и встречные сделки, новые аккаунты без телефона.</li>
        <li>Значки «Телефон подтверждён», «ИП проверен» и «Компания проверена» появляются только после подтверждения.</li>
        <li>Сотрудники Торганы никогда не спрашивают пароль и коды из СМС.</li></ul>
      <p>Торгана не участвует в расчётах: оплату и передачу товара покупатель и продавец согласуют между собой.</p>`;
    case 'deals': return html`
      ${card('ok', 'Как это работает', [
        html`<b>Сделка</b> засчитывается, когда её подтвердили обе стороны в чате после переписки по объявлению.`,
        html`<b>Комплименты</b> — из списка и только после сделки.`,
        html`<b>Что-то пошло не так?</b> Нажмите это в чате — жалобу разберёт модератор, а вторая сторона сможет один раз объяснить свою позицию. Подтверждённая жалоба видна в профиле и на 90 дней снижает уровень.`])}
      ${card('bad', 'Накрутка не работает', ['Договорные подтверждения и повторные сделки между одними и теми же людьми не засчитываются, а за накрутку аккаунт блокируют.'])}
      <h2>Уровни</h2>
      ${repHow()}
      <p>Свой уровень и задания до следующего — в профиле, вкладка «Репутация».</p>`;
    case 'support': return html`
      ${card('info', 'Как написать быстрее', [
        '«Поддержка Торганы» всегда первая в «Сообщениях». В чат можно отправить фото или скриншот.',
        'Если вопрос об объявлении или диалоге — пришлите ссылку на него.',
        html`Почта: ${contact} — ответим туда же или в чат; если включены уведомления, дадим знать push или письмом.`])}
      <p>Реквизиты — на странице <a href="/page/contacts">«Реквизиты и контакты»</a>.</p>`;
    default: return null;
  }
}
const LEADS = {
  search: 'Цену, доставку и город Торгана поймёт сама.',
  sell: 'Бесплатно. Хорошие фото и честное описание продают быстрее.',
  safety: 'Мошенники уводят из чата Торганы, чтобы получить деньги или данные карты.',
  deals: 'Репутация растёт только от настоящих сделок.',
  support: 'Отвечаем людьми, а не шаблонами.'
};

export async function viewPage(slug) {
  if (slug === 'business') { go('/business', true); return; }
  if (slug === 'help') { viewHelpHub(); return; }
  if (LEGAL.has(slug)) {
    const d = await api('GET', `/api/pages/${slug}`);
    setTitle(d.title);
    app.innerHTML = String(docPage(slug, d));
    const to = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (to) to.scrollIntoView({ block: 'start' });
    return;
  }
  const t = topic(slug); const body = t && topicBody(slug);
  if (!body) { viewNotFound(); return; }
  setTitle(t.t);
  const below = slug === 'support' ? html`<a class="btn btn-accent help-write" href="/messages/support">${ic('chat', 18, 2.2)}Написать в поддержку</a>` : '';
  app.innerHTML = String(html`<div class="wrap help">
    ${pageCover({ title: t.t, sub: LEADS[slug], back: '/page/help', icon: t.icon, tone: t.tone, below })}
    <article class="help-art">${body}</article>
    <h2 class="help-h">Другие темы</h2>
    <div class="help-tiles sm">${t.more.map((k) => topic(k)).map((x) => html`<a class="help-tile" href="/page/${x.k}">${tileIc(x.icon, x.tone, 20)}<b>${x.t}</b></a>`)}</div>
    ${slug === 'support' ? '' : askCard()}
  </div>`);
}

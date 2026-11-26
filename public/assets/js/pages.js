// Информационные страницы и документы.
import { S, api, app, html, plural, raw } from './core.js';
import { ic } from './icons.js';
import { supportAva } from './messages.js';
import { go, setTitle, viewNotFound } from './router.js';

// ================= информационные страницы =================
// 1.62.0: документы (вариант A) — шапка с «коротко», плитки главного, нумерованные разделы, запрещённое плитками,
// на компьютере — оглавление сбоку, на телефоне — «Содержание» сверху. Текст документа — с сервера (lib/legal.js), как есть.
const DOCS = [['rules', 'Правила площадки', 'list'], ['terms', 'Пользовательское соглашение', 'edit'], ['privacy', 'Конфиденциальность', 'lock'], ['consent', 'Согласие на обработку данных', 'check'], ['contacts', 'Реквизиты и контакты', 'store']];
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
  const toc = html`<div class="doc-toc-h">Содержание</div>${secs.map((x, i) => html`<a href="#${x.id}">${i + 1}. ${x.title}</a>`)}`;
  return html`<div class="wrap doc">
    <div class="doc-crumbs"><a href="/page/help">Помощь</a> › Правила и документы</div>
    <header class="doc-hero"><span class="doc-hero-ic">${ic((DOCS.find(([k]) => k === slug) || [, , 'list'])[2], 26, 2)}</span>
      <h1>${d.title}</h1>${d.lead ? html`<p><b>Коротко.</b> ${d.lead}</p>` : ''}
      <div class="doc-meta"><span>${ic('clock', 14, 2)}${Math.max(1, Math.round(words / 180))} мин чтения</span>${edition ? html`<span>${edition}</span>` : ''}</div></header>
    ${d.brief && d.brief.length ? html`<div class="doc-brief">${d.brief.map(([icon, title, text], i) => html`<div class="doc-tile"><span class="doc-tile-ic t${i % 4}">${ic(icon, 19, 2.2)}</span><b>${title}</b><span>${text}</span></div>`)}</div>` : ''}
    ${secs.length > 2 ? html`<details class="doc-toc-m"><summary>${ic('list', 18, 2)}Содержание · ${secs.length} ${plural(secs.length, 'раздел', 'раздела', 'разделов')}${ic('down', 16, 2.2)}</summary><nav>${secs.map((x, i) => html`<a href="#${x.id}">${i + 1}. ${x.title}</a>`)}</nav></details>` : ''}
    <div class="doc-lay">
      <nav class="doc-toc" aria-label="Содержание">${toc}<div class="doc-toc-h other">Другие документы</div>${DOCS.filter(([k]) => k !== slug).map(([k, label]) => html`<a href="/page/${k}">${label}</a>`)}</nav>
      <article class="doc-body">${raw(intro.join(''))}${secs.map((x, i) => html`<section class="doc-sec" id="${x.id}"><h2><span class="doc-n">${i + 1}</span>${x.title}</h2>${raw(x.body.join(''))}</section>`)}
        <nav class="doc-more" aria-label="Другие документы">${DOCS.filter(([k]) => k !== slug).map(([k, label, icon]) => html`<a href="/page/${k}"><span>${ic(icon, 18, 2)}</span>${label}${ic('right', 16, 2)}</a>`)}</nav>
      </article>
    </div>
  </div>`;
}

const LEGAL = new Set(['terms', 'rules', 'privacy', 'consent', 'contacts']);
export async function viewPage(slug) {
  if (slug === 'business') { go('/business', true); return; }
  if (LEGAL.has(slug)) {
    const d = await api('GET', `/api/pages/${slug}`);
    setTitle(d.title);
    app.innerHTML = String(docPage(slug, d));
    const to = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (to) to.scrollIntoView({ block: 'start' });
    return;
  }
  const email = S.config.supportEmail;
  const contact = email ? html`<a href="mailto:${email}" style="text-decoration:underline">${email}</a>` : html`через форму на сайте (адрес поддержки появится здесь)`;
  const q = (t) => html`<li class="help-q">${ic('search', 17)}<a href="/search?q=${encodeURIComponent(t)}">${t}</a></li>`;
  // 1.31 (вариант A): у страниц помощи слева общее меню, справа статья. Тексты описывают ровно то, что умеет сайт.
  const PAGES = {
    help: ['Как искать', html`
      <p class="help-lead">Пишите в поиск так, как сказали бы человеку. Торгана сама поймёт цену, доставку и город.</p>
      <section class="help-box"><h2>Примеры запросов</h2><ul class="help-qs">
        ${q('коляска до 15 000 с доставкой')}${q('iPhone от 40 тыс в Казани')}${q('диван до 20к в Москве')}${q('ноутбук от 30к до 60к')}</ul>
        <p class="help-note">Нажмите на пример — откроется выдача.</p></section>
      <h2>Что понимает поиск</h2>
      <ul><li><b>Цену</b> со словами «до» и «от»: числом, с «тыс», «к» или «млн» — например, «до 20к» или «от 2 млн».</li>
        <li><b>Доставку</b> — слова «с доставкой» оставят только объявления, где продавец её предлагает.</li>
        <li><b>Город</b> — если назвать крупный город («в Казани»), поиск покажет объявления оттуда. Город также можно выбрать кнопкой в строке поиска.</li>
        <li><b>Опечатки</b> — если по запросу ничего нет, Торгана поищет похожее слово из объявлений («айфн» → «айфон») и скажет об этом над выдачей. Там же — ссылка «Искать как написано».</li>
        <li>Слова вроде «купить», «продам» или «б/у» поиск пропускает — они не сужают выдачу.</li></ul>
      <h2>Как уточнить выдачу</h2>
      <p>В выдаче есть фильтры: категория и раздел, характеристики раздела (например, марка, год или размер), город и метро, цена, доставка, «Торг уместен» и «Возможен обмен». Сортировка — сначала новые, дешевле или дороже.</p>
      <h2>Как не пропустить нужное</h2>
      <ul><li><b>Избранное.</b> Нажмите на сердечко — объявление сохранится в «Избранном». Если продавец снизит цену, придёт уведомление.</li>
        <li><b>Подписка на продавца.</b> Кнопка «Подписаться» в профиле продавца — узнаете о его новых объявлениях.</li></ul>
      <h2>Честная выдача</h2>
      <p>Платное продвижение не меняет порядок объявлений: такие карточки только заметнее — крупнее, в рамке или с метками на фото. Реклама показывается отдельным блоком с пометкой «Реклама».</p>`],
    safety: ['Безопасность', html`
      <p class="help-lead">Большинство мошеннических схем строится на одном: увести вас из чата площадки и получить деньги или данные карты.</p>
      <section class="help-box bad"><h2>Чего никогда не делать</h2><ul>
        <li>Не переходите в мессенджеры по просьбе собеседника.</li>
        <li>Не называйте коды из СМС, CVV/CVC и данные карты — для получения денег они не нужны.</li>
        <li>Не переходите по ссылкам «для получения оплаты» или «оформления доставки».</li>
        <li>Не вносите предоплату незнакомым продавцам.</li></ul></section>
      <section class="help-box ok"><h2>Как покупать спокойно</h2><ul>
        <li>Общайтесь в чате Торганы — переписка сохраняется.</li>
        <li>Встречайтесь в людных местах и проверяйте товар до оплаты.</li>
        <li>Смотрите репутацию продавца: уровень, подтверждённые сделки и жалобы.</li>
        <li>Цена намного ниже, чем у похожих объявлений, и спешка («только сегодня», «уже едут другие») — повод насторожиться.</li></ul></section>
      <h2>Что делает Торгана</h2>
      <ul><li>Модератор проверяет каждое объявление и каждую правку до публикации.</li>
        <li>Если собеседник в чате предлагает уйти в мессенджер или заплатить вне Торганы, мы показываем предупреждение.</li>
        <li>Сделка попадает в репутацию, только когда её подтвердили обе стороны после переписки. Накрутку отсеиваем: повторные и встречные сделки, новые аккаунты без телефона.</li>
        <li>Значки «Телефон подтверждён», «ИП проверен» и «Компания проверена» появляются только после подтверждения.</li>
        <li>Сотрудники Торганы никогда не спрашивают пароль и коды из СМС.</li></ul>
      <p>Торгана не участвует в расчётах между покупателем и продавцом: оплату и передачу товара вы согласуете между собой.</p>
      <h2>Если что-то пошло не так</h2>
      <ul><li>О подозрительном объявлении сообщите кнопкой «Пожаловаться» на его странице.</li>
        <li>Напишите в <a href="/messages/support">поддержку</a> или на почту: ${contact}.</li>
        <li>Если вы перевели деньги или назвали данные карты — сразу позвоните в свой банк, а затем обратитесь в полицию.</li></ul>`],
    support: ['Поддержка', html`
      <p class="help-lead">Мы отвечаем людьми, а не шаблонами.</p>
      <section class="help-contact">${supportAva(52)}
        <div><b>Быстрее всего — в чате</b><span>«Поддержка Торганы» всегда закреплена первой в «Сообщениях». В чат можно отправить фото или скриншот.</span></div>
        <a class="btn btn-accent" href="/messages/support">Написать в поддержку</a></section>
      <p>Или на почту: ${contact}. Укажите ссылку на объявление или диалог, если вопрос о них. На сообщение в чате ответим там же, а если включены уведомления — дадим знать push или письмом. Реквизиты — на странице <a href="/page/contacts">«Реквизиты и контакты»</a>.</p>
      <h2>Частые вопросы</h2>
      <div class="help-faq">${(S.config.supportFaq || []).map(([t, a]) => html`<div><b>${t}</b><p>${a}</p></div>`)}
      </div>`]
  };
  const p = PAGES[slug];
  if (!p) { viewNotFound(); return; }
  setTitle(p[0]);
  const NAV = [['help', 'Как искать'], ['safety', 'Безопасность'], ['support', 'Поддержка'], ['rules', 'Правила площадки'], ['contacts', 'Реквизиты и контакты']];
  app.innerHTML = String(html`<div class="wrap"><div class="help">
    <nav class="help-nav" aria-label="Помощь"><span class="help-nav-h">Помощь</span>${NAV.map(([k, t]) => html`<a href="/page/${k}" class="${k === slug ? 'on' : ''}"${k === slug ? raw(' aria-current="page"') : ''}>${t}</a>`)}</nav>
    <article class="page help-art"><div class="help-crumbs">Помощь › ${p[0]}</div><h1>${p[0]}</h1>${p[1]}</article>
  </div></div>`);
}

// Шапка внутренних страниц (решение 27.11, «одна строка»): «‹», заголовок, значок раздела справа, подпись под заголовком.
// Одна на весь сайт: помощь, документы, профиль, настройки, избранное, переписка. В приложении её рисует само
// приложение (PageCover): страница отдаёт ему заголовок, подпись, значок и цвет через data-атрибуты .pcover.
import { html } from './core.js';
import { ic } from './icons.js';

// Плитка со значком: квадрат со скруглением и градиентом тона (blue, red, purple, yellow, teal, green, gray).
// Те же плитки — у тем помощи и «главного» в документах.
export const tileIc = (icon, tone = 'blue', size = 22) => html`<span class="tile-ic t-${tone}" aria-hidden="true">${ic(icon, size, 2)}</span>`;

// title — заголовок (h1); sub — строка под ним; back — куда ведёт «‹»; icon/tone — значок справа;
// side — своё вместо значка (кнопка); below — содержимое обложки под заголовком (поиск, вкладки, кнопка); cls — класс обложки.
export function pageCover({ title, sub = '', back = '/', icon = '', tone = 'blue', side = '', below = '', cls = '' }) {
  return html`<header class="pcover ${cls}" data-title="${typeof title === 'string' ? title : ''}" data-sub="${typeof sub === 'string' ? sub : ''}" data-icon="${icon}" data-tone="${tone}">
    <div class="pc-row">
      <a href="${back}" class="pc-back" aria-label="Назад">${ic('left', 20, 2.2)}</a>
      <div class="pc-tx"><h1>${title}</h1>${sub ? html`<p class="pc-sub">${sub}</p>` : ''}</div>
      ${side || (icon ? tileIc(icon, tone, 24) : '')}
    </div>
    ${below}
  </header>`;
}

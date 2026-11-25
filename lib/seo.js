'use strict';

// Страницы для поисковиков и мессенджеров. Сайт — одностраничное приложение, поэтому сервер сам кладёт в index.html:
// - <title>, description, canonical, robots (закрытые разделы — noindex), Open Graph и Twitter (карточка при пересылке
//   ссылки, с подписью к фото), разметку schema.org: организация и сайт (главная), объявление — Product/Offer с маркой
//   и характеристиками, хлебные крошки, список объявлений раздела (ItemList), частые вопросы поддержки (FAQPage);
// - снимок содержимого в <main id="app">: заголовок, цена, фото, характеристики, описание, ссылки на разделы, города
//   и похожие объявления — его читают Яндекс и Google, а браузер сразу заменяет его настоящей страницей;
// - код подтверждения Вебмастера и Search Console (их вводит модератор).
// Отсюда же — /sitemap.xml (с фото объявлений) и /robots.txt, а для блока «О разделе» на сайте — sectionInfo.
// 1.58.0: заголовки разделов под запросы («…: купить, 120 объявлений, цены от 3 500 ₽»), «Частые вопросы» о покупках
// на Торгане (видны на сайте и размечены FAQPage), фид для Яндекс Товаров (/feeds/yandex.yml), удалённое
// объявление — 410, адрес без названия — 301 на адрес с названием. Сообщить Яндексу об изменениях — lib/indexnow.js.
// Все тексты собираются из настоящих данных: число объявлений, цены, разделы. Ничего не выдумываем.
//
// Адреса разделов (1.33): /c/:категория, /c/:категория/:раздел, /c/:категория/:город, /c/:категория/:раздел/:город.
// id разделов — латиница с «_» (lib/taxonomy.js), города — транслит через «-»: спутать нельзя.
const { CATEGORIES, CITIES, SUPPORT_FAQ } = require('./constants');
const { SUBCATS, SUB, describe, summaryOf } = require('./taxonomy');

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
// «Велосипед Stels 26"» → velosiped-stels-26 (то же правило — в app.js).
const slugify = (s) => String(s || '').toLowerCase().split('').map((c) => (TR[c] !== undefined ? TR[c] : c)).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
const CITY_BY_SLUG = Object.fromEntries(CITIES.map((c) => [slugify(c), c]));
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
// Предложный падеж для заголовков «в Казани»: самые частые; для остальных — «город Х».
const IN_CITY = { Москва: 'в Москве', 'Санкт-Петербург': 'в Санкт-Петербурге', Новосибирск: 'в Новосибирске', Екатеринбург: 'в Екатеринбурге', Казань: 'в Казани', 'Нижний Новгород': 'в Нижнем Новгороде', Челябинск: 'в Челябинске', Красноярск: 'в Красноярске', Самара: 'в Самаре', Уфа: 'в Уфе', 'Ростов-на-Дону': 'в Ростове-на-Дону', Омск: 'в Омске', Краснодар: 'в Краснодаре', Воронеж: 'в Воронеже', Пермь: 'в Перми', Волгоград: 'в Волгограде', Саратов: 'в Саратове', Тюмень: 'в Тюмени', Тольятти: 'в Тольятти', Ижевск: 'в Ижевске', Барнаул: 'в Барнауле' };
const inCity = (c) => IN_CITY[c] || `в городе ${c}`;
const cityLc = (c) => String(c).toLowerCase().replace(/ё/g, 'е');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };
const NF = new Intl.NumberFormat('ru-RU');
const priceText = (p, unit) => (p === null || p === undefined ? 'цена договорная' : `${NF.format(p)} ₽${unit ? ` за ${unit}` : ''}`);
const plural = (n, one, few, many) => { const a = n % 10; const b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const ads = (n) => `${NF.format(n)} ${plural(n, 'объявление', 'объявления', 'объявлений')}`;
const listingPath = (l) => `/l/${l.id}${slugify(l.title) ? `-${slugify(l.title)}` : ''}`;
const sectionPath = (cat, sub, city) => `/c/${cat}${sub ? `/${sub}` : ''}${city ? `/${slugify(city)}` : ''}`;
const parseAttrs = (s) => { try { const a = JSON.parse(s || '{}'); return a && typeof a === 'object' ? a : {}; } catch { return {}; } };

// Закрытые от поиска разделы: личное, служебное, формы.
// Все адреса сайта (как в роутере app.js) — остальное отдаём с кодом 404 (1.35.1).
const KNOWN = /^\/(search|new|login|register|forgot|reset|verify|unsubscribe|confirm|favorites|business|admin|admin\/device|edit\/\d+|pay\/[\w-]+|admin\/(l|u)\/\d+|messages(\/(\d+|support))?|profile(\/(listings|settings|reputation|reviews|following|stats\/\d+|business(\/(shop|stats|feed))?))?)$/;
const PRIVATE = /^\/(profile|messages|admin|new|edit|login|register|confirm|forgot|reset|verify|unsubscribe|pay|favorites|search)(\/|$)/;

// Страницы помощи и документы: свой заголовок и описание у каждой (раньше у всех был заголовок главной).
const PAGES = {
  help: ['Как искать на Торгане — поиск обычными словами', 'Пишите в поиск так, как сказали бы человеку: «коляска до 15 000 с доставкой», «iPhone от 40 тыс в Казани». Фильтры, избранное и подписки на продавцов.', 'Как искать'],
  safety: ['Как не попасться мошенникам — безопасность на Торгане', 'Чего никогда не делать, как покупать спокойно и что делать, если обманули: жалоба на объявление, поддержка, банк и полиция. Что делает Торгана для безопасности сделок.', 'Безопасность'],
  support: ['Поддержка Торганы — отвечают люди, а не боты', 'Как связаться с поддержкой Торганы: чат на сайте и почта. Ответы на частые вопросы: модерация объявлений, стоимость размещения, срок показа, удаление аккаунта.', 'Поддержка'],
  rules: ['Правила площадки Торгана', 'Что можно и что нельзя размещать на Торгане: запрещённые и ограниченные товары и услуги, требования к объявлениям, репутация, продвижение и реклама.', 'Правила площадки'],
  terms: ['Пользовательское соглашение Торганы', 'Условия использования площадки объявлений Торгана, в том числе платных услуг: тарифов для бизнеса и продвижения объявлений.', 'Пользовательское соглашение'],
  privacy: ['Политика обработки персональных данных — Торгана', 'Какие персональные данные обрабатывает Торгана, зачем, как долго хранит и как ими распорядиться.', 'Политика конфиденциальности'],
  consent: ['Согласие на обработку персональных данных — Торгана', 'Текст согласия на обработку персональных данных при регистрации и использовании Торганы.', 'Согласие на обработку данных'],
  contacts: ['Реквизиты и контакты Торганы', 'Реквизиты оператора площадки Торгана и способы связи: поддержка на сайте и по почте.', 'Реквизиты и контакты']
};

// Что делают в разделе — для заголовка: «Автомобили в Москве: купить, …», «Квартиры — аренда в Казани: снять, …».
const VERB_SUB = { flats: 'купить', land: 'купить', flats_rent: 'снять', daily: 'снять посуточно', vacancies: 'свежие вакансии', resumes: '' };
const VERB_CAT = { realty: 'купить или снять', jobs: '', services: '' };
const verbOf = (category, sub) => (sub in VERB_SUB ? VERB_SUB[sub] : category in VERB_CAT ? VERB_CAT[category] : 'купить');
const rub = (n) => `${NF.format(n)} ₽`;

// Фид для Яндекс Товаров: только вещи (без недвижимости, работы, услуг, авто и живых животных), с ценой за штуку и фото.
const FEED = { electronics: null, personal: null, home: ['furniture', 'appliances', 'build', 'kitchen', 'garden'], hobby: ['bikes', 'sport', 'books', 'collect', 'music', 'hunting'], transport: ['parts'], animals: ['pet_goods'], business: ['equipment'] };

// «Частые вопросы» на страницах разделов — о покупках на Торгане (как сайт работает), общими словами, без чисел раздела.
function faqOf(info) {
  const n = info.count;
  if (!n) return [];
  const jobs = info.category === 'jobs';
  const goods = !['realty', 'jobs', 'services'].includes(info.category);
  const out = jobs ? [
    ['Вакансии проверяются?', 'Да. Каждое объявление перед публикацией проверяет модератор: не пропускаем вакансии с оплатой «за обучение», сомнительные схемы и дубли.'],
    ['Как связаться с работодателем?', 'Нажмите «Написать» на странице вакансии — переписка идёт в чате Торганы, работодатель получит уведомление. Свой телефон показывать не нужно.'],
    ['Сколько стоит разместить вакансию или резюме?', 'Бесплатно и без лимитов. Платно — только по желанию: продвижение объявления и тарифы для компаний.'],
    ['Как не попасться на обман?', 'Не платите за обучение, форму или оформление и не отправляйте фото паспорта до встречи. Если вакансия выглядит странно — пожалуйтесь на объявление, модератор проверит.']
  ] : [
    ...(goods ? [['Можно ли купить с доставкой?', 'Да, многие продавцы отправляют покупки по всей России. Включите фильтр «С доставкой» — останутся только такие объявления, а детали отправки уточните у продавца в чате.']] : []),
    ['Можно ли торговаться?', 'Да. Предложите свою цену прямо на странице объявления или в чате — продавец ответит, согласен он или нет, а может назвать свою.'],
    ['Как связаться с продавцом?', 'Нажмите «Написать продавцу» на странице объявления — переписка идёт в чате Торганы, продавец получит уведомление. Свой телефон показывать не нужно.'],
    ['Как понять, что продавцу можно доверять?', 'Смотрите профиль: уровень продавца («Надёжный», «Опытный», «Мастер Торганы») и число сделок за год. У проверенных компаний и ИП — отметка о проверке, у подтвердивших номер — «Телефон подтверждён».'],
    ['Объявления проверяются?', 'Да. Каждое объявление и каждую правку перед публикацией смотрит модератор: запрещённые товары, обман и дубли не проходят.'],
    ['Как не пропустить снижение цены?', 'Добавьте объявление в избранное — Торгана сообщит, когда продавец снизит цену. А если подписаться на продавца, придут его новые объявления.'],
    ['Сколько стоит разместить объявление?', 'Бесплатно и без лимитов — и частным лицам, и компаниям. Платно только по желанию: продвижение объявления и тарифы для магазинов.'],
    ['Как купить безопасно?', 'Переписывайтесь в чате Торганы, смотрите вещь вживую и не вносите предоплату незнакомым продавцам. Если что-то не так — пожалуйтесь на объявление, модератор проверит.']
  ];
  return out.map(([q, a]) => ({ q, a }));
}

module.exports = function seo({ db, base, getSetting }) {
  const abs = (p) => (p && /^https?:/.test(p) ? p : `${base}${p || ''}`);
  const photo = (file) => (file ? abs(`/uploads/${file}`) : abs('/assets/og.jpg'));
  const ORG = { '@type': 'Organization', '@id': abs('/#org'), name: 'Торгана', url: abs('/'), logo: abs('/assets/icons/icon-512.png') };
  const cards = (rows) => `<ul class="seo-list">${rows.map((r) => `<li><a href="${listingPath(r)}">${esc(r.title)}</a> — ${esc(priceText(r.price, r.price_unit))}, ${esc(r.city)}</li>`).join('')}</ul>`;
  const links = (items) => `<ul class="seo-list">${items.map(([t, href]) => `<li><a href="${href}">${esc(t)}</a></li>`).join('')}</ul>`;
  const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(p) })) });
  const crumbsHtml = (items) => `<nav class="seo-crumbs">${items.map(([name, p], i) => (i === items.length - 1 ? esc(name) : `<a href="${p}">${esc(name)}</a>`)).join(' › ')}</nav>`;

  // Опубликованные объявления раздела: условие и аргументы для SQL.
  const scope = ({ category, sub, city, user }) => {
    const w = ['l.status = \'active\'', 'u.is_blocked = 0']; const a = [];
    if (category) { w.push('l.category = ?'); a.push(category); }
    if (sub) { w.push('l.subcategory = ?'); a.push(sub); }
    if (city) { w.push('l.city_lc = ?'); a.push(cityLc(city)); }
    if (user) { w.push('l.user_id = ?'); a.push(user); }
    return { where: w.join(' AND '), args: a };
  };
  const latest = (sc, n = 40) => { const s = scope(sc); return db.prepare(`SELECT l.id, l.title, l.price, l.price_unit, l.city FROM listings l JOIN users u ON u.id = l.user_id WHERE ${s.where} ORDER BY l.created_at DESC LIMIT ${n}`).all(...s.args); };
  const stats = (sc) => { const s = scope(sc); return db.prepare(`SELECT COUNT(*) AS n, MIN(l.price) AS min, MAX(l.price) AS max FROM listings l JOIN users u ON u.id = l.user_id WHERE ${s.where}`).get(...s.args); };

  // Для блока «О разделе» на сайте и для снимка страницы раздела: числа, города и соседние разделы — из базы.
  // 1.41.3: результат — из памяти, пока объявления не менялись (db.memo): на 100 000 объявлений это три подсчёта по ~17 мс.
  const sectionInfo = (args) => db.memo(`section|${args.category}|${args.sub || ''}|${args.city || ''}`, () => sectionInfoNow(args));
  function sectionInfoNow({ category, sub, city }) {
    const cat = CAT[category];
    if (!cat || (sub && !(SUB[sub] && SUB[sub].category === category)) || (city && !CITIES.includes(city))) return null;
    const name = sub ? SUB[sub].name : cat.name;
    const st = stats({ category, sub, city });
    const s = scope({ category, sub });
    const byCity = db.prepare(`SELECT l.city AS city, COUNT(*) AS n FROM listings l JOIN users u ON u.id = l.user_id WHERE ${s.where} GROUP BY l.city_lc ORDER BY n DESC LIMIT 40`).all(...s.args)
      .filter((r) => CITIES.includes(r.city) && r.city !== city);
    const cities = (byCity.length ? byCity : CITIES.filter((c) => c !== city).slice(0, 8).map((c) => ({ city: c, n: 0 }))).slice(0, 8)
      .map((r) => ({ name: r.city, n: r.n, path: sectionPath(category, sub, r.city) }));
    const sb = scope({ category, city });
    const counts = Object.fromEntries(db.prepare(`SELECT l.subcategory AS id, COUNT(*) AS n FROM listings l JOIN users u ON u.id = l.user_id WHERE ${sb.where} GROUP BY l.subcategory`).all(...sb.args).map((r) => [r.id, r.n]));
    const subs = (SUBCATS[category] || []).filter((x) => x.id !== sub).map((x) => ({ id: x.id, name: x.name, label: `${x.name}${city ? ` ${inCity(city)}` : ''}`, n: counts[x.id] || 0, path: sectionPath(category, x.id, city) }))
      .sort((a, b) => b.n - a.n).slice(0, sub ? 6 : 20);
    // Для заголовка и описания: цены (без «даром») и свежие за неделю.
    const sc = scope({ category, sub, city });
    const f = db.prepare(`SELECT MIN(CASE WHEN l.price > 0 THEN l.price END) AS low, SUM(l.created_at > ?) AS week
      FROM listings l JOIN users u ON u.id = l.user_id WHERE ${sc.where}`).get(Date.now() - 7 * 864e5, ...sc.args);
    const info = {
      category, sub: sub || '', city: city || '', name, catName: cat.name,
      h1: `${name} ${city ? inCity(city) : 'по всей России'}`, where: city ? inCity(city) : 'по всей России',
      fields: sub ? (SUB[sub].fields || []).slice(0, 6).map((x) => x.label.toLowerCase()) : [],
      count: st.n, min: st.min, max: st.max, low: f.low, week: f.week || 0, cities, subs, path: sectionPath(category, sub, city)
    };
    info.faq = faqOf(info);
    // Заголовок под запрос: «Автомобили в Москве: купить, 12 объявлений, цены от 350 000 ₽ | Торгана» (тот же ставит и сайт).
    const from = f.low ? (f.low === st.max ? `цена ${rub(f.low)}` : `${category === 'jobs' ? 'зарплата' : 'цены'} от ${rub(f.low)}`) : '';
    const head = st.n ? `${info.h1}: ${[verbOf(category, sub), ads(st.n), from].filter(Boolean).join(', ')}` : `${info.h1} — объявления на Торгане`;
    info.title = st.n && head.length <= 62 ? `${head} | Торгана` : head;
    return info;
  }

  // Что положить в страницу: { title, description, canonical, image, imageAlt, robots, status, body, jsonld[] }.
  function page(pathname) {
    const def = { title: 'Торгана — бесплатные объявления по всей России', description: 'Сторгуемся! Объявления по всей России: размещение бесплатно и без лимитов, каждое объявление проверяет модератор, поиск обычными словами. Транспорт, недвижимость, работа, услуги, электроника и личные вещи.', image: abs('/assets/og.jpg'), imageAlt: 'Торгана — объявления по всей России', type: 'website' };
    const notFound = (what, status = 404) => ({ ...def, title: `${what} — Торгана`, robots: 'noindex', status, body: `<h1>${esc(what)}</h1>` });

    if (pathname === '/') {
      return {
        ...def, canonical: abs('/'),
        body: `<h1>Бесплатные объявления по всей России</h1><p>Размещение бесплатно и без лимитов, каждое объявление проверяет модератор.</p>
          <nav>${CATEGORIES.map((c) => `<h2><a href="/c/${c.id}">${esc(c.name)}</a></h2><p>${esc(c.hint)}</p>${links((SUBCATS[c.id] || []).map((x) => [x.name, sectionPath(c.id, x.id)]))}`).join('')}</nav>
          <h2>Все объявления</h2>${cards(latest({}))}
          <nav>${links([['Для бизнеса', '/business'], ['Как искать', '/page/help'], ['Безопасность', '/page/safety'], ['Поддержка', '/page/support'], ['Правила площадки', '/page/rules']])}</nav>`,
        jsonld: [
          { '@context': 'https://schema.org', ...ORG },
          { '@context': 'https://schema.org', '@type': 'WebSite', '@id': abs('/#site'), name: 'Торгана', alternateName: ['Torgana', 'torgana.ru'], url: abs('/'), inLanguage: 'ru-RU', publisher: { '@id': abs('/#org') } }
        ]
      };
    }

    let m = /^\/l\/(\d+)(?:-[a-z0-9-]*)?$/.exec(pathname);
    if (m) {
      const l = db.prepare(`SELECT l.*, u.name AS seller, u.is_blocked, u.biz_status, u.biz_name FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ?`).get(Number(m[1]));
      if (!l || l.is_blocked) return notFound('Объявление не найдено');
      if (l.status === 'deleted') return notFound('Объявление удалено', 410); // 410 — поисковики убирают адрес быстрее, чем по 404
      if (pathname !== listingPath(l)) return { redirect: listingPath(l) }; // один адрес у объявления: /l/5 и старое название → 301
      const photos = db.prepare('SELECT file FROM uploads WHERE listing_id = ? ORDER BY position LIMIT 5').all(l.id).map((r) => r.file);
      const cat = CAT[l.category];
      const sub = SUB[l.subcategory] && SUB[l.subcategory].category === l.category ? SUB[l.subcategory] : null;
      const attrs = parseAttrs(l.attrs);
      const summary = sub ? summaryOf(sub.id, attrs) : '';
      const specs = sub ? describe(sub.id, attrs) : [];
      const sellerName = l.biz_status === 'verified' && l.biz_name ? l.biz_name : l.seller;
      const live = l.status === 'active' || l.status === 'sold';
      const place = `${l.city}${l.metro ? `, м. ${l.metro}` : ''}`;
      const price = priceText(l.price, l.price_unit);
      // Заголовок: название + главное из характеристик, если влезает; иначе только название.
      const head = summary && `${l.title}, ${summary}`.length <= 64 && !l.title.toLowerCase().includes(summary.toLowerCase()) ? `${l.title}, ${summary}` : l.title;
      const core = cut(`${cut(head, 64)} — ${price} ${inCity(l.city)}`, 90);
      const title = core.length <= 64 ? `${core} | Торгана` : core;
      const desc = cut(`${summary ? `${summary}. ` : ''}${place}. ${cut(l.description, 120)}${live ? ' Объявление проверено модератором.' : ''}`, 200);
      const secName = sub ? sub.name : cat ? cat.name : 'Объявления';
      const trail = [['Главная', '/'], ...(cat ? [[cat.name, sectionPath(l.category)]] : []), ...(sub ? [[sub.name, sectionPath(l.category, sub.id)]] : []), [`${secName} ${inCity(l.city)}`, sectionPath(l.category, sub && sub.id, CITIES.includes(l.city) ? l.city : '')], [l.title, listingPath(l)]];
      // Похожие ссылками: сначала из того же города, недостающие — из всей России (оба запроса по индексу с датой).
      const near = (city, not) => db.prepare(`SELECT l.id, l.title, l.price, l.price_unit, l.city FROM listings l JOIN users u ON u.id = l.user_id
        WHERE l.category = ? ${sub ? 'AND l.subcategory = ?' : ''} ${city ? 'AND l.city_lc = ?' : ''} AND l.status = 'active' AND u.is_blocked = 0 AND l.id != ?
        ${not.length ? `AND l.id NOT IN (${not.map(() => '?').join(',')})` : ''} ORDER BY l.created_at DESC LIMIT ?`)
        .all(l.category, ...(sub ? [sub.id] : []), ...(city ? [city] : []), l.id, ...not, 8 - not.length);
      const local = live ? near(cityLc(l.city), []) : [];
      const similar = live ? [...local, ...(local.length < 8 ? near('', local.map((r) => r.id)) : [])] : [];
      const brand = typeof attrs.brand === 'string' && attrs.brand && !/^Друг/.test(attrs.brand) ? attrs.brand : '';
      return {
        title, description: desc, canonical: abs(listingPath(l)), image: photo(photos[0]), imageAlt: l.title, type: 'product',
        robots: live ? '' : 'noindex', status: 200,
        body: `${crumbsHtml(trail)}
          <h1>${esc(l.title)}</h1><p class="seo-price">${esc(price)}${l.status === 'sold' ? ' · продано' : ''}</p>
          ${photos[0] ? `<img src="/uploads/${photos[0]}" alt="${esc(l.title)}" width="600">` : ''}
          ${specs.length ? `<h2>Характеристики</h2><dl>${specs.map((x) => `<dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd>`).join('')}</dl>` : ''}
          <p>${esc(place)}${l.delivery ? ' · есть доставка' : ''} · продавец: <a href="/u/${l.user_id}">${esc(sellerName)}</a></p><p class="seo-desc">${esc(l.description)}</p>
          ${similar.length ? `<h2>Похожие объявления</h2>${cards(similar)}` : ''}
          <nav>${links([[`${secName} ${inCity(l.city)}`, trail[trail.length - 2][1]], [`${secName} по всей России`, sectionPath(l.category, sub && sub.id)]])}</nav>`,
        // Товар с предложением — только с ценой (без цены разметку Product поисковики считают ошибкой).
        jsonld: live ? [...(l.price !== null ? [{
          '@context': 'https://schema.org', '@type': 'Product', name: l.title, sku: String(l.id), url: abs(listingPath(l)), description: cut(l.description, 500) || l.title, image: photos.map(photo),
          category: [cat && cat.name, sub && sub.name].filter(Boolean).join(' › ') || undefined,
          ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
          ...(specs.length ? { additionalProperty: specs.slice(0, 12).map((x) => ({ '@type': 'PropertyValue', name: x.label, value: x.value })) } : {}),
          offers: {
            '@type': 'Offer', url: abs(listingPath(l)), priceCurrency: 'RUB', price: l.price,
            ...(l.status === 'active' && l.expires_at ? { priceValidUntil: new Date(l.expires_at).toISOString().slice(0, 10) } : {}),
            availability: l.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
            itemCondition: l.condition === 'new' ? 'https://schema.org/NewCondition' : l.condition === 'used' ? 'https://schema.org/UsedCondition' : undefined,
            areaServed: l.city, seller: { '@type': l.biz_status === 'verified' ? 'Organization' : 'Person', name: sellerName }
          }
        }] : []), crumbs(trail)] : []
      };
    }

    m = /^\/c\/([a-z]+)(?:\/([a-z0-9_-]+))?(?:\/([a-z0-9-]+))?$/.exec(pathname);
    if (m) {
      const cat = CAT[m[1]];
      if (!cat) return notFound('Раздел не найден');
      // Второй сегмент — раздел (если это раздел этой категории) или город; третий — только город после раздела.
      let sub = ''; let city = '';
      if (m[2] && SUB[m[2]] && SUB[m[2]].category === cat.id) { sub = m[2]; city = m[3] ? CITY_BY_SLUG[m[3]] : ''; if (m[3] && !city) return notFound('Раздел не найден'); } else if (m[2]) {
        city = CITY_BY_SLUG[m[2]];
        if (!city || m[3]) return notFound('Раздел не найден');
      }
      const info = sectionInfo({ category: cat.id, sub, city });
      const rows = latest({ category: cat.id, sub, city });
      const n = info.count;
      const range = n && info.min !== null && info.max !== null && info.min !== info.max ? `, цены от ${NF.format(info.min)} до ${NF.format(info.max)} ₽` : '';
      const faq = info.faq;
      const trail = [['Главная', '/'], [cat.name, sectionPath(cat.id)], ...(sub ? [[info.name, sectionPath(cat.id, sub)]] : []), ...(city ? [[city, info.path]] : [])];
      return {
        ...def,
        title: info.title,
        description: cut(n ? `${info.h1}: ${ads(n)}${range}.${info.week ? ` ${NF.format(info.week)} ${plural(info.week, 'новое', 'новых', 'новых')} за неделю.` : ''} Каждое объявление проверяет модератор, размещение бесплатно.` : `${info.h1} на Торгане. Размещение бесплатно и без лимитов, каждое объявление проверяет модератор.`, 200),
        canonical: abs(info.path), robots: n ? '' : 'noindex',
        body: `${crumbsHtml(trail)}<h1>${esc(info.h1)}</h1><p>${n ? `${esc(ads(n))}${esc(range)}. Каждое объявление проверил модератор.` : 'Пока нет объявлений.'}</p>${cards(rows)}
          ${info.subs.length ? `<h2>${sub ? `Рядом в разделе «${esc(cat.name)}»` : 'Разделы'}</h2>${links(info.subs.map((x) => [`${x.name}${city ? ` ${inCity(city)}` : ''}`, x.path]))}` : ''}
          <h2>${esc(info.name)} в других городах</h2>${links(info.cities.map((x) => [`${info.name} ${inCity(x.name)}`, x.path]))}
          ${faq.length ? `<h2>Частые вопросы</h2>${faq.map((x) => `<h3>${esc(x.q)}</h3><p>${esc(x.a)}</p>`).join('')}` : ''}`,
        jsonld: [crumbs(trail), ...(faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) }] : []), ...(rows.length ? [{ '@context': 'https://schema.org', '@type': 'ItemList', name: info.h1, numberOfItems: n, itemListElement: rows.slice(0, 20).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(listingPath(r)), name: r.title })) }] : [])]
      };
    }

    m = /^\/u\/(\d+)$/.exec(pathname);
    if (m) {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(m[1]));
      if (!u || u.is_blocked) return notFound('Продавец не найден');
      const rows = latest({ user: u.id }, 60);
      const biz = u.biz_status === 'verified';
      const name = biz && u.biz_name ? u.biz_name : u.name;
      const shop = !!(u.plan && u.plan_until > Date.now());
      // 1.46.0: вместо оценки — уровень и засчитанные сделки (users.rep_*, lib/reputation.js).
      const rating = u.rep_level ? `${['', 'Надёжный', 'Опытный', 'Мастер Торганы'][u.rep_level]} продавец, ${u.rep_deals} ${plural(u.rep_deals, 'сделка', 'сделки', 'сделок')} за год` : '';
      const badge = biz ? (u.biz_kind === 'ip' ? 'ИП проверен' : 'Компания проверена') : '';
      const facts = [shop && u.shop_about ? cut(u.shop_about, 110) : '', shop ? u.shop_hours : '', shop ? u.shop_address : '', badge, rating].filter(Boolean).join('. ');
      return {
        ...def,
        title: shop ? `${name}${u.city ? `, ${u.city}` : ''} — магазин на Торгане, ${ads(rows.length)}` : `${name} — объявления продавца на Торгане`,
        description: cut(facts ? `${facts}.` : `Объявления продавца ${name}${u.city ? `, ${u.city}` : ''}: ${ads(rows.length)} на Торгане.`, 200),
        canonical: abs(pathname), robots: rows.length ? '' : 'noindex', image: u.avatar ? photo(u.avatar) : def.image, imageAlt: name,
        body: `${crumbsHtml([['Главная', '/'], [name, pathname]])}<h1>${esc(name)}</h1>${facts ? `<p>${esc(facts)}</p>` : ''}${cards(rows)}`,
        jsonld: [crumbs([['Главная', '/'], [name, pathname]]), ...(biz ? [{ '@context': 'https://schema.org', '@type': 'Organization', name, url: abs(pathname), ...(shop && u.shop_address ? { address: u.shop_address } : {}) }] : [])]
      };
    }

    if (pathname === '/business') {
      return {
        ...def, title: 'Торгана для бизнеса — витрина магазина, тарифы и продвижение', canonical: abs('/business'),
        description: 'Размещение объявлений бесплатно и без лимитов и для компаний. Тариф добавляет витрину магазина с поиском и разделами и общую статистику; продвижение — по фиксированной цене.',
        body: '<h1>Торгана для бизнеса</h1><p>Размещение бесплатно и без лимитов — и частным лицам, и компаниям. Тарифы «Магазин» и «Магазин Про» добавляют витрину с поиском и разделами и общую статистику.</p>',
        jsonld: [crumbs([['Главная', '/'], ['Для бизнеса', '/business']])]
      };
    }

    m = /^\/page\/([a-z]+)$/.exec(pathname);
    if (m) {
      const p = PAGES[m[1]];
      if (!p) return notFound('Страница не найдена');
      const trail = [['Главная', '/'], ...(['help', 'safety', 'support'].includes(m[1]) ? [['Помощь', '/page/help']] : []), [p[2], pathname]];
      return {
        ...def, title: p[0], description: p[1], canonical: abs(pathname),
        body: `${crumbsHtml(trail)}<h1>${esc(p[2])}</h1><p>${esc(p[1])}</p>${m[1] === 'support' ? SUPPORT_FAQ.map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join('') : ''}`,
        jsonld: [crumbs(trail), ...(m[1] === 'support' ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: SUPPORT_FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] : [])]
      };
    }
    // Адрес, которого на сайте нет, — честный 404 для поисковиков (страницу «не найдено» рисует сам сайт).
    if (!KNOWN.test(pathname)) return notFound('Страница не найдена');
    return { ...def, robots: PRIVATE.test(pathname) ? 'noindex, nofollow' : '', body: '' };
  }

  // Голова и тело index.html для пути.
  function inject(indexHtml, pathname) {
    const p = page(pathname);
    if (p.redirect) return { status: 301, location: p.redirect };
    const s = getSetting('seo') || {};
    const ogTitle = p.title.replace(/ \| Торгана$/, '');
    const meta = [
      `<title>${esc(p.title)}</title>`,
      `<meta name="description" content="${esc(p.description)}">`,
      p.canonical ? `<link rel="canonical" href="${esc(p.canonical)}">` : '',
      p.robots ? `<meta name="robots" content="${p.robots}">` : '',
      `<meta property="og:site_name" content="Торгана">`, `<meta property="og:locale" content="ru_RU">`,
      `<meta property="og:type" content="${p.type === 'product' ? 'product' : 'website'}">`,
      `<meta property="og:title" content="${esc(ogTitle)}">`, `<meta property="og:description" content="${esc(p.description)}">`,
      `<meta property="og:image" content="${esc(p.image)}">`, `<meta property="og:image:alt" content="${esc(p.imageAlt || ogTitle)}">`,
      p.canonical ? `<meta property="og:url" content="${esc(p.canonical)}">` : '',
      `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:title" content="${esc(ogTitle)}">`,
      `<meta name="twitter:description" content="${esc(p.description)}">`, `<meta name="twitter:image" content="${esc(p.image)}">`,
      s.yandex ? `<meta name="yandex-verification" content="${esc(s.yandex)}">` : '',
      s.google ? `<meta name="google-site-verification" content="${esc(s.google)}">` : '',
      ...(p.jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`)
    ].filter(Boolean).join('\n');
    return {
      status: p.status || 200,
      html: indexHtml
        .replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, meta)
        .replace('<main id="app" tabindex="-1"><div class="loader"></div></main>', `<main id="app" tabindex="-1">${p.body ? `<div class="wrap seo">${p.body}</div>` : '<div class="loader"></div>'}</main>`)
    };
  }

  // Карта сайта: главная, разделы (категории, разделы второго уровня, они же по городам — где есть объявления),
  // объявления с главным фото, продавцы, страницы помощи и документы.
  let cache = { at: 0, xml: '' };
  function sitemap() {
    if (Date.now() - cache.at < 30 * 60 * 1000) return cache.xml;
    const day = (t) => new Date(t).toISOString().slice(0, 10);
    const u = (loc, lastmod, pr, img) => `<url><loc>${esc(abs(loc))}</loc>${lastmod ? `<lastmod>${day(lastmod)}</lastmod>` : ''}${pr ? `<priority>${pr}</priority>` : ''}${img ? `<image:image><image:loc>${esc(abs(`/uploads/${img}`))}</image:loc></image:image>` : ''}</url>`;
    const urls = [u('/', Date.now(), '1.0'), u('/business', null, '0.5')];
    const live = 'l.status = \'active\' AND us.is_blocked = 0';
    for (const c of CATEGORIES) urls.push(u(`/c/${c.id}`, null, '0.8'));
    for (const r of db.prepare(`SELECT l.category, l.subcategory AS sub, MAX(l.updated_at) AS at FROM listings l JOIN users us ON us.id = l.user_id WHERE ${live} AND l.subcategory != '' GROUP BY l.category, l.subcategory`).all()) {
      if (SUB[r.sub] && SUB[r.sub].category === r.category) urls.push(u(sectionPath(r.category, r.sub), r.at, '0.75'));
    }
    for (const r of db.prepare(`SELECT l.category, l.city, MAX(l.updated_at) AS at FROM listings l JOIN users us ON us.id = l.user_id WHERE ${live} GROUP BY l.category, l.city_lc`).all()) {
      if (CITY_BY_SLUG[slugify(r.city)]) urls.push(u(sectionPath(r.category, '', CITY_BY_SLUG[slugify(r.city)]), r.at, '0.7'));
    }
    for (const r of db.prepare(`SELECT l.category, l.subcategory AS sub, l.city, MAX(l.updated_at) AS at FROM listings l JOIN users us ON us.id = l.user_id WHERE ${live} AND l.subcategory != '' GROUP BY l.category, l.subcategory, l.city_lc`).all()) {
      const city = CITY_BY_SLUG[slugify(r.city)];
      if (city && SUB[r.sub] && SUB[r.sub].category === r.category) urls.push(u(sectionPath(r.category, r.sub, city), r.at, '0.65'));
    }
    const rows = db.prepare(`SELECT l.id, l.title, l.updated_at, (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo
      FROM listings l JOIN users us ON us.id = l.user_id WHERE ${live} ORDER BY l.updated_at DESC LIMIT 40000`).all();
    for (const r of rows) urls.push(u(listingPath(r), r.updated_at, '0.6', r.photo));
    for (const r of db.prepare(`SELECT DISTINCT l.user_id AS id FROM listings l JOIN users us ON us.id = l.user_id WHERE ${live} LIMIT 3000`).all()) urls.push(u(`/u/${r.id}`, null, '0.4'));
    for (const p of Object.keys(PAGES)) urls.push(u(`/page/${p}`, null, ['help', 'safety', 'support'].includes(p) ? '0.4' : '0.2'));
    cache = { at: Date.now(), xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n` };
    return cache.xml;
  }

  // Фид для Яндекс Товаров (Вебмастер → «Товары и цены»): объявления-вещи с ценой и фото попадают в товарный блок выдачи.
  // Формат YML; разделы — номера: категория ×100 + номер раздела. Обновляется раз в час.
  let feedCache = { at: 0, xml: '' };
  function feed() {
    if (Date.now() - feedCache.at < 60 * 60 * 1000) return feedCache.xml;
    const ids = {}; const cats = [];
    CATEGORIES.forEach((c, i) => {
      if (!(c.id in FEED)) return;
      ids[c.id] = (i + 1) * 100; cats.push(`<category id="${ids[c.id]}">${esc(c.name)}</category>`);
      (SUBCATS[c.id] || []).forEach((x, j) => { if (!FEED[c.id] || FEED[c.id].includes(x.id)) { ids[x.id] = ids[c.id] + j + 1; cats.push(`<category id="${ids[x.id]}" parentId="${ids[c.id]}">${esc(x.name)}</category>`); } });
    });
    const rows = db.prepare(`SELECT l.id, l.title, l.description, l.price, l.category, l.subcategory, l.city, l.condition, l.delivery, l.attrs,
        (SELECT group_concat(file, ' ') FROM (SELECT file FROM uploads p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 5)) AS photos
      FROM listings l JOIN users us ON us.id = l.user_id
      WHERE l.status = 'active' AND us.is_blocked = 0 AND l.price > 0 AND l.price_unit = '' AND l.category IN (${Object.keys(FEED).map(() => '?').join(',')})
      ORDER BY l.updated_at DESC LIMIT 50000`).all(...Object.keys(FEED));
    const offers = [];
    for (const r of rows) {
      const subOk = SUB[r.subcategory] && SUB[r.subcategory].category === r.category && ids[r.subcategory];
      if (FEED[r.category] && !subOk) continue; // в разделе, которого нет в фиде (продукты, авто, живые животные)
      if (!r.photos) continue;
      const a = parseAttrs(r.attrs);
      const brand = typeof a.brand === 'string' && a.brand && !/^Друг/.test(a.brand) ? a.brand : '';
      offers.push(`<offer id="${r.id}" available="true"><url>${esc(abs(listingPath(r)))}</url><price>${r.price}</price><currencyId>RUR</currencyId>`
        + `<categoryId>${subOk ? ids[r.subcategory] : ids[r.category]}</categoryId>${r.photos.split(' ').map((f) => `<picture>${esc(photo(f))}</picture>`).join('')}`
        + `<delivery>${r.delivery ? 'true' : 'false'}</delivery><pickup>true</pickup><name>${esc(cut(r.title, 150))}</name>${brand ? `<vendor>${esc(brand)}</vendor>` : ''}`
        + `<description>${esc(cut(r.description, 3000) || r.title)}</description>`
        + `${r.condition ? `<param name="Состояние">${r.condition === 'new' ? 'Новое' : 'Б/у'}</param>` : ''}<param name="Город">${esc(r.city)}</param></offer>`);
    }
    const msk = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 16);
    feedCache = { at: Date.now(), xml: `<?xml version="1.0" encoding="UTF-8"?>\n<yml_catalog date="${msk}+03:00"><shop><name>Торгана</name><company>Торгана</company><url>${esc(abs('/'))}</url>`
      + `<currencies><currency id="RUR" rate="1"/></currencies><categories>${cats.join('')}</categories>\n<offers>\n${offers.join('\n')}\n</offers></shop></yml_catalog>\n` };
    return feedCache.xml;
  }

  const robots = () => `User-agent: *
Disallow: /api/
Disallow: /admin
Disallow: /profile
Disallow: /messages
Disallow: /new
Disallow: /edit/
Disallow: /login
Disallow: /register
Disallow: /confirm
Disallow: /forgot
Disallow: /reset
Disallow: /verify
Disallow: /unsubscribe
Disallow: /pay/
Disallow: /favorites
Disallow: /search
Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&from&ref

Sitemap: ${abs('/sitemap.xml')}
`;

  return { inject, sitemap, robots, feed, page, sectionInfo, slugify, listingPath, sectionPath };
};
Object.assign(module.exports, { slugify, sectionPath, listingPath });

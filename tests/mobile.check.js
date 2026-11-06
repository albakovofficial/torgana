'use strict';

// Проверка вёрстки в браузере: телефон (375 px) и компьютер (1280 px).
// Для каждой страницы: нет ошибок JS, нет горизонтальной прокрутки, нижнее меню — только на телефоне.
// Скриншоты сохраняются в tests/screenshots.
// Запуск: npm run test:ui   (нужен Playwright с Chromium)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, registerUser, client } = require('./helpers');

const SHOTS = path.join(__dirname, 'screenshots');
const VIEWPORTS = {
  mobile: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 860 } }
};

async function seed(base, browser) {
  const seller = await registerUser(base, { name: 'Анна Смирнова', email: 'anna@test.local' });
  const buyer = await registerUser(base, { name: 'Борис', email: 'boris@test.local' });
  const admin = await registerUser(base, { name: 'Модератор', email: 'admin@test.local' });
  // Настоящие JPEG разных цветов — рисуем в браузере, чтобы не держать картинки в репозитории.
  const page = await browser.newPage();
  const colors = ['#C9D6CF', '#E3D5C6', '#CFD3DE', '#DCCFD9', '#D6DCC4', '#C8D9DD'];
  const photos = [];
  for (const c of colors) {
    const data = await page.evaluate((color) => {
      const cv = document.createElement('canvas'); cv.width = 800; cv.height = 800;
      const x = cv.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 800, 800);
      x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.arc(400, 420, 220, 0, Math.PI * 2); x.fill();
      return cv.toDataURL('image/jpeg', 0.8);
    }, c);
    photos.push((await seller.post('/api/uploads', { data })).data.file);
  }
  await page.close();
  const items = [
    ['Детская коляска Cybex Priam 2 в 1', 'personal', '34500', 'Казань', true],
    ['iPhone 15 Pro, 256 ГБ, титановый', 'electronics', '89900', 'Москва', true],
    ['Аренда двухкомнатной квартиры у метро с очень длинным названием объявления', 'realty', '45000', 'Санкт-Петербург', false],
    ['Велосипед горный Merida', 'hobby', '', 'Екатеринбург', false],
    ['Диван угловой, почти новый', 'home', '18000', 'Новосибирск', true],
    ['Ремонт квартир под ключ', 'services', '', 'Казань', false]
  ];
  const ids = [];
  for (let i = 0; i < items.length; i++) {
    const [title, category, price, city, delivery] = items[i];
    const r = await seller.post('/api/listings', {
      title, category, price, city, delivery, condition: '', priceUnit: category === 'realty' ? 'мес' : '',
      description: 'Хорошее состояние. Подробности в чате.\nВторая строка описания.', photos: i === 0 ? photos : [photos[i]]
    });
    ids.push(r.data.id);
    await admin.post(`/api/admin/listings/${r.data.id}/restore`);
  }
  const conv = await buyer.post('/api/conversations', { listingId: ids[0] });
  await buyer.post(`/api/conversations/${conv.data.id}/messages`, { body: 'Здравствуйте! Коляска ещё продаётся?' });
  await seller.post(`/api/conversations/${conv.data.id}/messages`, { body: 'Да, можно посмотреть сегодня вечером.' });
  // статистика: несколько разных «гостей» видели и открыли объявление
  const ua = (i) => `Mozilla/5.0 (Linux; Android 14; Pixel ${i}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36`;
  for (let i = 0; i < 6; i++) {
    const g = client(base);
    const h = { origin: base, 'user-agent': ua(i) };
    await g.post('/api/stats/impressions', { ids: [ids[1], ids[0]] }, h);
    if (i < 4) await g.post('/api/stats/view', { id: ids[1], src: ['search', 'home', 'search', 'external'][i] }, h);
  }
  await buyer.post(`/api/favorites/${ids[1]}`, {}, { origin: base, 'user-agent': ua(9) });
  await admin.post(`/api/admin/listings/${ids[5]}/reject`, { reason: 'Контакты в тексте объявления' });
  const pending = (await seller.post('/api/listings', { title: 'Травматический пистолет', category: 'hobby', city: 'Казань', price: '9000' })).data.id;
  await buyer.post('/api/support/messages', { body: 'Здравствуйте! Почему моё объявление на проверке?' });
  const thread = (await admin.get('/api/admin/support')).data.items[0].id;
  await admin.post(`/api/admin/support/${thread}/messages`, { body: 'Все объявления проверяются перед публикацией — обычно несколько часов.' });
  await buyer.post(`/api/listings/${ids[1]}/report`, { reason: 'Мошенничество', text: 'Просит предоплату' });
  // отзывы: опубликованный с ответом продавца, второй — с жалобой; диалог, где можно оставить отзыв
  const rv1 = (await buyer.post('/api/reviews', { conversationId: conv.data.id, rating: 5, received: true, text: 'Коляска как в описании, всё проверили на месте. Продавец вежливый, рекомендую!' })).data.review.id;
  await admin.post(`/api/admin/reviews/${rv1}/publish`);
  await seller.post(`/api/reviews/${rv1}/reply`, { text: 'Спасибо! Пусть служит долго.' });
  await admin.post(`/api/admin/reviews/${rv1}/reply/publish`);
  const critic = await registerUser(base, { name: 'Сергей', email: 'sergey@test.local' });
  const c2 = (await critic.post('/api/conversations', { listingId: ids[3] })).data.id;
  await critic.post(`/api/conversations/${c2}/messages`, { body: 'Велосипед ещё продаётся?' });
  await seller.post(`/api/conversations/${c2}/messages`, { body: 'Да.' });
  const rv2 = (await critic.post('/api/reviews', { conversationId: c2, rating: 1, received: false, text: 'Договорились о встрече, но продавец не пришёл и перестал отвечать.' })).data.review.id;
  await admin.post(`/api/admin/reviews/${rv2}/publish`);
  await seller.post(`/api/reviews/${rv2}/complaint`, { reason: 'Ложные сведения', text: 'Я ждала у метро до семи вечера и писала в чат — покупатель не пришёл.' });
  const c3 = (await buyer.post('/api/conversations', { listingId: ids[4] })).data.id;
  await buyer.post(`/api/conversations/${c3}/messages`, { body: 'Добрый день! Можно забрать завтра?' });
  await seller.post(`/api/conversations/${c3}/messages`, { body: 'Да, после обеда.' });
  // модерация: объявление с контактами в тексте (автопроверка) и заблокированный пользователь
  await buyer.post('/api/listings', { title: 'Велосипед детский', description: 'Звоните +7 900 123-45-67 или пишите в WhatsApp', category: 'hobby', city: 'Москва', price: '4000' });
  const spam = await registerUser(base, { name: 'Иван Спамов', email: 'spam@test.local' });
  await admin.post(`/api/admin/users/${spam.user.id}/block`, { blocked: true, reason: 'Спам и повторные объявления' });
  return { seller, buyer, admin, ids, pending, thread, conv: conv.data.id, convReview: c3 };
}

function pages(d) {
  return [
    ['home', '/', null],
    ['search', `/search?q=${encodeURIComponent('коляска до 50 000 с доставкой')}`, null],
    ['category', '/search?category=electronics', null],
    ['listing', `/l/${d.ids[0]}`, null],
    ['listing-guest-long', `/l/${d.ids[2]}`, null],
    ['user', `/u/${d.seller.user.id}`, null],
    ['login', '/login', null],
    ['register', '/register', null],
    ['rules', '/page/rules', null],
    ['terms', '/page/terms', null],
    ['privacy', '/page/privacy', null],
    ['consent', '/page/consent', null],
    ['not-found', '/nope', null],
    ['new', '/new', d.seller],
    ['edit', `/edit/${d.ids[0]}`, d.seller],
    ['profile', '/profile', d.seller],
    ['profile-listings', '/profile/listings', d.seller],
    ['profile-rejected', '/profile/listings?status=rejected', d.seller],
    ['settings', '/profile/settings', d.seller],
    ['reviews-about', '/profile/reviews', d.seller],
    ['reviews-mine', '/profile/reviews?tab=mine', d.buyer],
    ['user-reviews', `/u/${d.seller.user.id}?tab=reviews`, null],
    ['chat-review', `/messages/${d.convReview}`, d.buyer],
    ['admin-reviews', '/admin?status=reviews', d.admin],
    ['admin-review-complaints', '/admin?status=reviews&rt=complaints', d.admin],
    ['stats', `/profile/stats/${d.ids[1]}`, d.seller],
    ['stats-week', `/profile/stats/${d.ids[1]}?days=7`, d.seller],
    ['settings-old-link', '/profile?tab=settings', d.seller],
    ['profile-empty', '/profile', d.buyer],
    ['favorites', '/favorites', d.buyer],
    ['messages', '/messages', d.buyer],
    ['chat', `/messages/${d.conv}`, d.buyer],
    ['admin', '/admin', d.admin],
    ['admin-mail', '/admin?status=mail', d.admin],
    ['admin-site', '/admin?status=site', d.admin],
    ['admin-users', '/admin?status=users', d.admin],
    ['admin-user', `/admin/u/${d.seller.user.id}`, d.admin],
    ['admin-log', '/admin?status=log', d.admin],
    ['admin-notify', '/admin?status=notify', d.admin],
    ['admin-pending', '/admin?status=pending', d.admin],
    ['admin-check', `/admin/l/${d.pending}`, d.admin],
    ['admin-reports', '/admin?status=reports', d.admin],
    ['admin-support', `/admin?status=support&t=${d.thread}`, d.admin],
    ['support-chat', '/messages/support', d.buyer],
    ['support-new', '/messages/support', d.seller],
    ['contacts', '/page/contacts', null],
    ['listing-pending', `/l/${d.pending}`, d.seller],
    ['forgot', '/forgot', null],
    ['reset-expired', `/reset?token=${'0'.repeat(64)}`, null],
    ['unsubscribe', `/unsubscribe?t=${'0'.repeat(32)}&k=messages`, null],
    // Панель ≡ (четвёртый элемент — открыть меню перед снимком).
    ['menu', '/', d.seller, 'menu'],
    ['menu-admin', '/profile/settings', d.admin, 'menu'],
    ['menu-guest', '/', null, 'menu']
  ];
}

async function main() {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const problems = [];
  let checked = 0;
  try {
    const d = await seed(srv.base, browser);
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      for (const [name, url, who, open] of pages(d)) {
        const ctx = await browser.newContext({ ...vp, locale: 'ru-RU' });
        if (who) {
          const [k, v] = who.cookie.split('=');
          await ctx.addCookies([{ name: k, value: v, url: srv.base }]);
        }
        // Внешние ресурсы (шрифты и т. п.) в проверке не грузим — тест не должен зависеть от интернета.
        await ctx.route((u) => !u.href.startsWith(srv.base), (r) => r.fulfill({ status: 200, body: '' }));
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(`JS: ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
        page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
        await page.goto(srv.base + url, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !document.querySelector('#app > .loader'), null, { timeout: 5000 }).catch(() => errors.push('страница не загрузилась'));
        await page.waitForTimeout(150);
        if (open) {
          await page.click('[data-menu]');
          await page.waitForTimeout(300);
          if (!(await page.$('.modal.drawer .pf-nav'))) errors.push('меню ≡ не открылось');
        }
        const m = await page.evaluate(() => {
          const nav = document.querySelector('#bottom-nav');
          const st = nav ? getComputedStyle(nav) : null;
          const wide = [...document.querySelectorAll('body *')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== 'fixed';
          }).slice(0, 3).map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
          return {
            scrollW: document.documentElement.scrollWidth,
            clientW: document.documentElement.clientWidth,
            navVisible: !!st && st.display !== 'none' && st.visibility !== 'hidden',
            appText: (document.querySelector('#app')?.innerText || '').trim().length,
            onest: [...document.fonts].some((f) => f.family.replace(/['"]/g, '') === 'Onest' && f.status === 'loaded'),
            wide
          };
        });
        if (m.scrollW > m.clientW + 1) errors.push(`горизонтальная прокрутка: ${m.scrollW}px при ширине ${m.clientW}px (${m.wide.join(', ')})`);
        if (vpName === 'mobile' && !m.navVisible) errors.push('нет нижнего меню на телефоне');
        if (vpName === 'desktop' && m.navVisible) errors.push('нижнее меню видно на компьютере');
        if (m.appText < 20) errors.push('страница пустая');
        if (!m.onest) errors.push('шрифт Onest не загрузился');
        await page.screenshot({ path: path.join(SHOTS, `${vpName}-${name}.png`), fullPage: !open });
        checked++;
        if (errors.length) problems.push(`${vpName} ${url}\n   - ${errors.join('\n   - ')}`);
        console.log(`${errors.length ? '✗' : '✓'} ${vpName.padEnd(7)} ${name}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await srv.stop();
  }
  console.log(`\nПроверено страниц: ${checked}. Скриншоты: ${SHOTS}`);
  if (problems.length) {
    console.error(`\nПроблемы (${problems.length}):\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('Вёрстка в порядке.');
}

main().catch((e) => { console.error(e); process.exit(1); });

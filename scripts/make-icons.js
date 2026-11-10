'use strict';

// Иконки Торганы из одного описания знака «Т-ценник».
//   node scripts/make-icons.js
// Создаёт: assets/favicon.svg (вкладка браузера, круг) и assets/icons/*.png (экран «Домой»: квадрат на весь
// размер — iOS и Android сами скругляют углы; знак в безопасной зоне, поэтому подходит и для maskable)
// и assets/icons/mail-logo.png (логотип в шапке писем: круг, как favicon),
// assets/icons/badge-96.png (значок push-уведомлений в строке состояния Android: белый знак на прозрачном).
// apple-touch-icon.png (180×180, без прозрачности) — она же аватарка отправителя для Mail.ru Postmaster,
// icon-512.png — для портрета Яндекс ID и фото Google-аккаунта no-reply@.
// assets/og.jpg (1200×630) — картинка для ссылок в мессенджерах и соцсетях: знак, слоган «Сторгуемся!» (1.49.2).
// Нужен Playwright с Chromium (как для npm run test:ui).
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = path.join(__dirname, '..', 'public', 'assets');
const GREEN = '#3D67D0'; // «Небо и сирень»: основной цвет, отверстие в знаке
const SKY = '#2E6FCC', LILAC = '#5B5FD6'; // переход фона
// Знак в сетке 48×48: перекладина-ценник с отверстием и ножка буквы Т.
const MARK = (hole) => `<path d="M13.5 11H34.5a4.5 4.5 0 0 1 0 9H13.5L9 15.5z" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`
  + `<rect x="19.5" y="15" width="9" height="24" rx="4.5" fill="#fff"/><circle cx="14.6" cy="15.5" r="1.7" fill="${hole}"/>`;

// Вкладка браузера: круг, знак 73%.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${SKY}"/><stop offset="1" stop-color="${LILAC}"/></linearGradient></defs><circle cx="24" cy="24" r="24" fill="url(#g)"/>`
  + `<g transform="translate(6.5 6.5) scale(0.73)">${MARK(GREEN)}</g></svg>\n`;

// Иконка приложения: квадрат с мягким светом сверху, знак ~50% высоты по оптическому центру.
const appIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${SKY}"/><stop offset="1" stop-color="${LILAC}"/></linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.12" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.45" stdDeviation="0.55" flood-color="#1E2A6B" flood-opacity="0.28"/></filter>
  </defs>
  <rect width="48" height="48" fill="url(#bg)"/><rect width="48" height="48" fill="url(#glow)"/>
  <g filter="url(#sh)" transform="translate(24 24.4) scale(0.8) translate(-24 -25)">${MARK('#4466D2')}</g>
</svg>`;

const PNG = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
const BADGE = 96;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE}" height="${BADGE}" viewBox="0 0 48 48"><g transform="translate(24 24.4) scale(0.95) translate(-24 -25)">${MARK('transparent')}</g></svg>`;
const MAIL_LOGO = 102; // показывается 34×34, запас на экраны с высокой плотностью

// Картинка для ссылок: шрифт Onest — из assets/fonts (встраиваем, чтобы не зависеть от сети).
const font = (file, range) => `@font-face{font-family:Onest;font-weight:400 800;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(ASSETS, 'fonts', file)).toString('base64')}) format('woff2');unicode-range:${range}}`;
const og = () => `<html><head><style>${font('onest-cyrillic.woff2', 'U+0400-045F')}${font('onest-latin.woff2', 'U+0000-00FF')}
  body{margin:0}.o{position:relative;width:1200px;height:630px;overflow:hidden;box-sizing:border-box;padding:72px 84px;font-family:Onest,sans-serif;color:#fff;
  background:radial-gradient(60% 90% at 92% 0%,rgba(185,168,255,.55),transparent 70%),radial-gradient(50% 80% at 0% 100%,rgba(120,200,255,.32),transparent 70%),linear-gradient(125deg,${SKY},#3D67D0 50%,${LILAC})}
  .m{position:absolute;right:-60px;bottom:-120px;width:560px;height:560px;opacity:.09;transform:rotate(-12deg)}
  .b{display:flex;align-items:center;gap:20px;font-size:46px;font-weight:800;letter-spacing:-.03em}.lg{display:flex;width:84px;height:84px;border-radius:50%;box-shadow:0 0 0 4px rgba(255,255,255,.92),0 10px 30px rgba(20,25,90,.3)}
  h1{margin:96px 0 14px;font-size:118px;line-height:1;font-weight:800;letter-spacing:-.045em;text-shadow:0 8px 40px rgba(20,25,90,.28)}
  p{margin:0;font-size:38px;font-weight:600;opacity:.95;letter-spacing:-.01em}
  .c{display:flex;gap:16px;margin-top:44px}.c span{height:62px;display:flex;align-items:center;gap:12px;padding:0 26px 0 8px;border-radius:999px;background:#fff;color:#1E2A6B;font-size:25px;font-weight:700;letter-spacing:-.01em;box-shadow:0 12px 30px rgba(20,25,90,.25)}
  .c i{width:46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:linear-gradient(135deg,${SKY},${LILAC})}.c i svg{width:24px;height:24px}
  </style></head><body><div class="o">
  <svg class="m" viewBox="0 0 48 48">${MARK('transparent')}</svg>
  <div class="b"><span class="lg">${favicon.replace('<svg ', '<svg width="84" height="84" ')}</span>торгана</div>
  <h1>Сторгуемся!</h1>
  <p>Объявления по всей России</p>
  <div class="c"><span><i><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg></i>Бесплатно и без лимитов</span><span><i><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg></i>Проверка модератором</span></div>
  </div></body></html>`;

async function main() {
  fs.writeFileSync(path.join(ASSETS, 'favicon.svg'), favicon);
  fs.mkdirSync(path.join(ASSETS, 'icons'), { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    for (const [file, size] of Object.entries(PNG)) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(`<html><body style="margin:0">${appIcon(size)}</body></html>`);
      await page.screenshot({ path: path.join(ASSETS, 'icons', file), clip: { x: 0, y: 0, width: size, height: size } });
      await page.close();
      console.log(`icons/${file} — ${size}×${size}`);
    }
    const page = await browser.newPage({ viewport: { width: MAIL_LOGO, height: MAIL_LOGO }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${favicon.replace('<svg ', `<svg width="${MAIL_LOGO}" height="${MAIL_LOGO}" `)}</body></html>`);
    await page.screenshot({ path: path.join(ASSETS, 'icons', 'mail-logo.png'), clip: { x: 0, y: 0, width: MAIL_LOGO, height: MAIL_LOGO }, omitBackground: true });
    await page.close();
    console.log(`icons/mail-logo.png — ${MAIL_LOGO}×${MAIL_LOGO}`);
    const bp = await browser.newPage({ viewport: { width: BADGE, height: BADGE }, deviceScaleFactor: 1 });
    await bp.setContent(`<html><body style="margin:0;background:transparent">${badge}</body></html>`);
    await bp.screenshot({ path: path.join(ASSETS, 'icons', 'badge-96.png'), clip: { x: 0, y: 0, width: BADGE, height: BADGE }, omitBackground: true });
    await bp.close();
    console.log(`icons/badge-96.png — ${BADGE}×${BADGE}`);
    const op = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await op.setContent(og());
    await op.evaluate(() => document.fonts.ready);
    await op.screenshot({ path: path.join(ASSETS, 'og.jpg'), type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    await op.close();
    console.log('og.jpg — 1200×630');
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

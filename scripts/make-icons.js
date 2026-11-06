'use strict';

// Иконки Торганы из одного описания знака «Т-ценник».
//   node scripts/make-icons.js
// Создаёт: assets/favicon.svg (вкладка браузера, круг) и assets/icons/*.png (экран «Домой»: квадрат на весь
// размер — iOS и Android сами скругляют углы; знак в безопасной зоне, поэтому подходит и для maskable)
// и assets/icons/mail-logo.png (логотип в шапке писем: круг, как favicon),
// assets/icons/badge-96.png (значок push-уведомлений в строке состояния Android: белый знак на прозрачном).
// apple-touch-icon.png (180×180, без прозрачности) — она же аватарка отправителя для Mail.ru Postmaster,
// icon-512.png — для портрета Яндекс ID и фото Google-аккаунта no-reply@.
// Нужен Playwright с Chromium (как для npm run test:ui).
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = path.join(__dirname, '..', 'public', 'assets');
const GREEN = '#1F5E4A';
// Знак в сетке 48×48: перекладина-ценник с отверстием и ножка буквы Т.
const MARK = (hole) => `<path d="M13.5 11H34.5a4.5 4.5 0 0 1 0 9H13.5L9 15.5z" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`
  + `<rect x="19.5" y="15" width="9" height="24" rx="4.5" fill="#fff"/><circle cx="14.6" cy="15.5" r="1.7" fill="${hole}"/>`;

// Вкладка браузера: круг, знак 73%.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="${GREEN}"/>`
  + `<g transform="translate(6.5 6.5) scale(0.73)">${MARK(GREEN)}</g></svg>\n`;

// Иконка приложения: квадрат с мягким светом сверху, знак ~50% высоты по оптическому центру.
const appIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#256B55"/><stop offset="1" stop-color="#1A5140"/></linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.12" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.45" stdDeviation="0.55" flood-color="#0B2A21" flood-opacity="0.28"/></filter>
  </defs>
  <rect width="48" height="48" fill="url(#bg)"/><rect width="48" height="48" fill="url(#glow)"/>
  <g filter="url(#sh)" transform="translate(24 24.4) scale(0.8) translate(-24 -25)">${MARK('#1E5C48')}</g>
</svg>`;

const PNG = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
const BADGE = 96;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE}" height="${BADGE}" viewBox="0 0 48 48"><g transform="translate(24 24.4) scale(0.95) translate(-24 -25)">${MARK('transparent')}</g></svg>`;
const MAIL_LOGO = 102; // показывается 34×34, запас на экраны с высокой плотностью

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
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

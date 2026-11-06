'use strict';
// Наполняет ЛОКАЛЬНЫЙ сайт тестовыми объявлениями, чтобы посмотреть, как он выглядит.
// Не запускайте на рабочем сервере. Запуск: node scripts/seed-demo.js http://localhost:3000
const zlib = require('node:zlib');

const BASE = process.argv[2] || 'http://localhost:3000';

// Генерирует PNG с мягким градиентом — заглушка вместо фото.
function png(w, h, c1, c2) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2;
      for (let k = 0; k < 3; k++) row[1 + x * 3 + k] = Math.round(c1[k] + (c2[k] - c1[k]) * t);
    }
    rows.push(row);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path}: ${data.error}`);
    return data;
  };
}

const PALETTE = [[214, 222, 216], [226, 219, 207], [210, 216, 226], [228, 214, 214], [220, 226, 210], [224, 220, 228]];
const ITEMS = [
  ['iPhone 15 Pro, 256 ГБ, натуральный титан', 'electronics', 84900, '', 'Москва', 1, 'used', 'Пользовался полгода, всегда в чехле. Аккумулятор 96%, коробка и кабель.'],
  ['Диван-кровать, светло-серый', 'home', 24000, '', 'Санкт-Петербург', 0, 'used', 'Механизм еврокнижка, без пятен. Самовывоз.'],
  ['Toyota Camry, 2021, 48 000 км', 'transport', 2690000, '', 'Казань', 0, 'used', 'Один владелец, обслуживание у официального дилера.'],
  ['MacBook Air 13, M2, 16/512 ГБ', 'electronics', 79000, '', 'Краснодар', 1, 'used', 'Состояние отличное, 54 цикла зарядки.'],
  ['Коляска 2 в 1, графит', 'personal', 18500, '', 'Нижний Новгород', 1, 'used', 'Люлька и прогулочный блок, дождевик в комплекте.'],
  ['2-комн. квартира, 54 м², 7/16 эт.', 'realty', 38000, 'мес', 'Екатеринбург', 0, '', 'Свежий ремонт, вся техника, рядом метро.'],
  ['Кожаные ботинки, 42', 'personal', 12900, '', 'Ростов-на-Дону', 1, 'new', 'Новые, не подошёл размер. Натуральная кожа.'],
  ['Ремонт квартир под ключ', 'services', 4500, 'м²', 'Самара', 0, '', 'Договор, смета, гарантия 2 года.'],
  ['Велосипед горный, рама 19"', 'hobby', 21000, '', 'Москва', 1, 'used', 'Гидравлические тормоза, 27 скоростей.'],
  ['Шерстяное пальто, размер M', 'personal', 7500, '', 'Новосибирск', 1, 'used', 'Носила один сезон, без катышков.'],
  ['Котёнок мейн-кун, мальчик', 'animals', 35000, '', 'Казань', 0, '', 'Привит, приучен к лотку.'],
  ['Кофемашина De\'Longhi Magnifica', 'home', 16000, '', 'Москва', 1, 'used', 'Работает исправно, регулярная очистка от накипи.']
];

(async () => {
  const s = client();
  const email = `demo${Date.now()}@torgana.local`;
  await s('POST', '/api/auth/register', { name: 'Алексей', email, password: 'demo-password' });
  for (const [i, it] of ITEMS.entries()) {
    const c1 = PALETTE[i % PALETTE.length];
    const c2 = c1.map((v) => Math.max(0, v - 28));
    const photo = await s('POST', '/api/uploads', { data: `data:image/png;base64,${png(480, 480, c1, c2).toString('base64')}` });
    await s('POST', '/api/listings', { title: it[0], category: it[1], price: it[2], priceUnit: it[3], city: it[4], delivery: !!it[5], condition: it[6], description: it[7], photos: [photo.file] });
  }
  console.log(`Готово: ${ITEMS.length} объявлений. Демо-аккаунт: ${email} / demo-password`);
})().catch((e) => { console.error(e.message); process.exit(1); });

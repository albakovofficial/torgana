'use strict';
// Заголовки безопасности для всех ответов сайта и API: запрет встраивания, HTTPS на год, политика CSP.
module.exports = function headers({ publicUrl: PUBLIC_URL }) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    // HTTPS запоминается браузером на год (без поддоменов: stats.torgana.ru — отслеживание переходов SMTP.BZ по http).
    ...(PUBLIC_URL.startsWith('https://') ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
    // mc.yandex.ru — Яндекс.Метрика (загружается только после согласия на статистические cookie).
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https://mc.yandex.ru https://mc.yandex.com; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self' blob:; connect-src 'self' https://mc.yandex.ru https://mc.yandex.com; script-src 'self' https://mc.yandex.ru; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  };
};

// 1.48.0: тёмная тема — до отрисовки страницы, чтобы не мелькала светлая.
// Выбор хранится на этом устройстве: auto (как на устройстве), light, dark.
(function () {
  var t = 'auto';
  try { t = localStorage.getItem('theme') || 'auto'; } catch (e) { /* закрытое хранилище */ }
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  var dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', dark ? '#0F121B' : '#FFFFFF');
})();

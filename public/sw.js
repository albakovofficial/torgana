'use strict';

// Service worker Торганы: только push-уведомления (страницы не кешируем — сайт всегда свежий).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: 'Торгана', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Торгана', {
    body: m.body || '',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/badge-96.png',
    tag: m.tag || undefined,
    renotify: !!m.tag,
    data: { url: m.url || '/' },
    lang: 'ru'
  }));
});

// Нажатие: открываем нужную страницу во вкладке Торганы, если она уже открыта, иначе — новую.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (tab) { await tab.focus(); return tab.navigate(url).catch(() => tab.postMessage({ go: url })); }
    return self.clients.openWindow(url);
  })());
});

'use strict';

// 1.58.0: IndexNow — сообщаем Яндексу (а через него Bing, Seznam и Naver) об изменённых объявлениях сразу, а не ждём,
// пока робот сам обойдёт сайт. Раз в несколько минут берём объявления, изменённые с прошлого раза (опубликованы, изменены,
// проданы, сняты, удалены — у всех меняется updated_at), и отправляем их адреса одним запросом. Удалённое объявление
// отдаёт 410 (lib/seo.js), и Яндекс убирает его из поиска.
// Ключ — случайный, хранится в settings и отдаётся файлом /<ключ>.txt (так Яндекс проверяет, что адреса шлёт сам сайт).
// Работает только на настоящем адресе сайта (https, не localhost) и если задан адрес IndexNow (INDEXNOW_URL='' — выключить).
const crypto = require('node:crypto');

const BATCH = 10000; // столько адресов IndexNow принимает за раз

module.exports = function indexnow({ db, base, listingPath, endpoint, every }) {
  const get = () => db.setting('indexnow');
  const put = (v) => db.saveSetting('indexnow', v);
  let st = get();
  // Первый запуск: ключ и объявления за последние 3 дня — чтобы свежее попало в поиск сразу.
  if (!st || !/^[a-f0-9]{32}$/.test(st.key || '')) { st = { key: crypto.randomBytes(16).toString('hex'), since: Date.now() - 3 * 864e5, sent: 0 }; put(st); }
  const site = String(base || '').replace(/\/$/, '');
  const on = /^https:\/\//.test(site) && !/\/\/(localhost|127\.|\[::1\])/.test(site) && !!endpoint;
  const pick = db.prepare(`SELECT id, title, updated_at FROM listings WHERE updated_at > ? AND updated_at <= ?
    AND status IN ('active', 'sold', 'archived', 'deleted') ORDER BY updated_at LIMIT ${BATCH}`);
  let busy = false;

  async function run() {
    if (!on || busy) return;
    busy = true;
    try {
      const t = Date.now();
      const rows = pick.all(st.since, t);
      // Пачка неполная — всё до t отправлено; полная — продолжим с последнего в следующий раз.
      const until = rows.length === BATCH ? rows[rows.length - 1].updated_at : t;
      if (!rows.length) { st.since = until; put(st); return; }
      const urlList = [...new Set(rows.map((r) => site + listingPath(r)))];
      let res;
      try {
        res = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ host: new URL(site).host, key: st.key, keyLocation: `${site}/${st.key}.txt`, urlList }),
          signal: AbortSignal.timeout(20000)
        });
      } catch (e) { st.error = `нет связи: ${e.message}`; put(st); return; } // повторим в следующий раз
      if (res.ok) { st.since = until; st.sent = (st.sent || 0) + urlList.length; st.lastAt = t; st.lastCount = urlList.length; st.error = ''; } else {
        st.error = `Яндекс ответил ${res.status}`;
        if (res.status === 400 || res.status === 422) st.since = until; // плохие адреса — не повторяем бесконечно
      }
      put(st);
    } finally { busy = false; }
  }
  if (on) setInterval(() => { run().catch((e) => console.error('indexnow:', e.message)); }, every).unref();

  return {
    key: st.key,
    run,
    status: () => ({ on, keyUrl: site ? `${site}/${st.key}.txt` : '', sent: st.sent || 0, lastAt: st.lastAt || null, lastCount: st.lastCount || 0, error: st.error || '' })
  };
};

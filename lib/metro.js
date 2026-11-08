'use strict';

// Станции метро — из открытого справочника hh.ru (https://api.hh.ru/metro): все города с метро,
// линии и их цвета. Сервер скачивает список при запуске и раз в неделю, хранит копию в папке данных —
// если hh.ru недоступен, работает по сохранённой копии. Нет ни копии, ни связи — поле «Метро» не показывается.
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = 'https://api.hh.ru/metro';
const WEEK = 7 * 24 * 3600 * 1000;
const key = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();

// Из ответа hh.ru: { 'москва': [{ name, line, color }] } — по одной записи на название станции.
function parse(raw) {
  const out = {};
  for (const city of Array.isArray(raw) ? raw : []) {
    const seen = new Map();
    for (const line of city.lines || []) {
      for (const st of line.stations || []) {
        const name = String(st.name || '').trim();
        if (!name || seen.has(name)) continue;
        const geo = Number.isFinite(st.lat) && Number.isFinite(st.lng) ? { lat: Math.round(st.lat * 1e5) / 1e5, lng: Math.round(st.lng * 1e5) / 1e5 } : {};
        seen.set(name, { name, line: String(line.name || ''), color: /^[0-9a-f]{6}$/i.test(line.hex_color || '') ? `#${line.hex_color}` : '', ...geo });
      }
    }
    if (seen.size) out[key(city.name)] = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  return out;
}

module.exports = function metro({ dataDir, source = process.env.METRO_SOURCE || SOURCE, log = console }) {
  const cacheFile = path.join(dataDir, 'metro.json');
  let byCity = {};
  let loadedAt = 0;
  try {
    const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    byCity = saved.cities || {}; loadedAt = saved.at || 0;
  } catch { /* копии ещё нет */ }

  async function refresh() {
    try {
      let raw;
      if (/^https?:\/\//.test(source)) {
        const r = await fetch(source, { headers: { 'User-Agent': 'Torgana/1.0 (torgana.ru)' }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        raw = await r.json();
      } else raw = JSON.parse(fs.readFileSync(source, 'utf8')); // файл — для проверок без сети
      const cities = parse(raw);
      if (Object.keys(cities).length < 3) throw new Error('пустой список');
      byCity = cities; loadedAt = Date.now();
      fs.writeFileSync(cacheFile, JSON.stringify({ at: loadedAt, cities }));
      return true;
    } catch (e) {
      log.error(`метро: не удалось обновить список (${e.message})`);
      return false;
    }
  }

  function start() {
    const due = () => Date.now() - loadedAt > WEEK;
    if (!/^https?:\/\//.test(source)) { refresh(); return; } // файл из проверок — сразу
    // 1.38: в старой копии нет координат станций (для карты) — обновим сразу.
    const noGeo = Object.values(byCity).some((list) => list.some((s) => s.lat === undefined));
    if (due() || noGeo) setTimeout(refresh, 3000).unref();
    setInterval(() => { if (due()) refresh(); }, 6 * 3600 * 1000).unref();
  }

  return {
    start,
    refresh,
    stations: (city) => byCity[key(city)] || [],
    has: (city) => !!byCity[key(city)],
    isStation: (city, name) => (byCity[key(city)] || []).some((s) => s.name === name),
    // Координаты станции — для карты (точка объявления — у метро, не у дома).
    geo: (city, name) => { const s = (byCity[key(city)] || []).find((x) => x.name === name); return s && s.lat !== undefined ? { lat: s.lat, lng: s.lng } : null; },
    cities: () => Object.keys(byCity),
    loaded: () => loadedAt
  };
};
module.exports.parse = parse;

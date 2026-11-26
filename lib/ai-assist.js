'use strict';
// ИИ по фото: настройки в модерации и подсказка раздела, характеристик и цены по первому фото в редакторе.
const path = require('node:path');
const { suggestFromPhoto, pingYandex } = require('./ai');

module.exports = function aiAssist({ route, db, h, uploads, dir: UPLOAD_DIR, anthropicKey: AI_KEY, anthropicModel: AI_MODEL }) {
  const { HttpError, requireUser, requireAdmin, readJson, rateLimit, taxonomy } = h;

  // ИИ по фото: Яндекс AI Studio (ключ и каталог — в модерации, «Настройки → ИИ по фото» или YANDEX_AI_KEY/YANDEX_FOLDER_ID),
  // иначе Claude (ANTHROPIC_API_KEY). Нет ни того, ни другого — подсказки выключены.
  const YA_VISION = 'qwen3.6-35b-a3b';
  const YA_TEXT = 'aliceai-llm';
  function aiCfg() {
    const s = db.setting('ai') || {};
    if (s.off) return null;
    const key = s.key || process.env.YANDEX_AI_KEY || '';
    const folder = s.folder || process.env.YANDEX_FOLDER_ID || '';
    if (key && folder) return { provider: 'yandex', key, folder, vision: s.vision || process.env.YANDEX_VISION_MODEL || YA_VISION, text: s.text === '' ? '' : (s.text || process.env.YANDEX_TEXT_MODEL || YA_TEXT) };
    if (AI_KEY) return { provider: 'anthropic', key: AI_KEY, model: AI_MODEL };
    return null;
  }

  // Разделы и их главные поля — для подсказки по фото (раздел и, например, размер или площадь).
  const AI_SUBS = Object.entries(taxonomy.SUBCATS).map(([cat, list]) => list.map((x) => {
    const req = (x.fields || []).filter((f) => f.req).map((f) => (f.type === 'select' && (f.options || []).length <= 15 ? `${f.key}: ${f.options.join(' | ')}` : `${f.key} — ${f.label}${f.unit ? `, ${f.unit}` : ''}${f.type === 'select' ? ' (значение из списка)' : ', число'}`));
    return `${cat}/${x.id} — ${x.name}${req.length ? ` (${req.join('; ')})` : ''}`;
  }).join('\n')).join('\n');

  route('POST', '/api/ai/suggest', async (ctx) => {
    const u = requireUser(ctx);
    const cfg = aiCfg();
    if (!cfg) throw new HttpError(501, 'ИИ-подсказки не подключены');
    rateLimit(`ai:${u.id}`, 30, 60 * 60 * 1000);
    const { file } = await readJson(ctx.req);
    const row = db.prepare('SELECT file FROM uploads WHERE file = ? AND user_id = ?').get(String(file || ''), u.id);
    if (!row) throw new HttpError(400, 'Сначала загрузите фото');
    const type = uploads.IMAGE_TYPES.find((t) => row.file.endsWith(`.${t.ext}`));
    try {
      const s = await suggestFromPhoto({ cfg, filePath: path.join(UPLOAD_DIR, row.file), mime: type.mime, subs: AI_SUBS });
      // Раздел — только из разделов угаданной категории; характеристики — по одной, неверные отбрасываем.
      s.subcategory = s.category && (taxonomy.SUBCATS[s.category] || []).some((x) => x.id === s.subcategory) ? s.subcategory : '';
      const attrs = {};
      if (s.subcategory) for (const [k, v] of Object.entries(s.attrs)) { try { Object.assign(attrs, taxonomy.cleanAttrs(s.subcategory, { [k]: v })); } catch { /* не из списка или вне пределов */ } }
      // 1.60.1: модель машины — только из списка угаданной марки; не из списка — не подставляем.
      if (attrs.model && attrs.brand) { try { const c = taxonomy.cleanAttrs(s.subcategory, attrs); if (!c.model) delete attrs.model; } catch { /* остальное уже проверено */ } }
      s.attrs = attrs;
      const est = s.category ? h.marketEstimate({ category: s.category, title: s.title, priceUnit: '' }) : null;
      return { ...s, priceHint: est ? est.median : null, priceHintCount: est ? est.count : 0 };
    } catch (e) {
      console.error('AI suggest failed:', e.message);
      throw new HttpError(502, 'Не получилось распознать фото. Заполните поля вручную.');
    }
  });

  // ---------- модерация: ИИ по фото (Яндекс AI Studio) ----------
  const aiAdminView = () => {
    const s = db.setting('ai') || {};
    const c = aiCfg();
    return { provider: c ? c.provider : '', on: !!c, off: !!s.off, folder: s.folder || '', hasKey: !!s.key, fromEnv: !s.key && !!process.env.YANDEX_AI_KEY,
      vision: s.vision || YA_VISION, text: s.text === '' ? '' : (s.text || YA_TEXT), defaults: { vision: YA_VISION, text: YA_TEXT } };
  };
  route('GET', '/api/admin/ai', (ctx) => { requireAdmin(ctx); return aiAdminView(); });
  route('PUT', '/api/admin/ai', async (ctx) => {
    const admin = requireAdmin(ctx);
    const b = await readJson(ctx.req);
    const cur = db.setting('ai') || {};
    const model = (v, d) => { const t = String(v === undefined ? d : v).trim(); if (t && !/^[\w.\-/@]{2,80}$/.test(t)) throw new HttpError(400, 'Имя модели — латиница, цифры, точки и дефисы, например aliceai-llm'); return t; };
    const next = {
      key: b.clear ? '' : (b.key ? String(b.key).trim().slice(0, 300) : cur.key || ''),
      folder: b.clear ? '' : String(b.folder === undefined ? cur.folder || '' : b.folder).trim().slice(0, 60),
      vision: model(b.vision, cur.vision || YA_VISION) || YA_VISION,
      text: model(b.text, cur.text === undefined ? YA_TEXT : cur.text),
      off: !!b.off
    };
    if (next.folder && !/^[a-z0-9]{10,40}$/.test(next.folder)) throw new HttpError(400, 'Идентификатор каталога — строка вида b1g… из консоли Yandex Cloud');
    if (next.key && !next.folder) throw new HttpError(400, 'Укажите идентификатор каталога Yandex Cloud');
    db.saveSetting('ai', next);
    h.audit(admin, 'ai-settings', {}, { folder: next.folder, vision: next.vision, text: next.text, off: next.off });
    return aiAdminView();
  });
  route('POST', '/api/admin/ai/test', async (ctx) => {
    requireAdmin(ctx);
    const c = aiCfg();
    if (!c || c.provider !== 'yandex') throw new HttpError(400, 'Сначала сохраните ключ и каталог Яндекс AI Studio');
    try { return { ok: true, answer: await pingYandex(c) }; } catch (e) { throw new HttpError(502, e.status === 401 || e.status === 403 ? 'Ключ не подошёл: проверьте API-ключ и что у сервисного аккаунта есть роль ai.languageModels.user' : e.message); }
  });

  return { aiCfg };
};

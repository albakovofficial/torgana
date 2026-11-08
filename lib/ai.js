'use strict';

const fs = require('node:fs');
const { CATEGORIES } = require('./constants');

// ИИ-подсказка по фото. Работает, только если задан ANTHROPIC_API_KEY.
function buildPrompt(subs) {
  const cats = CATEGORIES.map((c) => `${c.id} — ${c.name} (${c.hint})`).join('\n');
  return `Ты помогаешь человеку разместить объявление на площадке «Торгана». По фото определи, что продаётся.
Ответь ТОЛЬКО JSON без пояснений, в формате:
{"title": "...", "category": "...", "subcategory": "...", "attrs": {}, "condition": "new|used|", "description": "..."}
Правила:
- title: до 60 символов, конкретно (что это, модель/материал/размер, если видно на фото).
- category: один id из списка ниже.
- subcategory: id раздела этой категории из списка разделов (без категории и косой черты) или "", если не уверен.
- attrs: только главные поля этого раздела и только то, что видно на фото или написано на вещи/бирке (например, размер на ярлыке). Для полей со списком — значение ровно из списка. Не угадывай: не видно — не пиши поле.
- condition: "new", если вещь явно новая (в упаковке, с бирками), "used", если видны следы использования, иначе "".
- description: 2–4 коротких предложения на русском. Только то, что видно на фото. Не выдумывай дефекты, характеристики и комплектацию, которых не видно. В конце добавь фразу-подсказку, что ещё стоит указать продавцу (например, размер или состояние батареи).
Категории:
${cats}${subs ? `

Разделы (категория/раздел — название, главные поля):
${subs}` : ''}`;
}

// Anthropic (Claude): одно обращение — фото и вся форма.
async function suggestAnthropic({ apiKey, model, filePath, mime, subs = '' }) {
  const data = fs.readFileSync(filePath).toString('base64');
  const prompt = buildPrompt(subs);

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data } },
          { type: 'text', text: prompt }
        ]
      }]
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!resp.ok) throw new Error(`AI HTTP ${resp.status}`);
  const json = await resp.json();
  const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return clean(parseJson(text));
}

const parseJson = (text) => {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI: нет JSON');
  return JSON.parse(match[0]);
};
function clean(parsed) {
  const category = CATEGORIES.some((c) => c.id === parsed.category) ? parsed.category : '';
  return {
    title: String(parsed.title || '').slice(0, 80),
    category,
    subcategory: typeof parsed.subcategory === 'string' ? parsed.subcategory.replace(/^.*\//, '').slice(0, 40) : '',
    attrs: parsed.attrs && typeof parsed.attrs === 'object' && !Array.isArray(parsed.attrs) ? parsed.attrs : {},
    condition: ['new', 'used'].includes(parsed.condition) ? parsed.condition : '',
    description: String(parsed.description || '').slice(0, 1500)
  };
}

// Яндекс AI Studio (OpenAI-совместимый API, серверы в России).
// Шаг 1 — модель с распознаванием изображений (по умолчанию Qwen3.6) смотрит на фото и заполняет форму.
// Шаг 2 — Алиса AI переписывает название и описание живым русским языком, не добавляя фактов.
const YA_URL = process.env.YANDEX_AI_URL || 'https://ai.api.cloud.yandex.net/v1/chat/completions'; // адрес меняют только тесты
async function yaChat({ key, folder }, body, timeout = 40000) {
  const resp = await fetch(YA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: /^t1\./.test(key) ? `Bearer ${key}` : `Api-Key ${key}`, 'OpenAI-Project': folder },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) { const e = new Error(`Яндекс AI: ${(json.error && (json.error.message || json.error)) || `HTTP ${resp.status}`}`); e.status = resp.status; throw e; }
  return String((((json.choices || [])[0] || {}).message || {}).content || '');
}
async function suggestYandex({ cfg, filePath, mime, subs = '' }) {
  const data = fs.readFileSync(filePath).toString('base64');
  const first = clean(parseJson(await yaChat(cfg, {
    model: `gpt://${cfg.folder}/${cfg.vision}`,
    temperature: 0.2, max_tokens: 900,
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } }, { type: 'text', text: buildPrompt(subs) }] }]
  })));
  if (!cfg.text || !first.title) return first;
  try {
    const out = parseJson(await yaChat(cfg, {
      model: `gpt://${cfg.folder}/${cfg.text}`,
      temperature: 0.3, max_tokens: 600,
      messages: [
        { role: 'system', content: 'Ты помогаешь продавцу на доске объявлений «Торгана». Перепиши название и описание объявления: просто, честно, по-русски, без восклицательных знаков, рекламных штампов и эмодзи. Не добавляй фактов, которых нет во входных данных. Ответь только JSON: {"title": "...", "description": "..."}. title — до 60 символов: что это, модель или материал, размер, если известен. description — 2–4 коротких предложения.' },
        { role: 'user', content: JSON.stringify({ title: first.title, description: first.description, condition: first.condition, attrs: first.attrs }) }
      ]
    }, 20000));
    if (out.title) first.title = String(out.title).slice(0, 80);
    if (out.description) first.description = String(out.description).slice(0, 1500);
  } catch { /* Алиса не ответила — оставляем черновик первой модели */ }
  return first;
}
// Проверка ключа из модерации: короткий запрос к текстовой модели.
async function pingYandex(cfg) {
  const t = await yaChat(cfg, { model: `gpt://${cfg.folder}/${cfg.text || 'aliceai-llm'}`, max_tokens: 20, temperature: 0, messages: [{ role: 'user', content: 'Ответь одним словом: работает' }] }, 15000);
  return t.trim().slice(0, 60);
}

async function suggestFromPhoto({ cfg, filePath, mime, subs }) {
  if (cfg.provider === 'yandex') return suggestYandex({ cfg, filePath, mime, subs });
  return suggestAnthropic({ apiKey: cfg.key, model: cfg.model, filePath, mime, subs });
}

module.exports = { suggestFromPhoto, pingYandex };

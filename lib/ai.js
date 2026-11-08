'use strict';

const fs = require('node:fs');
const { CATEGORIES } = require('./constants');

// ИИ-подсказка по фото. Работает, только если задан ANTHROPIC_API_KEY.
async function suggestFromPhoto({ apiKey, model, filePath, mime, subs = '' }) {
  const data = fs.readFileSync(filePath).toString('base64');
  const cats = CATEGORIES.map((c) => `${c.id} — ${c.name} (${c.hint})`).join('\n');
  const prompt = `Ты помогаешь человеку разместить объявление на площадке «Торгана». По фото определи, что продаётся.
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
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI: нет JSON');
  const parsed = JSON.parse(match[0]);
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

module.exports = { suggestFromPhoto };

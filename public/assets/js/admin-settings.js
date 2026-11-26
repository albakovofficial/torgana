// Модерация: настройки площадки — вход через сервисы, источники, push, ИИ, оплата, поиск, копии, уведомления, почта.
import { $, $$, NF, S, api, ava, dateShort, hm, html, plural, raw, rub, when } from './core.js';
import { ic } from './icons.js';
import { confirmModal, openModal, toast } from './ui.js';
import { go, render, setCleanup, setTitle } from './router.js';
import { authPage, codeForm } from './auth.js';
import { CANCEL_REASON, PAY_STATUS } from './business.js';

// ---------- откуда приходят люди ----------
const SRC_NAME = { vk: 'ВКонтакте', instagram: 'Instagram', telegram: 'Telegram', max: 'MAX', yandex: 'Яндекс', 'yandex-direct': 'Яндекс Директ', google: 'Google', dzen: 'Дзен', ok: 'Одноклассники', avito: 'Авито', direct: 'Прямые заходы', unknown: 'До начала учёта' };
export async function renderSourcesAdmin(box, q) {
  const days = ['7', '30', '90', '365'].includes(q.get('days')) ? q.get('days') : '30';
  const d = await api('GET', `/api/admin/sources?days=${days}`);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}`.replace('.', ',') + '%' : '—');
  const max = Math.max(1, ...d.items.map((r) => r.signups));
  box.innerHTML = String(html`<div class="adm-head"><h1>Откуда приходят</h1></div>
    <div class="pf-status">${[['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней'], ['365', 'Год']].map(([k, t]) => html`<a class="chip ${k === days ? 'active' : ''}" href="/admin?status=sources&days=${k}">${t}</a>`)}</div>
    <div class="stats">${[['заходов', d.total.visits], ['регистраций', d.total.signups], ['стали продавцами', d.total.sellers], ['объявлений от них', d.total.listings]].map(([k, n]) => html`<div class="stat"><div class="n">${NF.format(n)}</div><div class="k">${k}</div></div>`)}</div>
    ${d.items.length ? html`<div class="src-tbl" role="table">
      <div class="src-row src-h" role="row"><span>Источник</span><span>Заходы</span><span>Регистрации</span><span>Конверсия</span><span>Продавцы</span><span>Объявления</span></div>
      ${d.items.map((r) => html`<div class="src-row" role="row"><span class="src-name"><b>${SRC_NAME[r.src] || r.src}</b>${r.campaign ? html`<small>${r.campaign}</small>` : ''}<i style="width:${Math.round((r.signups / max) * 100)}%"></i></span>
        <span>${NF.format(r.visits)}</span><span><b>${NF.format(r.signups)}</b></span><span>${pct(r.signups, r.visits)}</span><span>${NF.format(r.sellers)}</span><span>${NF.format(r.listings)}</span></div>`)}</div>`
  : html`<div class="empty"><h3>Пока пусто</h3><p>Заходы начнут считаться с этой версии сайта.</p></div>`}
    <section class="panel src-link"><h2 class="h2" style="margin:0">Ссылка с меткой</h2>
      <p class="muted" style="margin:0;font-size:14px">Ставьте такие ссылки в посты, рекламу и сторис — и здесь будет видно, сколько людей пришло и сколько из них стали продавцами.</p>
      <div class="row stack-m"><div class="field" style="flex:1"><label for="sl-src">Где разместите</label><select id="sl-src" class="select">${['vk', 'max', 'telegram', 'instagram', 'yandex-direct', 'dzen', 'ok'].map((k) => html`<option value="${k}">${SRC_NAME[k]}</option>`)}</select></div>
        <div class="field" style="flex:1"><label for="sl-c">Метка кампании <small class="muted">— по желанию</small></label><input id="sl-c" class="input" placeholder="например, post-velosiped" autocomplete="off"></div></div>
      <div class="oa-copy"><code id="sl-url"></code><button type="button" class="btn btn-soft btn-sm" id="sl-copy">Скопировать</button></div>
      <p class="muted" style="margin:0;font-size:13px">Без метки тоже считаем: если человек перешёл из ВКонтакте, Яндекса или Google, источник определится по сайту, с которого он пришёл. «Прямые заходы» — набрали адрес сами или открыли из закладок и мессенджеров, которые не сообщают источник.</p>
    </section>`);
  const upd = () => { const c = $('#sl-c').value.trim().toLowerCase().replace(/[^a-z0-9а-яё_.-]+/gi, '-'); $('#sl-url').textContent = `${location.origin}/?utm_source=${$('#sl-src').value}${c ? `&utm_campaign=${encodeURIComponent(c)}` : ''}`; };
  $('#sl-src').onchange = upd; $('#sl-c').oninput = upd; upd();
  $('#sl-copy').onclick = async () => { const t = $('#sl-url').textContent; try { await navigator.clipboard.writeText(t); toast('Скопировано'); } catch { toast(t); } };
}

// ---------- ИИ по фото: Яндекс AI Studio ----------
// 1.56.0: приложение для iPhone — ключ Apple для push (APNs). Он же даёт Team ID для ссылок torgana.ru → приложение.
export async function renderApnsAdmin(box) {
  const a = await api('GET', '/api/admin/apns');
  box.innerHTML = String(html`<div class="adm-head"><h1>Приложение iPhone</h1><span class="pf-badge ${a.ready ? 'ok' : ''}">${a.ready ? 'push подключены' : 'не подключено'}</span></div>
    <p class="muted" style="margin:0;max-width:720px">Push в приложение Торгана приходят через Apple. Нужен ключ APNs из Apple Developer — один на все приложения команды.
      С ним же ссылки torgana.ru открываются сразу в приложении. Устройств с приложением: <b>${NF.format(a.devices)}</b>.</p>
    <form id="apns-f" class="oa-grid"><section class="panel oa-card">
      <div class="oa-head"><h2 class="h2">Ключ Apple Push</h2><span class="pf-badge ${a.ready ? 'ok' : ''}">${a.ready ? 'сохранён' : 'нет ключа'}</span></div>
      <ol class="ai-steps">
        <li><a href="https://developer.apple.com/account/resources/authkeys/list" target="_blank" rel="noopener">Certificates, Identifiers &amp; Profiles → Keys</a> → «+».</li>
        <li>Имя «Torgana Push», галочка <b>Apple Push Notifications service (APNs)</b> → Continue → Register.</li>
        <li>Скачайте файл <code>AuthKey_….p8</code> (его дают один раз), откройте в Блокноте и вставьте ниже целиком. Key ID — рядом с ключом.</li>
        <li>Team ID — <a href="https://developer.apple.com/account#MembershipDetailsCard" target="_blank" rel="noopener">Membership details</a>.</li>
      </ol>
      <div class="row stack-m"><div class="field" style="flex:1"><label for="ap-team">Team ID</label><input id="ap-team" name="teamId" class="input" value="${a.teamId}" autocomplete="off" maxlength="10" placeholder="10 символов"></div>
        <div class="field" style="flex:1"><label for="ap-kid">Key ID</label><input id="ap-kid" name="keyId" class="input" value="${a.keyId}" autocomplete="off" maxlength="10" placeholder="10 символов"></div></div>
      <div class="field"><label for="ap-key">Ключ .p8</label><textarea id="ap-key" name="key" class="input" rows="5" autocomplete="off" spellcheck="false" style="height:auto;font-family:ui-monospace,monospace;font-size:13px" placeholder="${a.hasKey ? 'сохранён — оставьте пустым, чтобы не менять' : '-----BEGIN PRIVATE KEY-----'}"></textarea></div>
      <details class="ai-more"><summary>Bundle ID</summary><div class="field"><label for="ap-topic">Bundle ID приложения</label><input id="ap-topic" name="topic" class="input" value="${a.topic}" autocomplete="off"></div></details>
      <div class="ai-act"><button class="btn btn-dark" type="submit">Сохранить</button><button class="btn btn-soft" type="button" id="ap-test" ${a.ready ? '' : raw('disabled')}>Проверить на моём iPhone</button>${a.ready ? html`<button class="btn btn-line" type="button" id="ap-off">Удалить ключ</button>` : ''}</div>
      <p class="muted" style="margin:0;font-size:13px">Проверка придёт на iPhone, где открыто приложение Торгана под вашим аккаунтом и разрешены уведомления${a.mine ? ` (у вас: ${a.mine})` : ''}.</p>
      ${a.lastError ? html`<p style="margin:0;font-size:13px;color:var(--danger)">Последняя ошибка Apple (${new Date(a.lastError.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}): ${a.lastError.text}</p>` : ''}
    </section></form>`);
  $('#apns-f').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api('PUT', '/api/admin/apns', { teamId: f.teamId.value, keyId: f.keyId.value, key: f.key.value, topic: f.topic.value }); toast('Ключ сохранён'); renderApnsAdmin(box); } catch (ex) { toast(ex.message, true); }
  };
  $('#ap-test').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await api('POST', '/api/admin/apns/test'); toast('Отправили — посмотрите на iPhone'); } catch (ex) { toast(ex.message, true); renderApnsAdmin(box); return; }
    b.disabled = false;
  };
  const off = $('#ap-off');
  if (off) off.onclick = async () => { if (!(await confirmModal('Удалить ключ Apple?', 'Push в приложение перестанут приходить, ссылки torgana.ru перестанут открываться в приложении.', 'Удалить', true))) return; try { await api('PUT', '/api/admin/apns', { clear: true }); toast('Ключ удалён'); renderApnsAdmin(box); } catch (ex) { toast(ex.message, true); } };
}

export async function renderAiAdmin(box) {
  const a = await api('GET', '/api/admin/ai');
  const state = a.off ? ['', 'выключено'] : a.provider === 'yandex' ? ['ok', 'подключено'] : a.provider ? ['ok', 'работает через Claude'] : ['', 'не подключено'];
  box.innerHTML = String(html`<div class="adm-head"><h1>ИИ по фото</h1></div>
    <p class="muted" style="margin:0;max-width:720px">Продавец загружает первое фото — и Торгана сама заполняет название, категорию, раздел, главные характеристики и описание. Фото распознаёт модель ${a.defaults.vision} в Яндекс AI Studio, текст пишет Алиса AI. Серверы — в России.</p>
    <form id="ai-f" class="oa-grid"><section class="panel oa-card">
      <div class="oa-head"><h2 class="h2">Яндекс AI Studio</h2><span class="pf-badge ${state[0]}">${state[1]}</span></div>
      <ol class="ai-steps">
        <li>Откройте <a href="https://console.yandex.cloud" target="_blank" rel="noopener">консоль Yandex Cloud</a> и выберите каталог. Его идентификатор (начинается с b1g…) — в адресной строке и на странице каталога.</li>
        <li>«Сервисные аккаунты» → создайте аккаунт с ролью <code>ai.languageModels.user</code>.</li>
        <li>В аккаунте: «Создать новый ключ» → «API-ключ». Скопируйте секрет — он показывается один раз.</li>
      </ol>
      <div class="field"><label for="ai-key">API-ключ</label><input id="ai-key" name="key" class="input" type="password" autocomplete="new-password" placeholder="${a.hasKey ? 'сохранён — оставьте пустым, чтобы не менять' : a.fromEnv ? 'задан на сервере' : 'AQVN…'}"></div>
      <div class="field"><label for="ai-folder">Идентификатор каталога</label><input id="ai-folder" name="folder" class="input" value="${a.folder}" autocomplete="off" placeholder="b1g…"></div>
      <details class="ai-more"><summary>Модели</summary>
        <div class="field"><label for="ai-vision">Распознавание фото</label><input id="ai-vision" name="vision" class="input" value="${a.vision}" autocomplete="off"></div>
        <div class="field"><label for="ai-text">Текст объявления <small class="muted">— пусто, чтобы не переписывать</small></label><input id="ai-text" name="text" class="input" value="${a.text}" autocomplete="off"></div>
      </details>
      <label class="switch"><span>Выключить ИИ по фото<small>Продавцы будут заполнять объявление сами</small></span><input type="checkbox" name="off" ${a.off ? raw('checked') : ''}><span class="track"></span></label>
      <div class="ai-act"><button class="btn btn-dark" type="submit">Сохранить</button><button class="btn btn-soft" type="button" id="ai-test" ${a.provider === 'yandex' ? '' : raw('disabled')}>Проверить</button></div>
      <p class="ai-res hidden" id="ai-res" role="status"></p>
    </section></form>`);
  $('#ai-f').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('PUT', '/api/admin/ai', { key: f.key.value.trim(), folder: f.folder.value.trim(), vision: f.vision.value.trim(), text: f.text.value.trim(), off: f.off.checked });
      S.config = await api('GET', '/api/config').catch(() => S.config);
      toast('Сохранено'); renderAiAdmin(box);
    } catch (ex) { toast(ex.message, true); }
  };
  $('#ai-test').onclick = async (e) => {
    const b = e.currentTarget; const res = $('#ai-res');
    b.disabled = true; b.textContent = 'Проверяем…';
    try { const r = await api('POST', '/api/admin/ai/test'); res.className = 'ai-res ok'; res.textContent = `Работает — Алиса ответила: «${r.answer}»`; } catch (ex) { res.className = 'ai-res bad'; res.textContent = ex.message; }
    b.disabled = false; b.textContent = 'Проверить';
  };
}

// ---------- деньги: платежи, возвраты ----------
export async function renderPaymentsAdmin(box, q) {
  const f = q.get('f') || '';
  const d = await api('GET', `/api/admin/payments${f ? `?f=${f}` : ''}`);
  const FILTERS = [['', 'Все'], ['succeeded', 'Оплачены'], ['pending', 'Ждут оплаты'], ['canceled', 'Не оплачены'], ['refunded', 'С возвратом']];
  const KIND = { plan: 'Тариф', promo: 'Продвижение' };
  box.innerHTML = String(html`<div class="adm-head"><h1>Платежи</h1>${S.config.billing.ready ? '' : html`<a class="btn btn-dark btn-sm" href="/admin?status=billing">Подключить ЮKassa</a>`}</div>
    <div class="stats">${[['за сутки', d.totals.today], ['за 30 дней', d.totals.month], ['всего', d.totals.all]].map(([k, t]) => html`<div class="stat"><div class="n">${rub(t.s)}</div><div class="k">${k} · ${t.n} ${plural(t.n, 'платёж', 'платежа', 'платежей')}</div></div>`)}</div>
    <p class="muted" style="margin:-14px 0 16px;font-size:13px">Выручка — оплаченное за вычетом возвратов, без платежей тестового магазина ЮKassa.</p>
    <div class="pf-status">${FILTERS.map(([k, t]) => html`<a class="chip ${k === f ? 'active' : ''}" href="/admin?status=payments${k ? `&f=${k}` : ''}">${t}</a>`)}</div>
    ${d.items.length ? html`<div class="adm-pay">${d.items.map((p) => html`<div class="adm-pay-row">
        <a class="adm-pay-who" href="/admin/u/${p.user.id}">${ava(p.user, 'sm')}<span><b>${p.user.name}</b><small>${p.user.email}</small></span></a>
        <div class="adm-pay-what"><b>${p.title}</b><small>${KIND[p.kind]} · ${when(p.createdAt)}${p.method ? ` · ${p.method}` : ''}${p.test ? ' · тестовый' : ''}${p.error ? ` · ${CANCEL_REASON[p.error] || p.error}` : ''}</small>
          ${p.refunds.map((r) => html`<small class="adm-pay-ref">Возврат ${rub(r.amount)} · ${when(r.at)} · ${r.reason}</small>`)}</div>
        <span class="pay-amt">${rub(p.amount)}</span>
        <span class="ml-tag ${(PAY_STATUS[p.status] || PAY_STATUS.error)[0]}"><i></i>${(PAY_STATUS[p.status] || PAY_STATUS.error)[1]}</span>
        <div class="adm-pay-act">${p.status === 'succeeded' && p.refunded < p.amount ? html`<button class="btn btn-line btn-sm" data-refund="${p.id}">Вернуть</button>` : ''}${p.status === 'pending' ? html`<button class="btn btn-soft btn-sm" data-sync="${p.id}">Проверить</button>` : ''}</div>
      </div>`)}</div>` : html`<div class="empty"><h3>Платежей нет</h3><p>${f ? 'В этом разделе пусто.' : 'Здесь появятся оплаты тарифов и продвижения.'}</p></div>`}`);
  const byId = Object.fromEntries(d.items.map((p) => [p.id, p]));
  $$('[data-sync]', box).forEach((b) => { b.onclick = async () => { try { await api('POST', `/api/admin/payments/${b.dataset.sync}/sync`); toast('Проверили в ЮKassa'); render(); } catch (e) { toast(e.message, true); } }; });
  $$('[data-refund]', box).forEach((b) => {
    b.onclick = () => {
      const p = byId[b.dataset.refund];
      const left = p.amount - p.refunded;
      openModal(String(html`<h2>Возврат</h2><p class="muted" style="margin:0 0 14px">${p.title} · ${p.user.name} · оплачено ${rub(p.amount)}${p.refunded ? `, уже возвращено ${rub(p.refunded)}` : ''}</p>
        <div class="field"><label for="rf-a">Сумма, ₽</label><input id="rf-a" class="input" inputmode="numeric" value="${left}"><span class="help">До ${rub(left)}. За неиспользованные дни: стоимость ÷ дни × оставшиеся полные дни.</span></div>
        <div class="reasons" style="margin-top:12px">${['Неиспользованные дни', 'Продвижение остановлено модератором', 'Ошибочная оплата', 'Технический сбой'].map((r) => html`<button type="button" class="chip" data-r="${r}">${r}</button>`)}</div>
        <label class="sr" for="rf-r">Причина</label><textarea id="rf-r" class="textarea" style="margin-top:12px;min-height:90px" maxlength="250" placeholder="Причина — её увидит покупатель в письме"></textarea>
        <label class="switch" style="margin-top:12px"><span>Завершить услугу<small>${p.kind === 'plan' ? 'Тариф закончится сейчас' : 'Продвижение остановится'}</small></span><input type="checkbox" id="rf-stop" checked><span class="track"></span></label>
        <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-danger" data-ok>Вернуть деньги</button></div>`), (m, close) => {
        $('[data-x]', m).onclick = close;
        $$('[data-r]', m).forEach((c) => { c.onclick = () => { $('#rf-r', m).value = c.dataset.r; }; });
        $('[data-ok]', m).onclick = async (e) => {
          e.currentTarget.disabled = true;
          try { await api('POST', `/api/admin/payments/${p.id}/refund`, { amount: parseInt($('#rf-a', m).value.replace(/\s/g, ''), 10), reason: $('#rf-r', m).value.trim(), stop: $('#rf-stop', m).checked }); close(); toast('Возврат оформлен'); render(); } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; }
        };
      });
    };
  });
}

// ---------- оплата: подключение ЮKassa (цены и бесплатный старт — в разделе «Реклама», 1.45.0) ----------
export async function renderBillingAdmin(box) {
  const d = await api('GET', '/api/admin/billing');
  const c = d.config;
  const opt = (map, cur) => Object.entries(map).map(([k, t]) => html`<option value="${k}" ${String(cur) === k ? raw('selected') : ''}>${t}</option>`);
  box.innerHTML = String(html`<div class="adm-head"><h1>Оплата</h1><span class="pf-badge ${c.ready ? 'ok' : ''}">${c.ready ? (c.test ? 'тестовый магазин' : 'ЮKassa подключена') : 'не подключена'}</span></div>
    <div class="mail-grid">
      <form class="panel settings" id="yk" style="max-width:none">
        <h2 class="h2" style="margin:0">ЮKassa</h2>
        <p class="muted" style="margin:0;font-size:14px">Отдельный магазин для torgana.ru в вашем кабинете ЮKassa (можно в том же договоре, что и у ALBAKOV). Ключи — в «Интеграция → Ключи API».</p>
        <div class="row stack-m"><div class="field" style="flex:1"><label for="yk-id">shopId</label><input id="yk-id" name="shopId" class="input" inputmode="numeric" value="${c.shopId}" autocomplete="off"></div>
          <div class="field" style="flex:2"><label for="yk-s">Секретный ключ</label><input id="yk-s" name="secret" type="password" class="input" autocomplete="new-password" placeholder="${c.hasSecret ? 'сохранён — оставьте пустым, чтобы не менять' : 'live_… или test_…'}"></div></div>
        <div class="field"><span class="label">Адрес для HTTP-уведомлений</span><div class="oa-copy"><code>${c.webhook}</code><button type="button" class="btn btn-soft btn-sm" data-copy="${c.webhook}">Скопировать</button></div>
          <span class="help">В ЮKassa: «Интеграция → HTTP-уведомления», события payment.succeeded и payment.canceled. Без уведомлений тоже работает — сайт проверяет платёж, когда человек возвращается с оплаты.</span></div>
        <label class="switch"><span>Отправлять чеки через ЮKassa<small>«Чеки от ЮKassa» или ваша онлайн-касса, подключённая к магазину (54-ФЗ)</small></span><input type="checkbox" name="receipts" ${c.receipts ? raw('checked') : ''}><span class="track"></span></label>
        <div class="row stack-m"><div class="field" style="flex:1"><label for="yk-vat">НДС в чеке</label><select id="yk-vat" name="vat" class="select">${opt(d.vat, c.vat)}</select></div>
          <div class="field" style="flex:1"><label for="yk-mode">Признак расчёта</label><select id="yk-mode" name="mode" class="select">${opt(d.modes, c.mode)}</select></div></div>
        <div class="field"><label for="yk-tax">Система налогообложения в чеке</label><select id="yk-tax" name="tax" class="select">${opt(d.tax, c.tax)}</select><span class="help">Нужна, только если у кассы несколько систем. Ставку НДС и систему налогообложения уточните у бухгалтера.</span></div>
        <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить</button>${c.ready ? html`<button type="button" class="btn btn-line" data-yk-off>Отключить</button>` : ''}</div>
      </form>
    </div>`);
  $$('[data-copy]', box).forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Скопировано'); } catch { toast(b.dataset.copy); } }; });
  const after = async (msg) => { S.config = await api('GET', '/api/config'); toast(msg); render(); };
  $('#yk', box).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api('PUT', '/api/admin/billing', { config: { shopId: f.shopId.value, secret: f.secret.value, receipts: f.receipts.checked, vat: f.vat.value, mode: f.mode.value, tax: f.tax.value } }); await after('Сохранено. Проверьте оплату тестовым магазином или на 1 ₽.'); } catch (ex) { toast(ex.message, true); }
  };
  const off = $('[data-yk-off]', box);
  if (off) off.onclick = async () => { if (!(await confirmModal('Отключить оплату?', 'Кнопки оплаты пропадут с сайта. Уже оплаченные тарифы и продвижение продолжат работать.', 'Отключить', true))) return; try { await api('PUT', '/api/admin/billing', { config: { clear: true } }); await after('Оплата отключена'); } catch (ex) { toast(ex.message, true); } };
}

// ---------- поиск и статистика: Вебмастер, Search Console, Метрика ----------
export async function renderSeoAdmin(box) {
  const d = await api('GET', '/api/admin/seo');
  const s = d.seo;
  const step = (n, t, body) => html`<li><span class="seo-n">${n}</span><div><b>${t}</b><p>${body}</p></div></li>`;
  box.innerHTML = String(html`<div class="adm-head"><h1>Поиск и статистика</h1></div>
    <div class="mail-grid">
      <form class="panel settings" id="seo-f" style="max-width:none">
        <h2 class="h2" style="margin:0">Подключение</h2>
        <div class="field"><label for="sy">Яндекс.Вебмастер — код подтверждения</label><input id="sy" name="yandex" class="input" value="${s.yandex}" placeholder="например 1a2b3c4d5e6f7a8b" autocomplete="off"><span class="help">Можно вставить весь тег &lt;meta name="yandex-verification" …&gt; — возьмём код сами.</span></div>
        <div class="field"><label for="sg">Google Search Console — код подтверждения</label><input id="sg" name="google" class="input" value="${s.google}" placeholder="необязательно" autocomplete="off"></div>
        <div class="field"><label for="sm">Яндекс.Метрика — номер счётчика</label><input id="sm" name="metrika" class="input" inputmode="numeric" value="${s.metrika}" placeholder="например 98765432" autocomplete="off"><span class="help">Счётчик включается только у тех, кто нажал «Хорошо» в плашке cookie. Вебвизор выключен.</span></div>
        <div class="field"><label for="smk">Яндекс Карты — ключ JavaScript API</label><input id="smk" name="mapsKey" class="input" value="${s.mapsKey}" placeholder="например 0a1b2c3d-…" autocomplete="off"><span class="help">С ключом в поиске появляется переключатель «Список | Карта». Без ключа карты нет.</span></div>
        <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить</button></div>
      </form>
      <section class="panel settings" style="max-width:none">
        <h2 class="h2" style="margin:0">Как подключить</h2>
        <ol class="seo-steps">
          ${step(1, 'Вебмастер', html`На <a href="https://webmaster.yandex.ru" target="_blank" rel="noopener" style="text-decoration:underline">webmaster.yandex.ru</a> добавьте сайт https://torgana.ru → способ «Мета-тег» → скопируйте код сюда и сохраните → нажмите «Проверить» в Вебмастере.`)}
          ${step(2, 'Карта сайта', html`В Вебмастере: «Индексирование → Файлы Sitemap» → добавьте <code>${d.sitemap}</code>. Она обновляется сама.`)}
          ${step(3, 'Яндекс Товары', html`В Вебмастере: «Товары и цены → Фиды» → «Добавить фид» → <code>${d.feed}</code>. Объявления-вещи с ценой и фото появятся в товарном блоке выдачи. Фид обновляется раз в час.`)}
          ${step(4, 'Метрика', html`На <a href="https://metrika.yandex.ru" target="_blank" rel="noopener" style="text-decoration:underline">metrika.yandex.ru</a> создайте счётчик для torgana.ru без Вебвизора → номер счётчика — сюда.`)}
          ${step(5, 'Google', 'По желанию: Search Console → «Тег HTML» → код сюда, затем добавьте ту же карту сайта.')}
          ${step(6, 'Карта объявлений', html`В <a href="https://developer.tech.yandex.ru" target="_blank" rel="noopener" style="text-decoration:underline">Кабинете разработчика Яндекса</a> → «Подключить API» → «JavaScript API и HTTP Геокодер» → в ограничениях укажите сайт torgana.ru → ключ сюда.`)}
        </ol>
        <div class="oa-copy"><code>${d.robots}</code><a class="btn btn-soft btn-sm" href="${d.robots}" target="_blank" rel="noopener">Открыть</a></div>
        <div class="seo-now"><b>IndexNow</b> — Яндекс узнаёт о новых, изменённых и снятых объявлениях за минуты, настраивать ничего не нужно.
          ${d.indexnow.on ? html`${d.indexnow.lastAt ? html`Последняя отправка — ${new Date(d.indexnow.lastAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}, адресов: ${d.indexnow.lastCount}. Всего отправлено: ${d.indexnow.sent}.` : 'Первая отправка — в ближайшие минуты.'}${d.indexnow.error ? html` <span style="color:var(--danger)">Ошибка: ${d.indexnow.error}</span>` : ''}` : 'Включится на настоящем адресе сайта (https).'}</div>
      </section>
    </div>`);
  $('#seo-f', box).onsubmit = async (e) => {
    e.preventDefault();
    try { await api('PUT', '/api/admin/seo', Object.fromEntries(new FormData(e.target).entries())); S.config = await api('GET', '/api/config'); toast('Сохранено'); render(); } catch (ex) { toast(ex.message, true); }
  };
}

// ---------- копии в облако, состояние сервера, устройства модератора ----------
const fmtBytes = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} ГБ` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
export async function renderBackupAdmin(box) {
  const [d, dev] = await Promise.all([api('GET', '/api/admin/backup'), api('GET', '/api/admin/devices')]);
  const c = d.config;
  const sv = d.server;
  const owner = S.user.isOwner || !sv.owner;
  const L = d.last;
  const lastLine = d.running ? html`<div class="bk-state run"><span class="bk-dot"></span><div><b>Делаем копию…</b><span>${d.running.step || 'база'} · начали ${hm(d.running.at)}</span></div></div>`
    : L ? (L.ok ? html`<div class="bk-state ok">${ic('check', 20, 2.4)}<div><b>Последняя копия — ${when(L.at)}</b><span>база ${fmtBytes(L.dbSize)} · ${L.files ? `новых фото и видео: ${NF.format(L.files)} (${fmtBytes(L.bytes)})` : 'новых фото не было'} · ${L.seconds} с</span></div></div>`
      : html`<div class="bk-state bad">${ic('warn', 20, 2)}<div><b>Копия не сделана — ${when(L.at)}</b><span>${L.error}</span></div></div>`)
      : html`<div class="bk-state">${ic('clock', 20, 2)}<div><b>Копий в облаке ещё не было</b><span>${d.ready ? 'Первая — сегодня ночью или по кнопке «Сделать копию сейчас»' : 'Укажите хранилище слева'}</span></div></div>`;
  const V = d.verify;
  const verifyLine = V ? html`<div class="bk-state ${V.ok ? 'ok' : 'bad'}">${ic(V.ok ? 'shield' : 'warn', 20, 2)}<div><b>${V.ok ? 'Копия проверена' : 'Проверка нашла расхождения'} — ${when(V.at)}</b>
      <span>копия от ${when(V.made)} (${fmtBytes(V.size)}), всего копий базы: ${V.copies}. В копии: ${NF.format(V.copy.users)} польз., ${NF.format(V.copy.listings)} объявл., ${NF.format(V.copy.messages)} сообщ.; на сайте сейчас: ${NF.format(V.live.users)}, ${NF.format(V.live.listings)}, ${NF.format(V.live.messages)}. Фото: проверено ${V.photos.ok} из ${V.photos.checked}, в облаке ${NF.format(V.photos.total)}.</span></div></div>` : '';
  const disk = sv.disk ? Math.round((1 - sv.disk.free / sv.disk.total) * 100) : null;
  box.innerHTML = String(html`<div class="adm-head"><h1>Копии и безопасность</h1></div>
    <div class="mail-grid">
      <form class="panel settings" id="bk-f" style="max-width:none">
        <div><h2 class="h2" style="margin:0">Копия в облако Selectel</h2>
          <p class="muted" style="margin:6px 0 0;font-size:14px">Каждую ночь с 3:00 до 6:00 по Москве база (сжатая, хранится 30 дней) и новые фото и видео уходят в объектное хранилище. Даже если сервер сломается целиком, всё восстановится из облака.</p></div>
        <div class="field"><label for="bk-e">Адрес хранилища (S3)</label><input id="bk-e" name="endpoint" class="input" value="${c.endpoint}" placeholder="s3.ru-1.storage.selcloud.ru" autocomplete="off" ${owner ? '' : raw('disabled')}></div>
        <div class="row2"><div class="field"><label for="bk-b">Контейнер</label><input id="bk-b" name="bucket" class="input" value="${c.bucket}" placeholder="torgana-backup" autocomplete="off" ${owner ? '' : raw('disabled')}></div>
          <div class="field"><label for="bk-r">Регион</label><input id="bk-r" name="region" class="input" value="${c.region}" placeholder="ru-1" autocomplete="off" ${owner ? '' : raw('disabled')}></div></div>
        <div class="field"><label for="bk-a">Access key</label><input id="bk-a" name="accessKey" class="input" value="${c.accessKey}" autocomplete="off" spellcheck="false" ${owner ? '' : raw('disabled')}></div>
        <div class="field"><label for="bk-s">Secret key</label><input id="bk-s" name="secretKey" class="input" type="password" autocomplete="new-password" placeholder="${c.hasSecret ? 'сохранён — оставьте пустым, чтобы не менять' : ''}" ${owner ? '' : raw('disabled')}></div>
        <div class="field"><label for="bk-p">Папка в контейнере</label><input id="bk-p" name="prefix" class="input" value="${c.prefix}" placeholder="torgana" autocomplete="off" ${owner ? '' : raw('disabled')}><span class="help">При сохранении проверим доступ: запишем и удалим маленький файл.</span></div>
        ${owner ? html`<div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить и проверить</button>${d.ready ? html`<button type="button" class="btn btn-line" data-bk-clear>Отключить</button>` : ''}</div>` : html`<p class="muted" style="margin:0;font-size:13px">Ключи хранилища меняет только владелец сайта.</p>`}
      </form>
      <section class="panel settings" style="max-width:none">
        <h2 class="h2" style="margin:0">Состояние копий</h2>
        ${lastLine}
        ${verifyLine}
        <div class="set-btns"><button type="button" class="btn btn-accent" data-bk-run ${d.ready && !d.running ? '' : raw('disabled')}>${ic('refresh', 18, 2)}Сделать копию сейчас</button>
          <button type="button" class="btn btn-soft" data-bk-verify ${d.ready && d.lastOk ? '' : raw('disabled')}>${ic('shield', 18, 2)}Проверить копию</button></div>
        <p class="muted" style="margin:0;font-size:13px">«Проверить копию» скачивает последнюю копию базы из облака, проверяет её целостность, сравнивает с сайтом и сверяет несколько фото. В облаке уже ${NF.format(d.uploaded.n)} фото и видео (${fmtBytes(d.uploaded.b)}).</p>
        <details class="bk-how"><summary>Как получить ключи в Selectel</summary><ol>
          <li>Панель Selectel → «Объектное хранилище» → создайте <b>приватный</b> контейнер, например <code>torgana-backup</code>.</li>
          <li>«Управление доступом» → «Сервисные пользователи» → добавьте пользователя с ролью «Пользователь объектного хранилища» для этого проекта.</li>
          <li>У пользователя → «S3-ключи» → «Добавить ключ»: Access key и Secret key — сюда.</li>
          <li>Адрес и регион — в настройках контейнера (например, <code>s3.ru-1.storage.selcloud.ru</code>, регион <code>ru-1</code>).</li></ol></details>
      </section>
    </div>
    <div class="mail-grid" style="margin-top:20px">
      <section class="panel settings" style="max-width:none">
        <h2 class="h2" style="margin:0">Сервер</h2>
        <div class="kv">
          <span>Свободно на диске</span><b class="${disk !== null && disk > 90 ? 'danger-t' : ''}">${sv.disk ? `${fmtBytes(sv.disk.free)} из ${fmtBytes(sv.disk.total)} (занято ${disk}%)` : '—'}</b>
          <span>Копия на самом сервере</span><b>${sv.localBackup ? when(sv.localBackup) : 'нет данных'}</b>
          <span>Ошибок за час / сутки</span><b class="${sv.errorsHour >= 5 ? 'warn-t' : ''}">${sv.errorsHour} / ${sv.errorsDay}</b>
          <span>Письма о сбоях</span><b>${sv.mail ? sv.owner || 'первому модератору' : 'почта не подключена'}</b>
        </div>
        ${sv.lastErrors.length ? html`<ul class="bk-errs">${sv.lastErrors.map((e) => html`<li><span>${hm(e.at)}</span>${e.msg}</li>`)}</ul>` : ''}
        <p class="muted" style="margin:0;font-size:13px">Сервер пишет владельцу, если копия не сделана, на диске меньше 2 ГБ, копия на сервере старше суток или за 10 минут больше 10 ошибок. Доступность сайта снаружи каждые 5 минут проверяет GitHub — при падении придёт письмо от GitHub.</p>
      </section>
      <section class="panel settings" style="max-width:none">
        <h2 class="h2" style="margin:0">Мои устройства</h2>
        <p class="muted" style="margin:0;font-size:14px">Когда защита включена, модерация открывается только на подтверждённых устройствах: на новом — код из письма. Устройство помним 30 дней. Включается защита первым подтверждённым кодом — так никто не окажется заперт, если письма не доходят.</p>
        ${dev.items.length ? html`<div class="bk-devs">${dev.items.map((x) => html`<div class="bk-dev"><span class="bk-dev-ic">${ic(/iPhone|Android/.test(x.label) ? 'chat' : 'eye', 18, 2)}</span>
            <span class="bk-dev-t"><b>${x.label}${x.current ? html` <span class="tag accent">это устройство</span>` : ''}</b><span>${x.ip ? `IP ${x.ip} · ` : ''}заходили ${when(x.lastAt)} · до ${dateShort(x.until)}</span></span>
            <button type="button" class="btn btn-line btn-sm" data-dev-rm="${x.id}">${x.current ? 'Выйти' : 'Забыть'}</button></div>`)}</div>`
  : html`<div class="qr-empty">${S.config.mail ? 'Подтверждённых устройств нет.' : 'Почта не подключена — коды не отправить, поэтому модерация пока открывается без кода.'}</div>`}
      </section>
    </div>`);
  const f = $('#bk-f', box);
  if (owner) {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = $('button[type=submit]', f); b.disabled = true; b.textContent = 'Проверяем доступ…';
      try { await api('PUT', '/api/admin/backup', Object.fromEntries(new FormData(f).entries())); toast('Хранилище подключено — доступ проверен'); renderBackupAdmin(box); } catch (ex) { toast(ex.message, true); b.disabled = false; b.textContent = 'Сохранить и проверить'; }
    };
    const cl = $('[data-bk-clear]', box);
    if (cl) cl.onclick = async () => { if (!(await confirmModal('Отключить копию в облако?', 'Новые копии перестанут уходить в хранилище. Уже сделанные останутся в Selectel.', 'Отключить', true))) return; try { await api('PUT', '/api/admin/backup', { clear: true }); toast('Отключено'); renderBackupAdmin(box); } catch (ex) { toast(ex.message, true); } };
  }
  const run = $('[data-bk-run]', box);
  run.onclick = async () => {
    run.disabled = true;
    try {
      await api('POST', '/api/admin/backup/run');
      toast('Копия началась — это займёт от минуты до нескольких');
      const poll = async () => { if (!box.isConnected) return; const x = await api('GET', '/api/admin/backup'); if (x.running) setTimeout(poll, 3000); else { renderBackupAdmin(box); toast(x.last && x.last.ok ? 'Копия готова' : 'Копия не сделана — подробности на странице', !(x.last && x.last.ok)); } };
      setTimeout(poll, 1500);
      renderBackupAdmin(box);
    } catch (ex) { toast(ex.message, true); run.disabled = false; }
  };
  if (d.running) setTimeout(async () => { if (box.isConnected && $('[data-bk-run]', box)) renderBackupAdmin(box); }, 4000);
  const ver = $('[data-bk-verify]', box);
  ver.onclick = async () => {
    ver.disabled = true; ver.textContent = 'Скачиваем и проверяем…';
    try { const r = await api('POST', '/api/admin/backup/verify'); toast(r.verify.ok ? 'Копия в порядке' : 'Проверка нашла расхождения', !r.verify.ok); renderBackupAdmin(box); } catch (ex) { toast(ex.message, true); renderBackupAdmin(box); }
  };
  $$('[data-dev-rm]', box).forEach((b) => {
    b.onclick = async () => { try { await api('DELETE', `/api/admin/devices/${b.dataset.devRm}`); toast('Устройство забыто'); render(); } catch (ex) { toast(ex.message, true); } };
  });
}

// Модерация с нового устройства: код из письма (lib/ops.js). Ниже кода — что стало с письмом:
// принято почтовым сервисом (тогда искать в «Спаме») или не ушло (с текстом ошибки).
export async function viewDevice() {
  setTitle('Вход в модерацию');
  const st = await api('GET', '/api/admin/device').catch(() => ({}));
  if (st.confirmed || (st.trusted && st.armed)) { if (location.pathname === '/admin/device') go('/admin', true); else render(); return; }
  const arming = !st.armed; // защита ещё не включена — человек включает её сам
  authPage(arming ? 'Защита модерации' : 'Вход в модерацию', arming
    ? `Пришлём код на ${st.email || 'вашу почту'}. Когда введёте его, модерация на новых устройствах будет открываться только по коду из письма — даже если кто-то узнает пароль. Это устройство запомним на 30 дней.`
    : `Это устройство мы видим впервые. Чтобы модерацию не открыл никто, кроме вас, — даже зная пароль, — пришлём код на ${st.email || 'вашу почту'}. Устройство запомним на 30 дней.`,
    html`<div id="dev-code"><button type="button" class="btn btn-dark btn-lg btn-block" data-dev-send>${ic('mail', 18, 2)}Отправить код</button></div><div id="dev-mail" class="dev-mail" aria-live="polite"></div>`,
    html`<p class="alt"><a href="/">На главную</a></p>`);
  let timer = null;
  const paint = (x) => {
    const box = $('#dev-mail');
    if (!box || !x) return;
    const L = x.letter;
    if (x.armed && x.trusted && !x.confirmed) { clearTimeout(timer); toast('Почта сейчас не работает — модерация открыта без кода. Почините её в разделе «Почта»', true); render(); return; }
    box.innerHTML = String(!L ? '' : L.status === 'sent'
      ? html`<div class="bk-state ok">${ic('check', 20, 2.4)}<div><b>Письмо отправлено в ${hm(L.sentAt)}</b><span>Почтовый сервис его принял. Если письма нет пару минут — посмотрите «Спам» и «Рассылки», найдите «код для входа в модерацию».</span></div></div>`
      : L.error
        ? html`<div class="bk-state bad">${ic('warn', 20, 2)}<div><b>${L.status === 'failed' ? 'Письмо не отправлено' : `Письмо пока не ушло — пробуем ещё раз (попытка ${L.attempts})`}</b><span>Ответ почтового сервиса: ${L.error}</span></div></div>`
        : html`<div class="bk-state run"><span class="bk-dot"></span><div><b>Отправляем письмо…</b><span>Обычно это несколько секунд.</span></div></div>`);
    clearTimeout(timer);
    if (L && L.status === 'pending' && box.isConnected) timer = setTimeout(async () => paint(await api('GET', '/api/admin/device').catch(() => null)), 2500);
  };
  setCleanup(() => clearTimeout(timer));
  const watch = async () => paint(await api('GET', '/api/admin/device').catch(() => null));
  const startCode = (r) => codeForm($('#dev-code'), {
    email: r.email || st.email, wait: r.wait || 60,
    send: async () => { const x = await api('POST', '/api/admin/device/send'); setTimeout(watch, 800); return x; },
    check: async (code) => { await api('POST', '/api/admin/device/verify', { code }); toast(arming ? 'Защита включена — это устройство подтверждено на 30 дней' : 'Устройство подтверждено на 30 дней'); if (location.pathname === '/admin/device') go('/admin?status=backup', true); else render(); }
  });
  if (st.letter && st.letter.createdAt > Date.now() - 15 * 60 * 1000) { startCode({ email: st.email, wait: Math.max(0, 60 - Math.round((Date.now() - st.letter.createdAt) / 1000)) }); paint(st); return; }
  $('[data-dev-send]').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { const r = await api('POST', '/api/admin/device/send'); startCode(r); setTimeout(watch, 800); } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; }
  };
}

// ---------- мои уведомления ----------
export async function renderNotifyAdmin(box) {
  const cur = await api('GET', '/api/admin/me/notify');
  const MODES = [['instant', 'Сразу', 'Одним письмом в течение минуты после нового'], ['hourly', 'Раз в час', 'Сводка всего нового за час'], ['off', 'Не присылать', 'Смотрю сам на сайте']];
  const KINDS = [['pending', 'Новые объявления на проверку', 'И изменённые — после правки они снова в очереди'], ['reports', 'Жалобы на объявления', ''], ['support', 'Сообщения в поддержку', 'Только те, что ещё никто не прочитал']];
  // 1.47.2: push — сразу, отдельно от писем; 1.60.0: только в приложение Торгана на iPhone.
  // 1.53.0: + новые продавцы, долгое ожидание, апелляции, медали, итоги дня, сбои сайта (порядок — как на сервере).
  const PUSH = [['pending', 'Новые и изменённые объявления', 'Не чаще раза в 2 минуты — со счётчиком очереди'],
    ['sellers', 'Новые продавцы', 'Первое объявление человека — вместо обычного «на проверку»'],
    ['waiting', 'Объявления долго ждут', 'Если ждут проверки дольше часа — днём, не чаще раза в час'],
    ['appeals', 'Апелляции', 'Продавец оспаривает отказ'], ['reports', 'Жалобы на объявления', ''], ['support', 'Сообщения в поддержку', ''],
    ['biz', 'Проверка бизнеса и галочки бренда', 'Новые заявки'], ['rep', 'Репутация', 'Жалобы по сделкам и подозрительные сделки'], ['pay', 'Оплаты', 'Каждая прошедшая оплата'],
    ['medals', 'Медали «Один из первых»', 'Медаль № 1, 10, 50, 100, 250, 500, 750, 900 и 1000'],
    ['digest', 'Итоги дня', 'В 21:00 по Москве: регистрации, объявления, проверка, оплаты'],
    ['ops', 'Сбои сайта', 'Резервные копии, место на диске, почта, ошибки сервера']];
  box.innerHTML = String(html`<div class="adm-head"><h1>Мои уведомления</h1></div>
    <form class="panel nt-form" id="ntp" style="margin-bottom:16px">
      <div><h2 class="h2">Push — сразу в приложение</h2><p class="muted" style="margin:4px 0 0">Приходят в приложение Торгана на iPhone, если в нём включены уведомления. Ваши собственные действия не присылаем.</p></div>
      <div class="nt-kinds">${PUSH.map(([k, t, sub]) => html`<label class="switch"><span>${t}${sub ? html`<small>${sub}</small>` : ''}</span><input type="checkbox" name="push" value="${k}" ${cur.push.includes(k) ? raw('checked') : ''}><span class="track"></span></label>`)}</div>
    </form>
    ${S.config.mail ? '' : html`<div class="banner warn" style="margin-bottom:16px">Почта ещё не подключена — письма начнут приходить после настройки в разделе <a href="/admin?status=mail" style="text-decoration:underline">«Почта»</a>.</div>`}
    <form class="panel nt-form" id="nt">
      <div><h2 class="h2">Письма — как часто</h2><p class="muted" style="margin:4px 0 0">Письма приходят на ${S.user.email}. У каждого модератора — свои настройки.</p></div>
      <div class="nt-modes" role="radiogroup" aria-label="Как часто">${MODES.map(([k, t, sub]) => html`<label class="nt-mode"><input type="radio" name="mode" value="${k}" ${cur.mode === k ? raw('checked') : ''}><span><b>${t}</b><small>${sub}</small></span></label>`)}</div>
      <div class="nt-kinds ${cur.mode === 'off' ? 'off' : ''}"><h2 class="h2">О чём</h2>
        ${KINDS.map(([k, t, sub]) => html`<label class="switch"><span>${t}${sub ? html`<small>${sub}</small>` : ''}</span><input type="checkbox" name="kinds" value="${k}" ${cur.kinds.includes(k) ? raw('checked') : ''}><span class="track"></span></label>`)}</div>
    </form>`);
  const f = $('#nt');
  f.onchange = async () => {
    const mode = f.mode.value;
    const kinds = $$('input[name=kinds]:checked', f).map((x) => x.value);
    $('.nt-kinds', f).classList.toggle('off', mode === 'off');
    try { await api('PUT', '/api/admin/me/notify', { mode, kinds }); toast(mode === 'off' ? 'Письма о новом отключены' : 'Сохранено'); } catch (e) { toast(e.message, true); }
  };
  const fp = $('#ntp');
  fp.onchange = async (e) => {
    if (e.target.name !== 'push') return;
    try { await api('PUT', '/api/admin/me/notify', { push: $$('input[name=push]:checked', fp).map((x) => x.value) }); toast('Сохранено'); } catch (ex) { toast(ex.message, true); }
  };
}

// Найденные подозрительные основы слов → целые слова в тексте (ё = е, позиции совпадают).
export function stemHits(text, stems) {
  if (!stems.length || !text) return [];
  const re = new RegExp(`(?<![а-яa-z0-9])(?:${stems.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[а-яa-z0-9]*`, 'gi');
  return [...text.toLowerCase().replace(/ё/g, 'е').matchAll(re)].map((m) => [m.index, m.index + m[0].length]);
}

// Модерация → Почта: подключение SMTP, проверка письмом, журнал отправки.
export function renderMailAdmin(box, { config: c, stats: st, codes }) {
  const SECURITY = [['ssl', 'SSL (обычно порт 465)'], ['starttls', 'STARTTLS (порт 587 или 2525)']];
  const STATUS = { pending: 'в очереди', sent: 'отправлено', failed: 'не доставлено' };
  const KIND = { device: 'Код для модерации', ops: 'Владельцу о сбое', verify: 'Подтверждение email', reset: 'Восстановление пароля', message: 'Новое сообщение', moderation: 'Модерация', support: 'Ответ поддержки', account: 'Блокировка аккаунта', mod: 'Модератору о новом', billing: 'Оплата и тарифы', code: 'Код подтверждения', test: 'Проверка' };
  const domain = (c.from || 'no-reply@torgana.ru').split('@')[1];
  box.innerHTML = String(html`
    <div class="stats">
      <div class="stat"><div class="n">${c.ready ? 'Подключена' : 'Нет'}</div><div class="k">${c.ready ? `письма уходят с ${c.from}` : 'письма не отправляются'}</div></div>
      <div class="stat"><div class="n">${NF.format(st.sent)}</div><div class="k">отправлено за 30 дней</div></div>
      <div class="stat"><div class="n">${NF.format(st.pending)}</div><div class="k">в очереди</div></div>
      <div class="stat"><div class="n">${NF.format(st.failed)}</div><div class="k">не доставлено</div></div>
    </div>
    ${c.ready ? '' : html`<div class="banner warn" style="margin-bottom:20px"><strong>Почта не подключена.</strong> Пока её нет, на сайте скрыты «Забыли пароль?» и подтверждение email, письма о сообщениях и решениях модерации не уходят.</div>`}
    <div class="mail-grid">
      <form class="panel settings" id="mf" style="max-width:none">
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><h2 class="h2" style="margin:0">Подключение</h2>
          <button type="button" class="btn btn-soft btn-sm" id="preset">Заполнить для SMTP.BZ</button></div>
        <div class="row stack-m"><div class="field" style="flex:2"><label for="m-host">Сервер SMTP</label><input id="m-host" name="host" class="input" value="${c.host || ''}" placeholder="connect.smtp.bz"></div>
          <div class="field" style="flex:1"><label for="m-port">Порт</label><input id="m-port" name="port" class="input" inputmode="numeric" value="${c.port || ''}" placeholder="2525"></div></div>
        <div class="field"><label for="m-sec">Шифрование</label><select id="m-sec" name="security" class="select">${SECURITY.map(([v, t]) => html`<option value="${v}" ${c.security === v ? raw('selected') : ''}>${t}</option>`)}</select></div>
        <div class="field"><label for="m-user">Логин</label><input id="m-user" name="user" class="input" value="${c.user || ''}" autocomplete="off" placeholder="Логин из личного кабинета SMTP.BZ"></div>
        <div class="field"><label for="m-pass">Пароль</label><input id="m-pass" name="pass" type="password" class="input" autocomplete="new-password" placeholder="${c.hasPass ? 'Сохранён — оставьте пустым, чтобы не менять' : 'Пароль SMTP из личного кабинета'}"></div>
        <div class="row stack-m"><div class="field" style="flex:1"><label for="m-from">Адрес отправителя</label><input id="m-from" name="from" class="input" value="${c.from || ''}" placeholder="no-reply@torgana.ru"></div>
          <div class="field" style="flex:1"><label for="m-name">Имя отправителя</label><input id="m-name" name="fromName" class="input" value="${c.fromName || ''}" placeholder="Торгана"></div></div>
        <div class="field"><label for="m-reply">Ответы на письма — на адрес</label><input id="m-reply" name="replyTo" class="input" type="email" value="${c.replyTo || ''}" placeholder="${S.config.supportEmail || 'support@torgana.ru'}">
          <span class="help">Если человек ответит на уведомление, письмо придёт сюда, а не на адрес отправителя. По умолчанию — адрес поддержки.</span></div>
        <div class="form-error hidden" id="m-err" role="alert"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-dark" type="submit">Сохранить</button></div>
        <p class="muted" style="margin:0;font-size:13px">Чтобы письма не попадали в спам, домен ${domain} подтверждается в SMTP.BZ, а в DNS домена добавляются записи SPF и DKIM, которые выдаст сервис.</p>
      </form>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="panel" style="display:flex;flex-direction:column;gap:12px">
          <h2 class="h2" style="margin:0">Коды по почте</h2>
          <label class="switch"><span>Спрашивать код из письма<small>6 цифр при регистрации и входе с неподтверждённой почтой, код для входа в модерацию с нового устройства</small></span><input type="checkbox" id="m-codes" ${codes ? raw('checked') : ''} ${c.ready ? '' : raw('disabled')}><span class="track"></span></label>
          ${codes ? '' : html`<div class="banner warn" style="font-size:14px">${c.ready ? 'Коды выключены: регистрация и вход — без кода, модерация — без подтверждения устройства. Включите, когда тестовое письмо дойдёт до почты.' : 'Почта не подключена — коды не отправить, поэтому они выключены.'}</div>`}
        </div>
        <form class="panel" id="mt" style="display:flex;flex-direction:column;gap:14px">
          <h2 class="h2" style="margin:0">Проверка</h2>
          <p class="muted" style="margin:0;font-size:14px">Отправим тестовое письмо сразу, минуя очередь, и покажем ответ почтового сервиса.</p>
          <div class="row"><label class="sr" for="mt-to">Кому</label><input id="mt-to" class="input" type="email" value="${S.user.email}">
            <button class="btn btn-accent" type="submit" ${c.ready ? '' : raw('disabled')}>Отправить</button></div>
          <div class="form-error hidden" id="mt-err" role="alert"></div>
        </form>
        <div class="panel" id="avatar"><h2 class="h2" style="margin:0">Аватарка отправителя</h2>
          <p class="muted" style="margin:0;font-size:14px">Картинку рядом с письмом каждая почта берёт из своего источника. Сайт сам её не передаёт: подключите один раз в каждой почте, затем проверьте тестовым письмом.</p>
          <ol class="avatar-steps">
            <li><strong>Mail.ru</strong> — <a href="https://postmaster.mail.ru/" target="_blank" rel="noopener">postmaster.mail.ru</a>: добавить домен ${domain}, «Настройки» → «Изменить аватар», загрузить <a href="/assets/icons/apple-touch-icon.png" download="torgana-avatar-180.png">картинку 180×180</a>. Действует на весь домен после модерации Mail.ru.</li>
            <li><strong>Яндекс Почта</strong> — портрет Яндекс ID ящика ${c.from || `no-reply@${domain}`} в Яндекс 360: <a href="https://id.yandex.ru/" target="_blank" rel="noopener">id.yandex.ru</a> → фото, <a href="/assets/icons/icon-512.png" download="torgana-avatar-512.png">картинка 512×512</a>. Яндекс не обещает показ для писем через сторонний сервис отправки — проверьте письмом.</li>
            <li><strong>Gmail</strong> — Google-аккаунт на адрес ${c.from || `no-reply@${domain}`} («Использовать существующий адрес» при регистрации), фото профиля — <a href="/assets/icons/icon-512.png" download="torgana-avatar-512.png">та же картинка</a>. Появляется через несколько дней.</li>
          </ol>
        </div>
        <div class="panel"><h2 class="h2" style="margin:0 0 12px">Последние письма</h2>
          ${st.recent.length ? html`<div style="display:flex;flex-direction:column;gap:10px">${st.recent.map((r) => html`<div style="display:flex;gap:10px;justify-content:space-between;font-size:14px;border-bottom:1px solid var(--line);padding-bottom:10px">
            <span style="min-width:0"><strong>${KIND[r.kind] || r.kind}</strong> · ${r.to_email}<br><span class="muted">${when(r.created_at)}${r.last_error ? html` · ${r.last_error}` : ''}</span></span>
            <span class="tag ${r.status === 'sent' ? 'accent' : ''}" style="flex:none;align-self:flex-start">${STATUS[r.status]}</span></div>`)}</div>` : html`<p class="muted" style="margin:0">Писем пока не было.</p>`}
        </div>
      </div>
    </div>`);
  const mc = $('#m-codes', box);
  mc.onchange = async () => {
    if (mc.checked && !(await confirmModal('Включить коды по почте?', 'Убедитесь, что тестовое письмо дошло: иначе новые пользователи не смогут зарегистрироваться, а вы — войти в модерацию с нового устройства.', 'Включить'))) { mc.checked = false; return; }
    try { await api('PUT', '/api/admin/mail/codes', { on: mc.checked }); toast(mc.checked ? 'Коды включены' : 'Коды выключены'); render(); } catch (ex) { mc.checked = !mc.checked; toast(ex.message, true); }
  };
  const f = $('#mf', box);
  // Selectel закрывает исходящий порт 465 — SMTP.BZ подключаем через 2525 со STARTTLS (как в ALBAKOV).
  $('#preset', box).onclick = () => { f.host.value = 'connect.smtp.bz'; f.port.value = '2525'; f.security.value = 'starttls'; if (!f.from.value) f.from.value = 'no-reply@torgana.ru'; if (!f.fromName.value) f.fromName.value = 'Торгана'; f.user.focus(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#m-err', box); err.classList.add('hidden');
    try {
      await api('PUT', '/api/admin/mail', Object.fromEntries(new FormData(f).entries()));
      S.config = await api('GET', '/api/config');
      toast('Сохранено. Отправьте тестовое письмо, чтобы проверить.');
      render();
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
  };
  $('#mt', box).onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#mt-err', box); err.classList.add('hidden');
    const b = $('button', e.target); b.disabled = true; b.textContent = 'Отправляем…';
    try { const r = await api('POST', '/api/admin/mail/test', { to: $('#mt-to', box).value }); toast(`Письмо отправлено на ${r.to}`); render(); } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); b.disabled = false; b.textContent = 'Отправить'; }
  };
}

// Для бизнеса: тарифы, оплата, витрина, реклама, платежи.
import { $, $$, NF, S, api, app, dateLong, dateShort, html, plural, raw, rub, when } from './core.js';
import { P, ic, svg } from './icons.js';
import { confirmModal, openModal, toast } from './ui.js';
import { resizeImage } from './photos.js';
import { torganaAva } from './messages.js';
import { go, setCleanup, setTitle } from './router.js';
import { bizState, ctrOf, dayLabel, kpi, pct1, srcRows, tmState, trend, trustRow } from './profile.js';
import { verifiedSeal } from './badges.js';
import { refreshMe } from './main.js';

// ================= для бизнеса: тарифы, оплата, продвижение =================
const PLAN_NAME = { shop: 'Магазин', pro: 'Магазин Про' };
export const daysLeft = (ts) => Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
// Что даёт каждый тариф — ровно то, что работает в коде (lib/business.js, lib/deals.js, lib/support.js, lib/promo.js).
// 1.45.0: коротко — по три-четыре строки на тариф.
const planFeatures = (key, pr) => ({
  shop: ['Витрина: обложка, поиск и разделы, «О магазине»', 'Значок «Магазин» у объявлений', 'Статистика всех объявлений и выгрузка в Excel'],
  pro: ['Всё из «Магазина»', 'До 3 закреплённых товаров в начале витрины', pr.proDiscount ? `Скидка ${pr.proDiscount}% на рекламу над поиском` : 'Обращения в поддержку — первыми', ...(pr.proDiscount ? ['Обращения в поддержку — первыми'] : [])]
})[key];
// Цена, зачёркнутая «от руки» (1.45.0): неровная линия рисуется при появлении.
const handStrike = (text) => html`<span class="hand-strike">${text}<svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true"><path pathLength="100" d="M3 15.5c13-2.6 27-5.4 43-6.4 17-1.1 33 .3 47-1.6 9.6-1.3 16-3.1 24-5.2"/><path pathLength="100" class="hs2" d="M8 19.5c18-3.3 39-6.1 61-6.3 15-.2 29 .4 46-3.9"/></svg></span>`;
// Подтверждение покупки → страница оплаты ЮKassa.
function payModal({ title, lines, amount, url, body }) {
  openModal(String(html`<h2>${title}</h2>
    <div class="pay-sum">${lines.map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}<div class="pay-total"><span>К оплате</span><b>${rub(amount)}</b></div></div>
    <p class="pay-note">${ic('lock', 16, 2)}<span>Оплата на защищённой странице ЮKassa — картой, через СБП и другими способами. Данные карты Торгана не получает. Чек придёт на ${S.user.email}.</span></p>
    <p class="muted" style="margin:10px 0 0;font-size:13px">Нажимая «Оплатить», вы принимаете <a href="/page/terms#paid" style="text-decoration:underline">условия платных услуг</a>. Автоплатежей нет — продлеваете сами.</p>
    <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button><button class="btn btn-accent" data-ok>Оплатить ${rub(amount)}</button></div>`), (m, close) => {
    $('[data-x]', m).onclick = close;
    m.addEventListener('click', (e) => { if (e.target.closest('a[href]')) close(); });
    $('[data-ok]', m).onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Открываем оплату…';
      try { goPay(await api('POST', url, body)); } catch (ex) { toast(ex.message, true); b.disabled = false; b.textContent = `Оплатить ${rub(amount)}`; }
    };
  });
}

// /business — тарифы, продвижение, вопросы. Цены — с сервера (их задаёт владелец).
// 1.45.0: страница упрощена до шагов; 1.61.0: тариф (первым — 0 ₽) → витрина → значки доверия, без «бизнес-аккаунта».
const BIZ_FAQ = [
  ['Нужно ли платить, чтобы продавать?', 'Нет. Объявления бесплатны и без лимитов для всех. Тариф добавляет инструменты магазина.'],
  ['Кто может подключить тариф?', 'Любой пользователь. Проверка ИНН не обязательна: она даёт значок проверенного бизнеса в профиле.'],
  ['Что будет после бесплатного периода?', 'Тариф просто закончится — объявления останутся. Продлить можно по обычной цене. Автоплатежей нет.'],
  ['Как оплатить и вернуть деньги?', 'Картой или через СБП на странице ЮKassa, чек придёт на почту. За неиспользованные дни вернём деньги через поддержку.']
];
export async function viewBusiness(_, q) {
  setTitle('Для бизнеса');
  const me = S.user ? await api('GET', '/api/my/business').catch(() => null) : null;
  const pr = (me && me.prices) || S.config.billing.prices;
  const ready = me ? me.ready : S.config.billing.ready;
  const plan = me && me.plan;
  const st = S.config.billing.starter; // бесплатный старт: { days, limit, left } — пока есть места
  // 0 ₽ показываем гостю и тем, кому старт доступен.
  const free = !!st && (!me || me.trial);
  let months = ['1', '3', '12'].includes(q.get('m')) ? Number(q.get('m')) : 1;
  const bp = pr.boost || {};
  const flow = (n, t, done) => html`<li class="${done ? 'done' : ''}"><span>${done ? ic('check', 14, 3) : n}</span>${t}</li>`;
  const heroCta = !S.user ? html`<a class="btn btn-accent btn-lg" href="/login?next=/business">Войти и начать</a>`
    : plan ? html`<a class="btn btn-accent btn-lg" href="/profile/business">Мой магазин</a>` : html`<a class="btn btn-accent btn-lg" href="#plans">Выбрать тариф</a>`;
  app.innerHTML = String(html`<div class="wrap biz bz">
    <section class="bz-hero">
      <div class="bz-hero-txt">
        <span class="bz-kicker">${ic('store', 15, 2)}Торгана для бизнеса</span>
        <h1>Продавайте как магазин</h1>
        <p>Объявления — бесплатно для всех. Тариф добавляет витрину с поиском и разделами и статистику магазина.</p>
        <ol class="bz-flow">${flow(1, 'Тариф', !!plan)}${flow(2, 'Витрина', false)}${flow(3, 'Значки доверия', false)}</ol>
        <div class="bz-cta">${heroCta}</div>
      </div>
      <div class="bz-mini" aria-hidden="true">
        <div class="bzm-cover"></div>
        <div class="bzm-head"><span class="bzm-ava">${ic('store', 22, 2)}</span><span><b>Ваш магазин</b><span class="bzm-badges"><i class="g">${ic('store', 11, 2.4)}Магазин</i><i>${verifiedSeal(13)}Бренд</i></span></span></div>
        <div class="bzm-grid">${['#DCE3DF', '#E9E6E0', '#DDE4EC'].map((c) => html`<span class="bzm-card"><span style="background:${c}"></span><i></i><i class="s"></i></span>`)}</div>
        <span class="bzm-tag">Пример</span>
      </div>
    </section>
    ${!ready ? html`<div class="banner soft biz-banner">${ic('clock', 20, 2)}<span><strong>Оплата подключается.</strong> Цены действуют, но оплатить пока нельзя.</span></div>` : ''}
    ${plan ? html`<div class="banner ok biz-banner">${ic('check', 20, 2.2)}<span>${plan.trial ? 'Бесплатный тариф' : 'Тариф'} <strong>«${plan.name}»</strong> до ${dateLong(plan.until)}. <a href="/profile/business" style="text-decoration:underline">Мой магазин</a></span></div>` : ''}

    <section class="biz-sec" id="plans">
      <div class="biz-sec-head"><div><h2>Тарифы</h2>${free ? html`<span class="bz-free">${ic('gift', 15, 2)}Первым ${st.limit} — ${st.days} ${plural(st.days, 'день', 'дня', 'дней')} бесплатно · осталось ${st.left} ${plural(st.left, 'место', 'места', 'мест')}</span>` : ''}</div>
        <div class="seg" role="tablist" aria-label="Срок">${[[1, '1 месяц'], [3, '3 месяца'], [12, '12 месяцев']].map(([m, t]) => html`<button type="button" role="tab" data-m="${m}">${t}</button>`)}</div></div>
      <div class="plans two" id="plan-cards"></div>
      <p class="muted biz-small">Без тарифа всё бесплатно: объявления без лимитов, чат, торг и статистика каждого объявления. Автоплатежей нет.</p>
    </section>

    <section class="biz-sec">
      <div class="biz-sec-head"><h2>Продвижение</h2></div>
      <div class="bz-promo">
        <div class="bz-pcard"><span class="bz-ic violet">${ic('xl', 20, 1.9)}</span><span><b class="bz-ph">Продвижение в ленте</b><span class="bz-for">XL, рамка или метки на фото · 7 дней</span></span><b class="bz-from">от ${rub(Math.min(bp.xl, bp.frame, bp.tags))}</b></div>
        <div class="bz-pcard"><span class="bz-ic blue">${ic('megaphone', 20, 1.9)}</span><span><b class="bz-ph">Реклама над поиском</b><span class="bz-for">Блок «Реклама» над выдачей в вашем городе</span></span><b class="bz-from">от ${rub(pr.promo[3])}</b></div>
      </div>
      <p class="muted biz-small">Для всех продавцов. Подключается в «Моих объявлениях» → «Продвигать».</p>
    </section>

    <section class="biz-sec"><div class="biz-sec-head"><h2>Вопросы</h2></div>
      <div class="faq">${BIZ_FAQ.map(([t, a]) => html`<details><summary>${t}${ic('down', 18, 2)}</summary><p>${a}</p></details>`)}</div>
      <p class="muted biz-small">Условия — в <a href="/page/terms#paid" style="text-decoration:underline">разделе 7 Пользовательского соглашения</a>. Исполнитель — ${S.config.operator ? `${S.config.operator.name}, ИНН ${S.config.operator.inn}` : 'оператор Торганы'}.</p>
    </section>
  </div>`);
  const paint = () => {
    $$('[data-m]').forEach((b) => { b.classList.toggle('on', Number(b.dataset.m) === months); b.setAttribute('aria-selected', Number(b.dataset.m) === months ? 'true' : 'false'); });
    const save = (key) => { const full = pr[key][1] * months; return full > pr[key][months] ? Math.round((1 - pr[key][months] / full) * 100) : 0; };
    const perMonth = (key) => Math.round(pr[key][months] / months);
    const cta = (key) => {
      const cls = key === 'pro' ? 'btn-accent' : 'btn-dark';
      if (!S.user) return html`<a class="btn ${cls} btn-block" href="/login?next=/business">${free ? 'Войти и начать бесплатно' : 'Войти и подключить'}</a>`;
      if (free && !plan) return html`<button type="button" class="btn ${cls} btn-block" data-trial="${key}">Начать бесплатно</button>`;
      if (!ready) return html`<button type="button" class="btn btn-soft btn-block" disabled>Оплата скоро</button>`;
      return html`<button type="button" class="btn ${cls} btn-block" data-buy="${key}">${plan && plan.id === key ? `Продлить на ${months} мес.` : plan ? `Перейти на «${PLAN_NAME[key]}»` : 'Подключить'}</button>`;
    };
    const price = (key) => (free ? html`
          <div class="plan-price is-free"><b>0 ₽</b>${handStrike(rub(perMonth(key)))}</div>
          <p class="plan-then">${st.days} ${plural(st.days, 'день', 'дня', 'дней')} бесплатно, далее <b>${rub(perMonth(key))}</b> в месяц</p>`
      : html`
          <div class="plan-price"><b>${rub(perMonth(key))}</b><span>в месяц</span></div>
          <p class="plan-then">${months > 1 ? html`${rub(pr[key][months])} за ${months} мес.${save(key) ? html` · <span class="plan-save">выгода ${save(key)}%</span>` : ''}` : key === 'shop' ? 'Витрина и статистика' : 'Для тех, у кого много товаров'}</p>`);
    $('#plan-cards').innerHTML = String(html`
      ${['shop', 'pro'].map((key) => html`<div class="plan ${key} ${plan && plan.id === key ? 'current' : ''}">
        <div class="plan-top"><h3>${PLAN_NAME[key]}${plan && plan.id === key ? html`<span class="plan-cur">ваш тариф</span>` : key === 'pro' ? html`<span class="plan-cur">больше всего</span>` : ''}</h3>${price(key)}</div>
        <ul>${planFeatures(key, pr).map((f) => html`<li>${ic('check', 16, 2.4)}${f}</li>`)}</ul>
        ${cta(key)}</div>`)}`);
    $$('[data-trial]').forEach((b) => {
      b.onclick = async () => {
        const key = b.dataset.trial;
        if (!(await confirmModal(`«${PLAN_NAME[key]}» бесплатно на ${st.days} ${plural(st.days, 'день', 'дня', 'дней')}?`, `Без оплаты и без карты. Дальше — ${rub(pr[key][1])} в месяц, только если продлите сами. Бесплатный период — один раз.`, 'Начать бесплатно'))) return;
        b.disabled = true;
        try { await api('POST', '/api/my/plan/trial', { plan: key }); await refreshMe(); toast(`«${PLAN_NAME[key]}» подключён — оформите витрину`); go('/profile/business/shop'); } catch (ex) { toast(ex.message, true); b.disabled = false; }
      };
    });
    $$('[data-buy]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.buy;
        payModal({ title: `Тариф «${PLAN_NAME[key]}»`, amount: pr[key][months], url: '/api/my/plan/pay', body: { plan: key, months },
          lines: [['Срок', `${months} мес. (${months * 30} дней)`], ...(plan && plan.id !== key ? [[plan.trial ? `Бесплатный «${plan.name}»` : `Остаток «${plan.name}»`, plan.trial ? 'закончится, новый тариф — с сегодня' : 'пересчитаем по цене месяца']] : plan ? [['Начало', `с ${dateShort(plan.until)}${plan.trial ? ', после бесплатного' : ''}`]] : [])] });
      };
    });
  };
  $$('[data-m]').forEach((b) => { b.onclick = () => { months = Number(b.dataset.m); history.replaceState({}, '', `/business?m=${months}`); paint(); }; });
  paint();
}

// /pay/:id — человек вернулся со страницы ЮKassa. Пока платёж в обработке — проверяем каждые 2,5 секунды.
export const CANCEL_REASON = { expired_on_confirmation: 'Время на оплату истекло', insufficient_funds: 'Недостаточно средств', card_expired: 'Истёк срок действия карты', canceled_by_merchant: 'Платёж отменён', '3d_secure_failed': 'Банк не подтвердил оплату', permission_revoked: 'Оплата отменена', payment_method_limit_exceeded: 'Превышен лимит платежей', payment_method_restricted: 'Способ оплаты недоступен', fraud_suspected: 'Банк заподозрил мошенничество', country_forbidden: 'Оплата из этой страны недоступна' };
// 1.38.1: возврат с ЮKassa. Вход не обязателен — оплата может вернуть человека в другой браузер
// (встроенный в почту или мессенджер), где он не вошёл. Оплачено — коротко «что включилось» и сразу к объявлению.
const PAY_KEY = 'tg_pay';
const payMark = (id) => { try { if (id) localStorage.setItem(PAY_KEY, JSON.stringify({ id, at: Date.now() })); else localStorage.removeItem(PAY_KEY); } catch { /* нет хранилища */ } };
export const payPending = () => { try { const p = JSON.parse(localStorage.getItem(PAY_KEY) || 'null'); return p && p.id && Date.now() - p.at < 2 * 3600 * 1000 ? p.id : ''; } catch { return ''; } };
export function goPay(r) {
  payMark(r.id);
  location.href = r.url;
  // Страница осталась на месте (оплата открылась поверх приложения) — под ней уже ждёт результат.
  setTimeout(() => { if (!location.pathname.startsWith('/pay/')) go(`/pay/${r.id}`); }, 1500);
}
export const dayWord = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
export async function viewPay(id) {
  setTitle('Оплата');
  app.innerHTML = String(html`<div class="wrap"><div class="pay-res" id="pay"><div class="loader"></div></div></div>`);
  const box = $('#pay');
  const started = Date.now();
  let timer = null;
  setCleanup(() => clearTimeout(timer));
  const okText = (p, r) => {
    if (p.kind === 'plan') return r && r.endsAt ? `Тариф «${PLAN_NAME[r.plan] || PLAN_NAME[p.item.plan]}» действует до ${dateShort(r.endsAt)}.` : `Тариф «${PLAN_NAME[p.item.plan]}» подключён.`;
    if (p.kind === 'promo') return r && r.endsAt ? `Реклама над поиском идёт до ${dateShort(r.endsAt)}.` : 'Реклама над поиском запущена.';
    if (!r) return 'Продвижение включено.';
    return r.status === 'active' ? `Продвигается ещё ${dayWord(Math.max(1, daysLeft(r.endsAt)))} — до ${dateShort(r.endsAt)}.` : 'Начнётся, как только объявление пройдёт проверку, и продлится 7 дней.';
  };
  const draw = ({ payment: p, result: r, url, guest }) => {
    const lid = (r && r.listingId) || p.item.listingId;
    const toListing = p.kind !== 'plan' && lid;
    const back = toListing ? `/l/${lid}` : '/business';
    const home = p.kind === 'boost' ? ['/profile', 'Мои объявления'] : ['/profile/business', 'Для бизнеса'];
    if (p.status === 'succeeded') {
      payMark('');
      box.innerHTML = String(html`<div class="pay-ic ok pop">${ic('check', 34, 2.4)}</div>
        <h1>Оплачено</h1><p class="pay-lead">${okText(p, r)}</p>
        <div class="pay-line"><span>${p.title}</span><b>${rub(p.amount)}</b></div>
        ${guest ? html`<p class="pay-hint">${ic('phone', 16, 2)}<span>Можно закрыть эту страницу и вернуться в приложение — всё уже включено.</span></p>` : ''}
        <div class="pay-act">${toListing ? html`<a class="btn btn-accent btn-lg pay-go" href="${back}" data-go><span>Перейти к объявлению</span><i class="pay-bar"></i></a>`
          : html`<a class="btn btn-accent btn-lg" href="/profile/business/shop">Заполнить витрину</a>`}
          ${guest ? '' : html`<a class="btn btn-soft btn-lg" href="${home[0]}">${home[1]}</a>`}</div>
        <p class="pay-foot">Чек ЮKassa пришлёт на почту.</p>`);
      // Вошедшего через 4 секунды ведём к объявлению — там уже видно «Продвигается». Любое касание отменяет.
      const go2 = $('[data-go]', box);
      if (go2 && !guest) {
        go2.classList.add('run');
        timer = setTimeout(() => { if (box.isConnected) go(back, true); }, 4000);
        const stop = () => { clearTimeout(timer); go2.classList.remove('run'); };
        box.addEventListener('pointerdown', (e) => { if (!e.target.closest('[data-go]')) stop(); }, { once: true });
      }
      return;
    }
    const state = p.status === 'canceled' ? ['bad', 'close', 'Оплата не прошла', `${CANCEL_REASON[p.error] || 'Банк или ЮKassa отклонили платёж'}. Деньги не списаны.`]
      : ['wait', 'clock', 'Проверяем оплату', 'Если вы уже оплатили, страница обновится сама.'];
    box.innerHTML = String(html`<div class="pay-ic ${state[0]}">${ic(state[1], 34, 2.2)}</div>
      <h1>${state[2]}</h1><p class="pay-lead">${state[3]}</p>
      <div class="pay-line"><span>${p.title}</span><b>${rub(p.amount)}</b></div>
      <div class="pay-act">${p.status === 'canceled' ? html`<a class="btn btn-dark btn-lg" href="${back}">Попробовать ещё раз</a><a class="btn btn-soft btn-lg" href="/messages/support">Поддержка</a>`
  : html`${url ? html`<a class="btn btn-dark btn-lg" href="${url}" data-ext>Вернуться к оплате</a>` : ''}<a class="btn btn-soft btn-lg" href="${toListing ? back : home[0]}">${toListing ? 'К объявлению' : home[1]}</a>`}</div>`);
    if (p.status === 'canceled') payMark('');
    const ext = $('[data-ext]', box); if (ext) ext.onclick = (e) => { e.preventDefault(); location.href = url; };
  };
  const poll = async () => {
    let d;
    try { d = await api('GET', `/api/payments/${encodeURIComponent(id)}`); } catch (e) {
      if (!box.isConnected) return;
      payMark('');
      box.innerHTML = String(html`<div class="pay-ic bad">${ic('close', 34, 2.2)}</div><h1>Платёж не найден</h1><p class="pay-lead">${e.message}</p><div class="pay-act"><a class="btn btn-soft btn-lg" href="/">На главную</a></div>`);
      return;
    }
    if (!box.isConnected) return;
    draw(d);
    const age = Date.now() - started;
    if (d.payment.status === 'pending' && age < 15 * 60 * 1000) timer = setTimeout(() => poll().catch(() => {}), age < 2 * 60 * 1000 ? 2500 : 8000);
    if (d.payment.status === 'succeeded' && S.user) refreshMe();
  };
  await poll();
}

// Продвижение объявления: срок, цена (со скидкой «Про»), что будет дальше.
export const PROMO_STATUS = { active: ['ok', 'Продвигается'], ended: ['off', 'Завершено'], stopped: ['bad', 'Остановлено'] };
const promoLine = (p) => (p.status === 'active' ? `до ${dateShort(p.endsAt)} · показов ${NF.format(p.shows)} · переходов ${NF.format(p.clicks)}` : p.status === 'stopped' ? (p.note || 'остановлено модератором') : `${p.startsAt ? `${dateShort(p.startsAt)} — ${dateShort(p.endsAt)}` : ''} · показов ${NF.format(p.shows)} · переходов ${NF.format(p.clicks)}`);
export async function promoteModal(listingId, title) {
  let d;
  try { d = await api('GET', `/api/listings/${listingId}/promote`); } catch (e) { toast(e.message, true); return; }
  let days = 7;
  openModal(String(html`<h2>Продвижение</h2><p class="muted" style="margin:0 0 14px">«${title}»</p>
    ${d.current ? html`<div class="banner ok" style="margin-bottom:14px"><strong>Продвигается</strong> ${promoLine(d.current)}. Новая оплата продлит срок.</div>` : ''}
    ${html`<div class="promo-pick" role="radiogroup" aria-label="Срок продвижения">${d.options.map((o) => html`<label class="promo-pick-opt"><input type="radio" name="days" value="${o.days}" ${o.days === days ? raw('checked') : ''}><span><b>${o.days} ${plural(o.days, 'день', 'дня', 'дней')}</b><em>${rub(o.price)}${o.price !== o.base ? html` <s>${rub(o.base)}</s>` : ''}</em></span></label>`)}</div>
    ${d.discount ? html`<p class="muted" style="margin:8px 0 0;font-size:13px">Скидка ${d.discount}% — тариф «Магазин Про».</p>` : ''}
    <ul class="promo-how"><li>${ic('megaphone', 17)}Покажем в блоке «Реклама» над выдачей и лентой тем, кто ищет похожее в городе ${d.city || 'объявления'}.</li>
      <li>${ic('bolt', 17)}Запустим сразу после оплаты — без ожидания.</li>
      <li>${ic('chart', 17)}Показы и переходы из блока — в статистике объявления.</li></ul>
    <div class="modal-actions"><button class="btn btn-soft" data-x>Отмена</button>${d.ready ? html`<button class="btn btn-accent" data-ok>Продолжить</button>` : html`<button class="btn btn-soft" disabled>Оплата скоро</button>`}</div>`}`), (m, close) => {
    $('[data-x]', m).onclick = close;
    m.addEventListener('click', (e) => { if (e.target.closest('a[href]')) close(); });
    m.addEventListener('change', (e) => { if (e.target.name === 'days') days = Number(e.target.value); });
    const ok = $('[data-ok]', m);
    if (ok) ok.onclick = () => { const o = d.options.find((x) => x.days === days); close(); payModal({ title: 'Продвижение объявления', amount: o.price, url: `/api/listings/${listingId}/promote`, body: { days }, lines: [['Объявление', title], ['Срок', `${days} ${plural(days, 'день', 'дня', 'дней')}`]] }); };
  });
}

// ---------- профиль → «Для бизнеса» ----------
export const PAY_STATUS = { succeeded: ['ok', 'Оплачен'], pending: ['wait', 'Ждёт оплаты'], canceled: ['off', 'Не оплачен'], error: ['bad', 'Ошибка'] };
export async function renderBusinessHub(sub, days, reload) {
  const d = await api('GET', '/api/my/business');
  const box = $('#box');
  const official = !!(d.shop && d.shop.official); // 1.50.0: официальному аккаунту всё открыто без тарифа
  const lock = (need) => (official ? '' : !d.plan ? `в тарифе «${PLAN_NAME[need]}»` : need === 'pro' && d.plan.id !== 'pro' ? 'в тарифе «Магазин Про»' : '');
  const gate = (need, text) => html`<div class="biz-gate">${ic('store', 26, 1.8)}<div><b>${text}</b><span>${lock(need) ? `Доступно ${lock(need)}.` : ''}</span></div><a class="btn btn-dark" href="/business">Выбрать тариф</a></div>`;
  if (sub === 'shop') return lock('shop') ? (box.innerHTML = String(gate('shop', 'Витрина магазина'))) : renderShopEditor(box, d, reload);
  if (sub === 'stats') return lock('shop') ? (box.innerHTML = String(gate('shop', 'Статистика магазина'))) : renderShopStats(box, days);
  const tool = (href, icon, t, sub2, need) => html`<a class="biz-tool ${lock(need) ? 'locked' : ''}" href="${href}"><span class="bt-ic">${ic(icon, 22)}</span><b>${t}</b><small>${lock(need) ? html`${ic('lock', 13, 2)} ${lock(need)}` : sub2}</small></a>`;
  // 1.61.0 (как в приложении): чек-лист «Запуск магазина», пока не настроен, и «Доверие покупателей» со статусами словами.
  const open = official || !!d.plan;
  const tm = S.user.trademark;
  const steps = [[official ? 'Официальный аккаунт' : `Тариф «${d.plan ? d.plan.name : ''}»`, open, ''],
    ['Обложка и описание', !!(d.shop.cover && d.shop.about), '/profile/business/shop'],
    ['Подтвердите ИП или компанию', !!(d.biz && d.biz.status === 'verified'), '/profile/settings#s-biz'],
    ['Галочка бренда — по желанию', !!(tm && tm.live), '/profile/settings#s-biz']];
  const done = steps.filter((x) => x[1]).length;
  const checklist = open && !steps.slice(0, 3).every((x) => x[1]) ? html`<section class="st-card launch">
      <div class="st-card-head"><h2>Запуск магазина</h2><b class="launch-pct">${Math.round((done / steps.length) * 100)}%</b></div>
      <div class="launch-bar"><i style="width:${(done / steps.length) * 100}%"></i></div>
      <ol class="launch-steps">${steps.map(([t, ok, href], i) => html`<li class="${ok ? 'done' : ''}">${ok || !href ? html`<span class="ls-n">${ok ? ic('check', 14, 3) : i + 1}</span><b>${t}</b>` : html`<a href="${href}"><span class="ls-n">${i + 1}</span><b>${t}</b>${ic('right', 16, 2)}</a>`}</li>`)}</ol>
    </section>` : '';
  box.innerHTML = String(html`<div class="bizhub">
    ${official ? html`<div class="plan-now pro">
      <div class="pn-txt"><span class="pn-k">Аккаунт</span><b>«Официальный аккаунт Торганы»</b><span>Витрина, статистика и закреплённые — без тарифа и без срока.</span></div>
    </div>` : html`<div class="plan-now ${d.plan ? d.plan.id : 'none'}">
      <div class="pn-txt"><span class="pn-k">${d.plan && d.plan.trial ? 'Бесплатный тариф' : 'Тариф'}</span><b>${d.plan ? `«${d.plan.name}»` : 'Не подключён'}</b>
        <span>${d.plan ? `до ${dateLong(d.plan.until)} · осталось ${daysLeft(d.plan.until)} ${plural(daysLeft(d.plan.until), 'день', 'дня', 'дней')}` : `Витрина и статистика магазина — от ${rub(d.prices.shop[1])} в месяц. Размещение объявлений бесплатно всегда.`}</span></div>
      <a class="btn ${d.plan ? 'btn-light' : 'btn-dark'}" href="/business">${d.plan ? 'Продлить или сменить' : 'Выбрать тариф'}</a>
    </div>`}
    ${checklist}
    <div class="biz-tools">
      ${tool('/profile/business/shop', 'store', 'Витрина', d.shop.about || d.shop.cover ? 'заполнена · как видят покупатели' : 'обложка, описание, адрес, сайт', 'shop')}
      ${tool('/profile/business/stats', 'chart', 'Статистика магазина', 'все объявления · выгрузка в Excel', 'shop')}
    </div>
    <section class="st-card"><h2>Доверие покупателей</h2>
      <div class="trust-rows">
        ${trustRow(ic('shield', 20, 2), d.biz && d.biz.status === 'verified' && d.biz.kind !== 'ip' ? 'Компания проверена' : 'ИП или компания', 'Значок у имени — бесплатно', bizState(d.biz), '/profile/settings#s-biz')}
        ${trustRow(verifiedSeal(20), 'Галочка бренда', 'Для владельцев товарного знака', tmState(d.biz, tm), '/profile/settings#s-biz')}
      </div>
    </section>
    <section class="st-card"><div class="st-card-head"><h2>Продвижение</h2><a class="btn btn-soft btn-sm" href="/profile?status=active">${ic('trend', 16, 2)}Выбрать объявление</a></div>
      ${d.promotions.length ? html`<div class="promo-list">${d.promotions.map((p) => html`<a class="promo-row" href="${p.listingId ? `/l/${p.listingId}` : '#'}">
          <span class="ml-tag ${PROMO_STATUS[p.status][0]}"><i></i>${PROMO_STATUS[p.status][1]}</span>
          <b>${p.title}</b><small>${promoLine(p)}</small></a>`)}</div>`
  : html`<p class="muted" style="margin:0">Продвигайте опубликованное объявление: «Мои объявления» → ⋯ → «Продвигать». Оно появится в блоке «Реклама» над выдачей по подходящим запросам.</p>`}
    </section>
    <section class="st-card"><h2>Платежи</h2>
      ${d.payments.length ? html`<div class="pay-list">${d.payments.map((p) => html`<div class="pay-row"><div><b>${p.title}</b><small>${when(p.createdAt)}${p.method ? ` · ${p.method}` : ''}${p.refunded ? ` · возвращено ${rub(p.refunded)}` : ''}${p.test ? ' · тестовый' : ''}</small></div>
          <span class="pay-amt">${rub(p.amount)}</span><span class="ml-tag ${(PAY_STATUS[p.status] || PAY_STATUS.error)[0]}"><i></i>${(PAY_STATUS[p.status] || PAY_STATUS.error)[1]}</span></div>`)}</div>
        <p class="muted" style="margin:0;font-size:13px">Кассовые чеки приходят на ${S.user.email} от ЮKassa. Вернуть деньги за неиспользованные дни — через <a href="/messages/support" style="text-decoration:underline">поддержку</a>.</p>`
  : html`<p class="muted" style="margin:0">Платежей пока не было.</p>`}
    </section>
  </div>`);
}

// 1.49.0: закрепить на витрине («Магазин Про») или открепить; true — получилось.
export async function setPin(id, pin) {
  try {
    const r = await api('PUT', '/api/my/shop/pins', { id, pin });
    S.user.shop = r.shop;
    toast(pin ? 'Закреплено — покупатели увидят его первым на витрине' : 'Откреплено');
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
function renderShopEditor(box, d, reload) {
  const s = d.shop;
  let cover = null; // undefined — не трогать, '' — убрать, имя файла — новая
  box.innerHTML = String(html`<form class="set" id="shop-form">
    <section class="set-group set-wide">
      <h2>Обложка</h2>
      <button type="button" id="sh-cover" class="shop-cover-edit ${s.cover ? 'has' : ''}" data-cover>${s.cover ? html`<img src="${s.cover}" alt="">` : ''}<span class="sce-hint">${ic('camera', 20, 2)}${s.cover ? 'Заменить обложку' : 'Загрузить обложку · 1600×530'}</span></button>
      ${s.cover ? html`<div><button type="button" class="btn btn-line btn-sm" data-cover-del>Убрать обложку</button></div>` : ''}
      <p class="muted" style="margin:0;font-size:14px">Широкое фото магазина или товаров — сверху страницы продавца. JPG, PNG или WebP.</p>
    </section>
    <section class="set-group set-wide">
      <h2>О магазине</h2>
      <div class="field"><label for="sh-about">Описание</label><textarea id="sh-about" name="about" class="textarea" maxlength="1500" rows="5" placeholder="Что продаёте, гарантия, доставка, самовывоз">${s.about}</textarea></div>
      <div class="row stack-m">
        <div class="field" style="flex:1"><label for="sh-hours">Часы работы</label><input id="sh-hours" name="hours" class="input" maxlength="120" value="${s.hours}" placeholder="Пн–Пт 10:00–19:00"></div>
        <div class="field" style="flex:1"><label for="sh-site">Сайт</label><input id="sh-site" name="site" class="input" maxlength="200" value="${s.site}" placeholder="example.ru" inputmode="url"></div>
      </div>
      <div class="field"><label for="sh-addr">Адрес магазина или пункта выдачи</label><input id="sh-addr" name="address" class="input" maxlength="200" value="${s.address}" placeholder="Казань, ул. Баумана, 1"></div>
      <div class="field"><label for="sh-delivery">Доставка</label><input id="sh-delivery" name="delivery" class="input" maxlength="200" value="${s.delivery}" placeholder="Самовывоз, курьер по городу, СДЭК по России"></div>
      <p class="muted" style="margin:0;font-size:13px">Витрину видят все на странице продавца. Пишите по правилам площадки: без телефонов и мессенджеров в описании — для связи есть чат. Модератор может очистить витрину, если она нарушает правила.</p>
      <div class="set-btns"><button class="btn btn-dark" type="submit">Сохранить</button><a class="btn btn-soft" href="/u/${S.user.id}">${ic('eye', 18)}Как видят покупатели</a></div>
    </section>
    <section class="set-group set-wide">
      <h2>Главное в магазине</h2>
      ${!d.shop.official && d.plan.id !== 'pro' ? html`<p class="muted" style="margin:0;font-size:14px">${ic('lock', 14, 2)} До 3 объявлений в начале витрины — в тарифе «Магазин Про».</p>`
  : html`${d.pinned.length ? html`<div class="pin-list">${d.pinned.map((l) => html`<div class="pin-row"><span class="pin-ic">${ic('pushpin', 16, 2)}</span><a href="/l/${l.id}">${l.title}</a><button type="button" class="btn btn-line btn-sm" data-unpin="${l.id}">Открепить</button></div>`)}</div>` : ''}
      <p class="muted" style="margin:0;font-size:14px">${d.pinned.length >= 3 ? 'Закреплено 3 из 3 — чтобы закрепить другое, открепите одно.' : `Закреплено ${d.pinned.length} из 3. Закрепить: «Мои объявления» → ⋯ → «Закрепить на витрине».`} Закреплённые покупатели видят первыми.</p>`}
    </section>
  </form>`);
  $$('[data-unpin]', box).forEach((b) => { b.onclick = async () => { if (await setPin(Number(b.dataset.unpin), false)) reload(); }; });
  // Из «Что ещё заполнить» в карточке профиля — сразу к нужному полю.
  const target = location.hash && $(location.hash, box);
  if (target) { target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); }
  $('[data-cover]', box).onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
    inp.onchange = async () => {
      if (!inp.files[0]) return;
      toast('Загружаем обложку…');
      try {
        const up = await api('POST', '/api/uploads', await resizeImage(inp.files[0], 1600));
        cover = up.file;
        const b = $('[data-cover]', box); b.classList.add('has'); b.innerHTML = String(html`<img src="${up.url}" alt=""><span class="sce-hint">${ic('camera', 20, 2)}Заменить обложку</span>`);
        toast('Обложка загружена — нажмите «Сохранить»');
      } catch (e) { toast(e.message, true); }
    };
    inp.click();
  };
  const del = $('[data-cover-del]', box);
  if (del) del.onclick = () => { cover = ''; const b = $('[data-cover]', box); b.classList.remove('has'); b.innerHTML = String(html`<span class="sce-hint">${ic('camera', 20, 2)}Загрузить обложку · 1600×530</span>`); del.remove(); };
  $('#shop-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    if (cover !== null) body.cover = cover;
    try { await api('PUT', '/api/my/shop', body); toast('Витрина сохранена'); reload(); } catch (ex) { toast(ex.message, true); }
  };
}

async function renderShopStats(box, days) {
  const d = await api('GET', `/api/my/shop/stats?days=${days}`);
  const t = d.totals; const pv = d.prev;
  const ctr = ctrOf(t.impressions, d.sources);
  const delta = (a, b) => trend(a, b, d.period);
  const mx = Math.max(1, ...d.daily.map((x) => x.views));
  const n = d.daily.length;
  const labels = [0, Math.floor((n - 1) / 2), n - 1];
  const srcTotal = Object.values(d.sources).reduce((a, b) => a + b, 0);
  box.innerHTML = String(html`<div class="st">
    <div class="st-kpis">
      ${kpi(NF.format(t.impressions), 'Показы', 'в поиске, ленте, категориях и рекламе', delta(t.impressions, pv.impressions))}
      ${kpi(NF.format(t.views), 'Переходы', `${d.active} ${plural(d.active, 'активное объявление', 'активных объявления', 'активных объявлений')}`, delta(t.views, pv.views), true)}
      ${kpi(ctr === null ? '—' : `${pct1(ctr)}%`, 'Из показа в переход', ctr === null ? 'появится после первых показов' : 'доля открывших карточку', '')}
      ${kpi(NF.format(t.favs), 'В избранное', `сейчас в избранном у ${NF.format(d.favNow)}`, delta(t.favs, pv.favs))}
    </div>
    <section class="st-card"><div class="st-card-head"><h2>Переходы по дням</h2><a class="btn btn-soft btn-sm" href="/api/my/shop/stats.csv?days=${days}" download>${ic('download', 16, 2)}Выгрузить в Excel</a></div>
      <div class="st-chart" role="img" aria-label="Переходы по дням">${d.daily.map((x, i) => html`<div class="st-col" title="${dayLabel(x.day)}: переходов ${x.views}, показов ${x.impressions}, в избранное ${x.favs}"><div class="st-bar ${i === n - 1 ? 'now' : ''}" style="height:${x.views ? Math.max(4, Math.round((x.views / mx) * 100)) : 0}%">${x.favs ? html`<i class="st-dot"></i>` : ''}</div></div>`)}</div>
      <div class="st-axis">${labels.map((i) => html`<span>${dayLabel(d.daily[i].day)}</span>`)}</div>
    </section>
    <div class="st-row">
      <section class="st-card"><h2>Откуда переходили</h2>
        ${srcTotal ? srcRows(d.sources, () => false) : html`<p class="muted" style="margin:0">Появится после первых переходов.</p>`}
      </section>
      <section class="st-card"><h2>Объявления</h2>
        ${d.listings.length ? html`<div class="sst"><div class="sst-row sst-h" aria-hidden="true"><span></span><span></span><span class="sst-n">показы</span><span class="sst-n">переходы</span></div>${d.listings.slice(0, 12).map((l) => html`<a class="sst-row" href="/profile/stats/${l.id}"><span class="sst-img">${l.photo ? html`<img src="${l.photo}" alt="" loading="lazy">` : svg(P.image, 18, 1.4)}</span>
            <span class="sst-t">${l.title}</span><span class="sst-n" aria-label="Показы: ${NF.format(l.impressions)}">${NF.format(l.impressions)}</span><span class="sst-n" aria-label="Переходы: ${NF.format(l.views)}"><b>${NF.format(l.views)}</b></span></a>`)}</div>
          ${d.listings.length > 12 ? html`<p class="muted" style="margin:0;font-size:13px">Все ${d.listings.length} — в выгрузке Excel.</p>` : ''}` : html`<p class="muted" style="margin:0">Опубликованных объявлений пока нет.</p>`}
      </section>
    </div>
    <p class="st-note">Считаем так же, как в статистике объявления: показ и переход — один раз в сутки на человека, без ваших собственных просмотров, модераторов и роботов. В долю «из показа в переход» идут только переходы из выдачи. «Блок «Реклама»» — переходы из продвижения.</p>
  </div>`);
}

// «О магазине» — часы, адрес (ссылка на Яндекс Карты), доставка, сайт. Пусто — блока нет.
// 1.50.2: шапка в градиенте (у официального аккаунта — знак Торганы), значки в цветных плитках, ссылки со стрелкой;
// «Открыто» — только когда в часах написано «круглосуточно» (24/7): тогда это правда в любой момент.
export function shopAbout(sh) {
  const site = sh.site ? (() => { try { return new URL(sh.site).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '';
  const go = (href, text, rel) => html`<a class="si-link" href="${href}" target="_blank" rel="${rel}">${text}${ic('right', 15, 2.4)}</a>`;
  const allDay = /круглосуточ|24\s*\/\s*7|24\s*час/i.test(sh.hours || '');
  const rows = [
    sh.hours && ['clock', 'Часы работы', html`<span class="si-v">${sh.hours}${allDay ? html`<span class="si-open">Открыто</span>` : ''}</span>`],
    sh.address && ['pin', 'Адрес', html`<span class="si-v">${sh.address}</span>${go(`https://yandex.ru/maps/?text=${encodeURIComponent(sh.address)}`, 'Открыть в Яндекс Картах', 'noopener')}`],
    sh.delivery && ['truck', 'Доставка', html`<span class="si-v">${sh.delivery}</span>`],
    site && ['link', 'Сайт', go(sh.site, site, 'nofollow noopener ugc')]
  ].filter(Boolean);
  const t = sh.official ? 'О Торгане' : 'О магазине';
  return rows.length ? html`<aside class="shop-info" aria-label="${t}">
    <div class="si-head"><span class="si-mark">${sh.official ? torganaAva(40) : ic('store', 20, 2.2)}</span><h2>${t}</h2></div>
    <div class="si-list">${rows.map(([icn, k, v]) => html`<div class="si-row"><span class="si-ic">${ic(icn, 18, 2.2)}</span><div><small>${k}</small>${v}</div></div>`)}</div>
  </aside>` : '';
}

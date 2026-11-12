'use strict';

// Документы, согласие на обработку данных, проверка запрещённых товаров, иконки приложения.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { checkProhibited, PROHIBITED } = require('../lib/prohibited');
const { startServer, client, registerUser } = require('./helpers');

let srv; let anna; let admin; let guest;
before(async () => {
  srv = await startServer();
  guest = client(srv.base);
  admin = await registerUser(srv.base, { name: 'Модератор', email: 'admin@test.local' });
  anna = await registerUser(srv.base, { name: 'Анна', email: 'anna@test.local' });
});
after(() => srv.stop());

describe('проверка запрещённых товаров', () => {
  const hit = (t, d = '') => checkProhibited(t, d).map((x) => x.id);
  test('ловит запрещённое', () => {
    const cases = {
      drugs: ['Мефедрон с доставкой', 'Работа закладчиком, оплата каждый день'],
      weapons: ['Травматический пистолет', 'Патроны калибр 9 мм', 'Ружьё охотничье'],
      medicine: ['Лирика без рецепта', 'Анаболики для набора массы'],
      alcohol: ['Водка оптом', 'Вейп одноразовый', 'Сигареты блок'],
      documents: ['Паспорт РФ купить', 'Диплом купить недорого', 'Продам базу клиентов'],
      finance: ['Обнал карт, дропы', 'Заработок без вложений'],
      counterfeit: ['Реплика Gucci', 'Кроссовки люкс копия'],
      spy: ['Скрытая камера в ручке', 'Глушилка GPS'],
      people: ['Эскорт услуги'],
      adult: ['Секс-игрушка новая', 'Вибратор женский', 'Эротическое бельё', 'Товары для взрослых'],
      animals: ['Чёрная икра осетровых'],
      occult: ['Приворот на любовь'],
      dangerous: ['Ртуть в ампулах']
    };
    for (const [id, titles] of Object.entries(cases)) for (const t of titles) assert.ok(hit(t).includes(id), `${t} → ${id}`);
  });

  test('не задерживает обычные вещи', () => {
    for (const t of ['Детская коляска Cybex', 'Закладка для книг', 'Клеевой пистолет', 'Пистолет для монтажной пены', 'Пальто зимнее', 'Пивная кружка',
      'Курс по дропшиппингу', 'Табакерка антикварная', 'Безалкогольное пиво', 'Самогонный аппарат', 'Глубинный вибратор для бетона', 'Бокалы для вина', 'Портсигар', 'iPhone 15 Pro', 'Велосипед горный', 'Ремонт квартир под ключ', 'Сок виноградный', 'Нож кухонный', 'Испорченный телевизор на запчасти',
      'Красная икра 0,5 кг', 'Аренда квартиры у метро', 'Паспорт транспортного средства утерян — продаю авто с дубликатом', 'Сигнализация для авто']) {
      assert.deepEqual(hit(t), [], t);
    }
  });

  test('1.48.2: алкоголь, табак и эротические товары — сразу нельзя, с понятной причиной', async () => {
    for (const title of ['Водка домашняя', 'Электронная сигарета', 'Секс-игрушка новая']) {
      const r = await anna.post('/api/listings', { title, category: 'home', city: 'Казань' });
      assert.equal(r.status, 400, title);
      assert.match(r.data.error, /нельзя продавать/, title);
    }
    const ok = await anna.post('/api/listings', { title: 'Кальян стеклянный', category: 'home', city: 'Казань' });
    assert.equal(ok.status, 200, 'кальян без табака — можно');
    await anna.del(`/api/listings/${ok.data.id}`); // не мешает очереди в следующих проверках
  });

  test('у каждой категории есть текст для правил и шаблоны', () => {
    for (const c of PROHIBITED) { assert.ok(c.title && c.text.length > 30 && c.re.length, c.id); }
  });
});

describe('документы', () => {
  test('соглашение, правила, политика и согласие опубликованы; реквизиты оператора — в соглашении, политике и согласии', async () => {
    for (const slug of ['terms', 'rules', 'privacy', 'consent', 'contacts']) {
      const r = await guest.get(`/api/pages/${slug}`);
      assert.equal(r.status, 200, slug);
      assert.match(r.data.html, /Редакция от/, slug);
      if (slug !== 'rules' && slug !== 'contacts') assert.match(r.data.html, /ИП Албаков И\. М\., ИНН 060302809413, ОГРНИП 322060000007916/, slug);
    }
    assert.equal((await guest.get('/api/pages/nope')).status, 404);
  });

  test('раздел «Запрещено» в правилах собран из того же списка, что и проверка, со ссылками на законы', async () => {
    const html = (await guest.get('/api/pages/rules')).data.html;
    for (const c of PROHIBITED) { assert.ok(html.includes(c.title), c.title); assert.ok(c.law, c.id); }
    assert.match(html, /Указ Президента РФ от 22\.02\.1992 № 179/);
    assert.match(html, /ст\. 129 ГК РФ/);
    assert.match(html, /Разрешено с условиями/);
  });

  test('реквизиты и контакты по 149-ФЗ: владелец, email для заявлений; соглашение — порядок для правообладателей', async () => {
    const c = (await guest.get('/api/pages/contacts')).data.html;
    assert.match(c, /ИП Албаков И\. М\./);
    assert.match(c, /support@test\.local/, 'email из настроек сервера');
    assert.equal(require('../lib/legal').operator().email === 'support@torgana.ru' || !!process.env.SUPPORT_EMAIL, true, 'по умолчанию — support@torgana.ru');
    const t = (await guest.get('/api/pages/terms')).data.html;
    assert.match(t, /15\.7/);
    assert.match(t, /24 часов/);
    assert.match(t, /рекомендательные технологии/);
    const cfg = (await guest.get('/api/config')).data;
    assert.deepEqual(cfg.operator, { name: 'ИП Албаков И. М.', inn: '060302809413', ogrnip: '322060000007916' });
  });

  test('политика: без функции «по фото» — без трансграничной передачи', async () => {
    const html = (await guest.get('/api/pages/privacy')).data.html;
    assert.match(html, /Трансграничная передача не ведётся/);
    assert.doesNotMatch(html, /распознавания изображений/);
  });
});

describe('согласие при регистрации', () => {
  test('без согласия зарегистрироваться нельзя', async () => {
    const r = await client(srv.base).post('/api/auth/register', { name: 'Вера', email: 'vera@test.local', password: 'password123' });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /согласие/);
    const s = await client(srv.base).post('/api/auth/register', { name: 'Вера', email: 'vera@test.local', password: 'password123', consent: 'on' });
    assert.equal(s.status, 400, 'нужно именно true, а не строка');
  });
});

describe('объявления, похожие на запрещённые', () => {
  let id;
  test('уходят на проверку и не видны покупателям', async () => {
    const r = await anna.post('/api/listings', { title: 'Травматический пистолет', category: 'hobby', city: 'Казань', price: '15000' });
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'pending');
    id = r.data.id;
    assert.equal((await guest.get(`/api/listings/${id}`)).status, 404);
    assert.ok(!(await guest.get('/api/listings?q=пистолет')).data.items.some((i) => i.id === id));
    const own = (await anna.get(`/api/listings/${id}`)).data.listing;
    assert.equal(own.status, 'pending');
    assert.match(own.flags, /Оружие/);
    assert.equal((await anna.patch(`/api/listings/${id}`, { status: 'active' })).status, 400, 'сам опубликовать нельзя');
  });

  test('правка не выводит из проверки — решает модератор', async () => {
    const r = await anna.patch(`/api/listings/${id}`, { title: 'Пневматическая винтовка', category: 'hobby', city: 'Казань', price: '15000' });
    assert.equal(r.data.status, 'pending');
  });

  test('модератор видит очередь и публикует', async () => {
    const st = (await admin.get('/api/admin/stats')).data;
    assert.equal(st.pending, 1);
    const q = (await admin.get('/api/admin/listings?status=pending')).data.items;
    assert.equal(q[0].id, id);
    assert.ok(q[0].flags);
    assert.equal((await admin.post(`/api/admin/listings/${id}/restore`)).status, 200);
    const l = (await guest.get(`/api/listings/${id}`)).data.listing;
    assert.equal(l.status, 'active');
  });

  test('обычное объявление тоже ждёт модератора, но без пометки «похоже на запрещённое» и в очереди после подозрительных', async () => {
    const sus = (await anna.post('/api/listings', { title: 'Травматический пистолет', category: 'hobby', city: 'Казань' })).data.id;
    const r = await anna.post('/api/listings', { title: 'Закладка для книг из кожи', category: 'hobby', city: 'Казань', price: '500' });
    assert.equal(r.data.status, 'pending');
    const q = (await admin.get('/api/admin/listings?status=pending')).data.items;
    assert.equal(q[0].id, sus, 'подозрительные — первыми');
    assert.equal(q.find((i) => i.id === r.data.id).flags, '');
    const d = (await admin.get(`/api/admin/listings/${sus}`)).data;
    assert.deepEqual(d.listing.matches[0].words, ['травматич']);
    assert.ok(d.next, 'есть следующее в очереди');
  });
});

describe('иконки', () => {
  const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  test('PNG нужных размеров; установки на экран «Домой» нет (манифест убран в 1.56.6)', async () => {
    const page = String((await guest.get('/')).data);
    assert.doesNotMatch(page, /rel="manifest"|apple-touch-icon|apple-mobile-web-app/);
    assert.equal((await fetch(`${srv.base}/assets/site.webmanifest`)).status, 404);
    for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
      const r = await fetch(`${srv.base}/assets/icons/${file}`);
      assert.equal(r.headers.get('content-type'), 'image/png');
      const buf = Buffer.from(await r.arrayBuffer());
      assert.equal(buf.toString('ascii', 1, 4), 'PNG');
      assert.deepEqual(pngSize(buf), [size, size], file);
      assert.equal(buf[25], 2, `${file}: без прозрачности (iOS заливает прозрачное чёрным)`);
    }
  });
});

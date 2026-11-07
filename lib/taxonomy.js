'use strict';

// Подкатегории и характеристики. id подкатегорий и ключи характеристик попадают в базу и адреса — после запуска не менять.
// Поле: select — выбор из списка (фильтр «равно»), number — число (фильтр «от–до»), unit — подпись к числу.
const Y = new Date().getFullYear();
const F = {
  carBrand: { key: 'brand', label: 'Марка', type: 'select', options: ['Lada', 'Toyota', 'Kia', 'Hyundai', 'Volkswagen', 'Skoda', 'Renault', 'Nissan', 'Mercedes-Benz', 'BMW', 'Audi', 'Chery', 'Haval', 'Geely', 'Changan', 'Mitsubishi', 'Mazda', 'Ford', 'Chevrolet', 'Honda', 'Lexus', 'Subaru', 'Volvo', 'Land Rover', 'Porsche', 'Suzuki', 'Peugeot', 'Citroen', 'Opel', 'Daewoo', 'УАЗ', 'ГАЗ', 'Exeed', 'Omoda', 'Tank', 'Jetour', 'Li Auto', 'Zeekr', 'Tesla', 'Другая'] },
  year: { key: 'year', label: 'Год выпуска', type: 'number', min: 1950, max: Y + 1 },
  mileage: { key: 'mileage', label: 'Пробег', type: 'number', unit: 'км', min: 0, max: 2000000 },
  gearbox: { key: 'gearbox', label: 'Коробка', type: 'select', options: ['Механика', 'Автомат', 'Робот', 'Вариатор'] },
  fuel: { key: 'fuel', label: 'Двигатель', type: 'select', options: ['Бензин', 'Дизель', 'Гибрид', 'Электро', 'Газ'] },
  body: { key: 'body', label: 'Кузов', type: 'select', options: ['Седан', 'Хэтчбек', 'Универсал', 'Внедорожник', 'Кроссовер', 'Лифтбек', 'Купе', 'Минивэн', 'Пикап', 'Фургон'] },
  drive: { key: 'drive', label: 'Привод', type: 'select', options: ['Передний', 'Задний', 'Полный'] },
  motoType: { key: 'motoType', label: 'Тип', type: 'select', options: ['Мотоцикл', 'Скутер', 'Мопед', 'Квадроцикл', 'Снегоход', 'Питбайк'] },
  partType: { key: 'partType', label: 'Что продаёте', type: 'select', options: ['Шины и диски', 'Запчасти', 'Аксессуары', 'Аудио и электроника', 'Инструменты', 'Масла и автохимия'] },
  rooms: { key: 'rooms', label: 'Комнат', type: 'select', options: ['Студия', '1', '2', '3', '4', '5+'] },
  area: { key: 'area', label: 'Площадь', type: 'number', unit: 'м²', min: 1, max: 100000 },
  floor: { key: 'floor', label: 'Этаж', type: 'number', min: -5, max: 150 },
  floors: { key: 'floors', label: 'Этажей в доме', type: 'number', min: 1, max: 150 },
  house: { key: 'house', label: 'Дом', type: 'select', options: ['Панельный', 'Кирпичный', 'Монолитный', 'Блочный', 'Деревянный'] },
  market: { key: 'market', label: 'Тип жилья', type: 'select', options: ['Вторичка', 'Новостройка'] },
  guests: { key: 'guests', label: 'Гостей', type: 'number', min: 1, max: 50 },
  land: { key: 'land', label: 'Участок', type: 'number', unit: 'сот.', min: 0, max: 100000 },
  commType: { key: 'commType', label: 'Назначение', type: 'select', options: ['Офис', 'Торговое', 'Склад', 'Производство', 'Общепит', 'Свободное назначение'] },
  schedule: { key: 'schedule', label: 'График', type: 'select', options: ['Полный день', 'Сменный', 'Гибкий', 'Удалённо', 'Вахта', 'Подработка'] },
  experience: { key: 'experience', label: 'Опыт', type: 'select', options: ['Без опыта', '1–3 года', '3–6 лет', 'Более 6 лет'] },
  phoneBrand: { key: 'brand', label: 'Производитель', type: 'select', options: ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Honor', 'Realme', 'Tecno', 'Infinix', 'Google', 'OnePlus', 'Nothing', 'Poco', 'Vivo', 'Oppo', 'Другой'] },
  memory: { key: 'memory', label: 'Память', type: 'select', options: ['32 ГБ', '64 ГБ', '128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'] },
  laptopBrand: { key: 'brand', label: 'Производитель', type: 'select', options: ['Apple', 'Asus', 'Lenovo', 'HP', 'Acer', 'MSI', 'Huawei', 'Honor', 'Dell', 'Xiaomi', 'Samsung', 'Другой'] },
  size: { key: 'size', label: 'Размер', type: 'select', options: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL и больше'] },
  shoeSize: { key: 'shoeSize', label: 'Размер', type: 'number', min: 15, max: 50 },
  bikeType: { key: 'bikeType', label: 'Тип', type: 'select', options: ['Горный', 'Городской', 'Шоссейный', 'Гравийный', 'Детский', 'Электро', 'BMX', 'Складной'] }
};

const SUBCATS = {
  transport: [
    { id: 'cars', name: 'Автомобили', fields: [F.carBrand, F.year, F.mileage, F.gearbox, F.fuel, F.body, F.drive], summary: ['year', 'mileage', 'gearbox'] },
    { id: 'moto', name: 'Мотоциклы и мототехника', fields: [F.motoType, F.year, F.mileage], summary: ['motoType', 'year'] },
    { id: 'trucks', name: 'Грузовики и спецтехника', fields: [F.year, F.mileage], summary: ['year', 'mileage'] },
    { id: 'water', name: 'Водный транспорт', fields: [F.year], summary: ['year'] },
    { id: 'parts', name: 'Запчасти и аксессуары', fields: [F.partType], summary: ['partType'] }
  ],
  realty: [
    { id: 'flats', name: 'Квартиры — продажа', fields: [F.rooms, F.area, F.floor, F.floors, F.house, F.market], summary: ['rooms', 'area', 'floor'] },
    { id: 'flats_rent', name: 'Квартиры — аренда', fields: [F.rooms, F.area, F.floor, F.floors], summary: ['rooms', 'area', 'floor'] },
    { id: 'daily', name: 'Посуточно', fields: [F.rooms, F.guests], summary: ['rooms', 'guests'] },
    { id: 'rooms', name: 'Комнаты', fields: [F.area, F.floor, F.floors], summary: ['area', 'floor'] },
    { id: 'houses', name: 'Дома, дачи, коттеджи', fields: [F.area, F.land, F.floors], summary: ['area', 'land'] },
    { id: 'land', name: 'Земельные участки', fields: [F.land], summary: ['land'] },
    { id: 'garages', name: 'Гаражи и машиноместа', fields: [F.area], summary: ['area'] },
    { id: 'commercial', name: 'Коммерческая недвижимость', fields: [F.commType, F.area], summary: ['commType', 'area'] }
  ],
  jobs: [
    { id: 'vacancies', name: 'Вакансии', fields: [F.schedule, F.experience], summary: ['schedule', 'experience'] },
    { id: 'resumes', name: 'Резюме', fields: [F.schedule, F.experience], summary: ['schedule', 'experience'] }
  ],
  services: [
    { id: 'repair', name: 'Ремонт и строительство' }, { id: 'beauty_s', name: 'Красота и здоровье' }, { id: 'moving', name: 'Перевозки и грузчики' },
    { id: 'it', name: 'IT, интернет, дизайн' }, { id: 'education', name: 'Обучение и курсы' }, { id: 'household', name: 'Бытовые услуги и уборка' },
    { id: 'events', name: 'Праздники и мероприятия' }, { id: 'auto_s', name: 'Авто-услуги' }, { id: 'other_s', name: 'Другие услуги' }
  ],
  electronics: [
    { id: 'phones', name: 'Телефоны', fields: [F.phoneBrand, F.memory], summary: ['brand', 'memory'] },
    { id: 'laptops', name: 'Ноутбуки', fields: [F.laptopBrand], summary: ['brand'] },
    { id: 'tablets', name: 'Планшеты и электронные книги', fields: [F.memory], summary: ['memory'] },
    { id: 'computers', name: 'Компьютеры и комплектующие' }, { id: 'audio', name: 'Аудио и видео' }, { id: 'games', name: 'Игры и приставки' },
    { id: 'photo', name: 'Фототехника' }, { id: 'office', name: 'Оргтехника и расходники' }, { id: 'gadgets', name: 'Часы, гаджеты, аксессуары' }
  ],
  personal: [
    { id: 'women', name: 'Женская одежда', fields: [F.size], summary: ['size'] },
    { id: 'men', name: 'Мужская одежда', fields: [F.size], summary: ['size'] },
    { id: 'shoes', name: 'Обувь', fields: [F.shoeSize], summary: ['shoeSize'] },
    { id: 'kids_wear', name: 'Детская одежда и обувь' }, { id: 'kids', name: 'Товары для детей и игрушки' },
    { id: 'bags', name: 'Сумки и аксессуары' }, { id: 'jewelry', name: 'Часы и украшения' }, { id: 'beauty', name: 'Красота и уход' }
  ],
  home: [
    { id: 'furniture', name: 'Мебель и интерьер' }, { id: 'appliances', name: 'Бытовая техника' }, { id: 'build', name: 'Ремонт и строительство' },
    { id: 'kitchen', name: 'Посуда и товары для кухни' }, { id: 'garden', name: 'Сад, дача, растения' }, { id: 'food', name: 'Продукты питания' }
  ],
  hobby: [
    { id: 'bikes', name: 'Велосипеды', fields: [F.bikeType], summary: ['bikeType'] },
    { id: 'sport', name: 'Спорт и отдых' }, { id: 'tickets', name: 'Билеты и путешествия' }, { id: 'books', name: 'Книги и журналы' },
    { id: 'collect', name: 'Коллекционирование' }, { id: 'music', name: 'Музыкальные инструменты' }, { id: 'hunting', name: 'Охота и рыбалка' }
  ],
  animals: [
    { id: 'dogs', name: 'Собаки' }, { id: 'cats', name: 'Кошки' }, { id: 'birds', name: 'Птицы' }, { id: 'aquarium', name: 'Аквариум' },
    { id: 'other_pets', name: 'Другие животные' }, { id: 'pet_goods', name: 'Товары для животных' }
  ],
  business: [
    { id: 'ready', name: 'Готовый бизнес' }, { id: 'equipment', name: 'Оборудование для бизнеса' }
  ]
};

const SUB = {}; // id → { ...sub, category }
for (const [cat, list] of Object.entries(SUBCATS)) for (const s of list) SUB[s.id] = { fields: [], summary: [], ...s, category: cat };

// Проверить и почистить характеристики: только поля подкатегории, значения из списка, числа в пределах.
// Возвращает объект или бросает Error с понятным текстом.
function cleanAttrs(subId, raw) {
  const sub = SUB[subId];
  if (!sub || !raw || typeof raw !== 'object') return {};
  const out = {};
  for (const f of sub.fields) {
    const v = raw[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'select') {
      if (!f.options.includes(String(v))) throw new Error(`Проверьте поле «${f.label}»`);
      out[f.key] = String(v);
    } else {
      const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < f.min || n > f.max) throw new Error(`«${f.label}»: от ${f.min} до ${f.max}${f.unit ? ` ${f.unit}` : ''}`);
      out[f.key] = Math.round(n * 10) / 10;
    }
  }
  return out;
}

const NF = new Intl.NumberFormat('ru-RU');
// По правилам набора четырёхзначные числа без пробела: 2015, 5000; дальше — 85 000.
const num = (v) => (Math.abs(Number(v)) >= 10000 ? NF.format(v) : String(v).replace('.', ','));
// Значение для показа: «85 000 км», «2-комн.», «5 этаж».
function fmt(f, v) {
  if (v === undefined || v === null || v === '') return '';
  if (f.key === 'rooms') return v === 'Студия' ? 'студия' : `${v}-комн.`;
  if (f.key === 'floor') return `${v} этаж`;
  if (f.key === 'guests') return `до ${v} гостей`;
  if (f.key === 'shoeSize') return `${v} размер`;
  if (f.key === 'size') return `размер ${v}`;
  if (f.key === 'year') return `${v} г.`;
  if (f.type === 'number') return `${num(v)}${f.unit ? ` ${f.unit}` : ''}`;
  return String(v);
}
// Короткая строка для карточки: «2018 г., 85 000 км, Автомат».
function summaryOf(subId, attrs) {
  const sub = SUB[subId];
  if (!sub || !attrs) return '';
  return sub.summary.map((k) => { const f = sub.fields.find((x) => x.key === k); return f ? fmt(f, attrs[k]) : ''; }).filter(Boolean).join(', ');
}
// Для страницы объявления: [{ label, value }].
const describe = (subId, attrs) => (SUB[subId] ? SUB[subId].fields.filter((f) => attrs && attrs[f.key] !== undefined).map((f) => ({ label: f.label, value: fmt(f, attrs[f.key]) })) : []);

// Для клиента: категории → подкатегории с полями.
const publicTaxonomy = () => Object.fromEntries(Object.entries(SUBCATS).map(([cat, list]) => [cat, list.map((s) => ({ id: s.id, name: s.name, summary: s.summary || [], fields: (s.fields || []).map(({ key, label, type, options, unit, min, max }) => ({ key, label, type, options, unit, min, max })) }))]));

// Подкатегория по названиям из фида Авито («Автомобили», «Телефоны / Мобильные телефоны»).
function subFromKinds(category, kinds) {
  const k = String(kinds || '').toLowerCase().replace(/ё/g, 'е');
  const list = SUBCATS[category] || [];
  if (category === 'realty' && /посуточ/.test(k)) return 'daily';
  if (category === 'realty' && /квартир/.test(k)) return /сда|аренд/.test(k) ? 'flats_rent' : 'flats';
  if (category === 'jobs') return /резюме/.test(k) ? 'resumes' : 'vacancies';
  const hit = list.find((s) => s.name.toLowerCase().replace(/ё/g, 'е').split(/[ ,—-]+/).filter((w) => w.length > 4).some((w) => k.includes(w.slice(0, -1))));
  return hit ? hit.id : '';
}

module.exports = { SUBCATS, SUB, cleanAttrs, summaryOf, describe, publicTaxonomy, subFromKinds, fmt, num };

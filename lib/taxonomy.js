'use strict';

// Подкатегории и характеристики. id подкатегорий и ключи характеристик попадают в базу и адреса — после запуска не менять.
// Поле: select — выбор из списка (фильтр «равно»), number — число (фильтр «от–до»), unit — подпись к числу,
// step — шаг дробного числа (объём двигателя 2,5), req — обязательное в форме объявления (1.22),
// popular — частые значения длинного списка: в форме и фильтрах они чипсами, остальные — в окне с поиском,
// color — список цветов: в форме и фильтрах кружками (цвета кружков — в клиенте).
const Y = new Date().getFullYear();
const req = (f) => ({ ...f, req: true });
const COLORS = ['Чёрный', 'Белый', 'Серый', 'Серебристый', 'Бежевый', 'Коричневый', 'Красный', 'Оранжевый', 'Жёлтый', 'Зелёный', 'Голубой', 'Синий', 'Фиолетовый', 'Розовый', 'Золотой', 'Разноцветный'];
const F = {
  carBrand: { key: 'brand', label: 'Марка', type: 'select', popular: ['Lada', 'Toyota', 'Kia', 'Hyundai', 'Haval', 'Chery', 'Volkswagen', 'Skoda'], options: ['Lada', 'Toyota', 'Kia', 'Hyundai', 'Volkswagen', 'Skoda', 'Renault', 'Nissan', 'Mercedes-Benz', 'BMW', 'Audi', 'Chery', 'Haval', 'Geely', 'Changan', 'Mitsubishi', 'Mazda', 'Ford', 'Chevrolet', 'Honda', 'Lexus', 'Subaru', 'Volvo', 'Land Rover', 'Porsche', 'Suzuki', 'Peugeot', 'Citroen', 'Opel', 'Daewoo', 'УАЗ', 'ГАЗ', 'Exeed', 'Omoda', 'Tank', 'Jetour', 'Li Auto', 'Zeekr', 'Tesla', 'Другая'] },
  year: { key: 'year', label: 'Год выпуска', type: 'number', min: 1950, max: Y + 1 },
  mileage: { key: 'mileage', label: 'Пробег', type: 'number', unit: 'км', min: 0, max: 2000000 },
  gearbox: { key: 'gearbox', label: 'Коробка', type: 'select', options: ['Механика', 'Автомат', 'Робот', 'Вариатор'] },
  fuel: { key: 'fuel', label: 'Двигатель', type: 'select', options: ['Бензин', 'Дизель', 'Гибрид', 'Электро', 'Газ'] },
  engine: { key: 'engine', label: 'Объём двигателя', type: 'number', unit: 'л', min: 0.1, max: 10, step: 0.1 },
  power: { key: 'power', label: 'Мощность', type: 'number', unit: 'л. с.', min: 1, max: 2000 },
  body: { key: 'body', label: 'Кузов', type: 'select', options: ['Седан', 'Хэтчбек', 'Универсал', 'Внедорожник', 'Кроссовер', 'Лифтбек', 'Купе', 'Минивэн', 'Пикап', 'Фургон'] },
  drive: { key: 'drive', label: 'Привод', type: 'select', options: ['Передний', 'Задний', 'Полный'] },
  owners: { key: 'owners', label: 'Владельцев по ПТС', type: 'select', options: ['1', '2', '3', '4+'] },
  steering: { key: 'steering', label: 'Руль', type: 'select', options: ['Левый', 'Правый'] },
  damage: { key: 'damage', label: 'Состояние', type: 'select', options: ['Не битый', 'Битый', 'На запчасти'] },
  color: { key: 'color', label: 'Цвет', type: 'select', color: true, options: COLORS },
  motoType: { key: 'motoType', label: 'Тип', type: 'select', options: ['Мотоцикл', 'Скутер', 'Мопед', 'Квадроцикл', 'Снегоход', 'Питбайк'] },
  motoVolume: { key: 'volume', label: 'Объём двигателя', type: 'number', unit: 'см³', min: 10, max: 3000 },
  truckType: { key: 'truckType', label: 'Тип', type: 'select', options: ['Грузовик', 'Тягач', 'Автобус', 'Спецтехника', 'Сельхозтехника', 'Прицеп'] },
  waterType: { key: 'waterType', label: 'Тип', type: 'select', options: ['Лодка', 'Катер', 'Яхта', 'Гидроцикл', 'Каяк, сапборд'] },
  partType: { key: 'partType', label: 'Что продаёте', type: 'select', options: ['Шины и диски', 'Запчасти', 'Аксессуары', 'Аудио и электроника', 'Инструменты', 'Масла и автохимия'] },
  rooms: { key: 'rooms', label: 'Комнат', type: 'select', options: ['Студия', '1', '2', '3', '4', '5+'] },
  area: { key: 'area', label: 'Площадь', type: 'number', unit: 'м²', min: 1, max: 100000, step: 0.1 },
  floor: { key: 'floor', label: 'Этаж', type: 'number', min: -5, max: 150 },
  floors: { key: 'floors', label: 'Этажей в доме', type: 'number', min: 1, max: 150 },
  built: { key: 'built', label: 'Год постройки', type: 'number', min: 1800, max: Y + 5 },
  house: { key: 'house', label: 'Дом', type: 'select', options: ['Панельный', 'Кирпичный', 'Монолитный', 'Блочный', 'Деревянный'] },
  market: { key: 'market', label: 'Тип жилья', type: 'select', options: ['Вторичка', 'Новостройка'] },
  renovation: { key: 'renovation', label: 'Ремонт', type: 'select', options: ['Без ремонта', 'Косметический', 'Евро', 'Дизайнерский'] },
  bathroom: { key: 'bathroom', label: 'Санузел', type: 'select', options: ['Совмещённый', 'Раздельный', 'Несколько'] },
  balcony: { key: 'balcony', label: 'Балкон', type: 'select', options: ['Нет', 'Балкон', 'Лоджия', 'Несколько'] },
  furnished: { key: 'furnished', label: 'Мебель', type: 'select', options: ['Есть', 'Частично', 'Нет'] },
  pets: { key: 'pets', label: 'Можно с животными', type: 'select', options: ['Да', 'Нет'] },
  guests: { key: 'guests', label: 'Гостей', type: 'number', min: 1, max: 50 },
  land: { key: 'land', label: 'Участок', type: 'number', unit: 'сот.', min: 0, max: 100000, step: 0.1 },
  houseType: { key: 'houseType', label: 'Тип', type: 'select', options: ['Дом', 'Дача', 'Коттедж', 'Таунхаус', 'Часть дома'] },
  wall: { key: 'wall', label: 'Материал стен', type: 'select', options: ['Кирпич', 'Брус, бревно', 'Газоблок', 'Каркас', 'Монолит', 'Другой'] },
  landUse: { key: 'landUse', label: 'Назначение', type: 'select', options: ['ИЖС', 'СНТ, ДНП', 'Сельхозназначение', 'Промназначение'] },
  garageType: { key: 'garageType', label: 'Тип', type: 'select', options: ['Гараж', 'Машиноместо', 'Бокс'] },
  commType: { key: 'commType', label: 'Назначение', type: 'select', options: ['Офис', 'Торговое', 'Склад', 'Производство', 'Общепит', 'Свободное назначение'] },
  schedule: { key: 'schedule', label: 'График', type: 'select', options: ['Полный день', 'Сменный', 'Гибкий', 'Удалённо', 'Вахта', 'Подработка'] },
  experience: { key: 'experience', label: 'Опыт', type: 'select', options: ['Без опыта', '1–3 года', '3–6 лет', 'Более 6 лет'] },
  employment: { key: 'employment', label: 'Занятость', type: 'select', options: ['Полная', 'Частичная', 'Проектная', 'Стажировка'] },
  serviceWhere: { key: 'where', label: 'Где', type: 'select', options: ['У меня', 'Выезд к клиенту', 'Онлайн'] },
  proExp: { key: 'proExp', label: 'Опыт', type: 'select', options: ['До года', '1–3 года', '3–10 лет', 'Более 10 лет'] },
  phoneBrand: { key: 'brand', label: 'Производитель', type: 'select', options: ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Honor', 'Realme', 'Tecno', 'Infinix', 'Google', 'OnePlus', 'Nothing', 'Poco', 'Vivo', 'Oppo', 'Другой'], popular: ['Apple', 'Samsung', 'Xiaomi', 'Honor', 'Huawei', 'Realme', 'Tecno', 'Poco'] },
  memory: { key: 'memory', label: 'Память', type: 'select', options: ['32 ГБ', '64 ГБ', '128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'] },
  battery: { key: 'battery', label: 'Аккумулятор', type: 'select', options: ['Больше 90%', '80–90%', 'Меньше 80%'] },
  warranty: { key: 'warranty', label: 'Гарантия', type: 'select', options: ['Есть', 'Нет'] },
  laptopBrand: { key: 'brand', label: 'Производитель', type: 'select', options: ['Apple', 'Asus', 'Lenovo', 'HP', 'Acer', 'MSI', 'Huawei', 'Honor', 'Dell', 'Xiaomi', 'Samsung', 'Другой'] },
  screen: { key: 'screen', label: 'Экран', type: 'number', unit: '″', min: 5, max: 100, step: 0.1 },
  ram: { key: 'ram', label: 'Оперативная память', type: 'select', options: ['4 ГБ', '8 ГБ', '16 ГБ', '32 ГБ', '64 ГБ и больше'] },
  storage: { key: 'storage', label: 'Накопитель', type: 'select', options: ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ', '2 ТБ и больше'] },
  cpu: { key: 'cpu', label: 'Процессор', type: 'select', options: ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'AMD Ryzen 3', 'AMD Ryzen 5', 'AMD Ryzen 7', 'AMD Ryzen 9', 'Apple M1', 'Apple M2', 'Apple M3', 'Apple M4', 'Другой'], popular: ['Intel Core i5', 'Intel Core i7', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Apple M1', 'Apple M2', 'Apple M3'] },
  tabletBrand: { key: 'brand', label: 'Производитель', type: 'select', options: ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Lenovo', 'Honor', 'Amazon Kindle', 'PocketBook', 'Другой'] },
  compType: { key: 'compType', label: 'Что продаёте', type: 'select', options: ['Системный блок', 'Моноблок', 'Монитор', 'Видеокарта', 'Процессор', 'Другие комплектующие', 'Клавиатура, мышь'] },
  audioType: { key: 'audioType', label: 'Что продаёте', type: 'select', options: ['Наушники', 'Колонки', 'Телевизор', 'Проектор', 'Усилитель, ресивер', 'Микрофон', 'Другое'] },
  gameType: { key: 'gameType', label: 'Что продаёте', type: 'select', options: ['Приставка', 'Игры', 'Геймпады', 'VR', 'Аксессуары'] },
  platform: { key: 'platform', label: 'Платформа', type: 'select', options: ['PlayStation 5', 'PlayStation 4', 'Xbox Series', 'Xbox One', 'Nintendo Switch', 'ПК', 'Другая'] },
  photoType: { key: 'photoType', label: 'Что продаёте', type: 'select', options: ['Фотоаппарат', 'Объектив', 'Видеокамера', 'Экшн-камера', 'Квадрокоптер', 'Аксессуары'] },
  gadgetType: { key: 'gadgetType', label: 'Что продаёте', type: 'select', options: ['Смарт-часы', 'Фитнес-браслет', 'Электронная книга', 'Умный дом', 'Аксессуары'] },
  size: { key: 'size', label: 'Размер', type: 'select', options: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL и больше'] },
  clothBrand: { key: 'brand', label: 'Бренд', type: 'select', popular: ['Zara', 'H&M', 'Mango', 'Uniqlo', 'Befree', 'Nike', 'Adidas', 'Levi’s'], options: ['Zara', 'H&M', 'Mango', 'Uniqlo', 'Massimo Dutti', 'Bershka', 'Pull&Bear', 'Stradivarius', 'Befree', 'Gloria Jeans', 'Love Republic', 'Lime', '12 Storeez', 'Ushatava', 'Nike', 'Adidas', 'Puma', 'New Balance', 'The North Face', 'Columbia', 'Levi’s', 'Tommy Hilfiger', 'Calvin Klein', 'Lacoste', 'Ralph Lauren', 'Gucci', 'Prada', 'Другой'] },
  womenType: { key: 'clothType', label: 'Что продаёте', type: 'select', options: ['Верхняя одежда', 'Платья и юбки', 'Брюки и джинсы', 'Футболки и блузки', 'Свитеры и кофты', 'Костюмы', 'Спортивная одежда', 'Бельё и купальники', 'Другое'] },
  menType: { key: 'clothType', label: 'Что продаёте', type: 'select', options: ['Верхняя одежда', 'Брюки и джинсы', 'Футболки и рубашки', 'Свитеры и кофты', 'Костюмы', 'Спортивная одежда', 'Другое'] },
  season: { key: 'season', label: 'Сезон', type: 'select', options: ['Лето', 'Демисезон', 'Зима', 'Всесезон'] },
  shoeSize: { key: 'shoeSize', label: 'Размер', type: 'number', min: 15, max: 50, step: 0.5 },
  shoeFor: { key: 'gender', label: 'Для кого', type: 'select', options: ['Женская', 'Мужская', 'Унисекс'] },
  kidsAge: { key: 'kidsAge', label: 'Возраст', type: 'select', options: ['0–1 год', '1–3 года', '3–7 лет', '7–12 лет', 'Подросткам'] },
  kidsFor: { key: 'gender', label: 'Для кого', type: 'select', options: ['Девочке', 'Мальчику', 'Унисекс'] },
  kidsGoods: { key: 'kidsGoods', label: 'Что продаёте', type: 'select', options: ['Коляска', 'Автокресло', 'Детская мебель', 'Игрушки', 'Для кормления', 'Для купания', 'Другое'] },
  furnType: { key: 'furnType', label: 'Что продаёте', type: 'select', options: ['Диван', 'Кровать', 'Шкаф', 'Стол', 'Стулья', 'Кресло', 'Кухня', 'Комод, тумба', 'Освещение', 'Декор', 'Другое'] },
  material: { key: 'material', label: 'Материал', type: 'select', options: ['Дерево', 'ДСП, МДФ', 'Металл', 'Ткань', 'Кожа', 'Стекло', 'Пластик'] },
  applType: { key: 'applType', label: 'Что продаёте', type: 'select', options: ['Холодильник', 'Стиральная машина', 'Посудомоечная машина', 'Плита, духовка', 'Микроволновка', 'Пылесос', 'Кондиционер', 'Мелкая техника', 'Другое'] },
  bikeType: { key: 'bikeType', label: 'Тип', type: 'select', options: ['Горный', 'Городской', 'Шоссейный', 'Гравийный', 'Детский', 'Электро', 'BMX', 'Складной'] },
  wheels: { key: 'wheels', label: 'Колёса', type: 'select', options: ['до 20″', '24″', '26″', '27,5″', '28–29″'] },
  bikeFrame: { key: 'frame', label: 'Размер рамы', type: 'select', options: ['XS', 'S', 'M', 'L', 'XL'] },
  sportType: { key: 'sportType', label: 'Что продаёте', type: 'select', options: ['Фитнес и тренажёры', 'Зимний спорт', 'Туризм', 'Самокаты', 'Ролики и скейты', 'Единоборства', 'Игры с мячом', 'Другое'] },
  ticketType: { key: 'ticketType', label: 'Что продаёте', type: 'select', options: ['Концерт', 'Театр', 'Спорт', 'Путешествие', 'Другое'] },
  bookType: { key: 'bookType', label: 'Что продаёте', type: 'select', options: ['Художественная', 'Детская', 'Учебная', 'Деловая', 'Журналы', 'Комиксы'] },
  instrument: { key: 'instrument', label: 'Инструмент', type: 'select', options: ['Гитара', 'Клавишные', 'Ударные', 'Духовые', 'Струнные', 'Оборудование'] },
  dogBreed: { key: 'breed', label: 'Порода', type: 'select', popular: ['Метис', 'Йоркширский терьер', 'Шпиц', 'Лабрадор', 'Немецкая овчарка', 'Чихуахуа', 'Хаски', 'Корги'], options: ['Метис', 'Йоркширский терьер', 'Шпиц', 'Лабрадор', 'Немецкая овчарка', 'Чихуахуа', 'Хаски', 'Корги', 'Той-терьер', 'Мопс', 'Французский бульдог', 'Английский бульдог', 'Джек-рассел-терьер', 'Бигль', 'Такса', 'Пудель', 'Мальтипу', 'Ши-тцу', 'Мальтезе', 'Золотистый ретривер', 'Самоед', 'Акита-ину', 'Сиба-ину', 'Доберман', 'Ротвейлер', 'Кане-корсо', 'Алабай', 'Кавказская овчарка', 'Бордер-колли', 'Шнауцер', 'Другая'] },
  catBreed: { key: 'breed', label: 'Порода', type: 'select', popular: ['Беспородная', 'Британская', 'Шотландская', 'Мейн-кун', 'Сфинкс', 'Бенгальская', 'Сиамская', 'Персидская'], options: ['Беспородная', 'Британская', 'Шотландская', 'Мейн-кун', 'Сфинкс', 'Бенгальская', 'Сиамская', 'Персидская', 'Невская маскарадная', 'Сибирская', 'Рэгдолл', 'Абиссинская', 'Русская голубая', 'Ориентальная', 'Экзотическая', 'Другая'] },
  petAge: { key: 'petAge', label: 'Возраст', type: 'select', options: ['До 3 месяцев', '3–12 месяцев', '1–3 года', 'Старше 3 лет'] },
  petSex: { key: 'petSex', label: 'Пол', type: 'select', options: ['Мальчик', 'Девочка'] },
  petDocs: { key: 'petDocs', label: 'Документы', type: 'select', options: ['С родословной', 'Ветпаспорт', 'Без документов'] },
  petGoodsFor: { key: 'petFor', label: 'Для кого', type: 'select', options: ['Собаки', 'Кошки', 'Птицы', 'Рыбки', 'Грызуны', 'Другие'] },
  bizType: { key: 'bizType', label: 'Сфера', type: 'select', options: ['Общепит', 'Торговля', 'Услуги', 'Производство', 'Интернет-бизнес', 'Другое'] },
  equipType: { key: 'equipType', label: 'Для чего', type: 'select', options: ['Для магазина', 'Для общепита', 'Для салона красоты', 'Производственное', 'Офисное', 'Другое'] }
};
const SERVICE = { fields: [F.serviceWhere, F.proExp], summary: ['where'] };

const SUBCATS = {
  transport: [
    { id: 'cars', name: 'Автомобили', fields: [req(F.carBrand), req(F.year), req(F.mileage), req(F.gearbox), F.fuel, F.engine, F.power, F.body, F.drive, F.owners, F.color, F.steering, F.damage], summary: ['year', 'mileage', 'gearbox'] },
    { id: 'moto', name: 'Мотоциклы и мототехника', fields: [req(F.motoType), req(F.year), F.mileage, F.motoVolume, F.color], summary: ['motoType', 'year'] },
    { id: 'trucks', name: 'Грузовики и спецтехника', fields: [req(F.truckType), req(F.year), F.mileage], summary: ['truckType', 'year', 'mileage'] },
    { id: 'water', name: 'Водный транспорт', fields: [req(F.waterType), F.year], summary: ['waterType', 'year'] },
    { id: 'parts', name: 'Запчасти и аксессуары', fields: [req(F.partType)], summary: ['partType'] }
  ],
  realty: [
    { id: 'flats', name: 'Квартиры — продажа', fields: [req(F.rooms), req(F.area), req(F.floor), F.floors, F.house, F.market, F.built, F.renovation, F.bathroom, F.balcony], summary: ['rooms', 'area', 'floor'] },
    { id: 'flats_rent', name: 'Квартиры — аренда', fields: [req(F.rooms), req(F.area), F.floor, F.floors, F.renovation, F.furnished, F.pets, F.balcony], summary: ['rooms', 'area', 'floor'] },
    { id: 'daily', name: 'Посуточно', fields: [req(F.rooms), req(F.guests), F.pets], summary: ['rooms', 'guests'] },
    { id: 'rooms', name: 'Комнаты', fields: [req(F.area), F.floor, F.floors, F.renovation], summary: ['area', 'floor'] },
    { id: 'houses', name: 'Дома, дачи, коттеджи', fields: [req(F.houseType), req(F.area), F.land, F.floors, F.wall, F.built], summary: ['houseType', 'area', 'land'] },
    { id: 'land', name: 'Земельные участки', fields: [req(F.land), F.landUse], summary: ['land', 'landUse'] },
    { id: 'garages', name: 'Гаражи и машиноместа', fields: [req(F.garageType), F.area], summary: ['garageType', 'area'] },
    { id: 'commercial', name: 'Коммерческая недвижимость', fields: [req(F.commType), req(F.area)], summary: ['commType', 'area'] }
  ],
  jobs: [
    { id: 'vacancies', name: 'Вакансии', fields: [req(F.schedule), F.employment, F.experience], summary: ['schedule', 'experience'] },
    { id: 'resumes', name: 'Резюме', fields: [req(F.schedule), F.employment, F.experience], summary: ['schedule', 'experience'] }
  ],
  services: [
    { id: 'repair', name: 'Ремонт и строительство', ...SERVICE }, { id: 'beauty_s', name: 'Красота и здоровье', ...SERVICE }, { id: 'moving', name: 'Перевозки и грузчики', ...SERVICE },
    { id: 'it', name: 'IT, интернет, дизайн', ...SERVICE }, { id: 'education', name: 'Обучение и курсы', ...SERVICE }, { id: 'household', name: 'Бытовые услуги и уборка', ...SERVICE },
    { id: 'events', name: 'Праздники и мероприятия', ...SERVICE }, { id: 'auto_s', name: 'Авто-услуги', ...SERVICE }, { id: 'other_s', name: 'Другие услуги', ...SERVICE }
  ],
  electronics: [
    { id: 'phones', name: 'Телефоны', fields: [req(F.phoneBrand), req(F.memory), F.color, F.battery, F.warranty], summary: ['brand', 'memory'] },
    { id: 'laptops', name: 'Ноутбуки', fields: [req(F.laptopBrand), F.screen, F.cpu, F.ram, F.storage], summary: ['brand', 'screen', 'ram'] },
    { id: 'tablets', name: 'Планшеты и электронные книги', fields: [req(F.tabletBrand), F.memory, F.color], summary: ['brand', 'memory'] },
    { id: 'computers', name: 'Компьютеры и комплектующие', fields: [req(F.compType)], summary: ['compType'] },
    { id: 'audio', name: 'Аудио и видео', fields: [req(F.audioType)], summary: ['audioType'] },
    { id: 'games', name: 'Игры и приставки', fields: [req(F.gameType), F.platform], summary: ['gameType', 'platform'] },
    { id: 'photo', name: 'Фототехника', fields: [req(F.photoType)], summary: ['photoType'] },
    { id: 'office', name: 'Оргтехника и расходники' },
    { id: 'gadgets', name: 'Часы, гаджеты, аксессуары', fields: [req(F.gadgetType)], summary: ['gadgetType'] }
  ],
  personal: [
    { id: 'women', name: 'Женская одежда', fields: [req(F.size), F.womenType, F.clothBrand, F.color, F.season], summary: ['size', 'brand'] },
    { id: 'men', name: 'Мужская одежда', fields: [req(F.size), F.menType, F.clothBrand, F.color, F.season], summary: ['size', 'brand'] },
    { id: 'shoes', name: 'Обувь', fields: [req(F.shoeSize), F.shoeFor, F.clothBrand, F.color, F.season], summary: ['shoeSize', 'brand'] },
    { id: 'kids_wear', name: 'Детская одежда и обувь', fields: [req(F.kidsAge), F.kidsFor, F.season], summary: ['kidsAge'] },
    { id: 'kids', name: 'Товары для детей и игрушки', fields: [req(F.kidsGoods), F.kidsAge], summary: ['kidsGoods'] },
    { id: 'bags', name: 'Сумки и аксессуары', fields: [F.clothBrand, F.color], summary: ['brand'] },
    { id: 'jewelry', name: 'Часы и украшения' }, { id: 'beauty', name: 'Красота и уход' }
  ],
  home: [
    { id: 'furniture', name: 'Мебель и интерьер', fields: [req(F.furnType), F.material, F.color], summary: ['furnType'] },
    { id: 'appliances', name: 'Бытовая техника', fields: [req(F.applType)], summary: ['applType'] },
    { id: 'build', name: 'Ремонт и строительство' },
    { id: 'kitchen', name: 'Посуда и товары для кухни' }, { id: 'garden', name: 'Сад, дача, растения' }, { id: 'food', name: 'Продукты питания' }
  ],
  hobby: [
    { id: 'bikes', name: 'Велосипеды', fields: [req(F.bikeType), F.wheels, F.bikeFrame], summary: ['bikeType', 'wheels'] },
    { id: 'sport', name: 'Спорт и отдых', fields: [req(F.sportType)], summary: ['sportType'] },
    { id: 'tickets', name: 'Билеты и путешествия', fields: [req(F.ticketType)], summary: ['ticketType'] },
    { id: 'books', name: 'Книги и журналы', fields: [F.bookType], summary: ['bookType'] },
    { id: 'collect', name: 'Коллекционирование' },
    { id: 'music', name: 'Музыкальные инструменты', fields: [req(F.instrument)], summary: ['instrument'] },
    { id: 'hunting', name: 'Охота и рыбалка' }
  ],
  animals: [
    { id: 'dogs', name: 'Собаки', fields: [req(F.dogBreed), req(F.petAge), F.petSex, F.petDocs], summary: ['breed', 'petAge'] },
    { id: 'cats', name: 'Кошки', fields: [req(F.catBreed), req(F.petAge), F.petSex, F.petDocs], summary: ['breed', 'petAge'] },
    { id: 'birds', name: 'Птицы', fields: [F.petAge], summary: ['petAge'] },
    { id: 'aquarium', name: 'Аквариум' },
    { id: 'other_pets', name: 'Другие животные', fields: [F.petAge], summary: ['petAge'] },
    { id: 'pet_goods', name: 'Товары для животных', fields: [req(F.petGoodsFor)], summary: ['petFor'] }
  ],
  business: [
    { id: 'ready', name: 'Готовый бизнес', fields: [req(F.bizType)], summary: ['bizType'] },
    { id: 'equipment', name: 'Оборудование для бизнеса', fields: [req(F.equipType)], summary: ['equipType'] }
  ]
};

const SUB = {}; // id → { ...sub, category }
for (const [cat, list] of Object.entries(SUBCATS)) for (const s of list) SUB[s.id] = { fields: [], summary: [], ...s, category: cat };

// Проверить и почистить характеристики: только поля подкатегории, значения из списка, числа в пределах.
// Возвращает объект или бросает Error с понятным текстом.
// strict — форма объявления: обязательные (req) должны быть заполнены. Автозагрузка из фида — без strict.
function cleanAttrs(subId, raw, { strict = false } = {}) {
  const sub = SUB[subId];
  if (!sub) return {};
  if (!raw || typeof raw !== 'object') raw = {};
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
      if (!f.step) out[f.key] = Math.round(n);
    }
  }
  // Сначала — неверные значения (выше), потом — незаполненные главные поля.
  const miss = strict ? sub.fields.find((f) => f.req && out[f.key] === undefined) : null;
  if (miss) throw new Error(`Укажите «${miss.label}» — это главная характеристика раздела`);
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
  if (f.key === 'built') return `${v} г.`;
  if (f.key === 'owners') return v === '1' ? '1 владелец' : `${v} владельца`;
  if (f.key === 'screen') return `${num(v)}″`;
  if (f.key === 'wheels') return `колёса ${v}`;
  if (f.key === 'frame') return `рама ${v}`;
  if (f.type === 'number') return `${num(v)}${f.unit ? ` ${f.unit}` : ''}`;
  return String(v);
}
// Короткая строка для карточки: «2018 г., 85 000 км, Автомат».
function summaryOf(subId, attrs) {
  const sub = SUB[subId];
  if (!sub || !attrs) return '';
  return sub.summary.map((k) => { const f = sub.fields.find((x) => x.key === k); return f ? fmt(f, attrs[k]) : ''; }).filter(Boolean).join(', ');
}
// Для страницы объявления: [{ label, value }] — значение без повтора названия («Размер: S», а не «размер S»).
const plain = (f, v) => (f.type === 'number' ? `${num(v)}${f.unit ? (f.unit === '″' ? '″' : ` ${f.unit}`) : ''}` : f.key === 'rooms' && v === 'Студия' ? 'Студия' : String(v));
const describe = (subId, attrs) => (SUB[subId] ? SUB[subId].fields.filter((f) => attrs && attrs[f.key] !== undefined).map((f) => ({ label: f.label, value: plain(f, attrs[f.key]) })) : []);

// Для клиента: категории → подкатегории с полями.
const publicTaxonomy = () => Object.fromEntries(Object.entries(SUBCATS).map(([cat, list]) => [cat, list.map((s) => ({ id: s.id, name: s.name, summary: s.summary || [], fields: (s.fields || []).map(({ key, label, type, options, unit, min, max, step, req, popular, color }) => ({ key, label, type, options, unit, min, max, step, req: !!req, popular, color: !!color })) }))]));

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

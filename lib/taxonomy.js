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
  // 1.60.1: модель — только из списка моделей выбранной марки (решение 26 ноября: «Skoda» + «Бугатти» не пройдёт);
  // свободный текст — только у марки «Другая». Первые восемь — частые, их сайт показывает плашками.
  carModel: { key: 'model', label: 'Модель', type: 'text', max: 40, placeholder: 'Например: Camry', fixed: true, suggest: {
    Lada: ['Granta', 'Vesta', 'Niva Legend', 'Niva Travel', 'Largus', 'XRAY', 'Priora', 'Kalina', 'Iskra', '4x4 (Нива)', 'Samara', '2101', '2102', '2103', '2104', '2105', '2106', '2107', '2108', '2109', '21099', '2110', '2111', '2112', '2113', '2114', '2115', '2121', '2131'],
    Toyota: ['Camry', 'Corolla', 'RAV4', 'Land Cruiser Prado', 'Land Cruiser', 'Highlander', 'C-HR', 'Hilux', 'Fortuner', 'Auris', 'Avensis', 'Yaris', 'Prius', 'Venza', 'Alphard', 'Crown', 'Mark II', 'Vitz', 'Corolla Fielder', 'Corolla Axio', 'Harrier', 'Hiace', 'Rush', 'Sienna', 'Sequoia', 'Tundra', '4Runner', 'Chaser', 'Cresta', 'Ist', 'Premio', 'Allion', 'Noah', 'Voxy', 'Wish', 'Estima', 'Passo', 'Belta', 'bZ3', 'bZ4X', 'Frontlander', 'Raize', 'Aqua', 'Supra', 'GR86'],
    Kia: ['Rio', 'Sportage', 'Ceed', 'K5', 'Sorento', 'Seltos', 'Cerato', 'Optima', 'Soul', 'Picanto', 'Carnival', 'Mohave', 'Stinger', 'K8', 'K3', 'K9', 'Sonet', 'Carens', 'Venga', 'Spectra', 'Magentis', 'Quoris', 'Sorento Prime', 'ProCeed', 'Stonic', 'Niro', 'EV5', 'EV6', 'EV9', 'Pegas'],
    Hyundai: ['Solaris', 'Creta', 'Tucson', 'Santa Fe', 'Elantra', 'Sonata', 'i30', 'i40', 'ix35', 'ix55', 'Accent', 'Getz', 'Palisade', 'Staria', 'H-1', 'Grand Starex', 'Kona', 'Matrix', 'Genesis', 'Grandeur', 'Equus', 'Veloster', 'Venue', 'Bayon', 'Mufasa', 'Custo', 'Ioniq', 'Ioniq 5', 'Ioniq 6', 'Porter', 'Terracan', 'Trajet', 'Galloper'],
    Haval: ['Jolion', 'F7', 'F7x', 'H6', 'Dargo', 'M6', 'H9', 'H2', 'H5', 'H3', 'Dargo X', 'Raptor', 'Xiaolong Max'],
    Chery: ['Tiggo 4 Pro', 'Tiggo 7 Pro Max', 'Tiggo 8 Pro Max', 'Arrizo 8', 'Tiggo 4', 'Tiggo 7 Pro', 'Tiggo 7', 'Tiggo 8', 'Tiggo 8 Pro', 'Tiggo 9', 'Tiggo 2', 'Tiggo 3', 'Tiggo 5', 'Tiggo 3x', 'Tiggo 7 Pro Plug-in Hybrid', 'Arrizo 5', 'Arrizo 7', 'Very', 'Bonus', 'Bonus 3', 'Amulet', 'Fora', 'Kimo', 'IndiS', 'M11', 'QQ', 'CrossEastar'],
    Volkswagen: ['Polo', 'Tiguan', 'Passat', 'Jetta', 'Golf', 'Touareg', 'Teramont', 'Taos', 'Caddy', 'Transporter', 'Multivan', 'Caravelle', 'Passat CC', 'Amarok', 'Crafter', 'Touran', 'Sharan', 'Golf Plus', 'Scirocco', 'Beetle', 'Bora', 'Phaeton', 'Arteon', 'T-Roc', 'T-Cross', 'Tayron', 'Talagon', 'Lavida', 'Sagitar', 'Atlas', 'ID.3', 'ID.4', 'ID.6', 'LT', 'Vento'],
    Skoda: ['Octavia', 'Rapid', 'Kodiaq', 'Karoq', 'Superb', 'Fabia', 'Yeti', 'Kamiq', 'Scala', 'Roomster', 'Felicia', 'Enyaq', 'Kushaq', 'Slavia', 'Elroq', 'Citigo', 'Praktik'],
    Renault: ['Logan', 'Sandero', 'Duster', 'Kaptur', 'Arkana', 'Sandero Stepway', 'Megane', 'Fluence', 'Symbol', 'Clio', 'Koleos', 'Laguna', 'Scenic', 'Grand Scenic', 'Kangoo', 'Master', 'Dokker', 'Talisman', 'Espace', 'Trafic', 'Latitude', 'Twingo', 'Captur', 'Lodgy', 'Zoe', 'Safrane', '19'],
    Nissan: ['Qashqai', 'X-Trail', 'Almera', 'Juke', 'Terrano', 'Murano', 'Teana', 'Note', 'Tiida', 'Patrol', 'Pathfinder', 'Navara', 'Primera', 'Sentra', 'Micra', 'Leaf', 'Serena', 'Skyline', 'March', 'Wingroad', 'AD', 'Cube', 'Elgrand', 'Almera Classic', 'Maxima', 'Bluebird', 'Sunny', 'Cefiro', 'Laurel', 'Cedric', 'Presage', 'Liberty', 'Dualis', 'Rogue', 'Kicks', 'Ariya', 'Armada', 'Titan', 'GT-R', '350Z', '370Z', 'Fuga', 'Caravan', 'NV200', 'Qashqai+2', 'Lafesta', 'Avenir', 'Expert', 'Prairie', 'Stagea', 'Tino', 'Mistral'],
    'Mercedes-Benz': ['E-класс', 'C-класс', 'S-класс', 'GLE', 'GLC', 'G-класс', 'A-класс', 'B-класс', 'CLA', 'CLS', 'CLK', 'GLA', 'GLB', 'GLS', 'GL', 'ML', 'M-класс', 'GLK', 'V-класс', 'Vito', 'Viano', 'Sprinter', 'R-класс', 'SL', 'SLK', 'SLC', 'AMG GT', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'EQV', 'X-класс', 'Maybach S-класс', 'Maybach GLS', '190 (W201)', 'W123', 'W124'],
    BMW: ['3 серия', '5 серия', '7 серия', 'X3', 'X5', 'X6', '1 серия', '2 серия', '2 серия Active Tourer', '2 серия Gran Coupe', '3 серия Gran Turismo', '4 серия', '5 серия Gran Turismo', '6 серия', '8 серия', 'X1', 'X2', 'X4', 'X7', 'XM', 'Z3', 'Z4', 'i3', 'i4', 'i5', 'i7', 'iX', 'iX1', 'iX3', 'M2', 'M3', 'M4', 'M5', 'M8', 'X3 M', 'X5 M', 'X6 M'],
    Audi: ['A4', 'A6', 'A3', 'Q3', 'Q5', 'Q7', 'A1', 'A2', 'A4 allroad', 'A5', 'A6 allroad', 'A7', 'A8', 'Q2', 'Q3 Sportback', 'Q5 Sportback', 'Q8', 'TT', 'R8', '80', '90', '100', '200', 'V8', 'e-tron', 'e-tron GT', 'Q4 e-tron', 'Q8 e-tron', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'SQ5', 'SQ7', 'SQ8', 'RS3', 'RS4', 'RS5', 'RS6', 'RS7', 'RS Q3', 'RS Q8', 'Q6', 'A6L', 'Q5L'],
    Geely: ['Coolray', 'Monjaro', 'Atlas', 'Atlas Pro', 'Tugella', 'Emgrand', 'Emgrand X7', 'Emgrand EC7', 'Emgrand GT', 'Okavango', 'Preface', 'Cityray', 'Starray', 'Xingyue L', 'Boyue', 'Galaxy L7', 'Galaxy E5', 'EX5', 'MK', 'MK Cross', 'GC6', 'Otaka', 'Vision', 'Binyue'],
    Changan: ['CS35 Plus', 'CS55 Plus', 'CS75 Plus', 'UNI-K', 'UNI-V', 'Alsvin', 'UNI-S', 'UNI-T', 'CS35', 'CS55', 'CS75', 'CS85', 'CS95', 'Eado', 'Eado Plus', 'Lamore', 'Hunter Plus', 'Deepal S7', 'Deepal SL03', 'Q05', 'X5 Plus', 'Raeton', 'Raeton Plus', 'Oshan X5', 'Oshan X7', 'Benni', 'Raeton CC'],
    Mitsubishi: ['Outlander', 'Lancer', 'ASX', 'Pajero Sport', 'Pajero', 'L200', 'Galant', 'Colt', 'Eclipse Cross', 'Carisma', 'Space Star', 'Space Wagon', 'Space Runner', 'Delica', 'Delica D:5', 'Pajero Pinin', 'Pajero iO', 'Pajero Mini', 'Grandis', 'Montero', 'Montero Sport', 'Airtrek', 'Chariot', 'Diamante', 'Dion', 'RVR', 'Lancer Evolution', 'i-MiEV', 'Xpander', 'Mirage', 'Sigma', 'Challenger'],
    Mazda: ['CX-5', '6', '3', 'CX-30', 'CX-9', 'CX-7', 'CX-3', 'CX-4', 'CX-50', 'CX-60', 'CX-90', '2', '5', '323', '626', 'Xedos 6', 'Xedos 9', 'MPV', 'Tribute', 'BT-50', 'MX-5', 'RX-8', 'Demio', 'Axela', 'Atenza', 'Premacy', 'Bongo', 'Familia', 'Capella', 'Millenia', 'Verisa', 'Biante', 'Bongo Friendee', 'EZ-6'],
    Ford: ['Focus', 'Mondeo', 'Kuga', 'Explorer', 'Fiesta', 'EcoSport', 'Fusion', 'C-Max', 'S-Max', 'Galaxy', 'Transit', 'Transit Connect', 'Tourneo', 'Tourneo Connect', 'Tourneo Custom', 'Ranger', 'Maverick', 'Escape', 'Mustang', 'F-150', 'Edge', 'Expedition', 'Bronco', 'Territory', 'Puma', 'Ka', 'Scorpio', 'Sierra', 'Escort', 'Taurus', 'Freestyle', 'Flex'],
    Chevrolet: ['Niva', 'Cruze', 'Aveo', 'Lacetti', 'Cobalt', 'Captiva', 'Spark', 'Lanos', 'Orlando', 'Tahoe', 'Trailblazer', 'Epica', 'Malibu', 'Camaro', 'Corvette', 'Tracker', 'Rezzo', 'Monza', 'Equinox', 'Traverse', 'Suburban', 'Silverado', 'Evanda', 'Viva', 'Nexia', 'Damas', 'Labo', 'Onix', 'Volt', 'Bolt', 'Blazer'],
    Honda: ['CR-V', 'Civic', 'Accord', 'Fit', 'HR-V', 'Pilot', 'Jazz', 'Stepwgn', 'Freed', 'Vezel', 'Odyssey', 'Shuttle', 'Insight', 'Stream', 'Elysion', 'Legend', 'Crossroad', 'Element', 'Inspire', 'Torneo', 'Orthia', 'Partner', 'Avancier', 'Mobilio', 'Airwave', 'Edix', 'N-Box', 'N-WGN', 'S660', 'CR-Z', 'Prelude', 'Integra', 'Logo', 'Capa', 'e:NS1', 'ZR-V', 'Breeze', 'Crider', 'Envix'],
    Lexus: ['RX', 'NX', 'ES', 'LX', 'GX', 'IS', 'GS', 'LS', 'UX', 'LM', 'RC', 'RZ', 'CT', 'LC', 'TX', 'SC', 'HS', 'LBX'],
    Subaru: ['Forester', 'Outback', 'Impreza', 'XV', 'Legacy', 'Tribeca', 'WRX', 'WRX STI', 'Levorg', 'Ascent', 'BRZ', 'Exiga', 'Crosstrek', 'Solterra', 'Justy', 'Trezia', 'Stella', 'Pleo', 'R2', 'Traviq', 'Baja', 'Leone'],
    Volvo: ['XC90', 'XC60', 'XC40', 'S60', 'S80', 'S90', 'V40', 'V40 Cross Country', 'V60', 'V60 Cross Country', 'V70', 'V90', 'V90 Cross Country', 'XC70', 'C30', 'C40', 'C70', 'S40', 'V50', '850', '940', '960', 'EX30', 'EX90', 'EM90', 'XC40 Recharge'],
    'Land Rover': ['Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Range Rover Velar', 'Discovery', 'Discovery Sport', 'Defender', 'Freelander'],
    Porsche: ['Cayenne', 'Macan', 'Panamera', '911', 'Taycan', 'Boxster', 'Cayman', '718 Boxster', '718 Cayman', 'Cayenne Coupe', 'Carrera GT', '928', '944'],
    Suzuki: ['Vitara', 'Grand Vitara', 'SX4', 'Jimny', 'Swift', 'Splash', 'Liana', 'Ignis', 'Escudo', 'Kizashi', 'Alto', 'Wagon R', 'Solio', 'Hustler', 'XL7', 'Baleno', 'Celerio', 'Ertiga', 'S-Cross', 'Every', 'Spacia', 'Cultus', 'Aerio', 'Samurai', 'Sidekick', 'Jimny Sierra', 'Lapin'],
    Peugeot: ['308', '408', '3008', '2008', '207', '206', '307', '407', '508', '5008', '107', '108', '208', '301', '4007', '4008', '607', '806', '807', '1007', 'Partner', 'Boxer', 'Expert', 'Traveller', 'Rifter', 'RCZ', '605', '405', '406', '306', '309', '205'],
    Citroen: ['C4', 'C5', 'C3', 'Berlingo', 'C4 Picasso', 'C4 Grand Picasso', 'C-Elysee', 'C5 Aircross', 'C3 Aircross', 'C4 Aircross', 'C3 Picasso', 'C-Crosser', 'C4 Cactus', 'C6', 'C8', 'Jumper', 'Jumpy', 'SpaceTourer', 'Xsara', 'Xsara Picasso', 'Xantia', 'Saxo', 'C1', 'C2', 'DS3', 'DS4', 'DS5', 'C5 X', 'Basalt', 'Nemo', 'Evasion', 'ZX', 'AX', 'BX', 'XM', 'C3 Pluriel'],
    Opel: ['Astra', 'Corsa', 'Insignia', 'Zafira', 'Antara', 'Mokka', 'Vectra', 'Meriva', 'Omega', 'Frontera', 'Combo', 'Vivaro', 'Movano', 'Crossland', 'Crossland X', 'Grandland', 'Grandland X', 'Zafira Life', 'Agila', 'Tigra', 'Signum', 'Calibra', 'Kadett', 'Ascona', 'Senator', 'Monterey', 'Sintra', 'Ampera', 'Adam', 'Cascada', 'Karl'],
    Daewoo: ['Nexia', 'Matiz', 'Gentra', 'Lanos', 'Espero', 'Nubira', 'Leganza', 'Winstorm', 'Tico', 'Damas', 'Labo', 'Magnus', 'Tacuma', 'Kalos', 'Lacetti', 'Sens', 'Prince', 'Racer', 'Arcadia', 'Rezzo'],
    'УАЗ': ['Патриот', 'Хантер', 'Профи', '452', 'Пикап', 'Карго', '469', '3151', '3153', '3159', '3160', '3162', '3303', '3741', '3909', '2206', '2360', 'Симбир'],
    'ГАЗ': ['Газель Next', 'Газель Бизнес', 'Газель', 'Газель NN', 'Соболь', 'Соболь NN', 'Соболь Бизнес', 'Волга Siber', '31105 «Волга»', '3110 «Волга»', '3102 «Волга»', '24 «Волга»', '21 «Волга»', '2217 «Баргузин»', '2752', '3302', '3221', '2705', '2310', 'ГАЗон Next', 'Валдай', 'Садко', 'Садко Next', '3307', '3309', '66', '69', 'М-20 «Победа»', '13 «Чайка»'],
    Exeed: ['LX', 'TXL', 'VX', 'RX', 'Exlantix ES', 'Exlantix ET', 'Yaoguang', 'Sterra ES', 'Sterra ET'],
    Omoda: ['C5', 'S5', 'C7', 'S5 GT', 'E5'],
    Tank: ['300', '400', '500', '700'],
    Jetour: ['Dashing', 'X70 Plus', 'X90 Plus', 'X50', 'X70', 'X70 Pro', 'X90', 'X90 Pro', 'T1', 'T2', 'Traveller', 'Shanhai L7', 'Shanhai L9', 'Shanhai T2'],
    'Li Auto': ['L6', 'L7', 'L8', 'L9', 'MEGA', 'One', 'i6', 'i8'],
    Zeekr: ['001', '7X', '009', '007', 'X', 'Mix', '7GT', '9X'],
    Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck', 'Roadster']
  } },
  motoModel: { key: 'model', label: 'Марка и модель', type: 'text', max: 40, placeholder: 'Например: Honda CB400' },
  phoneModel: { key: 'model', label: 'Модель', type: 'text', max: 40, placeholder: 'Например: iPhone 15', suggest: {
    Apple: ['iPhone 17 Pro', 'iPhone 17', 'iPhone 16 Pro', 'iPhone 16', 'iPhone 15', 'iPhone 14', 'iPhone 13', 'iPhone 11'],
    Samsung: ['Galaxy S25', 'Galaxy S24', 'Galaxy S23', 'Galaxy A55', 'Galaxy A35', 'Galaxy A15'],
    Xiaomi: ['Redmi Note 14', 'Redmi Note 13', 'Xiaomi 14', 'Redmi 13']
  } },
  year: { key: 'year', label: 'Год выпуска', type: 'number', min: 1950, max: Y + 1 },
  mileage: { key: 'mileage', label: 'Пробег', type: 'number', unit: 'км', min: 0, max: 2000000 },
  gearbox: { key: 'gearbox', label: 'Коробка', type: 'select', options: ['Механика', 'Автомат', 'Робот', 'Вариатор'] },
  fuel: { key: 'fuel', label: 'Двигатель', type: 'select', options: ['Бензин', 'Дизель', 'Гибрид', 'Электро', 'Газ'] },
  engine: { key: 'engine', label: 'Объём двигателя', type: 'number', unit: 'л', min: 0.1, max: 10, step: 0.1 },
  power: { key: 'power', label: 'Мощность', type: 'number', unit: 'л. с.', min: 1, max: 2000 },
  body: { key: 'body', label: 'Кузов', type: 'select', options: ['Седан', 'Хэтчбек', 'Универсал', 'Внедорожник', 'Кроссовер', 'Лифтбек', 'Купе', 'Минивэн', 'Пикап', 'Фургон'] },
  drive: { key: 'drive', label: 'Привод', type: 'select', options: ['Передний', 'Задний', 'Полный'] },
  // 1.47.3: в объявлении — счётчик от 0 (новая машина, владельцев нет) до 30; в фильтре — «Без владельцев», «1», «2», «3», «4+» (от 4).
  // «4+» в старых объявлениях остаётся.
  owners: { key: 'owners', label: 'Владельцев по ПТС', type: 'select', options: ['1', '2', '3'], custom: { min: 0, max: 30 }, legacy: ['4+'] },
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
    { id: 'cars', name: 'Автомобили', fields: [req(F.carBrand), req(F.carModel), req(F.year), req(F.mileage), req(F.gearbox), F.fuel, F.engine, F.power, F.body, F.drive, F.owners, F.color, F.steering, F.damage], card: ['engine', 'mileage', 'body'], summary: ['year', 'mileage', 'gearbox'] },
    { id: 'moto', name: 'Мотоциклы и мототехника', fields: [req(F.motoType), req(F.motoModel), req(F.year), F.mileage, F.motoVolume, F.color], card: ['mileage', 'volume', 'color'], summary: ['motoType', 'year'] },
    { id: 'trucks', name: 'Грузовики и спецтехника', fields: [req(F.truckType), req(F.year), F.mileage], summary: ['truckType', 'year', 'mileage'] },
    { id: 'water', name: 'Водный транспорт', fields: [req(F.waterType), F.year], summary: ['waterType', 'year'] },
    { id: 'parts', name: 'Запчасти и аксессуары', fields: [req(F.partType)], summary: ['partType'] }
  ],
  realty: [
    { id: 'flats', name: 'Квартиры — продажа', fields: [req(F.rooms), req(F.area), req(F.floor), F.floors, F.house, F.market, F.built, F.renovation, F.bathroom, F.balcony], card: ['floor', 'market', 'renovation'], summary: ['rooms', 'area', 'floor'] },
    { id: 'flats_rent', name: 'Квартиры — аренда', fields: [req(F.rooms), req(F.area), F.floor, F.floors, F.renovation, F.furnished, F.pets, F.balcony], card: ['floor', 'renovation', 'furnished'], summary: ['rooms', 'area', 'floor'] },
    { id: 'daily', name: 'Посуточно', fields: [req(F.rooms), req(F.guests), F.pets], card: ['pets'], summary: ['rooms', 'guests'] },
    { id: 'rooms', name: 'Комнаты', fields: [req(F.area), F.floor, F.floors, F.renovation], card: ['floor', 'renovation'], summary: ['area', 'floor'] },
    { id: 'houses', name: 'Дома, дачи, коттеджи', fields: [req(F.houseType), req(F.area), F.land, F.floors, F.wall, F.built], card: ['floors', 'wall', 'built'], summary: ['houseType', 'area', 'land'] },
    { id: 'land', name: 'Земельные участки', fields: [req(F.land), F.landUse], card: [], summary: ['land', 'landUse'] },
    { id: 'garages', name: 'Гаражи и машиноместа', fields: [req(F.garageType), F.area], card: [], summary: ['garageType', 'area'] },
    { id: 'commercial', name: 'Коммерческая недвижимость', fields: [req(F.commType), req(F.area)], card: [], summary: ['commType', 'area'] }
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
    { id: 'phones', name: 'Телефоны', fields: [req(F.phoneBrand), req(F.phoneModel), req(F.memory), F.color, F.battery, F.warranty], card: ['color', 'battery'], summary: ['brand', 'memory'] },
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

// <auto-title> 1.48.0: название из характеристик — свой стиль Торганы: короткие части через «·», полными словами
// (вариант B владельца): «Toyota Camry · 2018 · автомат», «Квартира · 2 комнаты · 54,5 м²». Тот же код — в public/assets/js/rules.js (тест сверяет).
const TITLE_SUBS = new Set(['cars', 'moto', 'phones', 'flats', 'flats_rent', 'daily', 'rooms', 'houses', 'land', 'garages', 'commercial']);
function autoTitle(sub, a) {
  if (!TITLE_SUBS.has(sub) || !a) return '';
  const n = (v) => (Math.abs(Number(v)) >= 10000 ? new Intl.NumberFormat('ru-RU').format(v) : String(v).replace('.', ','));
  const has = (k) => a[k] !== undefined && a[k] !== null && a[k] !== '';
  const dot = (...xs) => xs.filter(Boolean).join('\u00a0· '); // точка не переносится в начало строки
  const pl = (v, one, few, many) => { const x = Number(v); if (!Number.isInteger(x)) return few; const d = x % 10; const h = x % 100; return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many; };
  const rooms = () => (a.rooms === 'Студия' ? '' : a.rooms === '5+' ? '5\u00a0и больше комнат' : `${a.rooms}\u00a0${pl(a.rooms, 'комната', 'комнаты', 'комнат')}`);
  const flat = () => (a.rooms === 'Студия' ? 'Квартира-студия' : 'Квартира');
  const named = (brand, model, skip) => {
    if (!model) return '';
    const m = String(model);
    if (!brand || skip || m.toLowerCase().startsWith(String(brand).toLowerCase())) return m;
    return `${brand} ${m}`;
  };
  if (sub === 'cars') {
    if (!has('brand') || !has('model') || !has('year')) return '';
    return dot(named(a.brand, a.model, a.brand === 'Другая'), String(a.year), has('gearbox') ? String(a.gearbox).toLowerCase() : '');
  }
  if (sub === 'moto') {
    if (!has('motoType') || !has('model') || !has('year')) return '';
    return dot([a.motoType === 'Мотоцикл' ? '' : a.motoType, a.model].filter(Boolean).join(' '), String(a.year));
  }
  if (sub === 'phones') {
    if (!has('brand') || !has('model') || !has('memory')) return '';
    return dot(named(a.brand, a.model, a.brand === 'Другой' || (a.brand === 'Apple' && /^iphone/i.test(a.model))), a.memory);
  }
  if (sub === 'flats' || sub === 'flats_rent') return has('rooms') && has('area') ? dot(flat(), rooms(), `${n(a.area)}\u00a0м²`) : '';
  if (sub === 'daily') return has('rooms') && has('guests') ? dot(flat(), rooms(), `до ${a.guests}\u00a0${pl(a.guests, 'гостя', 'гостей', 'гостей')}`) : '';
  if (sub === 'rooms') return has('area') ? dot('Комната', `${n(a.area)}\u00a0м²`) : '';
  if (sub === 'houses') return has('houseType') && has('area') ? dot(a.houseType, `${n(a.area)}\u00a0м²`, Number(a.land) > 0 ? `${n(a.land)}\u00a0${pl(a.land, 'сотка', 'сотки', 'соток')}` : '') : '';
  if (sub === 'land') {
    if (!has('land')) return '';
    const use = { ИЖС: 'ИЖС', 'СНТ, ДНП': 'СНТ, ДНП', Сельхозназначение: 'сельхозназначение', Промназначение: 'промназначение' }[a.landUse];
    return dot('Участок', `${n(a.land)}\u00a0${pl(a.land, 'сотка', 'сотки', 'соток')}`, use || '');
  }
  if (sub === 'garages') return has('garageType') ? dot(a.garageType, has('area') ? `${n(a.area)}\u00a0м²` : '') : '';
  if (sub === 'commercial') {
    if (!has('commType') || !has('area')) return '';
    const t = { Торговое: 'Торговое помещение', Производство: 'Производственное помещение', Общепит: 'Помещение под общепит', 'Свободное назначение': 'Помещение свободного назначения' }[a.commType] || a.commType;
    return dot(t, `${n(a.area)}\u00a0м²`);
  }
  return '';
}
// </auto-title>

// 1.48.0: модель из старого названия — для объявлений, размещённых до поля «Модель», и для фида.
// Сначала — частые модели марки, которые есть в названии словом («Kia Rio, 2015» → Rio), потом — слова сразу
// после марки до года, объёма, коробки или числа («Samsung Galaxy S23 Ultra 256 ГБ» → Galaxy S23 Ultra).
// Не нашли уверенно — '' (название остаётся прежним до правки).
const MODEL_STOP = /^((19|20)\d\d|\d+[.,]\d|\d+(гб|gb|тб|tb|л|км|л\.с\.?)?|года?|г|в|на|с|и|без|под|для|продам|продаю|продаётся|продается|срочно|торг|обмен|автомат|механика|робот|вариатор|акпп|мкпп|at|mt|amt|cvt|гб|gb|тб|tb|новый|новая|новое|б\/у|бу|отличн\S*|идеальн\S*|хорош\S*|состояни\S*|цвет\S*|черн\S*|чёрн\S*|бел\S*|сер\S*|красн\S*|син\S*|голуб\S*|зелён\S*|зелен\S*)$/i;
function guessModel(sub, a, title) {
  if (!['cars', 'moto', 'phones'].includes(sub) || !title || !a || a.model) return '';
  const f = (SUB[sub] || { fields: [] }).fields.find((x) => x.key === 'model');
  const words = String(title).replace(/[«»"“”(),.;:!?/|+]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const low = ` ${words.join(' ').toLowerCase()} `;
  const list = (f && f.suggest && a.brand && f.suggest[a.brand]) || [];
  const hit = list.filter((m) => low.includes(` ${m.toLowerCase()} `)).sort((x, y) => y.length - x.length)[0] || '';
  // Слова подряд до стоп-слова; short — пропускать короткие числа («iPhone 12 Pro»).
  const take = (from, max, short = false, ws = words) => { const out = []; for (const w of ws.slice(from)) { if (out.length >= max || (MODEL_STOP.test(w) && !(short && /^\d{1,2}$/.test(w)))) break; if (!/[A-Za-zА-Яа-яЁё0-9]/.test(w) || w.length > 20) break; out.push(w); } return out.join(' '); };
  if (sub === 'moto') {
    const i = words.findIndex((w) => /[A-Za-z]/.test(w));
    if (i < 0) return '';
    const m = take(i, 3);
    return /[A-Za-z]/.test(m) && m.split(' ').length >= 2 ? m : ''; // «Honda CB400» — марка и модель
  }
  // iPhone — по слову «iPhone» («iPhone 12 Pro Max 256» → iPhone 12 Pro Max).
  if (sub === 'phones' && a.brand === 'Apple') {
    const k = words.findIndex((w) => /^iphone$/i.test(w));
    const m = k >= 0 ? take(k, 4, true).replace(/^iphone/i, 'iPhone') : '';
    return m.length > hit.length ? m : hit;
  }
  if (!a.brand || /^Друг/.test(a.brand)) return hit;
  // Марка в названии (в том числе «Mercedes Benz», «Land Rover») — берём слова после неё.
  const esc = String(a.brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]?');
  const mt = words.join(' ').match(new RegExp(`(?:^|\\s)${esc}(?=\\s|$)`, 'i'));
  if (!mt) return hit;
  const rest = words.join(' ').slice(mt.index + mt[0].length).trim().split(' ').filter(Boolean);
  const m = take(0, sub === 'phones' ? 3 : 2, sub === 'phones', rest);
  if (!m || !/[A-Za-z0-9]/.test(m)) return hit;
  // Частая модель и слова после марки: берём длиннее, если они согласны («Galaxy S23» → «Galaxy S23 Ultra»).
  return !hit || m.toLowerCase().startsWith(hit.toLowerCase()) ? m : hit;
}

// 1.48.0: новое название для объявления, размещённого раньше: модель — из старого названия, если её нет.
// null — название собрать не из чего (нет главных характеристик или модель не угадать) — оставляем прежнее.
function retitle(sub, attrs, title) {
  if (!TITLE_SUBS.has(sub)) return null;
  const a = { ...(attrs || {}) };
  if (['cars', 'moto', 'phones'].includes(sub) && !a.model) { const g = guessModel(sub, a, title); if (!g) return null; a.model = g.slice(0, 40); }
  const t = autoTitle(sub, a).slice(0, 80);
  return t ? { title: t, attrs: a } : null;
}

const SUB = {}; // id → { ...sub, category }
for (const [cat, list] of Object.entries(SUBCATS)) for (const s of list) SUB[s.id] = { fields: [], summary: [], ...s, category: cat };

// Проверить и почистить характеристики: только поля подкатегории, значения из списка, числа в пределах.
// Возвращает объект или бросает Error с понятным текстом.
// strict — форма объявления: обязательные (req) должны быть заполнены; без strict — фильтры поиска и тесты.
function cleanAttrs(subId, raw, { strict = false } = {}) {
  const sub = SUB[subId];
  if (!sub) return {};
  if (!raw || typeof raw !== 'object') raw = {};
  const out = {};
  for (const f of sub.fields) {
    const v = raw[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'text') {
      // Свободный текст (модель): без ссылок и разметки, лишние пробелы убираем, первая буква — заглавная.
      let t = String(v).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, f.max || 40).trim();
      if (!t) continue;
      if (/https?:|www\.|@|\.(ru|com|рф|net|org)\b/i.test(t)) throw new Error(`«${f.label}»: без ссылок и адресов`);
      if (t === t.toLowerCase() && /^[a-zа-яё]/.test(t)) t = t[0].toUpperCase() + t.slice(1); // «camry» → «Camry», «iPhone» — как есть
      // 1.60.1: модель машины — только из списка марки («octavia», «Октавия» не угадываем — только написание из списка);
      // у марки «Другая» или вне списка марок — свой текст. В фильтрах неверную просто пропускаем.
      const list = f.fixed && f.suggest ? f.suggest[out.brand] : null;
      if (list) {
        const key = (x) => String(x).toLowerCase().replace(/[\s-]+/g, '');
        const hit = list.find((m) => key(m) === key(t));
        if (!hit) { if (strict) throw new Error(`«${f.label}»: выберите из списка моделей ${out.brand}`); continue; }
        t = hit;
      }
      out[f.key] = t;
      continue;
    }
    if (f.type === 'select') {
      if (f.options.includes(String(v)) || (f.legacy && f.legacy.includes(String(v)))) { out[f.key] = String(v); continue; }
      const n = f.custom ? Number(String(v).trim()) : NaN;
      if (Number.isInteger(n) && n >= f.custom.min && n <= f.custom.max) { out[f.key] = String(n); continue; }
      throw new Error(f.custom ? `«${f.label}»: от ${f.custom.min} до ${f.custom.max}` : `Проверьте поле «${f.label}»`);
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
// Слова для строки в карточке: «Седан, бензин, передний привод» (то же — в public/assets/js/rules.js).
const CARD_WORDS = {
  fuel: { Бензин: 'бензин', Дизель: 'дизель', Гибрид: 'гибрид', Электро: 'электро', Газ: 'газ' },
  drive: { Передний: 'передний привод', Задний: 'задний привод', Полный: 'полный привод' },
  body: { Седан: 'седан', Хэтчбек: 'хэтчбек', Универсал: 'универсал', Внедорожник: 'внедорожник', Кроссовер: 'кроссовер', Лифтбек: 'лифтбек', Купе: 'купе', Минивэн: 'минивэн', Пикап: 'пикап', Фургон: 'фургон' },
  market: { Вторичка: 'вторичка', Новостройка: 'новостройка' },
  renovation: { 'Без ремонта': 'без ремонта', Косметический: 'косметический ремонт', Евро: 'евроремонт', Дизайнерский: 'дизайнерский ремонт' },
  house: { Панельный: 'панельный дом', Кирпичный: 'кирпичный дом', Монолитный: 'монолитный дом', Блочный: 'блочный дом', Деревянный: 'деревянный дом' },
  furnished: { Есть: 'с мебелью', Частично: 'частично с мебелью', Нет: 'без мебели' },
  pets: { Да: 'можно с животными', Нет: 'без животных' },
  wall: { Кирпич: 'кирпич', 'Брус, бревно': 'брус или бревно', Газоблок: 'газоблок', Каркас: 'каркас', Монолит: 'монолит', Другой: '' },
  battery: { 'Больше 90%': 'аккумулятор больше 90%', '80–90%': 'аккумулятор 80–90%', 'Меньше 80%': 'аккумулятор меньше 80%' },
  color: null
};
// «до 1 гостя», «до 21 гостя», «до 4 гостей».
const guestsText = (v) => `до ${v} ${Number(v) % 10 === 1 && Number(v) % 100 !== 11 ? 'гостя' : 'гостей'}`;
// «1 владелец», «2 владельца», «5 владельцев», «21 владелец»; старое «4+» — «4 и более владельцев».
function ownersText(v) {
  if (String(v) === '4+') return '4 и более владельцев';
  if (String(v) === '0') return 'нет владельцев, новая';
  const n = Number(v); const a = n % 10; const b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? 'владелец' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'владельца' : 'владельцев'}`;
}
// По правилам набора четырёхзначные числа без пробела: 2015, 5000; дальше — 85 000.
const num = (v) => (Math.abs(Number(v)) >= 10000 ? NF.format(v) : String(v).replace('.', ','));
// Значение для показа: «85 000 км», «2-комн.», «5 этаж».
function fmt(f, v) {
  if (v === undefined || v === null || v === '') return '';
  if (f.key === 'rooms') return v === 'Студия' ? 'студия' : `${v}-комн.`;
  if (f.key === 'floor') return `${v} этаж`;
  if (f.key === 'guests') return guestsText(v);
  if (f.key === 'shoeSize') return `${v} размер`;
  if (f.key === 'size') return `размер ${v}`;
  if (f.key === 'year') return `${v} г.`;
  if (f.key === 'built') return `${v} г.`;
  if (f.key === 'owners') return ownersText(v);
  if (CARD_WORDS[f.key] && v in CARD_WORDS[f.key]) return CARD_WORDS[f.key][v];
  if (f.key === 'floors') return `${v} ${Number(v) % 10 === 1 && Number(v) % 100 !== 11 ? 'этаж' : [2, 3, 4].includes(Number(v) % 10) && ![12, 13, 14].includes(Number(v) % 100) ? 'этажа' : 'этажей'}`;
  if (f.key === 'screen') return `${num(v)}″`;
  if (f.key === 'wheels') return `колёса ${v}`;
  if (f.key === 'frame') return `рама ${v}`;
  if (f.type === 'number') return `${num(v)}${f.unit ? ` ${f.unit}` : ''}`;
  return String(v);
}
// Короткая строка для карточки: «2018 г., 85 000 км, Автомат».
// 1.48.0: у разделов с названием из характеристик в карточке — то, чего нет в названии (card).
function summaryOf(subId, attrs) {
  const sub = SUB[subId];
  if (!sub || !attrs) return '';
  // «5 этаж из 9» — этаж вместе с этажностью дома.
  const line = (sub.card || sub.summary).map((k) => { const f = sub.fields.find((x) => x.key === k); if (!f) return ''; if (sub.card && k === 'floor' && attrs.floor !== undefined && attrs.floors !== undefined) return `${attrs.floor} этаж из ${attrs.floors}`; return fmt(f, attrs[k]); }).filter(Boolean).join(', ');
  return line ? line[0].toUpperCase() + line.slice(1) : '';
}
// Для страницы объявления: [{ label, value }] — значение без повтора названия («Размер: S», а не «размер S»).
const plain = (f, v) => (f.key === 'owners' && String(v) === '0' ? 'Нет, новая машина' : f.type === 'number' ? `${num(v)}${f.unit ? (f.unit === '″' ? '″' : ` ${f.unit}`) : ''}` : f.key === 'rooms' && v === 'Студия' ? 'Студия' : String(v));
const describe = (subId, attrs) => (SUB[subId] ? SUB[subId].fields.filter((f) => attrs && attrs[f.key] !== undefined).map((f) => ({ key: f.key, label: f.label, value: plain(f, attrs[f.key]) })) : []);

// Для клиента: категории → подкатегории с полями.
const publicTaxonomy = () => Object.fromEntries(Object.entries(SUBCATS).map(([cat, list]) => [cat, list.map((s) => ({ id: s.id, name: s.name, summary: s.summary || [], card: s.card || null, auto: !!TITLE_SUBS.has(s.id), fields: (s.fields || []).map(({ key, label, type, options, unit, min, max, step, req, popular, color, custom, placeholder, suggest, fixed }) => ({ key, label, type, options, unit, min, max, step, req: !!req, popular, color: !!color, custom, placeholder, suggest, fixed: !!fixed })) }))]));

// VIN — 17 знаков без I, O, Q; номер кузова (праворульные из Японии) — 6–17 латинских букв, цифр и дефисов, есть цифры.
// Набрали в русской раскладке — меняем похожие буквы на латинские; в 17-значном VIN нет O, Q и I — это 0 и 1.
// То же правило — в public/assets/js/rules.js (тест сверяет).
const VIN_LAT = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };
const vinNorm = (v) => { let t = String(v || '').toUpperCase().replace(/\s/g, '').replace(/[АВЕКМНОРСТХУ]/g, (c) => VIN_LAT[c]); if (t.length === 17) t = t.replace(/O|Q/g, '0').replace(/I/g, '1'); return t; };
const vinOk = (v) => (v.length === 17 ? /^[A-HJ-NPR-Z0-9]{17}$/.test(v) : /^[A-Z0-9-]{6,17}$/.test(v) && /\d{4}/.test(v));

module.exports = { SUBCATS, SUB, cleanAttrs, summaryOf, describe, publicTaxonomy, fmt, num, autoTitle, TITLE_SUBS, CARD_WORDS, guessModel, retitle, vinNorm, vinOk };

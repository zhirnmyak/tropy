/**
 * Справочники проекта «Тропы без барьеров».
 * Общий модуль (UMD): подключается в браузере как обычный <script>
 * и через require() на сервере — единые словари для интерфейса, API и валидации.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.TROPY = root.TROPY || {}; root.TROPY.dict = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Федеральные округа РФ */
  var DISTRICTS = [
    { code: 'cfo', name: 'Центральный' },
    { code: 'szfo', name: 'Северо-Западный' },
    { code: 'yufo', name: 'Южный' },
    { code: 'skfo', name: 'Северо-Кавказский' },
    { code: 'pfo', name: 'Приволжский' },
    { code: 'ufo', name: 'Уральский' },
    { code: 'sfo', name: 'Сибирский' },
    { code: 'dfo', name: 'Дальневосточный' }
  ];

  /** Субъекты РФ, в которых есть маршруты каталога */
  var REGIONS = [
    { code: 'kaliningrad', name: 'Калининградская область', district: 'szfo' },
    { code: 'karelia', name: 'Республика Карелия', district: 'szfo' },
    { code: 'murmansk', name: 'Мурманская область', district: 'szfo' },
    { code: 'komi', name: 'Республика Коми', district: 'szfo' },
    { code: 'moscow', name: 'Московская область', district: 'cfo' },
    { code: 'smolensk', name: 'Смоленская область', district: 'cfo' },
    { code: 'yaroslavl', name: 'Ярославская область', district: 'cfo' },
    { code: 'krasnodar', name: 'Краснодарский край', district: 'yufo' },
    { code: 'kchr', name: 'Карачаево-Черкесская Республика', district: 'skfo' },
    { code: 'dagestan', name: 'Республика Дагестан', district: 'skfo' },
    { code: 'samara', name: 'Самарская область', district: 'pfo' },
    { code: 'bashkortostan', name: 'Республика Башкортостан', district: 'pfo' },
    { code: 'chelyabinsk', name: 'Челябинская область', district: 'ufo' },
    { code: 'sverdlovsk', name: 'Свердловская область', district: 'ufo' },
    { code: 'krasnoyarsk', name: 'Красноярский край', district: 'sfo' },
    { code: 'irkutsk', name: 'Иркутская область', district: 'sfo' },
    { code: 'altai', name: 'Республика Алтай', district: 'sfo' },
    { code: 'primorye', name: 'Приморский край', district: 'dfo' },
    { code: 'kamchatka', name: 'Камчатский край', district: 'dfo' }
  ];

  /** Шкала сложности (1–5) с понятными пояснениями */
  var DIFFICULTY = [
    null,
    { value: 1, name: 'Очень лёгкий', hint: 'Обустроенная тропа до 3 км почти без подъёмов. Подходит для первого выхода на природу.' },
    { value: 2, name: 'Лёгкий', hint: 'До 12 км, небольшие подъёмы. Хватит обычной удобной обуви и умеренной формы.' },
    { value: 3, name: 'Средний', hint: 'Длинный день или подъём на 400–1000 м по камням и корням. Нужна базовая подготовка.' },
    { value: 4, name: 'Сложный', hint: 'Горный маршрут: большой набор высоты или несколько дней автономно. Нужен опыт походов.' },
    { value: 5, name: 'Экспедиция', hint: 'Многодневный поход в отдалённый район без связи. Только для опытных групп или с организатором.' }
  ];

  /**
   * Категории доступности — по методике паспортизации объектов
   * (К, О, С, Г, У), формулировки — от лица посетителя.
   */
  var ACCESS_CATEGORIES = [
    { code: 'K', letter: 'К', name: 'Передвигаюсь на коляске', official: 'инвалиды, передвигающиеся на креслах-колясках' },
    { code: 'O', letter: 'О', name: 'Мне трудно ходить', official: 'инвалиды с нарушениями опорно-двигательного аппарата' },
    { code: 'S', letter: 'С', name: 'Не вижу или плохо вижу', official: 'инвалиды с нарушениями зрения' },
    { code: 'G', letter: 'Г', name: 'Не слышу или плохо слышу', official: 'инвалиды с нарушениями слуха' },
    { code: 'U', letter: 'У', name: 'Нужна простая и понятная информация', official: 'инвалиды с нарушениями умственного развития' }
  ];

  /** Статусы доступности (ДП, ДЧ, ДУ, ВНД) */
  var ACCESS_STATUS = {
    DP: { code: 'DP', short: 'ДП', name: 'Доступно полностью', rank: 3, tone: 'ok' },
    DCH: { code: 'DCH', short: 'ДЧ', name: 'Доступно частично', rank: 2, tone: 'ok' },
    DU: { code: 'DU', short: 'ДУ', name: 'Доступно с помощником', rank: 1, tone: 'warn' },
    VND: { code: 'VND', short: 'ВНД', name: 'Недоступно', rank: 0, tone: 'bad' }
  };

  var LANDSCAPES = {
    forest: 'Лес и тайга', mountains: 'Горы', water: 'Озёра и реки', sea: 'Море и заливы',
    rocks: 'Скалы и останцы', volcano: 'Вулканы', canyon: 'Ущелья и каньоны',
    tundra: 'Тундра и высокогорье', history: 'История и культура'
  };

  var FEATURES = {
    family: 'Можно с детьми', stroller: 'Можно с детской коляской', elderly: 'Подходит пожилым',
    transport: 'Можно добраться без машины', winter: 'Можно пройти зимой',
    shelter: 'Есть места ночёвки', guide: 'Лучше идти с гидом'
  };

  var AREA_TYPES = { np: 'Национальный парк', zap: 'Заповедник', pp: 'Природный парк', pam: 'Памятник природы', none: 'Вне особо охраняемой территории' };
  var ROUTE_TYPES = { loop: 'Кольцевой', radial: 'Туда и обратно', linear: 'Из точки А в точку Б' };
  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var CHECK_LEVELS = { official: 'Сверено с официальным сайтом', open: 'По открытым источникам — уточняйте перед поездкой' };

  /** Уровни ограничений: 0 — только рекомендации, 1 — билет/регистрация, 2 — разрешение или пропуск заранее */
  var RESTRICTION_LEVELS = ['Свободное посещение', 'Нужен билет или регистрация', 'Нужно разрешение или пропуск заранее'];

  /** Статусы модерации */
  var REVIEW_STATUS = { published: 'Опубликован', hidden: 'Скрыт' };
  var REPORT_STATUS = { new: 'Новое', progress: 'В работе', resolved: 'Учтено', rejected: 'Отклонено' };
  var FEEDBACK_TOPICS = { a11y: 'Проблема доступности сайта', content: 'Ошибка в описании маршрута', idea: 'Предложение', other: 'Другое' };

  /** Иллюстрации маршрутов: созданы для проекта и не являются фотографиями конкретных мест. Значение — альтернативный текст */
  var COVERS = {
    hero: 'Деревянный настил с перилами ведёт через сосновый лес к озеру, над водой утренний туман',
    inclusive: 'Человек на инвалидной коляске и его спутница движутся по широкому деревянному настилу через сосновый лес к морю, вид со спины',
    caucasus: 'Бирюзовое горное озеро у подножия заснеженных вершин, вдоль зелёного склона идёт тропа',
    altai: 'Бирюзовое озеро в горной долине, на дальнем плане — ледник и снежная вершина, по берегу растут лиственницы',
    kamchatka: 'Снежный конус вулкана с дымком над кратером, к нему ведёт тёмная тропа через зелёный кустарник',
    north: 'Скальное плато с лишайником и кривой сосной, внизу — синее озеро, на дальних холмах снежники',
    ural: 'Дощатая тропа поднимается по склону через тайгу, рядом каменные россыпи и скалистый гребень',
    stolby: 'Две высокие скалы-столба поднимаются над хвойной тайгой',
    sayan: 'Острые скальные пики отражаются в спокойном горном озере, на берегу ели',
    baikal: 'Прозрачная вода с камнями на дне у скалистого берега, вдоль берега тянется тропа',
    forest: 'Тропа вдоль реки среди берёз и сосен, вдали на холме белый храм',
    gorge: 'Узкое зелёное ущелье с отвесными замшелыми скалами, вдоль бирюзовой реки проложена узкоколейка',
    canyon: 'Бирюзовая горная река бежит между замшелых валунов у подножия скал',
    volga: 'Травянистый склон над широкой рекой на закате, вдали остров',
    dagestan: 'Заброшенное каменное селение на склоне с террасами над глубокой горной долиной'
  };

  function byCode(list) { var m = {}; list.forEach(function (x) { if (x) m[x.code] = x; }); return m; }

  return {
    DISTRICTS: DISTRICTS, DISTRICT_BY_CODE: byCode(DISTRICTS),
    REGIONS: REGIONS, REGION_BY_CODE: byCode(REGIONS),
    DIFFICULTY: DIFFICULTY, ACCESS_CATEGORIES: ACCESS_CATEGORIES, ACCESS_BY_CODE: byCode(ACCESS_CATEGORIES),
    ACCESS_STATUS: ACCESS_STATUS, LANDSCAPES: LANDSCAPES, FEATURES: FEATURES, AREA_TYPES: AREA_TYPES,
    ROUTE_TYPES: ROUTE_TYPES, MONTHS: MONTHS, MONTHS_SHORT: MONTHS_SHORT, CHECK_LEVELS: CHECK_LEVELS,
    RESTRICTION_LEVELS: RESTRICTION_LEVELS, REVIEW_STATUS: REVIEW_STATUS, REPORT_STATUS: REPORT_STATUS,
    FEEDBACK_TOPICS: FEEDBACK_TOPICS, COVERS: COVERS
  };
});

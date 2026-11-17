/**
 * Каталог снаряжения с декларативными правилами.
 * Поле `if` описывает, когда предмет попадает в список (все условия должны выполниться):
 *   season: ['summer'|'shoulder'|'winter'], minDays, maxDays, overnight: ['tent'|'hut'],
 *   terrain: ['mountain'|'alpine'|'volcano'|'water'|'forest'|'canyon'] (достаточно одного совпадения),
 *   needs: ['K'|'O'|'S'|'G'|'U'|'kids'|'elderly'|'dog'] (достаточно одного совпадения),
 *   minDifficulty, maxDifficulty, ticks: true, permits: true, remote: true.
 * weight — граммы на единицу; perDay — количество умножается на число дней; group — на группу.
 * Логика подбора — в public/js/shared/logic.js (buildGear).
 */
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else { root.TROPY = root.TROPY || {}; root.TROPY.gear = data; }
})(typeof self !== 'undefined' ? self : this, {
  categories: [
    ['docs', 'Документы и связь'], ['nav', 'Навигация и безопасность'], ['clothes', 'Одежда'],
    ['shoes', 'Обувь'], ['food', 'Вода и еда'], ['med', 'Аптечка и гигиена'],
    ['camp', 'Ночёвка и кухня'], ['adaptive', 'Адаптивное снаряжение'], ['kids', 'Для детей']
  ],
  items: [
    { id: 'passport', cat: 'docs', name: 'Паспорт и полис ОМС', weight: 50, essential: true, why: 'Нужны для разрешений, в пограничной зоне и при обращении за медицинской помощью.' },
    { id: 'disability-docs', cat: 'docs', name: 'Справка об инвалидности или удостоверение', weight: 20, if: { needs: ['K', 'O', 'S', 'G', 'U'] }, why: 'Пригодится для льготного билета и ситуационной помощи на месте.' },
    { id: 'permits', cat: 'docs', name: 'Билеты, разрешения, пропуск — в телефоне и на бумаге', weight: 20, essential: true, if: { permits: true }, why: 'На маршруте нужны документы на посещение территории.' },
    { id: 'phone', cat: 'docs', name: 'Телефон с офлайн-картой и GPX-треком маршрута', weight: 200, essential: true, why: 'Связь в горах и лесу пропадает — карта должна работать без интернета.' },
    { id: 'powerbank', cat: 'docs', name: 'Пауэрбанк 10 000 мА·ч и кабель', weight: 220, if: { maxDays: 1 }, why: 'Навигация и фото быстро разряжают телефон.' },
    { id: 'powerbank-big', cat: 'docs', name: 'Пауэрбанк 20 000 мА·ч и кабели', weight: 400, if: { minDays: 2 }, why: 'Хватит на несколько дней навигации и связи.' },
    { id: 'emergency-card', cat: 'docs', name: 'Карточка безопасности: маршрут, контакты, лекарства, группа крови', weight: 5, essential: true, why: 'Поможет спасателям и врачам, если вы не сможете рассказать о себе. Карточку можно распечатать в разделе «Мои походы».' },
    { id: 'sat', cat: 'docs', name: 'Спутниковый коммуникатор или трекер', weight: 120, if: { remote: true }, why: 'В отдалённых районах это единственный способ вызвать помощь.' },

    { id: 'headlamp', cat: 'nav', name: 'Налобный фонарь и запасные батарейки', weight: 100, essential: true, why: 'Даже короткая прогулка может затянуться до темноты.' },
    { id: 'whistle', cat: 'nav', name: 'Свисток', weight: 10, essential: true, why: 'Сигнал слышен дальше голоса: три коротких свистка — просьба о помощи.' },
    { id: 'map-compass', cat: 'nav', name: 'Бумажная карта и компас', weight: 100, if: { terrain: ['mountain', 'alpine', 'volcano'] }, why: 'Запасной способ ориентирования, если сядет телефон.' },
    { id: 'blanket', cat: 'nav', name: 'Спасательное термоодеяло', weight: 60, essential: true, why: 'Сохраняет тепло при травме или вынужденной ночёвке.' },
    { id: 'knife', cat: 'nav', name: 'Нож или мультитул', weight: 100, if: { minDays: 2 }, why: 'Для мелкого ремонта, еды и снаряжения.' },
    { id: 'poles', cat: 'nav', name: 'Треккинговые палки', weight: 500, if: { minDifficulty: 3 }, why: 'Снижают нагрузку на колени на подъёмах и спусках, дают опору на камнях.' },
    { id: 'spikes-alpine', cat: 'nav', name: 'Ледоступы или кошки (по рекомендации гида)', weight: 400, if: { terrain: ['alpine', 'volcano'] }, why: 'На снежниках и льду без них легко поскользнуться.' },
    { id: 'gaiters', cat: 'nav', name: 'Гамаши (бахилы)', weight: 200, if: { terrain: ['alpine', 'volcano'] }, why: 'Защищают обувь от снега, пепла и камешков.' },

    { id: 'fleece', cat: 'clothes', name: 'Тёплая кофта (флис)', weight: 400, essential: true, why: 'Погода на природе меняется быстро, а на привале становится холодно.' },
    { id: 'rain', cat: 'clothes', name: 'Непромокаемая куртка или дождевик', weight: 400, essential: true, why: 'Защищает от дождя и ветра.' },
    { id: 'rainpants', cat: 'clothes', name: 'Непромокаемые брюки', weight: 300, if: { terrain: ['mountain', 'alpine', 'volcano'] }, why: 'В горах дождь и ветер особенно опасны: мокрая одежда быстро охлаждает.' },
    { id: 'base-layer', cat: 'clothes', name: 'Термобельё', weight: 250, if: { season: ['shoulder', 'winter'] }, why: 'Отводит влагу и держит тепло.' },
    { id: 'base-layer-mnt', cat: 'clothes', name: 'Термобельё', weight: 250, if: { season: ['summer'], terrain: ['alpine', 'volcano'] }, why: 'На высоте холодно даже летом.' },
    { id: 'down', cat: 'clothes', name: 'Пуховка или утеплённая куртка', weight: 500, if: { season: ['winter'] }, why: 'Основной утеплитель зимой.' },
    { id: 'down-alpine', cat: 'clothes', name: 'Лёгкая утеплённая куртка', weight: 400, if: { season: ['summer', 'shoulder'], terrain: ['alpine', 'volcano'] }, why: 'На вершине и перевале ветер и мороз возможны летом.' },
    { id: 'hat-sun', cat: 'clothes', name: 'Головной убор от солнца', weight: 80, if: { season: ['summer'] }, why: 'Защищает от перегрева и солнечного удара.' },
    { id: 'hat-warm', cat: 'clothes', name: 'Шапка и перчатки', weight: 150, if: { season: ['shoulder', 'winter'] }, why: 'Через голову и руки уходит много тепла.' },
    { id: 'hat-warm-mnt', cat: 'clothes', name: 'Шапка и перчатки', weight: 150, if: { season: ['summer'], terrain: ['mountain', 'alpine', 'volcano'] }, why: 'На горных гребнях ветер холодный даже летом.' },
    { id: 'tick-clothes', cat: 'clothes', name: 'Светлая закрытая одежда с манжетами', weight: 0, if: { ticks: true }, why: 'На светлой ткани клеща легко заметить; манжеты не дают ему добраться до кожи.' },
    { id: 'socks', cat: 'clothes', name: 'Запасные носки', weight: 80, perDay: true, essential: true, why: 'Сухие ноги — меньше мозолей и переохлаждения.' },
    { id: 'sunglasses', cat: 'clothes', name: 'Солнцезащитные очки', weight: 30, if: { terrain: ['alpine', 'volcano', 'water'] }, why: 'Снег и вода отражают много солнца.' },

    { id: 'shoes-light', cat: 'shoes', name: 'Удобные кроссовки с рельефной подошвой', weight: 0, if: { maxDifficulty: 2 }, why: 'Для ровных троп достаточно разношенной обуви с хорошим протектором.' },
    { id: 'boots', cat: 'shoes', name: 'Треккинговые ботинки с фиксацией голеностопа', weight: 0, if: { minDifficulty: 3 }, why: 'На камнях и корнях защищают от подворота ноги.' },
    { id: 'sandals', cat: 'shoes', name: 'Сандалии для бродов и лагеря', weight: 300, if: { minDays: 2 }, why: 'Ноги отдохнут на стоянке, а основная обувь останется сухой на бродах.' },
    { id: 'microspikes', cat: 'shoes', name: 'Ледоступы', weight: 300, if: { season: ['winter'] }, why: 'Зимой тропы обледеневают.' },

    { id: 'water', cat: 'food', name: 'Вода — от 1,5 л на человека', weight: 1500, essential: true, why: 'Обезвоживание быстро снижает силы и внимание.' },
    { id: 'snacks', cat: 'food', name: 'Перекус: орехи, сухофрукты, батончики', weight: 300, essential: true, why: 'Быстрая энергия на привалах.' },
    { id: 'thermos', cat: 'food', name: 'Термос с горячим чаем', weight: 600, if: { season: ['shoulder', 'winter'] }, why: 'Согревает изнутри на холодных привалах.' },
    { id: 'food-days', cat: 'food', name: 'Еда на каждый день + запас на 1 день', weight: 700, perDay: true, if: { minDays: 2 }, why: 'Расчёт около 700 г сухого рациона на человека в день; запасной день — на случай непогоды.' },
    { id: 'filter', cat: 'food', name: 'Фильтр или таблетки для очистки воды', weight: 80, if: { minDays: 2 }, why: 'Вода из ручья может быть небезопасной.' },

    { id: 'firstaid', cat: 'med', name: 'Аптечка: пластыри, бинт, антисептик, обезболивающее, средство от аллергии', weight: 300, essential: true, why: 'Помощь при мозолях, порезах и ушибах до прихода спасателей.' },
    { id: 'meds', cat: 'med', name: 'Личные лекарства с запасом на 2 дня и список с дозировками', weight: 50, essential: true, why: 'Поход может затянуться; список поможет врачам.' },
    { id: 'sunscreen', cat: 'med', name: 'Крем от солнца SPF 50', weight: 60, if: { season: ['summer'] }, why: 'На открытых участках легко обгореть даже в облачную погоду.' },
    { id: 'sunscreen-alpine', cat: 'med', name: 'Крем от солнца SPF 50', weight: 60, if: { season: ['shoulder', 'winter'], terrain: ['alpine', 'volcano'] }, why: 'На снегу и высоте ультрафиолет сильнее.' },
    { id: 'repellent', cat: 'med', name: 'Акарицидно-репеллентное средство от клещей и комаров', weight: 100, if: { ticks: true }, why: 'Снижает риск укусов клещей и насекомых.' },
    { id: 'tick-tool', cat: 'med', name: 'Приспособление для удаления клещей', weight: 10, if: { ticks: true }, why: 'Чем быстрее удалить клеща, тем ниже риск заражения.' },
    { id: 'hygiene', cat: 'med', name: 'Влажные салфетки, санитайзер, туалетная бумага', weight: 150, essential: true, why: 'На многих маршрутах нет туалетов и воды для мытья рук.' },
    { id: 'trash', cat: 'med', name: 'Пакеты для мусора', weight: 20, essential: true, why: 'Весь мусор уносим с собой — это правило любой охраняемой территории.' },
    { id: 'sit-pad', cat: 'med', name: 'Сидушка-пенка для привалов', weight: 50, why: 'Можно отдохнуть на холодном камне или мокрой траве.' },

    { id: 'tent', cat: 'camp', name: 'Палатка', weight: 2500, group: true, if: { overnight: ['tent'] }, why: 'Укрытие от ветра, дождя и насекомых.' },
    { id: 'sleeping-bag', cat: 'camp', name: 'Спальный мешок по сезону', weight: 1200, if: { overnight: ['tent', 'hut'] }, why: 'Летом в горах ночью бывает около нуля — смотрите температуру комфорта.' },
    { id: 'mat', cat: 'camp', name: 'Туристический коврик', weight: 500, if: { overnight: ['tent'] }, why: 'Земля забирает тепло сильнее воздуха.' },
    { id: 'stove', cat: 'camp', name: 'Горелка, газ, котелок, посуда', weight: 900, group: true, if: { overnight: ['tent'] }, why: 'В пожароопасный сезон костры запрещены — горелка безопаснее.' },
    { id: 'dry-bags', cat: 'camp', name: 'Гермомешки для одежды и электроники', weight: 150, if: { minDays: 2 }, why: 'Вещи останутся сухими под дождём и на бродах.' },

    { id: 'wheel-repair', cat: 'adaptive', name: 'Ремкомплект для коляски: насос, запасная камера, ключи', weight: 600, if: { needs: ['K'] }, why: 'Прокол на гравии или корнях — частая проблема.' },
    { id: 'wheel-gloves', cat: 'adaptive', name: 'Перчатки для колясочника', weight: 100, if: { needs: ['K'] }, why: 'Защищают ладони на длинных и влажных участках.' },
    { id: 'free-wheel', cat: 'adaptive', name: 'Съёмная приставка-колесо для движения по грунту', weight: 1500, if: { needs: ['K'] }, why: 'Облегчает движение по гравию, траве и неровному настилу.' },
    { id: 'cushion', cat: 'adaptive', name: 'Противопролежневая подушка и дождевик-накидка на коляску', weight: 700, if: { needs: ['K'] }, why: 'Комфорт на долгой прогулке и защита от дождя.' },
    { id: 'med-supplies', cat: 'adaptive', name: 'Медицинские расходные материалы с запасом на 1 день', weight: 200, if: { needs: ['K', 'O'] }, why: 'Поход может затянуться, а на маршруте их не купить.' },
    { id: 'cane-seat', cat: 'adaptive', name: 'Трость-стул для отдыха', weight: 900, if: { needs: ['O', 'elderly'] }, why: 'Позволяет отдыхать там, где нет скамеек.' },
    { id: 'orthosis', cat: 'adaptive', name: 'Ортезы или наколенники по назначению врача', weight: 300, if: { needs: ['O'] }, why: 'Поддерживают суставы на неровной поверхности.' },
    { id: 'white-cane', cat: 'adaptive', name: 'Белая трость с наконечником для бездорожья (шаровым или роликовым)', weight: 300, if: { needs: ['S'] }, why: 'Обычный наконечник застревает в корнях и щелях настила.' },
    { id: 'bone-phones', cat: 'adaptive', name: 'Наушники с костной проводимостью', weight: 40, if: { needs: ['S'] }, why: 'Слышны подсказки навигатора и окружающие звуки одновременно.' },
    { id: 'contrast-marks', cat: 'adaptive', name: 'Яркая светоотражающая маркировка вещей', weight: 30, if: { needs: ['S'] }, why: 'Вещи проще найти на стоянке, а вас — заметить.' },
    { id: 'dog-kit', cat: 'adaptive', name: 'Для собаки-проводника: документ об обучении, вода, миска, защитные ботинки для лап', weight: 800, if: { needs: ['dog'] }, why: 'Камни и горячий настил травмируют лапы; документ нужен для допуска.' },
    { id: 'hearing-power', cat: 'adaptive', name: 'Запасные батарейки или зарядка для слухового аппарата или речевого процессора', weight: 50, if: { needs: ['G'] }, why: 'Без них вы не услышите группу и сигналы.' },
    { id: 'hearing-case', cat: 'adaptive', name: 'Влагозащитный чехол и осушитель для слухового аппарата', weight: 80, if: { needs: ['G'] }, why: 'Дождь и пот — главные враги электроники.' },
    { id: 'comm-card', cat: 'adaptive', name: 'Карточка-коммуникатор: «Я плохо слышу. Пишите или говорите медленно»', weight: 5, if: { needs: ['G'] }, why: 'Помогает быстро объясниться со спасателями и попутчиками.' },
    { id: 'signal-light', cat: 'adaptive', name: 'Яркий фонарь для световых сигналов и блокнот с карандашом', weight: 120, if: { needs: ['G'] }, why: 'Заранее договоритесь с группой о световых сигналах и жестах.' },
    { id: 'id-bracelet', cat: 'adaptive', name: 'Браслет или карточка с именем и телефоном сопровождающего', weight: 10, if: { needs: ['U', 'kids'] }, why: 'Если человек потеряется, ему быстро помогут вернуться.' },
    { id: 'visual-plan', cat: 'adaptive', name: 'Визуальный план маршрута с картинками «что будет дальше»', weight: 20, if: { needs: ['U'] }, why: 'Понятный план снижает тревогу в незнакомом месте.' },
    { id: 'quiet-phones', cat: 'adaptive', name: 'Наушники с шумоподавлением', weight: 200, if: { needs: ['U'] }, why: 'Помогают при сенсорной перегрузке на шумных участках.' },
    { id: 'comfort-item', cat: 'adaptive', name: 'Любимый перекус или привычный успокаивающий предмет', weight: 100, if: { needs: ['U', 'kids'] }, why: 'Знакомое помогает пережить усталость и новые впечатления.' },

    { id: 'kids-carrier', cat: 'kids', name: 'Эргорюкзак или детская переноска', weight: 1200, if: { needs: ['kids'], minDifficulty: 2 }, why: 'Маленьким детям понадобится отдых на руках.' },
    { id: 'kids-spare', cat: 'kids', name: 'Сменная одежда для ребёнка', weight: 400, if: { needs: ['kids'] }, why: 'Дети чаще промокают и пачкаются.' },
    { id: 'kids-bright', cat: 'kids', name: 'Яркая одежда для ребёнка', weight: 0, if: { needs: ['kids'] }, why: 'Так ребёнка легко увидеть издалека.' }
  ]
});

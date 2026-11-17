/**
 * Общая бизнес-логика «Тропы без барьеров» (UMD: браузер + Node.js).
 * Здесь находятся чистые функции без побочных эффектов: форматирование, фильтрация каталога,
 * подбор маршрута, генератор снаряжения, план подготовки и валидация данных.
 * Сервер использует те же функции валидации, что и формы в браузере, — сообщения об ошибках совпадают.
 */
(function (root, factory) {
  var dict = (typeof module === 'object' && module.exports) ? require('./dict.js') : root.TROPY.dict;
  var mod = factory(dict);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.TROPY = root.TROPY || {}; root.TROPY.logic = mod; }
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  /* ---------- Форматирование ---------- */

  /** Русская множественная форма: plural(5, ['маршрут','маршрута','маршрутов']) → 'маршрутов' */
  function plural(n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }
  function num(n, digits) {
    var v = typeof digits === 'number' ? Number(n).toFixed(digits) : String(Math.round(n * 10) / 10);
    return v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  }
  function km(v) { return num(v) + '\u00a0км'; }
  function meters(v) { return num(Math.round(v)) + '\u00a0м'; }
  function hours(h) {
    if (h < 1) return Math.round(h * 60) + '\u00a0мин';
    return num(h) + '\u00a0' + plural(Math.ceil(h), ['час', 'часа', 'часов']);
  }
  function daysText(d) {
    if (!d) return '';
    if (d[0] === d[1]) return d[0] + '\u00a0' + plural(d[0], ['день', 'дня', 'дней']);
    return d[0] + '–' + d[1] + '\u00a0' + plural(d[1], ['день', 'дня', 'дней']);
  }
  /** Длительность маршрута одной строкой */
  function durationText(r) { return r.days[1] > 1 ? daysText(r.days) : hours(r.durationH); }
  /** Сезон: [5,6,7,8,9,10] → 'май — октябрь'; все месяцы → 'круглый год' */
  function monthsText(m) {
    if (!m || !m.length) return '—';
    if (m.length === 12) return 'круглый год';
    var s = m.slice().sort(function (a, b) { return a - b; }), parts = [];
    // зимний сезон «через Новый год»: [1,2,3,12] → декабрь — март
    if (s[0] === 1 && s[s.length - 1] === 12) { while (s[0] === s[s.length - 1] % 12 + 1) s.push(s.shift()); }
    var start = s[0], prev = s[0];
    for (var i = 1; i <= s.length; i++) {
      if (s[i] === prev % 12 + 1) { prev = s[i]; continue; }
      parts.push(start === prev ? D.MONTHS[start - 1] : D.MONTHS[start - 1] + ' — ' + D.MONTHS[prev - 1]);
      start = prev = s[i];
    }
    return parts.join(', ');
  }
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function addDays(iso, n) { var d = parseDate(iso); d.setDate(d.getDate() + n); return isoDate(d); }
  function diffDays(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 864e5); }
  function dateText(iso) { if (!iso) return ''; var d = parseDate(iso); return d.getDate() + '\u00a0' + MONTHS_GEN[d.getMonth()] + ' ' + d.getFullYear(); }
  function checkText(c) { if (!c) return ''; var p = c.date.split('-'); return D.MONTHS[+p[1] - 1] + ' ' + p[0]; }
  /** Нормализация строки для поиска: регистр, «ё», лишние пробелы */
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }

  /* ---------- Маршруты ---------- */

  function regionOf(r) { return D.REGION_BY_CODE[r.region] || { name: r.region, district: '' }; }
  function districtOf(r) { return regionOf(r).district; }
  function accessRank(r, cat) { var a = r.access && r.access[cat]; return a ? D.ACCESS_STATUS[a[0]].rank : 0; }
  /** Подходит ли маршрут человеку с указанными потребностями (с помощником — допускаем «ДУ») */
  function suits(r, needs, companion) {
    var min = companion ? 1 : 2;
    return (needs || []).every(function (c) { return accessRank(r, c) >= min; });
  }
  /** Максимальный уровень ограничений маршрута по базе знаний */
  function restrictionLevel(r, kb) {
    var byCode = {}; (kb || []).forEach(function (k) { byCode[k.code] = k.level; });
    return (r.restrictions || []).reduce(function (m, x) { return Math.max(m, byCode[x[0]] || 0); }, 0);
  }
  /** Класс длительности: short — до 2 ч, half — до 5 ч, day — один день, multi — 2–3 дня, long — больше */
  function durationClass(r) {
    if (r.days[1] > 3) return 'long';
    if (r.days[0] > 1 || (r.days[1] > 1 && r.durationH > 12)) return 'multi';
    if (r.durationH <= 2) return 'short';
    if (r.durationH <= 5) return 'half';
    return 'day';
  }
  var DURATION_ORDER = ['short', 'half', 'day', 'multi', 'long'];
  var DURATION_TEXT = { short: 'до 2 часов', half: 'полдня', day: 'целый день', multi: '2–3 дня', long: 'неделя и больше' };

  function searchText(r) {
    return norm([r.title, r.area, regionOf(r).name, r.summary, (r.highlights || []).join(' ')].join(' '));
  }

  /**
   * Фильтрация каталога. f — объект фильтров (см. описание полей в docs/API.md):
   * q, needs[], companion, diff[], lenMax, days ('one'|'multi'), district, region, month, land[], feat[], noPermit
   */
  function filterRoutes(routes, f, kb) {
    f = f || {};
    var q = norm(f.q);
    return routes.filter(function (r) {
      if (r.status && r.status !== 'published') return false;
      if (q && searchText(r).indexOf(q) === -1) return false;
      if (f.needs && f.needs.length && !suits(r, f.needs, f.companion)) return false;
      if (f.diff && f.diff.length && f.diff.indexOf(r.difficulty) === -1) return false;
      if (f.lenMax && r.lengthKm > f.lenMax) return false;
      if (f.days === 'one' && r.days[0] > 1) return false;
      if (f.days === 'multi' && r.days[1] < 2) return false;
      if (f.district && districtOf(r) !== f.district) return false;
      if (f.region && r.region !== f.region) return false;
      if (f.month && r.months.indexOf(+f.month) === -1) return false;
      if (f.land && f.land.length && !f.land.some(function (l) { return r.landscapes.indexOf(l) !== -1; })) return false;
      if (f.feat && f.feat.length && !f.feat.every(function (x) { return r.features.indexOf(x) !== -1; })) return false;
      if (f.noPermit && restrictionLevel(r, kb) >= 2) return false;
      return true;
    });
  }

  function haversine(a, b) {
    var R = 6371, rad = Math.PI / 180, dLa = (b[0] - a[0]) * rad, dLo = (b[1] - a[1]) * rad;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Сортировка: access — лучшая доступность для выбранных потребностей; distance — ближе к пользователю */
  function sortRoutes(list, sort, ctx) {
    ctx = ctx || {};
    var cmp = {
      access: function (a, b) { return accessScore(b, ctx.needs) - accessScore(a, ctx.needs) || a.difficulty - b.difficulty; },
      'diff-asc': function (a, b) { return a.difficulty - b.difficulty || a.lengthKm - b.lengthKm; },
      'diff-desc': function (a, b) { return b.difficulty - a.difficulty || b.lengthKm - a.lengthKm; },
      'len-asc': function (a, b) { return a.lengthKm - b.lengthKm; },
      'len-desc': function (a, b) { return b.lengthKm - a.lengthKm; },
      rating: function (a, b) { return (b.rating || 0) - (a.rating || 0) || (b.reviewsCount || 0) - (a.reviewsCount || 0); },
      name: function (a, b) { return a.title.localeCompare(b.title, 'ru'); },
      distance: function (a, b) { return haversine(ctx.pos, [a.start.lat, a.start.lon]) - haversine(ctx.pos, [b.start.lat, b.start.lon]); }
    }[sort] || null;
    if (sort === 'distance' && !ctx.pos) cmp = null;
    var out = list.slice();
    if (cmp) out.sort(cmp);
    return out;
  }
  function accessScore(r, needs) {
    var cats = needs && needs.length ? needs : ['K', 'O', 'S', 'G', 'U'];
    return cats.reduce(function (s, c) { return s + accessRank(r, c); }, 0);
  }

  /**
   * Мастер подбора: возвращает маршруты с баллами и объяснениями «почему подходит».
   * answers: { needs[], companion, kids, fitness (1–5), duration, district, month, land[], noPermit, noCar }
   */
  function scoreRoutes(routes, a, kb) {
    a = a || {};
    var out = [];
    routes.forEach(function (r) {
      if (r.status && r.status !== 'published') return;
      var reasons = [], warnings = [], score = 50;
      var needs = a.needs || [];
      if (needs.length && !suits(r, needs, a.companion)) return;
      if (a.fitness && r.difficulty > a.fitness) return;
      if (a.kids && r.difficulty > 3) return;
      if (a.noPermit && restrictionLevel(r, kb) >= 2) return;
      if (needs.length) {
        needs.forEach(function (c) {
          var st = D.ACCESS_STATUS[r.access[c][0]];
          score += (st.rank - 1) * 6;
          var cat = D.ACCESS_BY_CODE[c];
          if (st.rank >= 2) reasons.push(cat.letter + ' — ' + st.name.toLowerCase());
          else warnings.push(cat.letter + ' — ' + st.name.toLowerCase() + (r.access[c][1] ? ': ' + r.access[c][1] : ''));
        });
      }
      if (a.duration) {
        var dc = durationClass(r), d = Math.abs(DURATION_ORDER.indexOf(dc) - DURATION_ORDER.indexOf(a.duration));
        if (d === 0) { score += 25; reasons.push('Длительность — ' + DURATION_TEXT[dc]); }
        else if (d === 1) { score += 8; }
        else { score -= 20 * (d - 1); warnings.push('Длительность — ' + DURATION_TEXT[dc] + ', а вы планировали ' + DURATION_TEXT[a.duration]); }
      }
      if (a.district) {
        if (districtOf(r) === a.district) { score += 15; reasons.push('В выбранном федеральном округе'); }
        else score -= 15;
      }
      if (a.month) {
        if (r.months.indexOf(+a.month) !== -1) { score += 12; reasons.push('Сезон подходит: ' + monthsText(r.months)); }
        else { score -= 30; warnings.push('Не сезон: лучшее время — ' + monthsText(r.months)); }
      }
      if (a.land && a.land.length) {
        var hit = a.land.filter(function (l) { return r.landscapes.indexOf(l) !== -1; });
        score += Math.min(hit.length, 3) * 8;
        if (hit.length) reasons.push('Есть то, что вы хотели увидеть: ' + hit.map(function (l) { return D.LANDSCAPES[l].toLowerCase(); }).join(', '));
      }
      if (a.noCar) {
        if (r.features.indexOf('transport') !== -1) { score += 10; reasons.push('Можно добраться без машины'); }
        else { score -= 10; warnings.push('Без автомобиля добраться сложно'); }
      }
      if (a.kids && r.features.indexOf('family') !== -1) { score += 8; reasons.push('Подходит для похода с детьми'); }
      var lvl = restrictionLevel(r, kb);
      if (lvl === 2) warnings.push('Нужно заранее оформить разрешение или пропуск');
      if (r.rating) score += (r.rating - 3) * 3;
      out.push({ route: r, score: Math.round(score), reasons: reasons, warnings: warnings });
    });
    out.sort(function (x, y) { return y.score - x.score; });
    return out;
  }

  /* ---------- Снаряжение ---------- */

  function seasonOfMonth(m) { return (m >= 5 && m <= 9) ? 'summer' : (m === 12 || m <= 2) ? 'winter' : 'shoulder'; }

  /** Параметры генератора по выбранному маршруту и месяцу */
  function gearParamsFromRoute(r, month, kb) {
    var terrain = [];
    var L = r.landscapes;
    if (L.indexOf('mountains') !== -1 || L.indexOf('tundra') !== -1 || L.indexOf('rocks') !== -1) terrain.push('mountain');
    if (r.topM && r.topM >= 2000) terrain.push('alpine');
    if (L.indexOf('volcano') !== -1) terrain.push('volcano');
    if (L.indexOf('water') !== -1 || L.indexOf('sea') !== -1) terrain.push('water');
    if (L.indexOf('forest') !== -1) terrain.push('forest');
    if (L.indexOf('canyon') !== -1) terrain.push('canyon');
    var days = r.days[0];
    var codes = (r.restrictions || []).map(function (x) { return x[0]; });
    return {
      season: seasonOfMonth(month || (new Date().getMonth() + 1)),
      days: days,
      overnight: days > 1 ? (r.sleep || 'tent') : 'none',
      terrain: terrain,
      difficulty: r.difficulty,
      ticks: codes.indexOf('ticks') !== -1,
      permits: restrictionLevel(r, kb) >= 1,
      remote: r.difficulty >= 4 || r.days[1] >= 3
    };
  }

  function gearMatches(cond, p) {
    if (!cond) return true;
    var any = function (list, vals) { return list.some(function (x) { return (vals || []).indexOf(x) !== -1; }); };
    if (cond.season && cond.season.indexOf(p.season) === -1) return false;
    if (cond.minDays && (p.days || 1) < cond.minDays) return false;
    if (cond.maxDays && (p.days || 1) > cond.maxDays) return false;
    if (cond.overnight && cond.overnight.indexOf(p.overnight) === -1) return false;
    if (cond.terrain && !any(cond.terrain, p.terrain)) return false;
    if (cond.needs && !any(cond.needs, p.needs)) return false;
    if (cond.minDifficulty && (p.difficulty || 1) < cond.minDifficulty) return false;
    if (cond.maxDifficulty && (p.difficulty || 1) > cond.maxDifficulty) return false;
    if (cond.ticks && !p.ticks) return false;
    if (cond.permits && !p.permits) return false;
    if (cond.remote && !p.remote) return false;
    return true;
  }

  /** Строит список снаряжения по параметрам; возвращает группы и общий вес (граммы, на одного человека) */
  function buildGear(p, catalog) {
    var groups = catalog.categories.map(function (c) { return { cat: c[0], name: c[1], items: [] }; });
    var byCat = {}; groups.forEach(function (g) { byCat[g.cat] = g; });
    var total = 0, seen = {};
    catalog.items.forEach(function (it) {
      if (!gearMatches(it.if, p)) return;
      var key = it.name; if (seen[key]) return; seen[key] = true;
      var qty = it.perDay ? Math.min((p.days || 1) + 1, it.id === 'socks' ? 4 : 15) : 1;
      if (it.id === 'socks') qty = Math.min((p.days || 1) + 1, 4);
      var w = it.weight * qty;
      total += it.group ? Math.round(w / Math.max(1, p.groupSize || 1)) : w;
      byCat[it.cat].items.push({ id: it.id, name: it.name, qty: qty, weight: w, why: it.why, essential: !!it.essential, group: !!it.group });
    });
    return { groups: groups.filter(function (g) { return g.items.length; }), totalWeight: total };
  }

  /* ---------- План подготовки к походу ---------- */

  /**
   * Генерирует задачи подготовки с крайними сроками, исходя из ограничений маршрута,
   * длительности и потребностей группы. due — ISO-дата; null — без срока.
   */
  function planTasks(r, plan, kb) {
    var start = plan.startDate, end = plan.endDate || plan.startDate, needs = plan.needs || [];
    var codes = (r.restrictions || []).map(function (x) { return x[0]; });
    var note = {}; (r.restrictions || []).forEach(function (x) { note[x[0]] = x[1]; });
    var t = [];
    function add(code, text, offset, extra) { t.push(Object.assign({ code: code, text: text, due: offset === null ? null : addDays(offset < 0 ? start : end, offset < 0 ? offset : offset), done: false }, extra || {})); }
    if (codes.indexOf('reserve') !== -1) add('reserve', 'Подать заявку на разрешение заповедника. ' + (note.reserve || ''), -60);
    if (codes.indexOf('border') !== -1) add('border', 'Проверить пограничный режим и при необходимости оформить пропуск в пограничное управление ФСБ', -30);
    // Клещи активны примерно с апреля по октябрь — зимой задача не нужна
    var m1 = +start.slice(5, 7), m2 = +end.slice(5, 7);
    var tickSeason = [m1, m2].some(function (m) { return m >= 4 && m <= 10; }) || (m1 < 4 && m2 > 10);
    if (codes.indexOf('ticks') !== -1 && tickSeason) add('ticks', 'Прививка от клещевого энцефалита (если ещё не сделана) и акарицидное средство', -30);
    if (codes.indexOf('pass') !== -1) add('pass', 'Оформить разрешение на посещение. ' + (note.pass || ''), -14);
    add('transport', 'Купить билеты до старта. ' + (r.start.transport || ''), -14);
    if (codes.indexOf('mchs') !== -1 || r.days[0] > 1 || r.difficulty >= 4) add('mchs', 'Отправить уведомление о туристской группе в МЧС (рекомендуется не позднее чем за 10 дней)', -10, { link: 'https://forms.mchs.gov.ru/registration_tourist_groups' });
    if (codes.indexOf('regional-park') !== -1) add('regional-park', 'Уточнить правила и оплатить посещение природного парка', -7);
    if (needs.length) add('access-call', 'Позвонить в визит-центр или администрацию: уточнить покрытие, туалеты, парковку и возможность помощи на месте', -7);
    if (needs.some(function (c) { return r.access[c] && r.access[c][0] === 'DU'; })) add('companion', 'Договориться с сопровождающим — для ваших потребностей маршрут доступен с помощником', -7);
    if (codes.indexOf('fee') !== -1) add('fee', 'Купить билет или путёвку. ' + (note.fee || ''), -3);
    if (codes.indexOf('registration') !== -1) add('registration', 'Зарегистрироваться в природном парке. ' + (note.registration || ''), -3);
    add('gear', 'Собрать снаряжение по списку', -2, { link: '#/gear?route=' + r.slug });
    add('offline', 'Скачать офлайн-карту района и GPX-трек маршрута', -1);
    add('weather', 'Проверить прогноз погоды и штормовые предупреждения МЧС', -1);
    add('tell', 'Оставить близким карточку безопасности: маршрут, сроки и время контрольного звонка', -1);
    add('charge', needs.indexOf('G') !== -1 ? 'Зарядить телефон, пауэрбанк и слуховой аппарат (речевой процессор)' : needs.indexOf('K') !== -1 ? 'Зарядить телефон, пауэрбанк и аккумулятор коляски (если есть)' : 'Зарядить телефон и пауэрбанк', -1);
    add('return', 'Сообщить близким о возвращении' + (codes.indexOf('mchs') !== -1 || r.days[0] > 1 ? ' и закрыть уведомление в МЧС' : ''), 0);
    add('review', 'Оставить отзыв о доступности маршрута — он поможет другим путешественникам', 3);
    t.forEach(function (x, i) { x.id = 't' + (i + 1); x.text = x.text.trim(); });
    t.sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
    return t;
  }

  /** Состояние задачи относительно сегодняшней даты */
  function taskState(task, today) {
    if (task.done) return 'done';
    if (!task.due) return 'later';
    var d = diffDays(today, task.due);
    if (d < 0) return 'overdue';
    if (d <= 3) return 'soon';
    return 'later';
  }

  /* ---------- Валидация ---------- */

  var NEED_CODES = ['K', 'O', 'S', 'G', 'U'];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var MSG = {
    required: 'Заполните это поле',
    email: 'Введите адрес электронной почты в формате name@example.ru',
    min: function (n) { return 'Минимум ' + n + ' ' + plural(n, ['символ', 'символа', 'символов']); },
    max: function (n) { return 'Максимум ' + n + ' ' + plural(n, ['символ', 'символа', 'символов']); },
    password: 'Пароль должен содержать буквы и цифры',
    int: 'Введите целое число', number: 'Введите число',
    range: function (a, b) { return 'Допустимо от ' + a + ' до ' + b; },
    enumv: 'Выберите значение из списка', date: 'Введите дату в формате ГГГГ-ММ-ДД',
    accept: 'Нужно ваше согласие', url: 'Ссылка должна начинаться с https:// или http://',
    phone: 'Введите номер телефона, например +7 900 000-00-00', slug: 'Только латинские буквы, цифры и дефис (3–60 символов)'
  };

  function checkField(def, v) {
    var t = def.type;
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length && def.required)) {
      if (def.required) return { error: def.requiredMsg || (t === 'accept' ? MSG.accept : MSG.required) };
      return { value: def.default !== undefined ? def.default : (t === 'array' ? [] : t === 'bool' ? false : t === 'string' || t === 'text' ? '' : null) };
    }
    if (t === 'string' || t === 'text' || t === 'email' || t === 'password' || t === 'slug' || t === 'url' || t === 'phone') {
      if (typeof v !== 'string') v = String(v);
      v = t === 'password' ? v : v.trim();
      if (t === 'string') v = v.replace(/\s+/g, ' ');
      if (!v && def.required) return { error: MSG.required };
      if (def.min && v.length < def.min) return { error: MSG.min(def.min) };
      if (def.max && v.length > def.max) return { error: MSG.max(def.max) };
      if (t === 'email' && v && !EMAIL_RE.test(v)) return { error: MSG.email };
      if (t === 'email') v = v.toLowerCase();
      if (t === 'password' && !(/[A-Za-zА-Яа-яЁё]/.test(v) && /\d/.test(v))) return { error: MSG.password };
      if (t === 'slug' && !/^[a-z0-9-]{3,60}$/.test(v)) return { error: MSG.slug };
      if (t === 'url' && v && !/^https?:\/\/[^\s<>"]+$/i.test(v)) return { error: MSG.url };
      if (t === 'phone' && v && !/^[+\d][\d\s()\-]{5,24}$/.test(v)) return { error: MSG.phone };
      return { value: v };
    }
    if (t === 'int' || t === 'number') {
      var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!isFinite(n) || (t === 'int' && Math.floor(n) !== n)) return { error: t === 'int' ? MSG.int : MSG.number };
      if ((def.minv !== undefined && n < def.minv) || (def.maxv !== undefined && n > def.maxv)) return { error: MSG.range(def.minv, def.maxv) };
      return { value: n };
    }
    if (t === 'bool') return { value: v === true || v === 'true' || v === 'on' || v === 1 || v === '1' };
    if (t === 'accept') return (v === true || v === 'true' || v === 'on') ? { value: true } : { error: def.requiredMsg || MSG.accept };
    if (t === 'enum') return def.values.indexOf(v) === -1 ? { error: MSG.enumv } : { value: v };
    if (t === 'date' || t === 'month') {
      var re = t === 'date' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/;
      if (typeof v !== 'string' || !re.test(v) || isNaN(parseDate(v))) return { error: MSG.date };
      return { value: v };
    }
    if (t === 'array') {
      if (!Array.isArray(v)) v = [v];
      if (def.maxItems && v.length > def.maxItems) return { error: 'Не больше ' + def.maxItems + ' элементов' };
      var out = [];
      for (var i = 0; i < v.length; i++) {
        var r = checkField(Object.assign({ required: true }, def.of), v[i]);
        if (r.error) return { error: (def.itemLabel || 'Элемент') + ' ' + (i + 1) + ': ' + r.error };
        out.push(r.value);
      }
      if (def.unique) out = out.filter(function (x, i2) { return out.indexOf(x) === i2; });
      return { value: out };
    }
    if (t === 'tuple') {
      if (!Array.isArray(v) || v.length !== def.items.length) return { error: 'Неверный формат' };
      var tv = [];
      for (var j = 0; j < def.items.length; j++) {
        var rr = checkField(def.items[j], v[j]);
        if (rr.error) return { error: rr.error };
        tv.push(rr.value);
      }
      return { value: tv };
    }
    if (t === 'object') {
      if (typeof v !== 'object' || Array.isArray(v)) return { error: 'Неверный формат' };
      if (def.fields) { var res = validateWith(def.fields, v); return res.ok ? { value: res.value } : { error: firstError(res.errors) }; }
      var json = JSON.stringify(v);
      if (json.length > (def.maxBytes || 20000)) return { error: 'Слишком большой объём данных' };
      return { value: JSON.parse(json) };
    }
    return { error: 'Неизвестный тип поля' };
  }
  function firstError(errs) { var k = Object.keys(errs)[0]; return k ? k + ': ' + errs[k] : ''; }

  /** Проверяет объект по схеме; возвращает { ok, value, errors } */
  function validateWith(schema, input) {
    input = input || {};
    var value = {}, errors = {};
    Object.keys(schema).forEach(function (k) {
      var r = checkField(schema[k], input[k]);
      if (r.error) errors[k] = r.error; else value[k] = r.value;
    });
    return { ok: !Object.keys(errors).length, value: value, errors: errors };
  }

  var S = function (min, max, req) { return { type: 'string', min: min, max: max, required: !!req }; };
  var REGION_CODES = D.REGIONS.map(function (r) { return r.code; });
  var LAND_CODES = Object.keys(D.LANDSCAPES), FEAT_CODES = Object.keys(D.FEATURES);
  var accessDef = { type: 'tuple', items: [{ type: 'enum', values: Object.keys(D.ACCESS_STATUS), required: true }, { type: 'string', max: 300 }] };

  var SCHEMAS = {
    register: {
      name: { type: 'string', min: 2, max: 60, required: true },
      email: { type: 'email', max: 254, required: true },
      password: { type: 'password', min: 8, max: 128, required: true },
      needs: { type: 'array', of: { type: 'enum', values: NEED_CODES }, maxItems: 5, unique: true },
      consent: { type: 'accept', required: true, requiredMsg: 'Нужно согласие на обработку персональных данных' }
    },
    login: { email: { type: 'email', max: 254, required: true }, password: { type: 'string', max: 128, required: true }, remember: { type: 'bool' } },
    profile: { name: { type: 'string', min: 2, max: 60, required: true }, needs: { type: 'array', of: { type: 'enum', values: NEED_CODES }, maxItems: 5, unique: true }, companion: { type: 'bool' }, settings: { type: 'object', maxBytes: 2000 } },
    password: { current: { type: 'string', max: 128, required: true }, next: { type: 'password', min: 8, max: 128, required: true } },
    review: {
      rating: { type: 'int', minv: 1, maxv: 5, required: true },
      accessMatch: { type: 'enum', values: ['yes', 'partly', 'no', 'na'], required: true },
      text: { type: 'text', min: 10, max: 2000, required: true },
      needs: { type: 'array', of: { type: 'enum', values: NEED_CODES }, maxItems: 5, unique: true },
      visitedAt: { type: 'month' }
    },
    report: {
      category: { type: 'enum', values: NEED_CODES.concat(['general']), required: true },
      text: { type: 'text', min: 10, max: 2000, required: true },
      contact: S(0, 120)
    },
    feedback: {
      topic: { type: 'enum', values: Object.keys(D.FEEDBACK_TOPICS), required: true },
      message: { type: 'text', min: 10, max: 3000, required: true },
      name: S(0, 60), email: { type: 'email', max: 254 }, page: S(0, 200)
    },
    plan: {
      routeSlug: { type: 'slug', required: true },
      title: S(0, 100),
      startDate: { type: 'date', required: true },
      endDate: { type: 'date', required: true },
      groupSize: { type: 'int', minv: 1, maxv: 30, required: true },
      needs: { type: 'array', of: { type: 'enum', values: NEED_CODES.concat(['kids', 'elderly', 'dog']) }, maxItems: 8, unique: true },
      contactName: S(0, 60), contactPhone: { type: 'phone', max: 30 }, notes: { type: 'text', max: 2000 },
      tasks: { type: 'array', maxItems: 60, of: { type: 'object', fields: { id: S(1, 20, true), code: S(0, 30), text: { type: 'text', min: 1, max: 300, required: true }, due: { type: 'date' }, done: { type: 'bool' }, link: S(0, 300) } } }
    },
    gearList: {
      title: S(2, 100, true), routeSlug: { type: 'string', max: 60 },
      params: { type: 'object', maxBytes: 2000 },
      items: { type: 'array', maxItems: 150, of: { type: 'object', fields: { id: S(1, 40, true), name: S(1, 200, true), qty: { type: 'int', minv: 1, maxv: 99, default: 1 }, weight: { type: 'int', minv: 0, maxv: 100000, default: 0 }, checked: { type: 'bool' }, cat: S(0, 20) } } }
    },
    alert: { text: S(3, 300, true), level: { type: 'enum', values: ['info', 'warning'], required: true }, link: { type: 'url', max: 300 }, until: { type: 'date' } },
    route: {
      slug: { type: 'slug', required: true }, title: S(3, 120, true),
      region: { type: 'enum', values: REGION_CODES, required: true }, area: S(0, 200), areaType: { type: 'enum', values: Object.keys(D.AREA_TYPES), required: true },
      difficulty: { type: 'int', minv: 1, maxv: 5, required: true }, lengthKm: { type: 'number', minv: 0.1, maxv: 2000, required: true },
      gainM: { type: 'int', minv: 0, maxv: 10000, required: true }, durationH: { type: 'number', minv: 0.1, maxv: 500, required: true },
      days: { type: 'tuple', items: [{ type: 'int', minv: 1, maxv: 60, required: true }, { type: 'int', minv: 1, maxv: 60, required: true }], required: true },
      type: { type: 'enum', values: Object.keys(D.ROUTE_TYPES), required: true }, topM: { type: 'int', minv: 0, maxv: 6000 },
      months: { type: 'array', of: { type: 'int', minv: 1, maxv: 12 }, maxItems: 12, unique: true, required: true },
      cover: S(1, 40, true), landscapes: { type: 'array', of: { type: 'enum', values: LAND_CODES }, unique: true, maxItems: 9 },
      features: { type: 'array', of: { type: 'enum', values: FEAT_CODES }, unique: true, maxItems: 7 },
      summary: { type: 'text', min: 20, max: 600, required: true },
      easy: { type: 'array', of: { type: 'text', min: 2, max: 300 }, maxItems: 12, itemLabel: 'Предложение' },
      tiflo: { type: 'text', max: 3000 },
      description: { type: 'array', of: { type: 'text', min: 2, max: 3000 }, maxItems: 10, itemLabel: 'Абзац' },
      highlights: { type: 'array', of: S(2, 200), maxItems: 12 },
      stages: { type: 'array', maxItems: 20, of: { type: 'tuple', items: [S(1, 120, true), { type: 'number', minv: 0, maxv: 2000, required: true }, { type: 'text', max: 600 }] } },
      env: { type: 'array', maxItems: 15, of: { type: 'tuple', items: [S(1, 60, true), S(1, 300, true)] } },
      start: { type: 'object', required: true, fields: { name: S(2, 200, true), lat: { type: 'number', minv: 41, maxv: 82, required: true }, lon: { type: 'number', minv: 19, maxv: 180, required: true }, transport: { type: 'text', max: 600 } } },
      access: { type: 'object', required: true, fields: { K: Object.assign({ required: true }, accessDef), O: Object.assign({ required: true }, accessDef), S: Object.assign({ required: true }, accessDef), G: Object.assign({ required: true }, accessDef), U: Object.assign({ required: true }, accessDef) } },
      restrictions: { type: 'array', maxItems: 12, of: { type: 'tuple', items: [S(2, 30, true), S(0, 300)] } },
      safety: { type: 'array', of: { type: 'text', min: 2, max: 400 }, maxItems: 12 },
      sources: { type: 'array', maxItems: 12, of: { type: 'tuple', items: [S(2, 200, true), { type: 'url', max: 400, required: true }] } },
      sleep: { type: 'enum', values: ['hut', 'tent'] },
      check: { type: 'object', fields: { date: { type: 'month', required: true }, level: { type: 'enum', values: Object.keys(D.CHECK_LEVELS), required: true } } },
      status: { type: 'enum', values: ['published', 'hidden'], default: 'published' }
    }
  };

  function validate(name, input) {
    var res = validateWith(SCHEMAS[name], input);
    if (name === 'plan' && res.ok && res.value.endDate < res.value.startDate) { res.ok = false; res.errors.endDate = 'Дата окончания не может быть раньше даты начала'; }
    if (name === 'route' && res.ok && res.value.days[1] < res.value.days[0]) { res.ok = false; res.errors.days = 'Максимум дней не может быть меньше минимума'; }
    return res;
  }

  /* ---------- Экспорт ---------- */

  /** Поля маршрута для карточек каталога (облегчённый ответ списка) */
  var CARD_FIELDS = ['slug', 'title', 'region', 'area', 'areaType', 'difficulty', 'lengthKm', 'gainM', 'durationH', 'days', 'type', 'topM',
    'months', 'cover', 'landscapes', 'features', 'summary', 'easy', 'start', 'access', 'restrictions', 'sources', 'check', 'sleep', 'status', 'rating', 'reviewsCount'];
  function toCard(r) { var c = {}; CARD_FIELDS.forEach(function (k) { if (r[k] !== undefined) c[k] = r[k]; }); return c; }

  function xmlEscape(s) { return String(s).replace(/[<>&'"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]; }); }
  /** GPX 1.1 с треком и точкой старта (для навигаторов и офлайн-карт) */
  function toGPX(r, track) {
    var pts = (track && track.pts) || [[r.start.lat, r.start.lon]];
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="Тропы без барьеров" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      '  <metadata><name>' + xmlEscape(r.title) + '</name><desc>' + xmlEscape(r.summary) + '</desc>' +
      '<copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/</license></copyright></metadata>\n' +
      '  <wpt lat="' + r.start.lat + '" lon="' + r.start.lon + '"><name>Старт: ' + xmlEscape(r.start.name) + '</name></wpt>\n' +
      '  <trk><name>' + xmlEscape(r.title) + '</name><trkseg>\n' +
      pts.map(function (p) { return '    <trkpt lat="' + p[0] + '" lon="' + p[1] + '"/>'; }).join('\n') +
      '\n  </trkseg></trk>\n</gpx>\n';
  }

  return {
    CARD_FIELDS: CARD_FIELDS, toCard: toCard, toGPX: toGPX,
    plural: plural, num: num, km: km, meters: meters, hours: hours, daysText: daysText, durationText: durationText,
    monthsText: monthsText, isoDate: isoDate, parseDate: parseDate, addDays: addDays, diffDays: diffDays, dateText: dateText,
    checkText: checkText, norm: norm, regionOf: regionOf, districtOf: districtOf, accessRank: accessRank, suits: suits,
    restrictionLevel: restrictionLevel, durationClass: durationClass, DURATION_TEXT: DURATION_TEXT, filterRoutes: filterRoutes,
    sortRoutes: sortRoutes, haversine: haversine, scoreRoutes: scoreRoutes, seasonOfMonth: seasonOfMonth,
    gearParamsFromRoute: gearParamsFromRoute, buildGear: buildGear, planTasks: planTasks, taskState: taskState,
    validate: validate, SCHEMAS: SCHEMAS
  };
});

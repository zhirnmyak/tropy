/**
 * Переиспользуемые элементы интерфейса: карточки маршрутов, бейджи сложности и доступности,
 * поля форм с подсказками, хлебные крошки, избранное и сравнение.
 * Принцип: информация никогда не передаётся только цветом — всегда есть текст или форма значка.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, L = App.L, D = App.D, ui = App.ui;

  /* ---------- Сложность ---------- */

  ui.diffText = function (d) { return D.DIFFICULTY[d].name + ' (' + d + ' из 5)'; };
  ui.diff = function (d, o) {
    var dots = [1, 2, 3, 4, 5].map(function (i) { return h`<i class="${i <= d ? 'on' : ''}"></i>`; });
    return h`<span class="diff diff-${d}${o && o.large ? ' diff-lg' : ''}" title="${D.DIFFICULTY[d].hint}">
      <span class="diff-dots" aria-hidden="true">${dots}</span><span class="diff-name"><span class="sr-only">Сложность: </span>${D.DIFFICULTY[d].name}<span class="sr-only">, ${d} из 5</span></span></span>`;
  };

  /* ---------- Доступность (категории К, О, С, Г, У) ---------- */

  var ACC_ICON = { DP: 'check', DCH: 'half', DU: 'user', VND: 'x' }; // разные формы значков, а не только цвет
  ui.accIcon = function (status) { return App.icon(ACC_ICON[status], 'acc-sym-i'); };
  /** Компактная строка для карточек: буква категории + значок статуса, полный текст — для экранных дикторов */
  ui.accessMini = function (r, needs) {
    return h`<ul class="access-mini" aria-label="Доступность для разных посетителей">${D.ACCESS_CATEGORIES.map(function (c) {
      var a = r.access[c.code], st = D.ACCESS_STATUS[a[0]];
      var mark = needs && needs.indexOf(c.code) !== -1;
      return h`<li class="acc acc-${st.code} tone-${st.tone}${mark ? ' acc-mine' : ''}" title="${c.name}: ${st.name.toLowerCase()}">
        <span class="acc-letter" aria-hidden="true">${c.letter}</span><span class="acc-sym" aria-hidden="true">${ui.accIcon(st.code)}</span>
        <span class="sr-only">${c.name}: ${st.name.toLowerCase()}.</span></li>`;
    })}</ul>`;
  };
  ui.accessStatus = function (code) {
    var st = D.ACCESS_STATUS[code];
    return h`<span class="acc-status acc-${st.code} tone-${st.tone}"><span class="acc-sym" aria-hidden="true">${ui.accIcon(st.code)}</span>${st.name}</span>`;
  };
  ui.needIcon = function (code) { return App.icon('cat-' + code); };
  ui.needName = function (code) {
    var extra = { kids: 'Дети', elderly: 'Пожилые участники', dog: 'Собака-проводник', general: 'Общее' };
    return D.ACCESS_BY_CODE[code] ? D.ACCESS_BY_CODE[code].name : (extra[code] || code);
  };
  /** Легенда значков доступности */
  ui.accessLegend = function () {
    return h`<details class="details legend"><summary>${App.icon('info')} Как читать значки доступности</summary>
      <div class="legend-body">
        <p>Буквы — категории посетителей (как в паспортах доступности объектов):</p>
        <ul class="legend-list">${D.ACCESS_CATEGORIES.map(function (c) { return h`<li><span class="acc-letter" aria-hidden="true">${c.letter}</span> ${c.name}</li>`; })}</ul>
        <p>Значки — насколько маршрут доступен:</p>
        <ul class="legend-list">${Object.keys(D.ACCESS_STATUS).map(function (k) { return h`<li>${ui.accessStatus(k)}</li>`; })}</ul>
        <p><a href="#/rules?focus=method">Подробнее о методике оценки</a></p>
      </div></details>`;
  };

  /* ---------- Ограничения ---------- */

  var LEVEL_ICON = ['check', 'ticket', 'doc'];
  ui.restrictionBadge = function (level) {
    return h`<span class="badge badge-level-${level}">${App.icon(LEVEL_ICON[level])}${D.RESTRICTION_LEVELS[level]}</span>`;
  };
  ui.routeLevel = function (r) { return L.restrictionLevel(r, App.state.kb); };
  /** «Национальный парк «Куршская коса»» без повтора типа территории */
  ui.areaText = function (r) {
    var type = D.AREA_TYPES[r.areaType] || '';
    if (!r.area) return type;
    return r.area.toLowerCase().indexOf(type.toLowerCase()) === 0 || r.areaType === 'none' ? r.area : type + ': ' + r.area;
  };

  /* ---------- Иллюстрации ---------- */

  ui.cover = function (name, o) {
    o = o || {};
    var alt = D.COVERS[name] || '';
    var small = App.asset('img/routes/' + name + '-640.webp');
    var srcset = App.standalone ? '' : small + ' 640w, img/routes/' + name + '-1280.webp 1280w';
    // Если описание показано подписью, alt пустой — иначе экранный диктор прочитает текст дважды
    return h`<figure class="cover${o.caption ? ' cover-captioned' : ''}${o.cls ? ' ' + o.cls : ''}">
      <img src="${o.large && !App.standalone ? 'img/routes/' + name + '-1280.webp' : small}"${srcset ? h` srcset="${srcset}" sizes="${o.sizes || '(min-width: 960px) 33vw, 100vw'}"` : ''}
        width="640" height="427" alt="${o.caption ? '' : alt}" loading="${o.eager ? 'eager' : 'lazy'}" decoding="async"${o.eager ? App.raw(' fetchpriority="high"') : ''}>
      <figcaption class="cover-cap"><span class="cover-tag">Иллюстрация</span>${o.caption ? h`<span class="cover-alt">${alt}</span>` : h`<span class="cover-alt cover-alt-hidden">${alt}</span>`}</figcaption>
    </figure>`;
  };

  /* ---------- Недавно просмотренные маршруты (хранятся только на этом устройстве) ---------- */

  App.recent = {
    KEY: 'tropy.recent',
    MAX: 8,
    list: function () {
      var v = App.store.get(App.recent.KEY, []);
      return Array.isArray(v) ? v.filter(function (s) { return typeof s === 'string' && s; }) : [];
    },
    add: function (slug) {
      if (!slug) return;
      var list = App.recent.list().filter(function (s) { return s !== slug; });
      list.unshift(slug);
      App.store.set(App.recent.KEY, list.slice(0, App.recent.MAX));
    },
    clear: function () { App.store.remove(App.recent.KEY); }
  };

  // Запоминаем открытые страницы маршрутов — они появятся на главной в блоке «Вы недавно смотрели»
  App.listen('rendered', function () {
    var m = /^#\/routes\/([^\/?#]+)/.exec(location.hash || '');
    if (!m) return;
    var slug;
    try { slug = decodeURIComponent(m[1]); } catch (e) { return; }
    var known = ((App.state && App.state.routes) || []).some(function (r) { return r.slug === slug; });
    if (known) App.recent.add(slug);
  });

  /* ---------- Карточка маршрута ---------- */

  ui.routeCard = function (r, o) {
    o = o || {};
    var needs = o.needs || [];
    var level = ui.routeLevel(r);
    var head = o.headingLevel || 3;
    var cid = App.uid('rc-' + r.slug);
    var title = h`<a class="card-link" href="#/routes/${r.slug}">${r.title}</a>`;
    return h`<article class="card route-card${o.compact ? ' route-card-compact' : ''}" aria-labelledby="${cid}">
      ${o.noCover ? '' : ui.cover(r.cover, { sizes: o.sizes })}
      <div class="route-card-body">
        ${App.raw('<h' + head + ' class="route-card-title" id="' + cid + '">')}${title}${App.raw('</h' + head + '>')}
        <p class="route-card-region">${App.icon('pin')}${L.regionOf(r).name}${r.area ? h`<span class="sep" aria-hidden="true"> · </span><span class="muted">${r.area}</span>` : ''}</p>
        ${o.reasons ? o.reasons : ''}
        <ul class="facts" aria-label="Основные параметры">
          <li>${ui.diff(r.difficulty)}</li>
          <li>${App.icon('route')}${L.km(r.lengthKm)}</li>
          <li>${App.icon('clock')}${L.durationText(r)}</li>
          ${r.gainM ? h`<li>${App.icon('mountain')}<span class="sr-only">Набор высоты </span>↑ ${L.meters(r.gainM)}</li>` : ''}
        </ul>
        ${ui.accessMini(r, needs)}
        <p class="route-card-level">${ui.restrictionBadge(level)}${r.rating ? h` <span class="rating">${App.icon('star')}${L.num(r.rating)}<span class="sr-only"> из 5, отзывов: ${r.reviewsCount}</span><span aria-hidden="true"> (${r.reviewsCount})</span></span>` : ''}${o.distance != null ? h` <span class="badge">${App.icon('target')}${L.km(Math.round(o.distance))} от вас</span>` : ''}</p>
        ${o.noActions ? '' : h`<div class="route-card-actions">${ui.favButton(r.slug, { small: true, describedBy: cid })}${ui.compareToggle(r.slug, cid)}</div>`}
      </div>
    </article>`;
  };

  /* ---------- Избранное ---------- */

  App.fav = {
    has: function (slug) { return App.state.favorites.indexOf(slug) !== -1; },
    toggle: async function (slug, btn) {
      if (!App.state.user) return App.askLogin('Войдите, чтобы сохранять маршруты в избранное и видеть их на любом устройстве.');
      var on = !App.fav.has(slug);
      try {
        if (on) await App.api.put('favorites/' + slug); else await App.api.del('favorites/' + slug);
        if (on) App.state.favorites.unshift(slug); else App.state.favorites = App.state.favorites.filter(function (s) { return s !== slug; });
        App.$$('[data-fav="' + slug + '"]').forEach(function (b) { syncFav(b, on); });
        App.announce(on ? 'Маршрут добавлен в избранное' : 'Маршрут убран из избранного');
      } catch (e) { App.toast(e.message, 'bad'); }
    }
  };
  function syncFav(b, on) {
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    var l = b.querySelector('.fav-label'); if (l) l.textContent = on ? 'В избранном' : 'В избранное';
  }
  ui.favButton = function (slug, o) {
    o = o || {};
    var on = App.fav.has(slug);
    return h`<button type="button" class="btn btn-secondary btn-fav${o.small ? ' btn-small' : ''}" data-action="fav" data-fav="${slug}" aria-pressed="${on ? 'true' : 'false'}"${o.describedBy ? h` aria-describedby="${o.describedBy}"` : ''}>
      ${App.icon('heart')}<span class="fav-label">${on ? 'В избранном' : 'В избранное'}</span></button>`;
  };

  /* ---------- Сравнение (до 3 маршрутов, хранится в браузере) ---------- */

  App.compare = {
    MAX: 3,
    list: function () { return App.store.get('tropy.compare', []).filter(function (s) { return App.state.routes.some(function (r) { return r.slug === s; }); }); },
    set: function (list) { App.store.set('tropy.compare', list); App.compare.tray(); },
    toggle: function (slug, on) {
      var list = App.compare.list().filter(function (s) { return s !== slug; });
      if (on) {
        if (list.length >= App.compare.MAX) { App.toast('Сравнить можно до трёх маршрутов. Уберите один из списка сравнения.', 'warn'); return false; }
        list.push(slug);
      }
      App.compare.set(list);
      App.announce(on ? 'Добавлено к сравнению: ' + list.length + ' из 3' : 'Убрано из сравнения');
      return true;
    },
    tray: function () {
      var el = document.getElementById('compare-tray');
      if (!el) return;
      var list = App.compare.list();
      var onPage = App.parseHash().path === '/compare';
      if (!list.length || onPage) { el.hidden = true; el.innerHTML = ''; return; }
      el.hidden = false;
      el.innerHTML = String(h`<div class="container compare-tray-row">
        <p class="compare-tray-text">${App.icon('compare')}<span>К сравнению: <strong>${list.length}</strong> из 3</span></p>
        <a class="btn btn-primary btn-small" href="#/compare?r=${list.join(',')}">Сравнить</a>
        <button type="button" class="btn btn-ghost btn-small" data-action="compare-clear">Очистить</button></div>`);
    }
  };
  ui.compareToggle = function (slug, describedBy) {
    var id = 'cmp-' + slug + '-' + App.uid('c');
    var on = App.compare.list().indexOf(slug) !== -1;
    return h`<label class="check check-inline compare-check" for="${id}"><input type="checkbox" id="${id}" data-change="compare" value="${slug}"${App.on(on, 'checked')}${describedBy ? h` aria-describedby="${describedBy}"` : ''}><span>Сравнить</span></label>`;
  };
  App.change('compare', function (el) {
    if (!App.compare.toggle(el.value, el.checked)) el.checked = false;
    App.$$('[data-change="compare"][value="' + el.value + '"]').forEach(function (x) { if (x !== el) x.checked = el.checked; });
  });
  App.actions({
    fav: function (el) { App.fav.toggle(el.getAttribute('data-fav'), el); },
    'compare-clear': function () { App.compare.set([]); App.$$('[data-change="compare"]').forEach(function (x) { x.checked = false; }); App.announce('Список сравнения очищен'); }
  });

  /** Просьба войти (диалог) с возвратом на текущую страницу после входа */
  App.askLogin = async function (text) {
    var ok = await App.confirm({ title: 'Нужно войти', text: text, ok: 'Войти', cancel: 'Не сейчас' });
    if (ok) App.go('/login?next=' + encodeURIComponent(App.here()));
  };

  /* ---------- Каркас страницы ---------- */

  ui.crumbs = function (items) {
    return h`<nav class="crumbs" aria-label="Навигационная цепочка"><ol>
      <li><a href="#/">Главная</a></li>
      ${items.map(function (it, i) { return i === items.length - 1 && !it[1] ? h`<li><span aria-current="page">${it[0]}</span></li>` : h`<li><a href="${it[1]}">${it[0]}</a></li>`; })}
    </ol></nav>`;
  };
  ui.pageHead = function (o) {
    return h`<header class="page-head${o.cls ? ' ' + o.cls : ''}">
      ${o.crumbs ? ui.crumbs(o.crumbs) : ''}
      <h1 tabindex="-1">${o.icon ? App.icon(o.icon, 'h1-icon') : ''}${o.title}</h1>
      ${o.lead ? h`<p class="lead">${o.lead}</p>` : ''}
      ${o.extra || ''}
    </header>`;
  };
  ui.notice = function (tone, title, body, icon) {
    var ic = icon || { ok: 'check', warn: 'warn', bad: 'warn', info: 'info' }[tone] || 'info';
    return h`<div class="notice notice-${tone}">${App.icon(ic, 'notice-i')}<div>${title ? h`<p class="notice-title">${title}</p>` : ''}${body ? (typeof body === 'string' ? h`<p>${body}</p>` : body) : ''}</div></div>`;
  };
  ui.empty = function (title, body, actions) {
    return h`<div class="empty">${App.icon('compass', 'empty-i')}<p class="empty-title">${title}</p>${body ? h`<p>${body}</p>` : ''}${actions ? h`<div class="row">${actions}</div>` : ''}</div>`;
  };
  ui.stars = function (n) {
    var full = Math.round(n);
    return h`<span class="stars" role="img" aria-label="Оценка ${L.num(n)} из 5"><span aria-hidden="true">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span></span>`;
  };
  ui.date = function (iso) { return iso ? L.dateText(String(iso).slice(0, 10)) : ''; };
  ui.extLink = function (title, url, cls) {
    return h`<a href="${App.safeUrl(url)}" class="${cls || ''}" target="_blank" rel="noopener noreferrer">${title}${App.icon('external', 'ext-i')}<span class="sr-only"> (откроется в новой вкладке)</span></a>`;
  };
  ui.loading = function (text) { return h`<p class="loading" role="status">${App.icon('compass', 'spin')}${text || 'Загрузка…'}</p>`; };

  /* ---------- Поля форм ---------- */

  /**
   * Поле формы с подписью, подсказкой и местом для ошибки.
   * o: {name, label, type, value, hint, required, autocomplete, rows, options[[v,t]], attrs, id, cls, inputmode}
   */
  ui.field = function (o) {
    var id = o.id || 'f-' + o.name.replace(/[^\w-]/g, '-') + '-' + App.uid('x');
    var hid = o.hint ? id + '-hint' : '';
    var common = h` id="${id}" name="${o.name}"${o.required ? App.raw(' required aria-required="true"') : ''}${hid ? h` aria-describedby="${hid}"` : ''}${o.autocomplete ? h` autocomplete="${o.autocomplete}"` : ''}${o.attrs ? App.raw(' ' + o.attrs) : ''}`;
    var control;
    if (o.type === 'textarea') control = h`<textarea class="textarea"${common} rows="${o.rows || 4}">${o.value == null ? '' : o.value}</textarea>`;
    else if (o.type === 'select') {
      control = h`<select class="select"${common}>${o.options.map(function (op) { return h`<option value="${op[0]}"${App.on(String(o.value) === String(op[0]), 'selected')}>${op[1]}</option>`; })}</select>`;
    } else control = h`<input class="input" type="${o.type || 'text'}"${common} value="${o.value == null ? '' : o.value}"${o.inputmode ? h` inputmode="${o.inputmode}"` : ''}>`;
    if (o.toggle) control = h`<div class="input-group">${control}<button type="button" class="btn btn-secondary btn-small" data-action="toggle-password" aria-controls="${id}" aria-pressed="false">${App.icon('eye')}<span>Показать</span></button></div>`;
    return h`<div class="field${o.cls ? ' ' + o.cls : ''}">
      <label for="${id}">${o.label}${o.required ? h`<span class="req" aria-hidden="true"> *</span>` : h`<span class="opt"> (необязательно)</span>`}</label>
      ${o.hint ? h`<p class="hint" id="${hid}">${o.hint}</p>` : ''}
      ${control}
    </div>`;
  };
  /** Группа чекбоксов или радиокнопок. o: {name, legend, items[[value,label,hint]], values[], type, hint, cls, required, icons} */
  ui.checks = function (o) {
    var type = o.type || 'checkbox', values = (o.values || []).map(String);
    var hid = o.hint ? App.uid('h') : '';
    return h`<fieldset class="field fieldset${o.cls ? ' ' + o.cls : ''}" data-field="${o.name}"${hid ? h` aria-describedby="${hid}"` : ''}>
      <legend>${o.legend}${o.required ? h`<span class="req" aria-hidden="true"> *</span>` : ''}</legend>
      ${o.hint ? h`<p class="hint" id="${hid}">${o.hint}</p>` : ''}
      <div class="check-grid">${o.items.map(function (it) {
        var id = App.uid('c-' + o.name);
        return h`<label class="check${it[2] ? ' check-hint' : ''}" for="${id}"><input type="${type}" id="${id}" name="${o.name}" value="${it[0]}"${App.on(values.indexOf(String(it[0])) !== -1, 'checked')}${o.array ? App.raw(' data-array') : ''}${o.required && type === 'radio' ? App.raw(' required') : ''}>
          ${o.icons ? App.icon(o.icons + it[0], 'check-i') : ''}<span>${it[1]}${it[2] ? h`<small>${it[2]}</small>` : ''}</span></label>`;
      })}</div>
    </fieldset>`;
  };
  ui.needsItems = function (extra) {
    var items = D.ACCESS_CATEGORIES.map(function (c) { return [c.code, c.name]; });
    if (extra) items = items.concat([['kids', 'В группе есть дети'], ['elderly', 'В группе есть пожилые люди'], ['dog', 'Со мной собака-проводник']]);
    return items;
  };
  App.actions({
    'toggle-password': function (btn) {
      var inp = document.getElementById(btn.getAttribute('aria-controls'));
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      btn.querySelector('span').textContent = show ? 'Скрыть' : 'Показать';
      App.announce(show ? 'Пароль показан' : 'Пароль скрыт');
    }
  });

  /** Таблица с горизонтальной прокруткой, доступной с клавиатуры */
  ui.tableWrap = function (label, table) { return h`<div class="table-wrap" tabindex="0" role="region" aria-label="${label}">${table}</div>`; };
  ui.routeBySlug = function (slug) { return App.state.routes.find(function (r) { return r.slug === slug; }); };
  ui.routeOptions = function (selected, withEmpty) {
    var list = App.state.routes.slice().sort(function (a, b) { return a.title.localeCompare(b.title, 'ru'); });
    var opts = list.map(function (r) { return [r.slug, r.title + ' — ' + L.regionOf(r).name]; });
    if (withEmpty) opts.unshift(['', withEmpty]);
    return opts;
  };
})();

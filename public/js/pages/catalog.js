/**
 * Каталог маршрутов: фильтры синхронизированы с адресной строкой (ссылкой можно поделиться),
 * результаты обновляются без перезагрузки, количество найденного объявляется экранным дикторам.
 * Фильтрация — общая функция TROPY.logic.filterRoutes (те же правила, что в SQL на сервере).
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;

  var SORTS = [['', 'По умолчанию'], ['access', 'Сначала самые доступные'], ['diff-asc', 'Сначала лёгкие'], ['diff-desc', 'Сначала сложные'],
    ['len-asc', 'Сначала короткие'], ['len-desc', 'Сначала длинные'], ['rating', 'По оценкам посетителей'], ['name', 'По названию']];
  var LENGTHS = [['0', 'Любая'], ['3', 'До 3 км'], ['10', 'До 10 км'], ['20', 'До 20 км'], ['50', 'До 50 км']];
  var list = function (v) { return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); };

  function fromQuery(q) {
    return {
      q: q.get('q') || '', needs: list(q.get('need')).filter(function (c) { return D.ACCESS_BY_CODE[c]; }), companion: q.get('companion') === '1',
      diff: list(q.get('diff')).map(Number).filter(function (n) { return n >= 1 && n <= 5; }), lenMax: Number(q.get('lenMax')) || 0,
      days: ['one', 'multi'].indexOf(q.get('days')) !== -1 ? q.get('days') : '', district: D.DISTRICT_BY_CODE[q.get('district')] ? q.get('district') : '',
      region: D.REGION_BY_CODE[q.get('region')] ? q.get('region') : '', month: Math.min(12, Number(q.get('month')) || 0),
      land: list(q.get('land')).filter(function (x) { return D.LANDSCAPES[x]; }), feat: list(q.get('feat')).filter(function (x) { return D.FEATURES[x]; }),
      noPermit: q.get('noPermit') === '1', sort: q.get('sort') || ''
    };
  }
  function fromForm(d) {
    return {
      q: String(d.q || '').trim(), needs: d.need || [], companion: !!d.companion, diff: (d.diff || []).map(Number), lenMax: Number(d.lenMax) || 0,
      days: d.days || '', district: d.district || '', region: d.region || '', month: Number(d.month) || 0, land: d.land || [], feat: d.feat || [],
      noPermit: !!d.noPermit, sort: d.sort || ''
    };
  }
  function toQuery(f) {
    return { q: f.q, need: f.needs, companion: f.companion, diff: f.diff, lenMax: f.lenMax, days: f.days, district: f.district, region: f.region, month: f.month, land: f.land, feat: f.feat, noPermit: f.noPermit, sort: f.sort };
  }
  function activeCount(f) {
    return [f.q, f.needs.length, f.diff.length, f.lenMax, f.days, f.district, f.region, f.month, f.land.length, f.feat.length, f.noPermit].filter(Boolean).length;
  }
  function apply(f) {
    var res = L.filterRoutes(S.routes, f, S.kb);
    var sort = f.sort || (f.needs.length ? 'access' : 'diff-asc');
    return L.sortRoutes(res, sort, { needs: f.needs });
  }

  /** Активные фильтры — кнопки «убрать» */
  function chips(f) {
    var c = [];
    if (f.q) c.push(['q', '', 'Поиск: «' + f.q + '»']);
    f.needs.forEach(function (x) { c.push(['need', x, D.ACCESS_BY_CODE[x].name]); });
    if (f.companion) c.push(['companion', '', 'С сопровождающим']);
    f.diff.forEach(function (x) { c.push(['diff', String(x), D.DIFFICULTY[x].name]); });
    if (f.lenMax) c.push(['lenMax', '', 'До ' + f.lenMax + ' км']);
    if (f.days) c.push(['days', '', f.days === 'one' ? 'За один день' : 'С ночёвкой']);
    if (f.district) c.push(['district', '', D.DISTRICT_BY_CODE[f.district].name + ' округ']);
    if (f.region) c.push(['region', '', D.REGION_BY_CODE[f.region].name]);
    if (f.month) c.push(['month', '', 'Сезон: ' + D.MONTHS[f.month - 1]]);
    f.land.forEach(function (x) { c.push(['land', x, D.LANDSCAPES[x]]); });
    f.feat.forEach(function (x) { c.push(['feat', x, D.FEATURES[x]]); });
    if (f.noPermit) c.push(['noPermit', '', 'Без пропусков']);
    if (!c.length) return '';
    return h`<ul class="chips" aria-label="Выбранные фильтры">${c.map(function (x) {
      return h`<li><button type="button" class="chip chip-remove" data-action="filter-remove" data-key="${x[0]}" data-value="${x[1]}" aria-label="Убрать фильтр: ${x[2]}">${x[2]}${App.icon('x')}</button></li>`;
    })}<li><button type="button" class="chip chip-clear" data-action="filters-reset">Сбросить все</button></li></ul>`;
  }

  function results(f, view) {
    var items = apply(f);
    if (!items.length) {
      return h`${ui.empty('Ничего не нашлось', 'Попробуйте убрать часть фильтров. Чаще всего сужают выбор доступность, регион и месяц.',
        h`<button type="button" class="btn btn-primary" data-action="filters-reset">Сбросить фильтры</button><a class="btn btn-secondary" href="#/pick">Подобрать маршрут по вопросам</a>`)}`;
    }
    return h`<ul class="${view === 'list' ? 'list-cards' : 'grid-cards'}" aria-label="Маршруты">${items.map(function (r) { return h`<li>${ui.routeCard(r, { needs: f.needs, compact: view === 'list' })}</li>`; })}</ul>`;
  }
  function countText(n) { return n ? 'Найдено: ' + App.count(n, ['маршрут', 'маршрута', 'маршрутов']) : 'Не найдено ни одного маршрута'; }

  function regionOptions(district) {
    var regs = D.REGIONS.filter(function (r) { return !district || r.district === district; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    return [['', 'Все регионы']].concat(regs.map(function (r) { return [r.code, r.name]; }));
  }

  function filtersForm(f) {
    var user = S.user;
    var profileNeeds = user && user.needs && user.needs.length && user.needs.join(',') !== f.needs.join(',');
    return h`<form id="filters-form" class="filters-form" data-form="filters" data-change="filters" data-input="filters-q" aria-label="Фильтры маршрутов">
      <div class="field" role="search">
        <label for="flt-q">Поиск</label>
        <input class="input" type="search" id="flt-q" name="q" value="${f.q}" placeholder="Название, регион, место" autocomplete="off" enterkeyhint="search">
      </div>
      ${ui.checks({ name: 'need', legend: 'Доступность', hint: 'Покажем маршруты, доступные полностью или частично для всех отмеченных категорий', items: D.ACCESS_CATEGORIES.map(function (c) { return [c.code, c.name]; }), values: f.needs, icons: 'cat-', array: true, cls: 'checks-access' })}
      <label class="check"><input type="checkbox" name="companion" value="1"${App.on(f.companion, 'checked')}><span>Со мной будет помощник<small>Добавить маршруты, доступные с сопровождающим</small></span></label>
      ${profileNeeds ? h`<button type="button" class="btn btn-ghost btn-small" data-action="filters-profile">${App.icon('user')}Учесть мои потребности из профиля</button>` : ''}
      ${ui.checks({ name: 'diff', legend: 'Сложность', items: [1, 2, 3, 4, 5].map(function (d) { return [d, D.DIFFICULTY[d].name]; }), values: f.diff, array: true, cls: 'checks-diff' })}
      <div class="field-row">
        ${ui.field({ name: 'district', label: 'Федеральный округ', type: 'select', value: f.district, required: false, options: [['', 'Вся Россия']].concat(D.DISTRICTS.map(function (d) { return [d.code, d.name]; })), id: 'flt-district' })}
        ${ui.field({ name: 'region', label: 'Регион', type: 'select', value: f.region, options: regionOptions(f.district), id: 'flt-region' })}
      </div>
      <div class="field-row">
        ${ui.field({ name: 'month', label: 'Когда хотите пойти', type: 'select', value: String(f.month), options: [['0', 'В любой месяц']].concat(D.MONTHS.map(function (m, i) { return [String(i + 1), m.charAt(0).toUpperCase() + m.slice(1)]; })), id: 'flt-month' })}
        ${ui.field({ name: 'lenMax', label: 'Длина маршрута', type: 'select', value: String(f.lenMax), options: LENGTHS, id: 'flt-len' })}
      </div>
      ${ui.checks({ name: 'days', legend: 'Продолжительность', type: 'radio', items: [['', 'Любая'], ['one', 'За один день'], ['multi', 'С ночёвкой']], values: [f.days], cls: 'checks-inline' })}
      <details class="details"${App.on(f.land.length, 'open')}><summary>Что хочется увидеть${f.land.length ? h` <span class="badge">${f.land.length}</span>` : ''}</summary>
        ${ui.checks({ name: 'land', legend: 'Ландшафт', items: Object.keys(D.LANDSCAPES).map(function (k) { return [k, D.LANDSCAPES[k]]; }), values: f.land, array: true, cls: 'legend-sr' })}
      </details>
      <details class="details"${App.on(f.feat.length, 'open')}><summary>Особенности${f.feat.length ? h` <span class="badge">${f.feat.length}</span>` : ''}</summary>
        ${ui.checks({ name: 'feat', legend: 'Особенности маршрута', items: Object.keys(D.FEATURES).map(function (k) { return [k, D.FEATURES[k]]; }), values: f.feat, array: true, cls: 'legend-sr' })}
      </details>
      <label class="check"><input type="checkbox" name="noPermit" value="1"${App.on(f.noPermit, 'checked')}><span>Без пропусков и разрешений<small>Скрыть маршруты, где документ нужно оформлять заранее</small></span></label>
      <input type="hidden" name="sort" value="${f.sort}">
      <div class="filters-actions">
        <button type="submit" class="btn btn-primary btn-block filters-apply">Показать результаты</button>
        <button type="button" class="btn btn-ghost btn-block" data-action="filters-reset">Сбросить фильтры</button>
      </div>
    </form>`;
  }

  var state = { f: null, view: 'grid', timer: null };

  App.route('/routes', function (ctx) {
    var f = fromQuery(ctx.query);
    state.f = f;
    state.view = App.store.get('tropy.view', 'grid');
    var n = apply(f).length, ac = activeCount(f);
    return {
      title: 'Каталог маршрутов',
      html: h`<div class="container page">
        ${ui.pageHead({ crumbs: [['Каталог маршрутов']], title: 'Каталог маршрутов', lead: 'Пешие маршруты по России с паспортами доступности, правилами посещения и ссылками на официальные источники.' })}
        <div class="catalog">
          <aside class="filters" aria-labelledby="filters-title">
            <div class="filters-head">
              <h2 id="filters-title" class="filters-title">${App.icon('filter')}Фильтры</h2>
              <button type="button" class="btn btn-secondary filters-toggle" data-action="filters-toggle" aria-expanded="false" aria-controls="filters-panel">
                <span class="filters-toggle-text">Показать фильтры</span>${ac ? h` <span class="badge badge-count" id="filters-count">${ac}</span>` : h`<span class="badge badge-count" id="filters-count" hidden></span>`}</button>
            </div>
            <div class="filters-panel" id="filters-panel">${filtersForm(f)}</div>
          </aside>
          <section class="results" aria-labelledby="results-title">
            <h2 id="results-title" class="sr-only">Результаты поиска</h2>
            <div class="results-bar">
              <p id="results-count" class="results-count" role="status" aria-live="polite">${countText(n)}</p>
              <div class="results-tools">
                <label for="sort-select" class="inline-label">Сортировка</label>
                <select class="select select-small" id="sort-select" data-change="sort">${SORTS.map(function (s) { return h`<option value="${s[0]}"${App.on(f.sort === s[0], 'selected')}>${s[1]}</option>`; })}</select>
                <div class="seg-buttons" role="group" aria-label="Вид списка">
                  <button type="button" class="btn btn-secondary btn-small btn-icon" data-action="view" data-view="grid" aria-pressed="${state.view === 'grid' ? 'true' : 'false'}" aria-label="Плиткой">${App.icon('grid')}</button>
                  <button type="button" class="btn btn-secondary btn-small btn-icon" data-action="view" data-view="list" aria-pressed="${state.view === 'list' ? 'true' : 'false'}" aria-label="Списком">${App.icon('list')}</button>
                </div>
              </div>
            </div>
            <div id="chips">${chips(f)}</div>
            <div id="results">${results(f, state.view)}</div>
            ${ui.accessLegend()}
          </section>
        </div>
      </div>`
    };
  });

  /** Перерисовывает только результаты (форма и фокус остаются на месте) */
  function update(f, opts) {
    state.f = f;
    App.setQuery(toQuery(f));
    var n = apply(f).length, ac = activeCount(f);
    document.getElementById('results').innerHTML = String(results(f, state.view));
    document.getElementById('chips').innerHTML = String(chips(f));
    var cnt = document.getElementById('results-count');
    if (cnt) cnt.textContent = countText(n);
    var badge = document.getElementById('filters-count');
    if (badge) { badge.textContent = ac; badge.hidden = !ac; }
    if (opts && opts.rebuildForm) {
      document.getElementById('filters-panel').innerHTML = String(filtersForm(f));
    }
  }
  function formFilters() {
    var form = document.getElementById('filters-form');
    return fromForm(App.forms.read(form));
  }

  App.change('filters', function (form, e) {
    if (e.target.name === 'q') return;
    var f = formFilters();
    if (e.target.name === 'district') {
      var sel = document.getElementById('flt-region');
      var opts = regionOptions(f.district);
      if (f.region && !opts.some(function (o) { return o[0] === f.region; })) f.region = '';
      sel.innerHTML = String(h`${opts.map(function (o) { return h`<option value="${o[0]}"${App.on(o[0] === f.region, 'selected')}>${o[1]}</option>`; })}`);
    }
    update(f);
  });
  App.input('filters-q', function (form, e) {
    if (e.target.name !== 'q') return;
    clearTimeout(state.timer);
    state.timer = setTimeout(function () { update(formFilters()); }, 300);
  });
  App.form('filters', function () {
    update(formFilters());
    // На телефоне — сворачиваем панель и переходим к результатам
    var panel = document.getElementById('filters-panel');
    if (panel && panel.classList.contains('is-open')) toggle(false);
    App.focus(document.getElementById('results-count'));
  });
  App.change('sort', function (el) { var f = Object.assign({}, state.f, { sort: el.value }); var hid = App.$('#filters-form input[name=sort]'); if (hid) hid.value = el.value; update(f); });

  function toggle(open) {
    var btn = App.$('.filters-toggle'), panel = document.getElementById('filters-panel');
    if (!btn || !panel) return;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.classList.toggle('is-open', open);
    btn.querySelector('.filters-toggle-text').textContent = open ? 'Скрыть фильтры' : 'Показать фильтры';
    if (open) { var first = panel.querySelector('input,select'); if (first) first.focus(); }
  }
  App.actions({
    'filters-toggle': function (btn) { toggle(btn.getAttribute('aria-expanded') !== 'true'); },
    'filters-reset': function () {
      update(fromQuery(new URLSearchParams()), { rebuildForm: true });
      App.announce('Фильтры сброшены. ' + countText(S.routes.length));
      App.focus(document.getElementById('results-count'), { scroll: false });
    },
    'filters-profile': function () {
      var f = Object.assign({}, state.f, { needs: S.user.needs.slice(), companion: !!S.user.companion });
      update(f, { rebuildForm: true });
      App.announce('Учтены потребности из профиля. ' + countText(apply(f).length));
    },
    'filter-remove': function (el) {
      var f = JSON.parse(JSON.stringify(state.f)), k = el.getAttribute('data-key'), v = el.getAttribute('data-value');
      var map = { need: 'needs', diff: 'diff', land: 'land', feat: 'feat' };
      if (map[k]) f[map[k]] = f[map[k]].filter(function (x) { return String(x) !== v; });
      else if (k === 'lenMax' || k === 'month') f[k] = 0;
      else if (k === 'companion' || k === 'noPermit') f[k] = false;
      else f[k] = '';
      update(f, { rebuildForm: true });
      App.announce('Фильтр убран. ' + countText(apply(f).length));
      var next = App.$('#chips .chip');
      App.focus(next || document.getElementById('results-count'), { scroll: false });
    },
    view: function (btn) {
      state.view = btn.getAttribute('data-view');
      App.store.set('tropy.view', state.view);
      App.$$('[data-action="view"]').forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      document.getElementById('results').innerHTML = String(results(state.f, state.view));
      App.announce(state.view === 'list' ? 'Вид: списком' : 'Вид: плиткой');
    }
  });
  App.catalog = { fromQuery: fromQuery, apply: apply };
})();

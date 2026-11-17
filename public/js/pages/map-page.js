/**
 * Карта всех маршрутов. Рядом — текстовый список тех же маршрутов (альтернатива карте),
 * фильтры по доступности и сложности, сортировка по расстоянию от пользователя (геолокация).
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;
  var ctl = null, pos = null;

  function filters(q) {
    return { needs: (q.get('need') || '').split(',').filter(function (c) { return D.ACCESS_BY_CODE[c]; }), diff: (q.get('diff') || '').split(',').map(Number).filter(function (n) { return n >= 1 && n <= 5; }), district: q.get('district') || '' };
  }
  function listHtml(items) {
    if (!items.length) return ui.empty('Нет маршрутов с такими параметрами', 'Измените фильтры над картой.');
    return h`<ol class="map-list">${items.map(function (r) {
      var dist = pos ? L.haversine(pos, [r.start.lat, r.start.lon]) : null;
      return h`<li class="map-item">
        <span class="map-item-pin d${r.difficulty}" aria-hidden="true">${r.difficulty}</span>
        <div class="map-item-body">
          <a class="map-item-title" href="#/routes/${r.slug}">${r.title}</a>
          <p class="small muted">${L.regionOf(r).name} · ${L.km(r.lengthKm)} · ${D.DIFFICULTY[r.difficulty].name.toLowerCase()}${dist != null ? h` · <strong>${L.km(Math.round(dist))} от вас</strong>` : ''}</p>
          ${ui.accessMini(r)}
        </div>
        <button type="button" class="btn btn-ghost btn-small" data-action="map-show" data-slug="${r.slug}" aria-label="Показать на карте: ${r.title}">${App.icon('pin')}<span class="hide-sm">На карте</span></button>
      </li>`;
    })}</ol>`;
  }
  function compute(f) {
    var items = L.filterRoutes(S.routes, { needs: f.needs, diff: f.diff, district: f.district }, S.kb);
    return pos ? L.sortRoutes(items, 'distance', { pos: pos }) : L.sortRoutes(items, 'name');
  }

  App.route('/map', function (ctx) {
    var f = filters(ctx.query);
    var items = compute(f);
    return {
      title: 'Карта маршрутов',
      after: function (main) { mount(main, items); },
      html: h`<div class="container page">
        ${ui.pageHead({ crumbs: [['Карта маршрутов']], title: 'Карта маршрутов', lead: 'Все маршруты каталога на карте России. Номер на метке — сложность от 1 до 5. Под картой — тот же список текстом.' })}
        <form class="map-filters" data-change="map-filters" aria-label="Фильтры карты" id="map-filters">
          ${ui.checks({ name: 'need', legend: 'Доступно для', items: D.ACCESS_CATEGORIES.map(function (c) { return [c.code, c.name]; }), values: f.needs, icons: 'cat-', array: true, cls: 'checks-access checks-compact' })}
          ${ui.checks({ name: 'diff', legend: 'Сложность', items: [1, 2, 3, 4, 5].map(function (d) { return [d, d + ' — ' + D.DIFFICULTY[d].name.toLowerCase()]; }), values: f.diff, array: true, cls: 'checks-compact' })}
          ${ui.field({ name: 'district', label: 'Федеральный округ', type: 'select', value: f.district, options: [['', 'Вся Россия']].concat(D.DISTRICTS.map(function (d) { return [d.code, d.name]; })), id: 'map-district' })}
          <div class="field"><span class="label-like" id="geo-label">Ближайшие ко мне</span>
            <button type="button" class="btn btn-secondary" data-action="geo" aria-describedby="geo-label geo-hint">${App.icon('target')}Определить моё местоположение</button>
            <p class="hint" id="geo-hint">Координаты используются только в вашем браузере и никуда не отправляются.</p></div>
        </form>
        <div class="map-layout">
          <div class="map-wrap">
            <div class="map-layers" role="group" aria-label="Подложка карты"></div>
            <div id="all-map" class="map map-all"></div>
            <p class="small muted" id="all-map-desc">Карта доступна с клавиатуры: Tab — переход по меткам, Enter — подробности, стрелки — сдвиг карты, плюс и минус — масштаб. На мелком масштабе соседние метки немного раздвинуты, чтобы в них было легко попасть; точное место старта — на странице маршрута.</p>
          </div>
          <section class="map-side" aria-labelledby="map-list-title">
            <h2 id="map-list-title" class="map-list-title">Маршруты на карте: <span id="map-count">${items.length}</span></h2>
            <div id="map-list">${listHtml(items)}</div>
          </section>
        </div>
      </div>`
    };
  });

  async function mount(main, items) {
    var el = main.querySelector('#all-map');
    try {
      ctl = await App.map.create(el, { label: 'Карта маршрутов России', describedBy: 'all-map-desc' });
      if (!document.contains(el)) { ctl.destroy(); return; }
      ctl.setRoutes(items);
      if (pos) ctl.setMe(pos);
      App.onLeave(function () { if (ctl) ctl.destroy(); ctl = null; });
    } catch (e) {
      el.outerHTML = String(ui.notice('warn', 'Карта не загрузилась', 'Пользуйтесь списком маршрутов — в нём та же информация.'));
    }
  }
  function refresh() {
    var form = document.getElementById('map-filters');
    var d = App.forms.read(form);
    var f = { needs: d.need || [], diff: (d.diff || []).map(Number), district: d.district || '' };
    App.setQuery({ need: f.needs, diff: f.diff, district: f.district });
    var items = compute(f);
    document.getElementById('map-list').innerHTML = String(listHtml(items));
    document.getElementById('map-count').textContent = items.length;
    if (ctl) { ctl.setRoutes(items); if (pos) ctl.setMe(pos); }
    App.announce('На карте ' + App.count(items.length, ['маршрут', 'маршрута', 'маршрутов']));
  }
  App.change('map-filters', refresh);
  App.actions({
    'map-show': function (el) {
      if (!ctl) return App.toast('Карта недоступна — информация есть в списке', 'warn');
      ctl.focusRoute(el.getAttribute('data-slug'));
    },
    geo: function (btn) {
      if (!navigator.geolocation) return App.toast('Браузер не поддерживает определение местоположения', 'warn');
      btn.setAttribute('aria-busy', 'true');
      navigator.geolocation.getCurrentPosition(function (p) {
        btn.removeAttribute('aria-busy');
        pos = [p.coords.latitude, p.coords.longitude];
        refresh();
        App.toast('Список отсортирован по расстоянию от вас', 'ok');
      }, function (err) {
        btn.removeAttribute('aria-busy');
        App.toast(err.code === 1 ? 'Доступ к местоположению запрещён в настройках браузера' : 'Не удалось определить местоположение', 'warn');
      }, { timeout: 10000, maximumAge: 600000 });
    }
  });
})();

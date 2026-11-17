/**
 * Карты (Leaflet 1.9, загружается только когда нужна карта) и профиль высот (SVG).
 * Карта — дополнение к тексту: у каждой карты есть текстовая альтернатива
 * (список маршрутов, описание старта, таблица высот), маркеры доступны с клавиатуры.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, L = App.L, D = App.D;
  var loading = null;

  var LAYERS = {
    osm: { name: 'Схема', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">участники OpenStreetMap</a>' } },
    topo: { name: 'Рельеф', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', opts: { maxZoom: 17, subdomains: 'abc', attribution: 'Карта: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), данные © <a href="https://www.openstreetmap.org/copyright">участники OpenStreetMap</a>' } }
  };
  var DIFF_COLORS = ['', '#2E7D4F', '#1B5FA8', '#8A5A00', '#B3261E', '#5B2C83'];

  function load() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
      // Стили Leaflet подключаем ДО app.css, чтобы наши правила (размеры кнопок, цвета, шрифт) имели приоритет
      var appCss = document.querySelector('link[href$="app.css"]');
      if (appCss) document.head.insertBefore(css, appCss); else document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = 'vendor/leaflet/leaflet.js';
      s.onload = function () { resolve(window.L); };
      s.onerror = function () { loading = null; reject(new Error('Не удалось загрузить модуль карты')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /** Создаёт карту в контейнере el. Возвращает контроллер с методами для маркеров и трека */
  async function create(el, opts) {
    opts = opts || {};
    var Lf = await load();
    var pref = App.store.get('tropy.mapLayer', 'osm');
    var map = Lf.map(el, { zoomControl: true, scrollWheelZoom: false, keyboard: true, attributionControl: true, zoomSnap: 0.5 });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    var layers = {};
    var errors = 0, loaded = 0;
    Object.keys(LAYERS).forEach(function (k) {
      layers[k] = Lf.tileLayer(LAYERS[k].url, LAYERS[k].opts);
      layers[k].on('tileerror', function () { errors += 1; if (errors >= 4 && loaded === 0) notice(); });
      layers[k].on('tileload', function () { loaded += 1; });
    });
    var current = layers[pref] ? pref : 'osm';
    layers[current].addTo(map);
    map.setView(opts.center || [58, 70], opts.zoom || 3);

    var wrap = el.closest('.map-wrap') || el.parentNode;
    function notice() {
      if (wrap.querySelector('.map-offline')) return;
      var n = document.createElement('p');
      n.className = 'map-offline notice notice-warn';
      n.setAttribute('role', 'status');
      n.textContent = 'Подложка карты не загрузилась — возможно, нет интернета. Вся информация о маршрутах доступна в тексте ниже.';
      wrap.appendChild(n);
    }
    // Колёсико мыши масштабирует карту только после клика или фокуса — чтобы не мешать прокрутке страницы
    map.on('focus click', function () { map.scrollWheelZoom.enable(); });
    map.on('blur mouseout', function () { map.scrollWheelZoom.disable(); });
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', opts.label || 'Интерактивная карта');
    el.setAttribute('aria-roledescription', 'карта');
    if (opts.describedBy) el.setAttribute('aria-describedby', opts.describedBy);

    // Переключатель подложки — обычные кнопки с aria-pressed (стандартный контрол Leaflet плохо работает с клавиатуры)
    var bar = wrap.querySelector('.map-layers');
    if (bar) {
      bar.innerHTML = String(h`<span class="map-layers-label" id="${el.id}-layers">Подложка:</span>${Object.keys(LAYERS).map(function (k) {
        return h`<button type="button" class="btn btn-small btn-secondary" data-layer="${k}" aria-pressed="${k === current ? 'true' : 'false'}" aria-describedby="${el.id}-layers">${LAYERS[k].name}</button>`;
      })}`);
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-layer]');
        if (!b) return;
        var k = b.getAttribute('data-layer');
        if (k === current) return;
        map.removeLayer(layers[current]); layers[k].addTo(map); current = k;
        App.store.set('tropy.mapLayer', k);
        App.$$('[data-layer]', bar).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        App.announce('Подложка: ' + LAYERS[k].name);
      });
    }

    var group = Lf.featureGroup().addTo(map);
    var markers = {};
    var ctl = {
      map: map,
      /** Маркеры маршрутов каталога */
      setRoutes: function (routes, o) {
        group.clearLayers(); markers = {};
        routes.forEach(function (r) {
          var m = Lf.marker([r.start.lat, r.start.lon], {
            keyboard: true, title: r.title, riseOnHover: true,
            icon: Lf.divIcon({ className: 'map-pin d' + r.difficulty, html: '<span aria-hidden="true">' + r.difficulty + '</span>', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -14] })
          });
          m.bindPopup(function () { return String(popup(r)); }, { maxWidth: 280, autoPanPadding: [24, 24] });
          m.on('add', function () {
            var e = m.getElement();
            if (e) e.setAttribute('aria-label', r.title + '. Сложность ' + r.difficulty + ' из 5 — ' + D.DIFFICULTY[r.difficulty].name.toLowerCase() + ', ' + L.km(r.lengthKm) + '. Нажмите Enter, чтобы открыть подробности');
          });
          m.on('popupopen', function (ev) { var a = ev.popup.getElement().querySelector('a'); if (a) setTimeout(function () { a.focus(); }, 50); });
          m.on('popupclose', function () { var e = m.getElement(); if (e && document.activeElement && ev_inPopup()) e.focus(); });
          m.addTo(group);
          markers[r.slug] = m;
        });
        if (routes.length && !(o && o.keepView)) map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 9 });
        declutter();
      },
      focusRoute: function (slug) {
        var m = markers[slug];
        if (!m) return;
        map.setView(m.getLatLng(), Math.max(map.getZoom(), 8));
        m.openPopup();
        el.scrollIntoView({ block: 'center', behavior: App.reducedMotion() ? 'auto' : 'smooth' });
      },
      /** Трек маршрута; schematic — пунктир (схема по ключевым точкам) */
      setTrack: function (route, track) {
        group.clearLayers();
        var pts = track && track.pts && track.pts.length ? track.pts : [[route.start.lat, route.start.lon]];
        if (pts.length > 1) {
          Lf.polyline(pts, { color: '#FFFFFF', weight: 8, opacity: 0.85, interactive: false }).addTo(group);
          Lf.polyline(pts, { color: DIFF_COLORS[route.difficulty] || '#1B5FA8', weight: 5, dashArray: track.src === 'schematic' ? '10 8' : null, interactive: false }).addTo(group);
        }
        var start = Lf.marker([route.start.lat, route.start.lon], { keyboard: true, title: 'Старт: ' + route.start.name, icon: Lf.divIcon({ className: 'map-pin map-start', html: '<span aria-hidden="true">С</span>', iconSize: [34, 34], iconAnchor: [17, 17] }) })
          .bindPopup(String(h`<strong>Старт</strong><br>${route.start.name}`)).addTo(group);
        start.on('add', function () { var e = start.getElement(); if (e) e.setAttribute('aria-label', 'Старт маршрута: ' + route.start.name); });
        if (pts.length > 1 && route.type === 'linear') {
          var end = pts[pts.length - 1];
          Lf.marker(end, { keyboard: false, interactive: false, icon: Lf.divIcon({ className: 'map-pin map-finish', html: '<span aria-hidden="true">Ф</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(group);
        }
        map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 14 });
      },
      /** Метка «вы здесь» */
      setMe: function (pos) {
        if (ctl._me) group.removeLayer(ctl._me);
        ctl._me = Lf.circleMarker(pos, { radius: 9, color: '#FFFFFF', weight: 3, fillColor: '#1B5FA8', fillOpacity: 1 }).bindTooltip('Вы здесь').addTo(group);
      },
      fit: function () { if (group.getLayers().length) map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 14 }); },
      destroy: function () { try { map.remove(); } catch (e) { /* уже удалена */ } }
    };
    /**
     * На мелком масштабе близкие метки накладываются друг на друга, и в них трудно попасть пальцем или мышью.
     * Раздвигаем пересекающиеся метки на минимальное расстояние (попарное «расталкивание», несколько итераций).
     * Сдвиг только экранный: координаты маршрутов не меняются, при приближении метки встают на свои места.
     */
    var PIN = 34, GAP = 6;
    function declutter() {
      var list = Object.keys(markers).map(function (k) { return markers[k]; });
      var orig = list.map(function (m) { return map.latLngToLayerPoint(m.getLatLng()); });
      var pos = orig.map(function (p) { return { x: p.x, y: p.y }; });
      var min = PIN + GAP;
      for (var it = 0; it < 80; it++) {
        var moved = false;
        for (var i = 0; i < pos.length; i++) {
          for (var j = i + 1; j < pos.length; j++) {
            var dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y, d = Math.sqrt(dx * dx + dy * dy);
            if (d >= min - 0.5) continue;
            if (d < 0.01) { dx = Math.cos(j * 2.4); dy = Math.sin(j * 2.4); d = 1; } // совпадающие точки
            var push = (min - d) / 2;
            pos[i].x -= dx / d * push; pos[i].y -= dy / d * push;
            pos[j].x += dx / d * push; pos[j].y += dy / d * push;
            moved = true;
          }
        }
        if (!moved) break;
      }
      list.forEach(function (m, k) { shift(m, pos[k].x - orig[k].x, pos[k].y - orig[k].y); });
    }
    function shift(m, dx, dy) {
      var e = m.getElement();
      if (e) { e.style.marginLeft = (dx - PIN / 2) + 'px'; e.style.marginTop = (dy - PIN / 2) + 'px'; }
      var pp = m.getPopup();
      if (pp) { pp.options.offset = Lf.point(dx, dy + 7); if (pp.isOpen()) pp.update(); }
    }
    map.on('zoomend', declutter);

    function ev_inPopup() { var a = document.activeElement; return !a || a === document.body || !!(a.closest && a.closest('.leaflet-popup')); }
    setTimeout(function () { map.invalidateSize(); }, 200);
    return ctl;
  }

  function popup(r) {
    return h`<div class="map-popup"><a class="map-popup-title" href="#/routes/${r.slug}">${r.title}</a>
      <p>${L.regionOf(r).name}</p>
      <p>${App.ui.diffText(r.difficulty)} · ${L.km(r.lengthKm)} · ${L.durationText(r)}</p>
      ${App.ui.accessMini(r)}</div>`;
  }

  /* ---------- Профиль высот ---------- */

  function profileStats(prof) {
    var min = Infinity, max = -Infinity, up = 0;
    prof.forEach(function (p, i) {
      min = Math.min(min, p[1]); max = Math.max(max, p[1]);
      if (i && p[1] > prof[i - 1][1]) up += p[1] - prof[i - 1][1];
    });
    return { min: Math.round(min), max: Math.round(max), up: Math.round(up), km: prof[prof.length - 1][0] };
  }
  /** SVG-профиль высот с текстовым описанием и таблицей значений */
  function profile(prof, o) {
    o = o || {};
    if (!prof || prof.length < 2) return '';
    var st = profileStats(prof);
    var W = 640, H = 200, pl = 52, pr = 12, pt = 14, pb = 30;
    var lo = Math.floor((st.min - 20) / 50) * 50, hi = Math.ceil((st.max + 20) / 50) * 50;
    if (hi - lo < 100) hi = lo + 100;
    var x = function (k) { return pl + (k / st.km) * (W - pl - pr); };
    var y = function (e) { return pt + (1 - (e - lo) / (hi - lo)) * (H - pt - pb); };
    var line = prof.map(function (p, i) { return (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1); }).join(' ');
    var area = line + ' L' + x(st.km).toFixed(1) + ' ' + (H - pb) + ' L' + pl + ' ' + (H - pb) + ' Z';
    var yt = [lo, Math.round((lo + hi) / 2), hi], xt = [0, st.km / 2, st.km];
    var id = App.uid('prof');
    var desc = 'Высота над уровнем моря — от ' + L.meters(st.min) + ' до ' + L.meters(st.max) + ' на протяжении ' + L.km(Math.round(st.km * 10) / 10) +
      (o.gainM != null ? '. Суммарный набор высоты — около ' + L.meters(o.gainM) : '') + '.';
    var step = Math.max(1, Math.floor(prof.length / 10));
    var rows = prof.filter(function (p, i) { return i % step === 0 || i === prof.length - 1; });
    return h`<figure class="profile">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t ${id}-d" preserveAspectRatio="none" class="profile-svg">
        <title id="${id}-t">Профиль высот маршрута</title><desc id="${id}-d">${desc}</desc>
        ${yt.map(function (v) { return h`<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="profile-grid"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" class="profile-label">${L.num(v)}</text>`; })}
        ${xt.map(function (v, i) { return h`<text x="${x(v)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}" class="profile-label">${L.num(Math.round(v * 10) / 10)} км</text>`; })}
        <path d="${area}" class="profile-area"/><path d="${line}" class="profile-line"/>
      </svg>
      <figcaption>${desc} ${o.schematic ? 'Профиль приблизительный: трек построен по ключевым точкам.' : 'Высоты — по цифровой модели рельефа Copernicus, погрешность — десятки метров.'}</figcaption>
      <details class="details"><summary>Таблица высот</summary>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Таблица высот"><table class="table table-compact">
          <thead><tr><th scope="col">Расстояние от старта</th><th scope="col">Высота</th></tr></thead>
          <tbody>${rows.map(function (p) { return h`<tr><td>${L.km(Math.round(p[0] * 10) / 10)}</td><td>${L.meters(p[1])}</td></tr>`; })}</tbody>
        </table></div>
      </details>
    </figure>`;
  }

  App.map = { load: load, create: create, profile: profile, profileStats: profileStats, DIFF_COLORS: DIFF_COLORS };
})();

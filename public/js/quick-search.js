/**
 * Быстрый поиск по сайту и переключатель светлой и тёмной темы в шапке.
 * — поиск открывается кнопкой с лупой или сочетанием Ctrl+K (⌘K на Mac) на любой странице;
 * — маршруты ищутся так же, как в каталоге (название, регион, место), плюс разделы сайта;
 * — без запроса показаны недавно просмотренные маршруты и основные разделы;
 * — ↑ и ↓ переходят по результатам, Enter открывает первый, Esc закрывает окно.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, L = App.L;
  var MAX_ROUTES = 8, MAX_PAGES = 4;
  var norm = L.norm || function (s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); };

  /* Разделы сайта: адрес, название, значок и слова, по которым их тоже можно найти */
  var PAGES = [
    ['/routes', 'Каталог маршрутов', 'list', 'тропы поиск фильтры'],
    ['/map', 'Карта маршрутов', 'map', 'рядом со мной'],
    ['/pick', 'Подбор маршрута за 4 шага', 'compass', 'подобрать помощник'],
    ['/gear', 'Снаряжение', 'backpack', 'рюкзак вещи список'],
    ['/plans', 'Мои походы', 'flag', 'план задачи подготовка'],
    ['/rules', 'Правила и источники', 'shield', 'пропуск разрешение билет заповедник'],
    ['/compare', 'Сравнение маршрутов', 'compare', 'сравнить'],
    ['/accessibility', 'Доступность сайта', 'eye', 'версия для слабовидящих шрифт контраст'],
    ['/help', 'Помощь', 'info', 'вопросы ответы'],
    ['/about', 'О проекте', 'doc', ''],
    ['/sitemap', 'Карта сайта', 'list', 'все разделы'],
    ['/profile', 'Профиль', 'user', 'аккаунт настройки потребности']
  ];

  var dlg, input, box, status, statusTimer;

  /* ---------- Поиск ---------- */

  /** Подсвечивает совпадение в названии (регистр и «ё» не важны) */
  function mark(text, nq) {
    text = String(text || '');
    var i = nq ? text.toLowerCase().replace(/ё/g, 'е').indexOf(nq) : -1;
    if (i === -1) return text;
    return h`${text.slice(0, i)}<mark>${text.slice(i, i + nq.length)}</mark>${text.slice(i + nq.length)}`;
  }

  function item(href, icon, name, meta, nq) {
    return h`<li><a class="qs-item" href="#${href}">${App.icon(icon)}<span class="qs-name">${mark(name, nq)}</span><span class="qs-meta">${meta}</span></a></li>`;
  }

  function group(id, title, items) {
    return items.length ? h`<h3 class="qs-group" id="${id}">${title}</h3><ul class="qs-list" aria-labelledby="${id}">${items}</ul>` : '';
  }

  /** «12 маршрутов» — с неразрывным пробелом, как в остальных местах сайта */
  function count(n, forms) { return App.count(n, forms); }

  /** Маршруты по запросу: сначала те, чьё название начинается с запроса, потом остальные.
      Без запроса — недавно просмотренные */
  function findRoutes(q, nq) {
    var S = App.state, all = S.routes || [];
    if (!q) {
      if (!App.recent) return [];
      var by = {};
      all.forEach(function (r) { by[r.slug] = r; });
      return App.recent.list().map(function (s) { return by[s]; }).filter(Boolean).slice(0, 4);
    }
    var rank = function (r) { var i = norm(r.title).indexOf(nq); return i === 0 ? 0 : i > 0 ? 1 : 2; };
    return L.filterRoutes(all, { q: q, needs: [] }, S.kb).sort(function (a, b) { return rank(a) - rank(b); });
  }

  function render(raw) {
    var q = String(raw || '').trim(), nq = norm(q);
    var found = findRoutes(q, nq), routes = q ? found.slice(0, MAX_ROUTES) : found;
    var pages = PAGES.filter(function (p) { return !nq || norm(p[1] + ' ' + p[3]).indexOf(nq) !== -1; }).slice(0, nq ? MAX_PAGES : 6);
    var routeItems = routes.map(function (r) { return item('/routes/' + r.slug, 'route', r.title, L.regionOf(r).name + ' · ' + L.km(r.lengthKm), nq); });
    var pageItems = pages.map(function (p) { return item(p[0], p[2], p[1], 'Раздел сайта', nq); });
    var more = q && found.length > routes.length
      ? h`<a class="qs-more" href="#/routes?q=${encodeURIComponent(q)}">Все ${count(found.length, ['маршрут', 'маршрута', 'маршрутов'])} в каталоге${App.icon('chevron')}</a>` : '';
    box.innerHTML = String(routeItems.length || pageItems.length
      ? h`${group('qs-g-routes', q ? 'Маршруты' : 'Вы недавно смотрели', routeItems)}${more}${group('qs-g-pages', 'Разделы сайта', pageItems)}`
      : h`<p class="qs-empty">${App.icon('search')}<span>Ничего не нашлось. Проверьте написание или <a href="#/routes?q=${encodeURIComponent(q)}">поищите в каталоге с фильтрами</a>.</span></p>`);
    var parts = [];
    if (found.length) parts.push(count(found.length, ['маршрут', 'маршрута', 'маршрутов']));
    if (pages.length) parts.push(count(pages.length, ['раздел', 'раздела', 'разделов']));
    say(!q ? 'Введите название маршрута, региона или раздела сайта' : parts.length ? 'Найдено: ' + parts.join(' и ') : 'Ничего не найдено');
  }

  /** Итог поиска для экранного диктора — с небольшой задержкой, чтобы не зачитывать каждую букву */
  function say(text) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { status.textContent = text; }, 450);
  }

  function build() {
    dlg = document.createElement('dialog');
    dlg.id = 'search-dialog';
    dlg.className = 'dialog dialog-search';
    dlg.setAttribute('aria-labelledby', 'qs-title');
    dlg.innerHTML = String(h`<div class="qs-head">
        <h2 id="qs-title" class="sr-only">Быстрый поиск</h2>
        <label class="qs-label" for="qs-input">${App.icon('search')}<span class="sr-only">Что найти: маршрут, регион или раздел сайта</span></label>
        <input class="qs-input" id="qs-input" type="search" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="Маршрут, регион или раздел" aria-describedby="qs-status" autofocus>
        <button type="button" class="btn btn-ghost btn-icon" data-action="close-dialog" aria-label="Закрыть поиск">${App.icon('x')}</button>
      </div>
      <p class="qs-status" id="qs-status" role="status"></p>
      <div class="qs-results" id="qs-results"></div>
      <p class="qs-hint" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> выбрать <kbd>Enter</kbd> открыть <kbd>Esc</kbd> закрыть</p>`);
    document.body.appendChild(dlg);
    input = dlg.querySelector('#qs-input');
    box = dlg.querySelector('#qs-results');
    status = dlg.querySelector('#qs-status');

    input.addEventListener('input', function () { render(input.value); });
    // Enter открывает первый результат, а если ничего не нашлось — каталог с этим запросом
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      var first = box.querySelector('a[href^="#/"]');
      var q = input.value.trim();
      var target = first ? first.getAttribute('href').slice(1) : (q ? '/routes?q=' + encodeURIComponent(q) : '');
      if (target) { close(); App.go(target); }
    });
    // Стрелки: поле поиска → результаты по кругу → снова поле
    dlg.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var links = Array.prototype.slice.call(box.querySelectorAll('a[href]'));
      if (!links.length) return;
      e.preventDefault();
      var i = links.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') i = i + 1 < links.length ? i + 1 : -1;
      else i = i === -1 ? links.length - 1 : i - 1;
      if (i < 0) input.focus(); else links[i].focus();
    });
    // Перед переходом по ссылке закрываем окно: тогда фокус достанется заголовку новой страницы
    dlg.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a[href^="#/"]')) close();
    });
  }

  function close() { if (dlg && dlg.open) App.closeDialog(dlg); }

  function open() {
    if (!dlg) build();
    if (dlg.open) { input.focus(); input.select(); return; }
    // Открытое меню или панель настроек сначала закрываем (фокус вернётся на их кнопку), потом открываем поиск
    var other = document.querySelector('dialog[open]');
    if (other) {
      other.addEventListener('close', function () { open(); }, { once: true });
      App.closeDialog(other);
      return;
    }
    input.value = '';
    status.textContent = '';
    render('');
    App.openDialog(dlg);
  }

  // Ctrl+K / ⌘K с любой страницы; e.code — чтобы работало и в русской раскладке
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.code !== 'KeyK' && String(e.key).toLowerCase() !== 'k') return;
    e.preventDefault();
    open();
  });
  // Переход назад или вперёд в браузере закрывает окно поиска
  window.addEventListener('hashchange', close);

  /* ---------- Светлая и тёмная тема ---------- */

  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  /** Сейчас тёмная тема? Для «как в системе» смотрим на настройку устройства */
  function isDark() {
    var t = root.getAttribute('data-theme') || 'auto';
    return t === 'dark' || (t === 'auto' && !!(mq && mq.matches));
  }

  /** Подпись кнопки называет действие: «Включить тёмную тему» или «Включить светлую тему» */
  function syncTheme() {
    var dark = isDark(), label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="theme-toggle"]'), function (b) {
      b.classList.toggle('is-dark', dark);
      b.setAttribute('aria-label', label);
      b.title = label;
    });
  }

  var themeTimer;
  function toggleTheme() {
    var next = isDark() ? 'light' : 'dark';
    // Цвета страницы плавно перетекают — только если анимация разрешена
    if (!App.reducedMotion()) {
      root.classList.add('theme-anim');
      clearTimeout(themeTimer);
      themeTimer = setTimeout(function () { root.classList.remove('theme-anim'); }, 700);
    }
    if (App.a11y && App.a11y.set) App.a11y.set({ theme: next }); else root.setAttribute('data-theme', next);
    syncTheme();
    App.announce(next === 'dark' ? 'Включена тёмная тема' : 'Включена светлая тема');
  }

  if (window.MutationObserver) new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', syncTheme);
    else if (mq.addListener) mq.addListener(syncTheme);
  }
  syncTheme();

  App.actions({
    'open-search': function () { open(); },
    'theme-toggle': function () { toggleTheme(); }
  });

  App.quickSearch = { open: open, close: close };
})();

/** Главная страница: первый экран с поиском, быстрый выбор по потребностям, история просмотров, маршрут дня и подборки */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;

  var QUICK = [
    ['need=K', 'cat-K', 'Можно на коляске'], ['need=O', 'cat-O', 'Мало подъёмов и ровная тропа'], ['need=S', 'cat-S', 'Подходит незрячим'],
    ['need=G', 'cat-G', 'Не нужен слух'], ['need=U', 'cat-U', 'Простая и понятная информация'], ['feat=family', 'user', 'Можно с детьми'],
    ['feat=transport', 'bus', 'Без машины'], ['noPermit=1', 'check', 'Без пропусков и разрешений']
  ];

  /** Маршрут дня: каждый календарный день новый, у всех посетителей в этот день — один и тот же */
  function routeOfDay(routes) {
    if (!routes.length) return null;
    var d = new Date();
    return routes[Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) % routes.length];
  }

  /** «9 ноября» — дата в подписи «Маршрут дня» */
  function todayLabel() {
    try { return new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); } catch (e) { return ''; }
  }

  function spotlight(r, needs) {
    var date = todayLabel();
    return h`<section class="section container" aria-labelledby="day-title">
        <article class="spotlight" aria-labelledby="day-name">
          ${ui.cover(r.cover, { sizes: '(min-width: 48em) 50vw, 100vw', cls: 'spotlight-cover' })}
          <div class="spotlight-body">
            <h2 id="day-title" class="eyebrow spotlight-kicker">Маршрут дня${date ? h`<span class="spotlight-date"> — ${date}</span>` : ''}</h2>
            <h3 id="day-name" class="spotlight-title"><a href="#/routes/${r.slug}">${r.title}</a></h3>
            <p class="route-card-region">${App.icon('pin')}${L.regionOf(r).name}${r.area ? h`<span class="sep" aria-hidden="true"> · </span><span class="muted">${r.area}</span>` : ''}</p>
            ${r.summary ? h`<p class="spotlight-text">${r.summary}</p>` : ''}
            <ul class="facts" aria-label="Основные параметры">
              <li>${ui.diff(r.difficulty)}</li>
              <li>${App.icon('route')}${L.km(r.lengthKm)}</li>
              <li>${App.icon('clock')}${L.durationText(r)}</li>
              ${r.gainM ? h`<li>${App.icon('mountain')}<span class="sr-only">Набор высоты </span>↑ ${L.meters(r.gainM)}</li>` : ''}
            </ul>
            ${ui.accessMini(r, needs)}
            <div class="row spotlight-actions">
              <a class="btn btn-primary" href="#/routes/${r.slug}">Смотреть маршрут<span class="sr-only"> «${r.title}»</span>${App.icon('chevron')}</a>
              ${ui.favButton(r.slug, { describedBy: 'day-name' })}
            </div>
          </div>
        </article>
      </section>`;
  }

  function recentBlock(list) {
    return h`<section class="section container" aria-labelledby="recent-title">
        <div class="section-head"><h2 id="recent-title" class="section-title">Вы недавно смотрели</h2>
          <button type="button" class="btn btn-ghost btn-small" data-action="recent-clear">${App.icon('trash')}Очистить историю</button></div>
        <ul class="recent-list">${list.map(function (r) {
          return h`<li><a class="recent-chip" href="#/routes/${r.slug}">${App.icon('history', 'recent-i')}<span class="recent-name">${r.title}</span><span class="recent-meta">${L.regionOf(r).name} · ${L.km(r.lengthKm)}</span></a></li>`;
        })}</ul>
      </section>`;
  }

  App.route('/', function () {
    var routes = S.routes;
    var forK = routes.filter(function (r) { return L.suits(r, ['K']); });
    var first = routes.filter(function (r) { return r.difficulty <= 2 && forK.indexOf(r) === -1; }).slice(0, 3);
    var big = L.sortRoutes(routes.filter(function (r) { return r.difficulty >= 4; }), 'rating').slice(0, 3);
    var regions = {}, districts = {}, bySlug = {};
    routes.forEach(function (r) { regions[r.region] = 1; districts[L.districtOf(r)] = 1; bySlug[r.slug] = r; });
    var nRegions = Object.keys(regions).length, nDistricts = Object.keys(districts).length;
    var day = routeOfDay(routes);
    var recent = App.recent ? App.recent.list().map(function (s) { return bySlug[s]; }).filter(Boolean).slice(0, 6) : [];
    var needs = (S.user && S.user.needs) || [];
    var mine = needs.length ? L.sortRoutes(L.filterRoutes(routes, { needs: needs, companion: S.user.companion }, S.kb), 'access', { needs: needs }).slice(0, 3) : [];
    var cards = function (list) { return h`<div class="grid-cards">${list.map(function (r) { return ui.routeCard(r, { needs: needs }); })}</div>`; };

    return {
      title: '',
      html: h`
      <section class="hero" aria-labelledby="hero-title">
        <div class="container hero-grid">
          <div class="hero-text">
            <p class="eyebrow">Пеший туризм по России — для всех</p>
            <h1 id="hero-title" tabindex="-1">Выберите маршрут, который подойдёт <em>именно вам</em></h1>
            <p class="lead">Каталог троп с паспортами доступности для людей на коляске, с нарушениями зрения, слуха и с другими особенностями здоровья. Правила посещения, снаряжение и план подготовки — в одном месте.</p>
            <form class="hero-search" role="search" data-form="home-search" aria-label="Поиск маршрутов">
              <label for="home-q" class="hero-search-label">Найти маршрут по названию, региону или месту</label>
              <div class="search-row">
                <input class="input input-lg" id="home-q" name="q" type="search" placeholder="Например, Байкал или водопад" autocomplete="off" enterkeyhint="search">
                <button class="btn btn-primary btn-lg" type="submit">${App.icon('search')}Найти</button>
              </div>
            </form>
            <div class="hero-actions">
              <a class="btn btn-secondary" href="#/pick">${App.icon('compass')}Подобрать маршрут за 4 шага</a>
              <a class="btn btn-ghost" href="#/map">${App.icon('map')}Открыть карту</a>
            </div>
          </div>
          <div class="hero-media">
            ${ui.cover('hero', { eager: true, large: true, sizes: '(min-width: 960px) 40vw, 100vw', cls: 'cover-hero' })}
            <p class="hero-note">${App.count(routes.length, ['маршрут', 'маршрута', 'маршрутов'])} в ${nRegions} ${L.plural(nRegions, ['регионе', 'регионах', 'регионах'])}. У каждой тропы — паспорт доступности: что проверено на месте и что стоит уточнить заранее.</p>
          </div>
        </div>
      </section>

      <section class="section container" aria-labelledby="quick-title">
        <h2 id="quick-title" class="section-title">Мне нужен маршрут, где…</h2>
        <ul class="quick-list">${QUICK.map(function (q) {
          var n = L.filterRoutes(routes, quickFilter(q[0]), S.kb).length;
          return h`<li><a class="quick" href="#/routes?${q[0]}">${App.icon(q[1], 'quick-i')}<span class="quick-text">${q[2]}</span><span class="quick-n">${App.count(n, ['маршрут', 'маршрута', 'маршрутов'])}</span></a></li>`;
        })}</ul>
      </section>

      ${recent.length ? recentBlock(recent) : ''}

      ${day ? spotlight(day, needs) : ''}

      ${mine.length ? h`<section class="section container" aria-labelledby="mine-title">
        <div class="section-head"><h2 id="mine-title" class="section-title">Подходят вам по профилю</h2>
          <a class="link-more" href="#/routes?need=${needs.join(',')}${S.user.companion ? '&companion=1' : ''}">Все подходящие${App.icon('chevron')}</a></div>
        ${cards(mine)}</section>` : ''}

      <section class="section container" aria-labelledby="k-title">
        <div class="section-head"><h2 id="k-title" class="section-title">Без барьеров: можно на коляске</h2>
          <a class="link-more" href="#/routes?need=K">Все такие маршруты${App.icon('chevron')}</a></div>
        <p class="section-lead">Настилы, пандусы и места отдыха. Для каждого маршрута указано, что проверено и что стоит уточнить заранее.</p>
        ${cards(forK.slice(0, 3))}
      </section>

      <section class="section band" aria-labelledby="how-title">
        <div class="container">
          <h2 id="how-title" class="section-title">Как спланировать поход</h2>
          <ol class="how">
            <li><span class="how-n" aria-hidden="true">1</span><h3>Выберите маршрут</h3><p>Фильтры по региону, сложности, сезону и доступности. Или ответьте на 4 вопроса — <a href="#/pick">подбор</a> объяснит, почему маршрут подходит.</p></li>
            <li><span class="how-n" aria-hidden="true">2</span><h3>Проверьте правила</h3><p>Где нужен билет, пропуск или разрешение заповедника — и куда за ним обращаться. <a href="#/rules">Правила и источники</a>.</p></li>
            <li><span class="how-n" aria-hidden="true">3</span><h3>Соберите рюкзак</h3><p><a href="#/gear">Список снаряжения</a> под маршрут, сезон и ваши потребности — с весом и отметками.</p></li>
            <li><span class="how-n" aria-hidden="true">4</span><h3>Подготовьтесь</h3><p><a href="#/plans">План похода</a> со сроками задач, напоминаниями в календаре и карточкой безопасности для близких.</p></li>
          </ol>
        </div>
      </section>

      <section class="section container" aria-labelledby="first-title">
        <div class="section-head"><h2 id="first-title" class="section-title">Для первого похода</h2>
          <a class="link-more" href="#/routes?diff=1,2">Все лёгкие маршруты${App.icon('chevron')}</a></div>
        ${cards(first)}
      </section>

      <section class="section container" aria-labelledby="big-title">
        <div class="section-head"><h2 id="big-title" class="section-title">Горы, вулканы и экспедиции</h2>
          <a class="link-more" href="#/routes?diff=4,5">Все сложные маршруты${App.icon('chevron')}</a></div>
        ${cards(big)}
      </section>

      <section class="section container" aria-labelledby="cats-title">
        <h2 id="cats-title" class="section-title">Доступность — для каждого</h2>
        <p class="section-lead">Мы оцениваем маршруты по пяти категориям — как в паспортах доступности объектов. Для каждой указан статус и что важно знать.</p>
        <ul class="cat-grid">${D.ACCESS_CATEGORIES.map(function (c) {
          var n = routes.filter(function (r) { return L.suits(r, [c.code]); }).length;
          return h`<li class="cat-card">${App.icon('cat-' + c.code, 'cat-i')}<h3><span class="cat-letter" aria-hidden="true">${c.letter}</span> ${c.name}</h3>
            <p class="muted small">Официально: ${c.official}</p>
            <a href="#/routes?need=${c.code}">${App.count(n, ['подходящий маршрут', 'подходящих маршрута', 'подходящих маршрутов'])}<span class="sr-only"> — ${c.name.toLowerCase()}</span></a></li>`;
        })}</ul>
      </section>

      <section class="section container facts-band" aria-labelledby="facts-title">
        <h2 id="facts-title" class="sr-only">Сервис в цифрах</h2>
        <ul class="stat-tiles">
          <li><strong>${routes.length}</strong><span>${L.plural(routes.length, ['маршрут', 'маршрута', 'маршрутов'])} с паспортом доступности</span></li>
          <li><strong>${nRegions}</strong><span>${L.plural(nRegions, ['регион', 'региона', 'регионов'])} в ${nDistricts} ${L.plural(nDistricts, ['федеральном округе', 'федеральных округах', 'федеральных округах'])}</span></li>
          <li><strong>${S.kb.length}</strong><span>${L.plural(S.kb.length, ['правило', 'правила', 'правил'])} посещения с пошаговыми инструкциями</span></li>
          <li><strong>11,1&nbsp;млн</strong><span>людей с инвалидностью в России — 7,6% населения. ${ui.extLink('Данные Росстата', 'https://www.demoscope.ru/weekly/2025/01077/barom01.php')}</span></li>
        </ul>
      </section>

      <section class="section container" aria-labelledby="safe-title">
        <div class="safety-band">
          ${App.icon('sos', 'safety-i')}
          <div><h2 id="safe-title" class="section-title">Безопасность прежде всего</h2>
            <p>Перед походом зарегистрируйте группу в МЧС и оставьте близким карточку безопасности. В экстренной ситуации звоните <a href="tel:112"><strong>112</strong></a> — даже без SIM-карты и денег на счёте.</p>
            <div class="row">${ui.extLink('Регистрация туристской группы в МЧС', 'https://forms.mchs.gov.ru/registration_tourist_groups', 'btn btn-secondary')}<a class="btn btn-ghost" href="#/plans">Составить план похода</a></div></div>
        </div>
      </section>

      ${S.user ? '' : h`<section class="section container" aria-labelledby="join-title">
        <div class="join">
          <h2 id="join-title" class="section-title">Сохраните свои настройки и планы</h2>
          <ul class="ticks"><li>Избранные маршруты и пройденные тропы</li><li>Планы походов с задачами и сроками</li><li>Списки снаряжения с отметками</li><li>Отзывы о реальной доступности маршрутов</li></ul>
          <div class="row"><a class="btn btn-primary" href="#/register">Создать аккаунт</a><a class="btn btn-secondary" href="#/login">Войти</a></div>
        </div></section>`}`
    };
  });

  /** Превращает «need=K» в объект фильтра для подсчёта */
  function quickFilter(q) {
    var p = new URLSearchParams(q), f = {};
    if (p.get('need')) f.needs = p.get('need').split(',');
    if (p.get('feat')) f.feat = p.get('feat').split(',');
    if (p.get('noPermit')) f.noPermit = true;
    return f;
  }

  App.form('home-search', function (form, data) {
    var q = String(data.q || '').trim();
    App.go('/routes' + (q ? '?q=' + encodeURIComponent(q) : ''));
  });

  App.actions({
    /* «Очистить историю»: блок исчезает, фокус переходит к заголовку следующего раздела */
    'recent-clear': function (el) {
      if (App.recent) App.recent.clear();
      var sec = el.closest('section');
      var next = sec ? sec.nextElementSibling : null;
      while (next && !next.querySelector('h2')) next = next.nextElementSibling;
      if (sec) sec.remove();
      App.announce('История просмотров очищена');
      var head = next ? next.querySelector('h2') : null;
      if (head) {
        if (!head.hasAttribute('tabindex')) head.setAttribute('tabindex', '-1');
        App.focus(head, { scroll: false });
      }
    }
  });
})();

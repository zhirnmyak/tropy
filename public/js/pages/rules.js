/**
 * Правила и источники: база знаний об ограничениях посещения (пропуска, разрешения, билеты),
 * методика оценки доступности, сводная таблица источников, открытые данные.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;

  function kbCard(k, full) {
    var routes = (k.routes || []).map(ui.routeBySlug).filter(Boolean);
    return h`<article class="card kb-card kb-${k.level}" id="rule-${k.code}" aria-labelledby="kb-${k.code}" tabindex="-1">
      <header class="kb-head">${App.icon(k.icon || 'info', 'kb-i')}<div>
        <p class="kb-kind">${k.kind} · ${ui.restrictionBadge(k.level)}</p>
        ${full ? h`<h1 id="kb-${k.code}" class="kb-title" tabindex="-1">${k.title}</h1>` : h`<h3 id="kb-${k.code}" class="kb-title"><a href="#/rules/${k.code}">${k.title}</a></h3>`}</div></header>
      <p>${k.short}</p>
      ${full ? h`
        ${k.when ? h`<h2 class="kb-sub">Когда это касается вас</h2><p>${k.when}</p>` : ''}
        ${k.steps && k.steps.length ? h`<h2 class="kb-sub">Что сделать</h2><ol class="steps-list">${k.steps.map(function (s) { return h`<li>${s}</li>`; })}</ol>` : ''}
        ${k.basis && k.basis.length ? h`<h2 class="kb-sub">Основание</h2><ul class="basis">${k.basis.map(function (b) { return h`<li>${b}</li>`; })}</ul>` : ''}
        ${k.links && k.links.length ? h`<h2 class="kb-sub">Где узнать подробнее</h2><ul class="sources">${k.links.map(function (l) { return h`<li>${ui.extLink(l[0], l[1])}</li>`; })}</ul>` : ''}
        ${routes.length ? h`<h2 class="kb-sub">Маршруты каталога, где это нужно</h2><ul class="chips-links">${routes.map(function (r) { return h`<li><a href="#/routes/${r.slug}">${r.title}</a></li>`; })}</ul>` : ''}`
      : h`<p class="small muted">${routes.length ? 'Касается маршрутов: ' + routes.length : 'Общее правило'}</p>`}
    </article>`;
  }

  App.route('/rules', function () {
    var byLevel = [2, 1, 0].map(function (lvl) { return { lvl: lvl, items: S.kb.filter(function (k) { return k.level === lvl; }) }; });
    var sources = [];
    S.routes.forEach(function (r) { (r.sources || []).forEach(function (s) { sources.push([r, s]); }); });
    var levelText = ['Достаточно соблюдать правила — оформлять ничего не нужно.', 'Нужно купить билет или зарегистрироваться — часто это можно сделать в день визита.', 'Документ нужно оформить заранее: от нескольких дней до двух месяцев.'];
    return {
      title: 'Правила и источники',
      html: h`<div class="container page">
        ${ui.pageHead({ crumbs: [['Правила и источники']], title: 'Правила посещения и источники', lead: 'Куда нужен пропуск, а куда — только билет; на каком основании и куда обращаться. Мы указываем первоисточники и дату проверки — правила меняются, поэтому перед поездкой сверяйтесь с ними.' })}
        <nav class="toc toc-inline" aria-label="Разделы страницы"><ul>
          <li><a href="#levels">Уровни ограничений</a></li><li><a href="#kb">Правила</a></li><li><a href="#method">Методика оценки</a></li><li><a href="#all-sources">Все источники</a></li><li><a href="#open-data">Открытые данные</a></li></ul></nav>

        <section class="section" id="levels" aria-labelledby="levels-t">
          <h2 id="levels-t" class="section-title">Три уровня ограничений</h2>
          <ul class="level-grid">${[0, 1, 2].map(function (l) {
            var n = S.routes.filter(function (r) { return L.restrictionLevel(r, S.kb) === l; }).length;
            return h`<li class="level-card level-${l}">${ui.restrictionBadge(l)}<p>${levelText[l]}</p><a href="#/routes${l === 2 ? '' : '?noPermit=1'}">${App.count(n, ['маршрут', 'маршрута', 'маршрутов'])}</a></li>`;
          })}</ul>
        </section>

        <section class="section" id="kb" aria-labelledby="kb-t">
          <h2 id="kb-t" class="section-title">Правила и документы</h2>
          ${byLevel.map(function (g) { return g.items.length ? h`<h3 class="kb-group-title">${D.RESTRICTION_LEVELS[g.lvl]}</h3><div class="grid-cards kb-grid">${g.items.map(function (k) { return kbCard(k, false); })}</div>` : ''; })}
        </section>

        <section class="section prose-section" id="method" aria-labelledby="method-t" tabindex="-1">
          <h2 id="method-t" class="section-title">Как мы оцениваем доступность</h2>
          <p>Мы используем подход паспортизации объектов социальной инфраструктуры: пять категорий посетителей и четыре статуса доступности. Формулировки категорий — от первого лица, чтобы было проще узнать себя.</p>
          ${ui.tableWrap('Категории доступности', h`<table class="table"><caption class="sr-only">Категории посетителей</caption><thead><tr><th scope="col">Буква</th><th scope="col">Как в каталоге</th><th scope="col">Официальное название</th></tr></thead>
            <tbody>${D.ACCESS_CATEGORIES.map(function (c) { return h`<tr><th scope="row">${c.letter}</th><td>${c.name}</td><td>${c.official}</td></tr>`; })}</tbody></table>`)}
          ${ui.tableWrap('Статусы доступности', h`<table class="table"><caption class="sr-only">Статусы доступности</caption><thead><tr><th scope="col">Статус</th><th scope="col">Сокращение</th><th scope="col">Что значит</th></tr></thead>
            <tbody>
              <tr><th scope="row">${ui.accessStatus('DP')}</th><td>ДП</td><td>Можно пройти самостоятельно: покрытие, уклоны и инфраструктура подходят.</td></tr>
              <tr><th scope="row">${ui.accessStatus('DCH')}</th><td>ДЧ</td><td>Доступна часть маршрута или есть оговорки — они указаны в комментарии.</td></tr>
              <tr><th scope="row">${ui.accessStatus('DU')}</th><td>ДУ</td><td>Пройти можно с помощником или сопровождающим.</td></tr>
              <tr><th scope="row">${ui.accessStatus('VND')}</th><td>ВНД</td><td>Маршрут не подходит — даже с помощью.</td></tr>
            </tbody></table>`)}
          <h3>Шкала сложности</h3>
          <ul class="diff-scale">${[1, 2, 3, 4, 5].map(function (d) { return h`<li>${ui.diff(d)}<span>${D.DIFFICULTY[d].hint}</span></li>`; })}</ul>
          <h3>Проверка сведений</h3>
          <p>У каждого маршрута указаны месяц проверки и её уровень: <strong>${D.CHECK_LEVELS.official.toLowerCase()}</strong> или <strong>${D.CHECK_LEVELS.open.toLowerCase()}</strong>. Длина и набор высоты — по трекам OpenStreetMap и цифровой модели рельефа; они ориентировочные.</p>
          <p>Нашли неточность? На странице маршрута есть форма «Сообщить о неточности в доступности» — сообщения получает модератор.</p>
        </section>

        <section class="section" id="all-sources" aria-labelledby="src-t" tabindex="-1">
          <h2 id="src-t" class="section-title">Все источники</h2>
          ${ui.tableWrap('Источники по маршрутам', h`<table class="table table-compact"><caption class="sr-only">Источники сведений о маршрутах</caption>
            <thead><tr><th scope="col">Маршрут</th><th scope="col">Источник</th><th scope="col">Проверено</th></tr></thead>
            <tbody>${sources.map(function (x) { return h`<tr><td><a href="#/routes/${x[0].slug}">${x[0].title}</a></td><td>${ui.extLink(x[1][0], x[1][1])}</td><td>${L.checkText(x[0].check)}</td></tr>`; })}</tbody></table>`)}
        </section>

        <section class="section" id="open-data" aria-labelledby="od-t" tabindex="-1">
          <h2 id="od-t" class="section-title">Открытые данные</h2>
          <p>Каталог доступен в машиночитаемом виде (JSON): тексты — по лицензии CC BY 4.0, треки — © участники OpenStreetMap (ODbL). Данные можно использовать в своих проектах со ссылкой на источник.</p>
          <p><button type="button" class="btn btn-secondary" data-action="open-data">${App.icon('download')}Скачать каталог в JSON</button>
          ${App.api.mode === 'server' ? h` <a class="btn btn-ghost" href="api/open-data" target="_blank" rel="noopener">Открыть API</a>` : ''}</p>
        </section>
      </div>`
    };
  });

  App.route('/rules/:code', function (ctx) {
    var k = S.kbByCode[ctx.params.code];
    if (!k) return App.pages.notFound(ctx);
    return {
      title: k.title,
      html: h`<div class="container page page-narrow">
        ${ui.crumbs([['Правила и источники', '#/rules'], [k.title]])}
        ${kbCard(k, true)}
        <p><a href="#/rules">${App.icon('back')}Все правила</a></p>
      </div>`
    };
  });

  App.actions({
    'open-data': async function () {
      try {
        var res = await App.api.get('open-data');
        App.download('tropy-open-data.json', JSON.stringify(res, null, 2), 'application/json');
      } catch (e) { App.toast(e.message, 'bad'); }
    }
  });
})();

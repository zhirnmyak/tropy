/**
 * Сравнение до трёх маршрутов в одной таблице.
 * Список хранится в браузере (tropy.compare) и дублируется в адресе (#/compare?r=a,b,c),
 * поэтому ссылкой на сравнение можно поделиться.
 * Таблица размечена для экранных дикторов: заголовки столбцов — маршруты, заголовки строк — параметры.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;

  /** Маршруты из адреса (если есть) или из сохранённого списка */
  function pickSlugs(query) {
    var fromUrl = (query.get('r') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var list = (fromUrl.length ? fromUrl : App.compare.list()).filter(function (s, i, a) { return a.indexOf(s) === i && ui.routeBySlug(s); });
    return list.slice(0, App.compare.MAX);
  }

  /** Короткие выводы: какой маршрут короче, проще, доступнее для профиля пользователя */
  function summary(list, needs) {
    if (list.length < 2) return '';
    function best(fn, label) {
      var min = Math.min.apply(null, list.map(fn));
      var winners = list.filter(function (r) { return fn(r) === min; });
      if (winners.length === list.length) return '';
      return h`<li><strong>${label}:</strong> ${winners.map(function (r) { return r.title; }).join(', ')}</li>`;
    }
    var items = [
      best(function (r) { return Number(r.difficulty); }, 'Проще всего'),
      best(function (r) { return Number(r.lengthKm); }, 'Короче всего'),
      best(function (r) { return Number(r.gainM) || 0; }, 'Меньше всего подъёмов'),
      best(function (r) { return ui.routeLevel(r); }, 'Проще оформить посещение')
    ];
    var suit = needs.length ? list.filter(function (r) { return L.suits(r, needs); }) : [];
    return h`<section class="section compare-summary" aria-labelledby="cmp-sum-t">
      <h2 id="cmp-sum-t">Коротко</h2>
      <ul class="ticks">${items}
        ${needs.length ? h`<li><strong>Подходит вашему профилю доступности:</strong> ${suit.length ? suit.map(function (r) { return r.title; }).join(', ') : 'ни один из выбранных — посмотрите строки «Доступность» ниже'}</li>` : ''}
      </ul>
    </section>`;
  }

  function table(list, needs) {
    function row(label, fn, cls) {
      return h`<tr class="${cls || ''}"><th scope="row">${label}</th>${list.map(function (r) { return h`<td>${fn(r)}</td>`; })}</tr>`;
    }
    function group(title) { return h`<tr class="table-group"><th scope="rowgroup" colspan="${list.length + 1}">${title}</th></tr>`; }
    var feats = function (r) {
      return r.features && r.features.length ? h`<ul class="simple-list">${r.features.map(function (f) { return h`<li>${D.FEATURES[f] || f}</li>`; })}</ul>` : '—';
    };
    return ui.tableWrap('Таблица сравнения маршрутов', h`<table class="table compare-table">
      <caption class="sr-only">Сравнение маршрутов: ${list.map(function (r) { return r.title; }).join('; ')}</caption>
      <thead><tr><td class="compare-corner"></td>${list.map(function (r) {
        return h`<th scope="col" class="compare-col-head">
          ${ui.cover(r.cover, { sizes: '(min-width: 960px) 25vw, 60vw', cls: 'cover-compact' })}
          <a href="#/routes/${r.slug}">${r.title}</a></th>`;
      })}</tr></thead>
      <tbody>
        ${group('Основное')}
        ${row('Регион', function (r) { return L.regionOf(r).name; })}
        ${row('Территория', function (r) { return ui.areaText(r); })}
        ${row('Сложность', function (r) { return ui.diff(r.difficulty); })}
        ${row('Длина', function (r) { return h`${L.km(r.lengthKm)}<span class="cell-text muted">${D.ROUTE_TYPES[r.type]}</span>`; })}
        ${row('Время в пути', function (r) { return L.durationText(r); })}
        ${row('Набор высоты', function (r) { return r.gainM ? L.meters(r.gainM) : 'почти без подъёмов'; })}
        ${row('Высшая точка', function (r) { return r.topM ? L.meters(r.topM) : '—'; })}
        ${row('Сезон', function (r) { return L.monthsText(r.months); })}
        ${row('Ночёвка', function (r) { return r.days[1] > 1 ? (r.sleep === 'hut' ? 'приют или база' : 'палатка') : 'не нужна'; })}
        ${row('Посещение', function (r) { return ui.restrictionBadge(ui.routeLevel(r)); })}
        ${row('Оценка посетителей', function (r) { return r.rating ? h`${App.icon('star')}${L.num(r.rating)} из 5 <span class="muted">(${App.count(r.reviewsCount, ['отзыв', 'отзыва', 'отзывов'])})</span>` : 'пока нет отзывов'; })}
      </tbody>
      <tbody>
        ${group('Доступность')}
        ${D.ACCESS_CATEGORIES.map(function (c) {
          var mine = needs.indexOf(c.code) !== -1;
          return row(h`${App.icon('cat-' + c.code, 'cat-i-sm')}${c.name}${mine ? h` <span class="badge badge-info">ваш профиль</span>` : ''}`, function (r) {
            var a = r.access[c.code];
            return h`${ui.accessStatus(a[0])}${a[1] ? h`<span class="cell-text">${a[1]}</span>` : ''}`;
          }, mine ? 'row-mine' : '');
        })}
      </tbody>
      <tbody>
        ${group('Что ещё')}
        ${row('Особенности', feats)}
        ${row('Сведения проверены', function (r) { return L.checkText(r.check); })}
        <tr class="actions-row"><th scope="row">Действия</th>${list.map(function (r) {
          return h`<td class="actions-cell">
            <a class="btn btn-secondary btn-small" href="#/routes/${r.slug}">Подробнее<span class="sr-only"> о маршруте «${r.title}»</span></a>
            <a class="btn btn-secondary btn-small" href="#/plans/new?route=${r.slug}">${App.icon('flag')}Спланировать<span class="sr-only"> поход «${r.title}»</span></a>
            <button type="button" class="btn btn-ghost btn-small" data-action="compare-remove" data-slug="${r.slug}">${App.icon('x')}Убрать<span class="sr-only"> «${r.title}» из сравнения</span></button>
          </td>`;
        })}</tr>
      </tbody></table>`);
  }

  function addForm(list) {
    if (list.length >= App.compare.MAX) return h`<p class="muted">Сравнить можно до трёх маршрутов. Чтобы добавить другой, уберите один из таблицы.</p>`;
    var options = ui.routeOptions('', 'Выберите маршрут…').filter(function (o) { return list.indexOf(o[0]) === -1; });
    return h`<form class="form-inline compare-add" data-form="compare-add" novalidate>
      ${ui.field({ name: 'slug', label: 'Добавить маршрут к сравнению', type: 'select', options: options, required: true })}
      <button type="submit" class="btn btn-primary">${App.icon('plus')}Добавить</button>
    </form>`;
  }

  App.route('/compare', function (ctx) {
    var list = pickSlugs(ctx.query);
    // Если пришли по ссылке — запоминаем этот набор как текущий список сравнения
    if (ctx.query.get('r')) App.store.set('tropy.compare', list);
    var routes = list.map(ui.routeBySlug);
    var needs = (S.user && S.user.needs) || [];
    var body;
    if (!routes.length) {
      body = h`${ui.empty('Пока нечего сравнивать', 'Отметьте «Сравнить» в карточках маршрутов в каталоге или выберите маршрут ниже — можно до трёх сразу.',
        h`<a class="btn btn-primary" href="#/routes">${App.icon('list')}Открыть каталог</a>`)}${addForm([])}`;
    } else {
      body = h`
        ${routes.length === 1 ? ui.notice('info', 'Добавьте ещё маршрут', 'Сравнение полезно, когда маршрутов два или три. Выберите их в каталоге или в списке ниже.') : ''}
        ${summary(routes, needs)}
        <section class="section" aria-labelledby="cmp-t">
          <h2 id="cmp-t">Параметры рядом</h2>
          <p class="muted small hide-print">На узком экране таблицу можно прокручивать вбок: проведите пальцем или используйте стрелки после перехода к таблице клавишей Tab.</p>
          ${table(routes, needs)}
        </section>
        <div class="row compare-tools no-print">
          ${addForm(list)}
          <button type="button" class="btn btn-ghost" data-action="copy" data-text="${location.href.split('#')[0]}#/compare?r=${list.join(',')}">${App.icon('external')}Скопировать ссылку на сравнение</button>
          <button type="button" class="btn btn-ghost" data-action="print">${App.icon('print')}Распечатать</button>
          <button type="button" class="btn btn-ghost" data-action="compare-clear-page">${App.icon('trash')}Очистить сравнение</button>
        </div>`;
    }
    return {
      title: 'Сравнение маршрутов',
      html: h`<div class="container page">${ui.pageHead({ crumbs: [['Каталог', '#/routes'], ['Сравнение']], title: 'Сравнение маршрутов', lead: 'Сложность, длина, сезон, правила посещения и доступность для разных посетителей — в одной таблице.', icon: 'compare' })}${body}</div>`,
      after: function () { App.compare.tray(); }
    };
  });

  function reopen(list, focusId) {
    App.store.set('tropy.compare', list);
    App.go('/compare' + (list.length ? '?r=' + list.join(',') : '') + (focusId ? (list.length ? '&' : '?') + 'focus=' + focusId : ''), { replace: true });
  }

  App.actions({
    'compare-remove': function (el) {
      var slug = el.getAttribute('data-slug');
      var r = ui.routeBySlug(slug);
      var list = pickSlugs(App.parseHash().query).filter(function (s) { return s !== slug; });
      reopen(list, list.length ? 'cmp-t' : '');
      App.announce('Маршрут «' + (r ? r.title : slug) + '» убран из сравнения. Осталось: ' + list.length);
    },
    'compare-clear-page': function () {
      reopen([]);
      App.announce('Список сравнения очищен');
    }
  });

  App.form('compare-add', function (form, data) {
    if (!data.slug) throw { fields: { slug: 'Выберите маршрут из списка' } };
    var list = pickSlugs(App.parseHash().query);
    if (list.indexOf(data.slug) === -1) list.push(data.slug);
    reopen(list.slice(0, App.compare.MAX), 'cmp-t');
    App.announce('Маршрут добавлен к сравнению: ' + list.length + ' из 3');
  });
})();

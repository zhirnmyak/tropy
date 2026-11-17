/**
 * Администрирование: сводка, маршруты (редактор с проверкой по общей схеме), модерация отзывов,
 * сообщения о доступности, обратная связь, роли пользователей, объявления и журнал действий.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;
  var TABS = [['overview', 'Сводка', 'home'], ['routes', 'Маршруты', 'route'], ['reviews', 'Отзывы', 'star'], ['reports', 'Доступность', 'access'],
    ['feedback', 'Обратная связь', 'mail'], ['users', 'Пользователи', 'user'], ['alerts', 'Объявления', 'warn'], ['audit', 'Журнал', 'doc']];
  var ACTIONS = { create: 'создание', update: 'изменение', delete: 'удаление', status: 'смена статуса', moderate: 'модерация', role: 'смена роли' };
  var ENTITIES = { route: 'маршрут', review: 'отзыв', report: 'сообщение', user: 'пользователь', alert: 'объявление' };
  var dt = function (s) { return s ? String(s).slice(0, 16).replace('T', ' ') : '—'; };

  function shell(tab, body, extraCrumb) {
    var t = TABS.find(function (x) { return x[0] === tab; }) || TABS[0];
    return h`<div class="container page">
      ${ui.pageHead({ crumbs: [['Администрирование', '#/admin']].concat(extraCrumb ? [[t[1], '#/admin/' + t[0]], [extraCrumb]] : [[t[1]]]), title: extraCrumb || 'Администрирование: ' + t[1].toLowerCase() })}
      <nav class="tabs" aria-label="Разделы администрирования"><ul>${TABS.map(function (x) {
        return h`<li><a href="#/admin/${x[0]}"${App.on(x[0] === tab, 'aria-current="page"')}>${App.icon(x[2])}${x[1]}</a></li>`;
      })}</ul></nav>
      <div class="tab-body">${body}</div></div>`;
  }

  /* ---------- Сводка ---------- */
  async function overview() {
    var s = await App.api.get('admin/stats');
    var maxNeed = Math.max.apply(null, [1].concat(Object.keys(s.needs).map(function (k) { return s.needs[k]; })));
    return h`<ul class="stat-tiles">
        <li><strong>${s.routes}</strong><span>опубликовано маршрутов${s.hiddenRoutes ? ', скрыто: ' + s.hiddenRoutes : ''}</span></li>
        <li><strong>${s.users}</strong><span>пользователей</span></li>
        <li><strong>${s.reviews}</strong><span>отзывов</span></li>
        <li><strong>${s.newReports}</strong><span><a href="#/admin/reports">сообщений о доступности</a> ждут ответа</span></li>
        <li><strong>${s.newFeedback}</strong><span><a href="#/admin/feedback">новых обращений</a></span></li>
        <li><strong>${s.plans}</strong><span>планов походов</span></li>
      </ul>
      <div class="two-col">
        <section class="card card-pad" aria-labelledby="needs-st"><h2 id="needs-st" class="section-title">Потребности пользователей</h2>
          <ul class="bars">${D.ACCESS_CATEGORIES.map(function (c) {
            var n = s.needs[c.code] || 0;
            return h`<li><span class="bar-label">${c.name}</span><span class="bar" aria-hidden="true"><span style="width:${Math.round(n / maxNeed * 100)}%"></span></span><span class="bar-n">${n}</span></li>`;
          })}</ul></section>
        <section class="card card-pad" aria-labelledby="top-st"><h2 id="top-st" class="section-title">Чаще всего в избранном</h2>
          ${s.topRoutes.length ? h`<ol class="simple-list">${s.topRoutes.map(function (r) { return h`<li><a href="#/routes/${r.slug}">${r.title}</a> — ${r.n}</li>`; })}</ol>` : h`<p class="muted">Пока нет данных.</p>`}</section>
      </div>`;
  }

  /* ---------- Маршруты ---------- */
  async function routesTab() {
    var res = await App.api.get('admin/routes');
    return h`<div class="row"><a class="btn btn-primary" href="#/admin/route/new">${App.icon('plus')}Добавить маршрут</a></div>
      ${ui.tableWrap('Маршруты', h`<table class="table"><caption class="sr-only">Все маршруты, включая скрытые</caption>
        <thead><tr><th scope="col">Маршрут</th><th scope="col">Регион</th><th scope="col">Сложность</th><th scope="col">Проверено</th><th scope="col">Статус</th><th scope="col">Действия</th></tr></thead>
        <tbody>${res.items.map(function (r) {
          var hidden = r.status === 'hidden';
          return h`<tr><th scope="row"><a href="#/routes/${r.slug}">${r.title}</a></th><td>${L.regionOf(r).name}</td><td>${r.difficulty} — ${D.DIFFICULTY[r.difficulty].name}</td><td>${L.checkText(r.check)}</td>
            <td>${hidden ? h`<span class="badge badge-warn">скрыт</span>` : h`<span class="badge badge-ok">опубликован</span>`}</td>
            <td class="actions-cell"><a class="btn btn-secondary btn-small" href="#/admin/route/${r.slug}">${App.icon('edit')}Изменить<span class="sr-only">: ${r.title}</span></a>
              <button type="button" class="btn btn-ghost btn-small" data-action="adm-route-status" data-slug="${r.slug}" data-status="${hidden ? 'published' : 'hidden'}">${hidden ? 'Опубликовать' : 'Скрыть'}<span class="sr-only">: ${r.title}</span></button>
              <button type="button" class="btn btn-ghost btn-small" data-action="adm-route-delete" data-slug="${r.slug}" aria-label="Удалить маршрут: ${r.title}">${App.icon('trash')}</button></td></tr>`;
        })}</tbody></table>`)}`;
  }

  var lines = function (a) { return (a || []).join('\n'); };
  var pipes = function (a) { return (a || []).map(function (x) { return x.join(' | '); }).join('\n'); };
  function editor(r, isNew) {
    var monthItems = D.MONTHS.map(function (m, i) { return [String(i + 1), m]; });
    return h`<form class="form route-editor" data-form="route-edit" data-slug="${isNew ? '' : r.slug}" novalidate>
      <p class="hint">Поля со звёздочкой обязательны. Списки — по одному элементу на строку; в таблицах значения разделяются вертикальной чертой « | ». Данные проверяются по той же схеме, что и на сервере.</p>
      <fieldset class="fieldset card card-pad"><legend>Основное</legend>
        <div class="field-row">
          ${ui.field({ name: 'title', label: 'Название', required: true, value: r.title, id: 're-title' })}
          ${ui.field({ name: 'slug', label: 'Адрес (slug)', required: true, value: r.slug, id: 're-slug', hint: 'Латиница, цифры и дефис: например, kurshskaya-kosa' })}
        </div>
        <div class="field-row">
          ${ui.field({ name: 'region', label: 'Регион', type: 'select', required: true, value: r.region, options: [['', 'Выберите…']].concat(D.REGIONS.map(function (x) { return [x.code, x.name]; })), id: 're-region' })}
          ${ui.field({ name: 'areaType', label: 'Тип территории', type: 'select', required: true, value: r.areaType, options: Object.keys(D.AREA_TYPES).map(function (k) { return [k, D.AREA_TYPES[k]]; }), id: 're-areatype' })}
        </div>
        ${ui.field({ name: 'area', label: 'Территория', value: r.area, id: 're-area', hint: 'Например, Национальный парк «Куршская коса»' })}
        <div class="field-row">
          ${ui.field({ name: 'difficulty', label: 'Сложность', type: 'select', required: true, value: String(r.difficulty || 2), options: [1, 2, 3, 4, 5].map(function (d) { return [String(d), d + ' — ' + D.DIFFICULTY[d].name]; }), id: 're-diff' })}
          ${ui.field({ name: 'type', label: 'Тип маршрута', type: 'select', required: true, value: r.type, options: Object.keys(D.ROUTE_TYPES).map(function (k) { return [k, D.ROUTE_TYPES[k]]; }), id: 're-type' })}
          ${ui.field({ name: 'cover', label: 'Иллюстрация', type: 'select', required: true, value: r.cover, options: Object.keys(D.COVERS).map(function (k) { return [k, k + ' — ' + D.COVERS[k].slice(0, 50) + '…']; }), id: 're-cover' })}
        </div>
        <div class="field-row">
          ${ui.field({ name: 'lengthKm', label: 'Длина, км', type: 'number', required: true, value: r.lengthKm, attrs: 'step="0.1" min="0.1"', id: 're-len' })}
          ${ui.field({ name: 'gainM', label: 'Набор высоты, м', type: 'number', required: true, value: r.gainM, attrs: 'step="1" min="0"', id: 're-gain' })}
          ${ui.field({ name: 'topM', label: 'Высшая точка, м', type: 'number', value: r.topM, attrs: 'step="1" min="0"', id: 're-top' })}
          ${ui.field({ name: 'durationH', label: 'Ходовое время, ч', type: 'number', required: true, value: r.durationH, attrs: 'step="0.5" min="0.1"', id: 're-dur' })}
        </div>
        <div class="field-row">
          ${ui.field({ name: 'daysMin', label: 'Дней, минимум', type: 'number', required: true, value: r.days ? r.days[0] : 1, attrs: 'min="1" max="60"', id: 're-dmin' })}
          ${ui.field({ name: 'daysMax', label: 'Дней, максимум', type: 'number', required: true, value: r.days ? r.days[1] : 1, attrs: 'min="1" max="60"', id: 're-dmax' })}
          ${ui.field({ name: 'sleep', label: 'Ночёвка', type: 'select', value: r.sleep || '', options: [['', 'Не указано'], ['tent', 'Палатка'], ['hut', 'Приют']], id: 're-sleep' })}
        </div>
        <div data-field="days"></div>
        ${ui.checks({ name: 'months', legend: 'Сезон (месяцы)', items: monthItems, values: (r.months || []).map(String), array: true, required: true, cls: 'checks-months' })}
        ${ui.checks({ name: 'landscapes', legend: 'Ландшафт', items: Object.keys(D.LANDSCAPES).map(function (k) { return [k, D.LANDSCAPES[k]]; }), values: r.landscapes, array: true })}
        ${ui.checks({ name: 'features', legend: 'Особенности', items: Object.keys(D.FEATURES).map(function (k) { return [k, D.FEATURES[k]]; }), values: r.features, array: true })}
      </fieldset>
      <fieldset class="fieldset card card-pad"><legend>Тексты</legend>
        ${ui.field({ name: 'summary', label: 'Кратко (для карточки)', type: 'textarea', required: true, value: r.summary, rows: 3, id: 're-summary', hint: 'От 20 до 600 символов' })}
        ${ui.field({ name: 'easy', label: 'Простыми словами', type: 'textarea', value: lines(r.easy), rows: 5, id: 're-easy', hint: 'Короткие предложения, по одному на строку' })}
        ${ui.field({ name: 'description', label: 'Описание', type: 'textarea', value: (r.description || []).join('\n\n'), rows: 8, id: 're-desc', hint: 'Абзацы разделяйте пустой строкой' })}
        ${ui.field({ name: 'tiflo', label: 'Тифлокомментарий', type: 'textarea', value: r.tiflo, rows: 4, id: 're-tiflo' })}
        ${ui.field({ name: 'highlights', label: 'Что вы увидите', type: 'textarea', value: lines(r.highlights), rows: 4, id: 're-hl', hint: 'По одному на строку' })}
        ${ui.field({ name: 'stages', label: 'Этапы', type: 'textarea', value: pipes(r.stages), rows: 5, id: 're-stages', hint: 'Название | км от старта | описание' })}
        ${ui.field({ name: 'safety', label: 'Безопасность', type: 'textarea', value: lines(r.safety), rows: 4, id: 're-safety', hint: 'По одному совету на строку' })}
      </fieldset>
      <fieldset class="fieldset card card-pad" data-field="start"><legend>Старт и транспорт</legend>
        ${ui.field({ name: 'startName', label: 'Точка старта', required: true, value: r.start && r.start.name, id: 're-sname' })}
        <div class="field-row">
          ${ui.field({ name: 'startLat', label: 'Широта', type: 'number', required: true, value: r.start && r.start.lat, attrs: 'step="0.000001"', id: 're-lat' })}
          ${ui.field({ name: 'startLon', label: 'Долгота', type: 'number', required: true, value: r.start && r.start.lon, attrs: 'step="0.000001"', id: 're-lon' })}
        </div>
        ${ui.field({ name: 'startTransport', label: 'Как добраться', type: 'textarea', value: r.start && r.start.transport, rows: 3, id: 're-transport' })}
      </fieldset>
      <fieldset class="fieldset card card-pad" data-field="access"><legend>Доступность</legend>
        ${D.ACCESS_CATEGORIES.map(function (c) {
          var a = (r.access && r.access[c.code]) || ['VND', ''];
          return h`<div class="field-row access-row">
            ${ui.field({ name: 'acc_' + c.code, label: c.letter + ' — ' + c.name, type: 'select', required: true, value: a[0], options: Object.keys(D.ACCESS_STATUS).map(function (k) { return [k, D.ACCESS_STATUS[k].name]; }), id: 're-acc-' + c.code })}
            ${ui.field({ name: 'accNote_' + c.code, label: 'Комментарий для «' + c.letter + '»', value: a[1], id: 're-accn-' + c.code })}
          </div>`;
        })}
        ${ui.field({ name: 'env', label: 'Условия на маршруте', type: 'textarea', value: pipes(r.env), rows: 5, id: 're-env', hint: 'Параметр | значение, например «Покрытие | деревянный настил»' })}
      </fieldset>
      <fieldset class="fieldset card card-pad"><legend>Правила и источники</legend>
        ${ui.field({ name: 'restrictions', label: 'Ограничения', type: 'textarea', value: pipes(r.restrictions), rows: 4, id: 're-restr', hint: 'Код | примечание. Коды: ' + S.kb.map(function (k) { return k.code; }).join(', ') })}
        ${ui.field({ name: 'sources', label: 'Источники', type: 'textarea', value: pipes(r.sources), rows: 4, id: 're-src', hint: 'Название | https://адрес' })}
        <div class="field-row" data-field="check">
          ${ui.field({ name: 'checkDate', label: 'Месяц проверки', type: 'month', required: true, value: (r.check && r.check.date) || L.isoDate(new Date()).slice(0, 7), id: 're-cdate' })}
          ${ui.field({ name: 'checkLevel', label: 'Уровень проверки', type: 'select', required: true, value: (r.check && r.check.level) || 'open', options: Object.keys(D.CHECK_LEVELS).map(function (k) { return [k, D.CHECK_LEVELS[k]]; }), id: 're-clevel' })}
          ${ui.field({ name: 'status', label: 'Статус', type: 'select', value: r.status || 'published', options: [['published', 'Опубликован'], ['hidden', 'Скрыт']], id: 're-status' })}
        </div>
      </fieldset>
      <div class="form-actions sticky-actions"><button type="submit" class="btn btn-primary">${isNew ? 'Создать маршрут' : 'Сохранить изменения'}</button><a class="btn btn-ghost" href="#/admin/routes">Отмена</a></div>
    </form>`;
  }
  function splitLines(s) { return String(s || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function splitPipes(s, n, numIdx) {
    return splitLines(s).map(function (line) {
      var p = line.split('|').map(function (x) { return x.trim(); });
      while (p.length < n) p.push('');
      if (p.length > n) p = p.slice(0, n - 1).concat([p.slice(n - 1).join(' | ')]);
      if (numIdx != null) p[numIdx] = p[numIdx] === '' ? 0 : Number(String(p[numIdx]).replace(',', '.'));
      return p;
    });
  }
  function routeBody(d) {
    var access = {};
    D.ACCESS_CATEGORIES.forEach(function (c) { access[c.code] = [d['acc_' + c.code], String(d['accNote_' + c.code] || '').trim()]; });
    var body = {
      slug: d.slug, title: d.title, region: d.region, area: d.area, areaType: d.areaType, difficulty: Number(d.difficulty), lengthKm: d.lengthKm, gainM: d.gainM,
      durationH: d.durationH, days: [d.daysMin, d.daysMax], type: d.type, topM: d.topM, months: (d.months || []).map(Number), cover: d.cover,
      landscapes: d.landscapes || [], features: d.features || [], summary: d.summary, easy: splitLines(d.easy),
      tiflo: d.tiflo, description: String(d.description || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean),
      highlights: splitLines(d.highlights), stages: splitPipes(d.stages, 3, 1), env: splitPipes(d.env, 2), safety: splitLines(d.safety),
      start: { name: d.startName, lat: d.startLat, lon: d.startLon, transport: d.startTransport },
      access: access, restrictions: splitPipes(d.restrictions, 2), sources: splitPipes(d.sources, 2),
      check: { date: d.checkDate, level: d.checkLevel }, status: d.status
    };
    if (d.sleep) body.sleep = d.sleep;
    var unknown = body.restrictions.filter(function (x) { return !S.kbByCode[x[0]]; });
    if (unknown.length) { var e = new Error('v'); e.fields = { restrictions: 'Неизвестный код ограничения: ' + unknown[0][0] }; throw e; }
    return body;
  }
  App.form('route-edit', async function (form, d) {
    var slug = form.getAttribute('data-slug');
    var body = routeBody(d);
    App.forms.check(form, 'route', body);
    if (slug) await App.api.put('admin/routes/' + slug, body); else await App.api.post('admin/routes', body);
    await App.loadRoutes();
    App.toast(slug ? 'Маршрут сохранён' : 'Маршрут создан', 'ok');
    App.go('/admin/routes');
  });

  /* ---------- Отзывы ---------- */
  async function reviewsTab() {
    var res = await App.api.get('admin/reviews');
    if (!res.items.length) return ui.empty('Отзывов пока нет');
    return ui.tableWrap('Отзывы', h`<table class="table"><caption class="sr-only">Отзывы пользователей</caption>
      <thead><tr><th scope="col">Маршрут</th><th scope="col">Автор</th><th scope="col">Оценка</th><th scope="col">Текст</th><th scope="col">Статус</th><th scope="col">Действия</th></tr></thead>
      <tbody>${res.items.map(function (v) {
        var hidden = v.status === 'hidden';
        return h`<tr><td><a href="#/routes/${v.routeSlug}">${v.routeTitle}</a></td><td>${v.author}<br><span class="small muted">${dt(v.createdAt)}</span></td><td>${v.rating} из 5</td>
          <td class="cell-text">${v.text}</td><td>${hidden ? h`<span class="badge badge-warn">скрыт</span>` : h`<span class="badge badge-ok">опубликован</span>`}</td>
          <td class="actions-cell"><button type="button" class="btn btn-secondary btn-small" data-action="adm-review" data-id="${v.id}" data-status="${hidden ? 'published' : 'hidden'}">${hidden ? 'Опубликовать' : 'Скрыть'}</button>
            <button type="button" class="btn btn-ghost btn-small" data-action="adm-review-delete" data-id="${v.id}" aria-label="Удалить отзыв автора ${v.author}">${App.icon('trash')}</button></td></tr>`;
      })}</tbody></table>`);
  }

  /* ---------- Сообщения о доступности ---------- */
  async function reportsTab() {
    var res = await App.api.get('admin/reports');
    if (!res.items.length) return ui.empty('Сообщений пока нет', 'Посетители отправляют их со страниц маршрутов.');
    return h`<ul class="admin-list">${res.items.map(function (a) {
      return h`<li class="card card-pad"><article aria-labelledby="rep-${a.id}">
        <h2 id="rep-${a.id}" class="admin-item-title"><a href="#/routes/${a.routeSlug}">${a.routeTitle}</a> <span class="badge">${ui.needName(a.category)}</span> <span class="badge badge-${a.status === 'new' ? 'warn' : 'info'}">${D.REPORT_STATUS[a.status]}</span></h2>
        <p class="small muted">${a.author}, ${dt(a.createdAt)}${a.contact ? ' · контакт: ' + a.contact : ''}</p>
        <p>${a.text}</p>
        <form class="form form-inline" data-form="adm-report" data-id="${a.id}" novalidate>
          <div class="field-row">
            ${ui.field({ name: 'status', label: 'Статус', type: 'select', value: a.status, options: Object.keys(D.REPORT_STATUS).map(function (k) { return [k, D.REPORT_STATUS[k]]; }), id: 'rs-' + a.id })}
            ${ui.field({ name: 'resolution', label: 'Что сделано', value: a.resolution || '', id: 'rr-' + a.id })}
          </div>
          <button type="submit" class="btn btn-secondary btn-small">Сохранить</button>
        </form></article></li>`;
    })}</ul>`;
  }

  /* ---------- Обратная связь ---------- */
  async function feedbackTab() {
    var res = await App.api.get('admin/feedback');
    if (!res.items.length) return ui.empty('Обращений пока нет');
    return h`<ul class="admin-list">${res.items.map(function (f) {
      return h`<li class="card card-pad"><article aria-labelledby="fb-${f.id}">
        <h2 id="fb-${f.id}" class="admin-item-title">${D.FEEDBACK_TOPICS[f.topic]} <span class="badge badge-${f.status === 'new' ? 'warn' : 'ok'}">${f.status === 'new' ? 'новое' : 'решено'}</span></h2>
        <p class="small muted">${f.name || 'Без имени'}${f.email ? h`, <a href="mailto:${f.email}">${f.email}</a>` : ''} · ${dt(f.createdAt)}${f.page ? ' · страница ' + f.page : ''}</p>
        <p>${f.message}</p>
        <button type="button" class="btn btn-secondary btn-small" data-action="adm-feedback" data-id="${f.id}" data-status="${f.status === 'new' ? 'resolved' : 'new'}">${f.status === 'new' ? 'Отметить решённым' : 'Вернуть в новые'}</button>
      </article></li>`;
    })}</ul>`;
  }

  /* ---------- Пользователи ---------- */
  async function usersTab() {
    var res = await App.api.get('admin/users');
    return ui.tableWrap('Пользователи', h`<table class="table"><caption class="sr-only">Пользователи</caption>
      <thead><tr><th scope="col">Имя</th><th scope="col">Почта</th><th scope="col">Роль</th><th scope="col">Потребности</th><th scope="col">Отзывов</th><th scope="col">Регистрация</th><th scope="col">Последний вход</th></tr></thead>
      <tbody>${res.items.map(function (u) {
        var self = u.id === S.user.id;
        return h`<tr><th scope="row">${u.name}${self ? h` <span class="badge badge-info">вы</span>` : ''}</th><td>${u.email}</td>
          <td>${self ? 'Администратор' : h`<label class="sr-only" for="role-${u.id}">Роль: ${u.name}</label><select class="select select-small" id="role-${u.id}" data-change="adm-role" data-id="${u.id}">
            <option value="user"${App.on(u.role === 'user', 'selected')}>Пользователь</option><option value="admin"${App.on(u.role === 'admin', 'selected')}>Администратор</option></select>`}</td>
          <td>${u.needs.length ? u.needs.map(function (c) { return D.ACCESS_BY_CODE[c] ? D.ACCESS_BY_CODE[c].letter : c; }).join(', ') : '—'}</td><td>${u.reviews}</td><td>${dt(u.createdAt)}</td><td>${dt(u.lastLoginAt)}</td></tr>`;
      })}</tbody></table>`);
  }

  /* ---------- Объявления ---------- */
  async function alertsTab() {
    var res = await App.api.get('admin/alerts');
    return h`<form class="form card form-card" data-form="adm-alert" novalidate>
        <h2 class="section-title">Новое объявление</h2>
        ${ui.field({ name: 'text', label: 'Текст', type: 'textarea', required: true, rows: 3, id: 'al-text', hint: 'От 3 до 300 символов. Показывается под шапкой на всех страницах' })}
        <div class="field-row">
          ${ui.field({ name: 'level', label: 'Важность', type: 'select', required: true, value: 'info', options: [['info', 'К сведению'], ['warning', 'Важно']], id: 'al-level' })}
          ${ui.field({ name: 'link', label: 'Ссылка', type: 'url', id: 'al-link', hint: 'https://…' })}
          ${ui.field({ name: 'until', label: 'Показывать до', type: 'date', id: 'al-until' })}
        </div>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Опубликовать</button></div>
      </form>
      ${res.items.length ? h`<h2 class="section-title">Опубликованные</h2><ul class="admin-list">${res.items.map(function (a) {
        return h`<li class="card card-pad"><p><span class="badge badge-${a.level === 'warning' ? 'warn' : 'info'}">${a.level === 'warning' ? 'Важно' : 'К сведению'}</span> ${a.text}</p>
          <p class="small muted">${a.until ? 'До ' + ui.date(a.until) : 'Бессрочно'}${a.link ? ' · ' + a.link : ''}</p>
          <button type="button" class="btn btn-ghost btn-small" data-action="adm-alert-delete" data-id="${a.id}">${App.icon('trash')}Удалить<span class="sr-only"> объявление</span></button></li>`;
      })}</ul>` : ''}`;
  }

  /* ---------- Журнал ---------- */
  async function auditTab() {
    var res = await App.api.get('admin/audit');
    if (!res.items.length) return ui.empty('Журнал пуст', 'Здесь появятся действия администраторов.');
    return ui.tableWrap('Журнал действий', h`<table class="table table-compact"><caption class="sr-only">Журнал действий администраторов</caption>
      <thead><tr><th scope="col">Когда</th><th scope="col">Кто</th><th scope="col">Действие</th><th scope="col">Объект</th></tr></thead>
      <tbody>${res.items.map(function (a) { return h`<tr><td>${dt(a.created_at)}</td><td>${a.name || '—'}</td><td>${ACTIONS[a.action] || a.action}</td><td>${ENTITIES[a.entity] || a.entity} ${a.entity_id}</td></tr>`; })}</tbody></table>`);
  }

  var RENDER = { overview: overview, routes: routesTab, reviews: reviewsTab, reports: reportsTab, feedback: feedbackTab, users: usersTab, alerts: alertsTab, audit: auditTab };
  async function tabPage(tab) {
    if (!RENDER[tab]) tab = 'overview';
    var t = TABS.find(function (x) { return x[0] === tab; });
    return { title: 'Администрирование — ' + t[1], html: shell(tab, await RENDER[tab]()) };
  }
  App.route('/admin', function () { return tabPage('overview'); }, { auth: true, admin: true });
  App.route('/admin/route/new', function () {
    var blank = { title: '', slug: '', region: '', areaType: 'none', type: 'loop', difficulty: 2, cover: 'forest', months: [5, 6, 7, 8, 9], landscapes: [], features: [], days: [1, 1], status: 'published' };
    return { title: 'Новый маршрут', html: shell('routes', editor(blank, true), 'Новый маршрут') };
  }, { auth: true, admin: true });
  App.route('/admin/route/:slug', async function (ctx) {
    var data = await App.api.get('routes/' + ctx.params.slug);
    return { title: 'Редактирование: ' + data.route.title, html: shell('routes', editor(data.route, false), 'Редактирование: ' + data.route.title) };
  }, { auth: true, admin: true });
  App.route('/admin/:tab', function (ctx) { return tabPage(ctx.params.tab); }, { auth: true, admin: true });

  async function refreshTab(msg) {
    var tab = App.parseHash().path.split('/')[2] || 'overview';
    var body = App.$('.tab-body');
    if (body) body.innerHTML = String(await RENDER[tab in RENDER ? tab : 'overview']());
    if (msg) App.toast(msg, 'ok');
  }
  function guard(fn) { return async function (el, e) { try { await fn(el, e); } catch (err) { App.toast(err.message, 'bad'); } }; }
  App.actions({
    'adm-route-status': guard(async function (el) {
      await App.api.patch('admin/routes/' + el.getAttribute('data-slug'), { status: el.getAttribute('data-status') });
      await App.loadRoutes(); await refreshTab(el.getAttribute('data-status') === 'hidden' ? 'Маршрут скрыт' : 'Маршрут опубликован');
    }),
    'adm-route-delete': guard(async function (el) {
      if (!(await App.confirm({ title: 'Удалить маршрут?', text: 'Вместе с маршрутом удалятся отзывы, планы и отметки пользователей. Чтобы временно убрать маршрут, лучше скройте его.', ok: 'Удалить', danger: true }))) return;
      await App.api.del('admin/routes/' + el.getAttribute('data-slug'));
      await App.loadRoutes(); await refreshTab('Маршрут удалён');
    }),
    'adm-review': guard(async function (el) { await App.api.patch('admin/reviews/' + el.getAttribute('data-id'), { status: el.getAttribute('data-status') }); await refreshTab('Статус отзыва изменён'); }),
    'adm-review-delete': guard(async function (el) {
      if (!(await App.confirm({ title: 'Удалить отзыв?', ok: 'Удалить', danger: true }))) return;
      await App.api.del('reviews/' + el.getAttribute('data-id')); await refreshTab('Отзыв удалён');
    }),
    'adm-feedback': guard(async function (el) { await App.api.patch('admin/feedback/' + el.getAttribute('data-id'), { status: el.getAttribute('data-status') }); await refreshTab('Статус обращения изменён'); }),
    'adm-alert-delete': guard(async function (el) {
      await App.api.del('admin/alerts/' + el.getAttribute('data-id'));
      S.alerts = (await App.api.get('alerts')).items; await refreshTab('Объявление удалено');
    })
  });
  App.change('adm-role', async function (el) {
    try { await App.api.patch('admin/users/' + el.getAttribute('data-id'), { role: el.value }); App.toast('Роль изменена', 'ok'); }
    catch (e) { App.toast(e.message, 'bad'); }
  });
  App.form('adm-report', async function (form, d) {
    await App.api.patch('admin/reports/' + form.getAttribute('data-id'), { status: d.status, resolution: d.resolution });
    App.toast('Сообщение обновлено', 'ok');
  });
  App.form('adm-alert', async function (form, d) {
    var body = { text: d.text, level: d.level, link: d.link, until: d.until || null };
    App.forms.check(form, 'alert', body);
    await App.api.post('admin/alerts', body);
    S.alerts = (await App.api.get('alerts')).items;
    await refreshTab('Объявление опубликовано');
  });
})();

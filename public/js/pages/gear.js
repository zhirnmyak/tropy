/**
 * Список снаряжения: генерируется по маршруту, сезону, длительности и потребностям участников
 * (TROPY.logic.buildGear + каталог data/gear.js). Отметки «собрано», свой предметы, вес,
 * печать и выгрузка в текст; вошедшие пользователи сохраняют списки в профиле.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state, T = App.T;
  var TERRAIN = [['mountain', 'Горы, камни, курумник'], ['alpine', 'Высокогорье — выше 2000 м'], ['volcano', 'Вулканы, вулканический песок'], ['water', 'Озёра, реки, море'], ['forest', 'Лес и тайга'], ['canyon', 'Ущелья и каньоны']];
  var G = { params: null, items: [], listId: null, title: '', routeSlug: '' };
  var saveTimer = null;

  function catalogItem(id) { return T.gear.items.find(function (x) { return x.id === id; }); }
  function catName(code) { if (code === 'custom') return 'Своё'; var c = T.gear.categories.find(function (x) { return x[0] === code; }); return c ? c[1] : code; }
  function defaults(q) {
    var month = Number(q.get('month')) || new Date().getMonth() + 1;
    var r = ui.routeBySlug(q.get('route') || '');
    var p = r ? L.gearParamsFromRoute(r, month, S.kb) : { season: L.seasonOfMonth(month), days: 1, overnight: 'none', terrain: ['forest'], difficulty: 2, ticks: false, permits: false, remote: false };
    p.month = month; p.routeSlug = r ? r.slug : '';
    p.needs = (S.user && S.user.needs) ? S.user.needs.slice() : [];
    p.groupSize = 2;
    return p;
  }
  function build(p) {
    var res = L.buildGear(p, T.gear);
    var items = [];
    res.groups.forEach(function (g) { g.items.forEach(function (it) { items.push({ id: it.id, name: it.name, qty: it.qty, weight: it.weight, checked: false, cat: g.cat }); }); });
    return items;
  }
  function storageKey() { return 'tropy.gear.' + (G.listId ? 'list' + G.listId : JSON.stringify([G.params.routeSlug, G.params.season, G.params.days, G.params.overnight, G.params.terrain, G.params.needs])); }
  function restoreChecks() {
    if (G.listId) return;
    var saved = App.store.get(storageKey(), []);
    G.items.forEach(function (it) { it.checked = saved.indexOf(it.id) !== -1; });
  }
  function persistChecks() {
    if (!G.listId) { App.store.set(storageKey(), G.items.filter(function (i) { return i.checked; }).map(function (i) { return i.id; })); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { App.api.put('gear-lists/' + G.listId, payload()).catch(function (e) { App.toast(e.message, 'bad'); }); }, 700);
  }
  function weightOf(it) { var c = catalogItem(it.id); return c && c.group ? Math.round(it.weight / Math.max(1, G.params.groupSize || 1)) : it.weight; }
  function kg(g) { return L.num(Math.round(g / 100) / 10) + '\u00a0кг'; }
  function payload() {
    var r = ui.routeBySlug(G.params.routeSlug);
    return { title: G.title || ('Снаряжение: ' + (r ? r.title : 'мой поход')), routeSlug: G.params.routeSlug || '', params: G.params, items: G.items.map(function (i) { return { id: i.id, name: i.name, qty: i.qty, weight: i.weight, checked: !!i.checked, cat: i.cat }; }) };
  }

  function paramsForm(p) {
    return h`<form id="gear-form" class="form gear-form" data-form="gear" data-change="gear-params" novalidate aria-labelledby="gear-form-title">
      <h2 id="gear-form-title" class="section-title">Параметры похода</h2>
      ${ui.field({ name: 'routeSlug', label: 'Маршрут', type: 'select', value: p.routeSlug, options: ui.routeOptions(p.routeSlug, 'Свой маршрут — укажу параметры сам'), id: 'gear-route', hint: 'При выборе маршрута параметры заполнятся автоматически' })}
      <div class="field-row">
        ${ui.field({ name: 'month', label: 'Месяц', type: 'select', value: String(p.month), options: D.MONTHS.map(function (m, i) { return [String(i + 1), m.charAt(0).toUpperCase() + m.slice(1)]; }), id: 'gear-month' })}
        ${ui.field({ name: 'days', label: 'Дней в походе', type: 'number', value: p.days, attrs: 'min="1" max="30" step="1"', inputmode: 'numeric', id: 'gear-days' })}
        ${ui.field({ name: 'groupSize', label: 'Человек в группе', type: 'number', value: p.groupSize, attrs: 'min="1" max="30" step="1"', inputmode: 'numeric', id: 'gear-group', hint: 'Общий груз делится на всех' })}
      </div>
      ${ui.checks({ name: 'overnight', legend: 'Ночёвка', type: 'radio', items: [['none', 'Без ночёвки'], ['hut', 'В приюте или доме'], ['tent', 'В палатке']], values: [p.overnight], cls: 'checks-inline' })}
      ${ui.checks({ name: 'terrain', legend: 'Местность', items: TERRAIN, values: p.terrain, array: true })}
      ${ui.field({ name: 'difficulty', label: 'Сложность маршрута', type: 'select', value: String(p.difficulty), options: [1, 2, 3, 4, 5].map(function (d) { return [String(d), d + ' — ' + D.DIFFICULTY[d].name]; }), id: 'gear-diff' })}
      ${ui.checks({ name: 'needs', legend: 'Участники', hint: 'Добавим адаптивное снаряжение и документы', items: ui.needsItems(true), values: p.needs, array: true })}
      <fieldset class="field fieldset"><legend>Условия</legend>
        <label class="check"><input type="checkbox" name="ticks" value="1"${App.on(p.ticks, 'checked')}><span>Район, где активны клещи</span></label>
        <label class="check"><input type="checkbox" name="permits" value="1"${App.on(p.permits, 'checked')}><span>Нужны билет, пропуск или разрешение</span></label>
        <label class="check"><input type="checkbox" name="remote" value="1"${App.on(p.remote, 'checked')}><span>Отдалённый район, связи может не быть</span></label>
      </fieldset>
      <div class="form-actions"><button type="submit" class="btn btn-primary">${App.icon('backpack')}Обновить список</button></div>
    </form>`;
  }
  function readParams(d) {
    return {
      routeSlug: d.routeSlug || '', month: Number(d.month) || 1, season: L.seasonOfMonth(Number(d.month) || 1),
      days: Math.min(30, Math.max(1, Math.round(Number(d.days) || 1))), groupSize: Math.min(30, Math.max(1, Math.round(Number(d.groupSize) || 1))),
      overnight: d.overnight || 'none', terrain: d.terrain || [], difficulty: Number(d.difficulty) || 2, needs: d.needs || [],
      ticks: !!d.ticks, permits: !!d.permits, remote: !!d.remote
    };
  }

  function listHtml() {
    var groups = {}, order = T.gear.categories.map(function (c) { return c[0]; }).concat(['custom']);
    G.items.forEach(function (it, idx) { (groups[it.cat] = groups[it.cat] || []).push([it, idx]); });
    var total = G.items.reduce(function (s, it) { return s + weightOf(it); }, 0), done = G.items.filter(function (i) { return i.checked; }).length;
    var r = ui.routeBySlug(G.params.routeSlug);
    return h`<div class="gear-head">
        <h2 id="gear-list-title" class="section-title" tabindex="-1">${G.listId ? G.title : 'Ваш список'}${r && !G.listId ? h`: <a href="#/routes/${r.slug}">${r.title}</a>` : ''}</h2>
        <p>${App.count(G.items.length, ['предмет', 'предмета', 'предметов'])} · примерно <strong>${kg(total)}</strong> на человека${G.params.groupSize > 1 ? ' с учётом общего груза' : ''}.</p>
        <div class="progress-row"><progress id="gear-bar" max="${G.items.length}" value="${done}" aria-labelledby="gear-progress"></progress><p id="gear-progress" aria-live="polite">Собрано ${done} из ${G.items.length}</p></div>
        <div class="row no-print">
          ${S.user ? h`<button type="button" class="btn btn-primary" data-action="gear-save">${App.icon('heart')}${G.listId ? 'Сохранить как новый' : 'Сохранить в профиль'}</button>` : h`<a class="btn btn-secondary" href="#/login?next=${encodeURIComponent(App.here())}">${App.icon('user')}Войдите, чтобы сохранить</a>`}
          <button type="button" class="btn btn-secondary" data-action="print">${App.icon('print')}Распечатать</button>
          <button type="button" class="btn btn-secondary" data-action="gear-txt">${App.icon('download')}Скачать текстом</button>
          <button type="button" class="btn btn-ghost" data-action="gear-uncheck">Снять все отметки</button>
        </div>
      </div>
      <div class="gear-groups">${order.filter(function (c) { return groups[c]; }).map(function (c) {
        return h`<fieldset class="gear-group"><legend>${catName(c)} <span class="muted small">(${groups[c].length})</span></legend><ul class="gear-items">${groups[c].map(function (pair) {
          var it = pair[0], meta = catalogItem(it.id) || {}, id = 'g-' + pair[1];
          return h`<li class="gear-item${it.checked ? ' is-checked' : ''}">
            <input type="checkbox" id="${id}" data-change="gear-check" data-idx="${pair[1]}"${App.on(it.checked, 'checked')}${meta.why ? h` aria-describedby="${id}-why"` : ''}>
            <label for="${id}"><span class="gear-name">${it.name}${it.qty > 1 ? h` <span class="gear-qty">× ${it.qty}</span>` : ''}</span>
              ${meta.essential ? h`<span class="badge badge-warn">обязательно</span>` : ''}${meta.group ? h`<span class="badge">на группу</span>` : ''}</label>
            <span class="gear-w">${it.weight ? (it.weight >= 1000 ? kg(it.weight) : L.num(it.weight) + '\u00a0г') : ''}</span>
            ${meta.why ? h`<p class="gear-why small muted" id="${id}-why">${meta.why}</p>` : ''}
            ${it.cat === 'custom' ? h`<button type="button" class="btn btn-ghost btn-small btn-icon" data-action="gear-remove" data-idx="${pair[1]}" aria-label="Удалить: ${it.name}">${App.icon('trash')}</button>` : ''}
          </li>`;
        })}</ul></fieldset>`;
      })}</div>
      <form class="form form-inline no-print" data-form="gear-add" novalidate aria-labelledby="gear-add-title">
        <h3 id="gear-add-title">Добавить свой предмет</h3>
        <div class="field-row">
          ${ui.field({ name: 'name', label: 'Название', required: true, id: 'gear-add-name' })}
          ${ui.field({ name: 'weight', label: 'Вес, г', type: 'number', attrs: 'min="0" max="100000"', inputmode: 'numeric', id: 'gear-add-w' })}
        </div>
        <button type="submit" class="btn btn-secondary">${App.icon('plus')}Добавить</button>
      </form>`;
  }

  async function savedLists() {
    if (!S.user) return '';
    try {
      var res = await App.api.get('gear-lists');
      if (!res.items.length) return '';
      return h`<section class="section saved-lists no-print" aria-labelledby="saved-title"><h2 id="saved-title" class="section-title">Сохранённые списки</h2>
        <ul class="simple-list">${res.items.map(function (g) {
          var done = g.items.filter(function (i) { return i.checked; }).length;
          return h`<li><a href="#/gear?list=${g.id}">${g.title}</a> <span class="muted small">— собрано ${done} из ${g.items.length}, обновлён ${ui.date(g.updatedAt)}</span>
            <button type="button" class="btn btn-ghost btn-small" data-action="gear-delete" data-id="${g.id}" aria-label="Удалить список: ${g.title}">${App.icon('trash')}Удалить</button></li>`;
        })}</ul></section>`;
    } catch (e) { return ''; }
  }

  App.route('/gear', async function (ctx) {
    G.listId = null; G.title = '';
    var listId = Number(ctx.query.get('list')) || 0;
    if (listId && S.user) {
      var all = await App.api.get('gear-lists');
      var g = all.items.find(function (x) { return x.id === listId; });
      if (!g) throw App.ApiError(404, 'not_found', 'Список не найден');
      G.listId = g.id; G.title = g.title;
      G.params = Object.assign(defaults(new URLSearchParams()), g.params || {});
      G.items = g.items;
    } else {
      G.params = defaults(ctx.query);
      G.items = build(G.params);
      restoreChecks();
    }
    var saved = await savedLists();
    return {
      title: 'Снаряжение',
      html: h`<div class="container page">
        ${ui.pageHead({ crumbs: [['Снаряжение']], title: 'Что взять с собой', lead: 'Список под маршрут, сезон и потребности участников: с весом, пояснениями и отметками «собрано». Отметки сохраняются автоматически.' })}
        ${G.listId ? ui.notice('info', 'Открыт сохранённый список', h`<p>Отметки сохраняются в профиле. <a href="#/gear">Составить новый список</a></p>`) : ''}
        <div class="gear-layout">
          ${G.listId ? '' : h`<div class="gear-side no-print">${paramsForm(G.params)}</div>`}
          <section class="gear-main" id="gear-main" aria-labelledby="gear-list-title">${listHtml()}</section>
        </div>
        ${saved}
      </div>`
    };
  });

  function rerender(focus) {
    document.getElementById('gear-main').innerHTML = String(listHtml());
    if (focus) App.focus(document.getElementById('gear-list-title'));
  }
  App.change('gear-params', function (form, e) {
    if (e.target.name === 'routeSlug') {
      var d = App.forms.read(form);
      var q = new URLSearchParams(); if (d.routeSlug) q.set('route', d.routeSlug); q.set('month', d.month);
      var p = defaults(q); p.groupSize = Number(d.groupSize) || 2; p.needs = d.needs || [];
      form.outerHTML = String(paramsForm(p));
      G.params = p; G.items = build(p); restoreChecks(); rerender();
      App.setQuery({ route: p.routeSlug, month: p.month });
      var sel = document.getElementById('gear-route'); if (sel) sel.focus();
      App.announce('Параметры заполнены по маршруту. ' + App.count(G.items.length, ['предмет', 'предмета', 'предметов']) + ' в списке');
    }
  });
  App.form('gear', function (form, d) {
    G.params = readParams(d);
    G.items = build(G.params); restoreChecks();
    App.setQuery({ route: G.params.routeSlug, month: G.params.month });
    rerender(true);
  });
  App.change('gear-check', function (el) {
    var it = G.items[Number(el.getAttribute('data-idx'))];
    it.checked = el.checked;
    el.closest('.gear-item').classList.toggle('is-checked', el.checked);
    var done = G.items.filter(function (i) { return i.checked; }).length;
    document.getElementById('gear-progress').textContent = 'Собрано ' + done + ' из ' + G.items.length + (done === G.items.length ? '. Всё готово!' : '');
    document.getElementById('gear-bar').value = done;
    persistChecks();
  });
  App.form('gear-add', function (form, d) {
    var name = String(d.name || '').trim();
    if (!name) { var e = new Error('v'); e.fields = { name: 'Укажите название предмета' }; throw e; }
    G.items.push({ id: 'c' + Date.now().toString(36), name: name.slice(0, 200), qty: 1, weight: Math.max(0, Math.min(100000, Math.round(Number(d.weight) || 0))), checked: false, cat: 'custom' });
    persistChecks(); rerender();
    App.announce('Добавлено: ' + name);
    var f = document.getElementById('gear-add-name'); if (f) f.focus();
  });
  App.actions({
    'gear-remove': function (el) {
      var it = G.items.splice(Number(el.getAttribute('data-idx')), 1)[0];
      persistChecks(); rerender();
      App.announce('Удалено: ' + it.name);
      var f = document.getElementById('gear-add-name'); if (f) f.focus();
    },
    'gear-uncheck': function () { G.items.forEach(function (i) { i.checked = false; }); persistChecks(); rerender(); App.announce('Все отметки сняты'); },
    'gear-txt': function () {
      var groups = {};
      G.items.forEach(function (it) { (groups[it.cat] = groups[it.cat] || []).push(it); });
      var r = ui.routeBySlug(G.params.routeSlug);
      var txt = 'Снаряжение' + (r ? ': ' + r.title : '') + '\n«Тропы без барьеров»\n\n' + Object.keys(groups).map(function (c) {
        return catName(c).toUpperCase() + '\n' + groups[c].map(function (i) { return (i.checked ? '[x] ' : '[ ] ') + i.name + (i.qty > 1 ? ' × ' + i.qty : '') + (i.weight ? ' — ' + i.weight + ' г' : ''); }).join('\n');
      }).join('\n\n') + '\n';
      App.download('snaryazhenie.txt', txt);
    },
    'gear-save': async function () {
      try {
        var body = payload();
        if (G.listId) body.title = body.title + ' (копия)';
        var res = await App.api.post('gear-lists', body);
        App.toast('Список сохранён в профиле', 'ok');
        App.go('/gear?list=' + res.list.id);
      } catch (e) { App.toast(e.message, 'bad'); }
    },
    'gear-delete': async function (el) {
      if (!(await App.confirm({ title: 'Удалить список?', text: 'Список снаряжения будет удалён.', ok: 'Удалить', danger: true }))) return;
      try { await App.api.del('gear-lists/' + el.getAttribute('data-id')); App.toast('Список удалён'); App.go('/gear', { replace: true }); } catch (e) { App.toast(e.message, 'bad'); }
    }
  });
})();

/**
 * Подбор маршрута: пошаговый мастер (4 вопроса) → маршруты с объяснением «почему подходит».
 * Шаги — обычные fieldset внутри одной формы: работает с клавиатуры и экранными дикторами,
 * ответы сохраняются в адресе страницы, результатом можно поделиться.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;

  var FITNESS = [
    ['1', 'Гуляю недолго', 'До часа спокойной прогулки по ровной дорожке'],
    ['2', 'Хожу пешком пару часов', 'До 10 км по ровному, небольшие подъёмы'],
    ['3', 'Могу идти целый день', 'С подъёмами в гору, по камням и корням'],
    ['4', 'Был в походах с рюкзаком', 'Горы, большой набор высоты, ночёвки в палатке'],
    ['5', 'Опытный турист', 'Готов к автономным многодневным походам']
  ];
  var DURATION = [['short', 'Час-два'], ['half', 'Полдня'], ['day', 'Целый день'], ['multi', '2–3 дня с ночёвкой'], ['long', 'Неделя и больше']];
  var STEPS = ['Кто идёт', 'Подготовка', 'Время', 'Что важно'];

  function answersFrom(q) {
    var list = function (k) { return (q.get(k) || '').split(',').filter(Boolean); };
    return {
      needs: list('need').filter(function (c) { return D.ACCESS_BY_CODE[c]; }), companion: q.get('companion') === '1', kids: q.get('kids') === '1',
      fitness: Number(q.get('fit')) || 0, duration: q.get('dur') || '', month: Number(q.get('month')) || 0, district: q.get('district') || '',
      land: list('land').filter(function (x) { return D.LANDSCAPES[x]; }), noCar: q.get('noCar') === '1', noPermit: q.get('noPermit') === '1'
    };
  }
  function toQuery(a, step) {
    return { need: a.needs, companion: a.companion, kids: a.kids, fit: a.fitness, dur: a.duration, month: a.month, district: a.district, land: a.land, noCar: a.noCar, noPermit: a.noPermit, step: step };
  }
  function fromForm(d) {
    return { needs: d.need || [], companion: !!d.companion, kids: !!d.kids, fitness: Number(d.fit) || 0, duration: d.dur || '', month: Number(d.month) || 0, district: d.district || '', land: d.land || [], noCar: !!d.noCar, noPermit: !!d.noPermit };
  }

  App.route('/pick', function (ctx) {
    var a = answersFrom(ctx.query);
    var step = ctx.query.get('step') === 'results' ? 'results' : Math.min(4, Math.max(1, Number(ctx.query.get('step')) || 1));
    if (!a.month) a.month = new Date().getMonth() + 1;
    if (!ctx.query.get('need') && step === 1 && S.user && S.user.needs) a.needs = S.user.needs.slice();
    return {
      title: 'Подбор маршрута',
      after: function () { show(step, a, true); },
      html: h`<div class="container page page-narrow">
        ${ui.pageHead({ crumbs: [['Подбор маршрута']], title: 'Подбор маршрута', lead: 'Ответьте на четыре вопроса — покажем подходящие маршруты и объясним, почему они вам подходят и на что обратить внимание.' })}
        <ol class="steps" aria-label="Шаги подбора">${STEPS.map(function (s, i) { return h`<li data-step="${i + 1}"><span class="steps-n" aria-hidden="true">${i + 1}</span><span>${s}</span></li>`; })}<li data-step="results"><span class="steps-n" aria-hidden="true">${App.icon('check')}</span><span>Результат</span></li></ol>
        <form id="pick-form" class="form wizard" data-form="pick" novalidate>
          <fieldset class="step" data-step="1" hidden>
            <legend><h2 class="step-title" tabindex="-1">Шаг 1 из 4. Кто идёт и что важно учесть?</h2></legend>
            <p class="hint">Отметьте всё, что относится к вам или к кому-то в группе. Можно ничего не отмечать.</p>
            ${ui.checks({ name: 'need', legend: 'Особенности участников', items: D.ACCESS_CATEGORIES.map(function (c) { return [c.code, c.name]; }), values: a.needs, icons: 'cat-', array: true, cls: 'checks-access checks-big legend-sr' })}
            <label class="check"><input type="checkbox" name="companion" value="1"${App.on(a.companion, 'checked')}><span>С нами будет помощник или сопровождающий<small>Покажем и маршруты, доступные с помощником</small></span></label>
            <label class="check"><input type="checkbox" name="kids" value="1"${App.on(a.kids, 'checked')}><span>Идём с детьми<small>Исключим сложные маршруты</small></span></label>
          </fieldset>
          <fieldset class="step" data-step="2" hidden>
            <legend><h2 class="step-title" tabindex="-1">Шаг 2 из 4. Какая у вас подготовка?</h2></legend>
            ${ui.checks({ name: 'fit', legend: 'Подготовка', type: 'radio', items: FITNESS, values: [String(a.fitness || '')], cls: 'checks-big legend-sr' })}
          </fieldset>
          <fieldset class="step" data-step="3" hidden>
            <legend><h2 class="step-title" tabindex="-1">Шаг 3 из 4. Сколько времени и когда?</h2></legend>
            ${ui.checks({ name: 'dur', legend: 'Сколько времени готовы идти', type: 'radio', items: [['', 'Неважно']].concat(DURATION), values: [a.duration], cls: 'checks-inline' })}
            ${ui.field({ name: 'month', label: 'В каком месяце', type: 'select', value: String(a.month), options: D.MONTHS.map(function (m, i) { return [String(i + 1), m.charAt(0).toUpperCase() + m.slice(1)]; }), id: 'pick-month' })}
          </fieldset>
          <fieldset class="step" data-step="4" hidden>
            <legend><h2 class="step-title" tabindex="-1">Шаг 4 из 4. Где и что хочется увидеть?</h2></legend>
            ${ui.field({ name: 'district', label: 'Федеральный округ', type: 'select', value: a.district, options: [['', 'Неважно — вся Россия']].concat(D.DISTRICTS.map(function (d) { return [d.code, d.name]; })), id: 'pick-district' })}
            ${ui.checks({ name: 'land', legend: 'Что хочется увидеть', items: Object.keys(D.LANDSCAPES).map(function (k) { return [k, D.LANDSCAPES[k]]; }), values: a.land, array: true })}
            <label class="check"><input type="checkbox" name="noCar" value="1"${App.on(a.noCar, 'checked')}><span>Добираемся без машины<small>Поднимем выше маршруты, куда можно доехать общественным транспортом</small></span></label>
            <label class="check"><input type="checkbox" name="noPermit" value="1"${App.on(a.noPermit, 'checked')}><span>Без пропусков и разрешений<small>Исключим маршруты, где документы нужно оформлять заранее</small></span></label>
          </fieldset>
          <div class="wizard-nav">
            <button type="button" class="btn btn-secondary" data-action="pick-back">${App.icon('back')}Назад</button>
            <button type="submit" class="btn btn-primary" id="pick-next">Далее${App.icon('chevron')}</button>
          </div>
        </form>
        <section id="pick-results" aria-labelledby="pick-res-title" hidden></section>
      </div>`
    };
  });

  var cur = { step: 1, a: null };
  function show(step, a, initial) {
    cur.step = step; cur.a = a;
    var form = document.getElementById('pick-form'), res = document.getElementById('pick-results');
    if (!form) return;
    App.$$('.steps li').forEach(function (li) {
      var s = li.getAttribute('data-step');
      var n = s === 'results' ? 5 : Number(s), c = step === 'results' ? 5 : step;
      li.className = n < c ? 'done' : n === c ? 'current' : '';
      if (n === c) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (step === 'results') {
      form.hidden = true; res.hidden = false;
      res.innerHTML = String(results(a));
      if (!initial) App.focus(document.getElementById('pick-res-title'));
    } else {
      form.hidden = false; res.hidden = true;
      App.$$('.step', form).forEach(function (fs) { fs.hidden = Number(fs.getAttribute('data-step')) !== step; });
      App.$('[data-action="pick-back"]').hidden = step === 1;
      var next = document.getElementById('pick-next');
      next.innerHTML = String(step === 4 ? h`${App.icon('search')}Показать маршруты` : h`Далее${App.icon('chevron')}`);
      if (!initial) App.focus(App.$('.step[data-step="' + step + '"] .step-title'));
    }
    App.setQuery(toQuery(a, step));
  }

  function results(a) {
    var list = L.scoreRoutes(S.routes, a, S.kb);
    var top = list.slice(0, 6);
    var summary = [];
    if (a.needs.length) summary.push(a.needs.map(function (c) { return D.ACCESS_BY_CODE[c].name.toLowerCase(); }).join(', '));
    if (a.fitness) summary.push('подготовка: ' + FITNESS[a.fitness - 1][1].toLowerCase());
    if (a.duration) summary.push(DURATION.find(function (d) { return d[0] === a.duration; })[1].toLowerCase());
    summary.push(D.MONTHS[a.month - 1]);
    if (a.district) summary.push(D.DISTRICT_BY_CODE[a.district].name + ' округ');
    return h`<h2 id="pick-res-title" class="section-title" tabindex="-1">${list.length ? 'Подходящие маршруты: ' + list.length : 'Подходящих маршрутов не нашлось'}</h2>
      <p class="muted">Вы выбрали: ${summary.join('; ')}.</p>
      <div class="row"><button type="button" class="btn btn-secondary" data-action="pick-restart">${App.icon('edit')}Изменить ответы</button>
        <button type="button" class="btn btn-ghost" data-action="pick-copy">${App.icon('external')}Скопировать ссылку на подборку</button></div>
      ${list.length ? h`<ol class="pick-list">${top.map(function (x, i) {
        var lvl = x.score >= 100 ? ['ok', 'Отлично подходит'] : x.score >= 70 ? ['ok', 'Хорошо подходит'] : ['warn', 'Может подойти'];
        var reasons = h`<div class="match">
          <p class="match-level match-${lvl[0]}">${App.icon(lvl[0] === 'ok' ? 'check' : 'info')}${i === 0 ? 'Лучший вариант. ' : ''}${lvl[1]}</p>
          ${x.reasons.length ? h`<ul class="ticks ticks-sm" aria-label="Почему подходит">${x.reasons.map(function (t) { return h`<li>${t}</li>`; })}</ul>` : ''}
          ${x.warnings.length ? h`<ul class="ticks ticks-warn ticks-sm" aria-label="На что обратить внимание">${x.warnings.map(function (t) { return h`<li>${t}</li>`; })}</ul>` : ''}
        </div>`;
        return h`<li>${ui.routeCard(x.route, { needs: a.needs, reasons: reasons, headingLevel: 3 })}</li>`;
      })}</ol>
      ${list.length > top.length ? h`<p><a class="btn btn-secondary" href="#/routes?${catalogQuery(a)}">Все подходящие маршруты в каталоге (${list.length})</a></p>` : ''}`
      : ui.empty('Попробуйте смягчить условия', 'Чаще всего помогает выбрать «Неважно» в длительности, другой месяц или убрать фильтр по округу.',
        h`<button type="button" class="btn btn-primary" data-action="pick-restart">Изменить ответы</button><a class="btn btn-secondary" href="#/routes">Открыть весь каталог</a>`)}`;
  }
  function catalogQuery(a) {
    var p = new URLSearchParams();
    if (a.needs.length) p.set('need', a.needs.join(','));
    if (a.companion) p.set('companion', '1');
    if (a.fitness) p.set('diff', [1, 2, 3, 4, 5].filter(function (d) { return d <= a.fitness && (!a.kids || d <= 3); }).join(','));
    if (a.month) p.set('month', a.month);
    if (a.district) p.set('district', a.district);
    if (a.noPermit) p.set('noPermit', '1');
    return p.toString().replace(/%2C/g, ',');
  }

  App.form('pick', function (form, d) {
    var a = fromForm(d);
    if (!a.month) a.month = new Date().getMonth() + 1;
    show(cur.step >= 4 ? 'results' : cur.step + 1, a);
  });
  App.actions({
    'pick-back': function () { var d = App.forms.read(document.getElementById('pick-form')); show(Math.max(1, cur.step - 1), fromForm(d)); },
    'pick-restart': function () { show(1, cur.a); },
    'pick-copy': function () { App.copy(location.href, 'Ссылка на подборку скопирована'); }
  });
})();

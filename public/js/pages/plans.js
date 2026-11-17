/**
 * Мои походы: план с автоматическими задачами подготовки (сроки зависят от правил маршрута —
 * разрешения, уведомление МЧС, билеты), свои задачи, экспорт в календарь (ICS)
 * и карточка безопасности для близких (печать).
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;
  var STATE_TEXT = { overdue: 'Просрочено', soon: 'Скоро', later: 'Позже', done: 'Готово' };
  var today = function () { return L.isoDate(new Date()); };

  function progress(p) { var d = p.tasks.filter(function (t) { return t.done; }).length; return { done: d, total: p.tasks.length }; }
  function countdown(p) {
    var n = L.diffDays(today(), p.startDate);
    if (n > 0) return 'до старта ' + App.count(n, ['день', 'дня', 'дней']);
    if (n === 0) return 'старт сегодня';
    return L.diffDays(today(), p.endDate) >= 0 ? 'поход идёт сейчас' : 'поход завершён';
  }
  function needsText(list) { return (list || []).map(ui.needName).join(', '); }

  /* ---------- Список ---------- */

  App.route('/plans', async function () {
    var res = await App.api.get('plans');
    var t = today();
    var upcoming = res.items.filter(function (p) { return p.endDate >= t; }), past = res.items.filter(function (p) { return p.endDate < t; }).reverse();
    var card = function (p) {
      var pr = progress(p), next = p.tasks.filter(function (x) { return !x.done; })[0];
      var st = next ? L.taskState(next, t) : 'done';
      return h`<li class="card plan-card"><article aria-labelledby="plan-${p.id}">
        <h3 id="plan-${p.id}" class="plan-card-title"><a class="card-link" href="#/plans/${p.id}">${p.title || p.routeTitle}</a></h3>
        <p class="muted">${p.routeTitle}</p>
        <p>${App.icon('calendar')}${ui.date(p.startDate)}${p.endDate !== p.startDate ? ' — ' + ui.date(p.endDate) : ''} · <strong>${countdown(p)}</strong></p>
        <div class="progress-row"><progress max="${pr.total}" value="${pr.done}" aria-label="Подготовка: выполнено ${pr.done} из ${pr.total}"></progress><span class="small">${pr.done} из ${pr.total}</span></div>
        ${next ? h`<p class="small task-next state-${st}">${App.icon(st === 'overdue' ? 'warn' : 'clock')}<span>${STATE_TEXT[st]}: ${next.text}${next.due ? ' — до ' + ui.date(next.due) : ''}</span></p>` : h`<p class="small">${App.icon('check')}Все задачи выполнены</p>`}
      </article></li>`;
    };
    return {
      title: 'Мои походы',
      html: h`<div class="container page">
        ${ui.pageHead({ crumbs: [['Мои походы']], title: 'Мои походы', lead: 'План подготовки со сроками: какие документы оформить, когда купить билеты и уведомить МЧС. Задачи создаются автоматически по правилам маршрута.' })}
        <p><a class="btn btn-primary" href="#/plans/new">${App.icon('plus')}Новый поход</a></p>
        ${res.items.length ? '' : ui.empty('Пока нет ни одного плана', 'Выберите маршрут в каталоге и нажмите «Спланировать поход» — или создайте план здесь.', h`<a class="btn btn-secondary" href="#/routes">Перейти в каталог</a>`)}
        ${upcoming.length ? h`<section class="section" aria-labelledby="up-t"><h2 id="up-t" class="section-title">Предстоящие</h2><ul class="grid-cards">${upcoming.map(card)}</ul></section>` : ''}
        ${past.length ? h`<section class="section" aria-labelledby="past-t"><h2 id="past-t" class="section-title">Прошедшие</h2><ul class="grid-cards">${past.map(card)}</ul></section>` : ''}
      </div>`
    };
  }, { auth: true, title: 'Войдите, чтобы планировать походы' });

  /* ---------- Форма ---------- */

  function planForm(p, isNew) {
    var start = p.startDate || L.addDays(today(), 30);
    var r = ui.routeBySlug(p.routeSlug);
    return h`<form class="form card form-card" data-form="plan" data-id="${p.id || ''}" novalidate>
      ${ui.field({ name: 'routeSlug', label: 'Маршрут', type: 'select', required: true, value: p.routeSlug || '', options: ui.routeOptions(p.routeSlug, 'Выберите маршрут…'), id: 'plan-route' })}
      ${ui.field({ name: 'title', label: 'Название похода', value: p.title || '', hint: 'Например, «Байкал с семьёй». Если не заполнить, будет использовано название маршрута', id: 'plan-title' })}
      <div class="field-row">
        ${ui.field({ name: 'startDate', label: 'Дата начала', type: 'date', required: true, value: start, id: 'plan-start' })}
        ${ui.field({ name: 'endDate', label: 'Дата окончания', type: 'date', required: true, value: p.endDate || (r ? L.addDays(start, r.days[0] - 1) : start), id: 'plan-end' })}
        ${ui.field({ name: 'groupSize', label: 'Человек в группе', type: 'number', required: true, value: p.groupSize || 2, attrs: 'min="1" max="30"', inputmode: 'numeric', id: 'plan-group' })}
      </div>
      ${ui.checks({ name: 'needs', legend: 'Особенности участников', hint: 'Добавим задачи: звонок в визит-центр, договорённость с сопровождающим', items: ui.needsItems(true), values: p.needs || (isNew && S.user.needs) || [], array: true })}
      <fieldset class="field fieldset"><legend>Контакт на случай ЧП</legend>
        <p class="hint">Человек, который знает ваш маршрут и ждёт контрольного звонка. Попадёт в карточку безопасности.</p>
        <div class="field-row">
          ${ui.field({ name: 'contactName', label: 'Имя', value: p.contactName || '', autocomplete: 'off', id: 'plan-cname' })}
          ${ui.field({ name: 'contactPhone', label: 'Телефон', type: 'tel', value: p.contactPhone || '', autocomplete: 'off', inputmode: 'tel', id: 'plan-cphone', hint: 'Например, +7 900 123-45-67' })}
        </div>
      </fieldset>
      ${ui.field({ name: 'notes', label: 'Заметки', type: 'textarea', value: p.notes || '', rows: 3, id: 'plan-notes' })}
      ${isNew ? '' : h`<label class="check"><input type="checkbox" name="regen" value="1"><span>Пересоздать список задач по новым датам и маршруту<small>Свои задачи и отметки будут удалены</small></span></label>`}
      <div class="form-actions"><button type="submit" class="btn btn-primary">${isNew ? 'Создать план' : 'Сохранить'}</button><a class="btn btn-ghost" href="${isNew ? '#/plans' : '#/plans/' + p.id}">Отмена</a></div>
    </form>`;
  }
  App.route('/plans/new', function (ctx) {
    var slug = ctx.query.get('route') || '';
    var r = ui.routeBySlug(slug);
    return {
      title: 'Новый поход',
      html: h`<div class="container page page-narrow">
        ${ui.pageHead({ crumbs: [['Мои походы', '#/plans'], ['Новый поход']], title: 'Новый поход', lead: r ? 'Маршрут: ' + r.title + '. Задачи подготовки появятся автоматически.' : 'Выберите маршрут и даты — задачи подготовки появятся автоматически.' })}
        ${planForm({ routeSlug: slug }, true)}
      </div>`
    };
  }, { auth: true, title: 'Войдите, чтобы планировать походы' });
  App.route('/plans/:id/edit', async function (ctx) {
    var p = (await App.api.get('plans/' + ctx.params.id)).plan;
    return {
      title: 'Изменить план',
      html: h`<div class="container page page-narrow">
        ${ui.pageHead({ crumbs: [['Мои походы', '#/plans'], [p.title || p.routeTitle, '#/plans/' + p.id], ['Изменить']], title: 'Изменить план' })}
        ${planForm(p, false)}
      </div>`
    };
  }, { auth: true });
  App.form('plan', async function (form, d) {
    var id = form.getAttribute('data-id');
    var old = id ? (await App.api.get('plans/' + id)).plan : null;
    var body = {
      routeSlug: d.routeSlug, title: d.title, startDate: d.startDate, endDate: d.endDate, groupSize: Number(d.groupSize) || null,
      needs: d.needs || [], contactName: d.contactName, contactPhone: d.contactPhone, notes: d.notes,
      tasks: old && !d.regen ? old.tasks : []
    };
    App.forms.check(form, 'plan', body);
    var res = id ? await App.api.put('plans/' + id, body) : await App.api.post('plans', body);
    App.toast(id ? 'План сохранён' : 'План создан: ' + App.count(res.plan.tasks.length, ['задача', 'задачи', 'задач']) + ' подготовки', 'ok');
    App.go('/plans/' + res.plan.id);
  });

  /* ---------- Просмотр плана ---------- */

  App.route('/plans/:id', async function (ctx) {
    var p = (await App.api.get('plans/' + ctx.params.id)).plan;
    var r = ui.routeBySlug(p.routeSlug);
    return { title: p.title || p.routeTitle, html: planView(p, r) };
  }, { auth: true });

  var currentPlan = null;
  function planView(p, r) {
    currentPlan = p;
    var t = today(), pr = progress(p);
    var groups = { overdue: [], soon: [], later: [], done: [] };
    p.tasks.forEach(function (task) { groups[L.taskState(task, t)].push(task); });
    var order = ['overdue', 'soon', 'later', 'done'];
    return h`<div class="container page">
      ${ui.pageHead({ crumbs: [['Мои походы', '#/plans'], [p.title || p.routeTitle]], title: p.title || p.routeTitle,
        lead: h`${r ? h`Маршрут: <a href="#/routes/${r.slug}">${r.title}</a>. ` : ''}${ui.date(p.startDate)}${p.endDate !== p.startDate ? ' — ' + ui.date(p.endDate) : ''}, ${App.count(p.groupSize, ['человек', 'человека', 'человек'])} · ${countdown(p)}.` })}
      <div class="row plan-actions">
        <a class="btn btn-primary" href="#/plans/${p.id}/card">${App.icon('sos')}Карточка безопасности</a>
        <button type="button" class="btn btn-secondary" data-action="plan-ics">${App.icon('calendar')}В календарь (ICS)</button>
        ${r ? h`<a class="btn btn-secondary" href="#/gear?route=${r.slug}&month=${Number(p.startDate.slice(5, 7))}">${App.icon('backpack')}Снаряжение</a>` : ''}
        <a class="btn btn-ghost" href="#/plans/${p.id}/edit">${App.icon('edit')}Изменить</a>
        <button type="button" class="btn btn-ghost" data-action="plan-delete">${App.icon('trash')}Удалить</button>
      </div>
      ${offSeason(p, r)}
      <section class="section" aria-labelledby="tasks-t">
        <h2 id="tasks-t" class="section-title">Подготовка</h2>
        <div class="progress-row"><progress id="plan-bar" max="${pr.total}" value="${pr.done}" aria-labelledby="plan-progress"></progress><p id="plan-progress" aria-live="polite">Выполнено ${pr.done} из ${pr.total}</p></div>
        ${groups.overdue.length ? ui.notice('bad', 'Есть просроченные задачи: ' + groups.overdue.length, 'Некоторые разрешения оформляются долго — проверьте, успеваете ли вы, или перенесите даты похода.') : ''}
        ${order.filter(function (k) { return groups[k].length; }).map(function (k) {
          return h`<h3 class="task-group-title state-${k}">${App.icon(k === 'overdue' ? 'warn' : k === 'done' ? 'check' : 'clock')}${STATE_TEXT[k]} <span class="muted">(${groups[k].length})</span></h3>
          <ul class="tasks">${groups[k].map(function (task) {
            var id = 'task-' + task.id;
            return h`<li class="task state-${k}">
              <input type="checkbox" id="${id}" data-change="task" data-task="${task.id}"${App.on(task.done, 'checked')} aria-describedby="${id}-due">
              <label for="${id}">${task.text}</label>
              <p class="task-meta small" id="${id}-due">${task.due ? (k === 'overdue' ? 'Срок прошёл: ' : 'Срок: ') + ui.date(task.due) : 'Без срока'}${task.link ? h` · ${/^#/.test(task.link) ? h`<a href="${task.link}">Открыть</a>` : ui.extLink('Перейти', task.link)}` : ''}</p>
              ${task.code === 'custom' ? h`<button type="button" class="btn btn-ghost btn-small btn-icon" data-action="task-delete" data-task="${task.id}" aria-label="Удалить задачу: ${task.text}">${App.icon('trash')}</button>` : ''}
            </li>`;
          })}</ul>`;
        })}
        <form class="form form-inline" data-form="task-add" novalidate aria-labelledby="task-add-t">
          <h3 id="task-add-t">Добавить свою задачу</h3>
          <div class="field-row">
            ${ui.field({ name: 'text', label: 'Что сделать', required: true, id: 'task-text' })}
            ${ui.field({ name: 'due', label: 'Срок', type: 'date', id: 'task-due' })}
          </div>
          <button type="submit" class="btn btn-secondary">${App.icon('plus')}Добавить задачу</button>
        </form>
      </section>
      ${p.needs && p.needs.length ? h`<p><strong>Особенности участников:</strong> ${needsText(p.needs)}.</p>` : ''}
      ${p.notes ? h`<section class="section" aria-labelledby="notes-t"><h2 id="notes-t" class="section-title">Заметки</h2><p class="prose">${p.notes}</p></section>` : ''}
    </div>`;
  }
  /** Предупреждение, если даты похода не попадают в сезон маршрута */
  function offSeason(p, r) {
    if (!r || !r.months || r.months.length === 12) return '';
    var m1 = Number(p.startDate.slice(5, 7)), m2 = Number(p.endDate.slice(5, 7));
    if (r.months.indexOf(m1) !== -1 || r.months.indexOf(m2) !== -1) return '';
    return ui.notice('warn', 'Даты похода — не в сезон для этого маршрута',
      'Лучшее время — ' + L.monthsText(r.months) + '. В другие месяцы тропа может быть закрыта, опасна или недоступна по погоде — уточните условия у администрации территории или перенесите поход.');
  }
  async function savePlan(p, msg) {
    var body = { routeSlug: p.routeSlug, title: p.title, startDate: p.startDate, endDate: p.endDate, groupSize: p.groupSize, needs: p.needs, contactName: p.contactName, contactPhone: p.contactPhone, notes: p.notes, tasks: p.tasks };
    var res = await App.api.put('plans/' + p.id, body);
    currentPlan = res.plan;
    if (msg) App.announce(msg);
    return res.plan;
  }
  App.change('task', async function (el) {
    var p = currentPlan, task = p.tasks.find(function (t) { return t.id === el.getAttribute('data-task'); });
    task.done = el.checked;
    try {
      await savePlan(p);
      var pr = progress(p);
      document.getElementById('plan-progress').textContent = 'Выполнено ' + pr.done + ' из ' + pr.total + (pr.done === pr.total ? '. Всё готово — хорошего похода!' : '');
      document.getElementById('plan-bar').value = pr.done;
      el.closest('.task').classList.toggle('is-done', el.checked);
    } catch (e) { el.checked = !el.checked; task.done = el.checked; App.toast(e.message, 'bad'); }
  });
  App.form('task-add', async function (form, d) {
    var text = String(d.text || '').trim();
    if (!text) { var e = new Error('v'); e.fields = { text: 'Опишите задачу' }; throw e; }
    var p = currentPlan;
    p.tasks.push({ id: 'u' + Date.now().toString(36), code: 'custom', text: text.slice(0, 300), due: d.due || null, done: false });
    p.tasks.sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
    var saved = await savePlan(p, 'Задача добавлена');
    document.getElementById('main').innerHTML = String(planView(saved, ui.routeBySlug(saved.routeSlug)));
    App.focus(document.getElementById('task-text'));
  });
  App.actions({
    'task-delete': async function (el) {
      var p = currentPlan;
      p.tasks = p.tasks.filter(function (t) { return t.id !== el.getAttribute('data-task'); });
      try {
        var saved = await savePlan(p, 'Задача удалена');
        document.getElementById('main').innerHTML = String(planView(saved, ui.routeBySlug(saved.routeSlug)));
        App.focus(document.getElementById('tasks-t'));
      } catch (e) { App.toast(e.message, 'bad'); }
    },
    'plan-delete': async function () {
      if (!(await App.confirm({ title: 'Удалить план похода?', text: 'План и все задачи будут удалены.', ok: 'Удалить', danger: true }))) return;
      try { await App.api.del('plans/' + currentPlan.id); App.toast('План удалён'); App.go('/plans'); } catch (e) { App.toast(e.message, 'bad'); }
    },
    'plan-ics': function () { App.download('pohod-' + currentPlan.id + '.ics', ics(currentPlan), 'text/calendar;charset=utf-8'); }
  });

  /** Календарь iCalendar (RFC 5545): сам поход + задачи со сроками */
  function ics(p) {
    var esc = function (s) { return String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n'); };
    var d = function (iso) { return iso.replace(/-/g, ''); };
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var fold = function (line) { var out = [], s = line; while (s.length > 70) { out.push(s.slice(0, 70)); s = ' ' + s.slice(70); } out.push(s); return out.join('\r\n'); };
    var ev = function (uid, start, end, summary, desc) {
      return ['BEGIN:VEVENT', 'UID:' + uid + '@tropy', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d(start), 'DTEND;VALUE=DATE:' + d(L.addDays(end, 1)), fold('SUMMARY:' + esc(summary)), desc ? fold('DESCRIPTION:' + esc(desc)) : null,
        'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(summary), 'END:VALARM', 'END:VEVENT'].filter(Boolean).join('\r\n');
    };
    var events = [ev('plan-' + p.id, p.startDate, p.endDate, 'Поход: ' + (p.title || p.routeTitle), 'Маршрут: ' + p.routeTitle + '. В экстренной ситуации — 112.')];
    p.tasks.filter(function (t) { return t.due && !t.done; }).forEach(function (t) { events.push(ev('task-' + p.id + '-' + t.id, t.due, t.due, 'Подготовка: ' + t.text, t.link && !/^#/.test(t.link) ? t.link : '')); });
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tropy bez barierov//RU', 'CALSCALE:GREGORIAN'].concat(events).concat(['END:VCALENDAR']).join('\r\n') + '\r\n';
  }

  /* ---------- Карточка безопасности ---------- */

  App.route('/plans/:id/card', async function (ctx) {
    var p = (await App.api.get('plans/' + ctx.params.id)).plan;
    var data = await App.api.get('routes/' + p.routeSlug);
    var r = data.route;
    var codes = (r.restrictions || []).map(function (x) { return x[0]; });
    var mchs = p.tasks.find(function (t) { return t.code === 'mchs'; });
    return {
      title: 'Карточка безопасности',
      html: h`<div class="container page page-narrow">
        <div class="no-print">${ui.crumbs([['Мои походы', '#/plans'], [p.title || p.routeTitle, '#/plans/' + p.id], ['Карточка безопасности']])}</div>
        <article class="safety-card" aria-labelledby="sc-title">
          <header><p class="eyebrow">${App.icon('sos')}Карточка безопасности</p><h1 id="sc-title" tabindex="-1">${p.title || r.title}</h1>
            <p>Оставьте эту карточку близким. Если группа не вышла на связь в срок — звоните <strong>112</strong> и сообщите данные ниже.</p></header>
          <dl class="sc-grid">
            <div><dt>Маршрут</dt><dd>${r.title}, ${L.regionOf(r).name}</dd></div>
            <div><dt>Даты</dt><dd>${ui.date(p.startDate)} — ${ui.date(p.endDate)}</dd></div>
            <div><dt>Старт</dt><dd>${r.start.name}<br>Координаты: ${r.start.lat.toFixed(5)}, ${r.start.lon.toFixed(5)}</dd></div>
            <div><dt>Протяжённость</dt><dd>${L.km(r.lengthKm)}, ${L.durationText(r)}, сложность ${r.difficulty} из 5</dd></div>
            <div><dt>Группа</dt><dd>${App.count(p.groupSize, ['человек', 'человека', 'человек'])}${p.needs.length ? '; особенности: ' + needsText(p.needs) : ''}</dd></div>
            <div><dt>Контрольный звонок</dt><dd>Вечером ${ui.date(p.endDate)}. Если связи нет до утра следующего дня — звонить 112.</dd></div>
            <div><dt>Контакт</dt><dd>${p.contactName || '—'}${p.contactPhone ? h`, <a href="tel:${p.contactPhone.replace(/[^\d+]/g, '')}">${p.contactPhone}</a>` : ''}</dd></div>
            <div><dt>Уведомление МЧС</dt><dd>${mchs ? (mchs.done ? 'Отправлено' : 'Не отмечено как отправленное') : 'Не требуется'}${codes.indexOf('border') !== -1 ? '; маршрут в пограничной зоне' : ''}</dd></div>
          </dl>
          <p class="sc-emergency">${App.icon('phone')}Единый номер экстренных служб: <strong>112</strong></p>
          <p class="small muted">Сформировано на сайте «Тропы без барьеров» ${ui.date(today())}.</p>
        </article>
        <div class="row no-print"><button type="button" class="btn btn-primary" data-action="print">${App.icon('print')}Распечатать</button><a class="btn btn-secondary" href="#/plans/${p.id}">Вернуться к плану</a></div>
      </div>`
    };
  }, { auth: true });
})();

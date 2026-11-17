/**
 * Страница маршрута: параметры, паспорт доступности, описание простыми словами и тифлокомментарий,
 * карта и профиль высот, правила посещения, прогноз погоды, безопасность, источники и отзывы.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;

  var WMO = {
    0: 'Ясно', 1: 'Преимущественно ясно', 2: 'Переменная облачность', 3: 'Пасмурно', 45: 'Туман', 48: 'Туман с изморозью',
    51: 'Слабая морось', 53: 'Морось', 55: 'Сильная морось', 56: 'Ледяная морось', 57: 'Ледяная морось', 61: 'Небольшой дождь', 63: 'Дождь', 65: 'Сильный дождь',
    66: 'Ледяной дождь', 67: 'Ледяной дождь', 71: 'Небольшой снег', 73: 'Снег', 75: 'Сильный снег', 77: 'Снежная крупа', 80: 'Небольшой ливень', 81: 'Ливень',
    82: 'Сильный ливень', 85: 'Снегопад', 86: 'Сильный снегопад', 95: 'Гроза', 96: 'Гроза с градом', 99: 'Сильная гроза с градом'
  };
  var MATCH = { yes: 'Описание доступности совпало', partly: 'Совпало частично', no: 'Не совпало', na: 'Не оценивал доступность' };
  var current = null; // { route, track, reviews, me }

  App.route('/routes/:slug', async function (ctx) {
    var data = await App.api.get('routes/' + encodeURIComponent(ctx.params.slug));
    current = data;
    var r = data.route, me = data.me;
    var region = L.regionOf(r), district = D.DISTRICT_BY_CODE[region.district];
    var level = L.restrictionLevel(r, S.kb);
    var needs = (S.user && S.user.needs) || [];
    var done = me && me.completed;
    var sections = [['about', 'Коротко'], ['access', 'Доступность'], ['desc', 'Описание'], ['map-sec', 'Карта и профиль'], ['rules', 'Правила посещения'],
      ['weather', 'Погода'], ['safety', 'Безопасность'], ['sources', 'Источники'], ['reviews', 'Отзывы']];
    var schematic = data.track && data.track.src === 'schematic';

    return {
      title: r.title,
      after: function (main) { mountMap(main); loadWeather(r); },
      html: h`<article class="route-page" aria-labelledby="route-title">
        <div class="container">
          ${ui.crumbs([['Каталог маршрутов', '#/routes'], [region.name, '#/routes?region=' + r.region], [r.title]])}
          ${r.status === 'hidden' ? ui.notice('warn', 'Маршрут скрыт', 'Он не виден посетителям — вы видите его как администратор.') : ''}
          <header class="route-hero">
            <div class="route-hero-text">
              <p class="eyebrow">${App.icon('pin')}${region.name}${district ? ', ' + district.name + ' федеральный округ' : ''}</p>
              <h1 id="route-title" tabindex="-1">${r.title}</h1>
              <p class="route-area">${ui.areaText(r)}</p>
              <p class="lead">${r.summary}</p>
              <p class="check-note">${App.icon(r.check && r.check.level === 'official' ? 'check' : 'info')}Сведения проверены: ${L.checkText(r.check)} — ${D.CHECK_LEVELS[(r.check || {}).level || 'open'].toLowerCase()}</p>
            </div>
            <div class="route-hero-media">${ui.cover(r.cover, { eager: true, large: true, caption: true, sizes: '(min-width: 960px) 40vw, 100vw' })}</div>
          </header>

          <dl class="stats" aria-label="Основные параметры маршрута">
            <div class="stat"><dt>Сложность</dt><dd>${ui.diff(r.difficulty, { large: true })}<span class="stat-hint">${D.DIFFICULTY[r.difficulty].hint}</span></dd></div>
            <div class="stat"><dt>Длина</dt><dd>${L.km(r.lengthKm)}<span class="stat-hint">${D.ROUTE_TYPES[r.type]}</span></dd></div>
            <div class="stat"><dt>Время в пути</dt><dd>${L.durationText(r)}${r.days[1] > 1 ? h`<span class="stat-hint">ходовое время около ${L.hours(r.durationH)}</span>` : ''}</dd></div>
            <div class="stat"><dt>Набор высоты</dt><dd>${L.meters(r.gainM)}${r.topM ? h`<span class="stat-hint">высшая точка — ${L.meters(r.topM)}</span>` : ''}</dd></div>
            <div class="stat"><dt>Сезон</dt><dd>${L.monthsText(r.months)}</dd></div>
            <div class="stat"><dt>Посещение</dt><dd>${ui.restrictionBadge(level)}</dd></div>
          </dl>

          <div class="route-actions" role="group" aria-label="Действия с маршрутом">
            ${ui.favButton(r.slug)}
            <a class="btn btn-primary" href="#/plans/new?route=${r.slug}">${App.icon('flag')}Спланировать поход</a>
            <a class="btn btn-secondary" href="#/gear?route=${r.slug}">${App.icon('backpack')}Снаряжение</a>
            <button type="button" class="btn btn-secondary" data-action="gpx" data-slug="${r.slug}">${App.icon('download')}Трек GPX</button>
            <button type="button" class="btn btn-secondary" data-action="done" data-slug="${r.slug}" aria-pressed="${done ? 'true' : 'false'}">${App.icon('check')}<span class="done-label">${done ? 'Пройден ' + ui.date(done) : 'Отметить пройденным'}</span></button>
            ${ui.compareToggle(r.slug)}
            <button type="button" class="btn btn-ghost" data-action="share">${App.icon('external')}Поделиться</button>
            <button type="button" class="btn btn-ghost" data-action="print">${App.icon('print')}Распечатать</button>
          </div>
        </div>

        <div class="container route-layout">
          <nav class="toc" aria-labelledby="toc-title">
            <h2 id="toc-title" class="toc-title">На этой странице</h2>
            <ol>${sections.map(function (s) { return h`<li><a href="#${s[0]}">${s[1]}</a></li>`; })}</ol>
          </nav>
          <div class="route-content">

          <section id="about" class="route-sec" aria-labelledby="about-t">
            <h2 id="about-t">Коротко и простыми словами</h2>
            <div class="easy" id="easy-text">
              <ul class="easy-list">${(r.easy || []).map(function (s) { return h`<li>${s}</li>`; })}</ul>
            </div>
            ${ttsButton('#easy-text', 'Озвучить')}
            ${r.highlights && r.highlights.length ? h`<h3>Что вы увидите</h3><ul class="ticks">${r.highlights.map(function (x) { return h`<li>${x}</li>`; })}</ul>` : ''}
          </section>

          <section id="access" class="route-sec" aria-labelledby="access-t">
            <h2 id="access-t">Доступность</h2>
            <p>Оценка по категориям посетителей, как в паспортах доступности: <strong>доступно полностью</strong> — без посторонней помощи, <strong>частично</strong> — с оговорками, <strong>с помощником</strong> — нужен сопровождающий.</p>
            ${/* На узком экране таблица перестраивается в карточки (CSS), поэтому роли таблицы заданы явно —
                 иначе часть браузеров перестаёт озвучивать её как таблицу */ ''}
            <div class="table-wrap access-wrap"><table class="table access-table" role="table">
              <caption class="sr-only">Доступность маршрута для разных категорий посетителей</caption>
              <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Кому</th><th scope="col" role="columnheader">Статус</th><th scope="col" role="columnheader">Что важно знать</th></tr></thead>
              <tbody role="rowgroup">${D.ACCESS_CATEGORIES.map(function (c) {
                var a = r.access[c.code], mine = needs.indexOf(c.code) !== -1;
                return h`<tr role="row" class="${mine ? 'row-mine' : ''}"><th scope="row" role="rowheader">${App.icon('cat-' + c.code, 'cat-i-sm')}${c.name}${mine ? h` <span class="badge badge-info">ваш профиль</span>` : ''}</th>
                  <td role="cell">${ui.accessStatus(a[0])}</td><td role="cell">${a[1] || '—'}</td></tr>`;
              })}</tbody></table></div>
            ${r.env && r.env.length ? h`<h3>Условия на маршруте</h3><dl class="env">${r.env.map(function (e) { return h`<div><dt>${e[0]}</dt><dd>${e[1]}</dd></div>`; })}</dl>` : ''}
            ${r.tiflo ? h`<h3 id="tiflo-t">Тифлокомментарий</h3>
              <p class="muted small">Описание для незрячих и слабовидящих: что вокруг, под ногами и на что ориентироваться.</p>
              <div class="tiflo" id="tiflo-text"><p>${r.tiflo}</p></div>${ttsButton('#tiflo-text', 'Озвучить тифлокомментарий')}` : ''}
            <details class="details report">
              <summary>${App.icon('warn')}Сообщить о неточности в доступности</summary>
              ${reportForm(r)}
            </details>
          </section>

          <section id="desc" class="route-sec" aria-labelledby="desc-t">
            <h2 id="desc-t">Описание маршрута</h2>
            <div id="route-desc" class="prose">${(r.description || []).map(function (p) { return h`<p>${p}</p>`; })}</div>
            ${ttsButton('#route-desc', 'Озвучить описание')}
            ${r.stages && r.stages.length ? h`<h3>Этапы</h3><ol class="stages">${r.stages.map(function (s) {
              return h`<li><p class="stage-head"><strong>${s[0]}</strong><span class="stage-km">${s[1] ? L.km(s[1]) + ' от старта' : 'старт'}</span></p>${s[2] ? h`<p>${s[2]}</p>` : ''}</li>`;
            })}</ol>` : ''}
            <h3>Лучшее время</h3>
            <p>${L.monthsText(r.months)}.</p>
            ${monthsBar(r.months)}
          </section>

          <section id="map-sec" class="route-sec" aria-labelledby="map-t">
            <h2 id="map-t">Карта и профиль высот</h2>
            <div class="map-wrap">
              <div class="map-layers" role="group" aria-label="Подложка карты"></div>
              <div id="route-map" class="map map-route" data-slug="${r.slug}"></div>
            </div>
            <p class="map-note small" id="map-desc">${schematic ? h`${App.icon('info')}Линия маршрута — схема по ключевым точкам: тропа на местности может отличаться. Ориентируйтесь по маркировке и официальной схеме парка.`
              : h`${App.icon('info')}Трек — по данным OpenStreetMap. Перед выходом скачайте GPX и офлайн-карту: связи на маршруте может не быть.`}</p>
            ${data.track && data.track.prof && data.track.prof.length > 1 ? App.map.profile(data.track.prof, { gainM: r.gainM, schematic: schematic }) : ''}
            <h3 id="getting">Как добраться</h3>
            <dl class="env">
              <div><dt>Старт</dt><dd>${r.start.name}<br><span class="muted small">Координаты: ${r.start.lat.toFixed(5)}, ${r.start.lon.toFixed(5)}</span></dd></div>
              ${r.start.transport ? h`<div><dt>Транспорт</dt><dd>${r.start.transport}</dd></div>` : ''}
            </dl>
            <div class="row">
              ${ui.extLink('Маршрут до старта в Яндекс Картах', 'https://yandex.ru/maps/?rtext=~' + r.start.lat + ',' + r.start.lon, 'btn btn-secondary btn-small')}
              ${ui.extLink('Точка старта в OpenStreetMap', 'https://www.openstreetmap.org/?mlat=' + r.start.lat + '&mlon=' + r.start.lon + '#map=14/' + r.start.lat + '/' + r.start.lon, 'btn btn-ghost btn-small')}
              <button type="button" class="btn btn-ghost btn-small" data-action="copy" data-text="${r.start.lat.toFixed(5)}, ${r.start.lon.toFixed(5)}">${App.icon('pin')}Скопировать координаты</button>
            </div>
          </section>

          <section id="rules" class="route-sec" aria-labelledby="rules-t">
            <h2 id="rules-t">Правила посещения</h2>
            <p>${ui.restrictionBadge(level)}</p>
            ${(r.restrictions || []).length ? h`<ul class="rule-list">${r.restrictions.map(function (x) {
              var k = S.kbByCode[x[0]];
              if (!k) return '';
              return h`<li class="rule rule-${k.level}">${App.icon(k.icon || 'info', 'rule-i')}<div>
                <p class="rule-title"><strong>${k.title}</strong> <span class="badge badge-level-${k.level}">${k.kind}</span></p>
                ${x[1] ? h`<p>${x[1]}</p>` : ''}
                <p class="small"><a href="#/rules/${k.code}">Что нужно сделать и на каком основании<span class="sr-only">: ${k.title}</span></a></p></div></li>`;
            })}</ul>` : h`<p>Особых правил нет — соблюдайте общие правила поведения на природе.</p>`}
          </section>

          <section id="weather" class="route-sec" aria-labelledby="weather-t">
            <h2 id="weather-t">Прогноз погоды у старта</h2>
            <div id="weather-box" aria-live="polite">${ui.loading('Загружаем прогноз…')}</div>
          </section>

          <section id="safety" class="route-sec" aria-labelledby="safety-t">
            <h2 id="safety-t">Безопасность</h2>
            <ul class="ticks ticks-warn">${(r.safety || []).map(function (s) { return h`<li>${s}</li>`; })}</ul>
            ${ui.notice('info', 'Если что-то пошло не так', h`<p>Звоните <a href="tel:112"><strong>112</strong></a>. Назовите маршрут, ориентир рядом и состояние людей. ${r.days[0] > 1 || r.difficulty >= 4 ? h`Для этого маршрута рекомендуем заранее ${ui.extLink('зарегистрировать группу в МЧС', 'https://forms.mchs.gov.ru/registration_tourist_groups')}.` : ''}</p>`, 'sos')}
          </section>

          <section id="sources" class="route-sec" aria-labelledby="sources-t">
            <h2 id="sources-t">Источники</h2>
            <p class="small muted">Правила посещения меняются. Перед поездкой сверьтесь с официальными сайтами.</p>
            <ul class="sources">${(r.sources || []).map(function (s) { return h`<li>${ui.extLink(s[0], s[1])}</li>`; })}</ul>
          </section>

          <section id="reviews" class="route-sec" aria-labelledby="reviews-t">
            <h2 id="reviews-t">Отзывы${r.reviewsCount ? h` <span class="muted">(${r.reviewsCount})</span>` : ''}</h2>
            <div id="reviews-box">${reviewsBlock(r, data.reviews)}</div>
          </section>
          </div>
        </div>
      </article>`
    };
  });

  function ttsButton(target, label) {
    if (!App.tts.supported) return '';
    return h`<button type="button" class="btn btn-ghost btn-small btn-tts" data-action="tts" data-tts="${target}" data-label="${label}" aria-pressed="false">${App.icon('sound')}<span class="tts-label">${label}</span></button>`;
  }
  function monthsBar(months) {
    return h`<ol class="months" aria-label="Подходящие месяцы">${D.MONTHS_SHORT.map(function (m, i) {
      var on = months.indexOf(i + 1) !== -1;
      return h`<li class="${on ? 'on' : ''}"><span aria-hidden="true">${m}</span><span class="sr-only">${D.MONTHS[i]}: ${on ? 'подходит' : 'не сезон'}</span></li>`;
    })}</ol>`;
  }

  /* ---------- Карта ---------- */

  async function mountMap(main) {
    var el = main.querySelector('#route-map');
    if (!el || !current) return;
    try {
      var ctl = await App.map.create(el, { label: 'Карта маршрута «' + current.route.title + '»', describedBy: 'map-desc' });
      if (!document.contains(el)) { ctl.destroy(); return; }
      ctl.setTrack(current.route, current.track);
      App.onLeave(function () { ctl.destroy(); });
    } catch (e) {
      el.outerHTML = String(ui.notice('warn', 'Карта не загрузилась', 'Описание старта и маршрута доступно в тексте ниже.'));
    }
  }

  /* ---------- Погода (Open-Meteo, без ключа) ---------- */

  async function loadWeather(r) {
    var box = document.getElementById('weather-box');
    if (!box) return;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + r.start.lat + '&longitude=' + r.start.lon +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&wind_speed_unit=ms&timezone=auto&forecast_days=7';
    try {
      var ctrl = new AbortController(); var t = setTimeout(function () { ctrl.abort(); }, 8000);
      var res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('weather');
      var d = (await res.json()).daily;
      if (!document.contains(box)) return;
      var bad = false;
      var rows = d.time.map(function (day, i) {
        var code = d.weather_code[i], wind = d.wind_speed_10m_max[i], rain = d.precipitation_sum[i];
        var warn = code >= 95 || wind >= 15 || rain >= 15 || code === 65 || code === 75 || code === 82;
        if (warn) bad = true;
        var dt = L.parseDate(day);
        return h`<tr class="${warn ? 'row-warn' : ''}"><th scope="row">${dt.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}</th>
          <td>${App.icon(code <= 1 ? 'sun' : 'cloud', 'w-i')}${WMO[code] || '—'}${warn ? h` <span class="badge badge-warn">${App.icon('warn')}опасно</span>` : ''}</td>
          <td>${Math.round(d.temperature_2m_min[i])}…${Math.round(d.temperature_2m_max[i])}&nbsp;°C</td>
          <td>${L.num(Math.round(rain * 10) / 10)}&nbsp;мм${d.precipitation_probability_max[i] != null ? h` <span class="muted">(${d.precipitation_probability_max[i]}%)</span>` : ''}</td>
          <td>${L.num(Math.round(wind))}&nbsp;м/с</td></tr>`;
      });
      box.innerHTML = String(h`${bad ? ui.notice('warn', 'В ближайшие дни ожидается неблагоприятная погода', 'Сильный ветер, ливень или гроза — подумайте о переносе похода и проверьте штормовые предупреждения МЧС региона.') : ''}
        ${ui.tableWrap('Прогноз погоды на 7 дней', h`<table class="table weather-table"><caption class="sr-only">Прогноз погоды у точки старта на 7 дней</caption>
          <thead><tr><th scope="col">День</th><th scope="col">Погода</th><th scope="col">Температура</th><th scope="col">Осадки</th><th scope="col">Ветер</th></tr></thead>
          <tbody>${rows}</tbody></table>`)}
        <p class="small muted">Данные: ${ui.extLink('Open-Meteo', 'https://open-meteo.com/')}. В горах погода меняется быстро — проверяйте прогноз перед выходом.</p>`);
    } catch (e) {
      if (document.contains(box)) box.innerHTML = String(ui.notice('info', 'Прогноз сейчас недоступен', 'Нет связи с сервисом погоды. Проверьте прогноз перед выходом на сайте Росгидромета или в приложении погоды.'));
    }
  }

  /* ---------- Отзывы ---------- */

  function reviewsBlock(r, reviews) {
    var own = reviews.find(function (v) { return v.own; });
    var matched = reviews.filter(function (v) { return v.accessMatch === 'yes'; }).length, rated = reviews.filter(function (v) { return v.accessMatch !== 'na'; }).length;
    return h`${reviews.length ? h`<div class="review-summary">${ui.stars(r.rating || 0)}<p><strong>${L.num(r.rating || 0)} из 5</strong> — ${App.count(reviews.length, ['отзыв', 'отзыва', 'отзывов'])}${rated ? h`. Доступность подтвердили ${matched} из ${rated}` : ''}.</p></div>` : h`<p>Отзывов пока нет. Расскажите, как всё было на самом деле, — это поможет другим путешественникам.</p>`}
      <ul class="reviews">${reviews.map(function (v) {
        return h`<li class="review"><article aria-label="Отзыв: ${v.author}">
          <header class="review-head"><p><strong>${v.author}</strong>${v.own ? h` <span class="badge badge-info">ваш отзыв</span>` : ''}</p><p class="muted small">${ui.date(v.createdAt)}${v.visitedAt ? ', были на маршруте: ' + L.checkText({ date: v.visitedAt }) : ''}</p></header>
          <p>${ui.stars(v.rating)} <span class="badge">${MATCH[v.accessMatch]}</span></p>
          ${v.needs && v.needs.length ? h`<p class="small muted">Особенности автора: ${v.needs.map(ui.needName).join(', ').toLowerCase()}</p>` : ''}
          <p class="review-text">${v.text}</p>
          ${v.own || (S.user && S.user.role === 'admin') ? h`<button type="button" class="btn btn-ghost btn-small" data-action="review-delete" data-id="${v.id}">${App.icon('trash')}Удалить${v.own ? '' : ' (модерация)'}</button>` : ''}
        </article></li>`;
      })}</ul>
      ${S.user ? reviewForm(r, own) : h`<p><a class="btn btn-secondary" href="#/login?next=${encodeURIComponent('/routes/' + r.slug + '?focus=reviews')}">${App.icon('user')}Войдите, чтобы оставить отзыв</a></p>`}`;
  }
  function reviewForm(r, own) {
    own = own || {};
    return h`<form class="form card form-card" data-form="review" data-slug="${r.slug}" novalidate>
      <h3>${own.id ? 'Изменить ваш отзыв' : 'Оставить отзыв'}</h3>
      ${ui.checks({ name: 'rating', legend: 'Общая оценка', type: 'radio', required: true, items: [['5', '5 — отлично'], ['4', '4 — хорошо'], ['3', '3 — нормально'], ['2', '2 — плохо'], ['1', '1 — очень плохо']], values: [String(own.rating || '')], cls: 'checks-inline' })}
      ${ui.checks({ name: 'accessMatch', legend: 'Совпало ли описание доступности с реальностью?', type: 'radio', required: true, items: [['yes', 'Да'], ['partly', 'Частично'], ['no', 'Нет'], ['na', 'Не оценивал']], values: [own.accessMatch || ''], cls: 'checks-inline' })}
      ${ui.checks({ name: 'needs', legend: 'Ваши особенности (необязательно)', hint: 'Помогает другим понять, для кого ваш опыт особенно полезен', items: ui.needsItems(), values: own.needs || (S.user.needs || []), array: true })}
      ${ui.field({ name: 'visitedAt', label: 'Когда были на маршруте', type: 'month', value: own.visitedAt || '', attrs: 'max="' + L.isoDate(new Date()).slice(0, 7) + '"' })}
      ${ui.field({ name: 'text', label: 'Отзыв', type: 'textarea', required: true, value: own.text || '', hint: 'От 10 до 2000 символов. Что было удобно, что мешало, что стоит знать заранее', rows: 5 })}
      <div class="form-actions"><button type="submit" class="btn btn-primary">${own.id ? 'Сохранить отзыв' : 'Опубликовать отзыв'}</button></div>
    </form>`;
  }
  function reportForm(r) {
    return h`<form class="form" data-form="report" data-slug="${r.slug}" novalidate>
      <p class="small">Заметили, что пандус разрушен, настил закрыт или описание не совпадает? Сообщите — мы проверим и обновим паспорт доступности.</p>
      ${ui.field({ name: 'category', label: 'Кого касается', type: 'select', required: true, options: [['', 'Выберите…']].concat(D.ACCESS_CATEGORIES.map(function (c) { return [c.code, c.name]; })).concat([['general', 'Касается всех']]) })}
      ${ui.field({ name: 'text', label: 'Что не так', type: 'textarea', required: true, rows: 4, hint: 'От 10 до 2000 символов' })}
      ${ui.field({ name: 'contact', label: 'Как с вами связаться', autocomplete: 'email', hint: 'Если хотите получить ответ' })}
      <div class="hp" aria-hidden="true"><label for="hp-${r.slug}">Сайт</label><input id="hp-${r.slug}" name="website" tabindex="-1" autocomplete="off"></div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">Отправить сообщение</button></div>
    </form>`;
  }
  async function reloadReviews(slug) {
    var data = await App.api.get('routes/' + slug);
    current = data;
    var box = document.getElementById('reviews-box');
    if (box) box.innerHTML = String(reviewsBlock(data.route, data.reviews));
    var i = S.routes.findIndex(function (x) { return x.slug === slug; });
    if (i !== -1) { S.routes[i].rating = data.route.rating; S.routes[i].reviewsCount = data.route.reviewsCount; }
  }

  App.form('review', async function (form, d) {
    var slug = form.getAttribute('data-slug');
    var body = { rating: Number(d.rating) || null, accessMatch: d.accessMatch, needs: d.needs || [], text: d.text, visitedAt: d.visitedAt || null };
    App.forms.check(form, 'review', body);
    await App.api.post('routes/' + slug + '/reviews', body);
    await reloadReviews(slug);
    App.toast('Спасибо! Отзыв опубликован.', 'ok');
    App.focus(document.getElementById('reviews-t'));
  });
  App.form('report', async function (form, d) {
    var slug = form.getAttribute('data-slug');
    var body = { category: d.category, text: d.text, contact: d.contact, website: d.website };
    App.forms.check(form, 'report', body);
    await App.api.post('routes/' + slug + '/reports', body);
    form.outerHTML = String(h`<div class="notice notice-ok" role="status" tabindex="-1" id="report-ok">${App.icon('check', 'notice-i')}<div><p class="notice-title">Спасибо, сообщение отправлено</p><p>Мы проверим информацию и обновим паспорт доступности.</p></div></div>`);
    App.focus('report-ok');
  });

  App.actions({
    gpx: function (el) { App.api.download('routes/' + el.getAttribute('data-slug') + '/gpx', el.getAttribute('data-slug') + '.gpx').catch(function (e) { App.toast(e.message, 'bad'); }); },
    done: async function (el) {
      if (!S.user) return App.askLogin('Войдите, чтобы отмечать пройденные маршруты.');
      var slug = el.getAttribute('data-slug'), on = el.getAttribute('aria-pressed') !== 'true';
      try {
        var res = on ? await App.api.put('completions/' + slug, {}) : await App.api.del('completions/' + slug);
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
        el.querySelector('.done-label').textContent = on ? 'Пройден ' + ui.date(res.completed) : 'Отметить пройденным';
        S.completed = S.completed.filter(function (c) { return c.slug !== slug; });
        if (on) S.completed.unshift({ slug: slug, doneAt: res.completed });
        App.announce(on ? 'Маршрут отмечен как пройденный' : 'Отметка снята');
        if (on) App.toast('Отличная работа! Оставьте отзыв о доступности — он поможет другим.', 'ok');
      } catch (e) { App.toast(e.message, 'bad'); }
    },
    share: async function () {
      var url = location.href, title = document.title;
      if (navigator.share) { try { await navigator.share({ title: title, url: url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      copy(url, 'Ссылка скопирована');
    },
    copy: function (el) { copy(el.getAttribute('data-text'), 'Скопировано: ' + el.getAttribute('data-text')); },
    'review-delete': async function (el) {
      if (!(await App.confirm({ title: 'Удалить отзыв?', text: 'Отзыв будет удалён без возможности восстановления.', ok: 'Удалить', danger: true }))) return;
      try {
        await App.api.del('reviews/' + el.getAttribute('data-id'));
        await reloadReviews(current.route.slug);
        App.toast('Отзыв удалён');
        App.focus(document.getElementById('reviews-t'));
      } catch (e) { App.toast(e.message, 'bad'); }
    }
  });
  function copy(text, msg) {
    var done = function () { App.toast(msg, 'ok'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() {
      var t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { App.toast('Не удалось скопировать: ' + text, 'warn'); }
      t.remove();
    }
  }
  App.copy = copy;
})();

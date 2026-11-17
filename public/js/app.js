/**
 * Точка входа: служебные страницы, шапка (аккаунт, меню), оповещения, загрузка данных и запуск роутера.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, S = App.state;

  /* ---------- Служебные страницы ---------- */

  function simplePage(title, lead, body) {
    return { title: title, html: h`<div class="container page page-narrow">${ui.pageHead({ title: title, lead: lead })}${body || ''}</div>` };
  }
  App.pages.notFound = function () {
    return simplePage('Страница не найдена', 'Возможно, ссылка устарела или в адресе есть опечатка.',
      h`<div class="row"><a class="btn btn-primary" href="#/">${App.icon('home')}На главную</a><a class="btn btn-secondary" href="#/routes">${App.icon('list')}Каталог маршрутов</a><a class="btn btn-secondary" href="#/sitemap">${App.icon('doc')}Карта сайта</a></div>`);
  };
  App.pages.needLogin = function (ctx, opts) {
    var next = encodeURIComponent(App.here());
    return simplePage(opts.title || 'Нужно войти', opts.lead || 'Этот раздел доступен после входа: так ваши планы и списки сохранятся и будут доступны на любом устройстве.',
      h`<div class="row"><a class="btn btn-primary" href="#/login?next=${next}">${App.icon('user')}Войти</a><a class="btn btn-secondary" href="#/register?next=${next}">Зарегистрироваться</a></div>`);
  };
  App.pages.forbidden = function () {
    return simplePage('Недостаточно прав', 'Этот раздел доступен только администраторам сайта.', h`<a class="btn btn-primary" href="#/">На главную</a>`);
  };
  App.pages.error = function (ctx, err) {
    if (err && err.status === 404) return simplePage('Не найдено', err.message, h`<div class="row"><a class="btn btn-primary" href="#/routes">Каталог маршрутов</a><a class="btn btn-secondary" href="#/">На главную</a></div>`);
    if (err && err.status === 401) return App.pages.needLogin(ctx, {});
    return simplePage('Не удалось открыть страницу', (err && err.message) || 'Произошла ошибка.',
      h`<div class="row"><button type="button" class="btn btn-primary" data-action="reload">Попробовать ещё раз</button><a class="btn btn-secondary" href="#/">На главную</a></div>`);
  };

  /* ---------- Аккаунт ---------- */

  App.setMe = function (me) {
    var was = S.user ? S.user.id : null;
    S.user = me && me.user ? me.user : null;
    S.favorites = (me && me.favorites) || [];
    S.completed = (me && me.completed) || [];
    renderAccount();
    if (S.user && S.user.id !== was) App.a11y.fromUser(S.user);
    App.emit('auth', S.user);
  };
  function renderAccount() {
    var a = document.getElementById('account-link');
    if (!a) return;
    var label = a.querySelector('.account-label');
    if (S.user) {
      a.href = '#/profile';
      // Короткая видимая подпись не ломает шапку; имя — в доступном имени (подпись стоит в его начале, WCAG 2.5.3)
      label.textContent = 'Кабинет';
      a.setAttribute('aria-label', 'Кабинет: ' + S.user.name);
      a.title = S.user.name;
    } else {
      a.href = '#/login';
      label.textContent = 'Войти';
      a.removeAttribute('aria-label');
      a.removeAttribute('title');
    }
  }
  App.loadRoutes = async function () {
    var r = await App.api.get('routes');
    S.routes = r.items;
    App.compare.tray();
  };
  App.logout = async function () {
    try { await App.api.post('auth/logout'); } catch (e) { /* сессия могла истечь */ }
    App.setMe({ user: null });
    App.toast('Вы вышли из аккаунта');
    App.go('/');
  };

  /* ---------- Оповещения ---------- */

  function renderAlerts() {
    var el = document.getElementById('alerts');
    var hidden = App.store.get('tropy.alertsHidden', []);
    var list = S.alerts.filter(function (a) { return hidden.indexOf(a.id) === -1; });
    if (!list.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = String(h`<section class="container" aria-label="Важные объявления"><ul class="alerts-list">${list.map(function (a) {
      return h`<li class="alert alert-${a.level}">${App.icon(a.level === 'warning' ? 'warn' : 'info', 'alert-i')}
        <p><span class="sr-only">${a.level === 'warning' ? 'Важно: ' : 'К сведению: '}</span>${a.text}${a.link ? h` ${ui.extLink('Подробнее', a.link)}` : ''}</p>
        <button type="button" class="btn btn-ghost btn-icon btn-small" data-action="alert-hide" data-id="${a.id}" aria-label="Скрыть объявление">${App.icon('x')}</button></li>`;
    })}</ul></section>`);
  }

  /* ---------- Меню (мобильная версия и «все разделы») ---------- */

  function menu() {
    var u = S.user;
    var links = [['#/', 'home', 'Главная'], ['#/routes', 'list', 'Каталог маршрутов'], ['#/map', 'map', 'Карта маршрутов'], ['#/pick', 'compass', 'Подбор маршрута'],
      ['#/gear', 'backpack', 'Снаряжение'], ['#/plans', 'flag', 'Мои походы'], ['#/compare', 'compare', 'Сравнение маршрутов'], ['#/rules', 'shield', 'Правила и источники'],
      ['#/about', 'info', 'О проекте'], ['#/accessibility', 'access', 'Доступность сайта'], ['#/help', 'doc', 'Как пользоваться'], ['#/sitemap', 'list', 'Карта сайта']];
    return h`<div class="dialog-head"><h2 id="menu-title" class="dialog-title">Все разделы</h2>
        <button type="button" class="btn btn-ghost btn-icon" data-action="close-dialog" aria-label="Закрыть меню">${App.icon('x')}</button></div>
      <div class="dialog-body">
        <nav aria-label="Все разделы сайта"><ul class="menu-list">${links.map(function (l) { return h`<li><a href="${l[0]}">${App.icon(l[1])}${l[2]}</a></li>`; })}</ul></nav>
        <h3 class="menu-sub">Аккаунт</h3>
        <ul class="menu-list">${u ? h`<li><a href="#/profile">${App.icon('user')}Личный кабинет</a></li>${u.role === 'admin' ? h`<li><a href="#/admin">${App.icon('lock')}Администрирование</a></li>` : ''}
          <li><button type="button" class="menu-btn-link" data-action="logout">${App.icon('logout')}Выйти</button></li>`
        : h`<li><a href="#/login">${App.icon('user')}Войти</a></li><li><a href="#/register">${App.icon('plus')}Зарегистрироваться</a></li>`}</ul>
        <button type="button" class="btn btn-secondary btn-block" data-action="open-a11y">${App.icon('eye')}Настройки доступности</button>
      </div>`;
  }

  App.actions({
    'open-menu': function () { App.openDialog('menu-dialog', menu()); },
    logout: function () { var d = document.getElementById('menu-dialog'); if (d.open) App.closeDialog(d); App.logout(); },
    reload: function () { App.render(); },
    'alert-hide': function (el) {
      var hidden = App.store.get('tropy.alertsHidden', []);
      hidden.push(Number(el.getAttribute('data-id')));
      App.store.set('tropy.alertsHidden', hidden);
      renderAlerts();
      App.announce('Объявление скрыто');
      App.focus(document.getElementById('main'), { scroll: false });
    },
    print: function () { window.print(); }
  });
  // Переход по ссылке внутри меню закрывает диалог
  document.addEventListener('click', function (e) {
    var a = e.target.closest('#menu-dialog a[href^="#/"]');
    if (a) App.closeDialog('menu-dialog');
    var b = e.target.closest('#menu-dialog [data-action="open-a11y"]');
    if (b) App.closeDialog('menu-dialog');
  }, true);

  App.listen('rendered', function () { App.compare.tray(); });

  /* ---------- Запуск ---------- */

  async function boot() {
    var main = document.getElementById('main');
    try {
      var mode = await App.api.init();
      S.mode = mode;
      var note = document.getElementById('mode-note');
      if (note) note.textContent = mode === 'server'
        ? 'Работает с сервером и базой данных: аккаунт и планы доступны на любом устройстве.'
        : 'Автономный демо-режим: данные аккаунта и планы хранятся только в этом браузере.';
      var res = await Promise.all([App.api.get('auth/me'), App.api.get('routes'), App.api.get('restrictions'), App.api.get('alerts').catch(function () { return { items: [] }; })]);
      App.setMe(res[0]);
      S.routes = res[1].items;
      S.kb = res[2].items;
      S.kbByCode = {};
      S.kb.forEach(function (k) { S.kbByCode[k.code] = k; });
      S.alerts = res[3].items;
      S.ready = true;
      renderAlerts();
    } catch (err) {
      console.error(err);
      main.innerHTML = String(h`<div class="container page">${ui.pageHead({ title: 'Не удалось загрузить данные', lead: err.message || 'Проверьте подключение к интернету.' })}
        <button type="button" class="btn btn-primary" data-action="boot-retry">Попробовать ещё раз</button></div>`);
      main.removeAttribute('aria-busy');
      return;
    }
    window.addEventListener('hashchange', function () {
      var hs = location.hash;
      if (hs && hs.length > 1 && hs.charAt(1) !== '/') return; // якорь внутри страницы
      App.render();
    });
    await App.render();
  }
  App.actions({ 'boot-retry': function () { location.reload(); } });

  // Высота шапки меняется (две строки меню, крупный шрифт) — передаём её в CSS для отступов при прокрутке
  (function trackHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var set = function () { document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px'); };
    set();
    if ('ResizeObserver' in window) new ResizeObserver(set).observe(header); else window.addEventListener('resize', set);
  })();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !App.standalone) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* офлайн-режим недоступен */ }); });
  }
  boot();
})();

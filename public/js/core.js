/**
 * Ядро клиентского приложения «Тропы без барьеров».
 * Без фреймворков и сборки: шаблонизатор с экранированием, hash-роутер с управлением фокусом,
 * делегирование событий (никаких inline-обработчиков — совместимо со строгой CSP),
 * хранилище с запасным вариантом в памяти, уведомления для экранных дикторов.
 */
(function () {
  'use strict';

  var T = window.TROPY || {};
  var App = window.App = {
    T: T, D: T.dict, L: T.logic,
    pages: {}, ui: {}, forms: {},
    state: { user: null, favorites: [], completed: [], routes: [], kb: [], kbByCode: {}, alerts: [], mode: 'server', ready: false }
  };
  var SITE = 'Тропы без барьеров';

  /* ---------- Шаблоны с автоматическим экранированием ---------- */

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  /** Обёртка для заведомо безопасной разметки */
  function Raw(s) { this.s = s; }
  Raw.prototype.toString = function () { return this.s; };
  function val(v) {
    if (v == null || v === false || v === true) return '';
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(val).join('');
    return esc(v);
  }
  /** html`...` — все подставляемые значения экранируются, кроме результатов html``/raw() */
  App.html = function (strings) {
    var out = strings[0];
    for (var i = 1; i < arguments.length; i++) out += val(arguments[i]) + strings[i];
    return new Raw(out);
  };
  App.raw = function (s) { return new Raw(String(s == null ? '' : s)); };
  App.esc = esc;
  /** Булев атрибут: ${App.on(x, 'checked')} */
  App.on = function (cond, attr) { return new Raw(cond ? ' ' + attr : ''); };
  /** Пропускает только http(s)-ссылки и внутренние адреса — защита от javascript:-URL */
  App.safeUrl = function (u) { u = String(u || ''); return /^(https?:\/\/|#\/|mailto:|tel:)/i.test(u) ? u : '#/'; };
  /** «3 маршрута» — число с правильной формой слова */
  App.count = function (n, forms) { return App.L.num(n) + '\u00a0' + App.L.plural(n, forms); };
  App.uid = (function () { var n = 0; return function (p) { n += 1; return (p || 'id') + '-' + n; }; })();

  /* ---------- DOM ---------- */

  App.$ = function (sel, root) { return (root || document).querySelector(sel); };
  App.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  App.icon = function (name, cls) {
    return new Raw('<svg class="i' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>');
  };
  /** Путь к статическому файлу; в автономной сборке файлы встроены как data:-URI */
  App.asset = function (path) { return (window.TROPY_ASSETS && window.TROPY_ASSETS[path]) || path; };
  App.standalone = !!window.TROPY_ASSETS;

  /* ---------- Хранилище (localStorage с запасным вариантом в памяти) ---------- */

  function makeStore(kind) {
    var mem = {};
    function backend() { try { var s = window[kind]; var k = '__t'; s.setItem(k, k); s.removeItem(k); return s; } catch (e) { return null; } }
    var b = backend();
    return {
      persistent: !!b,
      get: function (k, def) {
        try { var v = b ? b.getItem(k) : mem[k]; return v == null ? def : JSON.parse(v); } catch (e) { return def; }
      },
      set: function (k, v) {
        var s = JSON.stringify(v);
        try { if (b) b.setItem(k, s); else mem[k] = s; } catch (e) { mem[k] = s; }
      },
      remove: function (k) { try { if (b) b.removeItem(k); } catch (e) { /* нет доступа */ } delete mem[k]; }
    };
  }
  App.store = makeStore('localStorage');
  App.session = makeStore('sessionStorage');

  /* ---------- События приложения ---------- */

  var bus = {};
  App.listen = function (name, fn) { (bus[name] = bus[name] || []).push(fn); };
  App.emit = function (name, data) { (bus[name] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  /* ---------- Объявления для экранных дикторов и всплывающие сообщения ---------- */

  App.announce = function (msg) {
    var el = document.getElementById('announcer');
    if (!el) return;
    el.textContent = '';
    setTimeout(function () { el.textContent = msg; }, 60);
  };
  var toastTimer = null;
  App.toast = function (msg, tone) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.className = 'toast show' + (tone ? ' toast-' + tone : '');
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, Math.max(4000, msg.length * 70));
  };

  /** Перемещает фокус на элемент (добавляет tabindex при необходимости) */
  App.focus = function (el, opts) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return false;
    if (!el.matches('a[href],button,input,select,textarea,[tabindex]')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    if (!opts || opts.scroll !== false) el.scrollIntoView({ block: 'start', behavior: App.reducedMotion() ? 'auto' : 'smooth' });
    return true;
  };
  App.reducedMotion = function () {
    return document.documentElement.getAttribute('data-motion') === 'off' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  /* ---------- Диалоги ---------- */

  /** Открывает <dialog> модально и возвращает фокус на вызвавший элемент после закрытия */
  App.openDialog = function (dlg, content, opts) {
    if (typeof dlg === 'string') dlg = document.getElementById(dlg);
    var prev = document.activeElement;
    if (content != null) dlg.innerHTML = String(content);
    var onClose = function () {
      dlg.removeEventListener('close', onClose);
      if (opts && opts.onClose) opts.onClose(dlg.returnValue);
      if (prev && document.contains(prev)) prev.focus();
    };
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    var first = dlg.querySelector('[autofocus]') || dlg.querySelector('h2');
    if (first) App.focus(first, { scroll: false });
    return dlg;
  };
  App.closeDialog = function (dlg, value) {
    if (typeof dlg === 'string') dlg = document.getElementById(dlg);
    if (typeof dlg.close === 'function') dlg.close(value || ''); else { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); }
  };
  // Закрытие по клику на подложку
  document.addEventListener('click', function (e) {
    if (e.target.tagName === 'DIALOG' && e.target.open) {
      var r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) App.closeDialog(e.target);
    }
  });

  /**
   * Диалог подтверждения. o: {title, text, ok, cancel, danger, password}
   * Возвращает Promise<false | true | string(пароль)>
   */
  App.confirm = function (o) {
    var h = App.html;
    return new Promise(function (resolve) {
      var pid = App.uid('confirm-pass');
      var body = h`<form method="dialog" class="dialog-body" data-confirm>
        <h2 id="confirm-title" class="dialog-title">${o.title}</h2>
        ${o.text ? h`<p>${o.text}</p>` : ''}
        ${o.password ? h`<div class="field"><label for="${pid}">Пароль</label>
          <input class="input" id="${pid}" name="password" type="password" autocomplete="current-password" required></div>` : ''}
        <div class="dialog-actions">
          <button class="btn btn-secondary" value="cancel" autofocus>${o.cancel || 'Отмена'}</button>
          <button class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" value="ok">${o.ok || 'Подтвердить'}</button>
        </div></form>`;
      var dlg = document.getElementById('confirm-dialog');
      App.openDialog(dlg, body, {
        onClose: function (v) {
          if (v !== 'ok') return resolve(false);
          if (o.password) { var p = dlg.querySelector('input[name=password]'); return resolve(p ? p.value : ''); }
          resolve(true);
        }
      });
      if (o.password) { var inp = dlg.querySelector('input'); if (inp) inp.focus(); }
    });
  };

  /* ---------- Скачивание файлов ---------- */

  App.download = function (filename, content, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.hidden = true;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    App.announce('Файл «' + filename + '» сохранён');
  };

  /* ---------- Роутер ---------- */

  var table = [];
  var cleanups = [];
  var renderSeq = 0;
  var firstRender = true;

  /** Регистрирует страницу: App.route('/routes/:slug', handler, {auth, admin, nav}) */
  App.route = function (pattern, handler, opts) {
    var keys = [];
    var src = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, function (_, k) { keys.push(k); return '([^/]+)'; });
    table.push({ re: new RegExp('^' + src + '/?$'), keys: keys, handler: handler, opts: opts || {} });
  };
  App.parseHash = function () {
    var h = location.hash.replace(/^#/, '');
    if (h.charAt(0) !== '/') h = '/';
    var qi = h.indexOf('?');
    var path = qi === -1 ? h : h.slice(0, qi);
    try { path = decodeURIComponent(path); } catch (e) { /* оставляем как есть */ }
    return { path: path, query: new URLSearchParams(qi === -1 ? '' : h.slice(qi + 1)) };
  };
  /** Текущий адрес для параметра next= */
  App.here = function () { var h = location.hash.replace(/^#/, ''); return h.charAt(0) === '/' ? h : '/'; };
  App.go = function (path, opts) {
    var target = '#' + path;
    if (opts && opts.replace) { history.replaceState(null, '', target); App.render(); return; }
    if (location.hash === target) App.render(); else location.hash = target;
  };
  /** Обновляет query без перерисовки страницы (фильтры каталога) */
  App.setQuery = function (params) {
    var p = App.parseHash().path;
    var qs = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (Array.isArray(v)) v = v.join(',');
      if (v !== '' && v != null && v !== false && v !== 0) qs.set(k, v === true ? '1' : v);
    });
    var s = qs.toString().replace(/%2C/g, ',');
    history.replaceState(null, '', '#' + p + (s ? '?' + s : ''));
  };
  /** Регистрирует функцию очистки текущей страницы (карта, озвучивание, таймеры) */
  App.onLeave = function (fn) { cleanups.push(fn); };

  function match(path) {
    for (var i = 0; i < table.length; i++) {
      var m = table[i].re.exec(path);
      if (m) {
        var params = {};
        table[i].keys.forEach(function (k, j) { params[k] = m[j + 1]; });
        return { r: table[i], params: params };
      }
    }
    return null;
  }

  App.render = async function () {
    var seq = ++renderSeq;
    var loc = App.parseHash();
    var main = document.getElementById('main');
    cleanups.splice(0).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    var m = match(loc.path);
    var ctx = { path: loc.path, query: loc.query, params: m ? m.params : {} };
    var out;
    main.setAttribute('aria-busy', 'true');
    try {
      if (!m) out = App.pages.notFound(ctx);
      else if (m.r.opts.auth && !App.state.user) out = App.pages.needLogin(ctx, m.r.opts);
      else if (m.r.opts.admin && (!App.state.user || App.state.user.role !== 'admin')) out = App.pages.forbidden(ctx);
      else out = await m.r.handler(ctx);
    } catch (err) {
      console.error(err);
      out = App.pages.error(ctx, err);
    }
    if (seq !== renderSeq || !out) return; // пользователь уже ушёл на другую страницу
    main.innerHTML = String(out.html);
    main.removeAttribute('aria-busy');
    document.title = out.title ? out.title + ' — ' + SITE : SITE + ' — пешие маршруты по России для всех';
    App.updateNav(loc.path);
    if (out.after) { try { out.after(main, ctx); } catch (e) { console.error(e); } }
    if (!firstRender) {
      var anchor = ctx.query.get('focus');
      var h1 = main.querySelector('h1');
      if (!(anchor && App.focus(anchor))) {
        window.scrollTo(0, 0);
        if (h1) App.focus(h1, { scroll: false });
      }
    }
    firstRender = false;
    App.emit('rendered', ctx);
  };

  /** Подсвечивает текущий раздел в меню (aria-current) */
  App.updateNav = function (path) {
    var seg = path.split('/')[1] || 'home';
    var map = { routes: 'routes', compare: 'routes', map: 'map', pick: 'pick', gear: 'gear', plans: 'plans', rules: 'rules', home: 'home' };
    var cur = map[seg] || '';
    App.$$('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  };

  /* ---------- Делегирование событий ---------- */

  var actions = {}, formHandlers = {}, changeHandlers = {}, inputHandlers = {};
  App.actions = function (map) { Object.keys(map).forEach(function (k) { actions[k] = map[k]; }); };
  App.form = function (name, fn) { formHandlers[name] = fn; };
  App.change = function (name, fn) { changeHandlers[name] = fn; };
  App.input = function (name, fn) { inputHandlers[name] = fn; };

  document.addEventListener('click', function (e) {
    // Внутристраничные ссылки (#id) не должны ломать hash-роутер: переводим фокус сами
    var a = e.target.closest('a[href^="#"]');
    if (a) {
      var href = a.getAttribute('href');
      if (href.length > 1 && href.charAt(1) !== '/') {
        e.preventDefault();
        var id = decodeURIComponent(href.slice(1));
        var t = document.getElementById(id);
        if (t) {
          if (t.tagName === 'DETAILS') t.open = true;
          App.focus(t);
        }
        return;
      }
    }
    var el = e.target.closest('[data-action]');
    if (el && actions[el.getAttribute('data-action')]) {
      if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault();
      actions[el.getAttribute('data-action')](el, e);
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change]');
    if (el && changeHandlers[el.getAttribute('data-change')]) changeHandlers[el.getAttribute('data-change')](el, e);
  });
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-input]');
    if (el && inputHandlers[el.getAttribute('data-input')]) inputHandlers[el.getAttribute('data-input')](el, e);
  });
  document.addEventListener('submit', async function (e) {
    var form = e.target;
    var name = form.getAttribute('data-form');
    if (!name || !formHandlers[name]) return;
    e.preventDefault();
    if (form.getAttribute('data-busy')) return;
    App.forms.clearErrors(form);
    var btn = form.querySelector('[type=submit]');
    form.setAttribute('data-busy', '1');
    form.setAttribute('aria-busy', 'true');
    if (btn) btn.setAttribute('aria-disabled', 'true');
    try {
      await formHandlers[name](form, App.forms.read(form), e);
    } catch (err) {
      App.forms.fail(form, err);
    } finally {
      form.removeAttribute('data-busy');
      form.removeAttribute('aria-busy');
      if (btn) btn.removeAttribute('aria-disabled');
    }
  });

  /* ---------- Формы: чтение, ошибки, сводка ошибок ---------- */

  /** Читает форму в объект: группы чекбоксов → массивы, одиночный чекбокс → boolean, number → число */
  App.forms.read = function (form) {
    var out = {}, counts = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name && el.type === 'checkbox') counts[el.name] = (counts[el.name] || 0) + 1;
    });
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || el.type === 'submit' || el.type === 'button') return;
      if (el.type === 'checkbox') {
        if (counts[el.name] > 1 || el.hasAttribute('data-array')) {
          out[el.name] = out[el.name] || [];
          if (el.checked) out[el.name].push(el.value);
        } else out[el.name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = '';
      } else if (el.type === 'number') {
        out[el.name] = el.value === '' ? null : Number(el.value);
      } else out[el.name] = el.value;
    });
    return out;
  };

  App.forms.clearErrors = function (form) {
    App.$$('.error-summary, .form-error', form).forEach(function (x) { x.remove(); });
    App.$$('[aria-invalid]', form).forEach(function (x) { x.removeAttribute('aria-invalid'); });
    App.$$('.field-error', form).forEach(function (x) {
      var id = x.id;
      App.$$('[aria-describedby~="' + id + '"]', form).forEach(function (f) {
        var v = (f.getAttribute('aria-describedby') || '').split(' ').filter(function (s) { return s && s !== id; }).join(' ');
        if (v) f.setAttribute('aria-describedby', v); else f.removeAttribute('aria-describedby');
      });
      x.remove();
    });
    App.$$('.has-error', form).forEach(function (x) { x.classList.remove('has-error'); });
  };

  /** Показывает ошибки у полей и сводку со ссылками в начале формы (фокус — на сводку) */
  App.forms.showErrors = function (form, errors, opts) {
    var keys = Object.keys(errors || {});
    if (!keys.length) return;
    var items = [];
    keys.forEach(function (key) {
      var base = key.split('.')[0].replace(/\[\d+\]$/, '');
      var field = form.querySelector('[name="' + key + '"]') || form.querySelector('[data-field="' + key + '"]') ||
        form.querySelector('[name="' + base + '"]') || form.querySelector('[data-field="' + base + '"]');
      var label = key, targetId = '';
      if (field) {
        var group = field.closest('fieldset[data-field]') || (field.type === 'checkbox' || field.type === 'radio' ? field.closest('fieldset') : null);
        var holder = group || field;
        var wrap = holder.closest('.field') || holder;
        wrap.classList.add('has-error');
        var eid = (field.id || App.uid('f')) + '-error';
        if (!field.id && !group) field.id = eid.replace(/-error$/, '');
        if (!document.getElementById(eid)) {
          var p = document.createElement('p');
          p.className = 'field-error'; p.id = eid;
          p.innerHTML = String(App.icon('warn')) + '<span></span>';
          p.lastChild.textContent = errors[key];
          if (group) group.appendChild(p);
          else {
            var hint = wrap.querySelector('.hint');
            (hint || field).insertAdjacentElement('afterend', p);
          }
        }
        var targets = group ? App.$$('input,select,textarea', group).slice(0, 1) : [field];
        targets.forEach(function (t) {
          t.setAttribute('aria-invalid', 'true');
          var d = (t.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
          if (d.indexOf(eid) === -1) d.push(eid);
          t.setAttribute('aria-describedby', d.join(' '));
        });
        targetId = targets[0] ? targets[0].id : '';
        var lab = group ? group.querySelector('legend') : form.querySelector('label[for="' + field.id + '"]');
        if (lab) label = lab.textContent.replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim();
      }
      items.push({ label: label, msg: errors[key], id: targetId });
    });
    var h = App.html;
    var box = document.createElement('div');
    box.className = 'error-summary';
    box.setAttribute('role', 'alert');
    box.setAttribute('tabindex', '-1');
    box.innerHTML = String(h`<h2 class="error-summary-title">${App.icon('warn')} ${opts && opts.title || 'Проверьте форму'} — ${App.count(items.length, ['ошибка', 'ошибки', 'ошибок'])}</h2>
      <ul>${items.map(function (it) { return h`<li>${it.id ? h`<a href="#${it.id}">${it.label}: ${it.msg}</a>` : h`${it.label}: ${it.msg}`}</li>`; })}</ul>`);
    form.insertBefore(box, form.firstChild);
    App.focus(box);
  };

  /** Общая обработка ошибки отправки формы */
  App.forms.fail = function (form, err) {
    if (err && err.fields && Object.keys(err.fields).length) return App.forms.showErrors(form, err.fields);
    var box = document.createElement('div');
    box.className = 'form-error notice notice-bad';
    box.setAttribute('role', 'alert');
    box.setAttribute('tabindex', '-1');
    box.innerHTML = String(App.html`${App.icon('warn')}<p>${(err && err.message) || 'Не удалось выполнить действие. Попробуйте ещё раз.'}</p>`);
    form.insertBefore(box, form.firstChild);
    App.focus(box);
    if (!err || !err.status) console.error(err);
  };

  /** Проверка формы по общей схеме (та же, что на сервере); при ошибках показывает их и бросает исключение */
  App.forms.check = function (form, schema, data) {
    var r = App.L.validate(schema, data);
    if (!r.ok) { var e = new Error('validation'); e.fields = r.errors; throw e; }
    return r.value;
  };
})();

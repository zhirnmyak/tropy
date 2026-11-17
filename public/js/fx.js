/**
 * Поведение оформления (раздел 10 в css/app.css). Без этого файла сайт полностью работает.
 *
 *  • линейка под шапкой темнеет, когда страница прокручена;
 *  • кнопка «Наверх» после полутора экранов прокрутки;
 *  • подсветка текущего раздела в оглавлении страницы маршрута;
 *  • короткое проявление страницы после перехода по сайту.
 *
 * Оформление «Полевой справочник» сознательно обходится без декоративного движения: нет параллакса,
 * 3D-наклона, «набегающих» чисел, появления блоков при прокрутке и бесконечных анимаций. Поэтому не нужна
 * и кнопка «Остановить анимацию» — требование WCAG 2.2.2 выполняется тем, что ничего не движется само.
 * Проявление страницы не играет при настройке «Отключить анимацию», системной настройке «уменьшить
 * движение», в цветовых схемах по ГОСТ Р 52872-2019 и в упрощённом виде.
 */
(function () {
  'use strict';

  var App = window.App;
  if (!App) return;

  var root = document.documentElement;
  var raf = window.requestAnimationFrame
    ? function (f) { return window.requestAnimationFrame(f); }
    : function (f) { return window.setTimeout(function () { f(Date.now()); }, 16); };

  /** Обычная цветовая схема (не ГОСТ) и не упрощённый вид */
  function decor() {
    var t = root.getAttribute('data-theme');
    return (t === 'auto' || t === 'light' || t === 'dark') && root.getAttribute('data-simple') !== 'on';
  }
  /** Движение разрешено: обычная схема и анимация не отключена ни на сайте, ни в системе */
  function motion() { return decor() && !App.reducedMotion(); }

  /* ---------- Прокрутка: шапка, «Наверх», оглавление ---------- */

  var header = document.querySelector('.site-header');
  var up = document.createElement('button');
  up.type = 'button';
  up.className = 'to-top';
  up.setAttribute('data-action', 'to-top');
  up.innerHTML = App.icon('up') + '<span class="sr-only">Наверх, к началу страницы</span>';
  document.body.appendChild(up);

  var toc = {
    links: [], targets: [], cur: -1,
    init: function (main) {
      var self = this;
      this.links = []; this.targets = []; this.cur = -1;
      App.$$('.toc a[href^="#"]', main).forEach(function (a) {
        var id = a.getAttribute('href').slice(1);
        if (!id || id.charAt(0) === '/') return;
        var t = document.getElementById(id);
        if (t) { self.links.push(a); self.targets.push(t); }
      });
    },
    update: function () {
      if (!this.links.length) return;
      var vh = window.innerHeight || 800, line = vh * 0.32, idx = -1, i;
      for (i = 0; i < this.targets.length; i++) {
        if (this.targets[i].getBoundingClientRect().top <= line) idx = i; else break;
      }
      var last = this.targets.length - 1;
      var atEnd = (window.scrollY || root.scrollTop || 0) + vh >= root.scrollHeight - 4;
      if (atEnd && this.targets[last].getBoundingClientRect().top < vh) idx = last;
      if (idx === this.cur) return;
      if (this.cur >= 0 && this.links[this.cur]) this.links[this.cur].classList.remove('is-active');
      this.cur = idx;
      if (idx >= 0) this.links[idx].classList.add('is-active');
    }
  };

  var ticking = false;
  function onScroll() { if (!ticking) { ticking = true; raf(scrollFrame); } }
  function scrollFrame() {
    ticking = false;
    var y = window.scrollY || root.scrollTop || 0;
    var vh = window.innerHeight || 800;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    up.classList.toggle('is-shown', y > vh * 1.2);
    toc.update();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* ---------- Переход между страницами ---------- */

  var lastPath = null, pageTimer = 0;
  App.listen('rendered', function () {
    var main = document.getElementById('main');
    if (!main) return;
    var path = (location.hash || '#/').split('?')[0];
    var first = lastPath === null, same = path === lastPath;
    lastPath = path;
    toc.init(main);
    if (!first && !same && motion()) {
      main.classList.remove('page-in');
      void main.offsetWidth;
      main.classList.add('page-in');
      window.clearTimeout(pageTimer);
      pageTimer = window.setTimeout(function () { main.classList.remove('page-in'); }, 600);
    }
    onScroll();
  });

  App.actions({
    'to-top': function () {
      try { window.scrollTo({ top: 0, behavior: App.reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
      var h1 = document.querySelector('#main h1');
      if (h1) App.focus(h1, { scroll: false });
    }
  });

  // Настройка кнопки «Остановить анимацию» из прежнего оформления больше не используется
  App.store.remove('tropy.fxPaused');

  App.fx = { decor: decor, motion: motion };

  onScroll();
})();

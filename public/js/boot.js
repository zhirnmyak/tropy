/**
 * Ранняя загрузка настроек доступности (до отрисовки страницы),
 * чтобы не было «мигания» цветовой схемы и размера шрифта.
 * Настройки хранятся в localStorage под ключом tropy.a11y (см. js/a11y.js).
 */
(function () {
  'use strict';
  var s = {};
  try { s = JSON.parse(window.localStorage.getItem('tropy.a11y') || '{}') || {}; } catch (e) { s = {}; }
  var root = document.documentElement;
  var allowed = {
    theme: ['auto', 'light', 'dark', 'bw', 'wb', 'blue', 'brown', 'green'],
    font: ['100', '125', '150', '200'],
    spacing: ['0', '1', '2'],
    lh: ['0', '1', '2'],
    family: ['sans', 'serif', 'readable'],
    images: ['on', 'gray', 'off'],
    motion: ['on', 'off'],
    simple: ['off', 'on'],
    links: ['off', 'on']
  };
  Object.keys(allowed).forEach(function (k) {
    var v = s[k] != null ? String(s[k]) : allowed[k][0];
    if (allowed[k].indexOf(v) === -1) v = allowed[k][0];
    root.setAttribute('data-' + k, v);
  });
  root.style.setProperty('--scale', String(Number(root.getAttribute('data-font')) / 100));
  root.classList.add('js');
})();

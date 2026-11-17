#!/usr/bin/env node
/**
 * Сборка автономной версии сайта в ОДИН файл: `npm run build:standalone` → dist/tropy-standalone.html
 *
 * Зачем: открыть сайт без сервера — двойным щелчком с диска, с флешки, с GitHub Pages
 * или как вложение для жюри. Работает в автономном демо-режиме (js/api.js → LocalAdapter):
 * аккаунты, планы и отзывы хранятся в localStorage браузера, демо-доступы те же.
 *
 * Что делает:
 *  - встраивает CSS (сначала leaflet.css, затем app.css — как и в серверной версии);
 *  - встраивает все скрипты в том же порядке, что и index.html, плюс данные каталога и Leaflet;
 *  - обложки маршрутов (640 px, WebP), картинки Leaflet и шрифт PT Serif (woff2) встраивает как data:-URI
 *    (обложки — в window.TROPY_ASSETS);
 *  - убирает манифест и сервис-воркер (в одном файле они не нужны), включает автономный режим.
 * Подложка карты (OpenStreetMap) и прогноз погоды по-прежнему загружаются из интернета, если он есть.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const OUT_DIR = join(ROOT, 'dist');
const OUT = join(OUT_DIR, 'tropy-standalone.html');
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const dataUri = (rel) => `data:${MIME[extname(rel)]};base64,${readFileSync(join(PUB, rel)).toString('base64')}`;
/** Текст внутри <script> не должен содержать «</script» и «<!--» — иначе браузер закончит блок раньше времени */
const safeScript = (code) => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const safeStyle = (css) => css.replace(/<\/(style)/gi, '<\\/$1');
const inlineScript = (rel) => `<script data-src="${rel}">\n${safeScript(read(rel))}\n</script>`;

let html = read('index.html');

// 1. Стили: Leaflet до app.css, картинки Leaflet — data:-URI
const leafletCss = read('vendor/leaflet/leaflet.css').replace(/url\((images\/[^)]+)\)/g, (m, rel) => `url(${dataUri('vendor/leaflet/' + rel)})`);
// Шрифт PT Serif (public/fonts) — тоже data:-URI: в одном файле не должно быть ссылок на соседние файлы
const appCss = read('css/app.css').replace(/url\("\.\.\/(fonts\/[^"]+)"\)/g, (m, rel) => `url("${dataUri(rel)}")`);
if (appCss.includes('../fonts/')) { console.error('В app.css остались ссылки на файлы шрифтов'); process.exit(1); }
html = html.replace('<link rel="stylesheet" href="css/app.css">', () => `<style data-src="vendor/leaflet/leaflet.css">\n${safeStyle(leafletCss)}\n</style>\n  <style data-src="css/app.css">\n${safeStyle(appCss)}\n</style>`);

// 2. Манифест и иконки: в одном файле манифест не нужен, иконку встраиваем
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace('href="icons/icon.svg"', () => `href="${dataUri('icons/icon.svg')}"`);

// 3. Скрипты: boot.js в <head>, затем все скрипты из index.html по порядку
html = html.replace('<script src="js/boot.js"></script>', () => inlineScript('js/boot.js'));
const covers = readdirSync(join(PUB, 'img/routes')).filter((f) => f.endsWith('-640.webp')).sort();
const assets = Object.fromEntries(covers.map((f) => [`img/routes/${f}`, dataUri(`img/routes/${f}`)]));
const prelude = `<script>\n// Автономная сборка ${new Date().toISOString().slice(0, 10)}: без сервера, данные — в localStorage\nwindow.TROPY_FORCE_LOCAL = true;\nwindow.TROPY_ASSETS = ${JSON.stringify(assets)};\n</script>`;
const data = ['js/data/routes.js', 'js/data/tracks.js', 'js/data/restrictions.js', 'vendor/leaflet/leaflet.js'];
let first = true;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, rel) => {
  const parts = [];
  if (first) { parts.push(prelude); first = false; }
  parts.push(inlineScript(rel));
  // Данные каталога и карта — сразу после общих модулей, до api.js
  if (rel === 'js/data/gear.js') data.forEach((d) => parts.push(inlineScript(d)));
  return parts.join('\n  ');
});

// Проверка: в разметке (вне встроенных скриптов и стилей) не осталось ссылок на локальные файлы
const markup = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const left = [...markup.matchAll(/\s(?:src|href)="(?!#|https?:|data:|mailto:|tel:)([^"]+)"/g)].map((m) => m[1]);
if (left.length) { console.error('Остались внешние ссылки на локальные файлы:', left); process.exit(1); }

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, html);
const kb = (statSync(OUT).size / 1024).toFixed(0);
console.log(`Готово: ${OUT.replace(ROOT + '/', '')} (${kb} КБ, встроено обложек: ${covers.length})`);
console.log('Откройте файл в браузере — сайт заработает в автономном демо-режиме.');

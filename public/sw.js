/**
 * Сервис-воркер «Тропы без барьеров»: сайт открывается без интернета (в горах связи часто нет).
 * — оболочка сайта (вместе со шрифтом PT Serif) и данные каталога кешируются при установке;
 * — статические файлы: отдаём из кеша и обновляем в фоне (stale-while-revalidate);
 * — страницы: сначала сеть, без сети — сохранённая копия;
 * — запросы к API никогда не кешируются: в них личные данные. Без сети сайт сам
 *   переключается в автономный режим (см. js/api.js).
 */
'use strict';
const VERSION = 'tropy-2026-11-09c';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'fonts/pt-serif-cyrillic-400-normal.woff2', 'fonts/pt-serif-latin-400-normal.woff2', 'fonts/pt-serif-cyrillic-700-normal.woff2',
  'fonts/pt-serif-latin-700-normal.woff2', 'fonts/pt-serif-cyrillic-400-italic.woff2', 'fonts/pt-serif-latin-400-italic.woff2',
  'js/boot.js', 'js/shared/dict.js', 'js/shared/logic.js',
  'js/data/routes.js', 'js/data/tracks.js', 'js/data/restrictions.js', 'js/data/gear.js',
  'js/core.js', 'js/api.js', 'js/a11y.js', 'js/map.js', 'js/components.js', 'js/fx.js', 'js/quick-search.js', 'js/app.js',
  'js/pages/admin.js', 'js/pages/auth.js', 'js/pages/catalog.js', 'js/pages/compare.js', 'js/pages/gear.js', 'js/pages/home.js', 'js/pages/info.js', 'js/pages/map-page.js', 'js/pages/pick.js', 'js/pages/plans.js', 'js/pages/profile.js', 'js/pages/route.js', 'js/pages/rules.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function offlineApi() {
  return new Response(JSON.stringify({ error: { code: 'offline', message: 'Нет подключения к интернету' } }), {
    status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // тайлы карты и погода — напрямую

  if (url.pathname.includes('/api/')) {
    event.respondWith(fetch(req).catch(offlineApi));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('index.html', copy)); return res; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  event.respondWith(
    caches.open(VERSION).then((cache) => cache.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || network;
    }))
  );
});

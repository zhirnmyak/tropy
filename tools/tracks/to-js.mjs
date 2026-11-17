/**
 * Превращает tools/tracks/tracks.json (результат build-tracks.mjs + fix-summits.mjs)
 * в компактный модуль public/js/data/tracks.js.
 * Источники: OpenStreetMap (relation / маршрутизация по тропам OSRM foot), высоты — Open-Meteo Elevation API (Copernicus DEM).
 * Запуск: node tools/tracks/to-js.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const src = JSON.parse(fs.readFileSync(path.join(here, 'tracks.json'), 'utf8'));
const SRC = { relation: 'osm-relation', route: 'osm-routing', line: 'schematic' };
const out = {};
for (const [slug, t] of Object.entries(src)) {
  out[slug] = {
    src: SRC[t.src] || 'schematic',
    pts: t.pts.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]),
    prof: t.prof.map(([k, e]) => [+k.toFixed(2), Math.round(e)])
  };
}
const body = `/* Сгенерировано tools/tracks/to-js.mjs — не редактируйте вручную.
 * Треки: © участники OpenStreetMap (ODbL). Высоты: Open-Meteo Elevation API (Copernicus DEM GLO-90).
 * src: osm-relation — маршрут из OSM; osm-routing — построен по тропам OSM; schematic — схема по ключевым точкам. */
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else { root.TROPY = root.TROPY || {}; root.TROPY.tracks = data; }
})(typeof self !== 'undefined' ? self : this, ${JSON.stringify(out)});
`;
fs.writeFileSync(path.join(here, '../../public/js/data/tracks.js'), body);
console.log('tracks:', Object.keys(out).length, 'bytes:', body.length);

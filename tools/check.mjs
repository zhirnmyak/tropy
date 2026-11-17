#!/usr/bin/env node
/**
 * Быстрая самопроверка проекта перед публикацией: `npm run check`.
 *  1) синтаксис всех JS-файлов (node --check);
 *  2) целостность ссылок: файлы из index.html и из списка кеша сервис-воркера существуют,
 *     все скрипты страницы попадают в офлайн-кеш;
 *  3) данные каталога: обложки и треки есть у каждого маршрута, правила из маршрутов есть в базе правил.
 * Подробные проверки логики и API — в автотестах (`npm test`).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const require = createRequire(import.meta.url);
const errors = [];
const ok = (msg) => console.log('  ✔ ' + msg);
const fail = (msg) => { errors.push(msg); console.log('  ✖ ' + msg); };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

console.log('1. Синтаксис JavaScript');
const jsFiles = ['server', 'public', 'tools', 'tests']
  .filter((d) => existsSync(join(ROOT, d)))
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => ['.js', '.mjs'].includes(extname(f)) && !f.includes(join('public', 'vendor')));
let syntaxOk = 0;
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status === 0) syntaxOk += 1; else fail(`${relative(ROOT, f)}: ${(r.stderr || '').trim().split('\n').slice(0, 4).join(' ')}`);
}
ok(`проверено файлов: ${jsFiles.length}, без ошибок: ${syntaxOk}`);

console.log('2. Ссылки на файлы');
const html = readFileSync(join(PUB, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('//'));
const missingRefs = refs.filter((u) => !existsSync(join(PUB, u)));
if (missingRefs.length) fail('index.html ссылается на отсутствующие файлы: ' + missingRefs.join(', '));
else ok(`index.html: все ${refs.length} локальных ссылок ведут на существующие файлы`);

const sw = readFileSync(join(PUB, 'sw.js'), 'utf8');
const shellSrc = /const SHELL = \[([\s\S]*?)\];/.exec(sw);
if (!shellSrc) fail('sw.js: не найден список SHELL');
else {
  const shell = [...shellSrc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((u) => u !== './');
  const missing = shell.filter((u) => !existsSync(join(PUB, u)));
  if (missing.length) fail('sw.js: в офлайн-кеше отсутствующие файлы: ' + missing.join(', '));
  else ok(`sw.js: файлы офлайн-кеша на месте (${shell.length})`);
  const scripts = walk(join(PUB, 'js')).map((f) => relative(PUB, f).split('\\').join('/'));
  const notCached = scripts.filter((s) => !shell.includes(s));
  if (notCached.length) fail('sw.js: скрипты не попадут в офлайн-кеш: ' + notCached.join(', '));
  else ok(`sw.js: все ${scripts.length} скриптов сайта доступны офлайн`);
}

console.log('3. Данные каталога');
const { routes } = require(join(PUB, 'js/data/routes.js'));
const kb = require(join(PUB, 'js/data/restrictions.js'));
const tracksMod = require(join(PUB, 'js/data/tracks.js'));
const tracks = tracksMod.tracks || tracksMod;
const codes = new Set(kb.map((k) => k.code));
let dataErrors = 0;
for (const r of routes) {
  for (const size of [640, 1280]) {
    const img = join(PUB, 'img/routes', `${r.cover}-${size}.webp`);
    if (!existsSync(img)) { fail(`${r.slug}: нет обложки ${relative(ROOT, img)}`); dataErrors += 1; }
  }
  const t = tracks[r.slug];
  if (!t || !t.pts || t.pts.length < 2) { fail(`${r.slug}: нет трека`); dataErrors += 1; }
  for (const [code] of r.restrictions || []) if (!codes.has(code)) { fail(`${r.slug}: неизвестное правило ${code}`); dataErrors += 1; }
  if (!r.check) { fail(`${r.slug}: не указана дата сверки (check)`); dataErrors += 1; }
}
const orphanTracks = Object.keys(tracks).filter((s) => !routes.some((r) => r.slug === s));
if (orphanTracks.length) fail('треки без маршрута: ' + orphanTracks.join(', '));
if (!dataErrors && !orphanTracks.length) ok(`маршрутов: ${routes.length}, правил: ${kb.length}, треков: ${Object.keys(tracks).length} — обложки, треки и правила на месте`);

console.log(errors.length ? `\nНайдено проблем: ${errors.length}` : '\nВсё в порядке.');
process.exit(errors.length ? 1 : 0);

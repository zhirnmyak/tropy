'use strict';
/**
 * Слой данных: SQLite (встроенный модуль node:sqlite, без внешних зависимостей).
 *
 * Модель «реляционные поля + JSON-документ»: всё, по чему фильтруем и сортируем
 * (сложность, длина, регион, доступность, теги, сезон, уровень ограничений), хранится
 * в отдельных колонках и таблицах с индексами; богатый контент маршрута (описания,
 * этапы, источники) — в колонке data (JSON). Так запросы каталога остаются быстрыми,
 * а схема — простой. ER-диаграмма — в README.md.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const dict = require('../public/js/shared/dict.js');
const logic = require('../public/js/shared/logic.js');

/** Миграции применяются по порядку и один раз (таблица schema_migrations). */
const MIGRATIONS = [
  `CREATE TABLE districts (code TEXT PRIMARY KEY, name TEXT NOT NULL);
   CREATE TABLE regions (code TEXT PRIMARY KEY, name TEXT NOT NULL, district_code TEXT NOT NULL REFERENCES districts(code));
   CREATE TABLE restrictions (
     code TEXT PRIMARY KEY, level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 2),
     kind TEXT NOT NULL, title TEXT NOT NULL, data TEXT NOT NULL);
   CREATE TABLE routes (
     id INTEGER PRIMARY KEY,
     slug TEXT NOT NULL UNIQUE,
     title TEXT NOT NULL,
     region_code TEXT NOT NULL REFERENCES regions(code),
     area_type TEXT NOT NULL,
     difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
     length_km REAL NOT NULL CHECK (length_km > 0),
     gain_m INTEGER NOT NULL DEFAULT 0,
     duration_h REAL NOT NULL,
     days_min INTEGER NOT NULL, days_max INTEGER NOT NULL,
     route_type TEXT NOT NULL CHECK (route_type IN ('loop','radial','linear')),
     months_mask INTEGER NOT NULL,              -- битовая маска сезона: бит 0 = январь
     restriction_level INTEGER NOT NULL DEFAULT 0,
     start_lat REAL NOT NULL, start_lon REAL NOT NULL,
     search_text TEXT NOT NULL,                 -- нормализованный текст: LIKE в SQLite не приводит кириллицу к нижнему регистру
     data TEXT NOT NULL,                        -- полный JSON-документ маршрута
     status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE route_access (
     route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     category TEXT NOT NULL CHECK (category IN ('K','O','S','G','U')),
     status TEXT NOT NULL CHECK (status IN ('DP','DCH','DU','VND')),
     rank INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '',
     PRIMARY KEY (route_id, category));
   CREATE TABLE route_tags (
     route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('landscape','feature')), tag TEXT NOT NULL,
     PRIMARY KEY (route_id, kind, tag));
   CREATE TABLE route_restrictions (
     route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     restriction_code TEXT NOT NULL REFERENCES restrictions(code),
     note TEXT NOT NULL DEFAULT '', PRIMARY KEY (route_id, restriction_code));
   CREATE TABLE route_sources (
     id INTEGER PRIMARY KEY, route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     title TEXT NOT NULL, url TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE tracks (
     route_id INTEGER PRIMARY KEY REFERENCES routes(id) ON DELETE CASCADE,
     source TEXT NOT NULL, points TEXT NOT NULL, profile TEXT NOT NULL);
   CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     name TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
     needs TEXT NOT NULL DEFAULT '[]', companion INTEGER NOT NULL DEFAULT 0,
     settings TEXT NOT NULL DEFAULT '{}',
     consent_at TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login_at TEXT);
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,               -- храним только SHA-256 от токена
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), user_agent TEXT NOT NULL DEFAULT '');
   CREATE TABLE reviews (
     id INTEGER PRIMARY KEY,
     route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
     access_match TEXT NOT NULL CHECK (access_match IN ('yes','partly','no','na')),
     needs TEXT NOT NULL DEFAULT '[]', text TEXT NOT NULL, visited_at TEXT,
     status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
     created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (route_id, user_id));
   CREATE TABLE favorites (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, route_id));
   CREATE TABLE completions (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     done_at TEXT NOT NULL, PRIMARY KEY (user_id, route_id));
   CREATE TABLE plans (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     title TEXT NOT NULL DEFAULT '', start_date TEXT NOT NULL, end_date TEXT NOT NULL,
     group_size INTEGER NOT NULL DEFAULT 1, needs TEXT NOT NULL DEFAULT '[]',
     contact_name TEXT NOT NULL DEFAULT '', contact_phone TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '', tasks TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE gear_lists (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL, route_slug TEXT NOT NULL DEFAULT '',
     params TEXT NOT NULL DEFAULT '{}', items TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE access_reports (
     id INTEGER PRIMARY KEY,
     route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     category TEXT NOT NULL, text TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','progress','resolved','rejected')),
     resolution TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE feedback (
     id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     topic TEXT NOT NULL, message TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
     page TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','resolved')),
     created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE alerts (
     id INTEGER PRIMARY KEY, text TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning')),
     link TEXT NOT NULL DEFAULT '', until TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE audit_log (
     id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, details TEXT NOT NULL DEFAULT '{}',
     created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE INDEX idx_routes_region ON routes(region_code);
   CREATE INDEX idx_routes_filter ON routes(status, difficulty, length_km);
   CREATE INDEX idx_access_category ON route_access(category, rank);
   CREATE INDEX idx_tags_tag ON route_tags(kind, tag);
   CREATE INDEX idx_reviews_route ON reviews(route_id, status);
   CREATE INDEX idx_reviews_user ON reviews(user_id);
   CREATE INDEX idx_sessions_user ON sessions(user_id);
   CREATE INDEX idx_sessions_expires ON sessions(expires_at);
   CREATE INDEX idx_plans_user ON plans(user_id, start_date);
   CREATE INDEX idx_gear_user ON gear_lists(user_id);
   CREATE INDEX idx_reports_status ON access_reports(status, created_at);
   CREATE INDEX idx_feedback_status ON feedback(status, created_at);`
];

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  migrate(db);
  return wrap(db);
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  MIGRATIONS.forEach((sql, i) => {
    const v = i + 1;
    if (done.has(v)) return;
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(v, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  });
}

/** Обёртка: кэш подготовленных выражений и транзакции */
function wrap(db) {
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  return {
    raw: db,
    all: (sql, ...p) => stmt(sql).all(...p),
    get: (sql, ...p) => stmt(sql).get(...p),
    run: (sql, ...p) => stmt(sql).run(...p),
    tx(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close()
  };
}

const monthsMask = (months) => months.reduce((m, x) => m | (1 << (x - 1)), 0);
const json = (v) => JSON.stringify(v === undefined ? null : v);
const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

/** Записывает маршрут (вставка или обновление) вместе со связанными таблицами — в одной транзакции */
function saveRoute(db, route, kb, existingId) {
  const level = logic.restrictionLevel(route, kb);
  const searchText = logic.norm([route.title, route.area, logic.regionOf(route).name, route.summary, (route.highlights || []).join(' ')].join(' '));
  const cols = [route.slug, route.title, route.region, route.areaType, route.difficulty, route.lengthKm, route.gainM, route.durationH,
    route.days[0], route.days[1], route.type, monthsMask(route.months), level, route.start.lat, route.start.lon, searchText,
    json(stripMeta(route)), route.status || 'published'];
  let id = existingId;
  if (id) {
    db.run(`UPDATE routes SET slug=?, title=?, region_code=?, area_type=?, difficulty=?, length_km=?, gain_m=?, duration_h=?,
      days_min=?, days_max=?, route_type=?, months_mask=?, restriction_level=?, start_lat=?, start_lon=?, search_text=?, data=?, status=?,
      updated_at=datetime('now') WHERE id=?`, ...cols, id);
    ['route_access', 'route_tags', 'route_restrictions', 'route_sources'].forEach((t) => db.run(`DELETE FROM ${t} WHERE route_id=?`, id));
  } else {
    id = Number(db.run(`INSERT INTO routes (slug, title, region_code, area_type, difficulty, length_km, gain_m, duration_h, days_min, days_max,
      route_type, months_mask, restriction_level, start_lat, start_lon, search_text, data, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...cols).lastInsertRowid);
  }
  for (const c of ['K', 'O', 'S', 'G', 'U']) {
    const a = route.access[c];
    db.run('INSERT INTO route_access (route_id, category, status, rank, note) VALUES (?,?,?,?,?)', id, c, a[0], dict.ACCESS_STATUS[a[0]].rank, a[1] || '');
  }
  for (const t of route.landscapes || []) db.run("INSERT INTO route_tags (route_id, kind, tag) VALUES (?, 'landscape', ?)", id, t);
  for (const t of route.features || []) db.run("INSERT INTO route_tags (route_id, kind, tag) VALUES (?, 'feature', ?)", id, t);
  const known = new Set(kb.map((k) => k.code));
  for (const [code, note] of route.restrictions || []) {
    if (known.has(code)) db.run('INSERT OR IGNORE INTO route_restrictions (route_id, restriction_code, note) VALUES (?,?,?)', id, code, note || '');
  }
  (route.sources || []).forEach(([title, url], i) => db.run('INSERT INTO route_sources (route_id, title, url, position) VALUES (?,?,?,?)', id, title, url, i));
  return id;
}
function stripMeta(r) { const c = { ...r }; delete c.rating; delete c.reviewsCount; delete c.status; return c; }

/** Первичное заполнение: справочники, маршруты, треки, объявления, учётные записи */
function seed(db, { adminEmail, adminPassword, demoPassword, hash, log }) {
  const kb = require('../public/js/data/restrictions.js');
  // Справочники (округа, регионы, база правил) — часть кода: синхронизируем при каждом запуске,
  // чтобы исправленные формулировки и новые ссылки на источники попадали в уже работающую базу
  db.tx(() => {
    dict.DISTRICTS.forEach((d) => db.run('INSERT INTO districts (code, name) VALUES (?, ?) ON CONFLICT (code) DO UPDATE SET name = excluded.name', d.code, d.name));
    dict.REGIONS.forEach((r) => db.run('INSERT INTO regions (code, name, district_code) VALUES (?,?,?) ON CONFLICT (code) DO UPDATE SET name = excluded.name, district_code = excluded.district_code', r.code, r.name, r.district));
    kb.forEach((k) => db.run('INSERT INTO restrictions (code, level, kind, title, data) VALUES (?,?,?,?,?) ON CONFLICT (code) DO UPDATE SET level = excluded.level, kind = excluded.kind, title = excluded.title, data = excluded.data', k.code, k.level, k.kind, k.title, json(k)));
  });
  const has = db.get('SELECT COUNT(*) AS n FROM routes').n > 0;
  if (!has) {
    const { routes } = require('../public/js/data/routes.js');
    const tracks = require('../public/js/data/tracks.js');
    db.tx(() => {
      routes.forEach((r) => {
        const id = saveRoute(db, r, kb);
        const t = tracks[r.slug];
        if (t) db.run('INSERT INTO tracks (route_id, source, points, profile) VALUES (?,?,?,?)', id, t.src, json(t.pts), json(t.prof));
      });
      db.run("INSERT INTO alerts (text, level, link) VALUES (?, 'warning', ?)", 'С 1 декабря 2025 года в национальном парке «Красноярские Столбы» гулять можно только по утверждённым маршрутам.', 'https://kras-stolby.ru/');
      db.run("INSERT INTO alerts (text, level, link) VALUES (?, 'info', ?)", 'Печоро-Илычский заповедник принимает заявки на посещение плато Маньпупунёр зимой 2027 года с 1 ноября 2026 года.', 'https://pechora-reserve.ru/');
    });
    log && log(`База данных заполнена: ${routes.length} маршрутов`);
  }
  return Promise.all([
    ensureUser(db, adminEmail, 'Администратор', adminPassword, 'admin', hash),
    demoPassword ? ensureUser(db, 'demo@tropy.local', 'Демо-пользователь', demoPassword, 'user', hash, ['S']) : null
  ]);
}

async function ensureUser(db, email, name, password, role, hash, needs) {
  if (!email || !password) return;
  if (db.get('SELECT id FROM users WHERE email = ?', email)) return;
  const ph = await hash(password);
  db.run("INSERT INTO users (email, name, password_hash, role, needs, consent_at) VALUES (?,?,?,?,?,datetime('now'))", email, name, ph, role, json(needs || []));
}

module.exports = { open, seed, saveRoute, monthsMask, json, parse };

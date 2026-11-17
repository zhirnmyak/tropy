'use strict';
/**
 * REST API «Тропы без барьеров». Все ответы — JSON.
 * Ошибки: { error: { code, message, fields? } }. Полный список методов — docs/API.md.
 */
const dict = require('../public/js/shared/dict.js');
const logic = require('../public/js/shared/logic.js');
const auth = require('./auth.js');
const { saveRoute, json, parse } = require('./db.js');

class HttpError extends Error {
  constructor(status, code, message, fields) { super(message); this.status = status; this.code = code; this.fields = fields; }
}
const notFound = (what) => new HttpError(404, 'not_found', what || 'Не найдено');
const invalid = (fields) => new HttpError(422, 'validation', 'Проверьте правильность заполнения формы', fields);
function check(schema, body) { const r = logic.validate(schema, body); if (!r.ok) throw invalid(r.errors); return r.value; }

function createApi({ db, kb, secureCookies, demo }) {
  const table = [];
  /** Регистрация обработчика: шаблон пути вида /api/routes/:slug */
  function add(method, pattern, opts, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    table.push({ method, re, keys, opts, handler });
  }
  const limiter = auth.rateLimiter();
  function limit(ctx, name, n, windowMs, extraKey) {
    const wait = limiter(`${name}:${ctx.ip}${extraKey ? ':' + extraKey : ''}`, n, windowMs);
    if (wait) { const e = new HttpError(429, 'rate_limited', `Слишком много попыток. Повторите через ${Math.ceil(wait / 60)} мин.`); e.retryAfter = wait; throw e; }
  }
  const audit = (ctx, action, entity, id, details) =>
    db.run('INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)', ctx.user ? ctx.user.id : null, action, entity, id == null ? null : String(id), json(details || {}));

  /* ---------- Вспомогательные выборки ---------- */

  const ROUTE_SELECT = `SELECT r.id, r.slug, r.data, r.status, COUNT(v.id) AS reviews_count, ROUND(AVG(v.rating), 1) AS rating
    FROM routes r LEFT JOIN reviews v ON v.route_id = r.id AND v.status = 'published'`;
  function rowToRoute(row) {
    const r = parse(row.data, {});
    r.status = row.status; r.rating = row.rating || null; r.reviewsCount = row.reviews_count || 0;
    return r;
  }
  function routeIdBySlug(slug, allowHidden) {
    const row = db.get('SELECT id, status FROM routes WHERE slug = ?', slug);
    if (!row || (!allowHidden && row.status !== 'published')) throw notFound('Маршрут не найден');
    return row.id;
  }
  function parseFilters(q) {
    const list = (k, allowed) => (q.get(k) || '').split(',').map((s) => s.trim()).filter((s) => allowed.includes(s));
    const ints = (k) => (q.get(k) || '').split(',').map(Number).filter((n) => n >= 1 && n <= 5);
    return {
      q: (q.get('q') || '').slice(0, 100), needs: list('need', ['K', 'O', 'S', 'G', 'U']), companion: q.get('companion') === '1',
      diff: ints('diff'), lenMax: Math.max(0, Number(q.get('lenMax')) || 0), days: ['one', 'multi'].includes(q.get('days')) ? q.get('days') : '',
      district: dict.DISTRICT_BY_CODE[q.get('district')] ? q.get('district') : '', region: dict.REGION_BY_CODE[q.get('region')] ? q.get('region') : '',
      month: Math.min(12, Math.max(0, parseInt(q.get('month'), 10) || 0)), land: list('land', Object.keys(dict.LANDSCAPES)),
      feat: list('feat', Object.keys(dict.FEATURES)), noPermit: q.get('noPermit') === '1', sort: q.get('sort') || ''
    };
  }
  /** Фильтрация каталога средствами SQL (те же правила, что и logic.filterRoutes на клиенте) */
  function listRoutes(f, includeHidden) {
    const where = [], p = [];
    if (!includeHidden) where.push("r.status = 'published'");
    if (f.q) { where.push("r.search_text LIKE ? ESCAPE '\\'"); p.push('%' + logic.norm(f.q).replace(/[\\%_]/g, (m) => '\\' + m) + '%'); }
    for (const c of f.needs) { where.push('EXISTS (SELECT 1 FROM route_access a WHERE a.route_id = r.id AND a.category = ? AND a.rank >= ?)'); p.push(c, f.companion ? 1 : 2); }
    if (f.diff.length) { where.push(`r.difficulty IN (${f.diff.map(() => '?').join(',')})`); p.push(...f.diff); }
    if (f.lenMax) { where.push('r.length_km <= ?'); p.push(f.lenMax); }
    if (f.days === 'one') where.push('r.days_min = 1');
    if (f.days === 'multi') where.push('r.days_max >= 2');
    if (f.district) { where.push('r.region_code IN (SELECT code FROM regions WHERE district_code = ?)'); p.push(f.district); }
    if (f.region) { where.push('r.region_code = ?'); p.push(f.region); }
    if (f.month) { where.push('(r.months_mask & ?) <> 0'); p.push(1 << (f.month - 1)); }
    if (f.land.length) { where.push(`EXISTS (SELECT 1 FROM route_tags t WHERE t.route_id = r.id AND t.kind = 'landscape' AND t.tag IN (${f.land.map(() => '?').join(',')}))`); p.push(...f.land); }
    for (const x of f.feat) { where.push("EXISTS (SELECT 1 FROM route_tags t WHERE t.route_id = r.id AND t.kind = 'feature' AND t.tag = ?)"); p.push(x); }
    if (f.noPermit) where.push('r.restriction_level < 2');
    const order = { 'diff-desc': 'r.difficulty DESC, r.length_km DESC', 'len-asc': 'r.length_km', 'len-desc': 'r.length_km DESC', rating: 'rating IS NULL, rating DESC, reviews_count DESC' }[f.sort] || 'r.difficulty, r.length_km';
    const sql = `${ROUTE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} GROUP BY r.id ORDER BY ${order}`;
    const list = db.raw.prepare(sql).all(...p).map(rowToRoute); // динамический SQL — без кэша выражений
    if (f.sort === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    return list;
  }
  const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, needs: parse(u.needs, []), companion: !!u.companion, settings: parse(u.settings, {}), createdAt: u.created_at });
  function mePayload(u) {
    if (!u) return { user: null };
    return {
      user: publicUser(u),
      favorites: db.all('SELECT r.slug FROM favorites f JOIN routes r ON r.id = f.route_id WHERE f.user_id = ? ORDER BY f.created_at DESC', u.id).map((x) => x.slug),
      completed: db.all('SELECT r.slug, c.done_at FROM completions c JOIN routes r ON r.id = c.route_id WHERE c.user_id = ? ORDER BY c.done_at DESC', u.id).map((x) => ({ slug: x.slug, doneAt: x.done_at }))
    };
  }
  const reviewOut = (v, me) => ({ id: v.id, routeSlug: v.slug, routeTitle: v.title, rating: v.rating, accessMatch: v.access_match, needs: parse(v.needs, []), text: v.text, visitedAt: v.visited_at, createdAt: v.created_at, author: v.name, status: v.status, own: !!me && me.id === v.user_id });
  const planOut = (p) => ({ id: p.id, routeSlug: p.slug, routeTitle: p.route_title, title: p.title, startDate: p.start_date, endDate: p.end_date, groupSize: p.group_size, needs: parse(p.needs, []), contactName: p.contact_name, contactPhone: p.contact_phone, notes: p.notes, tasks: parse(p.tasks, []), createdAt: p.created_at, updatedAt: p.updated_at });
  const gearOut = (g) => ({ id: g.id, title: g.title, routeSlug: g.route_slug, params: parse(g.params, {}), items: parse(g.items, []), createdAt: g.created_at, updatedAt: g.updated_at });
  const PLAN_SELECT = 'SELECT p.*, r.slug, json_extract(r.data, \'$.title\') AS route_title FROM plans p JOIN routes r ON r.id = p.route_id';
  function ownPlan(ctx, id) { const p = db.get(`${PLAN_SELECT} WHERE p.id = ? AND p.user_id = ?`, Number(id), ctx.user.id); if (!p) throw notFound('План не найден'); return p; }
  function ownGear(ctx, id) { const g = db.get('SELECT * FROM gear_lists WHERE id = ? AND user_id = ?', Number(id), ctx.user.id); if (!g) throw notFound('Список не найден'); return g; }

  /* ---------- Служебные и справочные ---------- */

  add('GET', '/api/health', {}, () => ({ ok: true, mode: 'server', version: '1.0.0', time: new Date().toISOString(), demo: demo || { user: false, admin: false } }));
  add('GET', '/api/alerts', {}, () => ({ items: db.all("SELECT id, text, level, link, until FROM alerts WHERE until IS NULL OR until >= date('now') ORDER BY id DESC") }));
  add('GET', '/api/restrictions', {}, () => {
    const links = db.all('SELECT rr.restriction_code AS code, r.slug FROM route_restrictions rr JOIN routes r ON r.id = rr.route_id WHERE r.status = \'published\'');
    return { items: db.all('SELECT data FROM restrictions ORDER BY level DESC, code').map((x) => { const k = parse(x.data, {}); k.routes = links.filter((l) => l.code === k.code).map((l) => l.slug); return k; }) };
  });

  /* ---------- Каталог ---------- */

  add('GET', '/api/routes', {}, (ctx) => {
    const f = parseFilters(ctx.query);
    const items = listRoutes(f, false).map(logic.toCard);
    return { items, total: items.length };
  });
  add('GET', '/api/routes/:slug', {}, (ctx, { slug }) => {
    const row = db.get(`${ROUTE_SELECT} WHERE r.slug = ? GROUP BY r.id`, slug);
    if (!row || (row.status !== 'published' && (!ctx.user || ctx.user.role !== 'admin'))) throw notFound('Маршрут не найден');
    const route = rowToRoute(row);
    const t = db.get('SELECT source, points, profile FROM tracks WHERE route_id = ?', row.id);
    const reviews = db.all(`SELECT v.*, u.name, ? AS slug, '' AS title FROM reviews v JOIN users u ON u.id = v.user_id
      WHERE v.route_id = ? AND v.status = 'published' ORDER BY v.created_at DESC LIMIT 100`, slug, row.id).map((v) => reviewOut(v, ctx.user));
    let me = null;
    if (ctx.user) {
      me = {
        favorite: !!db.get('SELECT 1 AS x FROM favorites WHERE user_id = ? AND route_id = ?', ctx.user.id, row.id),
        completed: (db.get('SELECT done_at FROM completions WHERE user_id = ? AND route_id = ?', ctx.user.id, row.id) || {}).done_at || null
      };
    }
    return { route, track: t ? { src: t.source, pts: parse(t.points, []), prof: parse(t.profile, []) } : null, reviews, me };
  });
  add('GET', '/api/routes/:slug/gpx', {}, (ctx, { slug }) => {
    const id = routeIdBySlug(slug);
    const route = parse(db.get('SELECT data FROM routes WHERE id = ?', id).data, {});
    const t = db.get('SELECT points FROM tracks WHERE route_id = ?', id);
    return { raw: logic.toGPX(route, t ? { pts: parse(t.points, []) } : null), type: 'application/gpx+xml; charset=utf-8', filename: `${slug}.gpx` };
  });
  add('GET', '/api/open-data', {}, () => ({
    license: 'Тексты — CC BY 4.0 «Тропы без барьеров»; треки — © участники OpenStreetMap, ODbL',
    generatedAt: new Date().toISOString(), items: listRoutes(parseFilters(new URLSearchParams()), false)
  }));

  /* ---------- Отзывы и сообщения о доступности ---------- */

  add('POST', '/api/routes/:slug/reviews', { auth: true }, (ctx, { slug }) => {
    limit(ctx, 'review', 30, 3600e3);
    const v = check('review', ctx.body);
    const id = routeIdBySlug(slug);
    db.run(`INSERT INTO reviews (route_id, user_id, rating, access_match, needs, text, visited_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT (route_id, user_id) DO UPDATE SET rating = excluded.rating, access_match = excluded.access_match, needs = excluded.needs,
      text = excluded.text, visited_at = excluded.visited_at, status = 'published', updated_at = datetime('now')`,
      id, ctx.user.id, v.rating, v.accessMatch, json(v.needs), v.text, v.visitedAt);
    return { ok: true, status: 201 };
  });
  add('DELETE', '/api/reviews/:id', { auth: true }, (ctx, { id }) => {
    const r = db.get('SELECT user_id FROM reviews WHERE id = ?', Number(id));
    if (!r) throw notFound('Отзыв не найден');
    if (r.user_id !== ctx.user.id && ctx.user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Можно удалить только свой отзыв');
    db.run('DELETE FROM reviews WHERE id = ?', Number(id));
    if (r.user_id !== ctx.user.id) audit(ctx, 'delete', 'review', id);
    return { ok: true };
  });
  add('POST', '/api/routes/:slug/reports', {}, (ctx, { slug }) => {
    limit(ctx, 'report', 10, 3600e3);
    if (ctx.body && ctx.body.website) return { ok: true }; // ловушка для ботов
    const v = check('report', ctx.body);
    const id = routeIdBySlug(slug);
    db.run('INSERT INTO access_reports (route_id, user_id, category, text, contact) VALUES (?,?,?,?,?)', id, ctx.user ? ctx.user.id : null, v.category, v.text, v.contact);
    return { ok: true, status: 201 };
  });
  add('POST', '/api/feedback', {}, (ctx) => {
    limit(ctx, 'feedback', 10, 3600e3);
    if (ctx.body && ctx.body.website) return { ok: true };
    const v = check('feedback', ctx.body);
    db.run('INSERT INTO feedback (user_id, topic, message, name, email, page) VALUES (?,?,?,?,?,?)', ctx.user ? ctx.user.id : null, v.topic, v.message, v.name, v.email || '', v.page);
    return { ok: true, status: 201 };
  });

  /* ---------- Избранное и пройденные ---------- */

  add('PUT', '/api/favorites/:slug', { auth: true }, (ctx, { slug }) => { db.run('INSERT OR IGNORE INTO favorites (user_id, route_id) VALUES (?,?)', ctx.user.id, routeIdBySlug(slug)); return { ok: true, favorite: true }; });
  add('DELETE', '/api/favorites/:slug', { auth: true }, (ctx, { slug }) => { db.run('DELETE FROM favorites WHERE user_id = ? AND route_id = ?', ctx.user.id, routeIdBySlug(slug, true)); return { ok: true, favorite: false }; });
  add('PUT', '/api/completions/:slug', { auth: true }, (ctx, { slug }) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test((ctx.body || {}).date) ? ctx.body.date : logic.isoDate(new Date());
    db.run('INSERT INTO completions (user_id, route_id, done_at) VALUES (?,?,?) ON CONFLICT (user_id, route_id) DO UPDATE SET done_at = excluded.done_at', ctx.user.id, routeIdBySlug(slug), date);
    return { ok: true, completed: date };
  });
  add('DELETE', '/api/completions/:slug', { auth: true }, (ctx, { slug }) => { db.run('DELETE FROM completions WHERE user_id = ? AND route_id = ?', ctx.user.id, routeIdBySlug(slug, true)); return { ok: true, completed: null }; });

  /* ---------- Планы походов ---------- */

  add('GET', '/api/plans', { auth: true }, (ctx) => ({ items: db.all(`${PLAN_SELECT} WHERE p.user_id = ? ORDER BY p.start_date`, ctx.user.id).map(planOut) }));
  add('GET', '/api/plans/:id', { auth: true }, (ctx, { id }) => ({ plan: planOut(ownPlan(ctx, id)) }));
  function planValues(ctx) {
    const v = check('plan', ctx.body);
    const routeId = routeIdBySlug(v.routeSlug);
    if (!v.tasks.length) {
      const route = parse(db.get('SELECT data FROM routes WHERE id = ?', routeId).data, {});
      v.tasks = logic.planTasks(route, v, kb);
    }
    return { v, routeId };
  }
  add('POST', '/api/plans', { auth: true }, (ctx) => {
    if (db.get('SELECT COUNT(*) AS n FROM plans WHERE user_id = ?', ctx.user.id).n >= 50) throw new HttpError(400, 'limit', 'Можно сохранить не больше 50 планов');
    const { v, routeId } = planValues(ctx);
    const id = Number(db.run(`INSERT INTO plans (user_id, route_id, title, start_date, end_date, group_size, needs, contact_name, contact_phone, notes, tasks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ctx.user.id, routeId, v.title, v.startDate, v.endDate, v.groupSize, json(v.needs), v.contactName, v.contactPhone, v.notes, json(v.tasks)).lastInsertRowid);
    return { plan: planOut(ownPlan(ctx, id)), status: 201 };
  });
  add('PUT', '/api/plans/:id', { auth: true }, (ctx, { id }) => {
    ownPlan(ctx, id);
    const { v, routeId } = planValues(ctx);
    db.run(`UPDATE plans SET route_id=?, title=?, start_date=?, end_date=?, group_size=?, needs=?, contact_name=?, contact_phone=?, notes=?, tasks=?, updated_at=datetime('now')
      WHERE id=? AND user_id=?`, routeId, v.title, v.startDate, v.endDate, v.groupSize, json(v.needs), v.contactName, v.contactPhone, v.notes, json(v.tasks), Number(id), ctx.user.id);
    return { plan: planOut(ownPlan(ctx, id)) };
  });
  add('DELETE', '/api/plans/:id', { auth: true }, (ctx, { id }) => { ownPlan(ctx, id); db.run('DELETE FROM plans WHERE id = ? AND user_id = ?', Number(id), ctx.user.id); return { ok: true }; });

  /* ---------- Списки снаряжения ---------- */

  add('GET', '/api/gear-lists', { auth: true }, (ctx) => ({ items: db.all('SELECT * FROM gear_lists WHERE user_id = ? ORDER BY updated_at DESC', ctx.user.id).map(gearOut) }));
  add('POST', '/api/gear-lists', { auth: true }, (ctx) => {
    if (db.get('SELECT COUNT(*) AS n FROM gear_lists WHERE user_id = ?', ctx.user.id).n >= 50) throw new HttpError(400, 'limit', 'Можно сохранить не больше 50 списков');
    const v = check('gearList', ctx.body);
    const id = Number(db.run('INSERT INTO gear_lists (user_id, title, route_slug, params, items) VALUES (?,?,?,?,?)', ctx.user.id, v.title, v.routeSlug || '', json(v.params || {}), json(v.items)).lastInsertRowid);
    return { list: gearOut(ownGear(ctx, id)), status: 201 };
  });
  add('PUT', '/api/gear-lists/:id', { auth: true }, (ctx, { id }) => {
    ownGear(ctx, id);
    const v = check('gearList', ctx.body);
    db.run("UPDATE gear_lists SET title=?, route_slug=?, params=?, items=?, updated_at=datetime('now') WHERE id=? AND user_id=?", v.title, v.routeSlug || '', json(v.params || {}), json(v.items), Number(id), ctx.user.id);
    return { list: gearOut(ownGear(ctx, id)) };
  });
  add('DELETE', '/api/gear-lists/:id', { auth: true }, (ctx, { id }) => { ownGear(ctx, id); db.run('DELETE FROM gear_lists WHERE id = ? AND user_id = ?', Number(id), ctx.user.id); return { ok: true }; });

  /* ---------- Учётная запись ---------- */

  add('POST', '/api/auth/register', {}, async (ctx) => {
    limit(ctx, 'register', 10, 3600e3);
    const v = check('register', ctx.body);
    if (db.get('SELECT id FROM users WHERE email = ?', v.email)) throw invalid({ email: 'Этот адрес уже зарегистрирован. Войдите или укажите другой адрес' });
    const hash = await auth.hashPassword(v.password);
    const id = Number(db.run("INSERT INTO users (email, name, password_hash, needs, consent_at) VALUES (?,?,?,?,datetime('now'))", v.email, v.name, hash, json(v.needs)).lastInsertRowid);
    const s = auth.createSession(db, id, { remember: true, userAgent: ctx.req.headers['user-agent'] });
    ctx.setCookie(auth.cookieHeader(s.token, { maxAge: s.maxAge, secure: secureCookies }));
    ctx.user = db.get('SELECT * FROM users WHERE id = ?', id);
    return Object.assign(mePayload(ctx.user), { status: 201 });
  });
  add('POST', '/api/auth/login', {}, async (ctx) => {
    limit(ctx, 'login', 20, 15 * 60e3);
    const v = check('login', ctx.body);
    limit(ctx, 'login-email', 8, 15 * 60e3, v.email);
    const u = db.get('SELECT * FROM users WHERE email = ?', v.email);
    const ok = u ? await auth.verifyPassword(v.password, u.password_hash) : await auth.dummyVerify(v.password);
    if (!ok) throw new HttpError(401, 'bad_credentials', 'Неверный адрес почты или пароль');
    const s = auth.createSession(db, u.id, { remember: v.remember, userAgent: ctx.req.headers['user-agent'] });
    ctx.setCookie(auth.cookieHeader(s.token, { maxAge: s.maxAge, secure: secureCookies }));
    return mePayload(u);
  });
  add('POST', '/api/auth/logout', {}, (ctx) => { auth.destroySession(db, ctx.token); ctx.setCookie(auth.clearCookie(secureCookies)); return { ok: true }; });
  add('GET', '/api/auth/me', {}, (ctx) => mePayload(ctx.user));
  add('PATCH', '/api/me', { auth: true }, (ctx) => {
    const v = check('profile', Object.assign({ name: ctx.user.name }, ctx.body));
    db.run('UPDATE users SET name = ?, needs = ?, companion = ?, settings = ? WHERE id = ?', v.name, json(v.needs), v.companion ? 1 : 0, json(v.settings || parse(ctx.user.settings, {})), ctx.user.id);
    return mePayload(db.get('SELECT * FROM users WHERE id = ?', ctx.user.id));
  });
  add('POST', '/api/me/password', { auth: true }, async (ctx) => {
    limit(ctx, 'password', 10, 3600e3);
    const v = check('password', ctx.body);
    const u = db.get('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
    if (!(await auth.verifyPassword(v.current, u.password_hash))) throw invalid({ current: 'Текущий пароль указан неверно' });
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', await auth.hashPassword(v.next), ctx.user.id);
    db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', ctx.user.id, require('node:crypto').createHash('sha256').update(ctx.token).digest('hex'));
    return { ok: true };
  });
  add('GET', '/api/me/export', { auth: true }, (ctx) => {
    const id = ctx.user.id;
    const data = {
      exportedAt: new Date().toISOString(), user: publicUser(db.get('SELECT * FROM users WHERE id = ?', id)),
      favorites: mePayload(ctx.user).favorites, completed: mePayload(ctx.user).completed,
      reviews: db.all("SELECT v.*, u.name, r.slug, json_extract(r.data, '$.title') AS title FROM reviews v JOIN users u ON u.id = v.user_id JOIN routes r ON r.id = v.route_id WHERE v.user_id = ?", id).map((v) => reviewOut(v, ctx.user)),
      plans: db.all(`${PLAN_SELECT} WHERE p.user_id = ?`, id).map(planOut),
      gearLists: db.all('SELECT * FROM gear_lists WHERE user_id = ?', id).map(gearOut)
    };
    return { raw: JSON.stringify(data, null, 2), type: 'application/json; charset=utf-8', filename: 'tropy-my-data.json' };
  });
  add('GET', '/api/me/reviews', { auth: true }, (ctx) => ({ items: db.all("SELECT v.*, u.name, r.slug, json_extract(r.data, '$.title') AS title FROM reviews v JOIN users u ON u.id = v.user_id JOIN routes r ON r.id = v.route_id WHERE v.user_id = ? ORDER BY v.created_at DESC", ctx.user.id).map((v) => reviewOut(v, ctx.user)) }));
  add('DELETE', '/api/me', { auth: true }, async (ctx) => {
    const pass = String((ctx.body || {}).password || '');
    const u = db.get('SELECT password_hash, role FROM users WHERE id = ?', ctx.user.id);
    if (!(await auth.verifyPassword(pass, u.password_hash))) throw invalid({ password: 'Пароль указан неверно' });
    if (u.role === 'admin' && db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").n <= 1) throw new HttpError(400, 'last_admin', 'Нельзя удалить единственного администратора');
    db.run('DELETE FROM users WHERE id = ?', ctx.user.id);
    ctx.setCookie(auth.clearCookie(secureCookies));
    return { ok: true };
  });

  /* ---------- Администрирование ---------- */

  const A = { auth: true, admin: true };
  add('GET', '/api/admin/stats', A, () => {
    const n = (sql) => db.get(sql).n;
    const needs = {};
    db.all("SELECT j.value AS c, COUNT(*) AS n FROM users u, json_each(u.needs) j GROUP BY j.value").forEach((r) => { needs[r.c] = r.n; });
    return {
      users: n('SELECT COUNT(*) AS n FROM users'), routes: n("SELECT COUNT(*) AS n FROM routes WHERE status = 'published'"),
      hiddenRoutes: n("SELECT COUNT(*) AS n FROM routes WHERE status = 'hidden'"), reviews: n('SELECT COUNT(*) AS n FROM reviews'),
      newReports: n("SELECT COUNT(*) AS n FROM access_reports WHERE status IN ('new','progress')"), newFeedback: n("SELECT COUNT(*) AS n FROM feedback WHERE status = 'new'"),
      plans: n('SELECT COUNT(*) AS n FROM plans'), favorites: n('SELECT COUNT(*) AS n FROM favorites'), needs,
      topRoutes: db.all("SELECT r.slug, json_extract(r.data, '$.title') AS title, COUNT(f.user_id) AS n FROM routes r JOIN favorites f ON f.route_id = r.id GROUP BY r.id ORDER BY n DESC LIMIT 5")
    };
  });
  add('GET', '/api/admin/routes', A, () => ({ items: listRoutes(parseFilters(new URLSearchParams()), true).map(logic.toCard) }));
  add('POST', '/api/admin/routes', A, (ctx) => {
    const v = check('route', ctx.body);
    if (db.get('SELECT id FROM routes WHERE slug = ?', v.slug)) throw invalid({ slug: 'Маршрут с таким адресом уже существует' });
    db.tx(() => saveRoute(db, v, kb));
    audit(ctx, 'create', 'route', v.slug);
    return { ok: true, slug: v.slug, status: 201 };
  });
  add('PUT', '/api/admin/routes/:slug', A, (ctx, { slug }) => {
    const id = routeIdBySlug(slug, true);
    const v = check('route', ctx.body);
    const other = db.get('SELECT id FROM routes WHERE slug = ? AND id <> ?', v.slug, id);
    if (other) throw invalid({ slug: 'Маршрут с таким адресом уже существует' });
    db.tx(() => saveRoute(db, v, kb, id));
    audit(ctx, 'update', 'route', v.slug);
    return { ok: true, slug: v.slug };
  });
  add('PATCH', '/api/admin/routes/:slug', A, (ctx, { slug }) => {
    const id = routeIdBySlug(slug, true);
    const status = (ctx.body || {}).status;
    if (!['published', 'hidden'].includes(status)) throw invalid({ status: 'Выберите значение из списка' });
    db.run("UPDATE routes SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id);
    audit(ctx, 'status', 'route', slug, { status });
    return { ok: true };
  });
  add('DELETE', '/api/admin/routes/:slug', A, (ctx, { slug }) => { const id = routeIdBySlug(slug, true); db.run('DELETE FROM routes WHERE id = ?', id); audit(ctx, 'delete', 'route', slug); return { ok: true }; });
  add('GET', '/api/admin/reviews', A, () => ({ items: db.all("SELECT v.*, u.name, r.slug, json_extract(r.data, '$.title') AS title FROM reviews v JOIN users u ON u.id = v.user_id JOIN routes r ON r.id = v.route_id ORDER BY v.created_at DESC LIMIT 200").map((v) => reviewOut(v)) }));
  add('PATCH', '/api/admin/reviews/:id', A, (ctx, { id }) => {
    const status = (ctx.body || {}).status;
    if (!['published', 'hidden'].includes(status)) throw invalid({ status: 'Выберите значение из списка' });
    if (!db.run('UPDATE reviews SET status = ? WHERE id = ?', status, Number(id)).changes) throw notFound('Отзыв не найден');
    audit(ctx, 'moderate', 'review', id, { status });
    return { ok: true };
  });
  add('GET', '/api/admin/reports', A, () => ({ items: db.all(`SELECT a.*, r.slug, json_extract(r.data, '$.title') AS title, u.name AS user_name FROM access_reports a JOIN routes r ON r.id = a.route_id LEFT JOIN users u ON u.id = a.user_id ORDER BY a.status = 'new' DESC, a.created_at DESC LIMIT 300`)
    .map((a) => ({ id: a.id, routeSlug: a.slug, routeTitle: a.title, category: a.category, text: a.text, contact: a.contact, status: a.status, resolution: a.resolution, author: a.user_name || 'Гость', createdAt: a.created_at })) }));
  add('PATCH', '/api/admin/reports/:id', A, (ctx, { id }) => {
    const b = ctx.body || {};
    if (!dict.REPORT_STATUS[b.status]) throw invalid({ status: 'Выберите значение из списка' });
    const resolution = String(b.resolution || '').slice(0, 1000);
    if (!db.run("UPDATE access_reports SET status = ?, resolution = ?, updated_at = datetime('now') WHERE id = ?", b.status, resolution, Number(id)).changes) throw notFound('Сообщение не найдено');
    audit(ctx, 'status', 'report', id, { status: b.status });
    return { ok: true };
  });
  add('GET', '/api/admin/feedback', A, () => ({ items: db.all('SELECT * FROM feedback ORDER BY status = \'new\' DESC, created_at DESC LIMIT 300').map((f) => ({ id: f.id, topic: f.topic, message: f.message, name: f.name, email: f.email, page: f.page, status: f.status, createdAt: f.created_at })) }));
  add('PATCH', '/api/admin/feedback/:id', A, (ctx, { id }) => {
    const status = (ctx.body || {}).status;
    if (!['new', 'resolved'].includes(status)) throw invalid({ status: 'Выберите значение из списка' });
    if (!db.run('UPDATE feedback SET status = ? WHERE id = ?', status, Number(id)).changes) throw notFound('Сообщение не найдено');
    return { ok: true };
  });
  add('GET', '/api/admin/users', A, () => ({ items: db.all(`SELECT u.id, u.email, u.name, u.role, u.needs, u.created_at, u.last_login_at,
    (SELECT COUNT(*) FROM reviews v WHERE v.user_id = u.id) AS reviews FROM users u ORDER BY u.created_at DESC LIMIT 500`)
    .map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, needs: parse(u.needs, []), createdAt: u.created_at, lastLoginAt: u.last_login_at, reviews: u.reviews })) }));
  add('PATCH', '/api/admin/users/:id', A, (ctx, { id }) => {
    const role = (ctx.body || {}).role;
    if (!['user', 'admin'].includes(role)) throw invalid({ role: 'Выберите значение из списка' });
    if (Number(id) === ctx.user.id) throw new HttpError(400, 'self', 'Нельзя изменить собственную роль');
    if (!db.run('UPDATE users SET role = ? WHERE id = ?', role, Number(id)).changes) throw notFound('Пользователь не найден');
    audit(ctx, 'role', 'user', id, { role });
    return { ok: true };
  });
  add('GET', '/api/admin/alerts', A, () => ({ items: db.all('SELECT * FROM alerts ORDER BY id DESC') }));
  add('POST', '/api/admin/alerts', A, (ctx) => {
    const v = check('alert', ctx.body);
    const id = Number(db.run('INSERT INTO alerts (text, level, link, until) VALUES (?,?,?,?)', v.text, v.level, v.link || '', v.until).lastInsertRowid);
    audit(ctx, 'create', 'alert', id);
    return { ok: true, id, status: 201 };
  });
  add('DELETE', '/api/admin/alerts/:id', A, (ctx, { id }) => { db.run('DELETE FROM alerts WHERE id = ?', Number(id)); audit(ctx, 'delete', 'alert', id); return { ok: true }; });
  add('GET', '/api/admin/audit', A, () => ({ items: db.all('SELECT a.*, u.name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200') }));

  /** Диспетчер: находит обработчик, проверяет права, превращает исключения в ответы */
  return async function handle(ctx) {
    const pathname = ctx.url.pathname.replace(/\/+$/, '') || '/';
    let allowed = false;
    for (const r of table) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      allowed = true;
      if (r.method !== ctx.method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      if (r.opts.auth && !ctx.user) throw new HttpError(401, 'unauthorized', 'Войдите, чтобы продолжить');
      if (r.opts.admin && ctx.user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Недостаточно прав');
      return r.handler(ctx, params);
    }
    if (allowed) throw new HttpError(405, 'method_not_allowed', 'Метод не поддерживается');
    throw notFound('Метод API не найден');
  };
}

module.exports = { createApi, HttpError };

/**
 * Доступ к данным. Два адаптера с одинаковым набором методов REST API:
 *  - RemoteAdapter — запросы к серверу Node.js (server/api.js), сессия в HttpOnly-cookie;
 *  - LocalAdapter — автономный демо-режим (GitHub Pages, файл с диска, встраивание):
 *    те же эндпоинты, та же валидация (TROPY.logic.validate), данные — в localStorage браузера.
 * Режим выбирается автоматически: если /api/health отвечает — работаем с сервером.
 */
(function () {
  'use strict';
  var App = window.App, L = App.L, D = App.D, T = App.T;

  function ApiError(status, code, message, fields) {
    var e = new Error(message);
    e.status = status; e.code = code; e.fields = fields || null;
    return e;
  }
  function qs(query) {
    if (!query) return '';
    var p = new URLSearchParams();
    Object.keys(query).forEach(function (k) { var v = query[k]; if (Array.isArray(v)) v = v.join(','); if (v !== '' && v != null && v !== false) p.set(k, v === true ? '1' : v); });
    var s = p.toString();
    return s ? '?' + s : '';
  }
  function filenameFrom(res, def) {
    var m = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '');
    return m ? m[1] : def;
  }

  /* =================== Сервер =================== */

  var remote = {
    request: async function (method, path, body, opts) {
      var headers = { 'X-Requested-With': 'fetch', Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      var res;
      try {
        res = await fetch('api/' + path, { method: method, headers: headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
      } catch (e) {
        throw ApiError(0, 'network', 'Нет связи с сервером. Проверьте подключение к интернету и попробуйте ещё раз.');
      }
      if (opts && opts.raw && res.ok) return { blob: await res.blob(), filename: filenameFrom(res, 'file') };
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok) {
        var er = (data && data.error) || {};
        throw ApiError(res.status, er.code || 'error', er.message || ('Ошибка сервера (' + res.status + ')'), er.fields);
      }
      return data;
    }
  };

  /* =================== Автономный режим =================== */

  var DB_KEY = 'tropy.db.v1', SID_KEY = 'tropy.local.sid';
  var now = function () { return new Date().toISOString().slice(0, 19).replace('T', ' '); };
  var today = function () { return L.isoDate(new Date()); };
  var clone = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };

  /* --- Хеширование паролей: PBKDF2 (WebCrypto) или итерационный SHA-256 на чистом JS, если WebCrypto недоступен --- */
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256Hex(str) {
    var bytes = new TextEncoder().encode(str), l = bytes.length;
    var size = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(size);
    m.set(bytes); m[l] = 0x80;
    var dv = new DataView(m.buffer);
    dv.setUint32(size - 4, (l * 8) >>> 0); dv.setUint32(size - 8, Math.floor(l / 0x20000000));
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Int32Array(64);
    var rot = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (var off = 0; off < size; off += 64) {
      var i;
      for (i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
        var t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  App.sha256Hex = sha256Hex;
  function randomHex(n) {
    var a = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
    return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  var subtle = window.crypto && window.crypto.subtle;
  async function derive(password, salt, algo, iter) {
    if (algo === 'pbkdf2') {
      var key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      var bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iter }, key, 256);
      return Array.prototype.map.call(new Uint8Array(bits), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }
    var hsh = sha256Hex(salt + ':' + password);
    for (var i = 0; i < iter; i++) hsh = sha256Hex(hsh + password);
    return hsh;
  }
  async function hashPassword(password) {
    var salt = randomHex(16);
    var algo = subtle ? 'pbkdf2' : 'sha256i', iter = subtle ? 120000 : 3000;
    return algo + '$' + iter + '$' + salt + '$' + await derive(password, salt, algo, iter);
  }
  async function verifyPassword(password, stored) {
    var p = String(stored || '').split('$');
    if (p.length !== 4) return false;
    if (p[0] === 'pbkdf2' && !subtle) return false;
    var got = await derive(password, p[2], p[0], Number(p[1]));
    var diff = got.length ^ p[3].length;
    for (var i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ p[3].charCodeAt(i % p[3].length);
    return diff === 0;
  }

  /* --- Хранилище демо-базы --- */
  var db = null;
  function save() { App.store.set(DB_KEY, db); }
  async function seedDb() {
    db = {
      version: 1, seq: { user: 2, review: 0, report: 0, feedback: 0, plan: 0, gear: 0, alert: 2, audit: 0 },
      users: [
        { id: 1, email: 'admin@tropy.local', name: 'Администратор', role: 'admin', needs: [], companion: false, settings: {}, pass: await hashPassword('Tropy-Admin-2026'), createdAt: now(), lastLoginAt: null },
        { id: 2, email: 'demo@tropy.local', name: 'Демо-пользователь', role: 'user', needs: ['S'], companion: false, settings: {}, pass: await hashPassword('Demo-2026'), createdAt: now(), lastLoginAt: null }
      ],
      routes: null, // копия каталога появляется после первой правки администратором
      reviews: [], favorites: [], completions: [], plans: [], gearLists: [], reports: [], feedback: [], audit: [],
      alerts: [
        { id: 1, text: 'С 1 декабря 2025 года в национальном парке «Красноярские Столбы» гулять можно только по утверждённым маршрутам.', level: 'warning', link: 'https://kras-stolby.ru/', until: null },
        { id: 2, text: 'Печоро-Илычский заповедник принимает заявки на посещение плато Маньпупунёр зимой 2027 года с 1 ноября 2026 года.', level: 'info', link: 'https://pechora-reserve.ru/', until: null }
      ]
    };
    save();
  }
  function allRoutes() { return db.routes || T.routes.map(function (r) { return Object.assign({ status: 'published' }, r); }); }
  function ensureOwnRoutes() { if (!db.routes) db.routes = clone(allRoutes()); return db.routes; }
  function withRating(r) {
    var list = db.reviews.filter(function (v) { return v.routeSlug === r.slug && v.status === 'published'; });
    var out = Object.assign({}, r);
    out.status = r.status || 'published';
    out.reviewsCount = list.length;
    out.rating = list.length ? Math.round(list.reduce(function (s, v) { return s + v.rating; }, 0) / list.length * 10) / 10 : null;
    return out;
  }
  function findRoute(slug, allowHidden) {
    var r = allRoutes().find(function (x) { return x.slug === slug; });
    if (!r || (!allowHidden && r.status === 'hidden')) throw ApiError(404, 'not_found', 'Маршрут не найден');
    return r;
  }
  function kb() { return T.restrictions || []; }

  /* --- Сессия демо-режима: «запомнить меня» — localStorage на 30 дней, иначе — до закрытия вкладки --- */
  function currentUser() {
    var s = App.session.get(SID_KEY, null) || App.store.get(SID_KEY, null);
    if (!s || (s.exp && s.exp < Date.now())) return null;
    return db.users.find(function (u) { return u.id === s.uid; }) || null;
  }
  function setSession(uid, remember) {
    App.session.remove(SID_KEY); App.store.remove(SID_KEY);
    if (remember) App.store.set(SID_KEY, { uid: uid, exp: Date.now() + 30 * 864e5 });
    else App.session.set(SID_KEY, { uid: uid });
  }
  function clearSession() { App.session.remove(SID_KEY); App.store.remove(SID_KEY); }

  function check(schema, body) {
    var r = L.validate(schema, body || {});
    if (!r.ok) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', r.errors);
    return r.value;
  }
  var attempts = {};
  function limit(key, n, windowMs) {
    var t = Date.now(), a = (attempts[key] || []).filter(function (x) { return t - x < windowMs; });
    if (a.length >= n) throw ApiError(429, 'rate_limited', 'Слишком много попыток. Подождите несколько минут и попробуйте снова.');
    a.push(t); attempts[key] = a;
  }
  function audit(user, action, entity, id, details) {
    db.seq.audit += 1;
    db.audit.unshift({ id: db.seq.audit, user_id: user.id, name: user.name, action: action, entity: entity, entity_id: String(id), details: details ? JSON.stringify(details) : null, created_at: now() });
    db.audit = db.audit.slice(0, 200);
  }

  var publicUser = function (u) { return { id: u.id, email: u.email, name: u.name, role: u.role, needs: u.needs || [], companion: !!u.companion, settings: u.settings || {}, createdAt: u.createdAt }; };
  function mePayload(u) {
    if (!u) return { user: null };
    return {
      user: publicUser(u),
      favorites: db.favorites.filter(function (f) { return f.userId === u.id; }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).map(function (f) { return f.slug; }),
      completed: db.completions.filter(function (c) { return c.userId === u.id; }).sort(function (a, b) { return b.doneAt.localeCompare(a.doneAt); }).map(function (c) { return { slug: c.slug, doneAt: c.doneAt }; })
    };
  }
  function userName(id) { var u = db.users.find(function (x) { return x.id === id; }); return u ? u.name : 'Пользователь удалён'; }
  function routeTitle(slug) { var r = allRoutes().find(function (x) { return x.slug === slug; }); return r ? r.title : slug; }
  function reviewOut(v, me) {
    return { id: v.id, routeSlug: v.routeSlug, routeTitle: routeTitle(v.routeSlug), rating: v.rating, accessMatch: v.accessMatch, needs: v.needs, text: v.text, visitedAt: v.visitedAt, createdAt: v.createdAt, author: userName(v.userId), status: v.status, own: !!me && me.id === v.userId };
  }
  function planOut(p) { var o = clone(p); o.routeTitle = routeTitle(p.routeSlug); delete o.userId; return o; }
  function gearOut(g) { var o = clone(g); delete o.userId; return o; }
  function ownPlan(u, id) { var p = db.plans.find(function (x) { return x.id === Number(id) && x.userId === u.id; }); if (!p) throw ApiError(404, 'not_found', 'План не найден'); return p; }
  function ownGear(u, id) { var g = db.gearLists.find(function (x) { return x.id === Number(id) && x.userId === u.id; }); if (!g) throw ApiError(404, 'not_found', 'Список не найден'); return g; }

  /** Те же правила разбора фильтров, что и на сервере (server/api.js → parseFilters) */
  function parseFilters(q) {
    var list = function (k, allowed) { return (q.get(k) || '').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return allowed.indexOf(s) !== -1; }); };
    return {
      q: (q.get('q') || '').slice(0, 100), needs: list('need', ['K', 'O', 'S', 'G', 'U']), companion: q.get('companion') === '1',
      diff: (q.get('diff') || '').split(',').map(Number).filter(function (n) { return n >= 1 && n <= 5; }),
      lenMax: Math.max(0, Number(q.get('lenMax')) || 0), days: ['one', 'multi'].indexOf(q.get('days')) !== -1 ? q.get('days') : '',
      district: D.DISTRICT_BY_CODE[q.get('district')] ? q.get('district') : '', region: D.REGION_BY_CODE[q.get('region')] ? q.get('region') : '',
      month: Math.min(12, Math.max(0, parseInt(q.get('month'), 10) || 0)), land: list('land', Object.keys(D.LANDSCAPES)),
      feat: list('feat', Object.keys(D.FEATURES)), noPermit: q.get('noPermit') === '1', sort: q.get('sort') || ''
    };
  }
  function listRoutes(f, includeHidden) {
    var src = allRoutes().filter(function (r) { return includeHidden || r.status !== 'hidden'; }).map(withRating);
    var list = L.filterRoutes(src.map(function (r) { return includeHidden ? Object.assign({}, r, { status: 'published', _status: r.status }) : r; }), f, kb());
    if (includeHidden) list = list.map(function (r) { var o = Object.assign({}, r, { status: r._status }); delete o._status; return o; });
    return L.sortRoutes(list, ['diff-desc', 'len-asc', 'len-desc', 'rating', 'name'].indexOf(f.sort) !== -1 ? f.sort : 'diff-asc');
  }

  var table = [];
  function add(method, pattern, opts, handler) {
    var keys = [];
    var re = new RegExp('^' + pattern.replace(/:(\w+)/g, function (_, k) { keys.push(k); return '([^/]+)'; }) + '$');
    table.push({ method: method, re: re, keys: keys, opts: opts, handler: handler });
  }
  var A = { auth: true, admin: true }, U = { auth: true };

  add('GET', 'health', {}, function () { return { ok: true, mode: 'local', version: '1.0.0', time: new Date().toISOString(), demo: { user: true, admin: true } }; });
  add('GET', 'alerts', {}, function () { var t = today(); return { items: db.alerts.filter(function (a) { return !a.until || a.until >= t; }).sort(function (a, b) { return b.id - a.id; }) }; });
  add('GET', 'restrictions', {}, function () {
    var pub = allRoutes().filter(function (r) { return r.status !== 'hidden'; });
    return { items: kb().slice().sort(function (a, b) { return b.level - a.level || a.code.localeCompare(b.code); }).map(function (k) {
      var o = clone(k); o.routes = pub.filter(function (r) { return (r.restrictions || []).some(function (x) { return x[0] === k.code; }); }).map(function (r) { return r.slug; }); return o;
    }) };
  });
  add('GET', 'routes', {}, function (ctx) { var items = listRoutes(parseFilters(ctx.query), false).map(L.toCard); return { items: items, total: items.length }; });
  add('GET', 'routes/:slug', {}, function (ctx, p) {
    var r = findRoute(p.slug, ctx.user && ctx.user.role === 'admin');
    var t = (T.tracks || {})[p.slug];
    var reviews = db.reviews.filter(function (v) { return v.routeSlug === p.slug && v.status === 'published'; }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).map(function (v) { return reviewOut(v, ctx.user); });
    var me = null;
    if (ctx.user) {
      var c = db.completions.find(function (x) { return x.userId === ctx.user.id && x.slug === p.slug; });
      me = { favorite: db.favorites.some(function (f) { return f.userId === ctx.user.id && f.slug === p.slug; }), completed: c ? c.doneAt : null };
    }
    return { route: withRating(r), track: t ? { src: t.src, pts: t.pts, prof: t.prof } : null, reviews: reviews, me: me };
  });
  add('GET', 'routes/:slug/gpx', {}, function (ctx, p) { var r = findRoute(p.slug); return { raw: L.toGPX(r, (T.tracks || {})[p.slug]), type: 'application/gpx+xml', filename: p.slug + '.gpx' }; });
  add('GET', 'open-data', {}, function () { return { license: 'Тексты — CC BY 4.0 «Тропы без барьеров»; треки — © участники OpenStreetMap, ODbL', generatedAt: new Date().toISOString(), items: listRoutes(parseFilters(new URLSearchParams()), false) }; });

  add('POST', 'routes/:slug/reviews', U, function (ctx, p) {
    var v = check('review', ctx.body); findRoute(p.slug);
    var ex = db.reviews.find(function (x) { return x.routeSlug === p.slug && x.userId === ctx.user.id; });
    if (ex) Object.assign(ex, { rating: v.rating, accessMatch: v.accessMatch, needs: v.needs, text: v.text, visitedAt: v.visitedAt, status: 'published', updatedAt: now() });
    else { db.seq.review += 1; db.reviews.push({ id: db.seq.review, routeSlug: p.slug, userId: ctx.user.id, rating: v.rating, accessMatch: v.accessMatch, needs: v.needs, text: v.text, visitedAt: v.visitedAt, status: 'published', createdAt: now() }); }
    return { ok: true };
  });
  add('DELETE', 'reviews/:id', U, function (ctx, p) {
    var i = db.reviews.findIndex(function (x) { return x.id === Number(p.id); });
    if (i === -1) throw ApiError(404, 'not_found', 'Отзыв не найден');
    if (db.reviews[i].userId !== ctx.user.id && ctx.user.role !== 'admin') throw ApiError(403, 'forbidden', 'Можно удалить только свой отзыв');
    if (db.reviews[i].userId !== ctx.user.id) audit(ctx.user, 'delete', 'review', p.id);
    db.reviews.splice(i, 1);
    return { ok: true };
  });
  add('POST', 'routes/:slug/reports', {}, function (ctx, p) {
    limit('report', 10, 3600e3);
    if (ctx.body && ctx.body.website) return { ok: true };
    var v = check('report', ctx.body); findRoute(p.slug);
    db.seq.report += 1;
    db.reports.push({ id: db.seq.report, routeSlug: p.slug, userId: ctx.user ? ctx.user.id : null, category: v.category, text: v.text, contact: v.contact, status: 'new', resolution: '', createdAt: now() });
    return { ok: true };
  });
  add('POST', 'feedback', {}, function (ctx) {
    limit('feedback', 10, 3600e3);
    if (ctx.body && ctx.body.website) return { ok: true };
    var v = check('feedback', ctx.body);
    db.seq.feedback += 1;
    db.feedback.push({ id: db.seq.feedback, userId: ctx.user ? ctx.user.id : null, topic: v.topic, message: v.message, name: v.name, email: v.email || '', page: v.page, status: 'new', createdAt: now() });
    return { ok: true };
  });

  add('PUT', 'favorites/:slug', U, function (ctx, p) { findRoute(p.slug); if (!db.favorites.some(function (f) { return f.userId === ctx.user.id && f.slug === p.slug; })) db.favorites.push({ userId: ctx.user.id, slug: p.slug, createdAt: now() }); return { ok: true, favorite: true }; });
  add('DELETE', 'favorites/:slug', U, function (ctx, p) { db.favorites = db.favorites.filter(function (f) { return !(f.userId === ctx.user.id && f.slug === p.slug); }); return { ok: true, favorite: false }; });
  add('PUT', 'completions/:slug', U, function (ctx, p) {
    findRoute(p.slug);
    var date = /^\d{4}-\d{2}-\d{2}$/.test((ctx.body || {}).date) ? ctx.body.date : today();
    db.completions = db.completions.filter(function (c) { return !(c.userId === ctx.user.id && c.slug === p.slug); });
    db.completions.push({ userId: ctx.user.id, slug: p.slug, doneAt: date });
    return { ok: true, completed: date };
  });
  add('DELETE', 'completions/:slug', U, function (ctx, p) { db.completions = db.completions.filter(function (c) { return !(c.userId === ctx.user.id && c.slug === p.slug); }); return { ok: true, completed: null }; });

  function planValues(body) {
    var v = check('plan', body);
    var r = findRoute(v.routeSlug);
    if (!v.tasks.length) v.tasks = L.planTasks(r, v, kb());
    return v;
  }
  add('GET', 'plans', U, function (ctx) { return { items: db.plans.filter(function (p) { return p.userId === ctx.user.id; }).sort(function (a, b) { return a.startDate.localeCompare(b.startDate); }).map(planOut) }; });
  add('GET', 'plans/:id', U, function (ctx, p) { return { plan: planOut(ownPlan(ctx.user, p.id)) }; });
  add('POST', 'plans', U, function (ctx) {
    if (db.plans.filter(function (p) { return p.userId === ctx.user.id; }).length >= 50) throw ApiError(400, 'limit', 'Можно сохранить не больше 50 планов');
    var v = planValues(ctx.body);
    db.seq.plan += 1;
    var plan = Object.assign({ id: db.seq.plan, userId: ctx.user.id }, v, { createdAt: now(), updatedAt: now() });
    db.plans.push(plan);
    return { plan: planOut(plan) };
  });
  add('PUT', 'plans/:id', U, function (ctx, p) { var plan = ownPlan(ctx.user, p.id); Object.assign(plan, planValues(ctx.body), { updatedAt: now() }); return { plan: planOut(plan) }; });
  add('DELETE', 'plans/:id', U, function (ctx, p) { ownPlan(ctx.user, p.id); db.plans = db.plans.filter(function (x) { return x.id !== Number(p.id); }); return { ok: true }; });

  add('GET', 'gear-lists', U, function (ctx) { return { items: db.gearLists.filter(function (g) { return g.userId === ctx.user.id; }).sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); }).map(gearOut) }; });
  add('POST', 'gear-lists', U, function (ctx) {
    if (db.gearLists.filter(function (g) { return g.userId === ctx.user.id; }).length >= 50) throw ApiError(400, 'limit', 'Можно сохранить не больше 50 списков');
    var v = check('gearList', ctx.body);
    db.seq.gear += 1;
    var g = { id: db.seq.gear, userId: ctx.user.id, title: v.title, routeSlug: v.routeSlug || '', params: v.params || {}, items: v.items, createdAt: now(), updatedAt: now() };
    db.gearLists.push(g);
    return { list: gearOut(g) };
  });
  add('PUT', 'gear-lists/:id', U, function (ctx, p) { var g = ownGear(ctx.user, p.id), v = check('gearList', ctx.body); Object.assign(g, { title: v.title, routeSlug: v.routeSlug || '', params: v.params || {}, items: v.items, updatedAt: now() }); return { list: gearOut(g) }; });
  add('DELETE', 'gear-lists/:id', U, function (ctx, p) { ownGear(ctx.user, p.id); db.gearLists = db.gearLists.filter(function (g) { return g.id !== Number(p.id); }); return { ok: true }; });

  add('POST', 'auth/register', {}, async function (ctx) {
    limit('register', 10, 3600e3);
    var v = check('register', ctx.body);
    if (db.users.some(function (u) { return u.email === v.email; })) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { email: 'Этот адрес уже зарегистрирован. Войдите или укажите другой адрес' });
    db.seq.user += 1;
    var u = { id: db.seq.user, email: v.email, name: v.name, role: 'user', needs: v.needs, companion: false, settings: {}, pass: await hashPassword(v.password), createdAt: now(), lastLoginAt: now(), consentAt: now() };
    db.users.push(u);
    setSession(u.id, true);
    return mePayload(u);
  });
  add('POST', 'auth/login', {}, async function (ctx) {
    limit('login', 20, 15 * 60e3);
    var v = check('login', ctx.body);
    limit('login:' + v.email, 8, 15 * 60e3);
    var u = db.users.find(function (x) { return x.email === v.email; });
    var ok = u ? await verifyPassword(v.password, u.pass) : (await derive(v.password, 'x', subtle ? 'pbkdf2' : 'sha256i', subtle ? 120000 : 3000), false);
    if (!ok) throw ApiError(401, 'bad_credentials', 'Неверный адрес почты или пароль');
    u.lastLoginAt = now();
    setSession(u.id, v.remember);
    return mePayload(u);
  });
  add('POST', 'auth/logout', {}, function () { clearSession(); return { ok: true }; });
  add('GET', 'auth/me', {}, function (ctx) { return mePayload(ctx.user); });
  add('PATCH', 'me', U, function (ctx) {
    var v = check('profile', Object.assign({ name: ctx.user.name }, ctx.body));
    Object.assign(ctx.user, { name: v.name, needs: v.needs, companion: !!v.companion, settings: v.settings || ctx.user.settings || {} });
    return mePayload(ctx.user);
  });
  add('POST', 'me/password', U, async function (ctx) {
    limit('password', 10, 3600e3);
    var v = check('password', ctx.body);
    if (!(await verifyPassword(v.current, ctx.user.pass))) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { current: 'Текущий пароль указан неверно' });
    ctx.user.pass = await hashPassword(v.next);
    return { ok: true };
  });
  add('GET', 'me/export', U, function (ctx) {
    var id = ctx.user.id, me = mePayload(ctx.user);
    var data = {
      exportedAt: new Date().toISOString(), user: publicUser(ctx.user), favorites: me.favorites, completed: me.completed,
      reviews: db.reviews.filter(function (v) { return v.userId === id; }).map(function (v) { return reviewOut(v, ctx.user); }),
      plans: db.plans.filter(function (p) { return p.userId === id; }).map(planOut),
      gearLists: db.gearLists.filter(function (g) { return g.userId === id; }).map(gearOut)
    };
    return { raw: JSON.stringify(data, null, 2), type: 'application/json', filename: 'tropy-my-data.json' };
  });
  add('GET', 'me/reviews', U, function (ctx) { return { items: db.reviews.filter(function (v) { return v.userId === ctx.user.id; }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).map(function (v) { return reviewOut(v, ctx.user); }) }; });
  add('DELETE', 'me', U, async function (ctx) {
    if (!(await verifyPassword(String((ctx.body || {}).password || ''), ctx.user.pass))) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { password: 'Пароль указан неверно' });
    if (ctx.user.role === 'admin' && db.users.filter(function (u) { return u.role === 'admin'; }).length <= 1) throw ApiError(400, 'last_admin', 'Нельзя удалить единственного администратора');
    var id = ctx.user.id;
    db.users = db.users.filter(function (u) { return u.id !== id; });
    ['reviews', 'favorites', 'completions', 'plans', 'gearLists'].forEach(function (k) { db[k] = db[k].filter(function (x) { return x.userId !== id; }); });
    db.reports.forEach(function (r) { if (r.userId === id) r.userId = null; });
    db.feedback.forEach(function (f) { if (f.userId === id) f.userId = null; });
    clearSession();
    return { ok: true };
  });

  add('GET', 'admin/stats', A, function () {
    var needs = {};
    db.users.forEach(function (u) { (u.needs || []).forEach(function (c) { needs[c] = (needs[c] || 0) + 1; }); });
    var fav = {};
    db.favorites.forEach(function (f) { fav[f.slug] = (fav[f.slug] || 0) + 1; });
    var all = allRoutes();
    return {
      users: db.users.length, routes: all.filter(function (r) { return r.status !== 'hidden'; }).length, hiddenRoutes: all.filter(function (r) { return r.status === 'hidden'; }).length,
      reviews: db.reviews.length, newReports: db.reports.filter(function (r) { return r.status === 'new' || r.status === 'progress'; }).length,
      newFeedback: db.feedback.filter(function (f) { return f.status === 'new'; }).length, plans: db.plans.length, favorites: db.favorites.length, needs: needs,
      topRoutes: Object.keys(fav).sort(function (a, b) { return fav[b] - fav[a]; }).slice(0, 5).map(function (s) { return { slug: s, title: routeTitle(s), n: fav[s] }; })
    };
  });
  add('GET', 'admin/routes', A, function () { return { items: listRoutes(parseFilters(new URLSearchParams()), true).map(L.toCard) }; });
  add('POST', 'admin/routes', A, function (ctx) {
    var v = check('route', ctx.body);
    if (allRoutes().some(function (r) { return r.slug === v.slug; })) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { slug: 'Маршрут с таким адресом уже существует' });
    ensureOwnRoutes().push(v);
    audit(ctx.user, 'create', 'route', v.slug);
    return { ok: true, slug: v.slug };
  });
  add('PUT', 'admin/routes/:slug', A, function (ctx, p) {
    findRoute(p.slug, true);
    var v = check('route', ctx.body);
    var list = ensureOwnRoutes();
    if (list.some(function (r) { return r.slug === v.slug && r.slug !== p.slug; })) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { slug: 'Маршрут с таким адресом уже существует' });
    var i = list.findIndex(function (r) { return r.slug === p.slug; });
    list[i] = v;
    if (v.slug !== p.slug) {
      ['reviews', 'plans', 'reports'].forEach(function (k) { db[k].forEach(function (x) { if (x.routeSlug === p.slug) x.routeSlug = v.slug; }); });
      ['favorites', 'completions'].forEach(function (k) { db[k].forEach(function (x) { if (x.slug === p.slug) x.slug = v.slug; }); });
    }
    audit(ctx.user, 'update', 'route', v.slug);
    return { ok: true, slug: v.slug };
  });
  add('PATCH', 'admin/routes/:slug', A, function (ctx, p) {
    findRoute(p.slug, true);
    var status = (ctx.body || {}).status;
    if (['published', 'hidden'].indexOf(status) === -1) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { status: 'Выберите значение из списка' });
    ensureOwnRoutes().find(function (r) { return r.slug === p.slug; }).status = status;
    audit(ctx.user, 'status', 'route', p.slug, { status: status });
    return { ok: true };
  });
  add('DELETE', 'admin/routes/:slug', A, function (ctx, p) {
    findRoute(p.slug, true);
    db.routes = ensureOwnRoutes().filter(function (r) { return r.slug !== p.slug; });
    ['reviews', 'plans', 'reports'].forEach(function (k) { db[k] = db[k].filter(function (x) { return x.routeSlug !== p.slug; }); });
    ['favorites', 'completions'].forEach(function (k) { db[k] = db[k].filter(function (x) { return x.slug !== p.slug; }); });
    audit(ctx.user, 'delete', 'route', p.slug);
    return { ok: true };
  });
  add('GET', 'admin/reviews', A, function () { return { items: db.reviews.slice().sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).map(function (v) { return reviewOut(v); }) }; });
  add('PATCH', 'admin/reviews/:id', A, function (ctx, p) {
    var status = (ctx.body || {}).status, v = db.reviews.find(function (x) { return x.id === Number(p.id); });
    if (['published', 'hidden'].indexOf(status) === -1) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { status: 'Выберите значение из списка' });
    if (!v) throw ApiError(404, 'not_found', 'Отзыв не найден');
    v.status = status; audit(ctx.user, 'moderate', 'review', p.id, { status: status });
    return { ok: true };
  });
  add('GET', 'admin/reports', A, function () {
    return { items: db.reports.slice().sort(function (a, b) { return (b.status === 'new') - (a.status === 'new') || b.createdAt.localeCompare(a.createdAt); }).map(function (a) {
      return { id: a.id, routeSlug: a.routeSlug, routeTitle: routeTitle(a.routeSlug), category: a.category, text: a.text, contact: a.contact, status: a.status, resolution: a.resolution, author: a.userId ? userName(a.userId) : 'Гость', createdAt: a.createdAt };
    }) };
  });
  add('PATCH', 'admin/reports/:id', A, function (ctx, p) {
    var b = ctx.body || {}, a = db.reports.find(function (x) { return x.id === Number(p.id); });
    if (!D.REPORT_STATUS[b.status]) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { status: 'Выберите значение из списка' });
    if (!a) throw ApiError(404, 'not_found', 'Сообщение не найдено');
    a.status = b.status; a.resolution = String(b.resolution || '').slice(0, 1000);
    audit(ctx.user, 'status', 'report', p.id, { status: b.status });
    return { ok: true };
  });
  add('GET', 'admin/feedback', A, function () { return { items: db.feedback.slice().sort(function (a, b) { return (b.status === 'new') - (a.status === 'new') || b.createdAt.localeCompare(a.createdAt); }).map(function (f) { var o = clone(f); delete o.userId; return o; }) }; });
  add('PATCH', 'admin/feedback/:id', A, function (ctx, p) {
    var status = (ctx.body || {}).status, f = db.feedback.find(function (x) { return x.id === Number(p.id); });
    if (['new', 'resolved'].indexOf(status) === -1) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { status: 'Выберите значение из списка' });
    if (!f) throw ApiError(404, 'not_found', 'Сообщение не найдено');
    f.status = status;
    return { ok: true };
  });
  add('GET', 'admin/users', A, function () {
    return { items: db.users.slice().sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt) || b.id - a.id; }).map(function (u) {
      return { id: u.id, email: u.email, name: u.name, role: u.role, needs: u.needs || [], createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, reviews: db.reviews.filter(function (v) { return v.userId === u.id; }).length };
    }) };
  });
  add('PATCH', 'admin/users/:id', A, function (ctx, p) {
    var role = (ctx.body || {}).role, u = db.users.find(function (x) { return x.id === Number(p.id); });
    if (['user', 'admin'].indexOf(role) === -1) throw ApiError(422, 'validation', 'Проверьте правильность заполнения полей', { role: 'Выберите значение из списка' });
    if (Number(p.id) === ctx.user.id) throw ApiError(400, 'self', 'Нельзя изменить собственную роль');
    if (!u) throw ApiError(404, 'not_found', 'Пользователь не найден');
    u.role = role; audit(ctx.user, 'role', 'user', p.id, { role: role });
    return { ok: true };
  });
  add('GET', 'admin/alerts', A, function () { return { items: db.alerts.slice().sort(function (a, b) { return b.id - a.id; }) }; });
  add('POST', 'admin/alerts', A, function (ctx) {
    var v = check('alert', ctx.body);
    db.seq.alert += 1;
    db.alerts.push({ id: db.seq.alert, text: v.text, level: v.level, link: v.link || '', until: v.until || null });
    audit(ctx.user, 'create', 'alert', db.seq.alert);
    return { ok: true, id: db.seq.alert };
  });
  add('DELETE', 'admin/alerts/:id', A, function (ctx, p) { db.alerts = db.alerts.filter(function (a) { return a.id !== Number(p.id); }); audit(ctx.user, 'delete', 'alert', p.id); return { ok: true }; });
  add('GET', 'admin/audit', A, function () { return { items: db.audit.slice(0, 200) }; });

  var local = {
    request: async function (method, path, body, opts) {
      var qi = path.indexOf('?');
      var pathname = (qi === -1 ? path : path.slice(0, qi)).replace(/\/+$/, '');
      var ctx = { method: method, query: new URLSearchParams(qi === -1 ? '' : path.slice(qi + 1)), body: clone(body), user: currentUser() };
      var allowed = false;
      for (var i = 0; i < table.length; i++) {
        var r = table[i], m = r.re.exec(pathname);
        if (!m) continue;
        allowed = true;
        if (r.method !== method) continue;
        var params = {};
        r.keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
        if (r.opts.auth && !ctx.user) throw ApiError(401, 'unauthorized', 'Войдите, чтобы продолжить');
        if (r.opts.admin && ctx.user.role !== 'admin') throw ApiError(403, 'forbidden', 'Недостаточно прав');
        var out = await r.handler(ctx, params);
        if (method !== 'GET') save();
        if (out && out.raw !== undefined) {
          var blob = new Blob([out.raw], { type: out.type });
          return opts && opts.raw ? { blob: blob, filename: out.filename } : out;
        }
        return clone(out);
      }
      throw allowed ? ApiError(405, 'method_not_allowed', 'Метод не поддерживается') : ApiError(404, 'not_found', 'Метод API не найден');
    }
  };

  /* =================== Общий интерфейс =================== */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Не удалось загрузить ' + src)); };
      document.head.appendChild(s);
    });
  }
  async function healthy() {
    if (!/^https?:$/.test(location.protocol)) return null;
    try {
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
      var res = await fetch('api/health', { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' });
      clearTimeout(timer);
      if (!res.ok) return null;
      var j = await res.json();
      return j && j.mode === 'server' ? j : null;
    } catch (e) { return null; }
  }

  var adapter = remote;
  App.ApiError = ApiError;
  App.api = {
    mode: 'server',
    demo: { user: false, admin: false },
    init: async function () {
      var hl = window.TROPY_FORCE_LOCAL ? null : await healthy();
      if (hl) { adapter = remote; this.mode = 'server'; this.demo = hl.demo || this.demo; return this.mode; }
      this.demo = { user: true, admin: true };
      // Автономный режим: подгружаем данные каталога, если они не встроены в страницу
      var need = [['routes', 'js/data/routes.js'], ['tracks', 'js/data/tracks.js'], ['restrictions', 'js/data/restrictions.js']].filter(function (x) { return !T[x[0]]; });
      for (var i = 0; i < need.length; i++) await loadScript(need[i][1]);
      db = App.store.get(DB_KEY, null);
      if (!db || db.version !== 1) await seedDb();
      adapter = local; this.mode = 'local';
      return this.mode;
    },
    /** Сброс демо-базы (только автономный режим) */
    resetLocal: async function () { clearSession(); await seedDb(); },
    get: function (path, query) { return adapter.request('GET', path + qs(query)); },
    post: function (path, body) { return adapter.request('POST', path, body || {}); },
    put: function (path, body) { return adapter.request('PUT', path, body || {}); },
    patch: function (path, body) { return adapter.request('PATCH', path, body || {}); },
    del: function (path, body) { return adapter.request('DELETE', path, body); },
    download: async function (path, fallbackName) {
      var r = await adapter.request('GET', path, undefined, { raw: true });
      App.download(r.filename || fallbackName || 'file', r.blob);
    }
  };
})();

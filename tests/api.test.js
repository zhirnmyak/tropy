'use strict';
/**
 * Интеграционные тесты HTTP API: настоящий сервер на свободном порту, база SQLite в памяти.
 * Запуск: npm test
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, rawGet, ADMIN, DEMO, inDays } = require('./helpers.js');
const logic = require('../public/js/shared/logic.js');
const dict = require('../public/js/shared/dict.js');
const kb = require('../public/js/data/restrictions.js');
const { routes: SEED } = require('../public/js/data/routes.js');

let app;
before(async () => { app = await startServer(); });
after(async () => { await app.close(); });

describe('служебное и статика', () => {
  test('GET /api/health — сервер жив, демо-учётки включены', async () => {
    const r = await app.client().get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
    assert.equal(r.data.mode, 'server');
    assert.deepEqual(r.data.demo, { user: true, admin: true });
  });
  test('главная страница отдаётся с заголовками безопасности', async () => {
    const r = await app.client().get('/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(r.data, /<html lang="ru"/);
    const csp = r.headers.get('content-security-policy');
    assert.ok(csp && csp.includes("default-src 'self'"), 'есть Content-Security-Policy');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.ok(r.headers.get('referrer-policy'));
  });
  test('ответы API не кэшируются', async () => {
    const r = await app.client().get('/api/routes');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });
  test('обход каталогов и служебные файлы недоступны', async () => {
    for (const p of ['/../server/db.js', '/%2e%2e/server/db.js', '/js/..%2f..%2fserver%2fapi.js', '/..%5c..%5cpackage.json', '/.env', '/js/%00.js']) {
      const r = await rawGet(app.base, p);
      assert.notEqual(r.status, 200, p);
      assert.doesNotMatch(r.body, /require\(|DatabaseSync/, p);
    }
  });
  test('неизвестный путь API — 404 в формате JSON', async () => {
    const r = await app.client().get('/api/nope');
    assert.equal(r.status, 404);
    assert.ok(r.data.error && r.data.error.message);
  });
});

describe('каталог маршрутов', () => {
  test('все опубликованные маршруты', async () => {
    const r = await app.client().get('/api/routes');
    assert.equal(r.status, 200);
    assert.equal(r.data.total, SEED.length);
    const card = r.data.items[0];
    for (const k of ['slug', 'title', 'region', 'difficulty', 'lengthKm', 'access']) assert.ok(k in card, 'в карточке есть поле ' + k);
    assert.ok(!('description' in card), 'в список не попадает полный текст маршрута');
  });

  // SQL-фильтры сервера и JS-фильтры браузерной версии должны давать одинаковый результат
  const region = SEED[0].region;
  const district = dict.REGION_BY_CODE[region].district;
  const cases = [
    ['need=K', { needs: ['K'] }],
    ['need=K&companion=1', { needs: ['K'], companion: true }],
    ['need=S,G', { needs: ['S', 'G'] }],
    ['need=O,U&companion=1', { needs: ['O', 'U'], companion: true }],
    ['diff=1,2', { diff: [1, 2] }],
    ['diff=4,5', { diff: [4, 5] }],
    ['lenMax=10', { lenMax: 10 }],
    ['days=one', { days: 'one' }],
    ['days=multi', { days: 'multi' }],
    ['district=' + district, { district }],
    ['region=' + region, { region }],
    ['month=1', { month: 1 }],
    ['month=7', { month: 7 }],
    ['land=mountains,volcano', { land: ['mountains', 'volcano'] }],
    ['feat=family,transport', { feat: ['family', 'transport'] }],
    ['noPermit=1', { noPermit: true }],
    ['q=' + encodeURIComponent('байкал'), { q: 'байкал' }],
    ['q=' + encodeURIComponent('КАРЕЛИЯ'), { q: 'КАРЕЛИЯ' }],
    ['q=' + encodeURIComponent('100%_'), { q: '100%_' }],
    ['need=G&diff=1,2,3&month=6&noPermit=1', { needs: ['G'], diff: [1, 2, 3], month: 6, noPermit: true }]
  ];
  for (const [qs, f] of cases) {
    test('фильтр ' + decodeURIComponent(qs) + ' совпадает с logic.filterRoutes', async () => {
      const r = await app.client().get('/api/routes?' + qs);
      assert.equal(r.status, 200);
      const server = r.data.items.map((x) => x.slug).sort();
      const client = logic.filterRoutes(SEED, f, kb).map((x) => x.slug).sort();
      assert.deepEqual(server, client);
    });
  }
  test('некорректные значения фильтров игнорируются, а не ломают запрос', async () => {
    const r = await app.client().get('/api/routes?diff=0,9,abc&need=X&month=99&district=zzz&lenMax=-5&sort=drop%20table');
    assert.equal(r.status, 200);
    assert.ok(r.data.total > 0);
  });
  test('сортировка по длине', async () => {
    const r = await app.client().get('/api/routes?sort=len-asc');
    const lens = r.data.items.map((x) => x.lengthKm);
    assert.deepEqual(lens, lens.slice().sort((a, b) => a - b));
  });
  test('страница маршрута: данные, трек, отзывы', async () => {
    const r = await app.client().get('/api/routes/iremel');
    assert.equal(r.status, 200);
    assert.equal(r.data.route.slug, 'iremel');
    assert.ok(Array.isArray(r.data.route.sources) && r.data.route.sources.length > 0, 'у маршрута есть источники');
    assert.ok(r.data.track && r.data.track.pts.length > 1, 'есть трек');
    assert.ok(Array.isArray(r.data.reviews));
    assert.equal(r.data.me, null);
  });
  test('несуществующий маршрут — 404', async () => {
    const r = await app.client().get('/api/routes/no-such-route');
    assert.equal(r.status, 404);
  });
  test('GPX-трек скачивается файлом', async () => {
    const r = await app.client().get('/api/routes/iremel/gpx');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /attachment; filename=".+\.gpx"/);
    assert.match(r.data, /<gpx version="1.1"/);
    assert.match(r.data, /<trkpt lat="/);
  });
  test('справочники: правила посещения и объявления', async () => {
    const c = app.client();
    const rs = await c.get('/api/restrictions');
    assert.equal(rs.status, 200);
    const al = await c.get('/api/alerts');
    assert.equal(al.status, 200);
    assert.ok(Array.isArray(al.data.items));
  });
});

describe('защита запросов', () => {
  test('изменяющий запрос без X-Requested-With отклоняется (CSRF)', async () => {
    const r = await app.client().post('/api/feedback', { topic: 'idea', message: 'Проверка защиты от CSRF' }, { noCsrf: true });
    assert.equal(r.status, 403);
    assert.equal(r.data.error.code, 'csrf');
  });
  test('запрос с чужого Origin отклоняется', async () => {
    const r = await app.client().post('/api/feedback', { topic: 'idea', message: 'Проверка защиты от CSRF' }, { headers: { Origin: 'https://evil.example' } });
    assert.equal(r.status, 403);
  });
  test('тело не в JSON — 415', async () => {
    const r = await app.client().post('/api/feedback', 'topic=idea', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(r.status, 415);
  });
  test('битый JSON — понятная ошибка 400', async () => {
    const r = await app.client().post('/api/feedback', '{"topic":', { headers: { 'Content-Type': 'application/json' } });
    assert.equal(r.status, 400);
  });
  test('ошибки проверки формы — 422 с текстом для каждого поля', async () => {
    const r = await app.client().post('/api/feedback', { topic: 'nope', message: 'коротко' });
    assert.equal(r.status, 422);
    assert.ok(r.data.error.fields.topic);
    assert.ok(r.data.error.fields.message);
  });
  test('ловушка для ботов: заполненное скрытое поле молча принимается и не сохраняется', async () => {
    const before = app.db.get('SELECT COUNT(*) AS n FROM feedback').n;
    const r = await app.client().post('/api/feedback', { topic: 'idea', message: 'Спам-сообщение от робота', website: 'http://spam' });
    assert.equal(r.status, 200);
    assert.equal(app.db.get('SELECT COUNT(*) AS n FROM feedback').n, before);
  });
  test('обратная связь сохраняется без входа', async () => {
    const r = await app.client().post('/api/feedback', { topic: 'content', message: 'На странице маршрута не хватает описания парковки', page: '#/routes/iremel' });
    assert.equal(r.status, 201);
  });
  test('личные данные без входа недоступны — 401', async () => {
    const c = app.client();
    for (const p of ['/api/plans', '/api/gear-lists', '/api/me/export', '/api/admin/stats']) {
      const r = await c.get(p);
      assert.equal(r.status, 401, p);
    }
  });
});

describe('учётная запись', () => {
  const user = { name: 'Анна Тестова', email: 'Anna.Test@Example.com', password: 'Gory-2026x', needs: ['K'], consent: true };
  const c = () => app.client();
  let anna;
  test('регистрация без согласия на обработку данных невозможна', async () => {
    const r = await c().post('/api/auth/register', Object.assign({}, user, { consent: false }));
    assert.equal(r.status, 422);
    assert.ok(r.data.error.fields.consent);
  });
  test('слабый пароль отклоняется', async () => {
    const r = await c().post('/api/auth/register', Object.assign({}, user, { password: '12345678' }));
    assert.equal(r.status, 422);
    assert.ok(r.data.error.fields.password);
  });
  test('регистрация: сессия в HttpOnly-cookie, почта приводится к нижнему регистру', async () => {
    anna = app.client();
    const r = await anna.post('/api/auth/register', user);
    assert.equal(r.status, 201);
    assert.equal(r.data.user.email, 'anna.test@example.com');
    assert.deepEqual(r.data.user.needs, ['K']);
    assert.match(r.setCookie, /HttpOnly/);
    assert.match(r.setCookie, /SameSite=Lax/);
    const row = app.db.get('SELECT password_hash FROM users WHERE email = ?', 'anna.test@example.com');
    assert.ok(!row.password_hash.includes(user.password), 'пароль хранится только в виде хеша');
  });
  test('повторная регистрация на тот же адрес — 422', async () => {
    const r = await c().post('/api/auth/register', Object.assign({}, user, { email: 'anna.test@example.com' }));
    assert.equal(r.status, 422);
    assert.ok(r.data.error.fields.email);
  });
  test('/api/auth/me возвращает пользователя по cookie', async () => {
    const r = await anna.get('/api/auth/me');
    assert.equal(r.data.user.name, 'Анна Тестова');
    assert.deepEqual(r.data.favorites, []);
  });
  test('неверный пароль — 401 без подсказки, что именно неверно', async () => {
    const r = await c().post('/api/auth/login', { email: user.email, password: 'wrong-pass-1' });
    assert.equal(r.status, 401);
    const r2 = await c().post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-pass-1' });
    assert.equal(r2.status, 401);
    assert.equal(r.data.error.message, r2.data.error.message);
  });
  test('профиль: имя и потребности сохраняются', async () => {
    const r = await anna.patch('/api/me', { name: 'Анна', needs: ['K', 'S'], companion: true });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.user.needs, ['K', 'S']);
    assert.equal(r.data.user.companion, true);
  });
  test('смена пароля проверяет текущий пароль', async () => {
    const bad = await anna.post('/api/me/password', { current: 'not-my-pass', next: 'Novyi-2026' });
    assert.equal(bad.status, 422);
    const ok = await anna.post('/api/me/password', { current: user.password, next: 'Novyi-2026' });
    assert.equal(ok.status, 200);
    const relogin = await app.client().post('/api/auth/login', { email: user.email, password: 'Novyi-2026' });
    assert.equal(relogin.status, 200);
    user.password = 'Novyi-2026';
  });
  test('выход завершает сессию на сервере', async () => {
    const tmp = app.client();
    await tmp.login({ email: user.email, password: user.password });
    const token = tmp.cookie;
    await tmp.post('/api/auth/logout');
    const stolen = app.client(); stolen.cookie = token;
    const r = await stolen.get('/api/auth/me');
    assert.equal(r.data.user, null, 'старый токен больше не действует');
  });
  test('выгрузка своих данных (152-ФЗ) и удаление аккаунта', async () => {
    const ex = await anna.get('/api/me/export');
    assert.equal(ex.status, 200);
    assert.match(ex.headers.get('content-disposition'), /tropy-my-data\.json/);
    const data = typeof ex.data === 'string' ? JSON.parse(ex.data) : ex.data;
    assert.equal(data.user.email, 'anna.test@example.com');
    assert.ok(!('password_hash' in data.user) && !JSON.stringify(data).includes('scrypt'), 'хеш пароля не выгружается');
    const wrong = await anna.del('/api/me', { password: 'nope' });
    assert.equal(wrong.status, 422);
    const del = await anna.del('/api/me', { password: user.password });
    assert.equal(del.status, 200);
    assert.equal(app.db.get('SELECT COUNT(*) AS n FROM users WHERE email = ?', 'anna.test@example.com').n, 0);
    const login = await app.client().post('/api/auth/login', { email: user.email, password: user.password });
    assert.equal(login.status, 401);
  });
});

describe('избранное, отзывы, планы, снаряжение', () => {
  let demo, other;
  before(async () => {
    demo = app.client(); assert.equal((await demo.login(DEMO)).status, 200);
    other = app.client();
    assert.equal((await other.post('/api/auth/register', { name: 'Пётр', email: 'petr@example.com', password: 'Tropa-2026', consent: true })).status, 201);
  });

  test('избранное и отметка «пройден»', async () => {
    assert.equal((await demo.put('/api/favorites/iremel')).status, 200);
    assert.equal((await demo.put('/api/completions/korolevsky-bor', { date: '2026-08-15' })).status, 200);
    const me = await demo.get('/api/auth/me');
    assert.deepEqual(me.data.favorites, ['iremel']);
    assert.equal(me.data.completed[0].doneAt, '2026-08-15');
    const route = await demo.get('/api/routes/iremel');
    assert.equal(route.data.me.favorite, true);
    await demo.del('/api/favorites/iremel');
    assert.deepEqual((await demo.get('/api/auth/me')).data.favorites, []);
    assert.equal((await demo.put('/api/favorites/no-such-route')).status, 404);
  });

  let reviewId;
  test('отзыв: валидация, публикация, средняя оценка', async () => {
    assert.equal((await demo.post('/api/routes/iremel/reviews', { rating: 9, accessMatch: 'yes', text: 'x' })).status, 422);
    const r = await demo.post('/api/routes/iremel/reviews', { rating: 4, accessMatch: 'partly', text: 'Курумы на вершине сложные, но тропа размечена хорошо.', needs: ['S'], visitedAt: '2026-08' });
    assert.equal(r.status, 201);
    await other.post('/api/routes/iremel/reviews', { rating: 5, accessMatch: 'yes', text: 'Отличный маршрут для подготовленных туристов.' });
    const page = await app.client().get('/api/routes/iremel');
    assert.equal(page.data.route.reviewsCount, 2);
    assert.equal(page.data.route.rating, 4.5);
    reviewId = page.data.reviews.find((x) => x.author === 'Демо-пользователь').id;
  });
  test('повторный отзыв того же пользователя обновляет старый', async () => {
    await demo.post('/api/routes/iremel/reviews', { rating: 3, accessMatch: 'partly', text: 'Обновлённый отзыв после второго похода.' });
    const page = await app.client().get('/api/routes/iremel');
    assert.equal(page.data.route.reviewsCount, 2);
    assert.equal(page.data.route.rating, 4);
  });
  test('чужой отзыв удалить нельзя', async () => {
    const r = await other.del('/api/reviews/' + reviewId);
    assert.equal(r.status, 403);
  });
  test('текст отзыва экранируется на выводе (хранится как есть, HTML не исполняется)', async () => {
    await other.post('/api/routes/iremel/reviews', { rating: 5, accessMatch: 'yes', text: '<img src=x onerror=alert(1)> отличный маршрут' });
    const page = await app.client().get('/api/routes/iremel');
    const v = page.data.reviews.find((x) => x.author === 'Пётр');
    assert.equal(typeof v.text, 'string'); // экранирование — в шаблонизаторе App.html (см. tests/logic.test.js)
  });

  let planId;
  test('план похода: задачи подготовки создаются автоматически', async () => {
    const start = inDays(30);
    const r = await demo.post('/api/plans', { routeSlug: 'iremel', startDate: start, endDate: inDays(31), groupSize: 3, needs: ['S'], contactName: 'Мария', contactPhone: '+7 900 123-45-67' });
    assert.equal(r.status, 201);
    const p = r.data.plan;
    planId = p.id;
    assert.equal(p.routeSlug, 'iremel');
    assert.ok(p.tasks.length >= 8, 'не меньше 8 задач');
    assert.ok(p.tasks.every((t) => !t.due || t.due <= inDays(40)), 'сроки задач — до или вскоре после похода');
    assert.ok(p.tasks.some((t) => /МЧС/.test(t.text)), 'есть задача про уведомление МЧС');
  });
  test('план: дата окончания раньше начала — 422', async () => {
    const r = await demo.post('/api/plans', { routeSlug: 'iremel', startDate: inDays(10), endDate: inDays(5), groupSize: 2 });
    assert.equal(r.status, 422);
    assert.ok(r.data.error.fields.endDate);
  });
  test('план: отметка задачи сохраняется', async () => {
    const p = (await demo.get('/api/plans/' + planId)).data.plan;
    p.tasks[0].done = true;
    const r = await demo.put('/api/plans/' + planId, Object.assign({}, p, { tasks: p.tasks }));
    assert.equal(r.status, 200);
    assert.equal(r.data.plan.tasks[0].done, true);
  });
  test('чужой план недоступен', async () => {
    assert.equal((await other.get('/api/plans/' + planId)).status, 404);
    assert.equal((await other.del('/api/plans/' + planId)).status, 404);
    assert.equal((await other.get('/api/plans')).data.items.length, 0);
  });
  test('список снаряжения: создание, изменение, удаление', async () => {
    const items = [{ id: 'water', name: 'Вода 1,5 л', qty: 1, weight: 1500, checked: false, cat: 'food' }];
    const c = await demo.post('/api/gear-lists', { title: 'Иремель, август', routeSlug: 'iremel', items });
    assert.equal(c.status, 201);
    const id = c.data.list.id;
    items[0].checked = true;
    const u = await demo.put('/api/gear-lists/' + id, { title: 'Иремель, август', routeSlug: 'iremel', items });
    assert.equal(u.data.list.items[0].checked, true);
    assert.equal((await other.put('/api/gear-lists/' + id, { title: 'Чужой', items })).status, 404);
    assert.equal((await demo.del('/api/gear-lists/' + id)).status, 200);
    assert.equal((await demo.get('/api/gear-lists')).data.items.length, 0);
  });
  test('сообщение о неточности доступности принимается и без входа', async () => {
    const r = await app.client().post('/api/routes/iremel/reports', { category: 'K', text: 'У стоянки появился новый пандус, стоит обновить описание.' });
    assert.equal(r.status, 201);
  });
});

describe('администрирование', () => {
  let admin, user;
  before(async () => {
    admin = app.client(); assert.equal((await admin.login(ADMIN)).status, 200);
    user = app.client(); assert.equal((await user.login(DEMO)).status, 200);
  });
  test('обычному пользователю админка недоступна — 403', async () => {
    for (const p of ['/api/admin/stats', '/api/admin/users', '/api/admin/audit']) assert.equal((await user.get(p)).status, 403, p);
  });
  test('сводка для администратора', async () => {
    const r = await admin.get('/api/admin/stats');
    assert.equal(r.status, 200);
  });
  test('модерация отзыва: скрытый отзыв пропадает со страницы и попадает в журнал', async () => {
    const list = (await admin.get('/api/admin/reviews')).data.items;
    const v = list[0];
    assert.equal((await admin.patch('/api/admin/reviews/' + v.id, { status: 'hidden' })).status, 200);
    const page = await app.client().get('/api/routes/' + v.routeSlug);
    assert.ok(!page.data.reviews.some((x) => x.id === v.id));
    const audit = (await admin.get('/api/admin/audit')).data.items;
    assert.ok(audit.some((a) => a.action === 'moderate' && a.entity === 'review' && a.entity_id === String(v.id)));
  });
  test('снятие маршрута с публикации скрывает его из каталога', async () => {
    assert.equal((await admin.patch('/api/admin/routes/iremel', { status: 'hidden' })).status, 200);
    assert.ok(!(await app.client().get('/api/routes')).data.items.some((x) => x.slug === 'iremel'));
    assert.equal((await app.client().get('/api/routes/iremel')).status, 404);
    assert.equal((await admin.get('/api/routes/iremel')).status, 200, 'администратор видит скрытый маршрут');
    assert.equal((await admin.patch('/api/admin/routes/iremel', { status: 'published' })).status, 200);
  });
  test('объявление на сайте: создание и удаление', async () => {
    const c = await admin.post('/api/admin/alerts', { text: 'Тестовое объявление', level: 'info' });
    assert.ok([200, 201].includes(c.status));
    const items = (await app.client().get('/api/alerts')).data.items;
    const a = items.find((x) => x.text === 'Тестовое объявление');
    assert.ok(a);
    assert.equal((await admin.del('/api/admin/alerts/' + a.id)).status, 200);
  });
  test('единственного администратора нельзя удалить', async () => {
    const r = await admin.del('/api/me', { password: ADMIN.password });
    assert.equal(r.status, 400);
  });
});

describe('ограничение частоты попыток входа', () => {
  test('после 8 неудачных попыток для одного адреса — 429 и Retry-After', async () => {
    const own = await startServer(); // отдельный сервер, чтобы не влиять на другие тесты
    try {
      const c = own.client();
      let last;
      for (let i = 0; i < 9; i++) last = await c.post('/api/auth/login', { email: 'victim@example.com', password: 'guess-' + i });
      assert.equal(last.status, 429);
      assert.ok(Number(last.headers.get('retry-after')) > 0);
    } finally { await own.close(); }
  });
});

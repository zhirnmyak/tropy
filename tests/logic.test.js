'use strict';
/**
 * Модульные тесты общей логики (public/js/shared/logic.js) и шаблонизатора клиента (public/js/core.js).
 * Эта логика работает и в браузере, и на сервере, поэтому тестируется без DOM.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../public/js/shared/logic.js');
const D = require('../public/js/shared/dict.js');
const kb = require('../public/js/data/restrictions.js');
const gear = require('../public/js/data/gear.js');
const { routes } = require('../public/js/data/routes.js');
const tracks = require('../public/js/data/tracks.js');

const bySlug = (s) => routes.find((r) => r.slug === s);

describe('данные каталога', () => {
  test('у каждого маршрута корректный «паспорт»: проверка схемой, источники, доступность по 5 категориям', () => {
    const slugs = new Set();
    for (const r of routes) {
      assert.ok(!slugs.has(r.slug), 'slug уникален: ' + r.slug); slugs.add(r.slug);
      const v = L.validate('route', r);
      assert.ok(v.ok, r.slug + ': ' + JSON.stringify(v.errors));
      assert.ok(D.REGION_BY_CODE[r.region], r.slug + ': регион из справочника');
      for (const c of ['K', 'O', 'S', 'G', 'U']) assert.ok(D.ACCESS_STATUS[r.access[c][0]], r.slug + ': статус доступности ' + c);
      assert.ok(r.sources.length >= 1 && r.sources.every((s) => /^https?:\/\/[\w.-]+\.[a-z]{2,}/.test(s[1])), r.slug + ': у источников есть ссылки');
      assert.ok(r.easy && r.easy.length >= 3, r.slug + ': есть текст «простыми словами»');
      for (const [code] of r.restrictions || []) assert.ok(kb.some((k) => k.code === code), r.slug + ': правило ' + code + ' есть в базе правил');
      assert.ok(r.start.lat > 41 && r.start.lat < 82 && r.start.lon > 19 && r.start.lon < 191, r.slug + ': старт на территории России');
    }
  });
  test('у каждого правила посещения есть основание, шаги и ссылки на первоисточники', () => {
    for (const k of kb) {
      assert.ok([0, 1, 2].includes(k.level), k.code);
      assert.ok(k.steps && k.steps.length, k.code + ': шаги');
      assert.ok(k.basis, k.code + ': основание (закон или правила)');
      assert.ok(k.links && k.links.length && k.links.every((s) => /^https?:\/\//.test(s[1])), k.code + ': ссылки');
    }
  });
  test('треки: начинаются у старта маршрута (не дальше 3 км)', () => {
    const data = tracks.tracks || tracks;
    for (const [slug, t] of Object.entries(data)) {
      const r = bySlug(slug);
      if (!r || !t.pts || !t.pts.length) continue;
      const d = L.haversine([r.start.lat, r.start.lon], t.pts[0]);
      assert.ok(d < 3, `${slug}: первая точка трека в ${d.toFixed(1)} км от старта`);
    }
  });
});

describe('фильтры и подбор', () => {
  test('«на коляске» — только маршруты со статусом «доступно полностью/частично»', () => {
    const list = L.filterRoutes(routes, { needs: ['K'] }, kb);
    assert.ok(list.length > 0);
    assert.ok(list.every((r) => D.ACCESS_STATUS[r.access.K[0]].rank >= 2));
    const withHelper = L.filterRoutes(routes, { needs: ['K'], companion: true }, kb);
    assert.ok(withHelper.length >= list.length, 'с помощником вариантов не меньше');
  });
  test('поиск без учёта регистра и буквы «ё»', () => {
    const a = L.filterRoutes(routes, { q: 'ОЗЁРА' }, kb).map((r) => r.slug);
    const b = L.filterRoutes(routes, { q: 'озера' }, kb).map((r) => r.slug);
    assert.ok(a.length > 0);
    assert.deepEqual(a, b);
  });
  test('подбор: неподходящие по доступности маршруты исключаются, причины объясняются', () => {
    const res = L.scoreRoutes(routes, { needs: ['K'], duration: 'short', month: 7 }, kb);
    assert.ok(res.length > 0);
    for (const x of res) assert.ok(L.suits(x.route, ['K']), x.route.slug);
    assert.ok(res[0].reasons.length > 0, 'у лучшего варианта есть объяснение');
    for (let i = 1; i < res.length; i++) assert.ok(res[i - 1].score >= res[i].score, 'отсортировано по убыванию');
  });
  test('подбор: уровень подготовки ограничивает сложность', () => {
    const res = L.scoreRoutes(routes, { fitness: 2 }, kb);
    assert.ok(res.every((x) => x.route.difficulty <= 2));
  });
});

describe('план подготовки', () => {
  const iremel = bySlug('iremel');
  test('задачи отсортированы по сроку и не позже недели после похода', () => {
    const t = L.planTasks(iremel, { startDate: '2027-07-10', endDate: '2027-07-11', needs: ['S'] }, kb);
    const dues = t.map((x) => x.due);
    assert.deepEqual(dues, dues.slice().sort());
    assert.ok(dues.every((d) => d <= '2027-07-18'));
    assert.ok(new Set(t.map((x) => x.id)).size === t.length, 'id задач уникальны');
  });
  test('уведомление МЧС — не позднее чем за 10 дней до старта для сложных маршрутов', () => {
    const t = L.planTasks(iremel, { startDate: '2027-07-10', endDate: '2027-07-11' }, kb);
    const m = t.find((x) => x.code === 'mchs');
    assert.ok(m, 'задача про МЧС есть');
    assert.equal(m.due, '2027-06-30');
    assert.match(m.link, /^https:\/\/forms\.mchs\.gov\.ru\//);
  });
  test('потребности группы добавляют звонок в визит-центр; зимой нет задачи про клещей', () => {
    const summer = L.planTasks(iremel, { startDate: '2027-07-10', endDate: '2027-07-10', needs: ['K'] }, kb).map((x) => x.code);
    assert.ok(summer.includes('access-call'));
    const winter = L.planTasks(iremel, { startDate: '2027-01-10', endDate: '2027-01-10' }, kb).map((x) => x.code);
    assert.ok(!winter.includes('ticks'));
  });
  test('состояние задачи относительно сегодняшнего дня', () => {
    assert.equal(L.taskState({ due: '2026-01-01' }, '2026-01-05'), 'overdue');
    assert.equal(L.taskState({ due: '2026-01-07' }, '2026-01-05'), 'soon');
    assert.equal(L.taskState({ due: '2026-02-01' }, '2026-01-05'), 'later');
    assert.equal(L.taskState({ due: '2026-01-01', done: true }, '2026-01-05'), 'done');
  });
});

describe('снаряжение', () => {
  test('многодневный горный поход: палатка, аптечка, вес считается', () => {
    const r = bySlug('iremel');
    const p = Object.assign(L.gearParamsFromRoute(r, 7, kb), { days: 2, overnight: 'tent', groupSize: 2 });
    const res = L.buildGear(p, gear);
    const names = res.groups.flatMap((g) => g.items.map((i) => i.name.toLowerCase()));
    assert.ok(names.some((n) => n.includes('аптечк')), 'есть аптечка');
    assert.ok(res.totalWeight > 3000, 'вес посчитан');
  });
  test('потребности добавляют предметы (например, для слабослышащих — запас батареек)', () => {
    const r = bySlug('korolevsky-bor');
    const base = L.buildGear(L.gearParamsFromRoute(r, 7, kb), gear);
    const withG = L.buildGear(Object.assign(L.gearParamsFromRoute(r, 7, kb), { needs: ['G'] }), gear);
    const count = (x) => x.groups.reduce((s, g) => s + g.items.length, 0);
    assert.ok(count(withG) > count(base));
  });
});

describe('проверка форм', () => {
  test('почта нормализуется, пароль требует букв и цифр', () => {
    const ok = L.validate('register', { name: 'Ира', email: '  Ira@Mail.RU ', password: 'Tropa-2026', consent: true });
    assert.ok(ok.ok);
    assert.equal(ok.value.email, 'ira@mail.ru');
    const bad = L.validate('register', { name: 'Ира', email: 'ira@', password: 'password', consent: true });
    assert.ok(!bad.ok);
    assert.ok(bad.errors.email && bad.errors.password);
  });
  test('лишние поля отбрасываются (нельзя подменить роль при регистрации)', () => {
    const v = L.validate('register', { name: 'Ира', email: 'ira@mail.ru', password: 'Tropa-2026', consent: true, role: 'admin' });
    assert.ok(v.ok);
    assert.ok(!('role' in v.value));
  });
  test('сообщения об ошибках — по-русски и для каждого поля', () => {
    const v = L.validate('review', { rating: 0, accessMatch: 'maybe', text: '' });
    assert.ok(!v.ok);
    for (const k of ['rating', 'accessMatch', 'text']) assert.match(v.errors[k], /[а-яё]/i, k);
  });
});

describe('форматирование', () => {
  test('склонение числительных', () => {
    const f = ['маршрут', 'маршрута', 'маршрутов'];
    assert.deepEqual([1, 2, 5, 11, 21, 22, 25, 111].map((n) => L.plural(n, f)),
      ['маршрут', 'маршрута', 'маршрутов', 'маршрутов', 'маршрут', 'маршрута', 'маршрутов', 'маршрутов']);
  });
  test('сезон текстом', () => {
    assert.equal(L.monthsText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 'круглый год');
    assert.equal(L.monthsText([6, 7, 8, 9]), 'июнь — сентябрь');
  });
  test('GPX: спецсимволы экранируются', () => {
    const r = Object.assign({}, bySlug('iremel'), { title: 'Тропа <A&B> "1"', summary: 'x' });
    const gpx = L.toGPX(r, { pts: [[54.5, 58.8], [54.6, 58.9]] });
    assert.ok(gpx.includes('Тропа &lt;A&amp;B&gt; &quot;1&quot;'));
    assert.ok(!gpx.includes('<A&B>'));
  });
});

describe('шаблонизатор клиента (core.js)', () => {
  // Загружаем core.js в изолированный контекст с минимальной заглушкой DOM
  function loadCore() {
    const noop = () => {};
    const el = { addEventListener: noop, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop }, style: {} };
    const document = { addEventListener: noop, documentElement: el, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => Object.assign({}, el), head: el, body: el, title: '' };
    const window = { TROPY: { dict: D, logic: L }, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }), location: { hash: '' }, navigator: {}, localStorage: null, sessionStorage: null, setTimeout, clearTimeout };
    window.window = window; window.document = document; window.self = window;
    const ctx = vm.createContext(window);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/core.js'), 'utf8'), ctx);
    return window.App;
  }
  const App = loadCore();
  test('подставляемые значения экранируются', () => {
    const evil = '<img src=x onerror=alert(1)>"\'&';
    const out = String(App.html`<p title="${evil}">${evil}</p>`);
    assert.equal(out, '<p title="&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;">&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;</p>');
  });
  test('вложенные шаблоны и массивы не экранируются повторно', () => {
    const items = ['a<b', 'c'];
    const out = String(App.html`<ul>${items.map((x) => App.html`<li>${x}</li>`)}</ul>`);
    assert.equal(out, '<ul><li>a&lt;b</li><li>c</li></ul>');
  });
  test('safeUrl пропускает только http(s), внутренние ссылки, mailto и tel', () => {
    assert.equal(App.safeUrl('javascript:alert(1)'), '#/');
    assert.equal(App.safeUrl(' JAVASCRIPT:alert(1)'), '#/');
    assert.equal(App.safeUrl('data:text/html,1'), '#/');
    assert.equal(App.safeUrl('https://zapoved.ru/'), 'https://zapoved.ru/');
    assert.equal(App.safeUrl('#/routes'), '#/routes');
    assert.equal(App.safeUrl('tel:112'), 'tel:112');
  });
});

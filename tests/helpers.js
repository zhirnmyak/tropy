'use strict';
/**
 * Помощники для тестов: поднимают сервер на свободном порту с базой в памяти
 * и дают HTTP-клиент с «банкой» cookie (как у браузера).
 */
const http = require('node:http');
const { createServer } = require('../server/index.js');

const ADMIN = { email: 'admin@tropy.local', password: 'Tropy-Admin-2026' };
const DEMO = { email: 'demo@tropy.local', password: 'Demo-2026' };

async function startServer() {
  const app = createServer({ dbFile: ':memory:', adminPassword: ADMIN.password, demoPassword: DEMO.password, log: false });
  await app.ready;
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return {
    base, db: app.db,
    client: () => new Client(base),
    close: () => new Promise((resolve) => { app.server.closeAllConnections(); app.server.close(resolve); })
  };
}

class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  /** Запрос к API. По умолчанию — как фронтенд: JSON и заголовок X-Requested-With: fetch */
  async req(method, path, body, opts = {}) {
    const headers = Object.assign({ 'X-Requested-With': 'fetch' }, opts.headers || {});
    if (opts.noCsrf) delete headers['X-Requested-With'];
    if (body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(this.base + path, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    const set = res.headers.get('set-cookie');
    if (set) {
      const pair = set.split(';')[0];
      this.cookie = /=$/.test(pair) || /Max-Age=0/i.test(set) ? '' : pair;
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, headers: res.headers, data, setCookie: set };
  }
  get(path, opts) { return this.req('GET', path, undefined, opts); }
  post(path, body, opts) { return this.req('POST', path, body === undefined ? {} : body, opts); }
  put(path, body, opts) { return this.req('PUT', path, body === undefined ? {} : body, opts); }
  patch(path, body, opts) { return this.req('PATCH', path, body === undefined ? {} : body, opts); }
  del(path, body, opts) { return this.req('DELETE', path, body, opts); }
  login(who) { return this.post('/api/auth/login', { email: who.email, password: who.password, remember: true }); }
}

/** «Сырой» запрос без нормализации пути (fetch убирает ../ сам) — для проверки обхода каталогов */
function rawGet(base, rawPath) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const r = http.request({ host: u.hostname, port: u.port, path: rawPath, method: 'GET' }, (res) => {
      let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    r.on('error', reject); r.end();
  });
}

const isoDate = (d) => d.toISOString().slice(0, 10);
const inDays = (n) => isoDate(new Date(Date.now() + n * 86400e3));

module.exports = { startServer, rawGet, ADMIN, DEMO, isoDate, inDays };

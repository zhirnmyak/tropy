'use strict';
/**
 * HTTP-сервер «Тропы без барьеров» на встроенных модулях Node.js (без зависимостей).
 *  - /api/*  → REST API (server/api.js)
 *  - остальное → статические файлы из public/ (сжатие br/gzip, ETag, кэширование)
 * Настройки — через переменные окружения (см. README.md → «Настройка»).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const dbm = require('./db.js');
const auth = require('./auth.js');
const { createApi, HttpError } = require('./api.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2'
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt', '.xml']);

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.tile.opentopomap.org",
  "connect-src 'self' https://api.open-meteo.com", "font-src 'self'", "object-src 'none'", "base-uri 'self'",
  "form-action 'self'", "frame-ancestors 'none'", "manifest-src 'self'", "worker-src 'self'"
].join('; ');

function securityHeaders(res, https) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/** Кэш статических файлов в памяти: исходник + сжатые версии + ETag */
function staticServer(root) {
  const cache = new Map();
  function load(file) {
    const st = fs.statSync(file);
    const key = file + ':' + st.mtimeMs + ':' + st.size;
    let e = cache.get(file);
    if (e && e.key === key) return e;
    const body = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    e = { key, body, ext, etag: '"' + crypto.createHash('sha1').update(body).digest('base64url').slice(0, 20) + '"' };
    if (COMPRESSIBLE.has(ext) && body.length > 1024) {
      e.br = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } });
      e.gzip = zlib.gzipSync(body, { level: 9 });
    }
    cache.set(file, e);
    return e;
  }
  return function serve(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return false; }
    if (rel.includes('\0')) return false;
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(root, rel));
    // защита от выхода за пределы public/ и от служебных файлов
    if (!file.startsWith(root + path.sep) || rel.split('/').some((p) => p.startsWith('.'))) return false;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
    const e = load(file);
    res.setHeader('Content-Type', MIME[e.ext] || 'application/octet-stream');
    res.setHeader('ETag', e.etag);
    const immutable = rel.startsWith('/vendor/') || rel.startsWith('/img/');
    res.setHeader('Cache-Control', immutable ? 'public, max-age=604800' : 'no-cache');
    if (e.br) res.setHeader('Vary', 'Accept-Encoding');
    if (req.headers['if-none-match'] === e.etag) { res.statusCode = 304; res.end(); return true; }
    const ae = String(req.headers['accept-encoding'] || '');
    let body = e.body;
    if (e.br && /\bbr\b/.test(ae)) { body = e.br; res.setHeader('Content-Encoding', 'br'); }
    else if (e.gzip && /\bgzip\b/.test(ae)) { body = e.gzip; res.setHeader('Content-Encoding', 'gzip'); }
    res.setHeader('Content-Length', body.length);
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  };
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'too_large', 'Слишком большой запрос')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'bad_json', 'Некорректный JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', body.length);
  res.end(body);
}

/**
 * Создаёт приложение. Опции: dbFile, adminEmail, adminPassword, demoPassword, trustProxy, log.
 * Возвращает { server, db, ready } — ready разрешается после заполнения базы.
 */
function createServer(opts = {}) {
  const log = opts.log === false ? () => {} : (opts.log || ((...a) => console.log(...a)));
  const db = dbm.open(opts.dbFile || path.join(__dirname, '..', 'data', 'tropy.db'));
  const kb = require('../public/js/data/restrictions.js');
  const adminEmail = opts.adminEmail || 'admin@tropy.local';
  const ready = dbm.seed(db, { adminEmail, adminPassword: opts.adminPassword, demoPassword: opts.demoPassword, hash: auth.hashPassword, log });
  // Демо-учётки с паролями по умолчанию показываются на странице входа (только если пароль не менялся)
  const demo = { user: opts.demoPassword === 'Demo-2026', admin: opts.adminPassword === 'Tropy-Admin-2026' && adminEmail === 'admin@tropy.local' };
  const handleApi = createApi({ db, kb, secureCookies: !!opts.secureCookies, demo });
  const serveStatic = staticServer(PUBLIC_DIR);
  const purge = setInterval(() => auth.purgeExpired(db), 60 * 60 * 1000); purge.unref();

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const https = opts.trustProxy && req.headers['x-forwarded-proto'] === 'https';
    securityHeaders(res, https);
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const method = req.method.toUpperCase();
        const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
        if (mutating) {
          // CSRF: требуем нестандартный заголовок (браузер не отправит его с чужого сайта без CORS) и сверяем Origin
          if (req.headers['x-requested-with'] !== 'fetch') throw new HttpError(403, 'csrf', 'Запрос отклонён: отсутствует заголовок X-Requested-With');
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'csrf', 'Запрос с другого сайта отклонён');
          if (req.headers['content-length'] !== '0' && req.headers['content-type'] && !/application\/json/.test(req.headers['content-type'])) throw new HttpError(415, 'unsupported', 'Ожидается JSON');
        }
        const cookies = auth.parseCookies(req.headers.cookie);
        const token = cookies[auth.COOKIE] || null;
        const ctx = {
          req, method, url, query: url.searchParams, token,
          ip: (opts.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '',
          user: auth.sessionUser(db, token),
          body: mutating ? await readJson(req, 256 * 1024) : {},
          setCookie: (c) => res.setHeader('Set-Cookie', c)
        };
        const out = await handleApi(ctx);
        if (out && out.raw !== undefined) {
          res.statusCode = 200;
          res.setHeader('Content-Type', out.type);
          res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
          res.setHeader('Cache-Control', 'no-store');
          res.end(out.raw);
        } else {
          const status = (out && out.status) || 200;
          if (out && out.status) delete out.status;
          sendJson(res, status, out || { ok: true });
        }
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        if (!serveStatic(req, res, url.pathname)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Страница не найдена</title><h1>Страница не найдена</h1><p><a href="/">Перейти на главную</a></p></html>');
        }
      } else {
        res.statusCode = 405; res.end();
      }
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
        sendJson(res, e.status, { error: { code: e.code, message: e.message, fields: e.fields } });
      } else {
        log('Ошибка:', e && e.stack || e);
        sendJson(res, 500, { error: { code: 'internal', message: 'Внутренняя ошибка сервера. Попробуйте ещё раз.' } });
      }
    } finally {
      if (opts.logRequests) log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
  server.on('close', () => { clearInterval(purge); });
  return { server, db, ready };
}

module.exports = { createServer };

// Запуск из командной строки: node server/index.js
if (require.main === module) {
  const env = process.env;
  const isProd = env.NODE_ENV === 'production';
  const adminPassword = env.ADMIN_PASSWORD || (isProd ? '' : 'Tropy-Admin-2026');
  if (isProd && !env.ADMIN_PASSWORD) console.warn('ВНИМАНИЕ: ADMIN_PASSWORD не задан — администратор не будет создан.');
  const app = createServer({
    dbFile: env.DB_FILE || path.join(__dirname, '..', 'data', 'tropy.db'),
    adminEmail: env.ADMIN_EMAIL || 'admin@tropy.local', adminPassword,
    demoPassword: env.DEMO_USER === '0' ? '' : (env.DEMO_PASSWORD || 'Demo-2026'),
    trustProxy: env.TRUST_PROXY === '1', secureCookies: env.SECURE_COOKIES === '1' || isProd,
    logRequests: env.LOG_REQUESTS === '1'
  });
  const port = Number(env.PORT) || 3000;
  const host = env.HOST || '0.0.0.0';
  app.ready.then(() => {
    app.server.listen(port, host, () => {
      console.log(`«Тропы без барьеров» работают: http://localhost:${port}`);
      if (!isProd) console.log('Демо-доступ: admin@tropy.local / Tropy-Admin-2026 (администратор), demo@tropy.local / Demo-2026 (пользователь)');
    });
  }).catch((e) => { console.error(e); process.exit(1); });
  const stop = () => { app.server.close(() => { app.db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

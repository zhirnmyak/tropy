'use strict';
/**
 * Аутентификация и защита:
 *  - пароли: scrypt (соль 16 байт, N=16384, r=8, p=1), сравнение за постоянное время;
 *  - сессии: случайный 256-битный токен в cookie HttpOnly + SameSite=Lax, в БД — только его SHA-256;
 *  - ограничение частоты запросов (rate limit) для входа, регистрации и форм.
 */
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const COOKIE = 'tropy_sid';
const DAY = 24 * 60 * 60 * 1000;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, key] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, actual);
}

/** Пустой хэш для выравнивания времени ответа, если пользователь не найден */
let dummyHash = null;
async function dummyVerify(password) {
  if (!dummyHash) dummyHash = await hashPassword('dummy-password-1');
  await verifyPassword(password, dummyHash);
  return false;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(db, userId, { remember, userAgent }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttl = remember ? 30 * DAY : DAY;
  db.run('INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES (?,?,?,?)', sha256(token), userId, Date.now() + ttl, String(userAgent || '').slice(0, 200));
  db.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", userId);
  return { token, maxAge: remember ? ttl / 1000 : null };
}

function sessionUser(db, token) {
  if (!token) return null;
  const row = db.get(`SELECT u.id, u.email, u.name, u.role, u.needs, u.companion, u.settings, u.created_at, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, sha256(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) { db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token)); return null; }
  return row;
}

function destroySession(db, token) { if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token)); }
function purgeExpired(db) { db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now()); }

function cookieHeader(token, { maxAge, secure }) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge !== null && maxAge !== undefined) parts.push(`Max-Age=${Math.floor(maxAge)}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
const clearCookie = (secure) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

/** Простой ограничитель частоты: окно фиксированной длины в памяти процесса */
function rateLimiter() {
  const hits = new Map();
  const timer = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 60 * 1000);
  timer.unref();
  return function check(key, limit, windowMs) {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n += 1;
    return h.n <= limit ? 0 : Math.ceil((h.reset - now) / 1000);
  };
}

module.exports = { hashPassword, verifyPassword, dummyVerify, createSession, sessionUser, destroySession, purgeExpired, cookieHeader, clearCookie, parseCookies, rateLimiter, COOKIE };

import { HttpError } from './http.js';
import { ensureSession, getSession } from './session.js';

const AUTH_TTL = 7 * 24 * 60 * 60;
const HASH_ITERATIONS = 100000;

function bytesToBase64(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    throw new HttpError('请输入有效的邮箱地址。', 400, 'invalid_email');
  }
  return email;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 8 || password.length > 128) {
    throw new HttpError('密码长度必须为 8-128 个字符。', 400, 'invalid_password');
  }
  return password;
}

async function emailKey(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return bytesToBase64(new Uint8Array(digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function passwordHash(password, salt, iterations = HASH_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function publicUser(user) {
  return { id:user.id, email:user.email, created_at:user.created_at };
}

function assertStore(env) {
  if (!env.USERS) throw new HttpError('用户账户服务尚未完成配置。', 503, 'auth_not_ready');
}

export async function registerUser(request, env, payload) {
  assertStore(env);
  const email = normalizeEmail(payload.email);
  const password = validatePassword(payload.password);
  const lookupKey = `email:${await emailKey(email)}`;
  if (await env.USERS.get(lookupKey)) throw new HttpError('该邮箱已经注册，请直接登录。', 409, 'email_exists');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const user = {
    id:crypto.randomUUID(), email, salt:bytesToBase64(salt), iterations:HASH_ITERATIONS,
    password_hash:bytesToBase64(await passwordHash(password, salt)), created_at:Math.floor(Date.now() / 1000),
  };
  await env.USERS.put(`user:${user.id}`, JSON.stringify(user));
  await env.USERS.put(lookupKey, user.id);
  return createAuthenticatedSession(request, env, user);
}

export async function loginUser(request, env, payload) {
  assertStore(env);
  const email = normalizeEmail(payload.email);
  const password = validatePassword(payload.password);
  const userId = await env.USERS.get(`email:${await emailKey(email)}`);
  const user = userId ? await env.USERS.get(`user:${userId}`, 'json') : null;
  if (!user) throw new HttpError('邮箱或密码错误。', 401, 'invalid_credentials');
  const supplied = await passwordHash(password, base64ToBytes(user.salt), Number(user.iterations || HASH_ITERATIONS));
  if (!constantTimeEqual(supplied, base64ToBytes(user.password_hash))) {
    throw new HttpError('邮箱或密码错误。', 401, 'invalid_credentials');
  }
  return createAuthenticatedSession(request, env, user);
}

async function createAuthenticatedSession(request, env, user) {
  const session = await ensureSession(request, env);
  await env.USERS.put(`session:${session.id}`, user.id, { expirationTtl:AUTH_TTL });
  return { session, user:publicUser(user) };
}

export async function authenticatedUser(request, env) {
  if (!env.USERS) return null;
  const session = await getSession(request, env);
  if (!session) return null;
  const userId = await env.USERS.get(`session:${session.id}`);
  const user = userId ? await env.USERS.get(`user:${userId}`, 'json') : null;
  return user ? { session, user:publicUser(user) } : null;
}

export async function requireUser(request, env) {
  const auth = await authenticatedUser(request, env);
  if (!auth) throw new HttpError('请先注册或登录后再使用。', 401, 'authentication_required');
  return auth;
}

export async function logoutUser(request, env) {
  const session = await getSession(request, env);
  if (session && env.USERS) await env.USERS.delete(`session:${session.id}`);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `open_niulai_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

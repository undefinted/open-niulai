import { HttpError } from './http.js';

const COOKIE_NAME = 'open_niulai_session';
const MAX_AGE = 7 * 24 * 60 * 60;

function bytesToBase64Url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.get('Cookie') || '').split(';').map(item => item.trim().split('=').map(decodeURIComponent)).filter(item => item.length === 2));
}

async function signature(id, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id))));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function getSession(request, env = {}) {
  const token = parseCookies(request)[COOKIE_NAME] || '';
  const [id, suppliedSignature] = token.split('.');
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return null;
  if (!env.SESSION_SECRET) return suppliedSignature === 'dev' ? { id, durable: false } : null;
  const expected = await signature(id, env.SESSION_SECRET);
  return constantTimeEqual(expected, suppliedSignature || '') ? { id, durable: true } : null;
}

export async function ensureSession(request, env = {}) {
  const existing = await getSession(request, env);
  if (existing) return { ...existing, cookie: null };
  const id = crypto.randomUUID();
  const signed = env.SESSION_SECRET ? await signature(id, env.SESSION_SECRET) : 'dev';
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return {
    id,
    durable: Boolean(env.SESSION_SECRET),
    cookie: `${COOKIE_NAME}=${encodeURIComponent(`${id}.${signed}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`,
  };
}

export function validateIdempotencyKey(request) {
  const key = String(request.headers.get('Idempotency-Key') || '').trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new HttpError('付费任务缺少有效的防重复提交标识。', 400, 'invalid_idempotency_key');
  return key;
}

export function assertPaidRuntime(request, env = {}) {
  const url = new URL(request.url);
  if (['localhost', '127.0.0.1'].includes(url.hostname)) return;
  if (url.protocol !== 'https:' || !env.SESSION_SECRET || !env.JOBS || !env.RATE_LIMITS) {
    throw new HttpError('视频生成服务仍在完成安全配置，请稍后再试。', 503, 'service_not_ready');
  }
}

export async function consumeRateLimit(env, sessionId, now = Date.now()) {
  if (!env.RATE_LIMITS) return { allowed: true, remaining: null };
  const windowSeconds = 60 * 60;
  const limit = Math.max(1, Number(env.PAID_JOB_LIMIT_PER_HOUR || 6));
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const key = `paid:${sessionId}:${bucket}`;
  const count = Number(await env.RATE_LIMITS.get(key) || 0);
  if (count >= limit) throw new HttpError(`每小时最多提交 ${limit} 个付费任务，请稍后再试。`, 429, 'rate_limited');
  await env.RATE_LIMITS.put(key, String(count + 1), { expirationTtl: windowSeconds + 120 });
  return { allowed: true, remaining: limit - count - 1 };
}

export function publicJob(job) {
  const { owner: _owner, idempotency_key: _key, ...safe } = job;
  return safe;
}

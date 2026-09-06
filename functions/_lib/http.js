export class HttpError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requestId(request) {
  return request?.headers?.get('CF-Ray') || crypto.randomUUID();
}

export function json(value, status = 200, extraHeaders = {}) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      ...extraHeaders,
    },
  });
}

export async function readJson(request, maxBytes = 64 * 1024) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('请求内容过大。');
  const text = await request.text();
  if (!text || new TextEncoder().encode(text).length > maxBytes) throw new Error('请求内容为空或过大。');
  return JSON.parse(text);
}

export function errorResponse(error, status = 400) {
  const message = error instanceof Error ? error.message : '请求失败。';
  const resolvedStatus = error instanceof HttpError ? error.status : status;
  const code = error instanceof HttpError ? error.code : 'bad_request';
  return json({ error: message, code }, resolvedStatus);
}

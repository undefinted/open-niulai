export function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
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
  return json({ error: message }, status);
}

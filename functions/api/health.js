import { json } from '../_lib/http.js';

export function onRequest() {
  return json({ ok: true, version: '0.6.0', mode: 'cloudflare-pages' });
}

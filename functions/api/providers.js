import { json } from '../_lib/http.js';
import { PROVIDERS } from '../_lib/providers.js';

export function onRequest() {
  return json({ providers: PROVIDERS, secure_context: true, connected: [], expires_in_seconds: 0 });
}

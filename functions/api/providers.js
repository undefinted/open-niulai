import { json } from '../_lib/http.js';
import { PROVIDERS } from '../_lib/providers.js';

export function onRequest(context) {
  const url = new URL(context.request.url);
  const secureContext = url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  const generationReady = local || (secureContext && Boolean(context.env.SESSION_SECRET && context.env.JOBS && context.env.RATE_LIMITS));
  return json({ providers: PROVIDERS, secure_context: secureContext, generation_ready: generationReady, connected: [], expires_in_seconds: 0 });
}

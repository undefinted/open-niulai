import { json } from '../_lib/http.js';
import { ensureSession } from '../_lib/session.js';

export async function onRequestGet(context) {
  const session = await ensureSession(context.request, context.env);
  return json({
    session: { id: session.id, durable: session.durable },
    storage: { api_keys: 'browser-session-only', workflow_config: 'browser-local', jobs: context.env.JOBS ? 'cloud-and-browser' : 'browser-only' },
  }, 200, session.cookie ? { 'Set-Cookie': session.cookie } : {});
}

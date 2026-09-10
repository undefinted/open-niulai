import { json } from '../_lib/http.js';

export function onRequest(context) {
  const checks = {
    https: new URL(context.request.url).protocol === 'https:',
    signed_sessions: Boolean(context.env.SESSION_SECRET),
    job_storage: Boolean(context.env.JOBS),
    rate_limits: Boolean(context.env.RATE_LIMITS),
    user_accounts: Boolean(context.env.USERS),
    output_quality_gate: true,
  };
  return json({
    ok: true,
    version: '0.11.0',
    mode: 'cloudflare-pages',
    production_ready: Object.values(checks).every(Boolean),
    checks,
  });
}

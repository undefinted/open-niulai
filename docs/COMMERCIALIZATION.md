# Commercial MVP checklist

Open NiuLai 0.7.0 is designed for a limited public beta using a BYOK model: creators connect their own RunningHub account, confirm each paid submission, and consume that account's quota. Open NiuLai does not resell model credits.

## Implemented

- One continuous flow from idea to script, workflow selection, paid confirmation, task state, and playable result.
- API keys live only in the current browser tab. Access passwords and uploaded images are not persisted by Open NiuLai.
- Signed anonymous workspaces, seven-day server-side job metadata, browser history, and resumable status polling.
- Idempotency keys on paid submissions and no automatic retry of provider task creation.
- Per-workspace paid-task rate limits, HTTPS detection, security headers, privacy notice, and beta terms.
- Honest sample labeling: the bundled SVD video proves one completed inference and is not presented as the current user's output.

## Required Cloudflare production bindings

Create two KV namespaces and bind them as `JOBS` and `RATE_LIMITS`. Add `SESSION_SECRET` with `wrangler pages secret put SESSION_SECRET`; use at least 32 random bytes. Optionally set `PAID_JOB_LIMIT_PER_HOUR`, which defaults to 6.

The endpoint `/api/health` reports `production_ready: true` only when HTTPS, signed sessions, job storage, and rate limiting are all active. KV namespace IDs are non-secret deployment identifiers and may live in `wrangler.jsonc`; API tokens and `SESSION_SECRET` must never be committed.

## Honest limitations before charging users

- KV provides practical duplicate-request protection but is eventually consistent. A billing product needs provider-supported idempotency or a transactional task coordinator before Open NiuLai itself charges money.
- BYOK is not OAuth. RunningHub API keys must still be entered by users until RunningHub provides and approves a suitable OAuth integration.
- A real paid RunningHub task must be recorded before the public demo claims that arbitrary input reaches a finished third-party video.
- Account recovery, moderation operations, abuse appeals, customer support, analytics consent, payment, invoicing, refunds, and formal legal review remain launch gates for a general paid service.

## Release evidence

For each production release, retain the commit, `/api/health` response, a successful text-to-video task, an optional first-frame task, a failed-task recovery example, mobile and desktop screenshots, and confirmation that no credentials appear in Git history or browser persistent storage.

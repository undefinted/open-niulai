# Cloudflare Pages deployment

The public application is designed to run on Cloudflare Pages with Pages Functions. The Tencent Cloud CVM remains an independent cloud-computing lab deployment.

Current Pages deployment: `https://open-niulai.pages.dev/`. The custom domain remains separate from a successful Pages deployment and is ready only after its DNS and certificate validation finish.

## Git deployment settings

- Repository: `undefinted/open-niulai`
- Production branch: `main`
- Framework preset: `None`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

No model API key is required in the Cloudflare project settings. A visitor's RunningHub key stays in that browser tab's `sessionStorage`, is sent only to the same-origin Function when creating or querying that visitor's task, and is never committed or written to application storage.

## Production bindings

Create and bind two Cloudflare KV namespaces. Their non-secret namespace IDs live in `wrangler.jsonc` so direct deployments are reproducible:

- `JOBS`: seven-day anonymous task metadata, ownership checks, and best-effort duplicate submission protection.
- `RATE_LIMITS`: hourly paid-task submission counters.

Set `SESSION_SECRET` as an encrypted Pages secret with at least 32 random bytes. Optionally set `PAID_JOB_LIMIT_PER_HOUR`; the default is 6. Do not place the secret or real KV namespace IDs in Git. After deployment, `/api/health` must report `production_ready: true` before public promotion.

## Domain setup

1. Add `myyuanlai.xyz` to Cloudflare and select the Free plan.
2. Copy the two Cloudflare nameservers shown for the zone.
3. In Alibaba Cloud Domain Console, change the domain's DNS servers to those two nameservers. Do not transfer the domain registrar.
4. Wait until the Cloudflare zone status becomes Active.
5. Open Workers & Pages, select the Pages project, then add `myyuanlai.xyz` under Custom domains.
6. Add `www.myyuanlai.xyz` as another custom domain and configure a redirect to the apex domain.
7. Verify `https://myyuanlai.xyz/api/health` before enabling a paid RunningHub task.

Do not add MiniMax keys, Alibaba credentials, Tencent credentials, private keys, or certificate files to GitHub or Cloudflare build variables.

## Local checks

```bash
npm run build
npm run test:pages
npx wrangler pages dev dist
```

# Cloudflare Pages deployment

The public application is designed to run on Cloudflare Pages with Pages Functions. The Tencent Cloud CVM remains an independent cloud-computing lab deployment.

## Git deployment settings

- Repository: `undefinted/open-niulai`
- Production branch: `main`
- Framework preset: `None`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

No API key is required in the Cloudflare project settings. A visitor's MiniMax key stays in that browser tab's `sessionStorage`, is sent only to the same-origin Function when creating or querying that visitor's task, and is never committed or written to application storage.

## Domain setup

1. Add `myyuanlai.xyz` to Cloudflare and select the Free plan.
2. Copy the two Cloudflare nameservers shown for the zone.
3. In Alibaba Cloud Domain Console, change the domain's DNS servers to those two nameservers. Do not transfer the domain registrar.
4. Wait until the Cloudflare zone status becomes Active.
5. Open Workers & Pages, select the Pages project, then add `myyuanlai.xyz` under Custom domains.
6. Add `www.myyuanlai.xyz` as another custom domain and configure a redirect to the apex domain.
7. Verify `https://myyuanlai.xyz/api/health` before enabling a paid MiniMax task.

Do not add MiniMax keys, Alibaba credentials, Tencent credentials, private keys, or certificate files to GitHub or Cloudflare build variables.

## Local checks

```bash
npm run build
npm run test:pages
npx wrangler pages dev dist
```

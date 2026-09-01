import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('../web/', import.meta.url), dist, { recursive: true });
await mkdir(new URL('./demo/', dist), { recursive: true });
await cp(new URL('../assets/demo/', import.meta.url), new URL('./demo/', dist), { recursive: true });
await writeFile(new URL('./_headers', dist), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' https: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

/demo/*
  Cache-Control: public, max-age=86400
`, 'utf8');

console.log('Cloudflare Pages output written to dist/');

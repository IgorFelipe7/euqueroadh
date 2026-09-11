# Palestra — Educação Financeira para Jovens

Event landing page and registration flow, plus a private admin area for the organizers.

The approved specifications in [`docs/`](./docs) are the source of truth for implementation; start
with [`docs/IMPLEMENTATION-PLAN.md`](./docs/IMPLEMENTATION-PLAN.md).

## Getting started

```bash
npm ci
cp .env.example .env.local   # then fill it in
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (vitest) |
| `npm run validate` | Lint, typecheck and tests together |
| `npm run db:start` / `db:stop` | The local Supabase stack |
| `npm run db:test` | The database suites: pgTAP, then the Node concurrency and authorization suites |
| `npm run test:e2e` | Playwright, against a production build and the local database |

## Environment

Every variable is listed in [`.env.example`](./.env.example) and validated by `lib/env.ts`, the only
module that reads `process.env`. A missing or malformed variable fails the build rather than the
first request. Never commit a filled-in env file.

## Local development and testing

Everything runs against the **local** Supabase stack; nothing in this repository may point at a
remote project. Start it with `npm run db:start` and keep it running: the end-to-end suite reads
real rows out of it and real sign-in e-mail out of its mail catcher.

`npm run test:e2e` builds the application and starts **two** servers from that one build:

| Port | Turnstile secret | Why |
| --- | --- | --- |
| 3000 | Cloudflare's `1x…AA` test secret, "always passes" | The happy path, and every database outcome |
| 3001 | Cloudflare's `2x…AA` test secret, "always fails" | Proving that a token Cloudflare refuses writes nothing |

The second server exists because of a property of Cloudflare's test mode rather than of this
application: the always-passes secret answers `success: true` for *any* non-empty token, so a
refusal cannot be produced against it. Both are Cloudflare's own published test keys, both are local,
and the application code is identical on both — there is no test flag, no bypass and no branch in
the product that knows either server exists.

Anti-abuse for local development uses those same published test keys, configured through
`.env.example`'s variables. Production Cloudflare credentials belong only in the deployment
environment.

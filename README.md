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

## Environment

Every variable is listed in [`.env.example`](./.env.example) and validated by `lib/env.ts`, the only
module that reads `process.env`. A missing or malformed variable fails the build rather than the
first request. Never commit a filled-in env file.

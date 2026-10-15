# Educação Financeira para Jovens — Event Platform

A production event platform for a free financial-education talk for young people in
Hortolândia/SP, Brazil: a mobile-first landing page with a three-field registration flow, a secure
admin area for the organizing team, and the event-day tooling around it — QR self check-in, a live
arrivals wall, a raffle and a public certificate portal.

**Live:** [euqueroadh.com](https://euqueroadh.com) · **In production:** 138 registrations and
70 on-site check-ins at the September 2026 event.

---

## Highlights

- **Concurrency-safe capacity and waitlist.** Seats are allocated inside a single locked Postgres
  transaction, never by a client-side count followed by an insert. Overselling is impossible by
  construction: it is a `CHECK` constraint, and a parallel-connection test suite proves it.
- **The database is the security boundary.** No role holds a direct write privilege on any
  application table. Every mutation is a `SECURITY DEFINER` RPC that authorizes, locks in a
  documented order, mutates and writes its audit record in the same transaction. Row-Level Security
  covers every read, and every routine carries an explicit `REVOKE`/`GRANT` pair.
- **Privacy by design.** Self check-in and the certificate portal identify a guest by phone, then
  first name, then age, and answer an unregistered number with the same prompts as a number shared by
  five people. No endpoint can be used to ask "who is registered under this number".
- **Zero-dependency where it counts.** Brazilian phone validation, date formatting and the QR code
  encoder (Reed–Solomon over GF(256)) are implemented in-house rather than pulled in as libraries.
  Every dependency in `package.json` has a written justification.
- **Accessible and fast.** Semantic HTML, visible focus, correct mobile keyboards, reduced-motion
  support and automated axe-core WCAG checks in the end-to-end suite. Animation uses
  compositor-friendly CSS only.

## Features

### Public

- Event landing page in Brazilian Portuguese, designed from the official event banner.
- Registration with name, age and mobile number, with server-side validation, Cloudflare Turnstile
  and an intentional, documented duplicate policy (one person per phone + normalized name, so
  families sharing a phone are supported).
- Automatic waitlist when capacity is reached, or closed registration, as configured by the admins.
- Add-to-calendar (`.ics`) and dynamic Open Graph image.

### Admin

- Per-organizer accounts by invitation only. There is no public sign-up, and authorization is
  enforced server-side.
- Dashboard, searchable and filterable registration list, edit, cancel and waitlist promotion.
- Event settings: capacity, waitlist behaviour and registration state.
- Audited, injection-safe CSV export for spreadsheets.
- Full audit trail of administrative actions, which never stores participant data.

### Event day

- **Self check-in:** an admin opens a time-limited session, and guests scan a QR to confirm their own
  arrival. Closing the session immediately invalidates every copy of the QR.
- **Arrivals wall:** a full-screen QR and a live attendee count for a projector, with no names shown.
- **Manual check-in** screen for exceptions at the door.
- **Raffle** drawn only from people who are actually present.
- **Certificate portal:** one public address where attendees retrieve their certificate of
  participation.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions), React 19 |
| Language | TypeScript (strict) |
| Database & auth | Supabase: PostgreSQL, Row-Level Security, Auth |
| Validation | Zod, with one schema shared by client hints and server validation |
| Styling | Tailwind CSS v4 with a CSS-native design-token layer |
| Anti-abuse | Cloudflare Turnstile |
| Testing | Vitest, pgTAP, Node concurrency harness, Playwright + axe-core |
| Hosting | Vercel (São Paulo region) |

## Architecture

```
Browser ──► Next.js (Vercel, gru1)
              ├─ Server Components    read-only pages, no client data fetching
              ├─ Server Actions       validate (Zod) → verify Turnstile → call RPC
              └─ Route Handlers       assertAdmin() → read under the admin's JWT
                        │
                        ▼
            Supabase PostgreSQL
              ├─ RLS on every table   authenticated = SELECT only
              ├─ SECURITY DEFINER RPCs authorize → lock → mutate → audit
              └─ Constraints          capacity, uniqueness and state invariants
```

- Privileged credentials never reach the browser. `server-only` turns an accidental import into a
  build failure.
- Admin reads run under the administrator's own JWT, so RLS applies to exports exactly as it does to
  the screen.
- The public write path is granted to the server role only, so Turnstile cannot be bypassed by
  calling the database directly.
- The schema allows multiple events later without a multi-event CMS today.

The design decisions behind these choices are recorded in [`docs/`](./docs).

## Testing

| Suite | What it proves |
| --- | --- |
| **pgTAP** (16 files) | Schema, invariants, counters, waitlist, RLS, the function and table ACL matrix, audit, check-in and certificates |
| **Node concurrency harness** | Parallel registrations against a real Postgres never oversell, and authorization holds across roles |
| **Vitest** | Domain logic: phone normalization, identity keys, CSV safety, QR encoding, form submission flows |
| **Playwright + axe-core** | End-to-end flows on mobile and desktop viewports, WCAG checks, secret-boundary and open-redirect checks, Turnstile refusal |

```bash
npm run validate   # lint + typecheck + unit tests
npm run db:test    # pgTAP + concurrency and authorization suites (local Supabase)
npm run test:e2e   # Playwright against a production build
```

## Getting started

Requirements: Node ≥ 20.9, npm ≥ 11, Docker (for the local Supabase stack).

```bash
npm ci
cp .env.example .env.local   # fill in the values
npm run db:start             # local Supabase: Postgres, Auth, mail catcher
npm run dev
```

Every environment variable is listed in [`.env.example`](./.env.example) and validated at build time
by `lib/env.ts`. A missing or malformed variable fails the build rather than the first request.

Local development and all test suites run against the **local** Supabase stack only. Local
anti-abuse uses Cloudflare's published Turnstile test keys; production credentials live only in the
deployment environment.

The first administrator is provisioned by hand from the Supabase dashboard, because no self-service
path exists. Every administrator after that is invited from `/admin/equipe`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, including the database test harness |
| `npm test` | Unit tests |
| `npm run validate` | Lint, typecheck and unit tests |
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase stack |
| `npm run db:test` | pgTAP, then the concurrency and authorization suites |
| `npm run test:e2e` | End-to-end suite |

## Project structure

```
app/                  routes: landing, check-in, certificates, admin, privacy
components/           public and admin UI
lib/
  domain/             pure domain logic: phone, identity, schemas, CSV
  data/               data access layer (server-only)
  qr/                 dependency-free QR encoder
  check-in/ certificate/ registration/   form flows
supabase/
  migrations/         versioned, reproducible schema
  tests/              pgTAP and Node database suites
e2e/                  Playwright specs
docs/                 product, architecture, security and design specifications
```

## Documentation

| Document | Contents |
| --- | --- |
| [PRODUCT-SPEC](./docs/PRODUCT-SPEC.md) | Scope, registration outcomes, duplicate policy, check-in and certificates |
| [ARCHITECTURE](./docs/ARCHITECTURE.md) | Stack, boundaries, data flow, performance, deployment |
| [DATABASE-SECURITY](./docs/DATABASE-SECURITY.md) | Invariants, locking order, RLS and the per-routine ACL matrix |
| [ADMIN-SPEC](./docs/ADMIN-SPEC.md) | Admin area behaviour |
| [VISUAL-DIRECTION](./docs/VISUAL-DIRECTION.md) | Design system, typography, motion and accessibility |
| [DECISIONS](./docs/DECISIONS.md) | Decision log with rationale |

---

Designed and built by **Igor Felipe**.

# Demonstration deployment

A public copy of the product that anyone can explore, admin area included, without touching a real
participant. It runs the same code as production against a **separate Supabase project** that holds
only fictitious data.

## What is different in the demo

`DEMO_MODE=true` turns on four things and nothing else:

| Change | Where |
| --- | --- |
| A notice on top of every page: fictitious data, reset daily, link to the source | `components/demo/demo-banner.tsx`, `app/layout.tsx` |
| "Entrar na demonstração": one click signs the visitor in as the demo organizer | `app/admin/(auth)/entrar/page.tsx`, `lib/data/demo.ts` |
| Inviting, deactivating and removing organizers, and the end-of-event purge, are refused | `refusedInDemo()` in `app/admin/(protected)/actions.ts` |
| `noindex` metadata and a `Disallow: /` robots file | `app/layout.tsx`, `app/robots.ts` |

Everything else — registration, waitlist, promotion, check-in, the arrivals wall, raffles and the
certificate portal — is the production code path, so the demo shows the real behaviour.

### How the one-click sign-in stays safe

- It reuses the production exchange. The Auth Admin API mints a single-use magic-link hash for the
  demo organizer (`generateLink` sends no e-mail) and `verifyAdminOtpHash()` redeems it, exactly
  as `/auth/confirmar` does. What the session may do is still decided by `admin_users`.
- `lib/env.ts` only accepts `DEMO_ADMIN_EMAIL` on the reserved `@example.com` domain. Even
  `DEMO_MODE=true` set on the production project by mistake cannot open a real organizer's account.
- With `DEMO_MODE` unset, `signInAsDemoAdmin()` returns before contacting anything.

## The dataset

`supabase/demo/demo.sql` installs `demo.reset()` and schedules it with pg_cron for every day at
03:00 (America/Sao_Paulo). Each run wipes the project and rebuilds:

- the event, with capacity 120 and certificates enabled;
- 138 fictitious people registered through `register_for_event()`: 120 confirmed, the rest on the
  waitlist, spread over the three weeks before the event;
- 5 cancellations and 5 waitlist promotions, through the admin RPCs;
- 70 check-ins on the night;
- "Sorteio 1", finished with 3 winners, and "Sorteio 2", ready to be drawn on the stage.

Every write after the event row goes through the product's own RPCs, under the demo organizer's
identity, so the counters, the waitlist order and the audit trail are the real ones. Names are
combinations of common Brazilian first names and surnames; every phone number is in the
(19) 90000-xxxx range.

`demo.reset()` refuses to run if any Auth user or organizer has an address outside `@example.com`,
so pasting the file into the wrong project fails instead of erasing it.

## Setting it up

1. Create a new Supabase project. Never reuse the production one.
2. Apply the migrations to it: `supabase link --project-ref <demo-ref>` and `supabase db push`.
3. In **Authentication → Users**, add `organizador@example.com` with **Auto Confirm User** on.
   No password is needed.
4. In the **SQL Editor**, run `supabase/demo/demo.sql`.
5. Create a second Vercel project from this repository, with the demo project's keys and:

   ```
   NEXT_PUBLIC_SITE_URL=https://<demo domain>
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   DEMO_MODE=true
   DEMO_ADMIN_EMAIL=organizador@example.com
   ```

   The Turnstile values are Cloudflare's published always-pass test keys.
6. In the demo project's **Authentication → URL Configuration**, set the Site URL to the demo
   domain.

To rebuild the data by hand at any time: `select demo.reset();`.

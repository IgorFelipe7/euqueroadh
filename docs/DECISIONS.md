# Decision Log

Compact record of the decisions that shaped this specification, and the questions that remain.

---

## Part 1 — Architectural decisions

### D1 · Capacity via a locked event row plus a stored counter guarded by a CHECK constraint

**Decision.** `register_for_event()` takes `SELECT … FOR UPDATE` on the event row, then decides and
inserts inside that lock. `confirmed_count` is a stored column, maintained by a single trigger, with
`CHECK (confirmed_count <= capacity)`.

**Reason.** The `CHECK` constraint can only reference columns on the same row, so a stored counter is
the *only* way to make "never oversold" a database-enforced invariant rather than an application
promise. The row lock is needed anyway to make the duplicate check and the insert atomic with each
other.

**Alternatives.** *Count-then-insert in application code* — the classic race; rejected outright.
*A conditional `UPDATE … WHERE confirmed_count < capacity`* — atomic for capacity but leaves the
duplicate check racy. *`SELECT count(*) FOR UPDATE` with no stored counter* — correct but O(n) per
registration and cannot back a `CHECK`. *Advisory locks* — works, but not declarative and not
constraint-backed. *`SERIALIZABLE` isolation* — adds retry handling for no gain here.

**Trade-off.** Derived data is stored, which normally deserves suspicion. Mitigated by a single
writer (the trigger), the `CHECK` constraint, and `verify_event_counters()` as a test assertion.
All registrations for one event serialise — irrelevant at three orders of magnitude below the
contention ceiling.

### D2 · Waitlist promotion is manual, never automatic

**Decision.** Freeing a seat — by raising capacity or by cancelling a confirmed registration — never
promotes anyone. The dashboard prompts the administrator, who promotes and then telephones.

**Reason.** The system's only contact channel is a phone number and V1 has no messaging automation.
Silently promoting someone who never learns of it is worse than leaving them queued.

**Alternative.** Auto-promotion in the same transaction as the capacity change — tidier, and wrong
without a notification channel.

**Trade-off.** Requires an organizer to act. The dashboard prompt is designed to make that
unmissable, and the post-promotion screen hands over the names and numbers to call. **Revisit if a
notification channel is ever added.**

### D3 · Duplicate detection on canonical phone, returning the existing state, never updating it

**Decision.** Partial unique index on `(event_id, phone_e164) WHERE status <> 'cancelled'`. A repeat
submission returns `already_registered` with the current status and modifies nothing.

**Reason.** The phone is the organizers' only contact channel and the de-facto identity. Checking it
inside the allocation lock makes the whole registration idempotent, so a retry after a lost response
cannot duplicate. Not updating on re-submission prevents anyone who knows a phone number from
overwriting that person's data.

**Alternatives.** *Name + age* — not unique, not stable. *Allowing re-submission to update the row* —
an unauthenticated write primitive. *A time-boxed correction window* — an attack window plus extra
state for a rare case.

**Trade-off.** A genuine typo can only be fixed by an administrator. The duplicate screen says so.
One bit of enumeration is exposed (T6 in [DATABASE-SECURITY.md § 11](./DATABASE-SECURITY.md)) —
accepted and documented.

### D4 · The browser never talks to Supabase on the public page

**Decision.** All public reads and writes go through the Next.js server. The public path uses the
**secret key**, confined to `lib/data/public.ts`. All admin access to participant data uses the
**administrator's own JWT**, so RLS is the enforcing layer there.

**Reason.** The requirement for server-side validation and abuse protection on a public write
endpoint only holds if the endpoint is unreachable except through our server. Granting `execute` on
the registration RPC to `anon` would make the RPC callable with the (publishable, therefore
discoverable) key, putting Turnstile and rate limiting outside the only path to the database.

**Alternative.** *A `SECURITY DEFINER` function granted to `anon`, called with the publishable key* —
keeps a bypass-RLS key out of the public path, but makes abuse protection bypassable. The abuse
boundary was judged more important.

**Trade-off.** The server process holds a key that bypasses RLS. Mitigated in depth
([DATABASE-SECURITY.md § 8.6](./DATABASE-SECURITY.md)) and, crucially, **not** used for the sensitive
surface: every admin read of participant data is RLS-enforced under the admin's own identity.

### D5 · Admin authorization from an `admin_users` table, never from a JWT claim

**Decision.** `is_active_admin()` reads `admin_users` on every policy evaluation.

**Reason.** Setting `is_active = false` revokes access on the very next request. A claim baked into a
JWT stays valid until expiry — exactly the wrong behaviour when removing access. `user_metadata` is
user-writable and is never consulted.

**Alternative.** A custom claim via an Auth Hook — faster, but revocation lags by the token lifetime.

**Trade-off.** One indexed primary-key lookup per policy evaluation, wrapped in `(select …)` so
Postgres evaluates it once per query.

### D6 · Email OTP, no passwords; MFA deferred

**Decision.** Six-digit email OTP. Public sign-up disabled. Accounts created only by invitation.
MFA available but not mandatory.

**Reason.** A small, known, invited administrator set. No passwords means no reuse, no credential
stuffing, no phishable long-lived secret, and no reset flow to attack. Account recovery collapses to
"can you read your e-mail?", which is what password reset ultimately relies on anyway.

**Alternative.** Passwords with a 12-character minimum plus leaked-password protection — no SMTP
dependency, but reintroduces every password failure mode.

**Trade-off.** Sign-in depends on e-mail deliverability, so **custom SMTP is a launch prerequisite —
but not an implementation blocker** (Q5): `supabase start` ships a local mail catcher, so the whole
flow is built and tested before any provider exists. MFA deferred because a lost TOTP seed for a
volunteer on the evening of the event is a real operational failure with no on-call recovery.
Revisit triggers are listed in [DATABASE-SECURITY.md § 7.5](./DATABASE-SECURITY.md).

**Hardened in review.** `signInWithOtp` defaults to `shouldCreateUser: true`, which would have made
the sign-in page a public account-creation endpoint. Every call now passes `shouldCreateUser: false`
— see D23.

### D7 · Every write is an RPC; no role holds a direct write privilege

**Decision.** `authenticated` holds `SELECT` and nothing else on all four tables. Every mutation —
including correcting a participant's name — goes through a `SECURITY DEFINER` RPC that authorizes,
locks the event row, mutates, and writes its audit record, all in one transaction.

**Reason.** Two invariants collapse into this one rule.

*Lock order (**I6**).* The counter trigger updates `events` after `registrations` is touched, so a
direct status `UPDATE` acquires locks as registrations → events while promotion acquires them as
events → registrations. Concurrently, those deadlock. Event-first RPCs give one consistent order.

*Audit atomicity (**I9**).* A PostgREST `PATCH` cannot carry a guaranteed audit write, so
"mutation succeeded, audit write failed" was reachable — in a product whose privacy story rests on
being able to say who touched participant data.

**Superseded.** An earlier revision granted column-scoped `UPDATE (full_name, age, notes)` to
`authenticated` for name corrections. That grant is **withdrawn**; `edit_registration()` replaces
it and records which fields changed (never their values).

**Trade-off.** More RPCs, and a name correction costs a function rather than a `PATCH`. In exchange
both invariants hold *by construction*: not "unlikely to be violated" but unreachable, because the
privilege that would violate them does not exist.

### D8 · No motion library

**Decision.** `motion` is not a dependency. Three CSS primitives plus one `IntersectionObserver`.

**Reason.** Nothing in the design needs spring physics, gestures, layout animation or exit
animation. Saves roughly 35 KB gzipped on the LCP path of a mobile-first page.

**Trade-off.** Complex choreography would be harder later. Nothing planned needs it. Revisit if
shared-layout transitions or gesture-driven UI are ever required.

### D9 · No table library; server-side search, filter, sort and pagination

**Decision.** A semantic `<table>` driven by URL `searchParams`, queried server-side.

**Reason.** The correct privacy posture is to never ship the full participant list to the browser.
Once the query is server-side, a table library solves nothing. A plain table is smaller, more
accessible, printable, and bookmarkable.

**Trade-off.** Sorting costs a round trip. At 40 ms from São Paulo, unnoticeable.

### D10 · No form library

**Decision.** `useActionState` plus a Zod parse on the server.

**Reason.** Three fields. React Hook Form earns its place at roughly ten fields, dynamic arrays, or
cross-field dependencies.

### D11 · Gold, not blue, as the action colour

**Decision.** The primary CTA is `#FFC400` with `#070B1E` text (12.22:1).

**Reason.** The banner already uses yellow for its single most important message
(`INSCRIÇÕES GRATUITAS`). Blue is the page's structural colour and cannot also be the action colour
without breaking colour rationing. Measured: `#1656C4` on `#070B1E` is 2.94:1 — below the 3:1 needed
even for a non-text boundary.

### D12 · Dark public page, light admin

**Decision.** Public is dark-only; admin is light-only.

**Reason.** The public page carries the event's identity, which is dark navy. The admin is a tool
used for long stretches, sometimes in daylight at a venue door, sometimes printed. A dark, animated,
pill-heavy admin would read as a crypto dashboard — explicitly excluded by the brief. Continuity is
kept through the typeface, the spacing scale and the blue accent lineage only.

### D13 · ISR on the public page; no `cacheComponents`

**Decision.** `revalidate = 60` plus targeted on-demand `revalidatePath('/')`. `use cache` /
`cacheComponents` stays off.

**Reason.** The page is 95% static event facts; prerendered HTML from the CDN is what makes the LCP
budget reachable. `cacheComponents` is an opt-in flag bringing a caching model this page does not
need.

**Trade-off.** The advisory state banner can be up to 60 seconds stale. Harmless, because the banner
is explicitly advisory and the authoritative outcome is decided at submit time.

### D14 · `proxy.ts` for session refresh only

**Decision.** `proxy.ts` refreshes the Supabase session cookie on `/admin/*` and performs a
convenience redirect. It is not an authorization boundary. Every page, action and route handler
independently calls `requireAdmin()` / `assertAdmin()`.

**Reason.** Next.js 16 deprecated `middleware.ts` in favour of `proxy.ts` and its own documentation
says to avoid relying on it: *"Always verify authentication and authorization inside each Server
Function rather than relying on Proxy alone"*, and a matcher change can silently remove coverage.

**Test of the decision:** deleting `proxy.ts` must not create a vulnerability — only a worse session
experience.

### D15 · Turnstile required; JavaScript required to submit

**Decision.** Turnstile is mandatory and verified server-side, failing closed. The form cannot be
submitted without JavaScript; everything else on the page works without it.

**Reason.** Accepting tokenless submissions under a stricter rate limit is precisely the bypass a bot
would use. The audience is on modern mobile browsers with JavaScript enabled.

**Trade-off.** Loses progressive enhancement for submission specifically. A `<noscript>` message
explains it and points to the organizers' contact channel (Q3).

### D16 · React 19.2.x, not 19.3.0; TypeScript 5.x, not 6/7

**Decision.** Pin `react`/`react-dom` to 19.2.8; `typescript` to `^5.9`.

**Reason.** React 19.3.0 was published 2026-09-09, nine days *after* Next 16.3.4 — it cannot have
been tested against it. `create-next-app@16.3.4` still pins `typescript: "^5"` despite 6.0.x and
7.0.x existing on npm; follow the framework's own scaffolder.

**Trade-off.** Not on the newest release. Both are low-risk to move once Next names them. Evaluating
TypeScript 7 (the native compiler) is a post-launch task.

### D17 · Four tables, one audit log, no anti-abuse table

**Decision.** `events`, `registrations`, `admin_users`, `admin_actions`. Nothing else — no
conditional infrastructure table either (see D22).

**Reason.** The audit log earns its place by answering "who exported the participant list, and when?"
— a genuine privacy requirement — and "who closed registrations?". Rejected as speculative:
`organizations`, `speakers`, `sessions`, `check_ins`, `notifications`, `tags`, `custom_fields`,
`roles`, `permissions`.

**Refinement.** `admin_actions.actor_user_id` is **nullable** with `ON DELETE SET NULL`, and carries
a `NOT NULL actor_label` snapshot. An earlier revision declared the column `NOT NULL` *and*
`ON DELETE SET NULL`, which is self-contradictory: deleting an administrator would have to violate
one or the other. Null now means something specific and valid — *a since-removed administrator* —
and `actor_label` keeps the record legible, since deleting the account also cascades away the
`admin_users` row that held the name.

### D18 · The multi-event seam is six cheap things and nothing more

**Decision.** `event_id` everywhere, `p_event_id` on every RPC, `events.slug`, a partial unique index
enforcing at most one active event, a single `getActiveEvent()` resolver, and `/` today becoming
`/e/[slug]` later.

**Reason.** These cost nothing now and make a second event a UI change. An event switcher, event
CRUD, templates or an organization model would be building a different product on paper.

### D19 · No live registration count on the public page

**Decision.** The page shows *state* (open / waitlist / full / closed), never numbers.

**Reason.** A number leaks the organization's turnout to anyone with the URL, is stale on a cached
page and therefore a lie, and manufactured scarcity is exactly the pattern the brief prohibits.

### D20 · A typographic hero; the banner presented as a poster

**Decision.** The hero carries no photograph. `banner-original.png` appears further down, presented
as a poster with a soft ground shadow.

**Reason.** Cutting the two people out of a 1080 × 1440 composite yields ~490 × 720 px — too small for
a desktop hero at 2×, and a soft cut-out would undermine everything else. The poster treatment
guarantees an asset we actually have, and gives the page a deliberate "here is the invitation" beat.

**Enhancement path.** A supplied high-resolution cut-out (≥ 1600 px, with rights confirmed) is an
additive change to one section.

### D21 · Public CSP keeps `unsafe-inline` for scripts; admin uses a nonce

**Decision.** Two CSP profiles ([ARCHITECTURE.md § 9.3](./ARCHITECTURE.md)).

**Reason.** A nonce must be unique per response, which forces dynamic rendering. Applying it to `/`
would give up ISR and add 50–150 ms of TTFB to the page whose LCP matters most. The public page
renders no user-generated HTML at all, so the residual XSS surface is essentially nil. The admin —
which does render participant-supplied names — gets the strict nonce policy.

**Trade-off.** Weaker XSS defence in depth on the public page. Listed as Q7 so it can be reversed
deliberately rather than by accident.

### D22 · Deny-by-default routine privileges, with an explicit ACL matrix

**Decision.** Revoke `EXECUTE` from `PUBLIC`, `anon`, `authenticated` and `service_role` on all
existing routines; set `ALTER DEFAULT PRIVILEGES` so future routines inherit the same; then grant
per function, per role, according to the matrix in
[DATABASE-SECURITY.md § 8.5](./DATABASE-SECURITY.md). Every migration that creates a routine carries
its `REVOKE`/`GRANT` in the same file.

**Reason.** Two stacked defaults made this unsafe. PostgreSQL grants `EXECUTE` on new functions to
`PUBLIC` automatically (<https://www.postgresql.org/docs/current/ddl-priv.html>), and Supabase
additionally grants it to `anon`, `authenticated` and `service_role` in the `public` schema
(<https://supabase.com/docs/guides/api/securing-your-api>). A newly created `SECURITY DEFINER`
helper is therefore an anonymous-callable, RLS-bypassing endpoint from the moment it is created,
unless privileges are explicitly withdrawn. The previous revision revoked only from `anon`, and only
for objects that already existed.

**Alternatives.** *Relying on Supabase's announced move to opt-in exposure* — rejected: an
unshipped platform change is not a control. *Putting everything in a private schema* — defensible,
but it complicates PostgREST access for the routines that genuinely need it and would still require
per-function grants.

**Trade-off.** Verbosity: every function carries three extra lines. In exchange, forgetting them is
a review failure and a test failure rather than a silent public endpoint. The matrix covers helper
and trigger routines too — `immutable_unaccent`, `sync_event_counts` and `record_admin_action` are
granted to **nobody**, since generated columns, triggers and definer-to-definer calls do not consult
`EXECUTE` privilege.

### D23 · OTP must not create accounts, and must not leak who is an administrator

**Decision.** Every `signInWithOtp` call passes `options: { shouldCreateUser: false }`. The sign-in
route normalises its response so a known and an unknown address are indistinguishable.

**Reason.** The Supabase default is `true`: "if the user hasn't signed up yet, they are automatically
signed up by default" (<https://supabase.com/docs/guides/auth/auth-email-passwordless>). Left alone,
the public sign-in form mints an `auth.users` identity for any address typed into it. Authorization
would still deny them — `admin_users` is the only source — but "no public administrator signup"
would be false in a way that only shows up in the users table.

**Why both this and the dashboard setting.** Disabling sign-up at project level is a toggle outside
version control that a future operator could flip while debugging. The code-level flag is layered
underneath it, and is reviewed like any other code.

**Trade-off.** With `shouldCreateUser: false` the underlying responses differ for known and unknown
addresses, so the route must deliberately flatten them — a small amount of code whose purpose is
non-obvious, and therefore documented and tested rather than assumed.

### D24 · `settings_version`, not `updated_at`, is the settings conflict token

**Decision.** A dedicated `bigint settings_version` on `events`, incremented **only** by
`update_event_settings()` and `purge_event_registrations()`.

**Reason.** `updated_at` is bumped by the counter trigger on every registration, cancellation and
promotion. Using it as the optimistic-concurrency token meant that a member of the public completing
a registration invalidated an administrator's open settings form — producing
`As configurações foram alteradas por outra pessoa` when no administrator had touched anything, on
precisely the busy evening when the form is most likely to be open.

**Alternatives.** *`settings_updated_at`* — works, but compares timestamps, inviting precision and
clock questions for no benefit. *Comparing the settings values themselves* — cannot distinguish "no
change" from "changed and changed back".

**Trade-off.** One more column. `updated_at` survives as a general row-modification timestamp and is
explicitly documented as **not** a conflict token.

### D25 · Audit records are written inside the mutating transaction

**Decision.** Every database-local administrative mutation ends by inserting its own
`admin_actions` row, inside the same transaction (**I9**). CSV export, which mutates nothing, writes
its audit row *before* streaming. The two Supabase Auth Admin API operations are documented as
genuinely distributed rather than dressed up as transactional.

**Reason.** A separate audit write can fail after a successful mutation, leaving state changed with
no record — which quietly falsifies the privacy claim that every access to participant data is
attributable.

**On the distributed boundary.** A PostgreSQL transaction cannot span an HTTP call, so invite and
removal are ordered to fail closed: invite is Auth-first (a failure leaves an identity with **no**
authorization), removal is database-first (a failure leaves authorization already revoked with a
residual Auth account). Authorization living solely in `admin_users` is what makes both directions
safe.

**Trade-off.** Audit-writing logic lives in SQL rather than TypeScript, which is less familiar to
edit. In exchange the guarantee is real rather than aspirational, and `record_admin_action` is
granted to no role, so a client cannot forge or pollute the log.

### D26 · The event purge is one atomic RPC, and forces registrations closed

**Decision.** `purge_event_registrations(event_id, expected_settings_version)` deletes every
registration for the event in a single set-based statement, drives the counters to zero, sets
`registration_state = 'closed'`, bumps `settings_version`, and writes a counts-only audit record —
all in one transaction.

**Reason.** The admin specification promised "Encerrar evento e apagar dados" with no database
operation behind it, which in practice becomes a JavaScript loop issuing one delete per participant:
slow, non-atomic, and capable of leaving an event half-purged.

**Why it also closes registrations.** Purging while open would restart collection seconds after an
erasure. Forcing `closed` is the safer behaviour, so it is the specified one; bumping
`settings_version` means a settings form open elsewhere conflicts rather than silently re-opening
registrations on its next save.

**Trade-off.** An administrator who wanted to purge and keep collecting must re-open registrations
deliberately. That is the correct amount of friction for the most destructive action in the product.
Repeated calls are idempotent and honestly audited as `deleted_total: 0`.

### D27 · The event starts closed and cannot be opened without a capacity

**Decision.** `capacity` defaults to `0`, `registration_state` defaults to `closed`, and
`CHECK (registration_state <> 'open' or capacity > 0)` (**I7**) makes the unsafe combination
unrepresentable.

**Reason.** The real capacity is unknown, so a placeholder was always going to be seeded. A
placeholder of `0` with registrations open would refuse or waitlist every visitor; any other
placeholder would silently cap the event at a fictional number. Making the state impossible is
better than remembering to fix it.

**Alternatives.** *A `NOT NULL` capacity with no default* — forces a decision at seed time, but that
decision would be a guess. *Application-level validation only* — does not survive a manual `UPDATE`.

**Trade-off.** Opening registrations becomes a two-step act: set a capacity, then open. That is the
intended friction, and it is the one launch gate the system enforces on the organizers' behalf.

---

### D28 · The database rate limiter was removed, not repaired

**Decision.** Turnstile is the **required** abuse control. The Vercel Firewall rule is optional
defense in depth. There is no `abuse_events` table and no database rate limiter.

**Reason.** The previous fallback used `SELECT count(*)` → compare → `INSERT`, which is the exact
race this specification spends § 5 of DATABASE-SECURITY eliminating: concurrent requests all read a
count below the limit and all proceed. Shipping a security control with a known race is worse than
not shipping it, because it invites reliance.

**Why removed rather than made atomic.** An atomic version is easy (`INSERT … ON CONFLICT DO UPDATE
SET hits = hits + 1 RETURNING hits`), so correctness was not the deciding factor. The deciding factor
is that **per-IP limiting is actively harmful for this audience**: Brazilian mobile carriers use
CGNAT extensively, so many legitimate participants — quite possibly a roomful of teenagers on the
same carrier moments after the link is shared — present the same public IP. A limit tight enough to
matter would refuse real registrations. Turnstile discriminates on behaviour and device signals
instead, which is the discrimination this threat actually needs.

**Trade-off.** On a Vercel plan without Firewall rules, Turnstile is the only volumetric control.
Accepted: it is the control that fits the threat, and the partial unique index caps the damage of
any volume of attempts to one seat per phone number. The escalation path, if abuse is ever observed,
is documented in [DATABASE-SECURITY.md § 9.3](./DATABASE-SECURITY.md) and starts with raising
Turnstile's difficulty — a dashboard change, no deploy.

**Consequence.** The "four tables, no more" claim in D17 stands, with no conditional infrastructure
table.

### D29 · Vercel region is configured in `vercel.json`

**Decision.** `{"regions": ["gru1"]}` in `vercel.json`, committed to the repository.

**Reason.** A previous revision claimed the region was set in `next.config.ts`. Vercel does not read
a compute region from the Next.js config; the supported mechanisms are `vercel.json`, Project
Settings → Functions, and `vercel deploy --regions`
(<https://vercel.com/docs/functions/configuring-functions/region>). Since **new projects default to
`iad1` (Washington, D.C.)**, an ineffective setting is not a missed optimisation — it silently puts
every database round trip on a trans-continental path, and a registration makes several.

`gru1` is São Paulo, backed by AWS `sa-east-1`, the same region as the Supabase project
(<https://vercel.com/docs/regions>). It is available on every plan; only *multiple* regions require
Pro or above.

**Alternative.** The dashboard setting alone — works, but is not version-controlled and is invisible
in review. `vercel.json` is primary; the dashboard is the fallback if the file is ever absent.

**Trade-off.** One more configuration file at the repository root.

---

## Part 2 — Open questions

### Resolved

#### Q1 · Event year — **RESOLVED: 2026** ✅

The organizers have confirmed the year. The event is **19 September 2026, 19:00–21:00,
`America/Sao_Paulo`** — a Saturday. The canonical values for seeding are in
[EVENT-SOURCE-OF-TRUTH.md § 2](./EVENT-SOURCE-OF-TRUTH.md):

```
starts_at : 2026-09-19T19:00:00-03:00
ends_at   : 2026-09-19T21:00:00-03:00
```

This is no longer an open question and no longer blocks anything.

### Nothing blocks implementation

Every remaining question below blocks **production launch** or **one specific feature**. None of them
blocks writing, testing or reviewing the system. Phases 0–6 of
[IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) can be completed in full under the recommended
defaults recorded here.

| Question | Blocks | Recommended default in the meantime |
| --- | --- | --- |
| **Q2** data controller | Launch (`/privacidade`) | none — must be a real answer |
| **Q3** contact channel | ~~Launch~~ — **answered**: `contato@euqueroadh.com` | resolved |
| **Q4** retention period | Launch (`/privacidade`) | 90 days after the event |
| **Q5** production SMTP | Launch (admin sign-in in production) | local mail catcher from `supabase start` |
| **Q6** real capacity | Launch (opening registrations) | seeded `closed` with `capacity = 0`, which the schema refuses to open |
| **Q8** minors decision | Launch (`/privacidade`, lawful collection) | no business age restriction; technical bounds 1–120 only |
| **Q7** age restriction | Nothing | none |
| **Q10** speaker | One optional section | the section is simply absent |
| **Q11** logos and Sicredi clearance | Visual polish of one row | 3× WebP crops from the banner |
| **Q12** street-name spelling | Nothing | print exactly what the banner prints |

### Blocks production launch

#### Q2 · Which entity is the data controller?

Three organizations appear under `REALIZAÇÃO`: `Marcados pela Graça`, `Ministério Teen`,
`Assembleia de Deus — Ministério do Belém em Hortolândia`. One of them (or a named partnership) is
legally responsible for the personal data collected.

**Recommended default:** `Assembleia de Deus — Ministério do Belém em Hortolândia`, as the legally
constituted entity of the three. **This is a guess and must be confirmed.**

*Blocks:* publishing `/privacidade`, and therefore launch. Not the build.

#### Q3 · What is the contact channel for participants? — **ANSWERED (12 September 2026)**

**Answer: `contato@euqueroadh.com`.**

It is defined once, as `ORGANIZATION_EMAIL` in `lib/domain/schemas.ts`, and used by the privacy
notice's `Correção e exclusão` section and by the under-12 registration panel. No phone, WhatsApp or
@handle is invented alongside it.

*No longer blocks launch.*

#### Q4 · How long is registration data retained after the event?

**Recommended default: 90 days**, then permanent deletion through
`Encerrar evento e apagar dados` ([ADMIN-SPEC.md § 6.4](./ADMIN-SPEC.md)), which is now a real
atomic operation (D26).

*If different:* only the number in the privacy notice changes; the mechanism is unaffected. Do not
promise a period shorter than the platform's backup retention window actually delivers.

*Blocks:* launch.

#### Q5 · Is a custom SMTP provider available?

Email OTP sign-in needs one **in production**. Supabase's built-in mailer is rate-limited to a
handful of messages per hour and is not for production use.

**Recommended default:** a transactional provider (Resend, Amazon SES, Postmark) on the organizers'
domain.

**This does not block implementation.** `supabase start` runs a local mail catcher that receives OTP
e-mails, so the entire sign-in flow is built and tested in Phase 3 without any provider. The
architecture stays email OTP (D6); SMTP is a deployment step, not a reason to reconsider the
mechanism.

*If it ultimately cannot be arranged:* fall back to email + password, 12-character minimum, with
Supabase's leaked-password protection enabled and `is_active` revocation unchanged. That decision
only needs to be made before Phase 7.

*Blocks:* launch.

#### Q6 · What is the venue's capacity for this event?

**Recommended default:** none — seed `capacity = 0` with registrations `closed`, and let an
administrator set the real number before the link is shared.

**The system enforces this gate itself.** An event cannot be opened while `capacity = 0` (D27,
invariant **I7**), so a forgotten capacity produces a closed event rather than a public page that
refuses or waitlists everyone. This is the one launch decision that cannot be silently skipped.

*Blocks:* opening registrations, and therefore launch.

#### Q8 · Under-18 participation and privacy handling — **a launch gate**

The event is explicitly `para jovens`, one of the organizers is a teen ministry, and **the product
collects age**. Participants under 18 are a reasonable expectation, not an edge case. This was
previously filed as a minor note; it is now a launch-readiness gate.

The specification does **not** invent a parental-consent checkbox, does not impose an age limit, and
does not state what the law requires. **This is not legal advice.** It requires an *answer*, not a
particular answer. Before the link is shared, the organizers must record:

1. whether participants under 18 are expected and accepted;
2. whether any minimum or maximum age applies;
3. what privacy handling they have determined is appropriate, given LGPD Art. 14's specific
   treatment of children and adolescents.

**Recommended default in the meantime:** no business age restriction. Only technical plausibility
bounds (1–120) are enforced, and they are labelled as such throughout.

*If a real restriction is set:* nullable `events.min_age` / `events.max_age`, checked inside
`register_for_event` with its own outcome and pt-BR message — a schema migration plus one branch.

*Blocks:* launch. Detailed in [PRODUCT-SPEC.md § 12.1](./PRODUCT-SPEC.md) and
[DATABASE-SECURITY.md § 12.1](./DATABASE-SECURITY.md).

### Blocks one feature only

#### Q10 · Who is the speaker?

**Default:** the page makes no claim about a speaker.

*If supplied:* a short `Quem vai falar` block between **O convite** and **Detalhes** — name,
one-line credential, optional photograph. Purely additive, and a genuine conversion factor.

#### Q11 · Is the Sicredi mark cleared for web use, and are vector logos available?

**Default:** render the `Realização` / `Apoio` bar with 3× WebP crops from the banner.

*If vectors are supplied:* crisper at every size, especially on desktop. *If clearance is refused:*
render `Apoio: Sicredi` as text only.

### Blocks nothing

#### Q7 · Is there a business age restriction? — **ANSWERED (12 September 2026)**

**Answer: yes. Online registration is for 12 and over.** Anyone younger is directed to
`contato@euqueroadh.com` and is handled by the organization directly; the site collects nothing from
them.

Implemented exactly as this entry said it would be if an answer arrived: nullable `events.min_age` /
`events.max_age` (migration `20260912090000_event_age_policy.sql`), checked **inside**
`register_for_event()` under the event row lock, with its own `age_not_eligible` outcome and its own
pt-BR panel. The seeded event carries `min_age = 12`; the migration backfills it for an
already-seeded database, so production receives the policy by running migrations rather than by hand.

Three consequences are deliberate:

- **`registrations.reg_age_range` (1–120) is unchanged.** It is a technical plausibility bound on the
  column, not an eligibility rule. An administrator correcting a record through `edit_registration()`
  is not performing an online registration, so `adminAgeSchema` stops at the technical bounds while
  `ageSchema` applies the floor.
- **No parental-consent checkbox, and no guardian fields.** Ages 12–17 use the ordinary three-field
  flow. Adding a guardian field to satisfy a tick box would collect *more* personal data about a
  child, not less.
- **Eligibility is checked before the open/closed switch.** Telling a ten-year-old
  `inscrições encerradas` would invite them back later, when the answer would still be no.

Distinct from Q8, which is about privacy handling rather than eligibility, and which remains open.

#### Q9 · Should an e-mail address be collected?

**Default:** no. Only the three confirmed fields.

*If added:* waitlist promotion becomes automatable, which would materially improve the product and
would justify revisiting D2. It also adds a personal-data field, a conversion cost, and a new
duplicate-key question. A deliberate product trade-off for the organizers, not a default.

#### Q12 · Is the street name `Possidonio` or `Possidônio`?

The banner prints it without the circumflex; Brazilian street registries commonly use `Possidônio`.

**Default:** publish exactly what the banner prints. Do not silently "correct" a proper name.

---

## Part 3 — Summary for the implementer

**Start now.** Nothing on this list blocks Phase 0.

| | |
| --- | --- |
| **Resolved** | Q1 — the event is **19 September 2026**, 19:00–21:00, `America/Sao_Paulo`. |
| **Blocks implementation** | **Nothing.** |
| **Blocks production launch** | Q2 (data controller), Q4 (retention), Q5 (production SMTP), Q6 (real capacity), Q8 (minors privacy handling). **Resolved:** Q3 (contact channel — `contato@euqueroadh.com`) and Q7 (age policy — online minimum 12). Collected as the launch gate in [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) Phase 7. |
| **Blocks one feature** | Q10 (speaker section), Q11 (vector logos). |
| **Blocks nothing** | Q7, Q9, Q12 — documented defaults apply. |

Two of the launch gates are enforced by the system rather than by memory: an event **cannot** be
opened without a capacity (Q6, D27), and the privacy-page placeholders are visible constants rather
than silent omissions (Q2–Q4). The rest need a human before the link goes out.

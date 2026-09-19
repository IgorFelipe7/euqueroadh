# Raffle & Certificate — Specification

Two new surfaces, plus the one thing they both stand on.

| | What it is | Who operates it | When it runs |
| --- | --- | --- | --- |
| **Attendance** | A check-in mark on a registration | An organizer, on a phone, at the door | 18:30–19:15 on the day |
| **Raffle** | A live, projected draw among the people in the room | An operator, from the projected screen itself | During the event |
| **Certificate** | A personal, downloadable certificate of participation | The guest, from a private link | After the event |

Attendance is not a third feature bolted on. It is the fact both other features are *about*: a raffle
draws from the people who are present, and a certificate of participation asserts that someone
participated. Building either on `status = 'confirmed'` alone would make the first unfair and the
second false.

This document is the source of truth for these three once approved, in the same way
[ADMIN-SPEC.md](./ADMIN-SPEC.md) is for the admin. It extends, and never contradicts,
[ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE-SECURITY.md](./DATABASE-SECURITY.md) and
[VISUAL-DIRECTION.md](./VISUAL-DIRECTION.md).

> **Scope change, recorded.** [PRODUCT-SPEC.md § 2.2](./PRODUCT-SPEC.md) lists "QR check-in,
> attendance tracking" as out of scope for V1. This document supersedes that line for attendance
> only. QR codes, seat maps, tickets and payments remain out of scope.

---

## 0. Delivery order

The event is **19/09/2026, 19:00–21:00**. That is not a scheduling detail, it is the constraint that
orders the work:

| Phase | Contents | Must be live by |
| --- | --- | --- |
| **A** | Attendance: column, RPC, ACL, the door screen | 19/09 18:00 |
| **B** | Raffle: tables, RPCs, control room, the stage | 19/09 19:00 |
| **C** | Certificate: token, public route, the two images, admin distribution | any time after 21:00 |

Phase C is genuinely unhurried — a certificate is invalid before the event ends, so there is nothing
to ship early. Phases A and B are not. If time runs short in B, the fallback is stated in § 3.9.

---

## 1. Attendance

### 1.1 Data

```sql
alter table public.registrations add column attended_at timestamptz;

create index registrations_attended_idx
  on public.registrations (event_id)
  where attended_at is not null;
```

One nullable timestamp. `null` means "not checked in"; a value means "checked in, at this moment".
A boolean would answer "were they here" but not "when did they arrive", and the timestamp costs the
same.

**No `attended_count` counter on `events`.** The confirmed/waitlist counters exist because I1 — never
oversold — is a `CHECK` constraint that can only reference columns on its own row (D1). Attendance
carries no invariant: there is no maximum number of people who may be present. A `count(*)` over the
partial index above, at three hundred rows, is free. Adding a counter would mean touching
`sync_event_counts()`, which is the single most load-bearing trigger in the schema, for a number that
no constraint needs.

### 1.2 The routine

```
set_registration_attendance(p_registration_id uuid, p_present boolean)
  returns table (registration_id uuid, attended_at timestamptz)
```

The standard six-step shape (DATABASE-SECURITY.md § 6): authorize → lock the event row (I6) →
re-read the registration under the lock → validate → mutate → audit → narrow return.

Two validations:

- The registration must exist.
- Its status must be `confirmed`. A `waitlisted` person standing at the door is a *promotion*, not a
  check-in — the organizer promotes them first, which is an existing, capacity-checked, audited
  action. Silently marking them present would put someone in the room that I1 says has no seat.
  Raises `not_confirmed`.

Idempotent on purpose: `attended_at = coalesce(attended_at, now())` when checking in, so a double tap
at the door does not rewrite the arrival time. `p_present = false` clears it, for the mis-tap.

Audit action: **`registration.attendance_set`**, metadata `{"present": true|false}` — a boolean and
nothing else. No name, no phone (admin_actions.metadata rule).

The event row is locked even though attendance touches no counter. It keeps I6 — *always the event
before the registration* — true by construction rather than by a case-by-case argument, and two
organizers checking people in at a door contend for microseconds.

### 1.3 The door screen — `/admin/presenca`

A fifth destination in the admin nav. This is the one admin screen that is used **standing up, one
handed, in a queue, possibly on bad 4G**, and it is designed for exactly that and nothing else:

- One search field, autofocused, `inputmode="search"`. It searches the existing accent-insensitive
  `search_name` and the phone prefix — the same two indexes `/admin/inscricoes` already uses.
- Results are rows of **one name, one 56 px button**. Not a table. The button says `Marcar presença`
  and, once pressed, becomes `Presente · 18:47` with the confirmed status colour.
- The check-in is a Server Action with an optimistic pending state, so the button responds on tap and
  reconciles after. On failure it reverts and says why.
- A running count in the header: `31 de 80 presentes`. That number is the raffle's pool size, so the
  operator can see the draw is meaningful before running it.
- The whole screen works with JavaScript disabled — it is a form per row — it just loses the
  optimistic state.

`/admin/inscricoes` also gains a `Presença` column and the same toggle in the row detail, because the
registrations table stays the place where everything about one person is visible at once.

---

## 2. The fairness property

Before any raffle design: **the winner is chosen by PostgreSQL, inside a transaction, and written to
a table before the browser is told anything.** The animation on the projected screen is theatre
replayed over a result that already exists.

This is the entire security model of the feature, and it is worth being explicit about what it buys:

- Reloading the stage mid-animation shows the same winner. A crashed laptop does not re-roll.
- No code in the browser can influence, preview or re-run the outcome. The operator cannot either.
- Every draw is a row with its `pool_size`, its `pool_offset` and its 16-byte `seed`. The draw is
  **replayable**: order the eligible pool by `id`, derive the offset from the seed by the documented
  formula, take that element. Anyone with database access can verify any past draw, months later.

The implementation is deliberately *not* `order by random() limit 1`. That is equally fair and
entirely unverifiable — once it has run, nothing remains that proves what the pool was or that the
result was not chosen. Recording the seed and the pool size turns a promise into evidence, for one
extra `bytea` column.

**Bias.** The offset is `(first 60 bits of sha256(seed)) mod pool_size`. Modulo over a 60-bit uniform
value with a pool in the hundreds skews the result by under one part in 2⁵⁰. Recorded here so nobody
"fixes" it later with rejection sampling and a loop.

**Not implemented: commit–reveal.** Publishing `sha256(seed)` before the draw and revealing the seed
after would let the *audience* verify, not just an administrator. It is the correct upgrade if the
draw is ever streamed to people who have reason to doubt the organizers. For a church youth event, it
buys ceremony the room does not need. The schema is already compatible — the seed column is there.

---

## 3. Raffle

### 3.1 Data

```sql
create type public.raffle_pool         as enum ('attended', 'confirmed');
create type public.raffle_status       as enum ('draft', 'running', 'finished');
create type public.raffle_draw_outcome as enum ('pending', 'confirmed', 'forfeited');

create table public.raffles (
  id                       uuid primary key default gen_random_uuid(),
  event_id                 uuid not null references public.events(id) on delete cascade,
  name                     text not null,               -- "Sorteio 1"
  prize_label              text,                        -- "Kit de educação financeira"
  pool                     public.raffle_pool not null default 'attended',
  winners_target           integer not null default 1,
  exclude_previous_winners boolean not null default true,
  status                   public.raffle_status not null default 'draft',
  draw_seq                 integer not null default 0,  -- monotonic; never reset (cf. I4)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint raffles_name_length     check (char_length(btrim(name)) between 2 and 80),
  constraint raffles_prize_length    check (prize_label is null
                                            or char_length(btrim(prize_label)) between 2 and 80),
  constraint raffles_winners_target  check (winners_target between 1 and 50)
);

create table public.raffle_draws (
  id              uuid primary key default gen_random_uuid(),
  raffle_id       uuid not null references public.raffles(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  draw_index      integer not null,
  outcome         public.raffle_draw_outcome not null default 'pending',

  -- the three values that make the draw replayable (§ 2)
  pool_size       integer not null,
  pool_offset     integer not null,
  seed            bytea   not null,

  drawn_at        timestamptz not null default now(),
  decided_at      timestamptz,

  constraint raffle_draws_offset_in_pool check (pool_offset >= 0 and pool_offset < pool_size),
  constraint raffle_draws_decided_iff    check ((outcome = 'pending') = (decided_at is null))
);

create unique index raffle_draws_one_per_person on public.raffle_draws (raffle_id, registration_id);
create unique index raffle_draws_index_uidx     on public.raffle_draws (raffle_id, draw_index);
```

**`registration_id` cascades, and no name is snapshotted.** This is the opposite of the choice made
for `admin_actions.actor_label`, and deliberately so. An audit record must outlive what it describes,
because its purpose is accountability. A raffle result is not an audit record — it is a *result*, and
its subject's identity is participant personal data, which lives in exactly one table. When
`purge_event_registrations()` erases participants under LGPD, it must take the raffle results with
it, and `on delete cascade` is what guarantees that no copy of a name survives in a second place. The
`raffle.drawn` audit row remains, carrying counts and ids only, which is the correct residue.

**`draw_index` is monotonic and never reused**, exactly like `waitlist_rank` (I4). A forfeited draw
keeps its index. The sequence of draws is the record of what actually happened on stage, including
the person who was not in the room.

### 3.2 Drawing

```
draw_raffle_winner(p_raffle_id uuid)
  returns table (draw_id uuid, registration_id uuid, full_name text,
                 draw_index integer, pool_size integer)
```

1. **Authorize.** `is_active_admin()`, as the first statement.
2. **Lock, in order.** Event row `FOR UPDATE`, then the raffle row `FOR UPDATE`. This extends I6 to a
   single global order — **event → raffle → registration** — so no pair of routines can deadlock.
3. **Refuse if complete.** `confirmed` draws ≥ `winners_target` → `raffle_complete`.
4. **Refuse if a draw is undecided.** A `pending` draw exists → `draw_pending`. One winner is on
   screen at a time; the operator must confirm or forfeit before drawing again. This is what stops a
   double-press of the space bar from burning two prizes.
5. **Build the pool**, ordered by `id` so it is reproducible:

   ```sql
   select r.id
     from public.registrations r
    where r.event_id = v_event.id
      and r.status = 'confirmed'
      and (v_raffle.pool <> 'attended' or r.attended_at is not null)
      and not exists (select 1 from public.raffle_draws d
                       where d.raffle_id = p_raffle_id and d.registration_id = r.id)
      and (not v_raffle.exclude_previous_winners or not exists (
            select 1 from public.raffle_draws d
              join public.raffles o on o.id = d.raffle_id
             where o.event_id = v_event.id and d.outcome = 'confirmed'
               and d.registration_id = r.id))
    order by r.id
   ```

   Empty → `pool_empty`. Anyone already drawn in *this* raffle is out, forfeited or not: a person who
   was not in the room does not get a second chance at the same prize.
6. **Draw.** `seed := gen_random_bytes(16)`, `offset := (sha256(seed)[0:60] mod pool_size)`,
   winner := the element at `offset`.
7. **Record.** Insert the draw at `draw_seq + 1`, bump `draw_seq`, set `status = 'running'`.
8. **Audit.** `raffle.drawn`, metadata `{"raffle_id": …, "draw_index": n, "pool_size": n}`. The
   winner goes in `admin_actions.registration_id`, which is an id, not personal data.
9. **Return** the winner. The RPC returns the full name; masking for the projector is presentation
   and happens in § 3.6.

```
resolve_raffle_draw(p_draw_id uuid, p_outcome public.raffle_draw_outcome)
```

`confirmed` or `forfeited` only — `pending` is not an outcome anyone can set. Same lock order, same
audit discipline (`raffle.draw_resolved`). When the confirmed count reaches `winners_target`, the
raffle flips to `finished` in the same transaction.

Also: `create_raffle`, `update_raffle` (draft only — a raffle that has drawn cannot have its pool
changed underneath its own history), `delete_raffle`, `reset_raffle` (deletes the draws, keeps
`draw_seq`, audits `raffle.reset`; for the rehearsal before the doors open).

### 3.3 ACL

Every routine above: `revoke all … from public, anon, authenticated, service_role` then
`grant execute … to authenticated`. No raffle routine is reachable with the secret key, because none
of them is part of the public path. `DATABASE-SECURITY.md § 8.5`'s matrix gains one row per routine.

RLS: `enable row level security` on both tables, one `for select to authenticated using
(is_active_admin())` policy each, `grant select` to `authenticated` only. `anon` and `service_role`
get nothing, matching `registrations`.

### 3.4 The control room — `/admin/sorteio`

The ordinary light admin. A list of raffles for the active event, each showing name, prize, pool
mode, `2 de 3 sorteados`, and two actions: `Configurar` and `Abrir palco`. Creating a raffle is four
fields. This screen is used sitting down, the day before.

### 3.5 The stage — `/admin/sorteio/[id]/palco`

**This screen is the one exception to "the admin is light" (VISUAL-DIRECTION § 12).** It is not a
tool an organizer reads; it is a surface an audience watches. It wears the event's own dark identity
because the room is looking at it. The exception is narrow and stated here so it is not read as
licence to darken anything else in the admin.

It is also **the control**. There is no second device, no realtime channel, no polling loop. The
operator's laptop is plugged into the projector, and the operator presses the space bar on the screen
everyone is watching. That is one moving part instead of three, and the three would each be a way for
the most visible sixty seconds of the evening to fail.

Consequence, which is a design requirement rather than a side effect: **the stage has no visible
chrome.** Controls fade out after three seconds of no input and return on pointer move or key focus.
What the room sees is the composition, never a toolbar. A single hint pill, `barra de espaço para
sortear`, is present before the first draw and never again.

Keyboard is the whole interface: `espaço` draws, `enter` confirms the winner, `x` forfeits and
redraws, `f` toggles fullscreen, `esc` leaves. Every one of them is also a real, focusable button in
the fade-out layer, because a keyboard-only interface is not an accessible one.

### 3.6 Names on screen

Decided: **first name + last initial** — `Ana S.`, `Lucas M.` — for the reel and for the winner.

The audience is `PARA JOVENS`; some are minors; the screen may be photographed, streamed or posted.
A full name broadcast that way cannot be withdrawn afterwards. The masked form keeps every bit of the
drama — the room recognises `Ana S.` instantly — and gives up nothing but the exposure.

Enforced where it cannot drift: **the stage's Server Component sends the browser only masked labels.**
The reel's pool is a `string[]` of masked names. The full name is returned by `draw_raffle_winner` to
the server and is displayed to the *operator* in the confirm control, so they can announce the right
person, but it is never part of the projected composition. Masking is a pure function in
`lib/domain/format.ts`, unit-tested against the accented, compound and single-word Brazilian names
that break naive `split(' ')` implementations (`Ana`, `Maria da Silva`, `João D'Ávila`).

### 3.7 The composition

Held to the same rules as the public page — one subject with room around it, depth from one light
source, rationed colour, ornament that carries meaning (VISUAL-DIRECTION § 2.2).

```
┌────────────────────────────────────────────────────────────────┐
│  SORTEIO 1                              ●●○  2 de 3            │  tracked caps, muted
│                                                                │
│                                                                │
│            Kit de educação financeira                          │  h3, secondary
│                                                                │
│                    Ana S.                                      │  display-1, two-tone
│            ────────────────────────                            │  the chart line
│                                                                │
│                                                                │
│  ┌ já sorteados ─────┐                        [ confirmar ]    │  fades out
│  │ Lucas M.  Bia R.  │                        [ não está aqui ]│
│  └───────────────────┘                                         │
└────────────────────────────────────────────────────────────────┘
```

- **Field.** `ink-900`, the existing grain, one radial glow behind the name — the page's single light
  source, reused, not a second one.
- **The ornament is the event's own chart.** `components/site/chart-motif.tsx` and
  `counting-rail.tsx` already exist. The reel's motion is expressed through the counting rail's beads
  rather than through anything borrowed from a slot machine. The rule under the winner's name is the
  chart line itself, drawn to its resting point. Ornament that is the event's subject passes the
  meaning test (§ 1.7 of VISUAL-DIRECTION); a spinning wheel would fail it.
- **Two-tone name.** First name white, initial `sky-300` — the same relationship as
  `educação` / `Financeira`.
- **Gold appears once**, on the confirm action. Nowhere else on the stage.

**The draw, 3.2 s.** A vertical strip of masked labels translating under an alpha mask, decelerating
on one custom `cubic-bezier(.12,.72,.1,1)`, settling on the winner's label — which is placed at the
landing position the moment the server returns it. `transform: translate3d` and `opacity` only. No
`filter: blur` (it is the one property that will drop frames on a mid-range laptop driving a
projector); the speed blur is a duplicated ghost layer at low opacity, which is free.

**The settle, 600 ms.** The glow blooms once, the rail's beads light gold and fall back. That is the
entire celebration. No confetti, no burst, no sound. The reference-led argument is in
VISUAL-DIRECTION § 1.7: the page's one decorative element must carry meaning, and a confetti cannon
carries none. The feeling to aim for is **a precision instrument coming to rest**, not a casino.

**`prefers-reduced-motion`.** The reel becomes three cross-faded labels over 900 ms and the settle
becomes a 200 ms opacity change. The result is identical; only the theatre is removed.

### 3.8 What this screen must never become

Recorded so a later session does not "improve" it: no wheel of fortune, no slot-machine reels with
frames and lever, no confetti, no drum roll, no neon, no gradient mesh, no card grid of participants,
no live counter of "pessoas concorrendo" in large type, no logos of anything, no countdown timer.

### 3.9 If Phase B runs short

The stage degrades in one step: with `draw_raffle_winner` and the two RPCs in place but no animation,
the stage renders the winner with a 600 ms cross-fade. The feature is correct, auditable and usable;
it is only less beautiful. **The database half of Phase B is what must not be cut**, because a raffle
that is decided in the browser cannot be made trustworthy afterwards.

---

## 4. Certificate

### 4.1 Access — the token

```sql
create function public.new_certificate_token() returns text …   -- 20 random bytes, url-safe base64
alter table public.registrations
  add column certificate_token text not null default public.new_certificate_token();
create unique index registrations_certificate_token_uidx on public.registrations (certificate_token);
```

160 bits, 27 URL-safe characters, one per registration, assigned at insert. The route is
`/certificado/<token>`.

**There is no lookup by phone number, and this is the point.** A page that answers "what is the name
registered to this number" is a personal-data disclosure endpoint with a form in front of it. Rate
limits and Turnstile reduce the volume of that disclosure; they do not change what it is. An
unguessable link discloses nothing to anyone who does not already have it.

The consequence is that the organizer distributes the links, which is why § 4.6 exists.

**No `certificate_code` column.** A short human-readable verification code would need its own
uniqueness handling, and nothing consumes it: verification runs through an authenticated
administrator, who has the registration in front of them. The certificate shows its issue date and
nothing that looks like a serial number it cannot honour.

### 4.2 The gate

`events.certificates_enabled boolean not null default false`, flipped by the organizer after the
event, through `update_event_settings()` (whose signature gains the parameter, in the manner of
migration `20260912090000`). Before it is on, a valid token renders *"disponível após o evento"* —
not an error, because the link is correct and the guest did nothing wrong.

A certificate is issued when **all** of: the token matches, `status = 'confirmed'`,
`attended_at is not null`, and `certificates_enabled`. A certificate of participation for someone who
did not participate is a false document; the attendance mark from § 1 is what makes it true.

### 4.3 Reading it

`registrations` is unreachable by `anon` and by `service_role` (migration 10), and that stays true.
The public page reads through one new routine:

```
get_certificate(p_token text)
  returns table (full_name text, attended_at timestamptz, event_slug text, event_title text,
                 starts_at timestamptz, ends_at timestamptz, timezone text,
                 venue_name text, venue_city text, venue_state text)
```

`SECURITY DEFINER`, `grant execute … to service_role` **only** — the same posture as
`register_for_event`. It returns the recipient's name and the event's public display fields, and
**never** `phone_e164`, `age`, `notes`, `waitlist_rank` or any id. A token that does not match, or
that matches a registration failing § 4.2, returns zero rows — one response for every negative case,
so the page cannot be used to distinguish "no such token" from "that person did not attend".

The browser still never contacts Supabase (D4). The page is a Server Component holding the secret key
server-side, exactly like `/`.

### 4.4 The artefacts

Rendered with `next/og`, which the repository already uses for `app/opengraph-image.tsx`. **No new
dependency.**

| Route | Size | Purpose |
| --- | --- | --- |
| `/certificado/<token>` | — | The HTML page: preview, the two download buttons, print stylesheet |
| `/certificado/<token>/imagem` | 2000 × 1414 | A4 landscape (√2), ~170 dpi at A4, for saving and printing |
| `/certificado/<token>/story` | 1080 × 1920 | Instagram/WhatsApp story |

**Why PNG is primary and PDF is not.** The audience is young people on phones. A PNG saves to the
gallery in one tap, sends on WhatsApp, and posts to a story — which is what will actually happen to
this file. A real vector PDF would mean a second layout engine and a new dependency (`pdf-lib`) for a
format most of this audience will never open. The HTML page carries a proper `@media print`
stylesheet, so anyone who *does* want a vector PDF gets one through the browser's own print dialog,
at no cost to the bundle.

**The story format is not a bonus.** It is the version that leaves the site, and it carries the
event's identity and date into feeds the organizers could not otherwise reach. It is the same layout
code at a different aspect ratio.

**Fonts.** Satori renders with a bundled face with no weight range — the OG image documents this
trade and accepts it. A certificate cannot: the 300/800 weight jump between `educação` and
`Financeira` *is* the identity, and the recipient's name is the whole composition. Two static Archivo
faces (Regular, ExtraBold, ~90 KB each) go in `assets/fonts/` and are passed to `ImageResponse`. That
is a build asset, not a dependency. If the files cannot be obtained, the fallback is the OG image's
trade — hierarchy by size and tier alone — and the certificate is noticeably worse.

### 4.5 The design

The banner, read as a document. Navy field, the chart, the two-tone display type, the blue panel
along the bottom carrying `REALIZAÇÃO` and `APOIO` — the same structure the banner itself uses, and
the same one the site footer already implements.

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  CERTIFICADO DE PARTICIPAÇÃO                                         │  kicker, sky-300
│                                                                      │
│                                                                      │
│  Ana Beatriz Souza                                                   │  display, two-tone
│  ╱‾╲__╱‾‾╲___╱‾‾‾‾╲______________________________________            │  the chart, as the rule
│                                                                      │
│  participou da palestra Educação Financeira para Jovens,             │  secondary, 62ch
│  realizada em 19 de setembro de 2026, das 19h às 21h,                │
│  no Espaço Cezanne Eventos, em Hortolândia/SP.                       │
│                                                                      │
│                                                                      │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ REALIZAÇÃO                                    APOIO              │ │  blue-500 panel
│ │ ▮ Marcados pela Graça  ▮ Ministério Teen      ▮ Sicredi          │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

The one idea worth building: **the chart motif is the rule under the name.** It is simultaneously the
event's subject, the identity's signature element, and the structural line a certificate needs
beneath its recipient. Ornament doing three jobs is not ornament.

Gold appears once — a short rule, or the issue date's leading mark. The name is the only display-size
element; everything else is small. There is no seal, no border filigree, no ribbon, no serif
"Certificate of Achievement" lettering, no faux-parchment. The certificate looks like the event.

### 4.6 Distribution

> **Superseded as the PRIMARY method by [D45](./DECISIONS.md).** The per-row actions below are
> unchanged and still work; they are now the **fallback**. What replaced them is one public address —
> `euqueroadh.com/certificado` — that the organizer posts once, and that identifies each participant by
> telephone number and first name before redirecting them to the very token route described here.
>
> The reason is not that the reasoning below was wrong. It is that "the organizer distributes the
> links" was costed: three hundred links, copied and sent one at a time, means most people never
> receive one and the ones who do receive them through a chain of forwards in which a personal
> capability is pasted into group chats. The disclosure § 4.1 refused to build is the disclosure the
> distribution method produced anyway, at greater cost. See PRODUCT-SPEC.md § 15.

The system sends no messages (D2), so the organizer does. `/admin/inscricoes` gains, per row:

- **`Copiar link`** — the certificate URL to the clipboard.
- **`Enviar no WhatsApp`** — `https://wa.me/<e164>?text=<pre-written message with the link>`. One
  tap opens WhatsApp with the message ready. No integration, no API, no credential, no new
  dependency — a link.
- The CSV export gains a `certificado_url` column, for a mail merge.

Only rows that satisfy § 4.2 show these actions, so an organizer cannot send a link that will render
"não disponível".

### 4.7 Exposure

- `robots.ts` disallows `/certificado` and `/presenca`, both pages set
  `robots: { index: false, follow: false }`, and `next.config.ts` sends `X-Robots-Tag: noindex,
  nofollow, noarchive` on both subtrees. A personal document must not be indexed; neither must an
  identification form over personal data, nor a live check-in capability.
- The page, both image routes, the portal and the check-in page all send
  `Cache-Control: private, no-store`. A shared CDN must never hold one person's certificate, one
  person's identification attempt, or a session token.
- The public CSP already covers these routes; they need no relaxation. The page is static content and
  two images.
- The page renders a participant-supplied name, so it renders it as text, through React, with no
  `dangerouslySetInnerHTML` anywhere near it.

---

## 5. New decisions, for DECISIONS.md

| | Decision |
| --- | --- |
| **D30** | Attendance is one nullable timestamp with no counter, because it carries no invariant |
| **D31** | The winner is drawn in the database and recorded before the browser is told; the animation is theatre over a decided result |
| **D32** | Draws store `seed`, `pool_size` and `pool_offset`, making every past draw replayable |
| **D33** | `raffle_draws` cascades from `registrations` and snapshots no name: a result is not an audit record, and LGPD erasure must reach it |
| **D34** | The stage is the control; no second device, no realtime, no polling |
| **D35** | Projected names are masked to first name + initial, enforced by sending the browser nothing else |
| **D36** | Certificate access is an unguessable per-registration token; there is no lookup by phone |
| **D37** | Certificates are PNG via `next/og` — no PDF dependency; print-to-PDF covers the vector case |
| **D38** | The stage is the single, stated exception to "the admin is light" |

## 6. Test obligations

Beyond the existing suites' patterns:

- **pgTAP** — one file per feature. The ACL matrix test (`10-function-acl.sql`) and the table ACL
  test (`12-table-acl.sql`) iterate programmatically and will fail automatically if a new routine or
  table is left ungranted or over-granted. That is the point of them; no new routine gets an
  exemption.
- **Node concurrency** — two `draw_raffle_winner` calls in parallel must produce one winner and one
  `draw_pending`; a draw and a `set_registration_attendance` in parallel must not deadlock (the § 3.2
  lock order is what this proves).
- **Replay** — a test that re-derives a recorded draw's winner from its stored seed and pool and
  asserts it matches. This is the assertion that keeps § 2 true over time.
- **Vitest** — the name-masking function against accented, compound and single-word names.
- **Playwright** — the door screen check-in round trip; a certificate page for a valid token, an
  unknown token, and a confirmed-but-absent registration, asserting the last two are indistinguishable.
- **axe** — the stage at its three states (idle, drawing, settled) and the certificate page.

---

## 7. What is still open

1. **Prizes.** `prize_label` is free text. Nothing tracks whether a prize was handed over. If that
   matters, it is a column on `raffle_draws`, not a new table.
2. **Multiple events.** Everything here hangs off `event_id` and follows the D18 seam. Nothing new is
   owed.
3. **The certificate's wording.** § 4.5 drafts it from the confirmed facts in
   EVENT-SOURCE-OF-TRUTH.md. It should be read by an organizer before the first link is sent — it is
   a document going out under their name.

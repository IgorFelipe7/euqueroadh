-- Migration 4 — registrations, the duplicate rule (I3) and the waitlist order key (I4).

create table public.registrations (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,

  full_name         text     not null,
  age               smallint not null,
  phone_e164        text     not null,

  status            public.registration_status not null,

  -- Assigned once, when the person enters the waitlist; retained after promotion or cancellation.
  -- It is a HISTORICAL order key, not a live queue position, which is what makes promotion order
  -- auditable and re-registration well defined.  Never renumber it (I4).
  waitlist_rank     integer,

  notes             text,   -- admin-only, never shown publicly

  created_at        timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),

  constraint reg_name_length check (char_length(btrim(full_name)) between 2 and 120),
  -- Technical plausibility only. This is deliberately NOT an eligibility rule; a business
  -- restriction would become events.min_age/max_age checked inside register_for_event().
  constraint reg_age_range   check (age between 1 and 120),
  -- Shape only. The ANATEL DDD allowlist lives in application code because it changes; the
  -- +55 DD 9 NNNNNNNN shape does not.
  constraint reg_phone_shape check (phone_e164 ~ '^\+55[1-9]{2}9[0-9]{8}$'),
  constraint reg_waitlist_rank_present
    check (status <> 'waitlisted' or waitlist_rank is not null)
);

-- Accent-insensitive name search: searching "Joao" must find "João" (§ 3.4).
alter table public.registrations
  add column search_name text
  generated always as (lower(public.immutable_unaccent(full_name))) stored;

-- I3: one active registration per (event, canonical phone).  Partial on purpose — a cancelled
-- person may register again (PRODUCT-SPEC.md § 9).  This index is also the backstop that makes
-- the duplicate race impossible when the graceful path in register_for_event() is bypassed.
create unique index registrations_active_phone_uidx
  on public.registrations (event_id, phone_e164)
  where status <> 'cancelled';

-- I4 backstop: no two people can share a queue position.
create unique index registrations_waitlist_rank_uidx
  on public.registrations (event_id, waitlist_rank)
  where waitlist_rank is not null;

-- Promotion picks the N oldest without a sort.
create index registrations_waitlist_order_idx
  on public.registrations (event_id, waitlist_rank)
  where status = 'waitlisted';

create index registrations_event_created_idx
  on public.registrations (event_id, created_at desc);

create index registrations_event_status_created_idx
  on public.registrations (event_id, status, created_at desc);

create index registrations_search_name_trgm_idx
  on public.registrations using gin (search_name extensions.gin_trgm_ops);

create index registrations_phone_prefix_idx
  on public.registrations (event_id, phone_e164 text_pattern_ops);

comment on column public.registrations.waitlist_rank is
  'I4: historical, immutable order key. Never recalculated, never renumbered, never reused.';

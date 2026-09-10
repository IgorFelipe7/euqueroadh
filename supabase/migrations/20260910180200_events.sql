-- Migration 3 — events.
--
-- Invariants carried by this table: I1 (never oversold), I5 (one active event),
-- I7 (an event cannot be open without a meaningful capacity), I8 (settings_version is a
-- settings-only concurrency token).

create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,

  -- display copy: seeded from EVENT-SOURCE-OF-TRUTH.md, read-only in the V1 UI
  title              text not null,
  kicker             text,
  audience_label     text,
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  timezone           text not null default 'America/Sao_Paulo',
  venue_name         text,
  venue_address_line text,
  venue_district     text,
  venue_city         text,
  venue_state        text,
  price_label        text,
  is_free            boolean not null default true,
  includes_label     text,

  -- admin-configurable behaviour
  capacity           integer not null default 0,
  waitlist_enabled   boolean not null default true,
  registration_state public.registration_state not null default 'closed',  -- fail safe; see I7
  is_active          boolean not null default false,

  -- derived state, maintained exclusively by the sync_event_counts() trigger (I2)
  confirmed_count    integer not null default 0,
  waitlist_count     integer not null default 0,
  waitlist_seq       integer not null default 0,

  -- concurrency tokens
  settings_version   bigint not null default 1,   -- I8: advanced by settings mutations ONLY
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),  -- any modification, counters included

  constraint events_capacity_non_negative check (capacity >= 0),
  constraint events_counts_non_negative   check (confirmed_count >= 0 and waitlist_count >= 0),

  -- I1.  The load-bearing constraint of the whole system: no code path, present or future,
  -- correct or buggy, can oversell the event.  It is expressible only because the counter is
  -- stored on this row (§ 4).
  constraint events_confirmed_within_capacity check (confirmed_count <= capacity),

  -- I7.  Makes "open with a forgotten placeholder capacity" unrepresentable, in both directions:
  -- opening at capacity 0 is rejected, and so is lowering capacity to 0 while open.
  constraint events_open_requires_capacity
    check (registration_state <> 'open' or capacity > 0),

  constraint events_ends_after_starts check (ends_at is null or ends_at > starts_at)
);

-- I5: at most one active event, without building a multi-event CMS.
create unique index events_single_active_uidx
  on public.events ((true)) where is_active;

comment on column public.events.settings_version is
  'I8: optimistic-concurrency token for ADMIN SETTINGS only. Advanced by update_event_settings() '
  'and purge_event_registrations() and by nothing else. Never use updated_at as a conflict token: '
  'the counter trigger bumps it on every public registration.';
comment on column public.events.waitlist_seq is
  'I4: monotonic source of waitlist_rank. Never reset, never renumbered, even by a purge.';

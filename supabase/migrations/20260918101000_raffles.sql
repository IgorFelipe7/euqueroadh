-- Migration 14 — raffles.
--
-- RAFFLE-AND-CERTIFICATE-SPEC.md § 2 and § 3.
--
-- THE PROPERTY THIS FILE EXISTS TO ESTABLISH:
--
--   The winner is chosen by PostgreSQL, inside a transaction, and written to a table before the
--   browser is told anything.  The animation on the projected screen is theatre replayed over a
--   result that already exists.
--
-- What that buys, concretely: reloading the stage mid-animation shows the same winner; a crashed
-- laptop does not re-roll; no code in the browser — and no operator — can influence, preview or
-- re-run the outcome.
--
-- And every draw is REPLAYABLE.  A row records its `seed`, its `pool_size` and its `pool_offset`.
-- Order the eligible pool by `id`, take the first 60 bits of the seed modulo the pool size, and the
-- element at that offset is the winner.  Months later, anyone with database access can verify any
-- past draw.  `order by random() limit 1` would be exactly as fair and entirely unverifiable: once
-- it has run, nothing survives that proves what the pool was.  One bytea column is what turns a
-- promise into evidence.
--
-- BIAS, recorded so nobody "fixes" it with rejection sampling later: a 60-bit uniform value modulo
-- a pool in the hundreds skews the result by under one part in 2^50.
--
-- NOT IMPLEMENTED: commit-reveal.  Publishing sha256(seed) before the draw and revealing the seed
-- after would let the AUDIENCE verify, not just an administrator.  It is the correct upgrade if the
-- draw is ever streamed to people with reason to doubt the organizers; the seed column is already
-- compatible with it.

-- gen_random_bytes().  The platform CSPRNG, schema-qualified like every other extension routine,
-- because every SECURITY DEFINER routine here runs with an empty search_path.
create extension if not exists pgcrypto with schema extensions;

create type public.raffle_pool         as enum ('attended', 'confirmed');
create type public.raffle_status       as enum ('draft', 'running', 'finished');
create type public.raffle_draw_outcome as enum ('pending', 'confirmed', 'forfeited');

create table public.raffles (
  id                       uuid primary key default gen_random_uuid(),
  event_id                 uuid not null references public.events(id) on delete cascade,

  name                     text not null,        -- "Sorteio 1"
  prize_label              text,                 -- "Kit de educação financeira"

  pool                     public.raffle_pool not null default 'attended',
  winners_target           integer not null default 1,
  exclude_previous_winners boolean not null default true,

  status                   public.raffle_status not null default 'draft',

  -- Monotonic source of draw_index.  Never reset, never renumbered, even by reset_raffle — the
  -- same discipline as events.waitlist_seq (I4).
  draw_seq                 integer not null default 0,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint raffles_name_length    check (char_length(btrim(name)) between 2 and 80),
  constraint raffles_prize_length   check (prize_label is null
                                           or char_length(btrim(prize_label)) between 2 and 80),
  constraint raffles_winners_target check (winners_target between 1 and 50),
  constraint raffles_draw_seq       check (draw_seq >= 0)
);

create index raffles_event_idx on public.raffles (event_id, created_at desc);

create table public.raffle_draws (
  id              uuid primary key default gen_random_uuid(),
  raffle_id       uuid not null references public.raffles(id) on delete cascade,

  -- CASCADE, AND NO NAME IS SNAPSHOTTED.  This is the opposite of the choice made for
  -- admin_actions.actor_label, deliberately.  An audit record must outlive what it describes,
  -- because its purpose is accountability.  A raffle result is not an audit record — it is a
  -- RESULT, and its subject's identity is participant personal data, which lives in exactly one
  -- table.  When purge_event_registrations() erases participants under LGPD it must take the
  -- raffle results with it, and this is what guarantees no copy of a name survives elsewhere.
  -- The raffle.drawn audit row remains, carrying counts and ids only, which is the correct residue.
  registration_id uuid not null references public.registrations(id) on delete cascade,

  -- Monotonic, never reused.  A forfeited draw keeps its index: the sequence of draws is the record
  -- of what actually happened on stage, including the person who was not in the room.
  draw_index      integer not null,

  outcome         public.raffle_draw_outcome not null default 'pending',

  -- The three values that make the draw replayable.
  pool_size       integer not null,
  pool_offset     integer not null,
  seed            bytea   not null,

  drawn_at        timestamptz not null default now(),
  decided_at      timestamptz,

  constraint raffle_draws_offset_in_pool check (pool_offset >= 0 and pool_offset < pool_size),
  constraint raffle_draws_seed_length    check (octet_length(seed) = 16),
  -- An outcome and its timestamp arrive together or not at all.
  constraint raffle_draws_decided_iff    check ((outcome = 'pending') = (decided_at is null))
);

-- A person is drawn at most once per raffle, forfeited or not.
create unique index raffle_draws_one_per_person on public.raffle_draws (raffle_id, registration_id);
create unique index raffle_draws_index_uidx     on public.raffle_draws (raffle_id, draw_index);
create index raffle_draws_raffle_idx            on public.raffle_draws (raffle_id, draw_index);
-- The cross-raffle "already won something" exclusion reads this.
create index raffle_draws_registration_idx      on public.raffle_draws (registration_id)
  where outcome = 'confirmed';

comment on column public.raffle_draws.seed is
  'The 16 random bytes the draw was derived from. With pool_size and pool_offset it makes the draw '
  'replayable: order the eligible pool by id, take first-60-bits(seed) mod pool_size.';

-- ---------------------------------------------------------------------------
-- Audit vocabulary.
-- ---------------------------------------------------------------------------
alter table public.admin_actions drop constraint admin_actions_known_action;
alter table public.admin_actions add constraint admin_actions_known_action check (action in (
  'settings.updated',
  'registration.cancelled',
  'registration.promoted',
  'registration.edited',
  'registration.deleted',
  'registration.attendance_set',
  'registrations.exported',
  'registrations.purged',
  'admin.invited',
  'admin.deactivated',
  'admin.reactivated',
  'admin.removed',
  'raffle.created',
  'raffle.updated',
  'raffle.deleted',
  'raffle.drawn',
  'raffle.draw_resolved',
  'raffle.reset'
));

-- ---------------------------------------------------------------------------
-- Lock order.
--
-- I6 said: the event row before any registration.  It now reads, globally:
--
--     event  →  raffle  →  registration
--
-- Every routine below takes them in that order and no routine anywhere takes them in another, so
-- no pair of them can deadlock.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.create_raffle(
  p_event_id                 uuid,
  p_name                     text,
  p_prize_label              text,
  p_pool                     public.raffle_pool,
  p_winners_target           integer,
  p_exclude_previous_winners boolean
)
returns table (raffle_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_id    uuid;
  v_name  text := btrim(coalesce(p_name, ''));
  v_prize text := nullif(btrim(coalesce(p_prize_label, '')), '');
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select e.* into v_event from public.events e where e.id = p_event_id for update;   -- I6
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'invalid_raffle_name' using errcode = 'check_violation';
  end if;
  if v_prize is not null and (char_length(v_prize) < 2 or char_length(v_prize) > 80) then
    raise exception 'invalid_prize_label' using errcode = 'check_violation';
  end if;
  if p_winners_target is null or p_winners_target < 1 or p_winners_target > 50 then
    raise exception 'invalid_winners_target' using errcode = 'check_violation';
  end if;

  insert into public.raffles
    (event_id, name, prize_label, pool, winners_target, exclude_previous_winners)
  values
    (p_event_id, v_name, v_prize, coalesce(p_pool, 'attended'), p_winners_target,
     coalesce(p_exclude_previous_winners, true))
  returning id into v_id;

  -- Configuration values, never participant data.
  perform public.record_admin_action(
    'raffle.created', p_event_id, null,
    jsonb_build_object('raffle_id', v_id, 'pool', coalesce(p_pool, 'attended'),
                       'winners_target', p_winners_target));

  return query select v_id;
end;
$$;

revoke all on function public.create_raffle(uuid, text, text, public.raffle_pool, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.create_raffle(uuid, text, text, public.raffle_pool, integer, boolean)
  to authenticated;


-- Editing.  Name, prize and winners_target stay editable while a raffle is running — "let us do one
-- more" is a real thing an organizer says mid-event, and raising the target is safe.  `pool` and
-- `exclude_previous_winners` freeze the moment a draw exists, because changing them would alter
-- what the already-recorded draws meant.
create or replace function public.update_raffle(
  p_raffle_id                uuid,
  p_name                     text,
  p_prize_label              text,
  p_pool                     public.raffle_pool,
  p_winners_target           integer,
  p_exclude_previous_winners boolean
)
returns table (raffle_id uuid, status public.raffle_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event     public.events%rowtype;
  v_raffle    public.raffles%rowtype;
  v_draws     integer;
  v_confirmed integer;
  v_status    public.raffle_status;
  v_name      text := btrim(coalesce(p_name, ''));
  v_prize     text := nullif(btrim(coalesce(p_prize_label, '')), '');
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select r.* into v_raffle from public.raffles r where r.id = p_raffle_id;
  if not found then
    raise exception 'raffle_not_found' using errcode = 'no_data_found';
  end if;

  select e.* into v_event from public.events e where e.id = v_raffle.event_id for update;  -- I6
  select r.* into v_raffle from public.raffles r where r.id = p_raffle_id for update;

  select count(*), count(*) filter (where d.outcome = 'confirmed')
    into v_draws, v_confirmed
    from public.raffle_draws d where d.raffle_id = p_raffle_id;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'invalid_raffle_name' using errcode = 'check_violation';
  end if;
  if v_prize is not null and (char_length(v_prize) < 2 or char_length(v_prize) > 80) then
    raise exception 'invalid_prize_label' using errcode = 'check_violation';
  end if;
  if p_winners_target is null or p_winners_target < 1 or p_winners_target > 50 then
    raise exception 'invalid_winners_target' using errcode = 'check_violation';
  end if;
  if p_winners_target < v_confirmed then
    raise exception 'winners_below_drawn:%', v_confirmed using errcode = 'check_violation';
  end if;

  if v_draws > 0
     and (p_pool is distinct from v_raffle.pool
          or coalesce(p_exclude_previous_winners, true)
             is distinct from v_raffle.exclude_previous_winners) then
    raise exception 'raffle_already_drawn' using errcode = 'check_violation';
  end if;

  -- Raising the target on a finished raffle reopens it; lowering it to what has been drawn closes
  -- it.  Derived here rather than left to the caller, so the two writers of `status` agree.
  v_status := case
                when v_confirmed >= p_winners_target then 'finished'::public.raffle_status
                when v_draws > 0 then 'running'::public.raffle_status
                else 'draft'::public.raffle_status
              end;

  update public.raffles r
     set name                     = v_name,
         prize_label              = v_prize,
         pool                     = coalesce(p_pool, r.pool),
         winners_target           = p_winners_target,
         exclude_previous_winners = coalesce(p_exclude_previous_winners,
                                             r.exclude_previous_winners),
         status                   = v_status,
         updated_at               = now()
   where r.id = p_raffle_id;

  perform public.record_admin_action(
    'raffle.updated', v_raffle.event_id, null,
    jsonb_build_object('raffle_id', p_raffle_id, 'winners_target', p_winners_target,
                       'pool', coalesce(p_pool, v_raffle.pool)));

  return query select p_raffle_id, v_status;
end;
$$;

revoke all on function public.update_raffle(uuid, text, text, public.raffle_pool, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.update_raffle(uuid, text, text, public.raffle_pool, integer, boolean)
  to authenticated;


create or replace function public.delete_raffle(p_raffle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event  public.events%rowtype;
  v_raffle public.raffles%rowtype;
  v_draws  integer;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select r.* into v_raffle from public.raffles r where r.id = p_raffle_id;
  if not found then
    raise exception 'raffle_not_found' using errcode = 'no_data_found';
  end if;

  select e.* into v_event from public.events e where e.id = v_raffle.event_id for update;  -- I6

  select count(*) into v_draws from public.raffle_draws d where d.raffle_id = p_raffle_id;

  -- The draw count is audited BEFORE the cascade removes the rows, because afterwards nothing
  -- records that the deleted raffle had ever produced a winner.
  perform public.record_admin_action(
    'raffle.deleted', v_raffle.event_id, null,
    jsonb_build_object('raffle_id', p_raffle_id, 'draws', v_draws));

  delete from public.raffles r where r.id = p_raffle_id;
end;
$$;

revoke all on function public.delete_raffle(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_raffle(uuid) to authenticated;


-- For the rehearsal before the doors open.  Deletes the draws and keeps draw_seq, so a replayed
-- raffle never reuses a draw_index and the audit trail stays unambiguous about which run is which.
create or replace function public.reset_raffle(p_raffle_id uuid)
returns table (raffle_id uuid, cleared integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event   public.events%rowtype;
  v_raffle  public.raffles%rowtype;
  v_cleared integer;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select r.* into v_raffle from public.raffles r where r.id = p_raffle_id;
  if not found then
    raise exception 'raffle_not_found' using errcode = 'no_data_found';
  end if;

  select e.* into v_event from public.events e where e.id = v_raffle.event_id for update;  -- I6
  select r.* into v_raffle from public.raffles r where r.id = p_raffle_id for update;

  delete from public.raffle_draws d where d.raffle_id = p_raffle_id;
  get diagnostics v_cleared = row_count;

  update public.raffles r
     set status = 'draft', updated_at = now()
   where r.id = p_raffle_id;
  -- draw_seq is deliberately NOT reset.

  perform public.record_admin_action(
    'raffle.reset', v_raffle.event_id, null,
    jsonb_build_object('raffle_id', p_raffle_id, 'cleared', v_cleared));

  return query select p_raffle_id, v_cleared;
end;
$$;

revoke all on function public.reset_raffle(uuid) from public, anon, authenticated, service_role;
grant execute on function public.reset_raffle(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- The draw (§ 3.2)
-- ---------------------------------------------------------------------------
create or replace function public.draw_raffle_winner(p_raffle_id uuid)
returns table (draw_id uuid, registration_id uuid, full_name text,
               draw_index integer, pool_size integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event     public.events%rowtype;
  v_raffle    public.raffles%rowtype;
  v_confirmed integer;
  v_pending   integer;
  v_pool      uuid[];
  v_size      integer;
  v_seed      bytea;
  v_offset    integer;
  v_winner    uuid;
  v_index     integer;
  v_draw_id   uuid;
  v_name      text;
begin
  -- 1. Authorize.  First statement: SECURITY DEFINER bypasses RLS, so nothing else protects this.
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select r.* into v_raffle from public.raffles r where r.id = p_raffle_id;
  if not found then
    raise exception 'raffle_not_found' using errcode = 'no_data_found';
  end if;

  -- 2. Lock, in order: event → raffle.
  select e.* into v_event from public.events e where e.id = v_raffle.event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;
  select r.* into v_raffle from public.raffles r where r.id = p_raffle_id for update;

  -- 3/4. Refuse if complete, or if a winner is still on screen undecided.  The second check is what
  --      stops a double-press of the space bar from burning two prizes: one winner at a time, and
  --      the operator must confirm or forfeit before the next draw.
  select count(*) filter (where d.outcome = 'confirmed'),
         count(*) filter (where d.outcome = 'pending')
    into v_confirmed, v_pending
    from public.raffle_draws d where d.raffle_id = p_raffle_id;

  if v_pending > 0 then
    raise exception 'draw_pending' using errcode = 'check_violation';
  end if;
  if v_confirmed >= v_raffle.winners_target then
    raise exception 'raffle_complete' using errcode = 'check_violation';
  end if;

  -- 5. Build the pool, ordered by id so it is reproducible.  Materialised as an array in one scan:
  --    at three hundred rows it costs nothing, and it makes the replay rule literal — element
  --    v_offset of this exact list.
  select array_agg(r.id order by r.id) into v_pool
    from public.registrations r
   where r.event_id = v_event.id
     and r.status = 'confirmed'
     and (v_raffle.pool <> 'attended' or r.attended_at is not null)
     -- Anyone already drawn in THIS raffle is out, forfeited or not: a person who was not in the
     -- room does not get a second chance at the same prize.
     and not exists (select 1 from public.raffle_draws d
                      where d.raffle_id = p_raffle_id and d.registration_id = r.id)
     -- And, optionally, anyone who has already won something else at this event.
     and (not v_raffle.exclude_previous_winners
          or not exists (select 1
                           from public.raffle_draws d
                           join public.raffles o on o.id = d.raffle_id
                          where o.event_id = v_event.id
                            and d.outcome = 'confirmed'
                            and d.registration_id = r.id));

  v_size := coalesce(cardinality(v_pool), 0);
  if v_size = 0 then
    raise exception 'pool_empty' using errcode = 'no_data_found';
  end if;

  -- 6. Draw.  The seed is 16 bytes from the platform CSPRNG; the offset is its first 60 bits modulo
  --    the pool size.  Both are stored, which is what makes step 6 replayable (see the header).
  v_seed   := extensions.gen_random_bytes(16);
  v_offset := (('x' || substr(encode(v_seed, 'hex'), 1, 15))::bit(60)::bigint % v_size)::integer;
  v_winner := v_pool[v_offset + 1];   -- PostgreSQL arrays are 1-based

  -- 7. Record.
  v_index := v_raffle.draw_seq + 1;

  insert into public.raffle_draws
    (raffle_id, registration_id, draw_index, pool_size, pool_offset, seed)
  values
    (p_raffle_id, v_winner, v_index, v_size, v_offset, v_seed)
  returning id into v_draw_id;

  update public.raffles r
     set draw_seq = v_index, status = 'running', updated_at = now()
   where r.id = p_raffle_id;

  -- 8. Audit.  Counts and ids; the winner travels in admin_actions.registration_id, which is an id
  --    and not personal data.
  perform public.record_admin_action(
    'raffle.drawn', v_event.id, v_winner,
    jsonb_build_object('raffle_id', p_raffle_id, 'draw_index', v_index, 'pool_size', v_size));

  -- 9. Return the winner.  The FULL name: the operator has to announce the right person.  Masking
  --    for the projector is presentation and happens in the application (§ 3.6).
  select r.full_name into v_name from public.registrations r where r.id = v_winner;

  return query select v_draw_id, v_winner, v_name, v_index, v_size;
end;
$$;

revoke all on function public.draw_raffle_winner(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.draw_raffle_winner(uuid) to authenticated;


create or replace function public.resolve_raffle_draw(
  p_draw_id uuid,
  p_outcome public.raffle_draw_outcome
)
returns table (draw_id uuid, outcome public.raffle_draw_outcome, status public.raffle_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event     public.events%rowtype;
  v_raffle    public.raffles%rowtype;
  v_draw      public.raffle_draws%rowtype;
  v_confirmed integer;
  v_status    public.raffle_status;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  -- `pending` is not an outcome anyone can set: it is the state a draw is born in.
  if p_outcome is null or p_outcome = 'pending' then
    raise exception 'invalid_outcome' using errcode = 'check_violation';
  end if;

  select d.* into v_draw from public.raffle_draws d where d.id = p_draw_id;
  if not found then
    raise exception 'draw_not_found' using errcode = 'no_data_found';
  end if;

  select r.* into v_raffle from public.raffles r where r.id = v_draw.raffle_id;
  select e.* into v_event  from public.events e where e.id = v_raffle.event_id for update;   -- I6
  select r.* into v_raffle from public.raffles r where r.id = v_draw.raffle_id for update;

  -- Re-read under the lock: another organizer may have resolved this draw already.
  select d.* into v_draw from public.raffle_draws d where d.id = p_draw_id;
  if v_draw.outcome <> 'pending' then
    raise exception 'draw_already_resolved' using errcode = 'check_violation';
  end if;

  update public.raffle_draws d
     set outcome = p_outcome, decided_at = now()
   where d.id = p_draw_id;

  select count(*) filter (where d.outcome = 'confirmed') into v_confirmed
    from public.raffle_draws d where d.raffle_id = v_raffle.id;

  v_status := case when v_confirmed >= v_raffle.winners_target
                   then 'finished'::public.raffle_status
                   else 'running'::public.raffle_status end;

  update public.raffles r set status = v_status, updated_at = now() where r.id = v_raffle.id;

  perform public.record_admin_action(
    'raffle.draw_resolved', v_event.id, v_draw.registration_id,
    jsonb_build_object('raffle_id', v_raffle.id, 'draw_index', v_draw.draw_index,
                       'outcome', p_outcome));

  return query select p_draw_id, p_outcome, v_status;
end;
$$;

revoke all on function public.resolve_raffle_draw(uuid, public.raffle_draw_outcome)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_raffle_draw(uuid, public.raffle_draw_outcome)
  to authenticated;


-- ---------------------------------------------------------------------------
-- RLS and the narrow re-grant, matching migration 10 exactly.
--
-- `authenticated` gets SELECT and nothing else; every write is an RPC above.  `anon` and
-- `service_role` get nothing at all: no raffle routine is part of the public path, and the secret
-- key must not be able to read who won any more than it can read who registered.
-- ---------------------------------------------------------------------------
alter table public.raffles      enable row level security;
alter table public.raffle_draws enable row level security;

create policy raffles_admin_read on public.raffles
  for select to authenticated using (public.is_active_admin());

create policy raffle_draws_admin_read on public.raffle_draws
  for select to authenticated using (public.is_active_admin());

grant select on public.raffles      to authenticated;
grant select on public.raffle_draws to authenticated;

revoke insert, update, delete, truncate on public.raffles      from anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.raffle_draws from anon, authenticated, service_role;
revoke select on public.raffles      from anon, service_role;
revoke select on public.raffle_draws from anon, service_role;

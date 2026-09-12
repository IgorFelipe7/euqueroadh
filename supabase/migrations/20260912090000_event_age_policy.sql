-- Migration 11 — the online eligibility age policy.
--
-- Q7 ("is there a business age restriction?") has been answered: **the online registration flow
-- accepts 12 and over**.  Anyone younger is directed to the organization by e-mail instead, because
-- the product deliberately collects three fields and no guardian data
-- (PRODUCT-SPEC.md § 12.1, DECISIONS.md Q7).
--
-- This is implemented exactly as the specification said it would be if the answer ever arrived:
-- nullable `events.min_age` / `events.max_age`, checked **inside** `register_for_event()`, with its
-- own outcome and its own pt-BR message.  Three consequences are deliberate:
--
--   * `registrations.reg_age_range` (1–120) is NOT changed.  It is a technical plausibility bound
--     on the column, not an eligibility rule, and an administrator correcting a record through
--     `edit_registration()` is not performing an online registration.  Eligibility belongs to the
--     event, and therefore to the event row.
--   * The check is per event, so a future event with a different policy is a value, not a migration.
--   * It sits in the allocation function, under the same lock as everything else, so the browser,
--     the Zod schema and the Server Action are all defence in depth over a single authority.

alter table public.events
  add column min_age smallint,
  add column max_age smallint;

alter table public.events
  add constraint events_age_policy_bounds check (
    (min_age is null or min_age between 1 and 120) and
    (max_age is null or max_age between 1 and 120) and
    (min_age is null or max_age is null or min_age <= max_age)
  );

comment on column public.events.min_age is
  'Online eligibility floor, inclusive. NULL means no floor. Enforced inside register_for_event(); '
  'deliberately NOT the registrations.age CHECK, which is a technical plausibility bound.';
comment on column public.events.max_age is
  'Online eligibility ceiling, inclusive. NULL means no ceiling.';

-- The one active event adopts the operating policy.  Written here rather than only in seed.sql so
-- that an already-seeded database (production) receives it by running migrations, and a freshly
-- reset one receives it from the seed — both deterministic, neither manual.
update public.events set min_age = 12 where min_age is null;

-- ---------------------------------------------------------------------------
-- register_for_event, with STEP 2.5.
--
-- Precedence (PRODUCT-SPEC.md § 6): already_registered → age_not_eligible → closed → confirmed →
-- waitlisted → full.  Eligibility is checked before the master switch because it is a fact about
-- the person rather than about the moment: telling a ten-year-old "inscrições encerradas" would
-- send them back to try again later, when the answer would still be no.
-- ---------------------------------------------------------------------------
create or replace function public.register_for_event(
  p_event_id   uuid,
  p_full_name  text,
  p_age        smallint,
  p_phone_e164 text
)
returns table (
  outcome         text,       -- confirmed | waitlisted | already_registered | age_not_eligible | closed | full
  status          public.registration_status,
  registration_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.events%rowtype;
  v_existing public.registrations%rowtype;
  v_id       uuid;
  v_rank     integer;
begin
  ---------------------------------------------------------------------------
  -- STEP 1. Acquire the event row lock (I6: events before registrations).
  ---------------------------------------------------------------------------
  select * into v_event
    from public.events
   where id = p_event_id
   for update;

  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  ---------------------------------------------------------------------------
  -- STEP 2. Duplicate / idempotency check, inside the lock so it is safe.
  ---------------------------------------------------------------------------
  select r.* into v_existing
    from public.registrations r
   where r.event_id = p_event_id
     and r.phone_e164 = p_phone_e164
     and r.status <> 'cancelled'
   limit 1;

  if found then
    return query select 'already_registered'::text, v_existing.status, v_existing.id;
    return;
  end if;

  ---------------------------------------------------------------------------
  -- STEP 2.5. Online eligibility.  Nothing is stored for an ineligible age: the refusal is a
  -- redirection to a human channel, not a record of a child's data.
  ---------------------------------------------------------------------------
  if (v_event.min_age is not null and p_age < v_event.min_age)
     or (v_event.max_age is not null and p_age > v_event.max_age) then
    return query select 'age_not_eligible'::text, null::public.registration_status, null::uuid;
    return;
  end if;

  ---------------------------------------------------------------------------
  -- STEP 3. The master switch, independent of capacity.
  ---------------------------------------------------------------------------
  if v_event.registration_state <> 'open' then
    return query select 'closed'::text, null::public.registration_status, null::uuid;
    return;
  end if;

  ---------------------------------------------------------------------------
  -- STEP 4. Seat available?  Read under the lock, so it cannot be stale.
  ---------------------------------------------------------------------------
  if v_event.confirmed_count < v_event.capacity then
    insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values (p_event_id, btrim(p_full_name), p_age, p_phone_e164, 'confirmed')
    returning id into v_id;

    return query select 'confirmed'::text, 'confirmed'::public.registration_status, v_id;
    return;
  end if;

  ---------------------------------------------------------------------------
  -- STEP 5. Full.  Waitlist enabled?
  ---------------------------------------------------------------------------
  if not v_event.waitlist_enabled then
    return query select 'full'::text, null::public.registration_status, null::uuid;
    return;
  end if;

  v_rank := v_event.waitlist_seq + 1;

  update public.events
     set waitlist_seq = v_rank
   where id = p_event_id;

  insert into public.registrations
    (event_id, full_name, age, phone_e164, status, waitlist_rank)
  values
    (p_event_id, btrim(p_full_name), p_age, p_phone_e164, 'waitlisted', v_rank)
  returning id into v_id;

  return query select 'waitlisted'::text, 'waitlisted'::public.registration_status, v_id;
end;
$$;

-- ACL (§ 8.5), restated: `create or replace` preserves the existing grants, but the project rule is
-- that every function definition carries its own ACL in the same migration, so that reading one
-- file answers "who can execute this?".
revoke all on function public.register_for_event(uuid, text, smallint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_for_event(uuid, text, smallint, text) to service_role;

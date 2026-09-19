-- Migration 16 — the duplicate rule becomes a PERSON rule rather than a PHONE rule.
--
-- THE PRODUCT FACT THAT FORCED THIS.  One telephone number legitimately belongs to two, three or
-- six different registrations: the audience is `PARA JOVENS`, and a family arriving together
-- routinely has one phone between them.  The V1 rule — one active registration per
-- `(event_id, phone_e164)` — silently refused the second, third and sixth of those people with
-- `already_registered`, and the only remedy was to telephone the organization.
--
-- What replaces it is the same idea applied to the right subject:
--
--     one active registration per (event_id, canonical phone, canonical name)
--
-- so that a second PERSON on a shared number is allocated a seat normally, while the same person
-- submitting twice is still idempotent.  Every property D3 was written to protect survives:
--
--   * the check still happens inside the event row lock, so the whole operation stays idempotent
--     and a retry after a lost response cannot create a second row;
--   * the stored row is still never rewritten, so knowing a phone number still grants nobody the
--     power to overwrite somebody's registration;
--   * the index is still partial on `status <> 'cancelled'`, so a cancelled person may return;
--   * the index is still the backstop that makes the race impossible if the graceful path in
--     `register_for_event()` is ever bypassed.
--
-- AGE IS DELIBERATELY NOT PART OF THE KEY, and this is the one place the launch brief's suggested
-- shape (`event + name + phone + age`) was not followed.  Age adds no discriminating power — two
-- people sharing a telephone number AND a full name to the letter is not a case this event has —
-- and it adds one real failure: a person who types `21` instead of `12`, submits, and corrects
-- themselves would become a SECOND row holding a SECOND seat.  Under the rule below that
-- resubmission is answered `already_registered`, which is what PRODUCT-SPEC.md § 9 already promises
-- and what keeps I1 meaningful.  Age remains what it is in the check-in flow: a disambiguator
-- between two candidates, never a component of identity.
--
-- NO NEW COLUMN, AND NO NEW PERSONAL DATA.  The key is derived from `full_name`, which is already
-- stored, by an immutable function used both by the index and by the routines.  Nothing about a
-- participant is persisted that was not persisted before.

-- ---------------------------------------------------------------------------
-- The canonical form of a name, and the only implementation of it.
--
-- Four transformations, in this order, each for a stated reason:
--
--   1. A non-breaking space becomes an ordinary one.  It is the single non-ASCII whitespace
--      character that actually arrives in pasted text, and `\s` below does NOT match it in a glibc
--      UTF-8 locale — so without this line `'Ana Souza'` would be a different person from
--      `'Ana Souza'`, invisibly, on screen and in the index alike.
--   2. Collapse whitespace runs, THEN `btrim` — in that order, which is load-bearing.  Single-
--      argument `btrim` removes spaces only, not tabs or newlines, so trimming first would leave a
--      leading tab to be collapsed into a leading SPACE that nothing then removes.  Collapsing
--      first turns any leading or trailing run into one space, and `btrim` takes it.
--   3. `immutable_unaccent` — `João` and `Joao` are one person.  The same wrapper the search column
--      uses, so the two normalizations can never disagree about an accent.
--   4. `lower` — `JOÃO` and `joão` are one person.
--
-- Steps 1 and 2 are why this is a second expression rather than a reuse of `search_name`, which is
-- `lower(unaccent(full_name))` and nothing more: `register_for_event()` and `edit_registration()`
-- both btrim on write but neither collapses internal runs, so `search_name` would treat
-- `Ana  Souza` as a different person and the unique index would not hold.
--
-- Deliberately NOT done: title-casing, particle removal, initial expansion, transliteration beyond
-- accents, or any fuzzy or phonetic match.  This function must be TOTAL and DETERMINISTIC, because
-- it decides both "is this the same person" at registration and "is this the person at the door" at
-- check-in, and a fuzzy rule that identifies the wrong participant is worse than one that asks for
-- one more field.  `lib/domain/identity.ts` is the TypeScript half of the same three steps.
--
-- IMMUTABLE is required, not merely accurate: an index expression may not be anything else.  It is
-- true because all three underlying functions are, and because the `unaccent` dictionary is never
-- reloaded (see migration 2).
-- ---------------------------------------------------------------------------
create or replace function public.registration_identity_key(p_full_name text)
returns text
language sql
immutable strict parallel safe
set search_path = ''
as $$
  select lower(public.immutable_unaccent(
           btrim(regexp_replace(replace(p_full_name, chr(160), ' '), '\s+', ' ', 'g'))))
$$;

comment on function public.registration_identity_key(text) is
  'The canonical form of a participant name: whitespace-collapsed, accent-folded, lower-cased. '
  'One implementation, used by registrations_active_person_uidx, by register_for_event() and by '
  'the check-in and certificate lookups. Never fuzzy.';

-- ACL (§ 8.5): granted to NOBODY.  Like `immutable_unaccent`, it is only ever evaluated by the
-- table owner — as an index expression — and by the SECURITY DEFINER routines, which run as the
-- owner.
revoke all on function public.registration_identity_key(text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- I3, restated.
--
-- The new index is strictly WEAKER than the one it replaces — every pair it forbids was already
-- forbidden — so it cannot fail to build against existing data, and no row has to be touched,
-- inspected or repaired.  That is the whole migration-safety argument, and it is the reason this
-- change is a two-statement swap rather than a data migration.
--
-- Dropped first, on purpose: holding both would mean the old rule still refused the second person
-- on a shared number while the new one permitted them, which is a contradiction that would present
-- as `already_registered` for no reason a reader of this file could find.
-- ---------------------------------------------------------------------------
drop index public.registrations_active_phone_uidx;

create unique index registrations_active_person_uidx
  on public.registrations (event_id, phone_e164, public.registration_identity_key(full_name))
  where status <> 'cancelled';

comment on index public.registrations_active_person_uidx is
  'I3: one active registration per (event, canonical phone, canonical name). Partial, so a '
  'cancelled person may register again. Its (event_id, phone_e164) prefix is also the lookup the '
  'self check-in and certificate portals resolve a shared number through.';

-- ---------------------------------------------------------------------------
-- register_for_event, with STEP 2 narrowed to the person.
--
-- The signature is unchanged, so `create or replace` is correct and the grants below are a
-- restatement rather than a repair.  Everything outside STEP 2 is migration 11 verbatim; it is
-- reproduced in full rather than patched because a `create or replace` has to be.
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
  --
  -- Keyed on the PERSON, not on the number: the second child on a family's one telephone is a new
  -- registration, and the same child submitting twice is not.  The comparison is between two
  -- canonical forms, so a resubmission typed as `'  joão  silva '` is recognised as `João Silva`
  -- and answered `already_registered` — the normalization is not a courtesy to the caller, it is
  -- the rule the unique index enforces.
  ---------------------------------------------------------------------------
  select r.* into v_existing
    from public.registrations r
   where r.event_id = p_event_id
     and r.phone_e164 = p_phone_e164
     and public.registration_identity_key(r.full_name)
         = public.registration_identity_key(p_full_name)
     and r.status <> 'cancelled'
   limit 1;

  if found then
    return query select 'already_registered'::text, v_existing.status, v_existing.id;
    return;
  end if;

  ---------------------------------------------------------------------------
  -- STEP 2.5. Online eligibility.  Nothing is stored for an ineligible age.
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
-- that every function definition carries its own ACL in the same migration.
revoke all on function public.register_for_event(uuid, text, smallint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_for_event(uuid, text, smallint, text) to service_role;

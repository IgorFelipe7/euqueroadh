-- Migration 18 — public self check-in.
--
-- The one public write path in this database besides `register_for_event`, and it is shaped by the
-- same rule: `service_role` ONLY, so Turnstile verification and the Server Action cannot be bypassed
-- by anyone holding a publishable key.
--
-- ---------------------------------------------------------------------------
-- LOCK ORDER — I6, extended once more.
--
-- Migration 14 made it `event → raffle → registration`.  It now reads, globally:
--
--     event  →  raffle  |  check_in_session  →  registration
--
-- `raffles` and `check_in_sessions` are siblings and are never locked together by any routine, so
-- their relative order does not exist and cannot be got wrong.  Every routine still takes the event
-- first and the registration last, which is what makes deadlock between any pair impossible.
-- ---------------------------------------------------------------------------
--
-- ---------------------------------------------------------------------------
-- THE PRIVACY PROPERTY THIS FILE EXISTS TO ESTABLISH.
--
-- There is NO endpoint here that answers "who is registered under this telephone number".  That is
-- not a rate-limiting problem; it is a shape problem, and the shape below is what solves it:
--
--   * no name, age, status, count or identifier is ever returned — the result is one word out of a
--     closed set of six;
--   * a number with NO eligible registration and a number with SEVERAL are answered IDENTICALLY
--     (`need_name`, then `need_age`, then the generic refusal).  A prober who submits a telephone
--     number therefore learns nothing about whether it is registered at all: the flow asks for a
--     first name in both cases, and ends generically in both cases.  This is the one place the
--     launch brief's sketch was tightened rather than followed — it described asking for a name
--     only when "more information is required", which would have made an unknown number
--     distinguishable from a shared one on the very first step;
--   * a waitlisted, cancelled or unknown person all produce zero candidates and therefore all
--     travel that same indistinguishable path to the same sentence.
--
-- The single bit that IS observable is the one the flow cannot function without: submitting a
-- telephone number that identifies exactly one confirmed person, and receiving `confirmed` or
-- `already_present`, reveals that this number belongs to a confirmed attendee.  That is the same bit
-- `register_for_event` already exposes through `already_registered` (T6, accepted and documented in
-- DATABASE-SECURITY.md § 11), it costs a Turnstile solve per guess, and it is what makes the
-- four-second check-in possible.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Resolving the QR's token into a page.
--
-- Returns the event's PUBLIC display copy and nothing else — never the session row, never an id,
-- never `expires_at`, never who opened it.  Zero rows for every negative case: unknown token,
-- closed session, expired session.  One response for all three, so the page cannot be used to tell
-- "this was never a session" from "this session ended twenty minutes ago".
--
-- `stable`, not `volatile`: it reads `now()` but writes nothing, which is what lets it be a plain
-- SQL function with no lock.
-- ---------------------------------------------------------------------------
create or replace function public.get_check_in_session(p_token text)
returns table (
  event_title    text,
  event_kicker   text,
  audience_label text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  timezone       text,
  venue_name     text,
  venue_city     text,
  venue_state    text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.title, e.kicker, e.audience_label,
         e.starts_at, e.ends_at, e.timezone,
         e.venue_name, e.venue_city, e.venue_state
    from public.check_in_sessions s
    join public.events e on e.id = s.event_id
   -- A token is 27 characters of base64url.  The length guard means a pathological input is
   -- rejected before it reaches the index rather than being compared against every row.
   where p_token is not null
     and char_length(p_token) between 20 and 64
     and s.token = p_token
     and s.status = 'open'
     and s.expires_at > now();
$$;

-- The public page renders server-side under the secret key, exactly like `/` and `/certificado`
-- (D4).  `authenticated` has no need for it: an administrator reads the session row itself.
revoke all on function public.get_check_in_session(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_check_in_session(text) to service_role;

-- ---------------------------------------------------------------------------
-- The check-in itself.
--
-- ADAPTIVE IDENTIFICATION, as one filter with three answers.
--
-- The candidate set is always "confirmed registrations against this event held on this telephone
-- number", narrowed by whichever of the two optional fields the guest has supplied so far.  Then:
--
--     exactly one candidate  →  check them in
--     no first name yet      →  need_name
--     no age yet             →  need_age
--     otherwise              →  not_found
--
-- Expressing it as one predicate with three fall-throughs, rather than as three separate queries,
-- is what makes it impossible for the three steps to disagree about who is eligible.
--
-- ELIGIBILITY IS `status = 'confirmed'`, FULL STOP.  A waitlisted person standing at the door is a
-- PROMOTION — a capacity-checked, audited, authenticated act — and self check-in must not be able to
-- perform one, or I1 would be bypassable from a phone.  They fall through to the generic refusal and
-- the door screen handles them, which is exactly what `set_registration_attendance()` already does
-- with its `not_confirmed` error.
--
-- IDEMPOTENT.  A repeat scan does not rewrite `attended_at` and does not even issue the UPDATE: the
-- row is read `for update` first, so "were they already present?" is answered under the row lock and
-- the answer cannot change underneath the decision.  Two guests scanning simultaneously touch two
-- different rows; the same guest scanning twice simultaneously serializes on one.
--
-- NOT AUDITED, deliberately.  `admin_actions` records acts by administrators; a guest confirming
-- their own arrival is a domain fact, and `attended_at` IS its record.  Writing an audit row per
-- scan would add a second, timestamped copy of "this person was here" to a table that is kept longer
-- and read by more people than the registration itself, which is the opposite of § 12's direction.
-- Opening and closing the session — the administrative acts that make any of this possible — are
-- audited in migration 17.
-- ---------------------------------------------------------------------------
create or replace function public.self_check_in(
  p_token      text,
  p_phone_e164 text,
  -- NULL on the first step.  The guest's own first name, as they typed it.
  p_first_name text default null,
  -- NULL until the third step.
  p_age        smallint default null
)
returns table (
  -- confirmed | already_present | need_name | need_age | not_found | session_invalid
  result text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session   public.check_in_sessions%rowtype;
  v_event     public.events%rowtype;
  v_first_key text;
  v_count     int;
  v_id        uuid;
  v_present   boolean;
begin
  ---------------------------------------------------------------------------
  -- STEP 1. The capability.  Nothing below this line runs for a token that is not a live session,
  -- which is what stops the routine from being a lookup endpoint outside an event.
  ---------------------------------------------------------------------------
  if p_token is null or char_length(p_token) not between 20 and 64 then
    return query select 'session_invalid'::text;
    return;
  end if;

  select s.* into v_session
    from public.check_in_sessions s
   where s.token = p_token
     and s.status = 'open'
     and s.expires_at > now();

  if not found then
    return query select 'session_invalid'::text;
    return;
  end if;

  ---------------------------------------------------------------------------
  -- STEP 2. The event lock (I6).
  --
  -- Attendance touches no counter, so this lock buys no invariant of its own — it buys the same
  -- thing it buys in `set_registration_attendance()`: "always the event before the registration"
  -- stays true by construction rather than by everyone remembering.  The cost is that self
  -- check-ins for one event serialize, and at a door where two hundred people arrive over twenty
  -- minutes that is a few milliseconds of contention against an arrival rate under one per second
  -- (§ 5.4 makes the same argument for allocation).
  ---------------------------------------------------------------------------
  select e.* into v_event from public.events e where e.id = v_session.event_id for update;
  if not found then
    return query select 'session_invalid'::text;
    return;
  end if;

  -- Re-read the session under the lock: between the two statements an organizer may have closed
  -- check-in, and a guest whose request was already in flight must not be admitted afterwards.
  select s.* into v_session
    from public.check_in_sessions s
   where s.id = v_session.id
     and s.status = 'open'
     and s.expires_at > now();

  if not found then
    return query select 'session_invalid'::text;
    return;
  end if;

  ---------------------------------------------------------------------------
  -- STEP 3. Identification.
  --
  -- The typed first name is canonicalised by the SAME function the duplicate rule uses, then
  -- reduced to its first word, and compared against the first word of the stored name's canonical
  -- form.  So `JOÃO`, `joao` and `  João  ` all match a registration for `João Pedro Souza`, and
  -- nothing fuzzier than that matches at all: no prefix match, no edit distance, no phonetics.  A
  -- guest whose given name is not the first word of their registered name falls through to the
  -- generic refusal and is served by a human, which is the correct failure for an identity check.
  ---------------------------------------------------------------------------
  v_first_key := case
                   when p_first_name is null or btrim(p_first_name) = '' then null
                   else split_part(public.registration_identity_key(p_first_name), ' ', 1)
                 end;

  select count(*)::int into v_count
    from public.registrations r
   where r.event_id = v_event.id
     and r.phone_e164 = p_phone_e164
     and r.status = 'confirmed'
     and (v_first_key is null
          or split_part(public.registration_identity_key(r.full_name), ' ', 1) = v_first_key)
     and (p_age is null or r.age = p_age);

  if v_count <> 1 then
    -- Zero candidates and several candidates leave here by the same door, in the same order, with
    -- the same words.  See the header.
    return query select case
                          when v_first_key is null then 'need_name'
                          when p_age is null       then 'need_age'
                          else 'not_found'
                        end::text;
    return;
  end if;

  ---------------------------------------------------------------------------
  -- STEP 4. The one candidate, locked before it is read, so the "already present?" decision and the
  -- write cannot be separated by another transaction.
  ---------------------------------------------------------------------------
  select r.id, r.attended_at is not null into v_id, v_present
    from public.registrations r
   where r.event_id = v_event.id
     and r.phone_e164 = p_phone_e164
     and r.status = 'confirmed'
     and (v_first_key is null
          or split_part(public.registration_identity_key(r.full_name), ' ', 1) = v_first_key)
     and (p_age is null or r.age = p_age)
   for update;

  if not found then
    -- The row was cancelled or deleted between the count and this read. Generic, like every other
    -- unsuccessful identification.
    return query select 'not_found'::text;
    return;
  end if;

  if v_present then
    -- Already here.  No UPDATE at all: `attended_at` is the ARRIVAL time, and a repeat scan must
    -- leave it alone rather than write the same value back and leave a dead tuple per tap.
    return query select 'already_present'::text;
    return;
  end if;

  update public.registrations r
     set attended_at = now()
   where r.id = v_id;

  return query select 'confirmed'::text;
end;
$$;

-- ACL (§ 8.5): service_role ONLY, exactly as `register_for_event`.  This is a public WRITE path, so
-- a grant to `anon` or `authenticated` would put it outside the Server Action that verifies
-- Turnstile — which is the whole anti-abuse control on it.
revoke all on function public.self_check_in(text, text, text, smallint)
  from public, anon, authenticated, service_role;
grant execute on function public.self_check_in(text, text, text, smallint) to service_role;

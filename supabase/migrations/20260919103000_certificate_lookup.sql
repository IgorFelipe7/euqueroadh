-- Migration 19 — self-service certificate retrieval.
--
-- WHAT CHANGED, AND WHAT DID NOT.
--
-- Migration 15 opened with "ACCESS IS AN UNGUESSABLE TOKEN, AND THERE IS NO LOOKUP BY TELEPHONE
-- NUMBER", and the reasoning behind that sentence has not been refuted — it has been costed.  The
-- alternative it protected was: the organizer copies three hundred individual links out of the admin
-- and sends them one at a time.  In practice that means most people never receive one, and the ones
-- who do receive them through a chain of forwards in which a personal capability is pasted into
-- group chats.  The disclosure the original design refused to build turned out to be the disclosure
-- the distribution method produced anyway, at greater cost.
--
-- So D36 is amended rather than reversed, and the amendment is narrow:
--
--   * THE TOKEN REMAINS THE ONLY CAPABILITY.  Nothing below issues, weakens or parallels it.
--     `get_certificate(token)` is still the single reader of a certificate, and this routine's
--     entire job is to hand ONE existing token to the person who can already prove three facts
--     about themselves.  There is deliberately no second, weaker access mechanism.
--   * THE PROOF IS STRONGER THAN AT THE DOOR.  `/certificado` is reachable for as long as the site
--     exists, with no operator present and no session bounding it, so it demands phone AND first
--     name up front — where venue check-in, which is only alive while an administrator says so,
--     starts from the phone alone.
--   * ATTENDANCE IS STILL REQUIRED.  A certificate of participation for someone who did not
--     participate is a false document, and that sentence is load-bearing: the predicate below is the
--     same one `get_certificate` applies, so a person who never arrived cannot be talked into one by
--     any amount of correct identification.
--   * NO NAME IS EVER RETURNED.  The result is one word and, on success, one token.  There is still
--     no endpoint in this database that answers "who is registered under this number".
--
-- Individual tokenized links remain valid and remain the admin's fallback (§ 4.6).

-- ---------------------------------------------------------------------------
-- The lookup.
--
-- Three answers, from one predicate, exactly as `self_check_in()`:
--
--     exactly one eligible attendee  →  found, with the token
--     age not supplied yet           →  need_age
--     otherwise                      →  not_found
--
-- `need_age` is the ONLY thing this routine will ever ask for beyond the two opening fields, and it
-- is reached by both "no match" and "several matches".  A household whose two teenagers are both
-- called `Ana` is the case it exists for; a prober who guesses a number and a name is answered the
-- same way, learns nothing, and is asked for a third field they also have to guess.
--
-- THE EVENT IS RESOLVED HERE, from `is_active`, and never taken from the caller.  That is the same
-- multi-event seam the public registration path uses (D18): when a second event exists this becomes
-- a parameter, and until then a portal with no event in its URL must not let one be supplied.
--
-- `certificates_enabled` is checked FIRST and answered as a flat `not_found`, so a disabled event
-- cannot be probed through a `need_age` that would confirm a name matched something.  The page also
-- refuses to run a lookup at all while the switch is off (§ 4.2); this is the backstop under it.
-- ---------------------------------------------------------------------------
create or replace function public.find_certificate(
  p_phone_e164 text,
  p_first_name text,
  -- NULL until the disambiguation step.
  p_age        smallint default null
)
returns table (
  -- found | need_age | not_found
  result text,
  -- The EXISTING capability, non-null only when `result` is `found`.  It is returned to our own
  -- server, which redirects the browser to `/certificado/<token>`; it is never serialised into a
  -- Server Action's return value, never rendered, and never logged.
  token  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event_id  uuid;
  v_first_key text;
  v_count     int;
  v_token     text;
begin
  -- Both opening fields are mandatory.  A caller that omits either is not asked for it — it is
  -- refused, because this endpoint's whole premise is that identification begins with two facts.
  if p_phone_e164 is null or btrim(p_phone_e164) = ''
     or p_first_name is null or btrim(p_first_name) = '' then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  select e.id into v_event_id
    from public.events e
   where e.is_active
     and e.certificates_enabled;

  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  v_first_key := split_part(public.registration_identity_key(p_first_name), ' ', 1);

  select count(*)::int into v_count
    from public.registrations r
   where r.event_id = v_event_id
     and r.phone_e164 = p_phone_e164
     and r.status = 'confirmed'
     and r.attended_at is not null
     and split_part(public.registration_identity_key(r.full_name), ' ', 1) = v_first_key
     and (p_age is null or r.age = p_age);

  if v_count <> 1 then
    return query select case when p_age is null then 'need_age' else 'not_found' end::text,
                        null::text;
    return;
  end if;

  select r.certificate_token into v_token
    from public.registrations r
   where r.event_id = v_event_id
     and r.phone_e164 = p_phone_e164
     and r.status = 'confirmed'
     and r.attended_at is not null
     and split_part(public.registration_identity_key(r.full_name), ' ', 1) = v_first_key
     and (p_age is null or r.age = p_age);

  return query select 'found'::text, v_token;
end;
$$;

-- ACL (§ 8.5): service_role ONLY, exactly as `get_certificate` and `register_for_event`.  The lookup
-- is protected by Turnstile in the Server Action; a grant to `anon` would put the only anti-abuse
-- control on a personal-data endpoint outside the only path that reaches it.
revoke all on function public.find_certificate(text, text, smallint)
  from public, anon, authenticated, service_role;
grant execute on function public.find_certificate(text, text, smallint) to service_role;

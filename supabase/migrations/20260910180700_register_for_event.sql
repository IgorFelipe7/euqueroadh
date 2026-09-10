-- Migration 8 — the public allocation path (DATABASE-SECURITY.md § 5).
--
-- THE FORBIDDEN PATTERN, for the avoidance of doubt:
--     SELECT count(*) ... ; if (count < capacity) { INSERT ... }
-- Two requests interleaving between the read and the insert both pass the check and the event is
-- oversold.  The whole decision therefore happens inside ONE transaction, serialised on the event
-- row, and the CHECK constraint on events stands behind it as the guarantee.
--
-- Never add a network call (Turnstile, logging, a webhook) inside this transaction: Turnstile
-- verification belongs in the Server Action, BEFORE the RPC is invoked.

create or replace function public.register_for_event(
  p_event_id   uuid,
  p_full_name  text,
  p_age        smallint,
  p_phone_e164 text
)
returns table (
  outcome         text,                       -- confirmed | waitlisted | already_registered | closed | full
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
  -- This is the ONE serialization point for all registrations on this event;
  -- everything after this line is effectively single-threaded per event.
  -- Do not remove FOR UPDATE "because the CHECK constraint covers it": the
  -- constraint prevents overselling, the lock is what makes the duplicate
  -- check and the allocation decision atomic with each other.
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
  -- Checked FIRST so a double tap always gets a coherent answer, even if the
  -- event filled or closed between the two taps.  The stored row is never
  -- modified here: a resubmission must not let anyone who knows a phone
  -- number rewrite that person's registration (PRODUCT-SPEC.md § 9).
  ---------------------------------------------------------------------------
  -- Columns are qualified through an alias because this function's OUT parameters (`status`,
  -- `registration_id`) are PL/pgSQL variables that would otherwise shadow the column names.
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
    -- the trigger increments confirmed_count; the CHECK constraint guards I1

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

  -- I4: read and increment under the SAME lock, so ranks are strictly increasing with no gaps
  -- and no duplicates.  Never generate a rank with an unlocked max(rank)+1.
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

-- ACL (§ 8.5): service_role ONLY.  The public write path must not be reachable with a publishable
-- key, or Turnstile verification and rate limiting would sit outside the only path to the
-- database and be trivially bypassable.  Never grant this to anon or authenticated.
revoke all on function public.register_for_event(uuid, text, smallint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_for_event(uuid, text, smallint, text) to service_role;

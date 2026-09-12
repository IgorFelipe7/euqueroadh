-- Migration 12 — promoting one named person off the waitlist.
--
-- ADMIN-SPEC.md § 4.4 specifies `Confirmar vaga` as a per-row action: "Promoting out of order is
-- allowed — an organizer may know that a particular person can definitely attend — and the stored
-- waitlist_rank keeps the record of what actually happened."  `promote_from_waitlist(event, count)`
-- takes the N oldest and cannot express that, so this is its sibling rather than a replacement.
--
-- It is deliberately NOT a direct UPDATE from application code.  `authenticated` holds no write
-- privilege on any table (migration 10), and a PostgREST PATCH could not carry the capacity check
-- and the audit write inside the same transaction.  The shape is identical to every other
-- administrative routine (§ 6):
--   1. authorize   2. lock the event row (I6)   3. validate   4. mutate   5. audit   6. narrow return
--
-- The audit action is `registration.promoted`, the same one the bulk routine writes, so the trail
-- reads uniformly and admin_actions_known_action needs no new value.  The metadata distinguishes
-- the two by carrying `manual: true` and the single id.

create or replace function public.promote_registration(p_registration_id uuid)
returns table (registration_id uuid, full_name text, phone_e164 text, waitlist_rank integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.events%rowtype;
  v_reg      public.registrations%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  -- An unlocked read, purely to discover which event to lock.  It takes no row lock, so it cannot
  -- invert the order in I6.
  select r.* into v_reg from public.registrations r where r.id = p_registration_id;
  if not found then
    raise exception 'registration_not_found' using errcode = 'no_data_found';
  end if;

  select e.* into v_event from public.events e where e.id = v_reg.event_id for update;   -- I6
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  -- Re-read the registration under the event lock: between the two statements above another
  -- administrator may have promoted or cancelled this very row.
  select r.* into v_reg from public.registrations r where r.id = p_registration_id;

  if v_reg.status <> 'waitlisted' then
    raise exception 'not_waitlisted' using errcode = 'check_violation';
  end if;

  -- The same capacity rule the bulk routine applies, evaluated inside the lock.  The CHECK
  -- constraint on events stands behind it either way (I1), so this can refuse but cannot oversell.
  if v_event.confirmed_count >= v_event.capacity then
    raise exception 'no_headroom' using errcode = 'check_violation';
  end if;

  update public.registrations r
     set status = 'confirmed',
         status_changed_at = now()
   where r.id = p_registration_id;
  -- waitlist_rank is deliberately KEPT, so the promotion order stays auditable (I4).

  perform public.record_admin_action(
    'registration.promoted', v_event.id, p_registration_id,
    jsonb_build_object('requested', 1, 'promoted', 1, 'manual', true,
                       'registration_ids', to_jsonb(array[p_registration_id])));

  -- Name and telephone number, for the same reason the bulk routine returns them: the organizer
  -- has to telephone this person, because the system sends no messages (D2).
  return query
    select v_reg.id, v_reg.full_name, v_reg.phone_e164, v_reg.waitlist_rank;
end;
$$;

revoke all on function public.promote_registration(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.promote_registration(uuid) to authenticated;

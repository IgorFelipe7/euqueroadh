-- Migration 13 — attendance.
--
-- RAFFLE-AND-CERTIFICATE-SPEC.md § 1.  The fact both new features are ABOUT: a raffle draws from
-- the people who are present, and a certificate of participation asserts that someone participated.
-- Building either on `status = 'confirmed'` alone would make the first unfair and the second false.
--
-- PRODUCT-SPEC.md § 2.2 lists attendance tracking as out of scope for V1.  That line is superseded
-- here, for attendance only; QR codes, tickets, seat maps and payments remain out of scope.

alter table public.registrations add column attended_at timestamptz;

comment on column public.registrations.attended_at is
  'Check-in moment. NULL means not checked in. Assigned once and never rewritten by a repeat '
  'check-in, so it is the arrival time rather than the last-tap time.';

-- The raffle pool query and the door screen''s running count both read exactly this.
create index registrations_attended_idx
  on public.registrations (event_id)
  where attended_at is not null;

-- ---------------------------------------------------------------------------
-- NO attended_count COLUMN ON events, DELIBERATELY.
--
-- confirmed_count and waitlist_count exist because I1 — never oversold — is a CHECK constraint,
-- and a CHECK can only reference columns of its own row (D1).  That is the entire reason those
-- counters are denormalised, and it is a reason attendance does not share: there is no maximum
-- number of people who may be present, so attendance carries no invariant for a constraint to
-- enforce.  A count(*) over the partial index above, at three hundred rows, costs nothing, and
-- adding a counter would mean editing sync_event_counts() — the most load-bearing trigger in the
-- schema — for a number nothing depends on.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The audit vocabulary gains one action.
--
-- The constraint is dropped and recreated rather than edited because a CHECK has no ALTER.  Every
-- existing value is carried over verbatim; the new one is appended.
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
  'admin.removed'
));

-- ---------------------------------------------------------------------------
-- The routine (§ 1.2).  The standard six-step shape of DATABASE-SECURITY.md § 6.
-- ---------------------------------------------------------------------------
create or replace function public.set_registration_attendance(
  p_registration_id uuid,
  p_present         boolean
)
returns table (registration_id uuid, attended_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_reg   public.registrations%rowtype;
  v_new   public.registrations%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_present is null then
    raise exception 'invalid_attendance' using errcode = 'check_violation';
  end if;

  -- An unlocked read, purely to discover which event to lock.  It takes no row lock, so it cannot
  -- invert the order in I6.
  select r.* into v_reg from public.registrations r where r.id = p_registration_id;
  if not found then
    raise exception 'registration_not_found' using errcode = 'no_data_found';
  end if;

  -- I6.  Locked even though attendance touches no counter: keeping "always the event before the
  -- registration" true by construction is worth more than the microseconds two organizers spend
  -- contending at a door.
  select e.* into v_event from public.events e where e.id = v_reg.event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  -- Re-read under the lock: between the two statements another organizer may have cancelled or
  -- promoted this very row.
  select r.* into v_reg from public.registrations r where r.id = p_registration_id;

  -- A waitlisted person standing at the door is a PROMOTION, not a check-in.  Marking them present
  -- here would put someone in the room that I1 says has no seat; the organizer promotes them first,
  -- through a routine that checks capacity and audits the fact.
  if v_reg.status <> 'confirmed' then
    raise exception 'not_confirmed' using errcode = 'check_violation';
  end if;

  update public.registrations r
     -- coalesce, so a double tap at the door does not rewrite the arrival time.
     set attended_at = case when p_present then coalesce(r.attended_at, now()) else null end
   where r.id = p_registration_id
  returning r.* into v_new;

  -- I9: audited in the same transaction.  A boolean and nothing else — never a name, never a phone.
  perform public.record_admin_action(
    'registration.attendance_set', v_event.id, p_registration_id,
    jsonb_build_object('present', p_present));

  return query select v_new.id, v_new.attended_at;
end;
$$;

revoke all on function public.set_registration_attendance(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_registration_attendance(uuid, boolean) to authenticated;

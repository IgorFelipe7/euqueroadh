-- Migration 9 — the administrative mutation surface.
--
-- Every routine in this file follows the same six-step shape inside ONE transaction (§ 6):
--   1. authorize   — public.is_active_admin(), first statement, no exceptions.  SECURITY DEFINER
--                    bypasses RLS, so nothing else protects the body.
--   2. lock        — the event row FOR UPDATE before touching registrations (I6).
--   3. validate    — business preconditions, raised as NAMED errors the UI maps to pt-BR copy.
--   4. mutate.
--   5. audit       — public.record_admin_action(), in the same transaction (I9).
--   6. return      — a narrow outcome, never a raw row.
--
-- If any step raises, the whole transaction rolls back: no mutation without its audit record, and
-- no audit record without its mutation.
--
-- Column references are alias-qualified throughout, because the RETURNS TABLE columns of these
-- routines are PL/pgSQL variables that would otherwise shadow same-named table columns.

-- ---------------------------------------------------------------------------
-- Promotion (§ 6.1)
-- ---------------------------------------------------------------------------
create or replace function public.promote_from_waitlist(
  p_event_id uuid,
  p_count    integer default 1
)
returns table (registration_id uuid, full_name text, phone_e164 text, waitlist_rank integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.events%rowtype;
  v_headroom integer;
  v_take     integer;
  v_ids      uuid[];
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_count is null or p_count < 1 then
    raise exception 'invalid_count' using errcode = 'check_violation';
  end if;

  select e.* into v_event from public.events e where e.id = p_event_id for update;  -- I6
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  v_headroom := v_event.capacity - v_event.confirmed_count;
  v_take     := least(p_count, greatest(v_headroom, 0));

  if v_take = 0 then
    -- "No headroom" is a normal outcome, not an error, and is not audited: nothing changed.
    return;
  end if;

  -- Oldest eligible first (I4).  The rows are locked here, AFTER the event row, never before.
  with next_up as (
    select r.id, r.waitlist_rank
      from public.registrations r
     where r.event_id = p_event_id
       and r.status = 'waitlisted'
     order by r.waitlist_rank asc
     limit v_take
     for update
  )
  select array_agg(n.id order by n.waitlist_rank) into v_ids from next_up n;

  if v_ids is null then
    return;
  end if;

  update public.registrations r
     set status = 'confirmed',
         status_changed_at = now()
   where r.id = any(v_ids);
  -- the trigger moves the counters; the CHECK constraint guards I1
  -- waitlist_rank is deliberately KEPT, so the promotion order stays auditable.

  -- I9: audited in the SAME transaction.  Counts and ids only, never names or phones.
  perform public.record_admin_action(
    'registration.promoted', p_event_id, null,
    jsonb_build_object(
      'requested', p_count,
      'promoted',  cardinality(v_ids),
      'registration_ids', to_jsonb(v_ids)));

  -- The one place an RPC returns participant data: the organizer has to telephone these people.
  -- Note the asymmetry with the audit metadata above, which carries only ids and counts.
  return query
    select r.id, r.full_name, r.phone_e164, r.waitlist_rank
      from public.registrations r
     where r.id = any(v_ids)
     order by r.waitlist_rank;
end;
$$;

revoke all on function public.promote_from_waitlist(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.promote_from_waitlist(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Cancellation (§ 6.2)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_registration(p_registration_id uuid)
returns public.registration_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_old      public.registration_status;
  v_new      public.registration_status;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  -- An unlocked read: it takes no row lock, so it cannot invert the order in I6.
  select r.event_id, r.status into v_event_id, v_old
    from public.registrations r where r.id = p_registration_id;
  if v_event_id is null then
    raise exception 'registration_not_found' using errcode = 'no_data_found';
  end if;

  perform 1 from public.events e where e.id = v_event_id for update;   -- I6: events first

  update public.registrations r
     set status = 'cancelled', status_changed_at = now()
   where r.id = p_registration_id and r.status <> 'cancelled'
  returning r.status into v_new;

  -- Idempotent: an already-cancelled registration is not an error and is not audited twice.
  if v_new is not null then
    perform public.record_admin_action(
      'registration.cancelled', v_event_id, p_registration_id,
      jsonb_build_object('previous_status', v_old));      -- status only, never PII
  end if;

  -- Cancelling a confirmed registration frees a seat immediately (trigger) and promotes NOBODY:
  -- promotion is a human act because notification is a human act (§ 6.8).
  return coalesce(v_new, 'cancelled');
end;
$$;

revoke all on function public.cancel_registration(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_registration(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings (§ 6.4).  The ONLY writer of settings_version, together with the purge.
-- ---------------------------------------------------------------------------
create or replace function public.update_event_settings(
  p_event_id                  uuid,
  p_capacity                  integer,
  p_waitlist_enabled          boolean,
  p_state                     public.registration_state,
  p_expected_settings_version bigint            -- I8: the SETTINGS token, never updated_at
)
returns table (settings_version bigint, capacity integer,
               waitlist_enabled boolean, registration_state public.registration_state)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_new   public.events%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select e.* into v_event from public.events e where e.id = p_event_id for update;   -- I6
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  if v_event.settings_version <> p_expected_settings_version then
    raise exception 'settings_conflict' using errcode = 'serialization_failure';
  end if;

  if p_capacity is null or p_capacity < 0 then
    raise exception 'invalid_capacity' using errcode = 'check_violation';
  end if;

  if p_capacity < v_event.confirmed_count then
    raise exception 'capacity_below_confirmed:%', v_event.confirmed_count
      using errcode = 'check_violation';
  end if;

  -- I7, raised as a named error so the administrator sees
  -- "Defina a capacidade antes de abrir as inscrições." instead of a raw constraint violation.
  -- The table CHECK behind it also covers the reverse direction and any manual UPDATE.
  if p_state = 'open' and p_capacity <= 0 then
    raise exception 'capacity_required_to_open' using errcode = 'check_violation';
  end if;

  update public.events e
     set capacity           = p_capacity,
         waitlist_enabled   = p_waitlist_enabled,
         registration_state = p_state,
         settings_version   = v_event.settings_version + 1,   -- monotonic; only here and in purge
         updated_at         = now()
   where e.id = p_event_id
  returning e.* into v_new;

  perform public.record_admin_action(
    'settings.updated', p_event_id, null,
    jsonb_build_object(
      'from', jsonb_build_object('capacity', v_event.capacity,
                                 'waitlist_enabled', v_event.waitlist_enabled,
                                 'registration_state', v_event.registration_state),
      'to',   jsonb_build_object('capacity', v_new.capacity,
                                 'waitlist_enabled', v_new.waitlist_enabled,
                                 'registration_state', v_new.registration_state)));

  return query select v_new.settings_version, v_new.capacity,
                      v_new.waitlist_enabled, v_new.registration_state;
end;
$$;

revoke all on function public.update_event_settings(uuid, integer, boolean, public.registration_state, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.update_event_settings(uuid, integer, boolean, public.registration_state, bigint)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Participant correction (§ 6.3).
--
-- This is an RPC rather than a direct UPDATE so that the correction and its audit record share a
-- transaction (I9).  The earlier design granted column-scoped UPDATE (full_name, age, notes) to
-- `authenticated`; that path was withdrawn because a PostgREST PATCH cannot carry a guaranteed
-- audit write.  Do not reinstate it.
--
-- Three deliberate omissions:
--   * status      — transitions belong to cancel_registration / promote_from_waitlist, which
--                   handle capacity and the counters correctly;
--   * phone_e164  — it is the identity and duplicate key; changing it would silently move a
--                   registration to a different person;
--   * event_id    — a registration never moves between events (the counter trigger raises).
-- ---------------------------------------------------------------------------
create or replace function public.edit_registration(
  p_registration_id uuid,
  p_full_name       text,
  p_age             smallint,
  p_notes           text
)
returns table (registration_id uuid, full_name text, age smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_before   public.registrations%rowtype;
  v_changed  text[] := '{}';
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select r.* into v_before from public.registrations r where r.id = p_registration_id;
  if not found then
    raise exception 'registration_not_found' using errcode = 'no_data_found';
  end if;
  v_event_id := v_before.event_id;

  perform 1 from public.events e where e.id = v_event_id for update;   -- I6: events first

  -- Validation mirrors the table constraints so the UI gets a named error, not a raw violation.
  if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = 'check_violation';
  end if;
  if p_age is null or p_age not between 1 and 120 then
    raise exception 'invalid_age' using errcode = 'check_violation';
  end if;

  -- Record WHICH fields changed.  Never the values: those are participant personal data.
  if btrim(p_full_name)      <> v_before.full_name then v_changed := v_changed || 'full_name'::text; end if;
  if p_age                   <> v_before.age       then v_changed := v_changed || 'age'::text;       end if;
  if coalesce(p_notes, '') <> coalesce(v_before.notes, '') then
    v_changed := v_changed || 'notes'::text;
  end if;

  if cardinality(v_changed) = 0 then
    return query select v_before.id, v_before.full_name, v_before.age;   -- no write, no audit noise
    return;
  end if;

  update public.registrations r
     set full_name = btrim(p_full_name),
         age       = p_age,
         notes     = p_notes
   where r.id = p_registration_id;

  perform public.record_admin_action(
    'registration.edited', v_event_id, p_registration_id,
    jsonb_build_object('changed_fields', to_jsonb(v_changed)));

  return query select p_registration_id, btrim(p_full_name), p_age;
end;
$$;

revoke all on function public.edit_registration(uuid, text, smallint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.edit_registration(uuid, text, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Permanent erasure of one participant (§ 6.5).  Deliberately separate from cancellation:
-- the right to erasure does not require the person to be cancelled first.
-- ---------------------------------------------------------------------------
create or replace function public.delete_registration(p_registration_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_status   public.registration_status;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select r.event_id, r.status into v_event_id, v_status
    from public.registrations r where r.id = p_registration_id;
  if v_event_id is null then
    return false;                                    -- idempotent: already gone
  end if;

  perform 1 from public.events e where e.id = v_event_id for update;   -- I6

  delete from public.registrations r where r.id = p_registration_id;   -- the trigger fixes counters

  -- The audit row outlives the deleted registration: admin_actions.registration_id has no FK.
  perform public.record_admin_action(
    'registration.deleted', v_event_id, p_registration_id,
    jsonb_build_object('status_at_deletion', v_status));

  return true;
end;
$$;

revoke all on function public.delete_registration(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_registration(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Event-wide purge (§ 6.5) — the retention mechanism.
--
-- One atomic, audited database operation.  NOT a loop of per-row deletes in application code:
-- a failure half way through must leave the data untouched rather than half erased.
-- ---------------------------------------------------------------------------
create or replace function public.purge_event_registrations(
  p_event_id                  uuid,
  p_expected_settings_version bigint
)
returns table (deleted_count integer, settings_version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event   public.events%rowtype;
  v_deleted integer;
  v_conf    integer;
  v_wait    integer;
  v_cancel  integer;
  v_new_ver bigint;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select e.* into v_event from public.events e where e.id = p_event_id for update;   -- I6
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  -- Optimistic concurrency on the most destructive operation in the product: an administrator
  -- must not purge an event whose configuration changed after they loaded the confirmation screen.
  if v_event.settings_version <> p_expected_settings_version then
    raise exception 'settings_conflict' using errcode = 'serialization_failure';
  end if;

  select count(*) filter (where r.status = 'confirmed'),
         count(*) filter (where r.status = 'waitlisted'),
         count(*) filter (where r.status = 'cancelled')
    into v_conf, v_wait, v_cancel
    from public.registrations r where r.event_id = p_event_id;

  -- One set-based statement: no per-row round trip, no partial purge.
  with gone as (
    delete from public.registrations r where r.event_id = p_event_id returning 1
  )
  select count(*)::integer into v_deleted from gone;

  -- The per-row trigger has already driven the counters to zero; asserting the end state makes it
  -- deterministic.  registration_state is forced closed so a purged event cannot begin
  -- re-collecting personal data seconds after an erasure.  waitlist_seq is deliberately NOT reset.
  update public.events e
     set confirmed_count    = 0,
         waitlist_count     = 0,
         registration_state = 'closed',
         settings_version   = v_event.settings_version + 1,
         updated_at         = now()
   where e.id = p_event_id
  returning e.settings_version into v_new_ver;

  perform public.record_admin_action(
    'registrations.purged', p_event_id, null,
    jsonb_build_object('deleted_total', v_deleted,
                       'deleted_confirmed', v_conf,
                       'deleted_waitlisted', v_wait,
                       'deleted_cancelled', v_cancel,
                       'registration_state_forced', 'closed'));

  -- Repeated calls are idempotent and honest: a second purge deletes 0 rows, still forces closed,
  -- still advances the token, and still records deleted_total: 0.
  return query select v_deleted, v_new_ver;
end;
$$;

revoke all on function public.purge_event_registrations(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_event_registrations(uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Export audit (§ 6.7).  Changes no state, but moves personal data out of the system, so it is
-- audited BEFORE any byte is streamed: if the audit write fails, no data leaves.
-- ---------------------------------------------------------------------------
create or replace function public.record_export_action(
  p_event_id  uuid,
  p_row_count integer,
  p_filters   jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  perform public.record_admin_action('registrations.exported', p_event_id, null,
    jsonb_build_object('row_count', p_row_count, 'filters', coalesce(p_filters, '{}'::jsonb)));
end;
$$;

revoke all on function public.record_export_action(uuid, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_export_action(uuid, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Administrator lifecycle, database half only (§ 7.4).
--
-- The Supabase Auth Admin API calls (inviteUserByEmail, deleteUser) are HTTPS calls made by the
-- application layer; a PostgreSQL transaction cannot span them and this implementation does not
-- pretend otherwise.  Ordering is what makes both halves fail CLOSED: invite is Auth-then-database,
-- removal is database-then-Auth, because authorization lives here and only here.
--
-- These three routines touch neither events nor registrations, so I6 does not apply to them.  They
-- do serialise on admin_users: the last-administrator guard counts active administrators while
-- holding row locks, so two administrators removing each other concurrently cannot both succeed.
-- ---------------------------------------------------------------------------
create or replace function public.add_admin_user(
  p_user_id      uuid,
  p_email        text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'invalid_email' using errcode = 'check_violation';
  end if;

  -- Idempotent, because the Auth half may have to be retried: re-inviting an existing person
  -- restores their access rather than failing.
  insert into public.admin_users (user_id, email, display_name, is_active, invited_by)
  values (p_user_id, btrim(p_email), nullif(btrim(coalesce(p_display_name, '')), ''),
          true, (select auth.uid()))
  on conflict (user_id) do update
     set is_active    = true,
         email        = excluded.email,
         display_name = coalesce(excluded.display_name, public.admin_users.display_name);

  -- Ids only: the address is already stored in admin_users, and repeating it in the audit log
  -- would spread identifying data further than it needs to go.
  perform public.record_admin_action('admin.invited', null, null,
    jsonb_build_object('target_user_id', p_user_id));
end;
$$;

revoke all on function public.add_admin_user(uuid, text, text)
  from public, anon, authenticated, service_role;
-- Called with the INVITING administrator's own JWT, never the secret key: under service_role there
-- is no auth.uid(), so is_active_admin() would be false and the audit row would name nobody.
grant execute on function public.add_admin_user(uuid, text, text) to authenticated;

create or replace function public.set_admin_active(
  p_user_id uuid,
  p_active  boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := (select auth.uid());
  v_was_active boolean;
  v_others     integer;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_active is not true and p_user_id = v_actor then
    raise exception 'cannot_modify_self' using errcode = 'check_violation';
  end if;

  -- Locking every active administrator row serialises concurrent revocations, so the count below
  -- cannot be read from a snapshot that another transaction is about to invalidate.
  select count(*) into v_others
    from (select a.user_id from public.admin_users a where a.is_active for update) as locked;

  select a.is_active into v_was_active
    from public.admin_users a where a.user_id = p_user_id;
  if v_was_active is null then
    raise exception 'admin_not_found' using errcode = 'no_data_found';
  end if;

  if p_active is not true and v_was_active and v_others <= 1 then
    raise exception 'last_active_admin' using errcode = 'check_violation';
  end if;

  if v_was_active = p_active then
    return p_active;                                 -- idempotent: no write, no audit noise
  end if;

  update public.admin_users a set is_active = p_active where a.user_id = p_user_id;

  perform public.record_admin_action(
    case when p_active then 'admin.reactivated' else 'admin.deactivated' end,
    null, null, jsonb_build_object('target_user_id', p_user_id));

  return p_active;
end;
$$;

revoke all on function public.set_admin_active(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_admin_active(uuid, boolean) to authenticated;

create or replace function public.remove_admin_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := (select auth.uid());
  v_was_active boolean;
  v_others     integer;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_user_id = v_actor then
    raise exception 'cannot_modify_self' using errcode = 'check_violation';
  end if;

  select count(*) into v_others
    from (select a.user_id from public.admin_users a where a.is_active for update) as locked;

  select a.is_active into v_was_active
    from public.admin_users a where a.user_id = p_user_id;
  if v_was_active is null then
    return false;                                    -- idempotent: already gone
  end if;

  if v_was_active and v_others <= 1 then
    raise exception 'last_active_admin' using errcode = 'check_violation';
  end if;

  delete from public.admin_users a where a.user_id = p_user_id;

  -- Written here, in step 1 of a two-system operation, so the record exists whether or not the
  -- subsequent Auth deletion succeeds.  If it does, ON DELETE SET NULL blanks actor_user_id on
  -- this actor's own historical rows while actor_label keeps them readable.
  perform public.record_admin_action('admin.removed', null, null,
    jsonb_build_object('target_user_id', p_user_id));

  return true;
end;
$$;

revoke all on function public.remove_admin_user(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_admin_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reconciliation (§ 6.5).  Must return zero rows at all times: it is the executable form of I2.
-- ---------------------------------------------------------------------------
create or replace function public.verify_event_counters()
returns table (event_id uuid, stored_confirmed int, actual_confirmed bigint,
                              stored_waitlist  int, actual_waitlist  bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Gated like every other SECURITY DEFINER administrative routine (§ 8.5): it returns no
  -- participant data, but an ungated definer routine is a habit worth not forming.
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  return query
    select e.id, e.confirmed_count,
           count(*) filter (where r.status = 'confirmed'),
           e.waitlist_count,
           count(*) filter (where r.status = 'waitlisted')
      from public.events e
      left join public.registrations r on r.event_id = e.id
     group by e.id, e.confirmed_count, e.waitlist_count
    having e.confirmed_count <> count(*) filter (where r.status = 'confirmed')
        or e.waitlist_count  <> count(*) filter (where r.status = 'waitlisted');
end;
$$;

revoke all on function public.verify_event_counters()
  from public, anon, authenticated, service_role;
grant execute on function public.verify_event_counters() to authenticated;

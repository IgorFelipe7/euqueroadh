-- Migration 6 — the single writer of the derived counters (I2).
--
-- confirmed_count and waitlist_count are derived data stored on the event row for two reasons
-- (DATABASE-SECURITY.md § 4): the counter IS the concurrency mechanism (comparing and updating one
-- integer on one locked row is what makes allocation atomic), and a CHECK constraint can only
-- reference its own row — without the stored counter, I1 could not be a database constraint at all.
--
-- Storing derived data is only safe with exactly ONE writer.  That writer is this trigger.
-- Application code must never maintain these columns.

create or replace function public.sync_event_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d_conf integer := 0;
  d_wait integer := 0;
begin
  if tg_op = 'INSERT' then
    if new.status = 'confirmed'  then d_conf :=  1; end if;
    if new.status = 'waitlisted' then d_wait :=  1; end if;

  elsif tg_op = 'DELETE' then
    if old.status = 'confirmed'  then d_conf := -1; end if;
    if old.status = 'waitlisted' then d_wait := -1; end if;

  else -- UPDATE
    -- A registration never moves between events: the counters of two events would have to change
    -- in one pass, and the audit trail would silently describe the wrong event.
    if old.event_id <> new.event_id then
      raise exception 'registrations.event_id is immutable';
    end if;
    if old.status = new.status then
      return null;                                   -- nothing to do
    end if;
    if old.status = 'confirmed'  then d_conf := d_conf - 1; end if;
    if old.status = 'waitlisted' then d_wait := d_wait - 1; end if;
    if new.status = 'confirmed'  then d_conf := d_conf + 1; end if;
    if new.status = 'waitlisted' then d_wait := d_wait + 1; end if;
  end if;

  if d_conf <> 0 or d_wait <> 0 then
    update public.events
       set confirmed_count = confirmed_count + d_conf,
           waitlist_count  = waitlist_count  + d_wait,
           updated_at      = now()
           -- I8: settings_version is deliberately NOT touched here.  Registration activity must
           -- never invalidate an administrator's open settings form.
     where id = coalesce(new.event_id, old.event_id);
  end if;

  return null;
end;
$$;

-- ACL (§ 8.5): granted to NOBODY.  A trigger fires regardless of the EXECUTE privilege of the role
-- performing the write, so no grant is needed — and any grant would expose an internal helper.
revoke all on function public.sync_event_counts() from public, anon, authenticated, service_role;

-- LOCK ORDER (I6): this trigger takes the events row lock AFTER a registrations row has been
-- touched.  Inside register_for_event() and the admin RPCs that lock is already held, so there is
-- no extra contention and no inversion.  It is also why no role may write registrations directly:
-- a bare UPDATE would acquire registrations -> events, the reverse of every RPC, and the two orders
-- can deadlock.
create trigger registrations_sync_counts
after insert or update of status, event_id or delete on public.registrations
for each row execute function public.sync_event_counts();

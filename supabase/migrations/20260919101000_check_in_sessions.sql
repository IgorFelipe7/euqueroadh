-- Migration 17 — the venue check-in session.
--
-- WHY A SESSION EXISTS AT ALL, AND WHY SELF CHECK-IN IS NOT A PERMANENT URL.
--
-- Self check-in is a public, unauthenticated write against a participant's own record.  The only
-- thing standing between "the guest confirms their own arrival in four seconds" and "anybody on the
-- internet can mark anybody present from anywhere, forever" is that the capability is SCOPED IN
-- TIME and OPENED BY A HUMAN.  A permanent `/presenca` endpoint would be a standing invitation to
-- corrupt the raffle pool and the certificate eligibility set months after the room emptied.
--
-- So: an administrator opens check-in, the wall shows a QR for exactly that session, and closing it
-- — or letting it expire — makes every copy of that URL, in every camera roll and every screenshot,
-- inert.  Attendance can still be set by an organizer on `/admin/presenca` at any time, because
-- that path is authenticated and audited and is the documented fallback.
--
-- ---------------------------------------------------------------------------
-- THE TOKEN IS STORED IN CLEAR, AND THAT IS A DECISION RATHER THAN AN OMISSION.
--
-- The theoretically cleaner scheme is to store `sha256(token)` and show the clear value once, at
-- the moment it is minted.  It is rejected here for one operational reason that outranks the
-- theory: the wall is a web page.  It gets reloaded.  The laptop driving the projector gets closed
-- and reopened, the browser gets restarted, a second organizer opens the wall on a different
-- machine, the operator refreshes because the count looked stuck.  Under a hash-only scheme every
-- one of those events destroys the only copy of the capability and the QR on the projector — the
-- one two hundred people are pointing their cameras at — would have to be replaced mid-event.
--
-- What the clear token costs, precisely: an attacker who can already read this table can mark
-- people present while the session is open.  Compare that to what such an attacker already has —
-- `registrations` holds every participant's name, age and telephone number, and
-- `registrations.certificate_token` is stored in clear for the same reason (migration 15).  The
-- token adds no exposure class that a reader of this database does not already possess, and it is
-- reachable by NO Data API role: `anon` and `service_role` hold nothing on this table, and
-- `authenticated` reads it only through a policy that calls `is_active_admin()`.  The public path
-- never selects from it at all — it goes through the SECURITY DEFINER routines in migration 18.
--
-- Entropy is where the protection actually lives: 160 bits, exactly as the certificate token, which
-- is not guessable with any amount of traffic this endpoint could absorb.
-- ---------------------------------------------------------------------------

create type public.check_in_session_status as enum ('open', 'closed');

-- 160 bits, URL-safe, 27 characters — the same construction as `new_certificate_token()`.
--
-- A SECOND function rather than a reuse of that one, deliberately: these are two different
-- capability classes with two different lifetimes, and the day one of them needs a different length
-- or a different alphabet must not be the day the other silently changes too.
create or replace function public.new_check_in_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(20), 'base64'), '+/=' || chr(10), '-_')
$$;

-- ACL (§ 8.5): granted to NOBODY.  Evaluated only by the SECURITY DEFINER routines below, which run
-- as the owner.
revoke all on function public.new_check_in_token()
  from public, anon, authenticated, service_role;

create table public.check_in_sessions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,

  -- The capability the QR encodes, and the only thing the public URL carries.  Never a sequential
  -- id: `/presenca/1` would be an open door with a number painted on it.
  token       text not null,

  status      public.check_in_session_status not null default 'open',

  -- Snapshotted like `admin_actions.actor_label` is not: the session is operational state, not an
  -- audit record, and the audit row for the opening carries the accountability.  ON DELETE SET NULL
  -- so removing an administrator does not cascade away the event's check-in history.
  opened_by   uuid references auth.users(id) on delete set null,

  opened_at   timestamptz not null default now(),

  -- A hard ceiling, so a session an organizer forgets to close stops being a capability by itself.
  -- Twelve hours from opening: long enough for setup, doors, the talk and the raffles with room to
  -- spare, short enough that a forgotten session is dead before the next morning.
  expires_at  timestamptz not null,

  closed_at   timestamptz,
  created_at  timestamptz not null default now(),

  -- Shape only, and the shape `new_check_in_token()` produces.  It is what makes a hand-written
  -- `update ... set token = 'abc'` fail rather than quietly create a guessable session.
  constraint check_in_sessions_token_shape check (token ~ '^[A-Za-z0-9_-]{27}$'),
  -- A status and its timestamp arrive together or not at all — the same discipline as
  -- `raffle_draws_decided_iff`.
  constraint check_in_sessions_closed_iff
    check ((status = 'closed') = (closed_at is not null)),
  constraint check_in_sessions_expiry_after_open check (expires_at > opened_at)
);

create unique index check_in_sessions_token_uidx on public.check_in_sessions (token);

-- ONE open session per event, as a constraint rather than as a convention.  Two open sessions would
-- mean two live QR codes, one of which an operator believes they have closed — the failure mode is
-- an administrator who thinks check-in is shut while a screenshot from twenty minutes ago still
-- works.  The partial unique index makes that unrepresentable.
create unique index check_in_sessions_one_open_uidx
  on public.check_in_sessions (event_id) where status = 'open';

create index check_in_sessions_event_idx on public.check_in_sessions (event_id, opened_at desc);

comment on table public.check_in_sessions is
  'A time-boxed, human-opened capability for public self check-in. The public URL is valid only '
  'while its session is open and unexpired; closing it invalidates every copy of the QR.';
comment on column public.check_in_sessions.token is
  'The capability the QR encodes. 160 bits. Stored in clear so the wall can redisplay the QR after '
  'a reload — see the header of this migration for the full trade-off.';

-- ---------------------------------------------------------------------------
-- RLS and privileges — exactly the shape of every other table (migration 10).
--
-- `authenticated` reads under a policy that calls `is_active_admin()`; `anon` and `service_role`
-- hold nothing; nobody holds a write privilege, because every mutation is an RPC.
-- ---------------------------------------------------------------------------
alter table public.check_in_sessions enable row level security;

create policy check_in_sessions_admin_read on public.check_in_sessions
  for select to authenticated using (public.is_active_admin());

grant select on public.check_in_sessions to authenticated;

revoke insert, update, delete, truncate on public.check_in_sessions
  from anon, authenticated, service_role;
-- The secret key must not read this table: the public path resolves a token through a definer
-- routine that returns the event's display copy and nothing else, never the row.
revoke select on public.check_in_sessions from anon, service_role;

-- ---------------------------------------------------------------------------
-- The audit vocabulary gains three actions.
--
-- Dropped and recreated because a CHECK has no ALTER.  Every existing value is carried over
-- verbatim; the new ones are appended.
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
  'raffle.reset',
  -- Migration 17. Opening check-in creates a public write capability and closing it destroys one;
  -- both are exactly the kind of act the audit trail exists for.
  'checkin.session_opened',
  'checkin.session_rotated',
  'checkin.session_closed'
));

-- ---------------------------------------------------------------------------
-- Opening — and rotating, which is the same act with one extra step.
--
-- `p_rotate = false` is IDEMPOTENT by design.  An operator who taps `Abrir check-in` twice, or two
-- organizers who open the admin screen at once, must not invalidate the QR already on the
-- projector: the existing live session is returned unchanged and nothing is audited, because
-- nothing happened.
--
-- `p_rotate = true` is the deliberate "that QR leaked, give me a new one" action: the live session
-- is closed and a new token is minted, which is a real state change and is audited as one.
--
-- An EXPIRED open session is closed and replaced in both modes.  Returning it would hand back a URL
-- that `self_check_in()` will refuse, which is the one outcome an operator cannot diagnose from the
-- screen.
-- ---------------------------------------------------------------------------
create or replace function public.open_check_in_session(
  p_event_id uuid,
  p_rotate   boolean default false
)
returns table (
  session_id uuid,
  token      text,
  opened_at  timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.events%rowtype;
  v_existing public.check_in_sessions%rowtype;
  v_new      public.check_in_sessions%rowtype;
  v_rotated  boolean := false;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  -- I6: the event before anything that hangs off it.  It is also the serialization point that makes
  -- `check_in_sessions_one_open_uidx` a backstop rather than the thing two concurrent operators
  -- collide on.
  select e.* into v_event from public.events e where e.id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  select s.* into v_existing
    from public.check_in_sessions s
   where s.event_id = p_event_id
     and s.status = 'open'
   for update;

  if found then
    -- Live, and nothing was asked of it: hand it back untouched.
    if not coalesce(p_rotate, false) and v_existing.expires_at > now() then
      return query select v_existing.id, v_existing.token, v_existing.opened_at,
                          v_existing.expires_at;
      return;
    end if;

    update public.check_in_sessions s
       set status = 'closed', closed_at = now()
     where s.id = v_existing.id;

    v_rotated := coalesce(p_rotate, false);
  end if;

  insert into public.check_in_sessions (event_id, token, expires_at, opened_by)
  values (p_event_id, public.new_check_in_token(), now() + interval '12 hours',
          (select auth.uid()))
  returning * into v_new;

  -- I9: audited in the same transaction.  The token is NEVER in the metadata — an audit log is read
  -- by more people, and kept for longer, than the capability it would be quoting.
  perform public.record_admin_action(
    case when v_rotated then 'checkin.session_rotated' else 'checkin.session_opened' end,
    p_event_id, null,
    jsonb_build_object('session_id', v_new.id, 'expires_at', v_new.expires_at));

  return query select v_new.id, v_new.token, v_new.opened_at, v_new.expires_at;
end;
$$;

revoke all on function public.open_check_in_session(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.open_check_in_session(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Closing.
--
-- Idempotent in the other direction: closing an already-closed event answers `false` rather than
-- raising, because "check-in is shut" is the state the operator wanted and an error would read as a
-- failure to shut it.  Only a real transition is audited.
-- ---------------------------------------------------------------------------
create or replace function public.close_check_in_session(p_event_id uuid)
returns table (closed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.events%rowtype;
  v_existing public.check_in_sessions%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'not_authorized' using errcode = 'insufficient_privilege';
  end if;

  select e.* into v_event from public.events e where e.id = p_event_id for update;   -- I6
  if not found then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  select s.* into v_existing
    from public.check_in_sessions s
   where s.event_id = p_event_id
     and s.status = 'open'
   for update;

  if not found then
    return query select false;
    return;
  end if;

  update public.check_in_sessions s
     set status = 'closed', closed_at = now()
   where s.id = v_existing.id;

  perform public.record_admin_action(
    'checkin.session_closed', p_event_id, null,
    jsonb_build_object('session_id', v_existing.id));

  return query select true;
end;
$$;

revoke all on function public.close_check_in_session(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.close_check_in_session(uuid) to authenticated;

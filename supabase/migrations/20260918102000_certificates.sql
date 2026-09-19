-- Migration 15 — certificates.
--
-- RAFFLE-AND-CERTIFICATE-SPEC.md § 4.
--
-- ACCESS IS AN UNGUESSABLE TOKEN, AND THERE IS NO LOOKUP BY TELEPHONE NUMBER.
--
-- A page that answers "what is the name registered to this number" is a personal-data disclosure
-- endpoint with a form in front of it.  A rate limit and a CAPTCHA reduce the VOLUME of that
-- disclosure; they do not change what it is.  An unguessable link discloses nothing to anyone who
-- does not already have it.  The cost is that the organizer distributes the links, which is what
-- the admin's WhatsApp deep-link exists for.

-- 160 bits, URL-safe, 27 characters.  `translate` with a longer `from` than `to` deletes the
-- surplus characters, which is how `=` padding and any base64 line break are removed.
create or replace function public.new_certificate_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(20), 'base64'), '+/=' || chr(10), '-_')
$$;

-- ACL (§ 8.5): granted to NOBODY.  It is only ever evaluated by the table owner, as a column
-- default, and by the SECURITY DEFINER routines, which run as the owner.
revoke all on function public.new_certificate_token()
  from public, anon, authenticated, service_role;

alter table public.registrations
  add column certificate_token text not null default public.new_certificate_token();

create unique index registrations_certificate_token_uidx
  on public.registrations (certificate_token);

comment on column public.registrations.certificate_token is
  'The capability that grants access to this person''s certificate. Secret: never rendered in the '
  'admin except behind an explicit copy action, never logged, never exported unmasked.';

-- The gate the organizer flips after the event.
alter table public.events
  add column certificates_enabled boolean not null default false;

comment on column public.events.certificates_enabled is
  'Master switch for /certificado. A certificate is issued only when this is on AND the '
  'registration is confirmed AND attended_at is set: a certificate of participation for someone '
  'who did not participate is a false document.';


-- ---------------------------------------------------------------------------
-- update_event_settings gains the switch.
--
-- The parameter list changes, so the old routine is DROPPED rather than replaced: `create or
-- replace` with a different signature creates an overload, and two functions of the same name with
-- different arities is exactly the ambiguity a deny-by-default ACL matrix cannot describe.
-- ---------------------------------------------------------------------------
drop function public.update_event_settings(uuid, integer, boolean, public.registration_state, bigint);

create or replace function public.update_event_settings(
  p_event_id                  uuid,
  p_capacity                  integer,
  p_waitlist_enabled          boolean,
  p_state                     public.registration_state,
  p_certificates_enabled      boolean,
  p_expected_settings_version bigint            -- I8: the SETTINGS token, never updated_at
)
returns table (settings_version bigint, capacity integer, waitlist_enabled boolean,
               registration_state public.registration_state, certificates_enabled boolean)
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
  if p_state = 'open' and p_capacity <= 0 then
    raise exception 'capacity_required_to_open' using errcode = 'check_violation';
  end if;

  update public.events e
     set capacity             = p_capacity,
         waitlist_enabled     = p_waitlist_enabled,
         registration_state   = p_state,
         certificates_enabled = coalesce(p_certificates_enabled, e.certificates_enabled),
         settings_version     = v_event.settings_version + 1,   -- monotonic; only here and in purge
         updated_at           = now()
   where e.id = p_event_id
  returning e.* into v_new;

  perform public.record_admin_action(
    'settings.updated', p_event_id, null,
    jsonb_build_object(
      'from', jsonb_build_object('capacity', v_event.capacity,
                                 'waitlist_enabled', v_event.waitlist_enabled,
                                 'registration_state', v_event.registration_state,
                                 'certificates_enabled', v_event.certificates_enabled),
      'to',   jsonb_build_object('capacity', v_new.capacity,
                                 'waitlist_enabled', v_new.waitlist_enabled,
                                 'registration_state', v_new.registration_state,
                                 'certificates_enabled', v_new.certificates_enabled)));

  return query select v_new.settings_version, v_new.capacity, v_new.waitlist_enabled,
                      v_new.registration_state, v_new.certificates_enabled;
end;
$$;

revoke all on function public.update_event_settings(
  uuid, integer, boolean, public.registration_state, boolean, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.update_event_settings(
  uuid, integer, boolean, public.registration_state, boolean, bigint) to authenticated;


-- ---------------------------------------------------------------------------
-- The public read (§ 4.3).
--
-- `registrations` is unreachable by anon and by service_role (migration 10), and that stays true.
-- This is the one door, and it is a narrow one: the recipient's name and the event's public display
-- fields.  NEVER phone_e164, age, notes, waitlist_rank or any id.
--
-- Every negative case — unknown token, not confirmed, not present, switch off — returns ZERO ROWS.
-- One response for all of them, so the route cannot be used to distinguish "no such token" from
-- "that person did not attend".
-- ---------------------------------------------------------------------------
create or replace function public.get_certificate(p_token text)
returns table (
  full_name          text,
  attended_at        timestamptz,
  event_slug         text,
  event_title        text,
  event_kicker       text,
  audience_label     text,
  starts_at          timestamptz,
  ends_at            timestamptz,
  timezone           text,
  venue_name         text,
  venue_city         text,
  venue_state        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.full_name, r.attended_at,
         e.slug, e.title, e.kicker, e.audience_label,
         e.starts_at, e.ends_at, e.timezone,
         e.venue_name, e.venue_city, e.venue_state
    from public.registrations r
    join public.events e on e.id = r.event_id
   -- A token is 27 characters of base64url.  The length guard means a pathological input is
   -- rejected before it reaches the index rather than being compared against every row.
   where p_token is not null
     and char_length(p_token) between 20 and 64
     and r.certificate_token = p_token
     and r.status = 'confirmed'
     and r.attended_at is not null
     and e.certificates_enabled;
$$;

-- The public page renders server-side under the secret key, exactly like `/` (D4).  service_role
-- ONLY: `authenticated` has no need for it — an administrator reads the registration itself.
revoke all on function public.get_certificate(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_certificate(text) to service_role;

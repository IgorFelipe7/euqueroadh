-- Migration 2 — enumerated domain states and the one pure helper function.
--
-- Enums rather than text + CHECK: adding a status becomes a deliberate, reviewed migration
-- instead of a typo in application code (DATABASE-SECURITY.md § 3.1).

create type public.registration_status as enum ('confirmed', 'waitlisted', 'cancelled');
create type public.registration_state  as enum ('open', 'closed');

-- unaccent() is not marked IMMUTABLE (a text-search dictionary can be reloaded), so it cannot be
-- used directly in a generated column.  This wrapper is the standard workaround and is safe ONLY
-- because the `unaccent` dictionary is never modified after creation.
--
-- DO NOT alter or reload the unaccent dictionary: doing so would silently invalidate every stored
-- value of registrations.search_name, which is computed once at write time.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable strict parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

-- ACL (§ 8.5): granted to NOBODY.  It is only ever evaluated while the table owner computes the
-- search_name generated column, and by the SECURITY DEFINER routines, which run as the owner.
revoke all on function public.immutable_unaccent(text) from public, anon, authenticated, service_role;

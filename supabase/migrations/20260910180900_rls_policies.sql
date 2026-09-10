-- Migration 10 — Row Level Security and the narrow re-grant (§ 8.1, § 8.3).
--
-- Two independent layers, both explicit:
--   * a role with no GRANT never reaches policy evaluation at all;
--   * RLS with no matching policy denies.
--
-- `authenticated` holds SELECT and nothing else, on every table.  There are NO write policies and
-- no column-scoped GRANT UPDATE: both were withdrawn in favour of RPC-only writes, which is what
-- makes I6 (lock order) and I9 (audit atomicity) hold by construction rather than by convention.
-- `anon` holds no privilege and has no policy anywhere; every cell of its matrix reads "denied".

alter table public.events        enable row level security;
alter table public.registrations enable row level security;
alter table public.admin_users   enable row level security;
alter table public.admin_actions enable row level security;

-- Deliberately NOT `force row level security` on admin_users: is_active_admin() is SECURITY
-- DEFINER and relies on the owner's normal RLS bypass to read this table without recursing
-- through the very policy it is used to evaluate.

-- Reads.  Scoped `TO authenticated` so the policy can never be reached by anon.
create policy events_admin_read on public.events
  for select to authenticated using (public.is_active_admin());

create policy registrations_admin_read on public.registrations
  for select to authenticated using (public.is_active_admin());

-- The sign-in gate must be able to read the caller's own row to discover that they are NOT an
-- administrator (or that they have been deactivated), which is why the own-row branch exists.
create policy admin_users_read on public.admin_users
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_active_admin());

create policy admin_actions_admin_read on public.admin_actions
  for select to authenticated using (public.is_active_admin());

-- Re-grant, narrowly and explicitly.  Reads only.
grant select on public.events        to authenticated;
grant select on public.registrations to authenticated;
grant select on public.admin_users   to authenticated;
grant select on public.admin_actions to authenticated;

-- The one table privilege held by service_role: the server-side public event display read
-- (§ 8.3, § 8.6).  The public page is rendered by our own server with the secret key, and the
-- browser never contacts Supabase, so this read has to happen under service_role.  Table-level
-- rather than column-level, deliberately:
--   * `events` holds event and configuration copy, never a participant record - the three tables
--     that do hold participant or administrator data are revoked immediately below and are
--     covered by an adversarial test;
--   * a column-scoped grant is not re-issued by `alter table ... add column`, so a later display
--     field would silently 42501 the public page while every migration still looked correct;
--   * the narrowing that actually protects the response is the explicit field projection in the
--     Phase 3 DAL, which returns a hand-written public-event DTO rather than a row.
-- SELECT only: service_role gets no write privilege here either, so I6 and I9 still hold.
grant select on public.events to service_role;

-- Belt and braces over the baseline in migration 1: no Data API role holds a write privilege on
-- any application table.  Reinstating one would break both I6 and I9 (§ 13, items 4 and 12).
revoke insert, update, delete, truncate on public.events        from anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.registrations from anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.admin_users   from anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.admin_actions from anon, authenticated, service_role;
revoke select on public.events        from anon;
-- Participant and administrator data stay unreachable through the secret key: the only secret-key
-- surface on them remains register_for_event, which writes and never returns a row it did not
-- create.
revoke select on public.registrations from anon, service_role;
revoke select on public.admin_users   from anon, service_role;
revoke select on public.admin_actions from anon, service_role;

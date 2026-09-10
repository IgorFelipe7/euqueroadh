-- Migration 1 — privilege baseline.  MUST remain the first migration.
--
-- WHY THIS RUNS BEFORE ANY OBJECT EXISTS (DATABASE-SECURITY.md § 8.1):
-- PostgreSQL grants EXECUTE on every new function to PUBLIC, and Supabase adds table/function
-- privileges for anon, authenticated and service_role on top.  A routine created before this
-- baseline would therefore be a public endpoint for the length of a migration run.  Running the
-- revokes first means every object created afterwards is born deny-by-default; the per-object
-- REVOKE/GRANT pairs in the later migrations remain the authoritative guarantee.
--
-- NOTE ON service_role: this baseline leaves it with nothing.  Migration 10 re-grants exactly two
-- things and no more (§ 8.3, § 8.5): SELECT on public.events, for the server-side public event
-- display read, and EXECUTE on register_for_event, for the public write path.  It holds no SELECT
-- on registrations, admin_users or admin_actions, and no write privilege on any table.

-- Extensions live in the `extensions` schema (the Supabase convention) rather than in `public`,
-- so `public` contains only application objects and PostgREST cannot expose an extension routine
-- as an RPC.  Every reference to them is schema-qualified, because every SECURITY DEFINER routine
-- in this database runs with an empty search_path.
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- 1. Withdraw privileges on everything that already exists in public.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
-- ALL ROUTINES, not ALL FUNCTIONS: the FUNCTION keyword excludes procedures.
revoke all on all routines  in schema public from public, anon, authenticated, service_role;

-- 2. Change the default for everything created LATER, so a future migration that forgets its
--    REVOKE is still safe.  ALTER DEFAULT PRIVILEGES is NOT retroactive, which is why step 1
--    exists as well.  Scoped FOR ROLE postgres: the role the Supabase CLI runs migrations as.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

-- 3. Withdraw PostgreSQL's own built-in EXECUTE-to-PUBLIC default for future routines.
--
-- MEASURED BEHAVIOUR, PostgreSQL 17.6 (verified on this stack, and the reason this statement is
-- not scoped to a schema): a schema-scoped default-privileges entry is merged ON TOP of the
-- built-in default for the object type, and the built-in default for a function is
-- `EXECUTE TO PUBLIC`.  A schema-scoped `REVOKE EXECUTE ... FROM PUBLIC` therefore removes PUBLIC
-- from the stored entry but the new function still comes out world-executable.  The role-wide
-- entry is applied authoritatively and does suppress it.  Both are kept: the schema-scoped one
-- above removes the grants Supabase adds for the Data API roles, this one removes PUBLIC.
--
-- 10-function-acl.sql asserts this by creating a routine with no ACL of its own and checking that
-- nobody can execute it.  The per-object REVOKE/GRANT pair in every migration remains mandatory
-- regardless: it is the authoritative guarantee, this is the safety net under it.
alter default privileges for role postgres
  revoke execute on functions from public;

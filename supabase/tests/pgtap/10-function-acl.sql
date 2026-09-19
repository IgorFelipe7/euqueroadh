-- The function / RPC ACL matrix of § 8.5, checked against the catalog rather than against the
-- migration text.  PostgreSQL grants EXECUTE on new functions to PUBLIC and Supabase adds the Data
-- API roles on top, so an ungranted routine is a public endpoint; this suite is what makes a future
-- CREATE FUNCTION without an adjacent REVOKE/GRANT fail rather than slip through.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(196);

create temp table acl_matrix (
  signature      text primary key,
  definer        boolean not null,
  authenticated  boolean not null,
  service_role   boolean not null,
  needs_admin_check boolean not null
);

insert into acl_matrix values
  ('immutable_unaccent(text)',                                                  false, false, false, false),
  ('sync_event_counts()',                                                       true,  false, false, false),
  ('is_active_admin()',                                                         true,  true,  false, false),
  ('record_admin_action(text,uuid,uuid,jsonb)',                                 true,  false, false, false),
  ('register_for_event(uuid,text,smallint,text)',                               true,  false, true,  false),
  ('edit_registration(uuid,text,smallint,text)',                                true,  true,  false, true),
  ('cancel_registration(uuid)',                                                 true,  true,  false, true),
  ('promote_from_waitlist(uuid,integer)',                                       true,  true,  false, true),
  ('promote_registration(uuid)',                                                true,  true,  false, true),
  ('update_event_settings(uuid,integer,boolean,registration_state,boolean,bigint)',
                                                                                true,  true,  false, true),
  ('delete_registration(uuid)',                                                 true,  true,  false, true),
  ('purge_event_registrations(uuid,bigint)',                                    true,  true,  false, true),
  ('record_export_action(uuid,integer,jsonb)',                                  true,  true,  false, true),
  ('set_admin_active(uuid,boolean)',                                            true,  true,  false, true),
  ('add_admin_user(uuid,text,text)',                                            true,  true,  false, true),
  ('remove_admin_user(uuid)',                                                   true,  true,  false, true),
  ('verify_event_counters()',                                                   true,  true,  false, true),

  -- Attendance and raffles (migrations 13 and 14).  Administrative, so: SECURITY DEFINER,
  -- `authenticated` only, never service_role, and each one calls is_active_admin() first.
  ('set_registration_attendance(uuid,boolean)',                                 true,  true,  false, true),
  ('create_raffle(uuid,text,text,raffle_pool,integer,boolean)',                 true,  true,  false, true),
  ('update_raffle(uuid,text,text,raffle_pool,integer,boolean)',                 true,  true,  false, true),
  ('delete_raffle(uuid)',                                                       true,  true,  false, true),
  ('reset_raffle(uuid)',                                                        true,  true,  false, true),
  ('draw_raffle_winner(uuid)',                                                  true,  true,  false, true),
  ('resolve_raffle_draw(uuid,raffle_draw_outcome)',                             true,  true,  false, true),

  -- Certificates (migration 15).
  -- `new_certificate_token` is granted to NOBODY and is not SECURITY DEFINER: it is evaluated only
  -- by the table owner, as a column default, and by the definer routines that insert.
  ('new_certificate_token()',                                                   false, false, false, false),
  -- `get_certificate` mirrors register_for_event exactly: service_role ONLY, because the public
  -- certificate page renders on our own server and the browser never contacts Supabase (D4).
  ('get_certificate(text)',                                                     true,  false, true,  false),

  -- Person identity (migration 16).  `registration_identity_key` is granted to NOBODY and is not
  -- SECURITY DEFINER: like `immutable_unaccent`, it is evaluated only by the table owner — as the
  -- expression of registrations_active_person_uidx — and by the definer routines that match on it.
  ('registration_identity_key(text)',                                           false, false, false, false),

  -- Check-in sessions (migration 17).  `new_check_in_token` mirrors `new_certificate_token`: granted
  -- to nobody, not a definer, evaluated only inside the routines below.
  ('new_check_in_token()',                                                      false, false, false, false),
  -- The two administrative session controls: definer, `authenticated` only, never service_role, and
  -- each calls is_active_admin() first.
  ('open_check_in_session(uuid,boolean)',                                       true,  true,  false, true),
  ('close_check_in_session(uuid)',                                              true,  true,  false, true),

  -- Public self check-in (migration 18) and the certificate portal (migration 19).  All three mirror
  -- register_for_event and get_certificate exactly: service_role ONLY, because these are the public
  -- paths and a grant to anon or authenticated would put Turnstile verification outside the only
  -- route that reaches them.
  ('get_check_in_session(text)',                                                true,  false, true,  false),
  ('self_check_in(text,text,text,smallint)',                                    true,  false, true,  false),
  ('find_certificate(text,text,smallint)',                                      true,  false, true,  false);

create temp view routines as
  select p.oid,
         -- proargtypes is the IN-argument list, which is what identifies a routine for GRANT:
         -- an overload created later does NOT inherit another signature's ACL.
         p.proname || '(' || coalesce(
           (select string_agg(format_type(a.t, null), ',' order by a.ord)
              from unnest(p.proargtypes) with ordinality as a(t, ord)), '') || ')' as signature,
         p.prosecdef,
         p.proacl,
         p.proconfig,
         p.prosrc,
         p.proowner::regrole::text as owner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public';

-- --------------------------------------------------------------- inventory ----
select is((select count(*)::int from acl_matrix), 33, 'the matrix lists thirty-three routines');
select set_eq(
  'select signature from routines',
  'select signature from acl_matrix',
  'the implemented routine set matches the matrix exactly - no undocumented extra, none missing');

select is((select count(*)::int from routines where owner <> 'postgres'), 0,
  'every routine is owned by postgres, so the ALTER DEFAULT PRIVILEGES baseline applied to it');

-- ---------------------------------------------------- nothing is world-executable ----
-- A NULL proacl means "PostgreSQL defaults", and the default is EXECUTE to PUBLIC.  It must
-- therefore never be NULL here.
select is((select count(*)::int from routines where proacl is null), 0,
  'no routine carries a NULL ACL, which would mean the PUBLIC default is still in force');

select is(
  (select count(*)::int
     from routines r, aclexplode(r.proacl) a
    where a.grantee = 0),
  0, 'PUBLIC holds EXECUTE on nothing');

-- --------------------------------------------------------- per routine ----
select ok(r.prosecdef = m.definer,
          m.signature || ': SECURITY ' || case when m.definer then 'DEFINER' else 'INVOKER' end)
  from acl_matrix m join routines r on r.signature = m.signature;

select ok('search_path=""' = any(r.proconfig),
          m.signature || ': search_path is pinned EMPTY, so a caller cannot shadow an object name '
          'and have the definer execute theirs')
  from acl_matrix m join routines r on r.signature = m.signature;

select ok(not has_function_privilege('anon', r.oid, 'EXECUTE'),
          m.signature || ': anon cannot execute it')
  from acl_matrix m join routines r on r.signature = m.signature;

select ok(has_function_privilege('authenticated', r.oid, 'EXECUTE') = m.authenticated,
          m.signature || ': authenticated execute = ' || m.authenticated)
  from acl_matrix m join routines r on r.signature = m.signature;

select ok(has_function_privilege('service_role', r.oid, 'EXECUTE') = m.service_role,
          m.signature || ': service_role execute = ' || m.service_role)
  from acl_matrix m join routines r on r.signature = m.signature;

-- Every administrative SECURITY DEFINER routine must authorize explicitly: RLS is bypassed inside
-- it, so nothing else is protecting the body.
select ok(position('is_active_admin()' in r.prosrc) > 0,
          m.signature || ': calls is_active_admin() inside')
  from acl_matrix m join routines r on r.signature = m.signature
 where m.needs_admin_check;

-- ------------------------------------------------- the baseline, adversarially ----
-- Migration 1 exists so that a FUTURE migration which forgets its REVOKE is still safe.  Prove it
-- by creating exactly that mistake here.
create function public.forgotten_helper() returns integer language sql immutable as $$ select 1 $$;
create table public.forgotten_table (id integer primary key);

select ok(not has_function_privilege('anon', 'public.forgotten_helper()', 'EXECUTE'),
  'a routine created with no ACL of its own is NOT executable by anon');
select ok(not has_function_privilege('authenticated', 'public.forgotten_helper()', 'EXECUTE'),
  'nor by authenticated');
select ok(not has_function_privilege('service_role', 'public.forgotten_helper()', 'EXECUTE'),
  'nor by service_role');
select is(
  (select count(*)::int from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.forgotten_helper()'::regprocedure and a.grantee = 0),
  0, 'and PUBLIC does not inherit the PostgreSQL default either');
select ok(not has_table_privilege('anon', 'public.forgotten_table', 'SELECT'),
  'a table created with no ACL of its own is not readable by anon');

drop table public.forgotten_table;
drop function public.forgotten_helper();

select * from finish();
rollback;

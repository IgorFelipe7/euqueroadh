-- The TABLE privilege matrix of § 8.3, checked exhaustively against EFFECTIVE privileges rather
-- than against the migration text.  10-function-acl.sql is the routine half of the same idea; this
-- is the table half, and it exists because § 8.3 now has a non-empty service_role row: the
-- server-side public event display read holds `select` on public.events and on nothing else.
--
-- Every cell is asserted, including the ones that are false, so that a stray `grant` anywhere in a
-- future migration fails here rather than shipping.  `has_table_privilege` is used deliberately in
-- preference to reading relacl: it resolves grants held indirectly through PUBLIC and through role
-- membership, which is what a request actually gets.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(180);

create temp table expected_table_acl (
  tbl       text    not null,
  grantee   text    not null,
  privilege text    not null,
  allowed   boolean not null,
  primary key (tbl, grantee, privilege)
);

-- The whole matrix, generated from its one rule so the rule itself is readable:
--   * `authenticated` holds SELECT on all six tables (RLS then decides which rows);
--   * `service_role` holds SELECT on `events` alone - event and configuration copy, never a
--     participant record;
--   * `anon` holds nothing anywhere;
--   * nobody holds any write privilege on anything.
insert into expected_table_acl (tbl, grantee, privilege, allowed)
select t.tbl, g.grantee, p.privilege,
       p.privilege = 'SELECT'
         and (g.grantee = 'authenticated'
              or (g.grantee = 'service_role' and t.tbl = 'events'))
  from (values ('events'), ('registrations'), ('admin_users'), ('admin_actions'),
               -- Migration 14. They follow the registrations rule exactly: `authenticated` reads
               -- under RLS, and neither anon nor service_role reaches them at all — the secret key
               -- must not learn who won any more than it can learn who registered.
               ('raffles'), ('raffle_draws'),
               -- Migration 17. It follows the registrations rule exactly: `authenticated` reads under
               -- RLS, and neither anon nor service_role reaches it at all — the secret key resolves a
               -- session through a definer routine that returns the event's display copy, never the
               -- row, so it has no reason to hold SELECT on the token.
               ('check_in_sessions')) as t(tbl)
 cross join (values ('anon'), ('authenticated'), ('service_role')) as g(grantee)
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) as p(privilege);

-- --------------------------------------------------------------- inventory ----
select set_eq(
  $$select tablename from pg_tables where schemaname = 'public'$$,
  $$select distinct tbl from expected_table_acl$$,
  'the matrix covers every application table - a new one cannot be added without a decision here');

-- ------------------------------------------------------- every cell, as granted ----
select ok(has_table_privilege(e.grantee, ('public.' || e.tbl)::regclass, e.privilege) = e.allowed,
          format('%s on public.%s for %s = %s', e.privilege, e.tbl, e.grantee, e.allowed))
  from expected_table_acl e;

-- ------------------------------------------------------------------- PUBLIC ----
-- Revoking from anon does not remove a grant held via PUBLIC, and every role is a member of PUBLIC.
select is(
  (select count(*)::int
     from pg_class c, aclexplode(c.relacl) a
    where c.oid = ('public.' || e.tbl)::regclass and a.grantee = 0),
  0, 'PUBLIC holds nothing on public.' || e.tbl)
  from (select distinct tbl from expected_table_acl) e;

-- -------------------------------------------------- no column-level back door ----
-- A column-scoped grant is invisible in relacl and would not show up in the table matrix above.
-- There are none by design: the projection that narrows the public event response is the DAL's,
-- not the database's (§ 8.3).
select is(
  (select count(*)::int
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and a.attacl is not null),
  0, 'no column-level grant exists on any application table');

-- ----------------------------------------------- the two roles that matter most ----
-- Stated as complete footprints rather than as per-cell checks, so an added table cannot widen
-- either role without failing here.
select set_eq(
  $$select c.relname || ':' || x.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) x
     where n.nspname = 'public' and c.relkind = 'r'
       and x.grantee = 'service_role'::regrole$$,
  $$values ('events:SELECT')$$,
  'the complete table footprint of service_role is one privilege on one table');

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) x
    where n.nspname = 'public' and c.relkind = 'r' and x.grantee = 'anon'::regrole),
  0, 'anon holds no table privilege at all');

-- ------------------------------------------- and no routine ACL moved with it ----
-- The event read is a table grant.  It must not have been accompanied by a routine grant: the
-- executable surface of the secret key is still exactly the public write path.
select set_eq(
  $$select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(p.proacl) x
     where n.nspname = 'public' and x.grantee = 'service_role'::regrole
       and x.privilege_type = 'EXECUTE'$$,
  -- FIVE routines now, and every one of them is the same shape: a narrow, server-rendered public path
  -- that the browser never calls directly, returning a closed set of states and no participant record.
  --
  --   * `register_for_event`   — the public write path (§ 5).
  --   * `get_certificate`      — one name by an unguessable token; zero rows for every negative case
  --                              (RAFFLE-AND-CERTIFICATE-SPEC.md § 4.3).
  --   * `get_check_in_session` — the event's display copy by a session token; zero rows for unknown,
  --                              closed and expired alike (migration 18).
  --   * `self_check_in`        — the public attendance write; returns one word out of six.
  --   * `find_certificate`     — identification over the EXISTING certificate token (migration 19).
  --
  -- This list is the boundary itself: the secret key's whole executable surface, enumerated. A sixth
  -- entry cannot appear without someone editing this line, and that is the review the grant needs.
  $$values ('register_for_event'), ('get_certificate'), ('get_check_in_session'),
           ('self_check_in'), ('find_certificate')$$,
  'service_role may execute exactly the five public-path routines, and nothing else');

select * from finish();
rollback;

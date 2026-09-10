-- Row Level Security and table privileges, exercised as the Data API roles actually see them
-- (§ 8.1, § 8.3).  Two independent layers: a role with no GRANT never reaches policy evaluation,
-- and RLS with no matching policy denies.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(49);

-- A probe that runs one statement as a Data API role with a given JWT, exactly as PostgREST would,
-- and reports either the scalar result or the SQLSTATE that stopped it.
create function pg_temp.probe(p_role text, p_claims text, p_sql text)
returns text
language plpgsql
as $$
declare
  v_result text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v_result;
  exception when others then
    v_result := 'ERROR:' || sqlstate;
  end;
  reset role;
  return coalesce(v_result, 'NULL');
end;
$$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local'),
  ('a0000000-0000-0000-0000-00000000000e', 'desativado@teste.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'pessoa@teste.local');
insert into public.admin_users (user_id, email, display_name, is_active) values
  ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local', 'Organizador Um', true),
  ('a0000000-0000-0000-0000-00000000000e', 'desativado@teste.local', 'Organizador Ex', false);

insert into public.events (id, slug, title, starts_at, capacity, registration_state)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'evt-rls', 'Evento RLS',
        '2026-09-19T19:00:00-03:00', 5, 'open');
select public.register_for_event('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
         'Ana Souza', 20::smallint, '+5519991280001');

select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.record_export_action('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, '{}'::jsonb);
select set_config('request.jwt.claims', '', true);

-- --------------------------------------------------------------- RLS is on ----
select ok((select relrowsecurity from pg_class where oid = 'public.events'::regclass),
          'RLS is enabled on events');
select ok((select relrowsecurity from pg_class where oid = 'public.registrations'::regclass),
          'RLS is enabled on registrations');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_users'::regclass),
          'RLS is enabled on admin_users');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_actions'::regclass),
          'RLS is enabled on admin_actions');
select ok(not (select relforcerowsecurity from pg_class where oid = 'public.admin_users'::regclass),
          'but FORCE RLS is NOT set on admin_users: is_active_admin() must read it as the owner '
          'without recursing through the policy it is being used to evaluate');

select is((select count(*)::int from pg_policies
            where schemaname = 'public' and cmd <> 'SELECT'),
          0, 'there are no INSERT, UPDATE or DELETE policies anywhere - every write is an RPC');
select is((select count(*)::int from pg_policies
            where schemaname = 'public' and not (roles = '{authenticated}')),
          0, 'and every policy is scoped TO authenticated, never to public');

-- ------------------------------------------------------------------- anon ----
select is(pg_temp.probe('anon', null, 'select count(*)::text from public.events'),
          'ERROR:42501', 'anon cannot read events');
select is(pg_temp.probe('anon', null, 'select count(*)::text from public.registrations'),
          'ERROR:42501', 'anon cannot read registrations - participant data is unreachable');
select is(pg_temp.probe('anon', null, 'select count(*)::text from public.admin_users'),
          'ERROR:42501', 'anon cannot read admin_users');
select is(pg_temp.probe('anon', null, 'select count(*)::text from public.admin_actions'),
          'ERROR:42501', 'anon cannot read admin_actions');
select is(pg_temp.probe('anon', null,
            $$select (public.register_for_event('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                'Intruso', 20::smallint, '+5519991280777')).outcome$$),
          'ERROR:42501',
          'anon cannot execute the registration RPC: the public write path is reachable only '
          'through our own server, so Turnstile cannot be bypassed');
select is(pg_temp.probe('anon', null, 'select public.is_active_admin()::text'),
          'ERROR:42501', 'anon cannot even ask whether it is an administrator');
select is(pg_temp.probe('anon', null,
            $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
              values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Intruso', 20, '+5519991280778',
                      'confirmed')$$),
          'ERROR:42501', 'anon cannot insert a registration directly');

-- --------------------------------------------- authenticated, not an admin ----
select is(pg_temp.probe('authenticated',
            '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}',
            'select count(*)::text from public.events'),
          '0', 'a signed-in non-administrator has the SELECT privilege but no policy matches');
select is(pg_temp.probe('authenticated',
            '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}',
            'select count(*)::text from public.registrations'),
          '0', 'so they read no participant data');
select is(pg_temp.probe('authenticated',
            '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}',
            'select count(*)::text from public.admin_actions'),
          '0', 'nor the audit trail');
select is(pg_temp.probe('authenticated',
            '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}',
            'select count(*)::text from public.admin_users'),
          '0', 'nor the administrator list');
select is(pg_temp.probe('authenticated',
            '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}',
            $$select public.cancel_registration(
                (select '11111111-1111-1111-1111-111111111111'::uuid))::text$$),
          'ERROR:42501', 'and every admin RPC raises not_authorized for them');
select is(pg_temp.probe('authenticated',
            '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}',
            $$select (public.register_for_event('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                'Intruso', 20::smallint, '+5519991280779')).outcome$$),
          'ERROR:42501', 'the registration RPC is denied to them by privilege, not by policy');

-- -------------------------------------------------- an active administrator ----
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            $$select count(*)::text from public.events where slug = 'evt-rls'$$),
          '1', 'an active administrator reads the event');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            'select count(*)::text from public.registrations'),
          '1', 'and the registrations');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            'select count(*)::text from public.admin_users'),
          '2', 'and the whole team');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            'select count(*)::text from public.admin_actions'),
          '1', 'and the audit trail');

-- Reads are the only direct access.  Every write is an RPC (§ 8.3), so these must all fail on
-- PRIVILEGE - there is no UPDATE grant to reach a policy with.
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            $$update public.registrations set full_name = 'Roubado'
               where phone_e164 = '+5519991280001'$$),
          'ERROR:42501',
          'an administrator cannot hand-craft a direct UPDATE of participant data: '
          'edit_registration() is the only path, so the audit record cannot be skipped');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            $$update public.registrations set status = 'cancelled'
               where phone_e164 = '+5519991280001'$$),
          'ERROR:42501',
          'nor a direct status change: that would lock registrations before events and break I6');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            $$update public.events set capacity = 999
               where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$),
          'ERROR:42501', 'nor a direct capacity change, bypassing the settings RPC');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            $$delete from public.registrations where phone_e164 = '+5519991280001'$$),
          'ERROR:42501', 'nor a direct delete');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            $$insert into public.admin_users (user_id, email) values
                ('b0000000-0000-0000-0000-00000000000b', 'promovido@teste.local')$$),
          'ERROR:42501', 'nor granting themselves company on the admin table');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            $$insert into public.admin_actions (actor_label, action) values ('falso', 'admin.invited')$$),
          'ERROR:42501', 'nor forging an audit row');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}',
            $$select public.record_admin_action('admin.invited', null, null, '{}'::jsonb)::text$$),
          'ERROR:42501', 'nor forging one through the audit helper, which no role may execute');

-- ------------------------------------------------ a deactivated administrator ----
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000e","role":"authenticated"}',
            'select count(*)::text from public.registrations'),
          '0', 'a deactivated administrator loses participant data on the very next request');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000e","role":"authenticated"}',
            'select count(*)::text from public.events'),
          '0', 'and the event');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000e","role":"authenticated"}',
            'select count(*)::text from public.admin_actions'),
          '0', 'and the audit trail');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000e","role":"authenticated"}',
            'select count(*)::text from public.admin_users'),
          '1', 'but still sees their OWN row, which is what the sign-in gate reads');
select is(pg_temp.probe('authenticated',
            '{"sub":"a0000000-0000-0000-0000-00000000000e","role":"authenticated"}',
            $$select (public.update_event_settings('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                9, true, 'open'::public.registration_state, 1::bigint)).capacity::text$$),
          'ERROR:42501', 'and every administrative RPC refuses them immediately');

-- ------------------------------------------------------------ service_role ----
select is(pg_temp.probe('service_role', null,
            $$select (public.register_for_event('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                'Bruno Gonçalves', 21::smallint, '+5519991280002')).outcome$$),
          'confirmed', 'service_role - our own server - may execute the registration RPC');
select is(pg_temp.probe('service_role', null,
            $$select public.cancel_registration(
                (select '11111111-1111-1111-1111-111111111111'::uuid))::text$$),
          'ERROR:42501', 'but no administrative RPC: the secret key is not an administrator');
-- The one table privilege the secret key holds (§ 8.3, § 8.6): the server-side public event
-- display read.  There is no policy TO service_role anywhere - it reads because it is BYPASSRLS
-- and now holds the grant, which is the whole point of asserting the grant separately.
select is(pg_temp.probe('service_role', null,
            $$select title from public.events where slug = 'evt-rls'$$),
          'Evento RLS',
          'service_role reads public.events: the server-side public event display path');
select is(pg_temp.probe('service_role', null,
            $$select capacity::text from public.events where slug = 'evt-rls'$$),
          '5', 'including the capacity and state the public page needs to render its call to action');
select is((select count(*)::int from pg_policies
            where schemaname = 'public' and 'service_role' = any(roles)),
          0, 'and no policy anywhere names service_role - the grant plus BYPASSRLS is the whole '
             'mechanism, so removing the grant closes the path completely');

-- Participant and administrator data stay out of reach.  These are the assertions that make the
-- events grant safe to hold.
select is(pg_temp.probe('service_role', null, 'select count(*)::text from public.registrations'),
          'ERROR:42501',
          'service_role cannot read registrations - participant data is unreachable with the '
          'secret key, whose only surface on that table is the write path RPC');
select is(pg_temp.probe('service_role', null, 'select count(*)::text from public.admin_users'),
          'ERROR:42501', 'nor admin_users');
select is(pg_temp.probe('service_role', null, 'select count(*)::text from public.admin_actions'),
          'ERROR:42501', 'nor the audit trail');

-- SELECT, and strictly SELECT.  A write privilege here would put a mutation outside the RPCs and
-- break I6 and I9 exactly as it would for an administrator.
select is(pg_temp.probe('service_role', null,
            $$update public.events set capacity = 999 where slug = 'evt-rls'$$),
          'ERROR:42501', 'service_role cannot change the capacity it can read');
select is(pg_temp.probe('service_role', null,
            $$insert into public.events (slug, title, starts_at, capacity)
              values ('evt-forjado', 'Evento Forjado', '2026-09-19T19:00:00-03:00', 1)$$),
          'ERROR:42501', 'nor create an event');
select is(pg_temp.probe('service_role', null,
            $$delete from public.events where slug = 'evt-rls'$$),
          'ERROR:42501', 'nor delete one');

-- ------------------------------------------------- the identity is the JWT ----
select is(pg_temp.probe('authenticated', '{"role":"authenticated"}',
            'select count(*)::text from public.registrations'),
          '0', 'a JWT with no subject reads nothing');
select is(pg_temp.probe('authenticated',
            '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated",'
            '"user_metadata":{"is_admin":true},"app_metadata":{"role":"admin"}}',
            'select count(*)::text from public.registrations'),
          '0',
          'and user-controlled claims are ignored: authorization reads admin_users, never metadata');

select * from finish();
rollback;

-- The database half of the administrator lifecycle (§ 7.4) and the audit trail's survival of a
-- permanently removed administrator (§ 3.6).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(29);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local'),
  ('a0000000-0000-0000-0000-00000000000c', 'organizador2@teste.local'),
  ('a0000000-0000-0000-0000-00000000000d', 'organizador3@teste.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'pessoa@teste.local');
insert into public.admin_users (user_id, email, display_name) values
  ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local', 'Organizador Um'),
  ('a0000000-0000-0000-0000-00000000000c', 'organizador2@teste.local', 'Organizador Dois');

select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.events (id, slug, title, starts_at, capacity, registration_state)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'evt-equipe', 'Evento equipe',
        '2026-09-19T19:00:00-03:00', 5, 'open');

-- ------------------------------------------------------------ the gate ----
select ok(public.is_active_admin(), 'an active administrator passes the gate');

select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select ok(not public.is_active_admin(), 'a signed-in non-administrator does not');

select set_config('request.jwt.claims', '', true);
select ok(not public.is_active_admin(),
  'and neither does a request with no identity at all - service_role included');

select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- ------------------------------------------------------------- invite ----
select lives_ok(
  $$select public.add_admin_user('a0000000-0000-0000-0000-00000000000d',
      'organizador3@teste.local', 'Organizador Três')$$,
  'an administrator adds another administrator');
select is((select count(*)::int from public.admin_users
            where user_id = 'a0000000-0000-0000-0000-00000000000d' and is_active),
          1, 'the new administrator is active');
select is((select invited_by from public.admin_users
            where user_id = 'a0000000-0000-0000-0000-00000000000d'),
          'a0000000-0000-0000-0000-00000000000a'::uuid, 'and records who invited them');
select is((select count(*)::int from public.admin_actions where action = 'admin.invited'),
          1, 'audited in the same transaction');
select is(
  (select count(*)::int from public.admin_actions a
    where a.action = 'admin.invited' and a.metadata::text like '%organizador3@teste.local%'),
  0, 'the audit metadata does not restate the invited address');

-- ------------------------------------------------- deactivate / reactivate ----
select is(
  (select public.set_admin_active('a0000000-0000-0000-0000-00000000000d', false)),
  false, 'an administrator is deactivated');
select is((select is_active from public.admin_users
            where user_id = 'a0000000-0000-0000-0000-00000000000d'),
          false, 'the switch is flipped');
select is((select count(*)::int from public.admin_actions where action = 'admin.deactivated'),
          1, 'audited');
select ok(
  (select a.actor_label from public.admin_actions a where a.action = 'admin.deactivated')
    = 'Organizador Um',
  'by the administrator who did it');

-- Revocation takes effect on the very next request.
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select ok(not public.is_active_admin(),
  'a deactivated administrator fails the gate immediately - no waiting for a token to expire');
select throws_ok(
  $$select * from public.promote_from_waitlist('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1)$$,
  '42501', 'not_authorized', 'and every administrative RPC refuses them');
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is(
  (select public.set_admin_active('a0000000-0000-0000-0000-00000000000d', true)),
  true, 'they can be reactivated');
select is((select count(*)::int from public.admin_actions where action = 'admin.reactivated'),
          1, 'which is audited separately');
select is(
  (select public.set_admin_active('a0000000-0000-0000-0000-00000000000d', true)),
  true, 'reactivating an already-active administrator is idempotent');
select is((select count(*)::int from public.admin_actions where action = 'admin.reactivated'),
          1, 'and writes no second audit row');

-- ------------------------------------------------------------- guards ----
select throws_ok(
  $$select public.set_admin_active('a0000000-0000-0000-0000-00000000000a', false)$$,
  null, 'cannot_modify_self',
  'an administrator cannot deactivate themselves - accidental self-lockout is prevented in the RPC');
select throws_ok(
  $$select public.remove_admin_user('a0000000-0000-0000-0000-00000000000a')$$,
  null, 'cannot_modify_self', 'nor remove themselves');

select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_admin_active('a0000000-0000-0000-0000-00000000000d', false)$$,
  '42501', 'not_authorized', 'a non-administrator cannot touch the team');
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- ------------------------------------------------------------- removal ----
-- Give the departing administrator some history first.
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select public.update_event_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
         6, true, 'open'::public.registration_state, null::boolean, 1::bigint);
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select public.remove_admin_user('a0000000-0000-0000-0000-00000000000c')),
          true, 'an administrator is permanently removed');
select is((select count(*)::int from public.admin_users
            where user_id = 'a0000000-0000-0000-0000-00000000000c'),
          0, 'their authorization row is gone - access is revoked at that instant');
select is((select count(*)::int from public.admin_actions where action = 'admin.removed'),
          1, 'audited');
select is((select public.remove_admin_user('a0000000-0000-0000-0000-00000000000c')),
          false, 'removing them again is idempotent, not an error');

-- The second half of the removal happens in Supabase Auth, outside any SQL transaction.
-- What must hold here is that deleting the auth.users row neither fails nor takes the history.
delete from auth.users where id = 'a0000000-0000-0000-0000-00000000000c';

select is(
  (select count(*)::int from public.admin_actions a
    where a.action = 'settings.updated' and a.actor_user_id is null),
  1,
  'after the Auth account is deleted the historical action remains, with a NULL actor - a valid '
  'state meaning "a since-removed administrator", not corruption');
select is(
  (select a.actor_label from public.admin_actions a
    where a.action = 'settings.updated' and a.actor_user_id is null),
  'Organizador Dois',
  'and actor_label still names them, which is the whole reason the snapshot exists');

-- Why every audit read must LEFT JOIN.
select is(
  (select count(*)::int
     from public.admin_actions a
     left join public.admin_users u on u.user_id = a.actor_user_id
    where a.action = 'settings.updated'),
  1, 'a LEFT JOIN returns the action performed by the removed administrator');
select is(
  (select count(*)::int
     from public.admin_actions a
     join public.admin_users u on u.user_id = a.actor_user_id
    where a.action = 'settings.updated'),
  0, 'an INNER JOIN silently drops exactly the history most worth keeping');

select * from finish();
rollback;

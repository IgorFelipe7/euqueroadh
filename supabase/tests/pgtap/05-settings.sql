-- Settings mutation, I7 (never open without capacity) and I8 (the settings-only conflict token).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(29);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local'),
  ('a0000000-0000-0000-0000-00000000000c', 'organizador2@teste.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'pessoa@teste.local');
insert into public.admin_users (user_id, email, display_name) values
  ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local', 'Organizador Um'),
  ('a0000000-0000-0000-0000-00000000000c', 'organizador2@teste.local', 'Organizador Dois');

select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- The safe initial state a seeded event is born in.
insert into public.events (id, slug, title, starts_at)
values ('77777777-7777-7777-7777-777777777777', 'evt-settings', 'Evento configurações',
        '2026-09-19T19:00:00-03:00');

select is((select capacity from public.events where id = '77777777-7777-7777-7777-777777777777'),
          0, 'a fresh event has no capacity');
select is((select registration_state from public.events where id = '77777777-7777-7777-7777-777777777777'),
          'closed'::public.registration_state, 'and is closed');
select is(
  (select outcome from public.register_for_event(
     '77777777-7777-7777-7777-777777777777', 'Ana Souza', 20::smallint, '+5519991260001')),
  'closed', 'so it is inert: registrations are refused, not silently waitlisted');

-- --------------------------------------------------------------- I7 ----
select throws_ok(
  $$select * from public.update_event_settings(
      '77777777-7777-7777-7777-777777777777', 0, true, 'open'::public.registration_state, null::boolean, 1::bigint)$$,
  '23514', 'capacity_required_to_open',
  'I7: opening with capacity 0 is refused with a named error');
select is((select settings_version from public.events where id = '77777777-7777-7777-7777-777777777777'),
          1::bigint, 'and nothing was written - not even the version');

-- ------------------------------------------------------- a valid change ----
select is(
  (select capacity from public.update_event_settings(
     '77777777-7777-7777-7777-777777777777', 8, true, 'open'::public.registration_state, null::boolean, 1::bigint)),
  8, 'setting a capacity and opening succeeds');
select is((select settings_version from public.events where id = '77777777-7777-7777-7777-777777777777'),
          2::bigint, 'an actual settings change advances settings_version');
select is((select registration_state from public.events where id = '77777777-7777-7777-7777-777777777777'),
          'open'::public.registration_state, 'the event is now open');

select throws_ok(
  $$select * from public.update_event_settings(
      '77777777-7777-7777-7777-777777777777', 0, true, 'open'::public.registration_state, null::boolean, 2::bigint)$$,
  '23514', 'capacity_required_to_open',
  'I7 in reverse: capacity cannot be lowered to 0 while the event stays open');

-- ------------------------------------------- capacity below confirmed_count ----
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Ana Souza', 20::smallint, '+5519991260001');
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Bruno Gonçalves', 21::smallint, '+5519991260002');
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Carla Dias', 22::smallint, '+5519991260003');

select throws_ok(
  $$select * from public.update_event_settings(
      '77777777-7777-7777-7777-777777777777', 2, true, 'open'::public.registration_state, null::boolean, 2::bigint)$$,
  '23514', 'capacity_below_confirmed:3',
  'capacity cannot be set below the confirmed count - nobody is ever auto-demoted');
select is((select capacity from public.events where id = '77777777-7777-7777-7777-777777777777'),
          8, 'and the stored capacity is untouched');
select is((select settings_version from public.events where id = '77777777-7777-7777-7777-777777777777'),
          2::bigint, 'a rejected save does not advance the token');

select is(
  (select capacity from public.update_event_settings(
     '77777777-7777-7777-7777-777777777777', 3, true, 'open'::public.registration_state, null::boolean, 2::bigint)),
  3, 'lowering capacity to exactly the confirmed count is allowed');

-- ------------------------------------------------- optimistic concurrency ----
select throws_ok(
  $$select * from public.update_event_settings(
      '77777777-7777-7777-7777-777777777777', 5, true, 'open'::public.registration_state, null::boolean, 2::bigint)$$,
  '40001', 'settings_conflict',
  'a stale settings_version is rejected: the second of two administrators cannot silently '
  'overwrite the first');
select is((select capacity from public.events where id = '77777777-7777-7777-7777-777777777777'),
          3, 'the first administrator''s value survives');

-- Two administrators holding the same snapshot: exactly one wins.
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is(
  (select settings_version from public.update_event_settings(
     '77777777-7777-7777-7777-777777777777', 10, true, 'open'::public.registration_state, null::boolean, 3::bigint)),
  4::bigint, 'administrator two saves first, from version 3');
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.update_event_settings(
      '77777777-7777-7777-7777-777777777777', 20, true, 'open'::public.registration_state, null::boolean, 3::bigint)$$,
  '40001', 'settings_conflict',
  'administrator one, holding the same stale snapshot, is refused');
select is((select capacity from public.events where id = '77777777-7777-7777-7777-777777777777'),
          10, 'no silent overwrite occurred');

-- ------------------------------------------------------------------- I8 ----
-- The regression this token replaced: public activity must never invalidate an open settings form.
select is((select settings_version from public.events where id = '77777777-7777-7777-7777-777777777777'),
          4::bigint, 'the administrator loads the form at version 4');

select is(
  (select outcome from public.register_for_event(
     '77777777-7777-7777-7777-777777777777', 'Diego Reis', 23::smallint, '+5519991260004')),
  'confirmed', 'a member of the public registers meanwhile');
select is((select settings_version from public.events where id = '77777777-7777-7777-7777-777777777777'),
          4::bigint, 'I8: settings_version did NOT move');
select is(
  (select settings_version from public.update_event_settings(
     '77777777-7777-7777-7777-777777777777', 10, true, 'open'::public.registration_state, null::boolean, 4::bigint)),
  5::bigint, 'so the administrator''s save with the pre-registration token SUCCEEDS');

-- Same for a cancellation and a promotion, which also move counters.
select public.cancel_registration(
  (select id from public.registrations where phone_e164 = '+5519991260004'));
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Elisa Nunes', 24::smallint, '+5519991260005');
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Fabio Melo', 25::smallint, '+5519991260006');
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Gabriela Reis', 26::smallint, '+5519991260007');
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Heitor Alves', 27::smallint, '+5519991260008');
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Iara Pinto', 28::smallint, '+5519991260009');
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Joana Prado', 29::smallint, '+5519991260010');
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Kaique Souto', 30::smallint, '+5519991260011');
select public.register_for_event('77777777-7777-7777-7777-777777777777',
         'Lara Vidal', 31::smallint, '+5519991260012');   -- queues

select public.cancel_registration(
  (select id from public.registrations where phone_e164 = '+5519991260002'));
select * from public.promote_from_waitlist('77777777-7777-7777-7777-777777777777', 1);

select is((select settings_version from public.events where id = '77777777-7777-7777-7777-777777777777'),
          5::bigint, 'I8: cancellation and promotion leave settings_version alone as well');
select is(
  (select settings_version from public.update_event_settings(
     '77777777-7777-7777-7777-777777777777', 10, true, 'open'::public.registration_state, null::boolean, 5::bigint)),
  6::bigint, 'and the still-open settings form saves cleanly');

-- ------------------------------------------------------------ guard rails ----
select throws_ok(
  $$select * from public.update_event_settings(
      '99999999-9999-9999-9999-999999999999', 5, true, 'closed'::public.registration_state, null::boolean, 1::bigint)$$,
  null, 'event_not_found', 'an unknown event raises');

select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.update_event_settings(
      '77777777-7777-7777-7777-777777777777', 99, true, 'open'::public.registration_state, null::boolean, 6::bigint)$$,
  '42501', 'not_authorized', 'a signed-in non-administrator cannot change settings');
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.verify_event_counters()),
          0, 'I2: counters still reconcile');

-- Closing and zeroing capacity in the SAME call is allowed: the result is the inert state a
-- freshly seeded event is born in, which is safe by construction.
insert into public.events (id, slug, title, starts_at)
values ('78787878-7878-7878-7878-787878787878', 'evt-settings-2', 'Evento configurações 2',
        '2026-10-19T19:00:00-03:00');
select public.update_event_settings(
  '78787878-7878-7878-7878-787878787878', 5, true, 'open'::public.registration_state, null::boolean, 1::bigint);
select is(
  (select capacity from public.update_event_settings(
     '78787878-7878-7878-7878-787878787878', 0, true, 'closed'::public.registration_state, null::boolean, 2::bigint)),
  0, 'closing an event and returning it to capacity 0 in one call is permitted');
select is((select registration_state from public.events where id = '78787878-7878-7878-7878-787878787878'),
          'closed'::public.registration_state, 'and it is inert again');

select * from finish();
rollback;

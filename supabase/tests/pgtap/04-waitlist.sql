-- Waitlist ordering (I4) and promotion (§ 6.1).  Ranks are historical: never renumbered, never
-- reused, stable across promotion, cancellation and settings changes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(34);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'pessoa@teste.local');
insert into public.admin_users (user_id, email, display_name)
values ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local', 'Organizador Um');

-- Acts as PostgREST does for a signed-in administrator.
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.events (id, slug, title, starts_at, capacity, registration_state, waitlist_enabled)
values ('66666666-6666-6666-6666-666666666666', 'evt-waitlist', 'Evento lista',
        '2026-09-19T19:00:00-03:00', 2, 'open', true);

select public.register_for_event('66666666-6666-6666-6666-666666666666',
         'Ana Souza', 20::smallint, '+5519991250001');
select public.register_for_event('66666666-6666-6666-6666-666666666666',
         'Bruno Gonçalves', 21::smallint, '+5519991250002');
select public.register_for_event('66666666-6666-6666-6666-666666666666',
         'Carla Dias', 22::smallint, '+5519991250003');   -- rank 1
select public.register_for_event('66666666-6666-6666-6666-666666666666',
         'Diego Reis', 23::smallint, '+5519991250004');   -- rank 2
select public.register_for_event('66666666-6666-6666-6666-666666666666',
         'Elisa Nunes', 24::smallint, '+5519991250005');  -- rank 3

select results_eq(
  $$select waitlist_rank from public.registrations
     where event_id = '66666666-6666-6666-6666-666666666666' and status = 'waitlisted'
     order by waitlist_rank$$,
  $$values (1), (2), (3)$$,
  'ranks are monotonic, dense and unique in arrival order');

-- ------------------------------------------------------ no headroom, no promotion ----
select is(
  (select count(*)::int from public.promote_from_waitlist(
     '66666666-6666-6666-6666-666666666666', 3)),
  0, 'promoting with zero headroom returns zero rows rather than raising');
select is(
  (select count(*)::int from public.admin_actions where action = 'registration.promoted'),
  0, 'nothing changed, so nothing is audited');
select is((select confirmed_count from public.events where id = '66666666-6666-6666-6666-666666666666'),
          2, 'the event is still exactly full');

-- ----------------------------------------------------------- cancel then promote ----
select is(
  (select public.cancel_registration(
     (select id from public.registrations where phone_e164 = '+5519991250001'))),
  'cancelled'::public.registration_status,
  'an administrator cancels a confirmed registration');
select is((select confirmed_count from public.events where id = '66666666-6666-6666-6666-666666666666'),
          1, 'the seat is free immediately, with no automatic promotion');
select is((select waitlist_count from public.events where id = '66666666-6666-6666-6666-666666666666'),
          3, 'and nobody moved off the waitlist by themselves');

select is(
  (select count(*)::int from public.promote_from_waitlist(
     '66666666-6666-6666-6666-666666666666', 5)),
  1, 'asking for five with headroom of one promotes exactly one');
select is((select status from public.registrations where phone_e164 = '+5519991250003'),
          'confirmed'::public.registration_status,
          'and it is the OLDEST eligible row - rank 1 - that is promoted');
select is((select waitlist_rank from public.registrations where phone_e164 = '+5519991250003'),
          1, 'I4: the promoted row KEEPS its historical rank, so promotion order stays auditable');
select is((select confirmed_count from public.events where id = '66666666-6666-6666-6666-666666666666'),
          2, 'confirmed_count is back at capacity');
select is((select waitlist_count from public.events where id = '66666666-6666-6666-6666-666666666666'),
          2, 'waitlist_count fell by one');
select ok(
  (select confirmed_count <= capacity from public.events
    where id = '66666666-6666-6666-6666-666666666666'),
  'I1 held throughout the promotion');

select results_eq(
  $$select waitlist_rank from public.registrations
     where event_id = '66666666-6666-6666-6666-666666666666' and status = 'waitlisted'
     order by waitlist_rank$$,
  $$values (2), (3)$$,
  'the remaining queue is NOT renumbered after a promotion');

-- ------------------------------------------------------ cancelling a waitlisted row ----
select is(
  (select public.cancel_registration(
     (select id from public.registrations where phone_e164 = '+5519991250004'))),
  'cancelled'::public.registration_status, 'a waitlisted registration can be cancelled');
select is((select waitlist_rank from public.registrations where phone_e164 = '+5519991250004'),
          2, 'its rank is retained on the row - the position is history, not a live pointer');
select is((select waitlist_count from public.events where id = '66666666-6666-6666-6666-666666666666'),
          1, 'waitlist_count follows the cancellation');

-- --------------------------------------------------------------- ranks are never reused ----
select is(
  (select outcome from public.register_for_event(
     '66666666-6666-6666-6666-666666666666', 'Fabio Melo', 25::smallint, '+5519991250006')),
  'waitlisted', 'a new arrival at capacity joins the queue');
select is((select waitlist_rank from public.registrations where phone_e164 = '+5519991250006'),
          4, 'and takes the NEXT sequence value - vacated rank 2 is never reused');

-- ---------------------------------------------------- turning the waitlist off ----
select is(
  (select waitlist_enabled from public.update_event_settings(
     '66666666-6666-6666-6666-666666666666', 2, false, 'open'::public.registration_state,
     (select settings_version from public.events where id = '66666666-6666-6666-6666-666666666666'))),
  false, 'an administrator disables the waitlist');

select is((select count(*)::int from public.registrations
            where event_id = '66666666-6666-6666-6666-666666666666' and status = 'waitlisted'),
          2, 'queued people are KEPT - deleting them would be data loss');
select is(
  (select outcome from public.register_for_event(
     '66666666-6666-6666-6666-666666666666', 'Gabriela Reis', 26::smallint, '+5519991250007')),
  'full', 'only FUTURE over-capacity submissions change');

-- Existing queued rows remain promotable while the waitlist is off.
select is(
  (select public.cancel_registration(
     (select id from public.registrations where phone_e164 = '+5519991250002'))),
  'cancelled'::public.registration_status, 'free a seat');
select is(
  (select count(*)::int from public.promote_from_waitlist(
     '66666666-6666-6666-6666-666666666666', 1)),
  1, 'a queued person is still promotable with the waitlist disabled');
select is((select waitlist_rank from public.registrations where phone_e164 = '+5519991250005'),
          3, 'and the oldest remaining rank - 3 - was the one promoted');

-- ---------------------------------------------------- turning it back on ----
select is(
  (select waitlist_enabled from public.update_event_settings(
     '66666666-6666-6666-6666-666666666666', 2, true, 'open'::public.registration_state,
     (select settings_version from public.events where id = '66666666-6666-6666-6666-666666666666'))),
  true, 'the waitlist is enabled again');
select is(
  (select outcome from public.register_for_event(
     '66666666-6666-6666-6666-666666666666', 'Gabriela Reis', 26::smallint, '+5519991250007')),
  'waitlisted', 'over-capacity submissions queue again');
select is((select waitlist_rank from public.registrations where phone_e164 = '+5519991250007'),
          5, 'the sequence CONTINUES after the existing ranks');

-- ------------------------------------------ promoting several at once ----
-- Headroom of two, five requested: exactly two move, oldest first, and I1 still holds.
select public.update_event_settings(
  '66666666-6666-6666-6666-666666666666', 4, true, 'open'::public.registration_state,
  (select settings_version from public.events where id = '66666666-6666-6666-6666-666666666666'));

select results_eq(
  $$select waitlist_rank from public.promote_from_waitlist(
      '66666666-6666-6666-6666-666666666666', 5)$$,
  $$values (4), (5)$$,
  'asking for five with headroom of two promotes exactly two, in waitlist_rank order');
select is((select confirmed_count from public.events where id = '66666666-6666-6666-6666-666666666666'),
          4, 'confirmed_count rose to exactly the capacity, never past it');
select is((select waitlist_count from public.events where id = '66666666-6666-6666-6666-666666666666'),
          0, 'and the queue is empty');

-- ------------------------------------------------------------- guard rails ----
select throws_ok(
  $$select * from public.promote_from_waitlist('66666666-6666-6666-6666-666666666666', 0)$$,
  null, 'invalid_count', 'promoting zero people is a caller error');

select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.promote_from_waitlist('66666666-6666-6666-6666-666666666666', 1)$$,
  '42501', 'not_authorized', 'a signed-in non-administrator cannot promote');
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- --------------------------------------------------------- reconciliation ----
select is((select count(*)::int from public.verify_event_counters()),
          0, 'I2: no counter drift anywhere after every operation above');

select * from finish();
rollback;

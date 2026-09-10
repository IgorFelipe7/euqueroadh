-- The end-of-event purge (§ 6.5): one atomic operation, counts-only audit, forced closed.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(24);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'pessoa@teste.local');
insert into public.admin_users (user_id, email, display_name)
values ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local', 'Organizador Um');

select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.events (id, slug, title, starts_at, capacity, registration_state, waitlist_enabled)
values ('99999999-9999-9999-9999-999999999999', 'evt-purge', 'Evento a apagar',
        '2026-09-19T19:00:00-03:00', 78, 'open', true),
       ('9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a', 'evt-outro', 'Outro evento',
        '2026-10-19T19:00:00-03:00', 10, 'open', true);

-- 90 registrations: 78 confirmed, 12 queued, of which 3 are then cancelled.
select public.register_for_event('99999999-9999-9999-9999-999999999999',
         'Participante ' || i, 20::smallint, '+55199' || lpad(i::text, 8, '0'))
  from generate_series(1, 90) as i;

update public.registrations r set status = 'cancelled'
 where r.event_id = '99999999-9999-9999-9999-999999999999'
   and r.waitlist_rank in (10, 11, 12);

select public.register_for_event('9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a',
         'Outro participante ' || i, 30::smallint, '+55219' || lpad(i::text, 8, '0'))
  from generate_series(1, 4) as i;

select is((select count(*)::int from public.registrations
            where event_id = '99999999-9999-9999-9999-999999999999'),
          90, 'the event holds 90 registrations');
select is((select confirmed_count from public.events where id = '99999999-9999-9999-9999-999999999999'),
          78, '78 confirmed');
select is((select waitlist_count from public.events where id = '99999999-9999-9999-9999-999999999999'),
          9, '9 still queued');

-- --------------------------------------------------------- refusals first ----
select throws_ok(
  $$select * from public.purge_event_registrations(
      '99999999-9999-9999-9999-999999999999', 99::bigint)$$,
  '40001', 'settings_conflict',
  'a stale settings_version refuses the purge - the most destructive operation needs the token too');
select is((select count(*)::int from public.registrations
            where event_id = '99999999-9999-9999-9999-999999999999'),
          90, 'and nothing is deleted');
select is((select count(*)::int from public.admin_actions), 0,
          'I9 in the other direction: a refused purge leaves no audit row either');

select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.purge_event_registrations(
      '99999999-9999-9999-9999-999999999999', 1::bigint)$$,
  '42501', 'not_authorized', 'a signed-in non-administrator cannot purge');
select is((select count(*)::int from public.registrations
            where event_id = '99999999-9999-9999-9999-999999999999'),
          90, 'and nothing is deleted');
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- ------------------------------------------------------------- the purge ----
select is(
  (select deleted_count from public.purge_event_registrations(
     '99999999-9999-9999-9999-999999999999', 1::bigint)),
  90, 'the purge reports the number of rows it erased');

select is((select count(*)::int from public.registrations
            where event_id = '99999999-9999-9999-9999-999999999999'),
          0, 'every registration for that event is gone');
select is((select confirmed_count from public.events where id = '99999999-9999-9999-9999-999999999999'),
          0, 'confirmed_count is zero');
select is((select waitlist_count from public.events where id = '99999999-9999-9999-9999-999999999999'),
          0, 'waitlist_count is zero');
select is((select registration_state from public.events where id = '99999999-9999-9999-9999-999999999999'),
          'closed'::public.registration_state,
          'the event is forced CLOSED - a purged event must not restart collecting personal data');
select is((select settings_version from public.events where id = '99999999-9999-9999-9999-999999999999'),
          2::bigint,
          'settings_version advanced, so any settings form left open elsewhere reports a conflict');
select ok((select waitlist_seq > 0 from public.events where id = '99999999-9999-9999-9999-999999999999'),
          'waitlist_seq is deliberately NOT reset - I4 stays trivially true');
select is((select count(*)::int from public.verify_event_counters()),
          0, 'I2: counters reconcile after the purge');

-- ------------------------------------------------------------ isolation ----
select is((select count(*)::int from public.registrations
            where event_id = '9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a'),
          4, 'another event''s registrations are untouched');
select is((select confirmed_count from public.events where id = '9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a'),
          4, 'as are its counters');

-- ---------------------------------------------------------------- audit ----
select is((select count(*)::int from public.admin_actions where action = 'registrations.purged'),
          1, 'exactly one purge audit row');
select is(
  (select a.metadata from public.admin_actions a where a.action = 'registrations.purged'),
  jsonb_build_object('deleted_total', 90, 'deleted_confirmed', 78,
                     'deleted_waitlisted', 9, 'deleted_cancelled', 3,
                     'registration_state_forced', 'closed'),
  'holding four counts and the forced state - and no personal data');
select is(
  (select count(*)::int from public.admin_actions a
    where a.metadata::text ~ 'Participante|\+5519'),
  0, 'the audit row survives the deleted rows without describing anyone');

-- -------------------------------------------------------- repeated call ----
select is(
  (select deleted_count from public.purge_event_registrations(
     '99999999-9999-9999-9999-999999999999', 2::bigint)),
  0, 'a second purge deletes nothing and does not error');
select is((select count(*)::int from public.admin_actions where action = 'registrations.purged'),
          2, 'it still records a truthful audit row, rather than pretending it did not happen');
select is((select settings_version from public.events where id = '99999999-9999-9999-9999-999999999999'),
          3::bigint, 'and still advances the token');

select * from finish();
rollback;

-- I2: the stored counters always equal the actual number of rows in each status, whatever writes
-- registrations.  I8: registration activity never advances settings_version.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(20);

insert into public.events (id, slug, title, starts_at, capacity, registration_state)
values ('22222222-2222-2222-2222-222222222222', 'evt-counters', 'Evento contadores',
        '2026-09-19T19:00:00-03:00', 2, 'open');

select has_trigger('public', 'registrations', 'registrations_sync_counts',
  'the counter trigger is installed');

-- ------------------------------------------------------------------ inserts ----
insert into public.registrations (id, event_id, full_name, age, phone_e164, status)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'Ana Souza', 20, '+5519991230001', 'confirmed');

select is((select confirmed_count from public.events where id = '22222222-2222-2222-2222-222222222222'),
          1, 'a confirmed insert increments confirmed_count');
select is((select waitlist_count from public.events where id = '22222222-2222-2222-2222-222222222222'),
          0, 'it does not touch waitlist_count');

insert into public.registrations (id, event_id, full_name, age, phone_e164, status, waitlist_rank)
values ('aaaaaaaa-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222222', 'Bruno Gonçalves', 21, '+5519991230002', 'waitlisted', 1);

select is((select waitlist_count from public.events where id = '22222222-2222-2222-2222-222222222222'),
          1, 'a waitlisted insert increments waitlist_count');
select is((select confirmed_count from public.events where id = '22222222-2222-2222-2222-222222222222'),
          1, 'and leaves confirmed_count alone');

insert into public.registrations (id, event_id, full_name, age, phone_e164, status)
values ('aaaaaaaa-0000-0000-0000-000000000003',
        '22222222-2222-2222-2222-222222222222', 'Carla Dias', 22, '+5519991230003', 'cancelled');

select is((select confirmed_count + waitlist_count from public.events
            where id = '22222222-2222-2222-2222-222222222222'),
          2, 'a cancelled insert counts towards neither');

-- ----------------------------------------------------------- I1 through I2 ----
-- The counter is what makes the capacity CHECK reachable: a direct insert past capacity is
-- aborted by the constraint, not by application logic.
select throws_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values ('22222222-2222-2222-2222-222222222222', 'Diego Reis', 23, '+5519991230004', 'confirmed'),
           ('22222222-2222-2222-2222-222222222222', 'Elisa Nunes', 24, '+5519991230005', 'confirmed')$$,
  '23514', null,
  'I1: a direct INSERT that would exceed capacity is aborted by the CHECK constraint');

-- -------------------------------------------------------- status transitions ----
update public.registrations set status = 'confirmed'
 where id = 'aaaaaaaa-0000-0000-0000-000000000002';

select is((select confirmed_count from public.events where id = '22222222-2222-2222-2222-222222222222'),
          2, 'promotion moves a row into confirmed_count');
select is((select waitlist_count from public.events where id = '22222222-2222-2222-2222-222222222222'),
          0, 'and out of waitlist_count, in one trigger pass');

update public.registrations set status = 'cancelled'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is((select confirmed_count from public.events where id = '22222222-2222-2222-2222-222222222222'),
          1, 'cancelling a confirmed registration frees a seat immediately');

-- A no-op status update must not move anything.
update public.registrations set full_name = 'Ana Souza Lima'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is((select confirmed_count + waitlist_count from public.events
            where id = '22222222-2222-2222-2222-222222222222'),
          1, 'editing a non-status column does not disturb the counters');

-- ------------------------------------------------------------------ deletes ----
delete from public.registrations where id = 'aaaaaaaa-0000-0000-0000-000000000002';

select is((select confirmed_count from public.events where id = '22222222-2222-2222-2222-222222222222'),
          0, 'deleting a confirmed registration decrements confirmed_count');

insert into public.registrations (id, event_id, full_name, age, phone_e164, status, waitlist_rank)
values ('aaaaaaaa-0000-0000-0000-000000000006',
        '22222222-2222-2222-2222-222222222222', 'Fabio Melo', 25, '+5519991230006', 'waitlisted', 2);
delete from public.registrations where id = 'aaaaaaaa-0000-0000-0000-000000000006';

select is((select waitlist_count from public.events where id = '22222222-2222-2222-2222-222222222222'),
          0, 'deleting a waitlisted registration decrements waitlist_count');

-- --------------------------------------------------- event_id immutability ----
insert into public.events (id, slug, title, starts_at, capacity, registration_state)
values ('33333333-3333-3333-3333-333333333333', 'evt-other', 'Outro evento',
        '2026-10-19T19:00:00-03:00', 5, 'open');

select throws_ok(
  $$update public.registrations set event_id = '33333333-3333-3333-3333-333333333333'
     where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  null, 'registrations.event_id is immutable',
  'a registration can never be moved between events');

-- ------------------------------------------------- I8: the settings token ----
select is((select settings_version from public.events where id = '22222222-2222-2222-2222-222222222222'),
          1::bigint, 'settings_version is untouched by every counter change above');

-- Prove the pair of properties together on one fresh registration.  now() is the transaction
-- timestamp, so updated_at is backdated first: the assertion is that registration activity
-- REWRITES updated_at while leaving settings_version alone.
update public.events set updated_at = timestamptz '2020-01-01 00:00:00-03'
 where id = '33333333-3333-3333-3333-333333333333';

select ok(
  (select updated_at from public.events where id = '33333333-3333-3333-3333-333333333333')
    = timestamptz '2020-01-01 00:00:00-03',
  'baseline: updated_at is backdated');

insert into public.registrations (event_id, full_name, age, phone_e164, status)
values ('33333333-3333-3333-3333-333333333333', 'Gabriela Reis', 26, '+5519991230007', 'confirmed');

select is((select settings_version from public.events where id = '33333333-3333-3333-3333-333333333333'),
          1::bigint,
          'I8: a public registration must NOT advance settings_version - it would invalidate an '
          'administrator settings form for no administrative reason');
select ok(
  (select updated_at from public.events where id = '33333333-3333-3333-3333-333333333333')
    > timestamptz '2020-01-01 00:00:00-03',
  'updated_at DOES advance on registration, which is exactly why it cannot be the conflict token');

-- ------------------------------------------------------------ cascade safety ----
delete from public.events where id = '33333333-3333-3333-3333-333333333333';
select is((select count(*)::int from public.registrations
            where event_id = '33333333-3333-3333-3333-333333333333'),
          0, 'deleting an event cascades its registrations away');

select is((select count(*)::int from public.registrations
            where event_id = '22222222-2222-2222-2222-222222222222'),
          2, 'and leaves another event untouched');

select * from finish();
rollback;

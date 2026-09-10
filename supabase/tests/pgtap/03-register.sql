-- The allocation RPC: every outcome, and the precedence between them (§ 5.2, § 6.8).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(31);

-- A closed event with free seats, and an open one with two seats.
insert into public.events (id, slug, title, starts_at, capacity, registration_state, waitlist_enabled)
values ('44444444-4444-4444-4444-444444444444', 'evt-closed', 'Evento fechado',
        '2026-09-19T19:00:00-03:00', 10, 'closed', true),
       ('55555555-5555-5555-5555-555555555555', 'evt-open', 'Evento aberto',
        '2026-09-19T19:00:00-03:00', 2, 'open', true);

-- ------------------------------------------------------- the master switch ----
select is(
  (select outcome from public.register_for_event(
     '44444444-4444-4444-4444-444444444444', 'Ana Souza', 20::smallint, '+5519991240001')),
  'closed',
  'a closed event refuses a registration even though seats are free');
select is((select count(*)::int from public.registrations
            where event_id = '44444444-4444-4444-4444-444444444444'),
          0, 'and stores nothing');

-- ------------------------------------------------------------- a free seat ----
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', '  Ana Souza  ', 20::smallint, '+5519991240001')),
  'confirmed',
  'an open event with a free seat confirms');
select is((select confirmed_count from public.events where id = '55555555-5555-5555-5555-555555555555'),
          1, 'the counter follows');
select is((select full_name from public.registrations where phone_e164 = '+5519991240001'),
          'Ana Souza', 'the stored name is trimmed');
select is((select status from public.registrations where phone_e164 = '+5519991240001'),
          'confirmed'::public.registration_status, 'and the row carries the returned status');
select ok((select waitlist_rank is null from public.registrations where phone_e164 = '+5519991240001'),
          'a confirmed registration has no queue position');

-- --------------------------------------------------------------- duplicate ----
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Nome Diferente', 44::smallint, '+5519991240001')),
  'already_registered',
  'the same phone returns already_registered');
select is(
  (select status from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Nome Diferente', 44::smallint, '+5519991240001')),
  'confirmed'::public.registration_status,
  'and reports the EXISTING status, so a double tap gets a coherent answer');
select is((select count(*)::int from public.registrations where phone_e164 = '+5519991240001'),
          1, 'no second row is created - the operation is idempotent');
select is((select full_name from public.registrations where phone_e164 = '+5519991240001'),
          'Ana Souza',
          'a duplicate submission must NOT overwrite the stored name (anyone knowing a number '
          'could otherwise rewrite that person''s registration)');
select is((select age from public.registrations where phone_e164 = '+5519991240001'),
          20::smallint, 'nor the stored age');

-- ------------------------------------------------------ filling to capacity ----
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Bruno Gonçalves', 21::smallint, '+5519991240002')),
  'confirmed', 'the last seat is issued');
select is((select confirmed_count from public.events where id = '55555555-5555-5555-5555-555555555555'),
          2, 'the event is now exactly full');

-- --------------------------------------------------------------- waitlist ----
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Carla Dias', 22::smallint, '+5519991240003')),
  'waitlisted', 'the next arrival is waitlisted');
select is((select waitlist_rank from public.registrations where phone_e164 = '+5519991240003'),
          1, 'and receives queue position 1');
select is((select waitlist_seq from public.events where id = '55555555-5555-5555-5555-555555555555'),
          1, 'the monotonic sequence advanced with it');

select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Diego Reis', 23::smallint, '+5519991240004')),
  'waitlisted', 'and the one after that');
select is((select waitlist_rank from public.registrations where phone_e164 = '+5519991240004'),
          2, 'queue position 2');
select is((select waitlist_count from public.events where id = '55555555-5555-5555-5555-555555555555'),
          2, 'waitlist_count follows');
select is((select confirmed_count from public.events where id = '55555555-5555-5555-5555-555555555555'),
          2, 'I1 holds: confirmed_count never passes capacity');

-- -------------------------------------------------------------- precedence ----
-- Duplicate is checked FIRST, so a double tap is answered coherently even once the event filled.
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Ana Souza', 20::smallint, '+5519991240001')),
  'already_registered',
  'duplicate takes precedence over full');

update public.events set registration_state = 'closed'
 where id = '55555555-5555-5555-5555-555555555555';

select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Ana Souza', 20::smallint, '+5519991240001')),
  'already_registered',
  'duplicate takes precedence over closed');
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Elisa Nunes', 24::smallint, '+5519991240005')),
  'closed',
  'closed takes precedence over full');

-- ------------------------------------------------ waitlist disabled -> full ----
update public.events set registration_state = 'open', waitlist_enabled = false
 where id = '55555555-5555-5555-5555-555555555555';

select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Elisa Nunes', 24::smallint, '+5519991240005')),
  'full',
  'with the waitlist off, an over-capacity arrival is refused');
select is((select count(*)::int from public.registrations where phone_e164 = '+5519991240005'),
          0, 'and no row is written');
select is((select waitlist_seq from public.events where id = '55555555-5555-5555-5555-555555555555'),
          2, 'a refused arrival does not consume a queue position');

-- ------------------------------------------- re-registration after cancelling ----
update public.registrations set status = 'cancelled' where phone_e164 = '+5519991240002';

select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Bruno Gonçalves', 21::smallint, '+5519991240002')),
  'confirmed',
  'a cancelled person registers again and is allocated normally');
select is((select count(*)::int from public.registrations
            where phone_e164 = '+5519991240002' and status <> 'cancelled'),
          1, 'exactly one active registration for that phone');

-- --------------------------------------------------------- unknown event ----
select throws_ok(
  $$select * from public.register_for_event(
      '99999999-9999-9999-9999-999999999999', 'Ana Souza', 20::smallint, '+5519991240009')$$,
  null, 'event_not_found',
  'an unknown event raises rather than inventing one');

-- ---------------------------------------------- the shape check still bites ----
-- Free a seat first, so the attempt actually reaches the INSERT rather than returning 'full'.
update public.events set capacity = 5 where id = '55555555-5555-5555-5555-555555555555';

select throws_ok(
  $$select * from public.register_for_event(
      '55555555-5555-5555-5555-555555555555', 'Ana Souza', 20::smallint, '11987654321')$$,
  '23514', null,
  'the RPC cannot be used to smuggle a malformed phone past the constraint');

select * from finish();
rollback;

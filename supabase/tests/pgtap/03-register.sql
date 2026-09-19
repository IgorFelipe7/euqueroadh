-- The allocation RPC: every outcome, and the precedence between them (§ 5.2, § 6.8).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(53);

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
-- Migration 16: the duplicate key is the PERSON — (event, canonical phone, canonical name) — not the
-- telephone number, because one household legitimately shares one number.
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Ana Souza', 44::smallint, '+5519991240001')),
  'already_registered',
  'the same person returns already_registered');
select is(
  (select status from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Ana Souza', 44::smallint, '+5519991240001')),
  'confirmed'::public.registration_status,
  'and reports the EXISTING status, so a double tap gets a coherent answer');

-- Normalization is part of the rule. Each of these is Ana Souza.
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'ana souza', 20::smallint, '+5519991240001')),
  'already_registered', 'case is not a new person');
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', '  ANA   SOUZA  ', 20::smallint, '+5519991240001')),
  'already_registered', 'nor is whitespace');

-- AGE IS NOT PART OF THE KEY, deliberately (migration 16 states the reasoning). A person who mistypes
-- their age and resubmits must be answered `already_registered`, not given a second seat.
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Ana Souza', 19::smallint, '+5519991240001')),
  'already_registered', 'nor is a different age - an age typo must not buy a second seat');

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

-- ------------------------------------------- the online eligibility policy ----
-- Migration 11.  events.min_age is the authority; the Zod schema and the Server Action are defence
-- in depth over it, and a direct call proves the database refuses on its own.
update public.events set min_age = 12, capacity = 20
 where id = '55555555-5555-5555-5555-555555555555';

select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Menor de idade', 11::smallint, '+5519991240011')),
  'age_not_eligible',
  'an age below events.min_age is refused');
select is((select count(*)::int from public.registrations where phone_e164 = '+5519991240011'),
          0, 'and NOTHING is stored: the refusal is a redirection, not a record of a child');

select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Exatamente no limite', 12::smallint, '+5519991240012')),
  'confirmed',
  'the floor is inclusive: exactly min_age is accepted');

select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Adolescente', 16::smallint, '+5519991240016')),
  'confirmed',
  'a 16-year-old uses the normal flow - no parental-consent field exists and none is required here');

-- Precedence: already_registered outranks eligibility, so a double tap gets a coherent answer even
-- if the stored registration predates the policy.
update public.registrations set age = 10 where phone_e164 = '+5519991240016';
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Adolescente', 10::smallint, '+5519991240016')),
  'already_registered',
  'a duplicate is still answered as a duplicate, ahead of the eligibility check');

-- Eligibility outranks the master switch: a ten-year-old is told the real reason rather than being
-- invited to come back when registrations reopen.
update public.events set registration_state = 'closed'
 where id = '55555555-5555-5555-5555-555555555555';
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Muito novo', 9::smallint, '+5519991240009')),
  'age_not_eligible',
  'eligibility is decided before the open/closed switch');
update public.events set registration_state = 'open'
 where id = '55555555-5555-5555-5555-555555555555';

-- A ceiling, when one is set, and its absence when it is not.
update public.events set max_age = 30 where id = '55555555-5555-5555-5555-555555555555';
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Acima do teto', 31::smallint, '+5519991240031')),
  'age_not_eligible',
  'max_age is enforced the same way');
update public.events set max_age = null where id = '55555555-5555-5555-5555-555555555555';
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Sem teto', 80::smallint, '+5519991240080')),
  'confirmed',
  'and a null max_age means no ceiling');

update public.events set min_age = null where id = '55555555-5555-5555-5555-555555555555';
select is(
  (select outcome from public.register_for_event(
     '55555555-5555-5555-5555-555555555555', 'Sem piso', 7::smallint, '+5519991240007')),
  'confirmed',
  'a null min_age means no floor: the policy is per event, not hard-coded');

select throws_ok(
  $$update public.events set min_age = 40, max_age = 20
     where id = '55555555-5555-5555-5555-555555555555'$$,
  '23514', null,
  'and an inverted policy is unrepresentable');

-- ================================================================================================
-- THE SHARED TELEPHONE NUMBER — migration 16.
--
-- On its own event, deliberately: this is the one section that ADDS rows for a number the sections
-- above have already reasoned about, and folding it into the capacity narrative there would make
-- every later count depend on a rule change rather than on the rule being tested.
-- ================================================================================================
insert into public.events (id, slug, title, starts_at, capacity, registration_state, waitlist_enabled)
values ('66666666-6666-6666-6666-666666666666', 'evt-familia', 'Evento familia',
        '2026-09-19T19:00:00-03:00', 6, 'open', true);

select is(
  (select outcome from public.register_for_event(
     '66666666-6666-6666-6666-666666666666', 'Ana Souza', 15::smallint, '+5519991249000')),
  'confirmed', 'the first person on the family telephone is confirmed');
select is(
  (select outcome from public.register_for_event(
     '66666666-6666-6666-6666-666666666666', 'Bruno Souza', 17::smallint, '+5519991249000')),
  'confirmed', 'so is the second');
select is(
  (select outcome from public.register_for_event(
     '66666666-6666-6666-6666-666666666666', 'Ana Beatriz Souza', 13::smallint, '+5519991249000')),
  'confirmed', 'and the third, whose first name collides with the first person''s');
select is(
  (select outcome from public.register_for_event(
     '66666666-6666-6666-6666-666666666666', 'Carla Souza', 19::smallint, '+5519991249000')),
  'confirmed', 'and the fourth');
select is(
  (select outcome from public.register_for_event(
     '66666666-6666-6666-6666-666666666666', 'Diego Souza', 21::smallint, '+5519991249000')),
  'confirmed', 'and the fifth - six people on one number is the case this exists for');

select is((select count(*)::int from public.registrations
            where event_id = '66666666-6666-6666-6666-666666666666'
              and phone_e164 = '+5519991249000' and status <> 'cancelled'),
          5, 'five active registrations share one telephone number');
select is((select confirmed_count from public.events where id = '66666666-6666-6666-6666-666666666666'),
          5, 'the counter followed every one of them, so a shared number cannot oversell an event');

-- And the exact same person, once more, is still refused.
select is(
  (select outcome from public.register_for_event(
     '66666666-6666-6666-6666-666666666666', 'bruno  souza', 17::smallint, '+5519991249000')),
  'already_registered', 'while the same person repeated is still exactly one registration');
select is((select count(*)::int from public.registrations
            where event_id = '66666666-6666-6666-6666-666666666666'
              and phone_e164 = '+5519991249000' and status <> 'cancelled'),
          5, 'and no sixth row appeared');

select * from finish();
rollback;

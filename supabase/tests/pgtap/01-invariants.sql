-- Database-enforced invariants, proven against the constraint layer itself rather than through an
-- RPC: these must hold for ANY write path, including a manual UPDATE in the SQL editor.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(21);

-- The seeded production event is already the active one, so this fixture is inactive: I5 is
-- asserted against the seed rather than against another fixture.
insert into public.events (id, slug, title, starts_at, ends_at, capacity, registration_state, is_active)
values ('11111111-1111-1111-1111-111111111111', 'evt-a', 'Evento A',
        '2026-09-19T19:00:00-03:00', '2026-09-19T21:00:00-03:00', 5, 'open', false);

-- ------------------------------------------------------------ I5: one active event ----
select throws_ok(
  $$insert into public.events (slug, title, starts_at, is_active)
    values ('evt-b', 'Evento B', '2026-10-10T19:00:00-03:00', true)$$,
  '23505', null,
  'I5: a second active event is impossible while the seeded event holds the flag');

select lives_ok(
  $$insert into public.events (slug, title, starts_at, is_active)
    values ('evt-b', 'Evento B', '2026-10-10T19:00:00-03:00', false)$$,
  'I5: additional INACTIVE events are allowed - the multi-event seam stays open');

-- ------------------------------------- I7: open requires a meaningful capacity ----
select throws_ok(
  $$insert into public.events (slug, title, starts_at, capacity, registration_state)
    values ('evt-c', 'Evento C', '2026-10-10T19:00:00-03:00', 0, 'open')$$,
  '23514', null,
  'I7: an event cannot be CREATED open with capacity 0');

select throws_ok(
  $$update public.events set registration_state = 'open'
     where slug = 'evt-b'$$,
  '23514', null,
  'I7: a direct UPDATE cannot open an event with capacity 0 - the rule is not merely in the RPC');

select throws_ok(
  $$update public.events set capacity = 0
     where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'I7 in reverse: capacity cannot be lowered to 0 while registrations are open');

select lives_ok(
  $$update public.events set capacity = 3
     where id = '11111111-1111-1111-1111-111111111111'$$,
  'capacity may be lowered while it still covers the confirmed count');

-- ------------------------------------------------- I1: confirmed_count <= capacity ----
select throws_ok(
  $$update public.events set confirmed_count = capacity + 1
     where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'I1: confirmed_count can never exceed capacity, whatever writes the row');

select throws_ok(
  $$update public.events set confirmed_count = -1
     where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'counters cannot go negative');

select throws_ok(
  $$update public.events set capacity = -1
     where slug = 'evt-b'$$,
  '23514', null,
  'capacity cannot be negative');

select throws_ok(
  $$insert into public.events (slug, title, starts_at, ends_at)
    values ('evt-d', 'Evento D', '2026-10-10T21:00:00-03:00', '2026-10-10T19:00:00-03:00')$$,
  '23514', null,
  'an event cannot end before it starts');

-- --------------------------------------------------------- registration shape ----
select throws_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values ('11111111-1111-1111-1111-111111111111', 'A', 20, '+5519991234567', 'confirmed')$$,
  '23514', null,
  'a one-character name is rejected');

select throws_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values ('11111111-1111-1111-1111-111111111111', 'Ana Souza', 0, '+5519991234567', 'confirmed')$$,
  '23514', null,
  'age 0 is outside the technical plausibility bound');

select throws_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values ('11111111-1111-1111-1111-111111111111', 'Ana Souza', 121, '+5519991234567', 'confirmed')$$,
  '23514', null,
  'age 121 is outside the technical plausibility bound');

select throws_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values ('11111111-1111-1111-1111-111111111111', 'Ana Souza', 20, '19991234567', 'confirmed')$$,
  '23514', null,
  'a non-E.164 phone is rejected by the shape check');

select throws_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values ('11111111-1111-1111-1111-111111111111', 'Ana Souza', 20, '+5519891234567', 'confirmed')$$,
  '23514', null,
  'a landline-shaped number (no leading 9) is rejected');

select throws_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values ('11111111-1111-1111-1111-111111111111', 'Ana Souza', 20, '+5519991234567', 'waitlisted')$$,
  '23514', null,
  'a waitlisted registration without a rank is impossible');

-- ------------------------------------------------------- I3: the duplicate rule ----
insert into public.registrations (event_id, full_name, age, phone_e164, status)
values ('11111111-1111-1111-1111-111111111111', 'Ana Souza', 20, '+5519991234567', 'confirmed');

select throws_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values ('11111111-1111-1111-1111-111111111111', 'Outra Pessoa', 30, '+5519991234567', 'confirmed')$$,
  '23505', null,
  'I3: a second active registration for the same phone is impossible');

update public.registrations set status = 'cancelled' where phone_e164 = '+5519991234567';

select lives_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status)
    values ('11111111-1111-1111-1111-111111111111', 'Ana Souza', 20, '+5519991234567', 'confirmed')$$,
  'I3 is partial: a cancelled person may register again');

-- ------------------------------------------------- I4: waitlist rank uniqueness ----
insert into public.registrations (event_id, full_name, age, phone_e164, status, waitlist_rank)
values ('11111111-1111-1111-1111-111111111111', 'Bruno Gonçalves', 22, '+5519991234500', 'waitlisted', 1);

select throws_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status, waitlist_rank)
    values ('11111111-1111-1111-1111-111111111111', 'Carla Dias', 23, '+5519991234501', 'waitlisted', 1)$$,
  '23505', null,
  'I4: two people cannot share a queue position');

select lives_ok(
  $$insert into public.registrations (event_id, full_name, age, phone_e164, status, waitlist_rank)
    values ('11111111-1111-1111-1111-111111111111', 'Carla Dias', 23, '+5519991234501', 'waitlisted', 2)$$,
  'the next queue position is free');

-- Accent folding is what makes admin name search usable for Brazilian names.
select is(
  (select search_name from public.registrations where phone_e164 = '+5519991234500'),
  'bruno goncalves',
  'search_name is folded and lowercased');

select * from finish();
rollback;

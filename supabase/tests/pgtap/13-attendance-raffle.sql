-- Attendance and raffles — RAFFLE-AND-CERTIFICATE-SPEC.md § 1 to § 3.
--
-- The assertion this file exists for is the LAST one: a recorded draw is re-derived from its stored
-- seed alone and must name the same winner. Everything else here is the behaviour that assertion
-- depends on being true.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(31);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'operadora@teste.local');
insert into public.admin_users (user_id, email, display_name) values
  ('c0000000-0000-0000-0000-00000000000a', 'operadora@teste.local', 'Operadora');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.events (id, slug, title, starts_at, capacity, registration_state)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'evt-sorteio', 'Evento sorteio',
        '2026-09-19T19:00:00-03:00', 20, 'open');

-- Ten confirmed people. Six of them will be marked present.
insert into public.registrations (event_id, full_name, age, phone_e164, status)
select 'cccccccc-cccc-cccc-cccc-cccccccccccc',
       'Pessoa ' || i, 20::smallint, '+5519991' || lpad((300000 + i)::text, 6, '0'), 'confirmed'
  from generate_series(1, 10) i;

-- ------------------------------------------------------------------ attendance ----
select is((select count(*)::int from public.registrations where attended_at is not null),
          0, 'nobody is present until someone says so');

select isnt(
  (select attended_at from public.set_registration_attendance(
     (select id from public.registrations where full_name = 'Pessoa 1'), true)),
  null, 'checking someone in records the moment');

-- Idempotent: a double tap at the door must not rewrite the arrival time.
select is(
  (select attended_at from public.set_registration_attendance(
     (select id from public.registrations where full_name = 'Pessoa 1'), true)),
  (select attended_at from public.registrations where full_name = 'Pessoa 1'),
  'a second check-in keeps the original arrival time');

select is(
  (select attended_at from public.set_registration_attendance(
     (select id from public.registrations where full_name = 'Pessoa 1'), false)),
  null, 'and it can be cleared, for the mis-tap');

-- Mark six present, for the draws below.
select public.set_registration_attendance(r.id, true)
  from public.registrations r
 where r.full_name in ('Pessoa 1','Pessoa 2','Pessoa 3','Pessoa 4','Pessoa 5','Pessoa 6');

select is((select count(*)::int from public.registrations where attended_at is not null),
          6, 'six people are in the room');

-- A waitlisted person at the door is a PROMOTION, not a check-in.
insert into public.registrations (event_id, full_name, age, phone_e164, status, waitlist_rank)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Pessoa Espera', 20, '+5519991399999',
        'waitlisted', 1);
select throws_ok(
  $$select * from public.set_registration_attendance(
      (select id from public.registrations where full_name = 'Pessoa Espera'), true)$$,
  '23514', 'not_confirmed',
  'a waitlisted person cannot be marked present - that would seat someone I1 says has no seat');

select is((select count(*)::int from public.admin_actions
            where action = 'registration.attendance_set'),
          9, 'every check-in and undo is audited');
select is(
  (select count(*)::int from public.admin_actions
    where action = 'registration.attendance_set'
      and metadata ?| array['full_name','phone_e164','age']),
  0, 'and the audit metadata carries a boolean, never participant data');

-- --------------------------------------------------------------------- raffles ----
select public.create_raffle('cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Sorteio 1', 'Kit', 'attended', 2, true);

select is((select status from public.raffles), 'draft'::public.raffle_status,
          'a new raffle has not started');
select is((select draw_seq from public.raffles), 0, 'and has drawn nobody');

select throws_ok(
  $$select * from public.create_raffle('cccccccc-cccc-cccc-cccc-cccccccccccc',
      'x', null, 'attended'::public.raffle_pool, 1, true)$$,
  '23514', 'invalid_raffle_name', 'a one-character name is refused');
select throws_ok(
  $$select * from public.create_raffle('cccccccc-cccc-cccc-cccc-cccccccccccc',
      'Sorteio 2', null, 'attended'::public.raffle_pool, 0, true)$$,
  '23514', 'invalid_winners_target', 'as is drawing zero people');

-- ------------------------------------------------------------------ the draw ----
select is(
  (select pool_size from public.draw_raffle_winner((select id from public.raffles))),
  6, 'the pool is the six people PRESENT, not the ten confirmed');

select is((select status from public.raffles), 'running'::public.raffle_status,
          'the raffle is now running');
select is((select count(*)::int from public.raffle_draws where outcome = 'pending'),
          1, 'and one result is awaiting the operator');

-- One winner at a time. This is what stops a double press of the space bar burning two prizes.
select throws_ok(
  $$select * from public.draw_raffle_winner((select id from public.raffles))$$,
  '23514', 'draw_pending',
  'a second draw is refused while a result is undecided');

select throws_ok(
  $$select * from public.resolve_raffle_draw(
      (select id from public.raffle_draws), 'pending'::public.raffle_draw_outcome)$$,
  '23514', 'invalid_outcome', 'pending is not an outcome anyone can set');

select is(
  (select status from public.resolve_raffle_draw(
     (select id from public.raffle_draws), 'confirmed'::public.raffle_draw_outcome)),
  'running'::public.raffle_status, 'confirming the first of two leaves the raffle running');

select throws_ok(
  $$select * from public.resolve_raffle_draw(
      (select id from public.raffle_draws), 'confirmed'::public.raffle_draw_outcome)$$,
  '23514', 'draw_already_resolved', 'and it cannot be resolved twice');

-- The second draw: the pool has shrunk by the person already drawn.
select is(
  (select pool_size from public.draw_raffle_winner((select id from public.raffles))),
  5, 'the winner is out of the pool for the rest of the raffle');

select is(
  (select status from public.resolve_raffle_draw(
     (select id from public.raffle_draws where outcome = 'pending'),
     'confirmed'::public.raffle_draw_outcome)),
  'finished'::public.raffle_status, 'reaching the target finishes the raffle');

select throws_ok(
  $$select * from public.draw_raffle_winner((select id from public.raffles))$$,
  '23514', 'raffle_complete', 'and no further draw is possible');

select is((select draw_seq from public.raffles), 2, 'draw_seq counted both draws');

-- ------------------------------------------------------------------ the audit ----
select is((select count(*)::int from public.admin_actions where action = 'raffle.drawn'),
          2, 'each draw is audited');
select is(
  (select count(*)::int from public.admin_actions
    where action = 'raffle.drawn' and registration_id is null),
  0, 'identified by registration id');
select is(
  (select count(*)::int from public.admin_actions
    where action = 'raffle.drawn' and metadata ?| array['full_name','masked_name','phone_e164']),
  0, 'and the metadata carries counts and ids only');

-- ---------------------------------------------------------- LGPD: the cascade ----
-- A raffle result is not an audit record. Erasing the participant must erase it (D33).
select public.delete_registration(
  (select registration_id from public.raffle_draws order by draw_index limit 1));
select is((select count(*)::int from public.raffle_draws), 1,
          'deleting a participant takes their raffle result with them');
select is((select count(*)::int from public.admin_actions where action = 'raffle.drawn'), 2,
          'while the audit trail of the draw survives, carrying ids and counts');

-- ============================================================================
-- THE REPLAY ASSERTION (§ 2).
--
-- Re-derive the winner of the remaining draw from its STORED SEED alone: order the eligible pool by
-- id, take first-60-bits(seed) modulo pool_size, and take that element. If this ever fails, the
-- draws in this database have stopped being verifiable, which is the one property the whole feature
-- rests on.
-- ============================================================================
select is(
  (select (select array_agg(x.id order by x.id)
             from public.registrations x
            where x.event_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
              and x.status = 'confirmed'
              and x.attended_at is not null
              and not exists (select 1
                                from public.raffle_draws e
                               where e.raffle_id = d.raffle_id
                                 and e.draw_index < d.draw_index
                                 and e.registration_id = x.id)
          )[ (('x' || substr(encode(d.seed, 'hex'), 1, 15))::bit(60)::bigint % d.pool_size)::integer
             + 1 ]
     from public.raffle_draws d),
  (select registration_id from public.raffle_draws),
  'a recorded draw is re-derived from its stored seed and names the same winner');

select is((select octet_length(seed) from public.raffle_draws), 16,
          'and the seed is the full sixteen bytes it was drawn from');

-- ------------------------------------------------------------ the empty pool ----
-- Last, because it empties the room and the replay assertion above reads who is in it.
-- An `attended` raffle with nobody present is refused rather than silently producing nothing.
select public.set_registration_attendance(r.id, false)
  from public.registrations r where r.attended_at is not null;

select public.create_raffle('cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Sorteio vazio', null, 'attended', 1, false);
select throws_ok(
  $$select * from public.draw_raffle_winner(
      (select id from public.raffles where name = 'Sorteio vazio'))$$,
  'P0002', 'pool_empty',
  'an attended raffle with nobody in the room is an error, not a silent no-op');

select * from finish();
rollback;

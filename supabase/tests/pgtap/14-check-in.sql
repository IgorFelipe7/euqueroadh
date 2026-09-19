-- Venue self check-in — migrations 17 and 18.
--
-- THE ASSERTION THIS FILE EXISTS FOR is the privacy one, and it is the hardest to get by inspection:
-- a telephone number with NO eligible registration and a telephone number shared by FIVE must be
-- answered identically, at every step, all the way to the same final sentence. Everything else here is
-- the behaviour that property depends on being true.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(62);

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-00000000000a', 'porta@teste.local');
insert into public.admin_users (user_id, email, display_name) values
  ('d0000000-0000-0000-0000-00000000000a', 'porta@teste.local', 'Equipe da porta');

select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.events (id, slug, title, kicker, starts_at, capacity, registration_state)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'evt-checkin', 'Evento check-in', 'Palestra',
        '2026-09-19T19:00:00-03:00', 20, 'open');

-- A second event, so "one open session per event" is a per-event claim rather than a global one.
insert into public.events (id, slug, title, starts_at, capacity, registration_state)
values ('dddddddd-dddd-dddd-dddd-eeeeeeeeeeee', 'evt-outro', 'Outro evento',
        '2026-09-20T19:00:00-03:00', 10, 'open');

-- ---------------------------------------------------------------------------
-- Opening, rotating, closing.
-- ---------------------------------------------------------------------------
create temp table opened as
  select * from public.open_check_in_session('dddddddd-dddd-dddd-dddd-dddddddddddd');

select ok((select token ~ '^[A-Za-z0-9_-]{27}$' from opened),
          'the session token is 27 characters of base64url - 160 bits, like the certificate token');
select is((select count(*)::int from public.check_in_sessions where status = 'open'),
          1, 'one open session exists');
select ok((select expires_at > now() + interval '11 hours' from opened),
          'and it expires hours from now rather than at some unstated time');

-- IDEMPOTENT. An operator who taps `Abrir check-in` twice must not invalidate the QR on the projector.
select is(
  (select token from public.open_check_in_session('dddddddd-dddd-dddd-dddd-dddddddddddd')),
  (select token from opened),
  'opening an already-open session returns the SAME token - the QR on screen does not change');
select is((select count(*)::int from public.check_in_sessions),
          1, 'and creates no second row');
select is((select count(*)::int from public.admin_actions where action = 'checkin.session_opened'),
          1, 'the idempotent re-open is not audited, because nothing happened');

-- One event's session says nothing about another's.
select ok(
  (select token <> (select token from opened)
     from public.open_check_in_session('dddddddd-dddd-dddd-dddd-eeeeeeeeeeee')),
  'a second event gets its own distinct session');
select is((select count(*)::int from public.check_in_sessions where status = 'open'),
          2, 'and both are open at once - the one-open rule is per event');

-- ROTATION is the deliberate "that QR leaked" action.
create temp table rotated as
  select * from public.open_check_in_session('dddddddd-dddd-dddd-dddd-dddddddddddd', true);

select ok((select token <> (select token from opened) from rotated),
          'rotating mints a NEW token');
select is(
  (select status from public.check_in_sessions where token = (select token from opened)),
  'closed'::public.check_in_session_status,
  'and closes the previous session, so every screenshot of the old QR is inert');
select is((select count(*)::int from public.check_in_sessions
            where event_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and status = 'open'),
          1, 'still exactly one open session for this event');
select is((select count(*)::int from public.admin_actions where action = 'checkin.session_rotated'),
          1, 'a rotation IS audited - it revokes a capability a room may be looking at');

-- The audit metadata must never quote the capability it describes.
select is(
  (select count(*)::int from public.admin_actions
    where action in ('checkin.session_opened', 'checkin.session_rotated', 'checkin.session_closed')
      and metadata::text like '%' || (select token from rotated) || '%'),
  0, 'no audit row contains a session token - an audit log outlives the capability it would quote');

-- Two open sessions for one event are unrepresentable even by hand.
select throws_ok(
  $$insert into public.check_in_sessions (event_id, token, expires_at)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA',
            now() + interval '1 hour')$$,
  '23505', null,
  'a second OPEN session for one event is impossible - "I closed check-in" has to mean it');

-- A short or guessable token is refused by the shape constraint.
select throws_ok(
  $$insert into public.check_in_sessions (event_id, token, expires_at)
    values ('dddddddd-dddd-dddd-dddd-eeeeeeeeeeee', 'abc', now() + interval '1 hour')$$,
  '23514', null,
  'a hand-written short token cannot be a session');

-- ---------------------------------------------------------------------------
-- Authorization.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select * from public.open_check_in_session('dddddddd-dddd-dddd-dddd-dddddddddddd')$$,
  '42501', 'not_authorized', 'opening check-in requires an active administrator');
select throws_ok(
  $$select * from public.close_check_in_session('dddddddd-dddd-dddd-dddd-dddddddddddd')$$,
  '42501', 'not_authorized', 'and so does closing it');

select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- The people.
-- ---------------------------------------------------------------------------
-- One number, one person.
select public.register_for_event('dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Carla Dias', 19::smallint, '+5519991250001');

-- One number, three people — and two of them share a first name, which is what the age step exists for.
select public.register_for_event('dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Ana Souza', 15::smallint, '+5519991250002');
select public.register_for_event('dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Ana Beatriz Souza', 13::smallint, '+5519991250002');
select public.register_for_event('dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Bruno Souza', 17::smallint, '+5519991250002');

-- A waitlisted person and a cancelled one.
insert into public.registrations (event_id, full_name, age, phone_e164, status, waitlist_rank)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Espera Silva', 20, '+5519991250003', 'waitlisted', 1);
insert into public.registrations (event_id, full_name, age, phone_e164, status)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Cancelada Lima', 22, '+5519991250004', 'cancelled');

create temp table tok as select token from rotated;

-- ---------------------------------------------------------------------------
-- The session as a capability.
-- ---------------------------------------------------------------------------
select is((select event_title from public.get_check_in_session((select token from tok))),
          'Evento check-in', 'a live token resolves to the event''s display copy');
select is((select count(*)::int from public.get_check_in_session('nope-nope-nope-nope-nope-xy')),
          0, 'an unknown token resolves to nothing');
select is((select count(*)::int from public.get_check_in_session((select token from opened))),
          0, 'and so does a CLOSED session''s token - one response for both');
select is((select count(*)::int from public.get_check_in_session(null)),
          0, 'a null token is answered, not raised');

-- The routine's return signature is the privacy boundary, so it is asserted structurally: no column
-- through which a participant could travel can exist without this test failing.
select bag_eq(
  $$select unnest(p.proargnames[array_length(p.proargnames,1) - 8
                                : array_length(p.proargnames,1)])
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_check_in_session'$$,
  $$values ('event_title'), ('event_kicker'), ('audience_label'), ('starts_at'), ('ends_at'),
           ('timezone'), ('venue_name'), ('venue_city'), ('venue_state')$$,
  'get_check_in_session returns event display copy and NOTHING else - no id, no expiry, no opener');

-- ---------------------------------------------------------------------------
-- Identification: the unique number.
-- ---------------------------------------------------------------------------
select is((select result from public.self_check_in((select token from tok), '+5519991250001')),
          'confirmed', 'a number identifying exactly one confirmed person checks in from one field');
select isnt((select attended_at from public.registrations where full_name = 'Carla Dias'),
            null, 'and the arrival is recorded');

create temp table arrival as
  select attended_at from public.registrations where full_name = 'Carla Dias';

-- IDEMPOTENT: a repeat scan is friendly and does not rewrite the arrival time.
select is((select result from public.self_check_in((select token from tok), '+5519991250001')),
          'already_present', 'a repeat scan is answered kindly rather than as an error');
select is((select attended_at from public.registrations where full_name = 'Carla Dias'),
          (select attended_at from arrival),
          'and attended_at is the ARRIVAL time, not the last-tap time');

-- ---------------------------------------------------------------------------
-- Identification: the shared number, step by step.
-- ---------------------------------------------------------------------------
select is((select result from public.self_check_in((select token from tok), '+5519991250002')),
          'need_name', 'a shared number cannot be resolved from the number alone');
select is((select count(*)::int from public.registrations
            where phone_e164 = '+5519991250002' and attended_at is not null),
          0, 'and nobody was marked present by the attempt');

select is(
  (select result from public.self_check_in((select token from tok), '+5519991250002', 'Bruno')),
  'confirmed', 'a first name that resolves to one person checks that person in');
select isnt((select attended_at from public.registrations where full_name = 'Bruno Souza'),
            null, 'Bruno is present');
select is((select count(*)::int from public.registrations
            where phone_e164 = '+5519991250002' and attended_at is not null),
          1, 'and only Bruno - the other two on his telephone are untouched');

-- Two people named Ana on one number: the name is not enough, so the age is asked for.
select is(
  (select result from public.self_check_in((select token from tok), '+5519991250002', 'Ana')),
  'need_age', 'a first name shared by two people on one number is not an identification');
select is(
  (select result from public.self_check_in((select token from tok), '+5519991250002', 'Ana', 15::smallint)),
  'confirmed', 'the age breaks the ambiguity');
select isnt((select attended_at from public.registrations where full_name = 'Ana Souza'),
            null, 'and the RIGHT Ana is present');
select is((select attended_at from public.registrations where full_name = 'Ana Beatriz Souza'),
          null, 'while the other Ana is not - an ambiguous match must never guess');

-- Normalization, on the typed side.
select is(
  (select result from public.self_check_in((select token from tok), '+5519991250002', '  aNa  ', 13::smallint)),
  'confirmed', 'the typed name is folded for case and whitespace exactly as the stored one is');
select isnt((select attended_at from public.registrations where full_name = 'Ana Beatriz Souza'),
            null, 'so Ana Beatriz checks in by her own first name and age');

-- A compound given name matches on its first word, from either form.
select public.register_for_event('dddddddd-dddd-dddd-dddd-dddddddddddd',
  'João Pedro Nunes', 18::smallint, '+5519991250005');
select is(
  (select result from public.self_check_in((select token from tok), '+5519991250005', 'joao')),
  'confirmed', 'an accented given name is matched by its unaccented spelling');

select public.register_for_event('dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Maria da Silva', 24::smallint, '+5519991250006');
select is(
  (select result from public.self_check_in((select token from tok), '+5519991250006', 'Maria')),
  'confirmed', 'a name with a particle is matched by its first word, not by the particle');

-- ---------------------------------------------------------------------------
-- THE PRIVACY PROPERTY.
--
-- An unknown number, a waitlisted person and a cancelled one travel the SAME path, in the SAME order,
-- to the SAME answer as a shared number does. A prober therefore learns nothing about whether a
-- telephone number is registered at all.
-- ---------------------------------------------------------------------------
select is((select result from public.self_check_in((select token from tok), '+5519991259999')),
          'need_name', 'an UNKNOWN number is asked for a first name, exactly like a shared one');
select is((select result from public.self_check_in((select token from tok), '+5519991259999', 'Zeca')),
          'need_age', 'and then for an age, exactly like an ambiguous one');
select is(
  (select result from public.self_check_in((select token from tok), '+5519991259999', 'Zeca', 30::smallint)),
  'not_found', 'and only then refused, generically');

select is((select result from public.self_check_in((select token from tok), '+5519991250003')),
          'need_name', 'a WAITLISTED person''s number is indistinguishable from an unknown one');
select is(
  (select result from public.self_check_in((select token from tok), '+5519991250003', 'Espera')),
  'need_age', 'the name does not change that');
select is(
  (select result from public.self_check_in((select token from tok), '+5519991250003', 'Espera', 20::smallint)),
  'not_found', 'and the correct name AND age still cannot self-confirm a waitlisted person');
select is((select attended_at from public.registrations where full_name = 'Espera Silva'),
          null,
          'I1 holds: attendance must not seat somebody who has no seat - a promotion is an audited, '
          'capacity-checked admin action');

select is(
  (select result from public.self_check_in((select token from tok), '+5519991250004', 'Cancelada', 22::smallint)),
  'not_found', 'a cancelled registration cannot self-confirm either');
select is((select attended_at from public.registrations where full_name = 'Cancelada Lima'),
          null, 'and stays absent');

-- A wrong name on a real number is the same refusal as a wrong number.
select is(
  (select result from public.self_check_in((select token from tok), '+5519991250002', 'Xuxa', 15::smallint)),
  'not_found', 'a name that matches nothing on a real number is refused generically');

-- The result is ONE column, and it is a word. Structural, like the session read above.
select is(
  (select array_length(p.proargnames, 1) - p.pronargs
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'self_check_in'),
  1, 'self_check_in returns exactly ONE output column - there is no room for a name in its signature');

-- ---------------------------------------------------------------------------
-- The session bounds the capability.
-- ---------------------------------------------------------------------------
select public.register_for_event('dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Tarde Demais', 20::smallint, '+5519991250007');

-- An EXPIRED session is refused even though its row still says `open`.
update public.check_in_sessions
   set opened_at = now() - interval '2 days', expires_at = now() - interval '1 day'
 where token = (select token from tok);

select is((select result from public.self_check_in((select token from tok), '+5519991250007')),
          'session_invalid', 'an expired session refuses a check-in');
select is((select count(*)::int from public.get_check_in_session((select token from tok))),
          0, 'and does not render a page either');
select is((select attended_at from public.registrations where full_name = 'Tarde Demais'),
          null, 'nothing was written');

update public.check_in_sessions
   set opened_at = now(), expires_at = now() + interval '12 hours'
 where token = (select token from tok);

select is((select result from public.self_check_in((select token from tok), '+5519991250007')),
          'confirmed', 'a live session admits the same person');

-- CLOSING revokes it, within the transaction.
select is((select closed from public.close_check_in_session('dddddddd-dddd-dddd-dddd-dddddddddddd')),
          true, 'closing reports that it closed something');
select is((select closed from public.close_check_in_session('dddddddd-dddd-dddd-dddd-dddddddddddd')),
          false, 'closing again is answered, not raised - "closed" is the state the operator wanted');
select is((select count(*)::int from public.admin_actions where action = 'checkin.session_closed'),
          1, 'and only the real transition is audited');

select public.register_for_event('dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Depois Do Fim', 20::smallint, '+5519991250008');
select is((select result from public.self_check_in((select token from tok), '+5519991250008')),
          'session_invalid', 'every copy of the URL is inert once check-in is closed');
select is((select attended_at from public.registrations where full_name = 'Depois Do Fim'),
          null, 'and nothing was written');

-- Malformed input is answered rather than raised: this is a public endpoint.
select is((select result from public.self_check_in(null, '+5519991250008')),
          'session_invalid', 'a null token is a closed session, not an exception');
select is((select result from public.self_check_in('x', '+5519991250008')),
          'session_invalid', 'and so is a token too short to be one');

-- ---------------------------------------------------------------------------
-- Self check-in writes no personal-data audit trail of its own (launch brief § 37).
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.admin_actions
    where action not in ('checkin.session_opened', 'checkin.session_rotated',
                         'checkin.session_closed')),
  0,
  'a guest confirming their own arrival writes NO audit row - attended_at IS the record, and a '
  'second timestamped copy of "this person was here" is what § 12 exists to prevent');

select * from finish();
rollback;

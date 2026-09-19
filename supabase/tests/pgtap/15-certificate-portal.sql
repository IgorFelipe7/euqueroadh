-- The self-service certificate portal — migration 19.
--
-- THE ASSERTION THIS FILE EXISTS FOR: `find_certificate` must be an IDENTIFICATION LAYER over the
-- existing token and never a second way to reach a certificate. Concretely — it returns a token that
-- already existed, only to somebody who can prove three facts, and only when the same predicate
-- `get_certificate` applies is already satisfied. Everything else here is the behaviour that depends
-- on being true.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(32);

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-00000000000a', 'certificados@teste.local');
insert into public.admin_users (user_id, email, display_name) values
  ('e0000000-0000-0000-0000-00000000000a', 'certificados@teste.local', 'Organizacao');

select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- The portal resolves the ACTIVE event and never takes one from the caller, so the fixture has to
-- make this the active one.
update public.events set is_active = false;
insert into public.events (id, slug, title, starts_at, capacity, registration_state, is_active)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'evt-certificado', 'Evento certificado',
        '2026-09-19T19:00:00-03:00', 20, 'open', true);

-- Two people on one number, both present, sharing a first name — the disambiguation case.
select public.register_for_event('ffffffff-ffff-ffff-ffff-ffffffffffff',
  'Ana Souza', 15::smallint, '+5519991260001');
select public.register_for_event('ffffffff-ffff-ffff-ffff-ffffffffffff',
  'Ana Beatriz Souza', 13::smallint, '+5519991260001');

-- One person on their own number, present.
select public.register_for_event('ffffffff-ffff-ffff-ffff-ffffffffffff',
  'Carla Dias', 19::smallint, '+5519991260002');

-- Present, confirmed, but on a number of their own — the straightforward success.
select public.register_for_event('ffffffff-ffff-ffff-ffff-ffffffffffff',
  'João Pedro Nunes', 18::smallint, '+5519991260003');

-- Confirmed and ABSENT. The person a certificate of participation must never be issued to.
select public.register_for_event('ffffffff-ffff-ffff-ffff-ffffffffffff',
  'Faltou Silva', 20::smallint, '+5519991260004');

-- Waitlisted, and cancelled.
insert into public.registrations (event_id, full_name, age, phone_e164, status, waitlist_rank)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Espera Lima', 21, '+5519991260005', 'waitlisted', 1);
insert into public.registrations (event_id, full_name, age, phone_e164, status, attended_at)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Cancelada Rocha', 22, '+5519991260006', 'cancelled',
        now());

select public.set_registration_attendance(r.id, true)
  from public.registrations r
 where r.full_name in ('Ana Souza', 'Ana Beatriz Souza', 'Carla Dias', 'João Pedro Nunes');

-- ---------------------------------------------------------------------------
-- THE GATE. Before the organizer flips the switch, the portal answers nothing at all.
-- ---------------------------------------------------------------------------
select is((select certificates_enabled from public.events where is_active),
          false, 'certificates start disabled - an event does not release them by existing');

select is((select result from public.find_certificate('+5519991260002', 'Carla')),
          'not_found',
          'while the switch is off, a perfectly eligible attendee is refused');
select is((select token from public.find_certificate('+5519991260002', 'Carla')),
          null, 'and no token is produced');

-- Flatly `not_found`, never `need_age`: a disabled event must not leak that a name matched something
-- by asking for one more field.
select is((select result from public.find_certificate('+5519991260001', 'Ana')),
          'not_found',
          'a disabled event never answers need_age - that would confirm the name matched');

update public.events set certificates_enabled = true where is_active;

-- ---------------------------------------------------------------------------
-- SUCCESS — and the assertion that it is the EXISTING capability.
-- ---------------------------------------------------------------------------
select is((select result from public.find_certificate('+5519991260002', 'Carla')),
          'found', 'an eligible attendee is identified by telephone number and first name');

select is(
  (select token from public.find_certificate('+5519991260002', 'Carla')),
  (select certificate_token from public.registrations where full_name = 'Carla Dias'),
  'and the token returned is the one ALREADY on her registration - no second capability is minted');

-- The token this portal hands out is the same one `get_certificate` authorizes, which is what makes
-- this an identification layer rather than a parallel access path.
select is(
  (select full_name from public.get_certificate(
     (select token from public.find_certificate('+5519991260002', 'Carla')))),
  'Carla Dias',
  'and it opens the certificate through the unchanged token route');

select is((select result from public.find_certificate('+5519991260003', 'joao')),
          'found', 'an accented given name is matched by its unaccented spelling');
select is((select result from public.find_certificate('+5519991260003', '  JOÃO  ')),
          'found', 'and case and whitespace are folded, exactly as at registration');

-- ---------------------------------------------------------------------------
-- DISAMBIGUATION.
-- ---------------------------------------------------------------------------
select is((select result from public.find_certificate('+5519991260001', 'Ana')),
          'need_age', 'two attendees named Ana on one number is not an identification');
select is((select token from public.find_certificate('+5519991260001', 'Ana')),
          null, 'and nothing is handed over while it is ambiguous');

select is((select result from public.find_certificate('+5519991260001', 'Ana', 15::smallint)),
          'found', 'the age breaks it');
select is(
  (select token from public.find_certificate('+5519991260001', 'Ana', 15::smallint)),
  (select certificate_token from public.registrations where full_name = 'Ana Souza'),
  'and resolves to the RIGHT Ana');
select is(
  (select token from public.find_certificate('+5519991260001', 'Ana', 13::smallint)),
  (select certificate_token from public.registrations where full_name = 'Ana Beatriz Souza'),
  'while the other age resolves to the other Ana');

-- An age that matches neither is refused rather than resolved to the nearest.
select is((select result from public.find_certificate('+5519991260001', 'Ana', 40::smallint)),
          'not_found', 'an age matching neither candidate is refused, never rounded to one');

-- ---------------------------------------------------------------------------
-- ELIGIBILITY — the predicate is the certificate's own, and it is not negotiable.
-- ---------------------------------------------------------------------------
select is((select result from public.find_certificate('+5519991260004', 'Faltou')),
          'need_age',
          'a confirmed NON-ATTENDEE is asked for an age, exactly like an ambiguous match');
select is((select result from public.find_certificate('+5519991260004', 'Faltou', 20::smallint)),
          'not_found',
          'and is then refused: a certificate of participation for someone who did not participate '
          'is a false document');

select is((select result from public.find_certificate('+5519991260005', 'Espera', 21::smallint)),
          'not_found', 'a waitlisted person has no certificate');
select is((select result from public.find_certificate('+5519991260006', 'Cancelada', 22::smallint)),
          'not_found',
          'nor does a cancelled one, even with attended_at set - status is part of the predicate');

-- ---------------------------------------------------------------------------
-- THE PRIVACY PROPERTY.
--
-- Every unsuccessful case travels the same two steps to the same word. A prober who supplies a
-- telephone number and a name cannot tell "nobody" from "somebody who did not attend".
-- ---------------------------------------------------------------------------
select is((select result from public.find_certificate('+5519991269999', 'Zeca')),
          'need_age', 'an unknown number is asked for an age, like everybody else');
select is((select result from public.find_certificate('+5519991269999', 'Zeca', 30::smallint)),
          'not_found', 'and then refused generically');

select is((select result from public.find_certificate('+5519991260002', 'Xuxa')),
          'need_age', 'a wrong name on a real number is asked for an age, like everybody else');
select is((select result from public.find_certificate('+5519991260002', 'Xuxa', 19::smallint)),
          'not_found', 'and then refused generically');

-- Both opening fields are mandatory, and an omission is a refusal rather than a wildcard.
select is((select result from public.find_certificate('+5519991260002', null)),
          'not_found', 'a missing first name is refused, never treated as "match anybody"');
select is((select result from public.find_certificate('+5519991260002', '   ')),
          'not_found', 'and neither is a blank one');
select is((select result from public.find_certificate(null, 'Carla')),
          'not_found', 'a missing telephone number is refused too');
select is((select token from public.find_certificate('+5519991260002', null)),
          null, 'and none of those produce a token');

-- The return signature is the privacy boundary, asserted structurally: two columns, and neither of
-- them is a name.
select bag_eq(
  $$select unnest(p.proargnames[p.pronargs + 1 : array_length(p.proargnames, 1)])
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'find_certificate'$$,
  $$values ('result'), ('token')$$,
  'find_certificate returns a state and a token - there is no column a name could travel in');

-- ---------------------------------------------------------------------------
-- The event is resolved from `is_active` and never supplied by the caller.
-- ---------------------------------------------------------------------------
update public.events set certificates_enabled = false where is_active;
select is((select result from public.find_certificate('+5519991260002', 'Carla')),
          'not_found', 'switching certificates back off closes the portal again immediately');

update public.events set certificates_enabled = true where is_active;
update public.events set is_active = false where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
select is((select result from public.find_certificate('+5519991260002', 'Carla')),
          'not_found',
          'and an event that is no longer the active one is not reachable through this portal at all');

-- ---------------------------------------------------------------------------
-- The admin's individual link is untouched and remains the fallback (§ 4.6).
-- ---------------------------------------------------------------------------
update public.events set is_active = true where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
select is(
  (select full_name from public.get_certificate(
     (select certificate_token from public.registrations where full_name = 'Carla Dias'))),
  'Carla Dias',
  'a tokenized link copied from the admin still opens the certificate directly');
select is(
  (select count(*)::int from public.get_certificate(
     (select certificate_token from public.registrations where full_name = 'Faltou Silva'))),
  0, 'and still refuses a non-attendee, which this migration did not loosen');

select * from finish();
rollback;

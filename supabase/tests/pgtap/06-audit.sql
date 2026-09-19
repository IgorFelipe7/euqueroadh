-- I9: every database-local administrative mutation writes its audit record in the SAME
-- transaction, and no audit metadata ever carries participant personal data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(39);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'pessoa@teste.local');
insert into public.admin_users (user_id, email, display_name)
values ('a0000000-0000-0000-0000-00000000000a', 'organizador1@teste.local', 'Organizador Um');

select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.events (id, slug, title, starts_at, capacity, registration_state, waitlist_enabled)
values ('88888888-8888-8888-8888-888888888888', 'evt-audit', 'Evento auditoria',
        '2026-09-19T19:00:00-03:00', 2, 'open', true);

select public.register_for_event('88888888-8888-8888-8888-888888888888',
         'Ana Souza', 20::smallint, '+5519991270001');
select public.register_for_event('88888888-8888-8888-8888-888888888888',
         'Bruno Gonçalves', 21::smallint, '+5519991270002');
select public.register_for_event('88888888-8888-8888-8888-888888888888',
         'Carla Dias', 22::smallint, '+5519991270003');   -- waitlisted, rank 1

select is((select count(*)::int from public.admin_actions), 0,
  'public registrations are not administrative actions and are not audited');

-- ------------------------------------------------------------------ edit ----
select is(
  (select full_name from public.edit_registration(
     (select id from public.registrations where phone_e164 = '+5519991270001'),
     'Ana Souza Lima', 21::smallint, 'chegou cedo')),
  'Ana Souza Lima', 'an administrator corrects a name');

select is((select count(*)::int from public.admin_actions where action = 'registration.edited'),
          1, 'exactly one audit row');
select is(
  (select a.metadata -> 'changed_fields' from public.admin_actions a
    where a.action = 'registration.edited'),
  '["full_name", "age", "notes"]'::jsonb,
  'the metadata names the changed FIELDS - never their values');
select is(
  (select a.actor_user_id from public.admin_actions a where a.action = 'registration.edited'),
  'a0000000-0000-0000-0000-00000000000a'::uuid, 'the actor is recorded');
select is(
  (select a.actor_label from public.admin_actions a where a.action = 'registration.edited'),
  'Organizador Um', 'with a snapshot of their name');
select is(
  (select a.registration_id from public.admin_actions a where a.action = 'registration.edited'),
  (select id from public.registrations where phone_e164 = '+5519991270001'),
  'and the affected registration');

-- An edit that changes nothing writes nothing.
select is(
  (select full_name from public.edit_registration(
     (select id from public.registrations where phone_e164 = '+5519991270001'),
     'Ana Souza Lima', 21::smallint, 'chegou cedo')),
  'Ana Souza Lima', 'a no-op edit returns the current values');
select is((select count(*)::int from public.admin_actions where action = 'registration.edited'),
          1, 'and adds no audit noise');

-- A rejected edit changes nothing and audits nothing.
select throws_ok(
  $$select * from public.edit_registration(
      (select id from public.registrations where phone_e164 = '+5519991270001'),
      'x', 21::smallint, null)$$,
  '23514', 'invalid_name', 'a one-character name is rejected with a named error');
select is((select full_name from public.registrations where phone_e164 = '+5519991270001'),
          'Ana Souza Lima', 'the stored name is unchanged');
select is((select count(*)::int from public.admin_actions where action = 'registration.edited'),
          1, 'and no audit row was written for the failed attempt');

select throws_ok(
  $$select * from public.edit_registration(
      (select id from public.registrations where phone_e164 = '+5519991270001'),
      'Nome Valido', 200::smallint, null)$$,
  '23514', 'invalid_age', 'an implausible age is rejected');

-- ---------------------------------------------------- audit atomicity (I9) ----
-- The mutation and its audit row live in one transactional unit: roll back and BOTH are gone.
savepoint before_edit;
select public.edit_registration(
  (select id from public.registrations where phone_e164 = '+5519991270002'),
  'Bruno Goncalves Neto', 21::smallint, null);
rollback to savepoint before_edit;

select is((select count(*)::int from public.admin_actions where action = 'registration.edited'),
          1, 'I9: after rollback the audit row is gone');
select is((select full_name from public.registrations where phone_e164 = '+5519991270002'),
          'Bruno Gonçalves', 'and so is the mutation - neither can survive without the other');

-- ---------------------------------------------------------------- cancel ----
select is(
  (select public.cancel_registration(
     (select id from public.registrations where phone_e164 = '+5519991270002'))),
  'cancelled'::public.registration_status, 'a cancellation succeeds');
select is((select count(*)::int from public.admin_actions where action = 'registration.cancelled'),
          1, 'and is audited once');
select is(
  (select a.metadata from public.admin_actions a where a.action = 'registration.cancelled'),
  '{"previous_status": "confirmed"}'::jsonb, 'with the previous status and nothing else');

select is(
  (select public.cancel_registration(
     (select id from public.registrations where phone_e164 = '+5519991270002'))),
  'cancelled'::public.registration_status, 'cancelling again is idempotent');
select is((select count(*)::int from public.admin_actions where action = 'registration.cancelled'),
          1, 'and writes no second audit row');

-- --------------------------------------------------------------- promote ----
select is((select count(*)::int from public.promote_from_waitlist(
             '88888888-8888-8888-8888-888888888888', 3)),
          1, 'one person is promoted into the freed seat');
select is((select count(*)::int from public.admin_actions where action = 'registration.promoted'),
          1, 'audited once');
select is(
  (select a.metadata -> 'promoted' from public.admin_actions a
    where a.action = 'registration.promoted'),
  '1'::jsonb, 'with the real number promoted, not the number requested');
select is(
  (select a.metadata -> 'requested' from public.admin_actions a
    where a.action = 'registration.promoted'),
  '3'::jsonb, 'and the number requested alongside it');
select is(
  (select jsonb_array_length(a.metadata -> 'registration_ids') from public.admin_actions a
    where a.action = 'registration.promoted'),
  1, 'identified by id only');

-- -------------------------------------------------------------- settings ----
select public.update_event_settings('88888888-8888-8888-8888-888888888888',
         5, false, 'open'::public.registration_state, null::boolean,
         (select settings_version from public.events where id = '88888888-8888-8888-8888-888888888888'));

select is((select count(*)::int from public.admin_actions where action = 'settings.updated'),
          1, 'a settings change is audited');
select is(
  (select a.metadata from public.admin_actions a where a.action = 'settings.updated'),
  jsonb_build_object(
    'from', jsonb_build_object('capacity', 2, 'waitlist_enabled', true,
                               'registration_state', 'open', 'certificates_enabled', false),
    'to',   jsonb_build_object('capacity', 5, 'waitlist_enabled', false,
                               'registration_state', 'open', 'certificates_enabled', false)),
  'recording the previous and new SETTING values - these are not personal data');

select throws_ok(
  $$select * from public.update_event_settings('88888888-8888-8888-8888-888888888888',
      99, true, 'open'::public.registration_state, null::boolean, 1::bigint)$$,
  '40001', 'settings_conflict', 'a conflicting save raises');
select is((select count(*)::int from public.admin_actions where action = 'settings.updated'),
          1, 'and leaves no audit row behind');
select is((select capacity from public.events where id = '88888888-8888-8888-8888-888888888888'),
          5, 'nor any state change');

-- ---------------------------------------------------- permanent deletion ----
select is(
  (select public.delete_registration(
     (select id from public.registrations where phone_e164 = '+5519991270002'))),
  true, 'a participant record is erased permanently');
select is((select count(*)::int from public.registrations where phone_e164 = '+5519991270002'),
          0, 'the row is gone');
select is(
  (select a.metadata from public.admin_actions a where a.action = 'registration.deleted'),
  '{"status_at_deletion": "cancelled"}'::jsonb,
  'and the audit row - which outlives it - records only the status');
select is(
  (select public.delete_registration('99999999-9999-9999-9999-999999999999'::uuid)),
  false, 'deleting an unknown registration is idempotent, not an error');
select is((select count(*)::int from public.admin_actions where action = 'registration.deleted'),
          1, 'and audits nothing');

-- ------------------------------------------------------------ export ----
select lives_ok(
  $$select public.record_export_action('88888888-8888-8888-8888-888888888888', 12,
      '{"status": "confirmed"}'::jsonb)$$,
  'an export is audited before any byte is streamed');
select is(
  (select a.metadata from public.admin_actions a where a.action = 'registrations.exported'),
  '{"filters": {"status": "confirmed"}, "row_count": 12}'::jsonb,
  'with a row count and the filters used');

-- --------------------------------------------- the PII rule, asserted ----
-- Scan every audit row produced above against the seeded participants' own values.
select is(
  (select count(*)::int from public.admin_actions a,
        (values ('Ana Souza'), ('Ana Souza Lima'), ('Bruno Gonçalves'), ('Carla Dias'),
                ('+5519991270001'), ('+5519991270002'), ('+5519991270003'),
                ('chegou cedo')) as pii(value)
    where a.metadata::text ilike '%' || pii.value || '%'),
  0,
  'no audit metadata anywhere contains a participant name, phone number or note');

select is(
  (select count(*)::int from public.admin_actions a
    where a.actor_label is null or btrim(a.actor_label) = ''),
  0, 'every audit row carries an actor label');

select * from finish();
rollback;

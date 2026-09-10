-- Structural contract of the Phase 2 schema (DATABASE-SECURITY.md § 3).
-- Structure only; behaviour is proven by the suites that follow.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(73);

-- ---------------------------------------------------------------- tables ----
select has_table('public', 'events',        'events exists');
select has_table('public', 'registrations', 'registrations exists');
select has_table('public', 'admin_users',   'admin_users exists');
select has_table('public', 'admin_actions', 'admin_actions exists');

-- "Four tables. No more." (section 2)
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'),
  4,
  'public holds exactly four tables - no speculative entities');

-- ----------------------------------------------------------------- types ----
select has_type('public', 'registration_status', 'registration_status enum exists');
select has_type('public', 'registration_state',  'registration_state enum exists');
select enum_has_labels('public', 'registration_status',
  array['confirmed', 'waitlisted', 'cancelled'], 'registration_status labels');
select enum_has_labels('public', 'registration_state',
  array['open', 'closed'], 'registration_state labels');

-- ---------------------------------------------------------------- events ----
select has_column('public', 'events', 'id',                 'events.id');
select has_column('public', 'events', 'slug',               'events.slug');
select has_column('public', 'events', 'starts_at',          'events.starts_at');
select has_column('public', 'events', 'ends_at',            'events.ends_at');
select has_column('public', 'events', 'timezone',           'events.timezone');
select has_column('public', 'events', 'capacity',           'events.capacity');
select has_column('public', 'events', 'waitlist_enabled',   'events.waitlist_enabled');
select has_column('public', 'events', 'registration_state', 'events.registration_state');
select has_column('public', 'events', 'is_active',          'events.is_active');
select has_column('public', 'events', 'confirmed_count',    'events.confirmed_count');
select has_column('public', 'events', 'waitlist_count',     'events.waitlist_count');
select has_column('public', 'events', 'waitlist_seq',       'events.waitlist_seq');
select has_column('public', 'events', 'settings_version',   'events.settings_version');
select has_column('public', 'events', 'updated_at',         'events.updated_at');

select col_type_is('public', 'events', 'settings_version', 'bigint',
  'settings_version is a bigint counter, not a timestamp');
select col_default_is('public', 'events', 'capacity', '0',
  'capacity defaults to 0 - a seeded event is inert (I7)');
select col_default_is('public', 'events', 'registration_state', 'closed',
  'registration_state defaults to closed - fail safe');
select col_default_is('public', 'events', 'is_active', 'false', 'is_active defaults to false');
select col_default_is('public', 'events', 'waitlist_enabled', 'true', 'waitlist_enabled defaults to true');
select col_default_is('public', 'events', 'settings_version', '1', 'settings_version starts at 1');

select ok(
  (select count(*) = 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = t.c and contype = 'c'),
  t.c || ' check constraint exists')
  from unnest(array['events_capacity_non_negative',
                    'events_counts_non_negative',
                    'events_confirmed_within_capacity',
                    'events_open_requires_capacity',
                    'events_ends_after_starts']) as t(c);

-- --------------------------------------------------------- registrations ----
select has_column('public', 'registrations', 'event_id',          'registrations.event_id');
select has_column('public', 'registrations', 'full_name',         'registrations.full_name');
select has_column('public', 'registrations', 'age',               'registrations.age');
select has_column('public', 'registrations', 'phone_e164',        'registrations.phone_e164');
select has_column('public', 'registrations', 'status',            'registrations.status');
select has_column('public', 'registrations', 'waitlist_rank',     'registrations.waitlist_rank');
select has_column('public', 'registrations', 'notes',             'registrations.notes');
select has_column('public', 'registrations', 'search_name',       'registrations.search_name');
select has_column('public', 'registrations', 'status_changed_at', 'registrations.status_changed_at');
select col_type_is('public', 'registrations', 'age', 'smallint', 'age is a smallint');
select col_is_null('public', 'registrations', 'waitlist_rank',
  'waitlist_rank is nullable - it exists only once someone has queued');

select is(
  (select attgenerated from pg_attribute
    where attrelid = 'public.registrations'::regclass and attname = 'search_name'),
  's'::"char",
  'search_name is a STORED generated column');

select ok(
  (select count(*) = 1 from pg_constraint
    where conrelid = 'public.registrations'::regclass and conname = t.c and contype = 'c'),
  t.c || ' check constraint exists')
  from unnest(array['reg_name_length',
                    'reg_age_range',
                    'reg_phone_shape',
                    'reg_waitlist_rank_present']) as t(c);

select ok(
  (select confdeltype = 'c' from pg_constraint
    where conrelid = 'public.registrations'::regclass and contype = 'f'
      and conkey = array[(select attnum from pg_attribute
                           where attrelid = 'public.registrations'::regclass
                             and attname = 'event_id')]),
  'registrations.event_id cascades when its event is deleted');

-- ----------------------------------------------------------- admin tables ----
select col_is_pk('public', 'admin_users', 'user_id', 'admin_users is keyed by the auth user id');
select has_column('public', 'admin_users', 'is_active', 'admin_users.is_active - the revocation switch');
select has_column('public', 'admin_users', 'invited_by', 'admin_users.invited_by');

select col_is_null('public', 'admin_actions', 'actor_user_id',
  'actor_user_id is NULLABLE - null means a since-removed administrator');
select col_not_null('public', 'admin_actions', 'actor_label',
  'actor_label is NOT NULL - history stays legible after removal');
select ok(
  (select confdeltype = 'n' from pg_constraint
    where conrelid = 'public.admin_actions'::regclass and contype = 'f'
      and conkey = array[(select attnum from pg_attribute
                           where attrelid = 'public.admin_actions'::regclass
                             and attname = 'actor_user_id')]),
  'actor_user_id is ON DELETE SET NULL');
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.admin_actions'::regclass and contype = 'f'
      and conkey = array[(select attnum from pg_attribute
                           where attrelid = 'public.admin_actions'::regclass
                             and attname = 'registration_id')]),
  0,
  'registration_id has NO foreign key - the audit row outlives the registration');
select ok(
  (select count(*) = 1 from pg_constraint
    where conrelid = 'public.admin_actions'::regclass
      and conname = 'admin_actions_known_action'),
  'the audited action list is an explicit allowlist');

-- --------------------------------------------------------------- indexes ----
select has_index('public', 'registrations', 'registrations_active_phone_uidx',
  'I3: partial unique index on (event_id, phone_e164)');
select index_is_unique('public', 'registrations', 'registrations_active_phone_uidx');
select ok(
  (select indpred is not null from pg_index
    where indexrelid = 'public.registrations_active_phone_uidx'::regclass),
  'the duplicate index is PARTIAL - a cancelled person may register again');
select has_index('public', 'registrations', 'registrations_waitlist_rank_uidx', 'I4 backstop');
select index_is_unique('public', 'registrations', 'registrations_waitlist_rank_uidx');
select has_index('public', 'registrations', 'registrations_waitlist_order_idx', 'promotion order index');
select has_index('public', 'registrations', 'registrations_event_created_idx', 'admin list ordering');
select has_index('public', 'registrations', 'registrations_event_status_created_idx', 'status filter');
select has_index('public', 'registrations', 'registrations_search_name_trgm_idx', 'name search');
select has_index('public', 'registrations', 'registrations_phone_prefix_idx', 'phone prefix search');
select has_index('public', 'events', 'events_single_active_uidx', 'I5');
select index_is_unique('public', 'events', 'events_single_active_uidx');
select has_index('public', 'admin_actions', 'admin_actions_created_idx', 'audit review');
select has_index('public', 'admin_actions', 'admin_actions_actor_idx', 'per-actor audit review');

select * from finish();
rollback;

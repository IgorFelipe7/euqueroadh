-- The seeded production event: factual values from EVENT-SOURCE-OF-TRUTH.md, in the fail-safe
-- state required by I7 (§ 6.6).  This suite runs against the seed itself, so it does not create
-- its own event.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(18);

select is((select count(*)::int from public.events), 1, 'exactly one event is seeded');
select is((select count(*)::int from public.events where is_active), 1, 'and it is the active one');
select is((select count(*)::int from public.registrations), 0, 'no participant data is seeded');
select is((select count(*)::int from public.admin_users), 0,
  'and no administrator: the first one is provisioned by hand, never by a repeatable code path');

select is((select slug from public.events), 'educacao-financeira-para-jovens', 'slug');
select is((select title from public.events), 'Educação Financeira', 'title');
select is((select kicker from public.events), 'Palestra', 'kicker - the event format, per the banner');
select is((select starts_at from public.events), '2026-09-19T19:00:00-03:00'::timestamptz,
          'starts 19 September 2026 at 19:00 in São Paulo time');
select is((select ends_at from public.events), '2026-09-19T21:00:00-03:00'::timestamptz, 'ends at 21:00');
select is((select timezone from public.events), 'America/Sao_Paulo', 'timezone');
select is((select venue_name from public.events), 'Espaço Cezanne Eventos', 'venue');
select is((select venue_address_line from public.events), 'R. José Possidonio Silva, 435',
          'the address keeps the banner spelling - a proper name is never silently corrected');

-- ------------------------------------------------------- the fail-safe state ----
select is((select capacity from public.events), 0,
          'capacity is 0: the real venue capacity is not yet known and is not invented here');
select is((select registration_state from public.events), 'closed'::public.registration_state,
          'registrations are closed');
select is((select min_age from public.events), 12::smallint,
          'the online eligibility floor is 12: under-12s are directed to the organization by e-mail');
select ok((select max_age is null from public.events),
          'and no ceiling applies');
select is(
  (select outcome from public.register_for_event(
     (select id from public.events), 'Ana Souza', 20::smallint, '+5519991290001')),
  'closed',
  'so the seeded event is inert: it refuses registrations rather than silently waitlisting them');
select is((select count(*)::int from public.registrations), 0, 'and stores nothing');

select * from finish();
rollback;

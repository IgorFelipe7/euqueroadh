-- Local seed: the single active event.
--
-- Every factual value below comes from EVENT-SOURCE-OF-TRUTH.md, which transcribes
-- references/event/banner-original.png.  Nothing here is invented; the venue address keeps the
-- banner's spelling ("Possidonio", without the circumflex) deliberately - a proper name is not
-- silently corrected.
--
-- THE EVENT IS SEEDED IN ITS FAIL-SAFE STATE.  capacity and registration_state are OMITTED so the
-- column defaults apply: capacity = 0 and registration_state = 'closed'.  The real venue capacity
-- is not yet known (EVENT-SOURCE-OF-TRUTH.md § 9, item 5), and the CHECK constraint
-- events_open_requires_capacity (I7) makes the dangerous combination unrepresentable:
--   * the event cannot be opened until an administrator sets a real capacity;
--   * it cannot silently waitlist every visitor, because it cannot be open at all;
--   * a registration against it returns `closed`, storing nothing.
-- Do NOT seed this event as open, and do NOT invent a placeholder capacity.
--
-- No participant data is seeded: the test suites create their own synthetic fixtures.
-- No administrator is seeded either: the first one is invited from the Supabase dashboard and
-- inserted into admin_users by hand (§ 7.4), which is deliberately not a repeatable code path.

insert into public.events (
  slug,
  title,
  kicker,
  audience_label,
  starts_at,
  ends_at,
  timezone,
  venue_name,
  venue_address_line,
  venue_district,
  venue_city,
  venue_state,
  price_label,
  is_free,
  includes_label,
  is_active
) values (
  'educacao-financeira-para-jovens',
  'Educação Financeira',
  'Palestra',
  'para jovens',
  '2026-09-19T19:00:00-03:00',
  '2026-09-19T21:00:00-03:00',
  'America/Sao_Paulo',
  'Espaço Cezanne Eventos',
  'R. José Possidonio Silva, 435',
  'Jardim Adelaide',
  'Hortolândia',
  'SP',
  'Inscrições gratuitas',
  true,
  'Coffee break incluso',
  true
)
on conflict (slug) do nothing;

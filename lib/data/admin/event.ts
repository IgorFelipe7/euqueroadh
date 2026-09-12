/**
 * The event, as an administrator is allowed to see it.
 *
 * Deliberately a *different* module from `lib/data/public.ts`, reading through a *different*
 * client. The public read runs under the secret key and returns a DTO with no numbers in it at all
 * (D19); this one runs under the administrator's own JWT, so `events_admin_read` is what grants it,
 * and it returns the operational columns — capacity, both counters, the settings token — because
 * those are exactly what an organizer is here to see.
 *
 * There is no secret-key fallback. If RLS would refuse this read, the read fails; the secret key is
 * not an administrator and must never become one (DATABASE-SECURITY.md section 8.3).
 */
import 'server-only';

import { cache } from 'react';

import { assertAdmin } from '@/lib/data/auth';
import { createUserClient } from '@/lib/data/supabase/user';

/** Everything the admin surfaces render. A row, mapped once, here. */
export interface AdminEvent {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly kicker: string | null;
  readonly audienceLabel: string | null;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly venueName: string | null;
  readonly venueAddressLine: string | null;
  readonly venueDistrict: string | null;
  readonly venueCity: string | null;
  readonly venueState: string | null;
  readonly priceLabel: string | null;
  readonly includesLabel: string | null;

  readonly capacity: number;
  readonly waitlistEnabled: boolean;
  readonly registrationState: 'open' | 'closed';
  readonly confirmedCount: number;
  readonly waitlistCount: number;
  readonly settingsVersion: number;
  readonly minAge: number | null;
  readonly maxAge: number | null;
}

interface AdminEventRow {
  id: string;
  slug: string;
  title: string;
  kicker: string | null;
  audience_label: string | null;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  venue_address_line: string | null;
  venue_district: string | null;
  venue_city: string | null;
  venue_state: string | null;
  price_label: string | null;
  includes_label: string | null;
  capacity: number;
  waitlist_enabled: boolean;
  registration_state: 'open' | 'closed';
  confirmed_count: number;
  waitlist_count: number;
  settings_version: number | string;
  min_age: number | null;
  max_age: number | null;
}

const COLUMNS = [
  'id',
  'slug',
  'title',
  'kicker',
  'audience_label',
  'starts_at',
  'ends_at',
  'venue_name',
  'venue_address_line',
  'venue_district',
  'venue_city',
  'venue_state',
  'price_label',
  'includes_label',
  'capacity',
  'waitlist_enabled',
  'registration_state',
  'confirmed_count',
  'waitlist_count',
  'settings_version',
  'min_age',
  'max_age',
].join(', ');

/**
 * The active event, or `null` when the database could not answer.
 *
 * `null` is **not** rendered as zeroes anywhere: an organizer who reads `0 confirmadas` during an
 * outage will act on it, so the dashboard shows `—` instead (ADMIN-SPEC.md section 7.3).
 *
 * Deduplicated per request, so a layout, a page and three components asking for the event cost one
 * query — and the next request still re-reads it, which is what keeps the numbers live.
 */
export const getAdminEvent = cache(async (): Promise<AdminEvent | null> => {
  await assertAdmin();

  const supabase = await createUserClient();

  const { data, error } = await supabase
    .from('events')
    .select(COLUMNS)
    .eq('is_active', true)
    .maybeSingle<AdminEventRow>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.event_read_failed', code: error.code }));
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    kicker: data.kicker,
    audienceLabel: data.audience_label,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    venueName: data.venue_name,
    venueAddressLine: data.venue_address_line,
    venueDistrict: data.venue_district,
    venueCity: data.venue_city,
    venueState: data.venue_state,
    priceLabel: data.price_label,
    includesLabel: data.includes_label,
    capacity: data.capacity,
    waitlistEnabled: data.waitlist_enabled,
    registrationState: data.registration_state,
    confirmedCount: data.confirmed_count,
    waitlistCount: data.waitlist_count,
    // `settings_version` is a bigint. PostgREST serialises int8 as a JSON number while it fits in a
    // double and as a string beyond that; this counter will never reach 2^53, but coercing here
    // means the concurrency token is a number at every call site rather than at most of them.
    settingsVersion: Number(data.settings_version),
    minAge: data.min_age,
    maxAge: data.max_age,
  };
});

/** Free seats, floored at zero. `capacity − confirmed` can only go negative if I1 is broken. */
export function headroomOf(event: Pick<AdminEvent, 'capacity' | 'confirmedCount'>): number {
  return Math.max(0, event.capacity - event.confirmedCount);
}

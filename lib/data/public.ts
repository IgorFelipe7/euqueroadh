/**
 * The public path's only door to the database.
 *
 * The browser never contacts Supabase on the public page — no client is created, no key is present
 * in the public bundle, and there is no query for anyone to tamper with (DATABASE-SECURITY.md
 * section 8.6). The page is rendered by our own server, so this read happens under the secret key,
 * whose privileges are exactly `SELECT` on `public.events` and nothing else.
 *
 * Two rules follow from that, and both are enforced here rather than at the call site:
 *
 *   * **Explicit projection, never `select('*')`.** A column added later must be a deliberate
 *     decision to publish, not an automatic one.
 *   * **A hand-written DTO, never a row.** The server can read `capacity`, `confirmed_count` and
 *     `settings_version`; the page must not learn them. D19 is explicit that the public page shows
 *     *state*, never numbers — a live count leaks the organization's turnout to anyone with the URL.
 *
 * The registration write (`register_for_event`) is Phase 4 and lands in this file too.
 */
import 'server-only';

import { cache } from 'react';

import { secretClient } from './supabase/secret';

/**
 * The advisory state the page renders (PRODUCT-SPEC.md section 4.4).
 *
 * Advisory is not a hedge: a visitor can arrive from a cached page and still be waitlisted. The
 * authority is `register_for_event()`, which decides inside a row lock at submit time. Deriving the
 * banner here is presentation, not allocation — no capacity rule is reimplemented in TypeScript.
 */
export type PublicAvailability = 'open' | 'waitlist' | 'full' | 'closed';

/** Exactly what the public page renders. Nothing operational, nothing numeric. */
export interface PublicEvent {
  readonly slug: string;
  readonly title: string;
  readonly kicker: string | null;
  readonly audienceLabel: string | null;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly timezone: string;
  readonly venueName: string | null;
  readonly venueAddressLine: string | null;
  readonly venueDistrict: string | null;
  readonly venueCity: string | null;
  readonly venueState: string | null;
  readonly priceLabel: string | null;
  readonly isFree: boolean;
  readonly includesLabel: string | null;
  readonly availability: PublicAvailability;
}

/** The row shape this module reads. Private: it carries operational columns the UI may not see. */
interface ActiveEventRow {
  id: string;
  slug: string;
  title: string;
  kicker: string | null;
  audience_label: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  venue_name: string | null;
  venue_address_line: string | null;
  venue_district: string | null;
  venue_city: string | null;
  venue_state: string | null;
  price_label: string | null;
  is_free: boolean;
  includes_label: string | null;
  capacity: number;
  confirmed_count: number;
  waitlist_enabled: boolean;
  registration_state: 'open' | 'closed';
}

const ACTIVE_EVENT_COLUMNS = [
  'id',
  'slug',
  'title',
  'kicker',
  'audience_label',
  'starts_at',
  'ends_at',
  'timezone',
  'venue_name',
  'venue_address_line',
  'venue_district',
  'venue_city',
  'venue_state',
  'price_label',
  'is_free',
  'includes_label',
  'capacity',
  'confirmed_count',
  'waitlist_enabled',
  'registration_state',
].join(', ');

/**
 * The single resolver for "which event is this?" (ARCHITECTURE.md section 12, seam item 5).
 *
 * A partial unique index guarantees at most one active event, so `maybeSingle()` is honest rather
 * than optimistic. Deduplicated per request; the ISR window, not this cache, is what bounds
 * staleness on the public page.
 */
const loadActiveEvent = cache(async (): Promise<ActiveEventRow | null> => {
  const { data, error } = await secretClient()
    .from('events')
    .select(ACTIVE_EVENT_COLUMNS)
    .eq('is_active', true)
    .maybeSingle<ActiveEventRow>();

  if (error) {
    // The provider's message stays in the log; the caller gets "no event", and the page renders its
    // own error state rather than a database sentence.
    console.error(JSON.stringify({ event: 'public.active_event_read_failed', code: error.code }));
    return null;
  }

  return data;
});

/**
 * The active event's id, for the DAL's own use — the registration RPC needs it. Deliberately not
 * the row: nothing outside this module gets to hold operational columns.
 */
export async function getActiveEventId(): Promise<string | null> {
  return (await loadActiveEvent())?.id ?? null;
}

/** The public event, mapped into the DTO the page renders. */
export async function getActiveEventForDisplay(): Promise<PublicEvent | null> {
  const row = await loadActiveEvent();
  if (!row) return null;

  return {
    slug: row.slug,
    title: row.title,
    kicker: row.kicker,
    audienceLabel: row.audience_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    venueName: row.venue_name,
    venueAddressLine: row.venue_address_line,
    venueDistrict: row.venue_district,
    venueCity: row.venue_city,
    venueState: row.venue_state,
    priceLabel: row.price_label,
    isFree: row.is_free,
    includesLabel: row.includes_label,
    availability: availabilityOf(row),
  };
}

function availabilityOf(row: ActiveEventRow): PublicAvailability {
  if (row.registration_state !== 'open') return 'closed';
  if (row.confirmed_count >= row.capacity) return row.waitlist_enabled ? 'waitlist' : 'full';
  return 'open';
}

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
 * The registration write lives here too, and the same two rules apply to it: a narrow command in,
 * a narrow outcome out, and no PostgREST or SQL detail in between.
 */
import 'server-only';

import { cache } from 'react';

import type { PublicEventState, RegistrationStatus } from '@/lib/domain/outcomes';

import { secretClient } from './supabase/secret';

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
  /**
   * The advisory state the page renders (PRODUCT-SPEC.md section 4.4).
   *
   * Advisory is not a hedge: a visitor can arrive from a cached page and still be waitlisted. The
   * authority is `register_for_event()`, which decides inside a row lock at submit time. Deriving
   * this here is presentation, not allocation — no capacity rule is reimplemented in TypeScript.
   */
  readonly state: PublicEventState;
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
async function fetchActiveEvent(): Promise<ActiveEventRow | null> {
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
}

const loadActiveEvent = cache(fetchActiveEvent);

/**
 * What the Server Action needs before it can register anyone: which event, and what the page it was
 * submitted from was most likely showing.
 *
 * Deduplicated per request, so resolving the event costs the same one query whether the page renders
 * it or the action resolves it. Never the row — nothing outside this module holds operational
 * columns.
 */
export interface ActiveEventContext {
  readonly id: string;
  readonly state: PublicEventState;
}

export async function getActiveEventContext(): Promise<ActiveEventContext | null> {
  const row = await loadActiveEvent();
  if (!row) return null;

  return { id: row.id, state: stateOf(row) };
}

/**
 * The advisory state as it is **right now**, deliberately bypassing the per-request cache.
 *
 * Called after an allocation to answer one question: did this registration change what the page
 * should say? `getActiveEventContext()` cannot answer it, because within this request it still
 * holds the value read before the write.
 */
export async function readCurrentEventState(): Promise<PublicEventState | null> {
  const row = await fetchActiveEvent();
  return row ? stateOf(row) : null;
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
    state: stateOf(row),
  };
}

function stateOf(row: ActiveEventRow): PublicEventState {
  if (row.registration_state !== 'open') return 'closed';
  if (row.confirmed_count >= row.capacity) {
    return row.waitlist_enabled ? 'full_waitlist' : 'full_closed';
  }
  return 'open';
}

/* ------------------------------------------------------------------------------------------------
 * The registration write
 * ---------------------------------------------------------------------------------------------- */

/**
 * What the RPC is given. Already validated, already normalized: `fullName` has been trimmed and its
 * internal whitespace collapsed, `age` is an integer inside the plausibility bounds, and
 * `phoneE164` is canonical. Raw user input never reaches this type
 * (PRODUCT-SPEC.md sections 4.3 and 5.2).
 */
export interface RegistrationCommand {
  readonly eventId: string;
  readonly fullName: string;
  readonly age: number;
  readonly phoneE164: string;
}

/**
 * What the database decided, translated once, here.
 *
 * `unavailable` is this layer's own word for "the database did not answer in a way I recognise". It
 * exists so that a SQLSTATE, a PostgREST envelope or an unexpected `outcome` string can never leave
 * the DAL — the Server Action maps it to the generic retry message and a correlation code.
 */
export type RegistrationAllocation =
  | { readonly outcome: 'confirmed'; readonly registrationId: string }
  | { readonly outcome: 'waitlisted'; readonly registrationId: string }
  | { readonly outcome: 'already_registered'; readonly status: RegistrationStatus }
  /** Younger than `events.min_age`. The RPC stored nothing. */
  | { readonly outcome: 'age_not_eligible' }
  | { readonly outcome: 'full' }
  | { readonly outcome: 'closed' }
  | { readonly outcome: 'unavailable' };

/** The one row shape `register_for_event` returns. Private: it never leaves this module. */
interface AllocationRow {
  outcome: string | null;
  status: string | null;
  registration_id: string | null;
}

/**
 * The **only** allocation path in the application (DATABASE-SECURITY.md sections 5 and 8.6).
 *
 * There is no capacity arithmetic here and there never will be: the function locks the event row,
 * checks for a duplicate, decides, inserts and lets the trigger move the counters, all inside one
 * transaction. Reimplementing any part of that in TypeScript would reintroduce exactly the
 * count-then-insert race the database was shaped to eliminate.
 *
 * Turnstile has already been verified by the time this is called — never from inside the locked
 * transaction, and never after it.
 */
export async function registerParticipant(
  command: RegistrationCommand,
): Promise<RegistrationAllocation> {
  const { data, error } = await secretClient().rpc('register_for_event', {
    p_event_id: command.eventId,
    p_full_name: command.fullName,
    p_age: command.age,
    p_phone_e164: command.phoneE164,
  });

  if (error) {
    // `code` is a SQLSTATE or a PostgREST code — a machine token, not a sentence, and not personal.
    // The message, the hint and the details are deliberately dropped: they can quote the statement,
    // and the statement quotes the participant.
    console.error(
      JSON.stringify({ event: 'public.register_rpc_failed', code: error.code ?? 'unknown' }),
    );
    return { outcome: 'unavailable' };
  }

  // A `RETURNS TABLE` function arrives as an array of rows; this one always returns exactly one.
  const row = (Array.isArray(data) ? (data[0] as AllocationRow | undefined) : undefined) ?? null;

  if (!row) {
    console.error(JSON.stringify({ event: 'public.register_rpc_empty' }));
    return { outcome: 'unavailable' };
  }

  switch (row.outcome) {
    case 'confirmed':
    case 'waitlisted':
      return row.registration_id
        ? { outcome: row.outcome, registrationId: row.registration_id }
        : unexpected(row.outcome);

    case 'already_registered':
      return row.status === 'confirmed' || row.status === 'waitlisted'
        ? { outcome: 'already_registered', status: row.status }
        : unexpected(row.outcome);

    case 'age_not_eligible':
      return { outcome: 'age_not_eligible' };

    case 'full':
      return { outcome: 'full' };

    case 'closed':
      return { outcome: 'closed' };

    default:
      return unexpected(row.outcome);
  }
}

/**
 * The database answered with something this application does not model. That is a defect, not a
 * participant's problem: it is loud in the log and generic on screen.
 */
function unexpected(outcome: string | null): RegistrationAllocation {
  console.error(
    JSON.stringify({ event: 'public.register_rpc_unexpected_outcome', outcome: outcome ?? null }),
  );
  return { outcome: 'unavailable' };
}

/* ------------------------------------------------------------------------------------------------
 * Certificates (RAFFLE-AND-CERTIFICATE-SPEC.md section 4.3)
 * ---------------------------------------------------------------------------------------------- */

/** Exactly what a certificate renders. A name and the event's public facts — nothing operational. */
export interface Certificate {
  readonly fullName: string;
  readonly attendedAt: string;
  readonly eventSlug: string;
  readonly eventTitle: string;
  readonly eventKicker: string | null;
  readonly audienceLabel: string | null;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly timezone: string;
  readonly venueName: string | null;
  readonly venueCity: string | null;
  readonly venueState: string | null;
}

interface CertificateRow {
  full_name: string;
  attended_at: string;
  event_slug: string;
  event_title: string;
  event_kicker: string | null;
  audience_label: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
}

/**
 * One certificate, by its token.
 *
 * `null` for every negative case — unknown token, not confirmed, not present, switch still off. The
 * routine returns zero rows for all four, so this function cannot be used to tell them apart, and
 * the page renders one sentence for all of them (section 4.3).
 *
 * The token is a capability. It is **never logged**: the failure branch records that a read failed
 * and its SQLSTATE, and nothing that would put a working link into a log aggregator.
 */
export async function getCertificate(token: string): Promise<Certificate | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 64) return null;

  const { data, error } = await secretClient().rpc('get_certificate', { p_token: token });

  if (error) {
    console.error(
      JSON.stringify({ event: 'public.certificate_rpc_failed', code: error.code ?? 'unknown' }),
    );
    return null;
  }

  const row = (Array.isArray(data) ? (data[0] as CertificateRow | undefined) : undefined) ?? null;
  if (!row) return null;

  return {
    fullName: row.full_name,
    attendedAt: row.attended_at,
    eventSlug: row.event_slug,
    eventTitle: row.event_title,
    eventKicker: row.event_kicker,
    audienceLabel: row.audience_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    venueName: row.venue_name,
    venueCity: row.venue_city,
    venueState: row.venue_state,
  };
}

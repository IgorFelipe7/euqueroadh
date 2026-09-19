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
  certificates_enabled: boolean;
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
  // Read for `/certificado`, which has to render "not yet released" without running a lookup. It is
  // a fact about the event rather than about a participant, so publishing it costs nothing.
  'certificates_enabled',
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

/* ------------------------------------------------------------------------------------------------
 * Self check-in (migration 18)
 * ---------------------------------------------------------------------------------------------- */

/**
 * The event identity a check-in page renders, resolved from the session token in the URL.
 *
 * Deliberately **not** `getActiveEventForDisplay()`: a check-in session belongs to one event, and the
 * page must render that event rather than whichever event happens to be active. It is also how the
 * page learns the session is live at all — `null` means unknown token, closed session or expired
 * session, indistinguishably, because the routine returns zero rows for all three.
 */
export interface CheckInSessionEvent {
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

interface CheckInSessionRow {
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

/** A session token is 27 characters of base64url. The bounds match the routine's own guard. */
function plausibleToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 20 && token.length <= 64;
}

/**
 * Resolves a check-in session token into the event it belongs to, or `null`.
 *
 * The token is a capability and is **never logged**: the failure branch records that a read failed
 * and its SQLSTATE, and nothing that would put a working check-in URL into a log aggregator — the
 * same rule `getCertificate` lives by.
 */
export async function getCheckInSession(token: string): Promise<CheckInSessionEvent | null> {
  if (!plausibleToken(token)) return null;

  const { data, error } = await secretClient().rpc('get_check_in_session', { p_token: token });

  if (error) {
    console.error(
      JSON.stringify({ event: 'public.check_in_session_rpc_failed', code: error.code ?? 'unknown' }),
    );
    return null;
  }

  const row = (Array.isArray(data) ? (data[0] as CheckInSessionRow | undefined) : undefined) ?? null;
  if (!row) return null;

  return {
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

/**
 * What the guest supplied. Already validated and normalized: `phoneE164` is canonical, `firstName` is
 * whatever they typed with its edges trimmed, and `age` is an integer inside the plausibility bounds.
 *
 * `firstName` and `age` are `null` until the flow has asked for them. Sending a value the guest has
 * not supplied would narrow the candidate set with an invention, which is the one way an adaptive
 * lookup can identify the wrong person.
 */
export interface CheckInCommand {
  readonly token: string;
  readonly phoneE164: string;
  readonly firstName: string | null;
  readonly age: number | null;
}

/**
 * What the database decided, translated once, here.
 *
 * `unavailable` is this layer's own word for "the database did not answer in a way I recognise", and
 * it exists so that a SQLSTATE, a PostgREST envelope or an unexpected `result` string can never leave
 * the DAL. Every other member is a state the interface has a designed screen for.
 */
export type CheckInResult =
  | 'confirmed'
  | 'already_present'
  | 'need_name'
  | 'need_age'
  | 'not_found'
  | 'session_invalid'
  | 'unavailable';

const CHECK_IN_RESULTS: readonly string[] = [
  'confirmed',
  'already_present',
  'need_name',
  'need_age',
  'not_found',
  'session_invalid',
];

/**
 * The **only** self check-in path in the application.
 *
 * There is no identification logic here and there never will be: the routine resolves the session,
 * locks the event, narrows the candidate set and writes `attended_at`, all inside one transaction.
 * Reimplementing any part of that in TypeScript would mean two answers to "who is this person", and
 * the one that mattered would be the one that could be raced.
 *
 * Turnstile has already been verified by the time this is called — never from inside the locked
 * transaction, and never after it.
 */
export async function selfCheckIn(command: CheckInCommand): Promise<CheckInResult> {
  if (!plausibleToken(command.token)) return 'session_invalid';

  const { data, error } = await secretClient().rpc('self_check_in', {
    p_token: command.token,
    p_phone_e164: command.phoneE164,
    p_first_name: command.firstName,
    p_age: command.age,
  });

  if (error) {
    console.error(
      JSON.stringify({ event: 'public.self_check_in_rpc_failed', code: error.code ?? 'unknown' }),
    );
    return 'unavailable';
  }

  const row =
    (Array.isArray(data) ? (data[0] as { result?: string } | undefined) : undefined) ?? null;
  const result = row?.result;

  if (!result || !CHECK_IN_RESULTS.includes(result)) {
    // A defect, not a guest's problem: loud in the log, generic on screen.
    console.error(
      JSON.stringify({ event: 'public.self_check_in_unexpected_result', result: result ?? null }),
    );
    return 'unavailable';
  }

  return result as CheckInResult;
}

/* ------------------------------------------------------------------------------------------------
 * The certificate portal (migration 19)
 * ---------------------------------------------------------------------------------------------- */

/**
 * Whether `/certificado` may run a lookup at all.
 *
 * Read from the event rather than inferred, and checked **before** any identity field is parsed: while
 * the switch is off the portal renders one sentence and performs no query, so the page cannot be used
 * to probe for registrations in the window between the event ending and the organizer flipping it
 * (launch brief § 14).
 */
export async function certificatesEnabled(): Promise<boolean> {
  const row = await loadActiveEvent();
  return row?.certificates_enabled === true;
}

/** What the guest supplied. `age` is `null` until the disambiguation step has asked for it. */
export interface CertificateLookupCommand {
  readonly phoneE164: string;
  readonly firstName: string;
  readonly age: number | null;
}

/**
 * What the lookup decided.
 *
 * `found` carries the **existing** certificate token, and it goes exactly one place: into the
 * `redirect()` the Server Action performs. It is never returned to the browser as data, never
 * rendered, and never logged (launch brief § 17).
 */
export type CertificateLookup =
  | { readonly result: 'found'; readonly token: string }
  | { readonly result: 'need_age' }
  | { readonly result: 'not_found' }
  | { readonly result: 'unavailable' };

/**
 * Resolves an eligible attendee to their own certificate token.
 *
 * The eligibility predicate lives in the routine and is the same one `get_certificate` applies —
 * confirmed, present on the night, switch on — so this cannot become a second, weaker way to reach a
 * certificate. It is an identification layer over the existing capability, and nothing more.
 */
export async function findCertificate(
  command: CertificateLookupCommand,
): Promise<CertificateLookup> {
  const { data, error } = await secretClient().rpc('find_certificate', {
    p_phone_e164: command.phoneE164,
    p_first_name: command.firstName,
    p_age: command.age,
  });

  if (error) {
    console.error(
      JSON.stringify({ event: 'public.find_certificate_rpc_failed', code: error.code ?? 'unknown' }),
    );
    return { result: 'unavailable' };
  }

  const row =
    (Array.isArray(data)
      ? (data[0] as { result?: string; token?: string } | undefined)
      : undefined) ?? null;

  switch (row?.result) {
    case 'found':
      // A `found` with no token is a defect in the routine, not a match. It must never become a
      // redirect to `/certificado/undefined`.
      return typeof row.token === 'string' && row.token.length >= 20
        ? { result: 'found', token: row.token }
        : unexpectedLookup(row.result);

    case 'need_age':
      return { result: 'need_age' };

    case 'not_found':
      return { result: 'not_found' };

    default:
      return unexpectedLookup(row?.result);
  }
}

function unexpectedLookup(result: string | undefined): CertificateLookup {
  console.error(
    JSON.stringify({ event: 'public.find_certificate_unexpected_result', result: result ?? null }),
  );
  return { result: 'unavailable' };
}

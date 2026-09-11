/**
 * The only sanctioned way to write an authentication or registration line to the log.
 *
 * ARCHITECTURE.md section 11: observability that collects personal data is a liability, not an
 * asset. This module exists so that "what may be logged" is a decision made once, in one file, and
 * enforced by the shape of the function rather than by everyone remembering.
 *
 * NEVER passed to it, and therefore never logged: the one-time code, a token hash, an access or
 * refresh token, an Authorization header, a cookie value, the secret key, a Turnstile token, or a
 * participant's name, age or phone number. An administrator's address is reduced to its domain —
 * enough to diagnose "the whole ministry's mail server is bouncing", useless for building a list of
 * who is an administrator.
 *
 * The enforcement is structural: each log function accepts one closed `interface`, and none of
 * those interfaces has a field a personal value could be assigned to. Adding one is the review
 * failure, not passing one.
 */
import 'server-only';

/** The closed set of authentication events worth a log line. */
export type AuthEvent =
  | 'auth.otp_requested'
  | 'auth.otp_verified'
  | 'auth.link_verified'
  | 'auth.signed_out'
  | 'auth.session_rejected';

/**
 * Why the event ended the way it did. These are *operational* categories, and several of them
 * deliberately map to the same thing on screen: `unknown_address` and `sent` are one outward state
 * (DATABASE-SECURITY.md section 7.1.1), and the distinction survives only here.
 */
export type AuthOutcome =
  | 'sent'
  | 'unknown_address'
  | 'rejected_by_provider'
  | 'signed_in'
  | 'invalid_code'
  | 'not_admin'
  | 'inactive_admin'
  | 'anonymous'
  | 'lookup_failed'
  | 'provider_unavailable'
  | 'ok';

export interface AuthLogFields {
  readonly event: AuthEvent;
  readonly outcome: AuthOutcome;
  /** Present only when the visitor is shown a correlation code. */
  readonly correlationId?: string;
  /** The domain part of an address, never the whole address. Use `emailDomain()`. */
  readonly emailDomain?: string;
  /** Supabase's own error code — a machine token such as `otp_disabled`, never a message. */
  readonly providerCode?: string;
  readonly providerStatus?: number;
  readonly durationMs?: number;
}

/** `igor@exemplo.com` becomes `exemplo.com`. A malformed address yields `desconhecido`. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at > 0 && at < email.length - 1 ? email.slice(at + 1).toLowerCase() : 'desconhecido';
}

const CORRELATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A short code shown to the person and written to the log, so a support conversation can be
 * "erro ABC123" instead of a screenshot containing someone's data. Ambiguous glyphs (I, O, 0, 1)
 * are omitted because this gets read aloud over the phone.
 */
export function newCorrelationId(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) id += CORRELATION_ALPHABET[byte % CORRELATION_ALPHABET.length];
  return id;
}

/**
 * One structured line per authentication event. `console` is the transport because Vercel's runtime
 * logs are the destination (ARCHITECTURE.md section 11) — no logging dependency earns its place for
 * a handful of lines.
 */
export function logAuthEvent(fields: AuthLogFields): void {
  const line = JSON.stringify({ ...fields, at: new Date().toISOString() });
  if (fields.outcome === 'provider_unavailable' || fields.outcome === 'lookup_failed') {
    console.error(line);
  } else {
    console.info(line);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Registration — the public write path
 * ---------------------------------------------------------------------------------------------- */

/**
 * The closed set of public-registration events. Operational categories only: one line per
 * submission says what the system decided, never who it decided it about.
 */
export type RegistrationEvent =
  | 'registration.validation_failed'
  | 'registration.turnstile_failed'
  | 'registration.confirmed'
  | 'registration.waitlisted'
  | 'registration.duplicate'
  | 'registration.full'
  | 'registration.closed'
  | 'registration.infrastructure_error';

/**
 * Every field here is an identifier, a machine code or a measurement.
 *
 * There is deliberately **no** field for a name, an age or a phone number, and `fields` carries
 * field *names* (`['phone']`), never their values — the same rule `admin_actions.metadata` lives by
 * (DATABASE-SECURITY.md section 6.3). `registrationId` and `eventId` are opaque database keys: they
 * are what lets an organizer's "erro ABC123" be found, and they identify a row rather than a person.
 */
export interface RegistrationLogFields {
  readonly event: RegistrationEvent;
  readonly eventId?: string;
  readonly registrationId?: string;
  readonly durationMs?: number;
  /** Present only when the visitor is shown a correlation code. */
  readonly correlationId?: string;
  /** Which fields failed validation — names only. */
  readonly fields?: readonly string[];
  /** Cloudflare's own machine codes, such as `timeout-or-duplicate`. Never the token. */
  readonly turnstileCodes?: readonly string[];
}

/** One structured line per submission. `console` is the transport; Vercel's runtime log is the sink. */
export function logRegistrationEvent(fields: RegistrationLogFields): void {
  const line = JSON.stringify({ ...fields, at: new Date().toISOString() });

  if (fields.event === 'registration.infrastructure_error') {
    console.error(line);
  } else {
    console.info(line);
  }
}

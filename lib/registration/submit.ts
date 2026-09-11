/**
 * The authoritative public-registration path.
 *
 * Everything the browser sent is untrusted here — not merely the values, but the fact that a
 * browser was involved at all. A Server Action is a POST endpoint reachable by anyone who can send
 * the same request, so this module re-parses, re-normalizes and re-verifies from scratch and
 * ignores whatever the client computed. Client-side validation is a courtesy; this is the boundary.
 *
 * **The order is load-bearing** (DATABASE-SECURITY.md section 9.1):
 *
 *   1. read the three fields, and nothing else, out of the FormData;
 *   2. parse and normalize them — the Phase 1 schemas, the single implementation;
 *   3. require a Turnstile token to be present at all;
 *   4. verify it with Cloudflare, server-side, and **fail closed**;
 *   5. only then resolve the active event and call `register_for_event`;
 *   6. map the database's answer to an outcome the page can render.
 *
 * Steps 3 and 4 never happen after step 5, and a failure in either returns before the database is
 * touched. Never move the verification inside the allocation: the RPC holds a row lock, and a
 * network call inside a locked transaction is how a two-hour event becomes a five-minute outage.
 *
 * **Why dependencies are injected.** Everything with a side effect — Cloudflare, the database, the
 * cache, the log, the clock — arrives as a parameter. That is what lets the whole pipeline be
 * asserted in unit tests without a network, and what makes "a rejected token must not reach the
 * database" a test rather than a comment.
 */
import 'server-only';

import type {
  ActiveEventContext,
  RegistrationAllocation,
  RegistrationCommand,
} from '@/lib/data/public';
import { FORM_ERROR_MESSAGES, type PublicEventState } from '@/lib/domain/outcomes';
import { fieldErrors, registrationInputSchema } from '@/lib/domain/schemas';
import type { RegistrationLogFields } from '@/lib/observability/log';
import type { TurnstileVerification } from '@/lib/turnstile/verify';

import {
  EMPTY_VALUES,
  REGISTRATION_FIELDS,
  TURNSTILE_FIELD_NAME,
  type RegistrationField,
  type RegistrationFormState,
} from './state';

export interface SubmitDependencies {
  readonly verifyToken: (token: string, remoteIp: string | null) => Promise<TurnstileVerification>;
  /** The visitor's address for Cloudflare, read from the platform header. Best-effort. */
  readonly remoteIp: () => Promise<string | null>;
  /** Resolved server-side. The browser never says which event it is registering for. */
  readonly readEventContext: () => Promise<ActiveEventContext | null>;
  /** The state *after* the write, read fresh, to decide whether the cached page is now wrong. */
  readonly readCurrentState: () => Promise<PublicEventState | null>;
  readonly register: (command: RegistrationCommand) => Promise<RegistrationAllocation>;
  readonly revalidate: (path: string) => void;
  readonly log: (fields: RegistrationLogFields) => void;
  readonly newCorrelationId: () => string;
  readonly now: () => number;
}

/** The one path whose advisory state a registration can change. */
const PUBLIC_PATH = '/';

export async function submitRegistration(
  deps: SubmitDependencies,
  previous: RegistrationFormState,
  formData: FormData,
): Promise<RegistrationFormState> {
  const startedAt = deps.now();

  // Exactly three fields are read. A payload carrying `event_id`, `status` or anything else is not
  // rejected — it is simply never looked at, which is the same thing and does not tell a prober
  // which extra names were interesting.
  const values = readValues(formData);
  const token = stringField(formData, TURNSTILE_FIELD_NAME);

  /* 1–2. Authoritative validation. ------------------------------------------------------------ */

  const parsed = registrationInputSchema.safeParse(values);

  if (!parsed.success) {
    const errors = fieldErrors(parsed.error) as Partial<Record<RegistrationField, string>>;
    deps.log({
      event: 'registration.validation_failed',
      fields: Object.keys(errors),
      durationMs: deps.now() - startedAt,
    });

    // The token is untouched — no verification was attempted, so it is still good for the retry.
    return editing(previous, { values, fieldErrors: errors });
  }

  /* 3. A token must be present. No token, no network call, no database. ----------------------- */

  if (token.length === 0) {
    deps.log({ event: 'registration.turnstile_failed', durationMs: deps.now() - startedAt });
    return refuseChallenge(previous, values, FORM_ERROR_MESSAGES.antiAbuse, null);
  }

  /* 4. Cloudflare decides, server-side, before anything is allocated. -------------------------- */

  const verification = await deps.verifyToken(token, await deps.remoteIp());

  if (!verification.ok) {
    // Either way the submission is refused: this never fails open. The distinction only changes
    // which sentence the person reads and whether a code is offered for support.
    const correlationId = verification.reason === 'unavailable' ? deps.newCorrelationId() : null;

    deps.log({
      event: 'registration.turnstile_failed',
      correlationId: correlationId ?? undefined,
      durationMs: deps.now() - startedAt,
    });

    return refuseChallenge(
      previous,
      values,
      verification.reason === 'rejected' ? FORM_ERROR_MESSAGES.antiAbuse : FORM_ERROR_MESSAGES.server,
      correlationId,
    );
  }

  /* 5. The event is resolved here, never taken from the request. ------------------------------ */

  const event = await deps.readEventContext();

  if (!event) {
    return infrastructureFailure(deps, previous, values, startedAt);
  }

  const allocation = await deps.register({
    eventId: event.id,
    fullName: parsed.data.name,
    age: parsed.data.age,
    phoneE164: parsed.data.phone,
  });

  if (allocation.outcome === 'unavailable') {
    return infrastructureFailure(deps, previous, values, startedAt, event.id);
  }

  /* 6. A recognised database outcome. ---------------------------------------------------------- */

  deps.log({
    event: LOG_EVENT_BY_OUTCOME[allocation.outcome],
    eventId: event.id,
    registrationId:
      allocation.outcome === 'confirmed' || allocation.outcome === 'waitlisted'
        ? allocation.registrationId
        : undefined,
    durationMs: deps.now() - startedAt,
  });

  await revalidateIfStateChanged(deps, event.state, allocation);

  return {
    outcome:
      allocation.outcome === 'already_registered'
        ? { kind: 'already_registered', status: allocation.status }
        : { kind: allocation.outcome },
    fieldErrors: {},
    formError: null,
    correlationId: null,
    // The form has been replaced by the outcome panel, so there is nothing left to preserve.
    values: EMPTY_VALUES,
    challengeNonce: previous.challengeNonce,
  };
}

const LOG_EVENT_BY_OUTCOME = {
  confirmed: 'registration.confirmed',
  waitlisted: 'registration.waitlisted',
  already_registered: 'registration.duplicate',
  full: 'registration.full',
  closed: 'registration.closed',
} as const satisfies Record<string, RegistrationLogFields['event']>;

/**
 * The public page is served from a 60-second cache, so the banner it shows can lag behind the
 * event. This puts it right the moment **this registration** is what moved it — the one that took
 * the last seat, or the one that emptied it again (ARCHITECTURE.md section 4).
 *
 * The comparison is between the state immediately before the allocation and the state immediately
 * after, both read here: that is precisely "did this submission change what the page should say".
 * A registration that changes nothing revalidates nothing, which is what keeps the cache worth
 * having, and `already_registered` never reaches this function at all because it writes no row.
 *
 * A change made *outside* the application — an administrator editing settings — is not visible to
 * this comparison and is not meant to be: that path revalidates from the settings RPC's own caller
 * (Phase 6). The 60-second window is the backstop for anything neither of them catches, and the
 * database remains the authority in every case.
 */
async function revalidateIfStateChanged(
  deps: SubmitDependencies,
  before: PublicEventState,
  allocation: RegistrationAllocation,
): Promise<void> {
  if (allocation.outcome === 'already_registered') return;

  const after = await deps.readCurrentState();
  if (after !== null && after !== before) deps.revalidate(PUBLIC_PATH);
}

function readValues(formData: FormData): Record<RegistrationField, string> {
  return Object.fromEntries(
    REGISTRATION_FIELDS.map((field) => [field, stringField(formData, field)]),
  ) as Record<RegistrationField, string>;
}

/** A `File` entry, a missing entry and a repeated entry all reduce to a string or to nothing. */
function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** The form stays editable and keeps what the person typed. */
function editing(
  previous: RegistrationFormState,
  patch: {
    values: Record<RegistrationField, string>;
    fieldErrors?: Partial<Record<RegistrationField, string>>;
    formError?: string | null;
    correlationId?: string | null;
    challengeNonce?: number;
  },
): RegistrationFormState {
  return {
    outcome: null,
    fieldErrors: patch.fieldErrors ?? {},
    formError: patch.formError ?? null,
    correlationId: patch.correlationId ?? null,
    values: patch.values,
    challengeNonce: patch.challengeNonce ?? previous.challengeNonce,
  };
}

/**
 * A token that was missing, refused or could not be checked cannot be used again, so the widget is
 * reset and the next attempt carries a fresh one. Reusing a spent token would come back
 * `timeout-or-duplicate` and look, to the person, like the same failure twice.
 */
function refuseChallenge(
  previous: RegistrationFormState,
  values: Record<RegistrationField, string>,
  message: string,
  correlationId: string | null,
): RegistrationFormState {
  return editing(previous, {
    values,
    formError: message,
    correlationId,
    challengeNonce: previous.challengeNonce + 1,
  });
}

/**
 * Our fault, or the database's. The person gets one plain sentence and a short code; the log gets
 * the same code and nothing about them.
 *
 * The challenge is reset here too: the token was spent verifying a submission that then failed, so
 * a retry needs a new one.
 */
function infrastructureFailure(
  deps: SubmitDependencies,
  previous: RegistrationFormState,
  values: Record<RegistrationField, string>,
  startedAt: number,
  eventId?: string,
): RegistrationFormState {
  const correlationId = deps.newCorrelationId();

  deps.log({
    event: 'registration.infrastructure_error',
    eventId,
    correlationId,
    durationMs: deps.now() - startedAt,
  });

  return refuseChallenge(previous, values, FORM_ERROR_MESSAGES.server, correlationId);
}

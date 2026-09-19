/**
 * The authoritative public self check-in path.
 *
 * Everything the browser sent is untrusted here — not merely the values, but the fact that a browser
 * was involved at all. A Server Action is a POST endpoint reachable by anyone who can send the same
 * request, so this module re-parses, re-normalizes and re-verifies from scratch and ignores whatever
 * the client computed.
 *
 * **The order is load-bearing**, and it is the registration path's order for the same reasons
 * (DATABASE-SECURITY.md § 9.1):
 *
 *   1. read the session token and the three identity fields, and nothing else, out of the FormData;
 *   2. parse and normalize them — the Phase 1 schemas, the single implementation;
 *   3. require a Turnstile token to be present at all;
 *   4. verify it with Cloudflare, server-side, and **fail closed**;
 *   5. only then call `self_check_in`, which resolves the session, locks the event, identifies the
 *      guest and writes `attended_at`, all in one transaction;
 *   6. map the database's answer to a step or an outcome the page can render.
 *
 * Steps 3 and 4 never happen after step 5, and a failure in either returns before the database is
 * touched. Never move the verification inside the RPC: it holds a row lock, and a network call inside
 * a locked transaction is how a two-hour event becomes a five-minute outage.
 *
 * ## The two things this file must never learn how to do
 *
 * **It does not identify anybody.** There is no candidate list here, no name comparison, no count.
 * The RPC answers `confirmed`, `already_present`, `need_name`, `need_age`, `not_found` or
 * `session_invalid`, and this module's entire contribution is to choose which screen that is. A
 * second implementation of "who is this person" in TypeScript would be the one that could be raced.
 *
 * **It does not widen what the browser is told.** `not_found` and `session_invalid` are the only
 * unsuccessful answers, and each maps to exactly one designed screen. Nothing here may add a reason.
 *
 * **Why dependencies are injected.** Everything with a side effect — Cloudflare, the database, the
 * log, the clock — arrives as a parameter, which is what lets the whole pipeline be asserted without
 * a network, and what makes "a rejected token must not reach the database" a test rather than a
 * comment.
 */
import 'server-only';

import type { CheckInCommand, CheckInResult } from '@/lib/data/public';
import { FORM_ERROR_MESSAGES } from '@/lib/domain/outcomes';
import { checkInInputSchema, fieldErrors } from '@/lib/domain/schemas';
import type { GuestLogFields } from '@/lib/observability/log';
import type { TurnstileVerification } from '@/lib/turnstile/verify';

import {
  CHECK_IN_FIELDS,
  EMPTY_VALUES,
  SESSION_FIELD_NAME,
  TURNSTILE_FIELD_NAME,
  type CheckInField,
  type CheckInFormState,
  type CheckInStep,
} from './state';

export interface CheckInDependencies {
  readonly verifyToken: (token: string, remoteIp: string | null) => Promise<TurnstileVerification>;
  /** The visitor's address for Cloudflare, read from the platform header. Best-effort. */
  readonly remoteIp: () => Promise<string | null>;
  readonly checkIn: (command: CheckInCommand) => Promise<CheckInResult>;
  readonly log: (fields: GuestLogFields) => void;
  readonly newCorrelationId: () => string;
  readonly now: () => number;
}

/**
 * Which step each field belongs to.
 *
 * Used **only** to put a validation message back on the screen that field lives on. The step a guest
 * is actually on is decided by the database's answer, never by anything the browser posts: a client
 * that sends all three fields at once is still answered from the first one that resolves, and a
 * client that sends a `step` of its own would find nobody reading it.
 */
const STEP_OF_FIELD: Readonly<Record<CheckInField, CheckInStep>> = {
  phone: 'phone',
  firstName: 'firstName',
  age: 'age',
};

/** The order the flow asks in, which is also the order a multi-field failure is reported in. */
const STEP_ORDER: readonly CheckInStep[] = ['phone', 'firstName', 'age'];

export async function submitCheckIn(
  deps: CheckInDependencies,
  previous: CheckInFormState,
  formData: FormData,
): Promise<CheckInFormState> {
  const startedAt = deps.now();

  const values = readValues(formData);
  const session = stringField(formData, SESSION_FIELD_NAME);
  const token = stringField(formData, TURNSTILE_FIELD_NAME);

  /* 1–2. Authoritative validation. ------------------------------------------------------------ */

  const parsed = checkInInputSchema.safeParse(values);

  if (!parsed.success) {
    const errors = fieldErrors(parsed.error) as Partial<Record<CheckInField, string>>;

    deps.log({
      event: 'checkin.validation_failed',
      fields: Object.keys(errors),
      durationMs: deps.now() - startedAt,
    });

    // The token is untouched — no verification was attempted, so it is still good for the retry.
    return {
      ...previous,
      step: earliestFailingStep(errors, previous.step),
      outcome: null,
      fieldErrors: errors,
      formError: null,
      correlationId: null,
      values,
    };
  }

  /* 3. A token must be present. No token, no network call, no database. ----------------------- */

  if (token.length === 0) {
    deps.log({ event: 'checkin.turnstile_failed', durationMs: deps.now() - startedAt });
    return refuse(previous, values, FORM_ERROR_MESSAGES.antiAbuse, null);
  }

  /* 4. Cloudflare decides, server-side, before any attendance is written. --------------------- */

  const verification = await deps.verifyToken(token, await deps.remoteIp());

  if (!verification.ok) {
    // Either way the attempt is refused: this never fails open. The distinction only changes which
    // sentence the person reads and whether a code is offered for support.
    const correlationId = verification.reason === 'unavailable' ? deps.newCorrelationId() : null;

    deps.log({
      event: 'checkin.turnstile_failed',
      correlationId: correlationId ?? undefined,
      durationMs: deps.now() - startedAt,
    });

    return refuse(
      previous,
      values,
      verification.reason === 'rejected' ? FORM_ERROR_MESSAGES.antiAbuse : FORM_ERROR_MESSAGES.server,
      correlationId,
    );
  }

  /* 5. The database identifies the guest and records the arrival. ----------------------------- */

  const result = await deps.checkIn({
    token: session,
    phoneE164: parsed.data.phone,
    firstName: parsed.data.firstName,
    age: parsed.data.age,
  });

  if (result === 'unavailable') {
    const correlationId = deps.newCorrelationId();

    deps.log({
      event: 'checkin.infrastructure_error',
      correlationId,
      durationMs: deps.now() - startedAt,
    });

    return refuse(previous, values, FORM_ERROR_MESSAGES.server, correlationId);
  }

  /* 6. A recognised answer. ------------------------------------------------------------------- */

  deps.log({ event: LOG_EVENT_BY_RESULT[result], durationMs: deps.now() - startedAt });

  // Every path below consumed a Turnstile token, so every path resets the widget. Unlike
  // registration, success is not the end of the flow here — the next person on the same telephone
  // submits again — and a spent token would come back `timeout-or-duplicate`.
  const challengeNonce = previous.challengeNonce + 1;

  switch (result) {
    case 'need_name':
      return {
        step: 'firstName',
        outcome: null,
        fieldErrors: {},
        formError: null,
        correlationId: null,
        // The telephone number is kept and the later fields are not invented. `age` is cleared in
        // case a previous attempt on this device left one behind: carrying it forward would narrow
        // the next lookup by a value this guest never supplied.
        values: { ...values, age: '' },
        challengeNonce,
      };

    case 'need_age':
      return {
        step: 'age',
        outcome: null,
        fieldErrors: {},
        formError: null,
        correlationId: null,
        values,
        challengeNonce,
      };

    case 'confirmed':
    case 'already_present':
      return {
        step: 'phone',
        outcome: result,
        fieldErrors: {},
        formError: null,
        correlationId: null,
        // The panel has replaced the fieldset. The phone is deliberately kept so the household loop
        // can return to the name step without the next person retyping the number they are holding.
        values: { ...EMPTY_VALUES, phone: values.phone },
        challengeNonce,
      };

    case 'not_found':
      return {
        step: 'phone',
        outcome: 'manual',
        fieldErrors: {},
        formError: null,
        correlationId: null,
        values: EMPTY_VALUES,
        challengeNonce,
      };

    case 'session_invalid':
      return {
        step: 'phone',
        outcome: 'session_closed',
        fieldErrors: {},
        formError: null,
        correlationId: null,
        values: EMPTY_VALUES,
        challengeNonce,
      };
  }
}

const LOG_EVENT_BY_RESULT = {
  confirmed: 'checkin.confirmed',
  already_present: 'checkin.already_present',
  // Both narrowing answers share one log event. See `GuestEvent` for why.
  need_name: 'checkin.needs_identification',
  need_age: 'checkin.needs_identification',
  not_found: 'checkin.not_identified',
  session_invalid: 'checkin.session_invalid',
} as const satisfies Record<Exclude<CheckInResult, 'unavailable'>, GuestLogFields['event']>;

function readValues(formData: FormData): Record<CheckInField, string> {
  return Object.fromEntries(
    CHECK_IN_FIELDS.map((field) => [field, stringField(formData, field)]),
  ) as Record<CheckInField, string>;
}

/** A `File` entry, a missing entry and a repeated entry all reduce to a string or to nothing. */
function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** The earliest step carrying a message, so the person is shown the first thing to fix. */
function earliestFailingStep(
  errors: Partial<Record<CheckInField, string>>,
  fallback: CheckInStep,
): CheckInStep {
  const failing = CHECK_IN_FIELDS.filter((field) => errors[field]).map(
    (field) => STEP_OF_FIELD[field],
  );

  if (failing.length === 0) return fallback;

  return STEP_ORDER.find((step) => failing.includes(step)) ?? fallback;
}

/**
 * A token that was missing, refused or could not be checked cannot be used again, so the widget is
 * reset and the next attempt carries a fresh one.
 *
 * The step is **not** advanced or rewound: the person is where they were, with what they typed, and
 * one sentence explaining why nothing happened.
 */
function refuse(
  previous: CheckInFormState,
  values: Record<CheckInField, string>,
  message: string,
  correlationId: string | null,
): CheckInFormState {
  return {
    step: previous.step,
    outcome: null,
    fieldErrors: {},
    formError: message,
    correlationId,
    values,
    challengeNonce: previous.challengeNonce + 1,
  };
}

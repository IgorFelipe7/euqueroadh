/**
 * The authoritative certificate-lookup path.
 *
 * The same order, and the same reasons, as registration and self check-in
 * (DATABASE-SECURITY.md § 9.1):
 *
 *   1. read the three fields, and nothing else, out of the FormData;
 *   2. parse and normalize them — the Phase 1 schemas, the single implementation;
 *   3. refuse before anything else if `certificates_enabled` is off;
 *   4. require a Turnstile token to be present, then verify it server-side and **fail closed**;
 *   5. only then call `find_certificate`;
 *   6. on a match, **redirect** to the existing capability route; on anything else, one sentence.
 *
 * ## Step 3 is not an optimisation
 *
 * The switch is checked before the identity fields reach the database, so the window between the
 * event ending and the organizer releasing certificates is not a window in which this endpoint can be
 * probed for who registered. The routine applies the same condition itself, as the backstop — but the
 * page and this pipeline both refuse first, so no lookup is even attempted (launch brief § 14).
 *
 * ## Step 6 is where the security of the whole feature sits
 *
 * A match produces a `redirect()`, never a return value. The token therefore travels in a `Location`
 * header, is followed by the browser, and is authorized on arrival by `get_certificate` — the same
 * unguessable capability the admin's copy-link has always handed out. Returning it as part of the
 * action's state would put it in the RSC payload, in the browser's memory, and in anything that
 * serialises form state, and would make this a *second* way to reach a certificate rather than an
 * identification layer over the only one.
 *
 * `redirect` is injected for exactly one reason: `next/navigation`'s version works by throwing, and a
 * test asserting "a non-attendee must not be redirected anywhere" should assert on a call, not catch a
 * framework control-flow exception.
 */
import 'server-only';

import type { CertificateLookup, CertificateLookupCommand } from '@/lib/data/public';
import { FORM_ERROR_MESSAGES } from '@/lib/domain/outcomes';
import { certificateLookupSchema, fieldErrors } from '@/lib/domain/schemas';
import type { GuestLogFields } from '@/lib/observability/log';
import type { TurnstileVerification } from '@/lib/turnstile/verify';

import {
  CERTIFICATE_FIELDS,
  TURNSTILE_FIELD_NAME,
  type CertificateField,
  type CertificateFormState,
} from './state';

export interface CertificateDependencies {
  readonly verifyToken: (token: string, remoteIp: string | null) => Promise<TurnstileVerification>;
  readonly remoteIp: () => Promise<string | null>;
  /** The master switch, read from the event. Checked before any identity field reaches the database. */
  readonly certificatesEnabled: () => Promise<boolean>;
  readonly find: (command: CertificateLookupCommand) => Promise<CertificateLookup>;
  /** Never returns. `next/navigation`'s `redirect` throws; the test double records and throws too. */
  readonly redirect: (path: string) => never;
  /** Builds `/certificado/<token>`. Injected so the token has exactly one route to a URL. */
  readonly certificatePath: (token: string) => string;
  readonly log: (fields: GuestLogFields) => void;
  readonly newCorrelationId: () => string;
  readonly now: () => number;
}

const STEP_OF_FIELD: Readonly<Record<CertificateField, CertificateFormState['step']>> = {
  phone: 'identify',
  firstName: 'identify',
  age: 'age',
};

export async function submitCertificateLookup(
  deps: CertificateDependencies,
  previous: CertificateFormState,
  formData: FormData,
): Promise<CertificateFormState> {
  const startedAt = deps.now();

  const values = readValues(formData);
  const token = stringField(formData, TURNSTILE_FIELD_NAME);

  /* 1–2. Authoritative validation. ------------------------------------------------------------ */

  const parsed = certificateLookupSchema.safeParse(values);

  if (!parsed.success) {
    const errors = fieldErrors(parsed.error) as Partial<Record<CertificateField, string>>;

    deps.log({
      event: 'certificate.validation_failed',
      fields: Object.keys(errors),
      durationMs: deps.now() - startedAt,
    });

    // The token is untouched — no verification was attempted, so it is still good for the retry.
    return {
      ...previous,
      step: stepFor(errors, previous.step),
      notFound: false,
      fieldErrors: errors,
      formError: null,
      correlationId: null,
      values,
    };
  }

  /* 3. The gate, before the database sees an identity. ----------------------------------------- */

  if (!(await deps.certificatesEnabled())) {
    deps.log({ event: 'certificate.disabled', durationMs: deps.now() - startedAt });

    // The same generic sentence as a failed match. A visitor who submits the form on a page that says
    // certificates are not released yet is told nothing more than that, and certainly not whether the
    // number they typed belongs to anybody.
    return notFound(previous, values);
  }

  /* 4. Cloudflare decides, server-side, before any lookup. ------------------------------------- */

  if (token.length === 0) {
    deps.log({ event: 'certificate.turnstile_failed', durationMs: deps.now() - startedAt });
    return refuse(previous, values, FORM_ERROR_MESSAGES.antiAbuse, null);
  }

  const verification = await deps.verifyToken(token, await deps.remoteIp());

  if (!verification.ok) {
    const correlationId = verification.reason === 'unavailable' ? deps.newCorrelationId() : null;

    deps.log({
      event: 'certificate.turnstile_failed',
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

  /* 5. The lookup. ---------------------------------------------------------------------------- */

  const lookup = await deps.find({
    phoneE164: parsed.data.phone,
    firstName: parsed.data.firstName,
    age: parsed.data.age,
  });

  /* 6. One of three answers. ------------------------------------------------------------------ */

  switch (lookup.result) {
    case 'found': {
      deps.log({ event: 'certificate.found', durationMs: deps.now() - startedAt });
      // Never logged, never returned, never rendered: straight into the `Location` header.
      return deps.redirect(deps.certificatePath(lookup.token));
    }

    case 'need_age':
      deps.log({ event: 'certificate.needs_age', durationMs: deps.now() - startedAt });
      return {
        step: 'age',
        notFound: false,
        fieldErrors: {},
        formError: null,
        correlationId: null,
        values,
        // The token was spent on this attempt, so the next one needs a fresh widget.
        challengeNonce: previous.challengeNonce + 1,
      };

    case 'not_found':
      deps.log({ event: 'certificate.not_found', durationMs: deps.now() - startedAt });
      return notFound(previous, values);

    case 'unavailable': {
      const correlationId = deps.newCorrelationId();

      deps.log({
        event: 'certificate.infrastructure_error',
        correlationId,
        durationMs: deps.now() - startedAt,
      });

      return refuse(previous, values, FORM_ERROR_MESSAGES.server, correlationId);
    }
  }
}

function readValues(formData: FormData): Record<CertificateField, string> {
  return Object.fromEntries(
    CERTIFICATE_FIELDS.map((field) => [field, stringField(formData, field)]),
  ) as Record<CertificateField, string>;
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** A validation message belongs on the step its field lives on; `identify` wins over `age`. */
function stepFor(
  errors: Partial<Record<CertificateField, string>>,
  fallback: CertificateFormState['step'],
): CertificateFormState['step'] {
  const failing = CERTIFICATE_FIELDS.filter((field) => errors[field]).map(
    (field) => STEP_OF_FIELD[field],
  );

  if (failing.includes('identify')) return 'identify';
  if (failing.includes('age')) return 'age';
  return fallback;
}

/**
 * Nothing matched.
 *
 * The flow returns to `identify` with what was typed intact, because the likely cause is a typo the
 * person can see and fix. The age is cleared: it was asked for to break an ambiguity that did not
 * resolve, and carrying it into the next attempt would narrow that attempt by a guess.
 */
function notFound(
  previous: CertificateFormState,
  values: Record<CertificateField, string>,
): CertificateFormState {
  return {
    step: 'identify',
    notFound: true,
    fieldErrors: {},
    formError: null,
    correlationId: null,
    values: { ...values, age: '' },
    challengeNonce: previous.challengeNonce + 1,
  };
}

/**
 * A token that was missing, refused or could not be checked cannot be used again, so the widget is
 * reset. The step is not moved: the person is where they were, with what they typed.
 */
function refuse(
  previous: CertificateFormState,
  values: Record<CertificateField, string>,
  message: string,
  correlationId: string | null,
): CertificateFormState {
  return {
    step: previous.step,
    notFound: false,
    fieldErrors: {},
    formError: message,
    correlationId,
    values,
    challengeNonce: previous.challengeNonce + 1,
  };
}

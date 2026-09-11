/**
 * Cloudflare Turnstile server-side verification — DATABASE-SECURITY.md section 9.1.
 *
 * The whole anti-abuse guarantee of the public write endpoint rests on this module, so it is
 * deliberately small and has exactly one job: turn a token the browser handed us into `ok` or
 * `not ok`, without letting anything from Cloudflare — the token, the raw response, the secret —
 * travel any further.
 *
 * Three rules that are not negotiable:
 *
 *   * **Never fail open.** If verification cannot be *completed*, the registration is refused. An
 *     open failure mode turns a protected endpoint into an unauthenticated public write endpoint,
 *     which is the one thing Turnstile exists to prevent here.
 *   * **The token is never logged, stored or returned.** It is a bearer credential for one
 *     submission. Cloudflare's own machine error codes are logged instead — they name the fault
 *     without naming the person.
 *   * **`TURNSTILE_SECRET_KEY` stays server-side.** `import 'server-only'` makes importing this
 *     module from a Client Component a build error, and the secret is sent in the POST body, never
 *     in a URL that could reach a log or a `Referer` header.
 *
 * Verified against Cloudflare's current documentation (2026-09-11): the endpoint, the parameter
 * names, the response fields, the complete error-code list, the 300-second token lifetime, the
 * single-use rule and the 2048-character cap are all as used below.
 */
import 'server-only';

import { server as serverEnv } from '@/lib/env';
import { logRegistrationEvent } from '@/lib/observability/log';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare rejects anything longer, so spending a round trip on it would be pure waste. */
const MAX_TOKEN_LENGTH = 2048;

/**
 * Long enough for a healthy round trip to Cloudflare and short enough that a hung connection does
 * not hold a participant on a spinner. A timeout is treated as "unavailable", never as "valid".
 */
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * `rejected` — the challenge was not passed, or the token was expired, malformed or already spent.
 * The person sees the retry message and the widget is reset.
 *
 * `unavailable` — the verification could not be completed at all: Cloudflare was unreachable,
 * answered with an internal error, or our own configuration is wrong. The person sees the generic
 * server message. **Both refuse the registration**; the distinction exists so the copy can be
 * honest and so a configuration fault is loud in the log instead of looking like bot traffic.
 */
export type TurnstileFailure = 'rejected' | 'unavailable';

export type TurnstileVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: TurnstileFailure };

export interface TurnstileDependencies {
  readonly fetchImpl: typeof fetch;
  /** Read lazily so that importing this module never requires the secret to be present. */
  readonly secret: () => string;
  readonly newIdempotencyKey: () => string;
  readonly timeoutMs: number;
}

export interface VerifyOptions {
  /** The visitor's address, from the platform header. Optional — Cloudflare treats it as a hint. */
  readonly remoteIp?: string | null;
  readonly dependencies?: Partial<TurnstileDependencies>;
}

const DEFAULT_DEPENDENCIES: TurnstileDependencies = {
  fetchImpl: (...args) => fetch(...args),
  secret: () => serverEnv.TURNSTILE_SECRET_KEY,
  newIdempotencyKey: () => crypto.randomUUID(),
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

/**
 * How each documented error code is classified. Anything absent from this table — a new code, a
 * typo, an empty array — is treated as `unavailable`, because "we do not recognise this answer" is
 * a reason to refuse, never a reason to allow.
 */
const REJECTING_CODES: ReadonlySet<string> = new Set([
  'missing-input-response',
  'invalid-input-response',
  'timeout-or-duplicate',
  'bad-request',
]);

/** Our own configuration is wrong. Loud in the log, generic on screen, and still fails closed. */
const CONFIGURATION_CODES: ReadonlySet<string> = new Set([
  'missing-input-secret',
  'invalid-input-secret',
]);

/** Worth exactly one retry with the same idempotency key. */
const RETRYABLE_CODE = 'internal-error';

type Attempt =
  | { readonly kind: 'success' }
  | { readonly kind: 'rejected'; readonly codes: readonly string[] }
  | { readonly kind: 'misconfigured'; readonly codes: readonly string[] }
  | { readonly kind: 'unavailable'; readonly codes: readonly string[] };

/**
 * Verifies one token. Returns a small internal result and nothing that came off the wire.
 *
 * The call is never cached and never retried after a *decision*: a token is single-use, so a second
 * verification of a token Cloudflare has already accepted would come back `timeout-or-duplicate`.
 * Only an incomplete attempt is retried, and it reuses the same `idempotency_key` so Cloudflare can
 * answer the repeat safely.
 */
export async function verifyTurnstileToken(
  token: string,
  options: VerifyOptions = {},
): Promise<TurnstileVerification> {
  const deps: TurnstileDependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };

  // A missing or absurd token is decided locally: there is nothing for Cloudflare to tell us, and
  // an unauthenticated visitor should not be able to make us issue an outbound request per keypress.
  if (token.length === 0) {
    return failure('rejected', ['missing-input-response']);
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    return failure('rejected', ['invalid-input-response']);
  }

  const idempotencyKey = deps.newIdempotencyKey();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await callSiteverify(token, idempotencyKey, options.remoteIp ?? null, deps);

    if (result.kind === 'success') return { ok: true };
    if (result.kind === 'rejected') return failure('rejected', result.codes);

    if (result.kind === 'misconfigured') {
      // Not bot traffic: a deployment problem. It must not be buried among ordinary rejections.
      console.error(
        JSON.stringify({
          event: 'registration.turnstile_misconfigured',
          turnstileCodes: result.codes,
          at: new Date().toISOString(),
        }),
      );
      return failure('unavailable', result.codes);
    }

    if (attempt === 2) return failure('unavailable', result.codes);
  }

  /* c8 ignore next -- unreachable: the loop either returns or exhausts both attempts above. */
  return failure('unavailable', []);
}

function failure(reason: TurnstileFailure, codes: readonly string[]): TurnstileVerification {
  logRegistrationEvent({ event: 'registration.turnstile_failed', turnstileCodes: codes });
  return { ok: false, reason };
}

async function callSiteverify(
  token: string,
  idempotencyKey: string,
  remoteIp: string | null,
  deps: TurnstileDependencies,
): Promise<Attempt> {
  // `application/x-www-form-urlencoded` in the body, which is what Cloudflare documents. Putting
  // the secret in a query string would leak it into every proxy log on the way out.
  const body = new URLSearchParams({
    secret: deps.secret(),
    response: token,
    idempotency_key: idempotencyKey,
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  let payload: unknown;

  try {
    const response = await deps.fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(deps.timeoutMs),
    });

    if (!response.ok) return { kind: 'unavailable', codes: [] };

    payload = await response.json();
  } catch {
    // A network fault, a timeout or a body that is not JSON. The error object is deliberately not
    // inspected or logged: it can carry the request, and the request carries the token.
    return { kind: 'unavailable', codes: [] };
  }

  return classify(payload);
}

/**
 * Defensive parsing. The only field trusted to mean "allow" is a literal `true`; everything else,
 * including a missing field, a string `"true"` or a non-object body, falls through to a refusal.
 */
function classify(payload: unknown): Attempt {
  if (typeof payload !== 'object' || payload === null) {
    return { kind: 'unavailable', codes: [] };
  }

  const record = payload as Record<string, unknown>;

  if (record.success === true) return { kind: 'success' };
  if (record.success !== false) return { kind: 'unavailable', codes: [] };

  const codes = Array.isArray(record['error-codes'])
    ? record['error-codes'].filter((code): code is string => typeof code === 'string')
    : [];

  if (codes.some((code) => CONFIGURATION_CODES.has(code))) {
    return { kind: 'misconfigured', codes };
  }
  if (codes.some((code) => code === RETRYABLE_CODE)) {
    return { kind: 'unavailable', codes };
  }
  if (codes.length > 0 && codes.every((code) => REJECTING_CODES.has(code))) {
    return { kind: 'rejected', codes };
  }

  // `success: false` with no codes, or with a code we do not recognise. Refuse, and say we could
  // not complete the check rather than accusing the visitor of failing it.
  return { kind: 'unavailable', codes };
}

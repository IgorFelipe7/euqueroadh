/**
 * The certificate-lookup path, asserted as a whole.
 *
 * The claim this file exists to prove is the one the whole feature's safety rests on:
 *
 *   **A certificate token leaves this pipeline only as a redirect, and only for somebody the database
 *   identified.** It is never part of a returned state, never logged, and never produced at all when
 *   the lookup did not match — so there is no path by which a browser, a form-state serialiser or a
 *   log aggregator can come to hold one.
 *
 * Alongside it: the switch is checked before any identity field reaches the database, Turnstile is
 * verified before any lookup, and every unsuccessful case produces the one generic sentence.
 *
 * Every dependency is injected, which is also why `redirect` is a parameter: `next/navigation`'s
 * version works by throwing, and "a non-attendee is not redirected" should be an assertion about a
 * call that did not happen, not a caught framework exception.
 */
import { describe, expect, it } from 'vitest';

import type { CertificateLookup, CertificateLookupCommand } from '@/lib/data/public';
import { FORM_ERROR_MESSAGES } from '@/lib/domain/outcomes';
import type { GuestLogFields } from '@/lib/observability/log';
import type { TurnstileVerification } from '@/lib/turnstile/verify';

import {
  CERTIFICATE_COPY,
  INITIAL_CERTIFICATE_STATE,
  TURNSTILE_FIELD_NAME,
  type CertificateFormState,
} from './state';
import { submitCertificateLookup, type CertificateDependencies } from './submit';

const CERTIFICATE_TOKEN = 'Zz9-_AbCdEfGhIjKlMnOpQrSt';
const TURNSTILE_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const VALID = { phone: '(19) 99123-4567', firstName: 'Carla' } as const;
const PHONE_E164 = '+5519991234567';

/** Thrown by the test double, so a caller that does not stop at a redirect fails loudly. */
class Redirected extends Error {
  constructor(readonly path: string) {
    super(`redirect(${path})`);
  }
}

interface Recorder {
  readonly deps: CertificateDependencies;
  readonly verified: string[];
  readonly lookups: CertificateLookupCommand[];
  readonly redirects: string[];
  readonly logs: GuestLogFields[];
  readonly gateChecks: number[];
}

function harness(
  options: {
    verification?: TurnstileVerification;
    lookup?: CertificateLookup;
    enabled?: boolean;
  } = {},
): Recorder {
  const verified: string[] = [];
  const lookups: CertificateLookupCommand[] = [];
  const redirects: string[] = [];
  const logs: GuestLogFields[] = [];
  const gateChecks: number[] = [];

  let tick = 1_000;

  return {
    verified,
    lookups,
    redirects,
    logs,
    gateChecks,
    deps: {
      verifyToken: async (token) => {
        verified.push(token);
        return options.verification ?? { ok: true };
      },
      remoteIp: async () => '203.0.113.7',
      certificatesEnabled: async () => {
        gateChecks.push(tick);
        return options.enabled ?? true;
      },
      find: async (command) => {
        lookups.push(command);
        return options.lookup ?? { result: 'found', token: CERTIFICATE_TOKEN };
      },
      redirect: (path) => {
        redirects.push(path);
        throw new Redirected(path);
      },
      certificatePath: (token) => `/certificado/${token}`,
      log: (fields) => logs.push(fields),
      newCorrelationId: () => 'ABC123',
      now: () => (tick += 5),
    },
  };
}

function formData(
  values: Partial<Record<string, string>> = VALID,
  token: string | null = TURNSTILE_TOKEN,
): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) data.set(key, value);
  }
  if (token !== null) data.set(TURNSTILE_FIELD_NAME, token);
  return data;
}

async function run(
  recorder: Recorder,
  values?: Partial<Record<string, string>>,
  previous: CertificateFormState = INITIAL_CERTIFICATE_STATE,
  token: string | null = TURNSTILE_TOKEN,
): Promise<CertificateFormState> {
  return submitCertificateLookup(recorder.deps, previous, formData(values, token));
}

/** Runs a lookup that is expected to redirect, and returns where to. */
async function runExpectingRedirect(
  recorder: Recorder,
  values?: Partial<Record<string, string>>,
): Promise<string> {
  await expect(run(recorder, values)).rejects.toBeInstanceOf(Redirected);
  return recorder.redirects[0];
}

describe('the gate', () => {
  it('is checked before any identity field reaches the database', async () => {
    const recorder = harness({ enabled: false });
    await run(recorder);

    expect(recorder.gateChecks).toHaveLength(1);
    expect(recorder.lookups).toEqual([]);
  });

  it('is checked before Turnstile, so a disabled portal spends no outbound request', async () => {
    const recorder = harness({ enabled: false });
    await run(recorder);

    expect(recorder.verified).toEqual([]);
  });

  it('answers with the SAME generic sentence a failed match gets', async () => {
    // A visitor who submits while certificates are unreleased must not be able to tell that apart
    // from "we could not find you" — the first would confirm that the switch is the only obstacle.
    const disabled = await run(harness({ enabled: false }));
    const missed = await run(harness({ lookup: { result: 'not_found' } }));

    expect(disabled.notFound).toBe(true);
    expect(missed.notFound).toBe(true);
    expect(disabled.formError).toBe(missed.formError);
    expect(disabled.step).toBe(missed.step);
  });
});

describe('validation', () => {
  it('requires a first name as well as a telephone number', async () => {
    // The whole of the "slightly stronger identity flow" the portal is specified to have.
    const recorder = harness();
    const state = await run(recorder, { phone: VALID.phone });

    expect(state.fieldErrors.firstName).toBeTruthy();
    expect(recorder.lookups).toEqual([]);
    expect(recorder.verified).toEqual([]);
  });

  it('refuses a first name that is only whitespace', async () => {
    const recorder = harness();
    const state = await run(recorder, { phone: VALID.phone, firstName: '   ' });

    expect(state.fieldErrors.firstName).toBeTruthy();
    expect(recorder.lookups).toEqual([]);
  });

  it('normalizes the telephone number before the database sees it', async () => {
    const recorder = harness({ lookup: { result: 'not_found' } });
    await run(recorder, { phone: ' 19 99123 4567 ', firstName: ' Carla ' });

    expect(recorder.lookups).toEqual([
      { phoneE164: PHONE_E164, firstName: 'Carla', age: null },
    ]);
  });

  it('sends an unsupplied age as null rather than as an empty string', async () => {
    const recorder = harness({ lookup: { result: 'need_age' } });
    await run(recorder, { ...VALID, age: '' });

    expect(recorder.lookups[0].age).toBeNull();
  });

  it('logs the names of the failing fields and never their values', async () => {
    const recorder = harness();
    await run(recorder, { phone: 'nonsense', firstName: 'Carla' });

    expect(recorder.logs).toEqual([
      expect.objectContaining({ event: 'certificate.validation_failed', fields: ['phone'] }),
    ]);
    expect(JSON.stringify(recorder.logs)).not.toContain('nonsense');
  });
});

describe('Turnstile', () => {
  it('is verified before any lookup', async () => {
    const recorder = harness({ verification: { ok: false, reason: 'rejected' } });
    const state = await run(recorder);

    expect(recorder.verified).toEqual([TURNSTILE_TOKEN]);
    expect(recorder.lookups).toEqual([]);
    expect(state.formError).toBe(FORM_ERROR_MESSAGES.antiAbuse);
  });

  it('fails closed when it cannot be completed at all', async () => {
    const recorder = harness({ verification: { ok: false, reason: 'unavailable' } });
    const state = await run(recorder);

    expect(recorder.lookups).toEqual([]);
    expect(state.formError).toBe(FORM_ERROR_MESSAGES.server);
    expect(state.correlationId).toBe('ABC123');
  });

  it('refuses a submission carrying no token, with no outbound request', async () => {
    const recorder = harness();
    const state = await run(recorder, VALID, INITIAL_CERTIFICATE_STATE, null);

    expect(recorder.verified).toEqual([]);
    expect(recorder.lookups).toEqual([]);
    expect(state.formError).toBe(FORM_ERROR_MESSAGES.antiAbuse);
  });
});

describe('the token', () => {
  it('leaves only as a redirect to the existing capability route', async () => {
    const recorder = harness();
    const path = await runExpectingRedirect(recorder);

    expect(path).toBe(`/certificado/${CERTIFICATE_TOKEN}`);
  });

  it('is never part of a state the browser receives', async () => {
    // A found lookup does not RETURN at all — it throws through `redirect`. This asserts the shape of
    // that guarantee rather than trusting it: there is no code path producing a state here.
    const recorder = harness();
    await expect(run(recorder)).rejects.toBeInstanceOf(Redirected);

    expect(recorder.redirects).toHaveLength(1);
  });

  it('is never written to the log, on any path', async () => {
    const recorder = harness();
    await expect(run(recorder)).rejects.toBeInstanceOf(Redirected);

    expect(JSON.stringify(recorder.logs)).not.toContain(CERTIFICATE_TOKEN);
    expect(recorder.logs.at(-1)?.event).toBe('certificate.found');
  });

  it('is not produced at all for a lookup that did not match', async () => {
    for (const lookup of [
      { result: 'not_found' },
      { result: 'need_age' },
      { result: 'unavailable' },
    ] as const) {
      const recorder = harness({ lookup });
      const state = await run(recorder, { ...VALID, age: '19' });

      expect(recorder.redirects).toEqual([]);
      expect(JSON.stringify(state)).not.toContain(CERTIFICATE_TOKEN);
    }
  });
});

describe('result mapping', () => {
  it('asks for an age when two people cannot be told apart', async () => {
    const recorder = harness({ lookup: { result: 'need_age' } });
    const state = await run(recorder);

    expect(state.step).toBe('age');
    expect(state.notFound).toBe(false);
    expect(CERTIFICATE_COPY.steps.age.notice).toBeTruthy();
  });

  it('keeps the two identifying fields while it asks', async () => {
    const recorder = harness({ lookup: { result: 'need_age' } });
    const state = await run(recorder);

    expect(state.values.phone).toBe(VALID.phone);
    expect(state.values.firstName).toBe(VALID.firstName);
  });

  it('returns to the opening step after a failed match, keeping what was typed', async () => {
    // The likely cause is a typo the person can see and fix, so the form comes back populated.
    const recorder = harness({ lookup: { result: 'not_found' } });
    const state = await run(
      recorder,
      { ...VALID, age: '19' },
      { ...INITIAL_CERTIFICATE_STATE, step: 'age' },
    );

    expect(state.step).toBe('identify');
    expect(state.notFound).toBe(true);
    expect(state.values.phone).toBe(VALID.phone);
    expect(state.values.firstName).toBe(VALID.firstName);
  });

  it('clears the age after a failed match, so the next attempt is not narrowed by a guess', async () => {
    const recorder = harness({ lookup: { result: 'not_found' } });
    const state = await run(recorder, { ...VALID, age: '19' });

    expect(state.values.age).toBe('');
  });

  it('reports an unrecognised database answer as our own fault, with a code', async () => {
    const recorder = harness({ lookup: { result: 'unavailable' } });
    const state = await run(recorder);

    expect(state.notFound).toBe(false);
    expect(state.formError).toBe(FORM_ERROR_MESSAGES.server);
    expect(state.correlationId).toBe('ABC123');
  });
});

describe('privacy', () => {
  it('has one flag for every unsuccessful case there is', async () => {
    // A non-attendee, an unknown number, a wrong name, a waitlisted person and a disabled switch all
    // arrive here as the same two states, and the state object has no field to tell them apart in.
    const disabled = await run(harness({ enabled: false }));
    const missed = await run(harness({ lookup: { result: 'not_found' } }));

    expect(Object.keys(disabled).sort()).toEqual(Object.keys(missed).sort());
    expect(Object.keys(missed).sort()).toEqual([
      'challengeNonce',
      'correlationId',
      'fieldErrors',
      'formError',
      'notFound',
      'step',
      'values',
    ]);
  });

  it('says the same two sentences whatever went wrong', async () => {
    expect(CERTIFICATE_COPY.notFound).toHaveLength(2);
    expect(CERTIFICATE_COPY.notFound.join(' ')).not.toMatch(/presen|inscri|encontramos uma/i);
  });

  it('never puts a telephone number or a name into the log', async () => {
    const recorder = harness({ lookup: { result: 'not_found' } });
    await run(recorder, VALID);

    const serialised = JSON.stringify(recorder.logs);
    expect(serialised).not.toContain('99123');
    expect(serialised).not.toContain('Carla');
  });
});

describe('the Turnstile widget lifetime', () => {
  it('is reset whenever a token was spent', async () => {
    for (const lookup of [{ result: 'need_age' }, { result: 'not_found' }] as const) {
      const state = await run(harness({ lookup }));
      expect(state.challengeNonce).toBe(INITIAL_CERTIFICATE_STATE.challengeNonce + 1);
    }
  });

  it('is NOT reset by a validation failure, because no token was spent', async () => {
    const state = await run(harness(), { phone: VALID.phone });
    expect(state.challengeNonce).toBe(INITIAL_CERTIFICATE_STATE.challengeNonce);
  });

  it('IS reset when the gate refused, because the widget was already solved', async () => {
    const state = await run(harness({ enabled: false }));
    expect(state.challengeNonce).toBe(INITIAL_CERTIFICATE_STATE.challengeNonce + 1);
  });
});

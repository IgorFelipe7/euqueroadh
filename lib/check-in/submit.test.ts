/**
 * The public self check-in path, asserted as a whole.
 *
 * Four claims are load-bearing and each has its own test rather than being implied by another:
 *
 *   1. the server validates and normalizes from scratch, and never trusts what the browser computed;
 *   2. an unverified Turnstile token never reaches the database;
 *   3. **a field the guest has not supplied is sent as `null`, never as an empty string** — an
 *      invention would narrow the candidate set and is the one way an adaptive lookup identifies the
 *      wrong person;
 *   4. **nothing the database says about a registration reaches the browser.** Every unsuccessful
 *      state collapses to one of two screens, and the state object has no field a name could travel in.
 *
 * Every dependency is injected, so the pipeline runs with no network, no database and no clock.
 */
import { describe, expect, it } from 'vitest';

import type { CheckInCommand, CheckInResult } from '@/lib/data/public';
import { FORM_ERROR_MESSAGES } from '@/lib/domain/outcomes';
import type { GuestLogFields } from '@/lib/observability/log';
import type { TurnstileVerification } from '@/lib/turnstile/verify';

import {
  CHECK_IN_COPY,
  INITIAL_CHECK_IN_STATE,
  SESSION_FIELD_NAME,
  TURNSTILE_FIELD_NAME,
  type CheckInFormState,
} from './state';
import { submitCheckIn, type CheckInDependencies } from './submit';

const SESSION = 'AbCdEfGhIjKlMnOpQrStUvWxY-_';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const PHONE = '(19) 99123-4567';
const PHONE_E164 = '+5519991234567';

interface Recorder {
  readonly deps: CheckInDependencies;
  readonly verified: string[];
  readonly commands: CheckInCommand[];
  readonly logs: GuestLogFields[];
}

function harness(
  options: { verification?: TurnstileVerification; result?: CheckInResult } = {},
): Recorder {
  const verified: string[] = [];
  const commands: CheckInCommand[] = [];
  const logs: GuestLogFields[] = [];

  let tick = 1_000;

  return {
    verified,
    commands,
    logs,
    deps: {
      verifyToken: async (token) => {
        verified.push(token);
        return options.verification ?? { ok: true };
      },
      remoteIp: async () => '203.0.113.7',
      checkIn: async (command) => {
        commands.push(command);
        return options.result ?? 'confirmed';
      },
      log: (fields) => logs.push(fields),
      newCorrelationId: () => 'ABC123',
      now: () => (tick += 5),
    },
  };
}

function formData(
  values: Partial<Record<string, string>> = { phone: PHONE },
  token: string | null = TOKEN,
  session: string | null = SESSION,
): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) data.set(key, value);
  }
  if (session !== null) data.set(SESSION_FIELD_NAME, session);
  if (token !== null) data.set(TURNSTILE_FIELD_NAME, token);
  return data;
}

function run(
  recorder: Recorder,
  values?: Partial<Record<string, string>>,
  previous: CheckInFormState = INITIAL_CHECK_IN_STATE,
  token: string | null = TOKEN,
) {
  return submitCheckIn(recorder.deps, previous, formData(values, token));
}

describe('validation', () => {
  it('normalizes the telephone number before the database sees it', async () => {
    const recorder = harness();
    await run(recorder, { phone: '  19 99123 4567 ' });

    expect(recorder.commands).toEqual([
      { token: SESSION, phoneE164: PHONE_E164, firstName: null, age: null },
    ]);
  });

  it('refuses a landline with its own message, and touches nothing', async () => {
    const recorder = harness();
    const state = await run(recorder, { phone: '(19) 3211-4567' });

    expect(state.fieldErrors.phone).toContain('telefone fixo');
    expect(recorder.verified).toEqual([]);
    expect(recorder.commands).toEqual([]);
  });

  it('keeps a validation failure on the step the field belongs to', async () => {
    const recorder = harness();
    const state = await run(
      recorder,
      { phone: PHONE, firstName: 'x'.repeat(200) },
      { ...INITIAL_CHECK_IN_STATE, step: 'firstName' },
    );

    expect(state.step).toBe('firstName');
    expect(state.fieldErrors.firstName).toBeTruthy();
    expect(recorder.commands).toEqual([]);
  });

  it('logs the NAMES of the fields that failed and never their values', async () => {
    const recorder = harness();
    await run(recorder, { phone: 'nonsense' });

    expect(recorder.logs).toEqual([
      expect.objectContaining({ event: 'checkin.validation_failed', fields: ['phone'] }),
    ]);
    expect(JSON.stringify(recorder.logs)).not.toContain('nonsense');
  });
});

describe('a field the guest has not supplied', () => {
  it('is sent as null rather than as an empty string', async () => {
    // The whole adaptive flow rests on this. `''` would be a value the guest never gave, and the RPC
    // would narrow the candidate set by it.
    const recorder = harness();
    await run(recorder, { phone: PHONE, firstName: '', age: '' });

    expect(recorder.commands[0]).toMatchObject({ firstName: null, age: null });
  });

  it('is still null when it holds only whitespace', async () => {
    const recorder = harness();
    await run(recorder, { phone: PHONE, firstName: '   ', age: '\t' });

    expect(recorder.commands[0]).toMatchObject({ firstName: null, age: null });
  });

  it('is passed through once the guest has supplied it', async () => {
    const recorder = harness();
    await run(recorder, { phone: PHONE, firstName: '  Ana  ', age: '15' });

    expect(recorder.commands[0]).toMatchObject({ firstName: 'Ana', age: 15 });
  });

  it('accepts an age below the online registration floor', async () => {
    // The person is already registered — an organizer may have entered a younger participant by hand.
    // Applying `PUBLIC_AGE_MIN` here would refuse that child their own check-in.
    const recorder = harness();
    const state = await run(recorder, { phone: PHONE, firstName: 'Ana', age: '9' });

    expect(state.fieldErrors.age).toBeUndefined();
    expect(recorder.commands[0]).toMatchObject({ age: 9 });
  });
});

describe('Turnstile', () => {
  it('is verified before the database is touched', async () => {
    const recorder = harness({ verification: { ok: false, reason: 'rejected' } });
    const state = await run(recorder);

    expect(recorder.verified).toEqual([TOKEN]);
    expect(recorder.commands).toEqual([]);
    expect(state.formError).toBe(FORM_ERROR_MESSAGES.antiAbuse);
  });

  it('fails closed when it cannot be completed at all', async () => {
    const recorder = harness({ verification: { ok: false, reason: 'unavailable' } });
    const state = await run(recorder);

    expect(recorder.commands).toEqual([]);
    expect(state.formError).toBe(FORM_ERROR_MESSAGES.server);
    expect(state.correlationId).toBe('ABC123');
  });

  it('refuses a submission carrying no token, with no outbound request', async () => {
    const recorder = harness();
    const state = await run(recorder, { phone: PHONE }, INITIAL_CHECK_IN_STATE, null);

    expect(recorder.verified).toEqual([]);
    expect(recorder.commands).toEqual([]);
    expect(state.formError).toBe(FORM_ERROR_MESSAGES.antiAbuse);
  });

  it('leaves the guest on the step they were on when a challenge is refused', async () => {
    const recorder = harness({ verification: { ok: false, reason: 'rejected' } });
    const state = await run(
      recorder,
      { phone: PHONE, firstName: 'Ana' },
      { ...INITIAL_CHECK_IN_STATE, step: 'firstName' },
    );

    expect(state.step).toBe('firstName');
    expect(state.values.firstName).toBe('Ana');
  });

  it('never logs the token', async () => {
    const recorder = harness({ verification: { ok: false, reason: 'rejected' } });
    await run(recorder);

    expect(JSON.stringify(recorder.logs)).not.toContain(TOKEN);
  });
});

describe('result mapping', () => {
  it.each([
    ['confirmed', 'confirmed'],
    ['already_present', 'already_present'],
    ['not_found', 'manual'],
    ['session_invalid', 'session_closed'],
  ] as const)('maps %s to the %s screen', async (result, outcome) => {
    const recorder = harness({ result });
    const state = await run(recorder);

    expect(state.outcome).toBe(outcome);
  });

  it.each([
    ['need_name', 'firstName'],
    ['need_age', 'age'],
  ] as const)('maps %s to the %s step with no outcome', async (result, step) => {
    const recorder = harness({ result });
    const state = await run(recorder);

    expect(state.outcome).toBeNull();
    expect(state.step).toBe(step);
  });

  it('keeps the telephone number when it asks for a name', async () => {
    const recorder = harness({ result: 'need_name' });
    const state = await run(recorder, { phone: PHONE });

    expect(state.values.phone).toBe(PHONE);
  });

  it('clears a stale age when it goes back to asking for a name', async () => {
    // A previous person on this device may have left one behind; carrying it forward would narrow the
    // next lookup by a value this guest never supplied.
    const recorder = harness({ result: 'need_name' });
    const state = await run(recorder, { phone: PHONE, age: '15' });

    expect(state.values.age).toBe('');
  });

  it('keeps the telephone number after a success, for the household loop', async () => {
    const recorder = harness({ result: 'confirmed' });
    const state = await run(recorder, { phone: PHONE, firstName: 'Ana' });

    expect(state.values.phone).toBe(PHONE);
    expect(state.values.firstName).toBe('');
  });

  it('keeps nothing after a generic refusal', async () => {
    const recorder = harness({ result: 'not_found' });
    const state = await run(recorder, { phone: PHONE, firstName: 'Ana', age: '15' });

    expect(state.values).toEqual({ phone: '', firstName: '', age: '' });
  });

  it('reports an unrecognised database answer as our own fault, with a code', async () => {
    const recorder = harness({ result: 'unavailable' });
    const state = await run(recorder);

    expect(state.outcome).toBeNull();
    expect(state.formError).toBe(FORM_ERROR_MESSAGES.server);
    expect(state.correlationId).toBe('ABC123');
  });
});

describe('the Turnstile widget lifetime', () => {
  it('is reset after a SUCCESSFUL check-in, unlike registration', async () => {
    // The flow does not end at success here — the next person on the same telephone is one tap away —
    // and a spent token would come back `timeout-or-duplicate` and look like the same failure twice.
    const recorder = harness({ result: 'confirmed' });
    const state = await run(recorder);

    expect(state.challengeNonce).toBe(INITIAL_CHECK_IN_STATE.challengeNonce + 1);
  });

  it('is reset when the flow asks for another field', async () => {
    const recorder = harness({ result: 'need_name' });
    const state = await run(recorder);

    expect(state.challengeNonce).toBe(INITIAL_CHECK_IN_STATE.challengeNonce + 1);
  });

  it('is NOT reset by a validation failure, because no token was spent', async () => {
    const recorder = harness();
    const state = await run(recorder, { phone: 'nonsense' });

    expect(state.challengeNonce).toBe(INITIAL_CHECK_IN_STATE.challengeNonce);
  });
});

describe('privacy', () => {
  it('tells the browser nothing about a registration in any outcome', async () => {
    for (const result of [
      'confirmed',
      'already_present',
      'need_name',
      'need_age',
      'not_found',
      'session_invalid',
    ] as const) {
      const recorder = harness({ result });
      const state = await run(recorder, { phone: PHONE, firstName: 'Ana', age: '15' });

      // The whole state, serialised. There is no name, no id, no status and no count anywhere in it —
      // and the assertion is on the OBJECT rather than on a rendered string, so a future field would
      // have to be added deliberately to pass.
      expect(Object.keys(state).sort()).toEqual([
        'challengeNonce',
        'correlationId',
        'fieldErrors',
        'formError',
        'outcome',
        'step',
        'values',
      ]);
    }
  });

  it('gives an unknown number and a shared one the same words, in the same order', async () => {
    // The property migration 18 exists to establish, restated at the copy layer: the guest-visible
    // prompt for "nobody registered this number" and for "five people share it" is one string.
    const shared = await run(harness({ result: 'need_name' }), { phone: PHONE });
    const unknown = await run(harness({ result: 'need_name' }), { phone: '(19) 99999-0000' });

    expect(shared.step).toBe(unknown.step);
    expect(CHECK_IN_COPY.steps[shared.step].notice).toBe(CHECK_IN_COPY.steps[unknown.step].notice);
  });

  it('never puts a telephone number, a name or an age into the log', async () => {
    const recorder = harness({ result: 'confirmed' });
    await run(recorder, { phone: PHONE, firstName: 'Ana', age: '15' });

    const serialised = JSON.stringify(recorder.logs);
    expect(serialised).not.toContain('99123');
    expect(serialised).not.toContain('Ana');
    expect(serialised).not.toContain(SESSION);
  });

  it('logs one event for both narrowing answers, so the log cannot track a prober', async () => {
    const byName = harness({ result: 'need_name' });
    const byAge = harness({ result: 'need_age' });

    await run(byName);
    await run(byAge, { phone: PHONE, firstName: 'Ana' });

    expect(byName.logs.at(-1)?.event).toBe('checkin.needs_identification');
    expect(byAge.logs.at(-1)?.event).toBe('checkin.needs_identification');
  });
});

describe('the session token', () => {
  it('is passed through from the form to the database, untouched', async () => {
    const recorder = harness();
    await run(recorder);

    expect(recorder.commands[0].token).toBe(SESSION);
  });

  it('is never rendered back into the state the browser receives', async () => {
    const recorder = harness({ result: 'confirmed' });
    const state = await run(recorder);

    expect(JSON.stringify(state)).not.toContain(SESSION);
  });
});

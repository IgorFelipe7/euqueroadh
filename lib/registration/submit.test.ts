/**
 * The public write path, asserted as a whole.
 *
 * Three claims are load-bearing and each has its own test rather than being implied by another:
 *
 *   1. the server validates from scratch — a payload the browser would have blocked is still parsed
 *      here, and a payload the browser *did* compute is ignored;
 *   2. an unverified Turnstile token never reaches the database;
 *   3. nothing the database or Cloudflare says reaches the person, and nothing about the person
 *      reaches the log.
 *
 * Every dependency is injected, so the pipeline runs with no network, no database and no clock.
 */
import { describe, expect, it, vi } from 'vitest';

import type { RegistrationAllocation, RegistrationCommand } from '@/lib/data/public';
import type { PublicEventState } from '@/lib/domain/outcomes';
import type { RegistrationLogFields } from '@/lib/observability/log';
import type { TurnstileVerification } from '@/lib/turnstile/verify';

import { INITIAL_REGISTRATION_STATE, TURNSTILE_FIELD_NAME } from './state';
import { submitRegistration, type SubmitDependencies } from './submit';

const EVENT_ID = '6f1b8f84-3a2a-4e0b-9a84-2f2a3b4c5d6e';
const REGISTRATION_ID = '0b2d4f6a-8c1e-4a3b-9d5f-7e8a9b0c1d2e';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/** A person who exists only in this file. */
const VALID = { name: 'Ana Souza', age: '17', phone: '(19) 99123-4567' } as const;
const VALID_E164 = '+5519991234567';

interface Recorder {
  readonly deps: SubmitDependencies;
  readonly verified: string[];
  readonly registered: RegistrationCommand[];
  readonly revalidated: string[];
  readonly logs: RegistrationLogFields[];
}

function harness(options: {
  verification?: TurnstileVerification;
  allocation?: RegistrationAllocation;
  stateBefore?: PublicEventState;
  stateAfter?: PublicEventState | null;
  eventMissing?: boolean;
} = {}): Recorder {
  const verified: string[] = [];
  const registered: RegistrationCommand[] = [];
  const revalidated: string[] = [];
  const logs: RegistrationLogFields[] = [];

  let tick = 1_000;

  return {
    verified,
    registered,
    revalidated,
    logs,
    deps: {
      verifyToken: async (token) => {
        verified.push(token);
        return options.verification ?? { ok: true };
      },
      remoteIp: async () => '203.0.113.7',
      readEventContext: async () =>
        options.eventMissing
          ? null
          : { id: EVENT_ID, state: options.stateBefore ?? 'open' },
      readCurrentState: async () =>
        options.stateAfter === undefined ? (options.stateBefore ?? 'open') : options.stateAfter,
      register: async (command) => {
        registered.push(command);
        return (
          options.allocation ?? { outcome: 'confirmed', registrationId: REGISTRATION_ID }
        );
      },
      revalidate: (path) => revalidated.push(path),
      log: (fields) => logs.push(fields),
      newCorrelationId: () => 'ABC123',
      now: () => (tick += 5),
    },
  };
}

function formData(
  values: Partial<Record<string, string>> = VALID,
  token: string | null = TOKEN,
): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) data.set(key, value);
  }
  if (token !== null) data.set(TURNSTILE_FIELD_NAME, token);
  return data;
}

const submit = (recorder: Recorder, data: FormData) =>
  submitRegistration(recorder.deps, INITIAL_REGISTRATION_STATE, data);

/* --------------------------------------------------------------------------------------------- */

describe('authoritative server validation', () => {
  it('accepts a valid payload and normalizes it before the database sees it', async () => {
    const recorder = harness();

    const state = await submit(recorder, formData({ ...VALID, name: '  Ana   Souza  ' }));

    expect(state.outcome).toEqual({ kind: 'confirmed' });
    expect(recorder.registered).toEqual([
      {
        eventId: EVENT_ID,
        // Trimmed and with its internal whitespace collapsed — never title-cased.
        fullName: 'Ana Souza',
        age: 17,
        // Canonical E.164, never the masked value the person typed.
        phoneE164: VALID_E164,
      },
    ]);
  });

  it.each([
    ['an empty name', { name: '' }, 'name', 'Informe seu nome.'],
    ['a one-character name', { name: 'A' }, 'name', 'Informe seu nome completo.'],
    ['an overlong name', { name: 'A'.repeat(121) }, 'name', 'Informe seu nome completo.'],
    ['an empty age', { age: '' }, 'age', 'Informe sua idade.'],
    ['a non-numeric age', { age: '18a' }, 'age', 'Informe uma idade válida.'],
    ['a fractional age', { age: '1.5' }, 'age', 'Informe uma idade válida.'],
    ['an age of zero', { age: '0' }, 'age', 'Informe uma idade válida.'],
    ['an age above the bound', { age: '121' }, 'age', 'Informe uma idade válida.'],
    ['an empty phone', { phone: '' }, 'phone', 'Informe seu celular.'],
    [
      'a landline',
      { phone: '(19) 3345-6789' },
      'phone',
      'Esse número parece ser um telefone fixo. Informe um celular com 9 dígitos.',
    ],
    [
      'an invalid area code',
      { phone: '(20) 99123-4567' },
      'phone',
      'Informe um celular válido com DDD. Ex.: (19) 99999-9999.',
    ],
    [
      'a mobile that does not start with 9',
      { phone: '(19) 89123-4567' },
      'phone',
      'Informe um celular válido com DDD. Ex.: (19) 99999-9999.',
    ],
    [
      'eleven identical digits',
      { phone: '11111111111' },
      'phone',
      'Informe um celular válido com DDD. Ex.: (19) 99999-9999.',
    ],
    [
      'a malformed number',
      { phone: '99' },
      'phone',
      'Informe um celular válido com DDD. Ex.: (19) 99999-9999.',
    ],
  ])('rejects %s before any verification or write', async (_label, patch, field, message) => {
    const recorder = harness();

    const state = await submit(recorder, formData({ ...VALID, ...patch }));

    expect(state.fieldErrors[field as 'name' | 'age' | 'phone']).toBe(message);
    expect(state.outcome).toBeNull();
    expect(recorder.verified).toEqual([]);
    expect(recorder.registered).toEqual([]);
  });

  it('keeps what the person typed, so one bad field does not empty the form', async () => {
    const recorder = harness();

    const state = await submit(recorder, formData({ ...VALID, phone: '(19) 3345-6789' }));

    expect(state.values).toEqual({
      name: VALID.name,
      age: VALID.age,
      phone: '(19) 3345-6789',
    });
  });

  it('does not reset the challenge for a validation failure — the token was never spent', async () => {
    const recorder = harness();

    const state = await submit(recorder, formData({ ...VALID, age: 'dezoito' }));

    expect(state.challengeNonce).toBe(INITIAL_REGISTRATION_STATE.challengeNonce);
  });

  it('reads exactly three fields and ignores anything else the payload carries', async () => {
    const recorder = harness();
    const data = formData();
    data.set('event_id', 'a-different-event');
    data.set('status', 'confirmed');
    data.set('waitlist_rank', '1');
    data.set('capacity', '99999');

    await submit(recorder, data);

    expect(recorder.registered[0]).toEqual({
      eventId: EVENT_ID,
      fullName: VALID.name,
      age: 17,
      phoneE164: VALID_E164,
    });
  });

  it('treats a repeated field as its first value and a file upload as absent', async () => {
    const recorder = harness();
    const data = new FormData();
    data.append('name', 'Ana Souza');
    data.append('name', 'Outra Pessoa');
    data.set('age', '17');
    data.set('phone', VALID.phone);
    data.set(TURNSTILE_FIELD_NAME, TOKEN);

    await submit(recorder, data);

    expect(recorder.registered[0].fullName).toBe('Ana Souza');
  });
});

describe('the Turnstile gate', () => {
  it('refuses a submission with no token at all, without calling Cloudflare', async () => {
    const recorder = harness();

    const state = await submit(recorder, formData(VALID, null));

    expect(state.formError).toBe('Não conseguimos confirmar que você não é um robô. Tente novamente.');
    expect(recorder.verified).toEqual([]);
    expect(recorder.registered).toEqual([]);
  });

  it('refuses a rejected token and never reaches the database', async () => {
    const recorder = harness({ verification: { ok: false, reason: 'rejected' } });

    const state = await submit(recorder, formData());

    expect(state.formError).toBe('Não conseguimos confirmar que você não é um robô. Tente novamente.');
    expect(state.correlationId).toBeNull();
    expect(recorder.verified).toEqual([TOKEN]);
    expect(recorder.registered).toEqual([]);
  });

  it('fails closed when verification could not be completed, and offers a support code', async () => {
    const recorder = harness({ verification: { ok: false, reason: 'unavailable' } });

    const state = await submit(recorder, formData());

    expect(state.formError).toBe('Algo deu errado do nosso lado. Tente novamente em instantes.');
    expect(state.correlationId).toBe('ABC123');
    expect(recorder.registered).toEqual([]);
  });

  it.each([
    ['a missing token', null, undefined],
    ['a rejected token', TOKEN, { ok: false, reason: 'rejected' } as TurnstileVerification],
    ['an unavailable service', TOKEN, { ok: false, reason: 'unavailable' } as TurnstileVerification],
  ])('asks for a fresh challenge after %s', async (_label, token, verification) => {
    const recorder = harness(verification ? { verification } : {});

    const state = await submit(recorder, formData(VALID, token));

    expect(state.challengeNonce).toBe(INITIAL_REGISTRATION_STATE.challengeNonce + 1);
  });

  it('verifies before it allocates, never the other way round', async () => {
    const order: string[] = [];
    const recorder = harness();
    const deps: SubmitDependencies = {
      ...recorder.deps,
      verifyToken: async () => {
        order.push('verify');
        return { ok: true };
      },
      register: async () => {
        order.push('register');
        return { outcome: 'confirmed', registrationId: REGISTRATION_ID };
      },
    };

    await submitRegistration(deps, INITIAL_REGISTRATION_STATE, formData());

    expect(order).toEqual(['verify', 'register']);
  });

  it('passes the platform address on to the verifier and nothing else', async () => {
    const seen: { token: string; ip: string | null }[] = [];
    const recorder = harness();

    await submitRegistration(
      {
        ...recorder.deps,
        verifyToken: async (token, ip) => {
          seen.push({ token, ip });
          return { ok: true };
        },
      },
      INITIAL_REGISTRATION_STATE,
      formData(),
    );

    expect(seen).toEqual([{ token: TOKEN, ip: '203.0.113.7' }]);
  });
});

describe('mapping the database outcome', () => {
  it.each([
    [
      { outcome: 'confirmed', registrationId: REGISTRATION_ID } as RegistrationAllocation,
      { kind: 'confirmed' },
      'registration.confirmed',
    ],
    [
      { outcome: 'waitlisted', registrationId: REGISTRATION_ID } as RegistrationAllocation,
      { kind: 'waitlisted' },
      'registration.waitlisted',
    ],
    [
      { outcome: 'already_registered', status: 'confirmed' } as RegistrationAllocation,
      { kind: 'already_registered', status: 'confirmed' },
      'registration.duplicate',
    ],
    [
      { outcome: 'already_registered', status: 'waitlisted' } as RegistrationAllocation,
      { kind: 'already_registered', status: 'waitlisted' },
      'registration.duplicate',
    ],
    [{ outcome: 'full' } as RegistrationAllocation, { kind: 'full' }, 'registration.full'],
    [{ outcome: 'closed' } as RegistrationAllocation, { kind: 'closed' }, 'registration.closed'],
  ])('turns %j into the matching outcome and log line', async (allocation, outcome, logEvent) => {
    const recorder = harness({ allocation });

    const state = await submit(recorder, formData());

    expect(state.outcome).toEqual(outcome);
    expect(state.formError).toBeNull();
    expect(recorder.logs.at(-1)?.event).toBe(logEvent);
  });

  it('clears the form once an outcome is terminal', async () => {
    const recorder = harness();

    const state = await submit(recorder, formData());

    expect(state.values).toEqual({ name: '', age: '', phone: '' });
    expect(state.fieldErrors).toEqual({});
  });

  it('turns an unrecognised database answer into the generic retry message', async () => {
    const recorder = harness({ allocation: { outcome: 'unavailable' } });

    const state = await submit(recorder, formData());

    expect(state.outcome).toBeNull();
    expect(state.formError).toBe('Algo deu errado do nosso lado. Tente novamente em instantes.');
    expect(state.correlationId).toBe('ABC123');
    expect(recorder.logs.at(-1)?.event).toBe('registration.infrastructure_error');
  });

  it('refuses safely when there is no active event to register for', async () => {
    const recorder = harness({ eventMissing: true });

    const state = await submit(recorder, formData());

    expect(state.formError).toBe('Algo deu errado do nosso lado. Tente novamente em instantes.');
    expect(recorder.registered).toEqual([]);
  });

  it('never lets a message that is not approved copy reach the person', async () => {
    const approved = new Set([
      'Não conseguimos confirmar que você não é um robô. Tente novamente.',
      'Sem conexão. Verifique sua internet e tente novamente.',
      'Algo deu errado do nosso lado. Tente novamente em instantes.',
    ]);

    for (const allocation of [
      { outcome: 'unavailable' },
      { outcome: 'full' },
      { outcome: 'closed' },
    ] satisfies RegistrationAllocation[]) {
      const recorder = harness({ allocation });
      const state = await submit(recorder, formData());

      if (state.formError) expect(approved.has(state.formError)).toBe(true);
      expect(JSON.stringify(state)).not.toMatch(
        /select |insert |relation |pgrst|sqlstate|register_for_event|supabase/i,
      );
    }
  });
});

describe('the advisory cache', () => {
  it('revalidates the public page when a registration takes the last seat', async () => {
    const recorder = harness({ stateBefore: 'open', stateAfter: 'full_waitlist' });

    await submit(recorder, formData());

    expect(recorder.revalidated).toEqual(['/']);
  });

  it('revalidates when a stale page produced a refusal', async () => {
    const recorder = harness({
      allocation: { outcome: 'closed' },
      stateBefore: 'open',
      stateAfter: 'closed',
    });

    await submit(recorder, formData());

    expect(recorder.revalidated).toEqual(['/']);
  });

  it('leaves the cache alone when nothing about the state changed', async () => {
    const recorder = harness({ stateBefore: 'open', stateAfter: 'open' });

    await submit(recorder, formData());

    expect(recorder.revalidated).toEqual([]);
  });

  it('never revalidates for a duplicate, which writes nothing', async () => {
    const recorder = harness({
      allocation: { outcome: 'already_registered', status: 'confirmed' },
      stateBefore: 'open',
      stateAfter: 'full_closed',
    });

    await submit(recorder, formData());

    expect(recorder.revalidated).toEqual([]);
  });

  it('leaves the cache alone when the state could not be re-read', async () => {
    const recorder = harness({ stateBefore: 'open', stateAfter: null });

    await submit(recorder, formData());

    expect(recorder.revalidated).toEqual([]);
  });
});

describe('what is never logged', () => {
  const PERSONAL = [VALID.name, 'Souza', VALID.phone, VALID_E164, '19991234567', TOKEN];

  it.each([
    ['a confirmed registration', {}],
    ['a waitlisted registration', { allocation: { outcome: 'waitlisted', registrationId: REGISTRATION_ID } }],
    ['a duplicate', { allocation: { outcome: 'already_registered', status: 'confirmed' } }],
    ['a refusal', { allocation: { outcome: 'full' } }],
    ['a database fault', { allocation: { outcome: 'unavailable' } }],
    ['a rejected token', { verification: { ok: false, reason: 'rejected' } }],
  ])('writes no participant data for %s', async (_label, options) => {
    const recorder = harness(options as Parameters<typeof harness>[0]);

    await submit(recorder, formData());

    const written = JSON.stringify(recorder.logs);
    for (const value of PERSONAL) expect(written).not.toContain(value);
  });

  it('writes no participant data for a validation failure — only the field names', async () => {
    const recorder = harness();

    await submit(recorder, formData({ ...VALID, phone: '(19) 3345-6789' }));

    expect(recorder.logs).toEqual([
      expect.objectContaining({ event: 'registration.validation_failed', fields: ['phone'] }),
    ]);
    expect(JSON.stringify(recorder.logs)).not.toContain('3345');
  });

  it('records the event and registration keys, which identify rows rather than people', async () => {
    const recorder = harness();

    await submit(recorder, formData());

    expect(recorder.logs.at(-1)).toEqual(
      expect.objectContaining({
        event: 'registration.confirmed',
        eventId: EVENT_ID,
        registrationId: REGISTRATION_ID,
      }),
    );
    expect(recorder.logs.at(-1)?.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('the returned state', () => {
  it('carries an outcome, the messages that explain it, and nothing else', async () => {
    const recorder = harness();

    const state = await submit(recorder, formData());

    expect(Object.keys(state).sort()).toEqual(
      ['challengeNonce', 'correlationId', 'fieldErrors', 'formError', 'outcome', 'values'].sort(),
    );
  });

  it('never carries a registration identifier to the browser', async () => {
    const recorder = harness();

    const state = await submit(recorder, formData());

    expect(JSON.stringify(state)).not.toContain(REGISTRATION_ID);
    expect(JSON.stringify(state)).not.toContain(EVENT_ID);
  });
});

describe('a duplicate submission', () => {
  it('echoes no personal data back, only the status that was found', async () => {
    const recorder = harness({
      allocation: { outcome: 'already_registered', status: 'waitlisted' },
    });

    const state = await submit(recorder, formData());

    const returned = JSON.stringify(state);

    expect(state.outcome).toEqual({ kind: 'already_registered', status: 'waitlisted' });
    for (const value of [VALID.name, VALID.age, VALID.phone, VALID_E164]) {
      expect(returned).not.toContain(value);
    }
  });
});

describe('the clock', () => {
  it('measures each submission without reading the wall clock itself', async () => {
    const now = vi.fn<() => number>().mockReturnValueOnce(100).mockReturnValue(175);
    const recorder = harness();

    await submitRegistration({ ...recorder.deps, now }, INITIAL_REGISTRATION_STATE, formData());

    expect(recorder.logs.at(-1)?.durationMs).toBe(75);
  });
});

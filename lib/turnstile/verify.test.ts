/**
 * The anti-abuse boundary, asserted against Cloudflare's documented contract rather than against a
 * wrapper library.
 *
 * The two properties that matter most are negative ones, and both are tested here explicitly: the
 * verifier never returns `ok` for anything but a literal `success: true`, and the token never
 * appears in anything this module writes. Everything else is classification detail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyTurnstileToken, type TurnstileDependencies } from './verify';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** A dummy token of the shape Cloudflare's test sitekeys issue. */
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const SECRET = '1x0000000000000000000000000000000AA';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function harness(responses: (() => Promise<Response>)[]) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  let index = 0;

  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body;
    calls.push({
      url: String(url),
      body: body instanceof URLSearchParams ? body : new URLSearchParams(String(body)),
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next();
  }) as unknown as typeof fetch;

  const dependencies: Partial<TurnstileDependencies> = {
    fetchImpl,
    secret: () => SECRET,
    newIdempotencyKey: () => '11111111-2222-3333-4444-555555555555',
    timeoutMs: 50,
  };

  return { calls, dependencies, callCount: () => calls.length };
}

let consoleInfo: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Everything this module wrote anywhere, concatenated. */
function loggedOutput(): string {
  return [...consoleInfo.mock.calls, ...consoleError.mock.calls].flat().join('\n');
}

describe('a token that cannot be verified at all', () => {
  it('refuses an empty token without spending a request', async () => {
    const { dependencies, callCount } = harness([]);

    const result = await verifyTurnstileToken('', { dependencies });

    expect(result).toEqual({ ok: false, reason: 'rejected' });
    expect(callCount()).toBe(0);
  });

  it('refuses a token longer than Cloudflare accepts, also without a request', async () => {
    const { dependencies, callCount } = harness([]);

    const result = await verifyTurnstileToken('a'.repeat(2049), { dependencies });

    expect(result).toEqual({ ok: false, reason: 'rejected' });
    expect(callCount()).toBe(0);
  });
});

describe('a successful verification', () => {
  it('accepts only a literal success: true', async () => {
    const { dependencies } = harness([async () => jsonResponse({ success: true })]);

    await expect(verifyTurnstileToken(TOKEN, { dependencies })).resolves.toEqual({ ok: true });
  });

  it('posts the secret, the token and an idempotency key in the body, never in the URL', async () => {
    const { dependencies, calls } = harness([async () => jsonResponse({ success: true })]);

    await verifyTurnstileToken(TOKEN, { remoteIp: '203.0.113.7', dependencies });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(SITEVERIFY_URL);
    expect(calls[0].body.get('secret')).toBe(SECRET);
    expect(calls[0].body.get('response')).toBe(TOKEN);
    expect(calls[0].body.get('remoteip')).toBe('203.0.113.7');
    expect(calls[0].body.get('idempotency_key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('omits remoteip when the platform did not give one', async () => {
    const { dependencies, calls } = harness([async () => jsonResponse({ success: true })]);

    await verifyTurnstileToken(TOKEN, { dependencies });

    expect(calls[0].body.has('remoteip')).toBe(false);
  });

  it('writes nothing to the log on success', async () => {
    const { dependencies } = harness([async () => jsonResponse({ success: true })]);

    await verifyTurnstileToken(TOKEN, { dependencies });

    expect(loggedOutput()).toBe('');
  });
});

describe('a token Cloudflare refuses', () => {
  it.each([
    'invalid-input-response',
    'missing-input-response',
    'timeout-or-duplicate',
    'bad-request',
  ])('classifies %s as a rejection the visitor can retry', async (code) => {
    const { dependencies, callCount } = harness([
      async () => jsonResponse({ success: false, 'error-codes': [code] }),
    ]);

    const result = await verifyTurnstileToken(TOKEN, { dependencies });

    expect(result).toEqual({ ok: false, reason: 'rejected' });
    // A decision, not an incomplete attempt: a single-use token is never re-verified.
    expect(callCount()).toBe(1);
  });

  it('logs the machine code, which names the fault without naming the visitor', async () => {
    const { dependencies } = harness([
      async () => jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    ]);

    await verifyTurnstileToken(TOKEN, { dependencies });

    expect(loggedOutput()).toContain('timeout-or-duplicate');
    expect(loggedOutput()).toContain('registration.turnstile_failed');
  });
});

describe('a verification that could not be completed', () => {
  it('retries an internal-error exactly once, reusing the same idempotency key', async () => {
    const { dependencies, calls } = harness([
      async () => jsonResponse({ success: false, 'error-codes': ['internal-error'] }),
    ]);

    const result = await verifyTurnstileToken(TOKEN, { dependencies });

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(calls).toHaveLength(2);
    expect(calls[0].body.get('idempotency_key')).toBe(calls[1].body.get('idempotency_key'));
  });

  it('succeeds if the retry succeeds', async () => {
    const { dependencies } = harness([
      async () => jsonResponse({ success: false, 'error-codes': ['internal-error'] }),
      async () => jsonResponse({ success: true }),
    ]);

    await expect(verifyTurnstileToken(TOKEN, { dependencies })).resolves.toEqual({ ok: true });
  });

  it('treats a network fault as unavailable, never as valid', async () => {
    const { dependencies } = harness([
      async () => {
        throw new Error(`connect ECONNREFUSED while sending ${TOKEN}`);
      },
    ]);

    await expect(verifyTurnstileToken(TOKEN, { dependencies })).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('treats a non-2xx answer as unavailable', async () => {
    const { dependencies } = harness([async () => jsonResponse({ success: true }, 502)]);

    await expect(verifyTurnstileToken(TOKEN, { dependencies })).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it.each([
    ['a body that is not an object', 'null'],
    ['a body that is not JSON', 'not json at all'],
    ['a missing success field', JSON.stringify({ 'error-codes': [] })],
    ['a stringly-typed success field', JSON.stringify({ success: 'true' })],
    ['an unrecognised error code', JSON.stringify({ success: false, 'error-codes': ['nonsense'] })],
    ['a refusal with no code at all', JSON.stringify({ success: false })],
  ])('refuses on %s', async (_label, raw) => {
    const { dependencies } = harness([
      async () => new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } }),
    ]);

    const result = await verifyTurnstileToken(TOKEN, { dependencies });

    expect(result.ok).toBe(false);
  });
});

describe('a configuration fault', () => {
  it.each(['invalid-input-secret', 'missing-input-secret'])(
    'fails closed on %s and says so loudly',
    async (code) => {
      const { dependencies, callCount } = harness([
        async () => jsonResponse({ success: false, 'error-codes': [code] }),
      ]);

      const result = await verifyTurnstileToken(TOKEN, { dependencies });

      expect(result).toEqual({ ok: false, reason: 'unavailable' });
      // Our own mistake, not the visitor's: one attempt, and an error-level line naming it.
      expect(callCount()).toBe(1);
      expect(consoleError).toHaveBeenCalled();
      expect(loggedOutput()).toContain('registration.turnstile_misconfigured');
    },
  );
});

describe('what is never written down', () => {
  it.each([
    ['a rejection', async () => jsonResponse({ success: false, 'error-codes': ['bad-request'] })],
    ['a configuration fault', async () => jsonResponse({ success: false, 'error-codes': ['invalid-input-secret'] })],
    ['a malformed answer', async () => new Response('{', { status: 200 })],
    [
      'a network fault',
      async () => {
        throw new Error(`request failed: response=${TOKEN}`);
      },
    ],
  ])('keeps the token out of the log on %s', async (_label, respond) => {
    const { dependencies } = harness([respond as () => Promise<Response>]);

    await verifyTurnstileToken(TOKEN, { dependencies });

    expect(loggedOutput()).not.toContain(TOKEN);
    expect(loggedOutput()).not.toContain('DUMMY');
  });

  it('keeps the secret out of the log', async () => {
    const { dependencies } = harness([
      async () => jsonResponse({ success: false, 'error-codes': ['invalid-input-secret'] }),
    ]);

    await verifyTurnstileToken(TOKEN, { dependencies });

    expect(loggedOutput()).not.toContain(SECRET);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `lib/env.ts` validates at module load, so every case here re-imports it against a stubbed
 * environment. These tests are what make the "a missing variable fails the build, not the first
 * request" guarantee observable before any module imports it in Phase 3.
 */

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  NEXT_PUBLIC_SITE_URL: 'https://exemplo.com.br',
  SUPABASE_SECRET_KEY: 'sb_secret_example',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
} as const;

function stub(overrides: Partial<Record<keyof typeof VALID, string | undefined>> = {}) {
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    vi.stubEnv(key, value as string | undefined);
  }
}

async function loadEnv() {
  vi.resetModules();
  return import('./env');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a complete environment', () => {
  it('exposes the public values and the server values separately', async () => {
    stub();
    const env = await loadEnv();

    expect(env.client).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: VALID.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: VALID.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      NEXT_PUBLIC_SITE_URL: VALID.NEXT_PUBLIC_SITE_URL,
    });
    expect(env.server).toEqual({
      SUPABASE_SECRET_KEY: VALID.SUPABASE_SECRET_KEY,
      TURNSTILE_SECRET_KEY: VALID.TURNSTILE_SECRET_KEY,
    });
  });

  it('keeps no secret in the public object', async () => {
    stub();
    const env = await loadEnv();

    expect(Object.keys(env.client).every((key) => key.startsWith('NEXT_PUBLIC_'))).toBe(true);
    expect(JSON.stringify(env.client)).not.toContain('sb_secret_');
    expect(JSON.stringify(env.client)).not.toContain(VALID.TURNSTILE_SECRET_KEY);
  });
});

describe('an incomplete environment', () => {
  it.each([
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'NEXT_PUBLIC_SITE_URL',
    'SUPABASE_SECRET_KEY',
    'TURNSTILE_SECRET_KEY',
  ] as const)('fails at load when %s is missing, naming the variable', async (missing) => {
    stub({ [missing]: undefined });

    await expect(loadEnv()).rejects.toThrow(missing);
  });

  it('reports a missing variable as missing rather than as a type error', async () => {
    stub({ SUPABASE_SECRET_KEY: undefined });

    await expect(loadEnv()).rejects.toThrow(/SUPABASE_SECRET_KEY is missing/);
  });

  it('lists every offending variable in one message', async () => {
    stub({ NEXT_PUBLIC_SITE_URL: undefined, NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined });

    await expect(loadEnv()).rejects.toThrow(/NEXT_PUBLIC_TURNSTILE_SITE_KEY[\s\S]*NEXT_PUBLIC_SITE_URL/);
  });

  it('rejects a legacy Supabase JWT key, which would otherwise fail much later', async () => {
    stub({ SUPABASE_SECRET_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy.service_role' });

    await expect(loadEnv()).rejects.toThrow(/sb_secret_/);
  });

  it('rejects a publishable key in the wrong format', async () => {
    stub({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_wrong_slot' });

    await expect(loadEnv()).rejects.toThrow(/sb_publishable_/);
  });

  it('rejects a URL that is not absolute', async () => {
    stub({ NEXT_PUBLIC_SITE_URL: 'exemplo.com.br' });

    await expect(loadEnv()).rejects.toThrow(/NEXT_PUBLIC_SITE_URL must be an absolute URL/);
  });

  it('never puts a value in the message', async () => {
    const secret = 'sb_secret_do_not_log_me';
    stub({ NEXT_PUBLIC_SITE_URL: undefined, SUPABASE_SECRET_KEY: secret });

    await expect(loadEnv()).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  OTP_EXPIRY_SECONDS,
  OTP_LENGTH,
  OTP_RESEND_INTERVAL_SECONDS,
  SIGN_IN_COPY,
  failureMessage,
  signInCodeSchema,
  signInEmailSchema,
} from './sign-in';

/**
 * The screen quotes these numbers to the administrator. If Supabase is configured differently, the
 * countdown finishes and the resend still fails, or the field truncates a code that is longer than
 * the field allows. Reading the real configuration is the only way to keep the promise honest.
 */
describe('OTP constants match the local Supabase configuration', () => {
  const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');

  function authEmailValue(key: string): string {
    const section = config.slice(config.indexOf('[auth.email]'));
    const match = section.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n#]+)"?`, 'm'));
    if (!match) throw new Error(`[auth.email] ${key} not found in supabase/config.toml`);
    return match[1].trim();
  }

  it('otp_length', () => {
    expect(Number(authEmailValue('otp_length'))).toBe(OTP_LENGTH);
  });

  it('max_frequency drives the resend countdown', () => {
    expect(authEmailValue('max_frequency')).toBe(`${OTP_RESEND_INTERVAL_SECONDS}s`);
  });

  it('otp_expiry drives the expiry wording', () => {
    expect(Number(authEmailValue('otp_expiry'))).toBe(OTP_EXPIRY_SECONDS);
  });

  it('the e-mail template carries the numeric token, not only a link', () => {
    const template = readFileSync(
      new URL('../../supabase/templates/magic_link.html', import.meta.url),
      'utf8',
    );
    expect(template).toContain('{{ .Token }}');
  });

  it('public sign-up is disabled at the project level', () => {
    const authSection = config.slice(config.indexOf('\n[auth]'), config.indexOf('[auth.rate_limit]'));
    expect(authSection).toMatch(/^enable_signup = false$/m);
  });
});

describe('copy', () => {
  it('never leaks a backend detail into a user-facing string', () => {
    const strings = JSON.stringify(SIGN_IN_COPY) + failureMessage('ABC123');
    for (const forbidden of ['supabase', 'jwt', 'token_hash', 'otp_disabled', 'sql', 'postgres']) {
      expect(strings.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('says the same thing about a wrong code and an expired one', () => {
    expect(SIGN_IN_COPY.errors.invalidCode).toBe(
      'Código inválido ou expirado. Peça um novo código.',
    );
  });

  it('carries the correlation code on a failure so it can be reported without personal data', () => {
    expect(failureMessage('ABC123')).toContain('ABC123');
    expect(failureMessage()).toBe(SIGN_IN_COPY.errors.failed);
  });
});

describe('signInEmailSchema', () => {
  it('normalises case and surrounding whitespace', () => {
    expect(signInEmailSchema.parse('  Igor@Exemplo.com ')).toBe('igor@exemplo.com');
  });

  it('rejects a non-address with the pt-BR message', () => {
    const result = signInEmailSchema.safeParse('igor');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(SIGN_IN_COPY.errors.invalidEmail);
  });
});

describe('signInCodeSchema', () => {
  it('accepts a pasted code with separators', () => {
    expect(signInCodeSchema.parse('091 417')).toBe('091417');
    expect(signInCodeSchema.parse(' 091-417 ')).toBe('091417');
  });

  it.each(['12345', '1234567', 'abcdef', '', '12 34 5a'])('rejects %o', (candidate) => {
    expect(signInCodeSchema.safeParse(candidate).success).toBe(false);
  });
});

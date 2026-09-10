import { describe, expect, it } from 'vitest';

import {
  applyPhoneMask,
  formatForDisplay,
  isValidMobile,
  normalizeMobile,
  VALID_DDDS,
} from './phone';

describe('normalizeMobile', () => {
  it.each([
    ['+55 (19) 99123-4567', '+5519991234567'],
    ['19991234567', '+5519991234567'],
    ['5519991234567', '+5519991234567'],
    ['(19) 99123-4567', '+5519991234567'],
    ['(19)99123-4567', '+5519991234567'],
    ['+55 19 99123-4567', '+5519991234567'],
    ['19 99123 4567', '+5519991234567'],
    ['  (11) 98765-4321  ', '+5511987654321'],
    ['+5511987654321', '+5511987654321'],
    ['21 99999-0000', '+5521999990000'],
    ['9899123-4567', '+5598991234567'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeMobile(input)).toEqual({ ok: true, e164: expected });
  });

  it.each([
    ['(19) 3199-1234', 'landline'],
    ['1931991234', 'landline'],
    ['+55 19 3199-1234', 'landline'],
    ['551931991234', 'landline'], // twelve digits with a country code leaves ten
  ])('rejects %s as a landline', (input, reason) => {
    expect(normalizeMobile(input)).toEqual({ ok: false, reason });
  });

  it.each([
    ['(10) 99123-4567'], // 10 is not an allocated DDD
    ['(20) 99123-4567'],
    ['(23) 99123-4567'],
    ['(00) 99123-4567'],
    ['19891234567'], // eleven digits, third digit is not 9 — a typo, not a landline
    ['11111111111'],
    ['99999999999'],
    ['00000000000'],
    ['1999123456'.slice(0, 5)], // far too short
    ['199912345'], // nine digits
    ['199912345678'], // twelve digits, no country code
    ['199912345678901234567890123456'], // a 30-character paste
    ['abcdefghijk'], // letters only strip to nothing... see the empty case
    ['ligar para o joão'],
  ])('rejects %s', (input) => {
    const result = normalizeMobile(input);
    expect(result.ok).toBe(false);
  });

  it('reserves the landline message for the ten-digit case', () => {
    // An eleven-digit number whose third digit is not 9 is a typo. Telling that person their
    // number looks like a landline would point them at the wrong mistake.
    expect(normalizeMobile('19891234567')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports letters with no digits as empty rather than invalid', () => {
    expect(normalizeMobile('abcdefghijk')).toEqual({ ok: false, reason: 'empty' });
  });

  it('reports an empty string as empty', () => {
    expect(normalizeMobile('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeMobile('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeMobile('()- ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('recovers a number pasted inside surrounding text, because step 1 keeps only digits', () => {
    expect(normalizeMobile('meu numero e 19991234567 ok?')).toEqual({
      ok: true,
      e164: '+5519991234567',
    });
  });

  it('rejects a paste that carries extra digits alongside the number', () => {
    expect(normalizeMobile('ramal 22 - 19991234567')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('is idempotent on its own output', () => {
    const first = normalizeMobile('19991234567');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(normalizeMobile(first.e164)).toEqual(first);
  });
});

describe('isValidMobile', () => {
  it('agrees with normalizeMobile', () => {
    expect(isValidMobile('(19) 99123-4567')).toBe(true);
    expect(isValidMobile('(19) 3199-1234')).toBe(false);
  });
});

describe('VALID_DDDS', () => {
  it('contains Hortolândia', () => {
    expect(VALID_DDDS.has('19')).toBe(true);
  });

  it('excludes the unallocated codes', () => {
    for (const ddd of ['10', '20', '23', '25', '26', '29', '30', '36', '39', '40', '50']) {
      expect(VALID_DDDS.has(ddd)).toBe(false);
    }
  });
});

describe('applyPhoneMask', () => {
  it.each([
    ['', ''],
    ['1', '(1'],
    ['19', '(19'],
    ['199', '(19) 9'],
    ['1999123', '(19) 99123'],
    ['19991234', '(19) 99123-4'],
    ['19991234567', '(19) 99123-4567'],
  ])('masks %s progressively', (input, expected) => {
    expect(applyPhoneMask(input)).toBe(expected);
  });

  it('filters non-digits silently so a formatted paste survives', () => {
    expect(applyPhoneMask('+55 (19) 99123-4567')).toBe('(55) 19991-2345');
    expect(applyPhoneMask('19-99123.4567')).toBe('(19) 99123-4567');
  });

  it('caps the visible value at fifteen characters', () => {
    expect(applyPhoneMask('199912345679999999')).toBe('(19) 99123-4567');
    expect(applyPhoneMask('199912345679999999')).toHaveLength(15);
  });

  it('lets deletion work naturally by never adding a trailing separator', () => {
    expect(applyPhoneMask('(19) ')).toBe('(19');
    expect(applyPhoneMask('(19) 99123-')).toBe('(19) 99123');
  });

  it('is not a validation rule', () => {
    expect(applyPhoneMask('00000000000')).toBe('(00) 00000-0000');
    expect(isValidMobile('(00) 00000-0000')).toBe(false);
  });
});

describe('formatForDisplay', () => {
  it('turns a canonical value back into the display form', () => {
    expect(formatForDisplay('+5519991234567')).toBe('(19) 99123-4567');
    expect(formatForDisplay('+5511987654321')).toBe('(11) 98765-4321');
  });

  it('round-trips with normalizeMobile', () => {
    const result = normalizeMobile('(19) 99123-4567');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatForDisplay(result.e164)).toBe('(19) 99123-4567');
  });

  it('returns a non-canonical value untouched rather than mangling it', () => {
    expect(formatForDisplay('19991234567')).toBe('19991234567');
    expect(formatForDisplay('')).toBe('');
    expect(formatForDisplay('+1 555 0100')).toBe('+1 555 0100');
  });
});

/**
 * Brazilian mobile phone handling — PRODUCT-SPEC.md section 5.
 *
 * Two representations exist and must not be confused:
 *   - display, `(19) 99123-4567`, what a person sees and types;
 *   - canonical, `+5519991234567`, what the database stores and matches on.
 *
 * This module is the only implementation of the normalization algorithm. The client runs it for
 * feedback and the Server Action runs it for truth; the server result is the only one stored.
 * No I/O, no React.
 */

/**
 * Valid Brazilian area codes (DDDs), PRODUCT-SPEC.md section 5.3.
 *
 * The allowlist lives here rather than in the database because ANATEL changes it. The database
 * keeps a shape-only check (`^\+55[1-9]{2}9[0-9]{8}$`) as a durable backstop.
 */
export const VALID_DDDS: ReadonlySet<string> = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

/** Why a phone number was rejected. `landline` gets its own message (section 6.2). */
export type PhoneError = 'empty' | 'landline' | 'invalid';

export type PhoneNormalization =
  | { readonly ok: true; readonly e164: string }
  | { readonly ok: false; readonly reason: PhoneError };

const DIGITS_ONLY = /\D/g;

/**
 * The eight-step normalization from PRODUCT-SPEC.md section 5.2.
 *
 * Accepts any input a person might type or paste — `+55 (19) 99123-4567`, `19991234567`,
 * `5519991234567`, `(19) 99123-4567` — and returns the canonical E.164 value or the reason it
 * cannot be one.
 */
export function normalizeMobile(input: string): PhoneNormalization {
  // 1. Strip everything that is not a digit.
  let digits = input.replace(DIGITS_ONLY, '');

  if (digits.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  // 2 and 3. Drop a leading country code. Twelve digits leaves ten, which fails step 4 — that is
  // how a landline written with a country code is correctly rejected.
  if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }

  // 4. Require exactly eleven digits. Ten digits is the landline shape and earns its own message.
  if (digits.length !== 11) {
    return { ok: false, reason: digits.length === 10 ? 'landline' : 'invalid' };
  }

  // 5. The area code must be a real one.
  if (!VALID_DDDS.has(digits.slice(0, 2))) {
    return { ok: false, reason: 'invalid' };
  }

  // 6. Brazilian mobile numbers are nine digits beginning with 9. This is what separates a mobile
  // from a landline, and the requirement is for a mobile.
  //
  // The reason is `invalid`, not `landline`: section 5.2 reserves the landline message for the
  // ten-digit case at step 4, which is what a person who typed an actual landline produces. An
  // eleven-digit number with a wrong third digit is a typo, and telling that person their number
  // "looks like a landline" would send them looking for the wrong mistake.
  if (digits[2] !== '9') {
    return { ok: false, reason: 'invalid' };
  }

  // 7. Reject eleven identical digits — `11111111111` satisfies every rule above and is nobody's
  // phone number.
  if (digits.split('').every((digit) => digit === digits[0])) {
    return { ok: false, reason: 'invalid' };
  }

  // 8.
  return { ok: true, e164: `+55${digits}` };
}

/** True when `input` normalizes to a canonical Brazilian mobile number. */
export function isValidMobile(input: string): boolean {
  return normalizeMobile(input).ok;
}

/**
 * The display mask, `(DD) 9NNNN-NNNN`, applied as a person types.
 *
 * A typing aid, never the validation: `(00) 00000-0000` satisfies this function and is rejected by
 * `normalizeMobile`. Non-digits are filtered silently rather than refused, so pasting
 * `+55 19 99123-4567` works; the visible result is capped at fifteen characters.
 */
export function applyPhoneMask(input: string): string {
  const digits = input.replace(DIGITS_ONLY, '').slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * The inverse of the mask: a canonical `+5519991234567` back to `(19) 99123-4567` for display.
 *
 * A value that is not canonical is returned unchanged rather than mangled — an admin list is a bad
 * place to hide a data problem behind a pretty string.
 */
export function formatForDisplay(e164: string): string {
  if (!/^\+55\d{11}$/.test(e164)) return e164;

  return applyPhoneMask(e164.slice(3));
}

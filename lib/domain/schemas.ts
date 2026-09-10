/**
 * Zod schemas shared by the client and the server — PRODUCT-SPEC.md sections 4.3 and 6.2.
 *
 * One definition, two consumers. On the client these schemas exist for UX; the Server Action parses
 * the same schemas again and that parse is the authoritative one. Client-side validation is never a
 * security boundary.
 *
 * Messages are the pt-BR copy from section 6.2 verbatim, attached to the schema so an error can
 * never reach a person as `Invalid input`.
 */
import { z } from 'zod';

import { normalizeMobile } from './phone';

export const NAME_MAX_LENGTH = 120;
export const AGE_MIN = 1;
export const AGE_MAX = 120;

const WHITESPACE_RUN = /\s+/g;

/**
 * Trim and collapse runs of internal whitespace. The name is otherwise stored exactly as entered:
 * title-casing destroys `de Souza`, `d'Ávila` and `McCarthy`.
 */
export function normalizeName(input: string): string {
  return input.trim().replace(WHITESPACE_RUN, ' ');
}

/**
 * No character allowlist. Cross-site scripting is prevented by React's escaping, not by rejecting
 * apostrophes in people's names; CSV formula injection is handled at export time.
 * A single-word name is valid — many people have one.
 */
export const nameSchema = z
  .string({ error: 'Informe seu nome.' })
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(1, { error: 'Informe seu nome.' })
      .min(2, { error: 'Informe seu nome completo.' })
      .max(NAME_MAX_LENGTH, { error: 'Informe seu nome completo.' }),
  );

/**
 * A technical plausibility bound, not an eligibility rule — no business age restriction exists in
 * the source material. Accepts the string an `inputmode="numeric"` field produces.
 */
export const ageSchema = z
  .union([z.string(), z.number()], { error: 'Informe sua idade.' })
  .transform((value, ctx) => {
    const raw = typeof value === 'number' ? String(value) : value.trim();

    if (raw.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Informe sua idade.' });
      return z.NEVER;
    }

    // Deliberately strict: `18a`, `1.5` and `1e2` are typing accidents, not ages.
    if (!/^\d+$/.test(raw)) {
      ctx.addIssue({ code: 'custom', message: 'Informe uma idade válida.' });
      return z.NEVER;
    }

    const age = Number(raw);

    if (age < AGE_MIN || age > AGE_MAX) {
      ctx.addIssue({ code: 'custom', message: 'Informe uma idade válida.' });
      return z.NEVER;
    }

    return age;
  });

/**
 * Produces the canonical E.164 value, never the masked one. A ten-digit number gets the specific
 * landline message so the person knows what to change.
 */
export const phoneSchema = z
  .string({ error: 'Informe seu celular.' })
  .transform((value, ctx) => {
    const result = normalizeMobile(value);

    if (result.ok) return result.e164;

    ctx.addIssue({
      code: 'custom',
      message:
        result.reason === 'empty'
          ? 'Informe seu celular.'
          : result.reason === 'landline'
            ? 'Esse número parece ser um telefone fixo. Informe um celular com 9 dígitos.'
            : 'Informe um celular válido com DDD. Ex.: (19) 99999-9999.',
    });

    return z.NEVER;
  });

/** The three public fields. The output is what is stored, not what was typed. */
export const registrationInputSchema = z.object({
  name: nameSchema,
  age: ageSchema,
  phone: phoneSchema,
});

export type RegistrationInput = z.input<typeof registrationInputSchema>;
export type RegistrationValues = z.output<typeof registrationInputSchema>;

/**
 * Admin settings — ADMIN-SPEC.md section 5.1, PRODUCT-SPEC.md section 8.1.
 *
 * The cross-field rules that protect the event (capacity below `confirmed_count`, opening with
 * capacity 0) are enforced in the database, which is the only place they can hold. What is checked
 * here is shape plus the one rule that needs no server state, so the refusal is anticipated in the
 * form rather than discovered on save.
 *
 * `settingsVersion` is the optimistic-concurrency token and is a counter of *settings* changes —
 * never `updated_at`, which a registration bumps.
 */
export const settingsInputSchema = z
  .object({
    capacity: z
      .union([z.string(), z.number()], { error: 'Informe a capacidade.' })
      .transform((value, ctx) => {
        const raw = typeof value === 'number' ? String(value) : value.trim();

        if (!/^\d+$/.test(raw)) {
          ctx.addIssue({ code: 'custom', message: 'Informe uma capacidade válida.' });
          return z.NEVER;
        }

        return Number(raw);
      }),
    waitlistEnabled: z.boolean({ error: 'Informe o estado da lista de espera.' }),
    registrationState: z.enum(['open', 'closed'], {
      error: 'Informe o estado das inscrições.',
    }),
    settingsVersion: z.number().int().nonnegative(),
  })
  .refine((value) => !(value.registrationState === 'open' && value.capacity === 0), {
    error: 'Defina a capacidade antes de abrir as inscrições.',
    path: ['capacity'],
  });

export type SettingsInput = z.input<typeof settingsInputSchema>;
export type SettingsValues = z.output<typeof settingsInputSchema>;

/**
 * Inviting an administrator — ADMIN-SPEC.md section 6.2. Inviting someone grants full access to
 * every participant's personal data, so the address is validated rather than assumed.
 */
export const inviteInputSchema = z.object({
  email: z
    .string({ error: 'Informe o e-mail.' })
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.email({ error: 'Informe um e-mail válido.' })),
});

export type InviteInput = z.input<typeof inviteInputSchema>;
export type InviteValues = z.output<typeof inviteInputSchema>;

/**
 * Flattens a failed parse into one message per field, which is the shape both the error summary and
 * the field-level messages need. The first issue wins: showing a person two reasons why the same
 * field is wrong helps nobody.
 */
export function fieldErrors<T>(error: z.ZodError<T>): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path.join('.') || '_form';
    errors[field] ??= issue.message;
  }

  return errors;
}

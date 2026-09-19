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

import { identityKey } from './identity';
import { normalizeMobile } from './phone';

export const NAME_MAX_LENGTH = 120;

/**
 * The technical plausibility bounds. They match `registrations.reg_age_range` and are the bounds an
 * **administrator's correction** is held to, because correcting a record is not registering online.
 */
export const AGE_MIN = 1;
export const AGE_MAX = 120;

/**
 * The **online eligibility floor** — the operating policy answer to DECISIONS.md Q7.
 *
 * Someone younger than this does not complete the public flow; they are directed to the
 * organization's e-mail address instead. Deliberately not a parental-consent checkbox: the product
 * collects three fields, and adding a guardian field to satisfy a tick box would collect more
 * personal data about a child, not less.
 *
 * This constant is the *client and Server Action* half of the rule. The authority is
 * `events.min_age`, checked inside `register_for_event()` under the event row lock, so a direct
 * POST that skips every schema still cannot store an ineligible registration.
 */
export const PUBLIC_AGE_MIN = 12;

/** The organization's published contact address (launch brief). */
export const ORGANIZATION_EMAIL = 'contato@euqueroadh.com';

/** One sentence, used by the field error, the outcome panel and the field hint alike. */
export const AGE_BELOW_MINIMUM_MESSAGE =
  `A inscrição online é para ${PUBLIC_AGE_MIN} anos ou mais. ` +
  `Para participantes mais novos, fale com a organização: ${ORGANIZATION_EMAIL}`;

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
 * The public field. Accepts the string an `inputmode="numeric"` field produces, and applies the
 * eligibility floor with its own message, so someone who is too young reads where to go rather
 * than `Informe uma idade válida.`
 *
 * The two rules are kept distinct on purpose: a typo (`0`, `250`) is a correction, and an
 * ineligible age is a redirection. Collapsing them into one message would tell a ten-year-old that
 * their age is invalid, which is both untrue and unhelpful.
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

    if (age < PUBLIC_AGE_MIN) {
      ctx.addIssue({ code: 'custom', message: AGE_BELOW_MINIMUM_MESSAGE });
      return z.NEVER;
    }

    return age;
  });

/**
 * The same field for an **administrator's correction** (ADMIN-SPEC.md section 4.4).
 *
 * It stops at the technical bounds and does not apply the online floor: an organizer fixing `81`
 * typed as `18` is recording what is true, and a record that already exists is not a new online
 * registration. `edit_registration()` validates the identical 1–120 range server-side.
 */
export const adminAgeSchema = z
  .union([z.string(), z.number()], { error: 'Informe a idade.' })
  .transform((value, ctx) => {
    const raw = typeof value === 'number' ? String(value) : value.trim();

    if (raw.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Informe a idade.' });
      return z.NEVER;
    }

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

const REGISTRATION_FIELD_SCHEMAS = {
  name: nameSchema,
  age: ageSchema,
  phone: phoneSchema,
} as const;

export type RegistrationFieldName = keyof typeof REGISTRATION_FIELD_SCHEMAS;

/**
 * One field, validated on its own, for the browser's blur-and-correct feedback
 * (PRODUCT-SPEC.md section 4.3).
 *
 * The same schema as the submit path, applied to one key — not a parallel set of rules. Whatever
 * this returns is a hint: the Server Action parses the whole object again and that parse is the
 * authoritative one.
 */
export function validateRegistrationField(
  field: RegistrationFieldName,
  value: string,
): string | null {
  const result = REGISTRATION_FIELD_SCHEMAS[field].safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

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

/* ------------------------------------------------------------------------------------------------
 * Guest identification — self check-in and the certificate portal
 * ---------------------------------------------------------------------------------------------- */

/** A first name is one word in practice and never a paragraph; 60 characters is generous for both. */
export const FIRST_NAME_MAX_LENGTH = 60;

/**
 * The first name a guest types to identify themselves.
 *
 * Validated on **canonical emptiness**, not on raw emptiness: a field holding only spaces, a tab or a
 * non-breaking space is not an answer, and `identityKey` is the same reduction the database applies
 * before it matches. Everything else is accepted as typed — the value is a lookup key, never stored,
 * and the matching rule is `public.registration_identity_key()`, which this schema does not duplicate.
 *
 * No character allowlist, for the reason `nameSchema` gives: rejecting apostrophes in people's names
 * is not how cross-site scripting is prevented, and it is how `d'Ávila` gets turned away at the door.
 */
export const firstNameSchema = z
  .string({ error: 'Informe seu primeiro nome.' })
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .max(FIRST_NAME_MAX_LENGTH, { error: 'Informe apenas o primeiro nome.' })
      .refine((value) => identityKey(value).length > 0, {
        error: 'Informe seu primeiro nome.',
      }),
  );

/**
 * The age a guest types to break an ambiguity.
 *
 * It applies the **technical** bounds (1–120) and deliberately not `PUBLIC_AGE_MIN`. The person is
 * already registered: their stored age is whatever the record says, and an organizer may have entered
 * a younger participant by hand through the channel PRODUCT-SPEC.md § 12.1 describes. Applying the
 * online eligibility floor here would refuse that person their own check-in and their own certificate,
 * which is a different rule wearing the same number.
 */
export const identificationAgeSchema = adminAgeSchema;

/**
 * Self check-in — PART A of the launch brief.
 *
 * `firstName` and `age` are optional because the flow **asks for them progressively**: the first
 * submission carries a telephone number alone. An empty string means "not supplied yet" and becomes
 * `null`, which is what the RPC reads as "do not narrow on this field"; it never becomes a value that
 * would narrow the candidate set with something the guest did not say.
 */
export const checkInInputSchema = z.object({
  phone: phoneSchema,
  firstName: z
    .string()
    .optional()
    .transform((value) => value ?? '')
    .transform((value, ctx) => {
      if (value.trim().length === 0) return null;
      const parsed = firstNameSchema.safeParse(value);
      if (parsed.success) return parsed.data;
      ctx.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message ?? 'Informe seu primeiro nome.' });
      return z.NEVER;
    }),
  age: z
    .string()
    .optional()
    .transform((value) => value ?? '')
    .transform((value, ctx) => {
      if (value.trim().length === 0) return null;
      const parsed = identificationAgeSchema.safeParse(value);
      if (parsed.success) return parsed.data;
      ctx.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message ?? 'Informe uma idade válida.' });
      return z.NEVER;
    }),
});

export type CheckInValues = z.output<typeof checkInInputSchema>;

/**
 * The certificate portal — PART B of the launch brief.
 *
 * Identical in shape to check-in except that **`firstName` is mandatory**. That is the whole of the
 * "slightly stronger identity flow" the brief asks for, and it is stated here as a schema rather than
 * as a comment: `/certificado` is reachable for as long as the site exists, with no operator present
 * and no session bounding it, so it opens with two facts instead of one.
 */
export const certificateLookupSchema = z.object({
  phone: phoneSchema,
  firstName: firstNameSchema,
  age: z
    .string()
    .optional()
    .transform((value) => value ?? '')
    .transform((value, ctx) => {
      if (value.trim().length === 0) return null;
      const parsed = identificationAgeSchema.safeParse(value);
      if (parsed.success) return parsed.data;
      ctx.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message ?? 'Informe uma idade válida.' });
      return z.NEVER;
    }),
});

export type CertificateLookupValues = z.output<typeof certificateLookupSchema>;

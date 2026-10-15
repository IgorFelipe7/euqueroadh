/**
 * The sign-in surface's contract: the OTP parameters the screen depends on, the closed set of
 * outcomes a sign-in attempt can produce, and the pt-BR copy for each one.
 *
 * Pure and runtime-agnostic — imported by the sign-in Client Component and by the server code in
 * `lib/data/auth.ts`, so the screen and the boundary can never disagree about what an outcome means.
 *
 * ## Why these numbers live here
 *
 * They mirror Supabase Auth configuration, and a screen that quotes a number the platform does not
 * enforce is a lie the user discovers at the worst moment. Local development is configured to match
 * in `supabase/config.toml` (`[auth.email] otp_length`, `max_frequency`, `otp_expiry`), and
 * `lib/auth/sign-in.test.ts` fails if the two drift apart. The hosted project carries the same
 * values in its dashboard — that is a line item on the launch checklist (DECISIONS.md Q5), not an
 * assumption this file is allowed to make silently.
 */
import { z } from 'zod';

import { DEMO_COPY } from '@/lib/demo-copy';

/** `[auth.email] otp_length`. Drives the code field's `maxlength` and the copy. */
export const OTP_LENGTH = 6;

/**
 * `[auth.email] max_frequency`. Supabase refuses a second e-mail to the same address inside this
 * window, so the resend button counts down instead of producing an error the visitor cannot act on.
 */
export const OTP_RESEND_INTERVAL_SECONDS = 60;

/** `[auth.email] otp_expiry`. Quoted by the sign-in e-mail template. */
export const OTP_EXPIRY_SECONDS = 3600;

/** How the expiry is said in Portuguese. Derived from the constant so the two cannot diverge. */
export const OTP_EXPIRY_LABEL = `${OTP_EXPIRY_SECONDS / 3600} hora`;

/**
 * What a code request produced, as far as the visitor is concerned.
 *
 * There are deliberately only three. `sent` covers both a known and an unknown address: with
 * `shouldCreateUser: false` Supabase answers differently for the two, and collapsing that
 * difference here is what stops the sign-in page from becoming an administrator-enumeration oracle
 * (DATABASE-SECURITY.md section 7.1.1). The real distinction is logged server-side.
 */
export type OtpRequestOutcome = 'sent' | 'invalid_email' | 'failed';

/**
 * What a code submission produced. A wrong code, an expired code, a code for an address with no
 * account and a code already used all map to `invalid_code` — the same message, no attempt counter
 * (ADMIN-SPEC.md section 2).
 */
export type OtpVerifyOutcome = 'signed_in' | 'invalid_code' | 'failed';

/**
 * The two screens of ADMIN-SPEC.md section 2, as a state machine.
 *
 * ## Why this lives here and not beside the Server Actions that produce it
 *
 * A `'use server'` module may export nothing but async functions. Next does not refuse the others:
 * it compiles every export into a **server reference**, so a constant exported from `actions.ts`
 * reached the browser as a callable stub whose `step` was `undefined` — and the form, reading
 * `state.step === 'request'`, silently rendered the *code* screen to someone who had not asked for
 * a code yet. It survived `next build` and every unit test, and only an end-to-end run against the
 * built application could see it.
 *
 * A value shared by a Client Component and a Server Action belongs in a plain module both may
 * import. This file already is that module for the copy and the schemas.
 */
export type SignInState =
  | { readonly step: 'request'; readonly email: string; readonly error?: string }
  | {
      readonly step: 'verify';
      readonly email: string;
      readonly error?: string;
      readonly notice?: string;
      /** Epoch milliseconds of the last successful send, for the resend countdown. */
      readonly sentAt: number;
    };

export const INITIAL_SIGN_IN_STATE: SignInState = { step: 'request', email: '' };

/**
 * Every string the sign-in screen renders. Copy is the specification (ADMIN-SPEC.md section 2), so
 * it lives beside the outcomes rather than inline in JSX.
 */
export const SIGN_IN_COPY = {
  request: {
    heading: 'Entrar',
    intro: 'Informe o e-mail da sua conta de organizador.',
    emailLabel: 'E-mail',
    submit: 'Enviar código',
    submitting: 'Enviando…',
    footnote: 'O acesso é restrito a organizadores convidados.',
  },
  verify: {
    heading: 'Verifique seu e-mail',
    intro: (email: string) => `Enviamos um código de ${OTP_LENGTH} dígitos para ${email}.`,
    codeLabel: 'Código',
    codeHint: `O código expira em ${OTP_EXPIRY_LABEL} e só pode ser usado uma vez.`,
    submit: 'Entrar',
    submitting: 'Entrando…',
    useAnotherEmail: 'Usar outro e-mail',
    resend: 'Reenviar código',
    resendIn: (seconds: number) => `Reenviar código (${seconds}s)`,
    resent: 'Enviamos um novo código.',
  },
  errors: {
    invalidEmail: 'Informe um e-mail válido.',
    invalidCode: 'Código inválido ou expirado. Peça um novo código.',
    missingCode: `Informe o código de ${OTP_LENGTH} dígitos.`,
    failed: 'Não foi possível concluir agora. Tente novamente em instantes.',
  },
  reasons: {
    'sessao-expirada': 'Sua sessão expirou. Entre novamente.',
    'link-invalido': 'O link expirou ou já foi usado. Peça um novo código.',
    'demo-indisponivel': DEMO_COPY.unavailable,
  },
  noAccess: {
    heading: 'Sua conta não tem acesso a esta área',
    body: 'Se você deveria ter acesso, peça a um organizador para incluir seu e-mail.',
    signOut: 'Sair',
  },
} as const;

/**
 * The address as typed. Trimmed and lower-cased before it reaches Supabase so that
 * `Igor@Exemplo.com ` and `igor@exemplo.com` are one account and not two sign-in attempts.
 * The server parses this again; the client parse exists only to spare a round trip.
 */
export const signInEmailSchema = z
  .string({ error: SIGN_IN_COPY.errors.invalidEmail })
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.email({ error: SIGN_IN_COPY.errors.invalidEmail }));

/**
 * The one-time code. Spaces and the separators a password manager or a paste can introduce are
 * stripped before length is judged — `091 417` is the same code as `091417`, and refusing it would
 * be a self-inflicted failure. Anything that is not exactly `OTP_LENGTH` digits after that is
 * rejected locally, without spending a verification attempt.
 */
export const signInCodeSchema = z
  .string({ error: SIGN_IN_COPY.errors.missingCode })
  .transform((value) => value.replace(/[\s.\-–—]/g, ''))
  .pipe(
    z
      .string()
      .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), { error: SIGN_IN_COPY.errors.missingCode }),
  );

/** The message for a failed attempt, with the correlation code an organizer can quote. */
export function failureMessage(correlationId?: string): string {
  return correlationId
    ? `${SIGN_IN_COPY.errors.failed} (código ${correlationId})`
    : SIGN_IN_COPY.errors.failed;
}

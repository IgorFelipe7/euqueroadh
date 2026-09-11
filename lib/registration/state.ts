/**
 * The shape the registration form and its Server Action agree on, plus the pt-BR strings the form
 * renders.
 *
 * **Why this is not in `app/actions/register.ts`.** A `'use server'` module compiles *every* export
 * into a server reference, including the ones that are not functions — a constant exported from an
 * actions file arrives in the browser as a callable stub rather than as its value. The sign-in flow
 * learned that the expensive way in Phase 3 (`lib/auth/sign-in.ts` records it), and a structural
 * test now enforces it. Shared state and shared copy live here.
 *
 * No `server-only` guard: this module is imported by the Client Component on purpose. Nothing in it
 * touches the environment, the database or a secret.
 */
import type { RegistrationOutcome } from '@/lib/domain/outcomes';

/** The three fields, and nothing else. Adding a fourth is a product decision, not a code change. */
export const REGISTRATION_FIELDS = ['name', 'age', 'phone'] as const;
export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];

/**
 * The name Turnstile gives the hidden input it injects into the form. Fixed by Cloudflare, so it is
 * written once here rather than spelled out at both ends of the request.
 */
export const TURNSTILE_FIELD_NAME = 'cf-turnstile-response';

/**
 * What the Server Action returns, and therefore what crosses to the browser.
 *
 * Narrow by design (ARCHITECTURE.md section 5, rule 5): an outcome, the messages that explain it,
 * and the values the person typed so a recoverable failure does not empty the form. No row, no
 * identifier, no database text.
 */
export interface RegistrationFormState {
  /**
   * `null` while the person is still editing. A terminal outcome replaces the fieldset with the
   * outcome panel; `invalid` and `error` are not terminal and never appear here — they are carried
   * by `fieldErrors` and `formError`, which leave the form editable.
   */
  readonly outcome: RegistrationOutcome | null;
  /** One message per field, keyed by field name, in the order the form renders them. */
  readonly fieldErrors: Partial<Record<RegistrationField, string>>;
  /** A whole-form failure: anti-abuse, offline, or our own fault. */
  readonly formError: string | null;
  /** Shown in small type beside `formError`, so support can find the log line. */
  readonly correlationId: string | null;
  /** Preserved across recoverable failures. A bad phone number must not erase the name. */
  readonly values: Record<RegistrationField, string>;
  /**
   * Bumped whenever the previous Turnstile token can no longer be reused, which makes the widget
   * reset and produce a fresh one. Tokens are single-use and live 300 seconds.
   */
  readonly challengeNonce: number;
}

export const EMPTY_VALUES: Record<RegistrationField, string> = { name: '', age: '', phone: '' };

export const INITIAL_REGISTRATION_STATE: RegistrationFormState = {
  outcome: null,
  fieldErrors: {},
  formError: null,
  correlationId: null,
  values: EMPTY_VALUES,
  challengeNonce: 0,
};

/**
 * Field copy — PRODUCT-SPEC.md section 4.2, verbatim.
 *
 * A placeholder is never a substitute for a label, so there are none: every field has a visible
 * `<label>`, and the hint is associated through `aria-describedby` rather than implied.
 */
export const FIELD_COPY: Readonly<
  Record<RegistrationField, { readonly label: string; readonly hint: string | null }>
> = {
  name: { label: 'Nome completo', hint: null },
  age: { label: 'Idade', hint: 'Sua idade em anos' },
  phone: { label: 'Celular', hint: 'Com DDD. Ex.: (19) 99999-9999' },
};

/** Form chrome — PRODUCT-SPEC.md section 11, "Key strings". */
export const FORM_COPY = {
  heading: 'Faça sua inscrição',
  subheading: 'Leva menos de um minuto. Inscrição gratuita.',
  legend: 'Dados da inscrição',
  submit: 'Confirmar inscrição',
  submitting: 'Confirmando…',
  /** Added under the button after six seconds of waiting (section 7.2). Never a timeout. */
  stillWaiting: 'Ainda estamos confirmando sua inscrição…',
  errorSummaryHeading: 'Verifique estes campos',
  privacy: 'Usamos seus dados apenas para organizar este evento.',
  challengeLabel: 'Verificação de segurança',
  noScript: 'Para se inscrever, ative o JavaScript no seu navegador.',
} as const;

/** How long a pending submission waits before it reassures instead of just spinning. */
export const STILL_WAITING_AFTER_MS = 6_000;

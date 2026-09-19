/**
 * The shape the certificate portal's form and its Server Action agree on, plus the pt-BR strings the
 * form renders.
 *
 * **Why this is not in `app/actions/certificate.ts`.** A `'use server'` module compiles *every* export
 * into a server reference, including the ones that are not functions.
 * `lib/auth/server-actions.test.ts` enforces the rule repository-wide.
 *
 * No `server-only` guard: this module is imported by the Client Component on purpose.
 */

/** Two fields to open with, and one more only if the first two are not enough. */
export const CERTIFICATE_FIELDS = ['phone', 'firstName', 'age'] as const;
export type CertificateField = (typeof CERTIFICATE_FIELDS)[number];

export const TURNSTILE_FIELD_NAME = 'cf-turnstile-response';

/**
 * How far identification has progressed.
 *
 * `identify` asks for the telephone number and the first name **together** — the portal opens with
 * two facts where venue check-in opens with one. That is the whole of the "slightly stronger identity
 * flow" the launch brief asks for, and the reason is the difference in exposure: a check-in session
 * is alive for an evening, with an administrator in the room, while this address is reachable for as
 * long as the site exists.
 */
export type CertificateStep = 'identify' | 'age';

/**
 * What the Server Action returns, and therefore what crosses to the browser.
 *
 * **There is no success member**, and that absence is the design. A successful lookup never returns
 * to this state at all: it ends in a server-side `redirect()` to `/certificado/<token>`, so the
 * capability travels in a `Location` header and never becomes a value that client-side code holds,
 * renders or could serialise (launch brief § 17).
 */
export interface CertificateFormState {
  readonly step: CertificateStep;
  /**
   * True when the last attempt matched nothing.
   *
   * One flag for every unsuccessful case there is — wrong number, wrong name, a person who did not
   * attend, a cancelled registration, an unbroken ambiguity, a switch that is off. The form stays on
   * screen so the data can be corrected, and the sentence beside it is the same sentence every time.
   */
  readonly notFound: boolean;
  readonly fieldErrors: Partial<Record<CertificateField, string>>;
  /** A whole-form failure: anti-abuse, or our own fault. Never an identification failure. */
  readonly formError: string | null;
  readonly correlationId: string | null;
  readonly values: Record<CertificateField, string>;
  /** Bumped whenever the previous Turnstile token can no longer be reused. */
  readonly challengeNonce: number;
}

export const EMPTY_VALUES: Record<CertificateField, string> = { phone: '', firstName: '', age: '' };

export const INITIAL_CERTIFICATE_STATE: CertificateFormState = {
  step: 'identify',
  notFound: false,
  fieldErrors: {},
  formError: null,
  correlationId: null,
  values: EMPTY_VALUES,
  challengeNonce: 0,
};

/* ------------------------------------------------------------------------------------------------
 * Copy (pt-BR)
 * ---------------------------------------------------------------------------------------------- */

export const CERTIFICATE_COPY = {
  kicker: 'Certificados',
  heading: 'Seu certificado',
  tagline: 'Sua participação, registrada.',
  instruction: 'Informe os dados usados na inscrição.',

  legend: 'Localizar certificado',
  challengeLabel: 'Verificação de segurança',
  privacy: 'Usamos seus dados apenas para localizar seu certificado.',

  fields: {
    phone: { label: 'Celular', hint: 'Com DDD. Ex.: (19) 99999-9999' },
    firstName: { label: 'Primeiro nome', hint: 'Como está na sua inscrição.' },
    age: { label: 'Idade', hint: null },
  },

  steps: {
    identify: {
      notice: null,
      submit: 'Encontrar meu certificado',
      submitting: 'Procurando…',
    },
    age: {
      notice: 'Só mais uma confirmação.',
      submit: 'Continuar',
      submitting: 'Procurando…',
    },
  },

  /**
   * The state before the organizer flips the switch.
   *
   * It is a *closed* state rather than an error: the certificates exist and will be released, and the
   * sentence says so without naming a time the product does not know.
   */
  disabled: {
    heading: 'Certificados',
    body: [
      'Os certificados deste evento ainda não foram liberados.',
      'Volte após o encerramento do evento.',
    ],
  },

  /**
   * The generic refusal — launch brief § 18, verbatim.
   *
   * It must never grow a second sentence explaining which part did not match. "Encontramos uma
   * inscrição, mas você não esteve presente" is a disclosure about a named person to whoever typed
   * their number.
   */
  notFound: [
    'Não foi possível localizar um certificado com essas informações.',
    'Confira os dados informados ou entre em contato com a organização.',
  ],
} as const;

/** How long a pending submission waits before it reassures instead of just spinning. */
export const STILL_WAITING_AFTER_MS = 6_000;

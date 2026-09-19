/**
 * The shape the self check-in form and its Server Action agree on, plus the pt-BR strings the form
 * renders.
 *
 * **Why this is not in `app/actions/check-in.ts`.** A `'use server'` module compiles *every* export
 * into a server reference, including the ones that are not functions — a constant exported from an
 * actions file arrives in the browser as a callable stub rather than as its value.
 * `lib/auth/server-actions.test.ts` enforces the rule repository-wide; this file is this feature's
 * half of obeying it, exactly as `lib/registration/state.ts` is registration's.
 *
 * No `server-only` guard: this module is imported by the Client Component on purpose. Nothing in it
 * touches the environment, the database or a secret.
 */

/**
 * The three fields, in the order they are asked for. **Adding a fourth is a product decision**, and
 * a decision this product has already made against: the registration holds a name, an age and a
 * telephone number, and check-in resolves an existing registration rather than collecting anything
 * new (launch brief § 24).
 */
export const CHECK_IN_FIELDS = ['phone', 'firstName', 'age'] as const;
export type CheckInField = (typeof CHECK_IN_FIELDS)[number];

/** Turnstile's own hidden input name, fixed by Cloudflare. */
export const TURNSTILE_FIELD_NAME = 'cf-turnstile-response';

/** The hidden field carrying the session token out of the URL and back to the Server Action. */
export const SESSION_FIELD_NAME = 'session';

/**
 * How far the identification has progressed.
 *
 * It is the SERVER that advances this, never the browser: a step is reached because the database
 * answered `need_name` or `need_age`, and a client that posts all three fields at once is answered
 * from the first of them that resolves. The step is therefore a rendering instruction, not a state
 * machine the browser can drive forward on its own.
 */
export type CheckInStep = 'phone' | 'firstName' | 'age';

/**
 * How the attempt ended.
 *
 * Five outcomes, and the two unsuccessful ones are deliberately coarse:
 *
 *   * `manual` is returned for a telephone number nobody registered, for a name that matches nothing,
 *     for a waitlisted person, for a cancelled one and for an ambiguity that three fields could not
 *     break. The browser cannot tell them apart because it is never told — see the header of
 *     migration 18.
 *   * `session_closed` is returned for an unknown token, a closed session and an expired one alike.
 */
export type CheckInOutcome = 'confirmed' | 'already_present' | 'manual' | 'session_closed';

/**
 * What the Server Action returns, and therefore what crosses to the browser.
 *
 * Narrow by design: a step, an outcome, the messages that explain them, and the values the person
 * typed. **No registration, no name, no identifier, no count, no database text.** There is nothing
 * here from which a browser could learn who is registered on the number it submitted.
 */
export interface CheckInFormState {
  readonly step: CheckInStep;
  /** `null` while the person is still identifying themselves. */
  readonly outcome: CheckInOutcome | null;
  readonly fieldErrors: Partial<Record<CheckInField, string>>;
  /** A whole-form failure: anti-abuse, offline, or our own fault. Never an identification failure. */
  readonly formError: string | null;
  /** Shown in small type beside `formError`, so support can find the log line. */
  readonly correlationId: string | null;
  readonly values: Record<CheckInField, string>;
  /**
   * Bumped whenever the previous Turnstile token can no longer be reused, which makes the widget
   * reset and produce a fresh one.
   *
   * Unlike registration, a **successful** check-in bumps it too: the flow does not end there — the
   * next person on the same telephone is one tap away — and a spent token would come back
   * `timeout-or-duplicate` and look like the same failure twice.
   */
  readonly challengeNonce: number;
}

export const EMPTY_VALUES: Record<CheckInField, string> = { phone: '', firstName: '', age: '' };

export const INITIAL_CHECK_IN_STATE: CheckInFormState = {
  step: 'phone',
  outcome: null,
  fieldErrors: {},
  formError: null,
  correlationId: null,
  values: EMPTY_VALUES,
  challengeNonce: 0,
};

/* ------------------------------------------------------------------------------------------------
 * Copy (pt-BR)
 * ---------------------------------------------------------------------------------------------- */

export const CHECK_IN_COPY = {
  kicker: 'Check-in',
  heading: 'Confirmar presença',
  welcome: 'Que bom ter você aqui.',

  legend: 'Confirmação de presença',
  challengeLabel: 'Verificação de segurança',
  noScript: 'Para confirmar sua presença, ative o JavaScript no seu navegador.',
  privacy: 'Usamos seus dados apenas para organizar este evento.',

  /**
   * One prompt per step.
   *
   * The two later prompts say what is needed and **never why**. "Precisamos confirmar mais uma
   * informação" is true for a number nobody registered and for a number shared by five people, which
   * is the point: the sentence that would be more helpful — "este celular tem mais de uma inscrição"
   * — is a disclosure about somebody else.
   */
  steps: {
    phone: {
      notice: null,
      label: 'Celular usado na inscrição',
      hint: 'Com DDD. Ex.: (19) 99999-9999',
      submit: 'Confirmar presença',
      submitting: 'Confirmando…',
    },
    firstName: {
      notice: 'Precisamos confirmar mais uma informação.',
      label: 'Qual é o seu primeiro nome?',
      hint: 'Como está na sua inscrição.',
      submit: 'Continuar',
      submitting: 'Confirmando…',
    },
    age: {
      notice: 'Só mais uma confirmação.',
      label: 'Para confirmar, informe sua idade',
      hint: null,
      submit: 'Continuar',
      submitting: 'Confirmando…',
    },
  },

  outcomes: {
    confirmed: {
      eyebrow: 'Tudo certo',
      heading: 'Presença confirmada',
      body: ['Que bom ter você aqui.', 'Você já está participando dos sorteios da noite.'],
    },
    already_present: {
      eyebrow: 'Tudo certo',
      heading: 'Sua presença já está confirmada',
      body: ['Você já está participando dos sorteios da noite.'],
    },
    /**
     * The generic refusal. It offers a human rather than a retry loop, because every state that
     * reaches it is a state a person at the door resolves in ten seconds.
     */
    manual: {
      eyebrow: null,
      heading: 'Não foi possível confirmar por aqui',
      body: ['Procure nossa equipe na entrada. Podemos confirmar sua presença na hora.'],
    },
    session_closed: {
      eyebrow: null,
      heading: 'Check-in encerrado',
      body: [
        'A confirmação de presença por este link não está disponível.',
        'Se precisar de ajuda, procure a equipe do evento.',
      ],
    },
  },

  /** The certificate hand-off (launch brief § 20). A public address, never a personal token. */
  certificate: {
    heading: 'Seu certificado',
    body: 'Depois do evento, seu certificado estará disponível em:',
  },

  /** The household loop: one telephone, several people, no page reload between them. */
  another: 'Confirmar outra pessoa deste mesmo celular',
  retry: 'Tentar novamente',

  errors: {
    phone: 'Informe o celular usado na inscrição.',
    firstName: 'Informe seu primeiro nome.',
    age: 'Informe sua idade.',
  },
} as const;

/** How long a pending submission waits before it reassures instead of just spinning. */
export const STILL_WAITING_AFTER_MS = 6_000;

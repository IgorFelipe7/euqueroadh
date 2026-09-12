/**
 * The six terminal registration outcomes and their pt-BR copy — PRODUCT-SPEC.md section 6.
 *
 * There is no seventh, unlabelled path. Anything the system cannot classify is `error`, which has
 * its own designed screen.
 */

import { ORGANIZATION_EMAIL } from './schemas';

/** The persisted status of an existing registration, echoed back on a duplicate submission. */
export type RegistrationStatus = 'confirmed' | 'waitlisted';

/**
 * What the database decided. The advisory state rendered on the page may disagree — a visitor can
 * arrive from a cached page and still be waitlisted — so this is the only authority.
 *
 * Precedence when several apply (section 6): already_registered → age_not_eligible → closed →
 * confirmed → waitlisted → full. Checking duplicates first means a double tap always gets a
 * coherent answer; eligibility comes next because it is a fact about the person rather than about
 * the moment, and "encerradas" would invite a ten-year-old to come back and try again.
 */
export type RegistrationOutcome =
  | { readonly kind: 'confirmed' }
  | { readonly kind: 'waitlisted' }
  | { readonly kind: 'already_registered'; readonly status: RegistrationStatus }
  /** Younger than `events.min_age`. Nothing is stored; the person is sent to a human channel. */
  | { readonly kind: 'age_not_eligible' }
  | { readonly kind: 'full' }
  | { readonly kind: 'closed' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'error'; readonly correlationId?: string };

export type RegistrationOutcomeKind = RegistrationOutcome['kind'];

/** The copy a terminal panel renders. `body` is one or more paragraphs. */
export interface OutcomeCopy {
  readonly heading: string;
  readonly body: readonly string[];
}

/**
 * Copy is the specification, not a suggestion (section 6.1). It carries no personal data: the
 * duplicate panel deliberately echoes neither the name nor the age, so that guessing a phone
 * number reveals nothing about who it belongs to.
 */
const ALREADY_REGISTERED_BODY: Readonly<Record<RegistrationStatus, string>> = {
  confirmed: 'Encontramos uma inscrição confirmada com este número de celular.',
  waitlisted: 'Encontramos uma inscrição na lista de espera com este número de celular.',
};

export function outcomeCopy(outcome: RegistrationOutcome): OutcomeCopy {
  switch (outcome.kind) {
    case 'confirmed':
      return {
        heading: 'Inscrição confirmada!',
        body: [
          'Guarde a data: sábado, 19 de setembro, às 19h, no Espaço Cezanne Eventos.',
          'Chegue com alguns minutos de antecedência. Coffee break incluso.',
        ],
      };

    case 'waitlisted':
      // No queue position is shown: promotion is a manual decision followed by a telephone call,
      // and a number on screen would be a promise the system cannot keep.
      return {
        heading: 'Você está na lista de espera',
        body: [
          'As vagas confirmadas já foram preenchidas. Se alguma vaga abrir, a organização entra em ' +
            'contato pelo celular que você informou.',
        ],
      };

    case 'already_registered':
      return {
        heading: 'Você já está inscrito(a)',
        body: [
          ALREADY_REGISTERED_BODY[outcome.status],
          'Precisa corrigir algum dado? Fale com a organização.',
        ],
      };

    case 'age_not_eligible':
      // No age is echoed back, and no guardian field is offered: the answer is a channel, not a
      // form. The address is the organization's published one.
      return {
        heading: 'Inscrição online a partir de 12 anos',
        body: [
          'A inscrição pelo site é para pessoas de 12 anos ou mais.',
          `Para participantes mais novos, fale com a organização pelo e-mail ${ORGANIZATION_EMAIL}.`,
        ],
      };

    case 'full':
      return {
        heading: 'As vagas se esgotaram',
        body: ['Todas as vagas para esta palestra já foram preenchidas. Obrigado pelo interesse.'],
      };

    case 'closed':
      return {
        heading: 'As inscrições estão encerradas',
        body: ['O período de inscrições para esta palestra foi encerrado.'],
      };

    case 'invalid':
      return {
        heading: 'Confira os dados informados',
        body: ['Alguns campos precisam ser corrigidos antes de enviar.'],
      };

    case 'error':
      return {
        heading: 'Algo deu errado',
        body: ['Algo deu errado do nosso lado. Tente novamente em instantes.'],
      };
  }
}

/** True when the outcome ends the flow rather than returning the person to the form. */
export function isTerminal(outcome: RegistrationOutcome): boolean {
  return outcome.kind !== 'invalid' && outcome.kind !== 'error';
}

/**
 * Form-level error copy (section 6.2). Never technical, never carrying an identifier, a table
 * name, a SQL fragment or a stack frame.
 */
export const FORM_ERROR_MESSAGES = {
  antiAbuse: 'Não conseguimos confirmar que você não é um robô. Tente novamente.',
  offline: 'Sem conexão. Verifique sua internet e tente novamente.',
  server: 'Algo deu errado do nosso lado. Tente novamente em instantes.',
} as const satisfies Record<string, string>;

/**
 * The advisory event state read at render time and used to choose the hero banner and the call to
 * action (section 4.4). It communicates state, never numbers.
 */
export type PublicEventState = 'open' | 'full_waitlist' | 'full_closed' | 'closed';

export const PUBLIC_STATE_COPY: Readonly<
  Record<PublicEventState, { readonly banner: string | null; readonly cta: string | null }>
> = {
  open: { banner: null, cta: 'Garantir minha vaga' },
  full_waitlist: {
    banner: 'As vagas confirmadas acabaram — você ainda pode entrar na lista de espera.',
    cta: 'Entrar na lista de espera',
  },
  full_closed: { banner: 'As vagas para esta palestra se esgotaram.', cta: null },
  closed: { banner: 'As inscrições estão encerradas.', cta: null },
};

/** True when the registration form should be rendered at all. */
export function acceptsRegistrations(state: PublicEventState): boolean {
  return state === 'open' || state === 'full_waitlist';
}

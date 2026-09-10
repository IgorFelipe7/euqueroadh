import { describe, expect, it } from 'vitest';

import {
  acceptsRegistrations,
  FORM_ERROR_MESSAGES,
  isTerminal,
  outcomeCopy,
  PUBLIC_STATE_COPY,
  type PublicEventState,
  type RegistrationOutcome,
} from './outcomes';

const ALL_OUTCOMES: RegistrationOutcome[] = [
  { kind: 'confirmed' },
  { kind: 'waitlisted' },
  { kind: 'already_registered', status: 'confirmed' },
  { kind: 'already_registered', status: 'waitlisted' },
  { kind: 'full' },
  { kind: 'closed' },
  { kind: 'invalid' },
  { kind: 'error' },
];

describe('outcomeCopy', () => {
  it('has copy for every outcome', () => {
    for (const outcome of ALL_OUTCOMES) {
      const copy = outcomeCopy(outcome);

      expect(copy.heading.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
      expect(copy.body.every((paragraph) => paragraph.length > 0)).toBe(true);
    }
  });

  it('confirms with the event details', () => {
    const copy = outcomeCopy({ kind: 'confirmed' });

    expect(copy.heading).toBe('Inscrição confirmada!');
    expect(copy.body[0]).toContain('sábado, 19 de setembro');
    expect(copy.body[0]).toContain('Espaço Cezanne Eventos');
    expect(copy.body[1]).toContain('Coffee break incluso');
  });

  it('promises a telephone call for the waitlist and no queue position', () => {
    const copy = outcomeCopy({ kind: 'waitlisted' });

    expect(copy.heading).toBe('Você está na lista de espera');
    expect(copy.body.join(' ')).toContain('a organização entra em contato');
    // A position would be a promise the system cannot keep.
    expect(copy.body.join(' ')).not.toMatch(/\bposição\b|\b\d+º\b/);
  });

  it('distinguishes the two duplicate statuses', () => {
    expect(outcomeCopy({ kind: 'already_registered', status: 'confirmed' }).body[0]).toContain(
      'confirmada',
    );
    expect(outcomeCopy({ kind: 'already_registered', status: 'waitlisted' }).body[0]).toContain(
      'lista de espera',
    );
  });

  it('echoes no personal data on a duplicate, and points to the human correction path', () => {
    for (const status of ['confirmed', 'waitlisted'] as const) {
      const copy = outcomeCopy({ kind: 'already_registered', status });

      expect(copy.body.join(' ')).toContain('Fale com a organização');
      // Nothing that could confirm who a guessed number belongs to.
      expect(copy.body.join(' ')).not.toMatch(/nome|idade|anos/i);
    }
  });

  it('states the terminal refusals plainly', () => {
    expect(outcomeCopy({ kind: 'full' }).heading).toBe('As vagas se esgotaram');
    expect(outcomeCopy({ kind: 'closed' }).heading).toBe('As inscrições estão encerradas');
  });

  it('never leaks a technical detail', () => {
    for (const outcome of ALL_OUTCOMES) {
      const text = `${outcomeCopy(outcome).heading} ${outcomeCopy(outcome).body.join(' ')}`;

      expect(text).not.toMatch(/error|exception|sql|null|undefined|registrations|events/i);
    }
  });
});

describe('isTerminal', () => {
  it('treats the four decided outcomes as terminal', () => {
    expect(isTerminal({ kind: 'confirmed' })).toBe(true);
    expect(isTerminal({ kind: 'waitlisted' })).toBe(true);
    expect(isTerminal({ kind: 'already_registered', status: 'confirmed' })).toBe(true);
    expect(isTerminal({ kind: 'full' })).toBe(true);
    expect(isTerminal({ kind: 'closed' })).toBe(true);
  });

  it('returns a person to the form on a recoverable failure', () => {
    expect(isTerminal({ kind: 'invalid' })).toBe(false);
    expect(isTerminal({ kind: 'error' })).toBe(false);
  });
});

describe('FORM_ERROR_MESSAGES', () => {
  it('matches the specified pt-BR copy', () => {
    expect(FORM_ERROR_MESSAGES.antiAbuse).toBe(
      'Não conseguimos confirmar que você não é um robô. Tente novamente.',
    );
    expect(FORM_ERROR_MESSAGES.offline).toBe(
      'Sem conexão. Verifique sua internet e tente novamente.',
    );
    expect(FORM_ERROR_MESSAGES.server).toBe(
      'Algo deu errado do nosso lado. Tente novamente em instantes.',
    );
  });
});

describe('the advisory public state', () => {
  const states: PublicEventState[] = ['open', 'full_waitlist', 'full_closed', 'closed'];

  it('shows no banner while the event is simply open', () => {
    expect(PUBLIC_STATE_COPY.open.banner).toBeNull();
    expect(PUBLIC_STATE_COPY.open.cta).toBe('Garantir minha vaga');
  });

  it('changes the call to action rather than the form when the waitlist takes over', () => {
    expect(PUBLIC_STATE_COPY.full_waitlist.banner).toBe(
      'As vagas confirmadas acabaram — você ainda pode entrar na lista de espera.',
    );
    expect(PUBLIC_STATE_COPY.full_waitlist.cta).toBe('Entrar na lista de espera');
  });

  it('drops the call to action when nothing can be submitted', () => {
    expect(PUBLIC_STATE_COPY.full_closed.cta).toBeNull();
    expect(PUBLIC_STATE_COPY.closed.cta).toBeNull();
    expect(PUBLIC_STATE_COPY.full_closed.banner).toBe('As vagas para esta palestra se esgotaram.');
    expect(PUBLIC_STATE_COPY.closed.banner).toBe('As inscrições estão encerradas.');
  });

  it('never shows a number, only a state', () => {
    for (const state of states) {
      expect(PUBLIC_STATE_COPY[state].banner ?? '').not.toMatch(/\d/);
    }
  });

  it('renders the form in exactly the two states that can accept a submission', () => {
    expect(acceptsRegistrations('open')).toBe(true);
    expect(acceptsRegistrations('full_waitlist')).toBe(true);
    expect(acceptsRegistrations('full_closed')).toBe(false);
    expect(acceptsRegistrations('closed')).toBe(false);
  });
});

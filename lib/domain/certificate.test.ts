import { describe, expect, it } from 'vitest';

import type { Certificate } from '@/lib/data/public';

import { presentCertificate } from './certificate';

/**
 * The confirmed event, EVENT-SOURCE-OF-TRUTH.md § 2 and § 4. This is a document that goes out under
 * the organizers' name, so the assertions are on the sentence a recipient actually reads.
 */
const BASE: Certificate = {
  fullName: 'Ana Beatriz Souza',
  attendedAt: '2026-09-19T22:04:00-03:00',
  eventSlug: 'educacao-financeira-para-jovens',
  eventTitle: 'Educação Financeira para Jovens',
  eventKicker: 'PALESTRA',
  audienceLabel: 'para jovens',
  startsAt: '2026-09-19T19:00:00-03:00',
  endsAt: '2026-09-19T21:00:00-03:00',
  timezone: 'America/Sao_Paulo',
  venueName: 'Espaço Cezanne Eventos',
  venueCity: 'Hortolândia',
  venueState: 'SP',
};

describe('presentCertificate', () => {
  it('assembles the full sentence from the confirmed facts', () => {
    expect(presentCertificate(BASE).statement).toBe(
      'participou da palestra Educação Financeira para Jovens, realizada em 19 de setembro de ' +
        '2026, das 19h às 21h, no Espaço Cezanne Eventos, em Hortolândia/SP.',
    );
  });

  it('splits the name at the first space, keeping particles whole', () => {
    expect(presentCertificate(BASE)).toMatchObject({ given: 'Ana', family: 'Beatriz Souza' });

    const maria = presentCertificate({ ...BASE, fullName: 'Maria da Silva' });
    expect(maria).toMatchObject({ given: 'Maria', family: 'da Silva' });
  });

  it('leaves the second colour empty for a single-word name', () => {
    expect(presentCertificate({ ...BASE, fullName: 'Carla' })).toMatchObject({
      given: 'Carla',
      family: '',
    });
  });

  it('stays grammatical when the event has no end time', () => {
    const statement = presentCertificate({ ...BASE, endsAt: null }).statement;
    expect(statement).toBe(
      'participou da palestra Educação Financeira para Jovens, realizada em 19 de setembro de ' +
        '2026, no Espaço Cezanne Eventos, em Hortolândia/SP.',
    );
    expect(statement).not.toContain(', ,');
  });

  it('stays grammatical when there is no venue at all', () => {
    const statement = presentCertificate({
      ...BASE,
      venueName: null,
      venueCity: null,
      venueState: null,
    }).statement;

    expect(statement).toBe(
      'participou da palestra Educação Financeira para Jovens, realizada em 19 de setembro de ' +
        '2026, das 19h às 21h.',
    );
  });

  it('names the city alone when there is no venue name', () => {
    expect(presentCertificate({ ...BASE, venueName: null }).statement).toContain(
      'em Hortolândia/SP.',
    );
  });

  it('builds a file name with no accent, space or separator', () => {
    expect(presentCertificate(BASE).fileName).toBe('certificado-ana-beatriz-souza');
    expect(presentCertificate({ ...BASE, fullName: "João D'Ávila" }).fileName).toBe(
      'certificado-joao-d-avila',
    );
  });

  it('never produces an empty file name', () => {
    expect(presentCertificate({ ...BASE, fullName: '???' }).fileName).toBe('certificado');
  });
});

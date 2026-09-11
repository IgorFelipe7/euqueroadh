/**
 * The page's view model — `lib/domain/event-presentation.ts`.
 *
 * Two things are worth asserting here and nothing else is. The title split *is* the hero's
 * typographic identity (VISUAL-DIRECTION.md section 6.3), so a change to it is a change to the
 * design; and the address assembly feeds both the printed block and an outbound maps URL, where a
 * missing column must drop a line rather than leave a stray separator.
 */
import { describe, expect, it } from 'vitest';

import { presentEvent } from './event-presentation';
import type { PublicEvent } from '@/lib/data/public';

const EVENT: PublicEvent = {
  slug: 'educacao-financeira-para-jovens',
  title: 'Educação Financeira',
  kicker: 'Palestra',
  audienceLabel: 'para jovens',
  startsAt: '2026-09-19T19:00:00-03:00',
  endsAt: '2026-09-19T21:00:00-03:00',
  timezone: 'America/Sao_Paulo',
  venueName: 'Espaço Cezanne Eventos',
  venueAddressLine: 'R. José Possidonio Silva, 435',
  venueDistrict: 'Jardim Adelaide',
  venueCity: 'Hortolândia',
  venueState: 'SP',
  priceLabel: 'Inscrições gratuitas',
  isFree: true,
  includesLabel: 'Coffee break incluso',
  state: 'open',
};

const SITE = 'https://exemplo.com.br';

describe('presentEvent', () => {
  it('splits the title at its last space, which is the hero’s two weights', () => {
    const view = presentEvent(EVENT, SITE);

    expect(view.titleLead).toBe('Educação');
    expect(view.titleAccent).toBe('Financeira');
  });

  it('degrades to a single display line for a one-word title', () => {
    const view = presentEvent({ ...EVENT, title: 'Financeira' }, SITE);

    // `null`, not an empty string: the hero renders nothing rather than an empty display line.
    expect(view.titleLead).toBeNull();
    expect(view.titleAccent).toBe('Financeira');
  });

  it('renders the decorative lockup from the row, bound to São Paulo', () => {
    const view = presentEvent(EVENT, SITE);

    expect(view.day).toBe('19');
    expect(view.month).toBe('SET');
    expect(view.longDate).toBe('19 de setembro de 2026');
    expect(view.weekdayDate).toBe('sábado, 19 de setembro');
    expect(view.timeRange).toBe('19h às 21h');
  });

  it('drops missing address lines instead of leaving a separator behind', () => {
    const view = presentEvent({ ...EVENT, venueDistrict: null }, SITE);

    expect(view.addressLines).toEqual(['R. José Possidonio Silva, 435', 'Hortolândia/SP']);
  });

  it('omits the maps link entirely when there is no address to search for', () => {
    const view = presentEvent(
      {
        ...EVENT,
        venueName: null,
        venueAddressLine: null,
        venueDistrict: null,
        venueCity: null,
        venueState: null,
      },
      SITE,
    );

    expect(view.addressLines).toEqual([]);
    expect(view.links.map).toBeNull();
  });

  it('builds an encoded maps query and a canonical page URL', () => {
    const view = presentEvent(EVENT, `${SITE}/`);

    expect(view.links.map).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(view.links.map).toContain(encodeURIComponent('Espaço Cezanne Eventos'));
    // One trailing slash, whatever shape the configured site URL arrived in.
    expect(view.links.page).toBe('https://exemplo.com.br/');
    expect(view.links.shareTitle).toBe('Palestra — Educação Financeira para jovens');
  });
});

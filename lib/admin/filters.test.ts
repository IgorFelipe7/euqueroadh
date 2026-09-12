import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  exportFilterMetadata,
  filtersToQuery,
  parseFilters,
  phonePrefix,
  statusOf,
  withFilters,
} from './filters';

/**
 * These values travel from a URL into a database query — as an order column, a status filter and a
 * page offset. Anything unrecognised must degrade to its default rather than travel further, and
 * that is what most of this file asserts.
 */
describe('parseFilters', () => {
  it('reads an empty query as the default view', () => {
    expect(parseFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it('reads a full query', () => {
    expect(parseFilters({ q: 'beatriz', status: 'espera', sort: 'espera', page: '3' })).toEqual({
      q: 'beatriz',
      status: 'espera',
      sort: 'espera',
      page: 3,
    });
  });

  it.each([
    ['status', 'excluida'],
    ['sort', 'idade'],
  ])('falls back to the default when %s is not in the allowlist', (key, value) => {
    const filters = parseFilters({ [key]: value });
    expect(filters.status).toBe('todas');
    expect(filters.sort).toBe('recentes');
  });

  it.each(['0', '-1', 'abc', '', '1e3'])('treats the page %s as page 1', (page) => {
    expect(parseFilters({ page }).page).toBe(1);
  });

  /*
   * `waitlist_rank` has gaps by design and means nothing for confirmed or cancelled rows, so
   * ordering by it outside the waitlist view would produce a confusing order rather than an error.
   */
  it('degrades the waitlist sort when the waitlist is not what is being looked at', () => {
    expect(parseFilters({ sort: 'espera', status: 'todas' }).sort).toBe('recentes');
    expect(parseFilters({ sort: 'espera', status: 'espera' }).sort).toBe('espera');
  });

  it('takes the first value when a parameter is repeated', () => {
    expect(parseFilters({ status: ['espera', 'cancelada'] }).status).toBe('espera');
  });

  it('trims the search term and bounds its length', () => {
    expect(parseFilters({ q: '  ana  ' }).q).toBe('ana');
    expect(parseFilters({ q: 'x'.repeat(500) }).q).toHaveLength(120);
  });
});

describe('filtersToQuery', () => {
  it('omits every default, so the unfiltered list is a bare path', () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe('');
  });

  it('round-trips through parseFilters', () => {
    const filters = { q: 'joão', status: 'espera', sort: 'espera', page: 4 } as const;
    const query = filtersToQuery(filters);
    const params = Object.fromEntries(new URLSearchParams(query.slice(1)).entries());

    expect(parseFilters(params)).toEqual(filters);
  });
});

describe('withFilters', () => {
  it('returns to page 1 on any change except paging', () => {
    const current = { ...DEFAULT_FILTERS, page: 5 };
    expect(withFilters(current, { status: 'espera' }).page).toBe(1);
    expect(withFilters(current, { q: 'ana' }).page).toBe(1);
    expect(withFilters(current, { page: 6 }).page).toBe(6);
  });
});

describe('statusOf', () => {
  it('maps the pt-BR filter to the stored enum, and "todas" to no filter', () => {
    expect(statusOf('todas')).toBeNull();
    expect(statusOf('confirmada')).toBe('confirmed');
    expect(statusOf('espera')).toBe('waitlisted');
    expect(statusOf('cancelada')).toBe('cancelled');
  });
});

describe('exportFilterMetadata', () => {
  /*
   * The audit log is the one place this system promises never to hold participant data. An
   * organizer searching for someone by name would otherwise write that name into it.
   */
  it('records the search term as a length, never as text', () => {
    const metadata = exportFilterMetadata({
      q: 'Beatriz Nunes',
      status: 'espera',
      sort: 'espera',
      page: 1,
    });

    expect(metadata).toEqual({ status: 'espera', sort: 'espera', query_length: 13 });
    expect(JSON.stringify(metadata)).not.toContain('Beatriz');
  });
});

describe('phonePrefix', () => {
  it('keeps digits and nothing else', () => {
    expect(phonePrefix('(19) 99123-4567')).toBe('19991234567');
    expect(phonePrefix('99123')).toBe('99123');
  });

  it('returns null for a term with no digits, so a name search is never a phone wildcard', () => {
    expect(phonePrefix('beatriz')).toBeNull();
    expect(phonePrefix('')).toBeNull();
  });
});

describe('PAGE_SIZE', () => {
  it('is the fifty rows the specification names', () => {
    expect(PAGE_SIZE).toBe(50);
  });
});

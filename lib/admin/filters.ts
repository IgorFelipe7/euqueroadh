/**
 * The registrations list's view state, parsed from `searchParams` and rendered back into a URL.
 *
 * Pure and dependency-free: it is imported by the page (server), by the search field (client) and
 * by the CSV export Route Handler, and all three must agree on what a URL means. A filter that the
 * export interpreted differently from the table would produce a file that does not match the
 * `Exportar 12 resultados` label it was downloaded from.
 *
 * **Every value is an allowlist.** These strings reach a database query as an order column and as a
 * filter, so an unrecognised one falls back to its default rather than travelling further
 * (ADMIN-SPEC.md section 4.1).
 */

export const REGISTRATION_STATUSES = ['confirmed', 'waitlisted', 'cancelled'] as const;
export type RegistrationRowStatus = (typeof REGISTRATION_STATUSES)[number];

/** The status filter, in URL spelling (pt-BR) — the admin's URLs are as readable as its copy. */
export const STATUS_FILTERS = ['todas', 'confirmada', 'espera', 'cancelada'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SORT_ORDERS = ['recentes', 'antigas', 'nome', 'espera'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const PAGE_SIZE = 50;

/** The maximum a `q` may be. Longer input is truncated, never rejected: it is a search box. */
const MAX_QUERY_LENGTH = 120;

export interface RegistrationFilters {
  readonly q: string;
  readonly status: StatusFilter;
  readonly sort: SortOrder;
  readonly page: number;
}

export const DEFAULT_FILTERS: RegistrationFilters = {
  q: '',
  status: 'todas',
  sort: 'recentes',
  page: 1,
};

/** The row status a filter selects, or `null` for "every status". */
export function statusOf(filter: StatusFilter): RegistrationRowStatus | null {
  switch (filter) {
    case 'confirmada':
      return 'confirmed';
    case 'espera':
      return 'waitlisted';
    case 'cancelada':
      return 'cancelled';
    default:
      return null;
  }
}

type ParamValue = string | string[] | undefined;
export type SearchParams = Readonly<Record<string, ParamValue>>;

function single(value: ParamValue): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}

/**
 * Reduces whatever arrived in the URL to a valid view.
 *
 * `sort=espera` is only meaningful while the waitlist is the thing being looked at — the stored
 * rank has gaps and means nothing for confirmed or cancelled rows — so it degrades to the default
 * rather than producing a confusing order (ADMIN-SPEC.md section 4.1).
 */
export function parseFilters(params: SearchParams): RegistrationFilters {
  const status = STATUS_FILTERS.includes(single(params.status) as StatusFilter)
    ? (single(params.status) as StatusFilter)
    : 'todas';

  const requestedSort = single(params.sort) as SortOrder;
  const sort = SORT_ORDERS.includes(requestedSort) ? requestedSort : 'recentes';

  const page = Number.parseInt(single(params.page), 10);

  return {
    q: single(params.q).trim().slice(0, MAX_QUERY_LENGTH),
    status,
    sort: sort === 'espera' && status !== 'espera' ? 'recentes' : sort,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/**
 * The canonical URL for a view. Default values are omitted, so the unfiltered list is `/admin/
 * inscricoes` and not a query string full of defaults — which matters because these URLs are
 * shared between organizers.
 */
export function filtersToQuery(filters: RegistrationFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status !== 'todas') params.set('status', filters.status);
  if (filters.sort !== 'recentes') params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));

  const query = params.toString();
  return query ? `?${query}` : '';
}

/** A view derived from this one. Any change except paging returns to page 1. */
export function withFilters(
  filters: RegistrationFilters,
  patch: Partial<RegistrationFilters>,
): RegistrationFilters {
  const next = { ...filters, ...patch };
  return patch.page === undefined ? { ...next, page: 1 } : next;
}

/**
 * What the audit metadata records about an export (DATABASE-SECURITY.md section 10.6).
 *
 * The search term is recorded as its **length**, never its text: an organizer searching for a
 * participant by name would otherwise write that name into the audit log, which is the one place
 * this system promises never to hold participant data.
 */
export function exportFilterMetadata(filters: RegistrationFilters): Record<string, unknown> {
  return {
    status: filters.status,
    sort: filters.sort,
    query_length: filters.q.length,
  };
}

/**
 * Digits only, for the phone-prefix branch of the search.
 *
 * Returns `null` when the term contains no digits at all, so a name search never becomes an
 * accidental `phone LIKE '%'`.
 */
export function phonePrefix(term: string): string | null {
  const digits = term.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

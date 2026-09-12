/**
 * Reading participants, as the administrator.
 *
 * Every query in this module runs through `createUserClient()`, so `registrations_admin_read` is
 * what authorizes it. The secret key holds no `SELECT` on this table at all and could not serve
 * these rows even if this file asked it to (DATABASE-SECURITY.md section 8.3).
 *
 * **Filtering, sorting and pagination are server-side.** The full participant list is never shipped
 * to a browser and then filtered there: that would put every name, age and telephone number of
 * everyone who ever registered into the page source of a view showing three of them
 * (ADMIN-SPEC.md section 4.1).
 */
import 'server-only';

import { assertAdmin } from '@/lib/data/auth';
import { createUserClient } from '@/lib/data/supabase/user';
import {
  PAGE_SIZE,
  phonePrefix,
  statusOf,
  type RegistrationFilters,
  type RegistrationRowStatus,
} from '@/lib/admin/filters';

/** One row, as every admin surface renders it. */
export interface AdminRegistration {
  readonly id: string;
  readonly fullName: string;
  readonly age: number;
  readonly phoneE164: string;
  readonly status: RegistrationRowStatus;
  readonly createdAt: string;
  readonly statusChangedAt: string;
  readonly notes: string | null;
  /**
   * The **live** queue position: the rank of this row's `waitlist_rank` among currently waitlisted
   * rows, 1-based. Never the stored value, which has gaps by design after promotions and
   * cancellations (invariant I4).
   */
  readonly waitlistPosition: number | null;
}

interface RegistrationRow {
  id: string;
  event_id: string;
  full_name: string;
  age: number;
  phone_e164: string;
  status: RegistrationRowStatus;
  created_at: string;
  status_changed_at: string;
  notes: string | null;
  waitlist_rank: number | null;
}

const COLUMNS =
  'id, event_id, full_name, age, phone_e164, status, created_at, status_changed_at, notes, ' +
  'waitlist_rank';

export interface RegistrationPage {
  readonly rows: readonly AdminRegistration[];
  /** Matching the current filter, across every page. */
  readonly total: number;
  readonly page: number;
  readonly pages: number;
}

/** The counts behind the status chips. `null` means the database did not answer. */
export interface StatusCounts {
  readonly all: number;
  readonly confirmed: number;
  readonly waitlisted: number;
  readonly cancelled: number;
}

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

/**
 * Applies the search term.
 *
 * Two branches, because an organizer types both kinds of thing into one box: an accent-insensitive
 * substring of the name, matched against the generated `search_name` column so `joao` finds `João`,
 * or a digit prefix of the telephone number, so `99123` finds `(19) 99123-4567`. PostgREST's `or`
 * takes a comma-separated list; the term is stripped of the characters that are meaningful in that
 * syntax before it is interpolated, which is what keeps a search box from becoming a filter
 * injection.
 */
function applySearch<T>(query: T, term: string): T {
  if (term.length === 0) return query;

  // `,` `(` `)` and `.` delimit PostgREST's filter grammar; `%` and `*` are wildcards. None of them
  // can occur in a name search that means anything, so they are removed rather than escaped.
  const safe = term.replace(/[,.()%*\\"']/g, ' ').trim();
  const digits = phonePrefix(term);

  const clauses: string[] = [];
  if (safe.length > 0) clauses.push(`search_name.ilike.*${unaccent(safe).toLowerCase()}*`);
  // A contains match rather than a prefix one, because an organizer types the part of the number
  // they were told — `99123` — and the stored value starts `+5519`.
  if (digits) clauses.push(`phone_e164.like.*${digits}*`);

  if (clauses.length === 0) return query;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builders are chainable
  return (query as any).or(clauses.join(','));
}

/**
 * The same transformation `public.immutable_unaccent` applies at write time, so a search term is
 * compared against `search_name` in the form that column actually holds. `String.normalize` plus a
 * combining-mark strip is the platform's own version of it and needs no dependency.
 */
function unaccent(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function applyStatus<T>(query: T, status: RegistrationRowStatus | null): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builders are chainable
  return status ? (query as any).eq('status', status) : query;
}

/**
 * The live queue positions, as a map from registration id to 1-based position.
 *
 * Read as its own small query — id and rank only, for waitlisted rows only — rather than computed
 * from the page being displayed, because position 3 of the queue is position 3 whether or not it is
 * on the page being looked at. It carries no personal data, and a waitlist is a queue of people who
 * are waiting, not a table scan.
 */
async function loadWaitlistPositions(
  supabase: UserClient,
  eventId: string,
): Promise<ReadonlyMap<string, number>> {
  const { data, error } = await supabase
    .from('registrations')
    .select('id, waitlist_rank')
    .eq('event_id', eventId)
    .eq('status', 'waitlisted')
    .order('waitlist_rank', { ascending: true })
    .returns<{ id: string; waitlist_rank: number | null }[]>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.waitlist_read_failed', code: error.code }));
    return new Map();
  }

  return new Map((data ?? []).map((row, index) => [row.id, index + 1]));
}

function toRegistration(
  row: RegistrationRow,
  positions: ReadonlyMap<string, number>,
): AdminRegistration {
  return {
    id: row.id,
    fullName: row.full_name,
    age: row.age,
    phoneE164: row.phone_e164,
    status: row.status,
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at,
    notes: row.notes,
    waitlistPosition: row.status === 'waitlisted' ? (positions.get(row.id) ?? null) : null,
  };
}

/** One page of the filtered list, plus the total the header reports. */
export async function listRegistrations(
  eventId: string,
  filters: RegistrationFilters,
): Promise<RegistrationPage> {
  await assertAdmin();

  const supabase = await createUserClient();

  const from = (filters.page - 1) * PAGE_SIZE;

  let query = supabase
    .from('registrations')
    .select(COLUMNS, { count: 'exact' })
    .eq('event_id', eventId);

  query = applyStatus(query, statusOf(filters.status));
  query = applySearch(query, filters.q);

  switch (filters.sort) {
    case 'antigas':
      query = query.order('created_at', { ascending: true });
      break;
    case 'nome':
      query = query.order('search_name', { ascending: true });
      break;
    case 'espera':
      // `nullsFirst: false` keeps rows with no rank — there are none under this filter — at the end
      // rather than at the front, where they would look like the head of the queue.
      query = query.order('waitlist_rank', { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  const { data, error, count } = await query
    .range(from, from + PAGE_SIZE - 1)
    .returns<RegistrationRow[]>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.registrations_read_failed', code: error.code }));
    return { rows: [], total: 0, page: filters.page, pages: 1 };
  }

  const rows = data ?? [];
  const needsPositions = rows.some((row) => row.status === 'waitlisted');
  const positions = needsPositions ? await loadWaitlistPositions(supabase, eventId) : new Map();

  const total = count ?? rows.length;

  return {
    rows: rows.map((row) => toRegistration(row, positions)),
    total,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * The counts on the filter chips.
 *
 * Four `head: true` count queries rather than one grouped aggregate: PostgREST has no `GROUP BY`,
 * and a grouped view would be a fifth object to keep in step with the policies. Each of these
 * transfers a number, not rows.
 */
export async function countByStatus(eventId: string): Promise<StatusCounts | null> {
  await assertAdmin();

  const supabase = await createUserClient();

  const counts = await Promise.all(
    [null, 'confirmed', 'waitlisted', 'cancelled'].map(async (status) => {
      let query = supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId);

      if (status) query = query.eq('status', status);

      const { count, error } = await query;
      if (error) {
        console.error(JSON.stringify({ event: 'admin.count_read_failed', code: error.code }));
        return null;
      }
      return count ?? 0;
    }),
  );

  if (counts.some((value) => value === null)) return null;

  const [all, confirmed, waitlisted, cancelled] = counts as number[];
  return { all, confirmed, waitlisted, cancelled };
}

/** The N most recent registrations, any status — the dashboard's confidence panel. */
export async function listLatestRegistrations(
  eventId: string,
  limit = 5,
): Promise<readonly AdminRegistration[]> {
  await assertAdmin();

  const supabase = await createUserClient();

  const { data, error } = await supabase
    .from('registrations')
    .select(COLUMNS)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<RegistrationRow[]>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.latest_read_failed', code: error.code }));
    return [];
  }

  const rows = data ?? [];
  const positions = rows.some((row) => row.status === 'waitlisted')
    ? await loadWaitlistPositions(supabase, eventId)
    : new Map<string, number>();

  return rows.map((row) => toRegistration(row, positions));
}

/** One registration, for the detail panel. `null` when it is gone or invisible under RLS. */
export async function getRegistration(id: string): Promise<AdminRegistration | null> {
  await assertAdmin();

  const supabase = await createUserClient();

  const { data, error } = await supabase
    .from('registrations')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle<RegistrationRow>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.registration_read_failed', code: error.code }));
    return null;
  }
  if (!data) return null;

  const positions =
    data.status === 'waitlisted'
      ? await loadWaitlistPositions(supabase, data.event_id)
      : new Map<string, number>();

  return toRegistration(data, positions);
}

/**
 * Every row matching the filter, for the CSV export — no pagination, because the file is the whole
 * of what the screen was showing.
 *
 * Capped. An export is a file an organizer downloads, not a data dump: a cap turns a pathological
 * request into a truncated file rather than into an unbounded response, and no realistic event for
 * this venue approaches it.
 */
export const EXPORT_ROW_CAP = 5000;

export async function listRegistrationsForExport(
  eventId: string,
  filters: RegistrationFilters,
): Promise<readonly AdminRegistration[]> {
  await assertAdmin();

  const supabase = await createUserClient();

  let query = supabase.from('registrations').select(COLUMNS).eq('event_id', eventId);

  query = applyStatus(query, statusOf(filters.status));
  query = applySearch(query, filters.q);

  switch (filters.sort) {
    case 'antigas':
      query = query.order('created_at', { ascending: true });
      break;
    case 'nome':
      query = query.order('search_name', { ascending: true });
      break;
    case 'espera':
      query = query.order('waitlist_rank', { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query.limit(EXPORT_ROW_CAP).returns<RegistrationRow[]>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.export_read_failed', code: error.code }));
    throw new Error('export_read_failed');
  }

  const rows = data ?? [];
  const positions = rows.some((row) => row.status === 'waitlisted')
    ? await loadWaitlistPositions(supabase, eventId)
    : new Map<string, number>();

  return rows.map((row) => toRegistration(row, positions));
}

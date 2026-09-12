import Link from 'next/link';

import { RegistrationsTable } from '@/components/admin/registrations-table';
import { SearchField } from '@/components/admin/search-field';
import { BUTTON_QUIET, BUTTON_SECONDARY, Notice, PageHeader, Panel } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import {
  PAGE_SIZE,
  STATUS_FILTERS,
  filtersToQuery,
  parseFilters,
  withFilters,
  type SearchParams,
  type StatusFilter,
} from '@/lib/admin/filters';
import { getAdminEvent, headroomOf } from '@/lib/data/admin/event';
import { countByStatus, listRegistrations } from '@/lib/data/admin/registrations';
import { ROUTES } from '@/lib/routes';

import {
  cancelRegistrationAction,
  deleteRegistrationAction,
  editRegistrationAction,
  promoteOneAction,
} from '../actions';

export const metadata = { title: ADMIN_COPY.registrations.title };

const FILTER_LABELS: Readonly<Record<StatusFilter, string>> = {
  todas: 'Todas',
  confirmada: 'Confirmadas',
  espera: 'Lista de espera',
  cancelada: 'Canceladas',
};

/**
 * `/admin/inscricoes` — the full list.
 *
 * Search, filter, sort and pagination are **server-side**, driven entirely by `searchParams`. Two
 * consequences, both deliberate: a view is a URL an organizer can send to a colleague, and the
 * browser only ever receives the fifty rows it is showing rather than every participant's personal
 * data (ADMIN-SPEC.md section 4.1).
 */
export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const event = await getAdminEvent();

  if (!event) {
    return (
      <>
        <PageHeader title={ADMIN_COPY.registrations.title} />
        <Notice tone="error" role="alert">
          Não foi possível ler as inscrições agora. Recarregue a página em instantes.
        </Notice>
      </>
    );
  }

  const [page, counts] = await Promise.all([
    listRegistrations(event.id, filters),
    countByStatus(event.id),
  ]);

  const query = filtersToQuery(filters);
  const heading = filters.q
    ? ADMIN_COPY.registrations.results(page.total, filters.q)
    : ADMIN_COPY.registrations.count(page.total);

  return (
    <>
      <PageHeader
        title={ADMIN_COPY.registrations.title}
        actions={
          page.total > 0 ? (
            <div className="flex flex-col items-end gap-1">
              {/*
                A plain link to a Route Handler, not a fetch: the browser downloads the file itself,
                which works identically on a phone. It exports exactly the current filter, and says
                so, because a hidden "export everything" is not predictable.
              */}
              <a
                href={`${ROUTES.adminExport}${query}`}
                className={BUTTON_SECONDARY}
                download
                rel="nofollow"
              >
                {ADMIN_COPY.registrations.exportCta(page.total)}
              </a>
              <p className="text-hint text-admin-muted">{ADMIN_COPY.registrations.exportWarning}</p>
            </div>
          ) : null
        }
      />

      <Panel className="flex flex-col gap-4 p-4">
        {/*
          A real form, so Enter submits and the search still works with JavaScript unavailable. The
          debounced URL update on top of it is progressive enhancement.
        */}
        <form method="get" action={ROUTES.adminRegistrations} className="flex flex-col gap-4">
          {filters.status !== 'todas' ? (
            <input type="hidden" name="status" value={filters.status} />
          ) : null}
          {filters.sort !== 'recentes' ? (
            <input type="hidden" name="sort" value={filters.sort} />
          ) : null}

          <SearchField
            initialValue={filters.q}
            status={filters.status === 'todas' ? '' : filters.status}
            sort={filters.sort === 'recentes' ? '' : filters.sort}
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((filter) => {
            const active = filters.status === filter;
            const count = counts
              ? filter === 'todas'
                ? counts.all
                : filter === 'confirmada'
                  ? counts.confirmed
                  : filter === 'espera'
                    ? counts.waitlisted
                    : counts.cancelled
              : null;

            return (
              <Link
                key={filter}
                href={`${ROUTES.adminRegistrations}${filtersToQuery(withFilters(filters, { status: filter, sort: filter === 'espera' ? 'espera' : 'recentes' }))}`}
                aria-current={active ? 'true' : undefined}
                className={`inline-flex min-h-11 items-center rounded-[var(--radius-admin-control)] border px-3 text-hint font-semibold ${
                  active
                    ? 'border-admin-blue bg-admin-blue-soft text-admin-blue'
                    : 'border-admin-line-strong bg-admin-surface text-admin-ink hover:border-admin-blue'
                }`}
              >
                {FILTER_LABELS[filter]}
                {count === null ? '' : ` (${count})`}
              </Link>
            );
          })}
        </div>

        {/* Announced politely on change, on the count alone — never on the whole table. */}
        <p aria-live="polite" className="text-hint text-admin-muted">
          {heading}
        </p>
      </Panel>

      {page.rows.length === 0 ? (
        <Panel className="flex flex-col items-start gap-3 p-6">
          {filters.q ? (
            <>
              <p className="text-body text-admin-ink">
                {ADMIN_COPY.registrations.emptySearch(filters.q)}
              </p>
              <Link href={ROUTES.adminRegistrations} className={BUTTON_QUIET}>
                {ADMIN_COPY.registrations.clearSearch}
              </Link>
            </>
          ) : filters.status !== 'todas' ? (
            <>
              <p className="text-body text-admin-ink">{ADMIN_COPY.registrations.emptyStatus}</p>
              <Link href={ROUTES.adminRegistrations} className={BUTTON_QUIET}>
                {ADMIN_COPY.registrations.seeAll}
              </Link>
            </>
          ) : (
            <>
              <p className="text-body text-admin-ink">{ADMIN_COPY.registrations.emptyAll}</p>
              <p className="text-hint text-admin-muted">
                {ADMIN_COPY.dashboard.noRegistrationsHint}
              </p>
              <Link href={ROUTES.publicHome} className={BUTTON_QUIET}>
                {ADMIN_COPY.dashboard.viewPublicPage}
              </Link>
            </>
          )}
        </Panel>
      ) : (
        <>
          <RegistrationsTable
            rows={page.rows.map((row) => ({
              id: row.id,
              fullName: row.fullName,
              age: row.age,
              phoneE164: row.phoneE164,
              status: row.status,
              createdAt: row.createdAt,
              notes: row.notes,
              waitlistPosition: row.waitlistPosition,
            }))}
            headroom={headroomOf(event)}
            actions={{
              edit: editRegistrationAction,
              cancel: cancelRegistrationAction,
              remove: deleteRegistrationAction,
              promote: promoteOneAction,
            }}
          />

          {page.pages > 1 ? (
            <nav
              aria-label="Paginação"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              {page.page > 1 ? (
                <Link
                  href={`${ROUTES.adminRegistrations}${filtersToQuery(withFilters(filters, { page: page.page - 1 }))}`}
                  className={BUTTON_SECONDARY}
                >
                  ← {ADMIN_COPY.registrations.previous}
                </Link>
              ) : (
                <span />
              )}

              <p className="text-hint text-admin-muted">
                {ADMIN_COPY.registrations.page(page.page, page.pages)} · {PAGE_SIZE} por página
              </p>

              {page.page < page.pages ? (
                <Link
                  href={`${ROUTES.adminRegistrations}${filtersToQuery(withFilters(filters, { page: page.page + 1 }))}`}
                  className={BUTTON_SECONDARY}
                >
                  {ADMIN_COPY.registrations.next} →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

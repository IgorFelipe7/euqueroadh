import { closeCheckInAction, openCheckInAction } from '@/app/admin/(protected)/actions';
import { AttendanceList } from '@/components/admin/attendance-list';
import { CheckInPanel } from '@/components/admin/check-in-panel';
import { SearchField } from '@/components/admin/search-field';
import { Notice, PageHeader, Panel } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import type { SearchParams } from '@/lib/admin/filters';
import { getActiveCheckInSession } from '@/lib/data/admin/check-in';
import { getAdminEvent } from '@/lib/data/admin/event';
import { countAttendance, searchForDoor } from '@/lib/data/admin/registrations';

export const metadata = { title: ADMIN_COPY.attendance.title };

function term(params: SearchParams): string {
  const value = params.q;
  return (Array.isArray(value) ? value[0] : (value ?? '')).trim();
}

/**
 * `/admin/presenca` — the door.
 *
 * RAFFLE-AND-CERTIFICATE-SPEC.md § 1.3. Search-first rather than list-first: three hundred names
 * scrolling past a thumb is not a way to find one person, and the organizer always arrives here
 * with a name they have just been told.
 *
 * The running count in the header is not decoration — it is the raffle's pool size, so the operator
 * can see the draw is meaningful before running it.
 *
 * ## What the check-in session added, and what it deliberately did not replace
 *
 * The panel at the top opens a public self check-in session, shows the QR wall and closes it again.
 * **Everything below it is unchanged.** Self check-in serves the two hundred people who have a charged
 * phone and a signal; the manual search serves the ones who do not, plus every case where the
 * information does not match — and that list is what makes the event independent of the feature above
 * it. An event that could only admit people through a QR would have no answer for the first person
 * whose battery died, which is why the panel's own copy says so rather than leaving it implied.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = term(params);

  const event = await getAdminEvent();

  if (!event) {
    return (
      <>
        <PageHeader title={ADMIN_COPY.attendance.title} />
        <Notice tone="error" role="alert">
          Não foi possível ler as inscrições agora. Recarregue a página em instantes.
        </Notice>
      </>
    );
  }

  const [counts, session, people] = await Promise.all([
    countAttendance(event.id),
    getActiveCheckInSession(event.id),
    // The empty term would return the first 25 people alphabetically, which is a list nobody asked
    // for. The screen shows its instruction instead until something is typed.
    query ? searchForDoor(event.id, query) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={ADMIN_COPY.attendance.title}
        description={ADMIN_COPY.attendance.description}
      />

      {/*
        The self check-in block, first: during the twenty minutes this screen matters most, opening
        check-in is the first thing an organizer does and finding one person by name is the exception.
      */}
      <CheckInPanel
        openAction={openCheckInAction}
        closeAction={closeCheckInAction}
        isOpen={session !== null}
        expiresAt={session?.expiresAt ?? null}
      />

      <Panel className="flex flex-col gap-1 px-4 py-4">
        <p className="text-[2rem] leading-none font-bold tabular-nums text-admin-ink">
          {counts ? (
            <>
              {counts.present}
              <span className="text-admin-muted"> / {counts.confirmed}</span>
            </>
          ) : (
            '—'
          )}
        </p>
        <p className="text-hint text-admin-muted">
          {counts
            ? ADMIN_COPY.attendance.count(counts.present, counts.confirmed)
            : 'Não foi possível contar agora.'}
        </p>
        <p className="text-hint mt-2 text-admin-muted">{ADMIN_COPY.attendance.hint}</p>
      </Panel>

      {/*
       * A real form, so Enter submits and the screen works with JavaScript unavailable. The field
       * itself keeps the URL in step while typing.
       */}
      <form action="" role="search" className="flex flex-col gap-2">
        <SearchField
          initialValue={query}
          label={ADMIN_COPY.attendance.searchLabel}
          autoFocus
        />
      </form>

      <Panel>
        <AttendanceList people={people} term={query} />
      </Panel>

      <p className="text-hint text-admin-muted">{ADMIN_COPY.attendance.onlyConfirmed}</p>
    </>
  );
}

import Link from 'next/link';

import { CapacityMeter } from '@/components/admin/capacity-meter';
import { EventControls, PromotionPrompt } from '@/components/admin/dashboard-controls';
import {
  BUTTON_QUIET,
  Notice,
  PHONE_LINK,
  Panel,
  StatNumber,
  StatusPill,
} from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { getAdminEvent, headroomOf } from '@/lib/data/admin/event';
import { listLatestRegistrations } from '@/lib/data/admin/registrations';
import { formatDateTime, formatTimeRange, formatWeekdayDate } from '@/lib/domain/format';
import { formatForDisplay } from '@/lib/domain/phone';
import { ROUTES } from '@/lib/routes';

import { promoteAction, updateSettingsAction } from './actions';

export const metadata = { title: ADMIN_COPY.nav.dashboard };

/**
 * `/admin` — event state at a glance, plus the actions that state implies.
 *
 * The brief: an organizer opens this on their phone at the venue door and knows, in under three
 * seconds and without scrolling, how many people are confirmed, how many are waiting, and whether
 * there is anything they need to do.
 *
 * A Server Component. The numbers are read under the administrator's own JWT on every request —
 * there is no client-side fetch, no store, and no participant list in the page's JavaScript.
 *
 * **An unreadable event renders `—`, never `0`.** An organizer who sees `0 confirmadas` during a
 * database outage will act on it (ADMIN-SPEC.md section 7.3).
 */
export default async function AdminDashboardPage() {
  const event = await getAdminEvent();

  if (!event) {
    return (
      <>
        <h1 className="text-[1.5rem] leading-tight font-bold">{ADMIN_COPY.nav.dashboard}</h1>
        <Notice tone="error" role="alert">
          Não foi possível ler os dados do evento agora. Recarregue a página em instantes.
        </Notice>
        <section className="grid grid-cols-3 gap-4">
          <StatNumber label={ADMIN_COPY.dashboard.confirmed} value={null} />
          <StatNumber label={ADMIN_COPY.dashboard.waitlisted} value={null} />
          <StatNumber label={ADMIN_COPY.dashboard.free} value={null} />
        </section>
      </>
    );
  }

  const latest = await listLatestRegistrations(event.id, 5);
  const headroom = headroomOf(event);
  const capacityUndefined = event.capacity <= 0;
  const starts = new Date(event.startsAt);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-[1.5rem] leading-tight font-bold text-admin-ink">{event.title}</h1>
        <p className="text-hint text-admin-muted">
          {formatWeekdayDate(starts)}
          {event.endsAt ? ` · ${formatTimeRange(starts, new Date(event.endsAt))}` : null}
          {event.venueName ? ` · ${event.venueName}` : null}
        </p>
      </header>

      {/* The three numbers, and the meter that puts them in proportion. */}
      <Panel className="flex flex-col gap-5 p-5">
        <div className="grid grid-cols-3 gap-4">
          <StatNumber label={ADMIN_COPY.dashboard.confirmed} value={event.confirmedCount} />
          <StatNumber label={ADMIN_COPY.dashboard.waitlisted} value={event.waitlistCount} />
          <StatNumber label={ADMIN_COPY.dashboard.free} value={headroom} />
        </div>

        <CapacityMeter
          capacity={event.capacity}
          confirmed={event.confirmedCount}
          waitlisted={event.waitlistCount}
        />

        {capacityUndefined ? (
          <div className="flex flex-col items-start gap-2">
            <Notice tone="warning">{ADMIN_COPY.dashboard.capacityPrompt}</Notice>
            <Link href={ROUTES.adminSettings} className={BUTTON_QUIET}>
              {ADMIN_COPY.dashboard.goToSettings}
            </Link>
          </div>
        ) : null}
      </Panel>

      <PromotionPrompt
        action={promoteAction}
        headroom={headroom}
        waitlistCount={event.waitlistCount}
      />

      <EventControls
        action={updateSettingsAction}
        capacity={event.capacity}
        waitlistEnabled={event.waitlistEnabled}
        registrationState={event.registrationState}
        settingsVersion={event.settingsVersion}
        waitlistCount={event.waitlistCount}
      />

      {/* Confidence, not analysis: an organizer glances and sees the system is alive. */}
      <Panel className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-label text-admin-ink">{ADMIN_COPY.dashboard.latest}</h2>
          <Link href={ROUTES.adminRegistrations} className={BUTTON_QUIET}>
            {ADMIN_COPY.dashboard.seeAll} →
          </Link>
        </div>

        {latest.length === 0 ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-hint text-admin-ink">{ADMIN_COPY.dashboard.noRegistrations}</p>
            <p className="text-hint text-admin-muted">{ADMIN_COPY.dashboard.noRegistrationsHint}</p>
            <Link href={ROUTES.publicHome} className={BUTTON_QUIET}>
              {ADMIN_COPY.dashboard.viewPublicPage}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-admin-line">
            {latest.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-label [overflow-wrap:anywhere] text-admin-ink">
                    {row.fullName}
                  </span>
                  <span className="text-hint text-admin-muted">
                    {row.age} anos ·{' '}
                    <a href={`tel:${row.phoneE164}`} className={PHONE_LINK}>
                      {formatForDisplay(row.phoneE164)}
                    </a>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-hint text-admin-muted">
                    {formatDateTime(new Date(row.createdAt))}
                  </span>
                  <StatusPill status={row.status} position={row.waitlistPosition} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

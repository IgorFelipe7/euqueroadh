import { SettingsForm } from '@/components/admin/settings-form';
import { Notice, PageHeader, Panel } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { getAdminEvent } from '@/lib/data/admin/event';
import { formatTimeRange, formatWeekdayDate } from '@/lib/domain/format';

import { updateSettingsAction } from '../actions';

export const metadata = { title: ADMIN_COPY.settings.title };

/**
 * `/admin/configuracoes` — three settings and a read-only block. Nothing else.
 *
 * The read-only block is a deliberate scope boundary (PRODUCT-SPEC.md section 3.2): the columns
 * behind it already exist in `events`, so exposing them later is a UI change with no schema work —
 * but building a copy editor now would turn a registration product into a content management
 * system.
 */
export default async function SettingsPage() {
  const event = await getAdminEvent();

  if (!event) {
    return (
      <>
        <PageHeader title={ADMIN_COPY.settings.title} />
        <Notice tone="error" role="alert">
          Não foi possível ler as configurações agora. Recarregue a página em instantes.
        </Notice>
      </>
    );
  }

  const starts = new Date(event.startsAt);

  return (
    <>
      <PageHeader title={ADMIN_COPY.settings.title} />

      <Panel className="p-5">
        <SettingsForm
          action={updateSettingsAction}
          initial={{
            capacity: event.capacity,
            waitlistEnabled: event.waitlistEnabled,
            registrationState: event.registrationState,
            settingsVersion: event.settingsVersion,
          }}
          confirmedCount={event.confirmedCount}
          waitlistCount={event.waitlistCount}
        />
      </Panel>

      <Panel className="flex flex-col gap-4 p-5">
        <h2 className="text-label text-admin-ink">{ADMIN_COPY.settings.readOnlyTitle}</h2>

        <dl className="text-hint grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
          <Row label="Título">
            {event.kicker ? `${event.kicker} — ` : ''}
            {event.title}
            {event.audienceLabel ? ` ${event.audienceLabel}` : ''}
          </Row>
          <Row label="Data">
            {formatWeekdayDate(starts)}
            {event.endsAt ? ` · ${formatTimeRange(starts, new Date(event.endsAt))}` : ''}
          </Row>
          <Row label="Local">{event.venueName ?? '—'}</Row>
          <Row label="Endereço">
            {[event.venueAddressLine, event.venueDistrict, event.venueCity, event.venueState]
              .filter(Boolean)
              .join(' · ') || '—'}
          </Row>
          <Row label="Inscrição">{event.priceLabel ?? '—'}</Row>
          <Row label="Inclui">{event.includesLabel ?? '—'}</Row>
          {/*
            The age policy is shown here because an organizer will be asked about it at the door,
            and it is read-only for the same reason the rest of this block is: it is an operating
            decision recorded in `events.min_age`, not a control to fiddle with under pressure.
          */}
          <Row label="Idade mínima (online)">
            {event.minAge === null ? 'Sem restrição' : `${event.minAge} anos ou mais`}
          </Row>
        </dl>

        {event.minAge !== null ? (
          <p className="text-hint text-admin-muted">
            {ADMIN_COPY.settings.agePolicy(event.minAge)}
          </p>
        ) : null}

        <p className="text-hint text-admin-muted">{ADMIN_COPY.settings.readOnlyNote}</p>
      </Panel>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-admin-muted">{label}</dt>
      <dd className="text-admin-ink">{children}</dd>
    </>
  );
}

import Link from 'next/link';

import { RaffleForm } from '@/components/admin/raffle-form';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Notice, PageHeader, Panel } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { getAdminEvent } from '@/lib/data/admin/event';
import { countEligible, listRaffles, type RaffleStatus } from '@/lib/data/admin/raffles';
import { rafflePath, raffleStagePath } from '@/lib/routes';

export const metadata = { title: ADMIN_COPY.raffles.title };

const STATUS_LABEL: Readonly<Record<RaffleStatus, string>> = {
  draft: ADMIN_COPY.raffles.statusDraft,
  running: ADMIN_COPY.raffles.statusRunning,
  finished: ADMIN_COPY.raffles.statusFinished,
};

const STATUS_CLASS: Readonly<Record<RaffleStatus, string>> = {
  draft: 'bg-status-cancelled-soft text-status-cancelled',
  running: 'bg-status-waitlisted-soft text-status-waitlisted',
  finished: 'bg-status-confirmed-soft text-status-confirmed',
};

/**
 * `/admin/sorteio` — the control room.
 *
 * The ordinary light admin, used sitting down, the day before. The dark, chrome-less surface is
 * `/palco`, and it is the only admin route rendered for an audience rather than for a reader
 * (RAFFLE-AND-CERTIFICATE-SPEC.md § 3.5).
 */
export default async function RafflesPage() {
  const event = await getAdminEvent();

  if (!event) {
    return (
      <>
        <PageHeader title={ADMIN_COPY.raffles.title} />
        <Notice tone="error" role="alert">
          Não foi possível ler os sorteios agora. Recarregue a página em instantes.
        </Notice>
      </>
    );
  }

  const [raffles, attended, confirmed] = await Promise.all([
    listRaffles(event.id),
    countEligible(event.id, 'attended'),
    countEligible(event.id, 'confirmed'),
  ]);

  return (
    <>
      <PageHeader
        title={ADMIN_COPY.raffles.title}
        description={ADMIN_COPY.raffles.description}
      />

      {raffles.length === 0 ? (
        <Notice tone="info">
          {ADMIN_COPY.raffles.empty} {ADMIN_COPY.raffles.emptyHint}
        </Notice>
      ) : (
        <Panel>
          <ul className="flex flex-col">
            {raffles.map((raffle) => (
              <li
                key={raffle.id}
                className="flex flex-col gap-3 border-b border-admin-line px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[1.0625rem] leading-snug font-semibold text-admin-ink">
                      {raffle.name}
                    </span>
                    {/* The label carries the meaning; colour never stands alone. */}
                    <span
                      className={`inline-flex items-center rounded-[var(--radius-admin-control)] px-2 py-1 text-[0.8125rem] leading-tight font-semibold ${STATUS_CLASS[raffle.status]}`}
                    >
                      {STATUS_LABEL[raffle.status]}
                    </span>
                  </div>
                  <span className="text-hint text-admin-muted">
                    {raffle.prizeLabel ? `${raffle.prizeLabel} · ` : ''}
                    {ADMIN_COPY.raffles.progress(raffle.confirmedCount, raffle.winnersTarget)}
                    {' · '}
                    {raffle.pool === 'attended'
                      ? ADMIN_COPY.raffles.poolAttended
                      : ADMIN_COPY.raffles.poolConfirmed}
                  </span>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Link href={rafflePath(raffle.id)} className={BUTTON_SECONDARY}>
                    {ADMIN_COPY.raffles.configure}
                  </Link>
                  <Link href={raffleStagePath(raffle.id)} className={BUTTON_PRIMARY}>
                    {ADMIN_COPY.raffles.openStage}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="flex flex-col gap-4 px-4 py-5">
        <h2 className="text-[1.125rem] leading-snug font-bold text-admin-ink">
          {ADMIN_COPY.raffles.create}
        </h2>
        <RaffleForm raffle={null} eligibleAttended={attended} eligibleConfirmed={confirmed} />
      </Panel>
    </>
  );
}

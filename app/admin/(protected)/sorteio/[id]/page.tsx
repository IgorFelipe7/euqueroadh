import Link from 'next/link';
import { notFound } from 'next/navigation';

import { deleteRaffleAction, resetRaffleAction } from '@/app/admin/(protected)/actions';
import { ConfirmAction } from '@/components/admin/confirm-action';
import { RaffleForm } from '@/components/admin/raffle-form';
import { BUTTON_PRIMARY, BUTTON_QUIET, Notice, PageHeader, Panel } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { getAdminEvent } from '@/lib/data/admin/event';
import { countEligible, listDraws, listRaffles } from '@/lib/data/admin/raffles';
import { ROUTES, raffleStagePath } from '@/lib/routes';

const OUTCOME_LABEL = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  forfeited: 'Não estava presente',
} as const;

/**
 * `/admin/sorteio/[id]` — one raffle's configuration and its record.
 *
 * The record is the interesting half. Every draw is listed with its index and its outcome,
 * including the forfeited ones: the sequence of draws is what actually happened on stage, and a
 * person who was not in the room is part of that story rather than an embarrassment to hide
 * (RAFFLE-AND-CERTIFICATE-SPEC.md § 3.1).
 *
 * The **full** name is shown here, not the masked form. This page is read by one organizer on their
 * own screen; the mask exists for the projector.
 */
export default async function RaffleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const event = await getAdminEvent();
  if (!event) {
    return (
      <>
        <PageHeader title={ADMIN_COPY.raffles.title} />
        <Notice tone="error" role="alert">
          Não foi possível ler este sorteio agora. Recarregue a página em instantes.
        </Notice>
      </>
    );
  }

  // Read through the list so the summary's counts come from one place rather than being recomputed
  // here from a second query that could disagree with the control room's.
  const raffle = (await listRaffles(event.id)).find((candidate) => candidate.id === id);
  if (!raffle) notFound();

  const [draws, attended, confirmed] = await Promise.all([
    listDraws(raffle.id),
    countEligible(event.id, 'attended'),
    countEligible(event.id, 'confirmed'),
  ]);

  return (
    <>
      <PageHeader
        title={raffle.name}
        description={ADMIN_COPY.raffles.progress(raffle.confirmedCount, raffle.winnersTarget)}
        actions={
          <Link href={raffleStagePath(raffle.id)} className={BUTTON_PRIMARY}>
            {ADMIN_COPY.raffles.openStage}
          </Link>
        }
      />

      <Link href={ROUTES.adminRaffles} className={BUTTON_QUIET}>
        ← {ADMIN_COPY.raffles.title}
      </Link>

      {draws.length > 0 ? (
        <Panel className="flex flex-col gap-3 px-4 py-5">
          <h2 className="text-[1.125rem] leading-snug font-bold text-admin-ink">Resultados</h2>
          <ol className="flex flex-col gap-2">
            {draws.map((draw) => (
              <li key={draw.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-hint tabular-nums text-admin-muted">{draw.drawIndex}.</span>
                <span className="font-semibold text-admin-ink">{draw.fullName}</span>
                <span className="text-hint text-admin-muted">
                  {OUTCOME_LABEL[draw.outcome]} · sorteado entre {draw.poolSize}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-hint text-admin-muted">
            Cada sorteio guarda a semente aleatória e o tamanho do grupo, de modo que qualquer
            resultado pode ser reconferido depois.
          </p>
        </Panel>
      ) : null}

      <Panel className="flex flex-col gap-4 px-4 py-5">
        <h2 className="text-[1.125rem] leading-snug font-bold text-admin-ink">
          {ADMIN_COPY.raffles.configure}
        </h2>
        <RaffleForm raffle={raffle} eligibleAttended={attended} eligibleConfirmed={confirmed} />
      </Panel>

      <Panel className="flex flex-col gap-4 px-4 py-5">
        <h2 className="text-[1.125rem] leading-snug font-bold text-admin-ink">Ações permanentes</h2>

        <ConfirmAction
          action={resetRaffleAction}
          fields={{ raffleId: raffle.id }}
          label={ADMIN_COPY.raffles.resetCta}
          tone="secondary"
          disabled={draws.length === 0}
          disabledReason={draws.length === 0 ? 'Nada foi sorteado ainda.' : undefined}
          confirm={{
            title: ADMIN_COPY.raffles.resetCta,
            body: ADMIN_COPY.raffles.confirmations.reset,
            confirmLabel: ADMIN_COPY.raffles.resetCta,
            acknowledge: true,
          }}
        />

        <ConfirmAction
          action={deleteRaffleAction}
          fields={{ raffleId: raffle.id }}
          label={ADMIN_COPY.raffles.deleteCta}
          tone="danger"
          confirm={{
            title: ADMIN_COPY.raffles.deleteCta,
            body: ADMIN_COPY.raffles.confirmations.remove,
            confirmLabel: ADMIN_COPY.raffles.deleteCta,
            acknowledge: true,
          }}
        />
      </Panel>
    </>
  );
}

import { notFound } from 'next/navigation';

import { RaffleStage } from '@/components/admin/raffle-stage';
import { getAdminEvent } from '@/lib/data/admin/event';
import { listDraws, listEligibleLabels, listRaffles } from '@/lib/data/admin/raffles';

export const metadata = { title: 'Palco', robots: { index: false, follow: false } };

/**
 * `/admin/sorteio/[id]/palco` — the projected surface.
 *
 * Its whole job is to hand the client component three things and get out of the way:
 *
 *   * the raffle, for the header and the progress dots;
 *   * the draws so far, so a reload mid-animation shows the same pending winner rather than
 *     re-rolling one (RAFFLE-AND-CERTIFICATE-SPEC.md § 2);
 *   * the eligible pool **as masked labels**, which is the mechanical reason the projector can
 *     never show a full name: there is no other form of them in the browser (§ 3.6).
 */
export default async function RaffleStagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const event = await getAdminEvent();
  if (!event) notFound();

  const raffle = (await listRaffles(event.id)).find((candidate) => candidate.id === id);
  if (!raffle) notFound();

  const [draws, labels] = await Promise.all([
    listDraws(raffle.id),
    listEligibleLabels(event.id, raffle.id, raffle.pool),
  ]);

  return <RaffleStage raffle={raffle} initialDraws={draws} labels={labels} />;
}

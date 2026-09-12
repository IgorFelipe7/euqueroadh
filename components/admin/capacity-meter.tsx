/**
 * The capacity meter — the only chart-like element in the entire admin.
 *
 * It earns its place because it answers a question three separate numbers answer less well: *how
 * close are we, and how much overflow is waiting?* A registrations-over-time line would change no
 * decision an organizer makes about a free two-hour local event, so it does not exist
 * (ADMIN-SPEC.md section 3.2).
 *
 * A Server Component built from two divs and a percentage. No charting library, no canvas, no
 * client JavaScript.
 *
 * The waitlist is drawn **outside** the bar's right edge, visually overflowing it — which is
 * exactly what a waitlist is — and the text beneath carries the same information, so the meter is
 * never the only thing saying it.
 */

import { ADMIN_COPY } from '@/lib/admin/copy';

export function CapacityMeter({
  capacity,
  confirmed,
  waitlisted,
}: {
  capacity: number;
  confirmed: number;
  waitlisted: number;
}) {
  const undefinedCapacity = capacity <= 0;
  const filled = undefinedCapacity ? 0 : Math.min(100, (confirmed / capacity) * 100);
  const full = !undefinedCapacity && confirmed >= capacity;

  /*
   * The overflow segment is sized relative to the bar, capped at a third of it: a waitlist of 200
   * against a capacity of 80 must still leave the bar itself legible. The number beneath is the
   * precise value in every case, so the cap costs no information.
   */
  const overflow = capacity > 0 ? Math.min(33, (waitlisted / capacity) * 100) : waitlisted > 0 ? 20 : 0;

  const label = undefinedCapacity
    ? `${ADMIN_COPY.dashboard.capacityUndefined}. ${waitlisted} na lista de espera.`
    : `${confirmed} de ${capacity} vagas confirmadas, ${waitlisted} ${waitlisted === 1 ? 'pessoa' : 'pessoas'} na lista de espera`;

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={label} className="flex items-center gap-1">
        <div className="h-3 flex-1 overflow-hidden rounded-[var(--radius-admin-control)] bg-admin-line">
          <div
            className="h-full rounded-[var(--radius-admin-control)] bg-admin-blue"
            style={{ width: `${filled}%` }}
          />
        </div>
        {overflow > 0 ? (
          <div
            className="h-3 shrink-0 rounded-[var(--radius-admin-control)] bg-status-waitlisted"
            style={{ width: `${overflow}%` }}
          />
        ) : null}
      </div>

      <p className="text-hint flex flex-wrap justify-between gap-2 text-admin-muted">
        <span>
          {undefinedCapacity ? (
            <strong className="font-semibold text-admin-ink">
              {ADMIN_COPY.dashboard.capacityUndefined}
            </strong>
          ) : full ? (
            <strong className="font-semibold text-admin-ink">{ADMIN_COPY.dashboard.full}</strong>
          ) : (
            <>
              {confirmed} de {capacity} vagas
            </>
          )}
        </span>
        {waitlisted > 0 ? <span>+{waitlisted} na espera</span> : null}
      </p>
    </div>
  );
}

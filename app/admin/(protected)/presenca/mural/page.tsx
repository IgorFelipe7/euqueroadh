import { notFound } from 'next/navigation';

import { CheckInWall } from '@/components/admin/check-in-wall';
import { QrCode } from '@/components/qr-code';
import { getActiveCheckInSession } from '@/lib/data/admin/check-in';
import { getAdminEvent } from '@/lib/data/admin/event';
import { countAttendance } from '@/lib/data/admin/registrations';
import { formatDayNumber, formatMonthAbbreviation } from '@/lib/domain/format';
import { client as publicEnv } from '@/lib/env';
import { checkInUrl } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Check-in',
  robots: { index: false, follow: false },
};

/**
 * `/admin/presenca/mural` — the projected check-in wall.
 *
 * A route **inside** the protected subtree rather than a public page that renders a number: the wall is
 * shown on an organizer's own machine, so `requireAdmin()` in the layout and `assertAdmin()` in the
 * count endpoint both apply, and the composition simply covers the admin chrome the way the raffle
 * stage does.
 *
 * Its whole job is to hand the client component four things and get out of the way:
 *
 *   * the session URL, built from the canonical site URL rather than from a request header — the QR is
 *     scanned by phones that have never seen our host, on a venue network that may resolve it
 *     differently than this laptop does;
 *   * **the QR itself, rendered here**, on the server, as inline SVG. The single most important element
 *     on the screen therefore ships no JavaScript and cannot fail to appear;
 *   * the date lockup, for the signage half of what a wall at an entrance is;
 *   * the arrival count as it stands right now, so the first paint is already correct and the poll only
 *     ever has to move it.
 *
 * **No session, no wall.** `notFound()` rather than an empty state: a wall with a dead QR on a projector
 * is worse than no wall, and the panel on `/admin/presenca` is where check-in is opened.
 */
export default async function CheckInWallPage() {
  const event = await getAdminEvent();
  if (!event) notFound();

  const [session, counts] = await Promise.all([
    getActiveCheckInSession(event.id),
    countAttendance(event.id),
  ]);

  if (!session) notFound();

  const url = checkInUrl(publicEnv.NEXT_PUBLIC_SITE_URL, session.token);
  const starts = new Date(event.startsAt);

  return (
    <CheckInWall
      checkInUrl={url}
      // The URL as a person reads it: no scheme, so the line is about the address rather than about
      // `https`. The token stays — it is what makes the fallback actually usable by someone typing it.
      checkInLabel={url.replace(/^https?:\/\//, '')}
      dayNumber={formatDayNumber(starts)}
      monthLabel={formatMonthAbbreviation(starts)}
      initialPresent={counts?.present ?? null}
      qr={
        <QrCode
          value={url}
          // Level Q recovers about a quarter of a damaged symbol at the same module count level M
          // would need for this payload — free robustness against a projector's glare, a camera's
          // angle and the hand that ends up in front of the screen.
          level="Q"
          className="block h-auto w-full"
        />
      }
    />
  );
}

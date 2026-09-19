import { NextResponse } from 'next/server';

import { getAdminEvent } from '@/lib/data/admin/event';
import { countAttendance } from '@/lib/data/admin/registrations';
import { assertAdmin } from '@/lib/data/auth';
import { UnauthorizedError } from '@/lib/data/errors';
import { NO_STORE_HEADERS } from '@/lib/security/csp';

export const dynamic = 'force-dynamic';

/**
 * `/admin/presenca/contagem` — two numbers, for the wall's live count.
 *
 * ## Why an endpoint at all, and why not Realtime
 *
 * The projected wall shows how many people have arrived, and that number has to move as they do. The
 * options were a Supabase Realtime subscription, a server-sent stream, or a small poll. The poll wins
 * on the axis that matters at a live event: **it has no connection to lose.** A dropped websocket on a
 * venue's wifi leaves a wall showing a number that silently stopped being true, and nothing on screen
 * says so; a failed fetch is one missed tick, and the next one repairs it. It also needs no new
 * infrastructure, no new client library and no new authorization surface (launch brief § 35, D34 made
 * the same call for the raffle stage).
 *
 * ## What it discloses
 *
 * Two integers. **No participant record of any kind** — no name, no age, no telephone number, no id,
 * not even a list length that could be correlated with one. It is the same aggregate the door screen's
 * header already renders, which is why it reuses `countAttendance()` rather than growing a query of
 * its own.
 *
 * ## Why it is authenticated
 *
 * The wall is shown on an organizer's own machine, so it lives inside `/admin` and inside `proxy.ts`'s
 * matcher, and this endpoint calls `assertAdmin()` first. Turnout is operational information about the
 * organization — D19 keeps it off the public page for exactly that reason — so a public counter would
 * be a new disclosure in service of a screen only the organizers ever look at.
 *
 * Being under `(protected)` grants this file nothing: a layout's check does not cover route handlers.
 * The `assertAdmin()` below is the boundary.
 */
export async function GET() {
  try {
    await assertAdmin();

    const event = await getAdminEvent();
    if (!event) {
      // The wall keeps whatever it last displayed and marks itself stale rather than dropping to zero:
      // a wall reading `0` during a database blip is a lie an operator would act on.
      return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const counts = await countAttendance(event.id);
    if (!counts) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(
      { present: counts.present, confirmed: counts.confirmed },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      // No provider text, no reason, no distinction between "signed out" and "not an administrator".
      return NextResponse.json(
        { error: 'unauthorized', correlationId: error.correlationId },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    throw error;
  }
}

import type { Metadata } from 'next';

import { CheckInForm } from '@/components/check-in-form';
import { Grain } from '@/components/site/grain';
import { getCheckInSession } from '@/lib/data/public';
import { CHECK_IN_COPY } from '@/lib/check-in/state';
import { client as publicEnv } from '@/lib/env';
import { formatTimeRange, formatWeekdayDate } from '@/lib/domain/format';
import { certificatePortalLabel } from '@/lib/routes';

/**
 * `/presenca/<session-token>` — the guest's own check-in.
 *
 * The token in the URL is a **capability the administrator opened**, not an identifier: it is valid
 * only while its session is open and unexpired, and closing check-in makes every copy of this link —
 * in every camera roll, on every screenshot of the projected QR — inert within the same transaction.
 * That is the whole reason a permanent `/presenca` endpoint does not exist (migration 17).
 *
 * **Every negative case renders the same screen**: unknown token, closed session, expired session.
 * `get_check_in_session` returns zero rows for all three, so this page cannot be used to tell them
 * apart, and it discloses nothing about the event or its participants either way.
 *
 * The page itself does no identification. It resolves the session, renders the event it belongs to,
 * and hands the flow to one small client island whose only server contact is the Server Action.
 */

export const dynamic = 'force-dynamic';

/**
 * Never indexed, never followed, never archived.
 *
 * The generic title is deliberate: a browser tab, a shared screenshot and a history entry would
 * otherwise carry a live check-in capability's context to anyone standing behind the phone.
 */
export const metadata: Metadata = {
  title: 'Confirmar presença',
  robots: { index: false, follow: false, nocache: true, noarchive: true },
};

function Unavailable() {
  const copy = CHECK_IN_COPY.outcomes.session_closed;

  return (
    <main className="u-shell flex min-h-dvh max-w-[52ch] flex-col justify-center gap-6 py-16">
      <p className="text-micro-label text-text-muted uppercase">{CHECK_IN_COPY.kicker}</p>
      <h1 className="text-h2 font-stretch-[105%] text-balance text-text-primary">{copy.heading}</h1>
      {copy.body.map((paragraph) => (
        <p key={paragraph} className="text-body text-text-secondary">
          {paragraph}
        </p>
      ))}
    </main>
  );
}

export default async function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getCheckInSession(decodeURIComponent(token));

  if (!session) return <Unavailable />;

  const starts = new Date(session.startsAt);
  const ends = session.endsAt ? new Date(session.endsAt) : null;

  return (
    <>
      <Grain />

      {/*
        `min-h-dvh`, not `min-h-screen`: on a phone the dynamic viewport unit is what keeps the submit
        button reachable when the browser chrome is showing, and what stops the layout jumping when
        the keyboard opens over it (VISUAL-DIRECTION.md § 9.8).
      */}
      <main className="u-shell flex min-h-dvh max-w-[34rem] flex-col justify-center gap-8 py-10">
        <header className="flex flex-col gap-3">
          <p className="text-micro-label text-gold-400 uppercase">{CHECK_IN_COPY.kicker}</p>

          <h1 className="text-h2 font-stretch-[105%] text-balance text-text-primary">
            {CHECK_IN_COPY.heading}
          </h1>

          <p className="text-body text-text-secondary">{CHECK_IN_COPY.welcome}</p>

          {/*
            The event, small and factual, so a guest who scanned the wrong screen at a venue running
            two things at once can tell immediately. Never a participant, never a number.
          */}
          <p className="text-hint mt-1 text-text-muted">
            {session.eventTitle}
            {' · '}
            {formatWeekdayDate(starts)}
            {ends ? ` · ${formatTimeRange(starts, ends)}` : ''}
          </p>
        </header>

        <CheckInForm
          sessionToken={token}
          siteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          certificatePortal={certificatePortalLabel(publicEnv.NEXT_PUBLIC_SITE_URL)}
        />
      </main>
    </>
  );
}

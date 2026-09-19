'use client';

/**
 * The check-in wall — the surface a room looks at.
 *
 * ## What it is
 *
 * A full-bleed navy field with three things on it: the instruction, one very large QR, and the number
 * of people who have arrived. It wears the **event's** identity rather than the admin's, which makes it
 * the second exception to "the admin is light" (D38 was the first, for the raffle stage) and for the
 * same reason: this is rendered for an audience, not for a reader.
 *
 * ## What it must never show, and why the constraint is structural
 *
 * **No participant names.** Not the last person to arrive, not a scrolling list, not an initial. This
 * component's props are a URL, a date lockup and two integers — there is no name in scope for a future
 * edit to render, which is a stronger guarantee than a comment asking nobody to add one.
 *
 * ## The count, and why it polls
 *
 * Every four seconds, one authenticated fetch of two integers. A websocket would push the number
 * instead, and on a venue's wifi it would also silently stop pushing it — leaving a wall showing a
 * figure that is no longer true with nothing on screen to say so. A failed poll is one missed tick that
 * the next one repairs, and after three consecutive failures the wall says `Sem atualização` rather
 * than continuing to assert a stale number (launch brief § 36: if the count stops, the QR must keep
 * working, and it does — it is static markup).
 *
 * ## The motion
 *
 * When the number increases, it changes once and stops: the new value rises into place and a single
 * bead on the counting rail settles. No confetti, no loop, nothing casino-like — the feeling the brief
 * asks for is a precision instrument coming to rest, which is the same restraint the raffle stage's
 * 600ms bloom was built on. Under `prefers-reduced-motion` the number simply changes.
 */

import { useEffect, useRef, useState } from 'react';

import { ADMIN_COPY } from '@/lib/admin/copy';
import { ROUTES } from '@/lib/routes';

const COPY = ADMIN_COPY.checkIn.wall;

/**
 * Four seconds.
 *
 * Fast enough that an arrival feels acknowledged by the room while the person is still walking past
 * the screen; slow enough that a two-hour event is a few hundred requests for two integers. The brief
 * sanctions 2–5s and the middle of that range is the right place to sit — at two seconds a transient
 * wifi drop is three failures in six seconds and the wall would cry stale over nothing.
 */
const POLL_INTERVAL_MS = 4_000;

/** How many consecutive failures before the wall admits it is not updating. */
const STALE_AFTER_FAILURES = 3;

export function CheckInWall({
  checkInUrl,
  checkInLabel,
  dayNumber,
  monthLabel,
  initialPresent,
  qr,
}: {
  /** The full URL the QR encodes. Shown below it in readable form as the scanner-less fallback. */
  checkInUrl: string;
  /** `euqueroadh.com/presenca/…` — the same URL without its scheme, for the eye rather than a camera. */
  checkInLabel: string;
  dayNumber: string;
  monthLabel: string;
  initialPresent: number | null;
  /** The QR, rendered on the server. It is markup, so it survives every failure this page can have. */
  qr: React.ReactNode;
}) {
  const [present, setPresent] = useState(initialPresent);
  const [stale, setStale] = useState(false);
  /** Bumped only when the count *increases*, which is what triggers the one-shot animation. */
  const [arrivalTick, setArrivalTick] = useState(0);

  const previous = useRef(initialPresent);
  const failures = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(ROUTES.adminAttendanceCount, { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));

        const body: unknown = await response.json();
        const value =
          typeof body === 'object' && body !== null && typeof (body as { present?: unknown }).present === 'number'
            ? (body as { present: number }).present
            : null;

        if (cancelled || value === null) return;

        failures.current = 0;
        setStale(false);

        // Only an increase animates. A count that goes *down* — an organizer undoing a mis-tap on the
        // door screen — corrects itself silently: a celebration for a departure would be nonsense.
        if (previous.current !== null && value > previous.current) {
          setArrivalTick((tick) => tick + 1);
        }

        previous.current = value;
        setPresent(value);
      } catch {
        if (cancelled) return;

        failures.current += 1;
        // The last known number stays on screen. Dropping to `—` on a single dropped packet would make
        // the wall flicker; claiming a number that stopped moving is worse, so after three failures it
        // says so and keeps the figure.
        if (failures.current >= STALE_AFTER_FAILURES) setStale(true);
      }
    }

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="u-wall">
      <div className="u-glow" aria-hidden="true" />

      <div className="u-wall-grid">
        {/* ---- The instruction, left on a wide screen and above the QR on a narrow one. ---- */}
        <div className="flex flex-col justify-center gap-6">
          <p className="text-micro-label text-gold-400 uppercase">{COPY.title}</p>

          <h1 className="u-wall-headline">
            <span className="font-light">{COPY.arrived}</span>
            <span className="font-extrabold">{COPY.confirm}</span>
          </h1>

          {/*
            The date lockup, in the identity's own two-weight treatment. It is here because a wall at
            an entrance is also signage: somebody walking past should be able to tell what this is.
          */}
          <p className="u-wall-date" aria-hidden="true">
            <span className="font-bold">{dayNumber}</span>
            <span className="font-normal tracking-[0.02em]">{monthLabel}</span>
          </p>
        </div>

        {/* ---- The QR, and the address under it. ---- */}
        <div className="flex flex-col items-center justify-center gap-5">
          {/*
            A white plate with generous padding around the symbol. The QR's own quiet zone is drawn
            inside it (ISO/IEC 18004 requires four modules); this is the physical margin that keeps a
            camera from having to resolve navy right against the finder patterns.
          */}
          <div className="u-wall-qr">{qr}</div>

          <p className="u-wall-instruction">{COPY.instruction}</p>

          {/*
            The URL in readable form. The fallback for a phone whose camera app will not scan, for
            somebody using a laptop, and for the organizer who needs to read it out.
          */}
          <p className="u-wall-url" title={checkInUrl}>
            {checkInLabel}
          </p>
        </div>

        {/* ---- The count. ---- */}
        <div className="u-wall-count">
          {/*
            The counting rail, reduced to what a wall needs: five beads, the last of which moves when
            somebody arrives. It is the hero's motif (VISUAL-DIRECTION.md § 7.4) rather than a new
            decoration, and it carries the same meaning here — a value counted onto a rail.
          */}
          <svg
            viewBox="0 0 220 24"
            className="u-wall-rail"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <line x1="0" y1="12" x2="220" y2="12" stroke="var(--color-blue-600)" strokeWidth="3" />
            {[10, 46, 82, 118].map((x) => (
              <rect key={x} x={x} y="4" width="26" height="16" rx="8" fill="var(--color-blue-500)" />
            ))}
            {/*
              The one bead that responds. Keyed by `arrivalTick` so React replaces the element on every
              increase, which restarts the animation — a CSS class toggle would need a frame of cleanup
              between two arrivals a second apart.
            */}
            <rect
              key={arrivalTick}
              x="154"
              y="4"
              width="26"
              height="16"
              rx="8"
              fill="var(--color-gold-400)"
              className={arrivalTick > 0 ? 'u-wall-bead' : undefined}
            />
          </svg>

          <p
            // `aria-live` deliberately absent: nobody is using a screen reader on a projector, and an
            // announcement every four seconds would be hostile if anybody were.
            data-testid="wall-count"
            key={arrivalTick}
            className={`u-wall-number ${arrivalTick > 0 ? 'u-wall-number-arrive' : ''}`}
          >
            {present === null ? '—' : present}
          </p>

          <p className="u-wall-count-label">
            {present === 1 ? COPY.countLabelSingular : COPY.countLabel}
            {stale ? <span className="u-wall-stale"> · {COPY.stale}</span> : null}
          </p>
        </div>
      </div>

      <WallControls />
    </div>
  );
}

/**
 * The chrome: full-screen and exit.
 *
 * It fades out after three seconds of no input and returns on pointer movement or keyboard focus, so
 * what the room sees is the composition and never a toolbar. `visibility` rides along with the opacity
 * so a faded control leaves the tab order too — the same `.u-stage-chrome` behaviour the raffle stage
 * established, reused rather than reinvented.
 */
function WallControls() {
  const [visible, setVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const show = () => {
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 3_000);
    };

    show();
    window.addEventListener('pointermove', show);
    window.addEventListener('keydown', show);

    const onFullscreenChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', show);
      window.removeEventListener('keydown', show);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // A browser that refuses the request — or a user who dismissed the prompt — changes nothing that
      // matters: the wall already fills the viewport, and the QR is the same size either way.
    }
  }

  return (
    <div data-visible={visible} className="u-stage-chrome u-wall-chrome">
      <button type="button" onClick={toggleFullscreen} className="u-wall-control">
        {fullscreen ? COPY.exitFullscreen : COPY.fullscreen}
      </button>
      <a href={ROUTES.adminAttendance} className="u-wall-control">
        {COPY.exit}
      </a>
    </div>
  );
}

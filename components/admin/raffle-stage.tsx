'use client';

/**
 * The stage — RAFFLE-AND-CERTIFICATE-SPEC.md § 3.5–3.7.
 *
 * **This screen is the control.** There is no second device, no realtime channel and no polling
 * loop: the operator's laptop is plugged into the projector and the operator presses the space bar
 * on the screen everyone is watching. That is one moving part instead of three, and the three would
 * each be a way for the most visible sixty seconds of the evening to fail.
 *
 * **The winner is already decided when the animation starts.** `drawWinnerAction` returns a result
 * the database has already written; everything below is theatre replayed over it. A reload
 * mid-animation re-reads the same pending draw. No code here chooses anything.
 *
 * **The browser is given masked labels only.** `labels` and `winner.maskedName` are computed on the
 * server (§ 3.6). The winner's full name arrives too, and is rendered *only* inside the confirm
 * control — which lives in the chrome layer that fades out and is never part of the composition the
 * room is looking at.
 */

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { drawWinnerAction, resolveDrawAction } from '@/app/admin/(protected)/actions';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { IDLE, type StageWinner } from '@/lib/admin/state';
import type { RaffleDraw, RaffleSummary } from '@/lib/data/admin/raffles';
import { ROUTES } from '@/lib/routes';

/** The deceleration. One custom curve, long enough to be suspenseful and short enough to land. */
const SETTLE_MS = 2600;
const SETTLE_EASE = 'cubic-bezier(.12,.72,.1,1)';

/** How many names scroll past before the winner. Enough to read as a draw, not so many it drags. */
const RUN_UP = 14;

/** The chrome hides after this long without input, so the room sees the composition. */
const CHROME_IDLE_MS = 3000;

type Phase = 'idle' | 'spinning' | 'settling' | 'settled';

function shuffled(labels: readonly string[], count: number): string[] {
  if (labels.length === 0) return [];
  const out: string[] = [];
  for (let index = 0; index < count; index += 1) {
    out.push(labels[Math.floor(Math.random() * labels.length)]);
  }
  return out;
}

/** `Ana S.` split for the two-tone treatment: given name white, abbreviated surname in sky. */
function splitMasked(masked: string): { given: string; initial: string } {
  const space = masked.lastIndexOf(' ');
  if (space === -1) return { given: masked, initial: '' };
  return { given: masked.slice(0, space), initial: masked.slice(space + 1) };
}

export function RaffleStage({
  raffle,
  initialDraws,
  labels,
}: {
  raffle: RaffleSummary;
  initialDraws: readonly RaffleDraw[];
  /** Masked labels of everyone currently eligible. Never full names. */
  labels: readonly string[];
}) {
  const router = useRouter();

  const [drawState, draw, drawing] = useActionState(drawWinnerAction, IDLE);
  const [resolveState, resolve, resolving] = useActionState(resolveDrawAction, IDLE);

  /*
   * A draw already on screen when the page loaded — the reload-mid-animation case. It is shown
   * settled, because the animation is not the result and replaying it would be a second theatre
   * over the same fact.
   */
  const pending = initialDraws.find((entry) => entry.outcome === 'pending') ?? null;
  const resolved = initialDraws.filter((entry) => entry.outcome === 'confirmed');
  const confirmedCount = resolved.length;
  const complete = confirmedCount >= raffle.winnersTarget;

  // Lazy initial state rather than an effect that corrects itself one frame later: a stage that
  // flashed "barra de espaço para sortear" before showing the winner it already had would look, on
  // a projector, exactly like a re-roll.
  const [phase, setPhase] = useState<Phase>(pending ? 'settled' : 'idle');
  const [winner, setWinner] = useState<StageWinner | null>(
    pending
      ? {
          drawId: pending.id,
          maskedName: pending.maskedName,
          fullName: pending.fullName,
          drawIndex: pending.drawIndex,
          poolSize: pending.poolSize,
        }
      : null,
  );

  /*
   * The names that scroll past before the winner. Drawn once, in the event handler that starts the
   * draw, because `Math.random()` is impure and must not run during a render.
   */
  const [runUp, setRunUp] = useState<string[]>([]);
  const [chromeVisible, setChromeVisible] = useState(true);

  const stripRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * The strip is derived, never stored: it is the run-up, with the winner appended once the server
   * has named one. One less piece of state to keep in step with `phase`.
   */
  const strip = phase === 'settling' && winner ? [...runUp, winner.maskedName] : runUp;

  /* ---------------------------------------------------------------------------------------------
   * The chrome's auto-hide
   * ------------------------------------------------------------------------------------------- */
  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
  }, []);

  // Only the timer is scheduled on mount; `chromeVisible` already starts true, so nothing is set
  // synchronously here. The hide happens in the timeout's callback.
  useEffect(() => {
    const timer = setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
    return () => {
      clearTimeout(timer);
      if (chromeTimer.current) clearTimeout(chromeTimer.current);
    };
  }, []);

  /* ---------------------------------------------------------------------------------------------
   * The draw
   * ------------------------------------------------------------------------------------------- */
  const startDraw = useCallback(() => {
    if (drawing || complete || winner) return;

    setRunUp(shuffled(labels, RUN_UP));
    setPhase('spinning');

    const formData = new FormData();
    formData.set('raffleId', raffle.id);

    /*
     * Inside a transition, always. A `useActionState` dispatch called from a plain event handler
     * does not drive its own `isPending`, so `drawing` would stay false and the stage would offer
     * `Sortear` again while a draw was still in flight — on the one screen where a double press
     * must be impossible.
     */
    startTransition(() => draw(formData));
  }, [complete, draw, drawing, labels, raffle.id, winner]);

  /*
   * The server has answered.
   *
   * Adjusted **during render**, which is React's documented pattern for "a value arrived, derive
   * from it" and the reason this is not a `useEffect`: an effect would commit one frame in which
   * the reel was still spinning over a winner that had already been decided, and on a projected
   * screen that frame is visible.
   */
  const [seenDraw, setSeenDraw] = useState(drawState);

  if (drawState !== seenDraw) {
    setSeenDraw(drawState);

    if (drawState.status === 'ok' && drawState.winner && winner?.drawId !== drawState.winner.drawId) {
      setWinner(drawState.winner);

      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Reduced motion gets the same result with none of the theatre: no reel, no deceleration.
      setPhase(reduced ? 'settled' : 'settling');
    } else if (drawState.status === 'error') {
      // A refused draw — `pool_empty`, `draw_pending` — must not leave the reel spinning forever.
      setPhase('idle');
    }
  }

  /*
   * Runs after the settling strip has been committed to the DOM, so the row height it measures is
   * the real one — the reel's row size is a `clamp()` in CSS and must not be duplicated here.
   */
  useEffect(() => {
    if (phase !== 'settling') return;

    const element = stripRef.current;
    const row = rowRef.current;
    if (!element || !row) return;

    const rowHeight = row.offsetHeight;
    const distance = rowHeight * (strip.length - 1);

    element.style.transition = 'none';
    element.style.transform = 'translate3d(0, 0, 0)';
    // Forcing a layout read is the documented way to make the next style change a transition rather
    // than a jump. The `void` is deliberate: the value is never used, only the reflow it causes.
    void element.offsetHeight;
    element.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASE}`;
    element.style.transform = `translate3d(0, -${distance}px, 0)`;

    const timer = setTimeout(() => setPhase('settled'), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [phase, strip.length]);

  /* ---------------------------------------------------------------------------------------------
   * Resolving
   * ------------------------------------------------------------------------------------------- */
  const settle = useCallback(
    (outcome: 'confirmed' | 'forfeited') => {
      if (!winner || resolving) return;

      const formData = new FormData();
      formData.set('drawId', winner.drawId);
      formData.set('outcome', outcome);
      startTransition(() => resolve(formData));
    },
    [resolve, resolving, winner],
  );

  /*
   * The draw has been confirmed or forfeited. Derived during render, for the same reason as the
   * draw above, and `router.refresh()` is deliberately *not* here — a render must stay pure. It is
   * called from the effect below, which is exactly what an effect is for: telling an external
   * system (the router) about a state change React has already made.
   */
  const [seenResolve, setSeenResolve] = useState(resolveState);

  if (resolveState !== seenResolve) {
    setSeenResolve(resolveState);
    if (resolveState.status === 'ok') {
      setWinner(null);
      setRunUp([]);
      setPhase('idle');
    }
  }

  useEffect(() => {
    if (resolveState.status !== 'ok') return;
    // The already-drawn column and the progress dots come from the server, so the record on screen
    // is the record in the database rather than a tally this component kept.
    router.refresh();
  }, [resolveState, router]);

  /* ---------------------------------------------------------------------------------------------
   * Keyboard. Every shortcut is also a real button in the chrome layer — a keyboard-only interface
   * is not an accessible one.
   * ------------------------------------------------------------------------------------------- */
  useEffect(() => {
    function onKey(keyboard: KeyboardEvent) {
      // Never swallow a key aimed at a control the operator has focused.
      const target = keyboard.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) {
        if (keyboard.key !== ' ') return;
      }

      wakeChrome();

      switch (keyboard.key) {
        case ' ':
          keyboard.preventDefault();
          if (!winner) startDraw();
          break;
        case 'Enter':
          if (winner && phase === 'settled') settle('confirmed');
          break;
        case 'x':
        case 'X':
          if (winner && phase === 'settled') settle('forfeited');
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen().catch(() => undefined);
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, settle, startDraw, wakeChrome, winner]);

  const showReel = phase === 'spinning' || phase === 'settling';
  const showWinner = phase === 'settled' && winner !== null;
  const { given, initial } = splitMasked(winner?.maskedName ?? '');

  const errorMessage =
    drawState.status === 'error'
      ? drawState.message
      : resolveState.status === 'error'
        ? resolveState.message
        : null;

  return (
    <div
      className="u-stage flex flex-col"
      onPointerMove={wakeChrome}
      onFocusCapture={wakeChrome}
    >
      {/* The single light source, reused rather than reinvented. */}
      <div className="u-glow" aria-hidden="true" />

      {/* ----------------------------------------------------------------------------------------
        * Header: which raffle, and how far through it is.
        * ------------------------------------------------------------------------------------- */}
      <header className="relative z-10 flex items-start justify-between gap-4 px-6 pt-6 sm:px-10 sm:pt-8">
        <p className="text-kicker uppercase text-text-muted">{raffle.name}</p>

        <div className="flex items-center gap-3">
          <ul className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: raffle.winnersTarget }, (_, index) => (
              <li
                key={index}
                className={`size-2 rounded-full ${
                  index < confirmedCount ? 'bg-gold-400' : 'bg-ink-600'
                }`}
              />
            ))}
          </ul>
          <p className="text-kicker uppercase tabular-nums text-text-muted">
            {ADMIN_COPY.raffles.progress(confirmedCount, raffle.winnersTarget)}
          </p>
        </div>
      </header>

      {/* ----------------------------------------------------------------------------------------
        * The subject. One thing, with room around it.
        * ------------------------------------------------------------------------------------- */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {raffle.prizeLabel ? (
          <p className="text-[clamp(1rem,2.5vw,1.5rem)] text-text-secondary">{raffle.prizeLabel}</p>
        ) : null}

        {complete && !winner ? (
          <p className="u-stage-winner text-text-primary">{ADMIN_COPY.raffles.stage.complete}</p>
        ) : showReel ? (
          <div className="u-reel-window w-full max-w-[90vw]">
            <div ref={stripRef} className={`u-reel-strip ${phase === 'spinning' ? 'u-reel-spin' : ''}`}>
              {strip.map((label, index) => (
                <div
                  key={`${label}-${index}`}
                  ref={index === 0 ? rowRef : undefined}
                  className="u-reel-row text-text-primary"
                >
                  {label}
                </div>
              ))}
            </div>
            {/* The speed blur: the same strip, faint and offset, instead of a per-frame filter. */}
            <div className="u-reel-ghost" aria-hidden="true">
              <div className={`u-reel-strip ${phase === 'spinning' ? 'u-reel-spin' : ''}`}>
                {strip.map((label, index) => (
                  <div key={`ghost-${label}-${index}`} className="u-reel-row text-sky-300">
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : showWinner ? (
          <p className="u-stage-winner u-stage-bloom">
            <span className="text-text-primary">{given}</span>
            {initial ? <span className="text-sky-300"> {initial}</span> : null}
          </p>
        ) : (
          <p className="text-[clamp(1rem,2.5vw,1.5rem)] lowercase tracking-[0.18em] text-text-muted">
            {ADMIN_COPY.raffles.stage.hint}
          </p>
        )}

        {/*
          The rule under the name is the chart's own line, drawn to its resting point: the event's
          subject, the identity's signature, and the structural rule a result needs, at once.
        */}
        <svg
          viewBox="0 0 600 40"
          className="h-10 w-[min(90vw,44rem)]"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M0 32 L64 26 L112 30 L176 18 L232 24 L288 12 L344 20 L408 8 L464 16 L520 4 L600 10"
            stroke="var(--color-sky-300)"
            strokeWidth="2"
            strokeLinejoin="round"
            opacity={showWinner ? 0.55 : 0.18}
            style={{ transition: 'opacity 600ms var(--ease-settle)' }}
          />
        </svg>

        {/*
          The result, announced. The stage is watched, not read, so the live region is what makes it
          reach anyone using a screen reader — and it carries the masked form, like the screen.
        */}
        <p role="status" aria-live="polite" className="sr-only">
          {showWinner && winner ? ADMIN_COPY.raffles.stage.announceWinner(winner.maskedName) : ''}
        </p>
      </main>

      {/* ----------------------------------------------------------------------------------------
        * The chrome. Fades out; never part of what the room is looking at.
        * ------------------------------------------------------------------------------------- */}
      <footer
        className="u-stage-chrome relative z-10 flex flex-wrap items-end justify-between gap-4 px-6 pb-6 sm:px-10 sm:pb-8"
        data-visible={chromeVisible || showWinner ? 'true' : 'false'}
      >
        <div className="flex min-w-0 flex-col gap-2">
          {resolved.length > 0 ? (
            <>
              <p className="text-kicker uppercase text-text-muted">
                {ADMIN_COPY.raffles.stage.drawn}
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {resolved.map((entry) => (
                  <li key={entry.id} className="text-[0.9375rem] text-text-secondary">
                    {entry.maskedName}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <Link
            href={ROUTES.adminRaffles}
            className="text-[0.8125rem] text-text-muted underline underline-offset-4"
          >
            ← {ADMIN_COPY.raffles.stage.exit}
          </Link>
        </div>

        <div className="flex flex-col items-end gap-2">
          {errorMessage ? (
            <p role="alert" className="text-[0.9375rem] text-danger-300">
              {errorMessage}
            </p>
          ) : null}

          {showWinner && winner ? (
            <>
              {/* The operator has to announce the right person, so they see the full name. */}
              <p className="text-[0.9375rem] text-text-secondary">{winner.fullName}</p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => settle('forfeited')}
                  disabled={resolving}
                  className="min-h-14 rounded-full border border-border-strong px-6 text-[1rem] font-semibold text-text-primary"
                >
                  {ADMIN_COPY.raffles.stage.forfeit}
                </button>
                {/* Gold appears exactly once on this screen. */}
                <button
                  type="button"
                  onClick={() => settle('confirmed')}
                  disabled={resolving}
                  className="min-h-14 rounded-full bg-gold-400 px-8 text-[1rem] font-bold text-ink-900"
                >
                  {ADMIN_COPY.raffles.stage.confirm}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={startDraw}
              disabled={drawing || complete || phase !== 'idle'}
              className="min-h-14 rounded-full bg-gold-400 px-8 text-[1rem] font-bold text-ink-900 disabled:opacity-40"
            >
              {drawing || showReel
                ? ADMIN_COPY.raffles.stage.drawing
                : ADMIN_COPY.raffles.stage.draw}
            </button>
          )}

          <p className="text-[0.75rem] text-text-muted">{ADMIN_COPY.raffles.stage.shortcuts}</p>
        </div>
      </footer>
    </div>
  );
}

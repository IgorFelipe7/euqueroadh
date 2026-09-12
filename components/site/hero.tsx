/**
 * The hero — VISUAL-DIRECTION.md sections 5.1, 6.3 and 7.2.
 *
 * Three compositions, not one layout that shrinks (section 11.1):
 *
 *   * **≤ 767 px** — one column, `88svh`, the type stack reading top to bottom, the date lockup
 *     oversized and cropped by the right edge, the CTA full width in the thumb zone.
 *   * **768–1023 px** — its own composition: the date lockup moves *beside* the meta line rather
 *     than above it, which is what stops the tablet from reading as a stretched phone.
 *   * **≥ 1024 px** — the asymmetric split of section 5.1. The type stack in columns 1–7; the date
 *     block lifted out of the grid entirely and anchored to the **viewport's** right edge, low, so
 *     it is genuinely cropped by the frame and so the composition reads as a diagonal from the
 *     title at the top left to the date at the bottom right.
 *
 * **Three depth planes, built from stacking rather than from translucency** (section 7.2). The
 * chart, the glow and the grain are behind; the type is in the middle; the `para jovens` pill and
 * the primary CTA are in front, overlapping the chart's brightest region. That single occlusion
 * relationship is what gives the page depth, and it is why there is no WebGL here.
 *
 * At least 30% of the desktop hero stays empty of type and imagery (section 4.3). That emptiness is
 * a specified element: new content goes in a new section, never into the hero's air.
 *
 * `overflow-clip` rather than `overflow-hidden`: the display type and the date lockup are meant to
 * be cut by the frame, and the document must never become wider than the viewport doing it
 * (section 11.2).
 */
import type { EventPresentation } from '@/lib/domain/event-presentation';

import { ChartMotif } from './chart-motif';
import { CountingRail } from './counting-rail';
import { CTA_PRIMARY } from './cta';
import { DateLockup } from './date-lockup';
import { JourneyAnchor, JourneyNode, JourneyRail, JourneySegment } from './journey';

export const HERO_CTA_ID = 'hero-cta';

export function Hero({
  event,
  banner,
  cta,
  registrationAnchor,
}: {
  readonly event: EventPresentation;
  /** The advisory state sentence, or `null` when registrations are simply open. */
  readonly banner: string | null;
  /** The primary action's label, or `null` when there is nothing to act on. */
  readonly cta: string | null;
  readonly registrationAnchor: string;
}) {
  /*
   * Two lines rather than one long one. Set as a single sentence it wraps to "… · Espaço" /
   * "Cezanne Eventos" at almost every width, which is an orphan produced by chance; splitting it
   * where the meaning already splits — when, then where — makes the break a decision.
   */
  const when = [event.weekdayDate, event.timeRange].filter(Boolean).join(' · ');

  return (
    <header className="relative isolate flex min-h-[88svh] flex-col overflow-clip pt-12 lg:min-h-[92svh] lg:pt-16">
      {/* ---- Back plane: the entire decorative budget of the page (section 7). ---- */}
      <div className="u-plane-back" aria-hidden="true">
        <div className="u-glow" />
        <ChartMotif className="u-chart-field" />

      </div>

      {/*
        The journey's first slice — above the motif, below the type (section 10.8). The motif is the
        atmosphere the line comes out of; putting the line behind it would bury the one element the
        page is meant to be remembered for.
      */}
      <JourneySegment className="z-0" />

      {/*
        The counting rail (section 7.4), the hero's second object and the right half's subject.

        **It paints after the line, and that ordering is the fusion.** Both sit at `z-0`, so tree
        order decides: the line runs *behind* the object, which means the stretch where the two are
        collinear shows up as that one rail reading brighter and heavier, and the rest of the line
        threads between the beads instead of being ruled across them. The lockup, one plane up,
        stands in front of both — three planes out of two occlusions, no translucency (section 7.2).

        From `lg` only. Below it the hero is a single column of display type with the date lockup
        cropped by the edge, and there is no right-hand region to put an object in — see section
        7.4 on why the answer there is nothing rather than a smaller version of this.
      */}
      <CountingRail />

      {/*
        The date block on desktop — the composition's second subject (section 5.2), and from
        section 10.8 the journey's origin.

        Anchored to the header rather than to a grid column, because the grid is centred inside a
        1200px shell and nothing inside it can reach the viewport edge. `translate-x` pushes it past
        that edge so the frame crops it, which is the whole lesson of section 1.9: an object that
        does not fit reads as larger than the screen. The translate is a percentage of the lockup's
        own width, so the *proportion* of the `T` that the frame cuts is identical at 1024px and at
        1920px — a crop that holds its shape is read as a decision; one that drifts with the
        viewport is read as an accident.

        The points sit outside the element that rises, deliberately: a point measured while its
        parent is mid-entrance would pin the line 12px away from where the lockup finally lands.
      */}
      <div className="u-plane-middle absolute right-0 bottom-[19%] hidden lg:block">
        <div className="relative translate-x-[9%]">
          <div className="u-rise [--rise-step:6]">
            <DateLockup day={event.day} month={event.month} />
          </div>

          {/*
            The line's arrival, on the lockup's own baseline — 19% of the box, which is where this
            font's baseline sits at every size — and just off the left shoulder of the `19`. The date
            therefore stands *on* the line rather than beside it, which is the whole reason the
            lockup is where it is.

            It used to be reached by a horizontal run in from the left. From Phase 5.3 the line
            arrives from the counting rail above instead (section 7.4), and leaves along the hero's
            empty lower left — so the same node now reads as the point the object hands the date
            over, and the sweep out of it is what gives that corner of the composition its weight.
          */}
          <JourneyNode className="bottom-[19%] left-0 -translate-x-[3px]" ring />
        </div>
      </div>

      {/*
        The sweep, and the answer to the hero's real compositional problem (section 10.9).

        With an object as dense as the counting rail on the right, the lower left read as a hole
        rather than as air. Nothing was added there: the line simply leaves the date almost
        horizontally, crosses that emptiness, and turns down towards the poster — so the corner is
        occupied by the one element the whole page is built around instead of by decoration.

        On the shell's own grid, outside every block that reveals, and `lg` only: below it the line
        runs in the gutter and this vertex would fold it back across the copy.
      */}
      <JourneyRail>
        <JourneyAnchor className="bottom-[12%] left-[16%] hidden lg:block" />
      </JourneyRail>

      {/* ---- Middle plane: the type. ---- */}
      <div className="u-shell u-plane-middle flex flex-1 flex-col">
        <div className="flex flex-1 flex-col justify-center gap-8 lg:grid lg:grid-cols-12 lg:content-center lg:gap-x-8 lg:gap-y-8">
          <div className="order-1 lg:col-span-7 lg:col-start-1 lg:row-start-1">
            <TitleLockup event={event} />
          </div>

          {/*
            The same block below `lg`, in flow: stacked under the title on a phone, and beside the
            meta line from 768px, which is what makes the tablet its own composition rather than a
            stretched phone.
          */}
          <div className="order-2 -mr-5 md:-mr-6 lg:hidden">
            <div className="relative flex items-baseline gap-6">
              {/* An untransformed box the size of the lockup, so the origin below is measured
                  against the date itself rather than against a row the meta line can grow. */}
              <div className="relative">
                <div className="u-rise [--rise-step:6]">
                  <DateLockup day={event.day} month={event.month} />
                </div>

                {/*
                  The journey's origin on the phone and the tablet, on the same baseline as on the
                  desktop. There is no room for an approach run here — the lockup fills the measure —
                  so the line simply begins at the date and leaves down the gutter, which is the same
                  idea with one fewer gesture.
                */}
                <JourneyNode className="bottom-[19%] left-0 -translate-x-[3px]" ring />
              </div>

              <p className="u-rise text-body hidden text-text-secondary [--rise-step:4] md:block">
                <span className="block">{when}</span>
                {event.venueName ? <span className="block">{event.venueName}</span> : null}
              </p>
            </div>
          </div>

          <div className="order-3 flex flex-col gap-6 lg:col-span-7 lg:col-start-1 lg:row-start-2">
            {/* The accessible date, as full sentences, on the two compositions that need it here. */}
            <p className="u-rise text-body text-text-secondary [--rise-step:4] md:hidden lg:block">
              <span className="block">{when}</span>
              {event.venueName ? <span className="block">{event.venueName}</span> : null}
            </p>

            {banner ? (
              // `status`, not `alert`: this is the state of the page on arrival, not an
              // interruption of something the visitor was doing.
              <p
                role="status"
                className="text-body max-w-[52ch] rounded-panel border border-sky-300/40 bg-ink-800 px-5 py-4 text-text-primary"
              >
                {banner}
              </p>
            ) : null}

            {cta ? (
              /* Front plane: the CTA overlaps the chart's brightest region (section 1.8). */
              <div className="u-plane-front u-rise flex flex-col gap-3 [--rise-step:5]">
                <a
                  id={HERO_CTA_ID}
                  href={`#${registrationAnchor}`}
                  className={`${CTA_PRIMARY} w-full sm:w-auto sm:self-start`}
                >
                  {cta}
                </a>

                {/*
                  Commercial detail below the CTA, in small type, never competing with it — the one
                  structural thing worth taking from the iMac page (section 1.1).
                */}
                {event.priceLabel || event.includesLabel ? (
                  <p className="text-hint text-text-muted">
                    {[event.priceLabel, event.includesLabel].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/*
        The full-width strip along the hero's bottom edge (section 5.1), as wide-tracked micro-labels
        rather than as badges (section 2.2, principle 6).

        It carries the venue and the city — and deliberately **not** the price, which the commercial
        line under the CTA already says. A strip that repeats the sentence directly above it is
        clutter wearing the costume of composition.
      */}
      <div className="u-plane-middle relative mt-12 border-t border-ink-600">
        {/*
          Below `lg` the journey leaves the date and settles into the gutter here, before it reaches
          a single line of copy. Without this vertex the descent interpolates from the lockup's own
          left edge — which is the measure's left edge — and the line would run down the first
          character of every paragraph beneath it.
        */}
        <JourneyAnchor className="top-0 left-2.5 lg:hidden" />

        <div className="u-shell flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-5">
          {event.venueName ? (
            <p className="text-micro-label text-text-muted uppercase">{event.venueName}</p>
          ) : null}
          {event.addressLines.at(-1) ? (
            <p className="text-micro-label text-text-muted uppercase">{event.addressLines.at(-1)}</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * The title lockup — section 6.3, the single most important typographic decision on the page.
 *
 * One `<h1>` whose accessible name reads "Palestra Educação Financeira para jovens", which is the
 * event's name. Four spans, four roles:
 *
 *   * the kicker, wide-tracked caps in `sky-300` — styled uppercase from mixed-case source text, so
 *     a screen reader says "Palestra" rather than spelling it out (section 6.4);
 *   * `educação` at weight 300, lowercased visually as the banner sets it;
 *   * `Financeira` at weight 800 — **the weight jump from 300 to 800 is the identity**, and it is
 *     also the LCP element, which is why it is text and why its entrance delay is the shortest on
 *     the page;
 *   * `para jovens` inside a `blue-500` pill at wide tracking, the banner's most distinctive
 *     detail, sitting on the front plane so it occludes the chart behind it.
 *
 * `educação` sits on `Financeira` with a negative margin so the ascenders nearly touch, as on the
 * banner.
 */
function TitleLockup({ event }: { readonly event: EventPresentation }) {
  return (
    <h1 className="flex flex-col items-start">
      {event.kicker ? (
        <span className="u-rise text-kicker font-stretch-[105%] text-sky-300 uppercase">
          {event.kicker}
        </span>
      ) : null}

      {event.titleLead ? (
        <span className="u-rise mt-6 text-display-2 font-stretch-[100%] lowercase text-text-primary [--rise-step:1]">
          {event.titleLead}
        </span>
      ) : null}

      <span className="u-rise -mt-1 text-display-1 font-stretch-[110%] text-text-primary [--rise-step:2] sm:-mt-2">
        {event.titleAccent}
      </span>

      {event.audienceLabel ? (
        <span className="u-plane-front u-rise mt-5 inline-flex rounded-full bg-blue-500 px-6 py-2 text-micro-label font-stretch-[105%] tracking-[0.14em] text-white uppercase [--rise-step:3] sm:px-7 sm:py-2.5 sm:text-label sm:font-bold sm:tracking-[0.16em]">
          {event.audienceLabel}
        </span>
      ) : null}
    </h1>
  );
}

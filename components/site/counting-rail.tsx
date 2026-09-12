/**
 * The counting rail — VISUAL-DIRECTION.md section 7.4.
 *
 * The hero's second object, and the only figurative one on the page: an abacus reduced to what a
 * contemporary designer would keep of it. A partial frame, five rails, twenty-two beads, two of
 * them gold. It is drawn, not photographed, and it is built out of the palette the rest of the page
 * already uses, so it reads as part of the composition rather than as an asset dropped into it.
 *
 * **Why an abacus at all.** It is the subject of the talk — counting, ordering, putting values where
 * they belong — in the same way the chart motif is (section 7.1), and it passes the same meaning
 * test of section 1.7. It is also the one thing the hero was missing: the right-hand region held a
 * single object, the date, and a large quantity of air with nothing to explain it.
 *
 * **Three decisions keep it from reading as a toy.**
 *
 *   * *A partial frame.* The crown and the left stile are drawn and then dissolve to the right; the
 *     lowest rail is the base and there is no bottom member at all. A closed tray is a school
 *     abacus; an open bracket is an object.
 *   * *Bead groups are uneven and mostly to the left.* Rails carrying one bead, gaps wide enough for
 *     a movement to be legible, clusters resting against the stile — the asymmetry of the reference,
 *     not a grid of dots.
 *   * *Two gold beads, and everything else is one blue.* Gold is the page's action colour
 *     (section 3.4); here it is used exactly twice, at bead size, as the emphasis the eye finishes
 *     on — and deepened, so neither can compete with the gold *button* in the same view.
 *
 * **It stands in the line's rhythm.** The lowest rail sits exactly one rail-gap above the Financial
 * Journey Line's run through the hero — the altitude the `19SET` lockup stands on — so the wire
 * reads as this object's next rail and the date as a value counted onto it. That relationship is
 * computed in the stylesheet from the same tokens the lockup is sized from (`--date-size`,
 * `--rail-w`), never eyeballed, so it holds at 1024px and at 1920px alike.
 *
 * **Decorative, and it says so.** The whole object lives inside the hero's back plane, which is
 * already `aria-hidden` and `pointer-events: none`; the `<svg>` adds `focusable="false"` so no
 * browser can put it in the tab order. It carries no data, no number and no claim.
 *
 * Rendered on the server. The only JavaScript it can cost is `RailPointer`, which is one listener
 * and two custom properties, and which never runs on a touch device.
 */
import type { CSSProperties } from 'react';

import { JourneyAnchor, JourneyCue } from './journey';

/* ------------------------------------------------------------------------------------------------
 * Geometry. One local coordinate system, 900 × 448, mapped to CSS pixels by the container's width —
 * so every constant below is a proportion of the object rather than a pixel measurement, and the
 * whole composition scales without a second set of numbers per breakpoint.
 * ---------------------------------------------------------------------------------------------- */

/** The five rails. The last one is the object's base: the viewBox ends on it exactly. */
const RAIL_Y = [88, 178, 268, 358, 448] as const;

/** Bead pitch and size. A 2-unit gap at pitch 40 is what makes a cluster read as touching beads. */
const PITCH = 40;
const BEAD_W = 38;
const BEAD_H = 30;

/** The stile's width, and therefore where every rail begins. */
const STILE = 13;

/** How far the rails run past the viewBox. They are cut by the viewport, not by the drawing. */
const RAIL_END = 1010;

interface BeadGroup {
  /** Index into `RAIL_Y`. */
  readonly rail: number;
  /** The left edge of the first bead. */
  readonly x: number;
  readonly count: number;
  /** Which bead of the group is gold, if any. Two exist on the whole object. */
  readonly gold?: number;
  /** Its beat in the entrance sequence. */
  readonly step: number;
  /** How far to the right the group starts its entrance. Beads always arrive travelling left. */
  readonly travel: number;
  /** How much of the pointer's drift this group takes, 0–1. Nearer rails take more. */
  readonly depth: number;
  /** The scroll cue that accents this group, if any. */
  readonly cue?: 'a' | 'b';
  /** How far that accent moves it, in user units. Negative is leftward — a count. */
  readonly shift?: number;
  /**
   * How far the group travels across the hero's whole scroll range, in user units, and in which
   * direction (section 7.4). This is the hierarchy: three groups carry the movement, one of them
   * rightward against the others, and everything else barely answers at all.
   */
  readonly swing?: number;
}

/**
 * The bead layout.
 *
 * Read down the rails: a cluster of three resting on the stile and one lone bead far out; four and a
 * loose group of three; five with the first gold inside them; then one blue, the second gold and a
 * pair — and the base rail carries nothing at all.
 *
 * **The empty base rail is the most considered thing here.** The `19SET` lockup's cap height reaches
 * up into that row at every width — measured at 1024, 1280, 1440 and 1920 — so any bead on it would
 * be printed half-behind the `19`, which reads as a mistake rather than as depth. Emptied, it does
 * three jobs instead: the stile visibly stands on it, it rhymes with the journey line one gap below
 * it, and the quiet it leaves is what the date drops into.
 *
 * So the emphasis moves one rail up. The second gold bead lands on the rail directly above the
 * lockup's shoulder, clear of the glyphs by 8–11px at every width — near enough to read as the last
 * value counted before the date, and never touching it.
 */
const GROUPS: readonly BeadGroup[] = [
  { rail: 0, x: 26, count: 3, step: 1, travel: 96, depth: 0.3, swing: 14 },
  { rail: 0, x: 470, count: 1, step: 5, travel: 60, depth: 0.95, swing: 64 },

  { rail: 1, x: 26, count: 4, step: 0, travel: 110, depth: 0.35, swing: 10 },
  { rail: 1, x: 430, count: 3, step: 4, travel: 70, depth: 0.8, cue: 'a', shift: -28, swing: -86 },

  { rail: 2, x: 26, count: 5, gold: 3, step: 2, travel: 120, depth: 0.45, swing: 8 },
  { rail: 2, x: 660, count: 2, step: 6, travel: 60, depth: 1, swing: -104 },

  { rail: 3, x: 26, count: 1, step: 3, travel: 90, depth: 0.4, swing: 12 },
  { rail: 3, x: 66, count: 1, gold: 0, step: 7, travel: 210, depth: 0.45, swing: 6 },
  { rail: 3, x: 300, count: 2, step: 6, travel: 70, depth: 0.7, cue: 'b', shift: -22, swing: -46 },
];

/* ------------------------------------------------------------------------------------------------
 * The fusion — section 7.4.
 *
 * The Journey Line descends the gap between the type and the object, runs collinear with the rail
 * carrying the second gold bead for a short stretch, and peels off onto the date. Three points, and
 * all three are proportions of the drawing's own box rather than of anything typographic: the object
 * can be resized, the display type can be re-cut, and the line still lands on the rail.
 *
 * The line passes *behind* the object (the rail paints above it), so along the fused run what the
 * reader sees is that one rail reading brighter and heavier — a coincidence, not a replacement. It
 * is deliberately short: it ends well before the rail does.
 * ---------------------------------------------------------------------------------------------- */

/** The rail the line merges with: the one the second gold bead sits on. */
const FUSE_RAIL = 3;
/** Where the run starts and ends, in the drawing's own units. */
const FUSE_FROM = STILE;
const FUSE_TO = 230;
/**
 * Where the line enters the composition: in the open gap beside the object, on the crown's own
 * altitude.
 *
 * Level with the crown rather than above it, and that is measured rather than chosen. At 1024px the
 * display line is capped at 7.5rem and reaches further right than the object's own left edge, so a
 * point any higher puts the descent behind `Financeira` — the line would emerge from between the
 * glyphs. Starting level with the crown keeps the whole descent under the type at every width, and
 * gives the line's first vertex a reason to be where it is.
 */
const LEAD_X = -46;
const LEAD_Y = 0;

const VIEW_H = RAIL_Y[RAIL_Y.length - 1];

/** A drawing coordinate as a percentage of the object's own box, which is what CSS can position. */
function ratio(value: number, span: number): string {
  return `${((value / span) * 100).toFixed(3)}%`;
}

export function CountingRail() {
  return (
    <div data-counting-rail aria-hidden="true" className="u-rail hidden lg:block">
      {/*
        The two scroll cues, and the reason this object needs no scroll listener of its own: they are
        ordinary journey markers, read by the one controller that already measures the page, and the
        stylesheet moves a bead group when the drawn tip passes them. They are placed *below* the
        object — the first a little under the hero's foot, the second inside the next section — so
        neither can fire on the frame the page arrives, which would collide with the entrance.

        They must precede the drawing: the rule that reads them is a sibling combinator.
      */}
      <JourneyCue name="a" className="u-rail-cue-a" />
      <JourneyCue name="b" className="u-rail-cue-b" />

      {/*
        The line's three vertices inside this object (section 7.4): where it enters the gap beside
        the crown, and the two ends of the run it shares with one rail. Positioned from the drawing's
        own proportions, so they move with the object and with nothing else.
      */}
      <JourneyAnchor style={{ left: ratio(LEAD_X, 900), top: ratio(LEAD_Y, VIEW_H) }} />
      <JourneyAnchor style={{ left: ratio(FUSE_FROM, 900), top: ratio(RAIL_Y[FUSE_RAIL], VIEW_H) }} />
      <JourneyAnchor style={{ left: ratio(FUSE_TO, 900), top: ratio(RAIL_Y[FUSE_RAIL], VIEW_H) }} />

      <svg
        className="u-rail-art"
        viewBox={`0 0 900 ${VIEW_H}`}
        preserveAspectRatio="xMinYMid meet"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {/*
            One bead, instanced twenty-two times. The flat fill is `currentColor`, so a blue bead
            and a gold one differ by a single inherited property rather than by a second definition;
            the shade above it is what gives a flat disc its volume — a light edge along the top, a
            deepening toward the bottom, no specular highlight and no rim light. That is the whole
            difference between a designed object and a glossy 3D render.
          */}
          <linearGradient id="rail-bead-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="28%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="52%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.46" />
          </linearGradient>

          {/* The frame dissolves rather than ending: the object continues past the frame. */}
          <linearGradient id="rail-crown" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-blue-600)" stopOpacity="1" />
            <stop offset="62%" stopColor="var(--color-blue-600)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-blue-600)" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="rail-stile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-blue-600)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--color-blue-600)" stopOpacity="0.45" />
          </linearGradient>

          <g id="rail-bead">
            <rect width={BEAD_W} height={BEAD_H} rx="13" fill="currentColor" />
            <rect width={BEAD_W} height={BEAD_H} rx="13" fill="url(#rail-bead-shade)" />
          </g>
        </defs>

        {/* ---- The frame: a crown and a stile, and nothing closing it on the right or below. ---- */}
        <g className="u-rail-frame">
          <rect x="0" y="0" width="900" height={STILE} rx="6.5" fill="url(#rail-crown)" />
          <rect
            x="0"
            y="0"
            width={STILE}
            height={RAIL_Y[RAIL_Y.length - 1]}
            rx="6.5"
            fill="url(#rail-stile)"
          />
          {/* The single light source is up and to the right (section 7.3), so the stile catches it
              on its inner edge. A unit and a half wide, and the only highlight on the object. */}
          <rect
            x={STILE - 1.5}
            y={STILE}
            width="1.5"
            height={RAIL_Y[RAIL_Y.length - 1] - STILE}
            fill="var(--color-sky-300)"
            opacity="0.18"
          />
        </g>

        {/* ---- The rails. They extend out of the drawing and are cut by the viewport. ---- */}
        <g className="u-rail-wires">
          {RAIL_Y.map((y, index) => (
            <line
              key={y}
              className="u-rail-wire"
              x1={STILE}
              y1={y}
              x2={RAIL_END}
              y2={y}
              style={{ '--rail-step': index } as CSSProperties}
            />
          ))}
        </g>

        {/* ---- The beads. ---- */}
        <g className="u-rail-beads">
          {GROUPS.map((group) => (
            <Beads key={`${group.rail}-${group.x}`} group={group} />
          ))}
        </g>
      </svg>
    </div>
  );
}

/**
 * One group of beads, and four nested transforms that never fight each other.
 *
 * Each layer owns exactly one job — the entrance animates the outermost `<g>`, the scroll scrub reads
 * a live custom property on the next, the cue transitions the one below it, and the pointer drifts
 * the innermost — because a single element cannot hold an animation, a transition and two live
 * custom properties on the same property without one of them silently winning.
 *
 * Nesting is the cheapest possible way to compose them: an SVG `<g>` costs no layout and no paint of
 * its own, and each layer writes a transform the compositor can apply without touching the others.
 */
function Beads({ group }: { readonly group: BeadGroup }) {
  const y = RAIL_Y[group.rail] - BEAD_H / 2;

  const beads = (
    <g
      className="u-rail-drift"
      style={{ '--rail-depth': group.depth } as CSSProperties}
    >
      {Array.from({ length: group.count }, (_, index) => {
        const x = group.x + index * PITCH;
        return (
          <use
            key={x}
            href="#rail-bead"
            x={x}
            y={y}
            className={index === group.gold ? 'u-rail-bead-gold' : 'u-rail-bead'}
          />
        );
      })}
    </g>
  );

  const accented = group.cue ? (
    <g
      className={`u-rail-shift u-rail-shift-${group.cue}`}
      style={{ '--rail-shift': `${group.shift ?? 0}px` } as CSSProperties}
    >
      {beads}
    </g>
  ) : (
    beads
  );

  return (
    <g
      className="u-rail-enter"
      style={{ '--rail-step': group.step, '--rail-travel': `${group.travel}px` } as CSSProperties}
    >
      <g
        className="u-rail-scrub"
        style={{ '--rail-swing': `${group.swing ?? 0}px` } as CSSProperties}
      >
        {accented}
      </g>
    </g>
  );
}

/**
 * The Financial Journey Line — VISUAL-DIRECTION.md section 10.8.
 *
 * One line crosses the whole page. It begins at the event's **date**, descends past the poster,
 * the details and the form, and comes to rest on the organizers' panel. It is the page's single
 * memorable idea, and it is one idea rather than six effects: every piece below belongs to the same
 * polyline, measured once from the page's own layout and drawn by one controller.
 *
 * **Why the geometry is measured rather than authored.** The brief asks the line to *connect* real
 * objects — the `19SET` lockup, the poster, the form panel. A hand-drawn path in a fixed `viewBox`
 * cannot do that: at every breakpoint those objects move, and a path authored against one of them
 * is wrong at the other seven. So the shape is declared the way the rest of this codebase declares
 * composition — in CSS, by positioning a handful of invisible points — and the controller reads
 * where they actually landed. Responsive behaviour therefore lives in the same place as the rest of
 * the layout, and a breakpoint can be redesigned without touching a single path command.
 *
 * Four primitives, and that is the whole system:
 *
 *   * `JourneyAnchor` — a zero-size vertex. Shapes the line, shows nothing.
 *   * `JourneyNode` — a vertex that is also a visible dot. Five on the page, one per narrative
 *     moment (section 10.8): the date, the poster, the details, the form, the organizers.
 *   * `JourneyCue` — neither a vertex nor a dot: a height the controller reports having passed, so
 *     something else on the page can move with the line rather than with a listener of its own
 *     (section 7.4).
 *   * `JourneySegment` — the per-section canvas the line is painted into.
 *
 * **Why per-section canvases instead of one page-tall SVG.** Stacking. Each segment sits at
 * `z-index: -1` inside a section that isolates itself, which puts the line *above* that section's
 * own background fill and *below* every piece of its content — so the poster, the form panel and
 * the credits panel occlude the line without a single explicit z-index on them. That occlusion is
 * the page's depth model (section 7.2), now carrying a second job. It also means only the one
 * segment currently being drawn repaints as the page scrolls.
 *
 * Everything here is decorative and says so: `aria-hidden`, `focusable="false"`,
 * `pointer-events: none`. The line carries no data, no axis and no number — exactly like the chart
 * motif it grows out of (section 7.1). Without JavaScript none of it is drawn, and the page is
 * unchanged in every other respect.
 */

import type { CSSProperties } from 'react';

/**
 * The soft bloom the head is made of, declared once for the whole page.
 *
 * A gradient cannot be declared per segment: five copies of one `id` is five broken references. So
 * it lives in a zero-sized `<svg>` mounted once, and every segment points at it — an SVG paint
 * server is resolved against the whole document, not against its own root.
 */
export function JourneyDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
      <defs>
        <radialGradient id="journey-bloom">
          <stop offset="0%" stopColor="var(--color-sky-300)" stopOpacity="0.5" />
          <stop offset="45%" stopColor="var(--color-sky-300)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--color-sky-300)" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * The canvas the shared controller paints one slice of the polyline into.
 *
 * Three things, painted in this order and never any more: the line, the short brighter run at its
 * leading end, and the head. The last two exist only on whichever segment the tip is currently
 * inside — the controller marks it `data-journey-live` — and they are what section 10.9 means by a
 * concentration of energy rather than a marker travelling along a track.
 */
export function JourneySegment({ className }: { readonly className?: string }) {
  return (
    <svg
      data-journey-segment
      className={`u-journey ${className ?? ''}`}
      // The controller sets `viewBox` to this element's own box in page coordinates, so one user
      // unit is one pixel and the slice lines up with the slices above and below it exactly.
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="u-journey-line" />
      {/* The same `d`, shown as a single dash whose leading end is pinned to the drawn tip. */}
      <path className="u-journey-tail" />
      {/* Translated to the tip each frame. A bloom and a core; no stroke, no ring, no spinner. */}
      <g className="u-journey-head">
        <circle r="7" fill="url(#journey-bloom)" />
        <circle r="1.6" className="u-journey-core" />
      </g>
    </svg>
  );
}

/**
 * A vertex. Positioned absolutely by its `className` against the nearest positioned ancestor, and
 * zero-sized, so its measured centre *is* the point the line passes through.
 *
 * Place these outside any element carrying a reveal transform. A revealed block is offset by tens
 * of pixels until it settles, and a point measured inside one would pin the line to where that
 * block used to be.
 */
export function JourneyAnchor({
  className,
  style,
}: {
  readonly className?: string;
  /**
   * For the points that must be placed from another element's own geometry rather than from a
   * utility class — the counting rail's two fusion points are percentages of the object's own box,
   * which is what makes the fusion survive a change of typography (section 7.4).
   */
  readonly style?: CSSProperties;
}) {
  return (
    <span
      data-journey-point
      aria-hidden="true"
      className={`u-journey-point ${className ?? ''}`}
      style={style}
    />
  );
}

/**
 * A vertex that is also a visible node. Five exist, and each marks a moment the page actually has;
 * a dot that marks nothing is the decoration this brief rejects.
 *
 * `ring` adds a single expanding ring, once, when the line reaches it. It is reserved for the two
 * ends of the narrative — the origin and the destination — because a ring on all five would read as
 * a dashboard.
 */
export function JourneyNode({
  className,
  ring = false,
}: {
  readonly className?: string;
  readonly ring?: boolean;
}) {
  return (
    <span
      data-journey-point
      data-journey-node
      {...(ring ? { 'data-journey-ring': '' } : {})}
      aria-hidden="true"
      className={`u-journey-point ${className}`}
    >
      <span className="u-journey-dot" />
    </span>
  );
}

/**
 * A cue: a position on the page that something *else* reacts to when the drawn tip reaches it.
 *
 * It is not a vertex and it is not a dot — it shapes nothing and shows nothing. The controller marks
 * it `data-reached` exactly as it marks a node, and a stylesheet elsewhere keys off that. The
 * counting rail's two bead movements are the only users (section 7.4), and the point of the
 * primitive is that they cost no listener, no observer and no second measurement: the page already
 * knows where the tip is.
 *
 * `name` is what a rule selects on — `[data-journey-cue='a'][data-reached='true'] ~ …`.
 */
export function JourneyCue({
  name,
  className,
}: {
  readonly name: string;
  readonly className?: string;
}) {
  return (
    <span
      data-journey-cue={name}
      aria-hidden="true"
      className={`u-journey-point ${className ?? ''}`}
    />
  );
}

/**
 * A full-width, shell-wide overlay for points that must sit on the page grid rather than on a
 * specific object — the details node, for instance, which belongs in the empty left column.
 *
 * It exists so those points can live *outside* the block that reveals, while still being measured
 * against the same 1200px measure every section uses.
 */
export function JourneyRail({ children }: { readonly children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className="u-shell pointer-events-none absolute inset-0">
      {children}
    </div>
  );
}

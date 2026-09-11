/**
 * The financial line chart — VISUAL-DIRECTION.md section 7.1.
 *
 * **The only decorative element on the page**, and the only one that passes the meaning test of
 * section 1.7: it is the subject of the talk, not an ornament borrowed from somewhere else. One
 * `<path>` and twelve `<rect>`s, inline so it costs no request and can be themed by custom
 * properties.
 *
 * It carries **no data**. The trajectory is drawn, not plotted — there is no series behind it, no
 * axis, no number, and nothing a reader could mistake for a claim about a market. That is a product
 * requirement, not a shortcut.
 *
 * Two things make it read as atmosphere rather than as a graphic pasted behind the type:
 *
 *   * **It bleeds off both horizontal edges**, so the composition implies a page wider than the
 *     frame (section 1.4).
 *   * **It is masked to the hero's single light source.** Section 7.1 asks for the brightest region
 *     to coincide with the radial glow; a colour gradient along the stroke would be a second
 *     gradient, which section 2.2 forbids, so the same result is reached with a luminance mask —
 *     one implied light, no extra colour.
 *
 * `aria-hidden` and `focusable="false"`: it says nothing a screen reader needs to hear.
 */

/**
 * The trajectory. Irregular step widths and varying amplitude on purpose — evenly spaced peaks read
 * as a sawtooth pattern rather than as a market. It starts and ends outside the viewBox so the
 * stroke is cut by the frame instead of stopping inside it.
 */
const TRAJECTORY =
  'M-40 318 L34 296 L78 306 L132 262 L176 280 L214 272 L262 226 L318 252 L356 244 ' +
  'L404 196 L452 228 L508 178 L546 206 L598 152 L642 192 L688 140 L730 178 L784 118 ' +
  'L836 162 L880 130 L918 150 L968 92 L1022 138 L1074 84 L1120 126 L1168 70 L1214 108 ' +
  'L1268 58 L1322 96 L1372 44 L1420 76 L1480 34';

/** The volume bars beneath. Twelve, the top of section 7.1's 8–12 range. */
const BARS: readonly (readonly [x: number, height: number])[] = [
  [40, 42],
  [160, 68],
  [280, 30],
  [400, 86],
  [520, 52],
  [640, 96],
  [760, 38],
  [880, 74],
  [1000, 110],
  [1120, 58],
  [1240, 92],
  [1360, 64],
];

const BAR_BASELINE = 400;
const BAR_WIDTH = 56;

/**
 * Roughly the path's length in user units, used to seed the one-off `stroke-dashoffset` draw
 * (section 10.3). Measuring it in the browser would need JavaScript for a decorative effect; an
 * over-estimate simply makes the line finish drawing a little early, which no one can see.
 */
const PATH_LENGTH = 2200;

export function ChartMotif({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 420"
      preserveAspectRatio="xMidYMax slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {BARS.map(([x, height]) => (
        <rect
          key={x}
          x={x}
          y={BAR_BASELINE - height}
          width={BAR_WIDTH}
          height={height}
          fill="var(--color-blue-500)"
          opacity="0.04"
        />
      ))}

      <path
        d={TRAJECTORY}
        stroke="var(--color-sky-300)"
        strokeWidth="3"
        strokeLinejoin="round"
        opacity="0.06"
        className="u-draw"
        style={{ '--draw-length': PATH_LENGTH } as React.CSSProperties}
      />
    </svg>
  );
}

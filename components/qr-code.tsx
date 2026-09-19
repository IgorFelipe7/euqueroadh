/**
 * A QR symbol, as inline SVG.
 *
 * A Server Component: the matrix is computed during the render that produces the page, so the wall
 * ships **no JavaScript at all** for the single most important element on it. If the projector's
 * browser has a bad night, the QR is still there — it is markup, not a canvas somebody has to paint.
 *
 * ## One `<path>`, not `size²` rects
 *
 * A version-5 symbol is 1,369 modules, about half of them dark. Emitting a `<rect>` each is ~700 DOM
 * nodes for a static picture; emitting one `d` attribute of move-and-close commands is one node and
 * roughly 8 KB of text that gzip reduces to very little. Horizontal runs are merged as they are
 * found, so a symbol's large uniform areas cost one command instead of twenty.
 *
 * ## Rendered in module units
 *
 * The `viewBox` is the module grid plus its quiet zone, so the caller sizes the symbol in CSS and
 * every module lands on a whole unit at every size. Scaling a QR by a non-integer factor is what
 * produces the faintly blurred codes that phones hunt for; `shape-rendering="crispEdges"` keeps the
 * browser from antialiasing the boundaries it does land on.
 *
 * ## The quiet zone is not decoration
 *
 * ISO/IEC 18004 requires four modules of light margin on all four sides, and a scanner that cannot
 * find it will not attempt the symbol. It is part of the drawing rather than a CSS margin precisely
 * so that no layout change can take it away.
 */
import { encodeQr, type EcLevel } from '@/lib/qr';

/** The four-module margin the standard requires. */
const QUIET_ZONE = 4;

export function QrCode({
  value,
  level = 'Q',
  className,
  title,
}: {
  value: string;
  level?: EcLevel;
  className?: string;
  /**
   * An accessible name, when the symbol carries meaning a screen-reader user needs.
   *
   * Omitted on the wall, where the QR is decorative to anyone who is not pointing a camera at it and
   * the same URL is printed underneath in readable text — announcing a 27-character token letter by
   * letter would be worse than announcing nothing.
   */
  title?: string;
}) {
  const symbol = encodeQr(value, { level });
  const span = symbol.size + QUIET_ZONE * 2;

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      className={className}
      shapeRendering="crispEdges"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/*
        The light field is drawn rather than left transparent: a QR read off a dark page needs its own
        white background, and relying on whatever sits behind it is how a symbol ends up navy on navy.
      */}
      <rect width={span} height={span} fill="#ffffff" />
      <path d={pathFor(symbol.modules, symbol.size)} fill="#070b1e" />
    </svg>
  );
}

/**
 * The dark modules as one path, merging horizontal runs.
 *
 * `M x y h w v 1 h -w z` per run: absolute move, relative box, close. Relative commands keep the
 * numbers to one or two digits each, which is most of why the attribute stays small.
 */
function pathFor(modules: Uint8Array, size: number): string {
  const parts: string[] = [];

  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      if (modules[row * size + col] === 0) {
        col += 1;
        continue;
      }

      const start = col;
      while (col < size && modules[row * size + col] === 1) col += 1;

      parts.push(`M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h-${col - start}z`);
    }
  }

  return parts.join('');
}

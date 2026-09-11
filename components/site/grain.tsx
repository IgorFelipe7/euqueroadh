/**
 * The page's film grain — VISUAL-DIRECTION.md section 7.3.
 *
 * One tiled `feTurbulence` pattern as a `data:` URI, at 3.5% opacity, applied once. It reproduces
 * the banner's own texture, and it removes the banding that a large flat navy field otherwise shows
 * on an 8-bit display: the cheapest single thing that makes a dark page read as art-directed rather
 * than as a default background colour.
 *
 * Rendered by the public pages rather than by the root layout, so the light admin subtree — which
 * shares that layout — never inherits a texture designed for a navy field.
 *
 * `position: fixed`, so it never repaints during a scroll; `pointer-events: none` and `aria-hidden`,
 * so it exists for the eye and for nothing else. It is one of the page's three decorative elements,
 * and the budget stops there.
 */
export function Grain() {
  return <div className="u-grain" aria-hidden="true" />;
}

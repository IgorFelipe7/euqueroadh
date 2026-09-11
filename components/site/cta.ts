/**
 * The button hierarchy — VISUAL-DIRECTION.md section 3.5.
 *
 * Class strings rather than components, for one reason: the three levels are worn by `<a>`, by
 * `<button>` and by a submit button inside a Client Component, and a wrapper component that has to
 * forward every element's own props to cover all three would be more code and less clarity than the
 * strings themselves. This module is pure text, so the Client Component can import it with no
 * boundary cost.
 *
 * **Never two primaries in one view.** The page has exactly two primary buttons in total — the
 * hero's `Garantir minha vaga` and the form's `Confirmar inscrição` — and they are a scroll apart,
 * plus the sticky bar, which is the hero's own CTA relocated into the thumb zone and is never
 * visible at the same time as either (section 11.2).
 *
 * Gold appears here and in exactly two other places on the page (section 3.4). If it turns up in a
 * fourth, the design has drifted.
 */

/** Shared by all three levels: the pill geometry, the press feedback, the 44px touch floor. */
const BASE =
  'u-press u-settle inline-flex items-center justify-center gap-2 rounded-full ' +
  'text-label font-semibold whitespace-nowrap';

/**
 * Primary — `gold-400` fill, `ink-900` label (12.22:1).
 *
 * The focus ring is `ink-900`, not the page-wide `sky-300`: sky on gold is too close in luminance
 * to be seen, which is the documented exception in section 9.5.
 */
export const CTA_PRIMARY =
  `${BASE} min-h-14 bg-gold-400 px-8 font-bold text-ink-900 ` +
  'hover:bg-gold-300 focus-visible:outline-ink-900';

/** Secondary — outlined, transparent fill. Quiet enough never to compete with the primary. */
export const CTA_SECONDARY =
  `${BASE} min-h-12 border border-border-strong px-6 text-text-primary ` +
  'hover:border-text-muted hover:bg-ink-800';

/** Tertiary — an inline link. Underlined, so it is not identified by colour alone. */
export const CTA_TERTIARY =
  'u-settle text-sky-300 underline decoration-1 underline-offset-4 ' +
  'hover:decoration-2 focus-visible:rounded-xs';

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

/**
 * Shared by all three levels: the pill geometry, the press feedback, the 44px touch floor.
 *
 * `whitespace-nowrap` is separated out rather than being part of `BASE` because one label in the
 * product genuinely does not fit on one line — `Confirmar outra pessoa deste mesmo celular`, which
 * needs about 350px inside a 287px panel on a 375px phone. Overriding a Tailwind utility by appending
 * a competing one to the class string does NOT work: both have the same specificity, so the winner is
 * whichever the generated stylesheet happens to emit last. A variant that never applies the class is
 * the only way to be sure.
 */
const BASE =
  'u-press u-settle inline-flex items-center justify-center gap-2 rounded-full ' +
  'text-label font-semibold';

const NOWRAP = 'whitespace-nowrap';

/**
 * Primary — `gold-400` fill, `ink-900` label (12.22:1).
 *
 * The focus ring is `ink-900`, not the page-wide `sky-300`: sky on gold is too close in luminance
 * to be seen, which is the documented exception in section 9.5.
 */
export const CTA_PRIMARY =
  `${BASE} ${NOWRAP} min-h-14 bg-gold-400 px-8 font-bold text-ink-900 ` +
  'hover:bg-gold-300 focus-visible:outline-ink-900';

/** Secondary — outlined, transparent fill. Quiet enough never to compete with the primary. */
const SECONDARY_SKIN =
  'min-h-12 border border-border-strong px-6 text-text-primary hover:border-text-muted hover:bg-ink-800';

export const CTA_SECONDARY = `${BASE} ${NOWRAP} ${SECONDARY_SKIN}`;

/**
 * The same control, for a label that has to wrap.
 *
 * Used once, by the check-in success panel's `Confirmar outra pessoa deste mesmo celular` — the
 * sentence that makes the household loop discoverable, and the only button label in the product long
 * enough to need two lines on a small phone. `py-3` restores the vertical rhythm a wrapped pill loses,
 * and the result is taller than the 44px floor rather than shorter.
 */
export const CTA_SECONDARY_WRAP = `${BASE} ${SECONDARY_SKIN} py-3 text-center leading-snug`;

/** Tertiary — an inline link. Underlined, so it is not identified by colour alone. */
export const CTA_TERTIARY =
  'u-settle text-sky-300 underline decoration-1 underline-offset-4 ' +
  'hover:decoration-2 focus-visible:rounded-xs';

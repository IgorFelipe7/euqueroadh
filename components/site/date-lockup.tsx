/**
 * `19SET` — the composition's second subject, and its anchor exactly as on the banner
 * (VISUAL-DIRECTION.md section 5.2).
 *
 * Two glyph groups joined with no space between them, reproducing the banner's `19SET` join:
 *
 *   * `19` — width 75 (condensed), weight 700, tabular figures, white;
 *   * `SET` — width 115 (expanded), weight 400, `sky-300`.
 *
 * The width contrast is the identity (EVENT-SOURCE-OF-TRUTH.md section 8), and one variable family
 * with a `wdth` axis is what reproduces it from a single font file.
 *
 * **It is decorative and says so.** `aria-hidden="true"`: a screen reader must never hear
 * "19 SET" as a fragment. The real date is in the meta line beside it and again in the `<dl>`, both
 * as full sentences (section 13, item 7).
 */

export function DateLockup({
  day,
  month,
  className,
}: {
  /** Two digits, as printed on the banner. */
  readonly day: string;
  /** The three-letter month abbreviation, upper case. */
  readonly month: string;
  readonly className?: string;
}) {
  return (
    <span aria-hidden="true" className={`u-date-lockup ${className ?? ''}`}>
      <span className="font-stretch-[75%] font-extrabold tracking-[-0.02em] text-text-primary">
        {day}
      </span>
      <span className="font-stretch-[115%] font-normal tracking-[0.02em] text-sky-300">
        {month}
      </span>
    </span>
  );
}

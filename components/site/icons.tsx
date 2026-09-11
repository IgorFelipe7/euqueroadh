/**
 * Every icon the public page uses — VISUAL-DIRECTION.md section 8.4.
 *
 * Five 24×24 paths, hand-authored, inline. Section 8.4 budgets "roughly six"; five is what the
 * finished page actually uses, and an icon nobody renders is dead weight rather than a rounding
 * error. `lucide-react` would cost a dependency and a bundle-splitting problem for the same result;
 * five paths cost about a kilobyte and share one geometry: a 24 unit box, 1.75 stroke, round caps
 * and joins, no fills.
 *
 * **Every icon is decorative.** Each is `aria-hidden` and sits beside real text, so no icon is ever
 * the only label for a control (section 13). None of them is focusable.
 */

type IconProps = {
  /** Rendered size in pixels. The stroke is scaled with it so weight stays optically even. */
  readonly size?: number;
  readonly className?: string;
};

function Svg({
  size = 20,
  className,
  children,
}: IconProps & { children: React.ReactNode }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** The banner's own map pin, reproduced as line work (section 5.3). */
export function MapPinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21.5s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10.5" r="2.6" />
    </Svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.75h17M8.25 3.5v3M15.75 3.5v3" />
    </Svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5v11M12 3.5 8.25 7.25M12 3.5l3.75 3.75" />
      <path d="M5.5 12.5v6a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-6" />
    </Svg>
  );
}

/** Sits before an invalid field's message, so the error is never carried by colour alone. */
export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 7.75v5M12 16.1h.01" />
    </Svg>
  );
}

/**
 * The pending indicator. A rotating arc is the one looping animation on the page, and it is
 * permitted for the same reason a cursor blinks: it reports that work is in progress, which is
 * information, not decoration. It stops the moment the request resolves, and under reduced motion
 * it renders as a static ring — the button's label already says `Confirmando…`.
 */
export function SpinnerIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" className="u-spin origin-center" />
    </svg>
  );
}

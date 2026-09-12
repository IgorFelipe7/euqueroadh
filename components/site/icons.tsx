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

/**
 * The GitHub mark, in the footer credit and nowhere else.
 *
 * **Deliberately not built on `Svg` above.** The five icons in this file share one geometry — a 24
 * unit box, 1.75 stroke, no fill — because they are a system this page authored. This is not one of
 * them: it is somebody else's trademark, reproduced as the filled 16-unit path GitHub publishes, and
 * drawing it as line work would be redrawing a logo rather than using it. Section 8.4 budgets
 * "roughly six" icons; with this one the page uses exactly six.
 *
 * Nominative use — it labels a link *to* GitHub — so no permission question arises, unlike the
 * organizers' marks in `credits.tsx`.
 *
 * Decorative, like every other icon here: the link's `aria-label` carries the real name, so this is
 * never the only label for anything.
 */
export function GithubIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

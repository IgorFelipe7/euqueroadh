'use client';

/**
 * The admin's navigation — a sidebar on desktop, a bottom tab bar on the phone.
 *
 * A Client Component for exactly one reason: `usePathname()`, so the current destination carries
 * `aria-current="page"`. Nothing else here needs the browser, and the links are ordinary `<Link>`s,
 * so the whole thing still works with JavaScript disabled — the current-page marking is the only
 * part that would be missing.
 *
 * **Bottom tabs on mobile, not a hamburger.** The phone is the device an organizer actually has at
 * the door, and four destinations fit across the bottom of the smallest screen, thumb-reachable,
 * without a menu to open first (ADMIN-SPEC.md section 9).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ADMIN_COPY } from '@/lib/admin/copy';
import { ROUTES } from '@/lib/routes';

interface Destination {
  readonly href: string;
  readonly label: string;
  readonly icon: React.ReactNode;
}

/*
 * Inline SVG rather than an icon dependency: four glyphs at 20 px, drawn from the same 1.6 px
 * stroke, is less code than any package that would supply them.
 */
function Glyph({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const DESTINATIONS: readonly Destination[] = [
  {
    href: ROUTES.adminHome,
    label: ADMIN_COPY.nav.dashboard,
    icon: <Glyph d="M3 10.5 10 4l7 6.5M5 9.5V16h10V9.5" />,
  },
  {
    href: ROUTES.adminRegistrations,
    label: ADMIN_COPY.nav.registrations,
    icon: <Glyph d="M4 5h12M4 10h12M4 15h8" />,
  },
  {
    href: ROUTES.adminSettings,
    label: ADMIN_COPY.nav.settings,
    icon: <Glyph d="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />,
  },
  {
    href: ROUTES.adminTeam,
    label: ADMIN_COPY.nav.team,
    icon: <Glyph d="M7.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 16c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4M13.5 12c2 .4 3.5 2 3.5 4M13 8.6a2.3 2.3 0 0 0 0-4.2" />,
  },
];

/** `/admin` matches only itself; every other destination also matches its own subtree. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === ROUTES.adminHome) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({ admin }: { admin: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções do painel"
      className="hidden w-[220px] shrink-0 flex-col gap-6 border-r border-admin-line bg-admin-surface px-4 py-6 md:flex"
    >
      <p className="text-hint px-2 leading-snug font-semibold text-admin-ink">
        {ADMIN_COPY.brand}
      </p>

      <ul className="flex flex-1 flex-col gap-1">
        {DESTINATIONS.map((destination) => {
          const current = isCurrent(pathname, destination.href);
          return (
            <li key={destination.href}>
              <Link
                href={destination.href}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-admin-control)] px-3 text-label transition-colors duration-150 ease-settle ${
                  current
                    ? 'bg-admin-blue-soft text-admin-blue'
                    : 'text-admin-ink hover:bg-admin-field'
                }`}
              >
                {destination.icon}
                {destination.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-hint px-2 break-words text-admin-muted">{admin}</p>
    </nav>
  );
}

export function AdminTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções do painel"
      className="sticky bottom-0 z-20 border-t border-admin-line bg-admin-surface pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {DESTINATIONS.map((destination) => {
          const current = isCurrent(pathname, destination.href);
          return (
            <li key={destination.href}>
              <Link
                href={destination.href}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] leading-tight font-semibold ${
                  current ? 'text-admin-blue' : 'text-admin-muted'
                }`}
              >
                {destination.icon}
                {destination.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

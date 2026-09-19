import type { Metadata } from 'next';

import { AdminSidebar, AdminTabBar } from '@/components/admin/nav';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { requireAdmin } from '@/lib/data/auth';

import { SignOutForm } from '../sign-out-form';

export const metadata: Metadata = {
  title: { default: 'Organizadores', template: '%s — Organizadores' },
  robots: { index: false, follow: false },
};

/**
 * The protected subtree, and the admin chrome.
 *
 * `requireAdmin()` runs here on every request — it verifies the token's signature and re-reads
 * `admin_users`, so a deactivated administrator loses access on their very next navigation rather
 * than when their token happens to expire.
 *
 * This is a *layout* check, and layout checks do not extend to Server Actions or Route Handlers
 * defined inside the subtree. Each of those calls `assertAdmin()` itself; the route group exists so
 * that `/admin/entrar` and `/admin/sem-acesso` can live outside this boundary without inheriting it
 * and looping.
 *
 * The chrome is two navigations rendered from one list (`components/admin/nav.tsx`): a sidebar
 * above `md`, a bottom tab bar below it. Neither is a menu that has to be opened — six destinations
 * do not need wayfinding (ADMIN-SPEC.md section 1). The tab bar shows five of them: it carries what
 * an organizer does standing up at the venue, and managing the team is not that.
 *
 * **Exactly one `Sair`.** The bar carries it at every width rather than each navigation carrying its
 * own, because two sign-out buttons in one document is an ambiguity for a screen reader and for
 * anything else reading the page by role and name.
 */
export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const who = admin.displayName ?? admin.email;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AdminSidebar admin={who} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky, because the way out should not require scrolling back to the top. */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-admin-line bg-admin-surface px-4 py-3 md:px-8">
          <p className="text-hint min-w-0 truncate font-semibold text-admin-ink">
            <span className="md:hidden">{ADMIN_COPY.brand}</span>
            <span className="hidden md:inline">{who}</span>
          </p>
          <SignOutForm label={ADMIN_COPY.nav.signOut} />
        </header>

        {/*
          The bottom padding reserves the tab bar's height plus the safe area. A `sticky bottom-0`
          bar is painted over the foot of the viewport until the document is scrolled to its end, so
          without the reservation the last control on a long page sits permanently behind it — which
          WCAG 2.2 SC 2.5.8 reports as an obscured target and a thumb confirms. The public page
          reserves its sticky CTA the same way (VISUAL-DIRECTION.md section 9.8).
        */}
        <main className="mx-auto flex w-full max-w-[72rem] flex-1 flex-col gap-6 px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:px-8 md:py-8">
          {children}
        </main>

        <AdminTabBar />
      </div>
    </div>
  );
}

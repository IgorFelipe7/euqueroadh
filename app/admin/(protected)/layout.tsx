import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/data/auth';

import { SignOutForm } from '../sign-out-form';

export const metadata: Metadata = {
  title: 'Organizadores',
  robots: { index: false, follow: false },
};

/**
 * The protected subtree.
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
 * The real admin chrome — the sidebar, the mobile tab bar, the four destinations — is Phase 6.
 */
export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="mx-auto flex min-h-dvh max-w-[64rem] flex-col gap-8 px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-strong pb-4">
        <p className="text-label">{admin.displayName ?? admin.email}</p>
        <SignOutForm label="Sair" />
      </header>
      {children}
    </div>
  );
}

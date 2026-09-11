import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SIGN_IN_COPY } from '@/lib/auth/sign-in';
import { getAdminSessionState } from '@/lib/data/auth';
import { ROUTES, safeAdminPath, signInReason } from '@/lib/routes';

import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Entrar — Organizadores',
  // The sign-in page has no business in a search index, and neither has anything under /admin.
  robots: { index: false, follow: false },
};

/**
 * `/admin/entrar` — public, and the only public page in the admin area.
 *
 * Someone who is already signed in is sent on rather than shown a form they do not need: an active
 * administrator to their destination, an authenticated non-administrator to the page that explains
 * why they cannot proceed.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeAdminPath(typeof params.next === 'string' ? params.next : undefined);
  const reason = signInReason(params.motivo);

  const session = await getAdminSessionState();
  if (session.status === 'active') redirect(next);
  if (session.status === 'not_admin') redirect(ROUTES.adminNoAccess);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[26rem] flex-col justify-center px-5 py-16">
      <SignInForm next={next} notice={reason ? SIGN_IN_COPY.reasons[reason] : null} />
    </main>
  );
}

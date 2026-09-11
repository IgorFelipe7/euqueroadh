import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SIGN_IN_COPY } from '@/lib/auth/sign-in';
import { getAdminSessionState } from '@/lib/data/auth';
import { ROUTES } from '@/lib/routes';

import { SignOutForm } from '../../sign-out-form';

export const metadata: Metadata = {
  title: 'Sem acesso — Organizadores',
  robots: { index: false, follow: false },
};

/**
 * `/admin/sem-acesso` — for someone who authenticated successfully but is not an active
 * administrator: never invited, or deactivated since.
 *
 * Deliberately not a 404 (ADMIN-SPEC.md section 2). A volunteer whose access was just revoked
 * deserves an explanation, not a puzzle. It reveals nothing about the event or its data, and the
 * only action it offers is signing out.
 *
 * An active administrator who lands here is sent home, and a signed-out visitor is sent to the
 * sign-in page — this page has nothing to say to either of them.
 */
export default async function NoAccessPage() {
  const session = await getAdminSessionState();
  if (session.status === 'active') redirect(ROUTES.adminHome);
  if (session.status === 'anonymous') redirect(ROUTES.adminSignIn);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[32rem] flex-col justify-center gap-5 px-5 py-16">
      <h1 className="text-h2">{SIGN_IN_COPY.noAccess.heading}</h1>
      <p className="text-body">{SIGN_IN_COPY.noAccess.body}</p>
      <SignOutForm label={SIGN_IN_COPY.noAccess.signOut} />
    </main>
  );
}

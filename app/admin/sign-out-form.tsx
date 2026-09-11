import { ROUTES } from '@/lib/routes';

/**
 * Sign-out as a plain HTML form.
 *
 * A POST, never a link: signing out changes state, and a GET can be prefetched, prerendered or
 * followed by a scanner, which would log administrators out at random. Being a plain form rather
 * than a Client Component means it also works with JavaScript disabled — the one interaction in the
 * admin area that costs nothing to make bulletproof.
 */
export function SignOutForm({ label, className }: { label: string; className?: string }) {
  return (
    <form action={ROUTES.signOut} method="post">
      <button
        type="submit"
        className={className ?? 'min-h-12 text-label text-blue-600 underline'}
      >
        {label}
      </button>
    </form>
  );
}

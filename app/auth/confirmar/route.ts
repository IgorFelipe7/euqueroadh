import { NextResponse, type NextRequest } from 'next/server';

import { confirmableOtpType, verifyAdminOtpHash } from '@/lib/data/auth';
import { safeAdminPath, signInPathFor } from '@/lib/routes';
import { NO_STORE_HEADERS } from '@/lib/security/csp';

export const dynamic = 'force-dynamic';

/**
 * `/auth/confirmar` — the e-mail-link half of the sign-in.
 *
 * The six-digit code is the primary path; this handles the link the same e-mail carries, for
 * whoever finds clicking easier than typing. The template builds it as
 * `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=email`, which is the pattern
 * Supabase documents for server-side rendering: the hash is exchanged here, on the server, so the
 * tokens never touch a URL fragment or the browser's history.
 *
 * Three things are validated rather than trusted, because everything in this URL arrived from an
 * e-mail:
 *
 *   * `type` must be one of the two sign-in types — anything else is not a sign-in link;
 *   * `next` goes through `safeAdminPath()`, so this handler cannot be turned into an open redirect
 *     by a crafted link;
 *   * a failed exchange returns the same wording as an expired code, with no provider text.
 *
 * Nothing here is logged that could identify the recipient: the hash is single-use and secret, and
 * we do not learn the address from it.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = confirmableOtpType(params.get('type'));
  const next = safeAdminPath(params.get('next'));

  if (!tokenHash || !type) {
    return redirectTo(signInPathFor(next, 'link-invalido'));
  }

  const result = await verifyAdminOtpHash(tokenHash, type);

  if (result.outcome !== 'signed_in') {
    return redirectTo(signInPathFor(next, 'link-invalido'));
  }

  // Authorization is not decided here — `requireAdmin()` re-reads `admin_users` on the next request
  // and sends a non-administrator to /admin/sem-acesso.
  return redirectTo(next);
}

/**
 * A **relative** `Location`, deliberately.
 *
 * `NextResponse.redirect()` needs an absolute URL, and the only host available to build one from is
 * the request's own — which is attacker-supplied (`Host` header) and, worse, not even reliable:
 * Next normalises `NextRequest.url` to `localhost`, so a visitor who arrived at `127.0.0.1:3000`
 * was being sent to a *different* cookie origin than the one the session had just been written to,
 * and landed on the sign-in page still signed out. A path-relative reference is resolved by the
 * browser against the origin it is already on, which is the only correct answer here and cannot be
 * steered by a header. RFC 7231 § 7.1.2 allows it and every browser has supported it for decades.
 */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { ...NO_STORE_HEADERS, Location: path },
  });
}

import { NextResponse, type NextRequest } from 'next/server';

import { signOutAdmin } from '@/lib/data/auth';
import { ROUTES } from '@/lib/routes';
import { NO_STORE_HEADERS } from '@/lib/security/csp';

export const dynamic = 'force-dynamic';

/**
 * `/auth/sair` — POST only.
 *
 * Only POST exists, so a prefetch, a prerender, a link scanner or an image tag cannot sign an
 * administrator out; Next returns 405 for every other method automatically. Same-origin is enforced
 * below rather than assumed: `SameSite=Lax` cookies already block a cross-site POST from carrying
 * the session, and this check makes the intent explicit.
 *
 * `signOutAdmin()` revokes the refresh token at the Auth server and clears the session cookies; the
 * 303 then sends the browser to the sign-in page with a GET, so a refresh does not re-post.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse(null, { status: 403, headers: NO_STORE_HEADERS });
  }

  await signOutAdmin();

  // A relative `Location`: the session cookies were just cleared for the origin this request
  // arrived at, and `NextRequest.url` reports a normalised host (`localhost` for a request to
  // `127.0.0.1`) that would send the browser somewhere else entirely. See `/auth/confirmar`.
  return new NextResponse(null, {
    status: 303,
    headers: { ...NO_STORE_HEADERS, Location: ROUTES.adminSignIn },
  });
}

/**
 * `Origin` against the host the request was actually addressed to.
 *
 * Comparing with `request.nextUrl.origin` looks equivalent and is not: Next normalises that value,
 * so a genuine same-origin POST to `127.0.0.1:3000` arrives with `Origin: http://127.0.0.1:3000`
 * and is compared against `http://localhost:3000` — signing out would answer 403 to the one person
 * entitled to do it. The comparison that carries the security meaning is `Origin` against `Host`: a
 * cross-site POST carries the attacker's origin and the victim's host, so the two differ exactly
 * when it matters.
 *
 * A missing `Origin` is allowed through: not every client sends one, and `SameSite=Lax` cookies
 * already stop a cross-site POST from carrying the session at all.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

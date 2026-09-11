/**
 * ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
 * │  THIS FILE IS NOT AN AUTHORIZATION BOUNDARY.                                                 │
 * │                                                                                              │
 * │  Deleting it must cost a worse session experience and a weaker CSP — never access to         │
 * │  anything. Every protected page calls `requireAdmin()` and every server entry point calls    │
 * │  `assertAdmin()`, independently, on every request. Next.js's own documentation is explicit    │
 * │  about why: "Always verify authentication and authorization inside each Server Function      │
 * │  rather than relying on Proxy alone", because a matcher change or a moved Server Function    │
 * │  can silently remove coverage.                                                               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * What it actually does, all of it necessary and none of it load-bearing for authorization:
 *
 *   1. **Refreshes the Supabase session.** Server Components cannot write cookies, so a token that
 *      expires mid-visit can only be renewed here. `getClaims()` is what triggers the refresh, and
 *      is also the only server-side call that actually verifies the token's signature —
 *      `getSession()` is never used.
 *   2. **Generates the per-request CSP nonce** for the admin subtree and passes it to the renderer
 *      through the request headers, which is how Next.js picks it up.
 *   3. **Redirects a visitor with no session** to the sign-in page, remembering where they were
 *      going. Convenience: the page would redirect anyway, one render later.
 *   4. **Marks every admin response uncacheable.**
 */
import { NextResponse, type NextRequest } from 'next/server';

import { createCookieBoundClient } from '@/lib/data/supabase/cookie-bound';
import { ROUTES, safeAdminPath, signInPathFor } from '@/lib/routes';
import { NO_STORE_HEADERS, adminContentSecurityPolicy, createNonce } from '@/lib/security/csp';

/**
 * The admin subtree only. The public page must not pay for a nonce, and `/auth/*` handles its own
 * cookies inside the route handlers, where they can be written directly.
 */
export const config = {
  matcher: ['/admin/:path*'],
};

/** Reachable without a session: one is the way in, the other explains why there is no way in. */
const SIGNED_OUT_PATHS: readonly string[] = [ROUTES.adminSignIn, ROUTES.adminNoAccess];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = createNonce();
  const csp = adminContentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV === 'development',
  });

  // Collected during `getClaims()` and applied to whichever response we end up returning, so a
  // refreshed token is never lost to a redirect.
  const refreshedCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const responseHeaders = new Headers();

  const supabase = createCookieBoundClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet, headers) => {
      for (const cookie of cookiesToSet) {
        // Mutating the request's cookies is what lets the Server Components rendered after this
        // point see the refreshed token instead of the expired one.
        request.cookies.set(cookie.name, cookie.value);
        refreshedCookies.push({ ...cookie, options: { ...cookie.options } });
      }
      // `@supabase/ssr` supplies the cache headers that stop a CDN from serving one person's
      // session to another. They are not optional.
      for (const [key, value] of Object.entries(headers)) responseHeaders.set(key, value);
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = typeof data?.claims?.sub === 'string';

  const { pathname, search } = request.nextUrl;
  const needsSession = !SIGNED_OUT_PATHS.includes(pathname);

  const response =
    signedIn || !needsSession
      ? NextResponse.next({ request: { headers: withNonce(request, nonce, csp) } })
      : NextResponse.redirect(new URL(signInPathFor(safeAdminPath(pathname + search)), request.url));

  for (const cookie of refreshedCookies) response.cookies.set(cookie);
  for (const [key, value] of responseHeaders) response.headers.set(key, value);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(key, value);
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

/**
 * Next.js reads the nonce out of the *request's* `Content-Security-Policy` header and applies it to
 * the framework and page scripts it emits; `x-nonce` is the conventional way for a Server Component
 * to read the same value when it needs to mark a script of its own.
 */
function withNonce(request: NextRequest, nonce: string, csp: string): Headers {
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  return headers;
}

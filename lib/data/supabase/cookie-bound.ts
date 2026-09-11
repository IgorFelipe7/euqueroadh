/**
 * IDENTITY 2 OF 2 — the signed-in administrator, carried by the request's cookies.
 *
 * This is the factory shared by the two places that can supply a cookie store: the DAL, which reads
 * `next/headers` (see `./user.ts`), and `proxy.ts`, which has the `NextRequest` and `NextResponse`
 * pair. It deliberately does NOT import `next/headers` itself, so that `proxy.ts` — which runs
 * before rendering and has no request-scoped store — can use it too.
 *
 * The key is the **publishable** key. Every query made through a client built here executes as
 * PostgreSQL's `authenticated` role with the administrator's own JWT, which is what makes RLS the
 * real authorization boundary for participant data rather than a formality
 * (DATABASE-SECURITY.md sections 8.3 and 8.6). The secret key is never used for an admin read.
 */
import 'server-only';

import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { client as publicEnv } from '@/lib/env';

/**
 * Session cookie attributes.
 *
 * `@supabase/ssr` defaults to `httpOnly: false`, because its canonical setup lets a browser client
 * read the session. This application has no browser Supabase client at all — every Supabase call is
 * made by our server — so the tokens are withheld from JavaScript entirely, which is what
 * DATABASE-SECURITY.md section 7.1 specifies. An XSS on an admin page then cannot read the session
 * out of `document.cookie`.
 *
 * `secure` follows the deployment's own origin instead of `NODE_ENV`: a `Secure` cookie is silently
 * dropped over plain HTTP, which would break local development, and hard-coding `false` for
 * development would be a footgun if the flag were ever read in production.
 */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: publicEnv.NEXT_PUBLIC_SITE_URL.startsWith('https://'),
  path: '/',
} as const;

/**
 * Creates a Supabase client bound to one request's cookies.
 *
 * Never share the result across requests: it is configured from the cookies of the request that
 * created it, and reusing it would serve one administrator's session to another.
 */
export function createCookieBoundClient(cookies: CookieMethodsServer): SupabaseClient {
  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { cookieOptions: AUTH_COOKIE_OPTIONS, cookies },
  );
}

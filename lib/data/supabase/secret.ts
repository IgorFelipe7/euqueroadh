/**
 * IDENTITY 1 OF 2 — the secret key. The most privileged thing in the repository.
 *
 * Used for exactly two things (ARCHITECTURE.md section 2, DATABASE-SECURITY.md section 8.6):
 *
 *   1. the public event display read — `SELECT` on `public.events`;
 *   2. the public registration write — `EXECUTE` on `register_for_event` (Phase 4);
 *
 * plus the Supabase Auth Admin API, which has no other credential (Phase 6 team management).
 *
 * ## What this client must never become
 *
 * It must never be cookie-bound. `@supabase/ssr`'s `createServerClient` reads and writes the
 * visitor's session from cookies; building an elevated client that way lets a signed-in user's
 * access token replace the secret key in the `Authorization` header, so the "elevated" client
 * silently executes as that user — or, worse, the other way round in a shared instance. That is why
 * this file uses `@supabase/supabase-js` directly, with session persistence, auto-refresh and URL
 * session detection all switched off: this client has no session, cannot acquire one, and cannot
 * lose its own identity to one.
 *
 * ## Why a leak is survivable, though still an incident
 *
 * The key's database privileges are sized to the two operations above and no wider: `SELECT` on
 * `public.events`, `EXECUTE` on `register_for_event`, and nothing else. It holds no `SELECT` on
 * `registrations`, `admin_users` or `admin_actions` and no write privilege on any table
 * (DATABASE-SECURITY.md section 8.3), so it reads no participant record, no administrator record
 * and no audit row. Those grants are asserted adversarially by the database suite; do not widen
 * them to make application code easier.
 *
 * `import 'server-only'` makes importing this module from a Client Component a build error, which
 * is the mechanical half of the guarantee.
 */
import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { client as publicEnv, server as serverEnv } from '@/lib/env';

let cached: SupabaseClient | undefined;

/**
 * The process-wide secret-key client.
 *
 * Caching is safe *because* the client is stateless: it holds no session, and every request carries
 * the same static `Authorization` header. If a future change ever gives this client session state,
 * the cache must go with it — a shared session would leak one caller's identity into another's
 * request.
 */
export function secretClient(): SupabaseClient {
  cached ??= createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cached;
}

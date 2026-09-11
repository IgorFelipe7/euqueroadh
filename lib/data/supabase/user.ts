/**
 * The per-request client for Server Components, Server Actions and Route Handlers: the
 * administrator's own identity, read from `next/headers`.
 *
 * A new client per render is required, not merely tidy — the cookies it is configured from belong
 * to one request (`@supabase/ssr` says so explicitly), and a shared instance would serve one
 * administrator's session to the next visitor.
 */
import 'server-only';

import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createCookieBoundClient } from './cookie-bound';

export async function createUserClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createCookieBoundClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Server Components cannot write cookies. This is the documented, expected case: a token
        // refreshed during a render is written by `proxy.ts`, which runs before rendering and holds
        // the response. Swallowing it here is what `@supabase/ssr` prescribes; swallowing a real
        // failure in an Action or Route Handler is not a risk, because those can write and do not
        // reach this branch.
      }
    },
  });
}

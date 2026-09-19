/**
 * Wires the self check-in pipeline to the real world: Cloudflare, the database, the log and the
 * clock.
 *
 * It exists so that `submit.ts` — where every security decision is made — imports nothing from
 * Next.js and nothing that performs I/O at module load, exactly as `lib/registration/dependencies.ts`
 * does for the registration path.
 *
 * **No `revalidatePath` here, deliberately.** A check-in changes who is eligible for a raffle and who
 * may download a certificate, and it changes the number on the wall — but it changes nothing a
 * visitor to `/` can see, and the wall reads its count from a live endpoint rather than from a cached
 * render. Revalidating the public page two hundred times over twenty minutes would be pure cost.
 */
import 'server-only';

import { headers } from 'next/headers';

import { selfCheckIn } from '@/lib/data/public';
import { logGuestEvent, newCorrelationId } from '@/lib/observability/log';
import { verifyTurnstileToken } from '@/lib/turnstile/verify';

import type { CheckInDependencies } from './submit';

/**
 * The visitor's address, for Cloudflare's optional `remoteip` hint.
 *
 * Best-effort and never load-bearing, for the reason the registration path states: these headers are
 * set by the platform's proxy and can be spoofed anywhere the proxy does not overwrite them.
 * Turnstile treats the value as a signal, not as identity, and nothing here authorizes on it.
 */
async function remoteIp(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return headerList.get('x-real-ip');
}

export function checkInDependencies(): CheckInDependencies {
  return {
    verifyToken: (token, ip) => verifyTurnstileToken(token, { remoteIp: ip }),
    remoteIp,
    checkIn: selfCheckIn,
    log: logGuestEvent,
    newCorrelationId,
    now: () => Date.now(),
  };
}

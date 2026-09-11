/**
 * Wires the registration pipeline to the real world: Cloudflare, the database, the ISR cache, the
 * log and the clock.
 *
 * It exists so that `submit.ts` — where every security decision is made — imports nothing from
 * Next.js and nothing that performs I/O at module load. That keeps the rules testable without a
 * server, and keeps this file small enough to read in one sitting.
 */
import 'server-only';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import {
  getActiveEventContext,
  readCurrentEventState,
  registerParticipant,
} from '@/lib/data/public';
import { logRegistrationEvent, newCorrelationId } from '@/lib/observability/log';
import { verifyTurnstileToken } from '@/lib/turnstile/verify';

import type { SubmitDependencies } from './submit';

/**
 * The visitor's address, for Cloudflare's optional `remoteip` hint.
 *
 * Deliberately best-effort and never load-bearing: these headers are set by the platform's proxy
 * and can be spoofed anywhere the proxy does not overwrite them. Turnstile treats the value as a
 * signal, not as identity, and nothing in this application authorizes on it. A missing value
 * changes nothing.
 *
 * The first entry of `x-forwarded-for` is taken because the list grows left-to-right from the
 * client; `x-real-ip` is the fallback some platforms set instead.
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

export function registrationDependencies(): SubmitDependencies {
  return {
    verifyToken: (token, ip) => verifyTurnstileToken(token, { remoteIp: ip }),
    remoteIp,
    readEventContext: getActiveEventContext,
    readCurrentState: readCurrentEventState,
    register: registerParticipant,
    revalidate: revalidatePath,
    log: logRegistrationEvent,
    newCorrelationId,
    now: () => Date.now(),
  };
}

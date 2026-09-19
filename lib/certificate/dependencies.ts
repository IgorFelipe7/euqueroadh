/**
 * Wires the certificate-lookup pipeline to the real world: Cloudflare, the database, the router, the
 * log and the clock.
 *
 * It exists so that `submit.ts` — where every security decision is made — imports nothing from
 * Next.js, which is what lets the whole pipeline be asserted without a server. In particular
 * `redirect` arrives here rather than being called there: `next/navigation`'s version works by
 * throwing a framework control-flow exception, and a test proving "a non-attendee is not redirected"
 * should assert on a call that did not happen, not catch a throw.
 */
import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { certificatesEnabled, findCertificate } from '@/lib/data/public';
import { logGuestEvent, newCorrelationId } from '@/lib/observability/log';
import { certificatePath } from '@/lib/routes';
import { verifyTurnstileToken } from '@/lib/turnstile/verify';

import type { CertificateDependencies } from './submit';

/** Best-effort, and never load-bearing — the same note as the other two public pipelines. */
async function remoteIp(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return headerList.get('x-real-ip');
}

export function certificateDependencies(): CertificateDependencies {
  return {
    verifyToken: (token, ip) => verifyTurnstileToken(token, { remoteIp: ip }),
    remoteIp,
    certificatesEnabled,
    find: findCertificate,
    redirect,
    certificatePath,
    log: logGuestEvent,
    newCorrelationId,
    now: () => Date.now(),
  };
}

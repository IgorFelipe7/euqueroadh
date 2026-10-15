/**
 * The demonstration sign-in (docs/DEMO.md). Exists only so that a visitor can open the admin area
 * of the demo deployment without an e-mail inbox.
 *
 * It reuses the production exchange instead of inventing a second one: the Auth Admin API mints a
 * single-use magic-link hash for the demo organizer — `generateLink` sends no e-mail — and the hash
 * is redeemed by `verifyAdminOtpHash()`, the same function behind `/auth/confirmar`. The session it
 * writes is an ordinary one, and what it may do is still decided by `admin_users` on the next
 * request, exactly as for a real organizer.
 *
 * Two guards make this inert outside the demo:
 *
 *   * `demo.enabled` is `false` unless `DEMO_MODE=true`, and then nothing is attempted at all;
 *   * the account is pinned to an `@example.com` address by `lib/env.ts`, so even a demo flag set on
 *     the wrong project cannot mint a session for a real organizer.
 */
import 'server-only';

import { type OtpVerifyResult, verifyAdminOtpHash } from '@/lib/data/auth';
import { demo } from '@/lib/env';
import { logAuthEvent, newCorrelationId } from '@/lib/observability/log';

import { secretClient } from './supabase/secret';

export async function signInAsDemoAdmin(): Promise<OtpVerifyResult> {
  if (!demo.enabled || !demo.adminEmail) {
    logAuthEvent({ event: 'auth.demo_signed_in', outcome: 'demo_disabled' });
    return { outcome: 'failed', correlationId: newCorrelationId() };
  }

  const { data, error } = await secretClient().auth.admin.generateLink({
    type: 'magiclink',
    email: demo.adminEmail,
  });

  const tokenHash = data?.properties?.hashed_token;

  if (error || !tokenHash) {
    const correlationId = newCorrelationId();
    logAuthEvent({
      event: 'auth.demo_signed_in',
      outcome: 'provider_unavailable',
      correlationId,
      providerCode: error?.code,
      providerStatus: error?.status,
    });
    return { outcome: 'failed', correlationId };
  }

  const result = await verifyAdminOtpHash(tokenHash, 'magiclink');

  logAuthEvent({
    event: 'auth.demo_signed_in',
    outcome: result.outcome === 'signed_in' ? 'signed_in' : 'provider_unavailable',
    correlationId: result.correlationId,
  });

  return result;
}

/**
 * The authorization gate. Everything protected in this application passes through this file.
 *
 * Three rules shape it, and all three come from DATABASE-SECURITY.md section 7:
 *
 * 1. **Identity is proven, not read.** `getClaims()` verifies the access token's signature against
 *    the project's published JWKS on every call. `getSession()` is never used server-side: it
 *    returns whatever is in the cookie store without revalidating it, and the cookie store is
 *    attacker-reachable input.
 * 2. **Authorization comes from `public.admin_users`, on every request.** Never from
 *    `user_metadata`, never from a custom claim, never from an environment allowlist. A claim baked
 *    into a JWT stays true until the token expires; a table lookup makes `is_active = false` take
 *    effect on the administrator's very next request, which is the entire point (D5).
 * 3. **The lookup runs as the administrator, not as the secret key.** The row is read through the
 *    user's own client, so RLS is what decides whether it is visible. The gate and the database
 *    agree by construction rather than by coincidence.
 *
 * `proxy.ts` is not part of this. Deleting it must cost a session refresh, never a boundary.
 */
import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { isAuthApiError, type AuthError } from '@supabase/supabase-js';

import { type OtpRequestOutcome, type OtpVerifyOutcome } from '@/lib/auth/sign-in';
import {
  emailDomain,
  logAuthEvent,
  newCorrelationId,
  type AuthEvent,
  type AuthOutcome,
} from '@/lib/observability/log';
import { ROUTES, signInPathFor } from '@/lib/routes';

import { UnauthorizedError } from './errors';
import { createUserClient } from './supabase/user';

/** Everything the application is allowed to know about the signed-in administrator. */
export interface AdminIdentity {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
}

/**
 * Why a request is or is not authorized. `not_admin` deliberately covers three different people —
 * someone who never had access, someone who was deactivated, and someone whose row was removed —
 * because they are owed the same answer and the difference is not the application's to disclose.
 */
export type AdminSessionState =
  | { readonly status: 'anonymous'; readonly expired: boolean }
  | { readonly status: 'not_admin' }
  | { readonly status: 'active'; readonly admin: AdminIdentity };

/** The columns the gate needs. Nothing else about an administrator is loaded here. */
interface AdminUserRow {
  user_id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
}

/**
 * Resolves the caller once per request.
 *
 * `React.cache` deduplicates within a single render pass, so a layout, a page and three components
 * asking "who is this?" cost one signature verification and one query — while still re-resolving on
 * the *next* request, which is what keeps revocation immediate.
 */
const resolveAdminSession = cache(async (): Promise<AdminSessionState> => {
  const supabase = await createUserClient();

  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;

  if (typeof subject !== 'string' || subject.length === 0) {
    // An error here means a token was present and could not be validated or refreshed; no error and
    // no claims simply means nobody is signed in. Only the former is worth saying "expired" about.
    return { status: 'anonymous', expired: Boolean(error) };
  }

  const { data: row, error: lookupError } = await supabase
    .from('admin_users')
    .select('user_id, email, display_name, is_active')
    .eq('user_id', subject)
    .maybeSingle<AdminUserRow>();

  if (lookupError) {
    // Fail closed. A database that cannot answer "is this an administrator?" has not answered yes.
    logAuthEvent({
      event: 'auth.session_rejected',
      outcome: 'lookup_failed',
      providerCode: lookupError.code,
    });
    return { status: 'not_admin' };
  }

  if (!row) {
    logAuthEvent({ event: 'auth.session_rejected', outcome: 'not_admin' });
    return { status: 'not_admin' };
  }

  if (!row.is_active) {
    logAuthEvent({ event: 'auth.session_rejected', outcome: 'inactive_admin' });
    return { status: 'not_admin' };
  }

  return {
    status: 'active',
    admin: { userId: row.user_id, email: row.email, displayName: row.display_name },
  };
});

/** The full state, for the two callers that need to tell "signed out" from "not an administrator". */
export async function getAdminSessionState(): Promise<AdminSessionState> {
  return resolveAdminSession();
}

/**
 * The narrow identity, or `null`. Use this where the only question is "is there an administrator
 * here?" — it exposes neither the Auth user object nor the JWT.
 */
export async function getAdminSession(): Promise<AdminIdentity | null> {
  const state = await resolveAdminSession();
  return state.status === 'active' ? state.admin : null;
}

/**
 * For layouts and pages. Redirects rather than throwing, because a person who followed a link
 * deserves a destination.
 *
 * An authenticated non-administrator lands on `/admin/sem-acesso` rather than a 404: a volunteer
 * whose access was just revoked deserves an explanation (ADMIN-SPEC.md section 2).
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const state = await resolveAdminSession();

  if (state.status === 'active') return state.admin;
  if (state.status === 'not_admin') redirect(ROUTES.adminNoAccess);
  redirect(signInPathFor(null, state.expired ? 'sessao-expirada' : undefined));
}

/**
 * For Server Actions and Route Handlers. **Every** one of them calls this as its first statement,
 * however small it is.
 *
 * A page-level check does not protect the actions defined on that page, and a `proxy.ts` matcher
 * change can silently remove coverage from a whole subtree — Next.js's own documentation says both.
 * This is the check that survives either mistake.
 */
export async function assertAdmin(): Promise<AdminIdentity> {
  const state = await resolveAdminSession();
  if (state.status === 'active') return state.admin;
  throw new UnauthorizedError();
}

/* ------------------------------------------------------------------------------------------------
 * Sign-in
 * ---------------------------------------------------------------------------------------------- */

export interface OtpRequestResult {
  readonly outcome: OtpRequestOutcome;
  readonly correlationId?: string;
}

export interface OtpVerifyResult {
  readonly outcome: OtpVerifyOutcome;
  readonly correlationId?: string;
}

/**
 * Sends a one-time code, or convincingly appears to.
 *
 * Two non-negotiables live in these few lines.
 *
 * **`shouldCreateUser: false`.** Supabase's default is `true`: left alone, this public form would
 * mint an `auth.users` identity for any address typed into it (DATABASE-SECURITY.md section 7.1.1).
 * The project-level sign-up toggle says the same thing, but it is a dashboard setting outside
 * version control; this flag is reviewed like code, because it is code.
 *
 * **Every client-side rejection is reported as `sent`.** With `shouldCreateUser: false` the
 * underlying responses differ — success for a known address, `otp_disabled` for an unknown one, and
 * `over_email_send_rate_limit` for an address that asked again within the resend window. Mapping
 * the entire 4xx family to one outward state is what stops this page from answering "is this person
 * an administrator?" — including in a misconfigured project, where the codes for known and unknown
 * addresses differ again. Only a 5xx or a transport failure is admitted, because that is not a fact
 * about the address. The real distinction is logged, with the address reduced to its domain.
 *
 * This does not make direct probing of Supabase's own endpoint impossible — that is a platform
 * surface with its own rate limits. It stops *this application* from amplifying the leak.
 */
export async function requestAdminOtp(email: string): Promise<OtpRequestResult> {
  const supabase = await createUserClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (!error) {
    logAuthEvent({ event: 'auth.otp_requested', outcome: 'sent', emailDomain: emailDomain(email) });
    return { outcome: 'sent' };
  }

  const status = isAuthApiError(error) ? error.status : undefined;

  if (typeof status === 'number' && status < 500) {
    logAuthEvent({
      event: 'auth.otp_requested',
      outcome: error.code === 'otp_disabled' ? 'unknown_address' : 'rejected_by_provider',
      emailDomain: emailDomain(email),
      providerCode: error.code,
      providerStatus: status,
    });
    return { outcome: 'sent' };
  }

  return { outcome: 'failed', correlationId: reportProviderFailure('auth.otp_requested', error) };
}

/**
 * Exchanges a code for a session. On success the session cookies are written by `@supabase/ssr`
 * through the caller's cookie store, which is why this may only be called from a Server Action or a
 * Route Handler.
 *
 * Authorization is *not* decided here. A successful verification proves who someone is; whether
 * they may enter is re-evaluated from `admin_users` on the next request, by `requireAdmin()`.
 */
export async function verifyAdminOtp(email: string, token: string): Promise<OtpVerifyResult> {
  const supabase = await createUserClient();

  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });

  if (!error && data.session) {
    logAuthEvent({
      event: 'auth.otp_verified',
      outcome: 'signed_in',
      emailDomain: emailDomain(email),
    });
    return { outcome: 'signed_in' };
  }

  return classifyVerificationFailure('auth.otp_verified', error, emailDomain(email));
}

/** The `type` values the e-mail link may carry. Anything else is not a sign-in link. */
export const CONFIRMABLE_OTP_TYPES = ['email', 'magiclink'] as const;
export type ConfirmableOtpType = (typeof CONFIRMABLE_OTP_TYPES)[number];

export function confirmableOtpType(value: string | null | undefined): ConfirmableOtpType | null {
  return CONFIRMABLE_OTP_TYPES.includes(value as ConfirmableOtpType)
    ? (value as ConfirmableOtpType)
    : null;
}

/**
 * The e-mail-link half of the same exchange, for `/auth/confirmar`. The hash is single-use and
 * short-lived; it is never logged, and neither is the address it belongs to (we do not have it).
 */
export async function verifyAdminOtpHash(
  tokenHash: string,
  type: ConfirmableOtpType,
): Promise<OtpVerifyResult> {
  const supabase = await createUserClient();

  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (!error && data.session) {
    logAuthEvent({ event: 'auth.link_verified', outcome: 'signed_in' });
    return { outcome: 'signed_in' };
  }

  return classifyVerificationFailure('auth.link_verified', error);
}

/**
 * Ends the session.
 *
 * The default (global) scope is deliberate: it revokes the refresh token at the Auth server, so a
 * session cookie captured earlier stops working. Clearing the cookie alone would leave a still-valid
 * refresh token in the hands of whoever had copied it. The cost is that signing out on a laptop also
 * signs out the phone — acceptable for a team of a few volunteers, and the safer default when the
 * reason for signing out might be that the device is shared.
 */
export async function signOutAdmin(): Promise<void> {
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signOut();

  logAuthEvent({
    event: 'auth.signed_out',
    outcome: error ? 'provider_unavailable' : 'ok',
    providerCode: error?.code,
  });
}

/* ------------------------------------------------------------------------------------------------
 * Error mapping — no provider string ever reaches a person
 * ---------------------------------------------------------------------------------------------- */

function classifyVerificationFailure(
  event: AuthEvent,
  error: AuthError | null,
  domain?: string,
): OtpVerifyResult {
  const status = error && isAuthApiError(error) ? error.status : undefined;

  // A wrong code, an expired code, a reused code and a code for an address with no account are one
  // message with no attempt counter (ADMIN-SPEC.md section 2). Only a server-side fault differs.
  if (!error || (typeof status === 'number' && status < 500)) {
    logAuthEvent({
      event,
      outcome: 'invalid_code',
      emailDomain: domain,
      providerCode: error?.code,
      providerStatus: status,
    });
    return { outcome: 'invalid_code' };
  }

  return { outcome: 'failed', correlationId: reportProviderFailure(event, error, domain) };
}

/** Logs an infrastructure failure and mints the code the person is shown. Returns that code. */
function reportProviderFailure(event: AuthEvent, error: AuthError, domain?: string): string {
  const correlationId = newCorrelationId();
  const outcome: AuthOutcome = 'provider_unavailable';
  logAuthEvent({
    event,
    outcome,
    correlationId,
    emailDomain: domain,
    providerCode: error.code,
    providerStatus: error.status,
  });
  return correlationId;
}

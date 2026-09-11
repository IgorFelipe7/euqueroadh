'use server';

/**
 * The sign-in Server Actions.
 *
 * These are the only public, unauthenticated entry points in the admin area, so two things matter
 * more than anywhere else:
 *
 *   * **The outward state never depends on whether the address belongs to an administrator.** The
 *     mapping that guarantees it lives in `requestAdminOtp()`; this file must not reintroduce a
 *     distinction by, say, rendering a different message for a rate-limited resend.
 *   * **The destination is validated, never trusted.** `next` arrives in the form body, where
 *     anyone can put anything. `safeAdminPath()` reduces it to an internal admin path or to
 *     `/admin`.
 *
 * Authorization is deliberately absent here: verifying a code proves identity, and identity is not
 * access. Whether the person may enter is decided on the next request by `requireAdmin()`, reading
 * `admin_users` — which is why a deactivated administrator can still sign in and still gets nowhere.
 *
 * **Only async functions may be exported from this file.** The directive turns every export into a
 * server reference, including the ones that are not functions — a constant exported here reaches
 * the browser as a callable stub, not as its value. `SignInState` and `INITIAL_SIGN_IN_STATE` live
 * in `lib/auth/sign-in.ts` for that reason; the comment there records what it cost to find out.
 */

import { redirect } from 'next/navigation';

import {
  SIGN_IN_COPY,
  failureMessage,
  signInCodeSchema,
  signInEmailSchema,
  type SignInState,
} from '@/lib/auth/sign-in';
import { requestAdminOtp, verifyAdminOtp } from '@/lib/data/auth';
import { safeAdminPath } from '@/lib/routes';

type Intent = 'request' | 'resend' | 'verify' | 'restart';

function intentOf(formData: FormData): Intent {
  const value = formData.get('intent');
  return value === 'resend' || value === 'verify' || value === 'restart' ? value : 'request';
}

function stringOf(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === 'string' ? value : '';
}

export async function signInAction(
  previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const intent = intentOf(formData);

  if (intent === 'restart') {
    return { step: 'request', email: previous.email };
  }

  if (intent === 'verify') {
    return verifyStep(previous, formData);
  }

  return requestStep(formData, intent === 'resend');
}

async function requestStep(formData: FormData, isResend: boolean): Promise<SignInState> {
  const typed = stringOf(formData, 'email');
  const parsed = signInEmailSchema.safeParse(typed);

  if (!parsed.success) {
    return { step: 'request', email: typed, error: SIGN_IN_COPY.errors.invalidEmail };
  }

  const email = parsed.data;
  const result = await requestAdminOtp(email);

  if (result.outcome === 'failed') {
    return { step: 'request', email, error: failureMessage(result.correlationId) };
  }

  // `sent` covers a known address, an unknown one, and a resend inside the 60-second window. One
  // screen, one message, one countdown — see DATABASE-SECURITY.md section 7.1.1.
  return {
    step: 'verify',
    email,
    sentAt: Date.now(),
    notice: isResend ? SIGN_IN_COPY.verify.resent : undefined,
  };
}

async function verifyStep(previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = signInEmailSchema.safeParse(stringOf(formData, 'email'));
  const sentAt = previous.step === 'verify' ? previous.sentAt : Date.now();

  if (!email.success) {
    return { step: 'request', email: stringOf(formData, 'email'), error: SIGN_IN_COPY.errors.invalidEmail };
  }

  const code = signInCodeSchema.safeParse(stringOf(formData, 'code'));

  if (!code.success) {
    // Rejected locally: a code of the wrong shape cannot be right, and spending a verification
    // attempt on it would only bring the account closer to Supabase's own rate limit.
    return { step: 'verify', email: email.data, sentAt, error: SIGN_IN_COPY.errors.missingCode };
  }

  const result = await verifyAdminOtp(email.data, code.data);

  if (result.outcome === 'invalid_code') {
    return { step: 'verify', email: email.data, sentAt, error: SIGN_IN_COPY.errors.invalidCode };
  }

  if (result.outcome === 'failed') {
    return {
      step: 'verify',
      email: email.data,
      sentAt,
      error: failureMessage(result.correlationId),
    };
  }

  // The session cookies are written by now. Where this lands is decided by `requireAdmin()` on the
  // next request: the protected layout sends a non-administrator to /admin/sem-acesso.
  redirect(safeAdminPath(stringOf(formData, 'next')));
}

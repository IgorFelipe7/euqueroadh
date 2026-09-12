/**
 * The one shape every admin Server Action returns.
 *
 * It lives here, not in a `'use server'` module: that directive turns every export into a server
 * reference, so a type or a constant exported alongside an action reaches the browser as a callable
 * stub rather than as its value. `lib/auth/server-actions.test.ts` enforces the rule for the whole
 * repository; this file is the admin half of obeying it.
 *
 * `conflict` is separated from the other failures because the interface answers it differently: it
 * offers `Recarregar` rather than "try again", since trying again with the same stale token would
 * fail identically (ADMIN-SPEC.md section 5.3).
 */

import type { AdminErrorCode } from './copy';

export interface PromotedPerson {
  readonly id: string;
  readonly name: string;
  readonly phoneE164: string;
}

export type AdminActionState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'ok';
      readonly message: string;
      /** Present after a settings save: the token the form must carry from now on. */
      readonly settingsVersion?: number;
      /** Present after a promotion: the people the organizer now has to telephone. */
      readonly promoted?: readonly PromotedPerson[];
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly code: AdminErrorCode;
      /** Field-level messages, keyed by input name, for the forms that have fields. */
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

export const IDLE: AdminActionState = { status: 'idle' };

export function ok(
  message: string,
  extra?: { settingsVersion?: number; promoted?: readonly PromotedPerson[] },
): AdminActionState {
  return { status: 'ok', message, ...extra };
}

export function failed(
  code: AdminErrorCode,
  message: string,
  fieldErrors?: Readonly<Record<string, string>>,
): AdminActionState {
  return { status: 'error', message, code, fieldErrors };
}

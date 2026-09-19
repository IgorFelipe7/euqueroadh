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

/**
 * A drawn winner, as the stage receives it.
 *
 * `maskedName` is what the composition renders — the projector shows `Ana S.` and nothing longer
 * (RAFFLE-AND-CERTIFICATE-SPEC.md § 3.6). `fullName` travels too, because the operator has to
 * announce the right person, and it is rendered **only** inside the confirm control, which lives in
 * the chrome layer that fades out and is never part of what the room is looking at.
 */
export interface StageWinner {
  readonly drawId: string;
  readonly maskedName: string;
  readonly fullName: string;
  readonly drawIndex: number;
  readonly poolSize: number;
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
      /** Present after a draw: the winner the stage animates towards. */
      readonly winner?: StageWinner;
      /** Present after a draw or a resolution, so the stage knows when the raffle is complete. */
      readonly raffleStatus?: 'draft' | 'running' | 'finished';
      /** Present after a check-in: the moment recorded, or `null` when the mark was cleared. */
      readonly attendedAt?: string | null;
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
  extra?: {
    settingsVersion?: number;
    promoted?: readonly PromotedPerson[];
    winner?: StageWinner;
    raffleStatus?: 'draft' | 'running' | 'finished';
    attendedAt?: string | null;
  },
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

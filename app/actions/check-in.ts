'use server';

/**
 * The public self check-in entry point, and the only one.
 *
 * Everything it does is in `lib/check-in/submit.ts`; this file exists to be the boundary and to stay
 * thin enough that nothing can hide in it. It mirrors `app/actions/register.ts` exactly, and for the
 * same two reasons:
 *
 *   * **No authorization check, deliberately.** Self check-in is a public action. The controls on it
 *     are Turnstile, verified server-side inside the pipeline, and the check-in session itself —
 *     a capability an administrator opened, that expires, and that closing revokes. Neither is
 *     bypassable from here, because `self_check_in` is granted to `service_role` alone.
 *   * **Nothing is trusted from the request.** Not the values, not the session token, not the
 *     Turnstile token. The session is re-resolved inside the RPC under the event row lock, so a
 *     token that was live when the page rendered and closed a second later is refused.
 *
 * **Only async functions may be exported from a `'use server'` module.** The directive turns every
 * other export into a server reference, so a constant exported here would reach the browser as a
 * callable stub rather than as its value. The shared state and copy live in `lib/check-in/state.ts`;
 * `lib/auth/server-actions.test.ts` enforces the rule.
 */

import { checkInDependencies } from '@/lib/check-in/dependencies';
import type { CheckInFormState } from '@/lib/check-in/state';
import { submitCheckIn } from '@/lib/check-in/submit';

export async function checkInAction(
  previous: CheckInFormState,
  formData: FormData,
): Promise<CheckInFormState> {
  return submitCheckIn(checkInDependencies(), previous, formData);
}

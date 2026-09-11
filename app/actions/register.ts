'use server';

/**
 * The public registration entry point, and the only one.
 *
 * Everything it does is in `lib/registration/submit.ts`; this file exists to be the boundary and to
 * stay thin enough that nothing can hide in it. Two properties matter and both come from keeping it
 * this small:
 *
 *   * **No authorization check, deliberately.** Registration is a public action — the control on
 *     this endpoint is Turnstile, verified server-side inside the pipeline before any allocation
 *     (DATABASE-SECURITY.md section 9.1). That is the opposite of the admin actions, which begin
 *     with `assertAdmin()`.
 *   * **Nothing is trusted from the request.** Not the values, not the event, not the token.
 *
 * **Only async functions may be exported from a `'use server'` module.** The directive turns every
 * other export into a server reference, so a constant exported here would reach the browser as a
 * callable stub rather than as its value. The shared state and copy live in
 * `lib/registration/state.ts`; `lib/auth/server-actions.test.ts` enforces the rule.
 */

import { registrationDependencies } from '@/lib/registration/dependencies';
import type { RegistrationFormState } from '@/lib/registration/state';
import { submitRegistration } from '@/lib/registration/submit';

export async function registerAction(
  previous: RegistrationFormState,
  formData: FormData,
): Promise<RegistrationFormState> {
  return submitRegistration(registrationDependencies(), previous, formData);
}

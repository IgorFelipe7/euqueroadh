'use server';

/**
 * The public certificate-lookup entry point, and the only one.
 *
 * Everything it does is in `lib/certificate/submit.ts`; this file is the boundary and stays thin
 * enough that nothing can hide in it.
 *
 *   * **No authorization check, deliberately.** Retrieving one's own certificate is a public action.
 *     The controls are Turnstile, verified server-side before any lookup; the `certificates_enabled`
 *     switch, checked before any identity field reaches the database; and the fact that
 *     `find_certificate` is granted to `service_role` alone, so it cannot be called with a
 *     publishable key.
 *   * **A match never returns.** It ends in a `redirect()` to `/certificado/<token>`, so the
 *     capability travels in a `Location` header and never becomes data this action hands back.
 *
 * **Only async functions may be exported from a `'use server'` module.** The state type and the copy
 * live in `lib/certificate/state.ts`; `lib/auth/server-actions.test.ts` enforces the rule.
 */

import { certificateDependencies } from '@/lib/certificate/dependencies';
import type { CertificateFormState } from '@/lib/certificate/state';
import { submitCertificateLookup } from '@/lib/certificate/submit';

export async function findCertificateAction(
  previous: CertificateFormState,
  formData: FormData,
): Promise<CertificateFormState> {
  return submitCertificateLookup(certificateDependencies(), previous, formData);
}

/**
 * Turning a PostgREST error into one of the named errors the RPCs raise.
 *
 * The administrative routines raise `raise exception 'settings_conflict'` and friends, so the
 * message PostgREST returns *is* the name — except that PostgreSQL prefixes nothing and Supabase
 * passes it through verbatim, which makes exact matching correct and substring matching sloppy. One
 * routine formats an argument into the name (`capacity_below_confirmed:78`), so that one is parsed
 * rather than compared.
 *
 * Pure, so the whole table is a unit test rather than a thing discovered in production. An
 * unrecognised message is `unavailable`: the caller logs the machine code and shows a generic
 * sentence, and no provider string reaches a person (ADMIN-SPEC.md section 7.3).
 */

import { ADMIN_ERROR_CODES, type AdminError, type AdminErrorCode } from './copy';

/** The shape of a PostgREST error, reduced to what this module reads. */
export interface RpcErrorLike {
  readonly message?: string | null;
  readonly code?: string | null;
}

const NAMED: ReadonlySet<string> = new Set<string>(ADMIN_ERROR_CODES);

export function classifyRpcError(error: RpcErrorLike | null | undefined): AdminError {
  const message = (error?.message ?? '').trim();

  const [name, argument] = message.split(':', 2);

  // The two routines that format a number into their own error name, so the sentence can quote it.
  if (name === 'capacity_below_confirmed' || name === 'winners_below_drawn') {
    const detail = Number.parseInt(argument ?? '', 10);
    return { code: name, detail: Number.isFinite(detail) ? detail : undefined };
  }

  if (NAMED.has(name) && name !== 'unavailable') {
    return { code: name as AdminErrorCode };
  }

  // `42501` is PostgreSQL's insufficient_privilege, which every RPC raises when
  // `is_active_admin()` is false. Matching it as well means a revoked administrator is told their
  // session ended even if the message ever stops travelling.
  if (error?.code === '42501') return { code: 'not_authorized' };

  return { code: 'unavailable' };
}

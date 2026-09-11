/**
 * The errors the Data Access Layer is allowed to raise.
 *
 * A database or PostgREST error never travels further than this layer: SQLSTATE codes, relation
 * names and provider messages are diagnostic material for the log, not copy for a person
 * (ADMIN-SPEC.md section 7.3). What crosses the boundary is one of these, carrying a correlation
 * code that ties the screen to the log line without putting anything personal in either.
 */
import 'server-only';

import { newCorrelationId } from '@/lib/observability/log';

/**
 * Thrown by `assertAdmin()` at a server entry point — a Server Action or a Route Handler — when the
 * caller is not an active administrator.
 *
 * It is an exception rather than a returned value on purpose: a caller that ignores a returned
 * `{ ok: false }` proceeds as if authorized, and that failure mode is silent. A page redirects
 * instead; only entry points throw.
 */
export class UnauthorizedError extends Error {
  readonly correlationId: string;

  constructor(message = 'Não autorizado.') {
    super(message);
    this.name = 'UnauthorizedError';
    this.correlationId = newCorrelationId();
  }
}

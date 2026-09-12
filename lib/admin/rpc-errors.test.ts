import { describe, expect, it } from 'vitest';

import { ADMIN_ERROR_CODES, adminErrorMessage, type AdminErrorCode } from './copy';
import { classifyRpcError } from './rpc-errors';

/**
 * This mapping is where a mistake would be invisible: a missed case renders as
 * `Não foi possível concluir a ação` and looks like an outage rather than like the refusal it is.
 * So every named error the RPCs raise is asserted, and so is the fallback.
 */
describe('classifyRpcError', () => {
  it.each([
    'not_authorized',
    'settings_conflict',
    'capacity_required_to_open',
    'invalid_capacity',
    'invalid_count',
    'invalid_name',
    'invalid_age',
    'invalid_email',
    'event_not_found',
    'registration_not_found',
    'admin_not_found',
    'cannot_modify_self',
    'last_active_admin',
    'not_waitlisted',
    'no_headroom',
  ] as const)('recognises %s', (name) => {
    expect(classifyRpcError({ message: name })).toEqual({ code: name });
  });

  it('parses the confirmed count out of capacity_below_confirmed', () => {
    expect(classifyRpcError({ message: 'capacity_below_confirmed:78' })).toEqual({
      code: 'capacity_below_confirmed',
      detail: 78,
    });
  });

  it('still classifies capacity_below_confirmed when the count is missing or malformed', () => {
    expect(classifyRpcError({ message: 'capacity_below_confirmed' })).toEqual({
      code: 'capacity_below_confirmed',
      detail: undefined,
    });
    expect(classifyRpcError({ message: 'capacity_below_confirmed:muitas' })).toEqual({
      code: 'capacity_below_confirmed',
      detail: undefined,
    });
  });

  /*
   * Every administrative RPC raises `insufficient_privilege` when `is_active_admin()` is false.
   * Matching the SQLSTATE as well means a revoked administrator is told their session ended even if
   * the message ever stops travelling through PostgREST.
   */
  it('treats SQLSTATE 42501 as a lost authorization', () => {
    expect(classifyRpcError({ message: 'permission denied for function', code: '42501' })).toEqual({
      code: 'not_authorized',
    });
  });

  it.each([
    [{ message: 'unexpected token' }],
    [{ message: '' }],
    [{ code: 'PGRST202' }],
    [null],
    [undefined],
  ])('falls back to unavailable for %j', (error) => {
    expect(classifyRpcError(error)).toEqual({ code: 'unavailable' });
  });

  /*
   * `unavailable` is this layer's own word for "the database said something I do not model". A
   * routine that literally raised `unavailable` must not be mistaken for a recognised name.
   */
  it('never promotes the literal string "unavailable" to a named error', () => {
    expect(classifyRpcError({ message: 'unavailable' })).toEqual({ code: 'unavailable' });
  });

  /*
   * A PostgreSQL message can quote the failing statement, and the statement quotes the participant.
   * Nothing from the provider may survive classification.
   */
  it('carries no provider text into the result', () => {
    const classified = classifyRpcError({
      message: 'insert into registrations values (\'Ana Souza\', 17, \'+5519991234567\')',
      code: '23514',
    });

    expect(JSON.stringify(classified)).not.toContain('Ana Souza');
    expect(JSON.stringify(classified)).not.toContain('5519991234567');
  });
});

describe('adminErrorMessage', () => {
  it('has a pt-BR sentence for every code, with no placeholder left in it', () => {
    for (const code of ADMIN_ERROR_CODES) {
      const message = adminErrorMessage({ code: code as AdminErrorCode, detail: 78 });

      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toContain('undefined');
      expect(message).not.toContain('[object');
    }
  });

  it('names the blocking number when the capacity floor refuses a save', () => {
    expect(adminErrorMessage({ code: 'capacity_below_confirmed', detail: 78 })).toContain('78');
  });
});

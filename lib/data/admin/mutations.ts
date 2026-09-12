/**
 * Every administrative write in the product.
 *
 * **There is no direct table write in this file, and there must never be one.** `authenticated`
 * holds `SELECT` and nothing else on every application table (migration 10), so a PostgREST
 * `update()` here would not merely be poor style — it would 42501. Each function below is a thin
 * wrapper over one `SECURITY DEFINER` RPC that authorizes, locks in the documented order, mutates
 * and writes its audit record in the same transaction (DATABASE-SECURITY.md section 6).
 *
 * Two properties hold for every wrapper:
 *
 *   * **It runs under the administrator's own JWT.** `is_active_admin()` reads `auth.uid()`, which
 *     does not exist under the secret key — so the secret key cannot call these at all, which is
 *     the mechanical reason the server secret is not an admin bypass.
 *   * **The provider's error never escapes.** It is classified into a named code here and rendered
 *     as pt-BR copy by the caller. A SQLSTATE is a log line, not a sentence.
 *
 * `assertAdmin()` is called at the top of each one. That is belt and braces over the database's own
 * check, and it is what makes the *application* fail closed if a grant is ever widened by accident.
 */
import 'server-only';

import { classifyRpcError } from '@/lib/admin/rpc-errors';
import type { AdminError } from '@/lib/admin/copy';
import { assertAdmin } from '@/lib/data/auth';
import { createUserClient } from '@/lib/data/supabase/user';
import type { PromotedPerson } from '@/lib/admin/state';

export type MutationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AdminError };

function fail(error: unknown, event: string): { ok: false; error: AdminError } {
  const classified = classifyRpcError(error as { message?: string; code?: string });

  if (classified.code === 'unavailable') {
    // Loud in the log, generic on screen. `code` is a machine token; `message` is dropped because
    // a PostgreSQL message can quote the statement, and the statement quotes the participant.
    console.error(
      JSON.stringify({ event, code: (error as { code?: string } | null)?.code ?? 'unknown' }),
    );
  }

  return { ok: false, error: classified };
}

/* ------------------------------------------------------------------------------------------------
 * Settings
 * ---------------------------------------------------------------------------------------------- */

export interface SettingsSnapshot {
  readonly settingsVersion: number;
  readonly capacity: number;
  readonly waitlistEnabled: boolean;
  readonly registrationState: 'open' | 'closed';
}

/**
 * The only writer of `capacity`, `waitlist_enabled` and `registration_state`.
 *
 * `expectedSettingsVersion` is the optimistic-concurrency token (invariant I8) and is a counter of
 * *settings* changes — never `updated_at`, which the counter trigger bumps on every public
 * registration. The RPC refuses a stale token, so an administrator with the settings page open all
 * evening cannot overwrite a colleague's change, and a hundred registrations arriving meanwhile
 * cause no spurious conflict.
 */
export async function updateEventSettings(input: {
  eventId: string;
  capacity: number;
  waitlistEnabled: boolean;
  registrationState: 'open' | 'closed';
  expectedSettingsVersion: number;
}): Promise<MutationResult<SettingsSnapshot>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase.rpc('update_event_settings', {
    p_event_id: input.eventId,
    p_capacity: input.capacity,
    p_waitlist_enabled: input.waitlistEnabled,
    p_state: input.registrationState,
    p_expected_settings_version: input.expectedSettingsVersion,
  });

  if (error) return fail(error, 'admin.settings_rpc_failed');

  const row = firstRow<{
    settings_version: number;
    capacity: number;
    waitlist_enabled: boolean;
    registration_state: 'open' | 'closed';
  }>(data);

  if (!row) return fail({ message: 'empty' }, 'admin.settings_rpc_empty');

  return {
    ok: true,
    value: {
      settingsVersion: Number(row.settings_version),
      capacity: row.capacity,
      waitlistEnabled: row.waitlist_enabled,
      registrationState: row.registration_state,
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Waitlist and status
 * ---------------------------------------------------------------------------------------------- */

/**
 * Promotes the `count` oldest waitlisted people, capped by the real headroom inside the
 * transaction.
 *
 * It returns **fewer** rows than asked for when the headroom disappeared between the render and the
 * click, and that is a normal outcome rather than an error: the interface says so honestly
 * (`Apenas 1 de 2 pessoas foi promovida`). The returned names and telephone numbers are the one
 * place an RPC returns participant data, because the organizer now has to telephone these people —
 * the system sends no messages (D2).
 */
export async function promoteFromWaitlist(
  eventId: string,
  count: number,
): Promise<MutationResult<readonly PromotedPerson[]>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase.rpc('promote_from_waitlist', {
    p_event_id: eventId,
    p_count: count,
  });

  if (error) return fail(error, 'admin.promote_rpc_failed');

  const rows = (Array.isArray(data) ? data : []) as {
    registration_id: string;
    full_name: string;
    phone_e164: string;
  }[];

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.registration_id,
      name: row.full_name,
      phoneE164: row.phone_e164,
    })),
  };
}

/**
 * Promotes one **named** person, out of queue order if the organizer chooses.
 *
 * Capacity is checked inside the same transaction and under the same event row lock as everything
 * else, so `no_headroom` is a refusal rather than an overselling. `waitlist_rank` is kept, so the
 * record of what actually happened survives the promotion (invariant I4).
 */
export async function promoteRegistration(
  id: string,
): Promise<MutationResult<PromotedPerson | null>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase.rpc('promote_registration', { p_registration_id: id });

  if (error) return fail(error, 'admin.promote_one_rpc_failed');

  const row = firstRow<{ registration_id: string; full_name: string; phone_e164: string }>(data);
  if (!row) return { ok: true, value: null };

  return {
    ok: true,
    value: { id: row.registration_id, name: row.full_name, phoneE164: row.phone_e164 },
  };
}

/** Cancels one registration. Idempotent in the database; a second call writes no second audit row. */
export async function cancelRegistration(id: string): Promise<MutationResult<string>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase.rpc('cancel_registration', { p_registration_id: id });

  if (error) return fail(error, 'admin.cancel_rpc_failed');
  return { ok: true, value: typeof data === 'string' ? data : 'cancelled' };
}

/**
 * Corrects a participant's name, age or notes.
 *
 * The telephone number is deliberately not a parameter: it is the identity key and the duplicate
 * key, so changing it would silently move the registration to a different person. Nor is the
 * status — transitions belong to `cancel_registration` and `promote_from_waitlist`, which handle
 * capacity and the counters correctly (DATABASE-SECURITY.md section 6.3).
 */
export async function editRegistration(input: {
  id: string;
  fullName: string;
  age: number;
  notes: string | null;
}): Promise<MutationResult<{ fullName: string; age: number }>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase.rpc('edit_registration', {
    p_registration_id: input.id,
    p_full_name: input.fullName,
    p_age: input.age,
    p_notes: input.notes,
  });

  if (error) return fail(error, 'admin.edit_rpc_failed');

  const row = firstRow<{ full_name: string; age: number }>(data);
  if (!row) return fail({ message: 'empty' }, 'admin.edit_rpc_empty');

  return { ok: true, value: { fullName: row.full_name, age: row.age } };
}

/** Permanent erasure of one participant. Irreversible, audited with no personal data. */
export async function deleteRegistration(id: string): Promise<MutationResult<boolean>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase.rpc('delete_registration', { p_registration_id: id });

  if (error) return fail(error, 'admin.delete_rpc_failed');
  return { ok: true, value: data === true };
}

/**
 * The retention mechanism: one atomic call that erases every registration for the event, forces
 * registrations closed and records the counts.
 *
 * Never a loop of per-row deletes. It carries the settings token for the same reason the settings
 * form does — the most destructive action in the product must not run against a stale view.
 */
export async function purgeEventRegistrations(
  eventId: string,
  expectedSettingsVersion: number,
): Promise<MutationResult<{ deletedCount: number; settingsVersion: number }>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase.rpc('purge_event_registrations', {
    p_event_id: eventId,
    p_expected_settings_version: expectedSettingsVersion,
  });

  if (error) return fail(error, 'admin.purge_rpc_failed');

  const row = firstRow<{ deleted_count: number; settings_version: number }>(data);
  if (!row) return fail({ message: 'empty' }, 'admin.purge_rpc_empty');

  return {
    ok: true,
    value: {
      deletedCount: Number(row.deleted_count),
      settingsVersion: Number(row.settings_version),
    },
  };
}

/**
 * Audits an export **before** a single byte is streamed (DATABASE-SECURITY.md section 10.6).
 *
 * If this fails, the caller must not send the file: an export that leaves no trace is exactly the
 * event the audit trail exists to record.
 */
export async function recordExportAction(
  eventId: string,
  rowCount: number,
  filters: Record<string, unknown>,
): Promise<MutationResult<true>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { error } = await supabase.rpc('record_export_action', {
    p_event_id: eventId,
    p_row_count: rowCount,
    p_filters: filters,
  });

  if (error) return fail(error, 'admin.export_audit_failed');
  return { ok: true, value: true };
}

/** A `RETURNS TABLE` function arrives as an array of rows; these all return exactly one. */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | null) ?? null;
}

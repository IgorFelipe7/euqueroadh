/**
 * Administrator provisioning — the one place in the product where an operation spans two systems.
 *
 * `admin_users` is the sole authorization source; `auth.users` only proves identity. That ordering
 * is what makes both halves fail **closed** (DATABASE-SECURITY.md section 7.4):
 *
 *   * **Invite** is Auth first, then the database. If the second half fails, an `auth.users` row
 *     exists that grants nothing — an account that can sign in and lands on `/admin/sem-acesso`.
 *   * **Removal** is the database first, then Auth. If the second half fails, authorization is
 *     already revoked and only an orphaned login remains; the page says so and retrying is safe.
 *
 * The secret key appears here, and only here, for the two Auth Admin API calls — which have no SQL
 * equivalent. It is never used to *authorize* anything: every database half runs through an RPC
 * under the inviting administrator's own JWT, so `auth.uid()` exists and the audit row names a
 * person. Calling `add_admin_user` with the secret key would write `desconhecido` into the trail.
 */
import 'server-only';

import type { AdminError } from '@/lib/admin/copy';
import { classifyRpcError } from '@/lib/admin/rpc-errors';
import { assertAdmin } from '@/lib/data/auth';
import { secretClient } from '@/lib/data/supabase/secret';
import { createUserClient } from '@/lib/data/supabase/user';

import type { MutationResult } from './mutations';

export interface TeamMember {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
}

interface TeamRow {
  user_id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

/** The team, active first then alphabetical — the list an organizer scans for "who can get in?". */
export async function listTeam(): Promise<readonly TeamMember[]> {
  await assertAdmin();

  const supabase = await createUserClient();

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id, email, display_name, is_active, created_at')
    .order('is_active', { ascending: false })
    .order('email', { ascending: true })
    .returns<TeamRow[]>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.team_read_failed', code: error.code }));
    return [];
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}

export type InviteOutcome = 'invited' | 'already_existed';

/**
 * Invites an administrator, or grants access to an address that already has an account.
 *
 * `inviteUserByEmail` both creates the identity and sends the e-mail; there is no other call that
 * does. When the address already exists it fails, and the existing identity is found by paging the
 * Auth user list — which is bounded and small, because public sign-up is off and participants are
 * never Auth users. The only rows in `auth.users` are administrators, past and present.
 */
export async function inviteAdmin(email: string): Promise<MutationResult<InviteOutcome>> {
  await assertAdmin();

  const admin = secretClient();

  const invited = await admin.auth.admin.inviteUserByEmail(email);

  let userId = invited.data?.user?.id ?? null;
  let outcome: InviteOutcome = 'invited';

  if (invited.error) {
    const existing = await findAuthUserByEmail(email);

    if (!existing) {
      console.error(
        JSON.stringify({ event: 'admin.invite_failed', providerCode: invited.error.code }),
      );
      return { ok: false, error: { code: 'unavailable' } satisfies AdminError };
    }

    userId = existing;
    outcome = 'already_existed';
  }

  if (!userId) {
    console.error(JSON.stringify({ event: 'admin.invite_missing_user' }));
    return { ok: false, error: { code: 'unavailable' } };
  }

  // The database half, under the INVITING administrator's JWT so the audit row names them.
  const supabase = await createUserClient();
  const { error } = await supabase.rpc('add_admin_user', {
    p_user_id: userId,
    p_email: email,
    p_display_name: null,
  });

  if (error) {
    console.error(JSON.stringify({ event: 'admin.add_admin_rpc_failed', code: error.code }));
    return { ok: false, error: classifyRpcError(error) };
  }

  return { ok: true, value: outcome };
}

const AUTH_PAGE_SIZE = 200;
const AUTH_MAX_PAGES = 10;

/** The identity behind an address, or `null`. Bounded: `auth.users` holds administrators only. */
async function findAuthUserByEmail(email: string): Promise<string | null> {
  const admin = secretClient();
  const needle = email.trim().toLowerCase();

  for (let page = 1; page <= AUTH_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });

    if (error) {
      console.error(JSON.stringify({ event: 'admin.auth_lookup_failed', providerCode: error.code }));
      return null;
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === needle);
    if (match) return match.id;
    if (data.users.length < AUTH_PAGE_SIZE) return null;
  }

  return null;
}

/**
 * Deactivation and reactivation — one database-local, fully transactional RPC.
 *
 * This is the recommended way to remove access: it involves no external system, it is reversible,
 * and the row is retained so the audit trail keeps a name. The two guards — no self-modification,
 * never the last active administrator — live inside the RPC, not here, so they hold against a
 * direct call as well as against a click.
 */
export async function setAdminActive(
  userId: string,
  active: boolean,
): Promise<MutationResult<boolean>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase.rpc('set_admin_active', {
    p_user_id: userId,
    p_active: active,
  });

  if (error) {
    console.error(JSON.stringify({ event: 'admin.set_active_rpc_failed', code: error.code }));
    return { ok: false, error: classifyRpcError(error) };
  }

  return { ok: true, value: data === true };
}

export type RemovalOutcome =
  | 'removed'
  /** Authorization is revoked, but the Auth account survived. Safe, and safe to retry. */
  | 'auth_residue'
  /** There was no `admin_users` row to remove; the Auth deletion was still attempted. */
  | 'not_found';

/**
 * Permanent removal. Database first, because that is where authorization lives.
 *
 * The two steps cannot share a transaction and this does not pretend otherwise. If step 2 fails the
 * person is already not an administrator, so the failure mode is closed — the Team page surfaces
 * the residue honestly rather than reporting a success that did not fully happen.
 */
export async function removeAdmin(userId: string): Promise<MutationResult<RemovalOutcome>> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase.rpc('remove_admin_user', { p_user_id: userId });

  if (error) {
    console.error(JSON.stringify({ event: 'admin.remove_rpc_failed', code: error.code }));
    return { ok: false, error: classifyRpcError(error) };
  }

  const removed = data === true;

  const deletion = await secretClient().auth.admin.deleteUser(userId);

  if (deletion.error) {
    console.error(
      JSON.stringify({ event: 'admin.auth_delete_failed', providerCode: deletion.error.code }),
    );
    return { ok: true, value: 'auth_residue' };
  }

  return { ok: true, value: removed ? 'removed' : 'not_found' };
}

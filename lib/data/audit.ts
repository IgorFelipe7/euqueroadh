/**
 * The audit trail — read only.
 *
 * Audit *writes* happen inside the database RPCs, in the same transaction as the mutation they
 * describe (invariant I9). `record_admin_action` is granted to no role at all, so there is no path
 * by which application code — or a compromised browser — can forge, amend or pollute this log. This
 * module therefore has exactly one direction.
 *
 * The read runs under the administrator's own JWT, so `admin_actions_admin_read` decides what is
 * visible. The secret key has no `SELECT` on this table and could not serve it.
 */
import 'server-only';

import { assertAdmin } from './auth';
import { createUserClient } from './supabase/user';

export interface AdminActionEntry {
  readonly id: string;
  readonly action: string;
  /** Ready to render: the current administrator's name, or the removed-administrator wording. */
  readonly actorName: string;
  readonly createdAt: string;
  readonly eventId: string | null;
  readonly registrationId: string | null;
  /** Counts, setting values, changed-field names and ids. Never participant personal data. */
  readonly metadata: Record<string, unknown>;
}

interface AdminActionRow {
  id: string;
  actor_user_id: string | null;
  actor_label: string;
  action: string;
  event_id: string | null;
  registration_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ActorRow {
  user_id: string;
  display_name: string | null;
  email: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * The most recent administrative actions, newest first.
 *
 * `actor_user_id` is nullable by design: `ON DELETE SET NULL` plus a `NOT NULL actor_label`
 * snapshot is what lets an administrator be deleted without either destroying the audit history or
 * blocking the deletion (section 3.6). A null actor is a *valid* record meaning "a since-removed
 * administrator", and is rendered as such.
 *
 * The actor names come from a second query rather than a PostgREST embed: `admin_actions.actor_user_id`
 * references `auth.users`, not `admin_users`, so the two tables have no direct foreign key for
 * PostgREST to resolve. Both queries run as the same administrator, under the same policies.
 */
export async function listAdminActions(options: { limit?: number } = {}): Promise<AdminActionEntry[]> {
  await assertAdmin();

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const supabase = await createUserClient();

  const { data, error } = await supabase
    .from('admin_actions')
    .select('id, actor_user_id, actor_label, action, event_id, registration_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<AdminActionRow[]>();

  if (error) {
    console.error(JSON.stringify({ event: 'audit.read_failed', code: error.code }));
    return [];
  }

  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter(isString))];
  const actors = await loadActors(supabase, actorIds);

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: actorName(row, actors),
    createdAt: row.created_at,
    eventId: row.event_id,
    registrationId: row.registration_id,
    metadata: row.metadata ?? {},
  }));
}

function isString(value: string | null): value is string {
  return typeof value === 'string';
}

async function loadActors(
  supabase: Awaited<ReturnType<typeof createUserClient>>,
  actorIds: readonly string[],
): Promise<Map<string, ActorRow>> {
  if (actorIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id, display_name, email')
    .in('user_id', actorIds)
    .returns<ActorRow[]>();

  if (error) {
    console.error(JSON.stringify({ event: 'audit.actor_read_failed', code: error.code }));
    return new Map();
  }

  return new Map((data ?? []).map((actor) => [actor.user_id, actor]));
}

function actorName(row: AdminActionRow, actors: Map<string, ActorRow>): string {
  if (!row.actor_user_id) return `Organizador removido (${row.actor_label})`;

  const actor = actors.get(row.actor_user_id);
  return actor?.display_name ?? actor?.email ?? row.actor_label;
}

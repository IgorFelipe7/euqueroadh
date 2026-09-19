/**
 * The check-in session, as an administrator sees it.
 *
 * An ordinary table read under the administrator's own JWT, so `check_in_sessions_admin_read` is what
 * authorizes it — the same shape as every other admin read (`lib/data/admin/event.ts`). The secret key
 * holds no `SELECT` on this table and could not serve the row even if this file asked it to.
 *
 * **This module is why the session token is stored in clear** (migration 17 sets out the trade-off in
 * full). The wall is a web page: it is reloaded, reopened on a second machine, and refreshed by an
 * operator who thinks the count has stuck. Every one of those renders has to be able to produce the
 * same QR that two hundred people are already pointing their cameras at, and a hashed token could be
 * displayed exactly once.
 */
import 'server-only';

import { assertAdmin } from '@/lib/data/auth';
import { createUserClient } from '@/lib/data/supabase/user';

/** The live session, as both the admin panel and the wall render it. */
export interface CheckInSession {
  readonly id: string;
  /** The capability the QR encodes. Never logged, never exported, never rendered as text on the wall. */
  readonly token: string;
  readonly openedAt: string;
  readonly expiresAt: string;
}

interface CheckInSessionRow {
  id: string;
  token: string;
  opened_at: string;
  expires_at: string;
}

/**
 * The event's open, unexpired check-in session, or `null`.
 *
 * **Expiry is applied here as well as in the database**, and that is not redundancy for its own sake: a
 * session whose `expires_at` has passed is still `status = 'open'` in the table until an administrator
 * touches it, and `self_check_in` would refuse its token. Showing that QR on a projector would be the
 * one failure an operator cannot diagnose from the screen — every guest sees a code, and every guest
 * is told check-in is closed. Treating it as absent makes the admin panel offer `Abrir check-in`,
 * which is the action that actually fixes it.
 */
export async function getActiveCheckInSession(eventId: string): Promise<CheckInSession | null> {
  await assertAdmin();

  const supabase = await createUserClient();

  const { data, error } = await supabase
    .from('check_in_sessions')
    .select('id, token, opened_at, expires_at')
    .eq('event_id', eventId)
    .eq('status', 'open')
    .maybeSingle<CheckInSessionRow>();

  if (error) {
    // The provider's code stays in the log; the caller gets "no session" and the panel offers to open
    // one. The token is never in this line.
    console.error(JSON.stringify({ event: 'admin.check_in_session_read_failed', code: error.code }));
    return null;
  }

  if (!data) return null;
  if (Date.parse(data.expires_at) <= Date.now()) return null;

  return {
    id: data.id,
    token: data.token,
    openedAt: data.opened_at,
    expiresAt: data.expires_at,
  };
}

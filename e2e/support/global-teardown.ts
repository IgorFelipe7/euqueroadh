/**
 * Leaves the local stack exactly as the suite found it.
 *
 * This is not housekeeping: `supabase/tests/pgtap/11-seed.sql` asserts that `public.admin_users` is
 * empty, that no registration is seeded and that the event is `closed` with `capacity = 0`, and
 * `09-rls.sql` counts rows through each role. A synthetic administrator, a leftover participant or
 * an event left open would fail the database suite rather than this one.
 */
import { restoreSeedState } from './database';
import { deleteTestIdentities, purgeMail } from './local';

export default async function globalTeardown(): Promise<void> {
  await deleteTestIdentities();
  await restoreSeedState();
  await purgeMail();
}

/**
 * Leaves the local stack exactly as the suite found it.
 *
 * This is not housekeeping: `supabase/tests/pgtap/11-seed.sql` asserts that `public.admin_users` is
 * empty and `09-rls.sql` counts rows through each role, so a synthetic administrator left behind
 * would fail the database suite rather than this one.
 */
import { deleteTestIdentities, purgeMail } from './local';

export default async function globalTeardown(): Promise<void> {
  await deleteTestIdentities();
  await purgeMail();
}

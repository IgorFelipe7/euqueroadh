/**
 * Fails fast, and starts from a clean slate.
 *
 * The suite reads real e-mail out of the local mail catcher and real rows out of the local
 * database; if either is missing, the resulting failures would look like application bugs. Better a
 * single explicit message naming the command that fixes it.
 */
import { withDb } from './database';
import { LOCAL, deleteTestIdentities, purgeMail } from './local';

export default async function globalSetup(): Promise<void> {
  try {
    await withDb((db) => db.query('select 1'));
  } catch (error) {
    throw new Error(
      `Cannot reach the local database at ${LOCAL.dbUrl}. Run \`npx supabase start\` first.\n${String(error)}`,
    );
  }

  try {
    await purgeMail();
  } catch (error) {
    throw new Error(
      `Cannot reach the local mail catcher at ${LOCAL.mailUrl}. Run \`npx supabase start\` first.\n${String(error)}`,
    );
  }

  // Leftovers from an interrupted run would be read as this run's state, and would fail the pgTAP
  // suite's global counts the next time it runs.
  await deleteTestIdentities();
}

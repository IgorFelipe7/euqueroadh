// Shared harness for the database tests that pgTAP cannot express: the ones that need REAL
// concurrent connections, and the ones that need the actual HTTP Data API.
//
// Everything here targets the LOCAL Supabase stack started by `npx supabase start`.  Nothing in
// this directory may ever point at a remote project.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Client } = pg;
export type Db = pg.Client;

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Slug prefix that marks every event these suites create, so cleanup can be exact. */
export const TEST_SLUG_PREFIX = 'test-node-';
/** Every synthetic identity uses this domain. No real address is ever used. */
export const TEST_EMAIL_DOMAIN = 'teste.local';

export function dbUrl(): string {
  return process.env.SUPABASE_DB_URL ?? DEFAULT_DB_URL;
}

if (!/127\.0\.0\.1|localhost/.test(dbUrl())) {
  throw new Error(`Refusing to run: ${dbUrl()} is not a local database.`);
}

export async function connect(): Promise<Db> {
  const client = new Client({ connectionString: dbUrl() });
  await client.connect();
  return client;
}

/** Binds a connection to an administrator identity the way PostgREST binds a request's JWT. */
export async function actAs(db: Db, userId: string | null): Promise<void> {
  const claims = userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : '';
  await db.query('select set_config($1, $2, false)', ['request.jwt.claims', claims]);
}

export type LocalKeys = {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
};

let cachedKeys: LocalKeys | undefined;

/** Reads the local stack's URLs and keys from the CLI, so nothing is hard-coded. */
export function localKeys(): LocalKeys {
  if (cachedKeys) return cachedKeys;

  if (process.env.SUPABASE_API_URL && process.env.SUPABASE_PUBLISHABLE_KEY &&
      process.env.SUPABASE_SECRET_KEY) {
    cachedKeys = {
      apiUrl: process.env.SUPABASE_API_URL,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      secretKey: process.env.SUPABASE_SECRET_KEY,
    };
    return cachedKeys;
  }

  // The CLI's entry point is a plain JS file, so it runs under this same Node binary.  Spawning
  // `npx` would mean spawning a .cmd on Windows, which Node refuses without a shell — and passing
  // arguments through a shell is both deprecated and an injection surface.
  const cli = fileURLToPath(new URL('../../../node_modules/supabase/dist/supabase.js', import.meta.url));
  const raw = execFileSync(process.execPath, [cli, 'status', '-o', 'json'], {
    encoding: 'utf8',
  });
  const status = JSON.parse(raw) as Record<string, string>;

  cachedKeys = {
    apiUrl: status.API_URL,
    publishableKey: status.PUBLISHABLE_KEY,
    secretKey: status.SECRET_KEY,
  };
  return cachedKeys;
}

export type EventOptions = {
  capacity: number;
  state?: 'open' | 'closed';
  waitlistEnabled?: boolean;
};

export async function createEvent(db: Db, options: EventOptions): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into public.events
       (id, slug, title, starts_at, capacity, registration_state, waitlist_enabled, is_active)
     values ($1, $2, 'Evento de teste', now() + interval '30 days', $3, $4, $5, false)`,
    [
      id,
      `${TEST_SLUG_PREFIX}${id}`,
      options.capacity,
      options.state ?? 'open',
      options.waitlistEnabled ?? true,
    ],
  );
  return id;
}

export async function createAdmin(db: Db, label: string, active = true): Promise<string> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  await db.query(
    'insert into public.admin_users (user_id, email, display_name, is_active) values ($1, $2, $3, $4)',
    [id, email, label, active],
  );
  return id;
}

/** Distinct, shape-valid Brazilian mobile numbers: +55 DD 9 NNNNNNNN. */
export function phone(n: number): string {
  return `+55199${String(n).padStart(8, '0')}`;
}

/**
 * Removes everything these suites create.  The pgTAP suites assert on global counts (one seeded
 * event, no registrations, no audit rows), so leftovers here would break them.  Audit rows go
 * first: admin_actions.event_id is ON DELETE SET NULL, so deleting events would orphan them.
 *
 * THE SUITE FILES MUST NOT RUN IN PARALLEL.  Every file shares this one namespace, so one file's
 * cleanup deletes another file's fixtures mid-scenario — which surfaces as `event_not_found` and
 * `not_authorized` in whichever test happened to be running.  `npm run db:test:node` passes
 * `--test-concurrency=1` for that reason; Node's default runs the files concurrently.
 */
export async function cleanup(db: Db): Promise<void> {
  await db.query(
    `delete from public.admin_actions a
      where a.actor_user_id in (select u.id from auth.users u where u.email like $1)
         or a.event_id in (select e.id from public.events e where e.slug like $2)`,
    [`%@${TEST_EMAIL_DOMAIN}`, `${TEST_SLUG_PREFIX}%`],
  );
  await db.query('delete from public.events where slug like $1', [`${TEST_SLUG_PREFIX}%`]);
  await db.query('delete from auth.users where email like $1', [`%@${TEST_EMAIL_DOMAIN}`]);
}

export type CallResult = {
  ok: boolean;
  rows: Record<string, unknown>[];
  sqlstate?: string;
  message?: string;
};

/** Runs one statement and reports the failure instead of throwing, so a race can be inspected. */
export async function tryCall(
  db: Db,
  text: string,
  params: unknown[] = [],
): Promise<CallResult> {
  try {
    const result = await db.query(text, params);
    return { ok: true, rows: result.rows as Record<string, unknown>[] };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { ok: false, rows: [], sqlstate: e.code, message: e.message };
  }
}

export async function counters(
  db: Db,
  eventId: string,
): Promise<{ confirmed: number; waitlist: number; capacity: number; seq: number }> {
  const { rows } = await db.query<{
    confirmed_count: number;
    waitlist_count: number;
    capacity: number;
    waitlist_seq: number;
  }>(
    'select confirmed_count, waitlist_count, capacity, waitlist_seq from public.events where id = $1',
    [eventId],
  );
  return {
    confirmed: rows[0].confirmed_count,
    waitlist: rows[0].waitlist_count,
    capacity: rows[0].capacity,
    seq: rows[0].waitlist_seq,
  };
}

/** The executable form of I2. Must always be empty; it is checked after every scenario. */
export async function counterDrift(db: Db, adminId: string): Promise<number> {
  await actAs(db, adminId);
  const { rows } = await db.query('select * from public.verify_event_counters()');
  return rows.length;
}

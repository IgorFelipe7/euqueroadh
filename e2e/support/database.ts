/**
 * The end-to-end suite's view of the LOCAL database, and the fixtures the public registration
 * tests need.
 *
 * Separate from `local.ts` for one practical reason: nothing here imports `@playwright/test`, so
 * `prepare-event.mts` can run the same fixture code from a plain Node process before the
 * application is even built. `local.ts` re-exports `withDb` so existing specs are untouched.
 *
 * Every function refuses to run against anything but 127.0.0.1. No remote project, no production
 * credential, and every participant these fixtures create is synthetic.
 */
import pg from 'pg';

const { Client } = pg;

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export function assertLocal(label: string, url: string): string {
  if (!/^(postgresql|https?):\/\/(?:[^@/]*@)?(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
    throw new Error(`Refusing to run: ${label} (${url}) is not a local address.`);
  }
  return url;
}

export const DB_URL = assertLocal(
  'SUPABASE_DB_URL',
  process.env.SUPABASE_DB_URL ?? DEFAULT_DB_URL,
);

export async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/* ------------------------------------------------------------------------------------------------
 * The event under test
 * ---------------------------------------------------------------------------------------------- */

/**
 * The seeded event's fail-safe state (DATABASE-SECURITY.md section 6.6). `11-seed.sql` asserts every
 * one of these values, so the suite must hand the database back in exactly this condition or it
 * fails a suite that is not even running.
 */
export const SEED_STATE = {
  capacity: 0,
  waitlistEnabled: true,
  state: 'closed',
} as const;

export interface EventFixture {
  readonly capacity: number;
  readonly waitlistEnabled: boolean;
  readonly state: 'open' | 'closed';
}

/**
 * Puts the single active event into a known condition and removes every registration against it.
 *
 * One `UPDATE`, because `events_open_requires_capacity` is checked at the end of the statement:
 * setting the capacity and the state in separate statements would transiently violate it in one
 * direction or the other.
 */
export async function resetActiveEvent(fixture: EventFixture): Promise<string> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      'select id from public.events where is_active limit 1',
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('No active event is seeded. Run `npx supabase db reset` first.');

    // The counter trigger is the single writer of confirmed_count and waitlist_count, so deleting
    // the rows is what drives them back to zero — the fixture never writes a counter by hand.
    await db.query('delete from public.registrations where event_id = $1', [id]);
    await db.query(
      `update public.events
          set capacity = $2,
              waitlist_enabled = $3,
              registration_state = $4,
              waitlist_seq = 0
        where id = $1`,
      [id, fixture.capacity, fixture.waitlistEnabled, fixture.state],
    );

    return id;
  });
}

/** Hands the database back exactly as the seed left it. */
export async function restoreSeedState(): Promise<void> {
  await resetActiveEvent({
    capacity: SEED_STATE.capacity,
    waitlistEnabled: SEED_STATE.waitlistEnabled,
    state: SEED_STATE.state,
  });
}

/** Changes the settings without touching the registrations already recorded. */
export async function updateActiveEvent(patch: Partial<EventFixture>): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `update public.events
          set capacity = coalesce($1, capacity),
              waitlist_enabled = coalesce($2, waitlist_enabled),
              registration_state = coalesce($3, registration_state)
        where is_active`,
      [patch.capacity ?? null, patch.waitlistEnabled ?? null, patch.state ?? null],
    );
  });
}

/**
 * Sets the active event's online eligibility floor (migration 11).
 *
 * The seeded value is 12. A suite that changes it must put it back, because `11-seed.sql` asserts
 * the seeded value and would fail a run it is not even part of.
 */
export async function setMinimumAge(minAge: number | null): Promise<void> {
  await withDb((db) =>
    db.query('update public.events set min_age = $1 where is_active', [minAge]),
  );
}

export async function activeEventId(): Promise<string> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      'select id from public.events where is_active limit 1',
    );
    if (!rows[0]) throw new Error('No active event is seeded.');
    return rows[0].id;
  });
}

/**
 * A distinct, shape-valid Brazilian mobile number for the DDD of Hortolândia. Synthetic by
 * construction: `19 9 0000 00NN` is not an allocated range, and no real person is ever used.
 */
export function syntheticPhone(n: number): { e164: string; digits: string } {
  const digits = `199${String(n).padStart(8, '0')}`;
  return { e164: `+55${digits}`, digits };
}

/** A synthetic participant name. Accented and multi-word, so the storage path is exercised properly. */
export function syntheticName(n: number): string {
  return `Participante de Teste ${n}`;
}

/**
 * Occupies seats through the real allocation function, so the counters, the ranks and the
 * constraints all move exactly as they would for a real registration. Never an `INSERT`.
 */
export async function occupySeats(count: number, startAt = 900): Promise<void> {
  const id = await activeEventId();

  await withDb(async (db) => {
    for (let index = 0; index < count; index += 1) {
      const { rows } = await db.query<{ outcome: string }>(
        'select outcome from public.register_for_event($1, $2, $3::smallint, $4)',
        [id, syntheticName(startAt + index), 20, syntheticPhone(startAt + index).e164],
      );
      if (rows[0]?.outcome !== 'confirmed') {
        throw new Error(
          `The fixture could not occupy seat ${index + 1}: the event answered "${rows[0]?.outcome}".`,
        );
      }
    }
  });
}

export interface RegistrationRow {
  readonly status: string;
  readonly fullName: string;
  readonly age: number;
  readonly waitlistRank: number | null;
}

/** Every non-cancelled registration held against a phone number, in creation order. */
export async function registrationsFor(e164: string): Promise<RegistrationRow[]> {
  return withDb(async (db) => {
    const { rows } = await db.query<{
      status: string;
      full_name: string;
      age: number;
      waitlist_rank: number | null;
    }>(
      `select status, full_name, age, waitlist_rank
         from public.registrations
        where phone_e164 = $1 and status <> 'cancelled'
        order by created_at`,
      [e164],
    );

    return rows.map((row) => ({
      status: row.status,
      fullName: row.full_name,
      age: row.age,
      waitlistRank: row.waitlist_rank,
    }));
  });
}

/** How many rows exist against the active event, cancelled ones included. */
export async function countRegistrations(): Promise<number> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ total: string }>(
      `select count(*)::text as total from public.registrations
        where event_id = (select id from public.events where is_active limit 1)`,
    );
    return Number(rows[0].total);
  });
}

// The public registration gateway against the REAL local database.
//
// `register_for_event` is never mocked here.  What is exercised is precisely the call the Data
// Access Layer makes — `supabase-js`, the secret key, `rpc('register_for_event', …)`, over HTTP,
// through PostgREST — so that the shape of what comes back is proven rather than assumed.  The
// mapping from that shape to a domain outcome lives in `lib/data/public.ts`; the unit suite proves
// the mapping, and this suite proves the shape it maps.
//
// Every scenario creates its own event.  A partial unique index allows at most one *active* event,
// so these are created inactive — the RPC does not care, and the seeded production event is left
// untouched in its fail-safe state, which `11-seed.sql` asserts.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { cleanup, connect, counters, createEvent, localKeys, phone, type Db } from './helpers.mts';

const keys = localKeys();

/** Configured exactly as `lib/data/supabase/secret.ts` configures it: no session, ever. */
const secret: SupabaseClient = createClient(keys.apiUrl, keys.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

type AllocationRow = {
  outcome: string;
  status: string | null;
  registration_id: string | null;
};

/** The DAL's call, verbatim. */
async function register(
  eventId: string,
  fullName: string,
  age: number,
  phoneE164: string,
): Promise<AllocationRow> {
  const { data, error } = await secret.rpc('register_for_event', {
    p_event_id: eventId,
    p_full_name: fullName,
    p_age: age,
    p_phone_e164: phoneE164,
  });

  assert.equal(error, null, `the RPC failed: ${error?.message ?? ''}`);
  assert.ok(Array.isArray(data), 'a RETURNS TABLE function must arrive as an array of rows');
  assert.equal(data.length, 1, 'exactly one row, always');

  return data[0] as AllocationRow;
}

async function activeRows(db: Db, eventId: string): Promise<{ status: string; rank: number | null }[]> {
  const { rows } = await db.query<{ status: string; waitlist_rank: number | null }>(
    `select status, waitlist_rank from public.registrations
      where event_id = $1 and status <> 'cancelled' order by created_at`,
    [eventId],
  );
  return rows.map((row) => ({ status: row.status, rank: row.waitlist_rank }));
}

async function withDb(fn: (db: Db) => Promise<void>): Promise<void> {
  const db = await connect();
  try {
    await fn(db);
  } finally {
    await cleanup(db);
    await db.end();
  }
}

test('an open event with a free seat confirms the registration', async () => {
  await withDb(async (db) => {
    const eventId = await createEvent(db, { capacity: 2 });

    const result = await register(eventId, 'Ana Souza', 17, phone(1));

    assert.equal(result.outcome, 'confirmed');
    assert.equal(result.status, 'confirmed');
    assert.match(result.registration_id ?? '', /^[0-9a-f-]{36}$/);

    assert.deepEqual(await activeRows(db, eventId), [{ status: 'confirmed', rank: null }]);
    // The trigger is the single writer of the counters; nothing in TypeScript touches them.
    assert.deepEqual(await counters(db, eventId), {
      confirmed: 1,
      waitlist: 0,
      capacity: 2,
      seq: 0,
    });
  });
});

test('a full event with the waitlist on waitlists, and ranks strictly increase', async () => {
  await withDb(async (db) => {
    const eventId = await createEvent(db, { capacity: 1, waitlistEnabled: true });

    assert.equal((await register(eventId, 'Ana Souza', 17, phone(1))).outcome, 'confirmed');

    const first = await register(eventId, 'Bruno Lima', 19, phone(2));
    const second = await register(eventId, 'Carla Dias', 22, phone(3));

    assert.equal(first.outcome, 'waitlisted');
    assert.equal(first.status, 'waitlisted');
    assert.equal(second.outcome, 'waitlisted');

    assert.deepEqual(await activeRows(db, eventId), [
      { status: 'confirmed', rank: null },
      { status: 'waitlisted', rank: 1 },
      { status: 'waitlisted', rank: 2 },
    ]);
    assert.deepEqual(await counters(db, eventId), {
      confirmed: 1,
      waitlist: 2,
      capacity: 1,
      seq: 2,
    });
  });
});

test('a full event with the waitlist off refuses and stores nothing', async () => {
  await withDb(async (db) => {
    const eventId = await createEvent(db, { capacity: 1, waitlistEnabled: false });

    await register(eventId, 'Ana Souza', 17, phone(1));
    const result = await register(eventId, 'Bruno Lima', 19, phone(2));

    assert.equal(result.outcome, 'full');
    assert.equal(result.status, null);
    assert.equal(result.registration_id, null);

    assert.deepEqual(await activeRows(db, eventId), [{ status: 'confirmed', rank: null }]);
  });
});

test('a closed event refuses and stores nothing, whatever its capacity', async () => {
  await withDb(async (db) => {
    const eventId = await createEvent(db, { capacity: 50, state: 'closed' });

    const result = await register(eventId, 'Ana Souza', 17, phone(1));

    assert.equal(result.outcome, 'closed');
    assert.equal(result.status, null);
    assert.deepEqual(await activeRows(db, eventId), []);
  });
});

test('the same person twice yields already_registered and exactly one row', async () => {
  await withDb(async (db) => {
    const eventId = await createEvent(db, { capacity: 10 });
    const number = phone(1);

    const first = await register(eventId, 'Ana Souza', 17, number);
    // A different SPELLING and a different age, but the same person. Migration 16 keys the duplicate
    // rule on the canonical name and deliberately leaves age out of it, so an age typo on a second
    // attempt is answered `already_registered` rather than being given a second seat.
    const second = await register(eventId, '  ana   SOUZA ', 41, number);

    assert.equal(first.outcome, 'confirmed');
    assert.equal(second.outcome, 'already_registered');
    assert.equal(second.status, 'confirmed');

    assert.deepEqual(await activeRows(db, eventId), [{ status: 'confirmed', rank: null }]);

    // The stored row is never rewritten by a resubmission: anyone who knows a phone number would
    // otherwise be able to overwrite that person's registration (PRODUCT-SPEC.md § 9).
    const { rows } = await db.query<{ full_name: string; age: number }>(
      'select full_name, age from public.registrations where event_id = $1',
      [eventId],
    );
    assert.deepEqual(rows, [{ full_name: 'Ana Souza', age: 17 }]);
  });
});

test('different people may share one telephone number', async () => {
  // The household case, and the reason the duplicate rule moved from the phone to the person: the
  // audience is `PARA JOVENS`, and a family arriving together routinely has one phone between them.
  await withDb(async (db) => {
    const eventId = await createEvent(db, { capacity: 10 });
    const number = phone(1);

    assert.equal((await register(eventId, 'Ana Souza', 15, number)).outcome, 'confirmed');
    assert.equal((await register(eventId, 'Bruno Souza', 17, number)).outcome, 'confirmed');
    // A first name that collides with an existing one is still a different person.
    assert.equal((await register(eventId, 'Ana Beatriz Souza', 13, number)).outcome, 'confirmed');

    const { rows } = await db.query<{ full_name: string }>(
      `select full_name from public.registrations
        where event_id = $1 and phone_e164 = $2 and status <> 'cancelled'
        order by created_at`,
      [eventId, number],
    );

    assert.deepEqual(
      rows.map((row) => row.full_name),
      ['Ana Souza', 'Bruno Souza', 'Ana Beatriz Souza'],
      'all three are registered against the one number',
    );
  });
});

test('a duplicate of a waitlisted registration echoes the waitlisted status', async () => {
  await withDb(async (db) => {
    const eventId = await createEvent(db, { capacity: 1, waitlistEnabled: true });
    const number = phone(2);

    await register(eventId, 'Ana Souza', 17, phone(1));
    await register(eventId, 'Bruno Lima', 19, number);

    const again = await register(eventId, 'Bruno Lima', 19, number);

    assert.equal(again.outcome, 'already_registered');
    assert.equal(again.status, 'waitlisted');
    assert.equal((await activeRows(db, eventId)).length, 2);
  });
});

test('a duplicate is answered before the closed and full branches', async () => {
  // Precedence matters: a person who taps submit twice must get a coherent answer even if the
  // event filled or closed between the two taps (PRODUCT-SPEC.md § 6).
  await withDb(async (db) => {
    const eventId = await createEvent(db, { capacity: 5 });
    const number = phone(1);

    await register(eventId, 'Ana Souza', 17, number);
    await db.query("update public.events set registration_state = 'closed' where id = $1", [
      eventId,
    ]);

    assert.equal((await register(eventId, 'Ana Souza', 17, number)).outcome, 'already_registered');
  });
});

test('a cancelled registration does not block re-registration', async () => {
  await withDb(async (db) => {
    const eventId = await createEvent(db, { capacity: 5 });
    const number = phone(1);

    await register(eventId, 'Ana Souza', 17, number);
    await db.query(
      "update public.registrations set status = 'cancelled' where event_id = $1",
      [eventId],
    );

    const again = await register(eventId, 'Ana Souza', 17, number);

    assert.equal(again.outcome, 'confirmed');
    assert.deepEqual(await activeRows(db, eventId), [{ status: 'confirmed', rank: null }]);
  });
});

test('an event that does not exist raises rather than inventing an outcome', async () => {
  const { data, error } = await secret.rpc('register_for_event', {
    p_event_id: '00000000-0000-4000-8000-000000000000',
    p_full_name: 'Ana Souza',
    p_age: 17,
    p_phone_e164: phone(1),
  });

  assert.equal(data, null);
  assert.notEqual(error, null);
  // The DAL turns this into `unavailable` and a generic pt-BR sentence; nothing of it is rendered.
  assert.match(error?.message ?? '', /event_not_found/);
});

/*
 * The online eligibility policy (migration 11).
 *
 * Exercised over HTTP through PostgREST, exactly as the Server Action reaches it, because the Zod
 * schema in `lib/domain/schemas.ts` is defence in depth and this is the layer that has to hold when
 * someone POSTs straight at the endpoint with the browser's validation removed.
 */
test('the eligibility floor is enforced by the database, not only by the form', async () => {
  const db = await connect();

  try {
    const eventId = await createEvent(db, { capacity: 10 });
    await db.query('update public.events set min_age = 12 where id = $1', [eventId]);

    const refused = await register(eventId, 'Menor de idade', 11, phone(7011));
    assert.equal(refused.outcome, 'age_not_eligible');
    assert.equal(refused.registration_id, null);
    assert.deepEqual(await activeRows(db, eventId), [], 'nothing is stored for an ineligible age');
    assert.equal((await counters(db, eventId)).confirmed, 0);

    const atFloor = await register(eventId, 'No limite', 12, phone(7012));
    assert.equal(atFloor.outcome, 'confirmed', 'the floor is inclusive');

    const teenager = await register(eventId, 'Adolescente', 16, phone(7016));
    assert.equal(teenager.outcome, 'confirmed', 'a 16-year-old uses the normal flow');

    assert.equal((await counters(db, eventId)).confirmed, 2);
    assert.equal((await counters(db, eventId)).waitlist, 0);
  } finally {
    await cleanup(db);
    await db.end();
  }
});

test('eligibility is decided before the open/closed switch', async () => {
  const db = await connect();

  try {
    const eventId = await createEvent(db, { capacity: 10, state: 'closed' });
    await db.query('update public.events set min_age = 12 where id = $1', [eventId]);

    // A ten-year-old must read the real reason, not "inscrições encerradas" — which would invite
    // them to come back later, when the answer would still be no.
    const refused = await register(eventId, 'Muito novo', 9, phone(7009));
    assert.equal(refused.outcome, 'age_not_eligible');
    assert.deepEqual(await activeRows(db, eventId), []);
  } finally {
    await cleanup(db);
    await db.end();
  }
});

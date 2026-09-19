// The tests pgTAP cannot express: real concurrent connections against the local database.
//
// pgTAP runs everything in one transaction on one connection, so it can prove the allocation logic
// but not the RACE the logic exists to defeat.  These scenarios open genuinely parallel connections
// and assert the invariants afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  actAs,
  cleanup,
  connect,
  counterDrift,
  counters,
  createAdmin,
  createEvent,
  phone,
  tryCall,
  type CallResult,
  type Db,
} from './helpers.mts';

const REGISTER_SQL =
  'select outcome, status, registration_id from public.register_for_event($1, $2, $3::smallint, $4)';

const DEADLOCK = '40P01';

async function openConnections(count: number): Promise<Db[]> {
  return Promise.all(Array.from({ length: count }, () => connect()));
}

async function closeAll(clients: Db[]): Promise<void> {
  await Promise.all(clients.map((c) => c.end()));
}

function outcomes(results: CallResult[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const r of results) {
    const key = r.ok ? String(r.rows[0]?.outcome) : `ERROR:${r.sqlstate}`;
    tally[key] = (tally[key] ?? 0) + 1;
  }
  return tally;
}

// ---------------------------------------------------------------------------
// The decisive test: 50 simultaneous registrations for 10 seats.
// ---------------------------------------------------------------------------
async function lastSeatScenario(waitlistEnabled: boolean) {
  const control = await connect();
  await cleanup(control);

  const admin = await createAdmin(control, 'organizador');
  const eventId = await createEvent(control, {
    capacity: 10,
    state: 'open',
    waitlistEnabled,
  });

  const clients = await openConnections(50);
  try {
    // Fire all fifty at once: they queue on the event row lock, not on each other's snapshots.
    const results = await Promise.all(
      clients.map((client, i) =>
        tryCall(client, REGISTER_SQL, [eventId, `Participante ${i + 1}`, 20, phone(i + 1)]),
      ),
    );

    const tally = outcomes(results);
    const failures = results.filter((r) => !r.ok);
    assert.deepEqual(
      failures.map((f) => `${f.sqlstate}: ${f.message}`),
      [],
      'no request may fail: a rejected outcome is a return value, never an error',
    );
    assert.equal(
      results.filter((r) => r.sqlstate === DEADLOCK).length,
      0,
      'zero deadlocks',
    );

    assert.equal(tally.confirmed, 10, 'exactly ten seats were issued');
    if (waitlistEnabled) {
      assert.equal(tally.waitlisted, 40, 'the other forty were queued');
      assert.equal(tally.full, undefined, 'nobody was refused while the waitlist was on');
    } else {
      assert.equal(tally.full, 40, 'the other forty were refused');
      assert.equal(tally.waitlisted, undefined, 'nobody was queued while the waitlist was off');
    }

    const rows = await control.query<{ status: string; count: string }>(
      'select status::text, count(*)::text from public.registrations where event_id = $1 group by status',
      [eventId],
    );
    const stored = Object.fromEntries(rows.rows.map((r) => [r.status, Number(r.count)]));
    assert.equal(stored.confirmed, 10, 'ten confirmed rows exist');
    assert.equal(stored.waitlisted ?? 0, waitlistEnabled ? 40 : 0, 'waitlisted rows match');
    assert.equal(stored.cancelled ?? 0, 0, 'no cancelled rows appeared from nowhere');

    const c = await counters(control, eventId);
    assert.equal(c.confirmed, 10, 'confirmed_count is 10');
    assert.equal(c.waitlist, waitlistEnabled ? 40 : 0, 'waitlist_count matches');
    assert.ok(c.confirmed <= c.capacity, 'I1: confirmed_count never exceeded capacity');

    const ranks = await control.query<{ waitlist_rank: number }>(
      `select waitlist_rank from public.registrations
        where event_id = $1 and waitlist_rank is not null order by waitlist_rank`,
      [eventId],
    );
    const values = ranks.rows.map((r) => r.waitlist_rank);
    const expected = waitlistEnabled ? Array.from({ length: 40 }, (_, i) => i + 1) : [];
    assert.deepEqual(values, expected, 'I4: ranks are exactly 1..N, with no gap and no duplicate');
    assert.equal(new Set(values).size, values.length, 'and no rank is shared');
    assert.equal(
      c.seq,
      waitlistEnabled ? 40 : 0,
      'the monotonic sequence advanced exactly once per queued person',
    );

    assert.equal(await counterDrift(control, admin), 0, 'I2: reconciliation reports no drift');
  } finally {
    await closeAll(clients);
    await cleanup(control);
    await control.end();
  }
}

test('50 concurrent registrations for 10 seats, waitlist ON', async () => {
  await lastSeatScenario(true);
});

test('50 concurrent registrations for 10 seats, waitlist OFF', async () => {
  await lastSeatScenario(false);
});

// ---------------------------------------------------------------------------
// The same phone, twenty times, simultaneously.
// ---------------------------------------------------------------------------
test('concurrent duplicate submissions create exactly one registration', async () => {
  const control = await connect();
  await cleanup(control);

  const admin = await createAdmin(control, 'organizador');
  const eventId = await createEvent(control, { capacity: 5, state: 'open', waitlistEnabled: true });
  const sharedPhone = phone(4242);

  const clients = await openConnections(20);
  try {
    const results = await Promise.all(
      clients.map((client, i) =>
        tryCall(client, REGISTER_SQL, [eventId, `Pessoa ${i + 1}`, 20, sharedPhone]),
      ),
    );

    const tally = outcomes(results);
    assert.deepEqual(
      results.filter((r) => !r.ok).map((f) => `${f.sqlstate}: ${f.message}`),
      [],
      'the unique index must never surface as an application error: the serialized duplicate ' +
        'check is the graceful path, the index is only the backstop',
    );
    assert.equal(tally.confirmed, 1, 'exactly one caller obtained the allocation');
    assert.equal(tally.already_registered, 19, 'every later caller got the duplicate outcome');

    const rows = await control.query<{ count: string }>(
      `select count(*)::text from public.registrations
        where event_id = $1 and phone_e164 = $2 and status <> 'cancelled'`,
      [eventId, sharedPhone],
    );
    assert.equal(Number(rows.rows[0].count), 1, 'I3: exactly one active registration exists');

    const c = await counters(control, eventId);
    assert.equal(c.confirmed, 1, 'the counter agrees');
    assert.equal(c.waitlist, 0, 'nobody was queued');
    assert.equal(await counterDrift(control, admin), 0, 'I2: no drift');
  } finally {
    await closeAll(clients);
    await cleanup(control);
    await control.end();
  }
});

// ---------------------------------------------------------------------------
// Mixed operations under contention — the proof of I6.
//
// Every operation that touches both tables locks events first.  If any pathway did the reverse,
// this scenario would deadlock: registrations, promotions, cancellations and settings changes all
// contend for the same event row while the counter trigger takes it from the other direction.
// ---------------------------------------------------------------------------
test('mixed concurrent operations never deadlock (I6)', async () => {
  const control = await connect();
  await cleanup(control);

  const admin = await createAdmin(control, 'organizador');
  const eventId = await createEvent(control, { capacity: 25, state: 'open', waitlistEnabled: true });

  const ROUNDS = 6;
  const REGISTRARS = 24;
  const PROMOTERS = 4;
  const CANCELLERS = 4;
  const SETTERS = 3;

  const registrars = await openConnections(REGISTRARS);
  const promoters = await openConnections(PROMOTERS);
  const cancellers = await openConnections(CANCELLERS);
  const setters = await openConnections(SETTERS);

  for (const client of [...promoters, ...cancellers, ...setters]) {
    await actAs(client, admin);
  }

  const allResults: CallResult[] = [];

  try {
    for (let round = 0; round < ROUNDS; round++) {
      const work: Promise<CallResult>[] = [];

      registrars.forEach((client, i) => {
        const n = round * REGISTRARS + i + 1;
        work.push(tryCall(client, REGISTER_SQL, [eventId, `Participante ${n}`, 20, phone(n)]));
      });

      promoters.forEach((client) => {
        work.push(
          tryCall(client, 'select registration_id from public.promote_from_waitlist($1, $2)', [
            eventId,
            2,
          ]),
        );
      });

      cancellers.forEach((client, i) => {
        // Cancels whichever confirmed row is currently the i-th oldest, if any.  Chosen inside the
        // same statement so it races with the registrations above.
        work.push(
          tryCall(
            client,
            `select public.cancel_registration(r.id)
               from (select id from public.registrations
                      where event_id = $1 and status = 'confirmed'
                      order by created_at offset $2 limit 1) r`,
            [eventId, i],
          ),
        );
      });

      setters.forEach((client, i) => {
        work.push(
          tryCall(
            client,
            `select capacity from public.update_event_settings(
               $1, $2, $3, 'open'::public.registration_state, null::boolean,
               (select settings_version from public.events where id = $1))`,
            [eventId, i % 2 === 0 ? 25 : 30, round % 2 === 0],
          ),
        );
      });

      allResults.push(...(await Promise.all(work)));
    }

    const deadlocks = allResults.filter((r) => r.sqlstate === DEADLOCK);
    assert.deepEqual(deadlocks.map((d) => d.message), [], 'zero deadlocks under real contention');

    // The only failures a correct system may produce here are the two documented named errors:
    // a lost optimistic-concurrency race between two settings writers, and a capacity change that
    // would strand confirmed participants.
    const unexpected = allResults.filter(
      (r) =>
        !r.ok &&
        !(r.sqlstate === '40001' && r.message?.includes('settings_conflict')) &&
        !(r.sqlstate === '23514' && r.message?.includes('capacity_below_confirmed')),
    );
    assert.deepEqual(
      unexpected.map((u) => `${u.sqlstate}: ${u.message}`),
      [],
      'no unexpected error escaped',
    );

    const c = await counters(control, eventId);
    assert.ok(
      c.confirmed <= c.capacity,
      `I1 held under contention: ${c.confirmed} confirmed, capacity ${c.capacity}`,
    );
    assert.equal(await counterDrift(control, admin), 0, 'I2: no counter drift under contention');

    const dupes = await control.query<{ count: string }>(
      `select count(*)::text from (
         select waitlist_rank from public.registrations
          where event_id = $1 and waitlist_rank is not null
          group by waitlist_rank having count(*) > 1) d`,
      [eventId],
    );
    assert.equal(Number(dupes.rows[0].count), 0, 'I4: no duplicate waitlist rank was issued');

    const versions = await control.query<{ settings_version: string }>(
      'select settings_version::text from public.events where id = $1',
      [eventId],
    );
    assert.ok(
      Number(versions.rows[0].settings_version) > 1,
      'settings mutations did advance the token, so the conflicts above were real',
    );

    const audits = await control.query<{ count: string }>(
      `select count(*)::text from public.admin_actions
        where event_id = $1 and action = 'settings.updated'`,
      [eventId],
    );
    assert.equal(
      Number(audits.rows[0].count),
      Number(versions.rows[0].settings_version) - 1,
      'I9: exactly one audit row per successful settings change, no more and no fewer',
    );
  } finally {
    await closeAll([...registrars, ...promoters, ...cancellers, ...setters]);
    await cleanup(control);
    await control.end();
  }
});

// ---------------------------------------------------------------------------
// Two administrators removing each other at the same instant.
// ---------------------------------------------------------------------------
test('two administrators cannot remove each other into an empty team', async () => {
  const control = await connect();
  await cleanup(control);

  const first = await createAdmin(control, 'organizador-a');
  const second = await createAdmin(control, 'organizador-b');

  const [connA, connB] = await openConnections(2);
  try {
    await actAs(connA, first);
    await actAs(connB, second);

    const results = await Promise.all([
      tryCall(connA, 'select public.remove_admin_user($1)', [second]),
      tryCall(connB, 'select public.remove_admin_user($1)', [first]),
    ]);

    assert.equal(
      results.filter((r) => r.sqlstate === DEADLOCK).length,
      0,
      'no deadlock between the two revocations',
    );

    const succeeded = results.filter((r) => r.ok).length;
    assert.equal(succeeded, 1, 'exactly one revocation succeeded');
    assert.ok(
      results.some((r) => !r.ok && r.message?.includes('last_active_admin')),
      'the other was refused because it would have left no active administrator',
    );

    const remaining = await control.query<{ count: string }>(
      'select count(*)::text from public.admin_users where is_active',
    );
    assert.equal(Number(remaining.rows[0].count), 1, 'an active administrator remains');
  } finally {
    await closeAll([connA, connB]);
    await cleanup(control);
    await control.end();
  }
});

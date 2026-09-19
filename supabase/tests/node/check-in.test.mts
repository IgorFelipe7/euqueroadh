// Self check-in under real concurrency, and the one cross-language claim the repository makes.
//
// pgTAP proves the check-in logic on one connection inside one transaction (`14-check-in.sql`). Two
// things it structurally cannot prove live here:
//
//   1. **The races.** Two hundred guests scanning a QR in twenty minutes is a burst of parallel
//      transactions against one event row, and a check-in that double-wrote `attended_at`, lost an
//      arrival, or deadlocked against an organizer's manual mark would only ever show up this way.
//   2. **That `identityKey()` and `registration_identity_key()` agree.** One is TypeScript, one is
//      PL/pgSQL, and they decide the same question — "is this the same person?" — at registration and
//      at the door. A divergence between them is a refusal nobody can reproduce, so the two are fed
//      the same inputs here and compared.
import test from 'node:test';
import assert from 'node:assert/strict';

import { identityKey } from '../../../lib/domain/identity.ts';

import {
  cleanup,
  connect,
  createAdmin,
  createEvent,
  phone,
  tryCall,
  type CallResult,
  type Db,
} from './helpers.mts';

const REGISTER_SQL =
  'select outcome, status, registration_id from public.register_for_event($1, $2, $3::smallint, $4)';

const CHECK_IN_SQL = 'select result from public.self_check_in($1, $2, $3, $4::smallint)';

const OPEN_SESSION_SQL = 'select token from public.open_check_in_session($1)';

const DEADLOCK = '40P01';

async function openConnections(count: number): Promise<Db[]> {
  return Promise.all(Array.from({ length: count }, () => connect()));
}

async function closeAll(clients: Db[]): Promise<void> {
  await Promise.all(clients.map((c) => c.end()));
}

function results(calls: CallResult[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const call of calls) {
    const key = call.ok ? String(call.rows[0]?.result) : `ERROR:${call.sqlstate}`;
    tally[key] = (tally[key] ?? 0) + 1;
  }
  return tally;
}

/** Opens a session as the given administrator and returns its token. */
async function openSession(db: Db, eventId: string, adminId: string): Promise<string> {
  await db.query('select set_config($1, $2, false)', [
    'request.jwt.claims',
    JSON.stringify({ sub: adminId, role: 'authenticated' }),
  ]);

  const { rows } = await db.query<{ token: string }>(OPEN_SESSION_SQL, [eventId]);
  return rows[0].token;
}

/* ================================================================================================
 * Concurrency
 * ============================================================================================== */

test('forty guests checking in at once each arrive exactly once', async () => {
  const control = await connect();
  await cleanup(control);

  const admin = await createAdmin(control, 'porta');
  const eventId = await createEvent(control, { capacity: 60, state: 'open', waitlistEnabled: true });

  // Forty people, each on their own telephone number — the ordinary queue at a door.
  for (let i = 0; i < 40; i += 1) {
    const call = await tryCall(control, REGISTER_SQL, [
      eventId,
      `Participante ${i + 1}`,
      20,
      phone(5000 + i),
    ]);
    assert.ok(call.ok && call.rows[0]?.outcome === 'confirmed', 'the fixture must seat everybody');
  }

  const token = await openSession(control, eventId, admin);

  const clients = await openConnections(40);
  try {
    const calls = await Promise.all(
      clients.map((client, i) =>
        tryCall(client, CHECK_IN_SQL, [token, phone(5000 + i), null, null]),
      ),
    );

    assert.deepEqual(
      calls.filter((call) => !call.ok).map((call) => `${call.sqlstate}: ${call.message}`),
      [],
      'a burst of simultaneous check-ins must not surface as an error to any guest',
    );

    const tally = results(calls);
    assert.equal(tally.confirmed, 40, 'every guest was admitted');
    assert.equal(tally.already_present ?? 0, 0, 'and none of them was told they had already arrived');

    const { rows } = await control.query<{ present: string }>(
      `select count(*)::text as present from public.registrations
        where event_id = $1 and attended_at is not null`,
      [eventId],
    );
    assert.equal(Number(rows[0].present), 40, 'forty arrivals were recorded');
  } finally {
    await closeAll(clients);
    await cleanup(control);
    await control.end();
  }
});

test('one guest scanning twenty times is recorded once, at one moment', async () => {
  // The double-tap, the impatient re-scan, and the retry after a lost response — all the same shape.
  const control = await connect();
  await cleanup(control);

  const admin = await createAdmin(control, 'porta');
  const eventId = await createEvent(control, { capacity: 10, state: 'open', waitlistEnabled: true });

  await tryCall(control, REGISTER_SQL, [eventId, 'Ana Souza', 15, phone(5100)]);
  const token = await openSession(control, eventId, admin);

  const clients = await openConnections(20);
  try {
    const calls = await Promise.all(
      clients.map((client) => tryCall(client, CHECK_IN_SQL, [token, phone(5100), null, null])),
    );

    assert.deepEqual(
      calls.filter((call) => !call.ok).map((call) => `${call.sqlstate}: ${call.message}`),
      [],
      'no guest is shown an error for scanning twice',
    );

    const tally = results(calls);
    assert.equal(tally.confirmed, 1, 'exactly one caller performed the write');
    assert.equal(tally.already_present, 19, 'every other caller was told they were already here');

    const { rows } = await control.query<{ moments: string }>(
      `select count(distinct attended_at)::text as moments from public.registrations
        where event_id = $1 and attended_at is not null`,
      [eventId],
    );
    assert.equal(
      Number(rows[0].moments),
      1,
      'attended_at is the ARRIVAL time: twenty taps produced one value, not the last one',
    );
  } finally {
    await closeAll(clients);
    await cleanup(control);
    await control.end();
  }
});

test('a household of six on one number checks in without interfering with itself', async () => {
  const control = await connect();
  await cleanup(control);

  const admin = await createAdmin(control, 'porta');
  const eventId = await createEvent(control, { capacity: 10, state: 'open', waitlistEnabled: true });

  const shared = phone(5200);
  const names = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe'];

  for (const [i, name] of names.entries()) {
    const call = await tryCall(control, REGISTER_SQL, [eventId, `${name} Souza`, 15 + i, shared]);
    assert.ok(call.ok && call.rows[0]?.outcome === 'confirmed', `${name} must be seated`);
  }

  const token = await openSession(control, eventId, admin);

  const clients = await openConnections(names.length);
  try {
    // All six members of one family tapping at the same instant, each with their own first name.
    const calls = await Promise.all(
      clients.map((client, i) => tryCall(client, CHECK_IN_SQL, [token, shared, names[i], null])),
    );

    assert.deepEqual(
      calls.filter((call) => !call.ok).map((call) => `${call.sqlstate}: ${call.message}`),
      [],
      'six simultaneous check-ins on one telephone number must not collide',
    );

    const tally = results(calls);
    assert.equal(tally.confirmed, 6, 'all six were admitted');

    const { rows } = await control.query<{ full_name: string }>(
      `select full_name from public.registrations
        where event_id = $1 and attended_at is null`,
      [eventId],
    );
    assert.deepEqual(rows, [], 'nobody on the shared number was left behind');
  } finally {
    await closeAll(clients);
    await cleanup(control);
    await control.end();
  }
});

test('self check-in and an organizer marking attendance never deadlock (I6)', async () => {
  // Both paths take the event row before the registration. If either ever stopped doing so, this is
  // where it would surface — the two are hammering the same rows from opposite directions.
  const control = await connect();
  await cleanup(control);

  const admin = await createAdmin(control, 'porta');
  const eventId = await createEvent(control, { capacity: 40, state: 'open', waitlistEnabled: true });

  const ids: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const call = await tryCall(control, REGISTER_SQL, [
      eventId,
      `Participante ${i + 1}`,
      20,
      phone(5300 + i),
    ]);
    assert.ok(call.ok);
    ids.push(String(call.rows[0]?.registration_id));
  }

  const token = await openSession(control, eventId, admin);

  const guests = await openConnections(20);
  const organizers = await openConnections(4);

  try {
    await Promise.all(
      organizers.map((client) =>
        client.query('select set_config($1, $2, false)', [
          'request.jwt.claims',
          JSON.stringify({ sub: admin, role: 'authenticated' }),
        ]),
      ),
    );

    const calls = await Promise.all([
      ...guests.map((client, i) => tryCall(client, CHECK_IN_SQL, [token, phone(5300 + i), null, null])),
      // The organizer working the manual list at the same time, on rows the guests are also touching.
      ...organizers.flatMap((client, index) =>
        ids
          .filter((_, i) => i % organizers.length === index)
          .map((id) =>
            tryCall(
              client,
              'select attended_at from public.set_registration_attendance($1, $2)',
              [id, true],
            ),
          ),
      ),
    ]);

    const deadlocks = calls.filter((call) => !call.ok && call.sqlstate === DEADLOCK);
    assert.deepEqual(deadlocks, [], 'I6: one lock order everywhere means no pair can deadlock');

    const { rows } = await control.query<{ present: string }>(
      `select count(*)::text as present from public.registrations
        where event_id = $1 and attended_at is not null`,
      [eventId],
    );
    assert.equal(Number(rows[0].present), 20, 'and everybody ends up present exactly once');
  } finally {
    await closeAll(guests);
    await closeAll(organizers);
    await cleanup(control);
    await control.end();
  }
});

test('closing check-in mid-burst admits nobody afterwards', async () => {
  const control = await connect();
  await cleanup(control);

  const admin = await createAdmin(control, 'porta');
  const eventId = await createEvent(control, { capacity: 20, state: 'open', waitlistEnabled: true });

  for (let i = 0; i < 10; i += 1) {
    await tryCall(control, REGISTER_SQL, [eventId, `Participante ${i + 1}`, 20, phone(5400 + i)]);
  }

  const token = await openSession(control, eventId, admin);

  const clients = await openConnections(10);
  try {
    const closer = await connect();
    await closer.query('select set_config($1, $2, false)', [
      'request.jwt.claims',
      JSON.stringify({ sub: admin, role: 'authenticated' }),
    ]);

    // The close and ten check-ins, launched together. Whichever order the event lock grants, the
    // invariant is the same: a guest is either admitted before the close or refused after it, and
    // never admitted by a session that is already shut.
    const calls = await Promise.all([
      ...clients.map((client, i) => tryCall(client, CHECK_IN_SQL, [token, phone(5400 + i), null, null])),
      tryCall(closer, 'select closed from public.close_check_in_session($1)', [eventId]),
    ]);
    await closer.end();

    const checkIns = calls.slice(0, 10);
    assert.deepEqual(
      checkIns.filter((call) => !call.ok).map((call) => `${call.sqlstate}: ${call.message}`),
      [],
      'a session closing underneath a guest is a designed state, not an error',
    );

    const tally = results(checkIns);
    const admitted = tally.confirmed ?? 0;
    const refused = tally.session_invalid ?? 0;
    assert.equal(admitted + refused, 10, 'every guest got one of the two designed answers');

    const { rows } = await control.query<{ present: string }>(
      `select count(*)::text as present from public.registrations
        where event_id = $1 and attended_at is not null`,
      [eventId],
    );
    assert.equal(
      Number(rows[0].present),
      admitted,
      'exactly the guests who were told they arrived have an arrival recorded',
    );

    // And once it is shut, it stays shut.
    const after = await tryCall(control, CHECK_IN_SQL, [token, phone(5400), null, null]);
    assert.ok(after.ok);
    assert.equal(after.rows[0]?.result, 'session_invalid', 'the token is inert afterwards');
  } finally {
    await closeAll(clients);
    await cleanup(control);
    await control.end();
  }
});

/* ================================================================================================
 * The cross-language identity claim
 * ============================================================================================== */

test('identityKey() agrees with registration_identity_key() on every case that matters', async () => {
  const db = await connect();

  try {
    const inputs = [
      'Ana Souza',
      'ana souza',
      'ANA SOUZA',
      '  Ana   Souza  ',
      '\tAna\tSouza\t',
      '\n Ana \n Souza \n',
      'Ana Souza',
      ' Ana Souza ',
      'João',
      'JOÃO',
      'João Pedro Souza',
      'José Ávila',
      'Conceição',
      'Antônio Nuñez',
      'Müller',
      'Thaís Sá',
      // Decomposed forms: the same name typed on a different keyboard.
      'Mária',
      'Mária',
      'Thaís Sá',
      // A STANDALONE acute accent, which `unaccent` leaves alone and `\p{Diacritic}` would not.
      'Maria d´Ávila',
      "Maria d'Ávila",
      'Ana-Clara Souza',
      'de Souza e Silva',
      'Souza, Ana',
      'McCarthy',
      // The transliterations `unaccent` performs that decomposition cannot produce. Every one of
      // these was found BY this test: the apostrophe family in particular matters, because both
      // mobile keyboards autocorrect `'` to `’` as you type.
      'D’Angelo',
      "D'Angelo",
      'D‘Angelo',
      'DʼAngelo',
      'Straßer',
      'STRAßER',
      'Ægir Sousa',
      'Sørensen',
      'Kowalłczyk',
      'Œuvres',
      'Anne-Marie – Souza',
      'Ana “Nina” Souza',
      '',
      '   ',
      'a',
    ];

    const { rows } = await db.query<{ input: string; key: string }>(
      `select v as input, public.registration_identity_key(v) as key
         from unnest($1::text[]) as v`,
      [inputs],
    );

    const divergences = rows
      .map((row) => ({ input: row.input, sql: row.key, ts: identityKey(row.input) }))
      .filter((row) => row.sql !== row.ts);

    assert.deepEqual(
      divergences,
      [],
      'the TypeScript and PL/pgSQL halves of the identity rule must fold every input identically',
    );
  } finally {
    await db.end();
  }
});

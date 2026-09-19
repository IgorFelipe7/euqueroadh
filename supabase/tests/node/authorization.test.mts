// Authorization over the REAL HTTP Data API, with the four identities the product has:
// an anonymous caller holding the publishable key, a signed-in non-administrator, an active
// administrator, a deactivated administrator — plus the secret key that our own server uses.
//
// The pgTAP suite proves the same rules at the role level; this suite proves that PostgREST and
// Supabase Auth actually present them that way over the wire.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEST_EMAIL_DOMAIN,
  cleanup,
  connect,
  createEvent,
  localKeys,
  phone,
  type Db,
} from './helpers.mts';

const keys = localKeys();

type Identity = { apikey: string; token?: string };

function headers(identity: Identity, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: identity.apikey,
    Authorization: `Bearer ${identity.token ?? identity.apikey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(
  identity: Identity,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetch(`${keys.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: headers(identity, (init.headers as Record<string, string>) ?? {}),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body is itself informative; keep the text.
  }
  return { ok: response.ok, status: response.status, body };
}

async function rpc(
  identity: Identity,
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  return rest(identity, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
}

async function createAuthUser(email: string, password: string): Promise<string> {
  const response = await fetch(`${keys.apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: keys.secretKey,
      Authorization: `Bearer ${keys.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = (await response.json()) as { id?: string; msg?: string };
  assert.ok(response.ok && body.id, `could not create ${email}: ${JSON.stringify(body)}`);
  return body.id as string;
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await fetch(`${keys.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: keys.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { access_token?: string };
  assert.ok(response.ok && body.access_token, `could not sign in ${email}`);
  return body.access_token as string;
}

/** Every routine in the § 8.5 matrix, with argument names, so a denial is a real denial and not a
 *  404 for a mistyped signature. */
const ROUTINE_MATRIX: { name: string; args: Record<string, unknown> }[] = [
  { name: 'immutable_unaccent', args: {} },
  { name: 'sync_event_counts', args: {} },
  { name: 'is_active_admin', args: {} },
  {
    name: 'record_admin_action',
    args: {
      p_action: 'settings.updated',
      p_event_id: null,
      p_registration_id: null,
      p_metadata: {},
    },
  },
  {
    name: 'register_for_event',
    args: {
      p_event_id: '00000000-0000-0000-0000-000000000000',
      p_full_name: 'Intruso Anonimo',
      p_age: 20,
      p_phone_e164: phone(9999),
    },
  },
  {
    name: 'edit_registration',
    args: {
      p_registration_id: '00000000-0000-0000-0000-000000000000',
      p_full_name: 'Intruso Anonimo',
      p_age: 20,
      p_notes: null,
    },
  },
  { name: 'cancel_registration', args: { p_registration_id: '00000000-0000-0000-0000-000000000000' } },
  {
    name: 'promote_from_waitlist',
    args: { p_event_id: '00000000-0000-0000-0000-000000000000', p_count: 1 },
  },
  { name: 'promote_registration', args: { p_registration_id: '00000000-0000-0000-0000-000000000000' } },
  {
    name: 'update_event_settings',
    args: {
      p_event_id: '00000000-0000-0000-0000-000000000000',
      p_capacity: 10,
      p_waitlist_enabled: true,
      p_state: 'open',
      p_certificates_enabled: null,
      p_expected_settings_version: 1,
    },
  },
  { name: 'delete_registration', args: { p_registration_id: '00000000-0000-0000-0000-000000000000' } },
  {
    name: 'purge_event_registrations',
    args: { p_event_id: '00000000-0000-0000-0000-000000000000', p_expected_settings_version: 1 },
  },
  {
    name: 'record_export_action',
    args: { p_event_id: '00000000-0000-0000-0000-000000000000', p_row_count: 1, p_filters: {} },
  },
  {
    name: 'set_admin_active',
    args: { p_user_id: '00000000-0000-0000-0000-000000000000', p_active: false },
  },
  {
    name: 'add_admin_user',
    args: {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_email: `intruso@${TEST_EMAIL_DOMAIN}`,
      p_display_name: 'Intruso',
    },
  },
  { name: 'remove_admin_user', args: { p_user_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'verify_event_counters', args: {} },

  // Attendance, raffles and the certificate read (migrations 13-15). Every one of them is on this
  // list for the same reason as everything above it: a routine that is not adversarially tested
  // against anon, a signed-in non-administrator and a deactivated administrator is a routine whose
  // ACL is a claim rather than a fact.
  {
    name: 'set_registration_attendance',
    args: { p_registration_id: '00000000-0000-0000-0000-000000000000', p_present: true },
  },
  {
    name: 'create_raffle',
    args: {
      p_event_id: '00000000-0000-0000-0000-000000000000',
      p_name: 'Sorteio do intruso',
      p_prize_label: null,
      p_pool: 'attended',
      p_winners_target: 1,
      p_exclude_previous_winners: true,
    },
  },
  {
    name: 'update_raffle',
    args: {
      p_raffle_id: '00000000-0000-0000-0000-000000000000',
      p_name: 'Sorteio do intruso',
      p_prize_label: null,
      p_pool: 'attended',
      p_winners_target: 1,
      p_exclude_previous_winners: true,
    },
  },
  { name: 'delete_raffle', args: { p_raffle_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'reset_raffle', args: { p_raffle_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'draw_raffle_winner', args: { p_raffle_id: '00000000-0000-0000-0000-000000000000' } },
  {
    name: 'resolve_raffle_draw',
    args: { p_draw_id: '00000000-0000-0000-0000-000000000000', p_outcome: 'confirmed' },
  },
  // Granted to service_role only, like register_for_event: the public certificate page renders on
  // our own server. anon must not be able to call it directly with a guessed token.
  { name: 'get_certificate', args: { p_token: 'nao-existe-esse-token-aqui' } },
];

const TABLES = [
  'events',
  'registrations',
  'admin_users',
  'admin_actions',
  'raffles',
  'raffle_draws',
];
/** The three tables holding participant or administrator data. The secret key reaches none of
 *  them: its only table privilege is `select` on `events` (§ 8.3). */
const PRIVATE_TABLES = TABLES.filter((table) => table !== 'events');
/** The projection the Phase 3 public DAL will ask for - display copy plus the fields that decide
 *  which call to action the public page renders. No participant column exists on this table. */
const PUBLIC_EVENT_PROJECTION =
  'id,slug,title,kicker,audience_label,starts_at,ends_at,timezone,venue_name,' +
  'venue_address_line,venue_district,venue_city,venue_state,price_label,is_free,' +
  'includes_label,capacity,waitlist_enabled,registration_state,confirmed_count,waitlist_count';

type World = {
  db: Db;
  eventId: string;
  registrationId: string;
  anon: Identity;
  secret: Identity;
  nonAdmin: Identity;
  admin: Identity;
  deactivated: Identity;
  adminUserId: string;
};

async function setUp(): Promise<World> {
  const db = await connect();
  await cleanup(db);

  const password = 'senha-de-teste-local-1234';
  const adminEmail = `organizador@${TEST_EMAIL_DOMAIN}`;
  const exEmail = `ex-organizador@${TEST_EMAIL_DOMAIN}`;
  const personEmail = `pessoa@${TEST_EMAIL_DOMAIN}`;

  const adminUserId = await createAuthUser(adminEmail, password);
  const exAdminId = await createAuthUser(exEmail, password);
  await createAuthUser(personEmail, password);

  await db.query(
    `insert into public.admin_users (user_id, email, display_name, is_active)
     values ($1, $2, 'Organizador Um', true), ($3, $4, 'Organizador Ex', false)`,
    [adminUserId, adminEmail, exAdminId, exEmail],
  );

  const eventId = await createEvent(db, { capacity: 5, state: 'open', waitlistEnabled: true });
  const registration = await db.query<{ registration_id: string }>(
    'select registration_id from public.register_for_event($1, $2, $3::smallint, $4)',
    [eventId, 'Ana Souza', 20, phone(1)],
  );

  return {
    db,
    eventId,
    registrationId: registration.rows[0].registration_id,
    adminUserId,
    anon: { apikey: keys.publishableKey },
    secret: { apikey: keys.secretKey },
    nonAdmin: { apikey: keys.publishableKey, token: await signIn(personEmail, password) },
    admin: { apikey: keys.publishableKey, token: await signIn(adminEmail, password) },
    deactivated: { apikey: keys.publishableKey, token: await signIn(exEmail, password) },
  };
}

async function tearDown(world: World): Promise<void> {
  await cleanup(world.db);
  await world.db.end();
}

test('the Data API enforces the authorization matrix', async (t) => {
  const world = await setUp();

  try {
    await t.test('anon reads nothing', async () => {
      for (const table of TABLES) {
        const result = await rest(world.anon, `${table}?select=*`);
        assert.equal(result.ok, false, `anon must not read ${table} (got ${result.status})`);
      }
    });

    await t.test('anon can execute no routine in the matrix', async () => {
      for (const routine of ROUTINE_MATRIX) {
        const result = await rpc(world.anon, routine.name, routine.args);
        assert.equal(
          result.ok,
          false,
          `anon must not execute ${routine.name} (got ${result.status} ${JSON.stringify(result.body)})`,
        );
      }
    });

    await t.test('anon cannot write to any table', async () => {
      const insert = await rest(world.anon, 'registrations', {
        method: 'POST',
        body: JSON.stringify({
          event_id: world.eventId,
          full_name: 'Intruso Anonimo',
          age: 20,
          phone_e164: phone(777),
          status: 'confirmed',
        }),
      });
      assert.equal(insert.ok, false, 'anon cannot insert a registration');
    });

    await t.test('a signed-in non-administrator sees nothing and can do nothing', async () => {
      for (const table of TABLES) {
        const result = await rest(world.nonAdmin, `${table}?select=*`);
        if (result.ok) {
          assert.deepEqual(result.body, [], `${table} must come back empty for a non-administrator`);
        }
      }

      for (const routine of ROUTINE_MATRIX) {
        const result = await rpc(world.nonAdmin, routine.name, routine.args);
        if (routine.name === 'is_active_admin') {
          assert.equal(result.ok, true, 'the gate itself is callable by any signed-in user');
          assert.equal(result.body, false, 'and it answers false for a non-administrator');
        } else {
          assert.equal(
            result.ok,
            false,
            `a non-administrator must not execute ${routine.name} (got ${result.status})`,
          );
        }
      }
    });

    await t.test('an active administrator reads, but writes only through RPCs', async () => {
      const registrations = await rest(world.admin, 'registrations?select=id,full_name');
      assert.equal(registrations.ok, true, 'an administrator reads participant data');
      assert.equal((registrations.body as unknown[]).length, 1, 'and sees the registration');

      for (const table of ['events', 'admin_users', 'admin_actions']) {
        const result = await rest(world.admin, `${table}?select=*`);
        assert.equal(result.ok, true, `an administrator reads ${table}`);
      }

      const patch = await rest(world.admin, `registrations?id=eq.${world.registrationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ full_name: 'Nome Roubado' }),
      });
      assert.equal(patch.ok, false, 'a direct PATCH of participant data is refused');

      const statusPatch = await rest(world.admin, `registrations?id=eq.${world.registrationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      assert.equal(statusPatch.ok, false, 'a direct status change is refused');

      const capacityPatch = await rest(world.admin, `events?id=eq.${world.eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ capacity: 999 }),
      });
      assert.equal(capacityPatch.ok, false, 'a direct capacity change is refused');

      const deletion = await rest(world.admin, `registrations?id=eq.${world.registrationId}`, {
        method: 'DELETE',
      });
      assert.equal(deletion.ok, false, 'a direct delete is refused');

      const forge = await rest(world.admin, 'admin_actions', {
        method: 'POST',
        body: JSON.stringify({ actor_label: 'falso', action: 'registrations.exported' }),
      });
      assert.equal(forge.ok, false, 'forging an audit row is refused');

      const edit = await rpc(world.admin, 'edit_registration', {
        p_registration_id: world.registrationId,
        p_full_name: 'Ana Souza Lima',
        p_age: 21,
        p_notes: null,
      });
      assert.equal(edit.ok, true, 'the RPC path works, and it is the only one');

      const audited = await world.db.query<{ count: string }>(
        `select count(*)::text from public.admin_actions
          where action = 'registration.edited' and actor_user_id = $1`,
        [world.adminUserId],
      );
      assert.equal(Number(audited.rows[0].count), 1, 'and it wrote its audit row');
    });

    await t.test('a deactivated administrator loses access on the next request', async () => {
      const registrations = await rest(world.deactivated, 'registrations?select=*');
      if (registrations.ok) {
        assert.deepEqual(registrations.body, [], 'no participant data');
      }

      const own = await rest(world.deactivated, 'admin_users?select=user_id,is_active');
      assert.equal(own.ok, true, 'they can still read their own row, which the sign-in gate needs');
      assert.equal((own.body as unknown[]).length, 1, 'exactly their own row');

      const attempt = await rpc(world.deactivated, 'cancel_registration', {
        p_registration_id: world.registrationId,
      });
      assert.equal(attempt.ok, false, 'and every administrative RPC refuses them');
    });

    await t.test('the secret key can register and read the event, and nothing else', async () => {
      const registration = await rpc(world.secret, 'register_for_event', {
        p_event_id: world.eventId,
        p_full_name: 'Bruno Gonçalves',
        p_age: 21,
        p_phone_e164: phone(2),
      });
      assert.equal(registration.ok, true, 'our own server may run the public write path');
      assert.equal(
        (registration.body as { outcome: string }[])[0].outcome,
        'confirmed',
        'and it works',
      );

      // The path the Phase 3 public page will actually use, over the real Data API with the real
      // local secret key: select the display projection for one event.
      const display = await rest(
        world.secret,
        `events?id=eq.${world.eventId}&select=${PUBLIC_EVENT_PROJECTION}`,
      );
      assert.equal(
        display.ok,
        true,
        `the secret key reads the public event display fields (got ${display.status} ` +
          `${JSON.stringify(display.body)})`,
      );
      const [event] = display.body as Record<string, unknown>[];
      assert.equal(event.id, world.eventId, 'and gets the event back');
      assert.equal(event.capacity, 5, 'with the capacity the page needs');
      assert.equal(event.registration_state, 'open', 'and the registration state');

      /*
       * The certificate read, over the same real Data API. It is granted to the secret key for the
       * same reason the write path is: the public page renders on our own server and the browser
       * never contacts Supabase (D4).
       *
       * An unknown token must come back as an EMPTY RESULT rather than an error — a 404 or a
       * distinct failure would let the route be used to tell "no such token" apart from "that
       * person did not attend" (RAFFLE-AND-CERTIFICATE-SPEC.md section 4.3).
       */
      const certificate = await rpc(world.secret, 'get_certificate', {
        p_token: 'nao-existe-esse-token-aqui',
      });
      assert.equal(certificate.ok, true, 'our own server may run the public certificate read');
      assert.deepEqual(
        certificate.body,
        [],
        'and an unknown token is an empty result, indistinguishable from every other refusal',
      );

      for (const table of PRIVATE_TABLES) {
        const result = await rest(world.secret, `${table}?select=*`);
        assert.equal(
          result.ok,
          false,
          `the secret key holds no privilege on ${table} (got ${result.status})`,
        );
      }

      // Participant data must not be reachable as an embedded resource of the one table the secret
      // key can read: PostgREST resolves the embed as the same role.
      const embedded = await rest(world.secret, `events?select=id,registrations(full_name,phone_e164)`);
      assert.equal(
        embedded.ok,
        false,
        `participant data is not reachable by embedding it in the event read (got ${embedded.status})`,
      );

      // SELECT and strictly SELECT: a write privilege here would put a mutation outside the RPCs.
      const patch = await rest(world.secret, `events?id=eq.${world.eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ capacity: 999 }),
      });
      assert.equal(patch.ok, false, 'the secret key cannot change the capacity it can read');

      const insert = await rest(world.secret, 'events', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'evt-forjado',
          title: 'Evento Forjado',
          starts_at: '2026-09-19T19:00:00-03:00',
          capacity: 1,
        }),
      });
      assert.equal(insert.ok, false, 'nor create an event');

      const deletion = await rest(world.secret, `events?id=eq.${world.eventId}`, { method: 'DELETE' });
      assert.equal(deletion.ok, false, 'nor delete one');

      /*
       * The two routines the secret key is SUPPOSED to reach — the public write path and the
       * public certificate read. Everything else in the matrix must refuse it, which is what makes
       * "the server secret is not an administrator" a tested fact rather than a claim.
       */
      const SECRET_KEY_ROUTINES = ['register_for_event', 'get_certificate'];

      for (const routine of ROUTINE_MATRIX.filter((r) => !SECRET_KEY_ROUTINES.includes(r.name))) {
        const result = await rpc(world.secret, routine.name, routine.args);
        assert.equal(
          result.ok,
          false,
          `the secret key must not execute ${routine.name} (got ${result.status})`,
        );
      }
    });
  } finally {
    await tearDown(world);
  }
});

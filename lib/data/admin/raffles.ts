/**
 * Reading raffles, as the administrator.
 *
 * Everything here runs through `createUserClient()`, so `raffles_admin_read` and
 * `raffle_draws_admin_read` are what authorize it. The secret key holds no `SELECT` on either table
 * and could not serve these rows even if this file asked it to (migration 14).
 *
 * **The stage never receives a full name from this module.** `listDraws` returns the masked form
 * for display and the full name separately, and the stage's Server Component passes only the first
 * to the browser (RAFFLE-AND-CERTIFICATE-SPEC.md § 3.6). That is the mechanical reason the masking
 * cannot drift: there is nothing else in the client bundle to drift towards.
 */
import 'server-only';

import { maskedName } from '@/lib/domain/display-name';
import { assertAdmin } from '@/lib/data/auth';
import { createUserClient } from '@/lib/data/supabase/user';

export type RafflePool = 'attended' | 'confirmed';
export type RaffleStatus = 'draft' | 'running' | 'finished';
export type DrawOutcome = 'pending' | 'confirmed' | 'forfeited';

export interface Raffle {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  readonly prizeLabel: string | null;
  readonly pool: RafflePool;
  readonly winnersTarget: number;
  readonly excludePreviousWinners: boolean;
  readonly status: RaffleStatus;
  readonly drawSeq: number;
}

export interface RaffleDraw {
  readonly id: string;
  readonly registrationId: string;
  readonly drawIndex: number;
  readonly outcome: DrawOutcome;
  readonly poolSize: number;
  /** `Ana S.` — the only form that may reach the projected screen. */
  readonly maskedName: string;
  /** The full name, for the operator's own confirm control. Never sent to the stage. */
  readonly fullName: string;
}

export interface RaffleSummary extends Raffle {
  readonly confirmedCount: number;
  readonly totalDraws: number;
}

interface RaffleRow {
  id: string;
  event_id: string;
  name: string;
  prize_label: string | null;
  pool: RafflePool;
  winners_target: number;
  exclude_previous_winners: boolean;
  status: RaffleStatus;
  draw_seq: number;
}

const RAFFLE_COLUMNS =
  'id, event_id, name, prize_label, pool, winners_target, exclude_previous_winners, status, ' +
  'draw_seq';

function toRaffle(row: RaffleRow): Raffle {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    prizeLabel: row.prize_label,
    pool: row.pool,
    winnersTarget: row.winners_target,
    excludePreviousWinners: row.exclude_previous_winners,
    status: row.status,
    drawSeq: row.draw_seq,
  };
}

/** The control room's list, each raffle carrying how far through it is. */
export async function listRaffles(eventId: string): Promise<readonly RaffleSummary[]> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase
    .from('raffles')
    .select(RAFFLE_COLUMNS)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .returns<RaffleRow[]>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.raffles_read_failed', code: error.code }));
    return [];
  }

  const raffles = (data ?? []).map(toRaffle);
  if (raffles.length === 0) return [];

  // One query for every raffle's draws rather than one per raffle. At this scale the whole set is a
  // few dozen rows, and the alternative is a request per row of the list.
  const { data: draws, error: drawsError } = await supabase
    .from('raffle_draws')
    .select('raffle_id, outcome')
    .in(
      'raffle_id',
      raffles.map((raffle) => raffle.id),
    )
    .returns<{ raffle_id: string; outcome: DrawOutcome }[]>();

  if (drawsError) {
    console.error(JSON.stringify({ event: 'admin.raffle_draws_read_failed', code: drawsError.code }));
  }

  const counts = new Map<string, { confirmed: number; total: number }>();
  for (const draw of draws ?? []) {
    const entry = counts.get(draw.raffle_id) ?? { confirmed: 0, total: 0 };
    entry.total += 1;
    if (draw.outcome === 'confirmed') entry.confirmed += 1;
    counts.set(draw.raffle_id, entry);
  }

  return raffles.map((raffle) => ({
    ...raffle,
    confirmedCount: counts.get(raffle.id)?.confirmed ?? 0,
    totalDraws: counts.get(raffle.id)?.total ?? 0,
  }));
}

export async function getRaffle(id: string): Promise<Raffle | null> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase
    .from('raffles')
    .select(RAFFLE_COLUMNS)
    .eq('id', id)
    .maybeSingle<RaffleRow>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.raffle_read_failed', code: error.code }));
    return null;
  }
  return data ? toRaffle(data) : null;
}

/**
 * The draws of one raffle, oldest first.
 *
 * Two queries rather than a join, because PostgREST's embedded resource would return the whole
 * registration row — every name, age and telephone number of every winner — where this needs two
 * columns of it.
 */
export async function listDraws(raffleId: string): Promise<readonly RaffleDraw[]> {
  await assertAdmin();
  const supabase = await createUserClient();

  const { data, error } = await supabase
    .from('raffle_draws')
    .select('id, registration_id, draw_index, outcome, pool_size')
    .eq('raffle_id', raffleId)
    .order('draw_index', { ascending: true })
    .returns<
      {
        id: string;
        registration_id: string;
        draw_index: number;
        outcome: DrawOutcome;
        pool_size: number;
      }[]
    >();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.draws_read_failed', code: error.code }));
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: people, error: peopleError } = await supabase
    .from('registrations')
    .select('id, full_name')
    .in(
      'id',
      rows.map((row) => row.registration_id),
    )
    .returns<{ id: string; full_name: string }[]>();

  if (peopleError) {
    console.error(JSON.stringify({ event: 'admin.draw_names_read_failed', code: peopleError.code }));
  }

  const names = new Map((people ?? []).map((person) => [person.id, person.full_name]));

  return rows.map((row) => {
    const fullName = names.get(row.registration_id) ?? '';
    return {
      id: row.id,
      registrationId: row.registration_id,
      drawIndex: row.draw_index,
      outcome: row.outcome,
      poolSize: row.pool_size,
      maskedName: maskedName(fullName),
      fullName,
    };
  });
}

/**
 * The masked labels of everyone currently eligible, for the stage's reel.
 *
 * **Masked here, at the source.** The stage is a Server Component that passes this array straight to
 * the browser, so if this function returned full names the projector would show them. It returns
 * `string[]`, not people: there is no id to correlate a label back to a registration.
 *
 * The reel is decoration over an already-decided result, so this list being a moment stale is
 * harmless — the winner does not come from it.
 */
export async function listEligibleLabels(
  eventId: string,
  raffleId: string,
  pool: RafflePool,
): Promise<readonly string[]> {
  await assertAdmin();
  const supabase = await createUserClient();

  let query = supabase
    .from('registrations')
    .select('id, full_name')
    .eq('event_id', eventId)
    .eq('status', 'confirmed');

  if (pool === 'attended') query = query.not('attended_at', 'is', null);

  const { data, error } = await query.returns<{ id: string; full_name: string }[]>();

  if (error) {
    console.error(JSON.stringify({ event: 'admin.eligible_read_failed', code: error.code }));
    return [];
  }

  const { data: drawn } = await supabase
    .from('raffle_draws')
    .select('registration_id')
    .eq('raffle_id', raffleId)
    .returns<{ registration_id: string }[]>();

  const already = new Set((drawn ?? []).map((row) => row.registration_id));

  return (data ?? [])
    .filter((row) => !already.has(row.id))
    .map((row) => maskedName(row.full_name))
    .filter((label) => label.length > 0);
}

/** How many people the raffle would draw from right now — the control room's confidence number. */
export async function countEligible(eventId: string, pool: RafflePool): Promise<number | null> {
  await assertAdmin();
  const supabase = await createUserClient();

  let query = supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'confirmed');

  if (pool === 'attended') query = query.not('attended_at', 'is', null);

  const { count, error } = await query;
  if (error) {
    console.error(JSON.stringify({ event: 'admin.eligible_count_failed', code: error.code }));
    return null;
  }
  return count ?? 0;
}

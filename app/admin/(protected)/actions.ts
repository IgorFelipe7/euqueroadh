'use server';

/**
 * Every administrative mutation entry point.
 *
 * Three rules hold for all of them, without exception:
 *
 *   1. **`assertAdmin()` is the first statement.** A Server Action is a POST endpoint reachable by
 *      anyone who can send the request; being defined under `(protected)` grants it nothing,
 *      because a layout check does not cover the actions declared beneath it. `proxy.ts` is not the
 *      boundary either — deleting it must cost a session refresh, never a gate.
 *   2. **The write itself goes through an RPC**, under the administrator's own JWT, so the
 *      authorization check, the lock order and the audit record share one transaction. There is no
 *      direct table write in this file and there can be none: `authenticated` holds no write
 *      privilege on any table.
 *   3. **Nothing from the request is trusted as authority.** Ids and the settings token arrive in
 *      the form body, where anyone can put anything; the database re-checks every one of them.
 *
 * **Only async functions may be exported from this file.** The directive turns every export into a
 * server reference, including the ones that are not functions — a constant exported here reaches
 * the browser as a callable stub rather than as its value. The state type and its constructors live
 * in `lib/admin/state.ts`; `lib/auth/server-actions.test.ts` enforces the rule repository-wide.
 */

import { revalidatePath } from 'next/cache';

import { ADMIN_COPY, adminErrorMessage, type AdminError } from '@/lib/admin/copy';
import { failed, ok, type AdminActionState } from '@/lib/admin/state';
import { getAdminEvent } from '@/lib/data/admin/event';
import {
  cancelRegistration,
  createRaffle,
  deleteRaffle,
  deleteRegistration,
  drawRaffleWinner,
  editRegistration,
  promoteFromWaitlist,
  promoteRegistration,
  purgeEventRegistrations,
  resetRaffle,
  resolveRaffleDraw,
  setRegistrationAttendance,
  updateEventSettings,
  updateRaffle,
  type RaffleInput,
} from '@/lib/data/admin/mutations';
import { inviteAdmin, removeAdmin, setAdminActive } from '@/lib/data/admin/team';
import { assertAdmin } from '@/lib/data/auth';
import { UnauthorizedError } from '@/lib/data/errors';
import { maskedName } from '@/lib/domain/display-name';
import { adminAgeSchema, fieldErrors, inviteInputSchema, nameSchema } from '@/lib/domain/schemas';
import { ROUTES } from '@/lib/routes';

/* ------------------------------------------------------------------------------------------------
 * Shared plumbing
 * ---------------------------------------------------------------------------------------------- */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === 'string' ? value : '';
}

function flag(formData: FormData, field: string): boolean {
  return text(formData, field) === 'true' || text(formData, field) === 'on';
}

/**
 * `null` when the form does not carry the field at all, which the settings RPC reads as "leave this
 * one alone".
 *
 * This exists because two different forms post to `updateSettingsAction`: the full settings page,
 * which sends every switch, and the dashboard's inline controls, which send only the one being
 * changed. Treating an absent checkbox as `false` — the ordinary HTML reading — would mean closing
 * registrations from the dashboard also silently switched certificates off.
 */
function flagOrNull(formData: FormData, field: string): boolean | null {
  return formData.get(field) === null ? null : flag(formData, field);
}

function integer(formData: FormData, field: string): number {
  const parsed = Number.parseInt(text(formData, field), 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toState(error: AdminError): AdminActionState {
  return failed(error.code, adminErrorMessage(error));
}

/**
 * Runs an action behind the authorization gate, converting the one exception the gate throws into
 * the state the interface renders.
 *
 * `assertAdmin()` throws rather than returning a flag deliberately: a caller that ignored a returned
 * `{ ok: false }` would proceed as if authorized, and that failure mode is silent. This wrapper is
 * the only place the throw is caught, and it never widens to `catch (unknown)` — an unexpected error
 * must still reach the `error.tsx` boundary rather than be flattened into "try again".
 */
async function guarded(run: () => Promise<AdminActionState>): Promise<AdminActionState> {
  try {
    await assertAdmin();
    return await run();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return failed('not_authorized', adminErrorMessage({ code: 'not_authorized' }));
    }
    throw error;
  }
}

/**
 * The public page renders an advisory state derived from capacity, the counters and the master
 * switch, and it is served from a 60-second cache. Any settings change can move that state, so the
 * page is revalidated from here (ADMIN-SPEC.md section 3.4). The admin routes are revalidated too,
 * because they are `force-dynamic` reads of numbers that just changed.
 */
function revalidateAfterSettings(): void {
  revalidatePath(ROUTES.publicHome);
  revalidatePath(ROUTES.adminHome);
  revalidatePath(ROUTES.adminSettings);
}

function revalidateAfterRegistrationChange(): void {
  revalidatePath(ROUTES.publicHome);
  revalidatePath(ROUTES.adminHome);
  revalidatePath(ROUTES.adminRegistrations);
}

/* ------------------------------------------------------------------------------------------------
 * Settings
 * ---------------------------------------------------------------------------------------------- */

/**
 * The settings form, and the dashboard's two inline controls, all land here.
 *
 * The form carries the `settings_version` it loaded and sends it back; a mismatch is refused by the
 * RPC and reported as a conflict with a `Recarregar` button rather than silently overwriting a
 * colleague. A successful save returns the **new** token, so a second edit in the same sitting
 * needs no page reload.
 */
export async function updateSettingsAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const event = await getAdminEvent();
    if (!event) return failed('event_not_found', adminErrorMessage({ code: 'event_not_found' }));

    const capacity = integer(formData, 'capacity');
    if (!Number.isFinite(capacity) || capacity < 0) {
      return failed('invalid_capacity', adminErrorMessage({ code: 'invalid_capacity' }), {
        capacity: adminErrorMessage({ code: 'invalid_capacity' }),
      });
    }

    const registrationState = text(formData, 'registrationState') === 'open' ? 'open' : 'closed';
    const expected = integer(formData, 'settingsVersion');

    const result = await updateEventSettings({
      eventId: event.id,
      capacity,
      waitlistEnabled: flag(formData, 'waitlistEnabled'),
      registrationState,
      certificatesEnabled: flagOrNull(formData, 'certificatesEnabled'),
      expectedSettingsVersion: expected,
    });

    if (!result.ok) return toState(result.error);

    revalidateAfterSettings();
    return ok(ADMIN_COPY.settings.saved, { settingsVersion: result.value.settingsVersion });
  });
}

/* ------------------------------------------------------------------------------------------------
 * Waitlist
 * ---------------------------------------------------------------------------------------------- */

/**
 * Promotes the next N off the queue.
 *
 * The database caps N at the real headroom inside the transaction, so this may promote fewer people
 * than were asked for — reported honestly rather than as a success or an error, because it is
 * neither (ADMIN-SPEC.md section 3.3).
 */
export async function promoteAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const event = await getAdminEvent();
    if (!event) return failed('event_not_found', adminErrorMessage({ code: 'event_not_found' }));

    const requested = integer(formData, 'count');
    if (!Number.isFinite(requested) || requested < 1) {
      return failed('invalid_count', adminErrorMessage({ code: 'invalid_count' }));
    }

    const result = await promoteFromWaitlist(event.id, requested);
    if (!result.ok) return toState(result.error);

    revalidateAfterRegistrationChange();

    const promoted = result.value;

    if (promoted.length === 0) {
      return ok('Nenhuma pessoa foi promovida — não havia vagas livres.', { promoted });
    }

    const message =
      promoted.length < requested
        ? `Apenas ${promoted.length} de ${requested} ${promoted.length === 1 ? 'pessoa foi promovida' : 'pessoas foram promovidas'} — não havia mais vagas.`
        : `${promoted.length} ${promoted.length === 1 ? 'pessoa promovida' : 'pessoas promovidas'}. Avise cada uma:`;

    return ok(message, { promoted });
  });
}

/** `Confirmar vaga` on one named person, out of queue order if the organizer chooses. */
export async function promoteOneAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const id = text(formData, 'registrationId');
    if (!id) return failed('registration_not_found', adminErrorMessage({ code: 'registration_not_found' }));

    const result = await promoteRegistration(id);
    if (!result.ok) return toState(result.error);

    revalidateAfterRegistrationChange();

    const person = result.value;
    return person
      ? ok('1 pessoa promovida. Avise:', { promoted: [person] })
      : ok('Inscrição já estava confirmada.');
  });
}

/* ------------------------------------------------------------------------------------------------
 * One registration
 * ---------------------------------------------------------------------------------------------- */

export async function cancelRegistrationAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const id = text(formData, 'registrationId');
    if (!id) return failed('registration_not_found', adminErrorMessage({ code: 'registration_not_found' }));

    const result = await cancelRegistration(id);
    if (!result.ok) return toState(result.error);

    revalidateAfterRegistrationChange();
    return ok('Inscrição cancelada. A vaga foi liberada.');
  });
}

/**
 * A correction to a participant's name or age.
 *
 * The age is validated against the **technical** bounds (1–120), not the online eligibility floor:
 * an organizer fixing `81` typed as `18` is recording what is true, and a record that already
 * exists is not a new online registration. `edit_registration()` applies the identical range.
 *
 * The telephone number is absent from this form by design — it is the identity and duplicate key.
 */
export async function editRegistrationAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const id = text(formData, 'registrationId');
    if (!id) return failed('registration_not_found', adminErrorMessage({ code: 'registration_not_found' }));

    const name = nameSchema.safeParse(text(formData, 'fullName'));
    const age = adminAgeSchema.safeParse(text(formData, 'age'));

    if (!name.success || !age.success) {
      const errors = {
        ...(name.success ? {} : { fullName: fieldErrors(name.error)._form ?? 'Informe o nome completo.' }),
        ...(age.success ? {} : { age: fieldErrors(age.error)._form ?? 'Informe uma idade válida.' }),
      };
      return failed('invalid_name', 'Confira os dados informados.', errors);
    }

    const notes = text(formData, 'notes').trim();

    const result = await editRegistration({
      id,
      fullName: name.data,
      age: age.data,
      notes: notes.length > 0 ? notes : null,
    });

    if (!result.ok) return toState(result.error);

    revalidateAfterRegistrationChange();
    return ok('Inscrição atualizada.');
  });
}

/**
 * Permanent erasure of one participant — the only irreversible action on a single row.
 *
 * The confirmation checkbox is re-checked here and not only in the browser: a `disabled` button is
 * a courtesy to the person clicking, never a control on the endpoint.
 */
export async function deleteRegistrationAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const id = text(formData, 'registrationId');
    if (!id) return failed('registration_not_found', adminErrorMessage({ code: 'registration_not_found' }));

    if (!flag(formData, 'acknowledged')) {
      return failed('unavailable', 'Confirme que entende que esta ação é permanente.');
    }

    const result = await deleteRegistration(id);
    if (!result.ok) return toState(result.error);

    revalidateAfterRegistrationChange();
    return ok(result.value ? 'Inscrição excluída definitivamente.' : 'Esta inscrição já não existia.');
  });
}

/* ------------------------------------------------------------------------------------------------
 * Retention
 * ---------------------------------------------------------------------------------------------- */

/**
 * The end-of-event purge: one atomic call that erases every registration, forces registrations
 * closed and records the counts. Never a per-row delete loop.
 *
 * It carries the settings token, so the most destructive action in the product cannot run against a
 * stale confirmation screen.
 */
export async function purgeRegistrationsAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const event = await getAdminEvent();
    if (!event) return failed('event_not_found', adminErrorMessage({ code: 'event_not_found' }));

    if (!flag(formData, 'acknowledged')) {
      return failed('unavailable', 'Confirme que entende que esta ação é permanente.');
    }

    const result = await purgeEventRegistrations(event.id, integer(formData, 'settingsVersion'));
    if (!result.ok) return toState(result.error);

    revalidateAfterSettings();
    revalidatePath(ROUTES.adminRegistrations);
    revalidatePath(ROUTES.adminTeam);

    return ok(ADMIN_COPY.purge.done(result.value.deletedCount), {
      settingsVersion: result.value.settingsVersion,
    });
  });
}

/* ------------------------------------------------------------------------------------------------
 * Team
 * ---------------------------------------------------------------------------------------------- */

/**
 * Invites an administrator. Auth first, then the database — so a failure leaves an account that
 * grants nothing rather than a grant with no account (DATABASE-SECURITY.md section 7.4).
 *
 * The address is validated here as well as being a database parameter, because inviting someone
 * grants full access to every participant's personal data and a typo should not create an account
 * for a stranger.
 */
export async function inviteAdminAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const parsed = inviteInputSchema.safeParse({ email: text(formData, 'email') });

    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      return failed('invalid_email', errors.email ?? adminErrorMessage({ code: 'invalid_email' }), {
        email: errors.email ?? adminErrorMessage({ code: 'invalid_email' }),
      });
    }

    const result = await inviteAdmin(parsed.data.email);
    if (!result.ok) return toState(result.error);

    revalidatePath(ROUTES.adminTeam);

    return ok(
      result.value === 'invited'
        ? ADMIN_COPY.team.inviteSent(parsed.data.email)
        : ADMIN_COPY.team.inviteExisting,
    );
  });
}

/**
 * Deactivation and reactivation. The two guards — no self-modification, never the last active
 * administrator — are enforced inside the RPC, so they hold against a direct POST as well as a
 * click, and their messages come back as named errors.
 */
export async function setAdminActiveAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const userId = text(formData, 'userId');
    if (!userId) return failed('admin_not_found', adminErrorMessage({ code: 'admin_not_found' }));

    const active = flag(formData, 'active');
    const result = await setAdminActive(userId, active);
    if (!result.ok) return toState(result.error);

    revalidatePath(ROUTES.adminTeam);
    return ok(active ? ADMIN_COPY.team.reactivated : ADMIN_COPY.team.deactivated);
  });
}

/** Permanent removal: database first, then the Auth account. Residue is reported, never hidden. */
export async function removeAdminAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const userId = text(formData, 'userId');
    if (!userId) return failed('admin_not_found', adminErrorMessage({ code: 'admin_not_found' }));

    if (!flag(formData, 'acknowledged')) {
      return failed('unavailable', 'Confirme que entende que esta ação é permanente.');
    }

    const result = await removeAdmin(userId);
    if (!result.ok) return toState(result.error);

    if (result.value === 'auth_residue') {
      /*
       * Authorization is already revoked — the `admin_users` row is gone and audited — but the Auth
       * account survived. The page is deliberately NOT revalidated: leaving the row on screen is
       * what keeps the retry button, and the retry is safe because `remove_admin_user` is
       * idempotent and the second attempt goes straight to the Auth deletion
       * (DATABASE-SECURITY.md section 6.7).
       */
      return failed('unavailable', ADMIN_COPY.team.removedWithResidue);
    }

    revalidatePath(ROUTES.adminTeam);
    return ok(ADMIN_COPY.team.removed);
  });
}

/* ------------------------------------------------------------------------------------------------
 * Attendance (RAFFLE-AND-CERTIFICATE-SPEC.md section 1)
 * ---------------------------------------------------------------------------------------------- */

/**
 * The door screen's one action, and the toggle on the registrations row.
 *
 * Attendance moves who is eligible for a raffle and who may download a certificate, so the raffle
 * pages are revalidated alongside the lists. The public page is not: attendance changes nothing a
 * visitor can see.
 */
export async function setAttendanceAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const id = text(formData, 'registrationId');
    if (!id) {
      return failed('registration_not_found', adminErrorMessage({ code: 'registration_not_found' }));
    }

    const present = flag(formData, 'present');

    const result = await setRegistrationAttendance(id, present);
    if (!result.ok) return toState(result.error);

    revalidatePath(ROUTES.adminAttendance);
    revalidatePath(ROUTES.adminRegistrations);
    revalidatePath(ROUTES.adminRaffles);

    return ok(present ? ADMIN_COPY.attendance.present : 'Presença desfeita.', {
      attendedAt: result.value.attendedAt,
    });
  });
}

/* ------------------------------------------------------------------------------------------------
 * Raffles (RAFFLE-AND-CERTIFICATE-SPEC.md section 3)
 * ---------------------------------------------------------------------------------------------- */

/** Parses the four configuration fields shared by create and update. */
function raffleInputFrom(formData: FormData): RaffleInput {
  return {
    name: text(formData, 'name').trim(),
    prizeLabel: text(formData, 'prizeLabel').trim() || null,
    pool: text(formData, 'pool') === 'confirmed' ? 'confirmed' : 'attended',
    winnersTarget: integer(formData, 'winnersTarget'),
    excludePreviousWinners: flag(formData, 'excludePreviousWinners'),
  };
}

export async function saveRaffleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const event = await getAdminEvent();
    if (!event) return failed('event_not_found', adminErrorMessage({ code: 'event_not_found' }));

    const input = raffleInputFrom(formData);

    // Checked here as well as in the RPC so the field error lands on the field, rather than as a
    // banner quoting a constraint. The database remains the authority for both.
    if (input.name.length < 2 || input.name.length > 80) {
      return failed('invalid_raffle_name', adminErrorMessage({ code: 'invalid_raffle_name' }), {
        name: adminErrorMessage({ code: 'invalid_raffle_name' }),
      });
    }
    if (!Number.isFinite(input.winnersTarget) || input.winnersTarget < 1) {
      return failed(
        'invalid_winners_target',
        adminErrorMessage({ code: 'invalid_winners_target' }),
        { winnersTarget: adminErrorMessage({ code: 'invalid_winners_target' }) },
      );
    }

    const existing = text(formData, 'raffleId');

    const result = existing
      ? await updateRaffle(existing, input)
      : await createRaffle(event.id, input);

    if (!result.ok) return toState(result.error);

    revalidatePath(ROUTES.adminRaffles);
    return ok(existing ? ADMIN_COPY.raffles.updated : ADMIN_COPY.raffles.created);
  });
}

export async function deleteRaffleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const id = text(formData, 'raffleId');
    if (!id) return failed('raffle_not_found', adminErrorMessage({ code: 'raffle_not_found' }));

    if (!flag(formData, 'acknowledged')) {
      return failed('unavailable', 'Confirme que entende que esta ação é permanente.');
    }

    const result = await deleteRaffle(id);
    if (!result.ok) return toState(result.error);

    revalidatePath(ROUTES.adminRaffles);
    return ok(ADMIN_COPY.raffles.deleted);
  });
}

export async function resetRaffleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const id = text(formData, 'raffleId');
    if (!id) return failed('raffle_not_found', adminErrorMessage({ code: 'raffle_not_found' }));

    if (!flag(formData, 'acknowledged')) {
      return failed('unavailable', 'Confirme que entende que esta ação é permanente.');
    }

    const result = await resetRaffle(id);
    if (!result.ok) return toState(result.error);

    revalidatePath(ROUTES.adminRaffles);
    return ok(ADMIN_COPY.raffles.reset(result.value));
  });
}

/**
 * The draw.
 *
 * **The winner is already decided and recorded when this returns.** The stage animates towards a
 * value it was given; it does not choose one, and it cannot re-run one. A reload mid-animation
 * re-reads the same pending draw from the database (RAFFLE-AND-CERTIFICATE-SPEC.md section 2).
 *
 * The masked label is computed here, on the server, so the projector-facing half of the payload is
 * never derived in the browser from a full name that should not have been there.
 */
export async function drawWinnerAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const id = text(formData, 'raffleId');
    if (!id) return failed('raffle_not_found', adminErrorMessage({ code: 'raffle_not_found' }));

    const result = await drawRaffleWinner(id);
    if (!result.ok) return toState(result.error);

    revalidatePath(ROUTES.adminRaffles);

    const winner = result.value;
    return ok(ADMIN_COPY.raffles.stage.announceWinner(maskedName(winner.fullName)), {
      winner: {
        drawId: winner.drawId,
        maskedName: maskedName(winner.fullName),
        fullName: winner.fullName,
        drawIndex: winner.drawIndex,
        poolSize: winner.poolSize,
      },
      raffleStatus: 'running',
    });
  });
}

export async function resolveDrawAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return guarded(async () => {
    const id = text(formData, 'drawId');
    if (!id) return failed('draw_not_found', adminErrorMessage({ code: 'draw_not_found' }));

    const outcome = text(formData, 'outcome') === 'forfeited' ? 'forfeited' : 'confirmed';

    const result = await resolveRaffleDraw(id, outcome);
    if (!result.ok) return toState(result.error);

    revalidatePath(ROUTES.adminRaffles);
    return ok(outcome === 'confirmed' ? 'Resultado confirmado.' : 'Sorteando novamente.', {
      raffleStatus: result.value.status,
    });
  });
}

'use client';

/**
 * The dashboard's two interactive blocks: the waitlist promotion prompt, and the two settings an
 * organizer changes under time pressure.
 *
 * Both exist as Client Components for the same structural reason, and it is not styling.
 * **A successful action removes the control that performed it.** Promoting the last person off the
 * waitlist makes the prompt inapplicable; closing registrations replaces `Encerrar` with `Abrir`.
 * If the action state lived inside the control, the result — including the list of people the
 * organizer now has to telephone — would be unmounted along with it, at exactly the moment it
 * became useful.
 *
 * So each of these owns one `useActionState` and stays mounted across the revalidation, rendering
 * the prompt conditionally and the result unconditionally.
 */

import { useActionState } from 'react';

import { ActionResult, ConfirmButton, type AdminAction } from '@/components/admin/confirm-action';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { IDLE } from '@/lib/admin/state';

/* ------------------------------------------------------------------------------------------------
 * Promotion
 * ---------------------------------------------------------------------------------------------- */

/**
 * The dashboard's single most important behaviour, and the entire user-facing consequence of the
 * "no automatic promotion" decision (D2).
 *
 * The prompt appears only when there are free seats **and** people waiting. Its copy names the real
 * number, and states plainly that the system sends no messages — because after this button is
 * pressed, somebody has to make telephone calls.
 */
export function PromotionPrompt({
  action,
  headroom,
  waitlistCount,
}: {
  action: AdminAction;
  headroom: number;
  waitlistCount: number;
}) {
  const [state, formAction, isPending] = useActionState(action, IDLE);

  const promotable = Math.min(headroom, waitlistCount);

  if (promotable <= 0 && state.status === 'idle') return null;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-admin-panel)] border border-status-waitlisted/40 bg-status-waitlisted-soft p-5">
      {promotable > 0 ? (
        <>
          <p className="text-body text-admin-ink">
            Há <strong>{headroom}</strong> {headroom === 1 ? 'vaga livre' : 'vagas livres'} e{' '}
            <strong>{waitlistCount}</strong> {waitlistCount === 1 ? 'pessoa' : 'pessoas'} na lista de
            espera.
          </p>
          <ConfirmButton
            formAction={formAction}
            isPending={isPending}
            settledAt={state}
            fields={{ count: String(promotable) }}
            label={`Promover ${promotable === 1 ? 'a próxima' : `as próximas ${promotable}`}`}
            tone="primary"
            className="items-start"
            confirm={{
              title: `Promover ${promotable} ${promotable === 1 ? 'pessoa' : 'pessoas'} da lista de espera?`,
              body: ADMIN_COPY.confirmations.promote(promotable),
              confirmLabel: `Promover ${promotable}`,
            }}
          />
        </>
      ) : null}

      <ActionResult state={state} />
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The two inline settings
 * ---------------------------------------------------------------------------------------------- */

export interface EventControlsProps {
  action: AdminAction;
  capacity: number;
  waitlistEnabled: boolean;
  registrationState: 'open' | 'closed';
  settingsVersion: number;
  waitlistCount: number;
}

/**
 * `Inscrições` and `Lista de espera`, on the dashboard as well as in Settings because they are the
 * two things an organizer changes minutes before the doors open, often on a phone
 * (ADMIN-SPEC.md section 3.4).
 *
 * Each control sends the **whole** settings triple plus the `settings_version` it loaded, because
 * `update_event_settings` is one atomic operation over all three. Closing asks for confirmation and
 * opening does not — opening is the safe direction. Turning the waitlist off states the consequence
 * for the people already queued.
 */
export function EventControls({
  action,
  capacity,
  waitlistEnabled,
  registrationState,
  settingsVersion,
  waitlistCount,
}: EventControlsProps) {
  const [state, formAction, isPending] = useActionState(action, IDLE);

  const base = {
    capacity: String(capacity),
    settingsVersion: String(settingsVersion),
  };
  const capacityUndefined = capacity <= 0;

  return (
    <section className="flex flex-col gap-5 rounded-[var(--radius-admin-panel)] border border-admin-line bg-admin-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-label text-admin-ink">{ADMIN_COPY.dashboard.registrationsLabel}</p>
          <p className="text-hint text-admin-muted">
            {registrationState === 'open'
              ? ADMIN_COPY.dashboard.open
              : ADMIN_COPY.dashboard.closed}
          </p>
        </div>

        {registrationState === 'open' ? (
          <ConfirmButton
            formAction={formAction}
            isPending={isPending}
            settledAt={state}
            fields={{
              ...base,
              waitlistEnabled: String(waitlistEnabled),
              registrationState: 'closed',
            }}
            label="Encerrar inscrições"
            tone="secondary"
            className="items-end"
            confirm={{
              title: 'Encerrar as inscrições?',
              body: ADMIN_COPY.confirmations.closeRegistrations,
              confirmLabel: 'Encerrar',
            }}
          />
        ) : (
          /*
           * Opening asks nothing — it is the safe direction. At capacity 0 the database refuses it
           * outright (invariant I7), so the control is disabled with that sentence as its
           * explanation rather than offered and then failed.
           */
          <ConfirmButton
            formAction={formAction}
            isPending={isPending}
            settledAt={state}
            fields={{
              ...base,
              waitlistEnabled: String(waitlistEnabled),
              registrationState: 'open',
            }}
            label="Abrir inscrições"
            tone="primary"
            className="items-end"
            disabled={capacityUndefined}
            disabledReason={capacityUndefined ? ADMIN_COPY.dashboard.capacityPrompt : undefined}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-admin-line pt-4">
        <div className="flex flex-col gap-1">
          <p className="text-label text-admin-ink">{ADMIN_COPY.dashboard.waitlistLabel}</p>
          <p className="text-hint text-admin-muted">
            {waitlistEnabled ? ADMIN_COPY.dashboard.waitlistOn : ADMIN_COPY.dashboard.waitlistOff}
          </p>
        </div>

        {waitlistEnabled ? (
          <ConfirmButton
            formAction={formAction}
            isPending={isPending}
            settledAt={state}
            fields={{ ...base, waitlistEnabled: 'false', registrationState }}
            label="Desativar lista de espera"
            tone="secondary"
            className="items-end"
            confirm={{
              title: 'Desativar a lista de espera?',
              body: ADMIN_COPY.confirmations.waitlistOff(waitlistCount),
              confirmLabel: 'Desativar',
            }}
          />
        ) : (
          <ConfirmButton
            formAction={formAction}
            isPending={isPending}
            settledAt={state}
            fields={{ ...base, waitlistEnabled: 'true', registrationState }}
            label="Ativar lista de espera"
            tone="secondary"
            className="items-end"
          />
        )}
      </div>

      <ActionResult state={state} />
    </section>
  );
}

'use client';

/**
 * The three settings, as one deliberate commit.
 *
 * **Not auto-saving.** Capacity and open/closed are consequential enough to deserve a button, and
 * the button is inert until something actually changes (ADMIN-SPEC.md section 5.3).
 *
 * **Optimistic concurrency on `settings_version`.** The form carries the token it loaded and sends
 * it back; the RPC refuses a stale one. Every successful save returns the *new* token, which is
 * held in state here, so a second edit in the same sitting needs no page reload. The token counts
 * administrator settings changes only — never `updated_at`, which the counter trigger bumps on
 * every public registration — so an organizer can leave this page open all evening while the event
 * fills up and still save without a spurious conflict (invariant I8).
 *
 * The two cross-field rules that protect the event are enforced in the database, which is the only
 * place they can hold. What this form does is *anticipate* them: `Abertas` is disabled while
 * capacity reads 0, and a capacity below `confirmed_count` is flagged as it is typed — so a refusal
 * is expected rather than discovered on save.
 */

import { useActionState, useId, useState } from 'react';

import { ActionResult } from '@/components/admin/confirm-action';
import { BUTTON_PRIMARY, INPUT_CLASS } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { IDLE, type AdminActionState } from '@/lib/admin/state';

type AdminAction = (previous: AdminActionState, formData: FormData) => Promise<AdminActionState>;

export interface SettingsFormProps {
  action: AdminAction;
  initial: {
    readonly capacity: number;
    readonly waitlistEnabled: boolean;
    readonly registrationState: 'open' | 'closed';
    readonly settingsVersion: number;
  };
  /** The floor the database will enforce. Shown, and checked here, before the save is attempted. */
  confirmedCount: number;
  /** People already queued — the waitlist switch's helper text states their fate exactly. */
  waitlistCount: number;
}

export function SettingsForm({
  action,
  initial,
  confirmedCount,
  waitlistCount,
}: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState(action, IDLE);

  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [waitlistEnabled, setWaitlistEnabled] = useState(initial.waitlistEnabled);
  const [registrationState, setRegistrationState] = useState(initial.registrationState);

  /*
   * The token the next save will carry. It starts as the one the server rendered and advances to
   * whatever the last successful save returned — which is what makes two edits in a row work.
   */
  const [version, setVersion] = useState(initial.settingsVersion);
  const [baseline, setBaseline] = useState(initial);

  /*
   * A completed save advances both the token and the baseline, adjusted during render rather than
   * in an effect — the pattern React documents for "a value changed, derive from it". An effect
   * would commit one frame in which the save had succeeded but the button still read as dirty.
   *
   * Only a completed save moves the baseline. Typing must not, or the button would never enable.
   */
  const [seenState, setSeenState] = useState(state);

  if (state !== seenState) {
    setSeenState(state);
    if (state.status === 'ok' && typeof state.settingsVersion === 'number') {
      setVersion(state.settingsVersion);
      setBaseline({
        capacity: Number(capacity),
        waitlistEnabled,
        registrationState,
        settingsVersion: state.settingsVersion,
      });
    }
  }

  const capacityId = useId();
  const numericCapacity = /^\d+$/.test(capacity.trim()) ? Number(capacity.trim()) : Number.NaN;
  const capacityIsNumber = Number.isFinite(numericCapacity);
  const belowConfirmed = capacityIsNumber && numericCapacity < confirmedCount;
  const capacityIsZero = capacityIsNumber && numericCapacity === 0;

  const dirty =
    numericCapacity !== baseline.capacity ||
    waitlistEnabled !== baseline.waitlistEnabled ||
    registrationState !== baseline.registrationState;

  const blocked =
    !capacityIsNumber || belowConfirmed || (capacityIsZero && registrationState === 'open');

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="settingsVersion" value={version} />
      <input type="hidden" name="waitlistEnabled" value={String(waitlistEnabled)} />
      <input type="hidden" name="registrationState" value={registrationState} />

      {/* Capacity ------------------------------------------------------------------------ */}
      <div className="flex flex-col gap-2">
        <label htmlFor={capacityId} className="text-label text-admin-ink">
          {ADMIN_COPY.settings.capacityLabel}
        </label>
        <input
          id={capacityId}
          name="capacity"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={capacity}
          onChange={(field) => setCapacity(field.target.value.replace(/\D/g, ''))}
          aria-invalid={belowConfirmed || !capacityIsNumber ? true : undefined}
          aria-describedby={`${capacityId}-hint`}
          className={`${INPUT_CLASS} max-w-32`}
        />
        <p id={`${capacityId}-hint`} className="text-hint flex flex-col gap-1 text-admin-muted">
          <span>{ADMIN_COPY.settings.capacityHint}</span>
          <span>{ADMIN_COPY.settings.capacityFloor(confirmedCount)}</span>
        </p>
        {belowConfirmed ? (
          <p role="alert" className="text-hint text-admin-danger">
            Não é possível definir a capacidade abaixo de {confirmedCount} inscrições confirmadas.
            Cancele inscrições primeiro.
          </p>
        ) : null}
      </div>

      {/* Registrations ------------------------------------------------------------------- */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label text-admin-ink">
          {ADMIN_COPY.dashboard.registrationsLabel}
        </legend>

        <div
          role="radiogroup"
          aria-label={ADMIN_COPY.dashboard.registrationsLabel}
          className="inline-flex w-fit rounded-[var(--radius-admin-control)] border border-admin-line-strong p-1"
        >
          {(['open', 'closed'] as const).map((option) => {
            const selected = registrationState === option;
            const disabled = option === 'open' && capacityIsZero;

            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => setRegistrationState(option)}
                className={`min-h-11 rounded-[var(--radius-admin-control)] px-4 text-label transition-colors duration-150 ease-settle disabled:cursor-not-allowed disabled:opacity-55 ${
                  selected ? 'bg-admin-blue text-white' : 'text-admin-ink hover:bg-admin-field'
                }`}
              >
                {option === 'open' ? ADMIN_COPY.dashboard.open : ADMIN_COPY.dashboard.closed}
              </button>
            );
          })}
        </div>

        <p className="text-hint text-admin-muted">{ADMIN_COPY.settings.registrationsHint}</p>
        {capacityIsZero ? (
          <p className="text-hint text-admin-danger">{ADMIN_COPY.dashboard.capacityPrompt}</p>
        ) : null}
      </fieldset>

      {/* Waitlist ------------------------------------------------------------------------ */}
      <div className="flex flex-col gap-2">
        <label className="flex min-h-11 w-fit items-center gap-3 text-label text-admin-ink">
          <input
            type="checkbox"
            role="switch"
            checked={waitlistEnabled}
            onChange={(field) => setWaitlistEnabled(field.target.checked)}
            className="size-5 accent-[var(--color-admin-blue)]"
          />
          {ADMIN_COPY.dashboard.waitlistLabel}
        </label>
        <p className="text-hint text-admin-muted">
          {waitlistEnabled || waitlistCount === 0
            ? ADMIN_COPY.settings.waitlistHint
            : ADMIN_COPY.confirmations.waitlistOff(waitlistCount)}
        </p>
      </div>

      <div className="flex flex-col items-start gap-3 border-t border-admin-line pt-5">
        <button
          type="submit"
          disabled={!dirty || blocked || isPending}
          aria-busy={isPending}
          className={BUTTON_PRIMARY}
        >
          {isPending ? ADMIN_COPY.settings.saving : ADMIN_COPY.settings.save}
        </button>

        <ActionResult state={state} pending={isPending} />
      </div>
    </form>
  );
}

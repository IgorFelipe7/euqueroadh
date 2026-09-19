'use client';

/**
 * Creating or reconfiguring one raffle.
 *
 * Four fields and one checkbox, in the light admin. This is the screen used sitting down, the day
 * before — the stage is the one used live — so it is an ordinary form with no theatre in it.
 *
 * `pool` and `excludePreviousWinners` freeze once a draw exists, and the database refuses a change
 * with `raffle_already_drawn`. They are disabled here too, with the reason stated, so the refusal is
 * something the organizer reads before acting rather than after.
 */

import { useActionState } from 'react';

import { saveRaffleAction } from '@/app/admin/(protected)/actions';
import { BUTTON_PRIMARY, INPUT_CLASS, Notice } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { IDLE } from '@/lib/admin/state';
import type { RaffleSummary } from '@/lib/data/admin/raffles';

const LABEL_CLASS = 'text-hint font-semibold text-admin-ink';
const HINT_CLASS = 'text-hint text-admin-muted';

export function RaffleForm({
  raffle,
  eligibleAttended,
  eligibleConfirmed,
}: {
  /** `null` creates. A summary edits, and locks the two fields the draws depend on. */
  raffle: RaffleSummary | null;
  eligibleAttended: number | null;
  eligibleConfirmed: number | null;
}) {
  const [state, submit, pending] = useActionState(saveRaffleAction, IDLE);

  const locked = (raffle?.totalDraws ?? 0) > 0;
  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={submit} className="flex flex-col gap-4">
      {raffle ? <input type="hidden" name="raffleId" value={raffle.id} /> : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="raffle-name" className={LABEL_CLASS}>
          {ADMIN_COPY.raffles.nameLabel}
        </label>
        <input
          id="raffle-name"
          name="name"
          type="text"
          required
          maxLength={80}
          defaultValue={raffle?.name ?? ''}
          placeholder={ADMIN_COPY.raffles.namePlaceholder}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? 'raffle-name-error' : undefined}
          className={INPUT_CLASS}
        />
        {fieldErrors.name ? (
          <p id="raffle-name-error" className="text-hint text-admin-danger">
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="raffle-prize" className={LABEL_CLASS}>
          {ADMIN_COPY.raffles.prizeLabel}
        </label>
        <input
          id="raffle-prize"
          name="prizeLabel"
          type="text"
          maxLength={80}
          defaultValue={raffle?.prizeLabel ?? ''}
          placeholder={ADMIN_COPY.raffles.prizePlaceholder}
          className={INPUT_CLASS}
        />
        <p className={HINT_CLASS}>Aparece no palco, acima do nome sorteado.</p>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={locked}>
        <legend className={LABEL_CLASS}>{ADMIN_COPY.raffles.poolLabel}</legend>

        <label className="flex min-h-11 items-center gap-3 text-input text-admin-ink">
          <input
            type="radio"
            name="pool"
            value="attended"
            defaultChecked={(raffle?.pool ?? 'attended') === 'attended'}
            className="size-5"
          />
          <span>
            {ADMIN_COPY.raffles.poolAttended}
            {eligibleAttended !== null ? (
              <span className="text-admin-muted"> · {ADMIN_COPY.raffles.eligible(eligibleAttended)}</span>
            ) : null}
          </span>
        </label>

        <label className="flex min-h-11 items-center gap-3 text-input text-admin-ink">
          <input
            type="radio"
            name="pool"
            value="confirmed"
            defaultChecked={raffle?.pool === 'confirmed'}
            className="size-5"
          />
          <span>
            {ADMIN_COPY.raffles.poolConfirmed}
            {eligibleConfirmed !== null ? (
              <span className="text-admin-muted"> · {ADMIN_COPY.raffles.eligible(eligibleConfirmed)}</span>
            ) : null}
          </span>
        </label>

        <p className={HINT_CLASS}>{ADMIN_COPY.raffles.poolHint}</p>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="raffle-winners" className={LABEL_CLASS}>
          {ADMIN_COPY.raffles.winnersLabel}
        </label>
        <input
          id="raffle-winners"
          name="winnersTarget"
          type="number"
          inputMode="numeric"
          required
          min={1}
          max={50}
          defaultValue={raffle?.winnersTarget ?? 1}
          aria-invalid={fieldErrors.winnersTarget ? true : undefined}
          aria-describedby={fieldErrors.winnersTarget ? 'raffle-winners-error' : undefined}
          className={`${INPUT_CLASS} max-w-32`}
        />
        {fieldErrors.winnersTarget ? (
          <p id="raffle-winners-error" className="text-hint text-admin-danger">
            {fieldErrors.winnersTarget}
          </p>
        ) : null}
      </div>

      <label className="flex min-h-11 items-start gap-3 text-input text-admin-ink">
        <input
          type="checkbox"
          name="excludePreviousWinners"
          value="true"
          disabled={locked}
          defaultChecked={raffle?.excludePreviousWinners ?? true}
          className="mt-0.5 size-5"
        />
        <span>{ADMIN_COPY.raffles.excludeLabel}</span>
      </label>

      {locked ? (
        <Notice tone="warning">{ADMIN_COPY.raffles.statusRunning}: quem participa e a exclusão de quem já ganhou não podem mais mudar. Reinicie o sorteio para alterá-los.</Notice>
      ) : null}

      {state.status === 'error' ? (
        <Notice tone="error" role="alert">
          {state.message}
        </Notice>
      ) : null}
      {state.status === 'ok' ? (
        <Notice tone="success" role="status">
          {state.message}
        </Notice>
      ) : null}

      <div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? ADMIN_COPY.raffles.saving : ADMIN_COPY.raffles.save}
        </button>
      </div>
    </form>
  );
}

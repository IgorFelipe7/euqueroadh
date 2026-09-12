'use client';

/**
 * Inviting an administrator.
 *
 * The warning about full access is not decoration — it is the only place the consequence of the
 * flat permission model is stated, and inviting someone *is* a security decision: there are no
 * roles, so every organizer can read every participant's name, age and telephone number
 * (ADMIN-SPEC.md section 6.2).
 *
 * The field is a plain `type="email"` input in a real form; the address is validated again in the
 * Server Action and again by the database, because a typo here creates an account for a stranger.
 */

import { useActionState, useId } from 'react';

import { ActionResult } from '@/components/admin/confirm-action';
import { BUTTON_PRIMARY, INPUT_CLASS } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { IDLE, type AdminActionState } from '@/lib/admin/state';

export function InviteForm({
  action,
}: {
  action: (previous: AdminActionState, formData: FormData) => Promise<AdminActionState>;
}) {
  const [state, formAction, isPending] = useActionState(action, IDLE);
  const fieldId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={fieldId} className="text-hint font-semibold text-admin-ink">
            E-mail
          </label>
          <input
            id={fieldId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={state.status === 'error' && state.fieldErrors?.email ? true : undefined}
            className={INPUT_CLASS}
          />
        </div>

        <button type="submit" disabled={isPending} aria-busy={isPending} className={BUTTON_PRIMARY}>
          {isPending ? 'Enviando…' : 'Enviar convite'}
        </button>
      </div>

      <p className="text-hint text-admin-muted">{ADMIN_COPY.team.inviteHint}</p>

      <ActionResult state={state} />
    </form>
  );
}

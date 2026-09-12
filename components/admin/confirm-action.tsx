'use client';

/**
 * The confirmation dialog, and the region that reports what an action did.
 *
 * **The two are deliberately separate components.** A result must outlive the control that produced
 * it: promoting the last person off the waitlist removes the promotion prompt from the page, and
 * cancelling a registration removes the `Cancelar inscrição` button — and in both cases the sentence
 * the organizer needs (a name and a telephone number to call) would go with it. So the parent owns
 * the action state and decides where the result lives; `ConfirmButton` owns only the dialog.
 *
 * **A native `<dialog>` opened with `showModal()`.** Focus trapping, Escape-to-close, the backdrop
 * and background inertness come from the platform; a hand-rolled modal would reimplement four
 * accessibility behaviours and get at least one wrong (ADMIN-SPEC.md section 8).
 *
 * **The confirmation is a courtesy, not a control.** Every acknowledgement is re-checked in the
 * Server Action; a `disabled` button protects the person clicking, never the endpoint.
 */

import { useActionState, useEffect, useId, useRef, useState } from 'react';

import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  PHONE_LINK,
} from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { IDLE, type AdminActionState } from '@/lib/admin/state';
import { formatForDisplay } from '@/lib/domain/phone';

export type AdminAction = (
  previous: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>;

export interface ConfirmCopy {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  /** Adds the "Entendo que esta ação é permanente" checkbox, required before confirming. */
  readonly acknowledge?: boolean;
}

export interface ConfirmButtonProps {
  /** The bound action from the parent's `useActionState`. */
  formAction: (formData: FormData) => void;
  isPending: boolean;
  /** Hidden inputs. Values are re-validated server-side; nothing here is trusted as authority. */
  fields?: Readonly<Record<string, string>>;
  label: string;
  tone?: 'primary' | 'secondary' | 'danger';
  /** Omit to submit immediately — for actions with no consequence worth pausing over. */
  confirm?: ConfirmCopy;
  /** Rendered inside the dialog above the buttons — used by the purge block's exact counts. */
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  /** A short sentence under the trigger explaining why it is unavailable. */
  disabledReason?: string;
  /** Changes identity when the action settles, which is what closes the dialog. */
  settledAt?: unknown;
}

const TONE_CLASS = {
  primary: BUTTON_PRIMARY,
  secondary: BUTTON_SECONDARY,
  danger: BUTTON_DANGER,
} as const;

export function ConfirmButton({
  formAction,
  isPending,
  fields = {},
  label,
  tone = 'secondary',
  confirm,
  children,
  className = '',
  disabled = false,
  disabledReason,
  settledAt,
}: ConfirmButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const titleId = useId();

  // The dialog closes the moment the action settles, whatever it returned: the result is rendered
  // by the parent, where it stays readable after the modal has gone.
  useEffect(() => {
    if (dialog.current?.open) {
      dialog.current.close();
      trigger.current?.focus();
    }
    // `settledAt` is the parent's action state; it changes identity exactly once per completion.
  }, [settledAt]);

  const hidden = Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {confirm ? (
        <>
          <button
            ref={trigger}
            type="button"
            disabled={disabled || isPending}
            aria-busy={isPending}
            onClick={() => dialog.current?.showModal()}
            className={TONE_CLASS[tone]}
          >
            {label}
          </button>

          <dialog
            ref={dialog}
            aria-labelledby={titleId}
            onClose={() => setAcknowledged(false)}
            className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-[var(--radius-admin-panel)] border border-admin-line bg-admin-surface p-0 text-admin-ink backdrop:bg-black/40"
          >
            <form action={formAction} className="flex flex-col gap-4 p-5">
              {hidden}

              <h2 id={titleId} className="text-[1.125rem] leading-snug font-bold">
                {confirm.title}
              </h2>
              <p className="text-hint text-admin-muted">{confirm.body}</p>

              {children}

              {confirm.acknowledge ? (
                <label className="flex min-h-11 items-center gap-3 text-hint">
                  <input
                    type="checkbox"
                    name="acknowledged"
                    value="true"
                    checked={acknowledged}
                    onChange={(input) => setAcknowledged(input.target.checked)}
                    className="size-5 accent-[var(--color-admin-danger)]"
                  />
                  {ADMIN_COPY.confirmations.acknowledgePermanent}
                </label>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {/*
                  `formMethod="dialog"` closes the dialog without submitting the action — the
                  platform's own cancel, so Escape and this button do exactly the same thing.
                */}
                <button type="submit" formMethod="dialog" className={BUTTON_SECONDARY}>
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={isPending || (confirm.acknowledge === true && !acknowledged)}
                  aria-busy={isPending}
                  className={tone === 'danger' ? BUTTON_DANGER : BUTTON_PRIMARY}
                >
                  {isPending ? 'Aguarde…' : confirm.confirmLabel}
                </button>
              </div>
            </form>
          </dialog>
        </>
      ) : (
        <form action={formAction}>
          {hidden}
          <button
            ref={trigger}
            type="submit"
            disabled={disabled || isPending}
            aria-busy={isPending}
            className={`${TONE_CLASS[tone]} w-full`}
          >
            {isPending ? 'Aguarde…' : label}
          </button>
        </form>
      )}

      {disabled && disabledReason ? (
        <p className="text-hint text-admin-muted">{disabledReason}</p>
      ) : null}
    </div>
  );
}

/**
 * The self-contained form of the above, for the places where the control cannot disappear as a
 * consequence of its own success — the purge block, whose panel is always on the page.
 */
export function ConfirmAction({
  action,
  ...rest
}: Omit<ConfirmButtonProps, 'formAction' | 'isPending' | 'settledAt'> & { action: AdminAction }) {
  const [state, formAction, isPending] = useActionState(action, IDLE);

  return (
    <div className="flex flex-col gap-2">
      <ConfirmButton
        {...rest}
        formAction={formAction}
        isPending={isPending}
        settledAt={state}
      />
      <ActionResult state={state} />
    </div>
  );
}

/**
 * What happened, announced.
 *
 * `role="status"` rather than `alert` for success and `alert` for failure: a completed action is
 * polite, a refused one interrupts. The promoted list is rendered with names **and** telephone
 * numbers and stays on screen until the page changes, because the organizer has to make those calls
 * and the system sends no messages (ADMIN-SPEC.md section 3.3).
 */
export function ActionResult({
  state,
  pending = false,
}: {
  state: AdminActionState;
  /**
   * True while a *new* submission is in flight. `useActionState` keeps the previous result during
   * the pending phase, so without this the second save of an identical form shows last time's
   * "Configurações atualizadas." as though it were this time's — a message that is stale and
   * indistinguishable from a fresh one.
   */
  pending?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (state.status === 'idle' || pending) return null;

  const isError = state.status === 'error';
  const promoted = state.status === 'ok' ? (state.promoted ?? []) : [];

  const callList = promoted
    .map((person) => `${person.name} — ${formatForDisplay(person.phoneE164)}`)
    .join('\n');

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex flex-col gap-2 rounded-[var(--radius-admin-control)] border px-4 py-3 text-hint ${
        isError
          ? 'border-admin-danger/40 bg-admin-danger-soft'
          : 'border-status-confirmed/40 bg-status-confirmed-soft'
      }`}
    >
      <p className="font-semibold text-admin-ink">{state.message}</p>

      {promoted.length > 0 ? (
        <>
          <ul className="flex flex-col gap-1">
            {promoted.map((person) => (
              <li key={person.id} className="text-admin-ink">
                {person.name} —{' '}
                <a href={`tel:${person.phoneE164}`} className={PHONE_LINK}>
                  {formatForDisplay(person.phoneE164)}
                </a>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(callList);
                setCopied(true);
              } catch {
                // A clipboard the browser refuses is not an error worth a dialog: the list is on
                // screen and can be read from it.
                setCopied(false);
              }
            }}
            className="min-h-11 self-start px-2 text-label text-admin-blue underline underline-offset-4"
          >
            {copied ? 'Lista copiada' : 'Copiar lista'}
          </button>
        </>
      ) : null}

      {isError && state.code === 'settings_conflict' ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 self-start px-2 text-label text-admin-blue underline underline-offset-4"
        >
          {ADMIN_COPY.settings.reload}
        </button>
      ) : null}
    </div>
  );
}

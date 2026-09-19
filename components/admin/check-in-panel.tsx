'use client';

/**
 * The door's operational block: open check-in, put the QR on a screen, close it again.
 *
 * It sits **above** the manual search on `/admin/presenca` rather than replacing it, and the panel says
 * so in its own copy. Self check-in handles the two hundred people who have a charged phone and a
 * signal; the list below handles everybody else, and an event that depended exclusively on the first
 * would be an event with no answer for the first person whose battery died.
 *
 * ## Why this is a Client Component
 *
 * The same structural reason as the dashboard's controls: **a successful action removes the control
 * that performed it.** Opening check-in replaces `Abrir` with `Fechar` and `Exibir QR`, and closing it
 * does the reverse. If the action state lived inside the button, the sentence confirming what just
 * happened would be unmounted at exactly the moment it became useful. So this owns one
 * `useActionState`, stays mounted across the revalidation, and renders the result unconditionally.
 *
 * ## What it never renders
 *
 * The session token, as text. It is in the `href` of the wall link and in the QR the wall draws, both
 * of which are necessary; it is not printed on this screen, where it would be read by anyone standing
 * behind an organizer and photographed along with the rest of the panel.
 */

import { useActionState } from 'react';

import { ActionResult, ConfirmButton, type AdminAction } from '@/components/admin/confirm-action';
import { BUTTON_PRIMARY } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { IDLE } from '@/lib/admin/state';
import { formatTime } from '@/lib/domain/format';
import { ROUTES } from '@/lib/routes';

const COPY = ADMIN_COPY.checkIn;

export function CheckInPanel({
  openAction,
  closeAction,
  /** `null` when check-in is closed — or when the open session has expired (see the DAL). */
  isOpen,
  expiresAt,
}: {
  openAction: AdminAction;
  closeAction: AdminAction;
  isOpen: boolean;
  expiresAt: string | null;
}) {
  // One state for both directions. The two actions are mutually exclusive on screen, so a single
  // result region is honest: whatever just happened is the thing the organizer needs to read.
  const [openState, openFormAction, openPending] = useActionState(openAction, IDLE);
  const [closeState, closeFormAction, closePending] = useActionState(closeAction, IDLE);

  const pending = openPending || closePending;
  const latest = closeState.status === 'idle' ? openState : closeState;

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-admin-panel)] border border-admin-line bg-admin-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[1.125rem] leading-snug font-bold text-admin-ink">{COPY.title}</h2>
          <p className="text-hint text-admin-muted">{COPY.description}</p>
        </div>

        {/*
          The state, as a labelled pill. Colour is never the only carrier: the word `Aberto` or
          `Fechado` is what a screen reader announces and what an organizer reads at arm's length.
        */}
        <span
          data-testid="check-in-state"
          className={`inline-flex items-center gap-1.5 rounded-[var(--radius-admin-control)] px-2 py-1 text-[0.8125rem] leading-tight font-semibold ${
            isOpen
              ? 'bg-status-confirmed-soft text-status-confirmed'
              : 'bg-status-cancelled-soft text-status-cancelled'
          }`}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {isOpen ? COPY.stateOpen : COPY.stateClosed}
        </span>
      </header>

      {/*
        NO ARRIVAL COUNT HERE, deliberately.

        The launch brief sketched this panel as "status + present count", and the count was built and
        then removed: the screen already renders `47 / 48 presentes` in the panel directly below, from
        the same read. Two copies of one number on one screen is how an organizer ends up comparing
        them during an outage and believing the difference means something. The panel owns the
        SESSION — the thing only it can tell you — and the counter below owns the number.
      */}

      {isOpen ? (
        <>
          <div className="flex flex-wrap gap-2">
            {/*
              A plain link, not a button: the wall is a page, and an organizer opening it in a second
              window — or dragging that window to a projector — is the normal way this gets used.
              `target="_blank"` so the admin screen they are working on stays where it is.
            */}
            <a
              href={ROUTES.adminCheckInWall}
              target="_blank"
              rel="noopener"
              className={`${BUTTON_PRIMARY} no-underline`}
            >
              {COPY.showWall}
            </a>

            <ConfirmButton
              formAction={closeFormAction}
              isPending={pending}
              settledAt={closeState}
              label={pending && closePending ? COPY.closing : COPY.close}
              tone="secondary"
              confirm={{
                title: COPY.close + '?',
                body: COPY.confirmClose,
                confirmLabel: COPY.close,
                acknowledge: true,
              }}
            />

            <ConfirmButton
              formAction={openFormAction}
              isPending={pending}
              settledAt={openState}
              fields={{ rotate: 'true' }}
              label={pending && openPending ? COPY.rotating : COPY.rotate}
              tone="secondary"
              confirm={{
                title: COPY.rotate + '?',
                body: COPY.confirmRotate,
                confirmLabel: COPY.rotate,
                acknowledge: true,
              }}
            />
          </div>

          {expiresAt ? (
            <p className="text-hint text-admin-muted">
              {COPY.openHint(formatTime(new Date(expiresAt)))}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <form action={openFormAction} className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              aria-busy={openPending}
              className={BUTTON_PRIMARY}
            >
              {openPending ? COPY.opening : COPY.open}
            </button>
          </form>

          <p className="text-hint text-admin-muted">{COPY.closedHint}</p>
        </>
      )}

      <ActionResult state={latest} />

      <p className="text-hint border-t border-admin-line pt-4 text-admin-muted">{COPY.fallback}</p>
    </section>
  );
}

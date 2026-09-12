'use client';

/**
 * The participant list, and the detail panel every row opens.
 *
 * **One semantic `<table>` at every width**, with priority columns rather than a second layout
 * (ADMIN-SPEC.md section 4.3). Two alternatives were rejected for concrete reasons: a horizontally
 * scrolling table hides the actions column behind a swipe and fails WCAG 2.2 SC 2.4.11 when a
 * focused control sits off-screen, and a card list rendered alongside the table and toggled with CSS
 * duplicates every participant's data in the DOM, which a screen reader may announce twice. Below
 * 640 px, `Idade` and `Inscrita em` are simply hidden — one tap away in the panel, never lost.
 *
 * A Client Component, because opening a panel and editing in place are browser interactions. What
 * it receives is **one page of rows** — the same fifty that are on screen. Filtering, sorting and
 * pagination all happen in the database; the full participant list is never shipped here
 * (section 4.1).
 */

import { useActionState, useEffect, useId, useRef, useState } from 'react';

import {
  ActionResult,
  ConfirmButton,
  type AdminAction,
} from '@/components/admin/confirm-action';
import { BUTTON_PRIMARY, INPUT_CLASS, PHONE_LINK, SR_ONLY, StatusPill } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import type { RegistrationRowStatus } from '@/lib/admin/filters';
import { IDLE } from '@/lib/admin/state';
import { formatDateTime } from '@/lib/domain/format';
import { formatForDisplay } from '@/lib/domain/phone';

export interface TableRow {
  readonly id: string;
  readonly fullName: string;
  readonly age: number;
  readonly phoneE164: string;
  readonly status: RegistrationRowStatus;
  readonly createdAt: string;
  readonly notes: string | null;
  readonly waitlistPosition: number | null;
}

export interface RegistrationsTableProps {
  rows: readonly TableRow[];
  /** Free seats right now. `Confirmar vaga` is offered only while this is above zero. */
  headroom: number;
  actions: {
    readonly edit: AdminAction;
    readonly cancel: AdminAction;
    readonly remove: AdminAction;
    readonly promote: AdminAction;
  };
}

export function RegistrationsTable({ rows, headroom, actions }: RegistrationsTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);

  const open = rows.find((row) => row.id === openId) ?? null;

  // `showModal()` gives focus trapping, Escape-to-close and an inert background for free. Opening
  // it in an effect keeps the DOM and React's idea of "which row" in step.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  function close() {
    setOpenId(null);
    lastTrigger.current?.focus();
  }

  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-admin-panel)] border border-admin-line bg-admin-surface">
        <table className="w-full border-collapse text-left">
          <caption className={SR_ONLY}>
            Inscrições, com nome, idade, celular, status e data. Cada linha abre um painel com os
            detalhes e as ações.
          </caption>
          <thead>
            <tr className="border-b border-admin-line">
              <Th>Nome</Th>
              <Th className="hidden sm:table-cell">Idade</Th>
              <Th className="hidden sm:table-cell">Celular</Th>
              <Th>Status</Th>
              <Th className="hidden sm:table-cell">Inscrita em</Th>
              <th scope="col" className={SR_ONLY}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-admin-line last:border-0">
                <td className="px-3 py-2 align-middle">
                  <span className="text-label block max-w-[28ch] [overflow-wrap:anywhere] text-admin-ink">
                    {row.fullName}
                  </span>
                  {/*
                    Below 640 px the number moves under the name, as TEXT rather than as a link
                    (ADMIN-SPEC.md section 4.3: "Nome, with the phone beneath it in text-muted").
                    A `tel:` link here would be a 20px target wedged between two 40px rows — WCAG
                    2.2 SC 2.5.8 fails it, and a thumb would hit the wrong person. The dialer
                    affordance on a phone is the detail panel's full-width number, one tap away.
                  */}
                  <span className="text-hint block text-admin-muted sm:hidden">
                    {formatForDisplay(row.phoneE164)}
                  </span>
                </td>
                <td className="hidden px-3 py-2 align-middle tabular-nums sm:table-cell">
                  {row.age}
                </td>
                <td className="hidden px-3 py-2 align-middle sm:table-cell">
                  {/* On a phone this list becomes a dialer, which is the actual mobile use case. */}
                  <a href={`tel:${row.phoneE164}`} className={PHONE_LINK}>
                    {formatForDisplay(row.phoneE164)}
                  </a>
                </td>
                <td className="px-3 py-2 align-middle">
                  <StatusPill status={row.status} position={row.waitlistPosition} />
                </td>
                <td className="hidden px-3 py-2 align-middle text-hint text-admin-muted sm:table-cell">
                  {formatDateTime(new Date(row.createdAt))}
                </td>
                {/*
                  `p-0`, with the 44px target supplied by the button itself. With padding on the
                  cell the button was taller than the row it sat in, so consecutive rows' triggers
                  overlapped — which WCAG 2.2 SC 2.5.8 counts as an obscured target, and a thumb
                  counts as hitting the wrong person's row. The row grows to the button instead.
                */}
                <td className="p-0 text-right align-middle">
                  <button
                    type="button"
                    onClick={(clickEvent) => {
                      lastTrigger.current = clickEvent.currentTarget;
                      setOpenId(row.id);
                    }}
                    className="ml-auto flex h-11 w-11 items-center justify-center rounded-[var(--radius-admin-control)] text-admin-blue hover:bg-admin-field"
                  >
                    <span className={SR_ONLY}>Ver detalhes de {row.fullName}</span>
                    <span aria-hidden="true">⋯</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialog}
        onClose={close}
        aria-label={open ? `Inscrição de ${open.fullName}` : 'Inscrição'}
        className="m-auto w-[min(32rem,calc(100vw-1.5rem))] rounded-[var(--radius-admin-panel)] border border-admin-line bg-admin-surface p-0 text-admin-ink backdrop:bg-black/40"
      >
        {open ? (
          <RegistrationDetail
            key={open.id}
            row={open}
            headroom={headroom}
            actions={actions}
            onClose={close}
          />
        ) : null}
      </dialog>
    </>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`text-hint px-3 py-2 font-semibold tracking-wide text-admin-muted uppercase ${className}`}
    >
      {children}
    </th>
  );
}

/**
 * Everything about one participant, and every action available on them.
 *
 * Actions are full-width buttons at 44 px, because this panel is how the list works on a phone.
 * Availability follows the domain rather than taste: `Confirmar vaga` needs a waitlisted row and a
 * free seat, editing needs a row that is not cancelled, and `Excluir definitivamente` is always
 * available because the right to erasure does not require cancelling first.
 *
 * **The three action states are owned here, not inside the buttons.** Cancelling a registration
 * removes the `Cancelar inscrição` button from this panel — and with it, if the state lived there,
 * the confirmation that the cancellation happened at all. The results are rendered below the
 * buttons, where they survive their own control disappearing.
 */
function RegistrationDetail({
  row,
  headroom,
  actions,
  onClose,
}: {
  row: TableRow;
  headroom: number;
  actions: RegistrationsTableProps['actions'];
  onClose: () => void;
}) {
  const [editState, editAction, isSaving] = useActionState(actions.edit, IDLE);
  const [cancelState, cancelAction, isCancelling] = useActionState(actions.cancel, IDLE);
  const [removeState, removeAction, isRemoving] = useActionState(actions.remove, IDLE);
  const [promoteState, promoteAction, isPromoting] = useActionState(actions.promote, IDLE);

  const nameId = useId();
  const ageId = useId();

  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[1.125rem] leading-snug font-bold [overflow-wrap:anywhere]">
            {row.fullName}
          </h2>
          <StatusPill status={row.status} position={row.waitlistPosition} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 rounded-[var(--radius-admin-control)] px-2 text-admin-muted hover:bg-admin-field"
        >
          <span className={SR_ONLY}>Fechar</span>
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <dl className="text-hint grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-admin-muted">Celular</dt>
        <dd>
          <a href={`tel:${row.phoneE164}`} className={PHONE_LINK}>
            {formatForDisplay(row.phoneE164)}
          </a>
        </dd>
        <dt className="text-admin-muted">Idade</dt>
        <dd>{row.age} anos</dd>
        <dt className="text-admin-muted">Inscrita em</dt>
        <dd>{formatDateTime(new Date(row.createdAt))}</dd>
        {row.waitlistPosition ? (
          <>
            <dt className="text-admin-muted">Posição na lista</dt>
            <dd>{row.waitlistPosition}º</dd>
          </>
        ) : null}
      </dl>

      {row.status !== 'cancelled' ? (
        <form action={editAction} className="flex flex-col gap-3 border-t border-admin-line pt-4">
          <input type="hidden" name="registrationId" value={row.id} />

          <div className="flex flex-col gap-1">
            <label htmlFor={nameId} className="text-hint font-semibold">
              Nome completo
            </label>
            <input
              id={nameId}
              name="fullName"
              defaultValue={row.fullName}
              maxLength={120}
              required
              aria-invalid={
                editState.status === 'error' && editState.fieldErrors?.fullName ? true : undefined
              }
              className={INPUT_CLASS}
            />
            {editState.status === 'error' && editState.fieldErrors?.fullName ? (
              <p className="text-hint text-admin-danger">{editState.fieldErrors.fullName}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={ageId} className="text-hint font-semibold">
              Idade
            </label>
            <input
              id={ageId}
              name="age"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              defaultValue={String(row.age)}
              required
              aria-invalid={
                editState.status === 'error' && editState.fieldErrors?.age ? true : undefined
              }
              className={`${INPUT_CLASS} max-w-24`}
            />
            {editState.status === 'error' && editState.fieldErrors?.age ? (
              <p className="text-hint text-admin-danger">{editState.fieldErrors.age}</p>
            ) : null}
          </div>

          {/*
            The telephone number is not editable: it is the identity key and the duplicate key, so
            changing it would silently move this registration to a different person. To fix a wrong
            number, cancel and register again (DATABASE-SECURITY.md section 6.3).
          */}
          <p className="text-hint text-admin-muted">
            O celular não pode ser alterado — ele identifica a inscrição. Para corrigi-lo, cancele e
            faça uma nova inscrição.
          </p>

          <button type="submit" disabled={isSaving} aria-busy={isSaving} className={BUTTON_PRIMARY}>
            {isSaving ? 'Salvando…' : 'Salvar correção'}
          </button>

          <ActionResult state={editState} />
        </form>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-admin-line pt-4">
        {row.status === 'waitlisted' ? (
          <ConfirmButton
            formAction={promoteAction}
            isPending={isPromoting}
            settledAt={promoteState}
            fields={{ registrationId: row.id }}
            label="Confirmar vaga"
            tone="primary"
            disabled={headroom <= 0}
            disabledReason={headroom <= 0 ? 'Não há vagas livres no momento.' : undefined}
            confirm={{
              title: 'Confirmar a vaga?',
              body: ADMIN_COPY.confirmations.confirmSeat(row.fullName),
              confirmLabel: 'Confirmar vaga',
            }}
          />
        ) : null}
        <ActionResult state={promoteState} />

        {row.status !== 'cancelled' ? (
          <ConfirmButton
            formAction={cancelAction}
            isPending={isCancelling}
            settledAt={cancelState}
            fields={{ registrationId: row.id }}
            label="Cancelar inscrição"
            tone="secondary"
            confirm={{
              title: 'Cancelar a inscrição?',
              body: ADMIN_COPY.confirmations.cancel(row.fullName),
              confirmLabel: 'Cancelar inscrição',
            }}
          />
        ) : null}
        <ActionResult state={cancelState} />

        <ConfirmButton
          formAction={removeAction}
          isPending={isRemoving}
          settledAt={removeState}
          fields={{ registrationId: row.id }}
          label="Excluir definitivamente"
          tone="danger"
          confirm={{
            title: 'Excluir definitivamente',
            body:
              `Isto apaga o nome, a idade e o celular de ${row.fullName} do banco de dados. Não é ` +
              'possível desfazer. Para cancelar a participação sem apagar os dados, use Cancelar inscrição.',
            confirmLabel: 'Excluir definitivamente',
            acknowledge: true,
          }}
        />
        <ActionResult state={removeState} />
      </div>
    </div>
  );
}

'use client';

/**
 * The two actions available on one administrator.
 *
 * Owned by a single component per row for the same structural reason as the dashboard controls:
 * deactivating someone replaces `Desativar` with `Reativar`, so a result held inside the button
 * would be unmounted by its own success. The row's `key` is the administrator's id, so the state
 * survives the revalidation that follows.
 *
 * `Desativar` is the primary option and `Remover definitivamente` is the destructive one, because
 * deactivation is almost always what is actually wanted: it is reversible, it involves no external
 * system, and it keeps a name on the audit trail.
 */

import { useActionState } from 'react';

import { ActionResult, ConfirmButton, type AdminAction } from '@/components/admin/confirm-action';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { IDLE } from '@/lib/admin/state';

export function TeamMemberActions({
  setActive,
  remove,
  userId,
  email,
  isActive,
}: {
  setActive: AdminAction;
  remove: AdminAction;
  userId: string;
  email: string;
  isActive: boolean;
}) {
  const [activeState, activeAction, isTogglingActive] = useActionState(setActive, IDLE);
  const [removeState, removeAction, isRemoving] = useActionState(remove, IDLE);

  return (
    <div className="flex flex-col gap-2">
      <ConfirmButton
        formAction={activeAction}
        isPending={isTogglingActive}
        settledAt={activeState}
        fields={{ userId, active: isActive ? 'false' : 'true' }}
        label={isActive ? ADMIN_COPY.team.deactivate : ADMIN_COPY.team.reactivate}
        tone="secondary"
        confirm={
          isActive
            ? {
                title: `Desativar o acesso de ${email}?`,
                body:
                  'O acesso termina na próxima vez que a pessoa abrir o painel. O registro é ' +
                  'mantido e pode ser reativado.',
                confirmLabel: ADMIN_COPY.team.deactivate,
              }
            : undefined
        }
      />

      <ConfirmButton
        formAction={removeAction}
        isPending={isRemoving}
        settledAt={removeState}
        fields={{ userId }}
        label={ADMIN_COPY.team.remove}
        tone="danger"
        confirm={{
          title: ADMIN_COPY.team.remove,
          body:
            `Isto remove o acesso de ${email} e apaga a conta de autenticação. O histórico de ` +
            'auditoria é mantido, identificando a pessoa pelo nome registrado na época.',
          confirmLabel: ADMIN_COPY.team.remove,
          acknowledge: true,
        }}
      />

      <ActionResult state={activeState} />
      <ActionResult state={removeState} />
    </div>
  );
}

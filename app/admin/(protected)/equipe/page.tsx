import Link from 'next/link';

import { ConfirmAction } from '@/components/admin/confirm-action';
import { InviteForm } from '@/components/admin/invite-form';
import { TeamMemberActions } from '@/components/admin/team-actions';
import { BUTTON_QUIET, Notice, PageHeader, Panel, SR_ONLY } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { getAdminEvent } from '@/lib/data/admin/event';
import { countByStatus } from '@/lib/data/admin/registrations';
import { listTeam } from '@/lib/data/admin/team';
import { requireAdmin } from '@/lib/data/auth';
import { formatDate } from '@/lib/domain/format';
import { ROUTES } from '@/lib/routes';

import {
  inviteAdminAction,
  purgeRegistrationsAction,
  removeAdminAction,
  setAdminActiveAction,
} from '../actions';

export const metadata = { title: ADMIN_COPY.team.title };

/**
 * `/admin/equipe` — who can get in, plus the end-of-event erasure.
 *
 * The two guards on deactivation and removal — you cannot remove your own access, and the last
 * active administrator cannot be removed — are enforced **inside the RPCs**, not here. The interface
 * anticipates them by not offering the controls, but the refusal is the database's, so it holds
 * against a direct POST and against two administrators removing each other at the same moment.
 *
 * `Desativar` is presented first and `Remover definitivamente` sits behind a destructive
 * confirmation, because deactivation is almost always what is actually wanted: it is reversible,
 * involves no external system, and keeps a name on the audit trail.
 */
export default async function TeamPage() {
  const [me, team, event] = await Promise.all([requireAdmin(), listTeam(), getAdminEvent()]);
  const counts = event ? await countByStatus(event.id) : null;

  const activeCount = team.filter((member) => member.isActive).length;

  return (
    <>
      <PageHeader title={ADMIN_COPY.team.title} />

      <Panel className="overflow-hidden">
        <table className="w-full border-collapse text-left">
          <caption className={SR_ONLY}>
            Organizadores com acesso ao painel, com situação e data de entrada.
          </caption>
          <thead>
            <tr className="border-b border-admin-line">
              <th scope="col" className="text-hint px-3 py-2 font-semibold text-admin-muted uppercase">
                Organizador
              </th>
              <th
                scope="col"
                className="text-hint hidden px-3 py-2 font-semibold text-admin-muted uppercase sm:table-cell"
              >
                Desde
              </th>
              <th scope="col" className="text-hint px-3 py-2 font-semibold text-admin-muted uppercase">
                Situação
              </th>
              <th scope="col" className={SR_ONLY}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {team.map((member) => {
              const isMe = member.userId === me.userId;
              // The last active administrator cannot lose access, and nobody can remove their own.
              const guarded = isMe || (member.isActive && activeCount <= 1);

              return (
                <tr key={member.userId} className="border-b border-admin-line last:border-0">
                  <td className="px-3 py-3 align-top">
                    <span className="text-label block [overflow-wrap:anywhere] text-admin-ink">
                      {member.displayName ?? member.email}
                      {isMe ? <span className="text-admin-muted"> {ADMIN_COPY.team.you}</span> : null}
                    </span>
                    {member.displayName ? (
                      <span className="text-hint [overflow-wrap:anywhere] text-admin-muted">
                        {member.email}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-hint hidden px-3 py-3 align-top text-admin-muted sm:table-cell">
                    {formatDate(new Date(member.createdAt))}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className={`text-hint inline-flex items-center gap-1.5 font-semibold ${
                        member.isActive ? 'text-status-confirmed' : 'text-status-cancelled'
                      }`}
                    >
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                      {member.isActive ? ADMIN_COPY.team.active : ADMIN_COPY.team.inactive}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    {guarded ? (
                      <p className="text-hint text-admin-muted">
                        {isMe
                          ? 'Você não pode alterar seu próprio acesso.'
                          : 'É necessário manter pelo menos um organizador ativo.'}
                      </p>
                    ) : (
                      <TeamMemberActions
                        setActive={setAdminActiveAction}
                        remove={removeAdminAction}
                        userId={member.userId}
                        email={member.email}
                        isActive={member.isActive}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel className="flex flex-col gap-4 p-5">
        <h2 className="text-label text-admin-ink">{ADMIN_COPY.team.invite}</h2>
        <InviteForm action={inviteAdminAction} />
      </Panel>

      {/*
        The audit trail is reachable from here rather than from the tab bar: it answers questions
        after the fact, which is not something anyone does during normal operation, and a fifth
        destination would dilute the four that matter (ADMIN-SPEC.md section 10).
      */}
      <p className="text-hint">
        <Link href={ROUTES.adminAudit} className={BUTTON_QUIET}>
          Ver registro de auditoria →
        </Link>
      </p>

      {/* Zona de risco — the retention mechanism (DATABASE-SECURITY.md section 12). */}
      <section className="flex flex-col gap-4 rounded-[var(--radius-admin-panel)] border border-admin-danger/40 bg-admin-danger-soft p-5">
        <h2 className="text-label text-admin-danger">Zona de risco</h2>
        <h3 className="text-[1.125rem] leading-snug font-bold text-admin-ink">
          {ADMIN_COPY.purge.title}
        </h3>
        <p className="text-hint text-admin-ink">{ADMIN_COPY.purge.body}</p>

        {counts ? (
          <p className="text-hint text-admin-ink">
            Inscrições que serão apagadas: <strong>{counts.all}</strong>
            {counts.all > 0 ? (
              <>
                {' '}
                ({counts.confirmed} confirmadas · {counts.waitlisted} na lista de espera ·{' '}
                {counts.cancelled} canceladas)
              </>
            ) : null}
          </p>
        ) : (
          <Notice tone="warning">
            Não foi possível contar as inscrições agora. Recarregue antes de apagar.
          </Notice>
        )}

        <p className="text-hint text-admin-ink">{ADMIN_COPY.purge.consequence}</p>

        {event ? (
          <ConfirmAction
            action={purgeRegistrationsAction}
            fields={{ settingsVersion: String(event.settingsVersion) }}
            label={ADMIN_COPY.purge.cta}
            tone="danger"
            className="items-start"
            confirm={{
              title: ADMIN_COPY.purge.title,
              body: `${ADMIN_COPY.purge.body} ${ADMIN_COPY.purge.consequence}`,
              confirmLabel: ADMIN_COPY.purge.cta,
              acknowledge: true,
            }}
          >
            {counts ? (
              <p className="text-hint font-semibold text-admin-ink">
                {counts.all} {counts.all === 1 ? 'inscrição será apagada' : 'inscrições serão apagadas'}.
              </p>
            ) : null}
          </ConfirmAction>
        ) : null}
      </section>
    </>
  );
}

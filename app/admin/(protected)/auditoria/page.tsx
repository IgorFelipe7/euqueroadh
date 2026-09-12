import Link from 'next/link';

import { BUTTON_QUIET, Notice, PageHeader, Panel, SR_ONLY } from '@/components/admin/ui';
import { ADMIN_COPY, auditActionLabel } from '@/lib/admin/copy';
import { listAdminActions } from '@/lib/data/audit';
import { formatDateTime } from '@/lib/domain/format';
import { ROUTES } from '@/lib/routes';

export const metadata = { title: ADMIN_COPY.audit.title };

/**
 * `/admin/auditoria` — the administrative trail, read-only.
 *
 * ADMIN-SPEC.md section 10 kept the audit log out of the V1 navigation on the grounds that a fifth
 * destination nobody visits during normal operation is a cost. That reasoning is about the *tab
 * bar*, not about the data: this page exists and is linked from Equipe, so the question "who
 * changed the capacity, and when?" has an answer that does not require someone with SQL access at
 * ten in the evening. It is deliberately **not** a fifth tab.
 *
 * Nothing here can be written. Audit rows are inserted only by `record_admin_action`, which is
 * granted to no role at all and is reachable solely from inside the other `SECURITY DEFINER`
 * routines — so there is no path by which application code, or a compromised browser, could forge,
 * amend or delete an entry (invariant I9).
 *
 * The metadata rendered is counts, setting values, changed-field *names* and ids. It never contains
 * a participant's name, age or telephone number, because the RPCs build it server-side and are
 * forbidden from putting those in it.
 */
export default async function AuditPage() {
  const entries = await listAdminActions({ limit: 100 });

  return (
    <>
      <PageHeader title={ADMIN_COPY.audit.title} description={ADMIN_COPY.audit.intro} />

      {entries.length === 0 ? (
        <Panel className="flex flex-col items-start gap-3 p-6">
          <p className="text-body text-admin-ink">{ADMIN_COPY.audit.empty}</p>
          <Link href={ROUTES.adminTeam} className={BUTTON_QUIET}>
            Voltar para Equipe
          </Link>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <table className="w-full border-collapse text-left">
            <caption className={SR_ONLY}>
              Ações administrativas, da mais recente para a mais antiga.
            </caption>
            <thead>
              <tr className="border-b border-admin-line">
                <th scope="col" className="text-hint px-3 py-2 font-semibold text-admin-muted uppercase">
                  Ação
                </th>
                <th scope="col" className="text-hint px-3 py-2 font-semibold text-admin-muted uppercase">
                  Quem
                </th>
                <th
                  scope="col"
                  className="text-hint hidden px-3 py-2 font-semibold text-admin-muted uppercase sm:table-cell"
                >
                  Quando
                </th>
                <th
                  scope="col"
                  className="text-hint hidden px-3 py-2 font-semibold text-admin-muted uppercase md:table-cell"
                >
                  Detalhes
                </th>
              </tr>
            </thead>
            <tbody data-testid="audit-rows">
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-admin-line last:border-0 align-top">
                  <td className="text-label px-3 py-2 text-admin-ink">
                    {auditActionLabel(entry.action)}
                    <span className="text-hint block text-admin-muted sm:hidden">
                      {formatDateTime(new Date(entry.createdAt))}
                    </span>
                  </td>
                  <td className="text-hint px-3 py-2 [overflow-wrap:anywhere] text-admin-ink">
                    {/*
                      A removed administrator's row reads `Organizador removido (<nome>)`, built from
                      the `actor_label` snapshot taken when the action happened. A NULL actor is a
                      valid, meaningful state — not corrupt data (section 3.6).
                    */}
                    {entry.actorName}
                  </td>
                  <td className="text-hint hidden px-3 py-2 text-admin-muted sm:table-cell">
                    {formatDateTime(new Date(entry.createdAt))}
                  </td>
                  <td className="text-hint hidden px-3 py-2 text-admin-muted md:table-cell">
                    <Metadata metadata={entry.metadata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Notice tone="info">
        Os registros mais antigos que os 100 exibidos aqui continuam guardados no banco de dados.
      </Notice>
    </>
  );
}

/**
 * Audit metadata, rendered as flat `key: value` pairs.
 *
 * Nested objects (`settings.updated` carries `from` and `to`) are stringified rather than given a
 * bespoke renderer per action: this page answers "what changed, by whom, when", and a tree view per
 * action type would be four more shapes to keep in step with the RPCs.
 */
function Metadata({ metadata }: { metadata: Record<string, unknown> }) {
  const pairs = Object.entries(metadata);
  if (pairs.length === 0) return <span>—</span>;

  return (
    <ul className="flex flex-col gap-0.5">
      {pairs.map(([key, value]) => (
        <li key={key} className="[overflow-wrap:anywhere]">
          <span className="font-semibold">{key}:</span>{' '}
          {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
        </li>
      ))}
    </ul>
  );
}

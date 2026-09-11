import { listAdminActions } from '@/lib/data/audit';
import { requireAdmin } from '@/lib/data/auth';

/**
 * `/admin` — the Phase 3 placeholder. The dashboard (ADMIN-SPEC.md section 3) is Phase 6.
 *
 * Its purpose is evidence, not interface. Rendering it proves four things end to end:
 *
 *   1. an active administrator gets in, and a non-administrator, a deactivated administrator and a
 *      signed-out visitor do not — that part is `requireAdmin()` in the layout;
 *   2. `requireAdmin()` returns the narrow identity rather than an Auth user object or a token;
 *   3. a real query reaches PostgreSQL **as the administrator**, so RLS is the layer that granted
 *      it — `admin_actions` is unreadable to the secret key and to `anon`, and readable to
 *      `authenticated` only through `is_active_admin()`;
 *   4. the count is a count. The audit trail is stored, not browsable, in V1 (ADMIN-SPEC.md
 *      section 10), so no entry is rendered here.
 */
export default async function AdminHomePage() {
  const admin = await requireAdmin();
  const actions = await listAdminActions({ limit: 50 });

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-h2">Área de organizadores</h1>
      <p className="text-body">
        Você está autenticado como <strong>{admin.displayName ?? admin.email}</strong>.
      </p>
      <p className="text-hint" data-testid="audit-count">
        Registros de auditoria visíveis: {actions.length}
      </p>
      <p className="text-hint">
        O painel completo — números, medidor de capacidade e ações — chega na próxima etapa.
      </p>
    </main>
  );
}

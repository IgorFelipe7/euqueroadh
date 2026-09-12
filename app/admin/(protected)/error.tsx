'use client';

/**
 * The admin's error boundary.
 *
 * Two rules, and both are security rules as much as design ones (ADMIN-SPEC.md section 7.3):
 *
 *   * **No stack trace, no SQL, no table name, no provider message.** In production Next.js
 *     already replaces the message with a generic one and gives the real error a digest; this
 *     component renders only that digest, so a screenshot from an organizer is enough to find the
 *     log line and never enough to describe the schema.
 *   * **Never a number that might be wrong.** An organizer who sees `0 confirmadas` during an
 *     outage will act on it, so a page that could not read the event renders nothing rather than
 *     zeroes.
 *
 * It must be a Client Component — that is the file convention — and it is the only one in the admin
 * that exists solely to catch.
 */

import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/admin/ui';
import { ROUTES } from '@/lib/routes';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-[var(--radius-admin-panel)] border border-admin-line bg-admin-surface p-6">
      <h1 className="text-[1.25rem] leading-snug font-bold text-admin-ink">Algo deu errado.</h1>
      <p className="text-hint text-admin-muted">
        Não foi possível carregar esta página. Tente novamente; se continuar, informe o código abaixo
        a quem mantém o sistema.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={reset} className={BUTTON_PRIMARY}>
          Tentar novamente
        </button>
        <a href={ROUTES.adminHome} className={BUTTON_SECONDARY}>
          Ir para o painel
        </a>
      </div>

      {error.digest ? <p className="text-hint text-admin-muted">Código: {error.digest}</p> : null}
    </section>
  );
}

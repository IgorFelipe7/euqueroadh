/**
 * The CSV body, as data.
 *
 * Split from the Route Handler so the file's *content* can be asserted without a request, a session
 * or a database — which matters because the two things that make this file safe (the formula guard
 * in `lib/domain/csv.ts` and the column set here) are both silent when they are wrong.
 *
 * Columns are DATABASE-SECURITY.md section 10.8 exactly: `Nome`, `Idade`, `Celular`, `Status`,
 * `Inscrita em`, `Posição na lista`. `id` is omitted — it means nothing outside the system, and
 * every field in the file is one more thing to lose.
 */

import { EXPORT_STATUS_LABELS } from './copy';
import { serializeCsv, EXPORT_COLUMNS } from '@/lib/domain/csv';
import { formatDateTime } from '@/lib/domain/format';
import { formatForDisplay } from '@/lib/domain/phone';

export interface ExportableRegistration {
  readonly fullName: string;
  readonly age: number;
  readonly phoneE164: string;
  readonly status: 'confirmed' | 'waitlisted' | 'cancelled';
  readonly createdAt: string;
  readonly waitlistPosition: number | null;
}

export function buildExportCsv(rows: readonly ExportableRegistration[]): string {
  return serializeCsv(
    EXPORT_COLUMNS,
    rows.map((row) => [
      row.fullName,
      row.age,
      // The human format, not E.164: the file is read by a person, and `(19) 99123-4567` is what
      // they will dial. A leading `+` would also be a formula trigger in some spreadsheet locales.
      formatForDisplay(row.phoneE164),
      EXPORT_STATUS_LABELS[row.status],
      formatDateTime(new Date(row.createdAt)),
      row.waitlistPosition ?? '',
    ]),
  );
}

/** `inscricoes-<slug>-<yyyy-mm-dd>.csv` (section 10.5). */
export function exportFilename(slug: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 10);
  // The slug comes from the database, but a filename lands in a `Content-Disposition` header, so it
  // is reduced to characters that cannot terminate the quoted string or inject a second directive.
  const safeSlug = slug.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 60) || 'evento';
  return `inscricoes-${safeSlug}-${stamp}.csv`;
}

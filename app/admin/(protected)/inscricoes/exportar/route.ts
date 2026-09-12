import { NextResponse, type NextRequest } from 'next/server';

import { buildExportCsv, exportFilename } from '@/lib/admin/export-rows';
import { exportFilterMetadata, parseFilters, type SearchParams } from '@/lib/admin/filters';
import { getAdminEvent } from '@/lib/data/admin/event';
import { recordExportAction } from '@/lib/data/admin/mutations';
import { listRegistrationsForExport } from '@/lib/data/admin/registrations';
import { assertAdmin } from '@/lib/data/auth';
import { UnauthorizedError } from '@/lib/data/errors';
import { newCorrelationId } from '@/lib/observability/log';
import { NO_STORE_HEADERS } from '@/lib/security/csp';

export const dynamic = 'force-dynamic';

/**
 * `/admin/inscricoes/exportar` — the participant CSV.
 *
 * The single highest-risk feature in the product: it takes every participant's personal data out of
 * the controlled environment and onto an organizer's laptop, where a spreadsheet will happily
 * execute what it finds. Every requirement of DATABASE-SECURITY.md section 10 is here, and the order
 * of the first three lines is the point:
 *
 *   1. **`assertAdmin()` first.** Being under `(protected)` grants a Route Handler nothing — the
 *      layout's check does not cover it. This is the boundary.
 *   2. **The rows are read under the administrator's own JWT**, so RLS applies to the file exactly
 *      as it does to the screen. The secret key holds no `SELECT` on `registrations` and could not
 *      produce this response.
 *   3. **The export is audited before a single byte is written.** If the audit write fails, no data
 *      leaves: an export that left no trace is precisely the event the audit trail exists to record.
 *
 * The file itself is made inert by `lib/domain/csv.ts` — the formula guard, the BOM and the `;`
 * delimiter — and carries only the six specified columns.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAdmin();

    const event = await getAdminEvent();
    if (!event) {
      return NextResponse.json(
        { error: 'unavailable' },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const params = Object.fromEntries(request.nextUrl.searchParams.entries()) as SearchParams;
    const filters = parseFilters(params);

    const rows = await listRegistrationsForExport(event.id, filters);

    const audited = await recordExportAction(
      event.id,
      rows.length,
      exportFilterMetadata(filters),
    );

    if (!audited.ok) {
      // Refusing to serve the file is the correct failure: the alternative is personal data leaving
      // the system with no record of who took it.
      const correlationId = newCorrelationId();
      console.error(JSON.stringify({ event: 'admin.export_refused_unaudited', correlationId }));
      return NextResponse.json(
        { error: 'export_failed', correlationId },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const body = buildExportCsv(rows);

    return new NextResponse(body, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename(event.slug, new Date())}"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      // No reason, no distinction between "signed out" and "not an administrator".
      return NextResponse.json(
        { error: 'unauthorized', correlationId: error.correlationId },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const correlationId = newCorrelationId();
    console.error(JSON.stringify({ event: 'admin.export_failed', correlationId }));
    return NextResponse.json(
      { error: 'export_failed', correlationId },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

import { NextResponse } from 'next/server';

import { assertAdmin } from '@/lib/data/auth';
import { UnauthorizedError } from '@/lib/data/errors';
import { NO_STORE_HEADERS } from '@/lib/security/csp';

export const dynamic = 'force-dynamic';

/**
 * `/admin/sessao` — the identity of the caller, and nothing else.
 *
 * This exists so that the *server entry point* half of the boundary is exercised for real, not
 * merely written: `assertAdmin()` throws where `requireAdmin()` would redirect, and a Route Handler
 * is the shape every later sensitive endpoint takes — the CSV export in Phase 6 is this file plus a
 * stream. Being under `(protected)` grants it nothing; the layout's check does not cover route
 * handlers, which is exactly the mistake this endpoint is here to make visible if it is ever made.
 *
 * It discloses only who the caller already is, so it adds no surface of its own.
 */
export async function GET() {
  try {
    const admin = await assertAdmin();

    return NextResponse.json(
      { userId: admin.userId, displayName: admin.displayName },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      // No provider text, no reason, no distinction between "signed out" and "not an administrator".
      return NextResponse.json(
        { error: 'unauthorized', correlationId: error.correlationId },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    throw error;
  }
}

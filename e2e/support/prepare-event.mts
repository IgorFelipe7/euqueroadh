/**
 * Puts the local event into the state the end-to-end suite builds against, and discards the
 * previous build. Runs BEFORE `next build`.
 *
 * The public page is an ISR route: `next build` prerenders `/`, and that copy is what the first
 * request is served. The advisory state baked into it therefore has to be the one the suite starts
 * from, or every test spends its first sixty seconds looking at a page rendered from whatever the
 * event happened to be last time. This is a fixture, not a bypass — the state it writes is one an
 * administrator can set from the admin screen, and every security control stays where it is.
 *
 * **`.next` has to go, and a narrower deletion is not enough.** A build over a warm `.next` reuses
 * the previous prerender of `/` without re-reading the event: measured directly on 2026-09-11 —
 * built with the event closed, reopened the event, rebuilt, and the emitted page still had no form.
 * Clearing only `.next/cache/turbopack` did not change that; removing `.next` did. A cold build is
 * the price of the suite testing the state it just set.
 *
 * Run from `playwright.config.ts`'s `webServer.command`, ahead of the build, so the ordering is
 * explicit rather than inherited from an undocumented hook sequence.
 */
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { DB_URL, resetActiveEvent } from './database.ts';

const OPEN_WITH_SEATS = { capacity: 50, waitlistEnabled: false, state: 'open' } as const;

const id = await resetActiveEvent(OPEN_WITH_SEATS);

const buildDirectory = fileURLToPath(new URL('../../.next', import.meta.url));
await rm(buildDirectory, { recursive: true, force: true });

console.info(
  `[e2e] active event ${id} prepared at ${DB_URL}: open, capacity ${OPEN_WITH_SEATS.capacity}, ` +
    'waitlist off. Previous build discarded so the prerender reflects it.',
);

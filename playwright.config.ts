import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end suite: the admin boundary from Phase 3, and the public registration flow from
 * Phase 4.
 *
 * It exists to prove the claims those phases are allowed to make — an active administrator gets in
 * and nobody else does, the sign-in page tells no one who is an administrator, a real registration
 * reaches the real database and produces the right answer, a submission Cloudflare refuses writes
 * nothing, and no secret reaches a browser.
 *
 * **The built application, not the dev server.** The secret-boundary suite scans the client bundles
 * that `next build` actually emits, the CSP and the caching headers behave differently under
 * `next dev`, and `/` is an ISR route whose first copy is produced at build time. The web server
 * therefore builds first; `reuseExistingServer` only applies locally.
 *
 * **The event fixture is prepared before the build, on purpose.** `/` is prerendered during
 * `next build`, so the advisory state baked into that first copy has to be the one the suite starts
 * from. Doing it here, in the command, makes the ordering explicit instead of depending on whether
 * `globalSetup` happens to run before `webServer` — which Playwright does not document.
 *
 * **Two servers, one application.** The second runs the same build with Cloudflare's published
 * "always fails" test secret, because the always-passes secret the happy path needs accepts any
 * token at all and therefore cannot produce a refusal. See `e2e/support/strict-turnstile-server.mjs`.
 *
 * **One worker.** Every test shares one local database, one mailbox and one ISR cache. Serial
 * execution is what makes a failure mean what it says.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const STRICT_PORT = process.env.E2E_STRICT_PORT ?? '3001';
const STRICT_URL = `http://127.0.0.1:${STRICT_PORT}`;

const PREPARE_FIXTURE =
  'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON e2e/support/prepare-event.mts';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // The admin area is a phone-sized tool at a venue door as often as it is a laptop (D12). The
    // public registration suite overrides this with a 390 px viewport where it matters.
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      /*
       * Runs first, so the page it loads is the one the build prerendered. It writes no row and
       * changes no event state, so it hands the cache on untouched.
       */
      name: 'turnstile-refusal',
      testMatch: /turnstile-refusal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: STRICT_URL },
    },
    {
      name: 'chromium',
      testIgnore: /turnstile-refusal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['turnstile-refusal'],
    },
  ],
  webServer: [
    {
      command: `${PREPARE_FIXTURE} && npm run build && npm run start`,
      url: `${BASE_URL}/admin/entrar`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node e2e/support/strict-turnstile-server.mjs',
      url: `${STRICT_URL}/admin/entrar`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});

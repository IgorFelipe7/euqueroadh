import { defineConfig, devices } from '@playwright/test';

/**
 * The Phase 3 end-to-end suite: the admin boundary, and nothing else.
 *
 * It exists to prove the four claims the phase is allowed to make — an active administrator gets
 * in, nobody else does, the sign-in page tells no one who is an administrator, and the secret key
 * never reaches a browser. The registration flow is Phase 4 and has no tests here.
 *
 * **The built application, not the dev server.** The secret-boundary suite scans the client bundles
 * that `next build` actually emits, and the CSP nonce and caching headers behave differently under
 * `next dev`. The web server therefore builds first; `reuseExistingServer` only applies locally.
 *
 * **One worker.** Every test creates identities in one shared local database and reads one shared
 * mailbox. Serial execution is what makes a failure mean what it says.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

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
    // The admin area is a phone-sized tool at a venue door as often as it is a laptop (D12).
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    url: `${BASE_URL}/admin/entrar`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

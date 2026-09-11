/**
 * A second instance of the SAME built application, configured with Cloudflare's published
 * "always fails" test secret.
 *
 * It exists because of a real property of Cloudflare's test mode, verified against the live
 * endpoint: the always-passes secret (`1x0000…AA`) answers `success: true` for **any** non-empty
 * token, forged ones included. So the primary server, which must use that secret for the happy
 * path, physically cannot produce a refusal — and "a token Cloudflare rejects writes nothing" is
 * exactly the property most worth proving end to end.
 *
 * **This is configuration, not a bypass.** The application is byte-identical, every control is in
 * place, and the only difference is the value of one environment variable — set to another of
 * Cloudflare's own published test keys, on a local port, by the test runner. There is no branch in
 * the product that knows this server exists.
 *
 * It waits for the primary server because that is the process that runs `next build`; both read the
 * same output directory.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

/** `2x0000000000000000000000000000000AA` — Cloudflare's "always fails validation" test secret. */
const ALWAYS_FAILS_SECRET = '2x0000000000000000000000000000000AA';

const PRIMARY_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const PORT = process.env.E2E_STRICT_PORT ?? '3001';
const DEADLINE_MS = 280_000;

async function waitForPrimary() {
  const deadline = Date.now() + DEADLINE_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${PRIMARY_URL}/admin/entrar`);
      if (response.ok) return;
    } catch {
      // Not up yet. The build takes as long as it takes.
    }
    await new Promise((wake) => setTimeout(wake, 500));
  }

  throw new Error(`The primary server at ${PRIMARY_URL} never became ready.`);
}

await waitForPrimary();

// Next's own entry point is a plain JavaScript file, so it runs under this same Node binary.
// Spawning `npm` would mean spawning a .cmd on Windows, which Node refuses without a shell.
const next = fileURLToPath(new URL('../../node_modules/next/dist/bin/next', import.meta.url));

const child = spawn(process.execPath, [next, 'start', '--port', PORT], {
  stdio: 'inherit',
  // Next does not overwrite a variable that is already in `process.env`, so this wins over
  // whatever `.env.local` holds.
  env: { ...process.env, TURNSTILE_SECRET_KEY: ALWAYS_FAILS_SECRET },
});

const [code] = await once(child, 'exit');
process.exit(typeof code === 'number' ? code : 0);

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    /*
     * A complete but entirely fake environment, so that importing a module which imports
     * `lib/env.ts` does not fail at module load — that file validates at import time by design, and
     * that guarantee is itself under test in `lib/env.test.ts` (which stubs its own values).
     *
     * None of these is a credential. The Supabase values are syntactically valid placeholders that
     * point nowhere, and the two Turnstile values are Cloudflare's **published** test keys, which
     * accept only dummy tokens and are refused by production. Nothing here can reach a real service.
     */
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test_placeholder',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
      SUPABASE_SECRET_KEY: 'sb_secret_unit_test_placeholder',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    },
  },
  resolve: {
    alias: {
      // `server-only` throws on import unless it is resolved under the `react-server` condition —
      // that throw IS the build-time guard. Vitest is neither a browser bundle nor a React Server
      // Components build, so it is pointed at the same empty module Next resolves on the server.
      // The boundary is untouched: the guard's job is to fail `next build`, and it still does.
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
      // The same `@/…` root the application and `tsconfig.json` use, so a module under test imports
      // its dependencies by exactly the specifier it ships with.
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});

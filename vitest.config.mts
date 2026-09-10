import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
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
    },
  },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Unit tests (`tests/**\/*.test.ts`) are pure and need no services.
 * Integration tests (`tests/**\/*.itest.ts`) need a live MongoDB and are run
 * separately via `npm run test:integration`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration specs share one database; running files in parallel would
    // let them clobber each other's fixtures.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)),
    },
  },
});

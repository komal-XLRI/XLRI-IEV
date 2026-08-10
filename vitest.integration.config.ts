import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Integration specs run the real service layer against a live MongoDB, so they
 * need a seeded database (`npm run seed`). Kept out of the default `npm test`
 * run, which stays hermetic.
 *
 * Defined standalone rather than merged with vitest.config.ts, because
 * mergeConfig concatenates `include` and would drag the unit specs along.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.itest.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)),
    },
  },
});

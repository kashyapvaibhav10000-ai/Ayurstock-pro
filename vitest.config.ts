import { defineConfig } from 'vitest/config';
import path from 'path';

// Integration tests: route handlers run against a real Postgres
// (TEST_DATABASE_URL, migrated with `prisma migrate deploy`). Never point this
// at a database with real data — every run wipes it.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

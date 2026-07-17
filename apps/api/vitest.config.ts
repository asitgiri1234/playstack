import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl === '') {
  throw new Error('TEST_DATABASE_URL is not set — see .env.example. Refusing to run tests.');
}

// Guard rail: a typo'd TEST_DATABASE_URL pointing at the dev database would let
// the truncate-between-tests helper delete real data. Fail loudly instead.
if (!/\/playstack_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error(
    `TEST_DATABASE_URL must point at a database named "playstack_test" (got: ${testDatabaseUrl}). ` +
      'Tests truncate tables between runs.',
  );
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/__tests__/**/*.test.ts'],
    globalSetup: ['./src/__tests__/helpers/globalSetup.ts'],
    // Integration tests share one Postgres database and truncate between tests,
    // so parallel files would delete each other's fixtures mid-assertion.
    fileParallelism: false,
    // bcrypt at cost 12 is intentionally slow; several hashes per test add up.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      // Redirect every DB read in the test process to the test database. Set
      // here, before any module imports PrismaClient, because the client reads
      // DATABASE_URL at construction time.
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: 'test',
      // Cost 4 instead of 12: tests create dozens of employees, and the work
      // factor protects stored passwords in production, not fixtures.
      BCRYPT_ROUNDS: '4',
    },
  },
});

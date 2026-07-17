/**
 * Runs once before the suite: brings the test database's schema up to date.
 *
 * `migrate deploy` (not `dev`) — it applies committed migrations and never
 * prompts or generates new ones, which is what CI needs.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function setup(): void {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (testDatabaseUrl === undefined) throw new Error('TEST_DATABASE_URL is not set.');

  const apiDir = fileURLToPath(new URL('../../..', import.meta.url));

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}

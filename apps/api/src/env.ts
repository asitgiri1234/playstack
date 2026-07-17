/**
 * Typed, validated environment. Imported once at boot so a missing or
 * malformed var crashes at startup with a readable message — rather than
 * surfacing as `undefined` inside jwt.sign() under load, where an empty
 * secret would silently produce unverifiable tokens.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// One .env at the monorepo root. fileURLToPath, not URL.pathname — the latter
// yields "/C:/..." on Windows and dotenv silently reads nothing.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgresql:// URL'),

  // 32 chars minimum: short secrets make HS256 brute-forceable offline.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Floor of 4 only so the test suite can hash fixtures cheaply; the real
  // minimum is enforced below and applies everywhere except NODE_ENV=test.
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// The two secrets must differ — see .env.example for why.
if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
  console.error('JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
  process.exit(1);
}

/**
 * A bcrypt cost below 10 is not a real defence for a stored password — it is
 * the difference between an offline cracker doing thousands of guesses a second
 * and millions. Tests are the one exception: they hash throwaway fixtures
 * dozens of times per file, and the work factor protects production data, not
 * `Password@123`. Any other environment must meet the floor.
 */
if (env.NODE_ENV !== 'test' && env.BCRYPT_ROUNDS < 10) {
  console.error(
    `BCRYPT_ROUNDS must be at least 10 outside tests (got ${String(env.BCRYPT_ROUNDS)}).`,
  );
  process.exit(1);
}

export type Env = typeof env;

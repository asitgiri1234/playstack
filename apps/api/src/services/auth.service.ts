/**
 * Authentication: credential verification and the refresh-token lifecycle.
 *
 * No Express here. The service throws AppErrors; the route layer turns them
 * into responses and manages cookies.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Role } from '@playstack/shared';
import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';
import { invalidCredentials, unauthorized } from '../lib/errors.js';

export interface TokenPair {
  accessToken: string;
  /** Raw refresh token. Returned ONCE, to be set as an httpOnly cookie. */
  refreshToken: string;
  expiresAt: Date;
}

export interface LoginResult extends TokenPair {
  user: { id: string; employeeCode: string; name: string; email: string; role: Role };
}

/**
 * A real bcrypt hash of a throwaway password, computed once at module load.
 *
 * When the email doesn't exist we still run a full bcrypt.compare against this
 * so the "unknown email" path burns the same ~250ms as the "wrong password"
 * path. Returning early instead would make unknown emails measurably faster,
 * and response latency alone would reveal which accounts exist — the generic
 * error message would be undone by the stopwatch.
 */
const DUMMY_HASH: string = bcrypt.hashSync('playstack-timing-equalizer', env.BCRYPT_ROUNDS);

/** SHA-256, hex. */
function hashToken(rawToken: string): string {
  // SHA-256, not bcrypt: the token is 384 bits of CSPRNG output, so it has no
  // guessable structure to slow-hash against. bcrypt here would only add
  // latency to every refresh. Passwords are different — they are low-entropy
  // and human-chosen, which is exactly what bcrypt's work factor defends.
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateRefreshToken(): string {
  // 48 random bytes — not a JWT. A refresh token carries no claims; it is a
  // lookup key whose authority comes from the row it points at. That is what
  // makes it revocable.
  return crypto.randomBytes(48).toString('base64url');
}

function signAccessToken(employeeId: string, role: Role): string {
  // Payload is deliberately minimal: { sub, role } and nothing else.
  //
  // A JWT is a signed snapshot, not a cache. Putting name/email/department in
  // here means every stale token serves stale data for its whole lifetime, and
  // a JWT is base64, not encrypted — anything added is readable by anyone
  // holding the token. `role` is present only for cheap UI hints; authorize()
  // never trusts it (see authenticate.ts).
  return jwt.sign({ role }, env.JWT_SECRET, {
    subject: employeeId,
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'playstack',
  } as jwt.SignOptions);
}

/** Parses "7d"/"15m"/"3600s" into ms. Used for the refresh row's expiresAt. */
function parseDurationMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid duration: ${duration}. Use e.g. 15m, 7d.`);
  }
  const value = Number(match[1]);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const factor = unitMs[match[2]];
  if (factor === undefined) throw new Error(`Invalid duration unit: ${match[2]}`);
  return value * factor;
}

async function issueTokenPair(employeeId: string, role: Role): Promise<TokenPair> {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN));

  await prisma.refreshToken.create({
    data: {
      // Only the hash is persisted. A stolen database dump must not hand the
      // attacker a set of live sessions — same reason we never store passwords.
      tokenHash: hashToken(refreshToken),
      employeeId,
      expiresAt,
    },
  });

  return { accessToken: signAccessToken(employeeId, role), refreshToken, expiresAt };
}

/**
 * Revokes every live refresh token for an employee.
 *
 * The schema has no explicit familyId column, so "the family" is every
 * unrevoked token belonging to that employee. Since rotation keeps exactly one
 * live token per session chain, revoking all of them is precisely the intended
 * blast radius: kill the chain, force a fresh login.
 */
async function revokeTokenFamily(employeeId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { employeeId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * Verifies credentials and issues a token pair.
 *
 * Every failure below — unknown email, wrong password, soft-deleted, INACTIVE —
 * throws the SAME generic error. Telling an attacker "this account is inactive"
 * confirms the address is a real employee, which is exactly the fact we are
 * protecting.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const employee = await prisma.employee.findUnique({
    where: { email },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      email: true,
      role: true,
      status: true,
      deletedAt: true,
      passwordHash: true,
    },
  });

  // Unknown email: burn an equivalent amount of CPU, then fail identically.
  if (employee === null) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalidCredentials();
  }

  const passwordMatches = await bcrypt.compare(password, employee.passwordHash);
  if (!passwordMatches) throw invalidCredentials();

  // Account-state checks run AFTER the password check, on purpose: rejecting a
  // soft-deleted account before comparing would return faster than a wrong
  // password and re-open the timing oracle we just closed.
  if (employee.deletedAt !== null) throw invalidCredentials();
  if (employee.status !== 'ACTIVE') throw invalidCredentials();

  const tokens = await issueTokenPair(employee.id, employee.role);

  return {
    ...tokens,
    user: {
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      email: employee.email,
      role: employee.role,
    },
  };
}

/**
 * Rotates a refresh token: the presented token is revoked and a new one issued.
 *
 * Rotation turns a stolen refresh token from permanent access into a race. If
 * the victim's client refreshes after the thief, the victim presents an
 * already-revoked token — which is the reuse signal below.
 */
export async function refresh(rawToken: string): Promise<TokenPair> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      id: true,
      employeeId: true,
      expiresAt: true,
      revokedAt: true,
      employee: { select: { id: true, role: true, status: true, deletedAt: true } },
    },
  });

  if (stored === null) throw unauthorized('Invalid refresh token.', 'INVALID_REFRESH_TOKEN');

  // REUSE DETECTED. A rotated token is single-use, so a second presentation
  // means two parties hold it — the legitimate client and a thief — and we
  // cannot tell which one is calling now. Assume breach: revoke the whole
  // family so BOTH are forced to re-authenticate with a password the thief
  // does not have. Logging the user out is the cheap outcome; leaving an
  // attacker with a live session is not.
  if (stored.revokedAt !== null) {
    await revokeTokenFamily(stored.employeeId);
    throw unauthorized(
      'Refresh token reuse detected. All sessions have been revoked; please log in again.',
      'TOKEN_REUSE_DETECTED',
    );
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Refresh token expired.', 'REFRESH_TOKEN_EXPIRED');
  }

  // Re-check account state on every rotation, not just at login: a 7-day
  // refresh token must not outlive the employee's offboarding.
  if (stored.employee.deletedAt !== null || stored.employee.status !== 'ACTIVE') {
    await revokeTokenFamily(stored.employeeId);
    throw unauthorized('Account is no longer active.', 'ACCOUNT_INACTIVE');
  }

  // Revoke-then-issue in a transaction: a crash between the two must not leave
  // the user with zero valid tokens (silent logout) or two (rotation defeated).
  const [, pair] = await prisma.$transaction(async () => {
    const revoked = await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const issued = await issueTokenPair(stored.employeeId, stored.employee.role);
    return [revoked, issued] as const;
  });

  return pair;
}

/**
 * Revokes a refresh token. This is the entire reason the table exists — a
 * stateless JWT cannot be un-issued, so "log out" without server-side state is
 * a client-side lie that leaves the token valid until it expires.
 *
 * Idempotent and silent: logging out with a garbage token still succeeds. A 404
 * here would tell an attacker which tokens are real.
 */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (rawToken === undefined || rawToken.length === 0) return;

  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Exported for tests and for the offboarding flow in a later phase. */
export const __internal = { hashToken, revokeTokenFamily, parseDurationMs };

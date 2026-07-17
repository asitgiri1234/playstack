/**
 * Step 1 of the chain: WHO is this?
 *
 * Verifies the access token, then loads the employee fresh from the database.
 * Attaches req.user. Never decides what the actor may do — that is authorize().
 */

import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';
import { unauthorized } from '../lib/errors.js';

/** Pulls the bearer token, tolerating case and extra whitespace. */
function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (token === null) throw unauthorized('Missing access token.');

    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'playstack' });
      // A string payload means the token was signed with a bare string body —
      // never something we issue, so treat it as forged.
      if (typeof decoded === 'string') throw unauthorized('Malformed access token.');
      payload = decoded;
    } catch {
      // Expired, bad signature, wrong issuer — all one 401. Distinguishing them
      // tells an attacker probing with forged tokens which part they got right.
      throw unauthorized('Invalid or expired access token.', 'INVALID_ACCESS_TOKEN');
    }

    const employeeId = payload.sub;
    if (typeof employeeId !== 'string' || employeeId.length === 0) {
      throw unauthorized('Malformed access token.');
    }

    /**
     * The role comes from THIS query — never from payload.role.
     *
     * A JWT is a signed snapshot of the moment it was minted. If an admin
     * demotes someone at 10:00, a token issued at 09:58 still *validly* claims
     * SUPER_ADMIN until it expires. Trusting the payload would leave a
     * revoked admin fully privileged for the rest of that window.
     *
     * The cost is one indexed primary-key lookup per request. That is the price
     * of "revocation takes effect now", and it is worth paying.
     */
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, role: true, status: true, deletedAt: true },
    });

    // Same 401 for every state: a valid token for a deleted account must not
    // reveal that the account once existed.
    if (employee === null) throw unauthorized('Account no longer exists.', 'ACCOUNT_UNAVAILABLE');
    if (employee.deletedAt !== null) {
      throw unauthorized('Account no longer exists.', 'ACCOUNT_UNAVAILABLE');
    }
    if (employee.status !== 'ACTIVE') {
      throw unauthorized('Account is not active.', 'ACCOUNT_UNAVAILABLE');
    }

    req.user = { id: employee.id, role: employee.role };
    next();
  } catch (error) {
    next(error);
  }
}

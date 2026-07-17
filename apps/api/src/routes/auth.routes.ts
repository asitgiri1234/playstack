/**
 * /api/auth/* — the only routes in Phase 1.
 *
 * Handlers stay thin: validate, call the service, shape the response. Every
 * security decision lives in auth.service.ts, the middleware, or guards.ts.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { loginSchema } from '@playstack/shared';
import { login, logout, refresh } from '../services/auth.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import { clearRefreshCookie, setRefreshCookie, REFRESH_COOKIE_NAME } from '../lib/cookies.js';
import { prisma } from '../lib/prisma.js';
import { unauthorized, notFound } from '../lib/errors.js';
import { permissionsFor } from '@playstack/shared';

export const authRouter: Router = Router();

/**
 * 5 attempts / 15 min, keyed on IP **+ email**.
 *
 * IP alone is wrong in both directions: a whole office behind one NAT would
 * lock each other out, while an attacker with a botnet gets 5 tries per node.
 * Adding the email means credential-stuffing one account is throttled no matter
 * where it comes from, and your neighbour's typo cannot lock you out.
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Only failed logins count. A successful login must not consume the budget of
  // someone who simply signs in five times a day.
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request): string => {
    const body: unknown = req.body;
    const email =
      typeof body === 'object' && body !== null && 'email' in body
        ? String((body as { email: unknown }).email).toLowerCase()
        : 'unknown';
    // ipKeyGenerator normalises IPv6 to a /64 subnet — without it, an attacker
    // with an IPv6 range gets a fresh bucket per address.
    return `${ipKeyGenerator(req.ip ?? 'unknown-ip')}:${email}`;
  },
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Try again in 15 minutes.',
    },
  },
});

/** POST /api/auth/login */
authRouter.post(
  '/login',
  loginRateLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const result = await login(email, password);

      setRefreshCookie(res, result.refreshToken, result.expiresAt);

      // Access token in the BODY, refresh token only in the cookie — the raw
      // refresh token must never reach JavaScript. See lib/cookies.ts.
      res.status(200).json({
        accessToken: result.accessToken,
        user: result.user,
        // Lets the UI render the right nav without a second round-trip. Read
        // from the shared matrix; the server still re-checks on every request.
        permissions: permissionsFor(result.user.role),
      });
    } catch (error) {
      next(error);
    }
  },
);

/** POST /api/auth/refresh — rotation. */
authRouter.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
      if (typeof rawToken !== 'string' || rawToken.length === 0) {
        throw unauthorized('No refresh token provided.', 'NO_REFRESH_TOKEN');
      }

      const pair = await refresh(rawToken);
      setRefreshCookie(res, pair.refreshToken, pair.expiresAt);
      res.status(200).json({ accessToken: pair.accessToken });
    } catch (error) {
      // Any refresh failure clears the cookie: a token that will never work
      // again should not keep riding along on requests.
      clearRefreshCookie(res);
      next(error);
    }
  },
);

/** POST /api/auth/logout — revoke server-side, then clear the cookie. */
authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
      await logout(typeof rawToken === 'string' ? rawToken : undefined);

      clearRefreshCookie(res);
      // Always 204, even for a bogus token. Logout is idempotent, and a 404
      // would confirm which tokens exist.
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/** GET /api/auth/me — authenticate only; no permission needed to read yourself. */
authRouter.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user === undefined) throw unauthorized();

      // Re-read rather than echo the token: this is the endpoint the UI trusts
      // to decide what to render, so it must reflect the database now.
      const employee = await prisma.employee.findFirst({
        where: { id: req.user.id, deletedAt: null },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          email: true,
          department: true,
          designation: true,
          role: true,
          status: true,
          profileImage: true,
        },
      });
      if (employee === null) throw notFound('Employee not found.');

      res.status(200).json({ user: employee, permissions: permissionsFor(employee.role) });
    } catch (error) {
      next(error);
    }
  },
);

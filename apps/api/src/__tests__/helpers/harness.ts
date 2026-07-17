/**
 * TEST-ONLY app.
 *
 * Phase 1 ships no employee routes — those are Phase 2 — but the middleware
 * chain is the Phase 1 deliverable and a chain is only proven end-to-end, with
 * a real request, a real token and a real database.
 *
 * So this mounts the exact production middleware (authenticate → authorize →
 * sanitizeFields → guards) onto throwaway handlers under /test/*. The handlers
 * do nothing but echo success; every assertion in the RBAC suite is about which
 * requests never reach them.
 *
 * This file lives in __tests__ and is imported by nothing in src/ — it cannot
 * ship. When Phase 2 writes the real controllers, they should wire the chain in
 * exactly this order.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { can, type Role } from '@playstack/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { sanitizeFields } from '../../middleware/sanitizeFields.js';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler.js';
import { authRouter } from '../../routes/auth.routes.js';
import {
  assertCanAssignRole,
  assertHRCannotTouchSuperAdmin,
  assertNotLastSuperAdmin,
  assertNotSelfRoleChange,
  assertSelfScope,
  enforce,
  enforceAll,
} from '../../services/guards.js';
import { prisma } from '../../lib/prisma.js';
import { unauthorized } from '../../lib/errors.js';

const ok = (res: Response) => res.status(200).json({ ok: true });

/** Wraps an async handler so a rejection reaches errorHandler instead of hanging. */
function wrap(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

export function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // The real auth routes, so integration tests exercise the shipping code.
  app.use('/api/auth', authRouter);

  /**
   * READ one employee. READ_ALL holders skip the scope check; everyone else
   * must be asking about themselves. This is the IDOR path.
   */
  app.get(
    '/test/employees/:id',
    authenticate,
    wrap(async (req, res) => {
      if (req.user === undefined) throw unauthorized();
      const targetId = req.params.id ?? '';

      if (!can(req.user.role, 'EMPLOYEE:READ_ALL')) {
        // Holding READ_SELF grants the verb, not the record.
        enforce(assertSelfScope(req.user.id, targetId));
      }
      const employee = await prisma.employee.findFirst({
        where: { id: targetId, deletedAt: null },
        select: { id: true, email: true, salary: true, role: true },
      });
      return res.status(200).json({ employee });
    }),
  );

  /** Self-service update. No :id — sanitizeFields targets the actor. */
  app.patch(
    '/test/me',
    authenticate,
    authorize('EMPLOYEE:UPDATE_SELF'),
    sanitizeFields(),
    wrap(async (req, res) => {
      if (req.user === undefined || req.target === undefined) throw unauthorized();
      enforce(
        assertNotSelfRoleChange(req.user.id, req.target.id, req.body as Record<string, unknown>),
      );
      return ok(res);
    }),
  );

  /** Admin/HR update of another employee. The full chain. */
  app.patch(
    '/test/employees/:id',
    authenticate,
    authorize('EMPLOYEE:UPDATE_ANY'),
    sanitizeFields({ targetIdParam: 'id' }),
    wrap(async (req, res) => {
      if (req.user === undefined || req.target === undefined) throw unauthorized();
      const actor = req.user;
      const target = req.target;
      const body = req.body as Record<string, unknown>;

      enforceAll(
        assertHRCannotTouchSuperAdmin(actor.role, target.role),
        assertNotSelfRoleChange(actor.id, target.id, body),
      );

      if (Object.hasOwn(body, 'role')) {
        const nextRole = body.role as Role;
        enforce(assertCanAssignRole(actor.role, nextRole));

        // Demoting a Super Admin could empty the pool — count before allowing.
        if (target.role === 'SUPER_ADMIN' && nextRole !== 'SUPER_ADMIN') {
          enforce(
            assertNotLastSuperAdmin({
              targetRole: target.role,
              liveSuperAdminCount: await prisma.employee.count({
                where: { role: 'SUPER_ADMIN', deletedAt: null },
              }),
              operation: 'DEMOTE',
            }),
          );
        }
      }

      // Deactivating the last Super Admin locks the system just as thoroughly
      // as demoting them — an INACTIVE account cannot log in.
      if (body.status === 'INACTIVE' && target.role === 'SUPER_ADMIN') {
        enforce(
          assertNotLastSuperAdmin({
            targetRole: target.role,
            liveSuperAdminCount: await prisma.employee.count({
              where: { role: 'SUPER_ADMIN', deletedAt: null },
            }),
            operation: 'DEMOTE',
          }),
        );
      }

      return ok(res);
    }),
  );

  /** Exercises the opt-in 'strip' mode. */
  app.patch(
    '/test/employees/:id/strip',
    authenticate,
    authorize('EMPLOYEE:UPDATE_ANY'),
    sanitizeFields({ targetIdParam: 'id', mode: 'strip' }),
    (req: Request, res: Response) => {
      res.status(200).json({ ok: true, body: req.body as unknown });
    },
  );

  /** Soft delete. */
  app.delete(
    '/test/employees/:id',
    authenticate,
    authorize('EMPLOYEE:DELETE'),
    wrap(async (req, res) => {
      if (req.user === undefined) throw unauthorized();
      const targetId = req.params.id ?? '';
      const target = await prisma.employee.findFirst({
        where: { id: targetId, deletedAt: null },
        select: { id: true, role: true },
      });
      if (target === null) return res.status(404).json({ error: { message: 'Not found' } });

      enforce(
        assertNotLastSuperAdmin({
          targetRole: target.role,
          liveSuperAdminCount: await prisma.employee.count({
            where: { role: 'SUPER_ADMIN', deletedAt: null },
          }),
          operation: 'DELETE',
        }),
      );
      return ok(res);
    }),
  );

  app.get('/test/dashboard', authenticate, authorize('DASHBOARD:READ'), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

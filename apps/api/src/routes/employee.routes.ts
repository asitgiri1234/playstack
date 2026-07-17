/**
 * /api/employees/*
 *
 * Handlers are deliberately ~5 lines: parse, call the service, serialize,
 * respond. Every authorization decision was made upstream by the chain
 * (authenticate → authorize → sanitizeFields) or inside the service via
 * guards.ts. If a handler here grows an `if (role === ...)`, a rule has escaped
 * the matrix and belongs back in it.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  createEmployeeSchema,
  listEmployeesQuerySchema,
  selfUpdateEmployeeSchema,
  updateEmployeeSchema,
  type ListEmployeesQuery,
} from '@playstack/shared';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { sanitizeFields } from '../middleware/sanitizeFields.js';
import { validateBody } from '../middleware/validate.js';
import { validateQuery } from '../middleware/validateQuery.js';
import * as employeeService from '../services/employee.service.js';
import {
  serializeEmployee,
  serializeEmployees,
  type Actor,
} from '../services/employee.serializer.js';
import { unauthorized } from '../lib/errors.js';

export const employeeRouter: Router = Router();

/** req.user is guaranteed by authenticate; this converts that to a typed Actor. */
function actorOf(req: Request): Actor {
  if (req.user === undefined) throw unauthorized('Authentication required.');
  return { id: req.user.id, role: req.user.role };
}

/** Wraps an async handler so a rejection reaches errorHandler instead of hanging. */
function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

// ---------------------------------------------------------------------------
// GET /api/employees
// ---------------------------------------------------------------------------
employeeRouter.get(
  '/',
  authenticate,
  authorize('EMPLOYEE:READ_ALL'),
  validateQuery(listEmployeesQuerySchema),
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const result = await employeeService.list(req.validatedQuery as ListEmployeesQuery, actor);
    res.status(200).json({
      data: serializeEmployees(result.employees, actor),
      pagination: result.pagination,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/employees/stats
//
// MUST be registered before GET /:id. Express matches routes in registration
// order, so with /:id first, "stats" binds as req.params.id and the dashboard
// 404s (or worse, 403s) with no obvious cause.
// ---------------------------------------------------------------------------
employeeRouter.get(
  '/stats',
  authenticate,
  authorize('DASHBOARD:READ'),
  wrap(async (_req, res) => {
    res.status(200).json(await employeeService.stats());
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/employees/me
//
// Also before /:id, and for the same reason: "me" is not a uuid.
// ---------------------------------------------------------------------------
employeeRouter.patch(
  '/me',
  authenticate,
  authorize('EMPLOYEE:UPDATE_SELF'),
  // No targetIdParam: with no :id, sanitizeFields targets the actor themselves,
  // which is what makes this route self-scoped by construction.
  sanitizeFields(),
  validateBody(selfUpdateEmployeeSchema),
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const employee = await employeeService.update(
      actor.id,
      req.body as employeeService.UpdateEmployeeData,
      actor,
    );
    res.status(200).json({ data: serializeEmployee(employee, actor) });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/employees/:id
//
// No authorize(): READ_SELF and READ_ALL both reach here, and which record you
// may see is a scope question the service answers with assertSelfScope.
// ---------------------------------------------------------------------------
employeeRouter.get(
  '/:id',
  authenticate,
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const employee = await employeeService.getById(req.params.id ?? '', actor);
    res.status(200).json({ data: serializeEmployee(employee, actor) });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/employees
// ---------------------------------------------------------------------------
employeeRouter.post(
  '/',
  authenticate,
  authorize('EMPLOYEE:CREATE'),
  validateBody(createEmployeeSchema),
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const result = await employeeService.create(
      req.body as employeeService.CreateEmployeeData,
      actor,
    );
    res.status(201).json({
      data: serializeEmployee(result.employee, actor),
      // Only present when the service generated it. Returned once, never stored
      // in plaintext, never retrievable again.
      ...(result.temporaryPassword !== undefined
        ? { temporaryPassword: result.temporaryPassword }
        : {}),
    });
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/employees/:id
// ---------------------------------------------------------------------------
employeeRouter.put(
  '/:id',
  authenticate,
  authorize('EMPLOYEE:UPDATE_ANY'),
  sanitizeFields({ targetIdParam: 'id' }),
  validateBody(updateEmployeeSchema),
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const employee = await employeeService.update(
      req.params.id ?? '',
      req.body as employeeService.UpdateEmployeeData,
      actor,
    );
    res.status(200).json({ data: serializeEmployee(employee, actor) });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/employees/:id — soft delete
// ---------------------------------------------------------------------------
employeeRouter.delete(
  '/:id',
  authenticate,
  authorize('EMPLOYEE:DELETE'),
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const employee = await employeeService.softDelete(req.params.id ?? '', actor);
    res.status(200).json({ data: serializeEmployee(employee, actor) });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/employees/:id/restore
// ---------------------------------------------------------------------------
employeeRouter.post(
  '/:id/restore',
  authenticate,
  authorize('EMPLOYEE:DELETE'),
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const employee = await employeeService.restore(req.params.id ?? '');
    res.status(200).json({ data: serializeEmployee(employee, actor) });
  }),
);

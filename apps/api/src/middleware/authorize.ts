/**
 * Step 2 of the chain: may this ROLE perform this VERB?
 *
 * That is the whole job. No target lookups, no business rules, no DB. Scope
 * ("...on WHICH record?") belongs to guards.ts; field rules belong to
 * sanitizeFields. Keeping this thin is what makes the matrix the single
 * authority — every extra `if` in here would be a rule living outside it.
 */

import type { NextFunction, Request, Response } from 'express';
import { can, type Permission } from '@playstack/shared';
import { forbidden, unauthorized } from '../lib/errors.js';

export function authorize(permission: Permission) {
  return function authorizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
    // authorize() without authenticate() upstream is a wiring bug. Fail closed
    // and loudly rather than treating "no user" as "no restrictions".
    if (req.user === undefined) {
      next(unauthorized('Authentication required.'));
      return;
    }

    if (!can(req.user.role, permission)) {
      next(forbidden(`Your role does not permit ${permission}.`, { required: permission }));
      return;
    }

    next();
  };
}

/** Requires every listed permission. */
export function authorizeAll(...permissions: readonly Permission[]) {
  return function authorizeAllMiddleware(req: Request, _res: Response, next: NextFunction): void {
    if (req.user === undefined) {
      next(unauthorized('Authentication required.'));
      return;
    }
    const role = req.user.role;
    const missing = permissions.filter((p) => !can(role, p));
    if (missing.length > 0) {
      next(forbidden('Your role does not permit this action.', { missing }));
      return;
    }
    next();
  };
}

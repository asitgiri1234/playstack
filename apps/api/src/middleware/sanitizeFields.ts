/**
 * Step 3 of the chain: which FIELDS may this actor write on THIS target?
 *
 * Runs after authorize (the verb is already granted) and before the handler.
 * Loads the target once, then asks the shared matrix about every key in the
 * body. The decision logic lives in permissions.ts — this file only supplies
 * Express plumbing and the target lookup.
 */

import type { NextFunction, Request, Response } from 'express';
import { canWriteField, isMutableEmployeeField } from '@playstack/shared';
import { prisma } from '../lib/prisma.js';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';

export interface SanitizeFieldsOptions {
  /**
   * 'reject' (default) — 403 listing every rejected field.
   * 'strip'            — silently drop them and continue.
   *
   * The default is 'reject' because silent stripping lies: an EMPLOYEE PUTs
   * { salary: 999999 }, gets 200 OK, re-reads the record and sees the old
   * salary, and files a bug about the database losing writes. Worse, a real
   * privilege-escalation attempt looks identical to a success in the logs.
   * 'strip' exists only for endpoints that accept a whole entity back from a
   * form and expect read-only fields to ride along harmlessly.
   */
  mode?: 'reject' | 'strip';
  /** Route param holding the target id. Absent param => the actor themselves. */
  targetIdParam?: string;
}

export function sanitizeFields(options: SanitizeFieldsOptions = {}) {
  const mode = options.mode ?? 'reject';
  const targetIdParam = options.targetIdParam ?? 'id';

  return async function sanitizeFieldsMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user === undefined) throw unauthorized('Authentication required.');

      // A self-update route (PATCH /me) has no :id — the target is the actor.
      const targetId = req.params[targetIdParam] ?? req.user.id;

      const target = await prisma.employee.findFirst({
        // Soft-deleted rows are not writable targets; treat them as gone.
        where: { id: targetId, deletedAt: null },
        select: { id: true, role: true },
      });
      if (target === null) throw notFound('Employee not found.');

      // Cached for guards and the handler — they must not re-query and risk
      // reading a different role than the one this decision was based on.
      req.target = { id: target.id, role: target.role };

      const body: unknown = req.body;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        next();
        return;
      }
      const patch = body as Record<string, unknown>;

      const rejected: string[] = [];
      for (const key of Object.keys(patch)) {
        // Unknown keys are rejected, not ignored: `salery: 999` must fail
        // loudly, and an attacker probing for an undocumented writable column
        // deserves a 403 rather than a 200.
        if (!isMutableEmployeeField(key)) {
          rejected.push(key);
          continue;
        }
        if (!canWriteField(req.user.role, target.role, key)) {
          rejected.push(key);
        }
      }

      if (rejected.length === 0) {
        next();
        return;
      }

      if (mode === 'strip') {
        for (const key of rejected) delete patch[key];
        next();
        return;
      }

      throw forbidden(`You may not write the following field(s): ${rejected.join(', ')}.`, {
        rejectedFields: rejected,
      });
    } catch (error) {
      next(error);
    }
  };
}

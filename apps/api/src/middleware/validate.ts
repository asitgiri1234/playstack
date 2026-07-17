/**
 * Parses req.body with a Zod schema from @playstack/shared — the same schema
 * the frontend form uses. The client's copy is UX; this one is the boundary.
 *
 * Assigns the PARSED result back onto req.body so handlers see coerced,
 * trimmed, defaulted values rather than raw strings.
 */

import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

export function validateBody(schema: ZodTypeAny) {
  return function validateBodyMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // Hand the ZodError to errorHandler, which renders field-level messages.
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

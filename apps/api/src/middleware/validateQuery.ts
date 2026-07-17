/**
 * Parses req.query with a Zod schema. Separate from validateBody because a bad
 * query param is a 400 about the URL, and because Express 4's req.query is a
 * getter that must be re-assigned rather than mutated in place.
 */

import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

// `req.validatedQuery` is declared in ../types/express.d.ts, alongside the rest
// of the Request augmentation.

export function validateQuery(schema: ZodTypeAny) {
  return function validateQueryMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      // errorHandler renders ZodError as a 400 naming each bad field — so
      // ?sortBy=malicious_input is "sortBy: invalid enum value", not a 500.
      next(result.error);
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}

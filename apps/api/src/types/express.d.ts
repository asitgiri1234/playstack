import type { Role } from '@playstack/shared';

/**
 * `req.user` and `req.target` are populated by middleware, never by a handler.
 *
 * Both are optional at the type level even though `authenticate` guarantees
 * `req.user` downstream: TypeScript cannot know a middleware ran, and making it
 * non-optional would let a handler mounted WITHOUT authenticate read
 * `req.user.id` and crash at runtime instead of failing to compile.
 */
declare global {
  namespace Express {
    interface Request {
      /** The authenticated actor. Role is read fresh from the DB, not the JWT. */
      user?: {
        id: string;
        role: Role;
      };
      /** The employee being acted upon, loaded once by sanitizeFields. */
      target?: {
        id: string;
        role: Role;
      };
      /**
       * Parsed, coerced query set by validateQuery. Handlers read this, never
       * req.query — the raw one is untyped strings and has skipped the schema.
       */
      validatedQuery?: unknown;
    }
  }
}

export {};

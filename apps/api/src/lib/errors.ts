/**
 * Typed application errors.
 *
 * Anything thrown that is NOT an AppError is treated as a bug by the error
 * handler and reported to the client as a bare 500 — which is why every
 * *expected* failure below is modelled explicitly. An error the client is
 * allowed to read must be a deliberate decision, never a leaked internal.
 */

export class AppError extends Error {
  readonly statusCode: number;
  /** Machine-readable code for the frontend to branch on, not prose. */
  readonly code: string;
  /** Extra client-safe context (e.g. the rejected field list). */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Marks errors that are safe to show verbatim. */
  readonly expose = true;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * The ONE message every credential failure returns.
 *
 * "No such email" and "wrong password" must be indistinguishable, or the login
 * form becomes an account-enumeration oracle: an attacker learns which of a
 * leaked email list are real Playstack accounts, then targets only those.
 */
export const GENERIC_LOGIN_FAILURE = 'Invalid email or password.';

export const unauthorized = (message = 'Authentication required.', code = 'UNAUTHENTICATED') =>
  new AppError(401, code, message);

export const forbidden = (message: string, details?: Readonly<Record<string, unknown>>) =>
  new AppError(403, 'FORBIDDEN', message, details);

export const notFound = (message = 'Resource not found.') =>
  new AppError(404, 'NOT_FOUND', message);

export const badRequest = (message: string, details?: Readonly<Record<string, unknown>>) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

/** Login/refresh failures. Always the same text — see GENERIC_LOGIN_FAILURE. */
export const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_FAILURE);

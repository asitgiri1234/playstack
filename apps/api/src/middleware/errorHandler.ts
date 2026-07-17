/**
 * The last link in every chain: turn a thrown error into a response.
 *
 * The rule: only AppError (and ZodError) reach the client as prose. Everything
 * else is an unhandled bug and becomes a bare 500 — because an unexpected error
 * has unaudited contents, and Prisma's are the worst offenders: a raw
 * P2002 leaks column names, and a connection error leaks the database host,
 * port and username straight into the browser.
 */

import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; stack?: string };
}

/** 404 for unmatched routes, so they arrive as an AppError like everything else. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', `Cannot ${req.method} ${req.path}`));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Express cannot append to a response that has already started streaming;
  // delegating lets it destroy the socket rather than throw a second error.
  if (res.headersSent) {
    next(error);
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  let status = 500;
  let body: ErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  };

  if (error instanceof AppError) {
    status = error.statusCode;
    body = { error: { code: error.code, message: error.message } };
    if (error.details !== undefined) body.error.details = error.details;
  } else if (error instanceof ZodError) {
    // Validation feedback is safe and useful: it describes the request the
    // client just sent, not anything about our internals.
    status = 400;
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error.flatten().fieldErrors,
      },
    };
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    // Deliberately generic. Prisma error text contains schema and connection
    // details; the client gets none of it. The full error is logged instead.
    status = 500;
    body = { error: { code: 'DATABASE_ERROR', message: 'A database error occurred.' } };
  }

  // Log the real thing server-side — the client's opacity must not become ours.
  if (status >= 500) {
    console.error('[error]', error);
  }

  // Stack traces only ever outside production. In prod they hand an attacker
  // our directory layout, dependency versions and code paths.
  if (!isProduction && status >= 500 && error instanceof Error && error.stack !== undefined) {
    body.error.stack = error.stack;
  }

  res.status(status).json(body);
}

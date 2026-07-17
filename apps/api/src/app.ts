/**
 * Express app assembly. Exported separately from server.ts so tests can mount
 * it with supertest without binding a port.
 */

import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.routes.js';
import { employeeRouter } from './routes/employee.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { env } from './env.js';

export function createApp(): Express {
  const app = express();

  // express-rate-limit derives its key from req.ip. Behind a proxy every
  // request would otherwise carry the proxy's IP and share one bucket.
  // Exactly 1 — `true` would trust any client-supplied X-Forwarded-For and let
  // an attacker forge a fresh IP per login attempt, defeating the limiter.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      // Required for the browser to send the refresh cookie cross-origin
      // (web on :3000, api on :4000). With Strict SameSite this is same-site,
      // so the cookie still rides.
      credentials: true,
    }),
  );

  // 100kb: no auth endpoint needs more, and an unbounded body is free DoS.
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/employees', employeeRouter);

  app.use(notFoundHandler);
  // Must be last, and must stay last — Express selects error middleware by
  // arity and registration order.
  app.use(errorHandler);

  return app;
}

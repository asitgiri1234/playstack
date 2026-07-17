/**
 * Process entry point. Importing ./env first means a missing JWT_SECRET kills
 * the process here, at boot, rather than at the first login attempt.
 */

import { env } from './env.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${String(env.PORT)} (${env.NODE_ENV})`);
});

/** Drain in-flight requests and close the pool, so restarts don't 502. */
async function shutdown(signal: string): Promise<void> {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(() => {
    void prisma.$disconnect().then(() => process.exit(0));
  });
  // Don't hang forever on a stuck connection.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

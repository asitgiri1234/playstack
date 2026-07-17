/**
 * One PrismaClient for the process.
 *
 * Instantiating per-request exhausts the Postgres connection pool under load,
 * and tsx/vitest hot-reload would leak a new client per reload — hence the
 * globalThis cache.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

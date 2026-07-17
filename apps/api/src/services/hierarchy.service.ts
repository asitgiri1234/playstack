/**
 * Reporting-tree traversal and cycle prevention.
 *
 * ---------------------------------------------------------------------------
 * Why raw SQL lives here, and nowhere else in the codebase
 * ---------------------------------------------------------------------------
 * Prisma's query builder cannot express a recursive CTE. There is no
 * `findMany({ recursive: true })` — self-referential traversal of arbitrary
 * depth is simply outside what the builder models. The alternatives are all
 * worse:
 *
 *   - Walk the tree in application code, one query per level: O(depth) round
 *     trips per request, and a cycle in the data loops forever.
 *   - Fetch every employee and traverse in memory: fine at 20 rows, absurd at
 *     200,000 when the question was "is X below Y".
 *
 * So this is a considered exception, not laziness. It is contained: raw SQL
 * appears in this file only, every value is bound through Prisma.sql's tagged
 * template (never string concatenation), and each query returns a shape that is
 * typed explicitly, because $queryRaw returns `unknown`.
 */

import { Prisma } from '@prisma/client';
import { can, type Role } from '@playstack/shared';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';

/** Accepts either the client or a transaction handle, so callers can re-check
 *  inside a transaction with the same code path. */
export type DbClient = Prisma.TransactionClient;

/**
 * Hard ceiling on recursion depth.
 *
 * Belt and braces against data that ALREADY contains a cycle. A `UNION ALL`
 * recursive CTE over cyclic rows never terminates — it will happily spin until
 * the connection dies, taking a database worker with it. Our writes are
 * cycle-checked, but "the data can never be bad" is exactly the assumption that
 * makes an outage unrecoverable: a botched migration, a manual UPDATE, or a bug
 * in a future phase is enough. The cap means a pre-existing cycle degrades into
 * a truncated result instead of a hung query.
 *
 * 100 is far beyond any plausible org depth (Amazon runs ~12), so it never
 * truncates real data.
 */
export const MAX_TREE_DEPTH = 100;

/** $queryRaw returns unknown; this is the shape both CTEs project. */
interface IdRow {
  id: string;
}

/**
 * No ::uuid casts below, deliberately.
 *
 * Prisma maps `id String @id @default(uuid())` to a Postgres **text** column,
 * not `uuid` — the uuid is generated client-side and stored as text. Casting a
 * bound parameter to ::uuid therefore fails with "operator does not exist:
 * text = uuid". The parameters are bound as text and compared to text, which is
 * what the schema actually is.
 */

/**
 * Every employee below `employeeId`, at any depth. Excludes the employee.
 *
 * One query, not one-per-level. Depth-capped, and soft-deleted rows are cut at
 * every level — a deleted manager's subtree is not "below" anyone live.
 */
export async function getDescendantIds(
  employeeId: string,
  client: DbClient = prisma,
): Promise<string[]> {
  const rows = await client.$queryRaw<IdRow[]>(Prisma.sql`
    WITH RECURSIVE subtree AS (
      -- Base: the direct reports.
      SELECT e.id, 1 AS depth
      FROM employees e
      WHERE e."managerId" = ${employeeId}
        AND e."deletedAt" IS NULL

      UNION ALL

      -- Step: the reports of everyone already in the set.
      SELECT child.id, s.depth + 1
      FROM employees child
      JOIN subtree s ON child."managerId" = s.id
      WHERE child."deletedAt" IS NULL
        AND s.depth < ${MAX_TREE_DEPTH}
    )
    SELECT DISTINCT id FROM subtree
  `);

  return rows.map((r) => r.id);
}

/**
 * The chain of managers above `employeeId`, nearest first. Excludes the
 * employee. Used for breadcrumbs.
 */
export async function getAncestorIds(
  employeeId: string,
  client: DbClient = prisma,
): Promise<string[]> {
  const rows = await client.$queryRaw<IdRow[]>(Prisma.sql`
    WITH RECURSIVE chain AS (
      SELECT e.id, e."managerId", 0 AS depth
      FROM employees e
      WHERE e.id = ${employeeId}
        AND e."deletedAt" IS NULL

      UNION ALL

      SELECT parent.id, parent."managerId", c.depth + 1
      FROM employees parent
      JOIN chain c ON parent.id = c."managerId"
      WHERE parent."deletedAt" IS NULL
        AND c.depth < ${MAX_TREE_DEPTH}
    )
    -- Ordered nearest-first; the employee themselves is the depth-0 seed.
    SELECT id FROM chain WHERE depth > 0 ORDER BY depth ASC
  `);

  return rows.map((r) => r.id);
}

/**
 * Rejects any manager assignment that would create a cycle.
 *
 * Throws rather than returning a result, unlike guards.ts: this needs the
 * database, so it cannot be a pure guard, and there is no partial answer worth
 * reporting — a cycle is a hard no.
 *
 * The check is "is the proposed manager somewhere in MY subtree", answered with
 * ONE query.
 *
 * The tempting alternative — walk UP from newManagerId following managerId
 * until null, and see if you hit employeeId — is worse in two ways. It costs
 * O(depth) round trips, and if the data already contains a cycle the walk never
 * reaches null and loops forever. Descending from a known root with a
 * depth-capped CTE cannot hang.
 *
 * Pass `client` to re-check inside a transaction — see assignManager.
 */
export async function assertNoCycle(
  employeeId: string,
  newManagerId: string | null,
  actorRole: Role,
  client: DbClient = prisma,
): Promise<void> {
  if (newManagerId === null) {
    // Detaching makes this employee a root of the org chart. That is a
    // structural change, so it needs the same verb as any other reassignment.
    if (!can(actorRole, 'MANAGER:ASSIGN')) {
      throw forbidden('Your role may not detach an employee from their manager.');
    }
    return;
  }

  // The degenerate cycle, length 1. Cheap, and worth its own message — "cannot
  // report to self" is more useful than "this creates a cycle".
  if (newManagerId === employeeId) {
    throw conflict('An employee cannot report to themselves.');
  }

  const manager = await client.employee.findFirst({
    where: { id: newManagerId, deletedAt: null },
    select: { id: true },
  });
  // Covers both "no such id" and "soft-deleted": a tombstone is not a manager,
  // and the FK would happily accept it.
  if (manager === null) {
    throw notFound('Manager not found.');
  }

  const descendants = await getDescendantIds(employeeId, client);
  if (descendants.includes(newManagerId)) {
    throw conflict(
      'That employee reports to this one (directly or indirectly), so the assignment would create a reporting cycle.',
    );
  }
}

// ---------------------------------------------------------------------------
// Depth helper
// ---------------------------------------------------------------------------

/** Rejects a depth outside 1..MAX_TREE_DEPTH. */
export function assertValidDepth(depth: number | undefined): void {
  if (depth === undefined) return;
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_TREE_DEPTH) {
    throw badRequest(`depth must be an integer between 1 and ${String(MAX_TREE_DEPTH)}.`);
  }
}

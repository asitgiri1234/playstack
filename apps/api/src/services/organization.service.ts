/**
 * Org-chart assembly: the tree, direct/indirect reportees, manager assignment.
 */

import { Prisma } from '@prisma/client';
import { can } from '@playstack/shared';
import { prisma } from '../lib/prisma.js';
import { conflict, notFound } from '../lib/errors.js';
import { assertSelfScope, enforce } from './guards.js';
import {
  EMPLOYEE_SELECT,
  serializeEmployee,
  type Actor,
  type SerializableEmployee,
  type SerializedEmployee,
} from './employee.serializer.js';
import { assertNoCycle, getDescendantIds } from './hierarchy.service.js';

const LIVE = { deletedAt: null } as const;

export interface TreeNode extends Record<string, unknown> {
  reports: TreeNode[];
  directReportCount: number;
  totalDescendantCount: number;
}

export interface TreeOptions {
  rootId?: string | undefined;
  depth?: number | undefined;
}

/** Reported alongside the tree so a caller can see the data is inconsistent. */
export interface TreeResult {
  roots: TreeNode[];
  orphanCount: number;
}

/**
 * Builds the whole org tree from ONE query.
 *
 * Every live employee is fetched once, indexed into a Map, and linked in a
 * single pass — O(n), one round trip, regardless of depth.
 *
 * The obvious alternative is to fetch the roots and then recurse, querying each
 * node's children. That is N+1: it issues one query per employee. On the 23-row
 * seed it looks perfectly fine and returns in milliseconds, which is exactly
 * what makes it dangerous — it ships, and at 2,000 employees it is 2,000
 * serialized round trips and the endpoint times out. The cost of the pattern is
 * invisible at the size you develop against.
 */
export async function getTree(actor: Actor, options: TreeOptions = {}): Promise<TreeResult> {
  // THE query. Everything below is in-memory.
  const employees: SerializableEmployee[] = await prisma.employee.findMany({
    where: LIVE,
    select: EMPLOYEE_SELECT,
    // Stable sibling order; the tree is rendered, so arbitrary order would make
    // the UI reshuffle between identical requests.
    orderBy: [{ name: 'asc' }],
  });

  // Pass 1: index. Each node is serialized HERE, per-actor, so salary is
  // stripped for an EMPLOYEE viewing the chart exactly as it is on any other
  // endpoint. A tree is not a loophole.
  const nodes = new Map<string, TreeNode>();
  for (const employee of employees) {
    nodes.set(employee.id, {
      ...serializeEmployee(employee, actor),
      reports: [],
      directReportCount: 0,
      totalDescendantCount: 0,
    });
  }

  // Pass 2: link. One iteration, no recursion, no queries.
  const roots: TreeNode[] = [];
  const orphans: SerializableEmployee[] = [];

  for (const employee of employees) {
    const node = nodes.get(employee.id);
    if (node === undefined) continue;

    if (employee.managerId === null) {
      // Multiple roots are legitimate — the CEO, plus anyone detached during a
      // reorg. Nothing here assumes exactly one.
      roots.push(node);
      continue;
    }

    const parent = nodes.get(employee.managerId);
    if (parent === undefined) {
      /**
       * managerId points at a row that is missing or soft-deleted. softDelete()
       * re-parents reports precisely to prevent this, so it means the data is
       * inconsistent — a manual UPDATE, a failed migration, a bug.
       *
       * Surface them as roots rather than dropping them. A slightly wrong tree
       * is a visible problem someone fixes; an employee silently absent from
       * the org chart is an invisible one that nobody notices until payroll
       * disagrees with headcount.
       */
      orphans.push(employee);
      roots.push(node);
      continue;
    }

    parent.reports.push(node);
  }

  if (orphans.length > 0) {
    console.warn(
      `[org-tree] ${String(orphans.length)} employee(s) have a managerId pointing at a missing or deleted employee; surfacing them as roots. ids=${orphans
        .map((o) => o.id)
        .join(',')}`,
    );
  }

  // Pass 3: counts, bottom-up.
  for (const root of roots) computeCounts(root);

  let result = roots;

  if (options.rootId !== undefined) {
    const subtree = nodes.get(options.rootId);
    if (subtree === undefined) throw notFound('Employee not found.');
    result = [subtree];
  }

  if (options.depth !== undefined) {
    result = result.map((node) => truncate(node, options.depth ?? 1));
  }

  return { roots: result, orphanCount: orphans.length };
}

/**
 * Fills directReportCount and totalDescendantCount.
 *
 * Iterative, not recursive: a cycle that slipped past the write checks would
 * blow the stack here, and an org chart deep enough to matter is not worth a
 * RangeError. Post-order via an explicit stack, with a visited set so a cycle
 * terminates instead of spinning.
 */
function computeCounts(root: TreeNode): void {
  const order: TreeNode[] = [];
  const seen = new Set<TreeNode>();
  const stack: TreeNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || seen.has(node)) continue;
    seen.add(node);
    order.push(node);
    for (const child of node.reports) stack.push(child);
  }

  // Reverse of a pre-order DFS visits children before parents.
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const node = order[i];
    if (node === undefined) continue;
    node.directReportCount = node.reports.length;
    node.totalDescendantCount = node.reports.reduce(
      (sum, child) => sum + 1 + child.totalDescendantCount,
      0,
    );
  }
}

/**
 * Caps returned levels. Counts are NOT recomputed — directReportCount and
 * totalDescendantCount keep describing the real org, so a truncated node still
 * tells the UI "12 more below here" rather than lying about being a leaf.
 */
function truncate(node: TreeNode, depth: number): TreeNode {
  if (depth <= 1) return { ...node, reports: [] };
  return { ...node, reports: node.reports.map((child) => truncate(child, depth - 1)) };
}

// ---------------------------------------------------------------------------
// reportees
// ---------------------------------------------------------------------------

export async function getReportees(
  employeeId: string,
  direct: boolean,
  actor: Actor,
): Promise<SerializedEmployee[]> {
  // Same rule as getById: without READ_ALL you may only ask about yourself.
  // Checked before the existence lookup so a 404-vs-403 difference cannot be
  // used to probe which ids are real.
  if (!can(actor.role, 'EMPLOYEE:READ_ALL')) {
    enforce(assertSelfScope(actor.id, employeeId));
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, ...LIVE },
    select: { id: true },
  });
  if (employee === null) throw notFound('Employee not found.');

  if (direct) {
    const reports = await prisma.employee.findMany({
      where: { managerId: employeeId, ...LIVE },
      select: EMPLOYEE_SELECT,
      orderBy: [{ name: 'asc' }],
    });
    // A leaf has no reports. That is an empty list, not a missing resource —
    // 404 would mean "no such employee", which is a different fact.
    return reports.map((e) => serializeEmployee(e, actor));
  }

  const descendantIds = await getDescendantIds(employeeId);
  if (descendantIds.length === 0) return [];

  const descendants = await prisma.employee.findMany({
    where: { id: { in: descendantIds }, ...LIVE },
    select: EMPLOYEE_SELECT,
    orderBy: [{ name: 'asc' }],
  });
  return descendants.map((e) => serializeEmployee(e, actor));
}

// ---------------------------------------------------------------------------
// assignManager
// ---------------------------------------------------------------------------

export interface AssignManagerResult {
  employee: SerializedEmployee;
  /** The moved employee's subtree, so the client can repaint without refetching. */
  subtree: TreeNode[];
}

export async function assignManager(
  employeeId: string,
  newManagerId: string | null,
  actor: Actor,
): Promise<AssignManagerResult> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, ...LIVE },
    select: { id: true, managerId: true },
  });
  if (employee === null) throw notFound('Employee not found.');

  // Cheap pre-check: fail fast with a clear error before opening a transaction.
  // NOT the authority — see the re-check below.
  await assertNoCycle(employeeId, newManagerId, actor.role);

  await prisma.$transaction(
    async (tx) => {
      /**
       * Re-check INSIDE the transaction, at Serializable isolation.
       *
       * The pre-check above is a read and the write happens later; between them
       * another request can reshape the tree. A real TOCTOU race:
       *
       *   Request A: "make X report to Y"  — checks: Y is not under X. OK.
       *   Request B: "make Y report to X"  — checks: X is not under Y. OK.
       *   Both commit. X → Y → X. A cycle neither request could see.
       *
       * Each check was correct about the state it observed, and the pair is still
       * wrong — no amount of re-reading fixes that on its own. The ISOLATION
       * LEVEL is what closes the window: Serializable makes Postgres detect the
       * read/write dependency between the two transactions and abort one. Under
       * the default READ COMMITTED, B's re-check cannot see A's uncommitted write
       * and both commit happily; a repeated check at the wrong isolation level is
       * just the same race with extra steps.
       *
       * (Verified empirically, not assumed: with the interleave forced open,
       * exactly one of the two transactions commits and no cycle survives. See
       * "cycle is refused even when both checks pass before either write" —
       * and note that test opens its own transaction, so the companion test
       * asserting THIS call requests Serializable is the other half of the proof.)
       *
       * The re-check itself still earns its place: it puts the descendant read
       * inside the transaction's read set, and it turns the ordinary sequential
       * case into a clean 409 rather than a serialization error.
       */
      await assertNoCycle(employeeId, newManagerId, actor.role, tx);

      await tx.employee.update({
        where: { id: employeeId },
        data: { managerId: newManagerId },
        select: { id: true },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  const updated = await prisma.employee.findFirst({
    where: { id: employeeId, ...LIVE },
    select: EMPLOYEE_SELECT,
  });
  if (updated === null) throw conflict('Employee disappeared during reassignment.');

  // The subtree moved WITH the employee — managerId links are unchanged below
  // them, so re-reading the tree from this node reflects the new position.
  const tree = await getTree(actor, { rootId: employeeId });

  return { employee: serializeEmployee(updated, actor), subtree: tree.roots };
}

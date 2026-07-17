/**
 * Phase 3 evidence: cycle prevention, the org tree, reportees, and manager
 * assignment — driven through the real routes.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/harness.js';
import {
  disconnect,
  makeEmployee,
  resetDb,
  TEST_PASSWORD,
  type TestEmployee,
} from './helpers/db.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { assertNoCycle, getAncestorIds, getDescendantIds } from '../services/hierarchy.service.js';
import { assignManager, getTree } from '../services/organization.service.js';

const app = createTestApp();

async function tokenFor(employee: TestEmployee): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: employee.email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${employee.email}: ${res.status}`);
  return String(res.body.accessToken);
}

const auth = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

interface Chain {
  root: TestEmployee;
  mid: TestEmployee;
  leaf: TestEmployee;
  deep: TestEmployee;
}

/** root → mid → leaf → deep */
async function makeChain(): Promise<Chain> {
  const root = await makeEmployee({ role: 'EMPLOYEE' });
  const mid = await makeEmployee({ role: 'EMPLOYEE', managerId: root.id });
  const leaf = await makeEmployee({ role: 'EMPLOYEE', managerId: mid.id });
  const deep = await makeEmployee({ role: 'EMPLOYEE', managerId: leaf.id });
  return { root, mid, leaf, deep };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnect();
});

// ---------------------------------------------------------------------------
// Cycle prevention
// ---------------------------------------------------------------------------

describe('cycle prevention — PATCH /api/employees/:id/manager', () => {
  it('cannot assign self as manager', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const target = await makeEmployee({ role: 'EMPLOYEE' });

    const res = await request(app)
      .patch(`/api/employees/${target.id}/manager`)
      .set(...auth(token))
      .send({ managerId: target.id });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/cannot report to themselves/i);
  });

  it('cannot assign own direct report as manager', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { root, mid } = await makeChain();

    // mid reports to root; making root report to mid closes a 2-cycle.
    const res = await request(app)
      .patch(`/api/employees/${root.id}/manager`)
      .set(...auth(token))
      .send({ managerId: mid.id });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/cycle/i);

    const after = await prisma.employee.findUniqueOrThrow({ where: { id: root.id } });
    expect(after.managerId).toBeNull();
  });

  it('cannot assign a deep descendant as manager (3 levels down)', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { root, deep } = await makeChain();

    // `deep` is 3 levels below root. Walking only the direct reports would miss
    // this; the CTE covers the whole subtree.
    const res = await request(app)
      .patch(`/api/employees/${root.id}/manager`)
      .set(...auth(token))
      .send({ managerId: deep.id });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/cycle/i);
  });

  it('cannot assign a soft-deleted employee as manager', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const deleted = await makeEmployee({ role: 'EMPLOYEE', deletedAt: new Date('2024-01-01') });

    const res = await request(app)
      .patch(`/api/employees/${target.id}/manager`)
      .set(...auth(token))
      .send({ managerId: deleted.id });

    // The FK would accept the row; a tombstone is still not a manager.
    expect(res.status).toBe(404);
  });

  it('cannot assign a non-existent manager', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const target = await makeEmployee({ role: 'EMPLOYEE' });

    const res = await request(app)
      .patch(`/api/employees/${target.id}/manager`)
      .set(...auth(token))
      .send({ managerId: '00000000-0000-4000-8000-000000000000' });

    expect(res.status).toBe(404);
  });

  it('valid lateral reassignment succeeds', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const managerA = await makeEmployee({ role: 'EMPLOYEE' });
    const managerB = await makeEmployee({ role: 'EMPLOYEE' });
    const worker = await makeEmployee({ role: 'EMPLOYEE', managerId: managerA.id });

    const res = await request(app)
      .patch(`/api/employees/${worker.id}/manager`)
      .set(...auth(token))
      .send({ managerId: managerB.id });

    expect(res.status).toBe(200);
    const after = await prisma.employee.findUniqueOrThrow({ where: { id: worker.id } });
    expect(after.managerId).toBe(managerB.id);
  });

  it('moving a manager moves their whole subtree with them', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { root, mid, leaf, deep } = await makeChain();
    const newBoss = await makeEmployee({ role: 'EMPLOYEE' });

    // Move `mid` (which carries leaf → deep) under a different root.
    const res = await request(app)
      .patch(`/api/employees/${mid.id}/manager`)
      .set(...auth(token))
      .send({ managerId: newBoss.id });

    expect(res.status).toBe(200);

    // Only mid's own edge changed; the links below it are untouched, so the
    // subtree travels with it.
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: mid.id } })).managerId).toBe(
      newBoss.id,
    );
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: leaf.id } })).managerId).toBe(
      mid.id,
    );
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: deep.id } })).managerId).toBe(
      leaf.id,
    );

    // root no longer has mid's subtree beneath it.
    expect(await getDescendantIds(root.id)).toEqual([]);
    expect((await getDescendantIds(newBoss.id)).sort()).toEqual([mid.id, leaf.id, deep.id].sort());

    // And the response carries the moved subtree for repainting.
    expect(res.body.subtree[0].id).toBe(mid.id);
    expect(res.body.subtree[0].totalDescendantCount).toBe(2);
  });

  it('detaching to null creates a root', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { mid } = await makeChain();

    const res = await request(app)
      .patch(`/api/employees/${mid.id}/manager`)
      .set(...auth(token))
      .send({ managerId: null });

    expect(res.status).toBe(200);
    expect(
      (await prisma.employee.findUniqueOrThrow({ where: { id: mid.id } })).managerId,
    ).toBeNull();
  });

  it('HR_MANAGER cannot assign managers', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);
    const { root, mid } = await makeChain();

    const res = await request(app)
      .patch(`/api/employees/${mid.id}/manager`)
      .set(...auth(token))
      .send({ managerId: root.id });

    // MANAGER:ASSIGN is SUPER_ADMIN-only.
    expect(res.status).toBe(403);
  });

  it('HR_MANAGER cannot reassign a manager through PUT /:id either', async () => {
    // The back door: managerId is in HR's field whitelist, so without a
    // field-level permission this PUT would reshape the org chart while the
    // dedicated endpoint 403s.
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);
    const managerA = await makeEmployee({ role: 'EMPLOYEE' });
    const worker = await makeEmployee({ role: 'EMPLOYEE' });

    const res = await request(app)
      .put(`/api/employees/${worker.id}`)
      .set(...auth(token))
      .send({ managerId: managerA.id });

    expect(res.status).toBe(403);
    expect(res.body.error.details.rejectedFields).toContain('managerId');
    expect(
      (await prisma.employee.findUniqueOrThrow({ where: { id: worker.id } })).managerId,
    ).toBeNull();
  });

  it('PUT /:id cannot create a cycle either', async () => {
    // The dedicated endpoint is cycle-checked; this second door must be too.
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { root, deep } = await makeChain();

    const res = await request(app)
      .put(`/api/employees/${root.id}`)
      .set(...auth(token))
      .send({ managerId: deep.id });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/cycle/i);
  });

  it('concurrent manager reassignments cannot create a cycle', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);

    // Two unrelated roots. Each request is individually legal against the state
    // it observes:
    //   A: make x report to y   (y is not under x — true right now)
    //   B: make y report to x   (x is not under y — true right now)
    // Committing both yields x → y → x.
    const x = await makeEmployee({ role: 'EMPLOYEE' });
    const y = await makeEmployee({ role: 'EMPLOYEE' });

    const [resA, resB] = await Promise.all([
      request(app)
        .patch(`/api/employees/${x.id}/manager`)
        .set(...auth(token))
        .send({ managerId: y.id }),
      request(app)
        .patch(`/api/employees/${y.id}/manager`)
        .set(...auth(token))
        .send({ managerId: x.id }),
    ]);

    // Exactly one wins. The loser fails — either on the cycle re-check or on a
    // serialization conflict; both are correct refusals.
    const statuses = [resA.status, resB.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).not.toBe(200);

    const afterX = await prisma.employee.findUniqueOrThrow({ where: { id: x.id } });
    const afterY = await prisma.employee.findUniqueOrThrow({ where: { id: y.id } });
    expect(afterX.managerId === y.id && afterY.managerId === x.id).toBe(false);
  });

  it('cycle is refused even when both checks pass before either write commits', async () => {
    /**
     * The test above does NOT actually exercise the TOCTOU race, and that is
     * worth being explicit about: supertest drives both requests through one
     * Node process, so they interleave at the event loop but not inside the
     * database. The second request's pre-check runs after the first has already
     * committed, and catches the cycle on its own. Delete the in-transaction
     * re-check and the isolation level entirely and that test still passes.
     *
     * This one forces the real interleaving: BOTH transactions run their cycle
     * check, and only then does either write. That is the window a pre-check
     * cannot close, and the only thing standing in it is Serializable
     * isolation — under READ COMMITTED both transactions commit happily and the
     * org chart ends up with x → y → x.
     */
    const x = await makeEmployee({ role: 'EMPLOYEE' });
    const y = await makeEmployee({ role: 'EMPLOYEE' });

    const attempt = (employeeId: string, managerId: string) =>
      prisma.$transaction(
        async (tx) => {
          await assertNoCycle(employeeId, managerId, 'SUPER_ADMIN', tx);
          // Hold the transaction open so the sibling's check runs before this
          // one writes — deterministically recreating the race.
          await new Promise((resolve) => setTimeout(resolve, 200));
          await tx.employee.update({ where: { id: employeeId }, data: { managerId } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
      );

    const results = await Promise.allSettled([attempt(x.id, y.id), attempt(y.id, x.id)]);
    const committed = results.filter((r) => r.status === 'fulfilled').length;

    // At most one may commit. Both failing is also safe — Postgres is entitled
    // to abort either side of a serialization conflict.
    expect(committed).toBeLessThanOrEqual(1);

    // The assertion that actually matters: no cycle exists, whatever happened.
    const afterX = await prisma.employee.findUniqueOrThrow({ where: { id: x.id } });
    const afterY = await prisma.employee.findUniqueOrThrow({ where: { id: y.id } });
    expect(afterX.managerId === y.id && afterY.managerId === x.id).toBe(false);
  });

  it('assignManager runs its write under Serializable isolation', async () => {
    /**
     * The other half of the proof.
     *
     * The test above shows that Serializable isolation refuses the interleaved
     * cycle — but it opens its OWN transaction, so it would keep passing even
     * if the service dropped to READ COMMITTED. This asserts the service
     * actually requests the isolation level that the mechanism depends on.
     *
     * Together: Serializable closes the window, and assignManager uses
     * Serializable. Neither statement is worth much alone.
     */
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const actor = { id: admin.id, role: 'SUPER_ADMIN' as const };
    const worker = await makeEmployee({ role: 'EMPLOYEE' });
    const boss = await makeEmployee({ role: 'EMPLOYEE' });

    const spy = vi.spyOn(prisma, '$transaction');
    await assignManager(worker.id, boss.id, actor);

    const options = spy.mock.calls[0]?.[1] as { isolationLevel?: string } | undefined;
    spy.mockRestore();

    expect(options?.isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);
  });
});

// ---------------------------------------------------------------------------
// CTE helpers
// ---------------------------------------------------------------------------

describe('recursive CTE helpers', () => {
  it('getDescendantIds returns the whole subtree at any depth', async () => {
    const { root, mid, leaf, deep } = await makeChain();
    expect((await getDescendantIds(root.id)).sort()).toEqual([mid.id, leaf.id, deep.id].sort());
    expect((await getDescendantIds(leaf.id)).sort()).toEqual([deep.id]);
    expect(await getDescendantIds(deep.id)).toEqual([]);
  });

  it('getDescendantIds excludes soft-deleted branches', async () => {
    const root = await makeEmployee({ role: 'EMPLOYEE' });
    const gone = await makeEmployee({
      role: 'EMPLOYEE',
      managerId: root.id,
      deletedAt: new Date('2024-01-01'),
    });
    // A live report of a deleted manager is cut with the branch: the CTE never
    // descends through the tombstone.
    await makeEmployee({ role: 'EMPLOYEE', managerId: gone.id });

    expect(await getDescendantIds(root.id)).toEqual([]);
  });

  it('getAncestorIds returns the chain to the root, nearest first', async () => {
    const { root, mid, leaf, deep } = await makeChain();
    expect(await getAncestorIds(deep.id)).toEqual([leaf.id, mid.id, root.id]);
    expect(await getAncestorIds(root.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

interface ApiNode {
  id: string;
  name: string;
  salary?: string;
  reports: ApiNode[];
  directReportCount: number;
  totalDescendantCount: number;
}

describe('GET /api/organization/tree', () => {
  it('builds a nested tree with correct counts', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { root, mid } = await makeChain();

    const res = await request(app)
      .get(`/api/organization/tree?rootId=${root.id}`)
      .set(...auth(token));

    expect(res.status).toBe(200);
    const node = res.body.data[0] as ApiNode;
    expect(node.id).toBe(root.id);
    expect(node.directReportCount).toBe(1);
    expect(node.totalDescendantCount).toBe(3); // mid + leaf + deep
    expect(node.reports[0]?.id).toBe(mid.id);
    expect(node.reports[0]?.totalDescendantCount).toBe(2);
    expect(admin.role).toBe('SUPER_ADMIN');
  });

  it('tree returns multiple roots when multiple exist', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' }); // a root itself
    const token = await tokenFor(admin);
    const rootA = await makeEmployee({ role: 'EMPLOYEE' });
    const rootB = await makeEmployee({ role: 'EMPLOYEE' });
    await makeEmployee({ role: 'EMPLOYEE', managerId: rootA.id });

    const res = await request(app)
      .get('/api/organization/tree')
      .set(...auth(token));

    const ids = (res.body.data as ApiNode[]).map((n) => n.id);
    // Nothing assumes a single root — admin, rootA and rootB are all roots.
    expect(ids).toEqual(expect.arrayContaining([admin.id, rootA.id, rootB.id]));
    expect(ids).toHaveLength(3);
  });

  it('orphaned node surfaces as root, is not dropped', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const ghostManager = await makeEmployee({ role: 'EMPLOYEE' });
    const orphan = await makeEmployee({ role: 'EMPLOYEE', managerId: ghostManager.id });

    // Soft-delete the manager WITHOUT re-parenting — simulating the bad data
    // that a manual UPDATE or a failed migration leaves behind.
    await prisma.employee.update({
      where: { id: ghostManager.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app)
      .get('/api/organization/tree')
      .set(...auth(token));

    const ids = (res.body.data as ApiNode[]).map((n) => n.id);
    // Losing an employee from the chart is worse than an ugly chart.
    expect(ids).toContain(orphan.id);
    expect(res.body.orphanCount).toBe(1);
  });

  it('EMPLOYEE viewing tree sees names but not other salaries', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE', salary: '1111111.00' });
    const token = await tokenFor(employee);
    const other = await makeEmployee({ role: 'EMPLOYEE', salary: '8888888.00' });

    const res = await request(app)
      .get('/api/organization/tree')
      .set(...auth(token));

    expect(res.status).toBe(200);
    const flat: ApiNode[] = [];
    const walk = (nodes: ApiNode[]) => {
      for (const n of nodes) {
        flat.push(n);
        walk(n.reports);
      }
    };
    walk(res.body.data as ApiNode[]);

    // Structure and names are visible to everyone — the chart is not a secret.
    expect(flat.map((n) => n.id)).toEqual(expect.arrayContaining([employee.id, other.id]));
    expect(flat.every((n) => typeof n.name === 'string')).toBe(true);

    // Pay is not. The tree is not a loophole around the serializer.
    expect(flat.find((n) => n.id === other.id)).not.toHaveProperty('salary');
    expect(flat.find((n) => n.id === employee.id)?.salary).toBe('1111111');
    expect(JSON.stringify(res.body)).not.toContain('8888888');
  });

  it('?depth=1 caps returned levels but keeps honest counts', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { root } = await makeChain();

    const res = await request(app)
      .get(`/api/organization/tree?rootId=${root.id}&depth=1`)
      .set(...auth(token));

    const node = res.body.data[0] as ApiNode;
    expect(node.reports).toEqual([]);
    // Truncated, not lying: the UI can still say "3 people below here".
    expect(node.totalDescendantCount).toBe(3);
  });

  it('excludes soft-deleted employees from the tree', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const deleted = await makeEmployee({ role: 'EMPLOYEE', deletedAt: new Date('2024-01-01') });

    const res = await request(app)
      .get('/api/organization/tree')
      .set(...auth(token));

    expect(JSON.stringify(res.body)).not.toContain(deleted.id);
  });

  it('rejects a bad depth with 400', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);

    const res = await request(app)
      .get('/api/organization/tree?depth=0')
      .set(...auth(token));

    expect(res.status).toBe(400);
  });

  it('tree builds in a single query', async () => {
    /**
     * The N+1 test.
     *
     * Asserting the QUERY COUNT, not the latency: a per-node recursion returns
     * in milliseconds on a handful of rows and would pass any timing check here
     * while being catastrophic at 2,000 employees.
     *
     * And the count is measured at two different org sizes, because "1 query"
     * on its own could be a coincidence of the fixture. What actually proves
     * there is no N+1 is that the count does NOT grow with the number of
     * employees.
     */
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    await makeChain(); // 4 more employees

    const actor = { id: admin.id, role: 'SUPER_ADMIN' as const };
    const spy = vi.spyOn(prisma.employee, 'findMany');

    await getTree(actor);
    const smallOrgQueries = spy.mock.calls.length;
    const smallOrgSize = await prisma.employee.count({ where: { deletedAt: null } });

    // Triple the org.
    spy.mockClear();
    await makeChain();
    await makeChain();
    await getTree(actor);
    const largeOrgQueries = spy.mock.calls.length;
    const largeOrgSize = await prisma.employee.count({ where: { deletedAt: null } });

    spy.mockRestore();

    expect(largeOrgSize).toBeGreaterThan(smallOrgSize);
    expect(smallOrgQueries).toBe(1);
    // Constant, not proportional. This is the assertion that matters.
    expect(largeOrgQueries).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Reportees
// ---------------------------------------------------------------------------

describe('GET /api/employees/:id/reportees', () => {
  it('returns direct reports by default', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { root, mid } = await makeChain();

    const res = await request(app)
      .get(`/api/employees/${root.id}/reportees`)
      .set(...auth(token));

    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((e) => e.id)).toEqual([mid.id]);
  });

  it('direct=false returns full descendant subtree', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { root, mid, leaf, deep } = await makeChain();

    const res = await request(app)
      .get(`/api/employees/${root.id}/reportees?direct=false`)
      .set(...auth(token));

    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((e) => e.id).sort()).toEqual(
      [mid.id, leaf.id, deep.id].sort(),
    );
  });

  it('reportees returns empty array for leaf, not 404', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const { deep } = await makeChain();

    const res = await request(app)
      .get(`/api/employees/${deep.id}/reportees`)
      .set(...auth(token));

    // "No reports" and "no such employee" are different facts.
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("EMPLOYEE cannot fetch another employee's reportees", async () => {
    const attacker = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(attacker);
    const { root } = await makeChain();

    const res = await request(app)
      .get(`/api/employees/${root.id}/reportees`)
      .set(...auth(token));

    expect(res.status).toBe(403);
  });

  it('EMPLOYEE can fetch their own reportees', async () => {
    const manager = await makeEmployee({ role: 'EMPLOYEE' });
    const report = await makeEmployee({ role: 'EMPLOYEE', managerId: manager.id });
    const token = await tokenFor(manager);

    const res = await request(app)
      .get(`/api/employees/${manager.id}/reportees`)
      .set(...auth(token));

    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((e) => e.id)).toEqual([report.id]);
  });

  it("strips salary from another employee's reportees for a non-privileged actor", async () => {
    const manager = await makeEmployee({ role: 'EMPLOYEE' });
    await makeEmployee({ role: 'EMPLOYEE', managerId: manager.id, salary: '7777777.00' });
    const token = await tokenFor(manager);

    const res = await request(app)
      .get(`/api/employees/${manager.id}/reportees`)
      .set(...auth(token));

    // A manager may see WHO reports to them without seeing what they earn.
    expect(res.body.data[0]).not.toHaveProperty('salary');
    expect(JSON.stringify(res.body)).not.toContain('7777777');
  });

  it('returns 404 for a missing employee when privileged', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);

    const res = await request(app)
      .get('/api/employees/00000000-0000-4000-8000-000000000000/reportees')
      .set(...auth(token));

    expect(res.status).toBe(404);
  });
});

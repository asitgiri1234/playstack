/**
 * Phase 2 evidence: CRUD, search/filter/sort/pagination, salary visibility and
 * the dashboard — driven through the real /api/employees routes.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/harness.js';
import {
  disconnect,
  makeEmployee,
  resetDb,
  TEST_PASSWORD,
  type TestEmployee,
} from './helpers/db.js';
import { prisma } from '../lib/prisma.js';

const app = createTestApp();

async function tokenFor(employee: TestEmployee): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: employee.email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${employee.email}: ${res.status}`);
  return String(res.body.accessToken);
}

const auth = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnect();
});

// ---------------------------------------------------------------------------
// Access to the list
// ---------------------------------------------------------------------------

describe('GET /api/employees — access', () => {
  it('EMPLOYEE cannot list all employees', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .get('/api/employees')
      .set(...auth(token));

    // Denied at authorize(): EMPLOYEE has no EMPLOYEE:READ_ALL.
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
  });

  it('HR_MANAGER can list employees', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .get('/api/employees')
      .set(...auth(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Salary visibility
// ---------------------------------------------------------------------------

describe('salary visibility', () => {
  it("EMPLOYEE sees own salary but not others'", async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE', salary: '1234567.00' });
    const token = await tokenFor(employee);

    const own = await request(app)
      .get(`/api/employees/${employee.id}`)
      .set(...auth(token));

    expect(own.status).toBe(200);
    expect(own.body.data.salary).toBe('1234567');

    // Another employee's record is not readable at all (scope), so the salary
    // cannot leak through this route.
    const victim = await makeEmployee({ role: 'EMPLOYEE', salary: '9999999.00' });
    const other = await request(app)
      .get(`/api/employees/${victim.id}`)
      .set(...auth(token));

    expect(other.status).toBe(403);
    expect(JSON.stringify(other.body)).not.toContain('9999999');
  });

  it('HR sees all salaries', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const target = await makeEmployee({ role: 'EMPLOYEE', salary: '4242424.00' });
    const token = await tokenFor(hr);

    const single = await request(app)
      .get(`/api/employees/${target.id}`)
      .set(...auth(token));
    expect(single.body.data.salary).toBe('4242424');

    const listed = await request(app)
      .get('/api/employees')
      .set(...auth(token));
    const found = (listed.body.data as { id: string; salary?: string }[]).find(
      (e) => e.id === target.id,
    );
    expect(found?.salary).toBe('4242424');
  });

  it('never serialises passwordHash', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .get('/api/employees')
      .set(...auth(token));

    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('hides deletedAt from HR_MANAGER but shows it to SUPER_ADMIN', async () => {
    // deletedAt is an administrative tombstone, gated by the same permission
    // that creates it.
    const target = await makeEmployee({ role: 'EMPLOYEE' });

    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const hrRes = await request(app)
      .get(`/api/employees/${target.id}`)
      .set(...auth(await tokenFor(hr)));
    expect(hrRes.body.data).not.toHaveProperty('deletedAt');

    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const adminRes = await request(app)
      .get(`/api/employees/${target.id}`)
      .set(...auth(await tokenFor(admin)));
    expect(adminRes.body.data).toHaveProperty('deletedAt');
  });
});

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

describe('GET /api/employees — query params', () => {
  it('sortBy=malicious_input returns 400, not 500', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .get('/api/employees?sortBy=salary;DROP TABLE employees')
      .set(...auth(token));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // The response names the offending field rather than leaking a query error.
    expect(res.body.error.details).toHaveProperty('sortBy');
  });

  it('rejects an unknown query param rather than ignoring it', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .get('/api/employees?nonsense=1')
      .set(...auth(token));

    expect(res.status).toBe(400);
  });

  it('limit=99999 is capped at 100', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .get('/api/employees?limit=99999')
      .set(...auth(token));

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  it('search matches partial name case-insensitively', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);
    const target = await prisma.employee.update({
      where: { id: (await makeEmployee({ role: 'EMPLOYEE' })).id },
      data: { name: 'Priyanka Chatterjee' },
    });
    await prisma.employee.update({
      where: { id: (await makeEmployee({ role: 'EMPLOYEE' })).id },
      data: { name: 'Rahul Verma' },
    });

    const res = await request(app)
      .get('/api/employees?search=YANKA')
      .set(...auth(token));

    expect(res.status).toBe(200);
    const names = (res.body.data as { name: string }[]).map((e) => e.name);
    expect(names).toContain(target.name);
    expect(names).not.toContain('Rahul Verma');
  });

  it('search also matches email', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);
    await makeEmployee({ role: 'EMPLOYEE', email: 'findme@playstack.test' });

    const res = await request(app)
      .get('/api/employees?search=findme')
      .set(...auth(token));

    expect((res.body.data as { email: string }[]).map((e) => e.email)).toContain(
      'findme@playstack.test',
    );
  });

  it('filters compose: department + status + role', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const wanted = await makeEmployee({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await prisma.employee.update({ where: { id: wanted.id }, data: { department: 'Sales' } });

    // Each of these differs from `wanted` in exactly one filtered dimension, so
    // any one filter failing to apply shows up as an extra row.
    const wrongDept = await makeEmployee({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await prisma.employee.update({ where: { id: wrongDept.id }, data: { department: 'Finance' } });

    const wrongStatus = await makeEmployee({ role: 'EMPLOYEE', status: 'INACTIVE' });
    await prisma.employee.update({ where: { id: wrongStatus.id }, data: { department: 'Sales' } });

    const wrongRole = await makeEmployee({ role: 'HR_MANAGER', status: 'ACTIVE' });
    await prisma.employee.update({ where: { id: wrongRole.id }, data: { department: 'Sales' } });

    const res = await request(app)
      .get('/api/employees?department=Sales&status=ACTIVE&role=EMPLOYEE')
      .set(...auth(token));

    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((e) => e.id)).toEqual([wanted.id]);
  });

  it('repeatable department filter ORs within the filter', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const sales = await makeEmployee({ role: 'EMPLOYEE' });
    await prisma.employee.update({ where: { id: sales.id }, data: { department: 'Sales' } });
    const eng = await makeEmployee({ role: 'EMPLOYEE' });
    await prisma.employee.update({ where: { id: eng.id }, data: { department: 'Engineering' } });
    const fin = await makeEmployee({ role: 'EMPLOYEE' });
    await prisma.employee.update({ where: { id: fin.id }, data: { department: 'Finance' } });

    const res = await request(app)
      .get('/api/employees?department=Sales&department=Engineering')
      .set(...auth(token));

    const ids = (res.body.data as { id: string }[]).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([sales.id, eng.id]));
    expect(ids).not.toContain(fin.id);
  });

  it('managerId filter returns direct reports', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);
    const manager = await makeEmployee({ role: 'EMPLOYEE' });
    const report = await makeEmployee({ role: 'EMPLOYEE', managerId: manager.id });
    await makeEmployee({ role: 'EMPLOYEE' });

    const res = await request(app)
      .get(`/api/employees?managerId=${manager.id}`)
      .set(...auth(token));

    expect((res.body.data as { id: string }[]).map((e) => e.id)).toEqual([report.id]);
  });

  it('soft-deleted employees excluded from list by default', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const deleted = await makeEmployee({ role: 'EMPLOYEE', deletedAt: new Date('2024-01-01') });
    const live = await makeEmployee({ role: 'EMPLOYEE' });

    const res = await request(app)
      .get('/api/employees')
      .set(...auth(token));

    const ids = (res.body.data as { id: string }[]).map((e) => e.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(deleted.id);
  });

  it('includeDeleted works for SUPER_ADMIN', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const deleted = await makeEmployee({ role: 'EMPLOYEE', deletedAt: new Date('2024-01-01') });

    const res = await request(app)
      .get('/api/employees?includeDeleted=true')
      .set(...auth(token));

    expect((res.body.data as { id: string }[]).map((e) => e.id)).toContain(deleted.id);
  });

  it('includeDeleted ignored for HR_MANAGER', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);
    const deleted = await makeEmployee({ role: 'EMPLOYEE', deletedAt: new Date('2024-01-01') });

    const res = await request(app)
      .get('/api/employees?includeDeleted=true')
      .set(...auth(token));

    // Ignored, not rejected: the flag is a view preference, so HR gets the
    // normal live list rather than a 403.
    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((e) => e.id)).not.toContain(deleted.id);
  });

  it('sorts by name ascending and descending', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);
    for (const name of ['Zara Khan', 'Aditi Rao', 'Manish Roy']) {
      const e = await makeEmployee({ role: 'EMPLOYEE' });
      await prisma.employee.update({ where: { id: e.id }, data: { name } });
    }

    const asc = await request(app)
      .get('/api/employees?sortBy=name&sortOrder=asc&role=EMPLOYEE')
      .set(...auth(token));
    const ascNames = (asc.body.data as { name: string }[]).map((e) => e.name);
    expect(ascNames).toEqual(['Aditi Rao', 'Manish Roy', 'Zara Khan']);

    const desc = await request(app)
      .get('/api/employees?sortBy=name&sortOrder=desc&role=EMPLOYEE')
      .set(...auth(token));
    const descNames = (desc.body.data as { name: string }[]).map((e) => e.name);
    expect(descNames).toEqual(['Zara Khan', 'Manish Roy', 'Aditi Rao']);
  });

  it('pagination totals are correct across pages', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);
    // 7 employees + the HR actor = 8 rows total.
    for (let i = 0; i < 7; i += 1) await makeEmployee({ role: 'EMPLOYEE' });

    const page1 = await request(app)
      .get('/api/employees?page=1&limit=5&sortBy=name')
      .set(...auth(token));
    expect(page1.body.pagination).toMatchObject({
      page: 1,
      limit: 5,
      total: 8,
      totalPages: 2,
      hasNext: true,
      hasPrev: false,
    });
    expect(page1.body.data).toHaveLength(5);

    const page2 = await request(app)
      .get('/api/employees?page=2&limit=5&sortBy=name')
      .set(...auth(token));
    expect(page2.body.pagination).toMatchObject({
      page: 2,
      total: 8,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    });
    expect(page2.body.data).toHaveLength(3);

    // No row appears on both pages and none is skipped.
    const ids1 = (page1.body.data as { id: string }[]).map((e) => e.id);
    const ids2 = (page2.body.data as { id: string }[]).map((e) => e.id);
    expect(new Set([...ids1, ...ids2]).size).toBe(8);
  });

  it('an empty result set reports zero totals rather than erroring', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .get('/api/employees?search=nobodybythisname')
      .set(...auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toMatchObject({ total: 0, totalPages: 0, hasNext: false });
  });
});

// ---------------------------------------------------------------------------
// getById
// ---------------------------------------------------------------------------

describe('GET /api/employees/:id', () => {
  it('returns 404 for a genuinely missing id when the actor may read all', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .get('/api/employees/00000000-0000-4000-8000-000000000000')
      .set(...auth(token));

    expect(res.status).toBe(404);
  });

  it('returns 403 (not 404) when an EMPLOYEE asks for a nonexistent id', async () => {
    // Scope is decided before the lookup, so a 404-vs-403 difference cannot be
    // used to probe which uuids are real employees.
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .get('/api/employees/00000000-0000-4000-8000-000000000000')
      .set(...auth(token));

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

const validCreateBody = {
  name: 'New Hire',
  email: 'new.hire@playstack.test',
  phone: '+919810000456',
  department: 'Engineering',
  designation: 'Engineer',
  salary: '1200000.00',
  joiningDate: '2023-04-01',
};

describe('POST /api/employees', () => {
  it('creates an employee with a sequential employeeCode', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send(validCreateBody);

    expect(res.status).toBe(201);
    expect(res.body.data.employeeCode).toMatch(/^EMP-\d{4}$/);
    // Generated because the request omitted a password — returned once.
    expect(typeof res.body.temporaryPassword).toBe('string');
  });

  it('increments employeeCode across creates', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const first = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send(validCreateBody);
    const second = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send({ ...validCreateBody, email: 'second.hire@playstack.test' });

    const codeOf = (r: request.Response) => Number(String(r.body.data.employeeCode).slice(4));
    expect(codeOf(second)).toBe(codeOf(first) + 1);
  });

  it('duplicate email returns 409 not 500', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const first = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send(validCreateBody);
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send(validCreateBody);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
    // A raw Prisma P2002 would leak the constraint and column names.
    expect(JSON.stringify(duplicate.body)).not.toMatch(/P2002|prisma|constraint/i);
  });

  it('the temp password actually works for login', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const created = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send(validCreateBody);

    const login = await request(app).post('/api/auth/login').send({
      email: validCreateBody.email,
      password: created.body.temporaryPassword,
    });
    expect(login.status).toBe(200);
  });

  it('HR_MANAGER cannot create a SUPER_ADMIN', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send({ ...validCreateBody, role: 'SUPER_ADMIN' });

    expect(res.status).toBe(403);
    expect(await prisma.employee.count({ where: { email: validCreateBody.email } })).toBe(0);
  });

  it('EMPLOYEE cannot create employees', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send(validCreateBody);

    expect(res.status).toBe(403);
  });

  it('rejects a future joiningDate with 400', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send({ ...validCreateBody, joiningDate: '2099-01-01' });

    expect(res.status).toBe(400);
  });

  it('rejects an unknown manager with 404', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .post('/api/employees')
      .set(...auth(token))
      .send({ ...validCreateBody, managerId: '00000000-0000-4000-8000-000000000000' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('PUT /api/employees/:id and PATCH /api/employees/me', () => {
  it('HR updates an employee', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .put(`/api/employees/${target.id}`)
      .set(...auth(token))
      .send({ designation: 'Staff Engineer', salary: '2000000.00' });

    expect(res.status).toBe(200);
    expect(res.body.data.designation).toBe('Staff Engineer');
    expect(res.body.data.salary).toBe('2000000');
  });

  it('PATCH /me updates own phone', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .patch('/api/employees/me')
      .set(...auth(token))
      .send({ phone: '+919810000999' });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('+919810000999');
  });

  it('PATCH /me cannot write salary', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .patch('/api/employees/me')
      .set(...auth(token))
      .send({ salary: '9999999.00' });

    expect(res.status).toBe(403);
    const after = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(after.salary.toString()).toBe('1000000');
  });

  it('duplicate email on update returns 409', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const a = await makeEmployee({ role: 'EMPLOYEE', email: 'taken@playstack.test' });
    const b = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);
    expect(a.email).toBe('taken@playstack.test');

    const res = await request(app)
      .put(`/api/employees/${b.id}`)
      .set(...auth(token))
      .send({ email: 'taken@playstack.test' });

    expect(res.status).toBe(409);
  });

  it('rejects making an employee their own manager', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .put(`/api/employees/${target.id}`)
      .set(...auth(token))
      .send({ managerId: target.id });

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// delete / restore
// ---------------------------------------------------------------------------

describe('DELETE /api/employees/:id', () => {
  it('deleting a manager reassigns their reports to the grandparent', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);

    // grandparent → manager → [reportA, reportB]
    const grandparent = await makeEmployee({ role: 'EMPLOYEE' });
    const manager = await makeEmployee({ role: 'EMPLOYEE', managerId: grandparent.id });
    const reportA = await makeEmployee({ role: 'EMPLOYEE', managerId: manager.id });
    const reportB = await makeEmployee({ role: 'EMPLOYEE', managerId: manager.id });

    const res = await request(app)
      .delete(`/api/employees/${manager.id}`)
      .set(...auth(token));
    expect(res.status).toBe(200);

    // The subtree moved up rather than being orphaned or left pointing at a
    // tombstone.
    const afterA = await prisma.employee.findUniqueOrThrow({ where: { id: reportA.id } });
    const afterB = await prisma.employee.findUniqueOrThrow({ where: { id: reportB.id } });
    expect(afterA.managerId).toBe(grandparent.id);
    expect(afterB.managerId).toBe(grandparent.id);

    const afterManager = await prisma.employee.findUniqueOrThrow({ where: { id: manager.id } });
    expect(afterManager.deletedAt).not.toBeNull();
  });

  it('deleting a root manager promotes their reports to root', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);
    const root = await makeEmployee({ role: 'EMPLOYEE' });
    const report = await makeEmployee({ role: 'EMPLOYEE', managerId: root.id });

    await request(app)
      .delete(`/api/employees/${root.id}`)
      .set(...auth(token));

    const after = await prisma.employee.findUniqueOrThrow({ where: { id: report.id } });
    expect(after.managerId).toBeNull();
  });

  it('soft delete keeps the row', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(admin);

    await request(app)
      .delete(`/api/employees/${target.id}`)
      .set(...auth(token));

    // Salary and reporting history are audit evidence — the row survives.
    expect(await prisma.employee.findUnique({ where: { id: target.id } })).not.toBeNull();
  });

  it('restores a soft-deleted employee', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const target = await makeEmployee({ role: 'EMPLOYEE', deletedAt: new Date('2024-01-01') });
    const token = await tokenFor(admin);

    const res = await request(app)
      .post(`/api/employees/${target.id}/restore`)
      .set(...auth(token));

    expect(res.status).toBe(200);
    const after = await prisma.employee.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.deletedAt).toBeNull();
  });

  it('restoring a live employee returns 409', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(admin);

    const res = await request(app)
      .post(`/api/employees/${target.id}/restore`)
      .set(...auth(token));

    expect(res.status).toBe(409);
  });

  it('HR_MANAGER cannot delete via the real route', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .delete(`/api/employees/${target.id}`)
      .set(...auth(token));

    expect(res.status).toBe(403);
  });

  it('cannot delete the last SUPER_ADMIN', async () => {
    const admin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(admin);

    const res = await request(app)
      .delete(`/api/employees/${admin.id}`)
      .set(...auth(token));

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

describe('GET /api/employees/stats', () => {
  it('resolves /stats as a route, not as an :id', async () => {
    // Registration order: if /:id came first, "stats" would bind as an id and
    // this would 404 or 403.
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .get('/api/employees/stats')
      .set(...auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalEmployees');
  });

  it('returns counts and groupings', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' }); // HR dept by default
    const token = await tokenFor(hr);

    const a = await makeEmployee({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await prisma.employee.update({ where: { id: a.id }, data: { department: 'Sales' } });
    const b = await makeEmployee({ role: 'EMPLOYEE', status: 'INACTIVE' });
    await prisma.employee.update({ where: { id: b.id }, data: { department: 'Sales' } });
    await makeEmployee({ role: 'EMPLOYEE', deletedAt: new Date('2024-01-01') });

    const res = await request(app)
      .get('/api/employees/stats')
      .set(...auth(token));

    expect(res.status).toBe(200);
    // Soft-deleted rows are excluded everywhere: 3 live (hr + a + b).
    expect(res.body.totalEmployees).toBe(3);
    expect(res.body.activeEmployees).toBe(2);
    expect(res.body.inactiveEmployees).toBe(1);
    expect(res.body.departmentCount).toBe(2); // Engineering (hr fixture) + Sales

    const sales = (res.body.byDepartment as { department: string; count: number }[]).find(
      (d) => d.department === 'Sales',
    );
    expect(sales?.count).toBe(2);

    const employees = (res.body.byRole as { role: string; count: number }[]).find(
      (r) => r.role === 'EMPLOYEE',
    );
    expect(employees?.count).toBe(2);
  });

  it('EMPLOYEE cannot read stats', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .get('/api/employees/stats')
      .set(...auth(token));

    expect(res.status).toBe(403);
  });
});

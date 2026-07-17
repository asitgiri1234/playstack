/**
 * The RBAC evidence. Each test drives a real HTTP request through the real
 * middleware chain against a real database — the same chain Phase 2 will mount
 * on the employee routes (see helpers/harness.ts).
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

/** Logs in and returns the access token. */
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
// EMPLOYEE
// ---------------------------------------------------------------------------

describe('EMPLOYEE role', () => {
  it('EMPLOYEE cannot write salary on own record', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .patch('/test/me')
      .set(...auth(token))
      .send({ salary: '9999999.00' });

    expect(res.status).toBe(403);
    expect(res.body.error.details.rejectedFields).toContain('salary');

    // The write must not have landed. A 403 that still mutates is worse than
    // no check at all.
    const after = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(after.salary.toString()).toBe('1000000');
  });

  it('EMPLOYEE can write phone on own record', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .patch('/test/me')
      .set(...auth(token))
      .send({ phone: '+919810000123' });

    expect(res.status).toBe(200);
  });

  it("EMPLOYEE cannot read another employee's record (IDOR)", async () => {
    const attacker = await makeEmployee({ role: 'EMPLOYEE' });
    const victim = await makeEmployee({ role: 'EMPLOYEE', salary: '5000000.00' });
    const token = await tokenFor(attacker);

    const res = await request(app)
      .get(`/test/employees/${victim.id}`)
      .set(...auth(token));

    expect(res.status).toBe(403);
    // The victim's salary must not appear anywhere in the response.
    expect(JSON.stringify(res.body)).not.toContain('5000000');
  });

  it('EMPLOYEE can read their own record', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .get(`/test/employees/${employee.id}`)
      .set(...auth(token));

    expect(res.status).toBe(200);
    expect(res.body.employee.id).toBe(employee.id);
  });

  it('EMPLOYEE cannot update another employee', async () => {
    const attacker = await makeEmployee({ role: 'EMPLOYEE' });
    const victim = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(attacker);

    const res = await request(app)
      .patch(`/test/employees/${victim.id}`)
      .set(...auth(token))
      .send({ phone: '+919810000123' });

    // Denied at authorize(): EMPLOYEE has no EMPLOYEE:UPDATE_ANY.
    expect(res.status).toBe(403);
  });

  it('EMPLOYEE cannot read the dashboard', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .get('/test/dashboard')
      .set(...auth(token));
    expect(res.status).toBe(403);
  });

  it('EMPLOYEE cannot escalate their own role', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .patch('/test/me')
      .set(...auth(token))
      .send({ role: 'SUPER_ADMIN' });

    expect(res.status).toBe(403);
    const after = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(after.role).toBe('EMPLOYEE');
  });

  it('rejects an unknown field rather than silently ignoring it', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(employee);

    const res = await request(app)
      .patch('/test/me')
      .set(...auth(token))
      .send({ isAdmin: true });

    expect(res.status).toBe(403);
    expect(res.body.error.details.rejectedFields).toContain('isAdmin');
  });
});

// ---------------------------------------------------------------------------
// HR_MANAGER
// ---------------------------------------------------------------------------

describe('HR_MANAGER role', () => {
  it('HR_MANAGER cannot assign SUPER_ADMIN role', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .patch(`/test/employees/${target.id}`)
      .set(...auth(token))
      .send({ role: 'SUPER_ADMIN' });

    expect(res.status).toBe(403);
    const after = await prisma.employee.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.role).toBe('EMPLOYEE');
  });

  it('HR_MANAGER cannot edit a SUPER_ADMIN record', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .patch(`/test/employees/${superAdmin.id}`)
      .set(...auth(token))
      .send({ phone: '+919810000123' });

    // Even an innocuous field: a foothold on an admin record is still a
    // foothold on an admin record.
    expect(res.status).toBe(403);
  });

  it('HR_MANAGER cannot delete an employee', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .delete(`/test/employees/${target.id}`)
      .set(...auth(token));

    expect(res.status).toBe(403);
  });

  it('HR_MANAGER can update a regular employee', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .patch(`/test/employees/${target.id}`)
      .set(...auth(token))
      .send({ salary: '1500000.00', designation: 'Senior Engineer' });

    expect(res.status).toBe(200);
  });

  it('HR_MANAGER can assign non-admin roles', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .patch(`/test/employees/${target.id}`)
      .set(...auth(token))
      .send({ role: 'HR_MANAGER' });

    expect(res.status).toBe(200);
  });

  it('HR_MANAGER can read the dashboard', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .get('/test/dashboard')
      .set(...auth(token));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// SUPER_ADMIN and the lockout traps
// ---------------------------------------------------------------------------

describe('SUPER_ADMIN role', () => {
  it('nobody can change their own role', async () => {
    // Tested with SUPER_ADMIN specifically: the one actor who otherwise holds
    // every permission involved.
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    await makeEmployee({ role: 'SUPER_ADMIN' }); // second admin: not a lockout
    const token = await tokenFor(superAdmin);

    const res = await request(app)
      .patch(`/test/employees/${superAdmin.id}`)
      .set(...auth(token))
      .send({ role: 'EMPLOYEE' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/cannot change your own role/i);
  });

  it('cannot delete the last SUPER_ADMIN', async () => {
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(superAdmin);

    const res = await request(app)
      .delete(`/test/employees/${superAdmin.id}`)
      .set(...auth(token));

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/last remaining Super Admin/i);
  });

  it('cannot demote the last SUPER_ADMIN by deactivating them', async () => {
    // An INACTIVE admin cannot log in, so this is a lockout by another name.
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const other = await makeEmployee({ role: 'SUPER_ADMIN', deletedAt: new Date('2024-01-01') });
    const token = await tokenFor(superAdmin);

    // `other` is soft-deleted, so the live count is 1 despite two admin rows.
    expect(other.role).toBe('SUPER_ADMIN');

    const res = await request(app)
      .patch(`/test/employees/${superAdmin.id}`)
      .set(...auth(token))
      .send({ status: 'INACTIVE' });

    expect(res.status).toBe(409);
  });

  it('can delete a SUPER_ADMIN when another one remains', async () => {
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const second = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(superAdmin);

    const res = await request(app)
      .delete(`/test/employees/${second.id}`)
      .set(...auth(token));

    expect(res.status).toBe(200);
  });

  it('SUPER_ADMIN can edit another SUPER_ADMIN record', async () => {
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const second = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(superAdmin);

    const res = await request(app)
      .patch(`/test/employees/${second.id}`)
      .set(...auth(token))
      .send({ phone: '+919810000123' });

    expect(res.status).toBe(200);
  });

  it('SUPER_ADMIN can assign SUPER_ADMIN to someone else', async () => {
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const target = await makeEmployee({ role: 'EMPLOYEE' });
    const token = await tokenFor(superAdmin);

    const res = await request(app)
      .patch(`/test/employees/${target.id}`)
      .set(...auth(token))
      .send({ role: 'SUPER_ADMIN' });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Token freshness
// ---------------------------------------------------------------------------

describe('token freshness', () => {
  it('role change takes effect immediately, stale JWT does not bypass', async () => {
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(superAdmin);

    // The token is valid, unexpired, and its payload still says SUPER_ADMIN.
    const before = await request(app)
      .get('/test/dashboard')
      .set(...auth(token));
    expect(before.status).toBe(200);

    // Demoted out-of-band, as a second admin would.
    await prisma.employee.update({ where: { id: superAdmin.id }, data: { role: 'EMPLOYEE' } });

    // Same token. authenticate re-reads the role from the database, so the
    // stale SUPER_ADMIN claim in the payload buys nothing.
    const after = await request(app)
      .get('/test/dashboard')
      .set(...auth(token));
    expect(after.status).toBe(403);
  });

  it('a token for a soft-deleted employee is rejected', async () => {
    const employee = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(employee);

    await prisma.employee.update({ where: { id: employee.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .get('/test/dashboard')
      .set(...auth(token));
    expect(res.status).toBe(401);
  });

  it('a token for an employee deactivated after login is rejected', async () => {
    const employee = await makeEmployee({ role: 'HR_MANAGER' });
    const token = await tokenFor(employee);

    await prisma.employee.update({ where: { id: employee.id }, data: { status: 'INACTIVE' } });

    const res = await request(app)
      .get('/test/dashboard')
      .set(...auth(token));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// sanitizeFields modes
// ---------------------------------------------------------------------------

describe('sanitizeFields', () => {
  it('rejects by default rather than silently stripping', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .patch(`/test/employees/${superAdmin.id}`)
      .set(...auth(token))
      .send({ phone: '+919810000123', salary: '1.00' });

    expect(res.status).toBe(403);
    // Names every rejected field — a reviewer (and the client) can see exactly
    // what was refused, rather than guessing why nothing changed.
    expect(res.body.error.details.rejectedFields).toEqual(
      expect.arrayContaining(['phone', 'salary']),
    );
  });

  it('strip mode removes disallowed fields and continues', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const superAdmin = await makeEmployee({ role: 'SUPER_ADMIN' });
    const token = await tokenFor(hr);

    const res = await request(app)
      .patch(`/test/employees/${superAdmin.id}/strip`)
      .set(...auth(token))
      .send({ phone: '+919810000123', bogus: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({});
  });

  it('returns 404 for a soft-deleted target rather than writing to it', async () => {
    const hr = await makeEmployee({ role: 'HR_MANAGER' });
    const deleted = await makeEmployee({ role: 'EMPLOYEE', deletedAt: new Date('2024-01-01') });
    const token = await tokenFor(hr);

    const res = await request(app)
      .patch(`/test/employees/${deleted.id}`)
      .set(...auth(token))
      .send({ phone: '+919810000123' });

    expect(res.status).toBe(404);
  });
});

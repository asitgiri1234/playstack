/**
 * Unit tests for the read-side gate.
 *
 * These exist because the route-level salary tests do NOT actually prove the
 * serializer works: no current route lets an EMPLOYEE reach another person's
 * record, so assertSelfScope returns 403 first and the serializer never runs.
 * Deleting the salary rule outright leaves every route test green.
 *
 * That changes the moment Phase 3 adds the org tree and /reportees, which show
 * an EMPLOYEE other people by design — the serializer becomes the ONLY thing
 * standing between them and everyone's pay. So the rule is tested directly,
 * here, where scope cannot mask it.
 */

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { serializeEmployee, type SerializableEmployee } from '../services/employee.serializer.js';

const OTHER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

function employeeRow(overrides: Partial<SerializableEmployee> = {}): SerializableEmployee {
  return {
    id: OTHER_ID,
    employeeCode: 'EMP-0001',
    name: 'Target Person',
    email: 'target@playstack.test',
    phone: '+919810000001',
    department: 'Engineering',
    designation: 'Engineer',
    salary: new Prisma.Decimal('1234567.89'),
    joiningDate: new Date('2022-01-01T00:00:00.000Z'),
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerId: null,
    profileImage: null,
    deletedAt: null,
    createdAt: new Date('2022-01-01T00:00:00.000Z'),
    updatedAt: new Date('2022-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('serializeEmployee: salary visibility', () => {
  it("EMPLOYEE cannot read another employee's salary", () => {
    const output = serializeEmployee(employeeRow(), { id: ACTOR_ID, role: 'EMPLOYEE' });

    expect(output).not.toHaveProperty('salary');
    // Omitted, not nulled: `salary: null` is indistinguishable from "no salary
    // set" and invites the UI to render it as missing data.
    expect(JSON.stringify(output)).not.toContain('1234567');
  });

  it('EMPLOYEE can read their own salary', () => {
    const output = serializeEmployee(employeeRow({ id: ACTOR_ID }), {
      id: ACTOR_ID,
      role: 'EMPLOYEE',
    });

    expect(output.salary).toBe('1234567.89');
  });

  it("HR_MANAGER can read another employee's salary", () => {
    const output = serializeEmployee(employeeRow(), { id: ACTOR_ID, role: 'HR_MANAGER' });
    expect(output.salary).toBe('1234567.89');
  });

  it("SUPER_ADMIN can read another employee's salary", () => {
    const output = serializeEmployee(employeeRow(), { id: ACTOR_ID, role: 'SUPER_ADMIN' });
    expect(output.salary).toBe('1234567.89');
  });

  it('serialises salary as a string, preserving precision', () => {
    const output = serializeEmployee(
      employeeRow({ id: ACTOR_ID, salary: new Prisma.Decimal('9999999999.99') }),
      { id: ACTOR_ID, role: 'SUPER_ADMIN' },
    );
    // A JS number would round this; the string is exact.
    expect(output.salary).toBe('9999999999.99');
    expect(typeof output.salary).toBe('string');
  });
});

describe('serializeEmployee: deletedAt visibility', () => {
  it('hides deletedAt from HR_MANAGER', () => {
    const output = serializeEmployee(employeeRow(), { id: ACTOR_ID, role: 'HR_MANAGER' });
    expect(output).not.toHaveProperty('deletedAt');
  });

  it('shows deletedAt to SUPER_ADMIN', () => {
    const output = serializeEmployee(employeeRow({ deletedAt: new Date('2024-01-01') }), {
      id: ACTOR_ID,
      role: 'SUPER_ADMIN',
    });
    expect(output.deletedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('does not expose deletedAt to an employee reading their own record', () => {
    // Unlike salary, deletedAt is not self-exempt: it is an administrative
    // tombstone, not personal data.
    const output = serializeEmployee(employeeRow({ id: ACTOR_ID }), {
      id: ACTOR_ID,
      role: 'EMPLOYEE',
    });
    expect(output).not.toHaveProperty('deletedAt');
  });
});

describe('serializeEmployee: whitelist', () => {
  it('never emits passwordHash even when the row carries one', () => {
    // Simulates a future `select` regression handing the serializer extra
    // columns. The loop iterates the allowed list, so an unknown key cannot
    // ride along.
    const rowWithHash = {
      ...employeeRow(),
      passwordHash: '$2b$12$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    } as SerializableEmployee;

    const output = serializeEmployee(rowWithHash, { id: ACTOR_ID, role: 'SUPER_ADMIN' });

    expect(output).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(output)).not.toMatch(/\$2[aby]\$/);
  });

  it('emits the expected field set for a privileged actor', () => {
    const output = serializeEmployee(employeeRow(), { id: ACTOR_ID, role: 'SUPER_ADMIN' });
    expect(Object.keys(output).sort()).toEqual([
      'createdAt',
      'deletedAt',
      'department',
      'designation',
      'email',
      'employeeCode',
      'id',
      'joiningDate',
      'managerId',
      'name',
      'phone',
      'profileImage',
      'role',
      'salary',
      'status',
      'updatedAt',
    ]);
  });

  it('emits Date fields as ISO strings', () => {
    const output = serializeEmployee(employeeRow(), { id: ACTOR_ID, role: 'HR_MANAGER' });
    expect(output.joiningDate).toBe('2022-01-01T00:00:00.000Z');
  });
});

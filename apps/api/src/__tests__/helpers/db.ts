/**
 * Test-database helpers. Fixtures are built per test, not shared, so one test
 * mutating a role cannot change what another test asserts.
 */

import bcrypt from 'bcrypt';
import type { Role, Status } from '@playstack/shared';
import { prisma } from '../../lib/prisma.js';

export const TEST_PASSWORD = 'Password@123';

let sequence = 0;

/** Wipes both tables. Called in beforeEach — see vitest.config.ts for the guard. */
export async function resetDb(): Promise<void> {
  // refresh_tokens first: it has an FK onto employees.
  await prisma.refreshToken.deleteMany();
  await prisma.employee.deleteMany();
}

export interface EmployeeOverrides {
  role?: Role;
  status?: Status;
  deletedAt?: Date | null;
  email?: string;
  password?: string;
  managerId?: string | null;
  salary?: string;
}

export interface TestEmployee {
  id: string;
  employeeCode: string;
  email: string;
  role: Role;
  password: string;
}

/** Creates one employee with sane defaults; override only what a test cares about. */
export async function makeEmployee(overrides: EmployeeOverrides = {}): Promise<TestEmployee> {
  sequence += 1;
  const password = overrides.password ?? TEST_PASSWORD;
  const email = overrides.email ?? `employee${String(sequence)}@playstack.test`;
  const role: Role = overrides.role ?? 'EMPLOYEE';

  const created = await prisma.employee.create({
    data: {
      employeeCode: `TST-${String(sequence).padStart(4, '0')}`,
      name: `Test Employee ${String(sequence)}`,
      email,
      phone: '+919810000000',
      passwordHash: await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS ?? 4)),
      department: 'Engineering',
      designation: 'Engineer',
      salary: overrides.salary ?? '1000000.00',
      joiningDate: new Date('2022-01-01T00:00:00.000Z'),
      status: overrides.status ?? 'ACTIVE',
      role,
      managerId: overrides.managerId ?? null,
      deletedAt: overrides.deletedAt ?? null,
    },
    select: { id: true, employeeCode: true, email: true, role: true },
  });

  return { ...created, password };
}

/** Live = not soft-deleted. Mirrors what the guard's caller must count. */
export async function countLiveSuperAdmins(): Promise<number> {
  return prisma.employee.count({ where: { role: 'SUPER_ADMIN', deletedAt: null } });
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

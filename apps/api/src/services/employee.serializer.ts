/**
 * The read-side gate.
 *
 * NOTHING hands a raw Prisma object to res.json(). A Prisma Employee carries
 * passwordHash and every salary in the company; `res.json(employee)` ships both
 * to whoever asked. Every response — list, getById, create, update, tree —
 * goes through serializeEmployee, so there is exactly one place where a field
 * becomes visible, and it consults the shared matrix to decide.
 *
 * This is the mirror of sanitizeFields: that one decides what an actor may
 * write, this one decides what they may read.
 */

import type { Prisma } from '@prisma/client';
import { canReadField, type Role, type ReadContext } from '@playstack/shared';

/**
 * The Prisma shape this module accepts. Explicitly NOT the full Employee type:
 * `passwordHash` is absent, so a caller that selects it cannot even pass the
 * row in here without a type error.
 */
export interface SerializableEmployee {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  salary: Prisma.Decimal;
  joiningDate: Date;
  status: string;
  role: string;
  managerId: string | null;
  profileImage: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The Prisma `select` that produces a SerializableEmployee. Never `select: *`. */
export const EMPLOYEE_SELECT = {
  id: true,
  employeeCode: true,
  name: true,
  email: true,
  phone: true,
  department: true,
  designation: true,
  salary: true,
  joiningDate: true,
  status: true,
  role: true,
  managerId: true,
  profileImage: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.EmployeeSelect;

export interface Actor {
  id: string;
  role: Role;
}

/** JSON-safe value for each field. Decimal and Date do not survive res.json(). */
function serializeValue(field: string, employee: SerializableEmployee): unknown {
  switch (field) {
    case 'salary':
      // toString(), not toNumber(): a Decimal(12,2) can exceed what a JS number
      // represents exactly, and silently rounding someone's pay in the JSON
      // encoder is the same class of bug as storing it as a float.
      return employee.salary.toString();
    case 'joiningDate':
      return employee.joiningDate.toISOString();
    case 'deletedAt':
      return employee.deletedAt?.toISOString() ?? null;
    case 'createdAt':
      return employee.createdAt.toISOString();
    case 'updatedAt':
      return employee.updatedAt.toISOString();
    default:
      return (employee as unknown as Record<string, unknown>)[field];
  }
}

export type SerializedEmployee = Record<string, unknown>;

/**
 * Strips every field this actor may not read.
 *
 * Omits rather than nulls: `salary: null` would be a lie an employee could not
 * distinguish from a genuinely unset value, and it invites a frontend to render
 * an empty salary cell as though the data were missing. An absent key says
 * "not yours to see".
 */
export function serializeEmployee(
  employee: SerializableEmployee,
  actor: Actor,
): SerializedEmployee {
  const ctx: ReadContext = { actorRole: actor.role, isSelf: actor.id === employee.id };

  const output: SerializedEmployee = {};
  // Iterate the ALLOWED fields, not the object's own keys: a row that somehow
  // carries an extra column cannot leak it, because nothing copies unknown keys.
  for (const field of Object.keys(EMPLOYEE_SELECT)) {
    if (!canReadField(ctx, field)) continue;
    output[field] = serializeValue(field, employee);
  }
  return output;
}

export function serializeEmployees(
  employees: readonly SerializableEmployee[],
  actor: Actor,
): SerializedEmployee[] {
  return employees.map((e) => serializeEmployee(e, actor));
}

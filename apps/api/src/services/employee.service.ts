/**
 * Employee business logic. No Express in this file — handlers pass parsed input
 * and an actor, and get data or an AppError back.
 *
 * Authorization is NOT reimplemented here. The middleware chain has already
 * settled "may this role do this verb" (authorize) and "may they write these
 * fields" (sanitizeFields); what remains are the state-dependent rules, and
 * those come from guards.ts.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import {
  can,
  type ListEmployeesQuery,
  type PaginationMeta,
  type Role,
  type Status,
} from '@playstack/shared';
import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';
import { conflict, notFound } from '../lib/errors.js';
import {
  assertCanAssignRole,
  assertNotLastSuperAdmin,
  assertNotSelfRoleChange,
  assertSelfScope,
  enforce,
  enforceAll,
} from './guards.js';
import { EMPLOYEE_SELECT, type Actor, type SerializableEmployee } from './employee.serializer.js';
import { assertNoCycle } from './hierarchy.service.js';

/** Prisma's unique-constraint violation. */
const P2002_UNIQUE_VIOLATION = 'P2002';

/** Live = not soft-deleted. The predicate on essentially every read. */
const LIVE = { deletedAt: null } as const;

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export interface ListResult {
  employees: SerializableEmployee[];
  pagination: PaginationMeta;
}

export async function list(query: ListEmployeesQuery, actor: Actor): Promise<ListResult> {
  const where: Prisma.EmployeeWhereInput = {};

  /**
   * includeDeleted is honoured only for an actor who may delete — the same
   * permission that created the tombstones. Note it is IGNORED, not rejected:
   * an HR manager passing ?includeDeleted=true gets the normal live list rather
   * than a 403, because the flag is a view preference, not an escalation
   * attempt. Deriving from the matrix means no role name appears here.
   */
  const mayIncludeDeleted = can(actor.role, 'EMPLOYEE:DELETE');
  if (!(query.includeDeleted && mayIncludeDeleted)) {
    where.deletedAt = null;
  }

  // Partial, case-insensitive, across name OR email. `contains` is
  // parameterised by Prisma — the search string is never concatenated into SQL.
  if (query.search !== undefined && query.search.length > 0) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  // Every filter is AND-ed by sitting on the same object, so they compose:
  // ?department=Sales&department=Engineering&status=ACTIVE&role=EMPLOYEE means
  // (Sales OR Engineering) AND ACTIVE AND EMPLOYEE.
  if (query.department !== undefined && query.department.length > 0) {
    where.department = { in: query.department };
  }
  if (query.role !== undefined && query.role.length > 0) {
    where.role = { in: query.role as Role[] };
  }
  if (query.status !== undefined) {
    where.status = query.status as Status;
  }
  if (query.managerId !== undefined) {
    where.managerId = query.managerId;
  }

  /**
   * sortBy is a z.enum, so by the time it reaches here it is one of four known
   * column names — never caller-supplied text. This object is built from that
   * union, so there is no path from a request string to an identifier in the
   * query. `id` is the tiebreaker: without a total order, two rows with equal
   * names can swap between page 1 and page 2 and the client sees a duplicate
   * while another row never appears at all.
   */
  const orderBy: Prisma.EmployeeOrderByWithRelationInput[] = [
    { [query.sortBy]: query.sortOrder },
    { id: 'asc' },
  ];

  const skip = (query.page - 1) * query.limit;

  // One round trip: the count and the page must agree, and two separate
  // queries could straddle a concurrent insert.
  const [total, employees] = await prisma.$transaction([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, orderBy, skip, take: query.limit, select: EMPLOYEE_SELECT }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);

  return {
    employees,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1 && total > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// getById
// ---------------------------------------------------------------------------

export async function getById(id: string, actor: Actor): Promise<SerializableEmployee> {
  /**
   * Scope is checked BEFORE the lookup for actors without READ_ALL.
   *
   * Order matters: checking existence first would answer "does this uuid
   * belong to a real employee?" for anyone willing to read the status code —
   * 404 for a random uuid, 403 for a real one. Deciding scope first means an
   * EMPLOYEE gets the same 403 either way and learns nothing.
   *
   * 403-not-404 on scope failure is deliberate per spec: the actor is
   * authenticated and the record exists; they are simply not allowed it.
   */
  if (!can(actor.role, 'EMPLOYEE:READ_ALL')) {
    enforce(assertSelfScope(actor.id, id));
  }

  const employee = await prisma.employee.findFirst({
    where: { id, ...LIVE },
    select: EMPLOYEE_SELECT,
  });

  // A genuinely missing id is a 404 — for privileged actors this is honest, and
  // an EMPLOYEE can only ever reach this line for their own id.
  if (employee === null) throw notFound('Employee not found.');

  return employee;
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export interface CreateEmployeeData {
  name: string;
  email: string;
  phone: string;
  password?: string | undefined;
  department: string;
  designation: string;
  salary: string;
  joiningDate: Date;
  status: Status;
  role: Role;
  managerId?: string | null | undefined;
  profileImage?: string | null | undefined;
}

export interface CreateResult {
  employee: SerializableEmployee;
  /** Present only when the service generated the password. Shown once. */
  temporaryPassword?: string;
}

const EMPLOYEE_CODE_PREFIX = 'EMP-';

/**
 * Next sequential employeeCode: EMP-0001, EMP-0002, ...
 *
 * Derived from the current maximum rather than a count(), because count() would
 * reuse a code after a hard delete and collide. Soft-deleted rows still hold
 * their code, so they are deliberately included in the max.
 *
 * The `startsWith` filter is load-bearing. Without it this takes the max over
 * ALL codes, and any row whose code does not match the EMP- shape (a data
 * import, a manual insert, a test fixture) sorts above "EMP-9999" and parses to
 * NaN — silently restarting the sequence at EMP-0001 and colliding with a
 * fifteen-year-old employee. Scoping the scan to the prefix we own is what
 * makes "the maximum" mean what it says.
 */
async function nextEmployeeCode(client: Prisma.TransactionClient): Promise<string> {
  const latest = await client.employee.findFirst({
    where: { employeeCode: { startsWith: EMPLOYEE_CODE_PREFIX } },
    // Correct only because the numbers are zero-padded to a fixed width, so
    // lexicographic order and numeric order agree.
    orderBy: { employeeCode: 'desc' },
    select: { employeeCode: true },
  });

  if (latest === null) return `${EMPLOYEE_CODE_PREFIX}0001`;

  const lastNumber = Number.parseInt(latest.employeeCode.slice(EMPLOYEE_CODE_PREFIX.length), 10);
  // Fail loudly. The old code fell back to 1 here, which turns a malformed row
  // into a duplicate-key error on an unrelated create — a bug that would look
  // like a random 409 to whoever hit it.
  if (Number.isNaN(lastNumber)) {
    throw new Error(`Malformed employeeCode in database: ${latest.employeeCode}`);
  }

  // Padding widens naturally past EMP-9999; ordering stays correct until then.
  return `${EMPLOYEE_CODE_PREFIX}${String(lastNumber + 1).padStart(4, '0')}`;
}

function generateTemporaryPassword(): string {
  // base64url of 12 random bytes: ~96 bits, no ambiguous characters to read out
  // over the phone, and comfortably inside bcrypt's 72-byte input limit.
  return crypto.randomBytes(12).toString('base64url');
}

export async function create(data: CreateEmployeeData, actor: Actor): Promise<CreateResult> {
  // Only a SUPER_ADMIN may mint a SUPER_ADMIN. authorize() already established
  // the actor may create *someone*; this is about the role they are handing out.
  enforce(assertCanAssignRole(actor.role, data.role));

  if (data.managerId !== undefined && data.managerId !== null) {
    const manager = await prisma.employee.findFirst({
      where: { id: data.managerId, ...LIVE },
      select: { id: true },
    });
    // A dangling managerId would pass the FK (the row exists) while pointing at
    // a soft-deleted person, quietly detaching the new hire from the org tree.
    if (manager === null) throw notFound('Manager not found.');
  }

  const generatedPassword = data.password === undefined ? generateTemporaryPassword() : undefined;
  const password = data.password ?? generatedPassword;
  if (password === undefined) throw new Error('unreachable: password resolution');

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  /**
   * Duplicate email is checked twice, on purpose.
   *
   * The explicit lookup gives a clean 409 naming the field, which is what the
   * client can act on. The database unique index is what actually GUARANTEES
   * it: two concurrent creates both pass the lookup, then one loses the race at
   * insert. Catching P2002 turns that loss into the same 409 rather than a
   * Prisma error reaching the client as a 500.
   */
  const existing = await prisma.employee.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing !== null) throw conflict('An employee with this email already exists.');

  /**
   * Read-max-then-insert is racy by construction: two concurrent creates read
   * the same maximum and compute the same next code, and one loses at the
   * unique index. That loss is OUR problem, not the caller's — asking a client
   * to retry because of an internal id-allocation scheme is leaking the
   * implementation. So retry here, and only surface a conflict if the race is
   * somehow persistent.
   *
   * (The principled fix is a Postgres sequence for the code, which cannot race
   * at all. That needs a migration and the Phase 0 schema is settled, so this
   * is the honest interim: correct under contention, just not elegant.)
   */
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const employee = await prisma.$transaction(async (tx) => {
        const employeeCode = await nextEmployeeCode(tx);
        return tx.employee.create({
          data: {
            employeeCode,
            name: data.name,
            email: data.email,
            phone: data.phone,
            passwordHash,
            department: data.department,
            designation: data.designation,
            salary: data.salary,
            joiningDate: data.joiningDate,
            status: data.status,
            role: data.role,
            managerId: data.managerId ?? null,
            profileImage: data.profileImage ?? null,
          },
          select: EMPLOYEE_SELECT,
        });
      });

      return generatedPassword === undefined
        ? { employee }
        : { employee, temporaryPassword: generatedPassword };
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === P2002_UNIQUE_VIOLATION
      )) {
        throw error;
      }

      // Which column collided decides what happens. An email collision is the
      // caller's to fix and must not be retried — retrying would just lose the
      // same race four more times before returning the same 409.
      const target = error.meta?.['target'];
      const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
      if (fields.some((f) => f.includes('email'))) {
        throw conflict('An employee with this email already exists.');
      }
      if (attempt === MAX_ATTEMPTS) {
        throw conflict('Could not allocate an employee code, please retry.');
      }
      // employeeCode collision: recompute the max and go again.
    }
  }

  // Unreachable: the loop either returns or throws.
  throw conflict('Could not allocate an employee code, please retry.');
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

export type UpdateEmployeeData = Partial<Omit<CreateEmployeeData, 'password'>>;

export async function update(
  id: string,
  data: UpdateEmployeeData,
  actor: Actor,
): Promise<SerializableEmployee> {
  const target = await prisma.employee.findFirst({
    where: { id, ...LIVE },
    select: { id: true, role: true, status: true },
  });
  if (target === null) throw notFound('Employee not found.');

  // sanitizeFields has already vetted WHICH fields may be written on this
  // target. These are the rules it structurally cannot express: they depend on
  // the incoming VALUE and on system state.
  enforceAll(assertNotSelfRoleChange(actor.id, target.id, data as Record<string, unknown>));

  if (data.role !== undefined) {
    enforce(assertCanAssignRole(actor.role, data.role));

    // Demoting the final Super Admin is an unrecoverable lockout — nobody left
    // holds ROLE:ASSIGN_ADMIN to undo it.
    if (target.role === 'SUPER_ADMIN' && data.role !== 'SUPER_ADMIN') {
      enforce(
        assertNotLastSuperAdmin({
          targetRole: target.role,
          liveSuperAdminCount: await countLiveSuperAdmins(),
          operation: 'DEMOTE',
        }),
      );
    }
  }

  // Deactivating the last Super Admin locks the system exactly as thoroughly as
  // demoting them: an INACTIVE account cannot log in.
  if (data.status === 'INACTIVE' && target.role === 'SUPER_ADMIN') {
    enforce(
      assertNotLastSuperAdmin({
        targetRole: target.role,
        liveSuperAdminCount: await countLiveSuperAdmins(),
        operation: 'DEMOTE',
      }),
    );
  }

  if (data.managerId !== undefined) {
    /**
     * The same cycle check the dedicated PATCH /:id/manager route runs.
     *
     * This route is a second door to the identical structural change, so it
     * needs the identical lock — otherwise `PUT /employees/:id` with a
     * managerId is a quiet way to build a reporting cycle that the endpoint
     * built to prevent cycles would have refused. Reaching managerId at all
     * already requires MANAGER:ASSIGN (see FIELD_WRITE_PERMISSIONS), enforced
     * upstream by sanitizeFields.
     */
    await assertNoCycle(id, data.managerId, actor.role);
  }

  /**
   * The Prisma payload is assembled field by field rather than spread from
   * `data`.
   *
   * `data` has already been through updateEmployeeSchema (.strict) and
   * sanitizeFields, so this is belt-and-braces — but spreading a
   * request-derived object straight into `update({ data })` is precisely the
   * shape of a mass-assignment bug, and it would silently start forwarding any
   * new key the day either of those two upstream checks is relaxed. Naming the
   * fields means the write set is fixed here, in code.
   */
  const updateData: Prisma.EmployeeUncheckedUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.department !== undefined) updateData.department = data.department;
  if (data.designation !== undefined) updateData.designation = data.designation;
  if (data.salary !== undefined) updateData.salary = data.salary;
  if (data.joiningDate !== undefined) updateData.joiningDate = data.joiningDate;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.role !== undefined) updateData.role = data.role;
  // null is meaningful here (detach from manager), so only `undefined` skips.
  if (data.managerId !== undefined) updateData.managerId = data.managerId;
  if (data.profileImage !== undefined) updateData.profileImage = data.profileImage;

  try {
    return await prisma.employee.update({
      where: { id },
      data: updateData,
      select: EMPLOYEE_SELECT,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === P2002_UNIQUE_VIOLATION
    ) {
      throw conflict('An employee with this email already exists.');
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// softDelete / restore
// ---------------------------------------------------------------------------

async function countLiveSuperAdmins(): Promise<number> {
  return prisma.employee.count({ where: { role: 'SUPER_ADMIN', ...LIVE } });
}

export async function softDelete(id: string, actor: Actor): Promise<SerializableEmployee> {
  const target = await prisma.employee.findFirst({
    where: { id, ...LIVE },
    select: { id: true, role: true, managerId: true },
  });
  if (target === null) throw notFound('Employee not found.');

  enforce(
    assertNotLastSuperAdmin({
      targetRole: target.role,
      liveSuperAdminCount: await countLiveSuperAdmins(),
      operation: 'DELETE',
    }),
  );

  /**
   * Delete and re-parent in ONE transaction.
   *
   * The schema's `onDelete: SetNull` only fires on a HARD delete, and a soft
   * delete is just an UPDATE — so without this, deleting a manager leaves their
   * reports pointing at a tombstone: still "managed", but by someone excluded
   * from every list. Even a hard delete would be wrong here, because SetNull
   * would null their managerId and silently promote a whole subtree to
   * root-level orphans sitting alongside the CEO.
   *
   * So reports are re-parented to the deleted employee's OWN manager — their
   * grandparent — which is the org change that actually happened when someone
   * left. The transaction matters: a crash between the two writes would leave
   * either an orphaned subtree or a live employee reporting to a deleted one.
   *
   * Note `actor` is unused for the write itself; deleting is gated upstream by
   * authorize('EMPLOYEE:DELETE') and by the last-admin guard above.
   */
  void actor;

  return prisma.$transaction(async (tx) => {
    await tx.employee.updateMany({
      where: { managerId: id, ...LIVE },
      // May be null — if the deleted employee was the root, their reports become
      // the new roots, which is correct.
      data: { managerId: target.managerId },
    });

    return tx.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: EMPLOYEE_SELECT,
    });
  });
}

/**
 * Clears deletedAt. Soft delete without restore is just delete with extra steps
 * — the whole point of keeping the row is being able to bring it back.
 *
 * Reports are NOT un-re-parented: they were legitimately moved to the
 * grandparent and may have been moved again since. Reversing that
 * automatically would silently overwrite whatever the org looks like now.
 */
export async function restore(id: string): Promise<SerializableEmployee> {
  const target = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, managerId: true },
  });
  if (target === null) throw notFound('Employee not found.');
  if (target.deletedAt === null) throw conflict('Employee is not deleted.');

  // The old manager may have been deleted in the meantime; restoring under a
  // tombstone would recreate the orphan we just worked to avoid.
  if (target.managerId !== null) {
    const manager = await prisma.employee.findFirst({
      where: { id: target.managerId, ...LIVE },
      select: { id: true },
    });
    if (manager === null) {
      return prisma.employee.update({
        where: { id },
        data: { deletedAt: null, managerId: null },
        select: EMPLOYEE_SELECT,
      });
    }
  }

  return prisma.employee.update({
    where: { id },
    data: { deletedAt: null },
    select: EMPLOYEE_SELECT,
  });
}

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

export interface EmployeeStats {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  departmentCount: number;
  byDepartment: { department: string; count: number }[];
  byRole: { role: Role; count: number }[];
}

/**
 * Dashboard counters in a single round trip.
 *
 * groupBy/count run in the database. Fetching every employee and counting in JS
 * would transfer the whole table to compute five numbers, and would get slower
 * exactly as the company grows.
 */
export async function stats(): Promise<EmployeeStats> {
  /**
   * Interactive transaction + Promise.all rather than the `$transaction([...])`
   * array form: the array form widens groupBy's `_count` to a union that only a
   * cast can narrow, and casting away a type error in the one place we trust
   * the database's own arithmetic is a poor trade. This keeps full inference,
   * runs all five aggregates in a single transaction, and — the actual point —
   * computes every number in Postgres.
   */
  return prisma.$transaction(async (tx) => {
    const [totalEmployees, activeEmployees, inactiveEmployees, byDepartment, byRole] =
      await Promise.all([
        tx.employee.count({ where: LIVE }),
        tx.employee.count({ where: { ...LIVE, status: 'ACTIVE' } }),
        tx.employee.count({ where: { ...LIVE, status: 'INACTIVE' } }),
        tx.employee.groupBy({
          by: ['department'],
          where: LIVE,
          _count: true,
          orderBy: { department: 'asc' },
        }),
        tx.employee.groupBy({
          by: ['role'],
          where: LIVE,
          _count: true,
          orderBy: { role: 'asc' },
        }),
      ]);

    return {
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      // Distinct departments that currently have at least one live employee —
      // groupBy already computed exactly that, so no extra query.
      departmentCount: byDepartment.length,
      byDepartment: byDepartment.map((d) => ({ department: d.department, count: d._count })),
      byRole: byRole.map((r) => ({ role: r.role, count: r._count })),
    };
  });
}

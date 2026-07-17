/**
 * Seed: a small but *shaped* org — 3 levels deep, ICs reporting to ICs, a few
 * INACTIVE rows and a couple of soft-deleted ones, so that every filter we
 * write in Phase 1 has something real to prove.
 *
 * Idempotent: wipes the two tables and rebuilds. Dev/demo only.
 */

import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import type { Role, Status } from '@playstack/shared';

// Seed runs outside the API server, so it loads the root .env itself.
// fileURLToPath, not URL.pathname — the latter yields "/C:/..." on Windows.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

/** Demo passwords, one per role. Real deployments never seed known passwords. */
const DEMO_PASSWORDS = {
  SUPER_ADMIN: 'SuperAdmin@123',
  HR_MANAGER: 'HrManager@123',
  EMPLOYEE: 'Employee@123',
} as const satisfies Record<Role, string>;

/**
 * A seed row. `managerCode` references another row's employeeCode rather than
 * a uuid — uuids don't exist until insert, and codes let this table be read as
 * an org chart.
 */
interface SeedEmployee {
  employeeCode: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  salary: string; // string, not number — see schema.prisma on Decimal
  joiningDate: string; // ISO date, all in the past
  status: Status;
  role: Role;
  managerCode: string | null;
  softDeleted?: boolean;
}

/**
 * Ordered parent-before-child so managerCode always resolves during insert.
 * Levels: Super Admin → dept heads / HR → managers → ICs → junior ICs.
 */
const EMPLOYEES: SeedEmployee[] = [
  // --- Level 0 ------------------------------------------------------------
  {
    employeeCode: 'EMP-0001',
    name: 'Aarav Mehta',
    email: 'aarav.mehta@playstack.dev',
    phone: '+919810000001',
    department: 'Engineering',
    designation: 'Chief Executive Officer',
    salary: '9500000.00',
    joiningDate: '2018-01-15',
    status: 'ACTIVE',
    role: 'SUPER_ADMIN',
    managerCode: null, // top of the tree
  },

  // --- Level 1: HR --------------------------------------------------------
  {
    employeeCode: 'EMP-0002',
    name: 'Priya Nair',
    email: 'priya.nair@playstack.dev',
    phone: '+919810000002',
    department: 'HR',
    designation: 'Head of People',
    salary: '4200000.00',
    joiningDate: '2019-03-04',
    status: 'ACTIVE',
    role: 'HR_MANAGER',
    managerCode: 'EMP-0001',
  },
  {
    employeeCode: 'EMP-0003',
    name: 'Rohan Desai',
    email: 'rohan.desai@playstack.dev',
    phone: '+919810000003',
    department: 'HR',
    designation: 'HR Manager',
    salary: '3100000.00',
    joiningDate: '2020-07-20',
    status: 'ACTIVE',
    role: 'HR_MANAGER',
    managerCode: 'EMP-0001',
  },

  // --- Engineering --------------------------------------------------------
  {
    employeeCode: 'EMP-0004',
    name: 'Kavya Iyer',
    email: 'kavya.iyer@playstack.dev',
    phone: '+919810000004',
    department: 'Engineering',
    designation: 'VP of Engineering',
    salary: '6800000.00',
    joiningDate: '2019-02-11',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0001',
  },
  {
    employeeCode: 'EMP-0005',
    name: 'Devansh Rao',
    email: 'devansh.rao@playstack.dev',
    phone: '+919810000005',
    department: 'Engineering',
    designation: 'Engineering Manager',
    salary: '4800000.00',
    joiningDate: '2020-09-01',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0004',
  },
  {
    employeeCode: 'EMP-0006',
    name: 'Ananya Bose',
    email: 'ananya.bose@playstack.dev',
    phone: '+919810000006',
    department: 'Engineering',
    designation: 'Staff Software Engineer',
    salary: '3900000.00',
    joiningDate: '2021-01-18',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0005',
  },
  {
    // IC reporting to an IC — a tech lead who is not a people manager.
    employeeCode: 'EMP-0007',
    name: 'Ishaan Kulkarni',
    email: 'ishaan.kulkarni@playstack.dev',
    phone: '+919810000007',
    department: 'Engineering',
    designation: 'Senior Software Engineer',
    salary: '2900000.00',
    joiningDate: '2021-06-07',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0006',
  },
  {
    employeeCode: 'EMP-0008',
    name: 'Meera Pillai',
    email: 'meera.pillai@playstack.dev',
    phone: '+919810000008',
    department: 'Engineering',
    designation: 'Software Engineer',
    salary: '1800000.00',
    joiningDate: '2022-08-22',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0006',
  },
  {
    employeeCode: 'EMP-0009',
    name: 'Yash Chauhan',
    email: 'yash.chauhan@playstack.dev',
    phone: '+919810000009',
    department: 'Engineering',
    designation: 'QA Engineer',
    salary: '1500000.00',
    joiningDate: '2022-02-14',
    status: 'INACTIVE', // on long leave — proves the status filter
    role: 'EMPLOYEE',
    managerCode: 'EMP-0005',
  },
  {
    employeeCode: 'EMP-0010',
    name: 'Sanjana Reddy',
    email: 'sanjana.reddy@playstack.dev',
    phone: '+919810000010',
    department: 'Engineering',
    designation: 'Software Engineer Intern',
    salary: '600000.00',
    joiningDate: '2023-05-02',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0007', // level 4 under an IC lead
    softDeleted: true, // internship ended — record kept for payroll history
  },

  // --- Sales --------------------------------------------------------------
  {
    employeeCode: 'EMP-0011',
    name: 'Vikram Singh',
    email: 'vikram.singh@playstack.dev',
    phone: '+919810000011',
    department: 'Sales',
    designation: 'VP of Sales',
    salary: '6200000.00',
    joiningDate: '2019-05-06',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0001',
  },
  {
    employeeCode: 'EMP-0012',
    name: 'Neha Kapoor',
    email: 'neha.kapoor@playstack.dev',
    phone: '+919810000012',
    department: 'Sales',
    designation: 'Regional Sales Manager',
    salary: '3600000.00',
    joiningDate: '2020-11-16',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0011',
  },
  {
    employeeCode: 'EMP-0013',
    name: 'Arjun Malhotra',
    email: 'arjun.malhotra@playstack.dev',
    phone: '+919810000013',
    department: 'Sales',
    designation: 'Senior Account Executive',
    salary: '2400000.00',
    joiningDate: '2021-09-13',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0012',
  },
  {
    employeeCode: 'EMP-0014',
    name: 'Tanvi Joshi',
    email: 'tanvi.joshi@playstack.dev',
    phone: '+919810000014',
    department: 'Sales',
    designation: 'Sales Development Rep',
    salary: '1200000.00',
    joiningDate: '2023-01-09',
    status: 'INACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0013', // IC → IC
  },

  // --- Marketing ----------------------------------------------------------
  {
    employeeCode: 'EMP-0015',
    name: 'Nikhil Sharma',
    email: 'nikhil.sharma@playstack.dev',
    phone: '+919810000015',
    department: 'Marketing',
    designation: 'Head of Marketing',
    salary: '4500000.00',
    joiningDate: '2020-02-24',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0001',
  },
  {
    employeeCode: 'EMP-0016',
    name: 'Riya Sen',
    email: 'riya.sen@playstack.dev',
    phone: '+919810000016',
    department: 'Marketing',
    designation: 'Content Strategist',
    salary: '1900000.00',
    joiningDate: '2021-11-08',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0015',
  },
  {
    employeeCode: 'EMP-0017',
    name: 'Aditya Verma',
    email: 'aditya.verma@playstack.dev',
    phone: '+919810000017',
    department: 'Marketing',
    designation: 'SEO Specialist',
    salary: '1400000.00',
    joiningDate: '2022-06-27',
    status: 'INACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0016', // IC → IC
  },

  // --- HR (reports under the HR managers) ---------------------------------
  {
    employeeCode: 'EMP-0018',
    name: 'Sneha Gupta',
    email: 'sneha.gupta@playstack.dev',
    phone: '+919810000018',
    department: 'HR',
    designation: 'HR Business Partner',
    salary: '2200000.00',
    joiningDate: '2021-04-19',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0002',
  },
  {
    employeeCode: 'EMP-0019',
    name: 'Karan Bhatia',
    email: 'karan.bhatia@playstack.dev',
    phone: '+919810000019',
    department: 'HR',
    designation: 'Technical Recruiter',
    salary: '1600000.00',
    joiningDate: '2022-10-03',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0018', // IC → IC
  },
  {
    employeeCode: 'EMP-0020',
    name: 'Divya Menon',
    email: 'divya.menon@playstack.dev',
    phone: '+919810000020',
    department: 'HR',
    designation: 'HR Coordinator',
    salary: '1100000.00',
    joiningDate: '2022-12-12',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0018',
    softDeleted: true, // resigned — must not appear in any default list
  },

  // --- Finance ------------------------------------------------------------
  {
    employeeCode: 'EMP-0021',
    name: 'Rahul Krishnan',
    email: 'rahul.krishnan@playstack.dev',
    phone: '+919810000021',
    department: 'Finance',
    designation: 'Financial Controller',
    salary: '5100000.00',
    joiningDate: '2019-08-26',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0001',
  },
  {
    employeeCode: 'EMP-0022',
    name: 'Pooja Agarwal',
    email: 'pooja.agarwal@playstack.dev',
    phone: '+919810000022',
    department: 'Finance',
    designation: 'Senior Accountant',
    salary: '2100000.00',
    joiningDate: '2020-10-05',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0021',
  },
  {
    employeeCode: 'EMP-0023',
    name: 'Manish Tiwari',
    email: 'manish.tiwari@playstack.dev',
    phone: '+919810000023',
    department: 'Finance',
    designation: 'Payroll Analyst',
    salary: '1500000.00',
    joiningDate: '2023-03-21',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    managerCode: 'EMP-0022', // IC → IC
  },
];

async function main(): Promise<void> {
  console.log('Seeding Playstack…\n');

  // Rebuild from scratch so re-running gives an identical tree.
  // refresh_tokens first — it FKs employees.
  await prisma.refreshToken.deleteMany();
  await prisma.employee.deleteMany();

  // Hash each distinct password ONCE. bcrypt at cost 12 is ~250ms by design;
  // hashing 23 rows individually would make the seed needlessly slow.
  const hashes: Record<Role, string> = {
    SUPER_ADMIN: await bcrypt.hash(DEMO_PASSWORDS.SUPER_ADMIN, BCRYPT_ROUNDS),
    HR_MANAGER: await bcrypt.hash(DEMO_PASSWORDS.HR_MANAGER, BCRYPT_ROUNDS),
    EMPLOYEE: await bcrypt.hash(DEMO_PASSWORDS.EMPLOYEE, BCRYPT_ROUNDS),
  };

  // employeeCode → uuid, filled as we insert. Sequential rather than parallel
  // because a child row's manager must already exist.
  const idByCode = new Map<string, string>();

  for (const row of EMPLOYEES) {
    let managerId: string | null = null;
    if (row.managerCode !== null) {
      const resolved = idByCode.get(row.managerCode);
      if (resolved === undefined) {
        throw new Error(`${row.employeeCode}: manager ${row.managerCode} not inserted yet`);
      }
      managerId = resolved;
    }

    const data: Prisma.EmployeeCreateInput = {
      employeeCode: row.employeeCode,
      name: row.name,
      email: row.email,
      phone: row.phone,
      passwordHash: hashes[row.role],
      department: row.department,
      designation: row.designation,
      salary: row.salary,
      joiningDate: new Date(`${row.joiningDate}T00:00:00.000Z`),
      status: row.status,
      role: row.role,
      profileImage: null,
      deletedAt: row.softDeleted === true ? new Date('2024-11-30T00:00:00.000Z') : null,
      ...(managerId !== null ? { manager: { connect: { id: managerId } } } : {}),
    };

    const created = await prisma.employee.create({ data, select: { id: true } });
    idByCode.set(row.employeeCode, created.id);
  }

  printSummary();
}

function printSummary(): void {
  const live = EMPLOYEES.filter((e) => e.softDeleted !== true);
  const deleted = EMPLOYEES.filter((e) => e.softDeleted === true);
  const inactive = live.filter((e) => e.status === 'INACTIVE');

  console.log(`Inserted ${EMPLOYEES.length} employees`);
  console.log(`  live:         ${live.length}`);
  console.log(
    `  inactive:     ${inactive.length}  (${inactive.map((e) => e.employeeCode).join(', ')})`,
  );
  console.log(
    `  soft-deleted: ${deleted.length}  (${deleted.map((e) => e.employeeCode).join(', ')})`,
  );
  console.log('');

  const rows = [
    {
      role: 'SUPER_ADMIN',
      email: 'aarav.mehta@playstack.dev',
      password: DEMO_PASSWORDS.SUPER_ADMIN,
    },
    { role: 'HR_MANAGER', email: 'priya.nair@playstack.dev', password: DEMO_PASSWORDS.HR_MANAGER },
    { role: 'HR_MANAGER', email: 'rohan.desai@playstack.dev', password: DEMO_PASSWORDS.HR_MANAGER },
    { role: 'EMPLOYEE', email: 'ananya.bose@playstack.dev', password: DEMO_PASSWORDS.EMPLOYEE },
    { role: 'EMPLOYEE', email: 'meera.pillai@playstack.dev', password: DEMO_PASSWORDS.EMPLOYEE },
  ];

  const w = { role: 12, email: 32, password: 16 };
  const line = `+${'-'.repeat(w.role + 2)}+${'-'.repeat(w.email + 2)}+${'-'.repeat(w.password + 2)}+`;
  const fmt = (r: string, e: string, p: string) =>
    `| ${r.padEnd(w.role)} | ${e.padEnd(w.email)} | ${p.padEnd(w.password)} |`;

  console.log('Demo credentials');
  console.log(line);
  console.log(fmt('ROLE', 'EMAIL', 'PASSWORD'));
  console.log(line);
  for (const r of rows) console.log(fmt(r.role, r.email, r.password));
  console.log(line);
  console.log('\nEvery other employee uses the EMPLOYEE password above.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

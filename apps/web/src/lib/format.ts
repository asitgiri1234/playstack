/** Display formatting. Kept out of components so a table cell stays a table cell. */

/**
 * Money.
 *
 * The API sends a decimal STRING, never a number — see schema.prisma on floats.
 * Intl.NumberFormat takes a number, and 12 significant digits fits inside a
 * double exactly, so Decimal(12,2) round-trips safely here. Formatting is the
 * one place a number is acceptable; nothing computes with it.
 */
export function formatSalary(salary: string | undefined): string {
  // Absent means the actor may not read it (Phase 2 omits the key). An em dash
  // says "not shown"; "0" or "—" from a crash would both be lies.
  if (salary === undefined) return '—';
  const value = Number(salary);
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string | undefined): string {
  if (iso === undefined) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** ISO date for <input type="date">, which requires exactly yyyy-mm-dd. */
export function toDateInputValue(iso: string | undefined): string {
  if (iso === undefined) return '';
  return iso.slice(0, 10);
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  HR_MANAGER: 'HR Manager',
  EMPLOYEE: 'Employee',
};

export function formatRole(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

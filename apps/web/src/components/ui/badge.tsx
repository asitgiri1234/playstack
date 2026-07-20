import { cn } from '@/lib/utils';
import { formatRole } from '@/lib/format';
import type { Role, Status } from '@playstack/shared';

/**
 * Quiet chips — a subtle tint, no border, small. The accent tone exists but is
 * spent sparingly; roles use the neutral tone so a table full of them stays
 * calm, and only genuinely semantic state (active) earns colour.
 */
const TONES = {
  neutral: 'bg-surface-sunken text-content-muted',
  success: 'bg-success-surface text-success-text',
  muted: 'bg-surface-sunken text-content-subtle',
  accent: 'bg-primary-subtle text-primary-text',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }): React.JSX.Element {
  const active = status === 'ACTIVE';
  return (
    <Badge tone={active ? 'success' : 'muted'}>
      {/* A dot, not colour alone: colour is not an accessible signal by itself,
          and the label already carries the meaning. */}
      <span
        className={cn(
          'mr-1.5 h-1.5 w-1.5 rounded-full',
          active ? 'bg-success-600' : 'bg-content-subtle',
        )}
        aria-hidden
      />
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

/**
 * Roles are categorical, not semantic, so they stay neutral — the label does
 * the work. Keeping the accent out of the table is what lets it mean something
 * where it does appear (primary action, active nav).
 */
export function RoleBadge({ role }: { role: Role }): React.JSX.Element {
  return <Badge tone="neutral">{formatRole(role)}</Badge>;
}

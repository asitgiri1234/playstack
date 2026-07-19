import { cn } from '@/lib/utils';
import { formatRole } from '@/lib/format';
import type { Role, Status } from '@playstack/shared';

const TONES = {
  neutral: 'bg-surface-sunken text-content-muted border-border',
  success: 'bg-success-surface text-success-text border-success-600/20',
  muted: 'bg-surface-sunken text-content-subtle border-border',
  accent: 'bg-primary-subtle text-primary-text border-primary/20',
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
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }): React.JSX.Element {
  return (
    <Badge tone={status === 'ACTIVE' ? 'success' : 'muted'}>
      {/* A dot rather than colour alone: colour is not an accessible signal on
          its own, and the label already carries the meaning. */}
      <span
        className={cn(
          'mr-1.5 h-1.5 w-1.5 rounded-full',
          status === 'ACTIVE' ? 'bg-success-600' : 'bg-content-subtle',
        )}
        aria-hidden
      />
      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: Role }): React.JSX.Element {
  return <Badge tone={role === 'EMPLOYEE' ? 'neutral' : 'accent'}>{formatRole(role)}</Badge>;
}

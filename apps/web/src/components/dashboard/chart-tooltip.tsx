'use client';

import { Tooltip } from 'recharts';
import { useChartTheme } from '@/lib/chart-theme';

/**
 * Local props shape rather than recharts' TooltipProps: recharts v3 does not
 * surface `payload`/`label` on that exported type, and all we need is these
 * three (all optional, injected at render). Passing the content as an ELEMENT
 * lets recharts clone in the real props at runtime.
 */
interface ThemedTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string }[];
}

/**
 * Tooltip styled from theme tokens, so it stays readable (and correctly
 * bordered) in both themes. recharts' default is a hardcoded white box that
 * vanishes into a dark chart.
 */
function ThemedTooltipContent({
  active,
  payload,
  label,
}: ThemedTooltipProps): React.JSX.Element | null {
  const theme = useChartTheme();
  if (active !== true || payload === undefined || payload.length === 0) return null;

  const point = payload[0];
  if (point === undefined) return null;

  return (
    <div
      className="rounded-sm border px-2.5 py-1.5 text-sm shadow-md"
      style={{
        background: theme?.tooltipBg,
        borderColor: theme?.tooltipBorder,
        color: 'var(--text)',
      }}
    >
      <p className="font-medium">{String(label ?? point.name ?? '')}</p>
      <p className="tabular text-content-muted">{point.value}</p>
    </div>
  );
}

/** Drop-in for recharts <Tooltip>, pre-wired to the themed content. */
export function ChartTooltip(): React.JSX.Element {
  return <Tooltip content={<ThemedTooltipContent />} cursor={{ fill: 'var(--surface-hover)' }} />;
}

'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { EmployeeStats } from '@/lib/api';
import { seriesColor, useChartTheme } from '@/lib/chart-theme';
import { ChartCard } from './chart-card';
import { ChartTooltip } from './chart-tooltip';

export function DepartmentBarChart({
  stats,
  isLoading,
}: {
  stats: EmployeeStats | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  const theme = useChartTheme();
  const data = (stats?.byDepartment ?? []).map((d) => ({ label: d.department, value: d.count }));

  return (
    <ChartCard
      title="Headcount by Department"
      data={data}
      isLoading={isLoading || theme === null}
      isEmpty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={theme?.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fill: theme?.tickText, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: theme?.grid }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: theme?.tickText, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ChartTooltip />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
            {/* Each department its own hue, cycling the CSS-var series. */}
            {data.map((_, i) => (
              <Cell key={i} fill={seriesColor(theme, i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

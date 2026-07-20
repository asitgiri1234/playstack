'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
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
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
          {/* Hairline horizontal grid only — no vertical lines, no axis rules. */}
          <CartesianGrid vertical={false} stroke={theme?.grid} strokeDasharray="0" />
          <XAxis
            dataKey="label"
            tick={{ fill: theme?.tickText, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: theme?.tickText, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <ChartTooltip />
          {/* One accent for every bar — the x-axis labels distinguish them. A
              single restrained colour reads more expensive than a rainbow. */}
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
            isAnimationActive={false}
            fill={seriesColor(theme, 0)}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

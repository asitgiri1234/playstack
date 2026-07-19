'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatRole } from '@/lib/format';
import type { EmployeeStats } from '@/lib/api';
import { seriesColor, useChartTheme } from '@/lib/chart-theme';
import { ChartCard } from './chart-card';
import { ChartTooltip } from './chart-tooltip';
import { ChartLegend } from './chart-legend';

export function RoleDonutChart({
  stats,
  isLoading,
}: {
  stats: EmployeeStats | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  const theme = useChartTheme();
  const data = (stats?.byRole ?? []).map((r, i) => ({
    label: formatRole(r.role),
    value: r.count,
    color: seriesColor(theme, i),
  }));

  return (
    <ChartCard
      title="Headcount by Role"
      data={data}
      isLoading={isLoading || theme === null}
      isEmpty={data.length === 0}
    >
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
              // No sweep animation: a theme toggle recreates the data with new
              // colours, which would otherwise replay the animation from zero on
              // every switch. A static donut recolours cleanly.
              isAnimationActive={false}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <ChartTooltip />
          </PieChart>
        </ResponsiveContainer>
        <ChartLegend items={data} />
      </div>
    </ChartCard>
  );
}

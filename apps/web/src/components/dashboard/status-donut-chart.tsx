'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { EmployeeStats } from '@/lib/api';
import { useChartTheme } from '@/lib/chart-theme';
import { ChartCard } from './chart-card';
import { ChartTooltip } from './chart-tooltip';
import { ChartLegend } from './chart-legend';

export function StatusDonutChart({
  stats,
  isLoading,
}: {
  stats: EmployeeStats | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  // Active/Inactive carry SEMANTIC colours (green / neutral), not the arbitrary
  // series palette — "active" reading green is meaning, not decoration. Pulled
  // from the same tokens the status badges use.
  const data = [
    { label: 'Active', value: stats?.activeEmployees ?? 0, color: 'var(--chart-active)' },
    { label: 'Inactive', value: stats?.inactiveEmployees ?? 0, color: 'var(--chart-inactive)' },
  ];
  const theme = useChartTheme();
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ChartCard
      title="Active vs Inactive"
      data={data}
      isLoading={isLoading || theme === null}
      isEmpty={total === 0}
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
              // See role-donut-chart: static so a theme toggle just recolours.
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

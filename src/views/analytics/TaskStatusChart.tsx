import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

interface TaskStatusChartProps {
  data: Array<{ status: string; count: number }>;
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  'todo': '#94a3b8',
  'in-progress': '#3b82f6',
  'done': '#22c55e',
  'blocked': '#ef4444',
};

export function TaskStatusChart({ data, isLoading }: TaskStatusChartProps) {
  const { t } = useTranslation('analytics');

  const chartData = useMemo(() => {
    return data.map((row) => ({
      name: t(`charts.taskStatus.statuses.${row.status}`),
      value: row.count,
      color: STATUS_COLORS[row.status] || '#94a3b8',
    }));
  }, [data, t]);

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.taskStatus.title')}
      </h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-zinc-900, #18181b)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

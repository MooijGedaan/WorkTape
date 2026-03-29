import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface PriorityBreakdownChartProps {
  data: Array<{ priority: string; status: string; count: number }>;
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  'todo': '#94a3b8',
  'in-progress': '#3b82f6',
  'done': '#22c55e',
  'blocked': '#ef4444',
};

const PRIORITY_ORDER = ['high', 'medium', 'low'];

export function PriorityBreakdownChart({ data, isLoading }: PriorityBreakdownChartProps) {
  const { t } = useTranslation('analytics');

  const { chartData, statuses } = useMemo(() => {
    const byPriority: Record<string, Record<string, number>> = {};
    const statusSet = new Set<string>();

    for (const row of data) {
      if (!byPriority[row.priority]) byPriority[row.priority] = {};
      byPriority[row.priority][row.status] = row.count;
      statusSet.add(row.status);
    }

    const sorted = PRIORITY_ORDER
      .filter((p) => byPriority[p])
      .map((priority) => ({
        priority: t(`charts.priorityBreakdown.priorities.${priority}`),
        ...byPriority[priority],
      }));

    return { chartData: sorted, statuses: Array.from(statusSet) };
  }, [data, t]);

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.priorityBreakdown.title')}
      </h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              type="number"
              allowDecimals={false}
              className="text-xs fill-zinc-500"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="priority"
              className="text-xs fill-zinc-500"
              tick={{ fontSize: 12 }}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-zinc-900, #18181b)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend />
            {statuses.map((status) => (
              <Bar
                key={status}
                dataKey={status}
                name={t(`charts.taskStatus.statuses.${status}`)}
                fill={STATUS_COLORS[status] || '#94a3b8'}
                stackId="priority"
                radius={[0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

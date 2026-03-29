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

interface DailyActivityChartProps {
  data: Array<{ date: string; source: string; count: number }>;
  isLoading: boolean;
}

export function DailyActivityChart({ data, isLoading }: DailyActivityChartProps) {
  const { t } = useTranslation('analytics');

  const chartData = useMemo(() => {
    const byDate: Record<string, { date: string; manual: number; auto: number }> = {};
    for (const row of data) {
      if (!byDate[row.date]) {
        byDate[row.date] = { date: row.date, manual: 0, auto: 0 };
      }
      if (row.source === 'manual') {
        byDate[row.date].manual = row.count;
      } else {
        byDate[row.date].auto = row.count;
      }
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const formatDate = (date: string) => {
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.dailyActivity.title')}
      </h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              className="text-xs fill-zinc-500"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
              className="text-xs fill-zinc-500"
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-zinc-900, #18181b)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
              labelFormatter={formatDate}
            />
            <Legend />
            <Bar
              dataKey="manual"
              name={t('charts.dailyActivity.manual')}
              fill="#f59e0b"
              stackId="entries"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="auto"
              name={t('charts.dailyActivity.auto')}
              fill="#3b82f6"
              stackId="entries"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

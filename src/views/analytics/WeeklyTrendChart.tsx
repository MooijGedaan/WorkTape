import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface WeeklyTrendChartProps {
  data: Array<{ week: string; count: number }>;
  isLoading: boolean;
}

export function WeeklyTrendChart({ data, isLoading }: WeeklyTrendChartProps) {
  const { t } = useTranslation('analytics');

  const formatWeek = (week: string) => {
    const parts = week.split('-');
    return `W${parts[1]}`;
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.weeklyTrend.title')}
      </h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              dataKey="week"
              tickFormatter={formatWeek}
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
              labelFormatter={formatWeek}
            />
            <Line
              type="monotone"
              dataKey="count"
              name={t('charts.weeklyTrend.entries')}
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ r: 4, fill: '#8b5cf6' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

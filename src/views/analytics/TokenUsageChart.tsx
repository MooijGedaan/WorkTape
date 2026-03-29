import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TokenUsageChartProps {
  data: Array<{ date: string; tokens: number }>;
  isLoading: boolean;
}

export function TokenUsageChart({ data, isLoading }: TokenUsageChartProps) {
  const { t } = useTranslation('analytics');

  const formatDate = (date: string) => {
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatTokens = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.tokenUsage.title')}
      </h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              className="text-xs fill-zinc-500"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickFormatter={formatTokens}
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
              formatter={(value: number) => [formatTokens(value), t('charts.tokenUsage.tokens')]}
            />
            <Area
              type="monotone"
              dataKey="tokens"
              name={t('charts.tokenUsage.tokens')}
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#tokenGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

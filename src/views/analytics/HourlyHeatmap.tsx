import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface HourlyHeatmapProps {
  data: Array<{ day_of_week: number; hour: number; count: number }>;
  isLoading: boolean;
}

export function HourlyHeatmap({ data, isLoading }: HourlyHeatmapProps) {
  const { t } = useTranslation('analytics');
  const daysRaw = t('charts.hourlyHeatmap.days', { returnObjects: true });
  const days: string[] = Array.isArray(daysRaw) ? daysRaw : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const { grid, maxCount } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const row of data) {
      g[row.day_of_week][row.hour] = row.count;
      if (row.count > max) max = row.count;
    }
    return { grid: g, maxCount: max };
  }, [data]);

  const getColor = (count: number): string => {
    if (count === 0 || maxCount === 0) return 'bg-zinc-100 dark:bg-zinc-800';
    const intensity = count / maxCount;
    if (intensity < 0.25) return 'bg-blue-100 dark:bg-blue-900/30';
    if (intensity < 0.5) return 'bg-blue-300 dark:bg-blue-700/50';
    if (intensity < 0.75) return 'bg-blue-500 dark:bg-blue-500/70';
    return 'bg-blue-700 dark:bg-blue-400';
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.hourlyHeatmap.title')}
      </h3>
      {isLoading ? (
        <div className="h-48 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[500px]">
            <div className="flex ml-10 mb-1">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[10px] text-zinc-400">
                  {h % 3 === 0 ? `${h}` : ''}
                </div>
              ))}
            </div>
            {grid.map((row, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-1 mb-1">
                <span className="w-9 text-right text-xs text-zinc-500 dark:text-zinc-400 pr-1">
                  {days[dayIdx]}
                </span>
                {row.map((count, hourIdx) => (
                  <div
                    key={hourIdx}
                    className={`flex-1 aspect-square rounded-sm ${getColor(count)} transition-colors`}
                    title={t('charts.hourlyHeatmap.tooltip', { count })}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

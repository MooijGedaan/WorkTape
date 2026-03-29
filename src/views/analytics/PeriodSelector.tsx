import { useTranslation } from 'react-i18next';
import type { Period } from '../../hooks/useAnalytics';

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
}

const periods: Period[] = ['7d', '30d', 'all'];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const { t } = useTranslation('analytics');

  return (
    <div className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
      {periods.map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === period
              ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          {t(`period.${period}`)}
        </button>
      ))}
    </div>
  );
}

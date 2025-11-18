import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { useNavigation } from '../hooks/useNavigation.tsx';
import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

async function getDatabase() {
  return db ?? await Database.load('sqlite:workrecall.db');
}

interface Stats {
  totalEntries: number;
  thisWeekEntries: number;
  currentStreak: number;
}

export function HomeView() {
  const { t } = useTranslation(['home', 'common']);
  const { goToWorkLog } = useNavigation();
  const [stats, setStats] = useState<Stats>({
    totalEntries: 0,
    thisWeekEntries: 0,
    currentStreak: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const database = await getDatabase();

      // Get total entries
      const totalResult = await database.select<Array<{ count: number }>>(
        'SELECT COUNT(*) as count FROM work_entries'
      );
      const totalEntries = totalResult[0]?.count || 0;

      // Get this week's entries (last 7 days)
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      const weekResult = await database.select<Array<{ count: number }>>(
        'SELECT COUNT(*) as count FROM work_entries WHERE DATE(timestamp) >= ?',
        [weekStartStr]
      );
      const thisWeekEntries = weekResult[0]?.count || 0;

      // Calculate streak (consecutive days with at least one entry)
      const allDatesResult = await database.select<Array<{ date: string }>>(
        'SELECT DISTINCT DATE(timestamp) as date FROM work_entries ORDER BY date DESC'
      );

      let currentStreak = 0;
      if (allDatesResult.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let checkDate = new Date(today);

        for (const row of allDatesResult) {
          const entryDate = new Date(row.date);
          entryDate.setHours(0, 0, 0, 0);

          const diffTime = checkDate.getTime() - entryDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 0) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else if (diffDays === 1) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }

      setStats({
        totalEntries,
        thisWeekEntries,
        currentStreak,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full">
      <Heading>{t('home:title')}</Heading>
      <Text className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        {t('home:subtitle')}
      </Text>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Quick Stats Cards */}
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('home:stats.totalEntries.label')}</h3>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-white">
            {isLoading ? '...' : stats.totalEntries}
          </p>
          <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {t('home:stats.totalEntries.description')}
          </Text>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('home:stats.thisWeek.label')}</h3>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-white">
            {isLoading ? '...' : stats.thisWeekEntries}
          </p>
          <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {t('home:stats.thisWeek.description')}
          </Text>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('home:stats.streak.label')}</h3>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-white">
            {isLoading ? '...' : t('home:stats.streak.days', { count: stats.currentStreak })}
          </p>
          <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {t('home:stats.streak.description')}
          </Text>
        </div>
      </div>

      <div className="mt-8">
        <Button onClick={goToWorkLog} color="blue">
          {t('home:actions.goToWorkLog')}
        </Button>
      </div>
    </div>
  );
}

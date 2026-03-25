import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';

import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { useNavigation } from '../hooks/useNavigation.tsx';
import { getDb } from '../hooks/useDatabase';
import { useTooltipHints, type HintId } from '../hooks/useTooltipHints';
import { TooltipHint } from '../components/TooltipHint';
import { HINT_DEFINITIONS } from '../components/hints/hintDefinitions';
import { DocumentIcon, CalendarDaysIcon, ClockIcon } from '../components/icons';

interface Stats {
  totalEntries: number;
  thisWeekEntries: number;
  currentStreak: number;
}

function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.8,
      ease: [0.25, 0.1, 0.25, 1],
    });
    return controls.stop;
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = rounded.on('change', (v) => setDisplay(v));
    return unsubscribe;
  }, [rounded]);

  return <>{display}</>;
}

export function HomeView() {
  const { t } = useTranslation(['home', 'common', 'hints']);
  const { goToWorkLog } = useNavigation();
  const { isSeen, markSeen, isAllDisabled, disableAll } = useTooltipHints();
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalEntries: 0,
    thisWeekEntries: 0,
    currentStreak: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (isAllDisabled) return;
    const hints: HintId[] = ['home-stats'];
    const first = hints.find(h => !isSeen(h));
    if (!first) return;
    const timer = setTimeout(() => setActiveHint(first), 500);
    return () => clearTimeout(timer);
  }, []); // mount-only

  const handleDismiss = () => {
    if (activeHint) markSeen(activeHint);
    setActiveHint(null);
  };

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const database = await getDb();

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

  const activeHintDef = activeHint ? HINT_DEFINITIONS[activeHint] : null;

  return (
    <>
    {activeHintDef && (
      <TooltipHint
        show={activeHint !== null}
        title={t(`hints:${activeHint}.title` as any)}
        body={t(`hints:${activeHint}.body` as any)}
        icon={activeHintDef.icon}
        accentColor={activeHintDef.accentColor}
        onDismiss={handleDismiss}
        onDisableAll={() => { disableAll(); setActiveHint(null); }}
      />
    )}
    <div className="h-full">
      <h1 className="font-serif text-3xl font-bold text-slate-900 dark:text-white">
        {t('home:title')}
      </h1>
      <Text className="mt-4 text-lg text-slate-600 dark:text-slate-400">
        {t('home:subtitle')}
      </Text>

      <motion.div
        className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
      >
        {/* Total Entries */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-8 shadow-sm hover:shadow-md transition-shadow dark:bg-slate-800"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700">
              <DocumentIcon className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            </div>
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('home:stats.totalEntries.label')}</h3>
          </div>
          <p className="text-3xl font-semibold text-slate-900 dark:text-white">
            {isLoading ? '...' : <AnimatedNumber value={stats.totalEntries} />}
          </p>
          <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('home:stats.totalEntries.description')}
          </Text>
        </motion.div>

        {/* This Week */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-8 shadow-sm hover:shadow-md transition-shadow dark:bg-slate-800"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700">
              <CalendarDaysIcon className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            </div>
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('home:stats.thisWeek.label')}</h3>
          </div>
          <p className="text-3xl font-semibold text-slate-900 dark:text-white">
            {isLoading ? '...' : <AnimatedNumber value={stats.thisWeekEntries} />}
          </p>
          <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('home:stats.thisWeek.description')}
          </Text>
        </motion.div>

        {/* Streak */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-8 shadow-sm hover:shadow-md transition-shadow dark:bg-slate-800"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
              <ClockIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('home:stats.streak.label')}</h3>
          </div>
          <p className="text-3xl font-semibold text-slate-900 dark:text-white">
            {isLoading ? '...' : t('home:stats.streak.days', { count: stats.currentStreak })}
          </p>
          <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('home:stats.streak.description')}
          </Text>
        </motion.div>
      </motion.div>

      <div className="mt-8">
        <Button onClick={goToWorkLog} color="dark">
          {t('home:actions.goToWorkLog')}
        </Button>
      </div>
    </div>
    </>
  );
}

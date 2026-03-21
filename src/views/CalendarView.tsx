import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { getDb } from '../hooks/useDatabase';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { useTooltipHints, type HintId } from '../hooks/useTooltipHints';
import { TooltipHint } from '../components/TooltipHint';
import { HINT_DEFINITIONS } from '../components/hints/hintDefinitions';

interface DayData {
  date: string; // YYYY-MM-DD
  entryCount: number;
  isToday: boolean;
  isDayEnded: boolean;
}

interface WeekGroup {
  label: string; // e.g. "Week 10 · March 2026"
  days: DayData[];
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildDays(entryDates: Set<string>): string[] {
  // Always include today + last 60 days for context, plus any older days that have entries
  const days = new Set<string>();
  const today = new Date();
  for (let i = 0; i <= 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.add(toLocalDateString(d));
  }
  for (const date of entryDates) {
    days.add(date);
  }
  return Array.from(days).sort((a, b) => b.localeCompare(a));
}

function groupByWeek(days: DayData[]): WeekGroup[] {
  const groups: WeekGroup[] = [];
  let currentKey = '';
  let currentGroup: WeekGroup | null = null;

  for (const day of days) {
    const date = new Date(day.date + 'T12:00:00'); // noon to avoid DST edge
    const week = getWeekNumber(date);
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    const key = `${year}-W${week}`;
    if (key !== currentKey) {
      currentKey = key;
      currentGroup = { label: `Week ${week} · ${month} ${year}`, days: [] };
      groups.push(currentGroup);
    }
    currentGroup!.days.push(day);
  }
  return groups;
}

function formatDayHeader(dateStr: string): { dayNum: string; dayName: string } {
  const date = new Date(dateStr + 'T12:00:00');
  return {
    dayNum: date.getDate().toString(),
    dayName: date.toLocaleString('default', { weekday: 'long' }),
  };
}

function DayCard({ day }: { day: DayData }) {
  const { t } = useTranslation('calendar');
  const { dayNum, dayName } = formatDayHeader(day.date);

  return (
    <div className={`w-full border rounded-xl bg-white dark:bg-zinc-900 overflow-hidden border-l-3 ${
      day.isToday
        ? 'border-amber-500 ring-2 ring-amber-500/30 border-zinc-200 dark:border-zinc-700'
        : day.entryCount > 0
          ? 'border-l-amber-500 border-zinc-200 dark:border-zinc-700'
          : 'border-l-slate-200 dark:border-l-zinc-700 border-zinc-200 dark:border-zinc-700'
    }`}>
      {/* Day header */}
      <div className="flex items-baseline gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
        <span className="text-3xl font-bold text-zinc-900 dark:text-white leading-none">{dayNum}</span>
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{dayName}</span>
        {day.isToday && day.isDayEnded && (
          <span className="ml-2 inline-flex items-center rounded-md bg-green-50 dark:bg-green-950/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300 ring-1 ring-inset ring-green-700/10 dark:ring-green-300/10">
            {t('dayEnded')}
          </span>
        )}
        {day.isToday && !day.isDayEnded && (
          <span className="ml-2 inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-700/10 dark:ring-amber-300/10">
            {t('today')}
          </span>
        )}
        {day.entryCount > 0 && (
          <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
            {t('entryCount', { count: day.entryCount })}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {day.entryCount === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-600 italic">{t('noEntries')}</p>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('entryCount', { count: day.entryCount })}
          </p>
        )}
      </div>
    </div>
  );
}

export function CalendarView() {
  const { t } = useTranslation(['calendar', 'hints']);
  const { isSeen, markSeen, isAllDisabled, disableAll } = useTooltipHints();
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const database = await getDb();
      const todayStr = toLocalDateString(new Date());

      // Load entry counts per day
      const manualCounts = await database.select<Array<{ date: string; cnt: number }>>(
        "SELECT DATE(timestamp) as date, COUNT(*) as cnt FROM work_entries GROUP BY DATE(timestamp)"
      );

      const countMap = new Map<string, number>();
      for (const row of manualCounts) {
        countMap.set(row.date, (countMap.get(row.date) ?? 0) + row.cnt);
      }

      // Check if today's day has been ended
      const dayEndingRows = await database.select<Array<{ date: string }>>(
        "SELECT date FROM day_endings WHERE date = ?",
        [todayStr]
      );
      const isDayEnded = dayEndingRows.length > 0;

      const entryDates = new Set(countMap.keys());
      const dates = buildDays(entryDates);

      const dayData: DayData[] = dates.map((date) => ({
        date,
        entryCount: countMap.get(date) ?? 0,
        isToday: date === todayStr,
        isDayEnded: date === todayStr ? isDayEnded : false,
      }));

      setWeeks(groupByWeek(dayData));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reload when the day is ended or un-ended
  useTauriEvent('day-ended', loadData);
  useTauriEvent('day-unended', loadData);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isAllDisabled) return;
    const hints: HintId[] = ['calendar-week-navigation'];
    const first = hints.find(h => !isSeen(h));
    if (!first) return;
    const timer = setTimeout(() => setActiveHint(first), 500);
    return () => clearTimeout(timer);
  }, []); // mount-only

  const handleDismiss = () => {
    if (activeHint) markSeen(activeHint);
    setActiveHint(null);
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
    <div className="flex flex-col h-full overflow-hidden w-full">
      <div className="flex-shrink-0 mb-6">
        <Heading>{t('calendar:title')}</Heading>
        <Text className="mt-1">{t('calendar:subtitle')}</Text>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Text className="text-zinc-400 italic">{t('calendar:loading')}</Text>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-8 pr-1">
          {weeks.map((week) => (
            <section key={week.label}>
              <div className="text-xs font-semibold uppercase tracking-widest text-amber-600/70 dark:text-amber-400/60 mb-3 px-1">
                {week.label}
              </div>
              <motion.div
                className="space-y-3"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
              >
                {week.days.map((day) => (
                  <motion.div
                    key={day.date}
                    variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                  >
                    <DayCard day={day} />
                  </motion.div>
                ))}
              </motion.div>
            </section>
          ))}
        </div>
      )}
    </div>
    </>
  );
}

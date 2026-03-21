import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { getDb } from '../hooks/useDatabase';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { useTooltipHints, type HintId } from '../hooks/useTooltipHints';
import { TooltipHint } from '../components/TooltipHint';
import { HINT_DEFINITIONS } from '../components/hints/hintDefinitions';

interface SummaryItem {
  label: string;
  summary: string;
}

function parseSummary(raw: string | null): SummaryItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SummaryItem[];
  } catch {
    // Legacy plain-text summary — wrap as single unlabeled item
    return [{ label: '', summary: raw }];
  }
  return null;
}

interface WorkEntryRow {
  description: string;
  timestamp: string;
}

interface DayData {
  date: string; // YYYY-MM-DD
  summary: string | null;
  entryCount: number;
  isToday: boolean;
  isDayEnded: boolean;
  entries: WorkEntryRow[];
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

function groupByWeek(days: DayData[], locale: string, weekWord: string): WeekGroup[] {
  const groups: WeekGroup[] = [];
  let currentKey = '';
  let currentGroup: WeekGroup | null = null;

  for (const day of days) {
    const date = new Date(day.date + 'T12:00:00'); // noon to avoid DST edge
    const week = getWeekNumber(date);
    const month = date.toLocaleString(locale, { month: 'long' });
    const year = date.getFullYear();
    const key = `${year}-W${week}`;
    if (key !== currentKey) {
      currentKey = key;
      currentGroup = { label: `${weekWord} ${week} · ${month} ${year}`, days: [] };
      groups.push(currentGroup);
    }
    currentGroup!.days.push(day);
  }
  return groups;
}

function formatDayHeader(dateStr: string, locale: string): { dayNum: string; dayName: string } {
  const date = new Date(dateStr + 'T12:00:00');
  return {
    dayNum: date.getDate().toString(),
    dayName: date.toLocaleString(locale, { weekday: 'long' }),
  };
}

function DayCard({ day, onGenerate }: { day: DayData; onGenerate: (date: string) => Promise<void> }) {
  const { t, i18n } = useTranslation('calendar');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dayNum, dayName } = formatDayHeader(day.date, i18n.language);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await onGenerate(day.date);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const canGenerate = !day.isToday || day.isDayEnded;

  return (
    <div className={`w-full border rounded-xl bg-white dark:bg-zinc-900 overflow-hidden border-amber-500 border-zinc-200 dark:border-zinc-700`}>
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
        ) : day.summary ? (
          // AI summary available — show it
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {(parseSummary(day.summary) ?? [{ label: '', summary: day.summary }]).map((item, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  {item.label && (
                    <span className="inline-block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded">{item.label}</span>
                  )}
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{item.summary}</p>
                </div>
              ))}
            </div>
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            {canGenerate && (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="self-start text-xs italic text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? t('regenerating') : t('regenerateSummary')}
              </button>
            )}
          </div>
        ) : (
          // No summary yet — show entries + generate button (or day-in-progress note)
          <div className="flex flex-col gap-3">
            <ul className="space-y-1">
              {day.entries.map((entry, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-500" />
                  <span>{entry.description}</span>
                </li>
              ))}
            </ul>
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            {canGenerate ? (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="self-start text-sm italic text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? t('generating') : t('generateSummary')}
              </button>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">{t('dayInProgress')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CalendarView() {
  const { t, i18n } = useTranslation(['calendar', 'hints']);
  const { isSeen, markSeen, isAllDisabled, disableAll } = useTooltipHints();
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const database = await getDb();
      const todayStr = toLocalDateString(new Date());

      // Load summaries
      const summaries = await database.select<Array<{ date: string; summary: string }>>(
        'SELECT date, summary FROM ai_summaries'
      );
      const summaryMap = new Map(summaries.map((s) => [s.date, s.summary]));

      // Load entry counts per day
      const manualCounts = await database.select<Array<{ date: string; cnt: number }>>(
        "SELECT DATE(timestamp) as date, COUNT(*) as cnt FROM work_entries GROUP BY DATE(timestamp)"
      );
      const autoCounts = await database.select<Array<{ date: string; cnt: number }>>(
        "SELECT DATE(timestamp) as date, COUNT(*) as cnt FROM auto_work_entries GROUP BY DATE(timestamp)"
      );

      const countMap = new Map<string, number>();
      for (const row of [...manualCounts, ...autoCounts]) {
        countMap.set(row.date, (countMap.get(row.date) ?? 0) + row.cnt);
      }

      // Load all work entries grouped by date (for display when no summary exists)
      const allEntries = await database.select<Array<{ date: string; description: string; timestamp: string }>>(
        "SELECT DATE(timestamp) as date, description, timestamp FROM work_entries ORDER BY timestamp DESC"
      );
      const entriesMap = new Map<string, WorkEntryRow[]>();
      for (const row of allEntries) {
        if (!entriesMap.has(row.date)) entriesMap.set(row.date, []);
        entriesMap.get(row.date)!.push({ description: row.description, timestamp: row.timestamp });
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
        summary: summaryMap.get(date) ?? null,
        entryCount: countMap.get(date) ?? 0,
        isToday: date === todayStr,
        isDayEnded: date === todayStr ? isDayEnded : false,
        entries: entriesMap.get(date) ?? [],
      }));

      setWeeks(groupByWeek(dayData, i18n.language, t('week')));
    } finally {
      setIsLoading(false);
    }
  }, [i18n.language, t]);

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

  const handleGenerate = useCallback(async (date: string) => {
    const database = await getDb();

    // Fetch manual entries with their linked task title (if any)
    const manualEntries = await database.select<Array<{ description: string; timestamp: string; task_id: number | null; task_title: string | null }>>(
      `SELECT we.description, we.timestamp, wl.task_id, st.title as task_title
       FROM work_entries we
       LEFT JOIN sprint_task_work_links wl ON wl.entry_source = 'manual' AND wl.entry_id = we.id
       LEFT JOIN sprint_tasks st ON st.id = wl.task_id
       WHERE DATE(we.timestamp) = ?
       ORDER BY we.timestamp ASC`,
      [date]
    );
    // Fetch auto entries with their linked task title (if any)
    const autoEntries = await database.select<Array<{ description: string; timestamp: string; task_id: number | null; task_title: string | null }>>(
      `SELECT awe.description, awe.timestamp, wl.task_id, st.title as task_title
       FROM auto_work_entries awe
       LEFT JOIN sprint_task_work_links wl ON wl.entry_source = 'auto' AND wl.entry_id = awe.id
       LEFT JOIN sprint_tasks st ON st.id = wl.task_id
       WHERE DATE(awe.timestamp) = ?
       ORDER BY awe.timestamp ASC`,
      [date]
    );

    const allEntries = [...manualEntries, ...autoEntries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (allEntries.length < 1) {
      throw new Error(t('calendar:noEntriesThrown'));
    }

    // Group entries by task_id (null = ungrouped)
    const groupMap = new Map<string, { taskTitle: string | null; entries: [string, string][] }>();
    for (const entry of allEntries) {
      const key = entry.task_id != null ? String(entry.task_id) : '__ungrouped__';
      if (!groupMap.has(key)) {
        groupMap.set(key, { taskTitle: entry.task_title ?? null, entries: [] });
      }
      groupMap.get(key)!.entries.push([entry.description, entry.timestamp]);
    }

    // Convert to the format expected by generate_grouped_daily_summary
    const groups: [string | null, [string, string][]][] = Array.from(groupMap.values()).map(
      (g) => [g.taskTitle, g.entries]
    );

    const generatedSummary = await invoke<string>('generate_grouped_daily_summary', {
      groups,
      date,
      language: i18n.language,
    });

    const now = new Date().toISOString();
    await database.execute(
      "INSERT OR REPLACE INTO ai_summaries (date, summary, created_at, updated_at) VALUES (?, ?, COALESCE((SELECT created_at FROM ai_summaries WHERE date = ?), ?), ?)",
      [date, generatedSummary, date, now, now]
    );

    // Refresh
    await loadData();
  }, [loadData, i18n.language, t]);

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
                    <DayCard day={day} onGenerate={handleGenerate} />
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

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { getDb } from '../hooks/useDatabase';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { useTooltipHints, type HintId } from '../hooks/useTooltipHints';
import { TooltipHint } from '../components/TooltipHint';
import { HINT_DEFINITIONS } from '../components/hints/hintDefinitions';

interface DayData {
  date: string; // YYYY-MM-DD
  summary: string | null;
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

function DayCard({ day, onGenerate }: { day: DayData; onGenerate: (date: string) => Promise<void> }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dayNum, dayName } = formatDayHeader(day.date);

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
    <div className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Day header */}
      <div className="flex items-baseline gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
        <span className="text-3xl font-bold text-zinc-900 dark:text-white leading-none">{dayNum}</span>
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{dayName}</span>
        {day.isToday && day.isDayEnded && (
          <span className="ml-2 inline-flex items-center rounded-md bg-green-50 dark:bg-green-950/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300 ring-1 ring-inset ring-green-700/10 dark:ring-green-300/10">
            Day ended
          </span>
        )}
        {day.isToday && !day.isDayEnded && (
          <span className="ml-2 inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-300/10">
            Today
          </span>
        )}
        {day.entryCount > 0 && (
          <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
            {day.entryCount} {day.entryCount === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {day.summary ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">{day.summary}</p>
            {error && (
              <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
            )}
            {canGenerate && (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="self-start text-xs italic text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? 'Regenerating…' : 'Regenerate AI summary for this day'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {day.entryCount === 0 ? (
              <p className="text-sm text-zinc-400 dark:text-zinc-600 italic">No work entries for this day.</p>
            ) : canGenerate ? (
              <>
                {error && (
                  <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="self-start text-sm italic text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGenerating ? 'Generating summary…' : '✦ Generate AI summary for this day'}
                </button>
              </>
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
                Day in progress — end the day to generate a summary.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CalendarView() {
  const { i18n } = useTranslation();
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

  const handleGenerate = useCallback(async (date: string) => {
    const database = await getDb();

    // Fetch work entries
    const manualEntries = await database.select<Array<{ description: string; timestamp: string }>>(
      "SELECT description, timestamp FROM work_entries WHERE DATE(timestamp) = ? ORDER BY timestamp ASC",
      [date]
    );
    const autoEntries = await database.select<Array<{ description: string; timestamp: string }>>(
      "SELECT description, timestamp FROM auto_work_entries WHERE DATE(timestamp) = ? ORDER BY timestamp ASC",
      [date]
    );

    const entries = [...manualEntries, ...autoEntries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (entries.length < 1) {
      throw new Error('No work entries found for this day.');
    }

    const entryTuples: [string, string][] = entries.map((e) => [e.description, e.timestamp]);

    const generatedSummary = await invoke<string>('generate_daily_summary', {
      entries: entryTuples,
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
  }, [loadData]);

  const activeHintDef = activeHint ? HINT_DEFINITIONS[activeHint] : null;

  return (
    <>
    {activeHintDef && (
      <TooltipHint
        show={activeHint !== null}
        title={activeHintDef.title}
        body={activeHintDef.body}
        icon={activeHintDef.icon}
        accentColor={activeHintDef.accentColor}
        onDismiss={handleDismiss}
        onDisableAll={() => { disableAll(); setActiveHint(null); }}
      />
    )}
    <div className="flex flex-col h-full overflow-hidden w-full">
      <div className="flex-shrink-0 mb-6">
        <Heading>Work Calendar</Heading>
        <Text className="mt-1">A day-by-day view of your work history. AI summaries are permanent once generated.</Text>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Text className="text-zinc-400 italic">Loading…</Text>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-8 pr-1">
          {weeks.map((week) => (
            <section key={week.label}>
              <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3 px-1">
                {week.label}
              </div>
              <div className="space-y-3">
                {week.days.map((day) => (
                  <DayCard key={day.date} day={day} onGenerate={handleGenerate} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
    </>
  );
}

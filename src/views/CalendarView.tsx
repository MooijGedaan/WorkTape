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
import { useNavigation } from '../hooks/useNavigation';

interface SummaryItem {
  label: string;
  summary: string;
  task_id?: number;
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

/** Build a label → task_id map from a collection of summary JSON strings. */
function buildLabelTaskMap(summaryJsonStrings: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const json of summaryJsonStrings) {
    const items = parseSummary(json);
    if (!items) continue;
    for (const item of items) {
      if (item.task_id != null && item.label) {
        map.set(item.label.toLowerCase(), item.task_id);
      }
    }
  }
  return map;
}

/** Inject task_ids into AI-generated summary items by matching labels. */
function injectTaskIds(summaryJson: string, labelTaskMap: Map<string, number>): string {
  const items = parseSummary(summaryJson);
  if (!items) return summaryJson;
  const enriched = items.map(item => {
    const id = labelTaskMap.get(item.label.toLowerCase());
    return id != null ? { ...item, task_id: id } : item;
  });
  return JSON.stringify(enriched);
}

interface DayData {
  date: string; // YYYY-MM-DD
  summary: string | null;
  entryCount: number;
  isToday: boolean;
  isDayEnded: boolean;
}

interface WeekGroup {
  label: string; // e.g. "Week 10 · March 2026"
  year: number;
  weekNum: number;
  month: number; // 0-based month of the first day in this group
  days: DayData[];
  weeklySummary: string | null;
}

interface MonthData {
  year: number;
  month: number; // 0-based
  label: string; // e.g. "March 2026"
  summary: string | null;
  weekCount: number;
  totalEntries: number;
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

function groupByWeek(days: DayData[], locale: string, weekWord: string, weeklySummaryMap: Map<string, string>): WeekGroup[] {
  const groups: WeekGroup[] = [];
  let currentKey = '';
  let currentGroup: WeekGroup | null = null;

  for (const day of days) {
    const date = new Date(day.date + 'T12:00:00'); // noon to avoid DST edge
    const week = getWeekNumber(date);
    const monthStr = date.toLocaleString(locale, { month: 'long' });
    const year = date.getFullYear();
    const monthNum = date.getMonth();
    const key = `${year}-W${week}`;
    if (key !== currentKey) {
      currentKey = key;
      currentGroup = {
        label: `${weekWord} ${week} · ${monthStr} ${year}`,
        year,
        weekNum: week,
        month: monthNum,
        days: [],
        weeklySummary: weeklySummaryMap.get(key) ?? null,
      };
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

function DayCard({ day, onGenerate, onLabelClick }: { day: DayData; onGenerate: (date: string) => Promise<void>; onLabelClick: (taskId: number) => void }) {
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
            <SummaryItems
              items={parseSummary(day.summary) ?? [{ label: '', summary: day.summary }]}
              onLabelClick={onLabelClick}
            />
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
          // No summary yet
          <div className="flex flex-col gap-3">
            {canGenerate ? (
              <>
                <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">{t('noSummaryYet')}</p>
                {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="self-start text-sm italic text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGenerating ? t('generating') : t('generateSummary')}
                </button>
              </>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">{t('dayInProgress')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Summary Items Renderer (shared) ─────────────────────────────────────────

function SummaryItems({ items, onLabelClick }: { items: SummaryItem[]; onLabelClick: (taskId: number) => void }) {
  return (
    <div className="grid gap-y-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
      {items.map((item, i) => (
        <div key={i} className="contents">
          <div className="pr-3 pt-0.5">
            {item.label && (
              item.task_id != null ? (
                <button
                  onClick={() => onLabelClick(item.task_id!)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded whitespace-nowrap hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {item.label}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3.5 8.5 8.5 3.5M5.5 3.5h3v3" />
                  </svg>
                </button>
              ) : (
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded whitespace-nowrap">{item.label}</span>
              )
            )}
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{item.summary}</p>
        </div>
      ))}
    </div>
  );
}

// ─── WeekSummaryCard ─────────────────────────────────────────────────────────

function WeekSummaryCard({
  week,
  onGenerate,
  onLabelClick,
}: {
  week: WeekGroup;
  onGenerate: (week: WeekGroup) => Promise<void>;
  onLabelClick: (taskId: number) => void;
}) {
  const { t } = useTranslation('calendar');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysWithEntries = week.days.filter(d => d.entryCount > 0).length;
  const totalEntries = week.days.reduce((sum, d) => sum + d.entryCount, 0);
  const allDaysHaveSummaries = week.days.every(d => d.entryCount === 0 || d.summary !== null);
  const isCurrentWeek = week.days.some(d => d.isToday && !d.isDayEnded);

  const canGenerate = !isCurrentWeek && allDaysHaveSummaries && daysWithEntries > 0;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await onGenerate(week);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  if (totalEntries === 0) return null;

  const items = parseSummary(week.weeklySummary);

  return (
    <div className="w-full border-l-2 border-l-amber-400 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('weekSummary')}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {t('weekStats', { days: daysWithEntries, entries: totalEntries })}
        </span>
      </div>
      <div className="px-5 py-4">
        {items ? (
          <div className="flex flex-col gap-3">
            <SummaryItems items={items} onLabelClick={onLabelClick} />
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            {canGenerate && (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="self-start text-xs italic text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? t('generatingWeekSummary') : t('regenerateWeekSummary')}
              </button>
            )}
          </div>
        ) : canGenerate ? (
          <div className="flex flex-col gap-2">
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="self-start text-sm italic text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? t('generatingWeekSummary') : t('generateWeekSummary')}
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">{t('weekInProgress')}</p>
        )}
      </div>
    </div>
  );
}

// ─── MonthSummaryCard ────────────────────────────────────────────────────────

function MonthSummaryCard({
  monthData,
  onGenerate,
  onLabelClick,
}: {
  monthData: MonthData;
  onGenerate: (monthData: MonthData) => Promise<void>;
  onLabelClick: (taskId: number) => void;
}) {
  const { t } = useTranslation('calendar');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const isCurrentMonth = monthData.year === now.getFullYear() && monthData.month === now.getMonth();

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await onGenerate(monthData);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  if (monthData.totalEntries === 0) return null;

  const items = parseSummary(monthData.summary);

  return (
    <div className="w-full border-l-2 border-l-amber-500 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-amber-100 dark:border-amber-900/30">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          {monthData.label} — {t('monthSummary')}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {t('monthStats', { weeks: monthData.weekCount, entries: monthData.totalEntries })}
        </span>
      </div>
      <div className="px-5 py-4">
        {items ? (
          <div className="flex flex-col gap-3">
            <SummaryItems items={items} onLabelClick={onLabelClick} />
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            {!isCurrentMonth && (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="self-start text-xs italic text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? t('generatingMonthSummary') : t('regenerateMonthSummary')}
              </button>
            )}
          </div>
        ) : !isCurrentMonth ? (
          <div className="flex flex-col gap-2">
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="self-start text-sm italic text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? t('generatingMonthSummary') : t('generateMonthSummary')}
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">{t('monthInProgress')}</p>
        )}
      </div>
    </div>
  );
}

// ─── CalendarView ────────────────────────────────────────────────────────────

export function CalendarView() {
  const { t, i18n } = useTranslation(['calendar', 'hints']);
  const { navigateToTask } = useNavigation();
  const { isSeen, markSeen, isAllDisabled, disableAll } = useTooltipHints();
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [months, setMonths] = useState<Map<string, MonthData>>(new Map());
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

      // Load weekly summaries
      const weeklySummaries = await database.select<Array<{ year: number; week: number; summary: string }>>(
        'SELECT year, week, summary FROM ai_weekly_summaries'
      );
      const weeklySummaryMap = new Map(weeklySummaries.map((s) => [`${s.year}-W${s.week}`, s.summary]));

      // Load monthly summaries
      const monthlySummaries = await database.select<Array<{ year: number; month: number; summary: string }>>(
        'SELECT year, month, summary FROM ai_monthly_summaries'
      );
      const monthlySummaryMap = new Map(monthlySummaries.map((s) => [`${s.year}-${s.month}`, s.summary]));

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

      const weekGroups = groupByWeek(dayData, i18n.language, t('week'), weeklySummaryMap);
      setWeeks(weekGroups);

      // Build month data from week groups
      const monthMap = new Map<string, MonthData>();
      for (const week of weekGroups) {
        const firstDay = new Date(week.days[0].date + 'T12:00:00');
        const year = firstDay.getFullYear();
        const month = firstDay.getMonth();
        const key = `${year}-${month}`;
        if (!monthMap.has(key)) {
          const monthLabel = firstDay.toLocaleString(i18n.language, { month: 'long', year: 'numeric' });
          monthMap.set(key, {
            year,
            month,
            label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
            summary: monthlySummaryMap.get(`${year}-${month + 1}`) ?? null, // DB stores 1-based month
            weekCount: 0,
            totalEntries: 0,
          });
        }
        const md = monthMap.get(key)!;
        md.weekCount++;
        md.totalEntries += week.days.reduce((sum, d) => sum + d.entryCount, 0);
      }
      setMonths(monthMap);
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
    const groupMap = new Map<string, { taskTitle: string | null; taskId: number | null; entries: [string, string][] }>();
    for (const entry of allEntries) {
      const key = entry.task_id != null ? String(entry.task_id) : '__ungrouped__';
      if (!groupMap.has(key)) {
        groupMap.set(key, { taskTitle: entry.task_title ?? null, taskId: entry.task_id ?? null, entries: [] });
      }
      groupMap.get(key)!.entries.push([entry.description, entry.timestamp]);
    }

    // Convert to the format expected by generate_grouped_daily_summary
    // Each tuple: [task_title, task_id, entries]
    const groups: [string | null, number | null, [string, string][]][] = Array.from(groupMap.values()).map(
      (g) => [g.taskTitle, g.taskId, g.entries]
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

    // Update only the affected day in state — no full reload
    setWeeks(prev => prev.map(week => ({
      ...week,
      days: week.days.map(day =>
        day.date === date ? { ...day, summary: generatedSummary } : day
      ),
    })));
  }, [i18n.language, t]);

  const handleGenerateWeekSummary = useCallback(async (week: WeekGroup) => {
    const database = await getDb();
    // Collect daily summaries for this week
    const dailySummaries: [string, string][] = [];
    for (const day of week.days) {
      if (day.summary && day.entryCount > 0) {
        dailySummaries.push([day.date, day.summary]);
      }
    }

    if (dailySummaries.length === 0) {
      throw new Error(t('calendar:weekInProgress'));
    }

    const generatedSummary = await invoke<string>('generate_weekly_summary', {
      dailySummaries,
      weekLabel: week.label,
      language: i18n.language,
    });

    const labelTaskMap = buildLabelTaskMap(dailySummaries.map(([, json]) => json));
    const enrichedSummary = injectTaskIds(generatedSummary, labelTaskMap);

    const now = new Date().toISOString();
    await database.execute(
      "INSERT OR REPLACE INTO ai_weekly_summaries (year, week, summary, created_at, updated_at) VALUES (?, ?, ?, COALESCE((SELECT created_at FROM ai_weekly_summaries WHERE year = ? AND week = ?), ?), ?)",
      [week.year, week.weekNum, enrichedSummary, week.year, week.weekNum, now, now]
    );

    // Update state
    setWeeks(prev => prev.map(w =>
      w.year === week.year && w.weekNum === week.weekNum
        ? { ...w, weeklySummary: enrichedSummary }
        : w
    ));
  }, [i18n.language, t]);

  const handleGenerateMonthSummary = useCallback(async (monthData: MonthData) => {
    const database = await getDb();
    // Collect weekly summaries for this month
    const weeklySummaries: [string, string][] = [];
    for (const week of weeks) {
      if (week.month === monthData.month && week.year === monthData.year && week.weeklySummary) {
        weeklySummaries.push([week.label, week.weeklySummary]);
      }
    }

    if (weeklySummaries.length === 0) {
      throw new Error(t('calendar:monthInProgress'));
    }

    const generatedSummary = await invoke<string>('generate_monthly_summary', {
      weeklySummaries,
      monthLabel: monthData.label,
      language: i18n.language,
    });

    const labelTaskMap = buildLabelTaskMap(weeklySummaries.map(([, json]) => json));
    const enrichedSummary = injectTaskIds(generatedSummary, labelTaskMap);

    const now = new Date().toISOString();
    const dbMonth = monthData.month + 1; // Store as 1-based
    await database.execute(
      "INSERT OR REPLACE INTO ai_monthly_summaries (year, month, summary, created_at, updated_at) VALUES (?, ?, ?, COALESCE((SELECT created_at FROM ai_monthly_summaries WHERE year = ? AND month = ?), ?), ?)",
      [monthData.year, dbMonth, enrichedSummary, monthData.year, dbMonth, now, now]
    );

    // Update state
    setMonths(prev => {
      const next = new Map(prev);
      const key = `${monthData.year}-${monthData.month}`;
      const existing = next.get(key);
      if (existing) {
        next.set(key, { ...existing, summary: enrichedSummary });
      }
      return next;
    });
  }, [i18n.language, t, weeks]);

  const activeHintDef = activeHint ? HINT_DEFINITIONS[activeHint] : null;

  // Determine month boundaries for rendering
  const getMonthKey = (week: WeekGroup) => `${week.year}-${week.month}`;

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
          {weeks.map((week, idx) => {
            const monthKey = getMonthKey(week);
            const prevMonthKey = idx > 0 ? getMonthKey(weeks[idx - 1]) : null;
            const showMonthCard = monthKey !== prevMonthKey;
            const monthData = months.get(monthKey);

            return (
              <section key={week.label}>
                {/* Month summary card at month boundary */}
                {showMonthCard && monthData && (
                  <div className="mb-6">
                    <MonthSummaryCard
                      monthData={monthData}
                      onGenerate={handleGenerateMonthSummary}
                      onLabelClick={navigateToTask}
                    />
                  </div>
                )}

                <div className="text-xs font-semibold uppercase tracking-widest text-amber-600/70 dark:text-amber-400/60 mb-3 px-1">
                  {week.label}
                </div>

                {/* Week summary card */}
                <div className="mb-3">
                  <WeekSummaryCard
                    week={week}
                    onGenerate={handleGenerateWeekSummary}
                    onLabelClick={navigateToTask}
                  />
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
                      <DayCard day={day} onGenerate={handleGenerate} onLabelClick={navigateToTask} />
                    </motion.div>
                  ))}
                </motion.div>
              </section>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}

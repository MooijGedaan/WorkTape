import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { getDb } from '../hooks/useDatabase';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { useTooltipHints, type HintId } from '../hooks/useTooltipHints';
import { TooltipHint } from '../components/TooltipHint';
import { HINT_DEFINITIONS } from '../components/hints/hintDefinitions';
import { useNavigation } from '../hooks/useNavigation';

// ─── Types & Utilities (unchanged) ──────────────────────────────────────────

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

/** Find the month that contains the majority (4+) of an ISO week's 7 days. */
function getMajorityMonth(year: number, weekNum: number): { month: number; year: number } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (weekNum - 1) * 7);
  // Thursday (day index 3) is always in the majority month
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  return { month: thursday.getUTCMonth(), year: thursday.getUTCFullYear() };
}

function groupByWeek(days: DayData[], locale: string, weekWord: string, weeklySummaryMap: Map<string, string>): WeekGroup[] {
  const groups: WeekGroup[] = [];
  let currentKey = '';
  let currentGroup: WeekGroup | null = null;

  for (const day of days) {
    const date = new Date(day.date + 'T12:00:00'); // noon to avoid DST edge
    const week = getWeekNumber(date);
    const year = date.getFullYear();
    const key = `${year}-W${week}`;
    if (key !== currentKey) {
      currentKey = key;
      const majority = getMajorityMonth(year, week);
      const monthDate = new Date(Date.UTC(majority.year, majority.month, 1));
      const monthStr = monthDate.toLocaleString(locale, { month: 'long', timeZone: 'UTC' });
      currentGroup = {
        label: `${weekWord} ${week} · ${monthStr} ${majority.year}`,
        year: majority.year,
        weekNum: week,
        month: majority.month,
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

type TabId = 'days' | 'weeks' | 'months';

/** Build a placeholder WeekGroup for a given ISO week number when no real data exists. */
function buildPlaceholderWeek(year: number, weekNum: number, locale: string, weekWord: string): WeekGroup {
  // Find the Monday of this ISO week
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (weekNum - 1) * 7);

  const todayStr = toLocalDateString(new Date());
  const days: DayData[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = toLocalDateString(d);
    days.push({
      date: dateStr,
      summary: null,
      entryCount: 0,
      isToday: dateStr === todayStr,
      isDayEnded: false,
    });
  }

  const majority = getMajorityMonth(year, weekNum);
  const monthDate = new Date(Date.UTC(majority.year, majority.month, 1));
  const monthStr = monthDate.toLocaleString(locale, { month: 'long', timeZone: 'UTC' });
  return {
    label: `${weekWord} ${weekNum} · ${monthStr} ${majority.year}`,
    year: majority.year,
    weekNum,
    month: majority.month,
    days: days.sort((a, b) => b.date.localeCompare(a.date)),
    weeklySummary: null,
  };
}

/** Generate week groups for a given month, filling in from existing data or creating empty placeholders. */
function getWeeksForMonth(
  allWeeks: WeekGroup[],
  year: number,
  month: number, // 0-based
  locale: string,
  weekWord: string,
): WeekGroup[] {
  const existingByKey = new Map(
    allWeeks.filter(w => w.month === month && w.year === year).map(w => [`${w.year}-W${w.weekNum}`, w])
  );

  // Build the full set of ISO weeks whose majority of days fall in this month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const seenWeeks = new Set<string>();

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const weekNum = getWeekNumber(d);
    const majority = getMajorityMonth(d.getFullYear(), weekNum);
    if (majority.month !== month || majority.year !== year) continue;
    const key = `${majority.year}-W${weekNum}`;
    seenWeeks.add(key);
  }

  const groups: WeekGroup[] = [];
  for (const key of seenWeeks) {
    if (existingByKey.has(key)) {
      groups.push(existingByKey.get(key)!);
    } else {
      const weekNum = parseInt(key.split('-W')[1]);
      groups.push(buildPlaceholderWeek(year, weekNum, locale, weekWord));
    }
  }
  return groups;
}

// ─── Shared Sub-Components ──────────────────────────────────────────────────

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

function CompactFutureGroup({ items }: { items: { key: string; label: string; sublabel?: string }[] }) {
  if (items.length === 0) return null;

  return (
    <div className="w-full border rounded-xl bg-white dark:bg-zinc-900 overflow-hidden border-zinc-200 dark:border-zinc-700">
      {items.map((item, idx) => (
        <div
          key={item.key}
          className={`flex items-baseline gap-3 px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/50${
            idx < items.length - 1 ? ' border-b border-zinc-100 dark:border-zinc-800' : ''
          }`}
        >
          <span className={`${item.sublabel ? 'text-lg font-bold' : 'text-sm font-medium'} text-zinc-400 dark:text-zinc-500 leading-none`}>{item.label}</span>
          {item.sublabel && <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{item.sublabel}</span>}
        </div>
      ))}
    </div>
  );
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
    <div className={`w-full border rounded-xl bg-white dark:bg-zinc-900 overflow-hidden border-zinc-200 dark:border-zinc-700`}>
      {/* Day header */}
      <div className="flex items-baseline gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
        <span className="text-3xl font-bold text-zinc-900 dark:text-white leading-none">{dayNum}</span>
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{dayName}</span>
        {day.isToday && day.isDayEnded && (
          <span className="ml-2 inline-flex items-center rounded-md bg-green-50 dark:bg-green-950/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300 ring-1 ring-inset ring-green-700/10 dark:ring-green-300/10">
            {t('dayEnded')}
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

function WeekSummaryCard({
  week,
  onGenerate,
  onLabelClick,
  showLabel,
}: {
  week: WeekGroup;
  onGenerate: (week: WeekGroup) => Promise<void>;
  onLabelClick: (taskId: number) => void;
  showLabel?: boolean;
}) {
  const { t } = useTranslation('calendar');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysWithEntries = week.days.filter(d => d.entryCount > 0).length;
  const totalEntries = week.days.reduce((sum, d) => sum + d.entryCount, 0);
  const hasSomeSummaries = week.days.some(d => d.entryCount > 0 && d.summary !== null);
  const isCurrentWeek = week.days.some(d => d.isToday && !d.isDayEnded);

  // During the current week, require all days with entries to have summaries.
  // For past weeks, allow generation as long as at least one day has a summary.
  const canGenerate = !isCurrentWeek && hasSomeSummaries && daysWithEntries > 0;

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

  const items = parseSummary(week.weeklySummary);

  // Compact ungenerated state for the Weeks tab
  if (showLabel && !items) {
    return (
      <div className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{week.label}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {t('weekStats', { days: daysWithEntries, entries: totalEntries })}
            </span>
          </div>
          {error && <span className="text-xs text-red-500 dark:text-red-400">{error}</span>}
          {canGenerate ? (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="text-sm italic text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? t('generatingWeekSummary') : t('generateWeekSummary')}
            </button>
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">{t('weekInProgress')}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {showLabel ? week.label : t('weekSummary')}
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
  const canGenerate = !isCurrentMonth && monthData.totalEntries > 0;

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

  const items = parseSummary(monthData.summary);

  // Compact ungenerated state
  if (!items) {
    return (
      <div className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{monthData.label}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {t('monthStats', { weeks: monthData.weekCount, entries: monthData.totalEntries })}
            </span>
          </div>
          {error && <span className="text-xs text-red-500 dark:text-red-400">{error}</span>}
          {canGenerate ? (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="text-sm italic text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? t('generatingMonthSummary') : t('generateMonthSummary')}
            </button>
          ) : isCurrentMonth ? (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">{t('monthInProgress')}</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {monthData.label}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {t('monthStats', { weeks: monthData.weekCount, entries: monthData.totalEntries })}
        </span>
      </div>
      <div className="px-5 py-4">
        <div className="flex flex-col gap-3">
          <SummaryItems items={items} onLabelClick={onLabelClick} />
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          {canGenerate && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="self-start text-xs italic text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? t('generatingMonthSummary') : t('regenerateMonthSummary')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab Components ─────────────────────────────────────────────────────────

function CalendarTabs({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  const { t } = useTranslation('calendar');
  const tabs: { id: TabId; label: string }[] = [
    { id: 'days', label: t('tabs.days') },
    { id: 'weeks', label: t('tabs.weeks') },
    { id: 'months', label: t('tabs.months') },
  ];

  return (
    <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === tab.id
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function CalendarNavBar({
  activeTab,
  navWeek,
  navYear,
  navMonth,
  disableNext,
  onPrev,
  onNext,
  onToday,
}: {
  activeTab: TabId;
  navWeek: number;
  navYear: number;
  navMonth: number; // 0-based, used to derive the month label for the week display
  disableNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const { t, i18n } = useTranslation('calendar');

  const label = useMemo(() => {
    if (activeTab === 'days') {
      // "Week 13 · March 2026"
      const d = new Date(navYear, navMonth, 1);
      const monthStr = d.toLocaleString(i18n.language, { month: 'long' });
      return `${t('week')} ${navWeek} · ${monthStr} ${navYear}`;
    }
    if (activeTab === 'weeks') {
      const d = new Date(navYear, navMonth, 1);
      const s = d.toLocaleString(i18n.language, { month: 'long', year: 'numeric' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    // months tab — just the year
    return String(navYear);
  }, [activeTab, navWeek, navYear, navMonth, i18n.language, t]);

  const ariaLabel = activeTab === 'days' ? 'week' : activeTab === 'weeks' ? 'month' : 'year';

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onPrev}
        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
        aria-label={`Previous ${ariaLabel}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z" /></svg>
      </button>
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 min-w-[140px] text-center">
        {label}
      </span>
      <button
        onClick={onNext}
        disabled={disableNext}
        className={`p-1 rounded transition-colors ${disableNext ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}
        aria-label={`Next ${ariaLabel}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" /></svg>
      </button>
      <button
        onClick={onToday}
        className="ml-2 px-2.5 py-1 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        {t('navigation.today')}
      </button>
    </div>
  );
}

// ─── DaysTab ────────────────────────────────────────────────────────────────

function DaysTab({
  weeks,
  navWeek,
  navYear,
  onGenerateDay,
  onLabelClick,
}: {
  weeks: WeekGroup[];
  navWeek: number;
  navYear: number;
  onGenerateDay: (date: string) => Promise<void>;
  onLabelClick: (taskId: number) => void;
}) {
  const { t, i18n } = useTranslation('calendar');

  // Find the selected week, or build a placeholder.
  // Merge with placeholder to ensure all 7 days of the week are present (buildDays only creates past days).
  const existing = weeks.find(w => w.weekNum === navWeek && w.year === navYear);
  const placeholder = buildPlaceholderWeek(navYear, navWeek, i18n.language, t('week'));
  const weekGroup = useMemo(() => {
    if (!existing) return placeholder;
    const existingDates = new Set(existing.days.map(d => d.date));
    const missingDays = placeholder.days.filter(d => !existingDates.has(d.date));
    if (missingDays.length === 0) return existing;
    return {
      ...existing,
      days: [...existing.days, ...missingDays].sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [existing, placeholder]);

  const todayStr = toLocalDateString(new Date());
  const futureDays = weekGroup.days.filter(d => d.date > todayStr);
  const currentAndPastDays = weekGroup.days.filter(d => d.date <= todayStr);

  const futureDayItems = futureDays.map(d => {
    const { dayNum, dayName } = formatDayHeader(d.date, i18n.language);
    return { key: d.date, label: dayNum, sublabel: dayName };
  });

  return (
    <div className="space-y-3">
      <CompactFutureGroup items={futureDayItems} />
      {currentAndPastDays.map((day) => (
        <DayCard key={day.date} day={day} onGenerate={onGenerateDay} onLabelClick={onLabelClick} />
      ))}
    </div>
  );
}

// ─── WeeksTab ───────────────────────────────────────────────────────────────

function WeeksTab({
  weeks,
  activeMonth,
  activeYear,
  onGenerateWeek,
  onGenerateAllWeeks,
  onLabelClick,
}: {
  weeks: WeekGroup[];
  activeMonth: number;
  activeYear: number;
  onGenerateWeek: (week: WeekGroup) => Promise<void>;
  onGenerateAllWeeks: () => Promise<void>;
  onLabelClick: (taskId: number) => void;
}) {
  const { t, i18n } = useTranslation('calendar');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const filtered = getWeeksForMonth(weeks, activeYear, activeMonth, i18n.language, t('week'));

  const eligibleForGeneration = filtered.filter(w => {
    const hasSomeSummaries = w.days.some(d => d.entryCount > 0 && d.summary !== null);
    const isCurrentWeek = w.days.some(d => d.isToday && !d.isDayEnded);
    const daysWithEntries = w.days.filter(d => d.entryCount > 0).length;
    return !isCurrentWeek && hasSomeSummaries && daysWithEntries > 0 && !w.weeklySummary;
  });

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    try {
      await onGenerateAllWeeks();
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const todayStr = toLocalDateString(new Date());
  const isFutureWeek = (w: WeekGroup) => w.days.every(d => d.date > todayStr);
  const futureWeeks = filtered.filter(isFutureWeek);
  const currentAndPastWeeks = filtered.filter(w => !isFutureWeek(w));

  const futureWeekItems = futureWeeks.map(w => ({ key: w.label, label: w.label }));

  return (
    <div className="space-y-4">
      {eligibleForGeneration.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={handleGenerateAll}
            disabled={isGeneratingAll}
            className="text-sm italic text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGeneratingAll ? t('generatingAll') : t('generateAllWeeks')}
          </button>
        </div>
      )}
      <CompactFutureGroup items={futureWeekItems} />
      {currentAndPastWeeks.map(week => (
        <WeekSummaryCard
          key={week.label}
          week={week}
          onGenerate={onGenerateWeek}
          onLabelClick={onLabelClick}
          showLabel
        />
      ))}
    </div>
  );
}

// ─── MonthsTab ──────────────────────────────────────────────────────────────

function MonthsTab({
  months,
  navYear,
  onGenerateMonth,
  onGenerateAllMonths,
  onLabelClick,
}: {
  months: Map<string, MonthData>;
  navYear: number;
  onGenerateMonth: (monthData: MonthData) => Promise<void>;
  onGenerateAllMonths: () => Promise<void>;
  onLabelClick: (taskId: number) => void;
}) {
  const { t, i18n } = useTranslation('calendar');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  // Build all 12 months for the selected year
  const yearMonths = useMemo(() => {
    const result: MonthData[] = [];
    for (let m = 11; m >= 0; m--) {
      const key = `${navYear}-${m}`;
      if (months.has(key)) {
        result.push(months.get(key)!);
      } else {
        const d = new Date(navYear, m, 1);
        const label = d.toLocaleString(i18n.language, { month: 'long', year: 'numeric' });
        result.push({
          year: navYear,
          month: m,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          summary: null,
          weekCount: 0,
          totalEntries: 0,
        });
      }
    }
    return result;
  }, [months, navYear, i18n.language]);

  const now = new Date();
  const eligibleForGeneration = yearMonths.filter(m =>
    m.totalEntries > 0 && !m.summary && !(m.year === now.getFullYear() && m.month === now.getMonth())
  );

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    try {
      await onGenerateAllMonths();
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const now2 = new Date();
  const currentYear = now2.getFullYear();
  const currentMonth = now2.getMonth();
  const futureMonths = yearMonths.filter(m =>
    m.year > currentYear || (m.year === currentYear && m.month > currentMonth)
  );
  const currentAndPastMonths = yearMonths.filter(m =>
    m.year < currentYear || (m.year === currentYear && m.month <= currentMonth)
  );

  return (
    <div className="space-y-4">
      {eligibleForGeneration.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={handleGenerateAll}
            disabled={isGeneratingAll}
            className="text-sm italic text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGeneratingAll ? t('generatingAll') : t('generateAllMonths')}
          </button>
        </div>
      )}
      <CompactFutureGroup items={futureMonths.map(m => ({ key: `${m.year}-${m.month}`, label: m.label }))} />
      {currentAndPastMonths.map(monthData => (
        <MonthSummaryCard
          key={`${monthData.year}-${monthData.month}`}
          monthData={monthData}
          onGenerate={onGenerateMonth}
          onLabelClick={onLabelClick}
        />
      ))}
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
  const [activeTab, setActiveTab] = useState<TabId>('days');

  // Navigation state
  const now = new Date();
  const [navWeek, setNavWeek] = useState(() => getWeekNumber(now));
  const [navMonth, setNavMonth] = useState(now.getMonth());
  const [navYear, setNavYear] = useState(now.getFullYear());

  // Derive the month that the current navWeek falls in (for the nav bar label)
  const navWeekMonth = useMemo(() => {
    const jan4 = new Date(Date.UTC(navYear, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (navWeek - 1) * 7);
    return monday.getMonth();
  }, [navYear, navWeek]);

  const handlePrev = useCallback(() => {
    if (activeTab === 'days') {
      // Previous week
      if (navWeek <= 1) {
        const prevYear = navYear - 1;
        const lastWeek = getWeekNumber(new Date(prevYear, 11, 28));
        setNavWeek(lastWeek);
        setNavYear(prevYear);
      } else {
        setNavWeek(w => w - 1);
      }
    } else if (activeTab === 'weeks') {
      // Previous month
      if (navMonth === 0) { setNavYear(y => y - 1); setNavMonth(11); }
      else setNavMonth(m => m - 1);
    } else {
      // Previous year
      setNavYear(y => y - 1);
    }
  }, [activeTab, navWeek, navYear, navMonth]);

  // Whether the nav is already at the current period (can't go forward)
  const isAtCurrentPeriod = useMemo(() => {
    const today = new Date();
    if (activeTab === 'days') return navWeek === getWeekNumber(today) && navYear === today.getFullYear();
    if (activeTab === 'weeks') return navMonth === today.getMonth() && navYear === today.getFullYear();
    return navYear === today.getFullYear();
  }, [activeTab, navWeek, navMonth, navYear]);

  const handleNext = useCallback(() => {
    if (isAtCurrentPeriod) return;
    if (activeTab === 'days') {
      // Next week
      const lastWeek = getWeekNumber(new Date(navYear, 11, 28));
      if (navWeek >= lastWeek) {
        setNavWeek(1);
        setNavYear(y => y + 1);
      } else {
        setNavWeek(w => w + 1);
      }
    } else if (activeTab === 'weeks') {
      // Next month
      if (navMonth === 11) { setNavYear(y => y + 1); setNavMonth(0); }
      else setNavMonth(m => m + 1);
    } else {
      // Next year
      setNavYear(y => y + 1);
    }
  }, [activeTab, navWeek, navYear, navMonth, isAtCurrentPeriod]);

  const handleToday = useCallback(() => {
    const today = new Date();
    setNavYear(today.getFullYear());
    setNavMonth(today.getMonth());
    setNavWeek(getWeekNumber(today));
  }, []);

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

    const nowStr = new Date().toISOString();
    await database.execute(
      "INSERT OR REPLACE INTO ai_summaries (date, summary, created_at, updated_at) VALUES (?, ?, COALESCE((SELECT created_at FROM ai_summaries WHERE date = ?), ?), ?)",
      [date, generatedSummary, date, nowStr, nowStr]
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

    const nowStr = new Date().toISOString();
    await database.execute(
      "INSERT OR REPLACE INTO ai_weekly_summaries (year, week, summary, created_at, updated_at) VALUES (?, ?, ?, COALESCE((SELECT created_at FROM ai_weekly_summaries WHERE year = ? AND week = ?), ?), ?)",
      [week.year, week.weekNum, enrichedSummary, week.year, week.weekNum, nowStr, nowStr]
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
    // Collect weekly summaries for this month (use whatever is available)
    const weeklySummaries: [string, string][] = [];
    for (const week of weeks) {
      if (week.month === monthData.month && week.year === monthData.year && week.weeklySummary) {
        weeklySummaries.push([week.label, week.weeklySummary]);
      }
    }

    // Fall back to daily summaries if no weekly summaries exist yet
    if (weeklySummaries.length === 0) {
      const dailySummaries: [string, string][] = [];
      for (const week of weeks) {
        if (week.month === monthData.month && week.year === monthData.year) {
          for (const day of week.days) {
            if (day.summary && day.entryCount > 0) {
              dailySummaries.push([day.date, day.summary]);
            }
          }
        }
      }
      if (dailySummaries.length === 0) {
        throw new Error(t('calendar:noEntriesThrown'));
      }
      // Generate via weekly summary endpoint using daily summaries as input
      const generatedSummary = await invoke<string>('generate_monthly_summary', {
        weeklySummaries: dailySummaries,
        monthLabel: monthData.label,
        language: i18n.language,
      });
      const labelTaskMap = buildLabelTaskMap(dailySummaries.map(([, json]) => json));
      const enrichedSummary = injectTaskIds(generatedSummary, labelTaskMap);
      const nowStr = new Date().toISOString();
      const dbMonth = monthData.month + 1;
      await database.execute(
        "INSERT OR REPLACE INTO ai_monthly_summaries (year, month, summary, created_at, updated_at) VALUES (?, ?, ?, COALESCE((SELECT created_at FROM ai_monthly_summaries WHERE year = ? AND month = ?), ?), ?)",
        [monthData.year, dbMonth, enrichedSummary, monthData.year, dbMonth, nowStr, nowStr]
      );
      setMonths(prev => {
        const next = new Map(prev);
        const key = `${monthData.year}-${monthData.month}`;
        const existing = next.get(key);
        if (existing) next.set(key, { ...existing, summary: enrichedSummary });
        return next;
      });
      return;
    }

    const generatedSummary = await invoke<string>('generate_monthly_summary', {
      weeklySummaries,
      monthLabel: monthData.label,
      language: i18n.language,
    });

    const labelTaskMap = buildLabelTaskMap(weeklySummaries.map(([, json]) => json));
    const enrichedSummary = injectTaskIds(generatedSummary, labelTaskMap);

    const nowStr = new Date().toISOString();
    const dbMonth = monthData.month + 1; // Store as 1-based
    await database.execute(
      "INSERT OR REPLACE INTO ai_monthly_summaries (year, month, summary, created_at, updated_at) VALUES (?, ?, ?, COALESCE((SELECT created_at FROM ai_monthly_summaries WHERE year = ? AND month = ?), ?), ?)",
      [monthData.year, dbMonth, enrichedSummary, monthData.year, dbMonth, nowStr, nowStr]
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

  // Generate all eligible week summaries for the active month sequentially
  const handleGenerateAllWeeks = useCallback(async () => {
    const filtered = weeks.filter(w => w.month === navMonth && w.year === navYear);
    for (const week of filtered) {
      const hasSomeSummaries = week.days.some(d => d.entryCount > 0 && d.summary !== null);
      const isCurrentWeek = week.days.some(d => d.isToday && !d.isDayEnded);
      const daysWithEntries = week.days.filter(d => d.entryCount > 0).length;
      if (!isCurrentWeek && hasSomeSummaries && daysWithEntries > 0 && !week.weeklySummary) {
        await handleGenerateWeekSummary(week);
      }
    }
  }, [weeks, navMonth, navYear, handleGenerateWeekSummary]);

  // Generate all eligible month summaries sequentially
  const handleGenerateAllMonths = useCallback(async () => {
    const nowDate = new Date();
    const sortedMonths = Array.from(months.values())
      .filter(m => m.totalEntries > 0 && !m.summary && !(m.year === nowDate.getFullYear() && m.month === nowDate.getMonth()))
      .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);
    for (const monthData of sortedMonths) {
      await handleGenerateMonthSummary(monthData);
    }
  }, [months, handleGenerateMonthSummary]);

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
      <div className="flex-shrink-0 mb-4">
        <Heading>{t('calendar:title')}</Heading>
        <Text className="mt-1">{t('calendar:subtitle')}</Text>
      </div>

      {/* Tabs + Nav Bar */}
      <div className="flex-shrink-0 mb-4 flex flex-wrap items-center justify-between gap-3">
        <CalendarTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <CalendarNavBar
          activeTab={activeTab}
          navWeek={navWeek}
          navYear={navYear}
          navMonth={activeTab === 'days' ? navWeekMonth : navMonth}
          disableNext={isAtCurrentPeriod}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
        />
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Text className="text-zinc-400 italic">{t('calendar:loading')}</Text>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1">
          {activeTab === 'days' && (
            <DaysTab
              weeks={weeks}
              navWeek={navWeek}
              navYear={navYear}
              onGenerateDay={handleGenerate}
              onLabelClick={navigateToTask}
            />
          )}
          {activeTab === 'weeks' && (
            <WeeksTab
              weeks={weeks}
              activeMonth={navMonth}
              activeYear={navYear}
              onGenerateWeek={handleGenerateWeekSummary}
              onGenerateAllWeeks={handleGenerateAllWeeks}
              onLabelClick={navigateToTask}
            />
          )}
          {activeTab === 'months' && (
            <MonthsTab
              months={months}
              navYear={navYear}
              onGenerateMonth={handleGenerateMonthSummary}
              onGenerateAllMonths={handleGenerateAllMonths}
              onLabelClick={navigateToTask}
            />
          )}
        </div>
      )}
    </div>
    </>
  );
}

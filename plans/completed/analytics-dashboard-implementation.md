# Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Analytics view that shows productivity metrics, work pattern charts, sprint progress, and AI usage insights using data already in the SQLite database.

**Architecture:** A new `AnalyticsView` renders stat cards and Recharts-powered charts. A `useAnalytics` hook fetches all data from the frontend via `getDb()` (tauri-plugin-sql), parameterized by a time period selector (7d / 30d / all). No new Tauri commands needed.

**Tech Stack:** React, TypeScript, Recharts, Tailwind CSS 4.x, motion/react, react-i18next, @tauri-apps/plugin-sql

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `src/hooks/useAnalytics.ts` | Hook: fetches all analytics data from SQLite, returns typed `AnalyticsData` with loading/error states |
| `src/views/AnalyticsView.tsx` | Main view: period selector, stat cards, chart grid layout |
| `src/views/analytics/DailyActivityChart.tsx` | Stacked bar chart: manual vs auto entries per day |
| `src/views/analytics/HourlyHeatmap.tsx` | 7x24 grid heatmap: entries by hour-of-day x day-of-week |
| `src/views/analytics/WeeklyTrendChart.tsx` | Line chart: entries per week over 8-12 weeks |
| `src/views/analytics/TaskStatusChart.tsx` | Donut chart: sprint task status distribution |
| `src/views/analytics/PriorityBreakdownChart.tsx` | Horizontal bar chart: tasks by priority, split by status |
| `src/views/analytics/TokenUsageChart.tsx` | Area chart: daily token consumption |
| `src/views/analytics/StatCard.tsx` | Reusable stat card component (icon, label, animated number, description) |
| `src/views/analytics/PeriodSelector.tsx` | Segmented control: 7d / 30d / all toggle |
| `src/views/analytics/EmptyState.tsx` | Friendly empty state with icon + message + link |
| `src/i18n/locales/en/analytics.json` | English translations |
| `src/i18n/locales/nl/analytics.json` | Dutch translations |
| `src/hooks/useAnalytics.test.ts` | Hook tests |
| `src/views/AnalyticsView.test.tsx` | View render tests |

### Modified Files
| File | Change |
|---|---|
| `src/hooks/useNavigation.tsx:3` | Add `'analytics'` to `View` type union |
| `src/components/ViewRouter.tsx` | Add `'analytics': <AnalyticsView />` to views object + import |
| `src/components/ApplicationLayout.tsx` | Add sidebar item between Sprint Board and Export |
| `src/components/icons.tsx` | Export `ChartBarIcon` from `@heroicons/react/20/solid` |
| `src/i18n/config.ts` | Import analytics locale files, add to `resources` and `ns` array |
| `src/i18n/locales/en/common.json` | Add `navigation.analytics` key |
| `src/i18n/locales/nl/common.json` | Add `navigation.analytics` key |
| `package.json` | Add `recharts` dependency |

---

## Task 1: Install Recharts and Wire Navigation

**Files:**
- Modify: `package.json`
- Modify: `src/hooks/useNavigation.tsx:3`
- Modify: `src/components/icons.tsx`
- Modify: `src/i18n/locales/en/common.json`
- Modify: `src/i18n/locales/nl/common.json`

- [ ] **Step 1: Install recharts**

Run:
```bash
npm install recharts
```
Expected: `recharts` appears in `package.json` dependencies.

- [ ] **Step 2: Add `analytics` to the View type**

In `src/hooks/useNavigation.tsx`, change line 3 from:
```tsx
export type View = 'home' | 'work-log' | 'calendar' | 'sprint-board' | 'settings' | 'export';
```
to:
```tsx
export type View = 'home' | 'work-log' | 'calendar' | 'sprint-board' | 'analytics' | 'settings' | 'export';
```

- [ ] **Step 3: Export ChartBarIcon**

In `src/components/icons.tsx`, add `ChartBarIcon` to the export block:
```tsx
export {
  HomeIcon,
  DocumentTextIcon as DocumentIcon,
  Cog6ToothIcon as CogIcon,
  ArrowDownTrayIcon,
  SparklesIcon,
  QuestionMarkCircleIcon,
  MinusIcon,
  XMarkIcon,
  CameraIcon,
  BugAntIcon,
  CalendarDaysIcon,
  ViewColumnsIcon,
  ClockIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChartBarIcon,
} from '@heroicons/react/20/solid';
```

- [ ] **Step 4: Add navigation.analytics to common locale files**

In `src/i18n/locales/en/common.json`, add inside `"navigation"`:
```json
"analytics": "Analytics"
```

In `src/i18n/locales/nl/common.json`, add inside `"navigation"`:
```json
"analytics": "Analyse"
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/hooks/useNavigation.tsx src/components/icons.tsx src/i18n/locales/en/common.json src/i18n/locales/nl/common.json
git commit -m "feat(analytics): install recharts and add analytics view type + icon"
```

---

## Task 2: Create i18n Locale Files

**Files:**
- Create: `src/i18n/locales/en/analytics.json`
- Create: `src/i18n/locales/nl/analytics.json`
- Modify: `src/i18n/config.ts`

- [ ] **Step 1: Create English locale file**

Create `src/i18n/locales/en/analytics.json`:
```json
{
  "title": "Analytics",
  "subtitle": "Insights into your productivity patterns and work habits",
  "period": {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "all": "All time"
  },
  "stats": {
    "entriesToday": {
      "label": "Entries Today",
      "description": "Work entries logged today"
    },
    "weeklyTotal": {
      "label": "Weekly Total",
      "description": "Entries in the last 7 days"
    },
    "currentStreak": {
      "label": "Current Streak",
      "description": "Consecutive days with entries",
      "days_one": "{{count}} day",
      "days_other": "{{count}} days"
    },
    "aiSummaries": {
      "label": "AI Summaries",
      "description": "Summaries generated this period"
    },
    "tasksCompleted": {
      "label": "Tasks Completed",
      "description": "Sprint tasks marked as done"
    },
    "successRate": {
      "label": "AI Success Rate",
      "description": "Successful AI calls this period"
    },
    "avgResponseTime": {
      "label": "Avg Response Time",
      "description": "Average AI response time this period",
      "value": "{{value}}ms"
    }
  },
  "charts": {
    "dailyActivity": {
      "title": "Daily Activity",
      "manual": "Manual",
      "auto": "Auto-captured"
    },
    "hourlyHeatmap": {
      "title": "Hourly Activity",
      "days": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      "tooltip": "{{count}} entries"
    },
    "weeklyTrend": {
      "title": "Weekly Trend",
      "entries": "Entries"
    },
    "taskStatus": {
      "title": "Task Status",
      "statuses": {
        "todo": "To Do",
        "in-progress": "In Progress",
        "done": "Done",
        "blocked": "Blocked"
      }
    },
    "priorityBreakdown": {
      "title": "Priority Breakdown",
      "priorities": {
        "low": "Low",
        "medium": "Medium",
        "high": "High"
      }
    },
    "tokenUsage": {
      "title": "Token Usage",
      "tokens": "Tokens"
    }
  },
  "empty": {
    "noEntries": {
      "title": "No work entries yet",
      "message": "Start logging your work to see activity analytics.",
      "action": "Go to Work Log"
    },
    "noTasks": {
      "title": "No sprint tasks yet",
      "message": "Create tasks on the Sprint Board to track progress.",
      "action": "Go to Sprint Board"
    },
    "noAiData": {
      "title": "No AI usage data",
      "message": "Generate summaries to see AI usage analytics."
    }
  }
}
```

- [ ] **Step 2: Create Dutch locale file**

Create `src/i18n/locales/nl/analytics.json`:
```json
{
  "title": "Analyse",
  "subtitle": "Inzichten in uw productiviteitspatronen en werkgewoonten",
  "period": {
    "7d": "Afgelopen 7 dagen",
    "30d": "Afgelopen 30 dagen",
    "all": "Alles"
  },
  "stats": {
    "entriesToday": {
      "label": "Items vandaag",
      "description": "Werkitems van vandaag"
    },
    "weeklyTotal": {
      "label": "Weektotaal",
      "description": "Items in de afgelopen 7 dagen"
    },
    "currentStreak": {
      "label": "Huidige reeks",
      "description": "Opeenvolgende dagen met items",
      "days_one": "{{count}} dag",
      "days_other": "{{count}} dagen"
    },
    "aiSummaries": {
      "label": "AI-samenvattingen",
      "description": "Gegenereerde samenvattingen deze periode"
    },
    "tasksCompleted": {
      "label": "Taken voltooid",
      "description": "Sprinttaken gemarkeerd als klaar"
    },
    "successRate": {
      "label": "AI-slagingspercentage",
      "description": "Succesvolle AI-aanroepen deze periode"
    },
    "avgResponseTime": {
      "label": "Gem. responstijd",
      "description": "Gemiddelde AI-responstijd deze periode",
      "value": "{{value}}ms"
    }
  },
  "charts": {
    "dailyActivity": {
      "title": "Dagelijkse activiteit",
      "manual": "Handmatig",
      "auto": "Automatisch vastgelegd"
    },
    "hourlyHeatmap": {
      "title": "Activiteit per uur",
      "days": ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"],
      "tooltip": "{{count}} items"
    },
    "weeklyTrend": {
      "title": "Weektrend",
      "entries": "Items"
    },
    "taskStatus": {
      "title": "Taakstatus",
      "statuses": {
        "todo": "Te doen",
        "in-progress": "Bezig",
        "done": "Klaar",
        "blocked": "Geblokkeerd"
      }
    },
    "priorityBreakdown": {
      "title": "Prioriteitsverdeling",
      "priorities": {
        "low": "Laag",
        "medium": "Gemiddeld",
        "high": "Hoog"
      }
    },
    "tokenUsage": {
      "title": "Tokengebruik",
      "tokens": "Tokens"
    }
  },
  "empty": {
    "noEntries": {
      "title": "Nog geen werkitems",
      "message": "Begin met het loggen van uw werk om activiteitsanalyses te zien.",
      "action": "Ga naar werklogboek"
    },
    "noTasks": {
      "title": "Nog geen sprinttaken",
      "message": "Maak taken aan op het sprintbord om voortgang bij te houden.",
      "action": "Ga naar sprintbord"
    },
    "noAiData": {
      "title": "Geen AI-gebruiksdata",
      "message": "Genereer samenvattingen om AI-gebruiksanalyses te zien."
    }
  }
}
```

- [ ] **Step 3: Register analytics namespace in i18n config**

In `src/i18n/config.ts`, add imports after line 16 (`import quickentryEN ...`):
```tsx
import analyticsEN from './locales/en/analytics.json';
```

After line 28 (`import quickentryNL ...`):
```tsx
import analyticsNL from './locales/nl/analytics.json';
```

Add `analytics: analyticsEN,` to the `en` block (after `quickentry: quickentryEN,`):
```tsx
analytics: analyticsEN,
```

Add `analytics: analyticsNL,` to the `nl` block (after `quickentry: quickentryNL,`):
```tsx
analytics: analyticsNL,
```

Add `'analytics'` to the `ns` array in the init config:
```tsx
ns: ['common', 'worklog', 'home', 'export', 'notifications', 'prompt', 'settings', 'sprintboard', 'calendar', 'hints', 'quickentry', 'analytics'],
```

- [ ] **Step 4: Run i18n config test**

Run: `npm run test:run -- src/i18n/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en/analytics.json src/i18n/locales/nl/analytics.json src/i18n/config.ts
git commit -m "feat(analytics): add i18n locale files and register namespace"
```

---

## Task 3: Create useAnalytics Hook

**Files:**
- Create: `src/hooks/useAnalytics.ts`
- Create: `src/hooks/useAnalytics.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/hooks/useAnalytics.test.ts`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAnalytics } from './useAnalytics';

const mockSelect = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn(() => Promise.resolve({ select: mockSelect })),
  },
}));

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty arrays for all queries
    mockSelect.mockResolvedValue([]);
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => useAnalytics('7d'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('fetches data and stops loading', async () => {
    mockSelect.mockResolvedValue([]);
    const { result } = renderHook(() => useAnalytics('7d'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });

  it('sets error state on query failure', async () => {
    mockSelect.mockRejectedValue(new Error('DB error'));
    const { result } = renderHook(() => useAnalytics('7d'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('DB error');
  });

  it('re-fetches when period changes', async () => {
    mockSelect.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ period }) => useAnalytics(period),
      { initialProps: { period: '7d' as const } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callCountAfterFirst = mockSelect.mock.calls.length;

    rerender({ period: '30d' as const });

    await waitFor(() => {
      expect(mockSelect.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
    });
  });

  it('returns daily entry counts', async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes('work_entries') && sql.includes('UNION ALL') && sql.includes('auto_work_entries')) {
        return Promise.resolve([
          { date: '2026-03-29', source: 'manual', count: 5 },
          { date: '2026-03-29', source: 'auto', count: 3 },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useAnalytics('7d'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.dailyActivity).toEqual([
      { date: '2026-03-29', source: 'manual', count: 5 },
      { date: '2026-03-29', source: 'auto', count: 3 },
    ]);
  });

  it('returns sprint task status counts', async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes('sprint_tasks') && sql.includes('GROUP BY status') && !sql.includes('priority')) {
        return Promise.resolve([
          { status: 'todo', count: 3 },
          { status: 'done', count: 7 },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useAnalytics('7d'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.taskStatusCounts).toEqual([
      { status: 'todo', count: 3 },
      { status: 'done', count: 7 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/hooks/useAnalytics.test.ts`
Expected: FAIL — `useAnalytics` module not found.

- [ ] **Step 3: Create the useAnalytics hook**

Create `src/hooks/useAnalytics.ts`:
```tsx
import { useState, useEffect, useRef } from 'react';
import { getDb } from './useDatabase';

export type Period = '7d' | '30d' | 'all';

interface DailyEntry {
  date: string;
  source: 'manual' | 'auto';
  count: number;
}

interface HourlyEntry {
  day_of_week: number;
  hour: number;
  count: number;
}

interface WeeklyEntry {
  week: string;
  count: number;
}

interface TaskStatusCount {
  status: string;
  count: number;
}

interface PriorityStatusCount {
  priority: string;
  status: string;
  count: number;
}

interface TokenUsageEntry {
  date: string;
  tokens: number;
}

interface AiStats {
  total: number;
  successful: number;
  avgDuration: number;
}

export interface AnalyticsData {
  entriesToday: number;
  weeklyTotal: number;
  currentStreak: number;
  aiSummariesCount: number;
  tasksCompleted: number;
  dailyActivity: DailyEntry[];
  hourlyHeatmap: HourlyEntry[];
  weeklyTrend: WeeklyEntry[];
  taskStatusCounts: TaskStatusCount[];
  priorityBreakdown: PriorityStatusCount[];
  tokenUsage: TokenUsageEntry[];
  aiStats: AiStats;
}

const EMPTY_DATA: AnalyticsData = {
  entriesToday: 0,
  weeklyTotal: 0,
  currentStreak: 0,
  aiSummariesCount: 0,
  tasksCompleted: 0,
  dailyActivity: [],
  hourlyHeatmap: [],
  weeklyTrend: [],
  taskStatusCounts: [],
  priorityBreakdown: [],
  tokenUsage: [],
  aiStats: { total: 0, successful: 0, avgDuration: 0 },
};

function getStartDate(period: Period): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : 30;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function useAnalytics(period: Period) {
  const [data, setData] = useState<AnalyticsData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const fetchId = ++fetchIdRef.current;

    async function fetchAll() {
      setIsLoading(true);
      setError(null);

      try {
        const db = await getDb();
        const startDate = getStartDate(period);
        const today = getTodayDate();
        const dateFilter = startDate
          ? `WHERE DATE(timestamp) >= '${startDate}'`
          : '';
        const dateFilterAnd = startDate
          ? `AND DATE(timestamp) >= '${startDate}'`
          : '';
        const requestDateFilter = startDate
          ? `WHERE DATE(request_timestamp) >= '${startDate}'`
          : '';

        const [
          dailyActivity,
          hourlyHeatmap,
          weeklyTrend,
          taskStatusCounts,
          priorityBreakdown,
          tokenUsage,
          aiStatsRaw,
          entriesTodayRaw,
          weeklyTotalRaw,
          streakDates,
          aiSummariesRaw,
          tasksCompletedRaw,
        ] = await Promise.all([
          // Daily activity (manual + auto)
          db.select<DailyEntry[]>(
            `SELECT DATE(timestamp) as date, 'manual' as source, COUNT(*) as count
             FROM work_entries ${dateFilter}
             GROUP BY DATE(timestamp)
             UNION ALL
             SELECT DATE(timestamp) as date, 'auto' as source, COUNT(*) as count
             FROM auto_work_entries ${dateFilter}
             GROUP BY DATE(timestamp)`
          ),

          // Hourly heatmap
          db.select<HourlyEntry[]>(
            `SELECT
               CAST(strftime('%w', timestamp) AS INTEGER) as day_of_week,
               CAST(strftime('%H', timestamp) AS INTEGER) as hour,
               COUNT(*) as count
             FROM (
               SELECT timestamp FROM work_entries
               UNION ALL
               SELECT timestamp FROM auto_work_entries
             )
             ${dateFilter}
             GROUP BY day_of_week, hour`
          ),

          // Weekly trend
          db.select<WeeklyEntry[]>(
            `SELECT strftime('%Y-%W', timestamp) as week, COUNT(*) as count
             FROM (
               SELECT timestamp FROM work_entries
               UNION ALL
               SELECT timestamp FROM auto_work_entries
             )
             ${dateFilter}
             GROUP BY week
             ORDER BY week`
          ),

          // Task status distribution (always current state)
          db.select<TaskStatusCount[]>(
            `SELECT status, COUNT(*) as count FROM sprint_tasks GROUP BY status`
          ),

          // Priority x status breakdown (always current state)
          db.select<PriorityStatusCount[]>(
            `SELECT priority, status, COUNT(*) as count
             FROM sprint_tasks
             GROUP BY priority, status`
          ),

          // Token usage by day
          db.select<TokenUsageEntry[]>(
            `SELECT DATE(request_timestamp) as date, SUM(total_tokens) as tokens
             FROM api_call_logs
             ${requestDateFilter}
             GROUP BY DATE(request_timestamp)
             ORDER BY date`
          ),

          // AI success rate + avg duration
          db.select<Array<{ total: number; successful: number; avg_duration: number }>>(
            `SELECT
               COUNT(*) as total,
               SUM(CASE WHEN response_status = 'success' THEN 1 ELSE 0 END) as successful,
               AVG(duration_ms) as avg_duration
             FROM api_call_logs
             ${requestDateFilter}`
          ),

          // Entries today
          db.select<Array<{ count: number }>>(
            `SELECT COUNT(*) as count FROM (
               SELECT id FROM work_entries WHERE DATE(timestamp) = '${today}'
               UNION ALL
               SELECT id FROM auto_work_entries WHERE DATE(timestamp) = '${today}'
             )`
          ),

          // Weekly total (always last 7 days regardless of period)
          db.select<Array<{ count: number }>>(
            `SELECT COUNT(*) as count FROM (
               SELECT id FROM work_entries WHERE DATE(timestamp) >= DATE('now', '-7 days')
               UNION ALL
               SELECT id FROM auto_work_entries WHERE DATE(timestamp) >= DATE('now', '-7 days')
             )`
          ),

          // Streak: distinct dates with entries, ordered descending
          db.select<Array<{ date: string }>>(
            `SELECT DISTINCT DATE(timestamp) as date FROM (
               SELECT timestamp FROM work_entries
               UNION ALL
               SELECT timestamp FROM auto_work_entries
             )
             ORDER BY date DESC`
          ),

          // AI summaries count
          db.select<Array<{ count: number }>>(
            startDate
              ? `SELECT COUNT(*) as count FROM ai_summaries WHERE date >= '${startDate}'`
              : `SELECT COUNT(*) as count FROM ai_summaries`
          ),

          // Tasks completed (done status, always current)
          db.select<Array<{ count: number }>>(
            `SELECT COUNT(*) as count FROM sprint_tasks WHERE status = 'done'`
          ),
        ]);

        // Bail if a newer fetch was started
        if (fetchId !== fetchIdRef.current) return;

        // Calculate streak
        let streak = 0;
        if (streakDates.length > 0) {
          const todayMs = new Date(today + 'T00:00:00').getTime();
          const firstDate = new Date(streakDates[0].date + 'T00:00:00').getTime();
          const dayMs = 86400000;

          // Streak must include today or yesterday to be active
          if (todayMs - firstDate <= dayMs) {
            streak = 1;
            for (let i = 1; i < streakDates.length; i++) {
              const prev = new Date(streakDates[i - 1].date + 'T00:00:00').getTime();
              const curr = new Date(streakDates[i].date + 'T00:00:00').getTime();
              if (prev - curr === dayMs) {
                streak++;
              } else {
                break;
              }
            }
          }
        }

        const aiRow = aiStatsRaw[0] || { total: 0, successful: 0, avg_duration: 0 };

        setData({
          entriesToday: entriesTodayRaw[0]?.count || 0,
          weeklyTotal: weeklyTotalRaw[0]?.count || 0,
          currentStreak: streak,
          aiSummariesCount: aiSummariesRaw[0]?.count || 0,
          tasksCompleted: tasksCompletedRaw[0]?.count || 0,
          dailyActivity,
          hourlyHeatmap,
          weeklyTrend,
          taskStatusCounts,
          priorityBreakdown,
          tokenUsage,
          aiStats: {
            total: aiRow.total || 0,
            successful: aiRow.successful || 0,
            avgDuration: Math.round(aiRow.avg_duration || 0),
          },
        });
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (fetchId === fetchIdRef.current) {
          setIsLoading(false);
        }
      }
    }

    fetchAll();
  }, [period]);

  return { data, isLoading, error };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/hooks/useAnalytics.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAnalytics.ts src/hooks/useAnalytics.test.ts
git commit -m "feat(analytics): add useAnalytics hook with all DB queries"
```

---

## Task 4: Create Shared Components (StatCard, PeriodSelector, EmptyState)

**Files:**
- Create: `src/views/analytics/StatCard.tsx`
- Create: `src/views/analytics/PeriodSelector.tsx`
- Create: `src/views/analytics/EmptyState.tsx`

- [ ] **Step 1: Create StatCard component**

Create `src/views/analytics/StatCard.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { Text } from '../../components/catalyst/text';

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

interface StatCardProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: number;
  description: string;
  isLoading: boolean;
  color: 'amber' | 'blue' | 'green' | 'purple' | 'rose';
  suffix?: string;
}

const colorMap = {
  amber: {
    border: 'border-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconText: 'text-amber-600 dark:text-amber-400',
    darkGradient: 'dark:from-amber-950/20',
  },
  blue: {
    border: 'border-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconText: 'text-blue-600 dark:text-blue-400',
    darkGradient: 'dark:from-blue-950/20',
  },
  green: {
    border: 'border-green-500',
    iconBg: 'bg-green-100 dark:bg-green-900/40',
    iconText: 'text-green-600 dark:text-green-400',
    darkGradient: 'dark:from-green-950/20',
  },
  purple: {
    border: 'border-purple-500',
    iconBg: 'bg-purple-100 dark:bg-purple-900/40',
    iconText: 'text-purple-600 dark:text-purple-400',
    darkGradient: 'dark:from-purple-950/20',
  },
  rose: {
    border: 'border-rose-500',
    iconBg: 'bg-rose-100 dark:bg-rose-900/40',
    iconText: 'text-rose-600 dark:text-rose-400',
    darkGradient: 'dark:from-rose-950/20',
  },
};

export function StatCard({ icon: Icon, label, value, description, isLoading, color, suffix }: StatCardProps) {
  const colors = colorMap[color];
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
      className={`rounded-lg border-t-3 ${colors.border} bg-white p-6 shadow-md hover:shadow-lg transition-shadow ring-1 ring-zinc-950/5 dark:bg-gradient-to-b ${colors.darkGradient} dark:to-zinc-900 dark:ring-white/10`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.iconBg}`}>
          <Icon className={`h-5 w-5 ${colors.iconText}`} />
        </div>
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </h3>
      </div>
      <p className="text-3xl font-semibold text-zinc-950 dark:text-white">
        {isLoading ? '...' : <><AnimatedNumber value={value} />{suffix}</>}
      </p>
      <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {description}
      </Text>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create PeriodSelector component**

Create `src/views/analytics/PeriodSelector.tsx`:
```tsx
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
```

- [ ] **Step 3: Create EmptyState component**

Create `src/views/analytics/EmptyState.tsx`:
```tsx
import { ChartBarIcon } from '../../components/icons';
import { Text } from '../../components/catalyst/text';
import { Button } from '../../components/catalyst/button';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 mb-4">
        <ChartBarIcon className="h-6 w-6 text-zinc-400 dark:text-zinc-500" />
      </div>
      <h3 className="text-sm font-medium text-zinc-950 dark:text-white">{title}</h3>
      <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">{message}</Text>
      {actionLabel && onAction && (
        <Button className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/views/analytics/StatCard.tsx src/views/analytics/PeriodSelector.tsx src/views/analytics/EmptyState.tsx
git commit -m "feat(analytics): add StatCard, PeriodSelector, and EmptyState components"
```

---

## Task 5: Create AnalyticsView Scaffold with Stat Cards

**Files:**
- Create: `src/views/AnalyticsView.tsx`
- Modify: `src/components/ViewRouter.tsx`
- Modify: `src/components/ApplicationLayout.tsx`
- Create: `src/views/AnalyticsView.test.tsx`

- [ ] **Step 1: Write the test file**

Create `src/views/AnalyticsView.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { AnalyticsView } from './AnalyticsView';
import { renderWithI18n } from '../tests/utils/testHelpers';
import { NavigationProvider } from '../hooks/useNavigation';

vi.mock('@tauri-apps/plugin-sql', () => {
  const mockSelect = vi.fn(() => Promise.resolve([{ count: 0 }]));
  return {
    default: {
      load: vi.fn(() =>
        Promise.resolve({
          select: mockSelect,
        })
      ),
    },
  };
});

describe('AnalyticsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the analytics view with heading', async () => {
    renderWithI18n(
      <NavigationProvider>
        <AnalyticsView />
      </NavigationProvider>
    );

    await waitFor(
      () => {
        const headings = screen.getAllByRole('heading');
        expect(headings.length).toBeGreaterThan(0);
      },
      { timeout: 500 }
    );
  });

  it('displays loading state initially', () => {
    renderWithI18n(
      <NavigationProvider>
        <AnalyticsView />
      </NavigationProvider>
    );

    expect(screen.getAllByText('...').length).toBeGreaterThan(0);
  });

  it('renders period selector buttons', () => {
    renderWithI18n(
      <NavigationProvider>
        <AnalyticsView />
      </NavigationProvider>
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('has stat cards in a grid', () => {
    const { container } = renderWithI18n(
      <NavigationProvider>
        <AnalyticsView />
      </NavigationProvider>
    );

    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/views/AnalyticsView.test.tsx`
Expected: FAIL — `AnalyticsView` module not found.

- [ ] **Step 3: Create AnalyticsView component**

Create `src/views/AnalyticsView.tsx`:
```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';

import { useAnalytics, type Period } from '../hooks/useAnalytics';
import { useNavigation } from '../hooks/useNavigation';
import { StatCard } from './analytics/StatCard';
import { PeriodSelector } from './analytics/PeriodSelector';
import { EmptyState } from './analytics/EmptyState';
import { DailyActivityChart } from './analytics/DailyActivityChart';
import { HourlyHeatmap } from './analytics/HourlyHeatmap';
import { WeeklyTrendChart } from './analytics/WeeklyTrendChart';
import { TaskStatusChart } from './analytics/TaskStatusChart';
import { PriorityBreakdownChart } from './analytics/PriorityBreakdownChart';
import { TokenUsageChart } from './analytics/TokenUsageChart';
import { DocumentIcon, ClockIcon, CheckCircleIcon, SparklesIcon, ChartBarIcon } from '../components/icons';

export function AnalyticsView() {
  const { t } = useTranslation(['analytics', 'common']);
  const { navigate } = useNavigation();
  const [period, setPeriod] = useState<Period>('7d');
  const { data, isLoading, error } = useAnalytics(period);

  const hasEntries = data.dailyActivity.length > 0;
  const hasTasks = data.taskStatusCounts.length > 0;
  const hasAiData = data.tokenUsage.length > 0 || data.aiStats.total > 0;

  const successRate = data.aiStats.total > 0
    ? Math.round((data.aiStats.successful / data.aiStats.total) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
            {t('analytics:title')}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t('analytics:subtitle')}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Stat Cards */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8"
        variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
        initial="hidden"
        animate="visible"
      >
        <StatCard
          icon={DocumentIcon}
          label={t('analytics:stats.entriesToday.label')}
          value={data.entriesToday}
          description={t('analytics:stats.entriesToday.description')}
          isLoading={isLoading}
          color="amber"
        />
        <StatCard
          icon={ClockIcon}
          label={t('analytics:stats.weeklyTotal.label')}
          value={data.weeklyTotal}
          description={t('analytics:stats.weeklyTotal.description')}
          isLoading={isLoading}
          color="blue"
        />
        <StatCard
          icon={ChartBarIcon}
          label={t('analytics:stats.currentStreak.label')}
          value={data.currentStreak}
          description={t('analytics:stats.currentStreak.description')}
          isLoading={isLoading}
          color="green"
          suffix={data.currentStreak === 1 ? ` ${t('analytics:stats.currentStreak.days_one', { count: data.currentStreak })}`.replace(/^\s*\d+\s*/, ' ') : ''}
        />
        <StatCard
          icon={CheckCircleIcon}
          label={t('analytics:stats.tasksCompleted.label')}
          value={data.tasksCompleted}
          description={t('analytics:stats.tasksCompleted.description')}
          isLoading={isLoading}
          color="purple"
        />
        <StatCard
          icon={SparklesIcon}
          label={t('analytics:stats.aiSummaries.label')}
          value={data.aiSummariesCount}
          description={t('analytics:stats.aiSummaries.description')}
          isLoading={isLoading}
          color="rose"
        />
      </motion.div>

      {/* Daily Activity Chart (full width) */}
      <div className="mb-8">
        {hasEntries ? (
          <DailyActivityChart data={data.dailyActivity} isLoading={isLoading} />
        ) : (
          <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
            <EmptyState
              title={t('analytics:empty.noEntries.title')}
              message={t('analytics:empty.noEntries.message')}
              actionLabel={t('analytics:empty.noEntries.action')}
              onAction={() => navigate('work-log')}
            />
          </div>
        )}
      </div>

      {/* Two-column row: Heatmap + Task Status */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-8">
        <div>
          {hasEntries ? (
            <HourlyHeatmap data={data.hourlyHeatmap} isLoading={isLoading} />
          ) : (
            <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
              <EmptyState
                title={t('analytics:empty.noEntries.title')}
                message={t('analytics:empty.noEntries.message')}
              />
            </div>
          )}
        </div>
        <div>
          {hasTasks ? (
            <TaskStatusChart data={data.taskStatusCounts} isLoading={isLoading} />
          ) : (
            <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
              <EmptyState
                title={t('analytics:empty.noTasks.title')}
                message={t('analytics:empty.noTasks.message')}
                actionLabel={t('analytics:empty.noTasks.action')}
                onAction={() => navigate('sprint-board')}
              />
            </div>
          )}
        </div>
      </div>

      {/* Two-column row: Weekly Trend + Priority Breakdown */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-8">
        <div>
          {hasEntries ? (
            <WeeklyTrendChart data={data.weeklyTrend} isLoading={isLoading} />
          ) : (
            <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
              <EmptyState
                title={t('analytics:empty.noEntries.title')}
                message={t('analytics:empty.noEntries.message')}
              />
            </div>
          )}
        </div>
        <div>
          {hasTasks ? (
            <PriorityBreakdownChart data={data.priorityBreakdown} isLoading={isLoading} />
          ) : (
            <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
              <EmptyState
                title={t('analytics:empty.noTasks.title')}
                message={t('analytics:empty.noTasks.message')}
              />
            </div>
          )}
        </div>
      </div>

      {/* AI Usage Section */}
      <div className="mb-8">
        {hasAiData ? (
          <>
            <TokenUsageChart data={data.tokenUsage} isLoading={isLoading} />
            <motion.div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-4"
              variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
              initial="hidden"
              animate="visible"
            >
              <StatCard
                icon={SparklesIcon}
                label={t('analytics:stats.successRate.label')}
                value={successRate}
                description={t('analytics:stats.successRate.description')}
                isLoading={isLoading}
                color="green"
                suffix="%"
              />
              <StatCard
                icon={ClockIcon}
                label={t('analytics:stats.avgResponseTime.label')}
                value={data.aiStats.avgDuration}
                description={t('analytics:stats.avgResponseTime.description')}
                isLoading={isLoading}
                color="blue"
                suffix="ms"
              />
            </motion.div>
          </>
        ) : (
          <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
            <EmptyState
              title={t('analytics:empty.noAiData.title')}
              message={t('analytics:empty.noAiData.message')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

Note: This references chart components that don't exist yet. They will be created in Tasks 6-11. For this step, create placeholder chart components so the view compiles.

- [ ] **Step 4: Create placeholder chart components**

These are temporary stubs so the view compiles. Each will be replaced with the real implementation in subsequent tasks.

Create `src/views/analytics/DailyActivityChart.tsx`:
```tsx
interface DailyActivityChartProps {
  data: Array<{ date: string; source: string; count: number }>;
  isLoading: boolean;
}

export function DailyActivityChart({ data: _data, isLoading: _isLoading }: DailyActivityChartProps) {
  return <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
    <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">Daily Activity</h3>
    <div className="h-64" />
  </div>;
}
```

Create `src/views/analytics/HourlyHeatmap.tsx`:
```tsx
interface HourlyHeatmapProps {
  data: Array<{ day_of_week: number; hour: number; count: number }>;
  isLoading: boolean;
}

export function HourlyHeatmap({ data: _data, isLoading: _isLoading }: HourlyHeatmapProps) {
  return <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
    <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">Hourly Activity</h3>
    <div className="h-64" />
  </div>;
}
```

Create `src/views/analytics/WeeklyTrendChart.tsx`:
```tsx
interface WeeklyTrendChartProps {
  data: Array<{ week: string; count: number }>;
  isLoading: boolean;
}

export function WeeklyTrendChart({ data: _data, isLoading: _isLoading }: WeeklyTrendChartProps) {
  return <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
    <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">Weekly Trend</h3>
    <div className="h-64" />
  </div>;
}
```

Create `src/views/analytics/TaskStatusChart.tsx`:
```tsx
interface TaskStatusChartProps {
  data: Array<{ status: string; count: number }>;
  isLoading: boolean;
}

export function TaskStatusChart({ data: _data, isLoading: _isLoading }: TaskStatusChartProps) {
  return <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
    <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">Task Status</h3>
    <div className="h-64" />
  </div>;
}
```

Create `src/views/analytics/PriorityBreakdownChart.tsx`:
```tsx
interface PriorityBreakdownChartProps {
  data: Array<{ priority: string; status: string; count: number }>;
  isLoading: boolean;
}

export function PriorityBreakdownChart({ data: _data, isLoading: _isLoading }: PriorityBreakdownChartProps) {
  return <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
    <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">Priority Breakdown</h3>
    <div className="h-64" />
  </div>;
}
```

Create `src/views/analytics/TokenUsageChart.tsx`:
```tsx
interface TokenUsageChartProps {
  data: Array<{ date: string; tokens: number }>;
  isLoading: boolean;
}

export function TokenUsageChart({ data: _data, isLoading: _isLoading }: TokenUsageChartProps) {
  return <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
    <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">Token Usage</h3>
    <div className="h-64" />
  </div>;
}
```

- [ ] **Step 5: Wire AnalyticsView into ViewRouter**

In `src/components/ViewRouter.tsx`, add the import at the top with the other view imports:
```tsx
import { AnalyticsView } from '../views/AnalyticsView';
```

Add to the `views` object, after `'sprint-board'`:
```tsx
'analytics': <AnalyticsView />,
```

- [ ] **Step 6: Add Analytics sidebar item in ApplicationLayout**

In `src/components/ApplicationLayout.tsx`, add the import for ChartBarIcon:
```tsx
import { ChartBarIcon } from './icons';
```

Add the sidebar item after the Sprint Board item and before the Export item:
```tsx
<SidebarItem
  onClick={(e) => { e.preventDefault(); navigate('analytics'); }}
  current={currentView === 'analytics'}
>
  <ChartBarIcon />
  <SidebarLabel>{t('navigation.analytics')}</SidebarLabel>
</SidebarItem>
```

- [ ] **Step 7: Run tests**

Run: `npm run test:run -- src/views/AnalyticsView.test.tsx`
Expected: all 4 tests PASS.

Run: `npm run test:run -- src/components/ViewRouter.test.tsx`
Expected: PASS (existing tests still pass).

Run: `npm run test:run -- src/components/ApplicationLayout.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/AnalyticsView.tsx src/views/AnalyticsView.test.tsx src/views/analytics/ src/components/ViewRouter.tsx src/components/ApplicationLayout.tsx
git commit -m "feat(analytics): add AnalyticsView with stat cards and navigation wiring"
```

---

## Task 6: Implement Daily Activity Bar Chart

**Files:**
- Modify: `src/views/analytics/DailyActivityChart.tsx`

- [ ] **Step 1: Replace placeholder with full implementation**

Replace the contents of `src/views/analytics/DailyActivityChart.tsx` with:
```tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DailyActivityChartProps {
  data: Array<{ date: string; source: string; count: number }>;
  isLoading: boolean;
}

export function DailyActivityChart({ data, isLoading }: DailyActivityChartProps) {
  const { t } = useTranslation('analytics');

  const chartData = useMemo(() => {
    const byDate: Record<string, { date: string; manual: number; auto: number }> = {};
    for (const row of data) {
      if (!byDate[row.date]) {
        byDate[row.date] = { date: row.date, manual: 0, auto: 0 };
      }
      if (row.source === 'manual') {
        byDate[row.date].manual = row.count;
      } else {
        byDate[row.date].auto = row.count;
      }
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const formatDate = (date: string) => {
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.dailyActivity.title')}
      </h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              className="text-xs fill-zinc-500"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
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
            />
            <Legend />
            <Bar
              dataKey="manual"
              name={t('charts.dailyActivity.manual')}
              fill="#f59e0b"
              stackId="entries"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="auto"
              name={t('charts.dailyActivity.auto')}
              fill="#3b82f6"
              stackId="entries"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the app still compiles**

Run: `npm run test:run -- src/views/AnalyticsView.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/analytics/DailyActivityChart.tsx
git commit -m "feat(analytics): implement daily activity stacked bar chart"
```

---

## Task 7: Implement Hourly Heatmap

**Files:**
- Modify: `src/views/analytics/HourlyHeatmap.tsx`

- [ ] **Step 1: Replace placeholder with full implementation**

Replace the contents of `src/views/analytics/HourlyHeatmap.tsx` with:
```tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface HourlyHeatmapProps {
  data: Array<{ day_of_week: number; hour: number; count: number }>;
  isLoading: boolean;
}

export function HourlyHeatmap({ data, isLoading }: HourlyHeatmapProps) {
  const { t } = useTranslation('analytics');
  const days: string[] = t('charts.hourlyHeatmap.days', { returnObjects: true });

  const { grid, maxCount } = useMemo(() => {
    // 7 days x 24 hours
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
            {/* Hour labels */}
            <div className="flex ml-10 mb-1">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[10px] text-zinc-400">
                  {h % 3 === 0 ? `${h}` : ''}
                </div>
              ))}
            </div>
            {/* Grid rows */}
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
```

- [ ] **Step 2: Verify tests pass**

Run: `npm run test:run -- src/views/AnalyticsView.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/analytics/HourlyHeatmap.tsx
git commit -m "feat(analytics): implement hourly activity heatmap"
```

---

## Task 8: Implement Weekly Trend Line Chart

**Files:**
- Modify: `src/views/analytics/WeeklyTrendChart.tsx`

- [ ] **Step 1: Replace placeholder with full implementation**

Replace the contents of `src/views/analytics/WeeklyTrendChart.tsx` with:
```tsx
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface WeeklyTrendChartProps {
  data: Array<{ week: string; count: number }>;
  isLoading: boolean;
}

export function WeeklyTrendChart({ data, isLoading }: WeeklyTrendChartProps) {
  const { t } = useTranslation('analytics');

  const formatWeek = (week: string) => {
    // week is "YYYY-WW" format, display as "W{number}"
    const parts = week.split('-');
    return `W${parts[1]}`;
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.weeklyTrend.title')}
      </h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              dataKey="week"
              tickFormatter={formatWeek}
              className="text-xs fill-zinc-500"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
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
              labelFormatter={formatWeek}
            />
            <Line
              type="monotone"
              dataKey="count"
              name={t('charts.weeklyTrend.entries')}
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ r: 4, fill: '#8b5cf6' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify tests pass**

Run: `npm run test:run -- src/views/AnalyticsView.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/analytics/WeeklyTrendChart.tsx
git commit -m "feat(analytics): implement weekly trend line chart"
```

---

## Task 9: Implement Task Status Donut Chart

**Files:**
- Modify: `src/views/analytics/TaskStatusChart.tsx`

- [ ] **Step 1: Replace placeholder with full implementation**

Replace the contents of `src/views/analytics/TaskStatusChart.tsx` with:
```tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

interface TaskStatusChartProps {
  data: Array<{ status: string; count: number }>;
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  'todo': '#94a3b8',       // slate-400
  'in-progress': '#3b82f6', // blue-500
  'done': '#22c55e',        // green-500
  'blocked': '#ef4444',     // red-500
};

export function TaskStatusChart({ data, isLoading }: TaskStatusChartProps) {
  const { t } = useTranslation('analytics');

  const chartData = useMemo(() => {
    return data.map((row) => ({
      name: t(`charts.taskStatus.statuses.${row.status}`),
      value: row.count,
      color: STATUS_COLORS[row.status] || '#94a3b8',
    }));
  }, [data, t]);

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.taskStatus.title')}
      </h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-zinc-900, #18181b)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify tests pass**

Run: `npm run test:run -- src/views/AnalyticsView.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/analytics/TaskStatusChart.tsx
git commit -m "feat(analytics): implement task status donut chart"
```

---

## Task 10: Implement Priority Breakdown Horizontal Bar Chart

**Files:**
- Modify: `src/views/analytics/PriorityBreakdownChart.tsx`

- [ ] **Step 1: Replace placeholder with full implementation**

Replace the contents of `src/views/analytics/PriorityBreakdownChart.tsx` with:
```tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface PriorityBreakdownChartProps {
  data: Array<{ priority: string; status: string; count: number }>;
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  'todo': '#94a3b8',
  'in-progress': '#3b82f6',
  'done': '#22c55e',
  'blocked': '#ef4444',
};

const PRIORITY_ORDER = ['high', 'medium', 'low'];

export function PriorityBreakdownChart({ data, isLoading }: PriorityBreakdownChartProps) {
  const { t } = useTranslation('analytics');

  const { chartData, statuses } = useMemo(() => {
    const byPriority: Record<string, Record<string, number>> = {};
    const statusSet = new Set<string>();

    for (const row of data) {
      if (!byPriority[row.priority]) byPriority[row.priority] = {};
      byPriority[row.priority][row.status] = row.count;
      statusSet.add(row.status);
    }

    const sorted = PRIORITY_ORDER
      .filter((p) => byPriority[p])
      .map((priority) => ({
        priority: t(`charts.priorityBreakdown.priorities.${priority}`),
        ...byPriority[priority],
      }));

    return { chartData: sorted, statuses: Array.from(statusSet) };
  }, [data, t]);

  return (
    <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
        {t('charts.priorityBreakdown.title')}
      </h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              type="number"
              allowDecimals={false}
              className="text-xs fill-zinc-500"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="priority"
              className="text-xs fill-zinc-500"
              tick={{ fontSize: 12 }}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-zinc-900, #18181b)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend />
            {statuses.map((status) => (
              <Bar
                key={status}
                dataKey={status}
                name={t(`charts.taskStatus.statuses.${status}`)}
                fill={STATUS_COLORS[status] || '#94a3b8'}
                stackId="priority"
                radius={[0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify tests pass**

Run: `npm run test:run -- src/views/AnalyticsView.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/analytics/PriorityBreakdownChart.tsx
git commit -m "feat(analytics): implement priority breakdown horizontal bar chart"
```

---

## Task 11: Implement Token Usage Area Chart

**Files:**
- Modify: `src/views/analytics/TokenUsageChart.tsx`

- [ ] **Step 1: Replace placeholder with full implementation**

Replace the contents of `src/views/analytics/TokenUsageChart.tsx` with:
```tsx
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
```

- [ ] **Step 2: Verify tests pass**

Run: `npm run test:run -- src/views/AnalyticsView.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/analytics/TokenUsageChart.tsx
git commit -m "feat(analytics): implement token usage area chart"
```

---

## Task 12: Run Full Test Suite and Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npm run test:run`
Expected: all tests PASS, no regressions.

- [ ] **Step 2: Run the app in dev mode for visual verification**

Run: `npm run tauri dev`

Verify:
- Analytics appears in the sidebar between Sprint Board and Export
- Clicking it navigates to the Analytics view
- Period selector toggles between 7d / 30d / All
- Stat cards show animated numbers (or "..." while loading)
- Charts render with real data or show empty states
- Dark mode works (toggle in settings)
- Responsive layout stacks on narrow window

- [ ] **Step 3: Final commit if any adjustments needed**

If any dark mode or responsive fixes were needed, commit them:
```bash
git add -A
git commit -m "fix(analytics): dark mode and responsive layout adjustments"
```

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|---|---|
| Entries Today stat card | Task 5 (AnalyticsView) |
| Weekly Total stat card | Task 5 |
| Current Streak stat card | Task 5 + Task 3 (streak calculation in hook) |
| AI Summaries Generated stat card | Task 5 |
| Tasks Completed stat card | Task 5 |
| Daily Activity bar chart (stacked manual/auto) | Task 6 |
| Hourly Heatmap (7x24 grid) | Task 7 |
| Weekly Trend line chart | Task 8 |
| Task Status Distribution donut chart | Task 9 |
| Priority Breakdown horizontal bar | Task 10 |
| Token Usage area chart | Task 11 |
| AI Success Rate stat card | Task 5 (AI usage section) |
| Average Response Time stat card | Task 5 (AI usage section) |
| Period selector (7d / 30d / all) | Task 4 (PeriodSelector) |
| Empty states with navigation links | Task 4 (EmptyState) + Task 5 |
| i18n (EN + NL) | Task 2 |
| Navigation integration (sidebar, router, view type) | Task 1 + Task 5 |
| Recharts dependency | Task 1 |
| useAnalytics hook with parallel queries | Task 3 |
| Dark mode support | All chart tasks use dark: variants |
| Responsive layout | Task 5 (grid-cols-1 lg:grid-cols-2) |
| Animated stat card entrance | Task 4 (StatCard with motion variants) + Task 5 |
| Tests for hook and view | Task 3 + Task 5 |

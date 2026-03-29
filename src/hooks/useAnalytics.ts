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

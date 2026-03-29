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

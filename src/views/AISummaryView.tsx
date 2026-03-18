import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { invoke } from "@tauri-apps/api/core";
import { getDb } from '../hooks/useDatabase';
import { Button } from '../components/catalyst/button';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';

interface AISummary {
  date: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

interface SummaryItem {
  label: string;
  summary: string;
}

function parseSummary(raw: string): SummaryItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SummaryItem[];
  } catch {
    // Legacy plain-text — wrap as single unlabeled item
    return [{ label: '', summary: raw }];
  }
  return [{ label: '', summary: raw }];
}

export function AISummaryView() {
  const { t, i18n } = useTranslation(['aiSummary', 'common']);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [summary, setSummary] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [summaryExists, setSummaryExists] = useState<boolean>(false);

  const loadSummary = async () => {
    try {
      const database = await getDb();
      const result = await database.select<AISummary[]>(
        "SELECT date, summary, created_at, updated_at FROM ai_summaries WHERE date = ?",
        [selectedDate]
      );

      if (result.length > 0) {
        setSummary(result[0].summary);
        setSummaryExists(true);
      } else {
        setSummary('');
        setSummaryExists(false);
      }
      setError(null);
    } catch (err) {
      console.error('Failed to load summary:', err);
      setSummary('');
      setSummaryExists(false);
    }
  };

  // Load existing summary when component mounts or date changes
  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const saveSummary = async (summaryText: string) => {
    try {
      const database = await getDb();
      const now = new Date().toISOString();

      // Use INSERT OR REPLACE to either insert new or update existing
      await database.execute(
        "INSERT OR REPLACE INTO ai_summaries (date, summary, created_at, updated_at) VALUES (?, ?, COALESCE((SELECT created_at FROM ai_summaries WHERE date = ?), ?), ?)",
        [selectedDate, summaryText, selectedDate, now, now]
      );

      setSummaryExists(true);
    } catch (err) {
      console.error('Failed to save summary:', err);
      setError(t('aiSummary:errors.saveFailed'));
    }
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setSummary('');
    setCopySuccess(false);

    try {
      const database = await getDb();

      // Fetch manual entries with linked task info
      const manualEntries = await database.select<Array<{ description: string; timestamp: string; task_id: number | null; task_title: string | null }>>(
        `SELECT we.description, we.timestamp, wl.task_id, st.title as task_title
         FROM work_entries we
         LEFT JOIN sprint_task_work_links wl ON wl.entry_source = 'manual' AND wl.entry_id = we.id
         LEFT JOIN sprint_tasks st ON st.id = wl.task_id
         WHERE DATE(we.timestamp) = ?
         ORDER BY we.timestamp ASC`,
        [selectedDate]
      );

      // Fetch auto entries with linked task info
      const autoEntries = await database.select<Array<{ description: string; timestamp: string; task_id: number | null; task_title: string | null }>>(
        `SELECT awe.description, awe.timestamp, wl.task_id, st.title as task_title
         FROM auto_work_entries awe
         LEFT JOIN sprint_task_work_links wl ON wl.entry_source = 'auto' AND wl.entry_id = awe.id
         LEFT JOIN sprint_tasks st ON st.id = wl.task_id
         WHERE DATE(awe.timestamp) = ?
         ORDER BY awe.timestamp ASC`,
        [selectedDate]
      );

      const allEntries = [...manualEntries, ...autoEntries].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      if (allEntries.length === 0) {
        setError(t('aiSummary:errors.noEntries', { date: formatDate(selectedDate) }));
        setIsLoading(false);
        return;
      }

      if (allEntries.length < 2) {
        setError(t('aiSummary:errors.minEntries', {
          count: allEntries.length,
          date: formatDate(selectedDate)
        }));
        setIsLoading(false);
        return;
      }

      // Group by task_id
      const groupMap = new Map<string, { taskTitle: string | null; entries: [string, string][] }>();
      for (const entry of allEntries) {
        const key = entry.task_id != null ? String(entry.task_id) : '__ungrouped__';
        if (!groupMap.has(key)) {
          groupMap.set(key, { taskTitle: entry.task_title ?? null, entries: [] });
        }
        groupMap.get(key)!.entries.push([entry.description, entry.timestamp]);
      }

      const groups: [string | null, [string, string][]][] = Array.from(groupMap.values()).map(
        (g) => [g.taskTitle, g.entries]
      );

      const generatedSummary = await invoke<string>('generate_grouped_daily_summary', {
        groups,
        date: selectedDate,
        language: i18n.language,
      });

      setSummary(generatedSummary);
      await saveSummary(generatedSummary);
    } catch (err) {
      console.error('Failed to generate summary:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      const items = parseSummary(summary);
      const text = items.map(item => item.label ? `${item.label}\n${item.summary}` : item.summary).join('\n\n');
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      setError(t('aiSummary:errors.copyFailed'));
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
    setError(null);
    setCopySuccess(false);
  };

  const setToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setError(null);
    setCopySuccess(false);
  };

  const setYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setSelectedDate(yesterday.toISOString().split('T')[0]);
    setError(null);
    setCopySuccess(false);
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(i18n.language, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden w-full">
      <div className="flex-shrink-0 w-full">
        <Heading>{t('aiSummary:title')}</Heading>
        <Text className="mt-2 mb-6">
          {t('aiSummary:subtitle')}
        </Text>

        {/* Date Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-950 dark:text-white mb-2">
            {t('aiSummary:dateSelection.label')}
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              max={new Date().toISOString().split('T')[0]}
              className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button onClick={setToday} plain>
              {t('common:dateActions.today')}
            </Button>
            <Button onClick={setYesterday} plain>
              {t('common:dateActions.yesterday')}
            </Button>
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isLoading}
          color="blue"
          className="mb-6"
        >
          {isLoading
            ? t('aiSummary:actions.generating')
            : (summaryExists ? t('aiSummary:actions.overwrite') : t('aiSummary:actions.generate'))}
        </Button>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900">
            <p className="text-sm font-semibold text-red-900 dark:text-red-200">{t('common:status.error')}</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="mb-4 p-4 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {t('aiSummary:loadingMessage')}
            </p>
          </div>
        )}
      </div>

      {/* Summary Display */}
      {summary && (
        <div className="flex-1 flex flex-col min-h-0 w-full mt-4">
          <div className="flex items-center justify-between mb-3">
            <Heading level={2}>
              {t('aiSummary:summaryTitle', { date: formatDate(selectedDate) })}
            </Heading>
            <Button
              onClick={handleCopy}
              color={copySuccess ? "green" : "zinc"}
            >
              {copySuccess ? t('common:actions.copied') : t('common:actions.copy')}
            </Button>
          </div>

          <div className="flex-1 scrollable">
            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="flex flex-col gap-3">
                {parseSummary(summary).map((item, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    {item.label && (
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{item.label}</span>
                    )}
                    <p className="text-sm text-zinc-950 dark:text-white leading-relaxed">{item.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!summary && !isLoading && !error && (
        <div className="flex-1 flex items-center justify-center">
          <Text className="text-zinc-500 dark:text-zinc-400 italic">
            {t('aiSummary:emptyState')}
          </Text>
        </div>
      )}
    </div>
  );
}

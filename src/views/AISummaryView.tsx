import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { Button } from '../components/catalyst/button';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';

let db: Database | null = null;

async function getDatabase() {
  return db ?? await Database.load("sqlite:workrecall.db");
}

interface AISummary {
  date: string;
  summary: string;
  created_at: string;
  updated_at: string;
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
      console.log('Loading summary for date:', selectedDate);
      const database = await getDatabase();
      const result = await database.select<AISummary[]>(
        "SELECT date, summary, created_at, updated_at FROM ai_summaries WHERE date = ?",
        [selectedDate]
      );

      console.log('Summary query result:', result);

      if (result.length > 0) {
        console.log('Summary found, setting state');
        setSummary(result[0].summary);
        setSummaryExists(true);
      } else {
        console.log('No summary found for this date');
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
      console.log('Saving summary for date:', selectedDate);
      const database = await getDatabase();
      const now = new Date().toISOString();

      // Use INSERT OR REPLACE to either insert new or update existing
      await database.execute(
        "INSERT OR REPLACE INTO ai_summaries (date, summary, created_at, updated_at) VALUES (?, ?, COALESCE((SELECT created_at FROM ai_summaries WHERE date = ?), ?), ?)",
        [selectedDate, summaryText, selectedDate, now, now]
      );

      console.log('Summary saved successfully');
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
      console.log('Fetching work entries for:', selectedDate);

      // Fetch work entries for the selected date from database
      const database = await getDatabase();

      // Fetch manual entries
      const manualEntries = await database.select<Array<{ description: string; timestamp: string }>>(
        "SELECT description, timestamp FROM work_entries WHERE DATE(timestamp) = ? ORDER BY timestamp ASC",
        [selectedDate]
      );

      // Fetch auto-generated entries
      const autoEntries = await database.select<Array<{ description: string; timestamp: string }>>(
        "SELECT description, timestamp FROM auto_work_entries WHERE DATE(timestamp) = ? ORDER BY timestamp ASC",
        [selectedDate]
      );

      // Combine both types of entries and sort by timestamp
      const entries = [...manualEntries, ...autoEntries].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      console.log('Found entries:', entries.length, '(manual:', manualEntries.length, ', auto:', autoEntries.length, ')');

      if (entries.length === 0) {
        setError(t('aiSummary:errors.noEntries', { date: formatDate(selectedDate) }));
        setIsLoading(false);
        return;
      }

      if (entries.length < 2) {
        setError(t('aiSummary:errors.minEntries', {
          count: entries.length,
          date: formatDate(selectedDate)
        }));
        setIsLoading(false);
        return;
      }

      // Convert entries to format expected by backend: Vec<(String, String)>
      const entryTuples: [string, string][] = entries.map(entry => [
        entry.description,
        entry.timestamp
      ]);

      console.log('Calling generate_daily_summary...');

      // Call Tauri command to generate summary
      const generatedSummary = await invoke<string>('generate_daily_summary', {
        entries: entryTuples,
        date: selectedDate
      });

      console.log('Summary generated successfully');
      setSummary(generatedSummary);

      // Save summary to database
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
      await navigator.clipboard.writeText(summary);
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
              <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-950 dark:text-white">
                {summary}
              </pre>
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

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { Button } from '../components/catalyst/button';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';

let db: Database | null = null;

async function getDatabase() {
  return db ?? await Database.load("sqlite:workrecall.db");
}

export function AISummaryView() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [summary, setSummary] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setSummary('');
    setCopySuccess(false);

    try {
      console.log('Fetching work entries for:', selectedDate);

      // Fetch work entries for the selected date from database
      const database = await getDatabase();
      const entries = await database.select<Array<{ description: string; timestamp: string }>>(
        "SELECT description, timestamp FROM work_entries WHERE DATE(timestamp) = ? ORDER BY timestamp ASC",
        [selectedDate]
      );

      console.log('Found entries:', entries.length);

      if (entries.length === 0) {
        setError(`No work entries found for ${formatDate(selectedDate)}.`);
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
      setError('Failed to copy to clipboard');
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
    setSummary(''); // Clear summary when date changes
    setError(null);
  };

  const setToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setSummary('');
    setError(null);
  };

  const setYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setSelectedDate(yesterday.toISOString().split('T')[0]);
    setSummary('');
    setError(null);
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden w-full">
      <div className="flex-shrink-0 w-full">
        <Heading>AI Daily Summary</Heading>
        <Text className="mt-2 mb-6">
          Generate a professional summary of your work for any day using AI.
        </Text>

        {/* Date Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-950 dark:text-white mb-2">
            Select Date
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
              Today
            </Button>
            <Button onClick={setYesterday} plain>
              Yesterday
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
          {isLoading ? 'Generating Summary...' : 'Generate Summary'}
        </Button>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900">
            <p className="text-sm font-semibold text-red-900 dark:text-red-200">Error</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="mb-4 p-4 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              This may take a few seconds...
            </p>
          </div>
        )}
      </div>

      {/* Summary Display */}
      {summary && (
        <div className="flex-1 flex flex-col min-h-0 w-full mt-4">
          <div className="flex items-center justify-between mb-3">
            <Heading level={2}>
              Summary for {formatDate(selectedDate)}
            </Heading>
            <Button
              onClick={handleCopy}
              color={copySuccess ? "green" : "zinc"}
            >
              {copySuccess ? 'Copied!' : 'Copy to Clipboard'}
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
            Select a date and click "Generate Summary" to create your AI-powered work summary.
          </Text>
        </div>
      )}
    </div>
  );
}

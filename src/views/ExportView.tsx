import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function ExportView() {
  const { t } = useTranslation(['export', 'common']);
  const [startDate, setStartDate] = useState(thirtyDaysAgoIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [loading, setLoading] = useState<'csv' | 'json' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  async function handleExport(format: 'csv' | 'json') {
    setError(null);
    setSavedPath(null);
    setLoading(format);
    try {
      const defaultFilename = `worktape-${startDate}-to-${endDate}.${format}`;
      const filePath = await save({
        defaultPath: defaultFilename,
        filters: format === 'csv'
          ? [{ name: 'CSV', extensions: ['csv'] }]
          : [{ name: 'JSON', extensions: ['json'] }],
      });

      if (!filePath) return; // user cancelled

      const content = await invoke<string>('export_work_entries', {
        startDate,
        endDate,
        format,
      });
      await invoke('write_export_file', { path: filePath, content });
      setSavedPath(filePath);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="h-full">
      <div className="flex items-center gap-3">
        <Heading>{t('export:title')}</Heading>
      </div>

      <Text className="mt-2 text-zinc-600 dark:text-zinc-400">
        {t('export:subtitle')}
      </Text>

      {/* Date range */}
      <div className="mt-8 space-y-4">
        <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
          {t('export:dateRange.title')}
        </h3>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            {t('export:dateRange.from')}
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => setStartDate(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            {t('export:dateRange.to')}
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayIso()}
              onChange={e => setEndDate(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
            />
          </label>
        </div>
      </div>

      {/* Export buttons */}
      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
          {t('export:options.title')}
        </h3>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => handleExport('csv')}
            disabled={loading !== null}
          >
            {loading === 'csv' ? t('export:exporting') : t('export:options.csv')}
          </Button>
          <Button
            onClick={() => handleExport('json')}
            disabled={loading !== null}
          >
            {loading === 'json' ? t('export:exporting') : t('export:options.json')}
          </Button>
          <div className="flex items-center gap-2 opacity-50">
            <Button disabled>{t('export:options.excel')}</Button>
            <Badge color="amber">{t('common:premium.badge')}</Badge>
          </div>
        </div>
      </div>

      {savedPath && (
        <p className="mt-4 text-sm text-green-700 dark:text-green-400">
          {t('export:savedTo')} <span className="font-mono break-all">{savedPath}</span>
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

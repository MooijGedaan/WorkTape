import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Divider } from '../components/catalyst/divider';
import { Field, Label, Description } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Button } from '../components/catalyst/button';
import { Switch } from '../components/catalyst/switch';
import { LanguageSelector } from '../components/LanguageSelector';

export function SettingsView() {
  const { t } = useTranslation(['settings', 'common']);
  const [promptInterval, setPromptInterval] = useState<number>(30);
  const [autoLoggingEnabled, setAutoLoggingEnabled] = useState<boolean>(false);
  const [screenshotsPerHour, setScreenshotsPerHour] = useState<number>(360);
  const [apiRequestsPerDay, setApiRequestsPerDay] = useState<number>(96);
  const [apiUsageToday, setApiUsageToday] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [autoCaptureSaveMessage, setAutoCaptureSaveMessage] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Poll debug stats when auto-logging is enabled
  useEffect(() => {
    if (!autoLoggingEnabled) return;

    const pollStats = async () => {
      try {
        const stats = await invoke('get_auto_log_debug_stats');
        console.log('[Auto-Logging] Debug Stats:', stats);
      } catch (error) {
        console.error('[Auto-Logging] Failed to get debug stats:', error);
      }
    };

    // Poll every 30 seconds
    const interval = setInterval(pollStats, 30000);

    // Initial poll
    pollStats();

    return () => clearInterval(interval);
  }, [autoLoggingEnabled]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const db = await Database.load('sqlite:workrecall.db');
      const result = await db.select<Array<{key: string, value: string}>>(
        "SELECT value FROM settings WHERE key = 'prompt_interval_minutes'"
      );

      if (result.length > 0) {
        setPromptInterval(parseInt(result[0].value));
      }

      // Load auto-logging status
      const status = await invoke<boolean>('get_auto_logging_status');
      setAutoLoggingEnabled(status);

      // Load auto-capture settings
      const [screenshots, apiRequests] = await invoke<[number, number]>('get_auto_capture_settings');
      setScreenshotsPerHour(screenshots);
      setApiRequestsPerDay(apiRequests);

      // Load API usage today
      const usage = await invoke<number>('get_api_usage_today');
      setApiUsageToday(usage);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      setSaveMessage(null);

      // Validate input
      if (promptInterval < 1 || promptInterval > 1440) {
        setSaveMessage(t('settings:promptFrequency.validationError'));
        return;
      }

      // Save to database
      const db = await Database.load('sqlite:workrecall.db');
      await db.execute(
        "UPDATE settings SET value = $1 WHERE key = 'prompt_interval_minutes'",
        [promptInterval.toString()]
      );

      // Update the timer interval in the background process
      await invoke('set_prompt_interval', { minutes: promptInterval });

      setSaveMessage(t('settings:promptFrequency.saveSuccess'));

      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveMessage(`Error: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const saveAutoCaptureSettings = async () => {
    try {
      setIsSaving(true);
      setAutoCaptureSaveMessage(null);

      // Validate input
      if (screenshotsPerHour < 1 || screenshotsPerHour > 3600) {
        setAutoCaptureSaveMessage('Screenshots per hour must be between 1 and 3600');
        return;
      }

      if (apiRequestsPerDay < 1 || apiRequestsPerDay > 1440) {
        setAutoCaptureSaveMessage('API requests per day must be between 1 and 1440');
        return;
      }

      // Save to database and update the service
      await invoke('update_auto_capture_settings', {
        screenshotsPerHour,
        apiRequestsPerDay
      });

      setAutoCaptureSaveMessage('Auto-capture settings saved successfully!');

      // Clear success message after 3 seconds
      setTimeout(() => setAutoCaptureSaveMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save auto-capture settings:', error);
      setAutoCaptureSaveMessage(`Error: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAutoLogging = async (enabled: boolean) => {
    try {
      console.log(`[Auto-Logging] ${enabled ? 'Enabling' : 'Disabling'} automatic work logging...`);

      if (enabled) {
        await invoke('start_auto_logging');
        console.log('[Auto-Logging] ✅ Automatic work logging ENABLED');
        console.log('[Auto-Logging] - Screenshots will be captured based on your settings');
        console.log('[Auto-Logging] - AI analysis will run based on your settings');
        console.log('[Auto-Logging] - Check the terminal/console for backend logs');
      } else {
        await invoke('stop_auto_logging');
        console.log('[Auto-Logging] ❌ Automatic work logging DISABLED');
      }

      setAutoLoggingEnabled(enabled);
    } catch (error) {
      console.error('[Auto-Logging] ❌ Failed to toggle auto-logging:', error);
      alert(`Error: ${error}`);
    }
  };

  return (
    <div className="max-w-2xl scrollable h-full">
      <Heading>{t('settings:title')}</Heading>
      <Text className="mt-2 text-zinc-600 dark:text-zinc-400">
        {t('settings:subtitle')}
      </Text>

      <Divider className="my-6" />

      <div className="space-y-6">
        <LanguageSelector />

        <div>
          <Field>
            <Label>{t('settings:promptFrequency.label')}</Label>
            <Description>
              {t('settings:promptFrequency.description')}
            </Description>
            <div className="flex gap-3 items-end mt-2">
              <div className="flex-1 max-w-xs">
                <Input
                  type="number"
                  min="1"
                  max="1440"
                  value={promptInterval}
                  onChange={(e) => setPromptInterval(parseInt(e.target.value) || 30)}
                  disabled={isLoading || isSaving}
                />
              </div>
              <Button
                onClick={saveSettings}
                disabled={isLoading || isSaving}
                color="blue"
              >
                {isSaving ? t('common:status.saving') : t('common:actions.save')}
              </Button>
            </div>
            {saveMessage && (
              <Text className={`mt-2 text-sm ${saveMessage.includes(t('common:status.error')) ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {saveMessage}
              </Text>
            )}
            <Text className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {t('settings:promptFrequency.recommendation')}
            </Text>
          </Field>
        </div>

        <Divider className="my-6" />

        <div>
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
            Automatic Work Logging
          </h3>
          <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Automatically capture and analyze your work activity using AI.
          </Text>

          <div className="mt-4 flex items-center gap-3">
            <Switch
              checked={autoLoggingEnabled}
              onChange={toggleAutoLogging}
              disabled={isLoading}
            />
            <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {autoLoggingEnabled ? 'Enabled' : 'Disabled'}
            </Text>
          </div>

          <div className="mt-6 space-y-4">
            <Field>
              <Label>Screenshots per hour</Label>
              <Description>
                How many times per hour to capture screenshots (when screen changes).
                Higher values = more granular tracking, but more storage needed.
              </Description>
              <div className="flex gap-3 items-end mt-2">
                <div className="flex-1 max-w-xs">
                  <Input
                    type="number"
                    min="1"
                    max="3600"
                    value={screenshotsPerHour}
                    onChange={(e) => setScreenshotsPerHour(parseInt(e.target.value) || 360)}
                    disabled={isLoading || isSaving}
                  />
                </div>
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  Every {Math.round(3600 / screenshotsPerHour)} seconds
                </Text>
              </div>
            </Field>

            <Field>
              <Label>AI analyses per day</Label>
              <Description>
                How many times per day to run AI analysis on captured screenshots.
                Each analysis consumes one OpenAI API request and creates a work log entry.
              </Description>
              <div className="flex gap-3 items-end mt-2">
                <div className="flex-1 max-w-xs">
                  <Input
                    type="number"
                    min="1"
                    max="1440"
                    value={apiRequestsPerDay}
                    onChange={(e) => setApiRequestsPerDay(parseInt(e.target.value) || 96)}
                    disabled={isLoading || isSaving}
                  />
                </div>
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  Every {Math.round(1440 / apiRequestsPerDay)} minutes
                </Text>
              </div>
              <Text className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                API usage today: {apiUsageToday} / {apiRequestsPerDay}
              </Text>
            </Field>

            <div className="flex gap-3">
              <Button
                onClick={saveAutoCaptureSettings}
                disabled={isLoading || isSaving}
                color="blue"
              >
                {isSaving ? 'Saving...' : 'Save Capture Settings'}
              </Button>
            </div>

            {autoCaptureSaveMessage && (
              <Text className={`text-sm ${autoCaptureSaveMessage.includes('Error') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {autoCaptureSaveMessage}
              </Text>
            )}
          </div>

          <div className="mt-4 rounded-lg bg-blue-50 p-4 text-sm dark:bg-blue-950/20">
            <p className="font-semibold text-blue-900 dark:text-blue-100">
              How it works:
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
              <li>Screenshots taken at your configured rate (only when screen changes)</li>
              <li>AI analyzes at your configured interval and creates work log entries</li>
              <li>Screenshots deleted after analysis (privacy-first)</li>
              <li>Automatically pauses when computer is idle (5+ minutes)</li>
            </ul>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            {t('settings:sections.notifications.title')}
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings:sections.notifications.comingSoon')}
          </Text>
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            {t('settings:sections.darkMode.title')}
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings:sections.darkMode.comingSoon')}
          </Text>
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            {t('settings:sections.database.title')}
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings:sections.database.comingSoon')}
          </Text>
        </div>
      </div>
    </div>
  );
}

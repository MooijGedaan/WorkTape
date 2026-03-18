import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import Database from '@tauri-apps/plugin-sql';
import { AnimatePresence, motion } from 'motion/react';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Divider } from '../components/catalyst/divider';
import { Field, Label, Description } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Button } from '../components/catalyst/button';
import { Switch } from '../components/catalyst/switch';
import { LanguageSelector } from '../components/LanguageSelector';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useNavigation } from '../hooks/useNavigation';
import { ChevronDownIcon } from '../components/icons';
import { ErrorNotification } from '../components/ErrorNotification';
import { useTooltipHints, type HintId } from '../hooks/useTooltipHints';
import { TooltipHint } from '../components/TooltipHint';
import { HINT_DEFINITIONS } from '../components/hints/hintDefinitions';

export function SettingsView() {
  const { t } = useTranslation(['settings', 'common']);
  const { theme, setTheme } = useTheme();
  const { showOnboarding } = useNavigation();
  const { isSeen, markSeen, isAllDisabled, disableAll, enableAll } = useTooltipHints();
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [launchOnStartup, setLaunchOnStartup] = useState<boolean>(false);
  const [promptInterval, setPromptInterval] = useState<number>(30);
  const [autoLoggingEnabled, setAutoLoggingEnabled] = useState<boolean>(false);
  const [screenshotsPerHour, setScreenshotsPerHour] = useState<number>(360);
  const [apiRequestsPerDay, setApiRequestsPerDay] = useState<number>(96);
  const [apiUsageToday, setApiUsageToday] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [autoCaptureSaveMessage, setAutoCaptureSaveMessage] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [debugLogsRetentionDays, setDebugLogsRetentionDays] = useState<number>(7);
  const [debugSaveMessage, setDebugSaveMessage] = useState<string | null>(null);
  const [isCleaningLogs, setIsCleaningLogs] = useState(false);
  const [isDayEnded, setIsDayEnded] = useState(false);
  const [isUnendingDay, setIsUnendingDay] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (isAllDisabled) return;
    const hints: HintId[] = ['settings-auto-capture'];
    const first = hints.find(h => !isSeen(h));
    if (!first) return;
    const timer = setTimeout(() => setActiveHint(first), 500);
    return () => clearTimeout(timer);
  }, []); // mount-only

  const handleHintDismiss = () => {
    if (activeHint) markSeen(activeHint);
    setActiveHint(null);
  };

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

      // Load launch on startup setting
      const autostartEnabled = await invoke<boolean>('get_autostart_enabled');
      setLaunchOnStartup(autostartEnabled);

      // Load debug mode settings
      const debugModeEnabled = await invoke<boolean>('get_debug_mode');
      setDebugMode(debugModeEnabled);

      const retentionDays = await invoke<number>('get_debug_logs_retention_days');
      setDebugLogsRetentionDays(retentionDays);

      // Check if today has been ended
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const dayEnded = await invoke<boolean>('is_day_ended', { date: todayStr });
      setIsDayEnded(dayEnded);
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

  const toggleLaunchOnStartup = async (enabled: boolean) => {
    try {
      await invoke('set_autostart_enabled', { enabled });
      setLaunchOnStartup(enabled);
    } catch (error) {
      console.error('Failed to toggle launch on startup:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
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
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleDebugMode = async (enabled: boolean) => {
    try {
      await invoke('set_debug_mode', { enabled });
      setDebugMode(enabled);
      console.log(`[Debug Mode] ${enabled ? 'Enabled' : 'Disabled'}`);
    } catch (error) {
      console.error('Failed to toggle debug mode:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const saveDebugSettings = async () => {
    try {
      setIsSaving(true);
      setDebugSaveMessage(null);

      if (debugLogsRetentionDays < 1 || debugLogsRetentionDays > 30) {
        setDebugSaveMessage('Retention days must be between 1 and 30');
        return;
      }

      await invoke('set_debug_logs_retention_days', { days: debugLogsRetentionDays });
      setDebugSaveMessage('Debug settings saved successfully!');

      setTimeout(() => setDebugSaveMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save debug settings:', error);
      setDebugSaveMessage(`Error: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const unendDay = async () => {
    try {
      setIsUnendingDay(true);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      await invoke('unend_day', { date: todayStr });
      await emit('day-unended', { date: todayStr });
      setIsDayEnded(false);
    } catch (error) {
      console.error('Failed to un-end day:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsUnendingDay(false);
    }
  };

  const cleanupOldDebugLogs = async () => {
    try {
      setIsCleaningLogs(true);
      const deletedCount = await invoke<number>('cleanup_old_debug_logs');
      setInfoMessage(`Cleaned up ${deletedCount} old debug log entries`);
    } catch (error) {
      console.error('Failed to cleanup debug logs:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCleaningLogs(false);
    }
  };

  const activeHintDef = activeHint ? HINT_DEFINITIONS[activeHint] : null;

  return (
    <>
    {activeHintDef && (
      <TooltipHint
        show={activeHint !== null}
        title={activeHintDef.title}
        body={activeHintDef.body}
        icon={activeHintDef.icon}
        accentColor={activeHintDef.accentColor}
        onDismiss={handleHintDismiss}
        onDisableAll={() => { disableAll(); setActiveHint(null); }}
      />
    )}
    <div className="scrollable h-full w-full">
      <ErrorNotification
        show={errorMessage !== null}
        message={errorMessage ?? ''}
        onClose={() => setErrorMessage(null)}
      />
      <ErrorNotification
        show={infoMessage !== null}
        message={infoMessage ?? ''}
        onClose={() => setInfoMessage(null)}
        variant="info"
      />
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
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            {t('settings:launchOnStartup.title')}
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings:launchOnStartup.description')}
          </Text>
          <div className="mt-3 flex items-center gap-3">
            <Switch
              checked={launchOnStartup}
              onChange={toggleLaunchOnStartup}
              disabled={isLoading}
            />
            <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {launchOnStartup ? t('settings:launchOnStartup.enabled') : t('settings:launchOnStartup.disabled')}
            </Text>
          </div>
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
            {t('settings:sections.darkMode.description')}
          </Text>
          <div className="mt-3 flex gap-2">
            {(['light', 'dark', 'system' ] as Theme[]).map((option) => (
              <button
                key={option}
                onClick={() => setTheme(option)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  theme === option
                    ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-400 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500'
                }`}
              >
                {t(`settings:sections.darkMode.options.${option}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            {t('settings:sections.database.title')}
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings:sections.database.comingSoon')}
          </Text>
        </div>

        <Divider className="my-6" />

        {/* Welcome Guide */}
        <div>
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            {t('settings:onboarding.title')}
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings:onboarding.description')}
          </Text>
          <Button onClick={showOnboarding} color="zinc" className="mt-3">
            {t('settings:onboarding.showButton')}
          </Button>
        </div>

        <Divider className="my-6" />

        {/* Feature tips */}
        <div>
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            Feature tips
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Small hints that surface when you visit a page for the first time.
          </Text>
          <Button
            onClick={isAllDisabled ? enableAll : disableAll}
            color="zinc"
            className="mt-3"
          >
            {isAllDisabled ? t('common:tooltipHints.enableAll') : t('common:tooltipHints.disableAll')}
          </Button>
        </div>

        <Divider className="my-6" />

        {/* Developer section (collapsible) */}
        <div>
          <button
            onClick={() => setDeveloperOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
                {t('settings:developer.title')}
              </h3>
              <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t('settings:developer.description')}
              </Text>
            </div>
            <ChevronDownIcon
              className={`h-5 w-5 text-zinc-500 transition-transform duration-200 ${developerOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {developerOpen && (
              <motion.div
                key="developer-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="mt-4 space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-zinc-950 dark:text-white">
                      Debug Mode
                    </h4>
                    <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Store full API requests (including screenshots) for debugging purposes.
                    </Text>
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch
                      checked={debugMode}
                      onChange={toggleDebugMode}
                      disabled={isLoading}
                    />
                    <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {debugMode ? 'Enabled' : 'Disabled'}
                    </Text>
                  </div>

                  {debugMode && (
                    <div className="rounded-lg bg-yellow-50 p-4 text-sm dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
                      <p className="font-semibold text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
                        <span>⚠️</span>
                        <span>Warning: Storage Impact</span>
                      </p>
                      <p className="mt-2 text-yellow-800 dark:text-yellow-200">
                        Debug mode stores full API requests including base64-encoded screenshots.
                        This will significantly increase database size (5-20MB per request with 10 screenshots).
                      </p>
                      <p className="mt-2 text-yellow-800 dark:text-yellow-200">
                        With {apiRequestsPerDay} requests per day, expect ~{Math.round(apiRequestsPerDay * 12 / 1024)} GB per day.
                        Old debug logs are automatically deleted after the retention period.
                      </p>
                    </div>
                  )}

                  <Field>
                    <Label>Debug logs retention period (days)</Label>
                    <Description>
                      Debug logs older than this will be automatically deleted daily to prevent database bloat.
                    </Description>
                    <div className="flex gap-3 items-end mt-2">
                      <div className="flex-1 max-w-xs">
                        <Input
                          type="number"
                          min="1"
                          max="30"
                          value={debugLogsRetentionDays}
                          onChange={(e) => setDebugLogsRetentionDays(parseInt(e.target.value) || 7)}
                          disabled={isLoading || isSaving}
                        />
                      </div>
                      <Button
                        onClick={saveDebugSettings}
                        disabled={isLoading || isSaving}
                        color="blue"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        onClick={cleanupOldDebugLogs}
                        disabled={isLoading || isCleaningLogs}
                        color="zinc"
                      >
                        {isCleaningLogs ? 'Cleaning...' : 'Cleanup Now'}
                      </Button>
                    </div>
                    {debugSaveMessage && (
                      <Text className={`mt-2 text-sm ${debugSaveMessage.includes('Error') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {debugSaveMessage}
                      </Text>
                    )}
                  </Field>

                  <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                    <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">Developer tools</h4>
                    <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      These actions are intended for development and testing only.
                    </Text>
                    <div className="mt-3 flex items-center gap-4">
                      <Button
                        onClick={unendDay}
                        disabled={!isDayEnded || isUnendingDay}
                        color="zinc"
                      >
                        {isUnendingDay ? 'Un-ending…' : 'Un-end today'}
                      </Button>
                      <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                        {isDayEnded ? 'Today is currently ended. Click to reopen it.' : 'Today is not ended.'}
                      </Text>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
    </>
  );
}

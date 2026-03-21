import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { AnimatePresence, motion } from 'motion/react';

import { Text } from '../components/catalyst/text';

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
import { getDb } from '../hooks/useDatabase';

export function SettingsView() {
  const { t } = useTranslation(['settings', 'common', 'hints']);
  const { theme, setTheme } = useTheme();
  const { showOnboarding } = useNavigation();
  const { markSeen, isAllDisabled, disableAll, enableAll } = useTooltipHints();
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [launchOnStartup, setLaunchOnStartup] = useState<boolean>(false);
  const [promptInterval, setPromptInterval] = useState<number>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
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

  const handleHintDismiss = () => {
    if (activeHint) markSeen(activeHint);
    setActiveHint(null);
  };

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const db = await getDb();
      const result = await db.select<Array<{key: string, value: string}>>(
        "SELECT value FROM settings WHERE key = 'prompt_interval_minutes'"
      );

      if (result.length > 0) {
        setPromptInterval(parseInt(result[0].value));
      }

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
      const db = await getDb();
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
      setSaveMessage(`${t('common:status.error')}: ${error}`);
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

  const toggleDebugMode = async (enabled: boolean) => {
    try {
      await invoke('set_debug_mode', { enabled });
      setDebugMode(enabled);
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
        setDebugSaveMessage(t('settings:debug.retentionValidation'));
        return;
      }

      await invoke('set_debug_logs_retention_days', { days: debugLogsRetentionDays });
      setDebugSaveMessage(t('settings:debug.saveSuccess'));

      setTimeout(() => setDebugSaveMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save debug settings:', error);
      setDebugSaveMessage(`${t('common:status.error')}: ${error}`);
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
      setInfoMessage(t('settings:debug.cleanupSuccess', { count: deletedCount }));
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
        title={t(`hints:${activeHint}.title` as any)}
        body={t(`hints:${activeHint}.body` as any)}
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
      <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent dark:from-amber-400 dark:to-orange-400">
        {t('settings:title')}
      </h1>
      <Text className="mt-2 text-zinc-600 dark:text-zinc-400">
        {t('settings:subtitle')}
      </Text>

      <div className="mt-6 space-y-6">
        <div className="rounded-xl bg-white dark:bg-slate-800/50 p-6 ring-1 ring-slate-200 dark:ring-white/5">
          <LanguageSelector />
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-800/50 p-6 ring-1 ring-slate-200 dark:ring-white/5">
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
                color="amber"
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

        <div className="rounded-xl bg-white dark:bg-slate-800/50 p-6 ring-1 ring-slate-200 dark:ring-white/5">
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

        <div className="rounded-xl bg-white dark:bg-slate-800/50 p-6 ring-1 ring-slate-200 dark:ring-white/5">
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
                    ? 'bg-amber-500 text-white border-amber-500 dark:bg-amber-400 dark:text-zinc-900 dark:border-amber-400'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-400 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500'
                }`}
              >
                {t(`settings:sections.darkMode.options.${option}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Welcome Guide */}
        <div className="rounded-xl bg-white dark:bg-slate-800/50 p-6 ring-1 ring-slate-200 dark:ring-white/5">
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

        {/* Feature tips */}
        <div className="rounded-xl bg-white dark:bg-slate-800/50 p-6 ring-1 ring-slate-200 dark:ring-white/5">
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            {t('settings:featureTips.title')}
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings:featureTips.description')}
          </Text>
          <Button
            onClick={isAllDisabled ? enableAll : disableAll}
            color="zinc"
            className="mt-3"
          >
            {isAllDisabled ? t('common:tooltipHints.enableAll') : t('common:tooltipHints.disableAll')}
          </Button>
        </div>

        {/* Developer section (collapsible) */}
        <div className="rounded-xl bg-white dark:bg-slate-800/50 p-6 ring-1 ring-slate-200 dark:ring-white/5">
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
                      {t('settings:debug.title')}
                    </h4>
                    <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {t('settings:debug.description')}
                    </Text>
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch
                      checked={debugMode}
                      onChange={toggleDebugMode}
                      disabled={isLoading}
                    />
                    <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {debugMode ? t('settings:debug.enabled') : t('settings:debug.disabled')}
                    </Text>
                  </div>

                  {debugMode && (
                    <div className="rounded-lg bg-yellow-50 p-4 text-sm dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
                      <p className="font-semibold text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
                        <span>⚠️</span>
                        <span>{t('settings:debug.warningTitle')}</span>
                      </p>
                      <p className="mt-2 text-yellow-800 dark:text-yellow-200">
                        {t('settings:debug.warningBody')}
                      </p>
                    </div>
                  )}

                  <Field>
                    <Label>{t('settings:debug.retentionLabel')}</Label>
                    <Description>
                      {t('settings:debug.retentionDescription')}
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
                        color="amber"
                      >
                        {isSaving ? t('common:status.saving') : t('common:actions.save')}
                      </Button>
                      <Button
                        onClick={cleanupOldDebugLogs}
                        disabled={isLoading || isCleaningLogs}
                        color="zinc"
                      >
                        {isCleaningLogs ? t('settings:debug.cleaning') : t('settings:debug.cleanupNow')}
                      </Button>
                    </div>
                    {debugSaveMessage && (
                      <Text className={`mt-2 text-sm ${debugSaveMessage.includes(t('common:status.error')) ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {debugSaveMessage}
                      </Text>
                    )}
                  </Field>

                  <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                    <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">{t('settings:developerTools.title')}</h4>
                    <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {t('settings:developerTools.description')}
                    </Text>
                    <div className="mt-3 flex items-center gap-4">
                      <Button
                        onClick={unendDay}
                        disabled={!isDayEnded || isUnendingDay}
                        color="zinc"
                      >
                        {isUnendingDay ? t('settings:developerTools.unending') : t('settings:developerTools.unendDay')}
                      </Button>
                      <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                        {isDayEnded ? t('settings:developerTools.dayEnded') : t('settings:developerTools.dayNotEnded')}
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

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

import { Text } from '../components/catalyst/text';

import { Input } from '../components/catalyst/input';
import { Button } from '../components/catalyst/button';
import { Switch } from '../components/catalyst/switch';
import { LanguageSelector } from '../components/LanguageSelector';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useNavigation } from '../hooks/useNavigation';
import { useUpdater } from '../hooks/useUpdater';
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
  const updater = useUpdater();
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
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
  const [shortcutKey, setShortcutKey] = useState('CmdOrCtrl+Shift+W');
  const [shortcutEnabled, setShortcutEnabled] = useState(true);
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [shortcutSaveMessage, setShortcutSaveMessage] = useState<string | null>(null);

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

      // Load shortcut settings
      try {
        const [shortcut, enabled] = await invoke<[string, boolean]>('get_shortcut_settings');
        setShortcutKey(shortcut);
        setShortcutEnabled(enabled);
      } catch (e) {
        console.error('Failed to load shortcut settings:', e);
      }

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

  const formatShortcutDisplay = (accelerator: string) => {
    const isMac = navigator.platform.includes('Mac');
    return accelerator
      .replace('CmdOrCtrl', isMac ? '⌘' : 'Ctrl')
      .replace('Shift', isMac ? '⇧' : 'Shift')
      .replace('Alt', isMac ? '⌥' : 'Alt')
      .replace(/\+/g, ' + ');
  };

  const handleShortcutRecordKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore lone modifier presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    // Must have at least one modifier
    if (parts.length === 0) return;

    // Map the key to Tauri accelerator format
    let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    // Map some common keys
    const keyMap: Record<string, string> = {
      'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
      ' ': 'Space', 'Enter': 'Return',
    };
    if (keyMap[key]) key = keyMap[key];

    parts.push(key);
    const newShortcut = parts.join('+');

    setShortcutKey(newShortcut);
    setIsRecordingShortcut(false);
    saveShortcutSettings(newShortcut, shortcutEnabled);
  };

  const saveShortcutSettings = async (shortcut: string, enabled: boolean) => {
    try {
      await invoke('set_shortcut_settings', { shortcut, enabled });
      await invoke('register_global_shortcut', { shortcut, enabled });
      setShortcutSaveMessage(t('settings:shortcuts.saved'));
      setTimeout(() => setShortcutSaveMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save shortcut settings:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleShortcutEnabled = async (enabled: boolean) => {
    setShortcutEnabled(enabled);
    await saveShortcutSettings(shortcutKey, enabled);
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

        <div className="mx-auto max-w-2xl space-y-16 sm:space-y-20">
          <h1 className="sr-only">{t('settings:title')}</h1>

          {/* General */}
          <GeneralSection
            t={t}
            promptInterval={promptInterval}
            setPromptInterval={setPromptInterval}
            isLoading={isLoading}
            isSaving={isSaving}
            saveMessage={saveMessage}
            saveSettings={saveSettings}
            launchOnStartup={launchOnStartup}
            toggleLaunchOnStartup={toggleLaunchOnStartup}
            isAllDisabled={isAllDisabled}
            enableAll={enableAll}
            disableAll={disableAll}
            showOnboarding={showOnboarding}
          />

          {/* Appearance */}
          <AppearanceSection t={t} theme={theme} setTheme={setTheme} />

          {/* Keyboard Shortcuts */}
          <ShortcutsSection
            t={t}
            shortcutKey={shortcutKey}
            shortcutEnabled={shortcutEnabled}
            isRecordingShortcut={isRecordingShortcut}
            setIsRecordingShortcut={setIsRecordingShortcut}
            handleShortcutRecordKeyDown={handleShortcutRecordKeyDown}
            formatShortcutDisplay={formatShortcutDisplay}
            toggleShortcutEnabled={toggleShortcutEnabled}
            shortcutSaveMessage={shortcutSaveMessage}
            isLoading={isLoading}
          />

          {/* Software Updates */}
          <UpdatesSection t={t} updater={updater} />

          {/* Developer */}
          <DeveloperSection
            t={t}
            debugMode={debugMode}
            toggleDebugMode={toggleDebugMode}
            debugLogsRetentionDays={debugLogsRetentionDays}
            setDebugLogsRetentionDays={setDebugLogsRetentionDays}
            saveDebugSettings={saveDebugSettings}
            debugSaveMessage={debugSaveMessage}
            isLoading={isLoading}
            isSaving={isSaving}
            isCleaningLogs={isCleaningLogs}
            cleanupOldDebugLogs={cleanupOldDebugLogs}
            isDayEnded={isDayEnded}
            isUnendingDay={isUnendingDay}
            unendDay={unendDay}
          />
        </div>
      </div>
    </>
  );
}

/* ─── Section Components ──────────────────────────────────────────────── */

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base/7 font-semibold text-zinc-950 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">{description}</p>
    </div>
  );
}

function SettingRow({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-6 sm:flex">
      <dt className="font-medium text-zinc-950 dark:text-white sm:w-64 sm:flex-none sm:pr-6">{label}</dt>
      <dd className="mt-1 flex justify-between gap-x-6 sm:mt-0 sm:flex-auto">
        <div className="text-zinc-700 dark:text-zinc-300 flex items-center gap-3">{children}</div>
        {action && <div className="flex items-center">{action}</div>}
      </dd>
    </div>
  );
}

function GeneralSection({
  t,
  promptInterval,
  setPromptInterval,
  isLoading,
  isSaving,
  saveMessage,
  saveSettings,
  launchOnStartup,
  toggleLaunchOnStartup,
  isAllDisabled,
  enableAll,
  disableAll,
  showOnboarding,
}: any) {
  return (
    <div className="space-y-16">
      {/* Language & Prompts */}
      <div>
        <SectionHeader
          title={t('settings:sections.general', 'General')}
          description={t('settings:subtitle')}
        />

        <dl className="mt-6 divide-y divide-zinc-100 dark:divide-white/5 border-t border-zinc-200 dark:border-white/10 text-sm/6">
          <SettingRow label="Language / Taal">
            <LanguageSelector />
          </SettingRow>

          <SettingRow label={t('settings:promptFrequency.label')}>
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                {t('settings:promptFrequency.description')}
              </p>
              <div className="flex gap-3 items-center">
                <div className="max-w-[120px]">
                  <Input
                    type="number"
                    min="1"
                    max="1440"
                    value={promptInterval}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPromptInterval(parseInt(e.target.value) || 30)}
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
            </div>
          </SettingRow>

          <SettingRow
            label={t('settings:launchOnStartup.title')}
            action={
              <Switch
                checked={launchOnStartup}
                onChange={toggleLaunchOnStartup}
                disabled={isLoading}
              />
            }
          >
            <div>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {t('settings:launchOnStartup.description')}
              </Text>
              <Text className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {launchOnStartup ? t('settings:launchOnStartup.enabled') : t('settings:launchOnStartup.disabled')}
              </Text>
            </div>
          </SettingRow>
        </dl>
      </div>

      {/* Help & Tips */}
      <div>
        <SectionHeader
          title={t('settings:featureTips.title')}
          description={t('settings:featureTips.description')}
        />

        <dl className="mt-6 divide-y divide-zinc-100 dark:divide-white/5 border-t border-zinc-200 dark:border-white/10 text-sm/6">
          <SettingRow
            label={t('settings:featureTips.title')}
            action={
              <Button
                onClick={isAllDisabled ? enableAll : disableAll}
                color="zinc"
              >
                {isAllDisabled ? t('common:tooltipHints.enableAll') : t('common:tooltipHints.disableAll')}
              </Button>
            }
          >
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('settings:featureTips.description')}
            </Text>
          </SettingRow>

          <SettingRow
            label={t('settings:onboarding.title')}
            action={
              <Button onClick={showOnboarding} color="zinc">
                {t('settings:onboarding.showButton')}
              </Button>
            }
          >
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('settings:onboarding.description')}
            </Text>
          </SettingRow>
        </dl>
      </div>
    </div>
  );
}

function AppearanceSection({ t, theme, setTheme }: any) {
  return (
    <div>
      <SectionHeader
        title={t('settings:sections.darkMode.title')}
        description={t('settings:sections.darkMode.description')}
      />

      <dl className="mt-6 divide-y divide-zinc-100 dark:divide-white/5 border-t border-zinc-200 dark:border-white/10 text-sm/6">
        <SettingRow label={t('settings:sections.darkMode.title')}>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as Theme[]).map((option) => (
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
        </SettingRow>
      </dl>
    </div>
  );
}

function ShortcutsSection({
  t,
  shortcutKey,
  shortcutEnabled,
  isRecordingShortcut,
  setIsRecordingShortcut,
  handleShortcutRecordKeyDown,
  formatShortcutDisplay,
  toggleShortcutEnabled,
  shortcutSaveMessage,
  isLoading,
}: any) {
  return (
    <div>
      <SectionHeader
        title={t('settings:shortcuts.title')}
        description={t('settings:shortcuts.description')}
      />

      <dl className="mt-6 divide-y divide-zinc-100 dark:divide-white/5 border-t border-zinc-200 dark:border-white/10 text-sm/6">
        <SettingRow label={t('settings:shortcuts.quickEntry')}>
          <div className="flex items-center gap-3">
            {isRecordingShortcut ? (
              <input
                type="text"
                readOnly
                autoFocus
                placeholder={t('settings:shortcuts.recording')}
                onKeyDown={handleShortcutRecordKeyDown}
                onBlur={() => setIsRecordingShortcut(false)}
                className="text-xs px-3 py-1.5 rounded-md border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-zinc-700 dark:text-zinc-300 outline-none w-52 text-center animate-pulse"
              />
            ) : (
              <>
                <span className="text-xs font-mono px-3 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  {formatShortcutDisplay(shortcutKey)}
                </span>
                <button
                  onClick={() => setIsRecordingShortcut(true)}
                  className="font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300 text-sm"
                >
                  {t('settings:shortcuts.change')}
                </button>
              </>
            )}
          </div>
        </SettingRow>

        <SettingRow
          label={t('settings:shortcuts.enabled')}
          action={
            <Switch
              checked={shortcutEnabled}
              onChange={toggleShortcutEnabled}
              disabled={isLoading}
            />
          }
        >
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {shortcutEnabled ? t('settings:launchOnStartup.enabled') : t('settings:launchOnStartup.disabled')}
          </Text>
        </SettingRow>
      </dl>

      {shortcutSaveMessage && (
        <Text className="mt-2 text-sm text-green-600 dark:text-green-400">
          {shortcutSaveMessage}
        </Text>
      )}
    </div>
  );
}

function UpdatesSection({ t, updater }: any) {
  return (
    <div>
      <SectionHeader
        title={t('settings:updates.title')}
        description={
          updater.currentVersion
            ? t('settings:updates.currentVersion', { version: updater.currentVersion })
            : t('settings:updates.description')
        }
      />

      <dl className="mt-6 divide-y divide-zinc-100 dark:divide-white/5 border-t border-zinc-200 dark:border-white/10 text-sm/6">
        {updater.available && updater.version && !updater.downloading && (
          <div className="py-6">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-4">
              <Text className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {t('settings:updates.availableVersion', { version: updater.version })}
              </Text>
              <div className="mt-3 flex gap-2">
                <Button onClick={updater.downloadAndInstall} color="amber">
                  {t('settings:updates.installNow')}
                </Button>
                <Button onClick={updater.dismiss} color="zinc">
                  {t('settings:updates.later')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {updater.downloading && (
          <div className="py-6">
            <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400 mb-2">
              <span>{t('settings:updates.downloading')}</span>
              <span>{updater.progress}%</span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
              <div
                className="bg-amber-500 dark:bg-amber-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${updater.progress}%` }}
              />
            </div>
          </div>
        )}

        {updater.error && (
          <div className="py-6">
            <Text className="text-sm text-red-600 dark:text-red-400">{updater.error}</Text>
          </div>
        )}

        <SettingRow
          label={t('settings:updates.checkButton')}
          action={
            <Button
              onClick={updater.checkForUpdates}
              disabled={updater.checking}
              color="zinc"
            >
              {updater.checking ? t('settings:updates.checking') : t('settings:updates.checkButton')}
            </Button>
          }
        >
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('settings:updates.description')}
          </Text>
        </SettingRow>
      </dl>
    </div>
  );
}

function DeveloperSection({
  t,
  debugMode,
  toggleDebugMode,
  debugLogsRetentionDays,
  setDebugLogsRetentionDays,
  saveDebugSettings,
  debugSaveMessage,
  isLoading,
  isSaving,
  isCleaningLogs,
  cleanupOldDebugLogs,
  isDayEnded,
  isUnendingDay,
  unendDay,
}: any) {
  return (
    <div className="space-y-16">
      {/* Debug logging */}
      <div>
        <SectionHeader
          title={t('settings:debug.title')}
          description={t('settings:debug.description')}
        />

        <dl className="mt-6 divide-y divide-zinc-100 dark:divide-white/5 border-t border-zinc-200 dark:border-white/10 text-sm/6">
          <SettingRow
            label={t('settings:debug.title')}
            action={
              <Switch
                checked={debugMode}
                onChange={toggleDebugMode}
                disabled={isLoading}
              />
            }
          >
            <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {debugMode ? t('settings:debug.enabled') : t('settings:debug.disabled')}
            </Text>
          </SettingRow>

          {debugMode && (
            <div className="py-6">
              <div className="rounded-lg bg-yellow-50 p-4 text-sm dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
                <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                  {t('settings:debug.warningTitle')}
                </p>
                <p className="mt-2 text-yellow-800 dark:text-yellow-200">
                  {t('settings:debug.warningBody')}
                </p>
              </div>
            </div>
          )}

          <SettingRow label={t('settings:debug.retentionLabel')}>
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                {t('settings:debug.retentionDescription')}
              </p>
              <div className="flex gap-3 items-center">
                <div className="max-w-[120px]">
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={debugLogsRetentionDays}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDebugLogsRetentionDays(parseInt(e.target.value) || 7)}
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
            </div>
          </SettingRow>
        </dl>
      </div>

      {/* Developer tools */}
      <div>
        <SectionHeader
          title={t('settings:developerTools.title')}
          description={t('settings:developerTools.description')}
        />

        <dl className="mt-6 divide-y divide-zinc-100 dark:divide-white/5 border-t border-zinc-200 dark:border-white/10 text-sm/6">
          <SettingRow
            label={t('settings:developerTools.unendDay')}
            action={
              <Button
                onClick={unendDay}
                disabled={!isDayEnded || isUnendingDay}
                color="zinc"
              >
                {isUnendingDay ? t('settings:developerTools.unending') : t('settings:developerTools.unendDay')}
              </Button>
            }
          >
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {isDayEnded ? t('settings:developerTools.dayEnded') : t('settings:developerTools.dayNotEnded')}
            </Text>
          </SettingRow>
        </dl>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Divider } from '../components/catalyst/divider';
import { Field, Label, Description } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Button } from '../components/catalyst/button';

export function SettingsView() {
  const [promptInterval, setPromptInterval] = useState<number>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

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
        setSaveMessage('Please enter a value between 1 and 1440 minutes (24 hours)');
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

      setSaveMessage('Settings saved successfully!');

      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveMessage(`Error: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl scrollable h-full">
      <Heading>Settings</Heading>
      <Text className="mt-2 text-zinc-600 dark:text-zinc-400">
        Manage your WorkRecall preferences and account settings.
      </Text>

      <Divider className="my-6" />

      <div className="space-y-6">
        <div>
          <Field>
            <Label>Prompt Frequency</Label>
            <Description>
              How often (in minutes) should WorkRecall prompt you to log your work?
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
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            {saveMessage && (
              <Text className={`mt-2 text-sm ${saveMessage.includes('Error') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {saveMessage}
              </Text>
            )}
            <Text className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Recommended: 30-60 minutes. Range: 1-1440 minutes (24 hours).
            </Text>
          </Field>
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            Notifications
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Coming soon: Manage notification preferences.
          </Text>
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            Dark Mode
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Coming soon: Toggle dark mode manually. Currently follows system preferences.
          </Text>
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            Database
          </h3>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Coming soon: Database backup and export options.
          </Text>
        </div>
      </div>
    </div>
  );
}

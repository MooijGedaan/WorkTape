import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import Database from '@tauri-apps/plugin-sql';
import { Button } from './components/catalyst/button';
import { Textarea } from './components/catalyst/textarea';
import { Field } from './components/catalyst/fieldset';

function Prompt() {
  const { t } = useTranslation('prompt');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [skipDuration, setSkipDuration] = useState(5); // in minutes
  const [isHovering, setIsHovering] = useState(false);

  // Format skip duration for display
  const formatSkipDuration = (minutes: number): string => {
    if (minutes < 60) {
      return t('skip.minutes', { count: minutes });
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;

      if (remainingMinutes === 0) {
        return t('skip.hours', { count: hours });
      } else {
        return t('skip.hoursAndMinutes', { hours, minutes: remainingMinutes });
      }
    }
  };

  // Handle scroll wheel to adjust skip duration
  const handleWheel = (e: React.WheelEvent<HTMLButtonElement>) => {
    e.preventDefault(); // Prevent page scroll

    const delta = e.deltaY;
    const increment = 15; // 15-minute steps

    setSkipDuration((prev) => {
      let newDuration = prev;

      if (delta < 0) {
        // Scroll up - increase duration
        newDuration = prev + increment;
      } else if (delta > 0) {
        // Scroll down - decrease duration
        newDuration = prev - increment;
      }

      // Clamp between 5 and 120 minutes
      return Math.max(5, Math.min(120, newDuration));
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('Starting save process...');

      // Get current timestamp
      const timestamp = new Date().toISOString();
      console.log('Timestamp:', timestamp);

      // Save to database
      console.log('Loading database...');
      const db = await Database.load('sqlite:workrecall.db');
      console.log('Database loaded successfully');

      console.log('Executing INSERT query...');
      const result = await db.execute(
        'INSERT INTO work_entries (description, timestamp) VALUES ($1, $2)',
        [description.trim(), timestamp]
      );
      console.log('Query result:', result);

      // Emit event to notify main window to refresh
      console.log('Emitting work-entry-saved event...');
      await emit('work-entry-saved', { description: description.trim(), timestamp });

      // Get the configured interval from database
      console.log('Fetching prompt interval from settings...');
      const intervalResult = await db.select<Array<{ value: string }>>(
        "SELECT value FROM settings WHERE key = 'prompt_interval_minutes'"
      );
      const intervalMinutes = intervalResult.length > 0
        ? parseInt(intervalResult[0].value, 10)
        : 30; // Default to 30 minutes if not found
      console.log('Prompt interval:', intervalMinutes);

      // Close the prompt window and schedule next prompt
      console.log('Closing window...');
      await invoke('close_prompt_after_save', { intervalMinutes });
      console.log('Window closed successfully');
    } catch (error) {
      console.error('Failed to save entry:', error);
      alert(`Error: ${error}`);
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    try {
      // Pass skip duration to backend
      await invoke('skip_prompt', { minutes: skipDuration });
    } catch (error) {
      console.error('Failed to skip prompt:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter or Ctrl+Shift+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (description.trim() && !isSubmitting) {
        handleSubmit(e as any);
      }
    }
  };

  return (
    <div className="h-screen flex flex-col p-5 bg-zinc-50 dark:bg-zinc-900 box-border overflow-hidden">
      <h2 className="m-0 mb-4 text-base font-semibold text-zinc-950 dark:text-white">
        {t('title')}
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1">
        <Field className="flex-1">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('placeholder')}
            autoFocus
            disabled={isSubmitting}
            resizable={false}
            className="h-[100px] mb-4"
          />
        </Field>

        <div className="flex gap-2.5 justify-end">
          <Button
            type="button"
            onClick={handleSkip}
            onWheel={handleWheel}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            disabled={isSubmitting}
            plain
            className={isHovering ? 'cursor-ns-resize' : ''}
            title={t('skip.scrollToAdjust')}
          >
            {formatSkipDuration(skipDuration)}
          </Button>

          <Button
            type="submit"
            disabled={!description.trim() || isSubmitting}
            color="blue"
          >
            {isSubmitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default Prompt;

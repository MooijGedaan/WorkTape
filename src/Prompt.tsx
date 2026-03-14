import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { useTauriEvent } from './hooks/useTauriEvent';
import Database from '@tauri-apps/plugin-sql';
import { Button } from './components/catalyst/button';
import { Textarea } from './components/catalyst/textarea';
import { Field } from './components/catalyst/fieldset';
import { ErrorNotification } from './components/ErrorNotification';

interface SprintTask {
  id: number;
  title: string;
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
}

interface RecentEntry {
  description: string;
  linkedTaskId: number | null;
  linkedTaskTitle: string | null;
}

function Prompt() {
  const { t } = useTranslation('prompt');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [skipDuration, setSkipDuration] = useState(5); // in minutes
  const [isHovering, setIsHovering] = useState(false);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [sprintTasks, setSprintTasks] = useState<SprintTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isDayEnded, setIsDayEnded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load today's recent entries on mount (up to 2 unique, same day only)
  useEffect(() => {
    const loadRecentEntries = async () => {
      try {
        const db = await Database.load('sqlite:workrecall.db');
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        const rows = await db.select<Array<{ description: string; task_id: number | null; task_title: string | null }>>(
          `SELECT
             we.description,
             st.id    AS task_id,
             st.title AS task_title
           FROM work_entries we
           LEFT JOIN sprint_task_work_links wl
             ON wl.entry_id = we.id AND wl.entry_source = 'manual'
           LEFT JOIN sprint_tasks st
             ON st.id = wl.task_id
           WHERE we.timestamp LIKE $1
           ORDER BY we.timestamp DESC`,
          [`${today}%`]
        );

        // Deduplicate while preserving order, take first 2
        const seen = new Set<string>();
        const unique: RecentEntry[] = [];
        for (const row of rows) {
          if (!seen.has(row.description) && unique.length < 2) {
            seen.add(row.description);
            unique.push({
              description: row.description,
              linkedTaskId: row.task_id,
              linkedTaskTitle: row.task_title,
            });
          }
        }

        setRecentEntries(unique);
      } catch (error) {
        console.error('Failed to load recent entries:', error);
      }
    };

    loadRecentEntries();
  }, []);

  // Load active sprint tasks on mount
  useEffect(() => {
    const loadSprintTasks = async () => {
      try {
        const tasks = await invoke<SprintTask[]>('get_sprint_tasks');
        setSprintTasks(tasks.filter(t => t.status !== 'done'));
      } catch (error) {
        console.error('Failed to load sprint tasks:', error);
      }
    };
    loadSprintTasks();
  }, []);

  // Check if today is ended on mount, and listen for real-time updates
  useEffect(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    invoke<boolean>('is_day_ended', { date: todayStr }).then(setIsDayEnded).catch(console.error);
  }, []);

  const setDayEnded = useCallback(() => setIsDayEnded(true), []);
  const setDayUnended = useCallback(() => setIsDayEnded(false), []);
  useTauriEvent('day-ended', setDayEnded);
  useTauriEvent('day-unended', setDayUnended);

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

  const saveEntry = async (text: string) => {
    if (isDayEnded) return;
    setIsSubmitting(true);

    try {
      const timestamp = new Date().toISOString();
      const db = await Database.load('sqlite:workrecall.db');

      const result = await db.execute(
        'INSERT INTO work_entries (description, timestamp) VALUES ($1, $2)',
        [text, timestamp]
      );

      if (selectedTaskId !== null) {
        try {
          await invoke('add_work_link', {
            taskId: selectedTaskId,
            entrySource: 'manual',
            entryId: result.lastInsertId,
          });
        } catch (linkError) {
          console.error('Failed to link work entry to task:', linkError);
        }
      }

      await emit('work-entry-saved', { description: text, timestamp });

      const intervalResult = await db.select<Array<{ value: string }>>(
        "SELECT value FROM settings WHERE key = 'prompt_interval_minutes'"
      );
      const intervalMinutes = intervalResult.length > 0
        ? parseInt(intervalResult[0].value, 10)
        : 30;

      await invoke('close_prompt_after_save', { intervalMinutes });
    } catch (error) {
      console.error('Failed to save entry:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    await saveEntry(description.trim());
  };

  const handleRecentEntryClick = async (entry: RecentEntry, e: React.MouseEvent) => {
    const taskStillActive = entry.linkedTaskId !== null &&
      sprintTasks.some(t => t.id === entry.linkedTaskId);
    setSelectedTaskId(taskStillActive ? entry.linkedTaskId : null);

    if (e.shiftKey) {
      await saveEntry(entry.description);
    } else {
      setDescription(entry.description);
    }
  };

  const handleSkip = async () => {
    try {
      await invoke('skip_prompt', { minutes: skipDuration });
    } catch (error) {
      console.error('Failed to skip prompt:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (description.trim() && !isSubmitting) {
        saveEntry(description.trim());
      }
    }
  };

  if (isDayEnded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-5 bg-zinc-50 dark:bg-zinc-900 box-border gap-4">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 text-center">
          Today's log is closed.
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
          No more entries can be added for today.
        </p>
        <Button
          type="button"
          onClick={() => invoke('close_prompt', {})}
          plain
        >
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col p-5 bg-zinc-50 dark:bg-zinc-900 box-border overflow-hidden">
      <ErrorNotification
        show={errorMessage !== null}
        message={errorMessage ?? ''}
        onClose={() => setErrorMessage(null)}
      />
      <h2 className="m-0 mb-4 text-base font-semibold text-zinc-950 dark:text-white">
        {t('title')}
      </h2>

      {recentEntries.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">{t('recentEntries')}</p>
          <div className="flex flex-col gap-1.5">
            {recentEntries.map((entry, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => handleRecentEntryClick(entry, e)}
                disabled={isSubmitting}
                className="text-left text-xs px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={entry.description}
              >
                <span className="block truncate">{entry.description}</span>
                {entry.linkedTaskTitle && (
                  <span className="block truncate text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {entry.linkedTaskTitle}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col flex-1">
        <Field className="flex-1 flex flex-col min-h-0">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('placeholder')}
            autoFocus
            disabled={isSubmitting}
            resizable={false}
            className="flex-1 min-h-0 mb-3"
          />
        </Field>

        {sprintTasks.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
              {t('taskLink.label')}
            </p>
            <select
              value={selectedTaskId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTaskId(val === '' ? null : Number(val));
              }}
              disabled={isSubmitting}
              className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{t('taskLink.noTask')}</option>
              {sprintTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>
        )}

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

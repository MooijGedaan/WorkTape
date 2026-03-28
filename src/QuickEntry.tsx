import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { useTauriEvent } from './hooks/useTauriEvent';
import Database from '@tauri-apps/plugin-sql';
import { Button } from './components/catalyst/button';
import { ErrorNotification } from './components/ErrorNotification';

interface SprintTask {
  id: number;
  title: string;
  status: 'todo' | 'in-progress' | 'done' | 'paused';
}

interface TodayEntry {
  description: string;
  linkedTaskId: number | null;
  linkedTaskTitle: string | null;
}

function QuickEntry() {
  const { t } = useTranslation('quickentry');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sprintTasks, setSprintTasks] = useState<SprintTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [todayEntries, setTodayEntries] = useState<TodayEntry[]>([]);
  const [isDayEnded, setIsDayEnded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const db = await Database.load('sqlite:worktape.db');
      const today = new Date().toISOString().slice(0, 10);

      // Load today's entries (deduplicated)
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

      const seen = new Set<string>();
      const unique: TodayEntry[] = [];
      for (const row of rows) {
        if (!seen.has(row.description)) {
          seen.add(row.description);
          unique.push({
            description: row.description,
            linkedTaskId: row.task_id,
            linkedTaskTitle: row.task_title,
          });
        }
      }
      setTodayEntries(unique);

      // Load sprint tasks
      const tasks = await invoke<SprintTask[]>('get_sprint_tasks');
      setSprintTasks(tasks.filter(t => t.status !== 'done'));
    } catch (error) {
      console.error('Failed to load quick entry data:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Check if today is ended
  useEffect(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    invoke<boolean>('is_day_ended', { date: todayStr }).then(setIsDayEnded).catch(console.error);
  }, []);

  const setDayEnded = useCallback(() => setIsDayEnded(true), []);
  const setDayUnended = useCallback(() => setIsDayEnded(false), []);
  useTauriEvent('day-ended', setDayEnded);
  useTauriEvent('day-unended', setDayUnended);

  const closeWindow = async () => {
    try {
      await invoke('close_quick_entry');
    } catch (error) {
      console.error('Failed to close quick entry window:', error);
    }
  };

  const saveEntry = async (text: string) => {
    if (isDayEnded) return;
    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const db = await Database.load('sqlite:worktape.db');

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
      await closeWindow();
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (description.trim() && !isSubmitting) {
        saveEntry(description.trim());
      }
    }
    if (e.key === 'Escape') {
      closeWindow();
    }
  };

  const handleEntryClick = (entry: TodayEntry, e: React.MouseEvent) => {
    const taskStillActive = entry.linkedTaskId !== null &&
      sprintTasks.some(t => t.id === entry.linkedTaskId);
    setSelectedTaskId(taskStillActive ? entry.linkedTaskId : null);

    if (e.shiftKey) {
      saveEntry(entry.description);
    } else {
      setDescription(entry.description);
    }
  };

  if (isDayEnded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-5 bg-zinc-50 dark:bg-zinc-900 box-border gap-4">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 text-center">
          Today's log is closed.
        </p>
        <Button type="button" onClick={closeWindow} plain>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-900 box-border overflow-hidden">
      <ErrorNotification
        show={errorMessage !== null}
        message={errorMessage ?? ''}
        onClose={() => setErrorMessage(null)}
      />

      <form onSubmit={handleSubmit} className="p-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
            {t('title')}
          </h2>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+↵
          </span>
        </div>

        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('placeholder')}
          autoFocus
          disabled={isSubmitting}
          className="w-full text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 disabled:opacity-50"
        />

        {sprintTasks.length > 0 && (
          <div className="mt-2.5">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              {t('taskLink.label')}
            </p>
            <select
              value={selectedTaskId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTaskId(val === '' ? null : Number(val));
              }}
              disabled={isSubmitting}
              className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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

        <div className="flex justify-end mt-3">
          <Button
            type="submit"
            disabled={!description.trim() || isSubmitting}
            color="blue"
          >
            {isSubmitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>

      {/* Today's entries */}
      {todayEntries.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-700/50 px-5 py-3 flex-1 min-h-0 overflow-y-auto">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
            {t('todayEntries')}
          </p>
          <div className="flex flex-col gap-1">
            {todayEntries.map((entry, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => handleEntryClick(entry, e)}
                disabled={isSubmitting}
                className="text-left text-xs px-2.5 py-1.5 rounded-md border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50 flex items-center justify-between gap-2"
              >
                <span className="truncate">{entry.description}</span>
                {entry.linkedTaskTitle && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">
                    {entry.linkedTaskTitle}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default QuickEntry;

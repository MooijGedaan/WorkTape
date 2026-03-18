import { useState, useEffect, useCallback, useRef } from "react";
import { useTauriEvent } from '../hooks/useTauriEvent';
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from 'react-i18next';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Field, Label } from '../components/catalyst/fieldset';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { XMarkIcon, ClockIcon } from '../components/icons';
import { UndoNotification } from '../components/UndoNotification';
import { getDb } from '../hooks/useDatabase';
import { useTooltipHints, type HintId } from '../hooks/useTooltipHints';
import { TooltipHint } from '../components/TooltipHint';
import { HINT_DEFINITIONS } from '../components/hints/hintDefinitions';

interface SprintTask {
  id: number;
  title: string;
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
}

interface WorkEntry {
  id: number;
  description: string;
  timestamp: string;
  source?: 'manual' | 'auto'; // Track whether entry was manual or auto-generated
  screenshots_count?: number; // For auto entries
  next_action?: string | null;
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function WorkLogView() {
  const { t, i18n } = useTranslation(['worklog', 'notifications', 'common']);
  const { isSeen, markSeen, isAllDisabled, disableAll } = useTooltipHints();
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
  const hasShownDataHint = useRef(false);
  const [taskDescription, setTaskDescription] = useState("");
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUndoNotification, setShowUndoNotification] = useState(false);
  const [deletedEntry, setDeletedEntry] = useState<WorkEntry | null>(null);
  const [undoTimeoutId, setUndoTimeoutId] = useState<number | null>(null);
  const [isDayEnded, setIsDayEnded] = useState(false);
  const [sprintTasks, setSprintTasks] = useState<SprintTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  // Load entries when component mounts
  useEffect(() => {
    loadEntries();

    // Restore draft text from localStorage
    const savedDraft = localStorage.getItem('worklog-draft');
    if (savedDraft) {
      setTaskDescription(savedDraft);
    }

    // Check if today's day has been ended
    const todayStr = toLocalDateString(new Date());
    invoke<boolean>('is_day_ended', { date: todayStr }).then(setIsDayEnded).catch(console.error);

    // Load active sprint tasks for linking
    invoke<SprintTask[]>('get_sprint_tasks')
      .then(tasks => setSprintTasks(tasks.filter(t => t.status !== 'done')))
      .catch(console.error);
  }, []);

  // Listen for work entry saved events from prompt window
  const onWorkEntrySaved = useCallback(() => loadEntries(), []);
  useTauriEvent('work-entry-saved', onWorkEntrySaved);

  // Listen for day-ended / day-unended events
  const setDayEnded = useCallback(() => setIsDayEnded(true), []);
  const setDayUnended = useCallback(() => setIsDayEnded(false), []);
  useTauriEvent('day-ended', setDayEnded);
  useTauriEvent('day-unended', setDayUnended);

  // Save draft text to localStorage whenever it changes
  useEffect(() => {
    if (taskDescription) {
      localStorage.setItem('worklog-draft', taskDescription);
    } else {
      localStorage.removeItem('worklog-draft');
    }
  }, [taskDescription]);

  // Show first unseen data-gated hint once data is loaded
  useEffect(() => {
    if (isAllDisabled) return;
    if (hasShownDataHint.current) return;
    if (entries.length === 0) return; // wait for data

    const candidateHints: HintId[] = [];
    if (!isSeen('worklog-click-to-edit')) candidateHints.push('worklog-click-to-edit');
    if (sprintTasks.length > 0 && !isSeen('worklog-sprint-linking')) candidateHints.push('worklog-sprint-linking');
    if (isDayEnded && !isSeen('worklog-regenerate-summary')) candidateHints.push('worklog-regenerate-summary');

    const first = candidateHints[0];
    if (!first) return;
    hasShownDataHint.current = true;
    const timer = setTimeout(() => setActiveHint(first), 500);
    return () => clearTimeout(timer);
  }, [entries.length, sprintTasks.length, isDayEnded]); // re-run as data loads

  const handleHintDismiss = () => {
    if (activeHint) markSeen(activeHint);
    setActiveHint(null);
  };

  const loadEntries = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const database = await getDb();

      // Fetch manual entries
      const manualEntries = await database.select<WorkEntry[]>(
        "SELECT id, description, timestamp, next_action, 'manual' as source FROM work_entries"
      );

      // Fetch auto-generated entries
      const autoEntries = await database.select<WorkEntry[]>(
        "SELECT id, description, timestamp, 'auto' as source, screenshots_count FROM auto_work_entries"
      );

      // Combine and sort by timestamp (newest first)
      const allEntries = [...manualEntries, ...autoEntries].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setEntries(allEntries);
    } catch (err) {
      setError(t('worklog:errors.loadFailed', { error: String(err) }));
      console.error("Error loading entries:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskDescription.trim()) {
      setError(t('worklog:errors.emptyDescription'));
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const timestamp = new Date().toISOString();
      const database = await getDb();

      const result = await database.execute(
        "INSERT INTO work_entries (description, timestamp, next_action) VALUES (?, ?, ?)",
        [taskDescription, timestamp, null]
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

      const newEntry: WorkEntry = {
        id: result.lastInsertId ?? Date.now(),
        description: taskDescription,
        timestamp: timestamp,
        next_action: null,
      };

      // Add the new entry to the top of the list
      setEntries([newEntry, ...entries]);
      setTaskDescription(""); // Clear the input field
      setSelectedTaskId(null); // Clear selected task
      localStorage.removeItem('worklog-draft'); // Clear the saved draft
    } catch (err) {
      setError(t('worklog:errors.addFailed', { error: String(err) }));
      console.error("Error adding entry:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    // Find the entry to delete
    const entryToDelete = entries.find(entry => entry.id === id);
    if (!entryToDelete) return;

    // Store the deleted entry for potential undo
    setDeletedEntry(entryToDelete);

    // Optimistically remove from UI
    setEntries(entries.filter(entry => entry.id !== id));

    // Show undo notification
    setShowUndoNotification(true);

    // Clear any existing timeout
    if (undoTimeoutId) {
      clearTimeout(undoTimeoutId);
    }

    // Set timeout to permanently delete after 5 seconds
    const timeoutId = window.setTimeout(() => {
      permanentlyDeleteEntry(entryToDelete);
    }, 5000);

    setUndoTimeoutId(timeoutId);
  };

  const permanentlyDeleteEntry = async (entry: WorkEntry) => {
    try {
      const database = await getDb();

      // Determine which table to delete from based on the entry's source
      const tableName = entry.source === 'auto' ? 'auto_work_entries' : 'work_entries';

      await database.execute(`DELETE FROM ${tableName} WHERE id = ?`, [entry.id]);
      setShowUndoNotification(false);
      setDeletedEntry(null);
      setUndoTimeoutId(null);
    } catch (err) {
      setError(t('worklog:errors.deleteFailed', { error: String(err) }));
      console.error("Error deleting entry:", err);
      // Restore the entry if deletion failed
      if (deletedEntry) {
        setEntries([deletedEntry, ...entries].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ));
      }
    }
  };

  const handleUndo = () => {
    // Clear the timeout
    if (undoTimeoutId) {
      clearTimeout(undoTimeoutId);
      setUndoTimeoutId(null);
    }

    // Restore the entry
    if (deletedEntry) {
      setEntries([deletedEntry, ...entries].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
      setDeletedEntry(null);
    }

    // Hide notification
    setShowUndoNotification(false);
  };

  const handleCloseNotification = () => {
    setShowUndoNotification(false);
    // Don't clear the timeout - let the deletion proceed
  };

  const [regeneratingSummaryDate, setRegeneratingSummaryDate] = useState<string | null>(null);

  const handleRegenerateSummary = async (date: string) => {
    setRegeneratingSummaryDate(date);
    try {
      const database = await getDb();

      const manualEntries = await database.select<Array<{ description: string; timestamp: string }>>(
        "SELECT description, timestamp FROM work_entries WHERE DATE(timestamp) = ? ORDER BY timestamp ASC",
        [date]
      );
      const autoEntries = await database.select<Array<{ description: string; timestamp: string }>>(
        "SELECT description, timestamp FROM auto_work_entries WHERE DATE(timestamp) = ? ORDER BY timestamp ASC",
        [date]
      );
      const allEntries = [...manualEntries, ...autoEntries].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      if (allEntries.length < 2) return;

      const entryTuples: [string, string][] = allEntries.map(e => [e.description, e.timestamp]);
      const generatedSummary = await invoke<string>('generate_daily_summary', {
        entries: entryTuples,
        date,
        language: i18n.language,
      });

      const now = new Date().toISOString();
      await database.execute(
        "INSERT OR REPLACE INTO ai_summaries (date, summary, created_at, updated_at) VALUES (?, ?, COALESCE((SELECT created_at FROM ai_summaries WHERE date = ?), ?), ?)",
        [date, generatedSummary, date, now, now]
      );
    } catch (err) {
      console.error('Failed to regenerate summary:', err);
    } finally {
      setRegeneratingSummaryDate(null);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
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
      <UndoNotification
        show={showUndoNotification}
        message={t('notifications:entryDeleted')}
        onUndo={handleUndo}
        onClose={handleCloseNotification}
      />
      <div className="flex flex-col h-full overflow-hidden w-full">
        <div className="flex-shrink-0 w-full">
          <Heading>{t('worklog:title')}</Heading>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900">
            <p className="text-sm font-semibold text-red-900 dark:text-red-200">{t('common:status.error')}</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
          </div>
        )}

        {isDayEnded ? (
          <div className="mb-8 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">
              Today's log is closed. No more entries can be added.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mb-8">
            <Field>
              <Label>{t('worklog:form.label')}</Label>
              <div className="flex gap-3 items-center">
                <Input
                  type="text"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder={t('worklog:form.placeholder')}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" disabled={isLoading} color="blue">
                  {isLoading ? t('worklog:form.submitting') : t('worklog:form.submit')}
                </Button>
              </div>
              {sprintTasks.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Link to task:</span>
                  <select
                    value={selectedTaskId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedTaskId(val === '' ? null : Number(val));
                    }}
                    disabled={isLoading}
                    className="flex-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">No task</option>
                    {sprintTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </Field>
          </form>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 w-full">
        <div className="flex-shrink-0 w-full">
          <Heading level={2}>{t('worklog:list.title', { count: entries.length })}</Heading>
        </div>
        {entries.length === 0 ? (
          <Text className="text-zinc-500 dark:text-zinc-400 italic mt-4">
            {t('worklog:list.empty')}
          </Text>
        ) : (
          <div className="flex-1 scrollable mt-6 w-full">
            <div className="min-w-full">
              {(() => {
                // Group entries by date
                const groups: { date: string; entries: WorkEntry[] }[] = [];
                for (const entry of entries) {
                  const date = entry.timestamp.split('T')[0];
                  const existing = groups.find(g => g.date === date);
                  if (existing) {
                    existing.entries.push(entry);
                  } else {
                    groups.push({ date, entries: [entry] });
                  }
                }

                return groups.map(({ date, entries: dayEntries }) => (
                  <div key={date} className="mb-6">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className="text-zinc-500 dark:text-zinc-400">
                        <tr>
                          <th className="border-b border-zinc-950/10 dark:border-white/10 px-4 py-2 font-medium whitespace-nowrap">{t('worklog:list.headers.time')}</th>
                          <th className="border-b border-zinc-950/10 dark:border-white/10 px-4 py-2 font-medium">{t('worklog:list.headers.description')}</th>
                          <th className="border-b border-zinc-950/10 dark:border-white/10 px-4 py-2 font-medium text-right whitespace-nowrap">{t('worklog:list.headers.delete')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayEntries.map((entry) => (
                          <tr key={`${entry.source}-${entry.id}`}>
                            <td className="border-b border-zinc-950/5 dark:border-white/5 px-4 py-4 text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap align-top">
                              {formatTimestamp(entry.timestamp)}
                            </td>
                            <td className="border-b border-zinc-950/5 dark:border-white/5 px-4 py-4 break-words align-top text-zinc-900 dark:text-white">
                              <div className="flex items-start gap-2">
                                <div className="flex-1">
                                  <span>{entry.description}</span>
                                  {entry.next_action && (
                                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                      <ClockIcon className="h-3 w-3 flex-shrink-0" />
                                      {entry.next_action}
                                    </p>
                                  )}
                                </div>
                                {entry.source === 'auto' && (
                                  <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-950/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-300/10 whitespace-nowrap flex-shrink-0">
                                    Auto
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="border-b border-zinc-950/5 dark:border-white/5 px-4 py-4 text-right whitespace-nowrap align-top">
                              <button
                                onClick={() => handleDelete(entry.id)}
                                disabled={isLoading}
                                className="text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={t('common:actions.delete')}
                                title={t('common:actions.delete')}
                              >
                                <XMarkIcon className="h-5 w-5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-4 pt-2 pb-1">
                      <button
                        onClick={() => handleRegenerateSummary(date)}
                        disabled={regeneratingSummaryDate === date}
                        className="text-xs italic text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {regeneratingSummaryDate === date
                          ? '...'
                          : t('worklog:list.regenerateSummary')}
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

import { useState, useEffect } from "react";
import { listen } from '@tauri-apps/api/event';
import Database from "@tauri-apps/plugin-sql";
import { useTranslation } from 'react-i18next';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Field, Label } from '../components/catalyst/fieldset';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { XMarkIcon } from '../components/icons';
import { UndoNotification } from '../components/UndoNotification';

interface WorkEntry {
  id: number;
  description: string;
  timestamp: string;
  source?: 'manual' | 'auto'; // Track whether entry was manual or auto-generated
  screenshots_count?: number; // For auto entries
}

let db: Database | null = null;

async function getDatabase() {
  return db ?? await Database.load("sqlite:workrecall.db");
}

export function WorkLogView() {
  const { t } = useTranslation(['worklog', 'notifications', 'common']);
  const [taskDescription, setTaskDescription] = useState("");
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUndoNotification, setShowUndoNotification] = useState(false);
  const [deletedEntry, setDeletedEntry] = useState<WorkEntry | null>(null);
  const [undoTimeoutId, setUndoTimeoutId] = useState<number | null>(null);

  // Load entries when component mounts
  useEffect(() => {
    loadEntries();

    // Restore draft text from localStorage
    const savedDraft = localStorage.getItem('worklog-draft');
    if (savedDraft) {
      setTaskDescription(savedDraft);
    }
  }, []);

  // Listen for work entry saved events from prompt window
  useEffect(() => {
    const unlisten = listen('work-entry-saved', (event) => {
      console.log('Received work-entry-saved event:', event);
      loadEntries(); // Refresh the entries list
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Save draft text to localStorage whenever it changes
  useEffect(() => {
    if (taskDescription) {
      localStorage.setItem('worklog-draft', taskDescription);
    } else {
      localStorage.removeItem('worklog-draft');
    }
  }, [taskDescription]);

  const loadEntries = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const database = await getDatabase();

      // Fetch manual entries
      const manualEntries = await database.select<WorkEntry[]>(
        "SELECT id, description, timestamp, 'manual' as source FROM work_entries"
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
      const database = await getDatabase();

      const result = await database.execute(
        "INSERT INTO work_entries (description, timestamp) VALUES (?, ?)",
        [taskDescription, timestamp]
      );

      const newEntry: WorkEntry = {
        id: result.lastInsertId ?? Date.now(),
        description: taskDescription,
        timestamp: timestamp,
      };

      // Add the new entry to the top of the list
      setEntries([newEntry, ...entries]);
      setTaskDescription(""); // Clear the input field
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
      const database = await getDatabase();

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

  return (
    <>
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

        <form onSubmit={handleSubmit} className="mb-8">
          <Field>
            <Label>{t('worklog:form.label')}</Label>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  type="text"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder={t('worklog:form.placeholder')}
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" disabled={isLoading} color="blue">
                {isLoading ? t('worklog:form.submitting') : t('worklog:form.submit')}
              </Button>
            </div>
          </Field>
        </form>
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
              <table className="w-full text-left text-sm border-collapse">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="border-b border-zinc-950/10 dark:border-white/10 px-4 py-2 font-medium whitespace-nowrap">{t('worklog:list.headers.time')}</th>
                    <th className="border-b border-zinc-950/10 dark:border-white/10 px-4 py-2 font-medium">{t('worklog:list.headers.description')}</th>
                    <th className="border-b border-zinc-950/10 dark:border-white/10 px-4 py-2 font-medium text-right whitespace-nowrap">{t('worklog:list.headers.delete')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={`${entry.source}-${entry.id}`}>
                      <td className="border-b border-zinc-950/5 dark:border-white/5 px-4 py-4 text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap align-top">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="border-b border-zinc-950/5 dark:border-white/5 px-4 py-4 break-words align-top">
                        <div className="flex items-start gap-2">
                          <span className="flex-1">{entry.description}</span>
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
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

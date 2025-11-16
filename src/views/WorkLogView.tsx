import { useState, useEffect } from "react";
import { listen } from '@tauri-apps/api/event';
import Database from "@tauri-apps/plugin-sql";
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Field, Label } from '../components/catalyst/fieldset';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';

interface WorkEntry {
  id: number;
  description: string;
  timestamp: string;
}

let db: Database | null = null;

async function getDatabase() {
  return db ?? await Database.load("sqlite:workrecall.db");
}

export function WorkLogView() {
  const [taskDescription, setTaskDescription] = useState("");
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load entries when component mounts
  useEffect(() => {
    loadEntries();
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

  const loadEntries = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const database = await getDatabase();
      const result = await database.select<WorkEntry[]>(
        "SELECT id, description, timestamp FROM work_entries ORDER BY timestamp DESC"
      );
      setEntries(result);
    } catch (err) {
      setError(`Failed to load entries: ${err}`);
      console.error("Error loading entries:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskDescription.trim()) {
      setError("Please enter a task description");
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
    } catch (err) {
      setError(`Failed to add entry: ${err}`);
      console.error("Error adding entry:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const database = await getDatabase();
      await database.execute("DELETE FROM work_entries WHERE id = ?", [id]);

      // Remove the entry from the list
      setEntries(entries.filter(entry => entry.id !== id));
    } catch (err) {
      setError(`Failed to delete entry: ${err}`);
      console.error("Error deleting entry:", err);
    } finally {
      setIsLoading(false);
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

  return (
    <div className="flex flex-col h-full overflow-hidden w-full">
      <div className="flex-shrink-0 w-full">
        <Heading>Work Log</Heading>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900">
            <p className="text-sm font-semibold text-red-900 dark:text-red-200">Error</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mb-8">
          <Field>
            <Label>What are you working on?</Label>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  type="text"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Enter task description..."
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" disabled={isLoading} color="blue">
                {isLoading ? "Adding..." : "Add Entry"}
              </Button>
            </div>
          </Field>
        </form>
      </div>

      <div className="flex-1 flex flex-col min-h-0 w-full">
        <div className="flex-shrink-0 w-full">
          <Heading level={2}>Work Log ({entries.length} entries)</Heading>
        </div>
        {entries.length === 0 ? (
          <Text className="text-zinc-500 dark:text-zinc-400 italic mt-4">
            No entries yet. Start logging your work above!
          </Text>
        ) : (
          <div className="flex-1 scrollable mt-6 w-full">
            <div className="min-w-full">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="border-b border-zinc-950/10 dark:border-white/10 px-4 py-2 font-medium whitespace-nowrap">Time</th>
                    <th className="border-b border-zinc-950/10 dark:border-white/10 px-4 py-2 font-medium">Description</th>
                    <th className="border-b border-zinc-950/10 dark:border-white/10 px-4 py-2 font-medium text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="border-b border-zinc-950/5 dark:border-white/5 px-4 py-4 text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap align-top">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="border-b border-zinc-950/5 dark:border-white/5 px-4 py-4 break-words align-top">
                        {entry.description}
                      </td>
                      <td className="border-b border-zinc-950/5 dark:border-white/5 px-4 py-4 text-right whitespace-nowrap align-top">
                        <Button
                          onClick={() => handleDelete(entry.id)}
                          disabled={isLoading}
                          color="red"
                        >
                          Delete
                        </Button>
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
  );
}

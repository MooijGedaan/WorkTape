import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import Database from '@tauri-apps/plugin-sql';
import { Button } from './components/catalyst/button';
import { Textarea } from './components/catalyst/textarea';
import { Field } from './components/catalyst/fieldset';

function Prompt() {
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      // Close the prompt window
      console.log('Closing window...');
      await invoke('close_prompt_after_save');
      console.log('Window closed successfully');
    } catch (error) {
      console.error('Failed to save entry:', error);
      alert(`Error: ${error}`);
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    try {
      await invoke('close_prompt');
    } catch (error) {
      console.error('Failed to close prompt:', error);
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
        What are you working on?
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1">
        <Field className="flex-1">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you're currently doing..."
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
            disabled={isSubmitting}
            plain
          >
            Skip
          </Button>

          <Button
            type="submit"
            disabled={!description.trim() || isSubmitting}
            color="blue"
          >
            {isSubmitting ? 'Saving...' : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default Prompt;

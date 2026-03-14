import { useState, useEffect, useRef } from 'react';
import { ClockIcon } from '../components/icons';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Field, Label } from '../components/catalyst/fieldset';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Dialog, DialogTitle, DialogBody, DialogActions } from '../components/catalyst/dialog';
import { Badge } from '../components/catalyst/badge';
import { Select } from '../components/catalyst/select';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SprintTask {
  id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  position: number;
  created_at: string;
  updated_at: string;
  labels: string[];
  next_action: string | null;
}

interface NextActionHistoryEntry {
  id: number;
  task_id: number;
  action: string;
  resolved_at: string;
}

interface WorkLink {
  id: number;
  task_id: number;
  entry_source: 'manual' | 'auto';
  entry_id: number;
  linked_at: string;
  description: string;
  timestamp: string;
  relevance_score?: number;
}

type StatusKey = 'todo' | 'in-progress' | 'done' | 'blocked';
type PriorityKey = 'low' | 'medium' | 'high';

const COLUMNS: StatusKey[] = ['todo', 'in-progress', 'done', 'blocked'];

const PRIORITY_COLORS: Record<PriorityKey, string> = {
  low: 'border-l-zinc-400',
  medium: 'border-l-amber-400',
  high: 'border-l-red-500',
};

const PRIORITY_BADGE: Record<PriorityKey, 'zinc' | 'yellow' | 'red'> = {
  low: 'zinc',
  medium: 'yellow',
  high: 'red',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onStatusChange,
  onClick,
  onPointerDown,
  isDragging,
}: {
  task: SprintTask;
  onStatusChange: (id: number, status: StatusKey) => void;
  onClick: () => void;
  onPointerDown: (e: React.PointerEvent, task: SprintTask) => void;
  isDragging: boolean;
}) {
  const { t } = useTranslation('sprintboard');

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, task)}
      className={`bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 border-l-4 ${PRIORITY_COLORS[task.priority]} p-3 cursor-grab hover:shadow-md transition-shadow select-none touch-none ${isDragging ? 'opacity-40' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-tight flex-1">
          {task.title}
        </span>
      </div>

      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((label) => (
            <Badge key={label} color="blue" className="text-xs">{label}</Badge>
          ))}
        </div>
      )}

      {task.next_action && (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <ClockIcon className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{task.next_action}</span>
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <Badge color={PRIORITY_BADGE[task.priority]} className="text-xs">
          {t(`priority.${task.priority}`)}
        </Badge>
        <select
          value={task.status}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(task.id, e.target.value as StatusKey);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="text-xs h-6 rounded px-1 pr-5 bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M5.75 10.75L8 13L10.25 10.75' stroke='%2371717a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M10.25 5.25L8 3L5.75 5.25' stroke='%2371717a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
        >
          {COLUMNS.map((col) => (
            <option key={col} value={col}>{t(`columns.${col}`)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── WorkLinksPanel ───────────────────────────────────────────────────────────

function WorkLinksPanel({ taskId }: { taskId: number }) {
  const { t } = useTranslation('sprintboard');
  const [linked, setLinked] = useState<WorkLink[]>([]);
  const [suggestions, setSuggestions] = useState<WorkLink[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLinks = async () => {
    setLoading(true);
    try {
      const [links, sugs] = await Promise.all([
        invoke<WorkLink[]>('get_task_work_links', { taskId }),
        invoke<WorkLink[]>('suggest_work_links', { taskId }),
      ]);
      setLinked(links);
      setSuggestions(sugs);
    } catch (err) {
      console.error('Failed to load work links:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, [taskId]);

  const handleLink = async (sug: WorkLink) => {
    try {
      await invoke('add_work_link', {
        taskId: sug.task_id,
        entrySource: sug.entry_source,
        entryId: sug.entry_id,
      });
      await loadLinks();
    } catch (err) {
      console.error('Failed to link work entry:', err);
    }
  };

  const handleUnlink = async (linkId: number) => {
    try {
      await invoke('remove_work_link', { linkId });
      await loadLinks();
    } catch (err) {
      console.error('Failed to unlink work entry:', err);
    }
  };

  if (loading) {
    return <Text className="text-xs text-zinc-500">Loading…</Text>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
          {t('workLinks.linked')} ({linked.length})
        </Text>
        {linked.length === 0 ? (
          <Text className="text-xs text-zinc-400">{t('workLinks.noLinked')}</Text>
        ) : (
          <div className="flex flex-col gap-2">
            {linked.map((link) => (
              <div key={link.id} className="flex items-start gap-2 p-2 rounded bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs text-zinc-400">{formatRelativeTime(link.timestamp)}</span>
                    <Badge color={link.entry_source === 'auto' ? 'purple' : 'green'} className="text-xs">
                      {link.entry_source === 'auto' ? t('workLinks.auto') : t('workLinks.manual')}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug">
                    {truncate(link.description, 80)}
                  </p>
                </div>
                <button
                  onClick={() => handleUnlink(link.id)}
                  className="text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0 text-xs font-medium"
                  title={t('workLinks.unlink')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
          {t('workLinks.suggestions')} ({suggestions.length})
        </Text>
        {suggestions.length === 0 ? (
          <Text className="text-xs text-zinc-400">{t('workLinks.noSuggestions')}</Text>
        ) : (
          <div className="flex flex-col gap-2">
            {suggestions.map((sug, idx) => (
              <div key={`${sug.entry_source}-${sug.entry_id}-${idx}`} className="flex items-start gap-2 p-2 rounded bg-zinc-50 dark:bg-zinc-700/50 border border-dashed border-zinc-300 dark:border-zinc-600">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs text-zinc-400">{formatRelativeTime(sug.timestamp)}</span>
                    <Badge color={sug.entry_source === 'auto' ? 'purple' : 'green'} className="text-xs">
                      {sug.entry_source === 'auto' ? t('workLinks.auto') : t('workLinks.manual')}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug">
                    {truncate(sug.description, 80)}
                  </p>
                </div>
                <button
                  onClick={() => handleLink(sug)}
                  className="text-zinc-400 hover:text-blue-500 transition-colors flex-shrink-0 text-xs font-medium"
                  title={t('workLinks.link')}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TaskDetailDialog ─────────────────────────────────────────────────────────

function TaskDetailDialog({
  task,
  onClose,
  onSave,
  onDelete,
  onResolve,
}: {
  task: SprintTask | null;
  onClose: () => void;
  onSave: (updated: Partial<SprintTask>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onResolve: (id: number) => Promise<void>;
}) {
  const { t } = useTranslation('sprintboard');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<StatusKey>('todo');
  const [priority, setPriority] = useState<PriorityKey>('medium');
  const [labelInput, setLabelInput] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [nextAction, setNextAction] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<NextActionHistoryEntry[]>([]);
  const [resolving, setResolving] = useState(false);

  const loadHistory = async (taskId: number) => {
    try {
      const h = await invoke<NextActionHistoryEntry[]>('get_next_action_history', { taskId });
      setHistory(h);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setStatus(task.status);
      setPriority(task.priority);
      setLabels(task.labels);
      setNextAction(task.next_action ?? '');
      setHistory([]);
      loadHistory(task.id);
    }
  }, [task]);

  const handleSave = async () => {
    if (!task || !title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: task.id,
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        position: task.position,
        labels,
        next_action: nextAction.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!task) return;
    setResolving(true);
    try {
      await invoke('resolve_next_action', { taskId: task.id });
      setNextAction('');
      await loadHistory(task.id);
      await onResolve(task.id);
    } finally {
      setResolving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!window.confirm(t('taskForm.confirmDelete'))) return;
    await onDelete(task.id);
    onClose();
  };

  const addLabel = () => {
    const val = labelInput.trim();
    if (val && !labels.includes(val)) {
      setLabels([...labels, val]);
    }
    setLabelInput('');
  };

  const removeLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label));
  };

  return (
    <Dialog open={task !== null} onClose={onClose} size="4xl">
      <DialogTitle>{task ? task.title : ''}</DialogTitle>
      <DialogBody>
        <div className="flex gap-6 min-h-0">
          {/* Left: task form */}
          <div className="flex-[3] flex flex-col gap-4 min-w-0">
            <Field>
              <Label>{t('taskForm.titleLabel')}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('taskForm.titlePlaceholder')}
              />
            </Field>

            <Field>
              <Label>{t('taskForm.descriptionLabel')}</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('taskForm.descriptionPlaceholder')}
                rows={4}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </Field>

            <div className="flex gap-4">
              <Field className="flex-1">
                <Label>{t('taskForm.statusLabel')}</Label>
                <Select value={status} onChange={(e) => setStatus(e.target.value as StatusKey)}>
                  {COLUMNS.map((col) => (
                    <option key={col} value={col}>{t(`columns.${col}`)}</option>
                  ))}
                </Select>
              </Field>
              <Field className="flex-1">
                <Label>{t('taskForm.priorityLabel')}</Label>
                <Select value={priority} onChange={(e) => setPriority(e.target.value as PriorityKey)}>
                  {(['low', 'medium', 'high'] as PriorityKey[]).map((p) => (
                    <option key={p} value={p}>{t(`priority.${p}`)}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field>
              <Label>{t('taskForm.labelsLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                  placeholder={t('taskForm.labelsPlaceholder')}
                  className="flex-1"
                />
                <Button plain onClick={addLabel} type="button">+</Button>
              </div>
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {labels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200"
                    >
                      {label}
                      <button onClick={() => removeLabel(label)} className="hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
              )}
            </Field>

            <Field>
              <Label>{t('taskForm.nextActionLabel')}</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder={t('taskForm.nextActionPlaceholder')}
                  maxLength={200}
                  className="flex-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {nextAction.trim() && (
                  <button
                    type="button"
                    onClick={handleResolve}
                    disabled={resolving}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/60 transition-colors disabled:opacity-50"
                    title={t('taskForm.resolveNextAction')}
                  >
                    {resolving ? '…' : t('taskForm.resolveNextAction')}
                  </button>
                )}
              </div>
              {history.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t('taskForm.nextActionHistory')}
                  </span>
                  {history.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-700/40 border border-zinc-200 dark:border-zinc-600">
                      <span className="text-xs text-zinc-500 flex-shrink-0 mt-0.5">{formatRelativeTime(entry.resolved_at)}</span>
                      <span className="text-xs text-zinc-500 line-through leading-snug">{entry.action}</span>
                    </div>
                  ))}
                </div>
              )}
            </Field>
          </div>

          {/* Right: work links */}
          <div className="flex-[2] border-l border-zinc-200 dark:border-zinc-700 pl-6 overflow-y-auto min-w-0">
            <Text className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              {t('workLinks.title')}
            </Text>
            {task && <WorkLinksPanel taskId={task.id} />}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={handleDelete} className="mr-auto text-red-600 hover:text-red-700">
          {t('taskForm.delete')}
        </Button>
        <Button plain onClick={onClose}>{t('taskForm.cancel')}</Button>
        <Button onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? '…' : t('taskForm.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── CreateTaskDialog ──────────────────────────────────────────────────────────

function CreateTaskDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, description: string | null, priority: PriorityKey) => Promise<void>;
}) {
  const { t } = useTranslation('sprintboard');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<PriorityKey>('medium');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setPriority('medium');
    }
  }, [open]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreate(title.trim(), description.trim() || null, priority);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>{t('taskForm.create')}</DialogTitle>
      <DialogBody>
        <div className="flex flex-col gap-4">
          <Field>
            <Label>{t('taskForm.titleLabel')}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder={t('taskForm.titlePlaceholder')}
              autoFocus
            />
          </Field>
          <Field>
            <Label>{t('taskForm.descriptionLabel')}</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('taskForm.descriptionPlaceholder')}
              rows={3}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </Field>
          <Field>
            <Label>{t('taskForm.priorityLabel')}</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as PriorityKey)}>
              {(['low', 'medium', 'high'] as PriorityKey[]).map((p) => (
                <option key={p} value={p}>{t(`priority.${p}`)}</option>
              ))}
            </Select>
          </Field>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>{t('taskForm.cancel')}</Button>
        <Button onClick={handleCreate} disabled={saving || !title.trim()}>
          {saving ? '…' : t('taskForm.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── BoardColumn ──────────────────────────────────────────────────────────────

function BoardColumn({
  status,
  tasks,
  onStatusChange,
  onTaskClick,
  onPointerDown,
  draggingTaskId,
  isOver,
}: {
  status: StatusKey;
  tasks: SprintTask[];
  onStatusChange: (id: number, status: StatusKey) => void;
  onTaskClick: (task: SprintTask) => void;
  onPointerDown: (e: React.PointerEvent, task: SprintTask) => void;
  draggingTaskId: number | null;
  isOver: boolean;
}) {
  const { t } = useTranslation('sprintboard');

  const columnHeaderColors: Record<StatusKey, string> = {
    'todo': 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
    'in-progress': 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    'done': 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    'blocked': 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0" data-column={status}>
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${columnHeaderColors[status]}`}>
        <span className="text-xs font-semibold uppercase tracking-wide">
          {t(`columns.${status}`)}
        </span>
        <span className="text-xs font-medium opacity-70">{tasks.length}</span>
      </div>
      <div
        className={`flex-1 flex flex-col gap-2 p-2 rounded-b-lg border border-t-0 overflow-y-auto min-h-[200px] transition-colors ${
          isOver
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600'
            : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-700'
        }`}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onStatusChange={onStatusChange}
            onClick={() => onTaskClick(task)}
            onPointerDown={onPointerDown}
            isDragging={draggingTaskId === task.id}
          />
        ))}
        {tasks.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs text-zinc-400">—</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SprintBoardView ──────────────────────────────────────────────────────────

export function SprintBoardView() {
  const { t } = useTranslation('sprintboard');
  const [tasks, setTasks] = useState<SprintTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<SprintTask | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<PriorityKey | 'all'>('all');
  const [draggingTask, setDraggingTask] = useState<SprintTask | null>(null);
  const [overColumn, setOverColumn] = useState<StatusKey | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const overColumnRef = useRef<StatusKey | null>(null);

  const loadTasks = async () => {
    try {
      const result = await invoke<SprintTask[]>('get_sprint_tasks');
      setTasks(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreate = async (title: string, description: string | null, priority: PriorityKey) => {
    await invoke('create_sprint_task', { title, description, priority });
    await loadTasks();
  };

  const handleSave = async (updated: Partial<SprintTask>) => {
    await invoke('update_sprint_task', {
      id: updated.id,
      title: updated.title,
      description: updated.description ?? null,
      status: updated.status,
      priority: updated.priority,
      position: updated.position ?? 0,
      nextAction: updated.next_action ?? null,
    });
    if (updated.labels !== undefined) {
      await invoke('update_task_labels', { taskId: updated.id, labels: updated.labels });
    }
    await loadTasks();
  };

  const handleDelete = async (id: number) => {
    await invoke('delete_sprint_task', { id });
    await loadTasks();
  };

  const handleResolveNextAction = async (_id: number) => {
    await loadTasks();
  };

  const handleStatusChange = async (id: number, status: StatusKey) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    await invoke('update_sprint_task', {
      id: task.id,
      title: task.title,
      description: task.description ?? null,
      status,
      priority: task.priority,
      position: task.position,
      nextAction: task.next_action ?? null,
    });
    await loadTasks();
  };

  const handlePointerDown = (e: React.PointerEvent, task: SprintTask) => {
    // Only left button / primary pointer
    if (e.button !== 0) return;
    e.preventDefault();
    pointerOrigin.current = { x: e.clientX, y: e.clientY };

    const onMove = (ev: PointerEvent) => {
      const origin = pointerOrigin.current;
      if (!origin) return;

      // Only start dragging after a small threshold to distinguish clicks
      const dist = Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y);
      if (dist < 6 && !ghostRef.current) return;

      // Create ghost element once
      if (!ghostRef.current) {
        const ghost = document.createElement('div');
        ghost.className =
          'fixed pointer-events-none z-50 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-300 shadow-xl px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100 opacity-90 max-w-[180px] truncate';
        ghost.textContent = task.title;
        document.body.appendChild(ghost);
        ghostRef.current = ghost;
        setDraggingTask(task);
      }

      // Move ghost
      const ghost = ghostRef.current;
      ghost.style.left = `${ev.clientX + 12}px`;
      ghost.style.top = `${ev.clientY - 16}px`;

      // Find which column is under the cursor
      ghost.style.display = 'none';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      ghost.style.display = '';
      const colEl = el?.closest('[data-column]');
      const col = colEl?.getAttribute('data-column') as StatusKey | null;
      overColumnRef.current = col;
      setOverColumn(col);
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      if (ghostRef.current) {
        ghostRef.current.remove();
        ghostRef.current = null;
      }

      setDraggingTask(null);
      setOverColumn(null);
      pointerOrigin.current = null;

      // Determine target column at drop point
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const colEl = el?.closest('[data-column]');
      const targetStatus = (colEl?.getAttribute('data-column') as StatusKey | null) ?? overColumnRef.current;
      overColumnRef.current = null;

      if (targetStatus && targetStatus !== task.status) {
        await handleStatusChange(task.id, targetStatus);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const filteredTasks = priorityFilter === 'all'
    ? tasks
    : tasks.filter((t) => t.priority === priorityFilter);

  const tasksByStatus = (status: StatusKey) =>
    filteredTasks.filter((t) => t.status === status);

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <Heading>{t('title')}</Heading>
        <div className="flex items-center gap-3">
          {/* Priority filter chips */}
          <div className="flex gap-1">
            {(['all', 'low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  priorityFilter === p
                    ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
                }`}
              >
                {t(`filter.${p}`)}
              </button>
            ))}
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            {t('addTask')}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 flex-shrink-0">
          {error}
        </div>
      )}

      {/* Board columns */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Text className="text-zinc-400">Loading…</Text>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Text className="text-zinc-500 font-medium">{t('empty.title')}</Text>
          <Text className="text-zinc-400 text-sm">{t('empty.description')}</Text>
        </div>
      ) : (
        <div className="flex-1 flex gap-3 min-h-0 overflow-x-auto">
          {COLUMNS.map((col) => (
            <BoardColumn
              key={col}
              status={col}
              tasks={tasksByStatus(col)}
              onStatusChange={handleStatusChange}
              onTaskClick={setSelectedTask}
              onPointerDown={handlePointerDown}
              draggingTaskId={draggingTask?.id ?? null}
              isOver={overColumn === col}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateTaskDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreate}
      />

      <TaskDetailDialog
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        onResolve={handleResolveNextAction}
      />
    </div>
  );
}

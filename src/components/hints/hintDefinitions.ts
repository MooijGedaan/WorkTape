import type { HintId } from '../../hooks/useTooltipHints';

export interface HintDefinition {
  id: HintId;
  title: string;
  body: string;
  icon: 'cursor' | 'link' | 'sparkles' | 'drag' | 'calendar' | 'chart' | 'camera';
  accentColor: string;
}

export const HINT_DEFINITIONS: Record<HintId, HintDefinition> = {
  'worklog-click-to-edit': {
    id: 'worklog-click-to-edit',
    title: 'Click any entry to edit',
    body: 'Tap a work log entry to update its description or next action inline.',
    icon: 'cursor',
    accentColor: 'text-blue-500 dark:text-blue-400',
  },
  'worklog-sprint-linking': {
    id: 'worklog-sprint-linking',
    title: 'Link entries to sprint tasks',
    body: 'Use the task selector below the input to associate new entries with an active sprint task.',
    icon: 'link',
    accentColor: 'text-violet-500 dark:text-violet-400',
  },
  'worklog-regenerate-summary': {
    id: 'worklog-regenerate-summary',
    title: 'Regenerate AI summaries',
    body: "Click the italic link below each day's entries to regenerate an AI summary for that day.",
    icon: 'sparkles',
    accentColor: 'text-amber-500 dark:text-amber-400',
  },
  'sprint-drag-drop': {
    id: 'sprint-drag-drop',
    title: 'Drag to move tasks',
    body: 'Drag and drop cards between columns to update their status instantly.',
    icon: 'drag',
    accentColor: 'text-blue-500 dark:text-blue-400',
  },
  'sprint-next-action': {
    id: 'sprint-next-action',
    title: 'Track your next action',
    body: 'Open a task and set a "next action" so you always know what to do when you return.',
    icon: 'cursor',
    accentColor: 'text-green-500 dark:text-green-400',
  },
  'calendar-week-navigation': {
    id: 'calendar-week-navigation',
    title: 'Browse past weeks',
    body: 'Scroll down to see earlier weeks. Each day shows your entry count and AI summary.',
    icon: 'calendar',
    accentColor: 'text-blue-500 dark:text-blue-400',
  },
  'home-stats': {
    id: 'home-stats',
    title: 'Your logging streak',
    body: 'WorkRecall tracks your daily logging streak. Log at least one entry each day to keep it going.',
    icon: 'chart',
    accentColor: 'text-green-500 dark:text-green-400',
  },
  'settings-auto-capture': {
    id: 'settings-auto-capture',
    title: 'Auto-capture works in the background',
    body: 'Enable Automatic Work Logging to let WorkRecall capture your activity silently — no manual prompts needed.',
    icon: 'camera',
    accentColor: 'text-blue-500 dark:text-blue-400',
  },
};

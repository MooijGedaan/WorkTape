import type { HintId } from '../../hooks/useTooltipHints';

export interface HintDefinition {
  id: HintId;
  icon: 'cursor' | 'link' | 'sparkles' | 'drag' | 'calendar' | 'chart';
  accentColor: string;
}

export const HINT_DEFINITIONS: Record<HintId, HintDefinition> = {
  'worklog-click-to-edit': {
    id: 'worklog-click-to-edit',
    icon: 'cursor',
    accentColor: 'text-blue-500 dark:text-blue-400',
  },
  'worklog-sprint-linking': {
    id: 'worklog-sprint-linking',
    icon: 'link',
    accentColor: 'text-violet-500 dark:text-violet-400',
  },
  'sprint-drag-drop': {
    id: 'sprint-drag-drop',
    icon: 'drag',
    accentColor: 'text-blue-500 dark:text-blue-400',
  },
  'sprint-next-action': {
    id: 'sprint-next-action',
    icon: 'cursor',
    accentColor: 'text-green-500 dark:text-green-400',
  },
  'calendar-week-navigation': {
    id: 'calendar-week-navigation',
    icon: 'calendar',
    accentColor: 'text-blue-500 dark:text-blue-400',
  },
  'home-stats': {
    id: 'home-stats',
    icon: 'chart',
    accentColor: 'text-green-500 dark:text-green-400',
  },
};

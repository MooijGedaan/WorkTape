import { createContext, useContext, useState } from 'react';

export type HintId =
  | 'worklog-click-to-edit'
  | 'worklog-sprint-linking'
  | 'worklog-regenerate-summary'
  | 'sprint-drag-drop'
  | 'sprint-next-action'
  | 'calendar-week-navigation'
  | 'home-stats'
  | 'settings-auto-capture';

interface TooltipHintsContextValue {
  isSeen: (id: HintId) => boolean;
  markSeen: (id: HintId) => void;
  isAllDisabled: boolean;
  disableAll: () => void;
  enableAll: () => void;
}

const TooltipHintsContext = createContext<TooltipHintsContextValue>({
  isSeen: () => true,
  markSeen: () => {},
  isAllDisabled: true,
  disableAll: () => {},
  enableAll: () => {},
});

const SEEN_KEY = 'tooltip-hints-seen';
const DISABLED_KEY = 'tooltip-hints-disabled';

export function TooltipHintProvider({ children }: { children: React.ReactNode }) {
  const [seenIds, setSeenIds] = useState<Record<string, true>>(() => {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [isAllDisabled, setIsAllDisabled] = useState<boolean>(() => {
    return localStorage.getItem(DISABLED_KEY) === 'true';
  });

  const isSeen = (id: HintId) => Boolean(seenIds[id]);

  const markSeen = (id: HintId) => {
    const next = { ...seenIds, [id]: true as const };
    setSeenIds(next);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  };

  const disableAll = () => {
    setIsAllDisabled(true);
    localStorage.setItem(DISABLED_KEY, 'true');
  };

  const enableAll = () => {
    setIsAllDisabled(false);
    localStorage.removeItem(DISABLED_KEY);
  };

  return (
    <TooltipHintsContext.Provider value={{ isSeen, markSeen, isAllDisabled, disableAll, enableAll }}>
      {children}
    </TooltipHintsContext.Provider>
  );
}

export function useTooltipHints() {
  const ctx = useContext(TooltipHintsContext);
  if (!ctx) throw new Error('useTooltipHints must be used within TooltipHintProvider');
  return ctx;
}

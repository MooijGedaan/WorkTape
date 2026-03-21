import { useNavigation } from '../hooks/useNavigation.tsx';
import { ErrorBoundary } from './ErrorBoundary';
import { HomeView } from '../views/HomeView';
import { WorkLogView } from '../views/WorkLogView';
import { SettingsView } from '../views/SettingsView';
import { ExportView } from '../views/ExportView';
import { CalendarView } from '../views/CalendarView';
import { SprintBoardView } from '../views/SprintBoardView';
import { motion, AnimatePresence } from 'motion/react';

export function ViewRouter() {
  const { currentView } = useNavigation();

  const views = {
    'home': <HomeView />,
    'work-log': <WorkLogView />,
    'calendar': <CalendarView />,
    'sprint-board': <SprintBoardView />,
    'settings': <SettingsView />,
    'export': <ExportView />,
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentView}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="h-full flex flex-col"
      >
        <ErrorBoundary key={currentView}>
          {views[currentView] || views['work-log']}
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

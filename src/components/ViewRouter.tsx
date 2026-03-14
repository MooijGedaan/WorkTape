import { useNavigation } from '../hooks/useNavigation.tsx';
import { ErrorBoundary } from './ErrorBoundary';
import { HomeView } from '../views/HomeView';
import { WorkLogView } from '../views/WorkLogView';
import { SettingsView } from '../views/SettingsView';
import { ExportView } from '../views/ExportView';
import { AISummaryView } from '../views/AISummaryView';
import { CalendarView } from '../views/CalendarView';
import { ScreenCaptureTestView } from '../views/ScreenCaptureTestView';
import ApiLogsView from '../views/ApiLogsView';
import { SprintBoardView } from '../views/SprintBoardView';
import { motion, AnimatePresence } from 'motion/react';

export function ViewRouter() {
  const { currentView } = useNavigation();

  const views = {
    'home': <HomeView />,
    'work-log': <WorkLogView />,
    'ai-summary': <AISummaryView />,
    'calendar': <CalendarView />,
    'sprint-board': <SprintBoardView />,
    'settings': <SettingsView />,
    'export': <ExportView />,
    'screen-capture-test': <ScreenCaptureTestView />,
    'api-logs': <ApiLogsView />,
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentView}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.15 }}
        className="h-full flex flex-col"
      >
        <ErrorBoundary key={currentView}>
          {views[currentView] || views['work-log']}
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

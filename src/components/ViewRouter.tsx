import { useNavigation } from '../hooks/useNavigation.tsx';
import { HomeView } from '../views/HomeView';
import { WorkLogView } from '../views/WorkLogView';
import { SettingsView } from '../views/SettingsView';
import { ExportView } from '../views/ExportView';
import { AISummaryView } from '../views/AISummaryView';
import { motion, AnimatePresence } from 'motion/react';

export function ViewRouter() {
  const { currentView } = useNavigation();

  const views = {
    'home': <HomeView />,
    'work-log': <WorkLogView />,
    'ai-summary': <AISummaryView />,
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
        transition={{ duration: 0.15 }}
        className="h-full flex flex-col"
      >
        {views[currentView] || views['work-log']}
      </motion.div>
    </AnimatePresence>
  );
}

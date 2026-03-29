import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { SidebarLayout } from './catalyst/sidebar-layout';
import {
  Sidebar,
  SidebarBody,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from './catalyst/sidebar';
import { Dialog, DialogTitle, DialogDescription, DialogActions } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { TitleBar } from './TitleBar';
import { ErrorNotification } from './ErrorNotification';
import { useNavigation } from '../hooks/useNavigation.tsx';
import { useUpdater } from '../hooks/useUpdater';
import {
  HomeIcon,
  DocumentIcon,
  CogIcon,
  ArrowDownTrayIcon,
  QuestionMarkCircleIcon,
  CalendarDaysIcon,
  ViewColumnsIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from './icons';

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('common');
  const { currentView, navigate } = useNavigation();
  const updater = useUpdater();
  const [isDayEnded, setIsDayEnded] = useState(false);
  const [isEndingDay, setIsEndingDay] = useState(false);
  const [showEndDayConfirm, setShowEndDayConfirm] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    const todayStr = toLocalDateString(new Date());
    invoke<boolean>('is_day_ended', { date: todayStr }).then(setIsDayEnded).catch(console.error);
  }, []);

  // Check for updates on mount
  useEffect(() => {
    // Small delay to not block initial render
    const timer = setTimeout(() => {
      updater.checkForUpdates();
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const setDayEnded = useCallback(() => setIsDayEnded(true), []);
  const setDayUnended = useCallback(() => setIsDayEnded(false), []);
  useTauriEvent('day-ended', setDayEnded);
  useTauriEvent('day-unended', setDayUnended);

  const handleEndDay = () => {
    if (isDayEnded || isEndingDay) return;
    setShowEndDayConfirm(true);
  };

  const confirmEndDay = async () => {
    setShowEndDayConfirm(false);
    setIsEndingDay(true);
    try {
      const todayStr = toLocalDateString(new Date());
      await invoke('end_day', { date: todayStr });
      await emit('day-ended', { date: todayStr });
      setIsDayEnded(true);
    } catch (err) {
      console.error('Failed to end day:', err);
    } finally {
      setIsEndingDay(false);
    }
  };

  return (
    <>
    <ErrorNotification
      show={infoMessage !== null}
      message={infoMessage ?? ''}
      onClose={() => setInfoMessage(null)}
      variant="info"
    />
    <SidebarLayout
      titleBar={<TitleBar />}
      sidebar={
        <Sidebar>

          {/* Sidebar Body - Navigation */}
          <SidebarBody>
            {/* Primary Navigation */}
            <SidebarSection>
              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('home'); }}
                current={currentView === 'home'}
              >
                <HomeIcon />
                <SidebarLabel>{t('navigation.home')}</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('work-log'); }}
                current={currentView === 'work-log'}
              >
                <DocumentIcon />
                <SidebarLabel>{t('navigation.workLog')}</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('calendar'); }}
                current={currentView === 'calendar'}
              >
                <CalendarDaysIcon />
                <SidebarLabel>{t('navigation.calendar')}</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('sprint-board'); }}
                current={currentView === 'sprint-board'}
              >
                <ViewColumnsIcon />
                <SidebarLabel>{t('navigation.sprintBoard')}</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('analytics'); }}
                current={currentView === 'analytics'}
              >
                <ChartBarIcon />
                <SidebarLabel>{t('navigation.analytics')}</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('export'); }}
                current={currentView === 'export'}
              >
                <ArrowDownTrayIcon />
                <SidebarLabel>{t('navigation.export')}</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('settings'); }}
                current={currentView === 'settings'}
              >
                <CogIcon />
                <SidebarLabel>{t('navigation.settings')}</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            {/* Spacer pushes bottom section to bottom */}
            <SidebarSpacer />

            {/* Secondary Navigation */}
            <SidebarSection>
              <SidebarItem
                onClick={(e) => { e.preventDefault(); handleEndDay(); }}
                aria-disabled={isDayEnded || isEndingDay}
                style={{ opacity: isDayEnded ? 0.5 : 1, cursor: isDayEnded ? 'default' : 'pointer' }}
              >
                <CheckCircleIcon />
                <SidebarLabel>
                  {isDayEnded ? t('endDay.ended') : isEndingDay ? t('endDay.ending') : t('endDay.label')}
                </SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); setInfoMessage(t('endDay.helpComingSoon')); }}
              >
                <QuestionMarkCircleIcon />
                <SidebarLabel>{t('navigation.help')}</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>

          {/* Sidebar Footer - Optional: User info, dark mode toggle */}
          {/* <SidebarFooter>
            // Future: User profile, dark mode switch
          </SidebarFooter> */}
        </Sidebar>
      }
    >
      {/* Main Content Area with padding */}
      <div className="flex-1 flex flex-col p-6 min-h-0">
        {updater.available && updater.version && (
          <div className="mx-auto max-w-6xl w-full mb-0 px-0">
            <button
              onClick={() => { navigate('settings'); }}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors cursor-pointer mb-4"
            >
              <span>
                {t('updateAvailable', { version: updater.version })}
              </span>
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {t('viewUpdate')}
              </span>
            </button>
          </div>
        )}
        <div className="mx-auto max-w-6xl w-full flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </div>

      <Dialog open={showEndDayConfirm} onClose={() => setShowEndDayConfirm(false)}>
        <DialogTitle>{t('endDay.confirmTitle')}</DialogTitle>
        <DialogDescription>
          {t('endDay.confirmDescription')}
        </DialogDescription>
        <DialogActions>
          <Button plain onClick={() => setShowEndDayConfirm(false)}>{t('actions.cancel')}</Button>
          <Button color="red" onClick={confirmEndDay}>{t('endDay.label')}</Button>
        </DialogActions>
      </Dialog>
    </SidebarLayout>
    </>
  );
}

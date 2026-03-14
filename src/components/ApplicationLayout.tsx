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
import {
  HomeIcon,
  DocumentIcon,
  CogIcon,
  ArrowDownTrayIcon,
  SparklesIcon,
  QuestionMarkCircleIcon,
  CameraIcon,
  CalendarDaysIcon,
  ViewColumnsIcon,
  CheckCircleIcon,
} from './icons';

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('common');
  const { currentView, navigate } = useNavigation();
  const [isDayEnded, setIsDayEnded] = useState(false);
  const [isEndingDay, setIsEndingDay] = useState(false);
  const [showEndDayConfirm, setShowEndDayConfirm] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    const todayStr = toLocalDateString(new Date());
    invoke<boolean>('is_day_ended', { date: todayStr }).then(setIsDayEnded).catch(console.error);
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
                onClick={(e) => { e.preventDefault(); navigate('ai-summary'); }}
                current={currentView === 'ai-summary'}
              >
                <SparklesIcon />
                <SidebarLabel>{t('navigation.aiSummary')}</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('calendar'); }}
                current={currentView === 'calendar'}
              >
                <CalendarDaysIcon />
                <SidebarLabel>Calendar</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('sprint-board'); }}
                current={currentView === 'sprint-board'}
              >
                <ViewColumnsIcon />
                <SidebarLabel>Sprint Board</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('export'); }}
                current={currentView === 'export'}
              >
                <ArrowDownTrayIcon />
                <SidebarLabel>{t('navigation.export')}</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('screen-capture-test'); }}
                current={currentView === 'screen-capture-test'}
              >
                <CameraIcon />
                <SidebarLabel>Screen Capture Test</SidebarLabel>
                
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
                  {isDayEnded ? 'Day ended' : isEndingDay ? 'Ending…' : 'End the day'}
                </SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); setInfoMessage('Help & Support coming soon!'); }}
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
        <div className="mx-auto max-w-6xl w-full flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </div>

      <Dialog open={showEndDayConfirm} onClose={() => setShowEndDayConfirm(false)}>
        <DialogTitle>End today's work log?</DialogTitle>
        <DialogDescription>
          No new entries can be added after this. You'll be able to generate an AI summary once the day is ended.
        </DialogDescription>
        <DialogActions>
          <Button plain onClick={() => setShowEndDayConfirm(false)}>Cancel</Button>
          <Button color="red" onClick={confirmEndDay}>End the day</Button>
        </DialogActions>
      </Dialog>
    </SidebarLayout>
    </>
  );
}

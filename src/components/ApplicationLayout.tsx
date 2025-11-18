import { useTranslation } from 'react-i18next';
import { SidebarLayout } from './catalyst/sidebar-layout';
import {
  Sidebar,
  SidebarBody,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from './catalyst/sidebar';
import { TitleBar } from './TitleBar';
import { useNavigation } from '../hooks/useNavigation.tsx';
import {
  HomeIcon,
  DocumentIcon,
  CogIcon,
  ArrowDownTrayIcon,
  SparklesIcon,
  QuestionMarkCircleIcon,
  CameraIcon,
} from './icons';

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('common');
  const { currentView, navigate } = useNavigation();

  return (
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

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('screen-capture-test'); }}
                current={currentView === 'screen-capture-test'}
              >
                <CameraIcon />
                <SidebarLabel>Screen Capture Test</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            {/* Spacer pushes bottom section to bottom */}
            <SidebarSpacer />

            {/* Secondary Navigation */}
            <SidebarSection>
              <SidebarItem
                onClick={(e) => { e.preventDefault(); alert('Help & Support coming soon!'); }}
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
    </SidebarLayout>
  );
}

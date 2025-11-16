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
} from './icons';

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const { currentView, navigate } = useNavigation();

  return (
    <SidebarLayout
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
                <SidebarLabel>Home</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('work-log'); }}
                current={currentView === 'work-log'}
              >
                <DocumentIcon />
                <SidebarLabel>Work Log</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('ai-summary'); }}
                current={currentView === 'ai-summary'}
              >
                <SparklesIcon />
                <SidebarLabel>AI Summary</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('export'); }}
                current={currentView === 'export'}
              >
                <ArrowDownTrayIcon />
                <SidebarLabel>Export</SidebarLabel>
              </SidebarItem>

              <SidebarItem
                onClick={(e) => { e.preventDefault(); navigate('settings'); }}
                current={currentView === 'settings'}
              >
                <CogIcon />
                <SidebarLabel>Settings</SidebarLabel>
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
                <SidebarLabel>Help & Support</SidebarLabel>
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
      {/* Title Bar */}
      <TitleBar />

      {/* Main Content Area with padding */}
      <div className="flex-1 flex flex-col p-6 min-h-0 overflow-auto">
        <div className="mx-auto max-w-6xl w-full flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </div>
    </SidebarLayout>
  );
}

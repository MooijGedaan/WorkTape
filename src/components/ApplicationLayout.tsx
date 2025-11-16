import { SidebarLayout } from './catalyst/sidebar-layout';
import {
  Sidebar,
  SidebarBody,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from './catalyst/sidebar';
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
          {/* Sidebar Header */}
          <SidebarHeader>
            <div className="flex items-center gap-3 px-2">
              {/* App Logo/Icon */}
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500">
                <span className="text-lg font-bold text-white">W</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                  WorkRecall
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Activity Logger
                </span>
              </div>
            </div>
          </SidebarHeader>

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
      {/* Main Content Area */}
      {children}
    </SidebarLayout>
  );
}

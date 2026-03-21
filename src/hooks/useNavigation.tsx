import { useState, createContext, useContext, useMemo } from 'react';

export type View = 'home' | 'work-log' | 'calendar' | 'sprint-board' | 'settings' | 'export';

interface NavigationContext {
  currentView: View;
  navigate: (view: View) => void;
  goHome: () => void;
  goToSettings: () => void;
  goToWorkLog: () => void;
  goToExport: () => void;
  showOnboarding: () => void;
}

const NavigationContext = createContext<NavigationContext | null>(null);

export function NavigationProvider({
  children,
  onShowOnboarding = () => {},
}: Readonly<{ children: React.ReactNode; onShowOnboarding?: () => void }>) {
  const [currentView, setCurrentView] = useState<View>('work-log');

  const navigate = (view: View) => {
    setCurrentView(view);
  };

  const navigation: NavigationContext = useMemo(() => ({
    currentView,
    navigate,
    goHome: () => navigate('home'),
    goToSettings: () => navigate('settings'),
    goToWorkLog: () => navigate('work-log'),
    goToExport: () => navigate('export'),
    showOnboarding: onShowOnboarding,
  }), [currentView, onShowOnboarding]);

  return (
    <NavigationContext.Provider value={navigation}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
}

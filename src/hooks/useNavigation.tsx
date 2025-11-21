import { useState, useEffect, createContext, useContext } from 'react';

export type View = 'home' | 'work-log' | 'ai-summary' | 'settings' | 'export' | 'screen-capture-test';

interface NavigationContext {
  currentView: View;
  navigate: (view: View) => void;
  goHome: () => void;
  goToSettings: () => void;
  goToWorkLog: () => void;
  goToExport: () => void;
}

const NavigationContext = createContext<NavigationContext | null>(null);

function getInitialView(): View {
  // Get view from URL hash, default to 'work-log'
  const hash = window.location.hash.slice(1); // Remove '#' prefix
  const validViews: View[] = ['home', 'work-log', 'ai-summary', 'settings', 'export', 'screen-capture-test'];
  return validViews.includes(hash as View) ? (hash as View) : 'work-log';
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [currentView, setCurrentView] = useState<View>(getInitialView);

  // Listen for hash changes (e.g., browser back/forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      const validViews: View[] = ['home', 'work-log', 'ai-summary', 'settings', 'export', 'screen-capture-test'];
      if (validViews.includes(hash as View)) {
        setCurrentView(hash as View);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Navigate to a view by setting hash
  const navigate = (view: View) => {
    window.location.hash = view;
    setCurrentView(view);
  };

  const navigation: NavigationContext = {
    currentView,
    navigate,
    goHome: () => navigate('home'),
    goToSettings: () => navigate('settings'),
    goToWorkLog: () => navigate('work-log'),
    goToExport: () => navigate('export'),
  };

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

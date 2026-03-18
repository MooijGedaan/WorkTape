import { useState } from 'react';
import "./App.css";
import { NavigationProvider } from './hooks/useNavigation.tsx';
import { ThemeProvider } from './hooks/useTheme';
import { TooltipHintProvider } from './hooks/useTooltipHints';
import { ApplicationLayout } from './components/ApplicationLayout';
import { ViewRouter } from './components/ViewRouter';
import { OnboardingModal } from './components/OnboardingModal';
import { ErrorBoundary } from './components/ErrorBoundary';

const ONBOARDING_KEY = 'onboarding_dismissed';

function App() {
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) !== 'true'
  );

  const handleOnboardingClose = (dontShowAgain: boolean) => {
    if (dontShowAgain) localStorage.setItem(ONBOARDING_KEY, 'true');
    setOnboardingOpen(false);
  };

  const handleShowOnboarding = () => {
    localStorage.removeItem(ONBOARDING_KEY);
    setOnboardingOpen(true);
  };

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipHintProvider>
        <NavigationProvider onShowOnboarding={handleShowOnboarding}>
          <ApplicationLayout>
            <ViewRouter />
          </ApplicationLayout>
          <OnboardingModal isOpen={onboardingOpen} onClose={handleOnboardingClose} />
        </NavigationProvider>
        </TooltipHintProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

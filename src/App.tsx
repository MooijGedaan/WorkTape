import "./App.css";
import { NavigationProvider } from './hooks/useNavigation.tsx';
import { ApplicationLayout } from './components/ApplicationLayout';
import { ViewRouter } from './components/ViewRouter';

function App() {
  return (
    <NavigationProvider>
      <ApplicationLayout>
        <ViewRouter />
      </ApplicationLayout>
    </NavigationProvider>
  );
}

export default App;

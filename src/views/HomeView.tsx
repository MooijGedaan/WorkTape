import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { useNavigation } from '../hooks/useNavigation.tsx';

export function HomeView() {
  const { goToWorkLog } = useNavigation();

  return (
    <div className="overflow-y-auto h-full">
      <Heading>Welcome to WorkRecall</Heading>
      <Text className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        Track your work activities, build a comprehensive log, and leverage AI-powered summaries
        to showcase your accomplishments.
      </Text>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Quick Stats Cards */}
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Entries</h3>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-white">0</p>
          <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Coming soon: Real-time stats
          </Text>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">This Week</h3>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-white">0</p>
          <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Entries logged this week
          </Text>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Streak</h3>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-white">0 days</p>
          <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Consecutive days logging
          </Text>
        </div>
      </div>

      <div className="mt-8">
        <Button onClick={goToWorkLog} color="blue">
          Go to Work Log
        </Button>
      </div>
    </div>
  );
}

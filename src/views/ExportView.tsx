import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';

export function ExportView() {
  return (
    <div className="max-w-2xl overflow-y-auto h-full">
      <div className="flex items-center gap-3">
        <Heading>Export Data</Heading>
        <Badge color="amber">Premium</Badge>
      </div>

      <Text className="mt-2 text-zinc-600 dark:text-zinc-400">
        Export your work log entries to Excel or CSV format.
      </Text>

      <div className="mt-8 rounded-lg bg-amber-50 p-6 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-900">
        <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          Premium Feature
        </h3>
        <Text className="mt-2 text-amber-800 dark:text-amber-300">
          Export functionality is available in WorkRecall Premium. Upgrade to unlock
          Excel/CSV exports, AI-powered summaries, and advanced analytics.
        </Text>
        <div className="mt-4 flex gap-3">
          <Button color="amber">Upgrade to Premium</Button>
          <Button plain>Learn More</Button>
        </div>
      </div>

      <div className="mt-8 opacity-50 pointer-events-none">
        <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
          Export Options (Preview)
        </h3>
        <div className="mt-4 space-y-3">
          <div>
            <Button disabled className="w-full sm:w-auto">Export as Excel (.xlsx)</Button>
          </div>
          <div>
            <Button disabled className="w-full sm:w-auto">Export as CSV (.csv)</Button>
          </div>
          <div>
            <Button disabled className="w-full sm:w-auto">Export as JSON</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

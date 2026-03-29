import { ChartBarIcon } from '../../components/icons';
import { Text } from '../../components/catalyst/text';
import { Button } from '../../components/catalyst/button';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 mb-4">
        <ChartBarIcon className="h-6 w-6 text-zinc-400 dark:text-zinc-500" />
      </div>
      <h3 className="text-sm font-medium text-zinc-950 dark:text-white">{title}</h3>
      <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">{message}</Text>
      {actionLabel && onAction && (
        <Button className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

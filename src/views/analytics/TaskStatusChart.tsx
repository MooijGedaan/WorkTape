interface TaskStatusChartProps {
  data: Array<{ status: string; count: number }>;
  isLoading: boolean;
}

export function TaskStatusChart({ data: _data, isLoading: _isLoading }: TaskStatusChartProps) {
  return <div className="rounded-lg bg-white p-6 shadow-md ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
    <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">Task Status</h3>
    <div className="h-64" />
  </div>;
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAnalytics } from './useAnalytics';

const mockSelect = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn(() => Promise.resolve({ select: mockSelect })),
  },
}));

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue([]);
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => useAnalytics('7d'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('fetches data and stops loading', async () => {
    mockSelect.mockResolvedValue([]);
    const { result } = renderHook(() => useAnalytics('7d'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });

  it('sets error state on query failure', async () => {
    mockSelect.mockRejectedValue(new Error('DB error'));
    const { result } = renderHook(() => useAnalytics('7d'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('DB error');
  });

  it('re-fetches when period changes', async () => {
    mockSelect.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ period }) => useAnalytics(period),
      { initialProps: { period: '7d' as const } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callCountAfterFirst = mockSelect.mock.calls.length;

    rerender({ period: '30d' as const });

    await waitFor(() => {
      expect(mockSelect.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
    });
  });

  it('returns daily entry counts', async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes('work_entries') && sql.includes('UNION ALL') && sql.includes('auto_work_entries')) {
        return Promise.resolve([
          { date: '2026-03-29', source: 'manual', count: 5 },
          { date: '2026-03-29', source: 'auto', count: 3 },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useAnalytics('7d'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.dailyActivity).toEqual([
      { date: '2026-03-29', source: 'manual', count: 5 },
      { date: '2026-03-29', source: 'auto', count: 3 },
    ]);
  });

  it('returns sprint task status counts', async () => {
    mockSelect.mockImplementation((sql: string) => {
      if (sql.includes('sprint_tasks') && sql.includes('GROUP BY status') && !sql.includes('priority')) {
        return Promise.resolve([
          { status: 'todo', count: 3 },
          { status: 'done', count: 7 },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useAnalytics('7d'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.taskStatusCounts).toEqual([
      { status: 'todo', count: 3 },
      { status: 'done', count: 7 },
    ]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { AnalyticsView } from './AnalyticsView';
import { renderWithI18n } from '../tests/utils/testHelpers';
import { NavigationProvider } from '../hooks/useNavigation';

vi.mock('@tauri-apps/plugin-sql', () => {
  const mockSelect = vi.fn(() => Promise.resolve([{ count: 0 }]));
  return {
    default: {
      load: vi.fn(() =>
        Promise.resolve({
          select: mockSelect,
        })
      ),
    },
  };
});

describe('AnalyticsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the analytics view with heading', async () => {
    renderWithI18n(
      <NavigationProvider>
        <AnalyticsView />
      </NavigationProvider>
    );

    await waitFor(
      () => {
        const headings = screen.getAllByRole('heading');
        expect(headings.length).toBeGreaterThan(0);
      },
      { timeout: 500 }
    );
  });

  it('displays loading state initially', () => {
    renderWithI18n(
      <NavigationProvider>
        <AnalyticsView />
      </NavigationProvider>
    );

    expect(screen.getAllByText('...').length).toBeGreaterThan(0);
  });

  it('renders period selector buttons', () => {
    renderWithI18n(
      <NavigationProvider>
        <AnalyticsView />
      </NavigationProvider>
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('has stat cards in a grid', () => {
    const { container } = renderWithI18n(
      <NavigationProvider>
        <AnalyticsView />
      </NavigationProvider>
    );

    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
  });
});

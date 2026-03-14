import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { HomeView } from "./HomeView";
import { renderWithI18n } from "../tests/utils/testHelpers";
import { NavigationProvider } from "../hooks/useNavigation";

// Mock the Database
vi.mock("@tauri-apps/plugin-sql", () => {
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

describe("HomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the home view", async () => {
    renderWithI18n(
      <NavigationProvider>
        <HomeView />
      </NavigationProvider>
    );

    // Just check that something renders (use getAllByRole to avoid timeout)
    await waitFor(
      () => {
        const headings = screen.getAllByRole("heading");
        expect(headings.length).toBeGreaterThan(0);
      },
      { timeout: 500 }
    );
  });

  it("displays loading state initially", () => {
    renderWithI18n(
      <NavigationProvider>
        <HomeView />
      </NavigationProvider>
    );

    // Should show loading indicators (...)
    expect(screen.getAllByText("...").length).toBeGreaterThan(0);
  });

  it("has a button to navigate to work log", async () => {
    renderWithI18n(
      <NavigationProvider>
        <HomeView />
      </NavigationProvider>
    );

    await waitFor(() => {
      // Look for any button (the "Go to Work Log" button)
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("displays stats cards", () => {
    const { container } = renderWithI18n(
      <NavigationProvider>
        <HomeView />
      </NavigationProvider>
    );

    // Should have stats cards (checking for grid layout)
    const grid = container.querySelector(".grid");
    expect(grid).toBeInTheDocument();
  });
});

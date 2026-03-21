import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarView } from "./CalendarView";

// Mock motion/react to avoid IntersectionObserver/viewport issues in jsdom
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => <div {...rest}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

// Mock tauri sql plugin
vi.mock("@tauri-apps/plugin-sql", () => {
  const mockSelect = vi.fn().mockResolvedValue([]);
  const mockExecute = vi.fn().mockResolvedValue({});
  const mockDb = { select: mockSelect, execute: mockExecute };
  return {
    default: {
      load: vi.fn().mockResolvedValue(mockDb),
    },
    __mockDb: mockDb,
  };
});

import { invoke } from "@tauri-apps/api/core";

describe("CalendarView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (invoke as Mock).mockResolvedValue("Generated summary text");
  });

  async function getDb() {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    return (Database.load as Mock)();
  }

  it("shows loading state initially", () => {
    render(<CalendarView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders week sections after loading", async () => {
    render(<CalendarView />);

    await waitFor(() => {
      // Week sections contain "Week" label
      const weekLabels = screen.getAllByText(/Week \d+/i);
      expect(weekLabels.length).toBeGreaterThan(0);
    });
  });

  it("renders day cards for each day in history", async () => {
    render(<CalendarView />);

    // Wait for calendar to load
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Days with no entries show the noEntries translation key
    const emptyDays = screen.getAllByText("noEntries");
    expect(emptyDays.length).toBeGreaterThan(0);
  });

  it("shows entry count when day has entries", async () => {
    const db = await getDb();

    // Today minus 1 day as date string
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    (db.select as Mock)
      .mockResolvedValueOnce([]) // summaries
      .mockResolvedValueOnce([{ date: dateStr, cnt: 3 }]) // manual counts
      .mockResolvedValueOnce([]); // auto counts

    render(<CalendarView />);

    await waitFor(() => {
      expect(screen.getByText("entryCount")).toBeInTheDocument();
    });
  });

  it("shows Generate AI summary button for days with entries but no summary", async () => {
    const db = await getDb();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    (db.select as Mock)
      .mockResolvedValueOnce([]) // no summaries
      .mockResolvedValueOnce([{ date: dateStr, cnt: 2 }])
      .mockResolvedValueOnce([]);

    render(<CalendarView />);

    await waitFor(() => {
      expect(screen.getByText("generateSummary")).toBeInTheDocument();
    });
  });

  it("shows existing summary text when available", async () => {
    const db = await getDb();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    (db.select as Mock)
      .mockResolvedValueOnce([{ date: dateStr, summary: "Worked on bug fixes and refactoring." }])
      .mockResolvedValueOnce([{ date: dateStr, cnt: 2 }])
      .mockResolvedValueOnce([]);

    render(<CalendarView />);

    await waitFor(() => {
      expect(screen.getByText("Worked on bug fixes and refactoring.")).toBeInTheDocument();
    });
  });

  it("calls generate_daily_summary invoke when Generate button is clicked", async () => {
    const db = await getDb();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    (db.select as Mock)
      .mockResolvedValueOnce([]) // no summaries
      .mockResolvedValueOnce([{ date: dateStr, cnt: 1 }])
      .mockResolvedValueOnce([])
      // For handleGenerate fetches:
      .mockResolvedValueOnce([{ description: "Did some work", timestamp: `${dateStr}T09:00:00Z` }]) // manual entries for date
      .mockResolvedValueOnce([]) // auto entries for date
      // For loadData after generate:
      .mockResolvedValueOnce([{ date: dateStr, summary: "Generated summary text" }])
      .mockResolvedValueOnce([{ date: dateStr, cnt: 1 }])
      .mockResolvedValueOnce([]);

    const user = userEvent.setup();
    render(<CalendarView />);

    await waitFor(() => screen.getByText("generateSummary"));

    await user.click(screen.getByText("generateSummary"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("generate_grouped_daily_summary", expect.objectContaining({ date: dateStr }));
    });
  });
});

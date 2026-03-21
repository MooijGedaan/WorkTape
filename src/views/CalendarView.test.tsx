import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("CalendarView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      .mockResolvedValueOnce([]) // ai_summaries
      .mockResolvedValueOnce([{ date: dateStr, cnt: 3 }]) // manual counts
      .mockResolvedValueOnce([]) // auto counts
      .mockResolvedValueOnce([
        { date: dateStr, description: 'Reviewed PR', timestamp: `${dateStr}T10:00:00` },
        { date: dateStr, description: 'Fixed bug', timestamp: `${dateStr}T11:00:00` },
        { date: dateStr, description: 'Team standup', timestamp: `${dateStr}T09:00:00` },
      ]) // all entries
      .mockResolvedValueOnce([]); // day endings

    render(<CalendarView />);

    await waitFor(() => {
      expect(screen.getAllByText("entryCount").length).toBeGreaterThan(0);
    });
  });
});

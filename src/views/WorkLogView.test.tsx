import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkLogView } from "./WorkLogView";

// Mock tauri sql plugin
vi.mock("@tauri-apps/plugin-sql", () => {
  const mockExecute = vi.fn().mockResolvedValue({ lastInsertId: 42 });
  const mockSelect = vi.fn().mockResolvedValue([]);
  const mockDb = { select: mockSelect, execute: mockExecute };
  return {
    default: {
      load: vi.fn().mockResolvedValue(mockDb),
    },
    __mockDb: mockDb,
  };
});

// tauri event listen mock is already in setup.ts
import { listen } from "@tauri-apps/api/event";

// i18n mock - return the key so we can match on it
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

describe("WorkLogView", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();

    // Default: listen resolves with an unsubscribe function
    (listen as Mock).mockResolvedValue(() => {});

    // Reset SQL mock to return empty arrays
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await (Database.load as Mock)();
    (db.select as Mock).mockResolvedValue([]);
    (db.execute as Mock).mockResolvedValue({ lastInsertId: 42 });
  });

  it("renders the input form with a text field and submit button", async () => {
    render(<WorkLogView />);

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /worklog:form\.submit/i })).toBeInTheDocument();
  });

  it("shows empty state text when there are no entries", async () => {
    render(<WorkLogView />);

    await waitFor(() => {
      expect(screen.getByText("worklog:list.empty")).toBeInTheDocument();
    });
  });

  it("shows error when form is submitted with empty input", async () => {
    const user = userEvent.setup();
    render(<WorkLogView />);

    await waitFor(() => screen.getByRole("button", { name: /worklog:form\.submit/i }));

    await user.click(screen.getByRole("button", { name: /worklog:form\.submit/i }));

    await waitFor(() => {
      expect(screen.getByText("worklog:errors.emptyDescription")).toBeInTheDocument();
    });
  });

  it("adds a new entry on form submit", async () => {
    const user = userEvent.setup();
    render(<WorkLogView />);

    await waitFor(() => screen.getByRole("textbox"));

    await user.type(screen.getByRole("textbox"), "Fixed a critical bug");
    await user.click(screen.getByRole("button", { name: /worklog:form\.submit/i }));

    await waitFor(() => {
      expect(screen.getByText("Fixed a critical bug")).toBeInTheDocument();
    });
  });

  it("clears the input field after successful submit", async () => {
    const user = userEvent.setup();
    render(<WorkLogView />);

    await waitFor(() => screen.getByRole("textbox"));

    const input = screen.getByRole("textbox");
    await user.type(input, "Finished feature X");
    await user.click(screen.getByRole("button", { name: /worklog:form\.submit/i }));

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });

  it("shows error message when DB load fails", async () => {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    (Database.load as Mock).mockRejectedValueOnce(new Error("DB unavailable"));

    render(<WorkLogView />);

    await waitFor(() => {
      expect(screen.getByText("common:status.error")).toBeInTheDocument();
    });
  });

  it("shows delete button for each entry", async () => {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await (Database.load as Mock)();
    (db.select as Mock)
      .mockResolvedValueOnce([{ id: 1, description: "Task A", timestamp: "2026-03-11T09:00:00Z", source: "manual" }])
      .mockResolvedValueOnce([]); // auto entries

    render(<WorkLogView />);

    await waitFor(() => {
      expect(screen.getByText("Task A")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: /common:actions\.delete/i });
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it("shows undo notification when an entry is deleted", async () => {
    const user = userEvent.setup();

    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await (Database.load as Mock)();
    (db.select as Mock)
      .mockResolvedValueOnce([{ id: 1, description: "Task A", timestamp: "2026-03-11T09:00:00Z", source: "manual" }])
      .mockResolvedValueOnce([]);

    render(<WorkLogView />);

    await waitFor(() => screen.getByText("Task A"));

    const deleteBtn = screen.getByRole("button", { name: /common:actions\.delete/i });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText("notifications:entryDeleted")).toBeInTheDocument();
    });
  });

  it("restores entry when undo is clicked", async () => {
    const user = userEvent.setup();

    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await (Database.load as Mock)();
    (db.select as Mock)
      .mockResolvedValueOnce([{ id: 1, description: "Task to undo", timestamp: "2026-03-11T09:00:00Z", source: "manual" }])
      .mockResolvedValueOnce([]);

    render(<WorkLogView />);

    await waitFor(() => screen.getByText("Task to undo"));

    // Delete the entry
    await user.click(screen.getByRole("button", { name: /common:actions\.delete/i }));

    // Entry is removed optimistically
    await waitFor(() => {
      expect(screen.queryByText("Task to undo")).not.toBeInTheDocument();
    });

    // Click undo
    await user.click(screen.getByRole("button", { name: /undo/i }));

    // Entry is restored
    await waitFor(() => {
      expect(screen.getByText("Task to undo")).toBeInTheDocument();
    });
  });

  it("auto entries show the Auto badge", async () => {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await (Database.load as Mock)();
    (db.select as Mock)
      .mockResolvedValueOnce([]) // manual
      .mockResolvedValueOnce([{ id: 2, description: "Auto-detected work", timestamp: "2026-03-11T10:00:00Z", source: "auto", screenshots_count: 3 }]);

    render(<WorkLogView />);

    await waitFor(() => {
      expect(screen.getByText("Auto-detected work")).toBeInTheDocument();
      expect(screen.getByText("Auto")).toBeInTheDocument();
    });
  });

  it("restores draft text from localStorage on mount", async () => {
    localStorage.setItem("worklog-draft", "My saved draft");

    render(<WorkLogView />);

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("My saved draft");
    });
  });

  it("saves draft text to localStorage as user types", async () => {
    const user = userEvent.setup();
    render(<WorkLogView />);

    await waitFor(() => screen.getByRole("textbox"));

    await user.type(screen.getByRole("textbox"), "Draft entry");

    await waitFor(() => {
      expect(localStorage.getItem("worklog-draft")).toBe("Draft entry");
    });
  });
});

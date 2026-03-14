import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

vi.mock("@tauri-apps/plugin-sql", () => {
  const mockExecute = vi.fn().mockResolvedValue({ lastInsertId: 99 });
  const mockSelect = vi.fn().mockResolvedValue([]);
  const mockDb = { select: mockSelect, execute: mockExecute };
  return {
    default: { load: vi.fn().mockResolvedValue(mockDb) },
    __mockDb: mockDb,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, opts?: Record<string, unknown>) => {
    if (opts?.count !== undefined) return `${k}:${opts.count}`;
    return k;
  }}),
}));

vi.mock("./components/catalyst/button", () => ({
  Button: ({
    children, onClick, disabled, type, plain, color, onWheel, onMouseEnter, onMouseLeave, title, className,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { plain?: boolean; color?: string }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type}
      onWheel={onWheel as React.WheelEventHandler<HTMLButtonElement>}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={title}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock("./components/catalyst/textarea", () => ({
  Textarea: ({
    value, onChange, onKeyDown, placeholder, autoFocus, disabled, className,
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { resizable?: boolean }) => (
    <textarea
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      className={className}
    />
  ),
}));

vi.mock("./components/catalyst/fieldset", () => ({
  Field: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

import Database from "@tauri-apps/plugin-sql";
import Prompt from "./Prompt";

describe("Prompt", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    (listen as Mock).mockResolvedValue(() => {});

    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "is_day_ended") return Promise.resolve(false);
      if (cmd === "get_sprint_tasks") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const db = await (Database.load as Mock)();
    (db.select as Mock).mockResolvedValue([]);
    (db.execute as Mock).mockResolvedValue({ lastInsertId: 99 });
  });

  it("renders textarea and submit button after mount", async () => {
    render(<Prompt />);

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeInTheDocument();
  });

  it("submit button is disabled when textarea is empty", async () => {
    render(<Prompt />);

    await waitFor(() => screen.getByRole("button", { name: /^submit$/i }));

    expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled();
  });

  it("submit button is enabled when textarea has text", async () => {
    const user = userEvent.setup();
    render(<Prompt />);

    await waitFor(() => screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Worked on feature X");

    expect(screen.getByRole("button", { name: /^submit$/i })).not.toBeDisabled();
  });

  it("shows skip button with count=5", async () => {
    render(<Prompt />);

    await waitFor(() => {
      expect(screen.getByTitle("skip.scrollToAdjust")).toBeInTheDocument();
    });

    const skipBtn = screen.getByTitle("skip.scrollToAdjust");
    expect(skipBtn.textContent).toContain("5");
  });

  it("clicking skip calls invoke('skip_prompt', { minutes: 5 })", async () => {
    const user = userEvent.setup();
    render(<Prompt />);

    await waitFor(() => screen.getByTitle("skip.scrollToAdjust"));
    await user.click(screen.getByTitle("skip.scrollToAdjust"));

    expect(invoke).toHaveBeenCalledWith("skip_prompt", { minutes: 5 });
  });

  it("shows recent entries from DB on mount", async () => {
    const db = await (Database.load as Mock)();
    (db.select as Mock).mockResolvedValueOnce([
      { description: "Fixed auth bug", task_id: null, task_title: null },
      { description: "Updated README", task_id: null, task_title: null },
    ]);

    render(<Prompt />);

    await waitFor(() => {
      expect(screen.getByText("Fixed auth bug")).toBeInTheDocument();
      expect(screen.getByText("Updated README")).toBeInTheDocument();
    });
  });

  it("shows at most 2 unique recent entries even if DB returns 3", async () => {
    const db = await (Database.load as Mock)();
    (db.select as Mock).mockResolvedValueOnce([
      { description: "Entry A", task_id: null, task_title: null },
      { description: "Entry B", task_id: null, task_title: null },
      { description: "Entry C", task_id: null, task_title: null },
    ]);

    render(<Prompt />);

    await waitFor(() => {
      expect(screen.getByText("Entry A")).toBeInTheDocument();
      expect(screen.getByText("Entry B")).toBeInTheDocument();
    });
    expect(screen.queryByText("Entry C")).not.toBeInTheDocument();
  });

  it("clicking a recent entry fills the textarea", async () => {
    const user = userEvent.setup();
    const db = await (Database.load as Mock)();
    (db.select as Mock).mockResolvedValueOnce([
      { description: "Previously worked on X", task_id: null, task_title: null },
    ]);

    render(<Prompt />);

    await waitFor(() => screen.getByText("Previously worked on X"));
    await user.click(screen.getByText("Previously worked on X"));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Previously worked on X");
    });
  });

  it("clicking next action toggle button reveals next action input", async () => {
    const user = userEvent.setup();
    render(<Prompt />);

    await waitFor(() => screen.getByText(/nextAction\.toggle/));
    await user.click(screen.getByText(/nextAction\.toggle/));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("nextAction.placeholder")).toBeInTheDocument();
    });
  });

  it("shows sprint task selector when active tasks returned", async () => {
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "is_day_ended") return Promise.resolve(false);
      if (cmd === "get_sprint_tasks")
        return Promise.resolve([
          { id: 1, title: "Active Task", status: "in-progress" },
        ]);
      return Promise.resolve(null);
    });

    render(<Prompt />);

    await waitFor(() => {
      expect(screen.getByText("Active Task")).toBeInTheDocument();
    });
  });

  it("does NOT show task selector when all tasks have status 'done'", async () => {
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "is_day_ended") return Promise.resolve(false);
      if (cmd === "get_sprint_tasks")
        return Promise.resolve([
          { id: 1, title: "Done Task", status: "done" },
        ]);
      return Promise.resolve(null);
    });

    render(<Prompt />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_sprint_tasks");
    });

    // Wait a tick for state update
    await waitFor(() => {
      expect(screen.queryByText("Done Task")).not.toBeInTheDocument();
    });
  });

  it("submitting form calls db.execute (INSERT) then invoke('close_prompt_after_save')", async () => {
    const user = userEvent.setup();
    const db = await (Database.load as Mock)();
    (db.select as Mock).mockResolvedValue([{ value: "30" }]);

    render(<Prompt />);

    await waitFor(() => screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Finished the tests");
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO work_entries"),
        expect.arrayContaining(["Finished the tests"])
      );
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("close_prompt_after_save", expect.anything());
    });
  });

  it("day-ended state renders closed message and no textarea", async () => {
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "is_day_ended") return Promise.resolve(true);
      if (cmd === "get_sprint_tasks") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<Prompt />);

    await waitFor(() => {
      expect(screen.getByText("Today's log is closed.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("Close button in day-ended state calls invoke('close_prompt', {})", async () => {
    const user = userEvent.setup();
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "is_day_ended") return Promise.resolve(true);
      if (cmd === "get_sprint_tasks") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<Prompt />);

    await waitFor(() => screen.getByText("Today's log is closed."));
    await user.click(screen.getByRole("button", { name: /Close/i }));

    expect(invoke).toHaveBeenCalledWith("close_prompt", {});
  });
});

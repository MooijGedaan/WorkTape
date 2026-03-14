import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { SprintBoardView } from "./SprintBoardView";

// jsdom doesn't implement elementFromPoint — stub it so drag logic doesn't crash
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("../components/catalyst/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean; onClose?: () => void; size?: string }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/catalyst/button", () => ({
  Button: ({ children, onClick, disabled, plain: _plain }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; plain?: boolean; color?: string }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock("../components/catalyst/input", () => ({
  Input: ({ value, onChange, placeholder, onKeyDown, autoFocus, className }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown} autoFocus={autoFocus} className={className} />
  ),
}));

vi.mock("../components/catalyst/fieldset", () => ({
  Field: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("../components/catalyst/heading", () => ({
  Heading: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock("../components/catalyst/text", () => ({
  Text: ({ children, className }: { children: React.ReactNode; className?: string }) => <p className={className}>{children}</p>,
}));

vi.mock("../components/catalyst/badge", () => ({
  Badge: ({ children, color: _color, className }: { children: React.ReactNode; color?: string; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock("../components/catalyst/select", () => ({
  Select: ({ children, value, onChange }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select value={value} onChange={onChange}>{children}</select>
  ),
}));

vi.mock("../components/icons", () => ({
  ClockIcon: ({ className }: { className?: string }) => <svg className={className} />,
}));

const makeTask = (overrides: Partial<{
  id: number;
  title: string;
  description: string | null;
  status: "todo" | "in-progress" | "done" | "blocked";
  priority: "low" | "medium" | "high";
  position: number;
  created_at: string;
  updated_at: string;
  labels: string[];
  next_action: string | null;
}> = {}) => ({
  id: 1,
  title: "Test Task",
  description: null,
  status: "todo" as const,
  priority: "medium" as const,
  position: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  labels: [],
  next_action: null,
  ...overrides,
});

describe("SprintBoardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_sprint_tasks") return Promise.resolve([]);
      if (cmd === "get_task_work_links") return Promise.resolve([]);
      if (cmd === "suggest_work_links") return Promise.resolve([]);
      return Promise.resolve(null);
    });
  });

  it("calls invoke('get_sprint_tasks') on mount", async () => {
    render(<SprintBoardView />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_sprint_tasks");
    });
  });

  it("renders 4 column headers", async () => {
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_sprint_tasks") return Promise.resolve([makeTask()]);
      if (cmd === "get_task_work_links") return Promise.resolve([]);
      if (cmd === "suggest_work_links") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<SprintBoardView />);

    await waitFor(() => {
      // columns.todo appears in header span AND select options — use getAllByText
      expect(screen.getAllByText("columns.todo").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("columns.in-progress").length).toBeGreaterThan(0);
    expect(screen.getAllByText("columns.done").length).toBeGreaterThan(0);
    expect(screen.getAllByText("columns.blocked").length).toBeGreaterThan(0);
  });

  it("shows empty state when no tasks", async () => {
    render(<SprintBoardView />);

    await waitFor(() => {
      expect(screen.getByText("empty.title")).toBeInTheDocument();
    });
  });

  it("tasks appear under the correct column by status", async () => {
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_sprint_tasks")
        return Promise.resolve([
          makeTask({ id: 1, title: "Todo Task", status: "todo" }),
          makeTask({ id: 2, title: "Done Task", status: "done" }),
        ]);
      if (cmd === "get_task_work_links") return Promise.resolve([]);
      if (cmd === "suggest_work_links") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<SprintBoardView />);

    await waitFor(() => {
      expect(screen.getByText("Todo Task")).toBeInTheDocument();
      expect(screen.getByText("Done Task")).toBeInTheDocument();
    });
  });

  it("priority filter hides non-matching priority tasks", async () => {
    const user = userEvent.setup();
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_sprint_tasks")
        return Promise.resolve([
          makeTask({ id: 1, title: "High Task", priority: "high" }),
          makeTask({ id: 2, title: "Low Task", priority: "low" }),
        ]);
      if (cmd === "get_task_work_links") return Promise.resolve([]);
      if (cmd === "suggest_work_links") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<SprintBoardView />);

    await waitFor(() => {
      expect(screen.getByText("High Task")).toBeInTheDocument();
    });

    await user.click(screen.getByText("filter.high"));

    await waitFor(() => {
      expect(screen.queryByText("Low Task")).not.toBeInTheDocument();
    });
    expect(screen.getByText("High Task")).toBeInTheDocument();
  });

  it("'All' filter re-shows all tasks", async () => {
    const user = userEvent.setup();
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_sprint_tasks")
        return Promise.resolve([
          makeTask({ id: 1, title: "High Task", priority: "high" }),
          makeTask({ id: 2, title: "Low Task", priority: "low" }),
        ]);
      if (cmd === "get_task_work_links") return Promise.resolve([]);
      if (cmd === "suggest_work_links") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<SprintBoardView />);

    await waitFor(() => screen.getByText("High Task"));

    await user.click(screen.getByText("filter.high"));
    await waitFor(() => expect(screen.queryByText("Low Task")).not.toBeInTheDocument());

    await user.click(screen.getByText("filter.all"));
    await waitFor(() => {
      expect(screen.getByText("Low Task")).toBeInTheDocument();
    });
  });

  it("clicking addTask button opens dialog", async () => {
    const user = userEvent.setup();
    render(<SprintBoardView />);

    await waitFor(() => screen.getByText("addTask"));
    await user.click(screen.getByText("addTask"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("creating a task calls invoke('create_sprint_task') and reloads tasks", async () => {
    const user = userEvent.setup();
    render(<SprintBoardView />);

    await waitFor(() => screen.getByText("addTask"));
    await user.click(screen.getByText("addTask"));

    await waitFor(() => screen.getByRole("dialog"));

    const titleInput = screen.getByPlaceholderText("taskForm.titlePlaceholder");
    await user.type(titleInput, "New Task");

    await user.click(screen.getByRole("button", { name: "taskForm.create" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("create_sprint_task", expect.objectContaining({
        title: "New Task",
      }));
    });

    // Should reload tasks after create
    const getCalls = (invoke as Mock).mock.calls.filter((c) => c[0] === "get_sprint_tasks");
    expect(getCalls.length).toBeGreaterThan(1);
  });

  it("clicking a task opens TaskDetailDialog", async () => {
    const user = userEvent.setup();
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_sprint_tasks") return Promise.resolve([makeTask({ id: 5, title: "Clickable Task" })]);
      if (cmd === "get_task_work_links") return Promise.resolve([]);
      if (cmd === "suggest_work_links") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<SprintBoardView />);

    await waitFor(() => screen.getByText("Clickable Task"));
    await user.click(screen.getByText("Clickable Task"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("deleting a task calls invoke('delete_sprint_task', { id })", async () => {
    const user = userEvent.setup();
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_sprint_tasks") return Promise.resolve([makeTask({ id: 7, title: "Delete Me" })]);
      if (cmd === "get_task_work_links") return Promise.resolve([]);
      if (cmd === "suggest_work_links") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<SprintBoardView />);

    await waitFor(() => screen.getByText("Delete Me"));
    await user.click(screen.getByText("Delete Me"));

    await waitFor(() => screen.getByRole("dialog"));

    await user.click(screen.getByText("taskForm.delete"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("delete_sprint_task", { id: 7 });
    });
  });

  it("cancelling delete confirm does NOT call delete", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_sprint_tasks") return Promise.resolve([makeTask({ id: 8, title: "Keep Me" })]);
      if (cmd === "get_task_work_links") return Promise.resolve([]);
      if (cmd === "suggest_work_links") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<SprintBoardView />);

    await waitFor(() => screen.getByText("Keep Me"));
    await user.click(screen.getByText("Keep Me"));

    await waitFor(() => screen.getByRole("dialog"));

    await user.click(screen.getByText("taskForm.delete"));

    // delete_sprint_task should NOT have been called
    const deleteCalls = (invoke as Mock).mock.calls.filter((c) => c[0] === "delete_sprint_task");
    expect(deleteCalls.length).toBe(0);
  });
});

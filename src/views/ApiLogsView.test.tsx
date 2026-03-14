import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import ApiLogsView from "./ApiLogsView";

// invoke is already mocked globally in setup.ts

const makeStats = (overrides = {}) => ({
  total_calls: 10,
  successful_calls: 8,
  failed_calls: 2,
  total_tokens: 5000,
  total_screenshots: 3,
  average_duration_ms: 1234,
  ...overrides,
});

const makeLog = (overrides = {}) => ({
  id: 1,
  request_timestamp: "2026-03-13T10:00:00Z",
  response_timestamp: "2026-03-13T10:00:01Z",
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o",
  request_type: "screenshot_analysis",
  request_messages: "",
  request_temperature: 0.7,
  request_max_tokens: 1000,
  response_text: "Some response",
  response_status: "success",
  error_message: null,
  duration_ms: 980,
  prompt_tokens: 100,
  completion_tokens: 50,
  total_tokens: 150,
  screenshot_count: 1,
  created_at: "2026-03-13T10:00:00Z",
  ...overrides,
});

describe("ApiLogsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_api_call_logs") return Promise.resolve([]);
      if (cmd === "get_api_call_stats") return Promise.resolve(makeStats());
      return Promise.resolve(null);
    });
  });

  it("shows loading state initially", async () => {
    // Make invoke never resolve so loading persists
    (invoke as Mock).mockImplementation(() => new Promise(() => {}));

    render(<ApiLogsView />);

    expect(screen.getByText("Loading logs...")).toBeInTheDocument();
  });

  it("renders stats cards after load", async () => {
    render(<ApiLogsView />);

    await waitFor(() => {
      expect(screen.getByText("Total Calls")).toBeInTheDocument();
    });

    expect(screen.getByText("Successful")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Total Tokens")).toBeInTheDocument();
  });

  it("renders a log row per returned log", async () => {
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_api_call_logs") return Promise.resolve([makeLog()]);
      if (cmd === "get_api_call_stats") return Promise.resolve(makeStats());
      return Promise.resolve(null);
    });

    render(<ApiLogsView />);

    await waitFor(() => {
      expect(screen.getByText("screenshot_analysis")).toBeInTheDocument();
    });

    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View Details/i })).toBeInTheDocument();
  });

  it("changing filter dropdown calls invoke with correct requestType", async () => {
    const user = userEvent.setup();
    render(<ApiLogsView />);

    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

    await user.selectOptions(screen.getByRole("combobox"), "screenshot_analysis");

    await waitFor(() => {
      const calls = (invoke as Mock).mock.calls.filter(
        (c) => c[0] === "get_api_call_logs"
      );
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toMatchObject({ requestType: "screenshot_analysis" });
    });
  });

  it("changing filter resets page offset to 0", async () => {
    const user = userEvent.setup();
    render(<ApiLogsView />);

    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

    await user.selectOptions(screen.getByRole("combobox"), "daily_summary");

    await waitFor(() => {
      const calls = (invoke as Mock).mock.calls.filter(
        (c) => c[0] === "get_api_call_logs"
      );
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toMatchObject({ offset: 0 });
    });
  });

  it("Next button is disabled when fewer than 25 logs returned", async () => {
    render(<ApiLogsView />);

    await waitFor(() => {
      expect(screen.queryByText("Loading logs...")).not.toBeInTheDocument();
    });

    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).toBeDisabled();
  });

  it("Previous button is disabled on first page", async () => {
    render(<ApiLogsView />);

    await waitFor(() => {
      expect(screen.queryByText("Loading logs...")).not.toBeInTheDocument();
    });

    const prevBtn = screen.getByRole("button", { name: /Previous/i });
    expect(prevBtn).toBeDisabled();
  });

  it("clicking View Details opens the inline detail modal", async () => {
    const user = userEvent.setup();
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_api_call_logs") return Promise.resolve([makeLog({ id: 42 })]);
      if (cmd === "get_api_call_stats") return Promise.resolve(makeStats());
      return Promise.resolve(null);
    });

    render(<ApiLogsView />);

    await waitFor(() => screen.getByRole("button", { name: /View Details/i }));
    await user.click(screen.getByRole("button", { name: /View Details/i }));

    await waitFor(() => {
      expect(screen.getByText("API Call Details #42")).toBeInTheDocument();
    });
  });

  it("clicking close (✕) dismisses detail modal", async () => {
    const user = userEvent.setup();
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_api_call_logs") return Promise.resolve([makeLog()]);
      if (cmd === "get_api_call_stats") return Promise.resolve(makeStats());
      return Promise.resolve(null);
    });

    render(<ApiLogsView />);

    await waitFor(() => screen.getByRole("button", { name: /View Details/i }));
    await user.click(screen.getByRole("button", { name: /View Details/i }));
    await waitFor(() => screen.getByText(/API Call Details/));

    // The close button inside the modal (not the lightbox one)
    const closeBtns = screen.getAllByText("✕");
    await user.click(closeBtns[0]);

    await waitFor(() => {
      expect(screen.queryByText(/API Call Details/)).not.toBeInTheDocument();
    });
  });

  it("shows ✅ for response_status: success", async () => {
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_api_call_logs") return Promise.resolve([makeLog({ response_status: "success" })]);
      if (cmd === "get_api_call_stats") return Promise.resolve(makeStats());
      return Promise.resolve(null);
    });

    render(<ApiLogsView />);

    await waitFor(() => {
      expect(screen.getByText("✅")).toBeInTheDocument();
    });
  });

  it("shows ❌ for response_status: error", async () => {
    (invoke as Mock).mockImplementation((cmd: string) => {
      if (cmd === "get_api_call_logs")
        return Promise.resolve([makeLog({ response_status: "error", error_message: "timeout" })]);
      if (cmd === "get_api_call_stats") return Promise.resolve(makeStats());
      return Promise.resolve(null);
    });

    render(<ApiLogsView />);

    await waitFor(() => {
      expect(screen.getByText("❌")).toBeInTheDocument();
    });
  });
});

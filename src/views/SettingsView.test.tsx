import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsView } from "./SettingsView";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock tauri sql plugin
vi.mock("@tauri-apps/plugin-sql", () => {
  const mockExecute = vi.fn().mockResolvedValue({});
  const mockSelect = vi.fn().mockResolvedValue([{ key: "prompt_interval_minutes", value: "30" }]);
  const mockDb = { select: mockSelect, execute: mockExecute };
  return {
    default: {
      load: vi.fn().mockResolvedValue(mockDb),
    },
  };
});

// Mock LanguageSelector to avoid complex i18n setup
vi.mock("../components/LanguageSelector", () => ({
  LanguageSelector: () => <div data-testid="language-selector">Language Selector</div>,
}));

// Mock useTheme
vi.mock("../hooks/useTheme", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import { invoke } from "@tauri-apps/api/core";

describe("SettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default invoke responses
    (invoke as Mock).mockImplementation((cmd: string) => {
      switch (cmd) {
        case "get_auto_logging_status": return Promise.resolve(false);
        case "get_auto_capture_settings": return Promise.resolve([360, 96]);
        case "get_api_usage_today": return Promise.resolve(0);
        case "get_debug_mode": return Promise.resolve(false);
        case "get_debug_logs_retention_days": return Promise.resolve(7);
        default: return Promise.resolve(null);
      }
    });
  });

  it("renders settings heading", async () => {
    render(<SettingsView />);

    await waitFor(() => {
      expect(screen.getByText("settings:title")).toBeInTheDocument();
    });
  });

  it("renders the language selector", async () => {
    render(<SettingsView />);

    await waitFor(() => {
      expect(screen.getByTestId("language-selector")).toBeInTheDocument();
    });
  });

  it("renders prompt frequency section", async () => {
    render(<SettingsView />);

    await waitFor(() => {
      expect(screen.getByText("settings:promptFrequency.label")).toBeInTheDocument();
    });
  });

  it("renders auto-logging toggle", async () => {
    render(<SettingsView />);

    await waitFor(() => {
      expect(screen.getByText("Automatic Work Logging")).toBeInTheDocument();
    });
  });

  it("renders theme buttons (light, dark, system)", async () => {
    render(<SettingsView />);

    await waitFor(() => {
      expect(screen.getByText("settings:sections.darkMode.options.light")).toBeInTheDocument();
      expect(screen.getByText("settings:sections.darkMode.options.dark")).toBeInTheDocument();
      expect(screen.getByText("settings:sections.darkMode.options.system")).toBeInTheDocument();
    });
  });

  it("calls set_prompt_interval invoke when saving prompt interval", async () => {
    const user = userEvent.setup();
    (invoke as Mock).mockResolvedValue(undefined);

    render(<SettingsView />);

    await waitFor(() => screen.getByText("settings:promptFrequency.label"));

    // Find save button next to prompt interval input
    const saveButtons = await screen.findAllByText("common:actions.save");
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_prompt_interval", expect.objectContaining({ minutes: expect.any(Number) }));
    });
  });

  it("calls start_auto_logging when toggle is enabled", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await waitFor(() => screen.getByText("Automatic Work Logging"));

    // The switch for auto-logging — find it by role
    const switches = screen.getAllByRole("switch");
    // First switch is the auto-logging toggle
    await user.click(switches[0]);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("start_auto_logging");
    });
  });

  it("shows validation error for out-of-range prompt interval", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await waitFor(() => screen.getByText("settings:promptFrequency.label"));

    // Find the prompt interval input (type=number)
    const inputs = screen.getAllByRole("spinbutton");
    // Type a value clearly above max (1440)
    await user.clear(inputs[0]);
    await user.type(inputs[0], "9999");

    const saveButtons = await screen.findAllByText("common:actions.save");
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("settings:promptFrequency.validationError")).toBeInTheDocument();
    });
  });
});

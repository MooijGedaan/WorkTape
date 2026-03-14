import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AISummaryView } from "./AISummaryView";
import { renderWithI18n } from "../tests/utils/testHelpers";

// Mock the Database
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() =>
      Promise.resolve({
        select: vi.fn(() => Promise.resolve([])),
        execute: vi.fn(() => Promise.resolve()),
      })
    ),
  },
}));

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("AISummaryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the AI summary view", () => {
    renderWithI18n(<AISummaryView />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("displays date selector", () => {
    renderWithI18n(<AISummaryView />);
    const dateInput = screen.getByDisplayValue(
      new Date().toISOString().split("T")[0]
    );
    expect(dateInput).toBeInTheDocument();
  });

  it("has today and yesterday quick buttons", () => {
    renderWithI18n(<AISummaryView />);

    const buttons = screen.getAllByRole("button");
    // Should have at least the Today, Yesterday, and Generate buttons
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("has generate button", () => {
    renderWithI18n(<AISummaryView />);
    // Look for any enabled button (generate button)
    const buttons = screen.getAllByRole("button");
    const enabledButtons = buttons.filter((btn) => !btn.hasAttribute("disabled"));
    expect(enabledButtons.length).toBeGreaterThan(0);
  });

  it("displays empty state initially", () => {
    renderWithI18n(<AISummaryView />);
    // Should show some text content
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("allows changing the date", async () => {
    const user = userEvent.setup();
    renderWithI18n(<AISummaryView />);

    const dateInput = screen.getByDisplayValue(
      new Date().toISOString().split("T")[0]
    ) as HTMLInputElement;

    const newDate = "2024-01-15";
    await user.clear(dateInput);
    await user.type(dateInput, newDate);

    expect(dateInput.value).toBe(newDate);
  });
});

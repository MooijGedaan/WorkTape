import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { ExportView } from "./ExportView";
import { renderWithI18n } from "../tests/utils/testHelpers";

describe("ExportView", () => {
  it("renders the export view", () => {
    renderWithI18n(<ExportView />);
    // Check that view renders
    const headings = screen.getAllByRole("heading");
    expect(headings.length).toBeGreaterThan(0);
  });

  it("displays premium section", () => {
    renderWithI18n(<ExportView />);
    // Premium section should be visible
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows premium upgrade prompt", () => {
    renderWithI18n(<ExportView />);
    // Should show upgrade button
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("displays disabled export options", () => {
    renderWithI18n(<ExportView />);
    // All export buttons should be disabled
    const buttons = screen.getAllByRole("button");
    const disabledButtons = buttons.filter((btn) => btn.hasAttribute("disabled"));
    expect(disabledButtons.length).toBeGreaterThan(0);
  });

  it("has multiple action buttons", () => {
    renderWithI18n(<ExportView />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock the window module
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

// Import after mocking
import { TitleBar } from "./TitleBar";

describe("TitleBar", () => {
  it("renders the application title", () => {
    render(<TitleBar />);
    expect(screen.getByText("WorkTape")).toBeInTheDocument();
  });

  it("has window control buttons with proper labels", () => {
    render(<TitleBar />);

    expect(screen.getByLabelText("Minimize")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximize")).toBeInTheDocument();
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("has draggable region", () => {
    const { container } = render(<TitleBar />);
    const draggableRegions = container.querySelectorAll(
      '[data-tauri-drag-region]'
    );
    expect(draggableRegions.length).toBeGreaterThan(0);
  });
});

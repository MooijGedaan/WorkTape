import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewRouter } from "./ViewRouter";
import { NavigationProvider } from "../hooks/useNavigation";

// Mock the view components
vi.mock("../views/HomeView", () => ({
  HomeView: () => <div>Home View</div>,
}));

vi.mock("../views/WorkLogView", () => ({
  WorkLogView: () => <div>Work Log View</div>,
}));

vi.mock("../views/SettingsView", () => ({
  SettingsView: () => <div>Settings View</div>,
}));

vi.mock("../views/ExportView", () => ({
  ExportView: () => <div>Export View</div>,
}));


describe("ViewRouter", () => {
  it("renders work-log view by default", () => {
    render(
      <NavigationProvider>
        <ViewRouter />
      </NavigationProvider>
    );

    expect(screen.getByText("Work Log View")).toBeInTheDocument();
  });

  it("falls back to work-log view for unknown view", () => {
    render(
      <NavigationProvider>
        <ViewRouter />
      </NavigationProvider>
    );

    expect(screen.getByText("Work Log View")).toBeInTheDocument();
  });
});

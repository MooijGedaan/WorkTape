import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationLayout } from "./ApplicationLayout";
import { NavigationProvider } from "../hooks/useNavigation";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

// Mock TitleBar to avoid window API complexity
vi.mock("./TitleBar", () => ({
  TitleBar: () => <div data-testid="title-bar" />,
}));

// Suppress noisy console.error from Headless UI
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Warning")) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});

function renderLayout() {
  return render(
    <NavigationProvider>
      <ApplicationLayout>
        <div data-testid="child-content">Content</div>
      </ApplicationLayout>
    </NavigationProvider>
  );
}

describe("ApplicationLayout", () => {
  it("renders sidebar navigation items", () => {
    renderLayout();

    expect(screen.getByText("navigation.home")).toBeInTheDocument();
    expect(screen.getByText("navigation.workLog")).toBeInTheDocument();
    expect(screen.getByText("navigation.calendar")).toBeInTheDocument();
    expect(screen.getByText("navigation.export")).toBeInTheDocument();
    expect(screen.getByText("navigation.settings")).toBeInTheDocument();
  });

  it("renders children content", () => {
    renderLayout();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("clicking Work Log nav item sets it as current", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByText("navigation.workLog"));
    expect(screen.getByText("navigation.workLog").closest('[data-current="true"]')).not.toBeNull();
  });

  it("clicking Settings nav item sets it as current", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByText("navigation.settings"));
    expect(screen.getByText("navigation.settings").closest('[data-current="true"]')).not.toBeNull();
  });

  it("clicking Home nav item sets it as current", async () => {
    const user = userEvent.setup();
    renderLayout();

    await act(async () => {
      await user.click(screen.getByText("navigation.home"));
    });

    expect(screen.getByText("navigation.home").closest('[data-current="true"]')).not.toBeNull();
  });

  it("renders the TitleBar", () => {
    renderLayout();
    expect(screen.getByTestId("title-bar")).toBeInTheDocument();
  });
});

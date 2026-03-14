import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Capture the onShowOnboarding callback passed to NavigationProvider
let capturedShowOnboarding: (() => void) | undefined;

vi.mock("./hooks/useNavigation", () => ({
  NavigationProvider: ({ children, onShowOnboarding }: { children: React.ReactNode; onShowOnboarding: () => void }) => {
    capturedShowOnboarding = onShowOnboarding;
    return <>{children}</>;
  },
}));

vi.mock("./hooks/useTheme", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./components/ApplicationLayout", () => ({
  ApplicationLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

vi.mock("./components/ViewRouter", () => ({
  ViewRouter: () => <div data-testid="view-router" />,
}));

vi.mock("./components/OnboardingModal", () => ({
  OnboardingModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: (dontShow: boolean) => void;
  }) =>
    isOpen ? (
      <div data-testid="onboarding-modal">
        <button onClick={() => onClose(false)}>close-no-persist</button>
        <button onClick={() => onClose(true)}>close-persist</button>
      </div>
    ) : null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Import App after mocks are registered
import App from "./App";

const ONBOARDING_KEY = "onboarding_dismissed";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    capturedShowOnboarding = undefined;
    vi.clearAllMocks();
  });

  it("shows onboarding modal when onboarding_dismissed not in localStorage", () => {
    render(<App />);
    expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument();
  });

  it("hides onboarding modal when onboarding_dismissed is 'true'", () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    render(<App />);
    expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
  });

  it("close with dontShowAgain=true sets localStorage and hides modal", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText("close-persist"));

    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(ONBOARDING_KEY)).toBe("true");
  });

  it("close with dontShowAgain=false does NOT set localStorage, hides modal", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText("close-no-persist"));

    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull();
  });

  it("handleShowOnboarding removes localStorage key and shows modal", async () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    render(<App />);

    // Modal hidden initially
    expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();

    // Trigger via captured callback
    capturedShowOnboarding!();

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument();
    });
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull();
  });

  it("renders ApplicationLayout and ViewRouter", () => {
    render(<App />);
    expect(screen.getByTestId("app-layout")).toBeInTheDocument();
    expect(screen.getByTestId("view-router")).toBeInTheDocument();
  });
});

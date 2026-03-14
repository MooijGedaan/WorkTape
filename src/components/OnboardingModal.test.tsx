import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingModal } from "./OnboardingModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...rest }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

vi.mock("./catalyst/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean; onClose?: () => void; size?: string }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

vi.mock("./catalyst/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void; color?: string; plain?: boolean }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock("./icons", () => ({
  ClockIcon: () => <svg data-testid="icon-clock" />,
  CameraIcon: () => <svg data-testid="icon-camera" />,
  SparklesIcon: () => <svg data-testid="icon-sparkles" />,
  ViewColumnsIcon: () => <svg data-testid="icon-view-columns" />,
  ArrowDownTrayIcon: () => <svg data-testid="icon-arrow-down" />,
  XMarkIcon: ({ className }: { className?: string }) => <svg data-testid="icon-x" className={className} />,
}));

describe("OnboardingModal", () => {
  const noop = vi.fn();

  beforeEach(() => {
    noop.mockClear();
  });

  it("renders step 1 content initially", () => {
    render(<OnboardingModal isOpen={true} onClose={noop} />);
    expect(screen.getByText(/Step 1 of 5/)).toBeInTheDocument();
    expect(screen.getByText("onboardingModal.steps.prompts.title")).toBeInTheDocument();
  });

  it("does not render when isOpen=false", () => {
    render(<OnboardingModal isOpen={false} onClose={noop} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Back button is NOT shown on step 1", () => {
    render(<OnboardingModal isOpen={true} onClose={noop} />);
    expect(
      screen.queryByText("settings:onboardingModal.navigation.back")
    ).not.toBeInTheDocument();
  });

  it("clicking Next advances to step 2", async () => {
    const user = userEvent.setup();
    render(<OnboardingModal isOpen={true} onClose={noop} />);

    await user.click(
      screen.getByText("onboardingModal.navigation.next")
    );

    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
    });
    expect(screen.getByText("onboardingModal.steps.autoCapture.title")).toBeInTheDocument();
    expect(screen.getByText("onboardingModal.navigation.back")).toBeInTheDocument();
  });

  it("clicking Back on step 2 returns to step 1", async () => {
    const user = userEvent.setup();
    render(<OnboardingModal isOpen={true} onClose={noop} />);

    await user.click(screen.getByText("onboardingModal.navigation.next"));
    await waitFor(() => screen.getByText(/Step 2 of 5/));

    await user.click(screen.getByText("onboardingModal.navigation.back"));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 5/)).toBeInTheDocument();
    });
  });

  it("clicking dot button 'Go to step 3' navigates directly to step 3", async () => {
    const user = userEvent.setup();
    render(<OnboardingModal isOpen={true} onClose={noop} />);

    await user.click(screen.getByRole("button", { name: "Go to step 3" }));

    await waitFor(() => {
      expect(screen.getByText(/Step 3 of 5/)).toBeInTheDocument();
    });
    expect(screen.getByText("onboardingModal.steps.aiSummary.title")).toBeInTheDocument();
  });

  it("last step (step 5) shows getStarted button instead of Next", async () => {
    const user = userEvent.setup();
    render(<OnboardingModal isOpen={true} onClose={noop} />);

    await user.click(screen.getByRole("button", { name: "Go to step 5" }));

    await waitFor(() => {
      expect(screen.getByText(/Step 5 of 5/)).toBeInTheDocument();
    });
    expect(
      screen.getByText("onboardingModal.navigation.getStarted")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("onboardingModal.navigation.next")
    ).not.toBeInTheDocument();
  });

  it("clicking Get Started on last step calls onClose(false)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OnboardingModal isOpen={true} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Go to step 5" }));
    await waitFor(() => screen.getByText(/Step 5 of 5/));

    await user.click(
      screen.getByText("onboardingModal.navigation.getStarted")
    );

    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("Close button (aria-label=Close) calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OnboardingModal isOpen={true} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("toggling don't show again checkbox then closing calls onClose(true)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OnboardingModal isOpen={true} onClose={onClose} />);

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledWith(true);
  });
});

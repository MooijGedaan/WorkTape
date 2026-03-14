import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UndoNotification } from "./UndoNotification";

describe("UndoNotification", () => {
  const defaultProps = {
    show: true,
    message: "Item deleted",
    onUndo: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders the notification message when shown", () => {
    render(<UndoNotification {...defaultProps} />);
    expect(screen.getByText("Item deleted")).toBeInTheDocument();
  });

  it("does not render message when show is false", () => {
    render(<UndoNotification {...defaultProps} show={false} />);
    expect(screen.queryByText("Item deleted")).not.toBeInTheDocument();
  });

  it("displays undo button", () => {
    render(<UndoNotification {...defaultProps} />);
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  });

  it("displays close button", () => {
    render(<UndoNotification {...defaultProps} />);
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("calls onUndo when undo button is clicked", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();

    render(<UndoNotification {...defaultProps} onUndo={onUndo} />);

    const undoButton = screen.getByRole("button", { name: /undo/i });
    await user.click(undoButton);

    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<UndoNotification {...defaultProps} onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has proper aria-live region for accessibility", () => {
    const { container } = render(<UndoNotification {...defaultProps} />);
    const liveRegion = container.querySelector('[aria-live="assertive"]');
    expect(liveRegion).toBeInTheDocument();
  });
});

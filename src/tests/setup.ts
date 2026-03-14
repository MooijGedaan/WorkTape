import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Tauri API globally
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
  })),
  Window: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

// Partial mock of headlessui – keep all real exports, only override Transition
// to avoid animation-related rendering issues in tests.
vi.mock("@headlessui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@headlessui/react")>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Transition: ({ children, show }: { children: any; show: boolean }) =>
      show ? children : null,
  };
});

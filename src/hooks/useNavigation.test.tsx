import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { NavigationProvider, useNavigation } from "./useNavigation";

describe("useNavigation", () => {
  it("throws error when used outside NavigationProvider", () => {
    const originalError = console.error;
    console.error = () => {};

    expect(() => {
      renderHook(() => useNavigation());
    }).toThrow("useNavigation must be used within NavigationProvider");

    console.error = originalError;
  });

  it("initializes with work-log as default view", () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: NavigationProvider,
    });

    expect(result.current.currentView).toBe("work-log");
  });

  it("navigates to different views", () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: NavigationProvider,
    });

    act(() => {
      result.current.navigate("settings");
    });

    expect(result.current.currentView).toBe("settings");
  });

  it("provides convenience navigation methods", () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: NavigationProvider,
    });

    act(() => {
      result.current.goToSettings();
    });
    expect(result.current.currentView).toBe("settings");

    act(() => {
      result.current.goToWorkLog();
    });
    expect(result.current.currentView).toBe("work-log");

    act(() => {
      result.current.goToExport();
    });
    expect(result.current.currentView).toBe("export");

    act(() => {
      result.current.goHome();
    });
    expect(result.current.currentView).toBe("home");
  });
});

# Testing Setup

This directory contains the testing infrastructure for WorkTape's frontend.

## Running Tests

```bash
# Run tests in watch mode (recommended for development)
npm test

# Run tests once (good for CI/CD)
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Files

Tests are located next to the files they test:
- `src/components/TitleBar.test.tsx` - Tests for TitleBar component
- `src/components/LanguageSelector.test.tsx` - Tests for LanguageSelector component
- `src/hooks/useNavigation.test.tsx` - Tests for useNavigation hook

## Test Utilities

### `setup.ts`
Global test setup file that:
- Extends Vitest's `expect` with jest-dom matchers
- Cleans up after each test
- Mocks Tauri APIs globally

### `utils/testHelpers.tsx`
Helper functions for testing:
- `renderWithI18n()` - Renders components with i18n provider

## Writing New Tests

### Component Tests

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MyComponent } from "./MyComponent";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

### Hook Tests

```typescript
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMyHook } from "./useMyHook";

describe("useMyHook", () => {
  it("returns initial value", () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe(0);
  });
});
```

### Testing Components with i18n

```typescript
import { renderWithI18n } from "../tests/utils/testHelpers";

it("renders with translations", () => {
  renderWithI18n(<MyComponent />);
  expect(screen.getByText("Translated Text")).toBeInTheDocument();
});
```

### Mocking Tauri Commands

Tauri APIs are mocked globally in `setup.ts`. If you need to test specific command behavior:

```typescript
import { vi } from "vitest";
import * as tauriCore from "@tauri-apps/api/core";

it("calls tauri command", async () => {
  const invokeSpy = vi.spyOn(tauriCore, "invoke");
  invokeSpy.mockResolvedValue({ success: true });

  // Your test code here

  expect(invokeSpy).toHaveBeenCalledWith("my_command", { arg: "value" });
});
```

## Best Practices

1. **Test User Behavior**: Focus on what users see and do, not implementation details
2. **Use Semantic Queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Keep Tests Simple**: Each test should verify one behavior
4. **Mock External Dependencies**: Always mock Tauri IPC calls and external APIs
5. **Descriptive Names**: Test names should explain what's being tested

## Coverage

Coverage reports are generated in the `coverage/` directory when running `npm run test:coverage`. Aim for 70-80% coverage for critical code paths.

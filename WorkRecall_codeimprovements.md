# Code Quality & Security Improvement Plan for WorkRecall

## Context

WorkRecall is a Tauri-based desktop app (Rust backend + React/TypeScript frontend) for work activity logging with AI summaries. A comprehensive audit of the codebase has identified **critical security vulnerabilities** (an exposed API key, missing CSP, overly permissive capabilities) and **significant code quality issues** (error handling, type safety, architectural patterns). This plan addresses all findings in priority order.

---

## CRITICAL — Fix Immediately

### 1. Revoke & Re-secure the Exposed OpenAI API Key
**File:** `.env`

- The `.env` file contains a plaintext `sk-proj-...` OpenAI API key that may have been committed to git history
- **Actions:**
  1. Revoke the key at https://platform.openai.com/api-keys immediately
  2. Verify `.env` is in `.gitignore` (check `src-tauri/.gitignore` and root)
  3. If `.env` was ever committed, scrub it from git history with `git filter-repo --invert-paths --path .env`
  4. Issue a new key and store it only in `.env` (never commit)
  5. Add a `.env.example` with placeholder values for documentation

### 2. Implement Content Security Policy
**File:** `src-tauri/tauri.conf.json:29`

Current value: `"csp": null`

Replace with a restrictive policy:
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.openai.com;"
```

### 3. Scope Tauri Capabilities
**File:** `src-tauri/capabilities/main.json`

- `sql:allow-execute` and `sql:allow-select` are overly broad — they should be scoped to the `workrecall.db` database only
- `dialog:allow-save` should be scoped to the app data directory
- Add explicit scoping when the Tauri SQL plugin supports it; document current risk in comments until then

---

## HIGH — Fix Before Production

### 4. Replace `alert()` Error Handling with Proper UI
**Files:** `src/Prompt.tsx:181`, `src/views/SettingsView.tsx:189,211,222,258,271`, and others

- `alert()` calls are blocking, platform-inconsistent, and expose raw error strings to users
- Create a reusable `ErrorNotification` toast/banner component
- Replace all `alert(\`Error: ${error}\`)` with this component
- Use `error instanceof Error ? error.message : String(error)` for message extraction

### 5. Add React Error Boundaries
**File:** `src/App.tsx` (and per-view)

- No `<ErrorBoundary>` exists anywhere — a rendering crash takes down the entire app
- Add a root-level `ErrorBoundary` in `App.tsx`
- Optionally add per-view boundaries around major views in `ViewRouter.tsx`

### 6. Fix Type `as any` Assertion in Prompt
**File:** `src/Prompt.tsx:216`

```tsx
// Current (unsafe):
handleSubmit(e as any);
// Fix: use correct event type or extract submit logic to a shared function callable from both keyboard and form events
```

### 7. Consolidate Database Access Pattern
**Files:** `src/views/WorkLogView.tsx:23`, `src/views/AISummaryView.tsx:9`, `src/views/CalendarView.tsx:9`

Three views each define an identical module-level `let db: Database | null` caching pattern. Extract to a shared hook:
```tsx
// src/hooks/useDatabase.ts
export function useDatabase(): { getDb: () => Promise<Database> } { ... }
```
This removes global mutable state from view modules and simplifies testing.

### 8. Remove Debug `console.log` from Production Paths
**File:** `src/views/AISummaryView.tsx:35-58` (5+ debug logs)

Replace with conditional logging based on `import.meta.env.DEV` or remove entirely.

### 9. Fix Unbounded Screenshot Buffer
**File:** `src-tauri/src/smart_capture.rs:92`

- Add a `MAX_BUFFER_SCREENSHOTS: usize = 100` constant
- Enforce the limit in the buffer append logic — drop oldest entries when full and log a warning
- Also guard `auto_logger.rs:340` to check buffer is non-empty before calling the API

### 10. Replace `.unwrap()` on Mutex Locks
**Files:** `src-tauri/src/auto_logger.rs:36,37,89,90,100,135,137,207,211,215,218,222,235,342`, `src-tauri/src/prompt.rs:18-19`

Mutex poison panics are silent crashes. Replace:
```rust
// Current:
let mut channel = TIMER_CHANNEL.lock().unwrap();
// Fix:
let mut channel = TIMER_CHANNEL.lock().unwrap_or_else(|e| e.into_inner());
// Or propagate as error in command handlers
```

---

## MEDIUM — Fix Soon

### 11. Create Custom Hook for Tauri Event Listener Cleanup
**Files:** `src/Prompt.tsx:97-102`, `src/components/ApplicationLayout.tsx:48-54` (4+ duplications)

Extract the repeated pattern into:
```tsx
// src/hooks/useTauriEvent.ts
export function useTauriEvent(event: string, handler: () => void): void { ... }
```

### 12. Input Validation for Date/Format Parameters
**File:** `src-tauri/src/lib.rs:624-626` (and `export_work_entries`)

- Validate `start_date`/`end_date` match `YYYY-MM-DD` format before database query
- Return a typed error response rather than `Result<_, String>`

### 13. Replace Hash-Based Navigation
**File:** `src/hooks/useNavigation.tsx:18-42`

Hash navigation (`window.location.hash`) is inappropriate for a desktop Tauri app. Replace with a React state-based router (simple `useState` in App.tsx passed down as context, or a lightweight in-memory router). This avoids polluting the webview URL and makes navigation testable.

### 14. Add Graceful Shutdown for Background Loops
**File:** `src-tauri/src/auto_logger.rs:69-110, 114-160, 164-192`

Three `loop {}` blocks run indefinitely with no shutdown signal. Implement a `tokio::sync::broadcast` shutdown channel:
```rust
let (shutdown_tx, _) = broadcast::channel::<()>(1);
// Pass receiver into each loop; select! on shutdown signal to break
```
Wire `shutdown_tx.send(())` into the Tauri `on_window_event` close handler.

### 15. Remove Dead Code and Allow Attributes
**Files:** `src-tauri/src/smart_capture.rs:70,98`, `src-tauri/src/idle_detector.rs:70`

Remove `#[allow(dead_code)]` attributes and either implement or delete the annotated items.

### 16. Validate Database Schema on Startup
**File:** `src-tauri/src/lib.rs` (startup/migration section)

Add a lightweight health check after migrations run:
```rust
sqlx::query("SELECT 1 FROM work_entries LIMIT 1").fetch_optional(&pool).await
    .map_err(|e| format!("DB schema check failed: {}", e))?;
```

### 17. Sensitive Data in Debug Logs
**File:** `src-tauri/src/openai.rs:104-170`

- Never log full screenshot base64 data even in debug mode — store a hash or dimensions only
- Display a prominent warning in the UI when debug logging is enabled
- Reduce debug log retention from 7 days to 24-48 hours, or make it configurable

---

## LOW — Nice to Have

### 18. Improve Test Coverage
- Current: ~28% file coverage (19/67 files)
- Priority untested files: `HomeView.tsx`, error branches in all views, database edge cases
- Target: ≥50% file coverage with meaningful assertions (not just render tests)

### 19. Break Up SprintBoardView
**File:** `src/views/SprintBoardView.tsx` (887 lines)

Extract nested components (`TaskCard`, `WorkLinksPanel`, `TaskDetailDialog`, `CreateTaskDialog`, `BoardColumn`) to individual files under `src/components/sprintboard/` to improve testability and readability.

### 20. Centralize Database Connection Pool
**Files:** `src-tauri/src/openai.rs`, `src-tauri/src/auto_logger.rs`, `src-tauri/src/prompt.rs`

Currently each operation opens and closes its own `SqlitePool`. Create an `Arc<SqlitePool>` stored in Tauri app state and inject it into commands, following the patterns already used in `lib.rs`.

### 21. Screenshot Privacy Mode
**File:** `src-tauri/src/smart_capture.rs`

Long-term: detect sensitive windows (password managers, lock screens) by window title/class and skip or blur them before storage and API transmission.

---

## Verification

After implementing the above:

1. **Security:**
   - Confirm new API key is in `.env` and not tracked by git (`git status`, `git log --all --full-history -- .env`)
   - Verify CSP header is active in Tauri DevTools (Network tab)
   - Run `cargo clippy --all-targets` — should have zero warnings

2. **Frontend quality:**
   - `tsc --noEmit` — zero type errors
   - `npm test` — all existing tests pass, new error boundary tests pass
   - Manually trigger an error in a view and confirm toast appears (not `alert()`)

3. **Rust quality:**
   - `cargo test` in `src-tauri/`
   - Force-lock a mutex to poison it; confirm app recovers gracefully
   - Check that closing the window cleanly terminates background loops (no lingering process)

4. **Screenshot buffer:**
   - Simulate >100 captures and confirm buffer caps at 100
   - Confirm memory usage remains bounded

---

## Files to Modify (Critical Path)

| File | Changes |
|------|---------|
| `.env` / `.gitignore` | Remove/rotate key; ensure ignored |
| `src-tauri/tauri.conf.json` | Add CSP |
| `src-tauri/capabilities/main.json` | Add scoping comments / restrict |
| `src/App.tsx` | Add `<ErrorBoundary>` |
| `src/Prompt.tsx` | Fix `as any`, replace `alert()` |
| `src/views/SettingsView.tsx` | Replace `alert()` calls |
| `src/views/AISummaryView.tsx` | Remove console.logs, consolidate DB access |
| `src/views/WorkLogView.tsx` | Consolidate DB access |
| `src/views/CalendarView.tsx` | Consolidate DB access |
| `src/hooks/useNavigation.tsx` | State-based router |
| `src/hooks/useTauriEvent.ts` | New: shared event hook |
| `src/hooks/useDatabase.ts` | New: shared DB hook |
| `src-tauri/src/smart_capture.rs` | Buffer size limit |
| `src-tauri/src/auto_logger.rs` | Unwrap fixes, shutdown signal, buffer guard |
| `src-tauri/src/prompt.rs` | Unwrap fixes |
| `src-tauri/src/openai.rs` | Debug log sensitive data fix |
| `src-tauri/src/lib.rs` | Input validation, DB health check |

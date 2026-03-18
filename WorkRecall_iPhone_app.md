# Plan: WorkRecall iOS App

## Context

WorkRecall is currently a desktop-only app (Windows/macOS) built with Tauri (Rust backend) + React/TypeScript. It runs local SQLite, 43 Tauri commands, and features like work logging, screenshot analysis, AI summaries, sprint board, and data export. There is no cloud sync.

The goal is to create an iOS companion app — determining what architectural changes are needed (especially data sync), which code can be reused, and what should be written natively.

---

## What Needs to Change First (Prerequisites)

### 1. Data sync / backend required
The biggest blocker: data lives only in local SQLite. iOS needs its own copy, and users will expect their entries to be available across devices.

**Recommended approach: Supabase + PowerSync**
- Supabase provides managed Postgres + Auth
- PowerSync handles offline-first sync (local SQLite ↔ Postgres)
- Free tier covers MVP; $25-100/mo at scale
- Sync becomes a premium feature (fits existing freemium model)

**Desktop changes needed:**
- Add Supabase auth (email + password, or OAuth)
- Replace raw `sqlx` SQLite calls with a sync-aware layer
- Keep local SQLite as source of truth; PowerSync handles replication
- Affected files: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`

**MVP shortcut:** Ship iOS as local-only first (no sync), add sync in Phase 2.

### 2. API key handling
Currently `OPENAI_API_KEY` is read from environment on desktop. On iOS, this must be stored in Keychain. Options:
- User brings their own key (store in Keychain)
- Route calls through a proxy backend (Supabase Edge Functions)

---

## Recommended iOS Approach: Native Swift + SwiftUI + Rust via UniFFI

**Do NOT use:**
- **React Native** — too much refactoring for marginal gain; Tauri-specific calls all need replacing; no real code reuse over going native
- **Capacitor** — works as a prototype only; App Store may flag web wrappers; iOS users feel the performance gap; no background task support
- **Tauri Mobile** — experimental, unstable plugin ecosystem, risky for production in 2025/2026

**Recommended:** Native SwiftUI + Rust business logic via UniFFI

### Why
- SwiftUI is the modern, Apple-endorsed UI framework (UIKit is legacy; avoid for new apps)
- Rust business logic compiles to iOS via `aarch64-apple-ios` target
- UniFFI (Mozilla, production-ready) auto-generates Swift bindings from Rust
- Full access to iOS APIs: Background tasks, Keychain, Widgets, Shortcuts, push notifications
- Sustainable long-term — no framework version churn

---

## What to Reuse vs. Rewrite

### Reuse (via UniFFI — ~30-40% of codebase)

| Module | File | Reuse strategy |
|--------|------|----------------|
| OpenAI API client | `src-tauri/src/openai.rs` | Extract from Tauri layer → compile as iOS static lib |
| Database operations | `src-tauri/src/lib.rs` (CRUD commands) | Extract to a `core` crate → UniFFI bindings |
| Idle detection logic | `src-tauri/src/idle_detector.rs` | Port algorithm to Swift (iOS input events are different) |
| i18n strings | `src/i18n/locales/en/*.json` + `nl/*.json` | Reuse JSON files directly in iOS app (`.strings` or `Localizable.xcstrings`) |
| Data types / models | Rust structs in `lib.rs` | Auto-generate Swift equivalents via UniFFI |

### Rewrite from scratch (iOS-native)

| What | Why |
|------|-----|
| All UI (SwiftUI) | React components don't translate; SwiftUI is idiomatic and performant |
| Navigation / routing | `useNavigation.tsx` → SwiftUI NavigationStack |
| Screenshot capture | `src-tauri/src/smart_capture.rs` — iOS can only capture own app view; rewrite as iOS-native screen recording |
| System tray / autostart | Does not exist on iOS — replace with iOS Widgets + Background App Refresh |
| Prompt/reminder system | `src-tauri/src/prompt.rs` — replace with UNUserNotificationCenter (iOS push) |
| SQLite access | Use GRDB (Swift SQLite library) instead of `sqlx` |
| File export | DocumentPickerViewController instead of tauri-plugin-dialog |

### Feature mapping for iOS

| Desktop feature | iOS equivalent |
|-----------------|---------------|
| System tray background process | BGAppRefreshTask + BGProcessingTask |
| Idle detection → auto-pause logging | Simpler: time-based reminder ("haven't logged in 30 min") |
| Periodic prompt popup | Local notification via UNUserNotificationCenter |
| Screenshot analysis | Optional: user manually initiates capture of their own screen |
| Autostart on login | iOS Shortcuts app integration |
| File export (CSV/JSON) | Share sheet + Files app via UIDocumentPickerViewController |
| Dark/light theme | Automatic via SwiftUI `.preferredColorScheme` |

---

## Architecture Plan for Rust/UniFFI Layer

### Step 1: Extract core Rust into a separate crate
Create `src-tauri/crates/workrecall-core/` with:
- `database.rs` — all CRUD operations (currently spread through `lib.rs`)
- `openai.rs` — OpenAI client (already isolated)
- `models.rs` — shared data types

Keep Tauri-specific code (window management, system tray, `prompt.rs`, `idle_detector.rs`) in the Tauri layer only.

### Step 2: Annotate with UniFFI macros
```rust
#[uniffi::export]
pub fn get_work_entries(date: String) -> Result<Vec<WorkEntry>, WorkRecallError> { ... }
```

### Step 3: Build iOS static library
```bash
cargo install cargo-xcframework
cargo xcframework --release --target aarch64-apple-ios aarch64-apple-ios-sim
```

### Step 4: Generate Swift bindings
```bash
uniffi-bindgen-swift WorkRecallCore.swift --xcframework WorkRecallCore.xcframework
```

### Step 5: Drag XCFramework into Xcode project

---

## Phased Roadmap

### Phase 1 — Desktop prep (2-3 weeks)
- Refactor `lib.rs`: extract core logic into `workrecall-core` crate (separates Tauri from business logic)
- Add Supabase auth to desktop app (optional for MVP)
- Ensure data models are serializable and versioned

### Phase 2 — iOS MVP, local-only (6-8 weeks)
- Create new Xcode project (SwiftUI)
- Integrate `workrecall-core` via UniFFI
- Build all views: WorkLog, AI Summary, Settings, Export
- Local SQLite only (no sync yet)
- OpenAI integration (user provides own API key, stored in Keychain)
- Push notification reminders (replaces prompt system)
- Submit to TestFlight

### Phase 3 — Sync + premium (4-6 weeks)
- Integrate Supabase Auth on both desktop and iOS
- Integrate PowerSync for desktop ↔ iOS data sync
- Sync as premium feature (subscription gate)
- Sprint board on iOS
- Widgets (iOS 16+ WidgetKit) for quick log entry

---

## Critical Files to Modify

- `src-tauri/src/lib.rs` — extract core logic to separate crate
- `src-tauri/src/openai.rs` — add UniFFI annotations
- `src-tauri/Cargo.toml` — add `workrecall-core` as workspace member
- `src-tauri/src/prompt.rs` — keep desktop-only, no iOS use

## New Files to Create

- `src-tauri/crates/workrecall-core/` — new Rust crate with shared logic
- `ios/WorkRecall.xcodeproj` — new Xcode project
- `ios/WorkRecall/Views/` — SwiftUI views

---

## Verification

1. Rust core crate: `cargo test -p workrecall-core` passes
2. UniFFI bindings: `cargo xcframework` builds without errors
3. Xcode: project compiles and runs on iOS Simulator (iPhone 16)
4. Manual test: create work entry on iOS, visible in SQLite
5. OpenAI test: AI summary generates from iOS app
6. TestFlight: build distributable and install on physical device

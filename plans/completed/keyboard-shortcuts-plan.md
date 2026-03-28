# Keyboard Shortcuts Plan

> GitHub Issue: #34

## Context

Users want to add new work log entries via a global keyboard shortcut, even when WorkTape is running in the background. This should open a quick-entry modal inspired by 1Password's shortcut modal, allowing fast logging without switching to the full application.

---

## 1. Default Keyboard Shortcut

### Recommended Default

| Platform | Shortcut |
|----------|----------|
| macOS | `Cmd + Shift + W` |
| Windows/Linux | `Ctrl + Shift + W` |

**Rationale**: `W` for "WorkTape" / "Work entry". `Cmd+Shift` is a common pattern for app-specific global shortcuts (e.g. 1Password uses `Cmd+Shift+X`, Raycast uses `Cmd+Space`). This combination is unlikely to conflict with common system or application shortcuts.

### Alternative Considered

- `Cmd+Shift+L` (L for "Log") — less intuitive brand association.
- `Ctrl+Alt+W` — `Ctrl+Alt` combos can interfere with Linux window managers.

---

## 2. Settings Section for Keyboard Shortcuts

### New Settings Card in SettingsView

Add a new card between the "Feature Tips" and "Software Updates" sections:

```
┌─────────────────────────────────────────────────┐
│  Keyboard Shortcuts                              │
│                                                  │
│  Configure global keyboard shortcuts.            │
│                                                  │
│  Quick entry     [Cmd + Shift + W]  [Change]     │
│                                                  │
│  ☐ Enable global shortcut                        │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Settings Storage

Store in the existing SQLite `settings` table:
- `shortcut_quick_entry`: string, default `"CmdOrCtrl+Shift+W"` (Tauri accelerator format)
- `shortcut_enabled`: boolean, default `true`

### Shortcut Recorder

When the user clicks "Change", show a key capture input that records the next key combination. Validate that the shortcut:
1. Contains at least one modifier key (Cmd/Ctrl/Alt/Shift)
2. Contains exactly one non-modifier key
3. Does not conflict with known system shortcuts

---

## 3. Implementation of the Global Shortcut

### Technology

Use `tauri-plugin-global-shortcut` (already available for Tauri v2). This plugin allows registering system-wide keyboard shortcuts that work even when the app is minimized or in the background.

### Registration Flow

1. **On app startup** (`lib.rs` → `setup`):
   - Read the shortcut configuration from the database
   - If enabled, register the global shortcut using the plugin
   - On trigger → emit a Tauri event `quick-entry-requested`

2. **On settings change**:
   - Unregister the old shortcut
   - Register the new shortcut
   - Persist to database

3. **On app exit**: shortcuts are automatically unregistered by the plugin.

### Rust Backend

Add a new Tauri command `register_quick_entry_shortcut(shortcut: String)` and `unregister_quick_entry_shortcut()`.

### Frontend Listener

In `App.tsx`, listen for the `quick-entry-requested` event and open the QuickEntryModal.

---

## 4. Quick Entry Modal (Popup)

### Design (Inspired by 1Password)

The modal should be a floating, centered overlay (not a new window), appearing on top of whatever view is active. It should be compact and focused.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  What are you working on?              [Cmd+↵]  │    │
│  │                                                  │    │
│  │  ┌──────────────────────────────────────────┐    │    │
│  │  │  (text input)                            │    │    │
│  │  └──────────────────────────────────────────┘    │    │
│  │                                                  │    │
│  │  Link to sprint task  [▼ Select task       ]     │    │
│  │                                                  │    │
│  │  ─────────── Today's entries ───────────         │    │
│  │                                                  │    │
│  │  ▸ Fixed login timeout issue       [Auth]        │    │
│  │  ▸ Code review for PR #42                        │    │
│  │  ▸ Sprint planning meeting         [Planning]    │    │
│  │  ▸ Updated API documentation       [Docs]        │    │
│  │                                                  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Elements

The modal contains the same elements as the Prompt window, plus a history section:

1. **Title**: "What are you working on?" (same as Prompt)
2. **Text input**: Single-line input (not textarea) for quick entry. Auto-focused.
3. **Sprint task selector**: Same dropdown as in Prompt, showing non-done sprint tasks.
4. **Submit**: `Cmd+Enter` or `Ctrl+Enter` to submit (keyboard-first workflow).
5. **Dismiss**: `Escape` to close without saving.

### Today's Entry History

Below the input, show all **unique** entries added **today**:
- Query all work entries for today, deduplicated by description
- Show the description and linked task name (if any) as a tag
- Clicking an entry **prefills** both the description field and the linked task selector
- Shift+clicking an entry immediately saves it (same as Prompt behavior)
- Maximum display: scroll if more than ~6 entries

### Positioning

- Horizontally centered on screen
- Vertically positioned at approximately 30% from the top (not dead center — slightly above, like Spotlight/1Password)
- Max width: 540px
- Semi-transparent dark overlay behind the modal

### Animation

- Fade in + slight scale up (0.95 → 1.0) on open
- Fade out on close
- Use existing `motion/react` library already in the project

---

## 5. Technical Architecture

### Component Structure

```
src/
  components/
    QuickEntryModal.tsx        # The modal component
    QuickEntryModal.test.tsx   # Tests
  hooks/
    useGlobalShortcut.ts       # Hook for registering/listening to shortcuts
```

### State Management

The QuickEntryModal should NOT share state with the Prompt window. It should:
1. Load sprint tasks fresh when opened (fix for issue #32 pattern)
2. Load today's unique entries when opened
3. After save, emit the existing `work-entry-saved` event so other views update

### Window Focus Handling

When the shortcut is triggered while the app is in the background:
- If the app has a main window, bring it to front using `tauri::Window::set_focus()`
- Show the modal overlay
- If the app window doesn't exist (minimized to tray), create/show the main window first

### Tauri Plugin Setup

In `Cargo.toml`:
```toml
tauri-plugin-global-shortcut = "2"
```

In `lib.rs` setup:
```rust
.plugin(tauri_plugin_global_shortcut::Builder::new().build())
```

In `capabilities/`:
```json
{
  "permissions": ["global-shortcut:allow-register", "global-shortcut:allow-unregister"]
}
```

---

## 6. i18n

Add new translation keys:

**settings.json**:
```json
{
  "shortcuts": {
    "title": "Keyboard Shortcuts",
    "description": "Configure global keyboard shortcuts.",
    "quickEntry": "Quick entry",
    "change": "Change",
    "enabled": "Enable global shortcut",
    "recording": "Press a key combination…",
    "conflict": "This shortcut conflicts with {{conflict}}"
  }
}
```

**quickentry.json** (new namespace):
```json
{
  "title": "What are you working on?",
  "placeholder": "Describe your current task…",
  "todayEntries": "Today's entries",
  "noEntries": "No entries yet today",
  "submit": "Submit",
  "taskLink": {
    "label": "Link to sprint task",
    "noTask": "No task"
  }
}
```

---

## 7. Implementation Order

| Step | Description | Estimated Effort |
|------|-------------|-----------------|
| 1 | Add `tauri-plugin-global-shortcut` dependency and capabilities | 30 min |
| 2 | Create Rust commands for shortcut registration/unregistration | 1-2 hours |
| 3 | Create `useGlobalShortcut` hook | 1 hour |
| 4 | Build `QuickEntryModal` component with input + task selector | 2-3 hours |
| 5 | Add today's entry history section to modal | 1-2 hours |
| 6 | Add keyboard shortcuts settings card | 1-2 hours |
| 7 | Add i18n strings (EN + NL) | 30 min |
| 8 | Write tests | 1-2 hours |
| **Total** | | **~8-13 hours** |

---

## 8. Open Questions

- Should the quick entry modal work when a Prompt window is already open?
  Answer: close the prompt and use the modal instead
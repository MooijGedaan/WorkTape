# Plan: Feedback / Bug Report System

**Issue:** #42
**Date:** 2026-03-30

## Overview

Add an in-app feedback and bug report system that allows beta users to submit feedback, improvement suggestions, and bug reports. Bug reports automatically include recent application logs. All submissions are stored in a Supabase table (used by the WorkTape website) so they can be reviewed remotely.

## Two Submission Types

### 1. Bug Report

**Input fields:**
- **Title** (required) — short summary of the bug
- **Description** (required) — textarea for what happened, what was expected, and steps to reproduce
- **Screenshot** (optional) — image upload (drag-and-drop or file picker) for visual evidence
- **Email** (optional) — so the developer can follow up
- **Severity** — dropdown: `critical` / `major` / `minor` (defaults to `major`)

**Automatic attachments (sent silently):**
- Last 1 hour of `api_call_logs` entries (excluding request messages for privacy, unless debug mode is on)
- App version, OS, and locale
- Device ID (already tracked for the proxy)

### 2. Feedback / Improvement Suggestion

**Input fields:**
- **Category** — dropdown: `feature request` / `improvement` / `general feedback`
- **Description** (required) — textarea for the suggestion
- **Email** (optional) — for follow-up

No logs or screenshots are attached for feedback submissions to keep the form lightweight.

## UI Placement

- Add a **floating action button** (FAB) or a clearly visible icon button in the **sidebar**, below the existing navigation items. Use a chat-bubble or megaphone icon from Heroicons.
- Clicking it opens a **modal dialog** (using the existing Catalyst dialog component) with two tabs: "Bug Report" and "Feedback".
- After successful submission, show a success toast/notification and close the modal.
- The button should be visible from every view so users can report issues the moment they encounter them.

## Frontend Implementation

### New Components

| Component | Purpose |
|---|---|
| `FeedbackModal.tsx` | Modal with tab switcher between Bug Report and Feedback forms |
| `BugReportForm.tsx` | Bug report form with image upload, severity selector |
| `FeedbackForm.tsx` | Feedback form with category selector |
| `ImageUploadField.tsx` | Drag-and-drop or click-to-upload image component |

### Image Handling

- Use a `<input type="file" accept="image/*">` with a drag-and-drop zone.
- Convert the selected image to base64 before submission (keeps things simple, avoids needing a separate file storage bucket for now).
- Limit file size to 5 MB on the client side; show a validation error if exceeded.
- Display a thumbnail preview after selection.

### Log Collection (Bug Reports Only)

- Create a new Tauri command `collect_recent_logs` in `lib.rs`:
  - Queries `api_call_logs` for the last 60 minutes.
  - Strips `request_messages` column unless `debug_mode` is enabled.
  - Returns as JSON array.
- The frontend calls this command when the user submits a bug report and attaches the result to the payload.

### Submission

- POST to a new endpoint on the existing Cloudflare Workers proxy: `POST /feedback`.
- The proxy forwards the data to Supabase (keeps the Supabase credentials server-side).
- Payload structure:

```json
{
  "type": "bug_report" | "feedback",
  "device_id": "...",
  "app_version": "...",
  "os": "...",
  "locale": "...",
  "title": "...",           // bug reports only
  "description": "...",
  "severity": "...",        // bug reports only
  "category": "...",        // feedback only
  "email": "...",           // optional
  "screenshot_base64": "...", // optional, bug reports only
  "logs_json": [...]        // bug reports only
}
```

## Backend: Tauri Command

Add one new command to `lib.rs`:

```rust
#[tauri::command]
async fn collect_recent_logs(db: State<'_, DbPool>) -> Result<Vec<ApiCallLog>, String>
```

- Queries `api_call_logs WHERE request_timestamp >= datetime('now', '-1 hour')`.
- Respects the `debug_mode` setting for including/excluding request messages.
- Returns a serializable struct.

## Backend: Cloudflare Workers Proxy

Add a new route `POST /feedback` to the existing proxy worker:

1. Validate the `X-Device-Token` header (reuse existing auth).
2. Parse and validate the JSON body.
3. If a screenshot is included, upload it to a **Supabase Storage** bucket (`feedback-screenshots`) and store the resulting URL.
4. Insert a row into the `feedback_submissions` Supabase table.
5. Return `201 Created` on success.

## Supabase Setup

### Table: `feedback_submissions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key, auto-generated |
| `type` | text | `bug_report` or `feedback` |
| `device_id` | text | Identifies the device |
| `app_version` | text | e.g. `0.1.4` |
| `os` | text | e.g. `darwin`, `win32` |
| `locale` | text | e.g. `en`, `nl` |
| `title` | text | Nullable, bug reports only |
| `description` | text | Required |
| `severity` | text | Nullable, `critical` / `major` / `minor` |
| `category` | text | Nullable, `feature_request` / `improvement` / `general_feedback` |
| `email` | text | Nullable |
| `screenshot_url` | text | Nullable, URL to Supabase Storage object |
| `logs_json` | jsonb | Nullable, array of log entries |
| `created_at` | timestamptz | Default `now()` |

### Storage Bucket: `feedback-screenshots`

- Public read (so the developer can view screenshots from the Supabase dashboard).
- Max file size: 5 MB.
- Accepted MIME types: `image/png`, `image/jpeg`, `image/webp`.

### Connecting from the Proxy

The Cloudflare Worker already has environment bindings. Add the Supabase URL and service role key as Worker secrets:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<key>
```

Use the Supabase REST API (`/rest/v1/feedback_submissions`) with the service role key in the `Authorization` header.

## Internationalization

Add new i18n keys for both `en` and `nl` translations:

- `feedback.bugReport` / `feedback.feedback`
- `feedback.title`, `feedback.description`, `feedback.severity`, `feedback.category`, `feedback.email`, `feedback.screenshot`
- `feedback.submitSuccess`, `feedback.submitError`
- `feedback.imageTooLarge`
- Severity and category option labels

## Implementation Order

1. Create the Supabase table and storage bucket.
2. Add the `POST /feedback` route to the Cloudflare Workers proxy.
3. Add the `collect_recent_logs` Tauri command.
4. Build the frontend components (`ImageUploadField` → `BugReportForm` / `FeedbackForm` → `FeedbackModal`).
5. Add the sidebar trigger button.
6. Add i18n translations.
7. Test end-to-end: bug report with screenshot + logs, feedback without.

## Risks & Considerations

- **Privacy:** Logs are stripped of request messages by default. Only metadata (timestamps, endpoints, tokens used, errors) is sent. Users should see a small note in the bug report form explaining that diagnostic data will be included.
- **Image size:** 5 MB base64-encoded becomes ~6.7 MB in the JSON payload. This is acceptable for occasional bug reports but would not scale for frequent uploads. Supabase Storage handles the actual file, so the proxy should stream the upload rather than buffering the full payload.
- **Rate limiting:** Consider adding basic rate limiting on the proxy endpoint (e.g., max 10 submissions per device per hour) to prevent abuse.

# Outlook Calendar Integration - Completion Report

**Issue:** #43
**Date Planned:** 2026-03-30
**Date Implemented:** 2026-03-30

## What Was Implemented

### 1. Microsoft OAuth Module (`src-tauri/src/microsoft.rs`)

Full implementation of:

- **OAuth 2.0 with PKCE** - Authorization Code flow suitable for desktop public clients (no client secret needed)
- **Local HTTP callback server** - Starts on a random available port, handles the OAuth redirect, and captures the authorization code
- **Token exchange** - Exchanges authorization code for access + refresh tokens
- **Token refresh** - Automatically refreshes expired access tokens using the refresh token (with 5-minute buffer)
- **Token storage** - Stores tokens in the existing SQLite `settings` key-value table (`ms_access_token`, `ms_refresh_token`, `ms_token_expires_at`, `ms_account_email`)
- **Auth status check** - Returns `connected`, `disconnected`, or `expired`
- **Disconnect** - Clears all stored tokens
- **Calendar event fetching** - Fetches events from Microsoft Graph `calendarView` endpoint for a given date
- **Event formatting** - Formats calendar events for inclusion in AI prompts (different format for all-day vs timed events)
- **User profile fetch** - Gets the connected user's email via the `/me` endpoint
- **Browser opener** - Cross-platform (Windows `cmd /C start`, macOS `open`, Linux `xdg-open`)
- **PKCE SHA-256** - Inline implementation to avoid adding a crypto dependency
- **URL encoding** - Inline implementation to avoid adding a dependency

No new Cargo dependencies were needed.

### 2. Tauri Commands (4 new commands in `src-tauri/src/lib.rs`)

| Command | Purpose |
|---|---|
| `start_microsoft_auth` | Starts the OAuth flow, returns the connected email |
| `get_microsoft_auth_status` | Returns `(status, email)` - status is `connected`/`disconnected`/`expired` |
| `disconnect_microsoft` | Clears stored tokens |
| `fetch_calendar_events(date)` | Fetches events for a given date, with automatic token refresh and 401 retry |

### 3. AI Summary Prompt Integration (`src-tauri/src/openai.rs` + `lib.rs`)

- Modified `generate_grouped_summary()` to accept an optional `calendar_context` parameter
- Modified `generate_grouped_daily_summary` command to:
  - Check if Microsoft calendar is connected
  - Attempt token refresh if needed
  - Fetch calendar events for the summary date
  - Format events and build the calendar context prompt section (in English or Dutch)
  - Pass calendar context to all AI summary calls
- **Graceful degradation**: If calendar fetch fails for any reason, the summary still generates using work entries only
- Calendar context is appended to user prompts (not system prompts) so it appears alongside the work entries

### 4. Settings UI (`src/views/SettingsView.tsx`)

New "Calendar Integration" section with three states:

- **Disconnected**: Shows description + "Connect Outlook Calendar" button
- **Connected**: Green indicator + "Outlook Calendar connected" + email address + "Disconnect" button
- **Expired**: Yellow warning indicator + expiry message + "Reconnect" and "Disconnect" buttons

### 5. Internationalization

Added translation keys for `settings.calendar.*` in both:
- `src/i18n/locales/en/settings.json` (English)
- `src/i18n/locales/nl/settings.json` (Dutch)

## What You Need To Do

### 1. Register a Microsoft Entra ID Application (Required)

This is the one step that can't be done in code - you need to register an app in the Azure portal:

1. Go to [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Navigate to **Applications** > **App registrations** > **New registration**
3. Configure:
   - **Name:** `WorkTape Desktop`
   - **Supported account types:** "Accounts in any organizational directory and personal Microsoft accounts" (multi-tenant)
   - **Redirect URI:** Select "Public client/native (mobile & desktop)" and enter `http://localhost`
4. After creation, copy the **Application (client) ID**
5. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**:
   - Add `Calendars.Read`
   - Add `offline_access` (for refresh tokens)
6. No client secret needed (this is a public client using PKCE)

### 2. Set the Client ID in Code

Open `src-tauri/src/lib.rs` and replace the placeholder:

```rust
const MS_CLIENT_ID: &str = "YOUR_CLIENT_ID_HERE";
```

Replace `YOUR_CLIENT_ID_HERE` with the Application (client) ID from step 1.

### 3. Test End-to-End

1. Build and run the app
2. Go to Settings > Calendar Integration
3. Click "Connect Outlook Calendar"
4. Sign in with your Microsoft account in the browser
5. After redirect, you should see "Connected as [email]" in Settings
6. Generate a daily summary for a day that has calendar events
7. Verify the summary weaves in calendar context naturally

### 4. Optional: Publisher Verification

For multi-tenant apps (work/school accounts from other organizations), Microsoft may require publisher verification. This is not enforced for development, but for wider distribution:
- Go to the app's **Branding** page in the Entra portal
- Add a verified publisher domain

## Architecture Decisions

- **No new crates**: SHA-256, URL encoding, and browser opening are implemented inline to keep the dependency tree minimal
- **Settings table reuse**: Tokens are stored in the existing `settings` key-value table rather than adding a new table, keeping things simple
- **Graceful degradation**: Calendar data never blocks summary generation. If anything fails (token expired, network error, etc.), summaries still work with work entries alone
- **No database migration needed**: The existing `settings` table already supports arbitrary key-value pairs
- **Calendar context in user prompts**: Added to user messages rather than system prompts, so it appears alongside the work entries for better context

## Files Changed

| File | Change |
|---|---|
| `src-tauri/src/microsoft.rs` | **NEW** - Full Microsoft OAuth + Graph API module |
| `src-tauri/src/lib.rs` | Added `mod microsoft`, 4 new Tauri commands, calendar context in summary generation |
| `src-tauri/src/openai.rs` | Added `calendar_context` parameter to summary functions and prompt builders |
| `src/views/SettingsView.tsx` | Added Calendar Integration section with connect/disconnect/reconnect UI |
| `src/i18n/locales/en/settings.json` | Added `settings.calendar.*` translations |
| `src/i18n/locales/nl/settings.json` | Added `settings.calendar.*` translations |

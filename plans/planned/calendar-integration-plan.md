# Plan: Outlook Calendar Integration

**Issue:** #43
**Date:** 2026-03-30

## Overview

Add Microsoft Outlook calendar integration to WorkTape. Users authenticate via Microsoft OAuth, granting the app read access to their calendar. When generating a daily AI summary, calendar events for that day are fetched and included as additional context, resulting in richer and more accurate summaries.

## Authentication Flow

### Microsoft Entra ID (Azure AD) App Registration

Register a new application in the Microsoft Entra admin center:

- **Name:** WorkTape Desktop
- **Supported account types:** Personal Microsoft accounts + Work/School accounts (multi-tenant)
- **Redirect URI:** `http://localhost:<port>/callback` (custom localhost redirect for desktop OAuth)
- **API Permissions:** `Calendars.Read` (delegated) — read-only access to the user's calendar
- **Platform:** Mobile and desktop applications

### OAuth 2.0 Authorization Code Flow with PKCE

Since WorkTape is a public desktop client (no client secret can be securely stored), use the **Authorization Code flow with PKCE**:

1. **User clicks "Connect Outlook"** in Settings.
2. **Tauri backend** generates a PKCE `code_verifier` and `code_challenge`.
3. **Tauri backend** starts a temporary local HTTP server on a random available port (e.g., `localhost:48321`).
4. **Open the system browser** to Microsoft's authorization endpoint:
   ```
   https://login.microsoftonline.com/common/oauth2/v2.0/authorize
     ?client_id=<APP_CLIENT_ID>
     &response_type=code
     &redirect_uri=http://localhost:<port>/callback
     &scope=Calendars.Read offline_access
     &code_challenge=<challenge>
     &code_challenge_method=S256
     &state=<random>
   ```
5. User logs in and consents in their browser.
6. Microsoft redirects to `http://localhost:<port>/callback?code=<auth_code>&state=<state>`.
7. **Local HTTP server** captures the code, shuts down, and exchanges it for tokens:
   ```
   POST https://login.microsoftonline.com/common/oauth2/v2.0/token
   grant_type=authorization_code
   &code=<auth_code>
   &redirect_uri=http://localhost:<port>/callback
   &client_id=<APP_CLIENT_ID>
   &code_verifier=<verifier>
   ```
8. Store the `access_token`, `refresh_token`, and `expires_at` in the SQLite `settings` table (keys: `ms_access_token`, `ms_refresh_token`, `ms_token_expires_at`).

### Token Refresh

- Before each Microsoft Graph API call, check if `ms_token_expires_at` is within 5 minutes of now.
- If so, use the `refresh_token` to get a new `access_token`:
  ```
  POST https://login.microsoftonline.com/common/oauth2/v2.0/token
  grant_type=refresh_token
  &refresh_token=<refresh_token>
  &client_id=<APP_CLIENT_ID>
  &scope=Calendars.Read offline_access
  ```
- Update stored tokens.
- If refresh fails (token revoked), clear stored tokens and prompt the user to reconnect.

## Fetching Calendar Events

### Microsoft Graph API

Use the calendar view endpoint to get events for a specific day:

```
GET https://graph.microsoft.com/v1.0/me/calendarView
  ?startDateTime=2026-03-30T00:00:00
  &endDateTime=2026-03-30T23:59:59
  &$select=subject,start,end,bodyPreview,isAllDay
  &$orderby=start/dateTime
  &$top=50
```

Headers:
```
Authorization: Bearer <access_token>
```

### Response Mapping

Map each event to a simple struct:

```rust
struct CalendarEvent {
    subject: String,
    start_time: String,     // ISO 8601
    end_time: String,       // ISO 8601
    duration_minutes: i32,
    description: String,    // bodyPreview, truncated to 200 chars
    is_all_day: bool,
}
```

### Error Handling

- **401 Unauthorized:** Attempt token refresh, retry once. If still failing, mark connection as stale and notify user.
- **Network errors:** Log the error, proceed with summary generation without calendar data (graceful degradation).
- **No events:** Simply pass an empty list; the AI prompt handles this case.

## Integration with AI Summarization

### Modified Summary Flow

Currently in `openai.rs`, `generate_grouped_summary()` builds a prompt from work entries only. The change:

1. Before generating the summary, check if Microsoft tokens exist and are valid.
2. If connected, call `fetch_calendar_events(date)` to get the day's events.
3. Pass the events to a new prompt section appended to the existing prompt.

### Prompt Addition

Add a new section to the daily summary system prompt (in both `en` and `nl`):

**English:**
```
The user had the following calendar events on this day:
{events_formatted}

Use these calendar events as context to make the summary more accurate.
For example, if work entries mention a discussion or meeting, you can
reference the actual calendar event. Do not list the calendar events
separately — weave them naturally into the summary of work done.
```

**Dutch:**
```
De gebruiker had de volgende agenda-items op deze dag:
{events_formatted}

Gebruik deze agenda-items als context om de samenvatting nauwkeuriger
te maken. Als werkitems verwijzen naar een overleg of vergadering, kun
je het daadwerkelijke agenda-item benoemen. Som de agenda-items niet
apart op — verwerk ze op een natuurlijke manier in de samenvatting.
```

**Event formatting** (per event):
```
- {subject} ({start_time} - {end_time}, {duration_minutes} min): {description}
```

All-day events:
```
- {subject} (all day): {description}
```

If no events exist for the day, omit the calendar section from the prompt entirely (don't mention "no events").

## New Tauri Commands

| Command | Purpose |
|---|---|
| `start_microsoft_auth` | Starts OAuth flow: generates PKCE, starts local server, opens browser |
| `get_microsoft_auth_status` | Returns connection status: `disconnected`, `connected`, `expired` |
| `disconnect_microsoft` | Clears stored tokens |
| `fetch_calendar_events(date: String)` | Fetches events for a given date from Microsoft Graph |

## New Rust Module: `microsoft.rs`

Create a new module `src-tauri/src/microsoft.rs` to keep Microsoft-related logic separate:

- `start_auth_flow()` — PKCE generation, local server, token exchange
- `refresh_token_if_needed()` — token refresh logic
- `fetch_calendar_events()` — Graph API call and response parsing
- `get_auth_status()` — checks token existence and expiry
- `disconnect()` — clears tokens from settings table

## Settings UI Changes

Add a new section to `SettingsView.tsx`: **"Calendar Integration"**

### Disconnected State
- Microsoft/Outlook icon + "Connect Outlook Calendar" button
- Brief explanation: "Connect your Outlook calendar to include meeting context in your daily summaries."

### Connected State
- Green checkmark + "Outlook Calendar connected"
- "Disconnect" button
- Optional: show the connected Microsoft account email (available from the token's decoded JWT or a `/me` Graph call during auth)

### Expired/Error State
- Warning icon + "Calendar connection expired"
- "Reconnect" button

## Database Changes

No new tables needed. Use the existing `settings` key-value table for:

| Key | Value |
|---|---|
| `ms_access_token` | Encrypted access token |
| `ms_refresh_token` | Encrypted refresh token |
| `ms_token_expires_at` | ISO 8601 timestamp |
| `ms_account_email` | User's Microsoft email (for display) |

### Token Security

Tokens are stored in the local SQLite database. Since this is a desktop app where the DB file is on the user's own machine, this is acceptable. For additional security:

- Consider using the OS keychain via `tauri-plugin-keychain` (or `keytar`) for token storage instead of plain SQLite. This is a nice-to-have and can be added later.
- Never log tokens to `api_call_logs`.

## Internationalization

Add new i18n keys:

- `settings.calendar.title` — "Calendar Integration"
- `settings.calendar.connect` — "Connect Outlook Calendar"
- `settings.calendar.connected` — "Outlook Calendar connected"
- `settings.calendar.disconnect` — "Disconnect"
- `settings.calendar.reconnect` — "Reconnect"
- `settings.calendar.description` — "Connect your Outlook calendar to include meeting context in your daily summaries."
- `settings.calendar.expired` — "Calendar connection expired. Please reconnect."

## Implementation Order

1. **Microsoft Entra app registration** — register the app, note down client ID.
2. **`microsoft.rs` module** — implement OAuth flow with PKCE + local HTTP server, token storage, refresh logic.
3. **Calendar fetch** — implement `fetch_calendar_events()` using Microsoft Graph.
4. **Tauri commands** — expose the four new commands.
5. **Settings UI** — add the Calendar Integration section with connect/disconnect/reconnect.
6. **Prompt integration** — modify `openai.rs` to include calendar events in the daily summary prompt.
7. **i18n** — add translations.
8. **Test end-to-end** — connect account, generate a summary for a day with calendar events, verify events appear in the summary context.

## Dependencies

### Rust (Cargo.toml)

- No new crates strictly required — `reqwest`, `serde`, `serde_json`, and `tokio` are already present.
- For the temporary local HTTP server: use `tokio`'s TCP listener with a minimal HTTP parser, or add `tiny_http` (~lightweight) to avoid writing raw HTTP parsing.
- Optional future: `tauri-plugin-keychain` for OS keychain token storage.

### Frontend

- No new npm dependencies required. The existing Catalyst UI components and Heroicons cover all needed UI elements.

## Risks & Considerations

- **Microsoft app review:** For apps requesting `Calendars.Read` with multi-tenant support, Microsoft may require publisher verification. For beta/internal use this is not enforced, but for wider distribution it will be needed.
- **Localhost redirect:** Some corporate firewalls or VPNs may block localhost redirects. This is uncommon but worth noting. The alternative would be a custom URI scheme (`worktape://callback`), which Tauri supports via deep linking — this can be explored if localhost proves problematic.
- **Token expiry:** Microsoft access tokens expire after ~1 hour, refresh tokens after 90 days of inactivity. Users who don't open the app for 90+ days will need to reconnect.
- **Privacy:** Calendar event subjects and descriptions are sent to the AI proxy as part of the summary prompt. The existing privacy note about debug mode should be extended to mention calendar data. Consider adding a toggle to exclude event descriptions (send only subject + time).
- **Rate limits:** Microsoft Graph has generous rate limits (10,000 requests per 10 minutes per app). Fetching events for one day per summary is well within limits.
- **Graceful degradation:** If the calendar is connected but the fetch fails (network issue, expired token), the summary should still generate using work entries only — never block summary generation on calendar data.

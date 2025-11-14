# AI Summary Feature Implementation Plan

## Overview
Implement a daily work log summary feature that generates a professional overview from the user's work entries using OpenAI's GPT API. The system uses a predefined prompt (configurable by developers) to generate consistent, structured summaries.

**Current Approach:** Use OpenAI API directly with developer-managed API key
**Future Migration:** Easy swap to proxy server by changing endpoint URL

---

## Phase 1: Backend - Rust API Integration

### 1.1 Add Dependencies to `src-tauri/Cargo.toml`
```toml
reqwest = { version = "0.11", features = ["json"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }  # Already present
dotenv = "0.15"  # For .env file support
```

### 1.2 Create OpenAI Service Module (`src-tauri/src/openai.rs`)

**Purpose:** Centralized module for all OpenAI API interactions

**Key Components:**
- `OpenAIConfig` struct - Stores API key and model configuration
- `OpenAIClient` struct - Handles API communication
- `generate_summary()` function - Main entry point for summary generation
- `fetch_work_entries()` function - Query database for date-specific entries
- `build_prompt()` function - Formats entries with system prompt

**Configurable System Prompt:**
```rust
const SYSTEM_PROMPT: &str = "Create an overview of the users work of this day. \
Estimate the time the user has spend on each task and provide a short description (1 sentence).";
```

**API Request Structure:**
- Model: `gpt-4o-mini` (cost-effective, fast)
- Temperature: 0.7 (balanced creativity/consistency)
- Max tokens: 500 (sufficient for daily summaries)

**Response Handling:**
- Parse JSON response from OpenAI
- Extract generated text from choices[0].message.content
- Return plain text summary

### 1.3 Create Tauri Command (`src-tauri/src/lib.rs`)

**Command Signature:**
```rust
#[tauri::command]
async fn generate_daily_summary(
    app: tauri::AppHandle,
    date: Option<String>  // ISO format: "2025-11-14", defaults to today
) -> Result<String, String>
```

**Functionality:**
1. Parse date parameter (default to current date if None)
2. Fetch work entries from database for specified date
3. Call OpenAI service to generate summary
4. Return summary text or error message

**Error Handling:**
- No work entries found for date
- API key missing/invalid
- Network failures
- OpenAI API errors (rate limits, invalid response)

### 1.4 Configuration & Security

**Environment Variables (`.env` file):**
```env
OPENAI_API_KEY=sk-...your-key-here...
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_URL=https://api.openai.com/v1
```

**Security:**
- `.env` file added to `.gitignore` (never commit API keys)
- API key loaded at runtime from environment
- Example `.env.example` file for documentation

**Future Migration Path:**
- Change `OPENAI_API_URL` to proxy server endpoint
- No code changes needed - just configuration

---

## Phase 2: Frontend - AI Summary View

### 2.1 Create View Component (`src/views/AISummaryView.tsx`)

**UI Components:**
1. **Date Selector**
   - Date picker component (default: today)
   - Quick select buttons (Today, Yesterday, This Week)

2. **Generate Button**
   - Primary action button: "Generate Summary"
   - Disabled during loading or if no date selected
   - Shows loading spinner when processing

3. **Summary Display Area**
   - Large text area showing generated summary
   - Read-only display
   - Empty state when no summary generated yet
   - Proper formatting/line breaks

4. **Copy Button**
   - "Copy to Clipboard" button below summary
   - Only visible when summary exists
   - Shows success feedback ("Copied!")
   - Uses Clipboard API

5. **Status Messages**
   - Loading: "Generating your summary..."
   - Error: Display specific error message
   - Success: "Summary generated successfully"
   - Empty state: "No work entries found for this date"

**State Management:**
```typescript
const [selectedDate, setSelectedDate] = useState<Date>(new Date());
const [summary, setSummary] = useState<string>('');
const [isLoading, setIsLoading] = useState<boolean>(false);
const [error, setError] = useState<string | null>(null);
```

**API Integration:**
```typescript
const handleGenerate = async () => {
  setIsLoading(true);
  setError(null);

  try {
    const summary = await invoke<string>('generate_daily_summary', {
      date: selectedDate.toISOString().split('T')[0]
    });
    setSummary(summary);
  } catch (err) {
    setError(String(err));
  } finally {
    setIsLoading(false);
  }
};
```

### 2.2 Update Navigation

**Add to Sidebar (`src/components/catalyst/sidebar.tsx` or similar):**
- Menu item: "AI Summary"
- Icon: Sparkles/Stars/AI icon
- Route: `/ai-summary`

**Update Router (`src/components/ViewRouter.tsx` or `src/App.tsx`):**
```typescript
<Route path="/ai-summary" element={<AISummaryView />} />
```

### 2.3 UI/UX Details

**Loading State:**
- Disable all interactive elements during generation
- Show spinner/progress indicator
- Display "This may take a few seconds..."

**Error Handling Display:**
- Network errors: "Unable to connect. Please check your internet connection."
- No entries: "No work entries found for [date]. Try a different date."
- API errors: "Summary generation failed. Please try again."

**Success Feedback:**
- Subtle animation when summary appears
- Toast notification: "Summary generated!"
- Copy button shows "Copied!" for 2 seconds after click

---

## Phase 3: Database Queries

### 3.1 Work Entry Query Function

**Location:** `src-tauri/src/openai.rs` or separate DB module

**Query:**
```sql
SELECT description, timestamp
FROM work_entries
WHERE DATE(timestamp) = ?
ORDER BY timestamp ASC
```

**Parameters:**
- Date string in format: "YYYY-MM-DD"

**Return Format:**
```rust
struct WorkEntry {
    description: String,
    timestamp: String,  // ISO 8601 format
}
```

**Formatting for Prompt:**
```
9:30 AM: Fixed authentication bug in login flow
11:15 AM: Code review for PR #234
2:45 PM: Implemented new dashboard widget
```

**Timezone Handling:**
- Use local timezone for date boundaries
- Parse timestamps correctly to local time

---

## Phase 4: Prompt Engineering

### 4.1 System Prompt (Configurable in Code)

**Current Prompt:**
```
Create an overview of the users work of this day. Estimate the time the user has spend on each task and provide a short description (1 sentence).
```

**Location:** `src-tauri/src/openai.rs`
```rust
const SYSTEM_PROMPT: &str = "Create an overview of the users work of this day. \
Estimate the time the user has spend on each task and provide a short description (1 sentence).";
```

**Future Enhancement:** Could be moved to configuration file for easier updates without recompilation.

### 4.2 Message Structure to OpenAI

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "Create an overview of the users work of this day. Estimate the time the user has spend on each task and provide a short description (1 sentence)."
    },
    {
      "role": "user",
      "content": "Work entries for November 14, 2025:\n9:30 AM: Fixed authentication bug\n11:15 AM: Code review for PR #234\n..."
    }
  ],
  "temperature": 0.7,
  "max_tokens": 500
}
```

### 4.3 Expected Output Format

**Example Response:**
```
Today you worked on three main areas:

- Bug Fixes (2 hours): Fixed authentication bug in the login flow affecting mobile users.
- Code Reviews (1.5 hours): Reviewed PR #234 for the new dashboard implementation.
- Feature Development (3 hours): Implemented new analytics widget for the dashboard.
```

---

## Phase 5: Premium Feature Gating (Future)

### 5.1 Current Implementation
- Feature is **accessible to all users** for MVP
- No paywall or subscription check

### 5.2 Future Enhancement Hooks

**Subscription Check (to be added later):**
```rust
#[tauri::command]
async fn generate_daily_summary(
    app: tauri::AppHandle,
    date: Option<String>
) -> Result<String, String> {
    // Future: Check subscription status
    // if !user_has_premium_subscription() {
    //     return Err("Premium subscription required".to_string());
    // }

    // ... existing implementation
}
```

**Frontend Paywall UI:**
- Show upgrade prompt for free users
- "Upgrade to Premium" button
- Display pricing information

---

## Phase 6: Testing & Error Handling

### 6.1 Error Scenarios to Handle

**Backend Errors:**
1. **Missing API Key**
   - Error: "OpenAI API key not configured"
   - Action: Developer needs to add key to .env

2. **Invalid API Key**
   - Error: "Invalid API key. Please check configuration."
   - HTTP 401 from OpenAI

3. **Rate Limits**
   - Error: "Rate limit exceeded. Please try again in a moment."
   - HTTP 429 from OpenAI

4. **Network Failure**
   - Error: "Unable to connect to OpenAI. Check internet connection."
   - Connection timeout/refused

5. **No Work Entries**
   - Error: "No work entries found for [date]."
   - Empty query result

6. **Invalid Date Format**
   - Error: "Invalid date format"
   - Validation failure

**Frontend Errors:**
1. **Clipboard API Failure**
   - Fallback to manual text selection
   - Show error message

2. **Date Picker Issues**
   - Validate date is not in future
   - Handle invalid date input

### 6.2 User Feedback Mechanisms

**Toast Notifications:**
- Success: "Summary generated successfully!"
- Error: Display specific error message
- Copy success: "Copied to clipboard!"

**Loading States:**
- Button shows spinner during API call
- Disable form during loading
- Show progress message

**Empty States:**
- No summary yet: "Select a date and click Generate"
- No entries: "No work entries for this date"

---

## Architecture for Future Migration

### Current Architecture
```
Frontend (TypeScript)
    ↓ invoke('generate_daily_summary')
Backend (Rust)
    ↓ HTTP Request
OpenAI API (api.openai.com)
```

### Future Architecture (Proxy Server)
```
Frontend (TypeScript)
    ↓ invoke('generate_daily_summary')
Backend (Rust)
    ↓ HTTP Request
Your Proxy Server (your-domain.com)
    ↓ HTTP Request
OpenAI API (api.openai.com)
```

### Migration Steps (When Ready)

1. **Update `.env` file:**
   ```env
   OPENAI_API_URL=https://your-proxy.com/v1
   OPENAI_API_KEY=your-proxy-auth-token
   ```

2. **No code changes needed** - the Rust service uses the URL from config

3. **Proxy server handles:**
   - User authentication/authorization
   - Subscription verification
   - Usage tracking/billing
   - Rate limiting per user
   - Cost management

---

## Cost Estimates

### Using GPT-4o Mini (Current Plan)

**Pricing:**
- Input: $0.150 per 1M tokens
- Output: $0.600 per 1M tokens

**Typical Daily Summary:**
- Input tokens: ~500 (work entries + system prompt)
- Output tokens: ~200 (summary text)
- **Cost per summary: ~$0.0002** (two hundredths of a cent)

**Usage Scenarios:**

| Users | Summaries/Day | Cost/Day | Cost/Month |
|-------|--------------|----------|------------|
| 10    | 10           | $0.002   | $0.06      |
| 100   | 100          | $0.02    | $0.60      |
| 1,000 | 1,000        | $0.20    | $6.00      |
| 10,000| 10,000       | $2.00    | $60.00     |

**Extremely affordable** for MVP and initial growth phase!

---

## Implementation Checklist

### Backend Tasks
- [ ] Add dependencies to Cargo.toml
- [ ] Create `.env` file and add to `.gitignore`
- [ ] Create `.env.example` with placeholder values
- [ ] Create `src-tauri/src/openai.rs` module
- [ ] Implement OpenAI API client
- [ ] Implement database query for work entries
- [ ] Implement prompt builder with system prompt
- [ ] Create `generate_daily_summary` Tauri command
- [ ] Register command in invoke_handler
- [ ] Test with various date ranges
- [ ] Test error handling scenarios

### Frontend Tasks
- [ ] Create `src/views/AISummaryView.tsx`
- [ ] Implement date picker component
- [ ] Implement generate button with loading state
- [ ] Implement summary display area
- [ ] Implement copy to clipboard functionality
- [ ] Add error handling and user feedback
- [ ] Create route for AI summary view
- [ ] Add navigation menu item
- [ ] Add appropriate icon
- [ ] Style components with Tailwind/existing design system
- [ ] Test user flow end-to-end

### Testing & Polish
- [ ] Test with no work entries
- [ ] Test with single entry
- [ ] Test with many entries (>20)
- [ ] Test error scenarios (network, API key, etc.)
- [ ] Test clipboard functionality across browsers
- [ ] Verify date handling works correctly
- [ ] Check timezone handling
- [ ] Verify loading states work properly
- [ ] Test mobile responsiveness (if applicable)

### Documentation
- [ ] Update README with AI feature information
- [ ] Document .env setup for developers
- [ ] Add comments to system prompt for easy modification
- [ ] Document cost estimates
- [ ] Add migration guide for proxy server

---

## Future Enhancements (Post-MVP)

1. **Multiple Time Ranges**
   - Weekly summaries
   - Monthly summaries
   - Custom date ranges

2. **Summary Styles**
   - Bullet points vs. narrative
   - Technical vs. executive summary
   - Different tones (formal, casual)

3. **Export Options**
   - Export to PDF
   - Export to Markdown
   - Email summary

4. **Summary History**
   - Save generated summaries
   - View past summaries
   - Compare different versions

5. **Customization**
   - User-editable prompt templates
   - Custom instructions per user
   - Fine-tune output format

6. **Analytics**
   - Track summary generation usage
   - Show cost per user
   - Usage statistics dashboard

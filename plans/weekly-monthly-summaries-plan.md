# Weekly and Monthly Summaries Plan

**Issue:** #15 - Weekly and monthly summaries
**Date:** 2026-03-24

## 1. Approach: Extend the Existing CalendarView

**Recommendation: Keep everything in the CalendarView** rather than creating separate pages.

### Rationale

- The CalendarView already groups days by week with headers like "Week 10 - March 2026". Weekly and monthly summaries are a natural extension of this existing hierarchy.
- Creating separate pages would fragment the user experience. Users would need to navigate away from the calendar to see higher-level summaries, losing the context of individual days.
- The CalendarView's scrollable layout with collapsible sections can accommodate summary cards at the week and month level without cluttering the interface.
- Navigation, routing, and sidebar complexity are avoided by not adding new views.

## 2. UI/UX Design

### 2.1 Week Summary Card

A new `WeekSummaryCard` component is inserted **above** each week's day cards, directly below the existing week header label (e.g., "Week 10 - March 2026").

**Layout:**
```
[Week 10 - March 2026]                        <- existing header
+-----------------------------------------------+
| WEEK SUMMARY                    5 days, 23 entries |
|                                                 |
| - Sprint Auth: Completed JWT refactor and ...   |
| - Code Review: Reviewed 4 PRs across ...        |
| - Meetings: Attended 3 standups and ...          |
|                                                 |
| [Generate week summary]  or  [Regenerate]       |
+-----------------------------------------------+
[Day cards below...]
```

**Key details:**
- Uses the same `SummaryItem[]` format as daily summaries (`{label, summary, task_id}`), so the rendering logic and task-link click behavior can be reused.
- Shows aggregate stats in the header: number of days with entries, total entry count.
- A week summary can only be generated once all days in the week have ended (or the week is in the past). For the current week, the button is disabled with a hint: "Complete the week to generate a summary."
- The "Generate" button uses the same amber accent styling as daily summaries for consistency.

### 2.2 Month Summary Card

A new `MonthSummaryCard` component is inserted as a section header **above** the first week of each month in the scrolling list. Since weeks already include the month in their label, a month boundary is detected when the month changes between consecutive week groups.

**Layout:**
```
+-----------------------------------------------+
| MARCH 2026 SUMMARY              4 weeks, 87 entries |
|                                                 |
| - Sprint Auth: Shipped JWT-based login ...       |
| - Infrastructure: Migrated CI pipeline ...       |
| - Team: Onboarded 2 new developers ...           |
|                                                 |
| [Generate month summary]  or  [Regenerate]      |
+-----------------------------------------------+
[Week 10 - March 2026]
  [Week summary card]
  [Day cards...]
[Week 11 - March 2026]
  ...
```

**Key details:**
- Same `SummaryItem[]` format and rendering as daily/weekly summaries.
- Can only be generated for completed months (the current month's button is disabled until the month ends).
- Visually distinguished from week summaries by a slightly different background tint or border style (e.g., a subtle amber/gold left border for month summaries vs. a lighter one for week summaries).

### 2.3 Visual Hierarchy

The three summary levels use a clear visual hierarchy:

| Level   | Background          | Border             | Font weight |
|---------|--------------------|--------------------|-------------|
| Month   | amber-50/amber-950 | 2px left amber-500 | semibold    |
| Week    | zinc-50/zinc-800   | 1px left amber-400 | medium      |
| Day     | white/zinc-900     | 1px zinc-200       | normal      |

### 2.4 Collapsibility (Optional Enhancement)

Week groups could be made collapsible (chevron toggle on the week header) so users can collapse day cards and only see weekly/monthly summaries for a high-level overview. This is a nice-to-have and can be deferred to a follow-up.

## 3. Summary Generation

### 3.1 Data Aggregation Strategy

**Weekly summaries** are generated from the individual **daily summaries** (not raw entries). This is more efficient (fewer tokens) and produces higher-quality results since daily summaries are already curated.

**Monthly summaries** are generated from the individual **weekly summaries** (not daily summaries or raw entries). This creates a hierarchical summarization chain: entries -> daily -> weekly -> monthly.

If a daily or weekly summary has not yet been generated, the system should either:
- (a) Generate the missing lower-level summaries first automatically, or
- (b) Refuse and prompt the user to generate the lower-level summaries first.

**Recommendation:** Option (b) is simpler and gives users more control. Show a message like "Generate daily summaries for all days in this week first."

### 3.2 New Tauri Commands

Two new Tauri commands are needed:

**`generate_weekly_summary`**
```rust
#[tauri::command]
async fn generate_weekly_summary(
    app: tauri::AppHandle,
    daily_summaries: Vec<(String, String)>, // (date, summary_json)
    week_label: String,                      // e.g. "Week 10, March 2026"
    language: String,
) -> Result<String, String>
```

**`generate_monthly_summary`**
```rust
#[tauri::command]
async fn generate_monthly_summary(
    app: tauri::AppHandle,
    weekly_summaries: Vec<(String, String)>, // (week_label, summary_json)
    month_label: String,                      // e.g. "March 2026"
    language: String,
) -> Result<String, String>
```

Both commands follow the same pattern as `generate_grouped_daily_summary`: call the proxy, log the API call, return a JSON string of `SummaryItem[]`.

### 3.3 AI Prompts

**Weekly summary system prompt:**
```
You will receive AI-generated daily summaries for a work week.
Synthesize them into a weekly overview. Return a JSON array where each element has:
- "label": a short (2-5 word) topic/project label
- "summary": one concise sentence summarizing the week's progress on that topic
Merge related daily topics into single weekly items. Focus on outcomes and progress, not individual activities.
Return only the JSON array, no other text.
{language_instruction}
```

**Monthly summary system prompt:**
```
You will receive AI-generated weekly summaries for a work month.
Synthesize them into a monthly overview. Return a JSON array where each element has:
- "label": a short (2-5 word) topic/project label
- "summary": one concise sentence summarizing the month's progress on that topic
Merge related weekly topics into single monthly items. Focus on accomplishments and milestones.
Return only the JSON array, no other text.
{language_instruction}
```

**User prompts** will list each lower-level summary in chronological order:
```
Daily summaries for Week 10, March 2026:

Monday 2026-03-02:
[{"label":"Auth refactor","summary":"Refactored login flow..."},...]

Tuesday 2026-03-03:
[{"label":"Code review","summary":"Reviewed PRs..."},...]
...
```

### 3.4 Token Budget

- Weekly summaries: ~5 daily summaries as input. `max_tokens: 300` for the response.
- Monthly summaries: ~4-5 weekly summaries as input. `max_tokens: 500` for the response.

## 4. Database Schema Changes

### 4.1 New Table: `ai_weekly_summaries`

```sql
CREATE TABLE IF NOT EXISTS ai_weekly_summaries (
    year INTEGER NOT NULL,
    week INTEGER NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (year, week)
);
```

### 4.2 New Table: `ai_monthly_summaries`

```sql
CREATE TABLE IF NOT EXISTS ai_monthly_summaries (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (year, month)
);
```

### 4.3 Migration

Add as a new migration in `lib.rs` (next version number in the existing migration sequence). Both tables are created in a single migration.

The `summary` column stores the same JSON format as daily summaries: a serialized `SummaryItem[]` array.

## 5. Navigation and i18n Considerations

### 5.1 Navigation

No changes to navigation or the `View` type are needed since everything stays within the CalendarView. The `useNavigation` hook and sidebar remain untouched.

### 5.2 i18n: New Translation Keys

Add to `calendar.json` (both `en` and `nl`):

```json
{
  "weekSummary": "Week summary",
  "monthSummary": "Monthly summary",
  "generateWeekSummary": "Generate AI summary for this week",
  "generateMonthSummary": "Generate AI summary for this month",
  "regenerateWeekSummary": "Regenerate AI summary for this week",
  "regenerateMonthSummary": "Regenerate AI summary for this month",
  "generatingWeekSummary": "Generating week summary...",
  "generatingMonthSummary": "Generating month summary...",
  "weekInProgress": "Complete all daily summaries in this week first.",
  "monthInProgress": "Complete all weekly summaries in this month first.",
  "weekStats": "{{days}} days, {{entries}} entries",
  "monthStats": "{{weeks}} weeks, {{entries}} entries"
}
```

### 5.3 Prompt i18n

The existing `language_instruction()` function in `openai.rs` already handles language selection for AI responses. The new weekly/monthly prompts use the same mechanism and need no additional i18n infrastructure.

## 6. Implementation Order

1. **Database migration** - Add the two new tables.
2. **Backend commands** - Implement `generate_weekly_summary` and `generate_monthly_summary` in `lib.rs` and the corresponding prompt builders in `openai.rs`. Register commands in the Tauri handler.
3. **Frontend components** - Build `WeekSummaryCard` and `MonthSummaryCard` components, reusing the existing summary rendering pattern from `DayCard`.
4. **CalendarView integration** - Update `CalendarView` to load weekly/monthly summaries from the database, detect month boundaries, and render the new cards in the correct positions.
5. **i18n** - Add translation keys for both `en` and `nl` locales.
6. **Testing** - Add unit tests for the new components and integration tests for the generation flow.

## 7. Open Questions

- **Collapsible weeks:** Should week groups be collapsible from the start, or defer to a follow-up issue?
- **Auto-generation:** Should weekly/monthly summaries be auto-generated when all prerequisites are met, or always require a manual trigger?
- **Export integration:** Should the existing export feature include weekly/monthly summaries alongside daily ones?

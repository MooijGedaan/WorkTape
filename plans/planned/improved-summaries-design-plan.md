# Improved Design for Weekly and Monthly Summaries

> GitHub Issue: #36

## Context

The current CalendarView displays day cards, week summary cards, and month summary cards in a single vertical scroll. This has two problems:

1. **Screen real estate**: When opening the AI Calendar page, half the screen is occupied by monthly and weekly summary blocks that are not yet generated (or not yet eligible for generation).
2. **Navigation**: Scrolling to the summary of a previous month takes significant effort. Finding a summary from a year ago is impractical.

The solution must remain on a single page but can introduce more complex UI to address these concerns.

---

## 1. Proposed Design: Tabbed Timeline with Collapsible Hierarchy

### Core Idea

Replace the current flat vertical scroll with a **three-level tabbed view** that lets the user quickly navigate between time scales:

```
┌──────────────────────────────────────────────────────────────┐
│  AI Calendar                                                  │
│  Your AI-generated work summaries.                           │
│                                                              │
│  ┌──────┐  ┌──────┐  ┌──────┐                               │
│  │ Days │  │Weeks │  │Months│                                │
│  └──────┘  └──────┘  └──────┘                                │
│                                                              │
│  (content changes based on selected tab)                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Tab 1: Days (Default)

The current day-card view, but **without** inline week and month summary cards. Only day cards are shown, grouped by week with a collapsible week header.

```
▼ Week 13 · March 2026                          4 days · 12 entries
  ┌─────────────────────────────────────────────┐
  │ 27  Thursday          [Today]     3 entries  │
  │ Bug fixing: resolved timeout issue in...     │
  │ Sprint planning: discussed next sprint...    │
  └─────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────┐
  │ 26  Wednesday                     5 entries  │
  │ Implemented new dashboard component...       │
  └─────────────────────────────────────────────┘
  ...

▶ Week 12 · March 2026                          5 days · 18 entries
  (collapsed — click to expand)

▶ Week 11 · March 2026                          4 days · 9 entries
  (collapsed)
```

**Key improvements:**
- Weeks older than the current week start **collapsed**, reducing visual clutter
- Week headers show aggregate stats (days with entries, total entries)
- Clicking a week header toggles expand/collapse

### Tab 2: Weeks

Shows only week summary cards in a clean list. Each card is more spacious since it doesn't compete with day cards.

```
┌──────────────────────────────────────────────────────────────┐
│  Week 13 · March 2026                    5 days · 22 entries │
│  ──────────────────────────────────────                      │
│  Auth       Fixed login timeout and session handling issues   │
│  Frontend   Built new analytics dashboard component           │
│  Planning   Completed sprint review and planned next sprint   │
│                                                              │
│                                    [Regenerate]              │
├──────────────────────────────────────────────────────────────┤
│  Week 12 · March 2026                    4 days · 15 entries │
│  ──────────────────────────────────────                      │
│  (not yet generated)           [Generate week summary]       │
├──────────────────────────────────────────────────────────────┤
│  Week 11 · March 2026                    5 days · 20 entries │
│  ...                                                         │
└──────────────────────────────────────────────────────────────┘
```

**Key improvements:**
- Dedicated space for week summaries without noise from individual days
- "Not yet generated" state is compact (one line) instead of a full card with empty space
- Quick overview of all weeks at a glance

### Tab 3: Months

Shows only month summary cards. Provides a high-level yearly overview.

```
┌──────────────────────────────────────────────────────────────┐
│  March 2026                              4 weeks · 58 entries │
│  ──────────────────────────────────────                       │
│  Auth       Major authentication overhaul with new session... │
│  Frontend   Dashboard redesign completed, new component lib.. │
│  DevOps     CI/CD pipeline optimization, deploy time reduced. │
│                                                               │
│                                     [Regenerate]              │
├──────────────────────────────────────────────────────────────┤
│  February 2026                           4 weeks · 72 entries │
│  ...                                                          │
├──────────────────────────────────────────────────────────────┤
│  January 2026                            5 weeks · 85 entries │
│  ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

**Key improvements:**
- Finding last month's or last year's summary is now **one click** (switch to Months tab) instead of scrolling through all days and weeks
- Year headers can separate months for multi-year usage

---

## 2. Quick Navigation: Month/Year Picker

Add a compact navigation bar below the tabs that allows jumping directly to a specific month:

```
┌──────┐  ┌──────┐  ┌──────┐
│ Days │  │Weeks │  │Months│
└──────┘  └──────┘  └──────┘

 ◀  March 2026  ▶       [Today]
```

- **Left/Right arrows**: Navigate to previous/next month
- **Click the month name**: Opens a month/year picker dropdown
- **"Today" button**: Scrolls back to the current date/week/month

This works across all three tabs — on the Days tab it scrolls to the first day of the selected month, on Weeks it shows that month's weeks, on Months it highlights that month.

---

## 3. Handling "Not Yet Generated" State

### Current Problem

Empty week/month summary cards take up significant space with just a "Generate" button and "in progress" message. When multiple weeks/months are ungenerated, this creates a wall of empty cards.

### Solution

- **Compact ungenerated state**: Show a single line with a "Generate" link instead of a full card body
- **Batch generation**: Add a "Generate all" button at the top of the Weeks and Months tabs that generates all eligible summaries in sequence
- **Hide ineligible cards**: Don't show the "in progress" message for the current week/month. Only show weeks/months where generation is possible.

```
Week 12 · March 2026    4 days · 15 entries    [Generate summary]
```

vs. the current full card with empty body and explanation text.

---

## 4. Technical Implementation

### Component Changes

```
CalendarView.tsx
├── CalendarTabs.tsx          # Tab switcher (Days / Weeks / Months)
├── CalendarNavBar.tsx        # Month/year navigation bar
├── DaysTab.tsx               # Collapsible week groups with day cards
│   ├── CollapsibleWeekGroup  # Week header + expand/collapse
│   └── DayCard               # (existing, moved)
├── WeeksTab.tsx              # Week summary list
│   └── WeekSummaryCard       # (existing, adapted)
└── MonthsTab.tsx             # Month summary list
    └── MonthSummaryCard      # (existing, adapted)
```

### State Management

- Active tab stored in component state (default: "days")
- Active month stored in state for the navigation bar
- Collapsed/expanded week state stored per-session (not persisted)
- Tab selection could optionally be persisted in localStorage

### Data Loading

The current `loadData` function already loads all daily, weekly, and monthly summaries. No changes needed to data fetching — only the rendering changes.

### URL / Deep Linking

Consider using URL hash parameters for tab state:
- `#days` / `#weeks` / `#months`
- This allows the app to link directly to a tab (e.g., from a notification)

---

## 5. i18n

Add new translation keys to `calendar.json`:

```json
{
  "tabs": {
    "days": "Days",
    "weeks": "Weeks",
    "months": "Months"
  },
  "navigation": {
    "today": "Today",
    "generateAll": "Generate all"
  },
  "collapsedWeek": "{{days}} days · {{entries}} entries",
  "collapsedMonth": "{{weeks}} weeks · {{entries}} entries"
}
```

---

## 6. Implementation Order

| Step | Description | Estimated Effort |
|------|-------------|-----------------|
| 1 | Extract existing cards into separate tab components | 2-3 hours |
| 2 | Build `CalendarTabs` tab switcher component | 1 hour |
| 3 | Build `DaysTab` with collapsible week groups | 2-3 hours |
| 4 | Build `WeeksTab` with compact ungenerated state | 1-2 hours |
| 5 | Build `MonthsTab` with year separators | 1-2 hours |
| 6 | Add `CalendarNavBar` month/year picker | 2-3 hours |
| 7 | Add "Generate all" batch functionality | 1-2 hours |
| 8 | Add i18n strings (EN + NL) | 30 min |
| 9 | Tests | 2-3 hours |
| **Total** | | **~13-19 hours** |

---

## 7. Open Questions

- Should the tab selection persist across page navigations or reset to "Days" each time?
- Should collapsed week state persist across visits?
- Should we add keyboard navigation between tabs (left/right arrow keys)?
- Should the "Generate all" feature queue requests sequentially or show a progress indicator for each?

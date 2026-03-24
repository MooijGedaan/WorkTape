# Analytics Dashboard Plan

## Overview

Add an Analytics view to WorkTape that gives users insight into their productivity patterns, work habits, and sprint progress. The dashboard surfaces actionable metrics derived from data already captured in the SQLite database, without requiring any new backend data collection.

## 1. Proposed Analytics

### 1.1 Productivity Metrics (stat cards)

| Metric | Description | Data Source |
|---|---|---|
| **Entries Today** | Number of work entries logged today | `work_entries` + `auto_work_entries` WHERE `DATE(timestamp) = today` |
| **Weekly Total** | Entries in the last 7 days | `work_entries` + `auto_work_entries` WHERE `DATE(timestamp) >= 7 days ago` |
| **Current Streak** | Consecutive days with at least one entry | `work_entries` distinct dates, walk backwards from today |
| **AI Summaries Generated** | Total summaries generated this week/month | `ai_summaries` COUNT by date range |
| **Tasks Completed (This Sprint)** | Tasks moved to "done" status | `sprint_tasks` WHERE `status = 'done'` |

### 1.2 Work Patterns (charts)

| Chart | Type | Description | Query |
|---|---|---|---|
| **Daily Activity** | Bar chart | Entries per day over the last 14/30 days (manual vs auto stacked) | `SELECT DATE(timestamp), COUNT(*) FROM work_entries GROUP BY DATE(timestamp)` + same for `auto_work_entries` |
| **Hourly Heatmap** | Grid heatmap | Entry count by hour-of-day x day-of-week, showing when the user is most active | `SELECT strftime('%w', timestamp) as dow, strftime('%H', timestamp) as hour, COUNT(*) FROM work_entries GROUP BY dow, hour` (union with auto) |
| **Weekly Trend** | Line chart | Entries per week over the last 8-12 weeks, to show long-term trajectory | `SELECT strftime('%Y-%W', timestamp), COUNT(*) FROM work_entries GROUP BY 1` |

### 1.3 Sprint Progress

| Chart | Type | Description | Query |
|---|---|---|---|
| **Task Status Distribution** | Donut / pie chart | Count of tasks in each column (todo, in-progress, done, blocked) | `SELECT status, COUNT(*) FROM sprint_tasks GROUP BY status` |
| **Task Completion Over Time** | Line chart | Cumulative done tasks over time using `updated_at` | `SELECT DATE(updated_at), COUNT(*) FROM sprint_tasks WHERE status = 'done' GROUP BY 1 ORDER BY 1` |
| **Priority Breakdown** | Horizontal bar chart | Tasks by priority level, split by status | `SELECT priority, status, COUNT(*) FROM sprint_tasks GROUP BY priority, status` |

### 1.4 AI Usage Insights

These extend what `ApiLogsView` currently shows but in a user-friendly, visual format rather than a debug log table.

| Metric | Type | Description | Query |
|---|---|---|---|
| **Token Usage Over Time** | Area chart | Daily total tokens consumed | `SELECT DATE(request_timestamp), SUM(total_tokens) FROM api_call_logs GROUP BY 1` |
| **Success Rate** | Stat card with trend | Percentage of successful AI calls over the last 7 days | `SELECT response_status, COUNT(*) FROM api_call_logs WHERE DATE(request_timestamp) >= 7d ago GROUP BY 1` |
| **Average Response Time** | Stat card | Average `duration_ms` for the last 7 days | `SELECT AVG(duration_ms) FROM api_call_logs WHERE DATE(request_timestamp) >= 7d ago` |

## 2. Display Strategy

### 2.1 Charting Library

The project currently has no charting library. Recommended options:

- **Recharts** (`recharts`) -- React-native, composable, lightweight (~45kB gzipped), good Tailwind integration. Supports bar, line, area, pie, and custom charts. Well-maintained with TypeScript support.
- Alternative: **Chart.js** via `react-chartjs-2` -- More chart types but heavier and less idiomatic with React.

**Recommendation: Recharts**, because it aligns with the React-first, component-based architecture and is easy to style with Tailwind via custom components.

### 2.2 Time Period Selector

A toggle/segmented control at the top of the dashboard allowing users to switch between:

- **7 days** (default)
- **30 days**
- **All time**

This period filter applies to all time-based charts and trend stats. Sprint-related metrics are always "current state" and not filtered by period.

### 2.3 Card Design

Follow the existing HomeView card pattern:
- Rounded corners, subtle shadow, top-colored border accent
- Icon + label header
- Large animated number (reuse `AnimatedNumber` from HomeView)
- Small description text below
- Dark mode support via existing Tailwind dark: variants

## 3. Data Layer

### 3.1 Query Approach

All data is fetched from the SQLite database via the existing `@tauri-apps/plugin-sql` integration (the `getDb()` helper in `useDatabase.ts`). No new Tauri commands are required -- all queries can run from the frontend using `database.select()`.

### 3.2 Key Queries

```sql
-- Daily entry counts (manual + auto), last N days
SELECT DATE(timestamp) as date, 'manual' as source, COUNT(*) as count
FROM work_entries
WHERE DATE(timestamp) >= ?
GROUP BY DATE(timestamp)
UNION ALL
SELECT DATE(timestamp) as date, 'auto' as source, COUNT(*) as count
FROM auto_work_entries
WHERE DATE(timestamp) >= ?
GROUP BY DATE(timestamp);

-- Hourly heatmap data
SELECT
  CAST(strftime('%w', timestamp) AS INTEGER) as day_of_week,
  CAST(strftime('%H', timestamp) AS INTEGER) as hour,
  COUNT(*) as count
FROM (
  SELECT timestamp FROM work_entries
  UNION ALL
  SELECT timestamp FROM auto_work_entries
)
WHERE DATE(timestamp) >= ?
GROUP BY day_of_week, hour;

-- Sprint task status counts
SELECT status, COUNT(*) as count FROM sprint_tasks GROUP BY status;

-- Sprint priority x status breakdown
SELECT priority, status, COUNT(*) as count
FROM sprint_tasks
GROUP BY priority, status;

-- AI token usage by day
SELECT DATE(request_timestamp) as date, SUM(total_tokens) as tokens
FROM api_call_logs
WHERE DATE(request_timestamp) >= ?
GROUP BY DATE(request_timestamp);

-- AI success rate
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN response_status = 'success' THEN 1 ELSE 0 END) as successful,
  AVG(duration_ms) as avg_duration
FROM api_call_logs
WHERE DATE(request_timestamp) >= ?;
```

### 3.3 Custom Hook

Create a `useAnalytics(period: '7d' | '30d' | 'all')` hook that:
1. Calls all queries in parallel using `Promise.all`
2. Returns a typed `AnalyticsData` object with loading/error states
3. Re-fetches when `period` changes
4. Memoizes results to avoid unnecessary re-renders

## 4. UI Layout

### 4.1 Navigation Integration

- Add `'analytics'` to the `View` type union in `useNavigation.tsx`
- Add a sidebar entry in `ApplicationLayout.tsx` using `ChartBarIcon` from `@heroicons/react/20/solid` (add to `icons.tsx`)
- Position it after "Sprint Board" and before "Export" in the sidebar order
- Add the route in `ViewRouter.tsx`

### 4.2 Page Structure

```
+--------------------------------------------------+
| Analytics                    [7d] [30d] [All]    |  <-- Heading + period toggle
+--------------------------------------------------+
|                                                  |
|  [Entries Today] [Weekly Total] [Streak] [Done]  |  <-- Stat cards row
|                                                  |
+--------------------------------------------------+
|                                                  |
|  Daily Activity (bar chart, full width)          |  <-- Stacked bar: manual vs auto
|                                                  |
+--------------------------------------------------+
|                           |                      |
|  Hourly Heatmap           |  Task Status (donut) |  <-- Two-column row
|  (7x24 grid)              |                      |
|                           |                      |
+--------------------------------------------------+
|                           |                      |
|  Weekly Trend (line)      |  Priority Breakdown  |  <-- Two-column row
|                           |  (horizontal bar)    |
|                           |                      |
+--------------------------------------------------+
|                                                  |
|  AI Usage section:                               |
|  [Token Usage area chart]                        |
|  [Success Rate card] [Avg Response Time card]    |
|                                                  |
+--------------------------------------------------+
```

- Use Tailwind grid: `grid-cols-1 lg:grid-cols-2` for the two-column rows
- Full-width sections use `col-span-full`
- Each chart wrapped in a card matching the HomeView design language
- Responsive: stacks to single column on smaller windows

### 4.3 Empty States

If no data exists for a section, show a friendly empty state with an icon and message directing the user to start logging (link to Work Log) or create tasks (link to Sprint Board).

### 4.4 Animations

- Use existing Motion library for:
  - Staggered card entrance (same pattern as HomeView)
  - AnimatedNumber for stat values
  - Smooth transitions when switching time periods

## 5. i18n

Add new locale namespace `analytics.json` for both `en` and `nl` with keys for:
- Page title and subtitle
- All stat card labels and descriptions
- Chart titles and axis labels
- Period selector labels ("Last 7 days", "Last 30 days", "All time")
- Empty state messages

## 6. Implementation Plan

### Phase 1: Foundation
1. Add `recharts` dependency
2. Add `'analytics'` view to navigation system (`useNavigation.tsx`, `ViewRouter.tsx`, `ApplicationLayout.tsx`, `icons.tsx`)
3. Create `useAnalytics` hook with all queries
4. Create `AnalyticsView.tsx` with stat cards row and period selector
5. Add i18n files (`en/analytics.json`, `nl/analytics.json`)

### Phase 2: Charts
6. Daily Activity bar chart (manual vs auto stacked)
7. Hourly heatmap (custom component using Recharts or pure Tailwind grid)
8. Weekly trend line chart
9. Sprint task status donut chart
10. Priority breakdown horizontal bar

### Phase 3: AI Usage Section
11. Token usage area chart
12. Success rate and response time stat cards

### Phase 4: Polish
13. Empty states for each section
14. Dark mode verification for all charts (Recharts theming)
15. Responsive layout testing
16. Add tooltip hints for new users
17. Write tests for `useAnalytics` hook and `AnalyticsView`

## 7. Files to Create/Modify

### New Files
- `src/views/AnalyticsView.tsx` -- Main dashboard view
- `src/hooks/useAnalytics.ts` -- Data fetching hook
- `src/i18n/locales/en/analytics.json` -- English translations
- `src/i18n/locales/nl/analytics.json` -- Dutch translations
- `src/views/AnalyticsView.test.tsx` -- View tests
- `src/hooks/useAnalytics.test.ts` -- Hook tests

### Modified Files
- `src/hooks/useNavigation.tsx` -- Add `'analytics'` to `View` type
- `src/components/ViewRouter.tsx` -- Add analytics route
- `src/components/ApplicationLayout.tsx` -- Add sidebar item
- `src/components/icons.tsx` -- Export `ChartBarIcon`
- `src/i18n/config.ts` -- Register analytics namespace
- `package.json` -- Add `recharts` dependency

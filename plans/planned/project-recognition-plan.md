# Project Recognition Plan

> GitHub Issue: #35

## Context

WorkTape currently tracks what users work on via free-text log entries and optional sprint task linking. However, it does not analyze or predict how time is distributed across different projects or clients. Adding project/time-distribution recognition would make WorkTape valuable for freelancers who need to track billable hours per client, and for any professional wanting insight into their time allocation.

---

## 1. Problem Analysis

### What We Want to Predict

Given a day's work log entries, predict:
- Which **project/client** each entry belongs to
- How much **time** was spent on each project
- The **distribution** (e.g. 40% Client A, 35% Client B, 25% Internal)

### Challenges

1. **No explicit start/stop times**: Users log what they're working on at intervals (e.g. every 30 minutes), not when they start/stop. We must infer time boundaries.
2. **Context switching**: Users may switch projects multiple times per day without logging the switch.
3. **Ambiguous entries**: "Code review" could belong to any project without additional context.

---

## 2. Approach: AI-Powered Classification + Heuristic Time Estimation

### Why AI (not pure analytics)

A statistical model would require a large training dataset per user. An LLM can leverage:
- The project/client names and descriptions the user defines
- The content of the work entries (natural language understanding)
- Sprint task associations as strong signals

This is a better fit for WorkTape's current architecture where AI summaries are already generated via the Cloudflare proxy.

### Two-Phase Approach

**Phase 1: Time estimation (heuristic)**
- Use entry timestamps to estimate time blocks
- Between two consecutive entries, assign the time to the first entry's project
- If the gap between entries exceeds a configurable threshold (e.g. 90 minutes), cap the time at the threshold and mark the remainder as "untracked"
- For the last entry of the day, use the day-end time (if ended) or cap at the threshold

**Phase 2: Project classification (AI)**
- Send the day's entries + the user's defined project list to the AI
- The AI returns a project assignment for each entry
- The user can correct classifications, which improves future predictions (the corrections become training data in the prompt)

---

## 3. Data Model

### New Tables

#### `projects`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| name | TEXT NOT NULL | Project name (e.g. "Client A Website Redesign") |
| client | TEXT | Client name (optional, e.g. "Client A") |
| color | TEXT | Hex color for charts (e.g. "#3B82F6") |
| keywords | TEXT | Comma-separated keywords to help classification |
| is_archived | BOOLEAN | Soft-delete for completed projects |
| created_at | TEXT | ISO timestamp |

#### `entry_project_assignments`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| entry_id | INTEGER NOT NULL | FK to work_entries.id |
| entry_source | TEXT NOT NULL | 'manual' or 'auto' |
| project_id | INTEGER NOT NULL | FK to projects.id |
| confidence | REAL | AI confidence score (0-1) |
| is_manual_override | BOOLEAN | True if user corrected the AI |
| assigned_minutes | INTEGER | Estimated minutes for this entry |
| created_at | TEXT | ISO timestamp |

### Settings

- `project_recognition_enabled`: boolean, default `false`
- `time_gap_threshold_minutes`: integer, default `90`

---

## 4. User Interface

### 4.1 Project Management Page

Add a new "Projects" section accessible from settings or as a sidebar item:

```
┌───────────────────────────────────────────────────────┐
│  Projects                              [+ New Project] │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  🔵 Client A — Website Redesign                  │  │
│  │     Keywords: frontend, react, design             │  │
│  │     [Edit] [Archive]                              │  │
│  ├──────────────────────────────────────────────────┤  │
│  │  🟢 Internal — DevOps                             │  │
│  │     Keywords: ci/cd, deploy, infrastructure       │  │
│  │     [Edit] [Archive]                              │  │
│  ├──────────────────────────────────────────────────┤  │
│  │  🟡 Client B — Mobile App                         │  │
│  │     Keywords: ios, android, mobile, flutter       │  │
│  │     [Edit] [Archive]                              │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

### 4.2 End-of-Day Time Distribution Pop-up

When the user ends the day, show a distribution overview **before** or **after** the day-end confirmation:

```
┌──────────────────────────────────────────────────┐
│  Today's Time Distribution                        │
│                                                   │
│       ┌──────────────────┐                        │
│       │    Donut Chart    │                        │
│       │                  │                        │
│       │  3.5h Client A   │                        │
│       │  2.0h Internal   │                        │
│       │  1.5h Client B   │                        │
│       │  1.0h Untracked  │                        │
│       └──────────────────┘                        │
│                                                   │
│  Client A — Website Redesign          3h 30m  44% │
│  ├ Fixed login page styling           1h 00m      │
│  ├ Code review for PR #42             0h 30m      │
│  └ Implemented new dashboard          2h 00m      │
│                                                   │
│  Internal — DevOps                    2h 00m  25% │
│  ├ Updated CI pipeline                1h 00m      │
│  └ Investigated deploy failure        1h 00m      │
│                                                   │
│  Client B — Mobile App                1h 30m  19% │
│  └ Sprint planning meeting            1h 30m      │
│                                                   │
│  ⚠ Untracked                          1h 00m  12% │
│                                                   │
│  [Edit assignments]            [Looks good]        │
└──────────────────────────────────────────────────┘
```

### 4.3 Editing Assignments

Clicking "Edit assignments" shows a list where each entry has a project dropdown, allowing the user to correct the AI's classification. Corrections are stored with `is_manual_override = true` and used in future AI prompts as examples.

### 4.4 Analytics Dashboard Integration

The existing analytics dashboard (or calendar view) could show weekly/monthly time distribution charts. This is out of scope for the initial implementation but should be considered in the data model design.

---

## 5. AI Classification Prompt Design

### System Prompt

```
You are a project classification assistant. Given a user's work log entries and their defined projects, assign each entry to the most appropriate project.

The user has defined the following projects:
{projects_json}

Previous corrections by the user (learn from these):
{corrections_json}
```

### User Prompt

```
Classify the following work entries into projects. For each entry, return the project_id and confidence (0-1).

Entries:
{entries_json}

Return JSON array: [{"entry_id": N, "project_id": N, "confidence": 0.95}]
```

### Fallback

If the AI cannot classify an entry with confidence > 0.5, assign it to a special "Unclassified" bucket. The user can manually assign these.

---

## 6. Time Estimation Algorithm

```
For each consecutive pair of entries (entry_i, entry_i+1):
  gap = entry_i+1.timestamp - entry_i.timestamp
  if gap <= threshold:
    entry_i.duration = gap
  else:
    entry_i.duration = threshold
    untracked += gap - threshold

For the last entry:
  if day_ended:
    gap = day_end_time - last_entry.timestamp
    last_entry.duration = min(gap, threshold)
  else:
    last_entry.duration = threshold (or prompt interval)
```

---

## 7. Implementation Order

| Step | Description | Estimated Effort |
|------|-------------|-----------------|
| 1 | Database migration: `projects` and `entry_project_assignments` tables | 1 hour |
| 2 | Rust CRUD commands for projects | 2-3 hours |
| 3 | Project management UI (create/edit/archive) | 3-4 hours |
| 4 | Time estimation algorithm (heuristic) | 2-3 hours |
| 5 | AI classification prompt + Rust integration | 3-4 hours |
| 6 | End-of-day distribution popup with donut chart | 4-5 hours |
| 7 | Manual override UI for correcting assignments | 2-3 hours |
| 8 | i18n strings (EN + NL) | 1 hour |
| 9 | Tests | 2-3 hours |
| **Total** | | **~20-27 hours** |

---

## 8. Open Questions

- Should project recognition be a premium/paid feature?
- Should we support splitting a single entry across multiple projects (e.g. "meeting about Client A and Client B")?
- Should we add a "client" entity separate from "project" (one client can have multiple projects)?
- How should we handle entries that were logged via the Prompt (automatic) vs. manually in the Work Log? Same treatment?
- Should the donut chart use a library (e.g. recharts, already a common choice for React) or be a simple CSS/SVG implementation?
- Should time distribution data be exportable (CSV/JSON) for invoicing purposes?

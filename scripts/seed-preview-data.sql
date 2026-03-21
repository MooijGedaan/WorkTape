-- Seed script for WorkTape preview/screenshot data (Mar 16–21, 2026)
-- Run: sqlite3 ~/Library/Application\ Support/com.worktape.app/worktape.db < scripts/seed-preview-data.sql

-- Clear existing data
DELETE FROM sprint_task_work_links;
DELETE FROM sprint_task_labels;
DELETE FROM sprint_task_next_action_history;
DELETE FROM sprint_tasks;
DELETE FROM work_entries;
DELETE FROM auto_work_entries;
DELETE FROM ai_summaries;

-- ─── Work Entries (spanning 6 days: Mar 16–21, 2026) ─────────────────────────

-- March 16 (Monday)
INSERT INTO work_entries (description, timestamp, next_action) VALUES
  ('Sprint kickoff standup — aligned on priorities: notification refactor, analytics performance, and CSV hotfix', '2026-03-16T09:10:00Z', NULL),
  ('Started notification service refactor — mapped existing polling logic and designed RabbitMQ exchange topology', '2026-03-16T10:00:00Z', 'Set up RabbitMQ exchange and queue bindings in staging'),
  ('Investigated slow analytics dashboard queries — pulled slow query log, identified missing composite index on events table', '2026-03-16T14:30:00Z', 'Test composite index on local dataset before staging rollout');

-- March 17 (Tuesday)
INSERT INTO work_entries (description, timestamp, next_action) VALUES
  ('Ran EXPLAIN ANALYZE on analytics dashboard queries — confirmed full table scan on events; drafted index migration', '2026-03-17T09:30:00Z', NULL),
  ('Drafted new user preferences schema — added granular notification columns with defaults for backward compat', '2026-03-17T11:00:00Z', 'Review schema with team before writing migration'),
  ('Reproduced CSV export encoding bug using sample Enterprise data — confirmed missing UTF-8 BOM as root cause', '2026-03-17T13:30:00Z', 'Add UTF-8 BOM to CSV export output stream'),
  ('Scaffolded GitHub Actions workflow for payments service CI — defined build and lint jobs', '2026-03-17T15:00:00Z', 'Add test stage and Slack failure notification');

-- March 18 (Wednesday)
INSERT INTO work_entries (description, timestamp, next_action) VALUES
  ('Wrote database migration script for user preferences v2 — handles NULL defaults and existing row back-fill', '2026-03-18T09:45:00Z', NULL),
  ('Added test stage and Slack webhook to payments CI pipeline — pipeline now runs end-to-end on PR open', '2026-03-18T11:00:00Z', NULL),
  ('Identified dark mode contrast failures on settings page — 4 text elements below WCAG AA threshold', '2026-03-18T14:00:00Z', 'Apply corrected colour tokens and verify contrast ratios');

-- March 19 (Thursday)
INSERT INTO work_entries (description, timestamp, next_action) VALUES
  ('Set up CI pipeline for the new microservice — GitHub Actions workflow with build, lint, and test stages', '2026-03-19T09:12:00Z', NULL),
  ('Fixed flaky integration test in checkout flow — race condition on payment confirmation callback', '2026-03-19T09:45:00Z', NULL),
  ('Reviewed PR #247: Add rate limiting to public API endpoints. Left comments on token bucket implementation', '2026-03-19T10:30:00Z', NULL),
  ('Pair programming session with Lisa on the new onboarding wizard — wired up step validation and progress persistence', '2026-03-19T11:15:00Z', NULL),
  ('Updated API docs for the v2 billing endpoints — added request/response examples and error codes', '2026-03-19T13:00:00Z', NULL),
  ('Investigated memory leak in dashboard service — heap snapshots point to unclosed WebSocket connections', '2026-03-19T14:20:00Z', 'Add connection cleanup on client disconnect in WebSocketManager'),
  ('Sprint planning for next week — estimated and prioritised backlog items with the team', '2026-03-19T15:30:00Z', NULL),
  ('Deployed hotfix v2.4.1 to staging — patched the CSV export encoding issue reported by Enterprise customers', '2026-03-19T16:45:00Z', 'Verify fix with QA on staging before promoting to production');

-- March 20 (Friday)
INSERT INTO work_entries (description, timestamp, next_action) VALUES
  ('Standup: discussed blocker on SSO integration — waiting for IdP metadata from client IT team', '2026-03-20T09:05:00Z', NULL),
  ('Refactored notification service to use event-driven architecture — replaced polling with RabbitMQ consumers', '2026-03-20T09:40:00Z', NULL),
  ('Fixed broken dark mode styles on the settings page — contrast ratio now passes WCAG AA', '2026-03-20T10:30:00Z', NULL),
  ('Wrote migration script for the new user preferences schema — handles backward compatibility for existing rows', '2026-03-20T11:15:00Z', NULL),
  ('1-on-1 with manager — discussed career growth path and upcoming tech lead responsibilities', '2026-03-20T13:00:00Z', NULL),
  ('Optimised slow query on the analytics dashboard — added composite index, reduced p95 from 2.3s to 180ms', '2026-03-20T14:00:00Z', NULL),
  ('Helped onboard new team member Marcus — walked through repo structure, dev setup, and deployment process', '2026-03-20T15:00:00Z', NULL),
  ('End-of-week review: merged 4 PRs, closed 3 bugs, shipped notification refactor to canary', '2026-03-20T16:30:00Z', NULL);

-- March 21 (Saturday — today, lighter workday)
INSERT INTO work_entries (description, timestamp, next_action) VALUES
  ('Reviewed and approved PR #251: Database connection pooling improvements — cleaner retry logic', '2026-03-21T09:15:00Z', NULL),
  ('Spiked on WebSocket compression for the real-time collaboration feature — permessage-deflate cuts payload by ~60%', '2026-03-21T10:00:00Z', 'Write RFC for WebSocket compression rollout plan'),
  ('Updated Terraform modules for the new staging environment — added VPC peering and security group rules', '2026-03-21T11:00:00Z', NULL),
  ('Fixed edge case in date parsing — timezone offset was dropped when crossing DST boundary', '2026-03-21T11:45:00Z', NULL),
  ('Wrote unit tests for the new retry middleware — covers exponential backoff, max attempts, and circuit breaker', '2026-03-21T13:30:00Z', NULL);

-- ─── Sprint Tasks ────────────────────────────────────────────────────────────

-- Todo
INSERT INTO sprint_tasks (id, title, description, status, priority, position, created_at, updated_at, next_action) VALUES
  (1, 'Implement SSO login with SAML 2.0', 'Integrate with corporate identity providers. Need to support both IdP-initiated and SP-initiated flows. Reference: RFC on Confluence.', 'todo', 'high', 0, '2026-03-17T10:00:00Z', '2026-03-17T10:00:00Z', 'Request IdP metadata XML from client IT team'),
  (2, 'Add bulk export for audit logs', 'Users need to export filtered audit logs as CSV/JSON for compliance reporting. Max export size: 100k rows.', 'todo', 'medium', 1, '2026-03-18T09:00:00Z', '2026-03-18T09:00:00Z', NULL),
  (3, 'Design system: migrate to Radix UI primitives', 'Replace custom dropdown, dialog, and tooltip components with Radix primitives for better accessibility and keyboard navigation.', 'todo', 'low', 2, '2026-03-18T11:00:00Z', '2026-03-18T11:00:00Z', NULL),
  (4, 'Write E2E tests for checkout flow', 'Cover happy path, payment failure, coupon application, and guest checkout. Use Playwright.', 'todo', 'medium', 3, '2026-03-19T14:00:00Z', '2026-03-19T14:00:00Z', NULL);

-- In Progress
INSERT INTO sprint_tasks (id, title, description, status, priority, position, created_at, updated_at, next_action) VALUES
  (5, 'Refactor notification service to event-driven', 'Replace polling-based notification checks with RabbitMQ consumers. Reduces DB load and improves delivery latency.', 'in-progress', 'high', 0, '2026-03-16T10:00:00Z', '2026-03-20T09:40:00Z', 'Add dead-letter queue handling for failed message processing'),
  (6, 'WebSocket compression for real-time collab', 'Spike on permessage-deflate to reduce bandwidth for the live collaboration feature. Initial tests show ~60% payload reduction.', 'in-progress', 'medium', 1, '2026-03-19T08:00:00Z', '2026-03-21T10:00:00Z', 'Write RFC for WebSocket compression rollout plan'),
  (7, 'Optimise analytics dashboard queries', 'The main dashboard takes 2+ seconds on large accounts. Need composite indexes and query restructuring.', 'in-progress', 'high', 2, '2026-03-17T14:00:00Z', '2026-03-20T14:00:00Z', 'Benchmark query performance on production-sized dataset');

-- Done
INSERT INTO sprint_tasks (id, title, description, status, priority, position, created_at, updated_at, next_action) VALUES
  (8, 'Fix CSV export encoding for Enterprise', 'Enterprise customers reported garbled characters in exported CSV files. Root cause: UTF-8 BOM missing.', 'done', 'high', 0, '2026-03-15T09:00:00Z', '2026-03-19T16:45:00Z', NULL),
  (9, 'Set up CI pipeline for payments service', 'GitHub Actions workflow with build, lint, test stages. Includes Slack notification on failure.', 'done', 'medium', 1, '2026-03-14T11:00:00Z', '2026-03-19T09:12:00Z', NULL),
  (10, 'Fix dark mode contrast on settings page', 'Several text elements fail WCAG AA contrast requirements in dark mode.', 'done', 'low', 2, '2026-03-18T08:00:00Z', '2026-03-20T10:30:00Z', NULL),
  (11, 'Database migration for user preferences v2', 'New schema for granular notification preferences. Must handle backward compat for existing rows.', 'done', 'medium', 3, '2026-03-17T09:00:00Z', '2026-03-20T11:15:00Z', NULL);

-- Blocked
INSERT INTO sprint_tasks (id, title, description, status, priority, position, created_at, updated_at, next_action) VALUES
  (12, 'Integrate third-party analytics SDK', 'Waiting for vendor to provide production API keys and rate limit documentation. Follow-up scheduled for Monday.', 'blocked', 'medium', 0, '2026-03-16T13:00:00Z', '2026-03-20T10:00:00Z', 'Follow up with vendor contact on Monday');

-- ─── Labels ──────────────────────────────────────────────────────────────────

INSERT INTO sprint_task_labels (task_id, label) VALUES
  (1, 'backend'),
  (1, 'security'),
  (2, 'backend'),
  (2, 'compliance'),
  (3, 'frontend'),
  (3, 'design-system'),
  (4, 'testing'),
  (4, 'frontend'),
  (5, 'backend'),
  (5, 'infrastructure'),
  (6, 'backend'),
  (6, 'performance'),
  (7, 'backend'),
  (7, 'performance'),
  (8, 'bug'),
  (8, 'enterprise'),
  (9, 'devops'),
  (10, 'bug'),
  (10, 'frontend'),
  (11, 'backend'),
  (11, 'database'),
  (12, 'integration');

-- ─── Work Links (connect work entries to sprint tasks) ───────────────────────

INSERT INTO sprint_task_work_links (task_id, entry_source, entry_id, linked_at) VALUES
  -- March 16–18 entries (IDs 1–10)
  (5, 'manual', 1, '2026-03-16T09:10:00Z'),
  (5, 'manual', 2, '2026-03-16T10:00:00Z'),
  (7, 'manual', 3, '2026-03-16T14:30:00Z'),
  (7, 'manual', 4, '2026-03-17T09:30:00Z'),
  (11, 'manual', 5, '2026-03-17T11:00:00Z'),
  (8, 'manual', 6, '2026-03-17T13:30:00Z'),
  (9, 'manual', 7, '2026-03-17T15:00:00Z'),
  (11, 'manual', 8, '2026-03-18T09:45:00Z'),
  (9, 'manual', 9, '2026-03-18T11:00:00Z'),
  (10, 'manual', 10, '2026-03-18T14:00:00Z'),
  -- March 19–21 entries (IDs shifted +10)
  (9, 'manual', 11, '2026-03-19T09:12:00Z'),
  (8, 'manual', 18, '2026-03-19T16:45:00Z'),
  (5, 'manual', 20, '2026-03-20T09:40:00Z'),
  (10, 'manual', 21, '2026-03-20T10:30:00Z'),
  (11, 'manual', 22, '2026-03-20T11:15:00Z'),
  (7, 'manual', 24, '2026-03-20T14:00:00Z'),
  (6, 'manual', 28, '2026-03-21T10:00:00Z');

-- ─── Next Action History (resolved actions for done tasks) ───────────────────

INSERT INTO sprint_task_next_action_history (task_id, action, resolved_at) VALUES
  (8, 'Reproduce the encoding issue with sample Enterprise export data', '2026-03-18T14:00:00Z'),
  (8, 'Add UTF-8 BOM to CSV export output stream', '2026-03-19T11:00:00Z'),
  (8, 'Deploy hotfix to staging and verify with QA', '2026-03-19T16:45:00Z'),
  (9, 'Define workflow YAML with build, lint, and test jobs', '2026-03-18T15:00:00Z'),
  (9, 'Add Slack webhook notification on pipeline failure', '2026-03-19T09:12:00Z'),
  (5, 'Set up RabbitMQ exchange and queue topology', '2026-03-19T16:00:00Z'),
  (5, 'Migrate email notification consumer from polling to MQ', '2026-03-20T09:40:00Z');

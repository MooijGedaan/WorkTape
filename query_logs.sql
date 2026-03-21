-- Quick SQL queries to debug API logs
-- Use with: sqlite3 <path-to-worktape.db> < query_logs.sql

-- Show most recent 10 API calls
SELECT
  id,
  datetime(request_timestamp) as time,
  request_type,
  model,
  response_status,
  duration_ms || 'ms' as duration,
  total_tokens as tokens,
  screenshot_count as screenshots
FROM api_call_logs
ORDER BY request_timestamp DESC
LIMIT 10;

-- Show statistics
SELECT
  '=== Statistics ===' as stats;
SELECT
  'Total Calls: ' || COUNT(*) as metric
FROM api_call_logs
UNION ALL
SELECT
  'Successful: ' || COUNT(*)
FROM api_call_logs
WHERE response_status = 'success'
UNION ALL
SELECT
  'Failed: ' || COUNT(*)
FROM api_call_logs
WHERE response_status != 'success'
UNION ALL
SELECT
  'Total Tokens: ' || COALESCE(SUM(total_tokens), 0)
FROM api_call_logs
UNION ALL
SELECT
  'Avg Duration: ' || ROUND(AVG(duration_ms), 0) || 'ms'
FROM api_call_logs;

-- Show errors only
SELECT
  '=== Recent Errors ===' as errors;
SELECT
  datetime(request_timestamp) as time,
  request_type,
  response_status,
  error_message
FROM api_call_logs
WHERE response_status != 'success'
ORDER BY request_timestamp DESC
LIMIT 5;

-- Show last API call details
SELECT
  '=== Last API Call Details ===' as details;
SELECT * FROM api_call_logs
ORDER BY request_timestamp DESC
LIMIT 1;

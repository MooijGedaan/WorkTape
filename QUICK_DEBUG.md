# 🔍 Quick Debug Reference

## TL;DR - Start Here

**See API statistics:**
```bash
npm run debug:api-stats
```

**See recent API calls:**
```bash
npm run debug:api-logs
```

**See full request/response details:**
```bash
npm run debug:api-full
```

---

## Database Location

Windows: `%APPDATA%\com.workrecall.app\workrecall.db`

---

## Quick Commands

### Show last 20 API calls
```bash
node debug_api_logs.js --limit 20
```

### Filter by type
```bash
node debug_api_logs.js --type screenshot_analysis
node debug_api_logs.js --type daily_summary
```

### Full request/response
```bash
node debug_api_logs.js --full --limit 1
```

---

## SQL Quick Queries

```bash
# Open database
sqlite3 "%APPDATA%\com.workrecall.app\workrecall.db"
```

```sql
-- Last 5 API calls
SELECT datetime(request_timestamp) as time, request_type, response_status, total_tokens
FROM api_call_logs ORDER BY request_timestamp DESC LIMIT 5;

-- Show errors
SELECT datetime(request_timestamp) as time, error_message
FROM api_call_logs WHERE response_status != 'success';

-- Token usage
SELECT SUM(total_tokens) as total FROM api_call_logs;
```

---

## Console Logs

When running app, watch for:
- `📤 Sending API request...`
- `📥 Received API response...`
- `✅ API call logged to database`
- `❌ API request failed...`

---

## Frontend UI (Optional)

1. Add to your navigation:
   ```typescript
   import ApiLogsView from './views/ApiLogsView';
   ```

2. Navigate to `/api-logs` route

3. View real-time logs with filtering

---

## Troubleshooting

**No logs showing?**
1. Ensure app ran at least once
2. Check database exists at path above
3. Restart app to trigger migration

**Database locked?**
- Close the app before running CLI tools

**Need help?**
- See `API_LOGGING_DEBUG_GUIDE.md` for full details

---

## What's Logged?

✅ Complete request (text + screenshots metadata)
✅ Complete response text
✅ Timestamps (request & response)
✅ Token usage (prompt, completion, total)
✅ Duration in milliseconds
✅ Error messages if failed
✅ Model and endpoint used

---

**Happy debugging!** 🐛✨

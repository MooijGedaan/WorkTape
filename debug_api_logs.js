#!/usr/bin/env node

/**
 * Quick debug tool to view API logs from WorkTape database
 * Usage: node debug_api_logs.js [options]
 *
 * Options:
 *   --limit <n>      Number of logs to show (default: 10)
 *   --type <type>    Filter by request type (screenshot_analysis or daily_summary)
 *   --stats          Show statistics only
 *   --full           Show full request/response data
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Find database path
const appDataDir = process.env.APPDATA || (os.platform() === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support')
  : path.join(os.homedir(), '.local', 'share'));

const dbPath = path.join(appDataDir, 'com.worktape.app', 'worktape.db');

console.log(`📂 Database location: ${dbPath}\n`);

try {
  const db = new Database(dbPath, { readonly: true });

  // Parse command line arguments
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;
  const requestType = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
  const showStats = args.includes('--stats');
  const showFull = args.includes('--full');

  if (showStats) {
    // Show statistics
    console.log('📊 API Call Statistics\n');
    console.log('='.repeat(80));

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN response_status = 'success' THEN 1 ELSE 0 END) as successful_calls,
        SUM(CASE WHEN response_status != 'success' THEN 1 ELSE 0 END) as failed_calls,
        SUM(total_tokens) as total_tokens,
        SUM(screenshot_count) as total_screenshots,
        AVG(duration_ms) as avg_duration
      FROM api_call_logs
    `).get();

    console.log(`Total API Calls:       ${stats.total_calls}`);
    console.log(`Successful Calls:      ${stats.successful_calls} (${((stats.successful_calls / stats.total_calls) * 100).toFixed(1)}%)`);
    console.log(`Failed Calls:          ${stats.failed_calls}`);
    console.log(`Total Tokens Used:     ${stats.total_tokens || 0}`);
    console.log(`Total Screenshots:     ${stats.total_screenshots || 0}`);
    console.log(`Average Duration:      ${stats.avg_duration ? stats.avg_duration.toFixed(0) : 0}ms`);
    console.log('='.repeat(80));

    // Show breakdown by type
    console.log('\n📈 Breakdown by Request Type\n');
    const breakdown = db.prepare(`
      SELECT
        request_type,
        COUNT(*) as count,
        SUM(CASE WHEN response_status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(total_tokens) as tokens,
        AVG(duration_ms) as avg_duration
      FROM api_call_logs
      GROUP BY request_type
    `).all();

    breakdown.forEach(row => {
      console.log(`${row.request_type}:`);
      console.log(`  Calls: ${row.count} (${row.successful} successful)`);
      console.log(`  Tokens: ${row.tokens || 0}`);
      console.log(`  Avg Duration: ${row.avg_duration ? row.avg_duration.toFixed(0) : 0}ms\n`);
    });
  } else {
    // Show logs
    let query = `
      SELECT
        id, request_timestamp, response_status, request_type, model,
        duration_ms, total_tokens, screenshot_count, error_message,
        request_messages, response_text
      FROM api_call_logs
      ${requestType ? 'WHERE request_type = ?' : ''}
      ORDER BY request_timestamp DESC
      LIMIT ?
    `;

    const params = requestType ? [requestType, limit] : [limit];
    const logs = db.prepare(query).all(...params);

    console.log(`📋 Recent API Calls (showing ${logs.length})\n`);
    console.log('='.repeat(80));

    logs.forEach((log, index) => {
      const timestamp = new Date(log.request_timestamp).toLocaleString();
      const status = log.response_status === 'success' ? '✅' : '❌';

      console.log(`\n${index + 1}. ${status} ${log.request_type} [${log.model}]`);
      console.log(`   Timestamp: ${timestamp}`);
      console.log(`   Duration: ${log.duration_ms}ms | Tokens: ${log.total_tokens || 'N/A'} | Screenshots: ${log.screenshot_count}`);
      console.log(`   Status: ${log.response_status}`);

      if (log.error_message) {
        console.log(`   Error: ${log.error_message}`);
      }

      if (showFull) {
        console.log('\n   Request:');
        try {
          const messages = JSON.parse(log.request_messages);
          console.log(JSON.stringify(messages, null, 2).split('\n').map(l => '   ' + l).join('\n'));
        } catch (e) {
          console.log(`   ${log.request_messages.substring(0, 200)}...`);
        }

        if (log.response_text) {
          console.log('\n   Response:');
          console.log(`   ${log.response_text.substring(0, 300)}${log.response_text.length > 300 ? '...' : ''}`);
        }
      }

      console.log('-'.repeat(80));
    });
  }

  db.close();
} catch (error) {
  if (error.code === 'SQLITE_CANTOPEN') {
    console.error('❌ Database not found. Make sure the application has run at least once.');
    console.error(`   Expected location: ${dbPath}`);
  } else {
    console.error('❌ Error:', error.message);
  }
  process.exit(1);
}

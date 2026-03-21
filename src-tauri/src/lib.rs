use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::{Manager, async_runtime};
use tauri_plugin_autostart::MacosLauncher;

mod prompt;
mod openai;
mod screenshot;
mod smart_capture;
mod idle_detector;
mod auto_logger;

#[tauri::command]
fn close_prompt_after_save(app: tauri::AppHandle, interval_minutes: u64) -> Result<(), String> {
    // Schedule next prompt for configured interval (passed from frontend)
    prompt::schedule_next_prompt(app.clone(), interval_minutes);

    // Close the prompt window after frontend saves to database
    prompt::close_prompt_window(&app)
        .map_err(|e| format!("Failed to close prompt: {}", e))
}

#[tauri::command]
fn close_prompt(app: tauri::AppHandle) -> Result<(), String> {
    prompt::close_prompt_window(&app)
        .map_err(|e| format!("Failed to close prompt: {}", e))
}

#[tauri::command]
fn skip_prompt(app: tauri::AppHandle, minutes: u64) -> Result<(), String> {
    // Close the prompt window
    prompt::close_prompt_window(&app)
        .map_err(|e| format!("Failed to close prompt: {}", e))?;

    // Schedule next prompt with custom duration
    prompt::schedule_next_prompt(app, minutes);

    Ok(())
}

#[tauri::command]
fn show_prompt(app: tauri::AppHandle) -> Result<(), String> {
    prompt::show_prompt_window(&app)
        .map_err(|e| format!("Failed to show prompt: {}", e))
}

#[tauri::command]
fn set_prompt_interval(app: tauri::AppHandle, minutes: u64) -> Result<(), String> {
    // Update the timer with the new interval
    prompt::schedule_next_prompt(app, minutes);
    Ok(())
}

#[tauri::command]
async fn generate_daily_summary(
    entries: Vec<(String, String)>,
    date: String,
    language: String,
) -> Result<String, String> {
    // Call the OpenAI service to generate summary
    openai::generate_summary(entries, &date, &language).await
}

#[tauri::command]
async fn generate_grouped_daily_summary(
    // Each group: (optional task_title, vec of (description, timestamp))
    groups: Vec<(Option<String>, Vec<(String, String)>)>,
    date: String,
    language: String,
) -> Result<String, String> {
    let task_groups: Vec<openai::TaskGroup> = groups
        .into_iter()
        .map(|(task_title, entries)| openai::TaskGroup {
            task_title,
            entries: entries
                .into_iter()
                .map(|(description, timestamp)| openai::WorkEntry { description, timestamp })
                .collect(),
        })
        .collect();
    openai::generate_grouped_summary(task_groups, &date, &language).await
}

#[tauri::command]
fn test_screenshot_capture() -> Result<Vec<screenshot::ScreenshotData>, String> {
    // Check permissions (mainly for macOS)
    if !screenshot::check_screen_recording_permission() {
        return Err(
            "Screen Recording permission required. Please grant permission in System Settings → Privacy & Security → Screen Recording".to_string()
        );
    }

    // Capture all monitors
    screenshot::capture_all_monitors()
}

#[tauri::command]
async fn capture_and_analyze_screen() -> Result<String, String> {
    // Check permissions (mainly for macOS)
    if !screenshot::check_screen_recording_permission() {
        return Err(
            "Screen Recording permission required. Please grant permission in System Settings → Privacy & Security → Screen Recording".to_string()
        );
    }

    // Capture all monitors
    let screenshots = screenshot::capture_all_monitors()?;

    // Extract base64 image data
    let base64_images: Vec<String> = screenshots
        .into_iter()
        .map(|s| s.image_base64)
        .collect();

    // Analyze with OpenAI GPT-4o vision
    openai::analyze_screenshots(base64_images).await
}

#[tauri::command]
fn start_auto_logging(auto_logger: tauri::State<auto_logger::AutoLoggerService>) -> Result<(), String> {
    auto_logger.enable();
    Ok(())
}

#[tauri::command]
fn stop_auto_logging(auto_logger: tauri::State<auto_logger::AutoLoggerService>) -> Result<(), String> {
    auto_logger.disable();
    Ok(())
}

#[tauri::command]
fn get_auto_logging_status(auto_logger: tauri::State<auto_logger::AutoLoggerService>) -> Result<bool, String> {
    Ok(auto_logger.is_enabled())
}

#[derive(serde::Serialize)]
struct DebugStats {
    is_enabled: bool,
    is_idle: bool,
    time_since_last_capture: u64,
    screenshots_in_buffer: usize,
    last_change_score: u32,
    total_captures_today: u64,
    total_analyses_today: u64,
    last_analysis_time: Option<String>,
}

#[tauri::command]
fn get_auto_log_debug_stats(
    auto_logger: tauri::State<auto_logger::AutoLoggerService>
) -> Result<DebugStats, String> {
    Ok(DebugStats {
        is_enabled: auto_logger.is_enabled(),
        is_idle: auto_logger.is_idle(),
        time_since_last_capture: auto_logger.time_since_last_capture(),
        screenshots_in_buffer: auto_logger.buffer_size(),
        last_change_score: auto_logger.last_change_score(),
        total_captures_today: auto_logger.total_captures_today(),
        total_analyses_today: auto_logger.total_analyses_today(),
        last_analysis_time: auto_logger.last_analysis_time(),
    })
}

#[tauri::command]
async fn trigger_manual_analysis(
    app: tauri::AppHandle,
    auto_logger: tauri::State<'_, auto_logger::AutoLoggerService>
) -> Result<String, String> {
    auto_logger.trigger_manual_analysis(app)?;
    Ok("Analysis triggered".to_string())
}

#[tauri::command]
fn clear_screenshot_buffer(
    auto_logger: tauri::State<auto_logger::AutoLoggerService>
) -> Result<(), String> {
    auto_logger.clear_buffer();
    Ok(())
}

#[tauri::command]
async fn get_auto_capture_settings(app: tauri::AppHandle) -> Result<(u64, u64), String> {
    // Get the database path
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());

    // Connect to database
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Get screenshots per hour
    let screenshots_result = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM settings WHERE key = 'screenshots_per_hour'"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to query screenshots_per_hour: {}", e))?;

    let screenshots_per_hour = screenshots_result
        .and_then(|(val,)| val.parse::<u64>().ok())
        .unwrap_or(360); // Default: 360 per hour = every 10 seconds

    // Get API requests per day
    let api_result = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM settings WHERE key = 'api_requests_per_day'"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to query api_requests_per_day: {}", e))?;

    let api_requests_per_day = api_result
        .and_then(|(val,)| val.parse::<u64>().ok())
        .unwrap_or(96); // Default: 96 per day = every 15 minutes

    pool.close().await;

    Ok((screenshots_per_hour, api_requests_per_day))
}

#[tauri::command]
async fn update_auto_capture_settings(
    app: tauri::AppHandle,
    screenshots_per_hour: u64,
    api_requests_per_day: u64,
    auto_logger: tauri::State<'_, auto_logger::AutoLoggerService>
) -> Result<(), String> {
    // Get the database path
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());

    // Connect to database
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Update screenshots per hour
    sqlx::query(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('screenshots_per_hour', ?1)"
    )
    .bind(screenshots_per_hour.to_string())
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to update screenshots_per_hour: {}", e))?;

    // Update API requests per day
    sqlx::query(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('api_requests_per_day', ?1)"
    )
    .bind(api_requests_per_day.to_string())
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to update api_requests_per_day: {}", e))?;

    pool.close().await;

    // Update the auto logger with new settings
    auto_logger.update_settings(app.clone(), screenshots_per_hour, api_requests_per_day)?;

    Ok(())
}

#[tauri::command]
async fn get_api_usage_today(app: tauri::AppHandle) -> Result<u64, String> {
    // Get the database path
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());

    // Connect to database
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let result = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM api_usage_log WHERE date = ?1"
    )
    .bind(&today)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Failed to query API usage: {}", e))?;

    pool.close().await;

    Ok(result.0 as u64)
}

#[derive(serde::Serialize)]
struct ApiCallLog {
    id: i64,
    request_timestamp: String,
    response_timestamp: Option<String>,
    endpoint: String,
    model: String,
    request_type: String,
    request_messages: String,
    request_temperature: Option<f32>,
    request_max_tokens: Option<i32>,
    response_text: Option<String>,
    response_status: String,
    error_message: Option<String>,
    duration_ms: Option<i64>,
    prompt_tokens: Option<i32>,
    completion_tokens: Option<i32>,
    total_tokens: Option<i32>,
    screenshot_count: i32,
    created_at: String,
}

#[tauri::command]
async fn get_api_call_logs(
    app: tauri::AppHandle,
    limit: Option<i64>,
    offset: Option<i64>,
    request_type: Option<String>,
) -> Result<Vec<ApiCallLog>, String> {
    use sqlx::Row;

    // Get the database path
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());

    // Connect to database
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let limit = limit.unwrap_or(25);
    let offset = offset.unwrap_or(0);

    let rows = if let Some(req_type) = request_type {
        sqlx::query(
            "SELECT id, request_timestamp, response_timestamp, endpoint, model, request_type,
                    request_messages, request_temperature, request_max_tokens, response_text,
                    response_status, error_message, duration_ms, prompt_tokens, completion_tokens,
                    total_tokens, screenshot_count, created_at
             FROM api_call_logs
             WHERE request_type = ?1
             ORDER BY request_timestamp DESC
             LIMIT ?2 OFFSET ?3"
        )
        .bind(&req_type)
        .bind(limit)
        .bind(offset)
        .fetch_all(&pool)
        .await
    } else {
        sqlx::query(
            "SELECT id, request_timestamp, response_timestamp, endpoint, model, request_type,
                    request_messages, request_temperature, request_max_tokens, response_text,
                    response_status, error_message, duration_ms, prompt_tokens, completion_tokens,
                    total_tokens, screenshot_count, created_at
             FROM api_call_logs
             ORDER BY request_timestamp DESC
             LIMIT ?1 OFFSET ?2"
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&pool)
        .await
    }
    .map_err(|e| format!("Failed to query API call logs: {}", e))?;

    pool.close().await;

    let result = rows
        .into_iter()
        .map(|row| ApiCallLog {
            id: row.get(0),
            request_timestamp: row.get(1),
            response_timestamp: row.get(2),
            endpoint: row.get(3),
            model: row.get(4),
            request_type: row.get(5),
            request_messages: row.get(6),
            request_temperature: row.get(7),
            request_max_tokens: row.get(8),
            response_text: row.get(9),
            response_status: row.get(10),
            error_message: row.get(11),
            duration_ms: row.get(12),
            prompt_tokens: row.get(13),
            completion_tokens: row.get(14),
            total_tokens: row.get(15),
            screenshot_count: row.get(16),
            created_at: row.get(17),
        })
        .collect();

    Ok(result)
}

#[derive(serde::Serialize)]
struct ApiCallStats {
    total_calls: i64,
    successful_calls: i64,
    failed_calls: i64,
    total_tokens: i64,
    total_screenshots: i64,
    average_duration_ms: f64,
}

#[tauri::command]
async fn get_api_call_stats(app: tauri::AppHandle) -> Result<ApiCallStats, String> {
    // Get the database path
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());

    // Connect to database
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let total_calls = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM api_call_logs")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Failed to count total calls: {}", e))?
        .0;

    let successful_calls = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM api_call_logs WHERE response_status = 'success'"
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Failed to count successful calls: {}", e))?
    .0;

    let failed_calls = total_calls - successful_calls;

    let total_tokens = sqlx::query_as::<_, (Option<i64>,)>(
        "SELECT SUM(total_tokens) FROM api_call_logs"
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Failed to sum tokens: {}", e))?
    .0
    .unwrap_or(0);

    let total_screenshots = sqlx::query_as::<_, (i64,)>(
        "SELECT SUM(screenshot_count) FROM api_call_logs"
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Failed to sum screenshots: {}", e))?
    .0;

    let average_duration_ms = sqlx::query_as::<_, (Option<f64>,)>(
        "SELECT AVG(duration_ms) FROM api_call_logs WHERE duration_ms IS NOT NULL"
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Failed to calculate average duration: {}", e))?
    .0
    .unwrap_or(0.0);

    pool.close().await;

    Ok(ApiCallStats {
        total_calls,
        successful_calls,
        failed_calls,
        total_tokens,
        total_screenshots,
        average_duration_ms,
    })
}

#[tauri::command]
async fn get_debug_mode(app: tauri::AppHandle) -> Result<bool, String> {
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let result = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM settings WHERE key = 'debug_mode'"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to query debug_mode: {}", e))?;

    pool.close().await;

    Ok(result
        .and_then(|(val,)| val.parse::<bool>().ok())
        .unwrap_or(false))
}

#[tauri::command]
async fn set_debug_mode(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    sqlx::query(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('debug_mode', ?1)"
    )
    .bind(enabled.to_string())
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to update debug_mode: {}", e))?;

    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn get_debug_logs_retention_days(app: tauri::AppHandle) -> Result<i64, String> {
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let result = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM settings WHERE key = 'debug_logs_retention_days'"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to query debug_logs_retention_days: {}", e))?;

    pool.close().await;

    Ok(result
        .and_then(|(val,)| val.parse::<i64>().ok())
        .unwrap_or(7))
}

#[tauri::command]
async fn set_debug_logs_retention_days(app: tauri::AppHandle, days: i64) -> Result<(), String> {
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    sqlx::query(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('debug_logs_retention_days', ?1)"
    )
    .bind(days.to_string())
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to update debug_logs_retention_days: {}", e))?;

    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn cleanup_old_debug_logs(app: tauri::AppHandle) -> Result<u32, String> {
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Get retention days
    let retention_result = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM settings WHERE key = 'debug_logs_retention_days'"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to query retention days: {}", e))?;

    let retention_days = retention_result
        .and_then(|(val,)| val.parse::<i64>().ok())
        .unwrap_or(7);

    // Calculate cutoff date
    let cutoff_date = chrono::Utc::now() - chrono::Duration::days(retention_days);
    let cutoff_str = cutoff_date.to_rfc3339();

    // Delete old logs that have request_messages (debug data)
    let result = sqlx::query(
        "DELETE FROM api_call_logs
         WHERE created_at < ?1
         AND request_messages IS NOT NULL
         AND request_messages != ''"
    )
    .bind(&cutoff_str)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to delete old debug logs: {}", e))?;

    pool.close().await;

    Ok(result.rows_affected() as u32)
}

#[derive(serde::Serialize)]
struct WorkEntryExport {
    id: i64,
    source: String,
    description: String,
    timestamp: String,
}

#[tauri::command]
async fn export_work_entries(
    app: tauri::AppHandle,
    start_date: String,
    end_date: String,
    format: String,
) -> Result<String, String> {
    // Validate date parameters match YYYY-MM-DD before touching the database
    fn is_valid_date(s: &str) -> bool {
        if s.len() != 10 { return false; }
        let bytes = s.as_bytes();
        if bytes[4] != b'-' || bytes[7] != b'-' { return false; }
        s[..4].parse::<u16>().is_ok()
            && s[5..7].parse::<u8>().map_or(false, |m| m >= 1 && m <= 12)
            && s[8..10].parse::<u8>().map_or(false, |d| d >= 1 && d <= 31)
    }
    if !is_valid_date(&start_date) {
        return Err(format!("Invalid start_date '{}': expected YYYY-MM-DD", start_date));
    }
    if !is_valid_date(&end_date) {
        return Err(format!("Invalid end_date '{}': expected YYYY-MM-DD", end_date));
    }
    if start_date > end_date {
        return Err(format!("start_date '{}' must not be after end_date '{}'", start_date, end_date));
    }

    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // start_date inclusive, end_date inclusive (append T23:59:59 boundary)
    let end_inclusive = format!("{}T23:59:59", end_date);

    use sqlx::Row;

    let manual_rows = sqlx::query(
        "SELECT id, description, timestamp FROM work_entries
         WHERE timestamp >= ?1 AND timestamp <= ?2
         ORDER BY timestamp ASC"
    )
    .bind(&start_date)
    .bind(&end_inclusive)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to query work_entries: {}", e))?;

    let auto_rows = sqlx::query(
        "SELECT id, description, timestamp FROM auto_work_entries
         WHERE timestamp >= ?1 AND timestamp <= ?2
         ORDER BY timestamp ASC"
    )
    .bind(&start_date)
    .bind(&end_inclusive)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to query auto_work_entries: {}", e))?;

    pool.close().await;

    let mut entries: Vec<WorkEntryExport> = Vec::new();

    for row in manual_rows {
        entries.push(WorkEntryExport {
            id: row.get(0),
            source: "manual".to_string(),
            description: row.get(1),
            timestamp: row.get(2),
        });
    }
    for row in auto_rows {
        entries.push(WorkEntryExport {
            id: row.get(0),
            source: "auto".to_string(),
            description: row.get(1),
            timestamp: row.get(2),
        });
    }

    // Sort combined list by timestamp
    entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    match format.as_str() {
        "csv" => {
            let mut csv = String::from("id,source,timestamp,description\n");
            for e in &entries {
                let desc_escaped = e.description.replace('"', "\"\"");
                csv.push_str(&format!("{},{},{},\"{}\"\n", e.id, e.source, e.timestamp, desc_escaped));
            }
            Ok(csv)
        }
        "json" => {
            serde_json::to_string_pretty(&entries)
                .map_err(|e| format!("Failed to serialize JSON: {}", e))
        }
        _ => Err(format!("Unsupported format: {}", format)),
    }
}

#[tauri::command]
async fn write_export_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn get_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable().map_err(|e| e.to_string())
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())
    }
}

// ─── Sprint Board ──────────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct SprintTask {
    id: i64,
    title: String,
    description: Option<String>,
    status: String,
    priority: String,
    position: i64,
    created_at: String,
    updated_at: String,
    labels: Vec<String>,
    next_action: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct NextActionHistoryEntry {
    id: i64,
    task_id: i64,
    action: String,
    resolved_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct WorkLink {
    id: i64,
    task_id: i64,
    entry_source: String,
    entry_id: i64,
    linked_at: String,
    description: String,
    timestamp: String,
    relevance_score: f64,
}

#[tauri::command]
async fn get_sprint_tasks(app: tauri::AppHandle) -> Result<Vec<SprintTask>, String> {
    use sqlx::Row;
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    let rows = sqlx::query(
        "SELECT id, title, description, status, priority, position, created_at, updated_at, next_action
         FROM sprint_tasks ORDER BY position ASC, created_at ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Query error: {}", e))?;

    let mut tasks: Vec<SprintTask> = rows.iter().map(|r| SprintTask {
        id: r.get(0),
        title: r.get(1),
        description: r.get(2),
        status: r.get(3),
        priority: r.get(4),
        position: r.get(5),
        created_at: r.get(6),
        updated_at: r.get(7),
        labels: vec![],
        next_action: r.get(8),
    }).collect();

    // Fetch labels for all tasks
    for task in &mut tasks {
        let label_rows = sqlx::query("SELECT label FROM sprint_task_labels WHERE task_id = ?1 ORDER BY label ASC")
            .bind(task.id)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Label query error: {}", e))?;
        task.labels = label_rows.iter().map(|r| r.get::<String, _>(0)).collect();
    }

    pool.close().await;
    Ok(tasks)
}

#[tauri::command]
async fn create_sprint_task(
    app: tauri::AppHandle,
    title: String,
    description: Option<String>,
    priority: String,
) -> Result<SprintTask, String> {
    use sqlx::Row;
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    let result = sqlx::query(
        "INSERT INTO sprint_tasks (title, description, status, priority, position, created_at, updated_at)
         VALUES (?1, ?2, 'todo', ?3, 0, ?4, ?5)"
    )
    .bind(&title)
    .bind(&description)
    .bind(&priority)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Insert error: {}", e))?;

    let id = result.last_insert_rowid();

    let row = sqlx::query(
        "SELECT id, title, description, status, priority, position, created_at, updated_at, next_action
         FROM sprint_tasks WHERE id = ?1"
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Fetch error: {}", e))?;

    pool.close().await;
    Ok(SprintTask {
        id: row.get(0),
        title: row.get(1),
        description: row.get(2),
        status: row.get(3),
        priority: row.get(4),
        position: row.get(5),
        created_at: row.get(6),
        updated_at: row.get(7),
        labels: vec![],
        next_action: row.get(8),
    })
}

#[tauri::command]
async fn update_sprint_task(
    app: tauri::AppHandle,
    id: i64,
    title: String,
    description: Option<String>,
    status: String,
    priority: String,
    position: i64,
    next_action: Option<String>,
) -> Result<SprintTask, String> {
    use sqlx::Row;
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    // If the next_action is changing (being replaced or cleared), record the old one in history
    {
        use sqlx::Row as _;
        let old_row = sqlx::query("SELECT next_action FROM sprint_tasks WHERE id = ?1")
            .bind(id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("Fetch old next_action error: {}", e))?;
        if let Some(row) = old_row {
            let old_action: Option<String> = row.get(0);
            let new_is_different = old_action != next_action;
            if let Some(old) = old_action {
                if new_is_different {
                    sqlx::query(
                        "INSERT INTO sprint_task_next_action_history (task_id, action, resolved_at) VALUES (?1, ?2, ?3)"
                    )
                    .bind(id)
                    .bind(&old)
                    .bind(&now)
                    .execute(&pool)
                    .await
                    .map_err(|e| format!("History insert error: {}", e))?;
                }
            }
        }
    }

    sqlx::query(
        "UPDATE sprint_tasks SET title = ?1, description = ?2, status = ?3, priority = ?4,
         position = ?5, updated_at = ?6, next_action = ?7 WHERE id = ?8"
    )
    .bind(&title)
    .bind(&description)
    .bind(&status)
    .bind(&priority)
    .bind(position)
    .bind(&now)
    .bind(&next_action)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| format!("Update error: {}", e))?;

    let row = sqlx::query(
        "SELECT id, title, description, status, priority, position, created_at, updated_at, next_action
         FROM sprint_tasks WHERE id = ?1"
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Fetch error: {}", e))?;

    let label_rows = sqlx::query("SELECT label FROM sprint_task_labels WHERE task_id = ?1 ORDER BY label ASC")
        .bind(id)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Label query error: {}", e))?;
    let labels: Vec<String> = label_rows.iter().map(|r| r.get::<String, _>(0)).collect();

    pool.close().await;
    Ok(SprintTask {
        id: row.get(0),
        title: row.get(1),
        description: row.get(2),
        status: row.get(3),
        priority: row.get(4),
        position: row.get(5),
        created_at: row.get(6),
        updated_at: row.get(7),
        labels,
        next_action: row.get(8),
    })
}

#[tauri::command]
async fn delete_sprint_task(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    sqlx::query("DELETE FROM sprint_task_labels WHERE task_id = ?1").bind(id).execute(&pool).await
        .map_err(|e| format!("Delete labels error: {}", e))?;
    sqlx::query("DELETE FROM sprint_task_work_links WHERE task_id = ?1").bind(id).execute(&pool).await
        .map_err(|e| format!("Delete work links error: {}", e))?;
    sqlx::query("DELETE FROM sprint_task_next_action_history WHERE task_id = ?1").bind(id).execute(&pool).await
        .map_err(|e| format!("Delete next action history error: {}", e))?;
    sqlx::query("DELETE FROM sprint_tasks WHERE id = ?1").bind(id).execute(&pool).await
        .map_err(|e| format!("Delete task error: {}", e))?;

    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn get_next_action_history(
    app: tauri::AppHandle,
    task_id: i64,
) -> Result<Vec<NextActionHistoryEntry>, String> {
    use sqlx::Row;
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    let rows = sqlx::query(
        "SELECT id, task_id, action, resolved_at FROM sprint_task_next_action_history
         WHERE task_id = ?1 ORDER BY resolved_at DESC"
    )
    .bind(task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Query error: {}", e))?;

    pool.close().await;
    Ok(rows.iter().map(|r| NextActionHistoryEntry {
        id: r.get(0),
        task_id: r.get(1),
        action: r.get(2),
        resolved_at: r.get(3),
    }).collect())
}

#[tauri::command]
async fn resolve_next_action(
    app: tauri::AppHandle,
    task_id: i64,
) -> Result<(), String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    // Record current next_action in history before clearing
    {
        use sqlx::Row as _;
        let row = sqlx::query("SELECT next_action FROM sprint_tasks WHERE id = ?1")
            .bind(task_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("Fetch error: {}", e))?;
        if let Some(r) = row {
            let action: Option<String> = r.get(0);
            if let Some(a) = action {
                sqlx::query(
                    "INSERT INTO sprint_task_next_action_history (task_id, action, resolved_at) VALUES (?1, ?2, ?3)"
                )
                .bind(task_id)
                .bind(&a)
                .bind(&now)
                .execute(&pool)
                .await
                .map_err(|e| format!("History insert error: {}", e))?;
            }
        }
    }

    sqlx::query(
        "UPDATE sprint_tasks SET next_action = NULL, updated_at = ?1 WHERE id = ?2"
    )
    .bind(&now)
    .bind(task_id)
    .execute(&pool)
    .await
    .map_err(|e| format!("Update error: {}", e))?;

    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn update_task_labels(
    app: tauri::AppHandle,
    task_id: i64,
    labels: Vec<String>,
) -> Result<(), String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    sqlx::query("DELETE FROM sprint_task_labels WHERE task_id = ?1")
        .bind(task_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Delete labels error: {}", e))?;

    for label in &labels {
        sqlx::query("INSERT OR IGNORE INTO sprint_task_labels (task_id, label) VALUES (?1, ?2)")
            .bind(task_id)
            .bind(label)
            .execute(&pool)
            .await
            .map_err(|e| format!("Insert label error: {}", e))?;
    }

    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn get_task_work_links(app: tauri::AppHandle, task_id: i64) -> Result<Vec<WorkLink>, String> {
    use sqlx::Row;
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    let rows = sqlx::query(
        "SELECT l.id, l.task_id, l.entry_source, l.entry_id, l.linked_at, e.description, e.timestamp
         FROM sprint_task_work_links l
         JOIN work_entries e ON l.entry_id = e.id
         WHERE l.task_id = ?1 AND l.entry_source = 'manual'
         UNION ALL
         SELECT l.id, l.task_id, l.entry_source, l.entry_id, l.linked_at, e.description, e.timestamp
         FROM sprint_task_work_links l
         JOIN auto_work_entries e ON l.entry_id = e.id
         WHERE l.task_id = ?1 AND l.entry_source = 'auto'
         ORDER BY timestamp DESC"
    )
    .bind(task_id)
    .bind(task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Query error: {}", e))?;

    pool.close().await;
    Ok(rows.iter().map(|r| WorkLink {
        id: r.get(0),
        task_id: r.get(1),
        entry_source: r.get(2),
        entry_id: r.get(3),
        linked_at: r.get(4),
        description: r.get(5),
        timestamp: r.get(6),
        relevance_score: 1.0,
    }).collect())
}

#[tauri::command]
async fn add_work_link(
    app: tauri::AppHandle,
    task_id: i64,
    entry_source: String,
    entry_id: i64,
) -> Result<(), String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR IGNORE INTO sprint_task_work_links (task_id, entry_source, entry_id, linked_at)
         VALUES (?1, ?2, ?3, ?4)"
    )
    .bind(task_id)
    .bind(&entry_source)
    .bind(entry_id)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Insert error: {}", e))?;

    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn remove_work_link(app: tauri::AppHandle, link_id: i64) -> Result<(), String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    sqlx::query("DELETE FROM sprint_task_work_links WHERE id = ?1")
        .bind(link_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Delete error: {}", e))?;

    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn suggest_work_links(app: tauri::AppHandle, task_id: i64) -> Result<Vec<WorkLink>, String> {
    use sqlx::Row;
    use std::collections::{HashMap, HashSet};

    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");
    let pool = sqlx::sqlite::SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| format!("DB connect error: {}", e))?;

    // Fetch task title + description for keyword extraction
    let task_row = sqlx::query("SELECT title, description FROM sprint_tasks WHERE id = ?1")
        .bind(task_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Task query error: {}", e))?;

    let task_row = match task_row {
        Some(r) => r,
        None => { pool.close().await; return Ok(vec![]); }
    };

    let title: String = task_row.get(0);
    let desc: Option<String> = task_row.get(1);

    // Extract keywords: lowercase, split on non-alphanum, filter short/stopwords
    let stopwords: HashSet<&str> = [
        "the","and","or","for","with","that","this","from","are","was","were",
        "has","have","had","not","but","can","will","all","its","our","you","your",
        "fix","add","use","get","set","put","run","let","via","into",
    ].iter().copied().collect();

    let combined = format!("{} {}", title, desc.unwrap_or_default()).to_lowercase();
    let keywords: Vec<String> = combined
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3 && !stopwords.contains(*w))
        .map(|w| w.to_string())
        .collect::<HashSet<String>>()
        .into_iter()
        .collect();

    if keywords.is_empty() {
        pool.close().await;
        return Ok(vec![]);
    }

    // Build first-pass OR LIKE query to fetch up to 100 candidate entries
    let like_patterns: Vec<String> = keywords.iter().map(|kw| format!("%{}%", kw)).collect();
    let keyword_conditions: Vec<String> = like_patterns.iter()
        .map(|_| "description LIKE ?".to_string())
        .collect();
    let where_clause = keyword_conditions.join(" OR ");

    let manual_query = format!(
        "SELECT id, 'manual' as entry_source, description, timestamp FROM work_entries
         WHERE ({}) AND id NOT IN (
             SELECT entry_id FROM sprint_task_work_links
             WHERE task_id = ? AND entry_source = 'manual'
         )",
        where_clause
    );
    let auto_query = format!(
        "SELECT id, 'auto' as entry_source, description, timestamp FROM auto_work_entries
         WHERE ({}) AND id NOT IN (
             SELECT entry_id FROM sprint_task_work_links
             WHERE task_id = ? AND entry_source = 'auto'
         )",
        where_clause
    );
    let full_query = format!(
        "{} UNION ALL {} ORDER BY timestamp DESC LIMIT 100",
        manual_query, auto_query
    );

    let mut q = sqlx::query(&full_query);
    for kw in &like_patterns { q = q.bind(kw); }
    q = q.bind(task_id);
    for kw in &like_patterns { q = q.bind(kw); }
    q = q.bind(task_id);

    let candidate_rows = q.fetch_all(&pool).await
        .map_err(|e| format!("Suggestion query error: {}", e))?;

    // Collect candidates
    struct Candidate { entry_id: i64, entry_source: String, description: String, timestamp: String }
    let candidates: Vec<Candidate> = candidate_rows.iter().map(|r| Candidate {
        entry_id: r.get(0),
        entry_source: r.get(1),
        description: r.get(2),
        timestamp: r.get(3),
    }).collect();

    if candidates.is_empty() {
        pool.close().await;
        return Ok(vec![]);
    }

    // Second pass: fetch total document count for IDF denominator
    let total_docs_row = sqlx::query(
        "SELECT (SELECT COUNT(*) FROM work_entries) + (SELECT COUNT(*) FROM auto_work_entries)"
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Count query error: {}", e))?;
    let total_docs: i64 = total_docs_row.get(0);
    let n = total_docs.max(1) as f64;

    // For each keyword, count how many documents in the *full corpus* contain it (for IDF)
    let mut idf_map: HashMap<String, f64> = HashMap::new();
    for kw in &keywords {
        let pattern = format!("%{}%", kw);
        let count_row = sqlx::query(
            "SELECT (SELECT COUNT(*) FROM work_entries WHERE description LIKE ?)
                  + (SELECT COUNT(*) FROM auto_work_entries WHERE description LIKE ?)"
        )
        .bind(&pattern)
        .bind(&pattern)
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("IDF count error: {}", e))?;
        let docs_with_kw: i64 = count_row.get(0);
        // Smoothed IDF: log((N+1) / (df+1))
        let idf = ((n + 1.0) / (docs_with_kw as f64 + 1.0)).ln();
        idf_map.insert(kw.clone(), idf);
    }

    pool.close().await;

    // Score each candidate using TF-IDF
    // TF = proportion of query keywords matched in the description (binary: 0 or 1 per keyword)
    // Score = sum of IDF for each matching keyword, normalised by keyword count
    let kw_count = keywords.len() as f64;
    let relevance_threshold = 0.1_f64;

    let mut scored: Vec<(f64, Candidate)> = candidates.into_iter().filter_map(|c| {
        let desc_lower = c.description.to_lowercase();
        let score: f64 = keywords.iter()
            .filter(|kw| desc_lower.contains(kw.as_str()))
            .map(|kw| idf_map.get(kw).copied().unwrap_or(0.0))
            .sum::<f64>() / kw_count;
        if score >= relevance_threshold {
            Some((score, c))
        } else {
            None
        }
    }).collect();

    // Sort by score descending, then timestamp descending (encoded as string; ISO timestamps sort lexicographically)
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal)
        .then(b.1.timestamp.cmp(&a.1.timestamp)));

    Ok(scored.into_iter().take(5).map(|(score, c)| WorkLink {
        id: 0,
        task_id,
        entry_source: c.entry_source,
        entry_id: c.entry_id,
        linked_at: String::new(),
        description: c.description,
        timestamp: c.timestamp,
        relevance_score: score,
    }).collect())
}

// ─── End Sprint Board ─────────────────────────────────────────────────────────

#[tauri::command]
async fn end_day(
    app: tauri::AppHandle,
    date: String,
    auto_logger: tauri::State<'_, auto_logger::AutoLoggerService>,
) -> Result<(), String> {
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query("INSERT OR IGNORE INTO day_endings (date, ended_at) VALUES (?1, ?2)")
        .bind(&date)
        .bind(&now)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to insert day ending: {}", e))?;

    pool.close().await;

    auto_logger.disable();

    Ok(())
}

#[tauri::command]
async fn unend_day(app: tauri::AppHandle, date: String) -> Result<(), String> {
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    sqlx::query("DELETE FROM day_endings WHERE date = ?1")
        .bind(&date)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete day ending: {}", e))?;

    sqlx::query("DELETE FROM ai_summaries WHERE date = ?1")
        .bind(&date)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete AI summary: {}", e))?;

    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn is_day_ended(app: tauri::AppHandle, date: String) -> Result<bool, String> {
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let result = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM day_endings WHERE date = ?1"
    )
    .bind(&date)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Failed to query day_endings: {}", e))?;

    pool.close().await;

    Ok(result.0 > 0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    // Define database migrations
    let migrations = vec![
        Migration {
            version: 1,
            description: "create work_entries table",
            sql: "CREATE TABLE IF NOT EXISTS work_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                description TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create settings table",
            sql: "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT OR IGNORE INTO settings (key, value) VALUES ('prompt_interval_minutes', '30');",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create ai_summaries table",
            sql: "CREATE TABLE IF NOT EXISTS ai_summaries (
                date TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create automatic work log tables",
            sql: "
                CREATE TABLE IF NOT EXISTS auto_capture_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    start_timestamp TEXT NOT NULL,
                    end_timestamp TEXT,
                    screenshots_captured INTEGER DEFAULT 0,
                    screenshots_analyzed INTEGER DEFAULT 0,
                    analyzed BOOLEAN DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS auto_work_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    description TEXT NOT NULL,
                    screenshots_count INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX idx_auto_work_entries_timestamp
                ON auto_work_entries(timestamp);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "remove foreign key constraint from auto_work_entries",
            sql: "
                -- SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table
                CREATE TABLE auto_work_entries_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    description TEXT NOT NULL,
                    screenshots_count INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );

                INSERT INTO auto_work_entries_new (id, session_id, timestamp, description, screenshots_count, created_at)
                SELECT id, session_id, timestamp, description, screenshots_count, created_at
                FROM auto_work_entries;

                DROP TABLE auto_work_entries;

                ALTER TABLE auto_work_entries_new RENAME TO auto_work_entries;

                CREATE INDEX idx_auto_work_entries_timestamp
                ON auto_work_entries(timestamp);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add auto-capture settings",
            sql: "
                INSERT OR IGNORE INTO settings (key, value) VALUES ('screenshots_per_hour', '360');
                INSERT OR IGNORE INTO settings (key, value) VALUES ('api_requests_per_day', '96');
                CREATE TABLE IF NOT EXISTS api_usage_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    date TEXT NOT NULL
                );
                CREATE INDEX idx_api_usage_date ON api_usage_log(date);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create comprehensive api_call_logs table",
            sql: "
                CREATE TABLE IF NOT EXISTS api_call_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_timestamp TEXT NOT NULL,
                    response_timestamp TEXT,
                    endpoint TEXT NOT NULL,
                    model TEXT NOT NULL,
                    request_type TEXT NOT NULL,
                    request_messages TEXT NOT NULL,
                    request_temperature REAL,
                    request_max_tokens INTEGER,
                    response_text TEXT,
                    response_status TEXT NOT NULL,
                    error_message TEXT,
                    duration_ms INTEGER,
                    prompt_tokens INTEGER,
                    completion_tokens INTEGER,
                    total_tokens INTEGER,
                    screenshot_count INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX idx_api_call_logs_timestamp ON api_call_logs(request_timestamp);
                CREATE INDEX idx_api_call_logs_type ON api_call_logs(request_type);
                CREATE INDEX idx_api_call_logs_status ON api_call_logs(response_status);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add debug mode settings",
            sql: "
                INSERT OR IGNORE INTO settings (key, value) VALUES ('debug_mode', 'false');
                INSERT OR IGNORE INTO settings (key, value) VALUES ('debug_logs_retention_days', '7');
                CREATE INDEX IF NOT EXISTS idx_api_call_logs_created_at ON api_call_logs(created_at);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create sprint board tables",
            sql: "
                CREATE TABLE IF NOT EXISTS sprint_tasks (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    title       TEXT NOT NULL,
                    description TEXT,
                    status      TEXT NOT NULL DEFAULT 'todo'
                                CHECK(status IN ('todo','in-progress','done','blocked')),
                    priority    TEXT NOT NULL DEFAULT 'medium'
                                CHECK(priority IN ('low','medium','high')),
                    position    INTEGER NOT NULL DEFAULT 0,
                    created_at  TEXT NOT NULL,
                    updated_at  TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sprint_task_labels (
                    id      INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER NOT NULL,
                    label   TEXT NOT NULL,
                    UNIQUE(task_id, label)
                );

                CREATE TABLE IF NOT EXISTS sprint_task_work_links (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id      INTEGER NOT NULL,
                    entry_source TEXT NOT NULL CHECK(entry_source IN ('manual','auto')),
                    entry_id     INTEGER NOT NULL,
                    linked_at    TEXT NOT NULL,
                    UNIQUE(task_id, entry_source, entry_id)
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add next_action column to work_entries",
            sql: "ALTER TABLE work_entries ADD COLUMN next_action TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add next_action column to sprint_tasks",
            sql: "ALTER TABLE sprint_tasks ADD COLUMN next_action TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "create day_endings table",
            sql: "CREATE TABLE IF NOT EXISTS day_endings (
                date TEXT PRIMARY KEY,
                ended_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "create sprint_task_next_action_history table",
            sql: "CREATE TABLE IF NOT EXISTS sprint_task_next_action_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id     INTEGER NOT NULL,
                action      TEXT NOT NULL,
                resolved_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:workrecall.db", migrations)
                .build()
        )
        .invoke_handler(tauri::generate_handler![
            close_prompt_after_save,
            close_prompt,
            show_prompt,
            skip_prompt,
            set_prompt_interval,
            generate_daily_summary,
            generate_grouped_daily_summary,
            test_screenshot_capture,
            capture_and_analyze_screen,
            start_auto_logging,
            stop_auto_logging,
            get_auto_logging_status,
            get_auto_log_debug_stats,
            trigger_manual_analysis,
            clear_screenshot_buffer,
            get_auto_capture_settings,
            update_auto_capture_settings,
            get_api_usage_today,
            get_api_call_logs,
            get_api_call_stats,
            get_debug_mode,
            set_debug_mode,
            get_debug_logs_retention_days,
            set_debug_logs_retention_days,
            cleanup_old_debug_logs,
            export_work_entries,
            write_export_file,
            get_autostart_enabled,
            set_autostart_enabled,
            get_sprint_tasks,
            create_sprint_task,
            update_sprint_task,
            delete_sprint_task,
            get_next_action_history,
            resolve_next_action,
            update_task_labels,
            get_task_work_links,
            add_work_link,
            remove_work_link,
            suggest_work_links,
            end_day,
            unend_day,
            is_day_ended
        ])
        .setup(|app| {
            // Initialize logging with default INFO level
            env_logger::Builder::from_default_env()
                .filter_level(log::LevelFilter::Info)
                .init();

            // On Windows, remove native decorations so the custom titlebar is used.
            // On macOS, keep native decorations (traffic lights + rounded corners via titleBarStyle: Overlay).
            #[cfg(target_os = "windows")]
            {
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.set_decorations(false);
                }
            }

            // Start periodic prompt timer
            prompt::start_prompt_timer(app.handle().clone());

            // Initialize and start auto logger service
            log::info!("Initializing AutoLoggerService...");
            let auto_logger = auto_logger::AutoLoggerService::new();

            // Load settings from database
            let app_clone = app.handle().clone();
            let auto_logger_clone = auto_logger.clone();
            async_runtime::spawn(async move {
                if let Ok((screenshots, api_requests)) = get_auto_capture_settings(app_clone.clone()).await {
                    let _ = auto_logger_clone.update_settings(app_clone, screenshots, api_requests);
                }
            });

            log::info!("Starting background capture/analysis loops...");
            auto_logger.start(app.handle().clone());
            log::info!("AutoLoggerService started");

            // Store in app state for control
            app.manage(auto_logger);
            log::info!("AutoLoggerService registered in app state");

            Ok(())
        })
        .on_window_event(|window, event| {
            // Only prevent close for the main window, let prompt close normally
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

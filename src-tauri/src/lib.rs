use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::{Manager, async_runtime};

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
) -> Result<String, String> {
    // Call the OpenAI service to generate summary
    openai::generate_summary(entries, &date).await
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
        }
    ];

    tauri::Builder::default()
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
            get_api_usage_today
        ])
        .setup(|app| {
            // Initialize logging with default INFO level
            env_logger::Builder::from_default_env()
                .filter_level(log::LevelFilter::Info)
                .init();

            // Start periodic prompt timer
            prompt::start_prompt_timer(app.handle().clone());

            // Initialize and start auto logger service
            println!("🚀 Initializing AutoLoggerService...");
            let auto_logger = auto_logger::AutoLoggerService::new();

            // Load settings from database
            let app_clone = app.handle().clone();
            let auto_logger_clone = auto_logger.clone();
            async_runtime::spawn(async move {
                if let Ok((screenshots, api_requests)) = get_auto_capture_settings(app_clone.clone()).await {
                    let _ = auto_logger_clone.update_settings(app_clone, screenshots, api_requests);
                }
            });

            println!("📡 Starting background capture/analysis loops...");
            auto_logger.start(app.handle().clone());
            println!("✅ AutoLoggerService started");

            // Store in app state for control
            app.manage(auto_logger);
            println!("💾 AutoLoggerService registered in app state");

            // Show first prompt after 5 seconds (for testing)
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                let _ = prompt::show_prompt_window(&app_handle);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Only prevent close for the main window, let prompt close normally
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    window.hide().unwrap();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

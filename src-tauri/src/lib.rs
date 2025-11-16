use tauri_plugin_sql::{Migration, MigrationKind};

mod prompt;
mod openai;

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
            generate_daily_summary
        ])
        .setup(|app| {
            // Start periodic prompt timer
            prompt::start_prompt_timer(app.handle().clone());

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

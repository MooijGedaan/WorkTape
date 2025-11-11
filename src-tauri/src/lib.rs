use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::Manager;

mod prompt;

#[tauri::command]
fn close_prompt_after_save(app: tauri::AppHandle) -> Result<(), String> {
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
fn show_prompt(app: tauri::AppHandle) -> Result<(), String> {
    prompt::show_prompt_window(&app)
        .map_err(|e| format!("Failed to show prompt: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            show_prompt
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

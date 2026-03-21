use tauri::{Manager, AppHandle, WebviewUrl, WebviewWindowBuilder};
use std::time::Duration;
use std::sync::Mutex;
use std::sync::mpsc::{channel, Sender, Receiver};

// Global channel to control the timer
static TIMER_CHANNEL: Mutex<Option<Sender<TimerMessage>>> = Mutex::new(None);

enum TimerMessage {
    CustomInterval(u64), // Custom interval in minutes
}

pub fn start_prompt_timer(app: AppHandle) {
    let (tx, rx): (Sender<TimerMessage>, Receiver<TimerMessage>) = channel();

    // Store the sender globally so we can send messages to the timer thread
    {
        let mut channel = TIMER_CHANNEL.lock().unwrap_or_else(|e| e.into_inner());
        *channel = Some(tx);
    }

    // Spawn background thread for periodic prompts
    std::thread::spawn(move || {
        let default_interval_secs = 1800; // 30 minutes default (30 * 60)
        let mut current_interval_secs = default_interval_secs;
        let mut remaining_secs = current_interval_secs;

        loop {
            // Sleep in small increments so we can check for messages
            std::thread::sleep(Duration::from_secs(1));
            remaining_secs -= 1;

            // Check for timer control messages
            match rx.try_recv() {
                Ok(TimerMessage::CustomInterval(minutes)) => {
                    // Set custom interval and reset countdown
                    current_interval_secs = minutes * 60;
                    remaining_secs = current_interval_secs;
                }
                Err(_) => {
                    // No message, continue
                }
            }

            // Show prompt when countdown reaches zero
            if remaining_secs <= 0 {
                let _ = show_prompt_window(&app);
                // Reset to default interval after showing prompt
                current_interval_secs = default_interval_secs;
                remaining_secs = current_interval_secs;
            }
        }
    });
}

fn is_today_ended(app: &AppHandle) -> bool {
    let db_path = match app.path().app_data_dir() {
        Ok(p) => p.join("worktape.db"),
        Err(_) => return false,
    };
    let db_url = format!("sqlite:{}", db_path.display());
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Use a blocking runtime check — this is called from a non-async context
    tauri::async_runtime::block_on(async move {
        let pool = match sqlx::sqlite::SqlitePool::connect(&db_url).await {
            Ok(p) => p,
            Err(_) => return false,
        };
        let result = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM day_endings WHERE date = ?1"
        )
        .bind(&today)
        .fetch_one(&pool)
        .await;
        pool.close().await;
        result.map(|(n,)| n > 0).unwrap_or(false)
    })
}

pub fn show_prompt_window(app: &AppHandle) -> tauri::Result<()> {
    // Don't show prompt if today's day has been ended
    if is_today_ended(app) {
        return Ok(());
    }

    // Check if prompt window already exists
    if let Some(existing) = app.get_webview_window("prompt") {
        let _ = existing.set_focus();
        return Ok(());
    }

    // Get primary monitor size to calculate bottom-right position
    let monitor = app.primary_monitor()?.ok_or_else(|| std::io::Error::other("No primary monitor found"))?;
    let monitor_size = monitor.size();
    let scale_factor = monitor.scale_factor();

    // Window dimensions
    let window_width = 400.0;
    let window_height = 420.0;

    // Calculate position for bottom-right corner (with padding)
    let padding = 20.0;
    let x = (monitor_size.width as f64 / scale_factor) - window_width - padding;
    let y = (monitor_size.height as f64 / scale_factor) - window_height - padding - 40.0; // Extra padding for taskbar

    // Create prompt window
    WebviewWindowBuilder::new(
        app,
        "prompt",
        WebviewUrl::App("/prompt".into())
    )
    .title("What are you working on?")
    .inner_size(window_width, window_height)
    .position(x, y)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .decorations(true)
    .always_on_top(true)
    .skip_taskbar(false)
    .visible(true)
    .build()?;

    Ok(())
}

pub fn close_prompt_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("prompt") {
        window.close()?;
    }
    Ok(())
}

pub fn schedule_next_prompt(_app: AppHandle, minutes: u64) {
    // Send message to the timer thread to reschedule with custom interval
    let channel = TIMER_CHANNEL.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(tx) = channel.as_ref() {
        let _ = tx.send(TimerMessage::CustomInterval(minutes));
    }
}
